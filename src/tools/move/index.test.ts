// Original — no upstream. Tests for the move tool registration — descriptor shape, stripped schema, help mention + link-rewriting caveat, docs presence + non-stub + active-mode CLI_REPORTED_ERROR note + to-shape rules, thin-handler logger drift lock (FR-009 / R1).
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMoveTool, MOVE_DESCRIPTION, MOVE_TOOL_NAME } from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";
import { countDescriptionKeys } from "../_schema-test-utils.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("createMoveTool — descriptor", () => {
  // Case 1 — descriptor name + description
  it("publishes name = 'move' and description verbatim (Story 7 AC#1)", () => {
    const tool = createMoveTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.name).toBe(MOVE_TOOL_NAME);
    expect(tool.descriptor.name).toBe("move");
    expect(tool.descriptor.description).toBe(MOVE_DESCRIPTION);
  });

  // Case 2 — Story 7 AC#1, AC#2: stripped schema strips descriptions at every nested depth
  it("strips descriptions at every nested depth (Story 7 AC#1/AC#2)", () => {
    const tool = createMoveTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.oneOf).toBeUndefined();
    expect(countDescriptionKeys(schema)).toBe(0);
  });

  // Case 3 — Story 7 AC#3 / FR-012: description references help, the tool's own name, AND link-rewriting caveat
  it("description references help(), 'move', AND surfaces the link-rewriting caveat (Story 7 AC#3, FR-012)", () => {
    const tool = createMoveTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const desc = tool.descriptor.description;
    const lower = desc.toLowerCase();
    expect(lower).toContain("help");
    expect(lower).toContain("move");
    expect(desc).toMatch(/Automatically update internal links|link/i);
    expect(desc.length).toBeGreaterThan(0);
  });
});

describe("docs/tools/move.md exists and is non-stub (Story 7 AC#4 / FR-014 / SC-006 LOAD-BEARING)", () => {
  // Case 4 — docs file resolves, non-stub, contains required error codes + examples + caveats + to-shape rules
  it("docs file resolves via import.meta.url, has no TODO/stub marker, contains 5 error codes + active-mode ERR_NO_ACTIVE_FILE note + to-shape rules + source-`.md`-guard explanation + rename-equivalence + ≥4 examples + link-rewriting caveat (Story 7 AC#4)", () => {
    const docsPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../docs/tools/move.md",
    );
    expect(existsSync(docsPath)).toBe(true);
    const body = readFileSync(docsPath, "utf8");
    expect(body).not.toContain("<!-- TODO");
    expect(body).not.toContain("<!-- stub");
    // (a) all five propagated error codes (BI-047 classifier fix moved active-mode
    // no-focused-note from CLI_REPORTED_ERROR to ERR_NO_ACTIVE_FILE)
    for (const code of [
      "VALIDATION_ERROR",
      "CLI_BINARY_NOT_FOUND",
      "CLI_NON_ZERO_EXIT",
      "CLI_REPORTED_ERROR",
      "ERR_NO_ACTIVE_FILE",
    ]) {
      expect(body).toContain(code);
    }
    // (b) explicit active-mode ERR_NO_ACTIVE_FILE note with the capital-N
    // verbatim upstream wording the dispatch classifier matches on
    expect(body).toMatch(/Error: No active file\./);
    // (c) ≥4 worked example shapes — counted as ≥8 code fences (4 examples × 2 fences)
    const fenceCount = (body.match(/```/g) ?? []).length;
    expect(fenceCount).toBeGreaterThanOrEqual(8);
    // (d) link-rewriting caveat
    expect(body).toMatch(/Automatically update internal links/);
    // (e) `to`-shape rules section with trailing-`/` discriminator surprise-case guidance
    expect(body.toLowerCase()).toMatch(/trailing.*\/|trailing slash/);
    expect(body).toMatch(/ALWAYS include trailing/i);
    // (f) source-`.md`-guard explanation
    expect(body).toMatch(/source.*\.md.*guard|\.md.*source.*guard|source-`?\.md`?/i);
    // (g) rename-equivalence note
    expect(body.toLowerCase()).toContain("rename");
  });
});

describe("handler.ts thin-handler logger drift lock (FR-009 / R1)", () => {
  // Case 5 — FR-009 structural lock: handler must not introduce per-call logger events
  it("handler.ts emits zero per-call logger events; deps.logger flows only into invokeCli", () => {
    const handlerPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "./handler.ts",
    );
    const source = readFileSync(handlerPath, "utf8");
    expect(source).not.toMatch(/logger\.(callStart|callEndSuccess|callEndFailure|callEnd)\b/);
    const matches = source.match(/logger:\s*deps\.logger/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
