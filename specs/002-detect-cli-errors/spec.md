# Feature Specification: Detect CLI Errors

**Feature Branch**: `002-detect-cli-errors`
**Created**: 2026-05-03
**Status**: Draft
**Input**: User description: "Detect CLI Errors — Patch the obsidian_exec bridge tool to detect the Obsidian CLI's `Error: …` stdout-prefix failure signal and re-route those responses to a structured UpstreamError, closing the spec-vs-reality gap on BI-001's acceptance criterion #6."

## Background *(non-mandatory context)*

During acceptance testing of feature 001-add-cli-bridge on 2026-05-03, the bridge was empirically confirmed to misclassify a class of upstream failures as success. The Obsidian Integrated CLI does not use process exit codes to discriminate application-level failures from successful invocations: it exits `0` for at least three independently-reproducible failure modes — unknown-command, file-not-found, and `eval` that throws — and emits the failure message on **stdout** with a leading `Error:` prefix. The bridge's existing `CLI_NON_ZERO_EXIT` path therefore never fires for any of these, and callers receive `{ stdout: "Error: …", stderr: "", exitCode: 0 }` framed as a successful result. This spec patches that gap by introducing a stdout-prefix check on the success path and a new stable error code, `CLI_REPORTED_ERROR`, so application-level CLI failures surface as structured `UpstreamError`s the way every other upstream failure does.

## Clarifications

### Session 2026-05-05

- Q: Should `details.exitCode` be part of `CLI_REPORTED_ERROR`? → A: Include `exitCode: 0` in `details`; FR-003, SC-004, and Story 1 AC #1 amended for consistency with FR-004.
- Q: Precise algorithm for "trimmed first line of stdout" in `details.message`? → A: `stdout.split('\n', 1)[0].trim()` — LF-only split, full whitespace trim on both ends (any stray `\r` from Windows CRLF is absorbed by `.trim()`). Pinned in FR-003; CRLF edge case added.
- Q: Is `CLI_REPORTED_ERROR` a breaking change to the v0.1 contract? → A: No — defect repair, not a contract change. v0.1 misbehavior (success-shaped responses for CLI-reported failures) was never the contract; ordinary release notes suffice. No migration FR added.
- Q: Should this feature also fix the `CLI_NON_ZERO_EXIT` table gap in `errors.contract.md`? → A: Yes (minimal). Add the missing `details.exitCode` and `details.signal` rows to the `CLI_NON_ZERO_EXIT` table to match its existing prose at line 106 (which already states these mirror `cause.*`). New FR-014 added; other codes untouched.
- Q: Where should `errors.contract.md` live as feature 002 lands? → A: Edit in place at `specs/001-add-cli-bridge/contracts/errors.contract.md`. No file moves; future features keep extending this file until it warrants promotion to a project-level home. FR-008 and FR-014 already read as in-place edits — no further FR change needed.
- Q: Should this feature also add `VALIDATION_ERROR` and `TOOL_NOT_FOUND` rows to `errors.contract.md`? → A: Yes — same precedent as Q4 of session 1 (fix table-vs-source-of-truth drift in the same file FR-008 already opens). Both codes are live in `src/tools/obsidian_exec/tool.ts:50,61` and documented in `README.md:113-114` but absent from the canonical contract. New FR-015 added.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Surface upstream CLI-reported failures as structured errors (Priority: P1)

When the underlying `obsidian` CLI exits cleanly (`exitCode: 0`) but writes a leading `Error:` token to stdout — its documented format for application-level failures — the bridge does not return that response to the caller as a success. Instead, the bridge raises a structured `UpstreamError` with the new stable code `CLI_REPORTED_ERROR`, preserving the original argv, stdout, stderr, the truthful `exitCode: 0`, and a parsed `message` (the trimmed first line of stdout) in `details` for diagnostic completeness. Callers that previously had to peek inside `stdout` to guess at success vs. failure now get the same `try`/`catch`-shaped error contract the rest of the bridge uses.

**Why this priority**: This is the entire reason for the spec. Until the bridge reroutes these responses, an autonomous agent cannot tell apart a successful empty-result query from a real CLI-level failure — the current behaviour silently misreports failures, which is the worst-possible failure mode for an LLM acting on the response. Without P1, the bridge's error contract is broken for the most common class of CLI failure observed in the wild.

**Independent Test**: With the bridge running and Obsidian 1.12+ on the host, an MCP client invoking `obsidian_exec({ command: "nonexistent_command_xyz" })` receives an `UpstreamError` whose `code` is `"CLI_REPORTED_ERROR"`, whose `cause` is `null`, and whose `details` preserves `argv`, `stdout` (containing `"Error: Command \"nonexistent_command_xyz\" not found.\n"`), `stderr` (empty), `exitCode: 0`, and `message` (the trimmed first line of stdout). No other story needs to exist for this fix to be demonstrably valuable.

**Acceptance Scenarios**:

1. **Given** the bridge is running, **When** the client calls `obsidian_exec({ command: "nonexistent_command_xyz" })` and the CLI exits `0` with stdout starting `Error: Command "nonexistent_command_xyz" not found.`, **Then** the bridge raises `UpstreamError` with `code: "CLI_REPORTED_ERROR"`, `cause: null`, and `details: { argv, stdout, stderr, exitCode: 0, message }` where `message` equals `"Error: Command \"nonexistent_command_xyz\" not found."`.
2. **Given** the bridge is running, **When** the client calls `obsidian_exec({ command: "read", parameters: { path: "this/does/not/exist.md" } })` and the CLI exits `0` with stdout starting `Error: File …`, **Then** the bridge raises `UpstreamError` with `code: "CLI_REPORTED_ERROR"` and `details.message` equal to the trimmed first line of stdout (the `Error: File …` text preserved verbatim).
3. **Given** the bridge is running, **When** the client calls `obsidian_exec({ command: "eval", parameters: { code: "throw new Error('test')" } })` and the CLI exits `0` with stdout starting `Error:` (the rendered exception), **Then** the bridge raises `UpstreamError` with `code: "CLI_REPORTED_ERROR"` and `details` preserving the full stdout, the empty stderr, and the parsed first-line `message`.
4. **Given** any of the three failure modes above, **When** the bridge raises `CLI_REPORTED_ERROR`, **Then** `details.argv` is the same fully-reproducible argv vector that the bridge would have returned on success (binary as `argv[0]`), `details.stdout` is the full captured stdout unchanged, and `details.stderr` is the full captured stderr unchanged — preserving every byte that arrived from the CLI for caller-side diagnosis.

---

### User Story 2 - Avoid false positives on legitimate output that mentions "Error:" (Priority: P1)

The detection logic must trigger only when stdout's leading non-whitespace token is the literal string `Error:`. Output that contains `Error:` further inside its body — most importantly, search results whose matched files happen to contain that text — must continue to be returned as success. The detection is an anchored, leading-position, case-sensitive check, not a substring search.

**Why this priority**: P1 alongside Story 1, not P2, because a false positive that turns a legitimate search hit into an `UpstreamError` is just as broken as a false negative that swallows a real failure. Both must hold simultaneously for the fix to be net-positive over the v0.1 baseline.

**Independent Test**: With the bridge running, calling `obsidian_exec({ command: "search", parameters: { query: "Error:" } })` against a vault that contains notes mentioning "Error:" still returns a success-shaped response — `{ stdout, stderr, exitCode: 0, argv }` — because the CLI's search output is a JSON-formatted matches array whose leading characters are not `Error:`. Independently, calling `obsidian_exec({ command: "version" })` continues to succeed cleanly because the version-string output does not start with `Error:`.

**Acceptance Scenarios**:

1. **Given** the bridge is running and the host vault contains notes whose text includes `Error:`, **When** the client calls `obsidian_exec({ command: "search", parameters: { query: "Error:" } })` and the CLI returns a JSON matches array on stdout (which may itself include the literal text `Error:` inside matched-file excerpts), **Then** the bridge returns the success shape with `exitCode: 0` — no `UpstreamError` is raised — because stdout's leading non-whitespace token is the JSON `[`/`{` opener, not `Error:`.
2. **Given** the bridge is running, **When** the client calls `obsidian_exec({ command: "version" })` and the CLI emits its version string on stdout with `exitCode: 0`, **Then** the bridge returns the success shape unchanged. No false positive is triggered because the version output does not begin with `Error:`.
3. **Given** the bridge is running, **When** the CLI emits stdout that contains `Error:` somewhere after the first non-whitespace token (anywhere later in the body, including the start of any non-first line), **Then** the bridge returns the success shape — the detection is anchored to the start of stdout, not a substring search anywhere within it.
4. **Given** the bridge is running, **When** the CLI emits stdout whose first non-whitespace characters are `error:` (lowercase) or any other casing variant of the word, **Then** the bridge returns the success shape — the detection is case-sensitive and matches only the exact prefix `Error:` documented by the CLI.

---

### User Story 3 - Preserve the existing genuine-crash error path (Priority: P2)

The pre-existing `CLI_NON_ZERO_EXIT` code continues to fire — and only fires — when the spawned `obsidian` child actually exits with a non-zero exit code (a true process-level crash, signal-induced termination, or anything the OS reports as non-zero). It is no longer used to represent application-level CLI failures (those now route to `CLI_REPORTED_ERROR`). The two codes carve up the failure space cleanly: `CLI_NON_ZERO_EXIT` for process-level non-zero exits, `CLI_REPORTED_ERROR` for application-level failures the CLI signalled in-band on stdout.

**Why this priority**: P2 because it's a backward-compatibility invariant rather than the fix itself — the new code adds capability, but it must not subtract from the existing one. Callers that pattern-matched on `code === "CLI_NON_ZERO_EXIT"` for genuine crashes continue to work; only the previously-misclassified application-level failures change shape.

**Independent Test**: With a synthetic CLI substitute that exits `1` with stderr `boom`, calling `obsidian_exec({ command: "version" })` raises `UpstreamError` with `code: "CLI_NON_ZERO_EXIT"` (not `CLI_REPORTED_ERROR`) — confirming the historical code path is still reachable.

**Acceptance Scenarios**:

1. **Given** the bridge is running and the spawned child exits with a non-zero exit code, **When** the call completes, **Then** the bridge raises `UpstreamError` with `code: "CLI_NON_ZERO_EXIT"` exactly as before — `CLI_REPORTED_ERROR` is never returned for non-zero exits, regardless of stdout content.
2. **Given** the bridge is running and the child exits non-zero with stdout that happens to start with `Error:`, **When** the call completes, **Then** the bridge raises `CLI_NON_ZERO_EXIT` (not `CLI_REPORTED_ERROR`). Exit-code precedence: a non-zero exit is always classified by exit code first, regardless of stdout's leading bytes.

---

### Edge Cases

- **Empty stdout, exit code 0**: returned as success — there is no leading non-whitespace token to match `Error:` against, so the detection does not fire.
- **Stdout containing only whitespace**: returned as success — after trimming leading whitespace there is no remaining content to start with `Error:`.
- **Stdout `Error:` with no trailing message** (just the literal six characters and a newline): treated as `CLI_REPORTED_ERROR` — the prefix match is what triggers; `details.message` will be the trimmed first line, which in this case is the bare `Error:` string.
- **Stdout starts with leading whitespace then `Error:` on the same first line**: treated as `CLI_REPORTED_ERROR` — the documented behaviour is "after trimming leading whitespace, starts with `Error:`", which permits leading whitespace before the prefix.
- **Stdout starts with `Errors:` (plural) or `ERROR:` (uppercase) or `error:` (lowercase)**: returned as success — the detection is case-sensitive on the exact six-character prefix `Error:`. The CLI's documented format is the exact `Error:` casing; any deviation is treated as legitimate output.
- **Stdout's first line is `Error:` and subsequent lines contain a multi-line stack trace**: `details.message` is just the first line trimmed; the full multi-line stdout is preserved verbatim in `details.stdout` so the caller can still recover the trace.
- **`CLI_OUTPUT_TOO_LARGE` and `CLI_TIMEOUT` interactions**: those error paths take precedence and short-circuit the detection — if the bridge has already killed the child for output overflow or timeout, no exit-0 success path runs and no stdout-prefix check happens.
- **`CLI_BINARY_NOT_FOUND`**: also short-circuits — no child process ran, so there is no stdout to inspect.
- **Search results containing the literal text `Error:` inside matched-file excerpts**: returned as success — the JSON-formatted matches array does not start with `Error:` even when it contains it, so the anchored prefix check correctly leaves the result alone.
- **Stdout uses Windows CRLF line endings (`Error: foo\r\n`)**: `details.message` is `"Error: foo"` — the `stdout.split('\n', 1)[0].trim()` algorithm yields `"Error: foo\r"` from the split, then `.trim()` absorbs the trailing `\r`. Test fixtures on Windows hosts that exercise this code path MUST account for the absorbed `\r`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The bridge MUST, after the existing spawn-and-collect step in the `obsidian_exec` handler, when the child has exited with code `0`, additionally inspect the captured stdout. When stdout — after trimming any leading whitespace — starts with the literal six-character string `Error:` (case-sensitive), the bridge MUST raise an `UpstreamError` with `code: "CLI_REPORTED_ERROR"` instead of returning the success shape.
- **FR-002**: The `CLI_REPORTED_ERROR` `UpstreamError` MUST be constructed with `cause: null` (no underlying thrown value exists — the CLI did not throw, the bridge re-routed the response).
- **FR-003**: The `CLI_REPORTED_ERROR` `details` payload MUST be a structured record containing `argv` (the same fully-reproducible argv vector that would have been returned on success, binary as `argv[0]`), `stdout` (the full captured stdout unchanged), `stderr` (the full captured stderr unchanged, preserved for diagnostic completeness), `exitCode` (the truthful `0` the child exited with — see FR-004), and `message` (the trimmed first line of stdout — convenience field for callers that want a one-line summary without parsing). The precise algorithm for `message` is `stdout.split('\n', 1)[0].trim()` — split stdout on the first `\n`, take the first segment, then apply `String.prototype.trim()` to both ends (which absorbs any trailing `\r` from Windows CRLF line endings as well as leading whitespace before the `Error:` prefix).
- **FR-004**: The `CLI_REPORTED_ERROR` `details.exitCode` field MUST be the truthful `0` value the child process exited with — the CLI did exit zero, and that fact MUST be discoverable from the error for callers who need to distinguish it from `CLI_NON_ZERO_EXIT` without re-parsing other fields.
- **FR-005**: The detection logic MUST be anchored to the start of the trimmed stdout, not a substring search anywhere within it. Output containing `Error:` later in its body MUST be returned as success.
- **FR-006**: The detection logic MUST be case-sensitive on the exact six-character prefix `Error:`. Lowercase `error:`, uppercase `ERROR:`, plural `Errors:`, and any other casing or wording MUST NOT trigger.
- **FR-007**: The bridge's existing `CLI_NON_ZERO_EXIT` path MUST be preserved unchanged for the genuine non-zero-exit case. Exit-code precedence applies: a non-zero exit MUST always be classified as `CLI_NON_ZERO_EXIT` regardless of stdout's leading bytes — the new stdout-prefix check runs only on the exit-zero branch.
- **FR-008**: The new stable error code `CLI_REPORTED_ERROR` MUST be added to the project's stable error-code list documented in `contracts/errors.contract.md` alongside `CLI_NON_ZERO_EXIT`, `CLI_BINARY_NOT_FOUND`, `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`, `VALIDATION_ERROR`, and `TOOL_NOT_FOUND`.
- **FR-009**: The `obsidian_exec` tool's MCP-exposed description MUST be updated to mention `CLI_REPORTED_ERROR` so MCP clients discovering the tool's contract see all reachable error codes.
- **FR-010**: Tests for the new behaviour MUST be co-located with the `obsidian_exec` handler module under `src/tools/obsidian_exec/` per Constitution Principle II, using the project's existing vitest setup. The test set MUST include: (a) a happy-path version-success case asserting no false positive, (b) a failure-path nonexistent-command case asserting `CLI_REPORTED_ERROR` is raised with the expected `details`, (c) a failure-path file-not-found case (read of a missing path) asserting `CLI_REPORTED_ERROR`, (d) a failure-path eval-throws case asserting `CLI_REPORTED_ERROR`, and (e) a boundary-path search-returning-results-containing-`Error:`-text case asserting success is still returned (no false positive on body-internal occurrences).
- **FR-011**: The README error-codes table MUST be updated with a `CLI_REPORTED_ERROR` row including the trigger condition (CLI exits `0` with stdout that, after leading-whitespace trim, starts with `Error:`) and the key `details` fields (`argv`, `stdout`, `stderr`, `exitCode`, `message`).
- **FR-012**: The vitest coverage threshold in `vitest.config.ts` MUST remain at or above the v0.1 floor (84.3% statements). The new tests MUST NOT cause coverage to drop below the existing merge gate.
- **FR-013**: The bridge's structured logging MUST treat a `CLI_REPORTED_ERROR` outcome as a call-end event with the failure-shaped log line — consistent with how the other `UpstreamError` codes are logged today — so operators tailing the stderr log stream can see CLI-reported failures distinct from successful calls.
- **FR-014**: The `CLI_NON_ZERO_EXIT` row in `contracts/errors.contract.md` MUST be reconciled with its existing prose (line 106 of the v0.1 contract states `details.exitCode` mirrors `cause.exitCode`, but the table omits it). The table MUST be updated to list `details.exitCode` (`number` — the non-zero exit code) and `details.signal` (`string | null` — the terminating signal if any). This is a minimal in-scope fix: no other code's table is audited or modified. Rationale: `cause` is dropped during MCP serialization (per the contract's own line 106 prose), so MCP clients cannot see the exit code unless `details.exitCode` is part of the published shape — and SC-003 ("callers can determine, from the error alone, whether a failure was process-level vs CLI-reported") depends on it.
- **FR-015**: Two existing live error codes — `VALIDATION_ERROR` and `TOOL_NOT_FOUND` — MUST be added as new rows in `specs/001-add-cli-bridge/contracts/errors.contract.md`'s "Codes registered by `obsidian_exec`" section. Both codes are emitted today by `src/tools/obsidian_exec/tool.ts` (`TOOL_NOT_FOUND` at line 50, `VALIDATION_ERROR` at line 61) and documented in the README error-codes table at lines 113–114, but were never added to the canonical contract. The new rows MUST mirror the implementation: `VALIDATION_ERROR` with `cause: ZodError`, `details.issues` (`Array<{ path: (string | number)[], message: string, code: string }>` — the `ZodError.issues[]` projected to a JSON-serializable subset); `TOOL_NOT_FOUND` with `cause: null`, `details.requestedName` (`string`), `details.knownTools` (`string[]`). Same minimal-in-scope discipline as FR-014: only these two codes are added; no other audit. Rationale: same as FR-014 — SC-003 ("callers can determine failure type from `code` alone") presupposes the contract enumerates all reachable codes, and FR-008 already names these two as peers of `CLI_REPORTED_ERROR`.

### Out of Scope

The following are explicitly excluded from this feature:

- **Per-tool customisation of which stdout patterns count as errors**: detection is a single global anchored `Error:` prefix check. Individual CLI subcommands that may use different error-message formats (if any are discovered later) are tracked separately; this spec does not provision a per-tool override mechanism.
- **Localisation**: the Obsidian CLI's documented error format is the English `Error:` prefix. Non-English Obsidian builds may emit different prefixes (unverified at the time of this spec). If localised builds surface this, it will be tracked as a future PFI; this spec is English-prefix-only.
- **Retroactive re-wording of feature 001-add-cli-bridge's acceptance criterion #6**: that criterion stays on the historical record. This feature is the canonical fix for the gap it left open; the historical text is not edited.

### Key Entities *(include if data involved)*

- **`CLI_REPORTED_ERROR` (new stable error code)**: A new member of the `UpstreamError.code` enumeration shared across the project. Triggered when the CLI exits `0` but signals an application-level failure in-band on stdout via its documented `Error:` prefix. The `details` payload preserves `argv`, `stdout`, `stderr`, `exitCode: 0`, and a parsed `message` (trimmed first line of stdout). `cause` is `null`. Co-equal in the error-code namespace with the existing codes (`CLI_NON_ZERO_EXIT`, `CLI_BINARY_NOT_FOUND`, `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`, `VALIDATION_ERROR`, `TOOL_NOT_FOUND`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the three empirically-confirmed CLI-reported failure modes (unknown-command, file-not-found, eval-throws) reproduce as `UpstreamError` with `code: "CLI_REPORTED_ERROR"` after this feature ships, where the v0.1 baseline returned them as `{ stdout: "Error: …", stderr: "", exitCode: 0 }` success shapes.
- **SC-002**: 0 false positives on the verified non-error baseline calls — `version`, `help`, and the `search` query containing the literal text `Error:` continue to return the success shape unchanged.
- **SC-003**: Callers can determine, from the error alone (without re-reading stdout), whether a failure was a process-level non-zero exit (`code: "CLI_NON_ZERO_EXIT"`) or an application-level CLI-reported failure (`code: "CLI_REPORTED_ERROR"`) — the two codes are non-overlapping and exhaustively cover the union of "failure modes that previously confused the bridge."
- **SC-004**: 100% of `CLI_REPORTED_ERROR` instances preserve `argv`, `stdout`, `stderr`, `exitCode: 0`, and a parsed `message` in `details` — verifiable by structurally asserting the `details` shape in the co-located vitest cases.
- **SC-005**: Test-suite coverage on `vitest.config.ts`'s configured statement metric remains at or above the v0.1 floor of 84.3% — the merge-gate threshold does not regress as a result of this feature.
- **SC-006**: The README and `contracts/errors.contract.md` both list `CLI_REPORTED_ERROR` with its trigger condition and `details` fields — verifiable by spec inspection.

## Assumptions

- **CLI prefix is the documented `Error:` exactly**: the empirical reproduction on 2026-05-03 across three independent failure modes consistently used the six-character English `Error:` prefix. We assume this remains the CLI's documented format for application-level failures and do not provision for variants in this feature.
- **Stdout-prefix is the only in-band failure signal worth catching in v0.1**: the empirical evidence covers only failures the CLI exits `0` for. Any failure that would manifest as a non-zero exit code is already covered by the existing `CLI_NON_ZERO_EXIT` path; this spec adds a sibling code rather than overhauling that one.
- **Search results never lead with `Error:`**: the CLI's search subcommand emits a JSON-formatted matches array (verified leading character is `[` or `{`), so the anchored prefix check cannot collide with search results that contain `Error:` inside matched-file excerpts. If a future CLI subcommand emits stdout that legitimately leads with `Error:` for a non-failure reason, this assumption breaks and a follow-up PFI would need to revisit detection scope.
- **Constitution Principle IV (`UpstreamError` is the single boundary error type) continues to bind**: the new code is a member of that type's `code` enumeration, not a new error class — the existing `UpstreamError` shape and constructor signature are reused unchanged.
- **No retroactive change to feature 001-add-cli-bridge's acceptance criteria**: that document is treated as historical; this spec is the canonical record of the fix.
