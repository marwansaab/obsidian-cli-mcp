# Research: Detect CLI Errors

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-05

## Status

No `NEEDS CLARIFICATION` items remain after [spec.md](./spec.md)'s six clarifications (5 in session 1, 1 in session 2, all on 2026-05-05). This document records the empirical decisions and v0.1 baselines that the Phase 1 design depends on.

## Empirical observations (2026-05-03 acceptance testing)

The Obsidian Integrated CLI was observed during 001-add-cli-bridge acceptance testing to exit with code `0` and emit a leading `Error:` token on **stdout** for at least three independently-reproducible application-level failures:

- **Unknown subcommand**: `obsidian nonexistent_command_xyz` → exit `0`, stdout `"Error: Command \"nonexistent_command_xyz\" not found.\n"`, stderr empty.
- **Missing file**: `obsidian read this/does/not/exist.md` → exit `0`, stdout `"Error: File ...\n"`, stderr empty.
- **Eval that throws**: `obsidian eval --code 'throw new Error("test")'` → exit `0`, stdout starting `"Error: ..."` (rendered exception), stderr empty.

The bridge's `if (code === 0)` branch in `runOnce` ([src/tools/obsidian_exec/handler.ts:216](../../src/tools/obsidian_exec/handler.ts#L216)) currently resolves these as success-shaped responses — exactly the "spec-vs-reality gap" against 001's acceptance criterion #6 that this feature exists to close.

## Decisions inherited from spec.md clarifications

| ID | Decision | Source |
|----|----------|--------|
| Q1 | `CLI_REPORTED_ERROR.details` includes `exitCode: 0` (the truthful exit code, mirrored for symmetry with `CLI_NON_ZERO_EXIT.details.exitCode` after FR-014). | spec.md Clarifications, FR-003, FR-004 |
| Q2 | `details.message = stdout.split('\n', 1)[0].trim()` — LF-only split, full whitespace trim. Cross-platform CRLF handling provided by `.trim()` absorbing trailing `\r`. | spec.md Clarifications, FR-003, Edge Cases |
| Q3 | This is a defect repair against 001 AC#6, not a contract-breaking change. No migration FR; ordinary release notes suffice. | spec.md Clarifications |
| Q4 | FR-014 reconciles `CLI_NON_ZERO_EXIT.details.exitCode/signal` rows with the contract's existing prose (line 106 of 001's errors.contract.md). | spec.md Clarifications, FR-014 |
| Q5 | Canonical errors contract stays at `specs/001-add-cli-bridge/contracts/errors.contract.md`. This feature edits in place; no file moves, no fragmentation. The `errors.contract-patch.md` artifact under this feature documents only the diff to apply. | spec.md Clarifications |
| Q6 | FR-015 adds `VALIDATION_ERROR` and `TOOL_NOT_FOUND` rows (live in code at [tool.ts:50,61](../../src/tools/obsidian_exec/tool.ts#L50-L61), documented in [README.md:113-114](../../README.md#L113-L114), but never registered in the canonical contract). | spec.md Clarifications, FR-015 |

## v0.1 baselines reaffirmed

These constraints carry through unchanged from 001 and are *not* re-litigated by this feature:

- **`UpstreamError` is the single boundary-error type** (Constitution Principle IV; spec.md Assumptions row 4). The new code is a member of the existing `UpstreamError.code` enumeration; no new error class.
- **MCP serialization drops `cause`** ([001 contract:106](../../001-add-cli-bridge/contracts/errors.contract.md)). For `CLI_REPORTED_ERROR`, `cause` is `null` (FR-002), so this serialization rule is trivially satisfied — nothing to mirror.
- **`details.stdout` and `details.stderr` are full UTF-8 captures, byte-preserved** (parallels how `CLI_NON_ZERO_EXIT.details.stdout/stderr` already work in [handler.ts:174-175](../../src/tools/obsidian_exec/handler.ts#L174-L175)).
- **10 MiB stdout/stderr cap** ([handler.ts:13](../../src/tools/obsidian_exec/handler.ts#L13)) takes precedence — `CLI_OUTPUT_TOO_LARGE` short-circuits the new detection (Edge Cases).
- **`CLI_TIMEOUT` and `CLI_BINARY_NOT_FOUND` short-circuit** the exit-zero path entirely (Edge Cases). The new detection only runs when `killReason === null && code === 0`.
- **Vitest + `@vitest/coverage-v8`** is the test framework (per constitution 1.1.0). The 001 plan's reference to `node:test` is stale; the implementation has used vitest throughout.
- **`OBSIDIAN_EXEC_DESCRIPTION`** is a single exported string constant ([tool.ts:15-16](../../src/tools/obsidian_exec/tool.ts#L15-L16)); the existing description-equality assertion in [tool.test.ts:54](../../src/tools/obsidian_exec/tool.test.ts#L54) compares constant-against-constant, so updating the constant per FR-009 satisfies the test without any test-file edit.

## Detection-site analysis

The detection logic must land inside the `child.on("exit", ...)` callback in `runOnce` ([handler.ts:168-230](../../src/tools/obsidian_exec/handler.ts#L168-L230)), specifically inside the `if (code === 0)` branch starting at [line 216](../../src/tools/obsidian_exec/handler.ts#L216), but only when no `killReason` has been set (timeout or output-cap have already short-circuited). The exact insertion point is:

```ts
// Existing structure at handler.ts:216-220:
if (code === 0) {
  deps.logger.callEndSuccess({ callId, durationMs, stdoutBytes, stderrBytes });
  resolve({ stdout: stdoutFull, stderr: stderrFull, exitCode: 0, argv });
  return;
}
```

After the patch:

```ts
if (code === 0) {
  if (stdoutFull.trimStart().startsWith("Error:")) {
    deps.logger.callEndFailure({ callId, errorCode: "CLI_REPORTED_ERROR", durationMs });
    reject(
      new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: {
          argv,
          stdout: stdoutFull,
          stderr: stderrFull,
          exitCode: 0,
          message: stdoutFull.split("\n", 1)[0]!.trim(),
        },
      }),
    );
    return;
  }
  deps.logger.callEndSuccess({ callId, durationMs, stdoutBytes, stderrBytes });
  resolve({ stdout: stdoutFull, stderr: stderrFull, exitCode: 0, argv });
  return;
}
```

The non-null assertion on `split("\n", 1)[0]!` is safe: `String.prototype.split` always returns at least one element. The split-with-limit-1 is the LF-only form chosen in Q2 (not regex) — `.trim()` absorbs any trailing `\r` from Windows CRLF.

## Alternatives considered (and rejected)

| Alternative | Why rejected |
|-------------|--------------|
| Per-tool stdout-pattern overrides | Out of scope per spec.md. A single global anchored `Error:` prefix check is sufficient for v0.1; per-tool overrides would be premature generality before evidence of CLI subcommands using divergent prefixes. |
| Localised prefix detection | Out of scope. The CLI's documented format is the English `Error:` prefix; non-English builds are unverified and would require their own evidence-gathering pass. |
| Splitting the contract into per-feature files (`specs/002/contracts/errors.contract.md`) | Rejected by Q5 clarification — would fragment the canonical reference and force readers to consult two files for one error model. |
| Promoting the contract to a project-level location (`specs/contracts/errors.md`) | Deferred (Q5). Right *eventual* answer once the contract grows beyond ~10 codes; over-engineering at the v0.2 stage. |
| Adding a CHANGELOG/migration FR with semver-bump-mandatory wording | Rejected by Q3 — this is defect repair, not contract change. v0.1 misbehavior was never the contract. |
| Auditing all four other `CLI_*` rows for table-vs-prose drift | Rejected by Q4 — minimal in-scope discipline. FR-014 fixes only `CLI_NON_ZERO_EXIT`. Future contract-hygiene PFI can take the broader audit. |
| Adding a runtime zod schema for `UpstreamError.details` payloads | Out of scope. `UpstreamError` is a class with read-only fields; runtime payload validation would only catch implementation bugs and would itself be untested boundary code (Principle III applies to *input* validation, not internal-error construction). |
| Using a regex (`/^\s*Error:/`) instead of `trimStart() + startsWith("Error:")` | Equivalent semantics, but the non-regex form is cheaper, easier to reason about, and matches the Q2 algorithm's spirit of using only `String.prototype` methods. |
| Detecting on stderr instead of (or in addition to) stdout | Out of scope — the empirical observation is unambiguously stdout-only. The CLI uses stderr for nothing in the three observed failure modes. |

## Open questions

None. The Phase 1 design proceeds against a fully-clarified spec.
