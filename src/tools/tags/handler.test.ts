// Original — no upstream. Tests for the tags handler — argv shape per scope and target mode (H2, R2, R3 no-locator-strip), the "No tags found." sentinel, one-# strip and string→integer count parse, json-parse / shape-parse / count-parse failure stages, inherited dispatch classification (FR-015 unknown vault, FR-016 missing note, FR-018 output cap), the ERR_NO_ACTIVE_FILE re-message (AC 13 / R9), the wrapper-side ordering rule (AC 5 / Clarifications Q3) and includeCounts projection (AC 6). Stub stdout shapes are copied from the live research F-series replies.
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { compareTagNames, executeTags } from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import {
  captureRejection,
  makeQueuedSpawn,
  makeStubSpawn,
  silentLogger,
} from "../_handler-test-fixtures.js";

import type { TagsInput } from "./schema.js";

function deps(spawnFn: SpawnLike) {
  return { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} };
}

/** Render entries the way upstream `tags format=json counts` does (pretty-printed, string counts). */
function upstreamJson(entries: Array<{ tag: string; count?: string }>): string {
  return JSON.stringify(entries, null, 2) + "\n";
}

async function run(input: TagsInput, stdout: string) {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout, exitCode: 0 }]);
  const result = await executeTags(input, deps(spawnFn));
  return { result, recorded };
}

async function runRejected(input: TagsInput, stdout: string): Promise<UpstreamError> {
  const { spawnFn } = makeQueuedSpawn([{ stdout, exitCode: 0 }]);
  const err = await captureRejection(executeTags(input, deps(spawnFn)));
  expect(err).toBeInstanceOf(UpstreamError);
  return err as UpstreamError;
}

const SPECIFIC: TagsInput = { target_mode: "specific", vault: "V" };

// Live vault-wide reply for the F-series fixture (research T0 re-check, L-1).
const VAULT_WIDE_STDOUT = upstreamJson([
  { tag: "#Aardvark", count: "2" },
  { tag: "#Banana", count: "1" },
  { tag: "#café", count: "1" },
  { tag: "#deep", count: "1" },
  { tag: "#deep/a", count: "1" },
  { tag: "#deep/a/b", count: "1" },
  { tag: "#fm-only", count: "1" },
  { tag: "#hashfm", count: "1" },
  { tag: "#parent", count: "2" },
  { tag: "#parent/child", count: "1" },
  { tag: "#Project", count: "2" },
  { tag: "#shared", count: "6" },
  { tag: "#solo", count: "1" },
  { tag: "#solo/leaf", count: "1" },
  { tag: "#日本語", count: "1" },
]);

// Live note-scoped reply for the `Beta` fixture (research T0 re-check, L-2).
const BETA_STDOUT = upstreamJson([
  { tag: "#Aardvark", count: "1" },
  { tag: "#aardvark", count: "1" },
  { tag: "#Banana", count: "1" },
  { tag: "#hashfm", count: "1" },
  { tag: "#parent", count: "1" },
  { tag: "#shared", count: "2" },
]);

const BETA_EXPECTED = [
  { name: "Aardvark", count: 1 },
  { name: "aardvark", count: 1 },
  { name: "Banana", count: 1 },
  { name: "hashfm", count: 1 },
  { name: "parent", count: 1 },
  { name: "shared", count: 2 },
];

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// =================== US1 — vault-wide index ===================

describe("US1 — vault-wide tag index", () => {
  test("AC 1 — vault-wide JSON → integer counts, one leading # stripped, total === tags.length", async () => {
    const { result } = await run(SPECIFIC, VAULT_WIDE_STDOUT);
    expect(result.total).toBe(15);
    expect(result.total).toBe(result.tags.length);
    expect(result.tags).toContainEqual({ name: "shared", count: 6 });
    expect(result.tags).toContainEqual({ name: "Project", count: 2 });
    expect(result.tags).toContainEqual({ name: "solo", count: 1 });
    for (const entry of result.tags) {
      expect(entry.name.startsWith("#")).toBe(false);
      expect(Number.isInteger(entry.count)).toBe(true);
    }
  });

  test("H2 / R2 — vault-wide argv carries vault=, tags, format=json and counts, and nothing else scope-related; exactly one spawn", async () => {
    const { recorded } = await run(SPECIFIC, VAULT_WIDE_STDOUT);
    expect(recorded).toHaveLength(1);
    const argv = recorded[0]!.argv;
    expect(argv).toContain("vault=V");
    expect(argv).toContain("tags");
    expect(argv).toContain("format=json");
    expect(argv).toContain("counts");
    expect(argv.some((a) => a.startsWith("file="))).toBe(false);
    expect(argv.some((a) => a.startsWith("path="))).toBe(false);
    expect(argv.some((a) => a.startsWith("sort"))).toBe(false);
    expect(argv).not.toContain("active");
    expect(argv).not.toContain("total");
  });

  test("US1 scenario 6 — active mode with no scope lists the focused vault: argv has no vault=, file=, path= or active", async () => {
    const { result, recorded } = await run({ target_mode: "active" }, VAULT_WIDE_STDOUT);
    const argv = recorded[0]!.argv;
    expect(argv).toContain("tags");
    expect(argv).toContain("format=json");
    expect(argv).toContain("counts");
    expect(argv.some((a) => a.startsWith("vault="))).toBe(false);
    expect(argv.some((a) => a.startsWith("file="))).toBe(false);
    expect(argv.some((a) => a.startsWith("path="))).toBe(false);
    expect(argv).not.toContain("active");
    expect(result.total).toBe(15);
    expect(result.tags).toContainEqual({ name: "shared", count: 6 });
  });

  test("AC 7 — `No tags found.` → { total: 0, tags: [] }", async () => {
    const { result } = await run(SPECIFIC, "No tags found.\n");
    expect(result).toEqual({ total: 0, tags: [] });
  });

  test("AC 8 — a tag that exists only inside a fenced block (or inline code) is absent, because upstream excludes it", async () => {
    // The stub replays the live vault-wide reply for a fixture whose `#fencedonly`
    // lives only in a fenced code block and `#inlinecode` only in a code span.
    // Upstream already drops both (research F5); the wrapper must not invent them.
    // The live lock is the T001 / T024 re-check against the test vault.
    const { result } = await run(SPECIFIC, VAULT_WIDE_STDOUT);
    const names = result.tags.map((t) => t.name);
    expect(names).not.toContain("fencedonly");
    expect(names).not.toContain("inlinecode");
  });

  test("AC 16 — tags shaped like built-ins (todo, excalidraw, daily-note) are returned verbatim", async () => {
    const { result } = await run(
      SPECIFIC,
      upstreamJson([
        { tag: "#todo", count: "3" },
        { tag: "#excalidraw", count: "1" },
        { tag: "#daily-note", count: "7" },
      ]),
    );
    expect(result.tags).toEqual([
      { name: "daily-note", count: 7 },
      { name: "excalidraw", count: 1 },
      { name: "todo", count: 3 },
    ]);
  });

  test("FR-007 — a frontmatter-origin `#hashfm` keeps exactly one # stripped (never two)", async () => {
    const { result } = await run(SPECIFIC, upstreamJson([{ tag: "#hashfm", count: "1" }]));
    expect(result.tags).toEqual([{ name: "hashfm", count: 1 }]);
  });

  test("FR-007 — a name that upstream sends without a # is passed through unchanged", async () => {
    const { result } = await run(SPECIFIC, upstreamJson([{ tag: "bare", count: "1" }]));
    expect(result.tags).toEqual([{ name: "bare", count: 1 }]);
  });

  test("non-ASCII names (`#café`, `#日本語`) are passed through unchanged", async () => {
    const { result } = await run(
      SPECIFIC,
      upstreamJson([
        { tag: "#café", count: "2" },
        { tag: "#日本語", count: "1" },
      ]),
    );
    expect(result.tags).toEqual([
      { name: "café", count: 2 },
      { name: "日本語", count: 1 },
    ]);
  });

  test("FR-015 — stdout `Vault not found.` → CLI_REPORTED_ERROR with details.message, never an empty list", async () => {
    const err = await runRejected({ target_mode: "specific", vault: "NoSuchVault" }, "Vault not found.\n");
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details.message).toBe("Vault not found.");
  });

  test("FR-018 — upstream reply over the 10 MiB cap → CLI_OUTPUT_TOO_LARGE, never a truncated list", async () => {
    const oneMiB = Buffer.alloc(1024 * 1024, 0x20);
    const { spawnFn } = makeStubSpawn({ chunkedStdout: Array.from({ length: 11 }, () => oneMiB), hold: true });
    const err = (await captureRejection(executeTags(SPECIFIC, deps(spawnFn)))) as UpstreamError;
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.code).toBe("CLI_OUTPUT_TOO_LARGE");
  });

  test("H5 — a transport failure (non-zero exit) propagates unchanged", async () => {
    const { spawnFn } = makeQueuedSpawn([{ exitCode: 1, stderr: "boom" }]);
    const err = (await captureRejection(executeTags(SPECIFIC, deps(spawnFn)))) as UpstreamError;
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.code).toBe("CLI_NON_ZERO_EXIT");
  });

  test("H3 — non-JSON reply → CLI_REPORTED_ERROR with details.stage 'json-parse' and the trimmed stdout", async () => {
    const err = await runRejected(SPECIFIC, "not json at all\n");
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details.stage).toBe("json-parse");
    expect(err.details.stdout).toBe("not json at all");
    expect(err.cause).toBeInstanceOf(SyntaxError);
  });

  test("H3 — JSON of the wrong shape (`{\"x\":1}`) → CLI_REPORTED_ERROR with details.stage 'shape-parse'", async () => {
    const err = await runRejected(SPECIFIC, '{"x":1}');
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details.stage).toBe("shape-parse");
    expect(err.details.stdout).toBe('{"x":1}');
    expect(err.cause).toBeDefined();
  });

  test("H3 — non-decimal count (`\"x\"`) → CLI_REPORTED_ERROR with details.stage 'count-parse' naming tag and count", async () => {
    const err = await runRejected(SPECIFIC, '[{"tag":"#a","count":"x"}]');
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details.stage).toBe("count-parse");
    expect(err.details.tag).toBe("#a");
    expect(err.details.count).toBe("x");
  });

  test("H3 — missing count → CLI_REPORTED_ERROR with details.stage 'count-parse' (the call always sends `counts`)", async () => {
    const err = await runRejected(SPECIFIC, '[{"tag":"#a"}]');
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details.stage).toBe("count-parse");
    expect(err.details.tag).toBe("#a");
    expect(err.details.count).toBeUndefined();
  });

  test("H3 — counts like `-1`, `1.5` and an unsafe integer are rejected at 'count-parse'", async () => {
    for (const count of ["-1", "1.5", "9007199254740993"]) {
      const err = await runRejected(SPECIFIC, JSON.stringify([{ tag: "#a", count }]));
      expect(err.details.stage).toBe("count-parse");
    }
  });

  test("H3 — unknown extra upstream fields are tolerated (loose wire schema)", async () => {
    const { result } = await run(SPECIFIC, '[{"tag":"#a","count":"1","extra":true}]');
    expect(result).toEqual({ total: 1, tags: [{ name: "a", count: 1 }] });
  });
});

// =================== US2 — single-note scopes ===================

describe("US2 — tags of a single note", () => {
  test("AC 2 — `file: \"Beta\"` → argv carries file=Beta; note-scoped reply parsed", async () => {
    const { result, recorded } = await run({ ...SPECIFIC, file: "Beta" }, BETA_STDOUT);
    const argv = recorded[0]!.argv;
    expect(argv).toContain("vault=V");
    expect(argv).toContain("file=Beta");
    expect(argv.some((a) => a.startsWith("path="))).toBe(false);
    expect(argv).not.toContain("active");
    expect(argv).toContain("counts");
    expect(result).toEqual({ total: 6, tags: BETA_EXPECTED });
  });

  test("AC 3 — `path: \"Sandbox/x/Beta.md\"` → argv carries path=…; output identical to AC 2 for the same stdout", async () => {
    const byFile = await run({ ...SPECIFIC, file: "Beta" }, BETA_STDOUT);
    const byPath = await run({ ...SPECIFIC, path: "Sandbox/x/Beta.md" }, BETA_STDOUT);
    const argv = byPath.recorded[0]!.argv;
    expect(argv).toContain("path=Sandbox/x/Beta.md");
    expect(argv.some((a) => a.startsWith("file="))).toBe(false);
    expect(byPath.result).toEqual(byFile.result);
  });

  test("AC 4 — active mode + `activeOnly: true` → argv carries the active flag and no vault=", async () => {
    const { result, recorded } = await run({ target_mode: "active", activeOnly: true }, BETA_STDOUT);
    const argv = recorded[0]!.argv;
    expect(argv).toContain("active");
    expect(argv).toContain("counts");
    expect(argv.some((a) => a.startsWith("vault="))).toBe(false);
    expect(argv.some((a) => a.startsWith("file=") || a.startsWith("path="))).toBe(false);
    expect(result.tags).toEqual(BETA_EXPECTED);
  });

  test("R3 / ADR-038 — active mode + `file` keeps file= in argv (no silent locator strip) and sends no vault=", async () => {
    const { recorded } = await run({ target_mode: "active", file: "Beta" }, BETA_STDOUT);
    const argv = recorded[0]!.argv;
    expect(argv).toContain("file=Beta");
    expect(argv.some((a) => a.startsWith("vault="))).toBe(false);
  });

  test("R3 / ADR-038 — active mode + `path` keeps path= in argv", async () => {
    const { recorded } = await run({ target_mode: "active", path: "Sandbox/x/Beta.md" }, BETA_STDOUT);
    expect(recorded[0]!.argv).toContain("path=Sandbox/x/Beta.md");
  });

  test("specific mode + `activeOnly: true` → argv carries both vault=V and active (the named vault's focused note)", async () => {
    const { recorded } = await run({ ...SPECIFIC, activeOnly: true }, BETA_STDOUT);
    const argv = recorded[0]!.argv;
    expect(argv).toContain("vault=V");
    expect(argv).toContain("active");
  });

  test("`activeOnly: false` + `file` → no active flag", async () => {
    const { recorded } = await run({ ...SPECIFIC, file: "Beta", activeOnly: false }, BETA_STDOUT);
    expect(recorded[0]!.argv).not.toContain("active");
  });

  test("AC 13 — `Error: No active file. …` → ERR_NO_ACTIVE_FILE pointing at file / path, cause and details preserved", async () => {
    const stdout = "Error: No active file. Use file=<name> or path=<path> to specify a file.\n";
    const err = await runRejected({ target_mode: "active", activeOnly: true }, stdout);
    expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
    expect(err.message).toContain("`file`");
    expect(err.message).toContain("`path`");
    expect(err.message).not.toContain("target_mode");
    expect(err.cause).toBeInstanceOf(UpstreamError);
    const original = err.cause as UpstreamError;
    expect(original.code).toBe("ERR_NO_ACTIVE_FILE");
    expect(err.details.tool).toBe("tags");
    expect(err.details.message).toBe(original.details.message);
    expect(err.details.stdout).toBe(original.details.stdout);
    expect(err.details.argv).toEqual(original.details.argv);
  });

  test("FR-016 — `Error: File \"Missing\" not found.` → CLI_REPORTED_ERROR, not an empty list", async () => {
    const err = await runRejected({ ...SPECIFIC, file: "Missing" }, 'Error: File "Missing" not found.\n');
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(String(err.details.stdout)).toMatch(/^Error: File "/);
  });

  test("FR-016 — a missing `path` → CLI_REPORTED_ERROR", async () => {
    const err = await runRejected(
      { ...SPECIFIC, path: "Sandbox/x/Missing.md" },
      'Error: File "Sandbox/x/Missing.md" not found.\n',
    );
    expect(err.code).toBe("CLI_REPORTED_ERROR");
  });

  test("US2 scenario 5 / AC 7 — a note-scoped `No tags found.` → { total: 0, tags: [] }", async () => {
    const { result } = await run({ ...SPECIFIC, path: "Sandbox/x/Empty.md" }, "No tags found.\n");
    expect(result).toEqual({ total: 0, tags: [] });
  });
});

// =================== US3 — ordering and counts on / off ===================

describe("US3 — ordering and counts", () => {
  test("AC 5 (default) — Aardvark, aardvark, Banana regardless of upstream order", async () => {
    const shuffled = upstreamJson([
      { tag: "#Banana", count: "1" },
      { tag: "#aardvark", count: "1" },
      { tag: "#Aardvark", count: "1" },
    ]);
    const { result } = await run({ ...SPECIFIC, file: "Beta" }, shuffled);
    expect(result.tags.map((t) => t.name)).toEqual(["Aardvark", "aardvark", "Banana"]);
  });

  test("AC 5 (default) — the full Beta reply sorts identically from every upstream permutation", async () => {
    const reversed = upstreamJson(
      [
        { tag: "#shared", count: "2" },
        { tag: "#parent", count: "1" },
        { tag: "#hashfm", count: "1" },
        { tag: "#Banana", count: "1" },
        { tag: "#aardvark", count: "1" },
        { tag: "#Aardvark", count: "1" },
      ],
    );
    const { result } = await run({ ...SPECIFIC, file: "Beta" }, reversed);
    expect(result.tags).toEqual(BETA_EXPECTED);
  });

  test("AC 5 (count) — sortByCount: count descending, ties ordered by the name comparator, not upstream order", async () => {
    const stdout = upstreamJson([
      { tag: "#parent", count: "2" },
      { tag: "#solo", count: "1" },
      { tag: "#Aardvark", count: "2" },
      { tag: "#shared", count: "6" },
    ]);
    const { result } = await run({ ...SPECIFIC, sortByCount: true }, stdout);
    expect(result.tags).toEqual([
      { name: "shared", count: 6 },
      { name: "Aardvark", count: 2 },
      { name: "parent", count: 2 },
      { name: "solo", count: 1 },
    ]);
  });

  test("Q3 — non-ASCII is not folded: É… sorts after every ASCII letter, e… among ASCII", async () => {
    const stdout = upstreamJson([
      { tag: "#Élan", count: "1" },
      { tag: "#zebra", count: "1" },
      { tag: "#elan", count: "1" },
      { tag: "#日本語", count: "1" },
      { tag: "#café", count: "1" },
    ]);
    const { result } = await run(SPECIFIC, stdout);
    // UTF-8 bytes: "c"/"e"/"z" < "É" (0xC3 0x89) < "日" (0xE6 …).
    expect(result.tags.map((t) => t.name)).toEqual(["café", "elan", "zebra", "Élan", "日本語"]);
  });

  test("Q3 — ordering is UTF-8 byte order, not UTF-16 code-unit order (supplementary plane vs U+FF00 block)", async () => {
    // "😀" is U+1F600 (UTF-16 surrogate 0xD83D < 0xFF21; UTF-8 0xF0 > 0xEF), "Ａ" is U+FF21.
    const stdout = upstreamJson([
      { tag: "#😀", count: "1" },
      { tag: "#Ａ", count: "1" },
    ]);
    const { result } = await run(SPECIFIC, stdout);
    expect(result.tags.map((t) => t.name)).toEqual(["Ａ", "😀"]);
  });

  test("AC 6 — includeCounts: false → no entry has a count key; total unchanged; argv STILL carries counts (R2)", async () => {
    const { result, recorded } = await run({ ...SPECIFIC, file: "Beta", includeCounts: false }, BETA_STDOUT);
    expect(result.total).toBe(6);
    for (const entry of result.tags) {
      expect(Object.hasOwn(entry, "count")).toBe(false);
    }
    expect(result.tags.map((t) => t.name)).toEqual(BETA_EXPECTED.map((t) => t.name));
    expect(recorded[0]!.argv).toContain("counts");
  });

  test("US3 scenario 4 — includeCounts: false + sortByCount: true keeps the count order", async () => {
    const stdout = upstreamJson([
      { tag: "#solo", count: "1" },
      { tag: "#shared", count: "6" },
      { tag: "#parent", count: "2" },
    ]);
    const { result } = await run({ ...SPECIFIC, sortByCount: true, includeCounts: false }, stdout);
    expect(result).toEqual({ total: 3, tags: [{ name: "shared" }, { name: "parent" }, { name: "solo" }] });
  });

  test("AC 15 — repeated calls on the same reply return byte-identical output", async () => {
    const a = await run({ ...SPECIFIC, sortByCount: true }, VAULT_WIDE_STDOUT);
    const b = await run({ ...SPECIFIC, sortByCount: true }, VAULT_WIDE_STDOUT);
    expect(JSON.stringify(a.result)).toBe(JSON.stringify(b.result));
  });
});

describe("compareTagNames", () => {
  test("returns 0 only for identical strings", () => {
    expect(compareTagNames("project", "project")).toBe(0);
    expect(compareTagNames("Project", "project")).not.toBe(0);
    expect(compareTagNames("", "")).toBe(0);
  });

  test("is antisymmetric on sample pairs", () => {
    const pairs: Array<[string, string]> = [
      ["Aardvark", "aardvark"],
      ["aardvark", "Banana"],
      ["café", "cafe"],
      ["Élan", "elan"],
      ["parent", "parent/child"],
      ["😀", "Ａ"],
    ];
    for (const [a, b] of pairs) {
      const ab = compareTagNames(a, b);
      const ba = compareTagNames(b, a);
      expect(ab).not.toBe(0);
      expect(Math.sign(ab)).toBe(-Math.sign(ba));
    }
  });

  test("folds only A–Z: uppercase ASCII sorts next to its lowercase twin, ahead of it", () => {
    expect(compareTagNames("Aardvark", "aardvark")).toBeLessThan(0);
    expect(compareTagNames("aardvark", "Banana")).toBeLessThan(0);
    expect(compareTagNames("Zed", "apple")).toBeGreaterThan(0);
  });
});
