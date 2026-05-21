# Contract: query_base classification — VIEW_NOT_FOUND channel widening

**Anchor**: `src/tools/query_base/handler.ts`, `executeQueryBase()` stage 4, lines 384-417 (plus `classifyUpstreamError()` at lines 185-190 and the `CLASSIFIER_PATTERNS` table at lines 159-183 — both unchanged).
**FRs satisfied**: FR-003, FR-004, FR-005.

## Before

```ts
// === Stage 4 — post-subprocess error classification ===
const upstreamMessage = (cliResult.stderr.trim().length > 0
  ? cliResult.stderr.trim()
  : cliResult.stdout.trim());
if (upstreamMessage.length > 0 && !upstreamMessage.startsWith("[")) {
  const classified = classifyUpstreamError(upstreamMessage);
  if (classified !== null) {
    // ... VIEW_NOT_FOUND or BASE_MALFORMED branch
  }
}
```

Behaviour: prefer-stderr-fallback-to-stdout ternary. When upstream emits the error to stdout AND stderr carries any incidental content (warning, log line, debug output), the wrapper picks stderr — which does not contain the error phrase — and the classifier returns `null`. The flow falls through to stage 6 (`JSON.parse`), where the non-JSON stdout fails to parse, and the wrapper surfaces a `BASE_MALFORMED/unknown` or `stage: "json-parse"` error instead of the typed `VIEW_NOT_FOUND`.

## After

```ts
// === Stage 4 — post-subprocess error classification ===
// Scan BOTH channels for upstream error phrases (per BI-041 FR-003). Upstream emits
// VIEW_NOT_FOUND to stdout with exitCode 0; older behaviour preferred stderr and
// silently dropped stdout-only emits. The `[`-prefix guard preserves the JSON-array
// short-circuit so successful row responses are not misclassified.
const stderrTrimmed = cliResult.stderr.trim();
const stdoutTrimmed = cliResult.stdout.trim();
const upstreamMessage =
  stderrTrimmed.length > 0 && stdoutTrimmed.length > 0
    ? `${stderrTrimmed}\n${stdoutTrimmed}`
    : (stderrTrimmed.length > 0 ? stderrTrimmed : stdoutTrimmed);
if (upstreamMessage.length > 0 && !upstreamMessage.startsWith("[") && !stdoutTrimmed.startsWith("[")) {
  const classified = classifyUpstreamError(upstreamMessage);
  if (classified !== null) {
    // ... existing VIEW_NOT_FOUND or BASE_MALFORMED branch — unchanged
  }
}
```

Behaviour: both-channel scan. The combined message (newline-separated when both channels have content) is fed to the existing `classifyUpstreamError()` regex table. The `[`-prefix guard is checked on both the combined message AND `stdoutTrimmed` directly — the latter handles the case where stderr carries a warning AND stdout is a valid JSON array (the JSON-array short-circuit must still win even if the combined message does not start with `[`).

## Wire payload (unchanged — already correctly constructed at lines 393-403)

```json
{
  "code": "CLI_REPORTED_ERROR",
  "message": "query_base: view not found in base file",
  "details": {
    "code": "VIEW_NOT_FOUND",
    "view_name": "<verbatim from input>",
    "base_path": "<verbatim from input>"
  }
}
```

## Regression-guard: BASE_NOT_FOUND branch unchanged

`BASE_NOT_FOUND` (FR-005) fires in stage 2 (lines 340-346) via `fs.stat` ENOENT, BEFORE stage 3 (CLI invocation) BEFORE stage 4 (classification). The stage-4 widening does not affect stage 2. A non-existent `.base` path still surfaces:

```json
{
  "code": "CLI_REPORTED_ERROR",
  "message": "query_base: base file not found at the supplied vault-relative path",
  "details": {
    "code": "BASE_NOT_FOUND",
    "base_path": "<verbatim from input>"
  }
}
```

## Test additions (co-located per Principle II)

In `src/tools/query_base/handler.test.ts`:

1. **VIEW_NOT_FOUND on stdout-only emit**: spawn stub with `stdout: "Error: View not found: NonExistentView\n"`, `stderr: ""`, exit 0 → asserts `err.code === "CLI_REPORTED_ERROR"`, `details.code === "VIEW_NOT_FOUND"`, `details.view_name === "NonExistentView"`, `details.base_path === <input>`.
2. **VIEW_NOT_FOUND on stdout emit with incidental stderr**: spawn stub with `stdout: "Error: View not found: NonExistentView\n"`, `stderr: "warn: connection slow\n"`, exit 0 → same assertion. This is the bug-fix anchor — under the before-form this case would surface BASE_MALFORMED/unknown or stage:json-parse.
3. **VIEW_NOT_FOUND on stderr-only emit**: existing test at `handler.test.ts:592` (lowercase `"View 'Open' not found"`) — continues to pass (monotonic widening over the both-channel scan).
4. **BASE_NOT_FOUND regression-guard**: invoke against a non-existent `.base` path (mocked `fs.stat` throws `ENOENT`) → asserts `details.code === "BASE_NOT_FOUND"`, NOT `VIEW_NOT_FOUND`. The branch is in stage 2, not stage 4 — the test locks the ordering.
5. **JSON-array short-circuit preserved**: spawn stub with `stdout: "[]\n"`, `stderr: "warn: empty result\n"`, exit 0 → asserts the wrapper returns the empty-result envelope (no error). The `[`-prefix guard on `stdoutTrimmed` must win over the combined-message scan.

## Monotonic-widening invariant — proof sketch

The before-form examined exactly one channel per call (stderr if non-empty, else stdout). The after-form examines the union of both channels' non-empty content. Any phrase the before-form classified is a substring of the after-form's combined message (or equal to it). The classifier regex `/\bview\b[^.]*\b(not\s+found|...)\b/i` matches by substring on the combined message; therefore every classification the before-form produced is also produced by the after-form. The converse — the after-form classifies more inputs — is the intended behaviour.

## Eval-composed tools regression-guard

The query_base handler is not eval-composed (it invokes `obsidian base:query` directly per `handler.ts:364-382`). The eval-composed tools (`read_heading`, `find_by_property`) do not classify VIEW_NOT_FOUND — their classification paths are independent.
