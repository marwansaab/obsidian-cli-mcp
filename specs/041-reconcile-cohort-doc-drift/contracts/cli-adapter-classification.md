# Contract: CLI-adapter classification — ERR_NO_ACTIVE_FILE widening

**Anchor**: `src/cli-adapter/_dispatch.ts`, `onTerminal()` priority (b), line 294.
**FRs satisfied**: FR-001, FR-002.

## Before

```ts
// Priority (b): ERR_NO_ACTIVE_FILE — exit 0 with stdout starting with the full literal prefix.
if (trimmedHead.startsWith("Error: no active file")) {
  // ...
}
```

Behaviour: case-sensitive prefix match against the lowercase canonical form. Any input whose leading line differs in case (e.g. capital-N `"Error: No active file."`) falls through to priority (c) `CLI_REPORTED_ERROR` — the typed sub-discriminator is lost.

## After

```ts
// Priority (b): ERR_NO_ACTIVE_FILE — exit 0 with stdout starting with the canonical phrase
// (case-insensitive). Match anchor is the message head; punctuation-suffix tolerance is
// proven by the priority-(b)-beats-(c) test (`_dispatch.test.ts:311-320`).
const trimmedHeadLower = trimmedHead.toLowerCase();
if (trimmedHeadLower.startsWith("error: no active file")) {
  // ... (existing body unchanged — UpstreamError construction, recovery message, details payload)
}
```

Behaviour: case-insensitive prefix match against the same canonical phrase. Monotonic widening — every previously-matching input continues to match; the capital-N upstream emit now also matches.

## Wire payload (unchanged)

```json
{
  "code": "ERR_NO_ACTIVE_FILE",
  "message": "No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: \"specific\" and an explicit vault/file.",
  "details": {
    "argv": [/* ... */],
    "command": "<cli subcommand>",
    "stdout": "<verbatim>",
    "stderr": "<verbatim>",
    "exitCode": 0,
    "message": "<verbatim first line of stdout, trimmed>"
  }
}
```

Note: the outer `message` (recovery hint) is verbatim from `_dispatch.ts:302`; the inner `details.message` is the verbatim first line of the upstream stdout (preserves chain of custody per Principle IV).

## Test additions (co-located per Principle II)

In `src/cli-adapter/_dispatch.test.ts`:

1. **Capital-N classifies**: `stdout: "Error: No active file\n"`, exit 0 → asserts `err.code === "ERR_NO_ACTIVE_FILE"`, recovery message matches verbatim.
2. **Period-terminator + capital-N classifies**: `stdout: "Error: No active file.\n"`, exit 0 → same assertion. Covers spec A1 canonical form exactly.
3. **Mixed-case variants classify**: `stdout: "ERROR: NO ACTIVE FILE!\n"` and `stdout: "Error: NO active file: foo\n"`, exit 0 → both classify as ERR_NO_ACTIVE_FILE (covers spec Edge Cases "case spectrum" entry).
4. **Lowercase regression-guard**: existing `stdout: "Error: no active file\n"` test continues to pass (monotonic-widening invariant).
5. **Substring-of-longer-unrelated-message guard**: `stdout: "Error: file open failed: no active file in vault\n"`, exit 0 → must NOT classify as ERR_NO_ACTIVE_FILE (the canonical phrase is not the prefix). Asserts the anchor-at-head invariant — the case-insensitive match does NOT become substring-anywhere.

Mirror cases 1, 2, 3, 4 in `src/cli-adapter/cli-adapter.test.ts` (the higher-level invokeCli wrapper) to lock the integration-through-the-test-stub path. Case 5 is dispatch-layer-only since it is purely a classifier-anchor test.

## Monotonic-widening invariant — proof sketch

The widening replaces `startsWith(X)` with `toLowerCase().startsWith(toLowerCase(X))` where `X = "Error: no active file"`. For any input `s` such that `s.startsWith(X)` is true under the before-form: `s.toLowerCase()` starts with `X.toLowerCase()` (because `toLowerCase` is monotonic over `startsWith`). Therefore the after-form matches every input the before-form matched. The converse — that the after-form matches more inputs — is the intended behaviour (capital-N upstream emit). No input that previously matched now fails to match.

## Eval-composed tools regression-guard

`read_heading` and `find_by_property` route their no-active-file failures through this same dispatch-layer priority (the eval stub returns `"Error: no active file"` on stdout, exit 0). The monotonic-widening invariant guarantees they continue to classify. No per-tool test edit required; the dispatch-layer test suite is the shared seam.

The matching co-located tests at `src/tools/read_heading/handler.test.ts` and `src/tools/find_by_property/handler.test.ts` continue to pass without modification.
