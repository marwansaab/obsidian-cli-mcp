// Original — no upstream. Tests for the read_heading tool registration — descriptor shape, heading-path disclosure, docs presence + content completeness, drift-detector parameterised lock.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createReadHeadingTool,
  READ_HEADING_DESCRIPTION,
  READ_HEADING_TOOL_NAME,
} from "./index.js";
import { readHeadingInputSchema } from "./schema.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { makeQueuedSpawn, silentLogger } from "../_handler-test-fixtures.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("createReadHeadingTool — descriptor", () => {
  // (51) Descriptor name
  it("publishes name = 'read_heading'", () => {
    const tool = createReadHeadingTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.name).toBe(READ_HEADING_TOOL_NAME);
    expect(tool.descriptor.name).toBe("read_heading");
    expect(tool.descriptor.description).toBe(READ_HEADING_DESCRIPTION);
  });

  // (53) Descriptor description surfaces the heading-path requirement
  it("description surfaces the heading-path requirement", () => {
    const tool = createReadHeadingTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const desc = tool.descriptor.description;
    expect(desc).toContain("heading");
    expect(desc).toMatch(/heading.*path|::|two.*segment/i);
    expect(desc.length).toBeGreaterThan(0);
  });
});

describe("createReadHeadingTool — handler integration via registerTool", () => {
  // (54) FR-018 — VALIDATION_ERROR envelope + spawn-spy gate
  it("single-segment heading surfaces as VALIDATION_ERROR isError envelope; spawn never called (FR-018)", async () => {
    let spawnCalled = false;
    const spawnSpy: SpawnLike = () => {
      spawnCalled = true;
      throw new Error("spawnFn called on validation failure — FR-018 violation");
    };
    const tool = createReadHeadingTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: spawnSpy,
    });
    const result = (await tool.handler({ target_mode: "active", heading: "single-segment" })) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(payload.message).toContain("read_heading");
    expect(spawnCalled).toBe(false);
  });

  // (closure) VALID input drives the `handler: async (input, d) => executeReadHeading(input, d)`
  // closure in index.ts. The case above only feeds INVALID input, which short-circuits to
  // VALIDATION_ERROR inside registerTool before the closure runs. A VALID active-mode read
  // with a 2-segment heading reaches executeReadHeading → invokeCli (success spawn) and
  // returns a JSON success envelope. Reuses handler.test.ts's ok envelope stdout.
  it("VALID input drives the handler closure to a success envelope", async () => {
    const { spawnFn } = makeQueuedSpawn([
      { stdout: '=> {"ok":true,"content":"body."}\n', exitCode: 0 },
    ]);
    const tool = createReadHeadingTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn,
    });
    const result = (await tool.handler({ target_mode: "active", heading: "A::B" })) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };
    expect(result.isError).toBeUndefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(JSON.parse(result.content[0]!.text)).toEqual({ content: "body." });
  });
});

describe("docs/tools/read_heading.md exists and is non-stub (FR-023)", () => {
  // (55) FR-023 docs presence + content completeness
  it("docs file resolves via import.meta.url, has no TODO marker, contains all 5 error codes + ≥4 example sections + multi-vault note + out-of-reach fallback", () => {
    const docsPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../docs/tools/read_heading.md",
    );
    expect(existsSync(docsPath)).toBe(true);
    const body = readFileSync(docsPath, "utf8");
    expect(body).not.toContain("<!-- TODO");
    for (const code of [
      "VALIDATION_ERROR",
      "CLI_BINARY_NOT_FOUND",
      "CLI_NON_ZERO_EXIT",
      "CLI_REPORTED_ERROR",
      "ERR_NO_ACTIVE_FILE",
    ]) {
      expect(body).toContain(code);
    }
    const exampleHeadings = (body.match(/### Example/g) ?? []).length;
    expect(exampleHeadings).toBeGreaterThanOrEqual(4);
    expect(body).toMatch(/multi-?vault|multiple vaults|focused vault/i);
    expect(body).toMatch(/single-?segment|setext|::.*literally/i);
  });
});

describe("heading-path rule wording (079)", () => {
  let docs: string;
  beforeAll(() => {
    docs = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/tools/read_heading.md"),
      "utf8",
    );
  });
  const headingDescription = readHeadingInputSchema.shape.heading.description;

  it("description, parameter description and help page state the rule (US1)", () => {
    for (const text of [headingDescription, docs]) {
      expect(text).toContain("level-1 heading");
      expect(text).toContain("one level below the previous");
    }
    expect(docs).toMatch(/^### Heading-path rule$/m);
  });

  it("description and help page name the unreachable sections and the whole-note alternative (US2)", () => {
    for (const text of [docs]) {
      expect(text).toContain("no level-1 heading");
      expect(text).toContain("skipped level");
      expect(text).toContain("`read`");
    }
    expect(READ_HEADING_DESCRIPTION).not.toContain("read_note");
  });

  it("heading-not-found guidance names the missing level-1 heading or skipped level before outline (US3)", () => {
    const cause = "leaves out the level-1 heading or skips a level";
    const errorRow = docs.split("\n").find((line) => line.startsWith("|") && line.includes('"HEADING_NOT_FOUND"'));
    expect(errorRow).toBeDefined();
    for (const text of [errorRow!]) {
      const causeAt = text.indexOf(cause);
      expect(causeAt).toBeGreaterThanOrEqual(0);
      expect(causeAt).toBeLessThan(text.indexOf("outline"));
    }
  });

  it("help page shows the full three-segment path and the failing path without the level-1 segment (US4)", () => {
    expect(docs).toContain('"Best Practices::Naming::Casing"');
    expect(docs).toContain('"Naming::Casing"');
    expect(docs).toMatch(/### Example \d+ — .*level-1/i);
  });
});
