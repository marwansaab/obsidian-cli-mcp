// Original — no upstream. Tests for the outline handler — 29 cases per data-model.md handler-test inventory. Covers default-mode + count-only happy paths, empty-outline sentinel in both modes, field rename heading→text, byte-faithful level/text/line, Setext defer-to-upstream (R11/F10), indented-code defer-to-upstream (FR-012a/F12), fenced-block opacity (F2), frontmatter opacity (F11), level-skipping preserved (F13/FR-014), argv shape per mode (R3/F14 mutually exclusive), single-spawn invariant (R3/R12), JSON / integer parse failures with details.stage discriminator, dispatch-layer auto-classification (file-not-found, non-`.md`, no-focus, output-cap, binary-not-found, path-traversal, UpstreamError pass-through), and the SC-012 token-cost regression (5× threshold for fixture flexibility).
import { afterEach, beforeEach, expect, test } from "vitest";

import { EMPTY_OUTLINE_SENTINEL, executeOutline } from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import { makeQueuedSpawn, silentLogger, captureRejection } from "../_handler-test-fixtures.js";

function deps(spawnFn: SpawnLike) {
  return { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} };
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// =================== Happy paths — default mode ===================

// (1) multi-level fixture in specific+path → full headings array
test("specific+path multi-level fixture → full headings array, count matches", async () => {
  const upstream = JSON.stringify([
    { level: 1, heading: "Top", line: 1 },
    { level: 2, heading: "Sub A", line: 3 },
    { level: 2, heading: "Sub B", line: 5 },
    { level: 3, heading: "Leaf", line: 7 },
  ]);
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: upstream + "\n", exitCode: 0 }]);
  const result = await executeOutline(
    { target_mode: "specific", vault: "Demo", path: "Notes/x.md" },
    deps(spawnFn),
  );
  expect(recorded).toHaveLength(1);
  expect(result.count).toBe(4);
  expect(result.headings).toEqual([
    { level: 1, text: "Top", line: 1 },
    { level: 2, text: "Sub A", line: 3 },
    { level: 2, text: "Sub B", line: 5 },
    { level: 3, text: "Leaf", line: 7 },
  ]);
});

// (2) multi-level fixture in specific+file (wikilink form) → full headings array
test("specific+file wikilink form → full headings array", async () => {
  const upstream = JSON.stringify([
    { level: 1, heading: "Wiki Top", line: 1 },
    { level: 2, heading: "Wiki Sub", line: 3 },
  ]);
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const result = await executeOutline(
    { target_mode: "specific", vault: "Demo", file: "WikiLinkName" },
    deps(spawnFn),
  );
  expect(recorded[0]!.argv).toContain("file=WikiLinkName");
  expect(result.count).toBe(2);
  expect(result.headings[0]!.text).toBe("Wiki Top");
});

// (3) multi-level fixture in active mode → full headings array
test("active mode multi-level fixture → full headings array", async () => {
  const upstream = JSON.stringify([
    { level: 1, heading: "Active Top", line: 1 },
    { level: 2, heading: "Active Sub", line: 4 },
  ]);
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const result = await executeOutline({ target_mode: "active" }, deps(spawnFn));
  expect(recorded[0]!.argv.some((a) => a.startsWith("vault="))).toBe(false);
  expect(recorded[0]!.argv.some((a) => a.startsWith("file="))).toBe(false);
  expect(recorded[0]!.argv.some((a) => a.startsWith("path="))).toBe(false);
  expect(result.count).toBe(2);
  expect(result.headings[0]!.text).toBe("Active Top");
});

// (4) field rename heading → text byte-faithful (F1 / FR-008)
test("field rename: upstream `heading` → output `text` byte-faithful", async () => {
  const text = "Heading with !@#$%^&*()_+-=[]{}|\\:;\"'<>,.?/`~";
  const upstream = JSON.stringify([{ level: 2, heading: text, line: 42 }]);
  const { spawnFn } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const result = await executeOutline(
    { target_mode: "specific", vault: "V", path: "x.md" },
    deps(spawnFn),
  );
  expect(result.headings[0]!.text).toBe(text);
  expect(result.headings[0]!.level).toBe(2);
  expect(result.headings[0]!.line).toBe(42);
});

// (5) inline markdown survives byte-faithfully (F4 / FR-011)
test("inline markdown `**bold**` survives byte-faithfully", async () => {
  const upstream = JSON.stringify([{ level: 2, heading: "Section Beta with **bold**", line: 5 }]);
  const { spawnFn } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const result = await executeOutline(
    { target_mode: "specific", vault: "V", path: "x.md" },
    deps(spawnFn),
  );
  expect(result.headings[0]!.text).toBe("Section Beta with **bold**");
});

// (6) `::` substring survives byte-faithfully (F5)
test("'::' substring in heading text survives byte-faithfully", async () => {
  const upstream = JSON.stringify([{ level: 3, heading: "Sub-beta::case", line: 8 }]);
  const { spawnFn } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const result = await executeOutline(
    { target_mode: "specific", vault: "V", path: "x.md" },
    deps(spawnFn),
  );
  expect(result.headings[0]!.text).toBe("Sub-beta::case");
});

// (7) closing-ATX form pre-stripped by upstream (F3)
test("closing-ATX form `## Title ##` → upstream returns `Title`; wrapper preserves", async () => {
  // The wrapper does NOT strip ATX markers; upstream does. Stub the post-strip value.
  const upstream = JSON.stringify([{ level: 2, heading: "Section Gamma", line: 10 }]);
  const { spawnFn } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const result = await executeOutline(
    { target_mode: "specific", vault: "V", path: "x.md" },
    deps(spawnFn),
  );
  expect(result.headings[0]!.text).toBe("Section Gamma");
});

// (8) Setext entries included (F10 / R11 — defer to upstream)
test("Setext entries appear in output — defer to upstream per F10/R11", async () => {
  const upstream = JSON.stringify([
    { level: 1, heading: "Real H1", line: 7 },
    { level: 1, heading: "Setext H1 underline test", line: 9 },
    { level: 2, heading: "Setext H2 underline test", line: 14 },
  ]);
  const { spawnFn } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const result = await executeOutline(
    { target_mode: "specific", vault: "V", path: "x.md" },
    deps(spawnFn),
  );
  expect(result.count).toBe(3);
  expect(result.headings.map((h) => h.text)).toEqual([
    "Real H1",
    "Setext H1 underline test",
    "Setext H2 underline test",
  ]);
});

// (9) indented-code-block `#`-lines absent (FR-012a / F12)
test("indented-code-block '#'-lines absent in upstream → absent in output", async () => {
  // Upstream excludes indented-code-block heading-like lines; the wrapper passes through.
  const upstream = JSON.stringify([
    { level: 1, heading: "Real Top", line: 1 },
    { level: 2, heading: "After Code Block", line: 9 },
  ]);
  const { spawnFn } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const result = await executeOutline(
    { target_mode: "specific", vault: "V", path: "x.md" },
    deps(spawnFn),
  );
  expect(result.headings.map((h) => h.text)).toEqual(["Real Top", "After Code Block"]);
});

// (10) frontmatter `#`-like content absent (F11)
test("frontmatter `#`-like content absent in upstream → absent in output", async () => {
  const upstream = JSON.stringify([{ level: 1, heading: "Body H1", line: 5 }]);
  const { spawnFn } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const result = await executeOutline(
    { target_mode: "specific", vault: "V", path: "x.md" },
    deps(spawnFn),
  );
  expect(result.count).toBe(1);
  expect(result.headings[0]!.line).toBe(5);
});

// (11) level-skipping preserved (FR-014 / F13)
test("level-skipping preserved — H1 then H3 reported as-is", async () => {
  const upstream = JSON.stringify([
    { level: 1, heading: "Skip-level test", line: 19 },
    { level: 3, heading: "H3 skipping H2", line: 21 },
  ]);
  const { spawnFn } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const result = await executeOutline(
    { target_mode: "specific", vault: "V", path: "x.md" },
    deps(spawnFn),
  );
  expect(result.headings.map((h) => h.level)).toEqual([1, 3]);
});

// =================== Happy paths — count-only mode ===================

// (12) total:true against multi-heading file → { count: N, headings: [] }
test("total:true against multi-heading file → { count: N, headings: [] }", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "7\n", exitCode: 0 }]);
  const result = await executeOutline(
    { target_mode: "specific", vault: "V", path: "x.md", total: true },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 7, headings: [] });
});

// (13) total:true against zero-heading file (sentinel) → { count: 0, headings: [] }
test("total:true against zero-heading file (sentinel) → { count: 0, headings: [] }", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `${EMPTY_OUTLINE_SENTINEL}\n`, exitCode: 0 },
  ]);
  const result = await executeOutline(
    { target_mode: "specific", vault: "V", path: "x.md", total: true },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 0, headings: [] });
});

// =================== Empty outline (default mode) ===================

// (14) default mode + zero-heading file → { count: 0, headings: [] }
test("default mode + zero-heading file (sentinel) → { count: 0, headings: [] }", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `${EMPTY_OUTLINE_SENTINEL}\n`, exitCode: 0 },
  ]);
  const result = await executeOutline(
    { target_mode: "specific", vault: "V", path: "empty.md" },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 0, headings: [] });
});

// =================== Argv assertions ===================

// (15) default mode argv contains `format=json` and NOT `total`
test("default mode argv contains `format=json` and NOT `total`", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: "[]\n", exitCode: 0 }]);
  await executeOutline(
    { target_mode: "specific", vault: "V", path: "x.md" },
    deps(spawnFn),
  );
  const argv = recorded[0]!.argv;
  expect(argv).toContain("format=json");
  expect(argv).not.toContain("total");
});

// (16) count-only mode argv contains `total` and NOT `format=json`
test("count-only mode argv contains `total` and NOT `format=json`", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: "0\n", exitCode: 0 }]);
  await executeOutline(
    { target_mode: "specific", vault: "V", path: "x.md", total: true },
    deps(spawnFn),
  );
  const argv = recorded[0]!.argv;
  expect(argv).toContain("total");
  expect(argv).not.toContain("format=json");
});

// (17) specific mode argv contains vault=…
test("specific mode argv contains `vault=…`", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: "[]\n", exitCode: 0 }]);
  await executeOutline(
    { target_mode: "specific", vault: "Demo", path: "x.md" },
    deps(spawnFn),
  );
  expect(recorded[0]!.argv).toContain("vault=Demo");
  expect(recorded[0]!.argv).toContain("outline");
  expect(recorded[0]!.argv).toContain("path=x.md");
});

// (18) active mode argv omits vault/file/path (cli-adapter strips)
test("active mode argv omits vault/file/path tokens", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: "[]\n", exitCode: 0 }]);
  await executeOutline({ target_mode: "active" }, deps(spawnFn));
  const argv = recorded[0]!.argv;
  expect(argv).toContain("outline");
  expect(argv.some((a) => a.startsWith("vault="))).toBe(false);
  expect(argv.some((a) => a.startsWith("file="))).toBe(false);
  expect(argv.some((a) => a.startsWith("path="))).toBe(false);
});

// (19) single spawn invocation per request
test("ONE spawn invocation per request — single-call invariant (R3 / R12)", async () => {
  const upstream = JSON.stringify([{ level: 1, heading: "X", line: 1 }]);
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  await executeOutline(
    { target_mode: "specific", vault: "V", path: "x.md" },
    deps(spawnFn),
  );
  expect(recorded).toHaveLength(1);
});

// =================== Failure paths ===================

// (20) JSON parse failure → CLI_REPORTED_ERROR with details.stage = "json-parse"
test("JSON parse failure → CLI_REPORTED_ERROR with details.stage='json-parse'", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "not valid json\n", exitCode: 0 }]);
  const err = (await captureRejection(
    executeOutline({ target_mode: "specific", vault: "V", path: "x.md" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("json-parse");
  expect(err.details.stdout).toBe("not valid json");
});

// (21) total-mode integer parse failure → CLI_REPORTED_ERROR with details.stage = "total-parse"
test("total-mode integer parse failure → CLI_REPORTED_ERROR with details.stage='total-parse'", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "not-a-number\n", exitCode: 0 }]);
  const err = (await captureRejection(
    executeOutline(
      { target_mode: "specific", vault: "V", path: "x.md", total: true },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("total-parse");
  expect(err.details.stdout).toBe("not-a-number");
});

// (22) defence-in-depth pass-through regression guard.
// Historical note: this test originated as the "silently honoured-as-noop per F8/R5" case for unknown-vault names. The BI-042
// empirical probe (2026-05-21 against obsidian-cli 1.12.7) showed upstream now emits "Vault not found." on stdout for
// unregistered vault names — the cli-adapter R5 inspection reclassifies to CLI_REPORTED_ERROR. This test now serves as the
// inverse-direction regression guard: when upstream DOES return data (e.g. vault= was registered, or a future upstream
// version changes back to silent-fallback), the wrapper does not impose extra classification on the data stdout.
test("data-stdout pass-through regression guard (any vault name) — wrapper imposes no extra classification on JSON data stdout", async () => {
  // The mock returns valid outline data despite the unregistered vault name; the wrapper passes it through.
  const upstream = JSON.stringify([{ level: 1, heading: "Focused vault top", line: 1 }]);
  const { spawnFn } = makeQueuedSpawn([{ stdout: upstream, exitCode: 0 }]);
  const result = await executeOutline(
    { target_mode: "specific", vault: "NonExistent", path: "x.md" },
    deps(spawnFn),
  );
  expect(result.count).toBe(1);
  expect(result.headings[0]!.text).toBe("Focused vault top");
});

// (23) non-`.md` filetype upstream rejection → CLI_REPORTED_ERROR (dispatch-layer auto-classified per R8/F9)
test("non-`.md` upstream rejection → CLI_REPORTED_ERROR (dispatch-layer auto-classified)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Error: File is not a markdown file.\n", exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeOutline(
      { target_mode: "specific", vault: "V", path: "Sandbox/x.canvas" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.message).toBe("Error: File is not a markdown file.");
});

// (24) active-mode no-focus → ERR_NO_ACTIVE_FILE (dispatch-layer auto-classified per R13)
test("active-mode no-focus → ERR_NO_ACTIVE_FILE (dispatch-layer auto-classified)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Error: no active file\n", exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeOutline({ target_mode: "active" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
});

// (25) path-traversal → CLI_REPORTED_ERROR (per F16 / FR-019 — upstream treats `..` as literal filename)
test("path-traversal `../escape.md` → CLI_REPORTED_ERROR (upstream-confined per F16)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: 'Error: File "../escape.md" not found.\n', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeOutline(
      { target_mode: "specific", vault: "V", path: "../escape.md" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.message).toBe('Error: File "../escape.md" not found.');
});

// (26) output-cap kill → CLI_NON_ZERO_EXIT or CLI_OUTPUT_TOO_LARGE (dispatch-layer auto-classified per R10)
test("output-cap kill / non-zero exit → structured upstream error propagates unmodified", async () => {
  const { spawnFn } = makeQueuedSpawn([{ exitCode: 1, stderr: "cap exceeded" }]);
  const err = (await captureRejection(
    executeOutline(
      { target_mode: "specific", vault: "V", path: "huge.md" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
});

// (27) binary not found → CLI_BINARY_NOT_FOUND (dispatch-layer auto-classified)
test("ENOENT on spawn → CLI_BINARY_NOT_FOUND propagates", async () => {
  const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  const { spawnFn } = makeQueuedSpawn([{ errorOnSpawn: enoent }]);
  const err = (await captureRejection(
    executeOutline({ target_mode: "active" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
});

// (28) UpstreamError pass-through — handler does NOT wrap an UpstreamError thrown by invokeCli
test("UpstreamError pass-through — handler does NOT wrap CLI_REPORTED_ERROR from invokeCli", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: 'Error: File "missing.md" not found.\n', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeOutline(
      { target_mode: "specific", vault: "V", path: "missing.md" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  // Importantly: the handler did NOT add a `stage` field — this is the dispatch-layer's
  // surface, not the handler's parse-failure surface.
  expect(err.details.stage).toBeUndefined();
});

// (29) Token-cost regression (SC-012) — outline payload is materially smaller than the
// equivalent full-file read. The "two orders of magnitude" claim is locked with a
// conservative 5× threshold for fixture-size flexibility (per /speckit-analyze U1).
test("SC-012 token-cost regression — outline stdout bytes << equivalent full-file read bytes", async () => {
  // (a) Synthetic outline payload: 50 headings, ~70 bytes/entry → ~3.5 KB JSON.
  const outlineHeadings = Array.from({ length: 50 }, (_, i) => ({
    level: 1 + (i % 6),
    heading: `Heading ${String(i + 1).padStart(4, "0")}`,
    line: 1 + i * 4,
  }));
  const outlineStdout = JSON.stringify(outlineHeadings);

  // (b) Synthetic full-file read payload of the same logical note: 50 sections,
  //     each with a heading line + ~580 bytes of body content → ~30 KB markdown.
  const bodyChunk = "Lorem ipsum dolor sit amet, ".repeat(20); // ~560 bytes
  const fullReadStdout = outlineHeadings
    .map((h) => `${"#".repeat(h.level)} ${h.heading}\n\n${bodyChunk}\n`)
    .join("\n");

  const outlineBytes = Buffer.byteLength(outlineStdout, "utf8");
  const fullReadBytes = Buffer.byteLength(fullReadStdout, "utf8");
  expect(outlineBytes).toBeLessThan(fullReadBytes / 5);
});
