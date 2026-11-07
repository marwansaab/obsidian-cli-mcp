// Original — no upstream. BI-0193 acceptance guard: for each tool fixed by BI-0193, the ERR_NO_ACTIVE_FILE advice names this tool, and every input of these tools that it names is one this tool's published input schema accepts. A tool with a target mode is told to use specific mode with a vault and a note; a tool without one is never told to pass target_mode.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { executeBacklinks } from "./backlinks/handler.js";
import { createBacklinksTool } from "./backlinks/index.js";
import { ACTIVE_EVAL, baseDeps, inMemoryFs, VAULT_ROOT } from "./find_and_replace/_handler-fixtures.js";
import { executeFindAndReplace } from "./find_and_replace/handler.js";
import { createFindAndReplaceTool } from "./find_and_replace/index.js";
import { executeLinks } from "./links/handler.js";
import { createLinksTool } from "./links/index.js";
import { executeReadHeading } from "./read_heading/handler.js";
import { createReadHeadingTool } from "./read_heading/index.js";
import { executeWriteProperty } from "./set_property/handler.js";
import { createSetPropertyTool } from "./set_property/index.js";
import { executeSmartConnectionsSimilar } from "./smart_connections_similar/handler.js";
import { createSmartConnectionsSimilarTool } from "./smart_connections_similar/index.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../cli-adapter/_dispatch.js";
import { UpstreamError } from "../errors.js";
import { createQueue } from "../queue.js";
import { captureRejection, makeQueuedSpawn, silentLogger } from "./_handler-test-fixtures.js";

import type { RegisteredTool } from "./_shared.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

const ENVELOPE_NO_ACTIVE_FILE = {
  stdout: '=> {"ok":false,"code":"NO_ACTIVE_FILE","detail":"No note focused; switch to specific mode or focus a note."}\n',
  exitCode: 0,
};

function cliDeps(spawnFn: SpawnLike) {
  return { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} };
}

const bootDeps = { logger: silentLogger(), queue: createQueue() };

interface AdviceCase {
  tool: string;
  register: () => RegisteredTool;
  /** Calls the tool in its active-note form with no note open; resolves to the rejection. */
  raise: () => Promise<unknown>;
}

const CASES: AdviceCase[] = [
  {
    tool: "backlinks",
    register: () => createBacklinksTool(bootDeps),
    raise: () =>
      captureRejection(
        executeBacklinks({ target_mode: "active" }, cliDeps(makeQueuedSpawn([ENVELOPE_NO_ACTIVE_FILE]).spawnFn)),
      ),
  },
  {
    tool: "links",
    register: () => createLinksTool(bootDeps),
    raise: () =>
      captureRejection(executeLinks({ target_mode: "active" }, cliDeps(makeQueuedSpawn([ENVELOPE_NO_ACTIVE_FILE]).spawnFn))),
  },
  {
    tool: "read_heading",
    register: () => createReadHeadingTool(bootDeps),
    raise: () =>
      captureRejection(
        executeReadHeading(
          { target_mode: "active", heading: "A" },
          cliDeps(makeQueuedSpawn([ENVELOPE_NO_ACTIVE_FILE]).spawnFn),
        ),
      ),
  },
  {
    tool: "smart_connections_similar",
    register: () => createSmartConnectionsSimilarTool(bootDeps),
    raise: () =>
      captureRejection(
        executeSmartConnectionsSimilar(
          { target_mode: "active", limit: 10 },
          cliDeps(makeQueuedSpawn([ENVELOPE_NO_ACTIVE_FILE]).spawnFn),
        ),
      ),
  },
  {
    tool: "set_property",
    register: () => createSetPropertyTool(bootDeps),
    raise: () =>
      captureRejection(
        executeWriteProperty(
          { target_mode: "active", name: "status", value: "v" },
          cliDeps(makeQueuedSpawn([{ stdout: '=> {"path":null,"vault":"V"}\n', exitCode: 0 }]).spawnFn),
        ),
      ),
  },
  {
    tool: "find_and_replace",
    register: () => createFindAndReplaceTool(baseDeps()),
    raise: () =>
      captureRejection(
        executeFindAndReplace(
          {
            pattern: "x",
            replacement: "y",
            mode: "literal",
            active_note: true,
            case_sensitive: true,
            include_code_blocks: false,
            include_html_comments: false,
            commit: false,
          },
          baseDeps({ fs: inMemoryFs([], VAULT_ROOT).fs, spawnFn: makeQueuedSpawn([ACTIVE_EVAL(null)]).spawnFn }),
        ),
      ),
  },
];

function inputKeys(tool: RegisteredTool): string[] {
  const schema = tool.descriptor.inputSchema as { properties?: Record<string, unknown> };
  return Object.keys(schema.properties ?? {});
}

/** Every input key of every tool above: the words the advice could name as an input. */
const ALL_KEYS = new Set(CASES.flatMap((c) => inputKeys(c.register())));

function namedInputs(message: string): string[] {
  return [...ALL_KEYS].filter((key) => new RegExp(`(?<![\\w])${key}(?![\\w])`).test(message));
}

describe("ERR_NO_ACTIVE_FILE advice names only the tool's own inputs (BI-0193)", () => {
  it.each(CASES)("$tool", async ({ tool, register, raise }) => {
    const err = await raise();
    expect(err).toBeInstanceOf(UpstreamError);
    const { code, message } = err as UpstreamError;
    expect(code).toBe("ERR_NO_ACTIVE_FILE");

    // The advice calls this tool, by its current name.
    expect(message).toMatch(new RegExp(`\\bcall ${tool} with\\b`));

    const own = new Set(inputKeys(register()));
    for (const name of namedInputs(message)) {
      expect(own, `${tool}'s advice names "${name}", which ${tool} does not accept`).toContain(name);
    }

    if (own.has("target_mode")) {
      expect(message).toContain("target_mode=specific");
      expect(message).toMatch(/\bvault\b/);
      expect(message).toMatch(/\b(file|path)\b/);
    } else {
      expect(message).not.toContain("target_mode");
    }
  });
});
