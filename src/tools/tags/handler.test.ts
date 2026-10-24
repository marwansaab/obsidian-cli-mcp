// Original — no upstream. Tests for the tags handler — argv shape per scope (AC-1/2/3/4/10), content transforms (`#` strip per FR-013, digit-string count → integer per T0 P1, AC-8 fenced-code fixture captured live at T0 P3, AC-16 built-in-looking names), ordering (shared compareNames default + sortByCount, AC-5), projection (includeCounts: false, AC-6), empty results (`No tags found.` sentinel per T0 P2 and `[]`, AC-7), and failure propagation (unknown vault, missing note, no active note with the tags-specific message per AC-13, json-parse / upstream-shape, output cap).
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  EMPTY_TAGS_SENTINEL,
  executeTags,
  stripLeadingHash,
  TAGS_NO_ACTIVE_FILE_MESSAGE,
} from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { TYPED_TOOL_OUTPUT_CAP_BYTES } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import { captureRejection, makeQueuedSpawn, silentLogger } from "../_handler-test-fixtures.js";

import type { TagsInput } from "./schema.js";

function deps(spawnFn: SpawnLike) {
  return { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} };
}

/** Build upstream stdout in the T0 P1 wire shape: `[{ tag: "#…", count: "<digits>" }]`, pretty-printed. */
function wire(entries: Array<[string, number]>): string {
  return JSON.stringify(entries.map(([tag, count]) => ({ tag, count: String(count) })), null, 2) + "\n";
}

async function run(input: TagsInput, stdout: string) {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout, exitCode: 0 }]);
  const result = await executeTags(input, deps(spawnFn));
  return { result, argv: recorded[0]!.argv, spawns: recorded.length };
}

async function runError(input: TagsInput, stdout: string, exitCode = 0) {
  const { spawnFn } = makeQueuedSpawn([{ stdout, exitCode }]);
  return (await captureRejection(executeTags(input, deps(spawnFn)))) as UpstreamError;
}

// Verbatim stdout of `tags format=json path=Sandbox/t068/fence.md counts` (T0 probe P3,
// 2026-10-24). The note held `#t068-real` inline and `#t068-fenced` inside a fenced code block.
const FENCE_FIXTURE_STDOUT = '[\n  {\n    "tag": "#t068-real",\n    "count": "1"\n  }\n]\n';

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// ============================ US1 — argv (AC-1, AC-10) ============================

describe("argv — vault-wide", () => {
  test("AC-1/AC-10: no vault → `tags format=json counts` with no vault=, file=, path= or active", async () => {
    const { argv, spawns } = await run({}, wire([]));
    expect(spawns).toBe(1);
    expect(argv).toEqual(["tags", "format=json", "counts"]);
  });

  test("AC-10: vault supplied → argv starts with vault=V", async () => {
    const { argv } = await run({ vault: "V" }, wire([]));
    expect(argv).toEqual(["vault=V", "tags", "format=json", "counts"]);
  });
});

// ============================ US1 — content ============================

describe("content transforms", () => {
  test("AC-1: counts carried as integers (upstream digit strings), total equals length", async () => {
    const { result } = await run({}, wire([["#alpha", 4], ["#beta", 1], ["#parent/child", 12]]));
    expect(result).toEqual({
      total: 3,
      tags: [
        { name: "alpha", count: 4 },
        { name: "beta", count: 1 },
        { name: "parent/child", count: 12 },
      ],
    });
    expect(typeof result.tags[0]!.count).toBe("number");
  });

  test("FR-013: exactly one leading # stripped; names without # unchanged", async () => {
    const { result } = await run({}, wire([["#alpha", 1], ["##x", 1], ["plain", 1]]));
    expect(result.tags.map((t) => t.name)).toEqual(["#x", "alpha", "plain"]);
    expect(stripLeadingHash("#alpha")).toBe("alpha");
    expect(stripLeadingHash("##x")).toBe("#x");
    expect(stripLeadingHash("plain")).toBe("plain");
  });

  test("FR-013: hierarchical and non-ASCII names pass through byte-identical", async () => {
    const { result } = await run({}, wire([["#parent/child", 1], ["#café", 1], ["#日本語", 1]]));
    const names = result.tags.map((t) => t.name);
    expect(names).toContain("parent/child");
    expect(names).toContain("café");
    expect(names).toContain("日本語");
    expect(Buffer.from(names.find((n) => n.startsWith("caf"))!, "utf8")).toEqual(Buffer.from("café", "utf8"));
  });

  test("AC-16: built-in-looking names (todo, inbox, important) pass through unchanged", async () => {
    const { result } = await run({}, wire([["#todo", 2], ["#inbox", 1], ["#important", 3]]));
    expect(result.tags).toEqual([
      { name: "important", count: 3 },
      { name: "inbox", count: 1 },
      { name: "todo", count: 2 },
    ]);
  });

  test("AC-8: live fence.md fixture yields t068-real and never t068-fenced", async () => {
    const { result, argv } = await run(
      { vault: "TestVault-Obsidian-CLI-MCP", path: "Sandbox/t068/fence.md" },
      FENCE_FIXTURE_STDOUT,
    );
    expect(argv).toContain("path=Sandbox/t068/fence.md");
    expect(result).toEqual({ total: 1, tags: [{ name: "t068-real", count: 1 }] });
    expect(result.tags.some((t) => t.name === "t068-fenced")).toBe(false);
  });

  test("default order: case-insensitive first, then code-unit tiebreak, independent of upstream order", async () => {
    const { result } = await run({}, wire([["#beta", 1], ["#alpha", 1], ["#Alpha", 1], ["#Zeta", 1]]));
    expect(result.tags.map((t) => t.name)).toEqual(["Alpha", "alpha", "beta", "Zeta"]);
  });

  test("default order is not locale-aware (code-unit order for non-ASCII)", async () => {
    const { result } = await run({}, wire([["#日本語", 1], ["#zzz", 1], ["#café", 1], ["#cafz", 1]]));
    expect(result.tags.map((t) => t.name)).toEqual(["cafz", "café", "zzz", "日本語"]);
  });
});

// ============================ US1 — empty and failures ============================

describe("empty results (AC-7)", () => {
  test("`No tags found.` sentinel (T0 P2) → { total: 0, tags: [] }", async () => {
    expect(EMPTY_TAGS_SENTINEL).toBe("No tags found.");
    const { result } = await run({}, "No tags found.\n");
    expect(result).toEqual({ total: 0, tags: [] });
  });

  test("`[]` → { total: 0, tags: [] }", async () => {
    const { result } = await run({}, "[]\n");
    expect(result).toEqual({ total: 0, tags: [] });
  });

  test("near-miss sentinel → CLI_REPORTED_ERROR json-parse (no silent empty)", async () => {
    const err = await runError({}, "No tags found\n");
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details.stage).toBe("json-parse");
  });

  test("empty stdout is NOT treated as empty → json-parse", async () => {
    const err = await runError({}, "");
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details.stage).toBe("json-parse");
  });
});

describe("failures", () => {
  test("UNDERLYING: `Vault not found.` with exit 0 → CLI_REPORTED_ERROR", async () => {
    const err = await runError({ vault: "__nope__" }, "Vault not found.\n");
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details.message).toBe("Vault not found.");
  });

  test("non-JSON stdout → CLI_REPORTED_ERROR json-parse carrying stdout", async () => {
    const err = await runError({}, "#alpha\t1\n");
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details).toMatchObject({ stage: "json-parse", stdout: "#alpha\t1" });
  });

  test("wrong array shape → CLI_REPORTED_ERROR upstream-shape", async () => {
    const err = await runError({}, JSON.stringify([{ name: "#alpha", count: "1" }]));
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details.stage).toBe("upstream-shape");
    expect(Array.isArray(err.details.issues)).toBe(true);
  });

  test("numeric (non-string) or non-digit count → upstream-shape (T0 P1 pins digit strings)", async () => {
    for (const count of [1, "-1", "1.5", ""]) {
      const err = await runError({}, JSON.stringify([{ tag: "#a", count }]));
      expect(err.code).toBe("CLI_REPORTED_ERROR");
      expect(err.details.stage).toBe("upstream-shape");
    }
  });

  test("a non-array JSON value → upstream-shape", async () => {
    const err = await runError({}, JSON.stringify({ tag: "#a", count: "1" }));
    expect(err.details.stage).toBe("upstream-shape");
  });

  test("extra upstream fields are tolerated (loose entry schema)", async () => {
    const { result } = await run({}, JSON.stringify([{ tag: "#a", count: "2", extra: true }]));
    expect(result).toEqual({ total: 1, tags: [{ name: "a", count: 2 }] });
  });

  test("over-cap output → CLI_OUTPUT_TOO_LARGE propagates (no partial list)", async () => {
    const huge = "[" + " ".repeat(TYPED_TOOL_OUTPUT_CAP_BYTES + 16) + "]";
    const err = await runError({}, huge);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.code).toBe("CLI_OUTPUT_TOO_LARGE");
  });

  test("non-zero exit propagates unchanged", async () => {
    const { spawnFn } = makeQueuedSpawn([{ exitCode: 1, stderr: "boom" }]);
    const err = (await captureRejection(executeTags({}, deps(spawnFn)))) as UpstreamError;
    expect(err.code).toBe("CLI_NON_ZERO_EXIT");
  });
});

// ============================ US2 — scope argv ============================

describe("scope argv (AC-2, AC-3, AC-4, AC-10)", () => {
  test("AC-2: file → file=<name>", async () => {
    const { argv } = await run({ file: "Note" }, wire([]));
    expect(argv).toEqual(["tags", "format=json", "file=Note", "counts"]);
  });

  test("AC-3: path → path=<path> verbatim", async () => {
    const { argv } = await run({ path: "dir/Note.md" }, wire([]));
    expect(argv).toEqual(["tags", "format=json", "path=dir/Note.md", "counts"]);
  });

  test("AC-10: file / path with vault → vault= prefix; without → no prefix", async () => {
    expect((await run({ vault: "V", file: "Note" }, wire([]))).argv).toEqual([
      "vault=V",
      "tags",
      "format=json",
      "file=Note",
      "counts",
    ]);
    expect((await run({ vault: "V", path: "a/b.md" }, wire([]))).argv).toEqual([
      "vault=V",
      "tags",
      "format=json",
      "path=a/b.md",
      "counts",
    ]);
    expect((await run({ file: "Note" }, wire([]))).argv.some((a) => a.startsWith("vault="))).toBe(false);
    expect((await run({ path: "a/b.md" }, wire([]))).argv.some((a) => a.startsWith("vault="))).toBe(false);
  });

  test("AC-4: activeOnly: true → `active` flag, no vault=", async () => {
    const { argv } = await run({ activeOnly: true }, wire([["#t068-multi", 3]]));
    expect(argv).toEqual(["tags", "format=json", "counts", "active"]);
  });

  test("activeOnly: false adds no flag", async () => {
    const { argv } = await run({ activeOnly: false, file: "Note" }, wire([]));
    expect(argv).not.toContain("active");
  });
});

// ============================ US2 — scope failures ============================

describe("scope failures (AC-13, FR-017)", () => {
  // Upstream wording captured at T0 probe P7 (2026-10-24).
  const NO_ACTIVE_STDOUT = "Error: No active file. Use file=<name> or path=<path> to specify a file.\n";

  test("AC-13: no active note → ERR_NO_ACTIVE_FILE with the tags message, cause and details preserved", async () => {
    const err = await runError({ activeOnly: true }, NO_ACTIVE_STDOUT);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
    expect(err.message).toBe(TAGS_NO_ACTIVE_FILE_MESSAGE);
    expect(err.message).toContain("`file`");
    expect(err.message).toContain("`path`");
    expect(err.message).not.toContain("target_mode");
    expect(err.cause).toBeInstanceOf(UpstreamError);
    expect((err.cause as UpstreamError).code).toBe("ERR_NO_ACTIVE_FILE");
    expect(err.details).toBe((err.cause as UpstreamError).details);
    expect(err.details.message).toBe(NO_ACTIVE_STDOUT.trim());
  });

  test("FR-017: missing path → CLI_REPORTED_ERROR carrying the upstream message (T0 P6), never empty", async () => {
    const err = await runError({ path: "Sandbox/missing.md" }, 'Error: File "Sandbox/missing.md" not found.\n');
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details.message).toBe('Error: File "Sandbox/missing.md" not found.');
  });

  test("FR-017: missing file → CLI_REPORTED_ERROR", async () => {
    const err = await runError({ file: "does-not-exist" }, 'Error: File "does-not-exist" not found.\n');
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details.message).toBe('Error: File "does-not-exist" not found.');
  });

  test("untagged note → { total: 0, tags: [] }", async () => {
    const { result } = await run({ path: "Sandbox/empty.md" }, "No tags found.\n");
    expect(result).toEqual({ total: 0, tags: [] });
  });
});

// ============================ US3 — ordering (AC-5) ============================

describe("ordering (AC-5)", () => {
  const scrambled = wire([
    ["#beta", 2],
    ["#café", 5],
    ["#alpha", 2],
    ["#Alpha", 2],
    ["#zeta", 9],
    ["#cafz", 5],
    ["#one", 1],
  ]);

  test("sortByCount: count descending, ties by compareNames (case-variant and non-ASCII pairs)", async () => {
    const { result, argv } = await run({ sortByCount: true }, scrambled);
    expect(result.tags).toEqual([
      { name: "zeta", count: 9 },
      { name: "cafz", count: 5 },
      { name: "café", count: 5 },
      { name: "Alpha", count: 2 },
      { name: "alpha", count: 2 },
      { name: "beta", count: 2 },
      { name: "one", count: 1 },
    ]);
    expect(argv.some((a) => a.startsWith("sort="))).toBe(false);
  });

  test("default ignores counts", async () => {
    const { result } = await run({}, scrambled);
    expect(result.tags.map((t) => t.name)).toEqual(["Alpha", "alpha", "beta", "cafz", "café", "one", "zeta"]);
  });

  test("sortByCount: false behaves as default", async () => {
    const { result } = await run({ sortByCount: false }, scrambled);
    expect(result.tags.map((t) => t.name)).toEqual(["Alpha", "alpha", "beta", "cafz", "café", "one", "zeta"]);
  });

  test("upstream order never leaks: reversed input gives identical output", async () => {
    const entries: Array<[string, number]> = [["#b", 1], ["#a", 3], ["#c", 3]];
    const a = await run({ sortByCount: true }, wire(entries));
    const b = await run({ sortByCount: true }, wire([...entries].reverse()));
    expect(a.result).toEqual(b.result);
    expect(a.result.tags.map((t) => t.name)).toEqual(["a", "c", "b"]);
  });
});

// ============================ US3 — projection (AC-6) ============================

describe("projection (AC-6)", () => {
  const upstream = wire([["#low", 1], ["#high", 7], ["#mid", 3]]);

  test("includeCounts: false → every entry's keys are exactly [name]; argv still sends counts", async () => {
    const { result, argv } = await run({ includeCounts: false }, upstream);
    expect(result.total).toBe(3);
    for (const entry of result.tags) expect(Object.keys(entry)).toEqual(["name"]);
    expect(result.tags.map((t) => t.name)).toEqual(["high", "low", "mid"]);
    expect(argv).toContain("counts");
  });

  test("includeCounts: false + sortByCount: true → still ordered by count", async () => {
    const { result, argv } = await run({ includeCounts: false, sortByCount: true }, upstream);
    expect(result.tags).toEqual([{ name: "high" }, { name: "mid" }, { name: "low" }]);
    expect(argv).toContain("counts");
  });

  test("includeCounts: true keeps counts", async () => {
    const { result } = await run({ includeCounts: true }, upstream);
    for (const entry of result.tags) expect(Object.keys(entry).sort()).toEqual(["count", "name"]);
  });
});
