# Research: Append Note (Phase 0)

**Branch**: `044-append-note` | **Date**: 2026-05-25
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This document resolves the Technical Context unknowns flagged in plan.md and pins the design decisions that the wrapper's structure depends on. Each finding records the **Decision** taken, the **Rationale**, and the **Alternatives Considered**.

## R1 — Pipeline choice: fs-direct via ADR-009; tool name `append_note` (ADR-010 N/A)

**Decision**: Implement `append_note` as an fs-direct read-modify-write operation through the existing ADR-009 substrate (vault-registry resolution → two-layer path safety → `fs.readFile` to load existing content → in-memory separator-decide-and-concatenate → `fs.writeFile` to `.tmp` → `fs.rename` → `metadataCache` invalidation eval). The native upstream `obsidian append` subcommand is NOT wrapped — append semantics are re-implemented in TS using the cohort's existing substrate. Tool name `append_note` follows the cohort's descriptive-name convention for fs-direct write tools (cohort: `write_note`, `patch_heading`, `patch_block`).

**Rationale**: This is the load-bearing pipeline decision the user's spec explicitly deferred to the plan phase ("the contract is observable behaviour and a documented size ceiling, not the choice of pipeline"). Three factors drive the fs-direct choice:

1. **User-controlled content size + BI-0038 Windows argv defect**: The `content` parameter carries arbitrary text the caller wants to append — unbounded in principle. The cohort's CLI-wrap path (via `invokeCli` → `dispatchCli`) assembles the argv as `[binary, vault=…, command, content=<text>, …]`; any single argv element exceeding ~4 KB on Windows deterministically crashes Obsidian's main process per BI-0038. The `write_note` handler header comment codifies the cohort discipline: "User content NEVER crosses the CLI argv pipe at any size (FR-005, SC-007)." `append_note` carries the same user-controlled-content shape as `write_note`'s `content`, and the cohort discipline applies identically.

2. **Cohort parity with the write-side family**: Every cohort write-side typed tool that handles user-controlled content payloads is fs-direct: `write_note` (ADR-009), `patch_heading` (BI-040 fs-direct), `patch_block` (BI-043 fs-direct). The only CLI-wrap write tool in the cohort is `set_property`, whose `value=` payload is structurally small (property values, not free-form note content). `append_note` belongs to the user-controlled-content cohort and inherits its discipline.

3. **Full control over FR-006a byte-level semantics**: FR-006a (settled at Clarifications) requires the wrapper to inspect the file's existing trailing byte (`\n` / `\r\n` / non-newline) and decide whether to insert a separator. CLI-wrapping the upstream `append` subcommand surrenders this decision to the upstream's `inline` flag — which, per the upstream's published parameter shape, is a single boolean (`inline` present → no separator; `inline` absent → separator is "always-inserted"). FR-006a's "the existing trailing newline IS the separator" rule cannot be expressed through the upstream's single-boolean surface; the wrapper must either (a) layer its own pre-check that flips the upstream's `inline` flag based on the file's last byte, or (b) implement the append in TS directly. Option (b) is strictly simpler and avoids the awkward "upstream flag whose value is computed by reading the file the upstream is about to write to" round-trip.

**ADR-010 analysis**: ADR-010 mandates that typed tools WRAPPING upstream subcommands MUST mirror the subcommand name. fs-direct re-implementations are out of ADR-010's scope. Cohort precedent: `write_note` is N/A on ADR-010 for exactly the same reason (the upstream `create` subcommand exists but `write_note` doesn't wrap it). Tool name `append_note` follows the cohort's descriptive-name convention for fs-direct write tools.

**Spec assumption refinement**: The spec scaffold's Assumption "Tool name follows ADR-010" was conditional on choosing the CLI-wrap path. The plan-phase decision to go fs-direct narrows that Assumption — ADR-010 flips from applies to N/A, and the tool name flips from `append` to `append_note`. The user's explicit out-of-scope statement ("the plan phase chooses the pipeline; the spec describes what the caller sees") authorises this refinement; the spec's contract surface (FR-001 through FR-027) is unchanged.

**Alternatives Considered**:
- **CLI-wrap the upstream `obsidian append` subcommand (tool name `append`)**: rejected for the three reasons above — argv-defect exposure, cohort divergence from the write-side family, and inability to express FR-006a's byte-level rule through the upstream's single `inline` boolean.
- **Hybrid: CLI-wrap for small content, fs-direct for large content**: rejected — introduces two code paths with two different test surfaces; the threshold ("small" vs "large") would have to be a settled wrapper-published number that the BI-0038 defect's exact threshold doesn't justify (the defect's ~4 KB number is empirical and platform-dependent); the threshold itself would have to surface in callers' contracts as a leaky abstraction. The simpler "always fs-direct" path is the cohort default.
- **CLI-wrap with pre-check that reads the file's last byte to decide the `inline` flag**: rejected — the wrapper still has to read the file (substrate access) and the resulting "CLI-wrap with pre-read" is strictly more expensive than fs-direct (extra spawn, extra IPC round-trip, dependency on upstream's separator-insertion behaviour matching FR-006a in EVERY edge case the wrapper publishes).
- **Tool name `append` (mirror upstream subcommand even though the wrapper is fs-direct)**: rejected — ADR-010 cohort precedent (write_note doesn't mirror `create` despite that subcommand existing) is unambiguous; the descriptive-name convention for fs-direct write tools is cohort-consistent and avoids the mental model trap of "tool name suggests CLI-wrap but implementation is fs-direct."

## R2 — Default-separator and inline-opt-in semantics: `append-edit.ts` pure helper

**Decision**: The append operation is a pure function `appendEdit(existing: string, content: string, inline: boolean): string` that returns the post-edit file content. Algorithm:

```
appendEdit(existing, content, inline):
  if inline === true:
    return existing + content        # FR-007, regardless of existing tail; preserves verbatim content per FR-010a
  if existing.length === 0:
    return content                    # FR-009, 0-byte file → no leading separator; preserves verbatim content per FR-010a
  if existing endsWith "\r\n":
    return existing + content         # FR-006a, existing CRLF IS the separator; preserves CRLF convention per FR-008
  if existing endsWith "\n":
    return existing + content         # FR-006a, existing LF IS the separator; preserves LF convention per FR-008
  # File ends on a non-newline character — insert separator matching the note's existing convention
  separator = detectLineEnding(existing)    # "\r\n" if any CRLF present, "\n" otherwise (cohort-standard heuristic)
  return existing + separator + content     # FR-006, default-separator insertion
```

`detectLineEnding(existing)` scans for the first newline in the file and reports `"\r\n"` if it's preceded by `\r`, `"\n"` otherwise. For files with no newlines at all (single-line files with no trailing newline), defaults to `"\n"` (POSIX convention) — Windows-only authors who want CRLF preservation get it as soon as the file contains one newline, which is the dominant case after the first append.

**Rationale**: FR-006 / FR-006a / FR-007 / FR-008 / FR-009 / FR-010 / FR-010a are all expressible in this ~10-line pure function. Cohort parity with `patch_heading`'s `body-edit.ts` and `patch_block`'s `block-edit.ts` (both pure functions, both byte-stability-preserving, both in-tree per the Dependencies rule's in-tree bias). The function is trivially testable as a table-driven pure-function suite (every input shape × every output shape) without any fs or process mocking.

The CRLF detection heuristic ("first newline wins") matches the cohort's existing line-ending preservation lineage in `patch_heading` and `patch_block`. A more rigorous "majority-wins" heuristic was considered and rejected as needlessly defensive — files with mixed line endings are pathological, and either rule produces a deterministic output that preserves the user-facing FR-008 contract.

**Alternatives Considered**:
- **Always insert `"\n"` regardless of file's existing line-ending convention**: rejected — breaks FR-008's "preserve existing line-ending convention" rule; a CRLF-convention file would gain an LF separator after the first append, producing a mixed-line-ending file that downstream tooling (Windows editors, diff tools, line-counting tools) handles inconsistently.
- **Detect line ending by counting majority of newlines in the file**: rejected as overkill — adds O(N) extra pass on the file content; the "first-newline-wins" rule is O(M) where M = position of first newline, typically <100 bytes; the heuristic difference matters only for pathological mixed-ending files.
- **Read the trailing 16 bytes only (cost optimisation)**: rejected — the substrate already reads the whole file (FR-010 requires preserving prior content byte-stably, which requires loading it); a trailing-byte-only optimisation would force a second read for the separator decision.

## R3 — Size ceiling: substrate-bounded (effectively unbounded for realistic notes), documented in help text

**Decision**: The wrapper publishes NO explicit content-size cap in the input schema. The effective ceiling is whatever the fs substrate accepts — for the Node.js `fs.readFile` / `fs.writeFile` path, this is bounded by available memory and the underlying filesystem's max-file-size limit (typically 2 TB on modern filesystems, 4 GB on FAT32, 16 EB on NTFS / ext4 / APFS). The tool's published help text states: "Content size is bounded by available memory and the filesystem's max-file-size limit. For realistic notes (≤ 100 MB), no caller-visible ceiling applies; the wrapper does not impose its own cap."

If a future BI surfaces a need for an explicit ceiling (e.g. to protect against accidental multi-GB payloads from a runaway agent loop), the schema layer can add a `z.string().max(N)` refinement and the contract surfaces as `VALIDATION_ERROR` + `details.code: "CONTENT_TOO_LARGE"` + `details.reason: "exceeds-cap"` — but no such ceiling is added in this BI's first cut.

**Rationale**: The user's spec explicitly defers the size-ceiling value to the plan phase (FR-017: "exact value... is settled at the plan phase and codified in the tool's published help text"). The plan-phase pipeline decision (R1: fs-direct) removes the BI-0038 argv-defect motivation for an aggressive cap; the substrate's natural limits (memory + filesystem) become the effective ceiling. The cohort precedent matches: `write_note`'s `content` field has no size cap in its schema (`z.string()` with no `.max()`), and the cohort has shipped fifteen+ tools under that discipline without an "agent shipped a multi-GB payload" incident. Following the cohort's established discipline is the conservative choice; adding a speculative cap would be premature optimisation.

The help text's explicit statement ("Content size is bounded by available memory and the filesystem's max-file-size limit. For realistic notes (≤ 100 MB), no caller-visible ceiling applies; the wrapper does not impose its own cap.") satisfies FR-017's "callers can predict the limit ahead of time" requirement — the prediction is "your filesystem / available memory."

**Alternatives Considered**:
- **Explicit cap at 1 MB / 10 MB / 100 MB**: rejected as premature optimisation. No cohort BI has hit a content-size-related incident; introducing a cap creates a caller-visible limit that callers then have to work around (chunking) without a documented need.
- **Explicit cap at the BI-0038 argv ceiling (~4 KB)**: rejected — the BI-0038 ceiling is an argv-pipe property; fs-direct sidesteps it entirely. Imposing the argv ceiling on the fs-direct path would surrender the entire reason for going fs-direct.
- **Cohort-uniform 1000 UTF-16 code-unit cap (parity with locator inputs)**: rejected — the locator cap (1000 chars) is a defensive bound on identifier-shaped fields, not content-shaped fields. Treating note content as identifier-shaped would be a category error.

## R4 — Active mode: no explicit-opt-in flag (cohort exception per FR-004a, settled at Clarifications)

**Decision**: The active-mode pre-write path has no explicit-opt-in field requirement. A valid active-mode call is:

```json
{ "target_mode": "active", "content": "...", "inline": false /* optional, default false */ }
```

The cohort's `write_note` requires `overwrite: true` in active mode (per its schema's superRefine layer); `append_note` deliberately does NOT inherit that requirement.

**Rationale**: Settled by Clarifications Session 2026-05-25 (Q3). The asymmetric safety profile justifies the asymmetric opt-in posture: `write_note` replaces the focused note's entire prior content (wrong-target = total destruction of prior content, unrecoverable from inside the tool surface), whereas `append_note` only adds bytes at end-of-file (wrong-target = additive noise at the end of an unintended note, recoverable by reading the appended tail and removing it). Requiring an opt-in flag would impose ergonomic friction on the dominant authoring case (rapid in-editor journaling, list growth, table-row addition against the focused note) without a matching safety benefit.

The asymmetry is documented in the active-mode schema layer as a one-line comment noting the deliberate cohort exception and pointing at FR-004a + Clarifications.

**Alternatives Considered**: Rejected at Clarifications — see Clarifications Session 2026-05-25 Q3 for the full Q&A record and the rejected alternatives (strict cohort parity / conditional opt-in tied to inline). The plan-phase outcome is identical to the clarify-phase decision.

## R5 — Missing-target classification: NOTE_NOT_FOUND mapped from fs.readFile ENOENT

**Decision**: The handler attempts `fs.readFile(absPath, "utf8")` early in the read-modify-write cycle. ENOENT from this call surfaces as `UpstreamError({ code: "CLI_REPORTED_ERROR", details: { code: "NOTE_NOT_FOUND", path: relPath, vault: input.vault ?? null }, … })`. No `fs.writeFile` is attempted on the ENOENT path — strictly satisfies FR-012 / FR-016 / FR-025 (no auto-create) and FR-023 (failed-loud = typed error is the only side effect).

The ENOENT detection is wrapped in a small `try/catch` around the `fs.readFile` call; other errno values (EACCES, EBUSY, EPERM) surface through the cohort's existing `mapFsError` helper as `FS_WRITE_FAILED` (cohort parity with `write_note`'s error map; the same map is reused unchanged).

**Rationale**: `NOTE_NOT_FOUND` is the cohort's existing discriminator for "the caller named a path that doesn't exist in the vault" — used by the read-side `read`, `read_heading`, `outline`, etc., and now by the write-side `patch_heading`, `patch_block`. Cohort reuse keeps the discriminator vocabulary uniform across read and write surfaces; callers that handle `NOTE_NOT_FOUND` from a `read` call need no new switch arm for `append_note`.

The detection happens at the FIRST fs operation (the read) rather than via a pre-flight `fs.access` check — pre-flight access is a TOCTOU racey approach (the file could be deleted between the access check and the read); using the read's natural ENOENT as the signal is race-free and matches the cohort's "fail at the first natural error point" discipline.

**Alternatives Considered**:
- **Pre-flight `fs.access(absPath, fs.constants.F_OK)` before reading**: rejected — TOCTOU racey; adds an extra syscall per call; cohort precedent uses the natural read-time ENOENT.
- **Use `fs.stat` instead of `fs.access`**: same TOCTOU + extra-syscall issue; rejected for the same reasons.
- **Surface ENOENT as `FS_WRITE_FAILED` (catch-all)**: rejected — `NOTE_NOT_FOUND` is a structurally meaningful sub-state (the caller's locator is wrong, not the filesystem permission), and the cohort's existing discriminator vocabulary already separates these cases. Conflating them would lose diagnostic value.

## R6 — Empty content rejection: schema-layer `z.string().min(1)` + new `CONTENT_EMPTY` details.code

**Decision**: The `content` field is `z.string().min(1)` at the schema layer. The empty-string rejection surfaces as the standard `VALIDATION_ERROR` envelope via Zod's `too_small` issue, augmented at the handler-layer with `details.code: "CONTENT_EMPTY"` for programmatic distinguishability per ADR-015. The wrapper does NOT need a `details.reason` because the state is single-valued (the only sub-state of CONTENT_EMPTY is "the supplied content was the empty string").

Implementation: the schema's `superRefine` block can add an explicit issue with a stable code string when `content === ""`, OR (simpler and cohort-aligned) the handler layer can intercept the Zod issue and re-wrap it as the UpstreamError. The plan defers the choice to T0 — both are zero-cost and the choice affects only the test surface, not the published contract.

**Rationale**: FR-013 is a hard validation rule (empty content is a no-op masquerading as an operation). Zod's `min(1)` enforces it at the schema layer before any filesystem access. The published `details.code` discriminator gives callers a programmatic switch ("did I supply empty content vs some other validation error?") without prose parsing.

This is the only new `details.code` value introduced by this BI. All other failure modes route through existing cohort discriminators (`NOTE_NOT_FOUND`, `EXTERNAL_EDITOR_CONFLICT`, `PATH_ESCAPES_VAULT`, `FS_WRITE_FAILED`, `VAULT_NOT_FOUND`, `ERR_NO_ACTIVE_FILE`). Constitution Principle IV's zero-new-top-level-codes streak is preserved; the nineteen-tool zero-new-codes count holds through this BI.

**Alternatives Considered**:
- **Accept empty content as a legitimate no-op**: rejected — surfacing empty-content as a typed validation error gives callers a clear signal that no work was requested and prevents the wrapper from invoking the fs substrate for nothing. Cohort discipline: every typed write tool surfaces "no work to do" cases as explicit validation errors rather than as silent success (cohort: `write_note` rejects empty `path`/`file`, `patch_heading` accepts empty content for `replace` mode per its FR-018a but rejects empty paths, `patch_block` accepts empty content for clear-the-body per its FR-008a, etc.). `append_note`'s empty content is unambiguously "no work" — there is no "clear" interpretation for an append operation.
- **No `details.code` — surface as raw Zod `too_small`**: rejected — Zod's `too_small` is a structural issue type, not a semantic one; callers can't programmatically distinguish "I sent empty content" from "I sent an empty `file` string" without parsing the issue path. The `CONTENT_EMPTY` discriminator gives a one-step programmatic check.

## R7 — Wikilink-form bracket rejection (FR-001a): file-field refinement, no new sub-code

**Decision**: The `file` field's Zod refinement composes the existing `isStructurallySafePath` check with a new bracket-rejection predicate: `(value) => !value.includes("[[") && !value.includes("]]")`. Violations surface as the standard `VALIDATION_ERROR` envelope via Zod's custom issue with the message "wikilink-form locator MUST NOT contain `[[` or `]]` brackets — supply the bare note name (e.g. `My Note` not `[[My Note]]`)."

No new `details.code` value is introduced. The cohort's existing `details.issues[].message` channel carries the structural-rejection message; programmatic callers can pattern-match the message OR (more robust) match the issue path (`["file"]`) AND the issue's `code: "custom"` discriminator to detect bracket rejection.

**Rationale**: Cohort parity with every existing `file`-parameter tool — none introduce per-character-rejection sub-codes; structural rejections surface through the shared `VALIDATION_ERROR` channel with the issue message naming the offence. Introducing a `details.code: "FILE_CONTAINS_BRACKETS"` value would create a one-off discriminator that no other cohort tool publishes, breaking cohort symmetry without diagnostic benefit (the issue message is already self-describing).

The `[[` / `]]` detection is character-level rather than regex-based — both are inexpensive O(N) string scans; character-level is simpler to read and trivially testable.

**Alternatives Considered**:
- **New `details.code: "FILE_CONTAINS_BRACKETS"`**: rejected for the cohort-symmetry reason above.
- **Reject ANY wikilink-syntax-flavour character (brackets + `|` for aliases + `#` for subpaths)**: rejected — `|` and `#` can appear in legal Obsidian note names. The conservative rule is "only reject the bracket characters that unambiguously signal the caller is reaching for wikilink syntax"; `|` and `#` are syntactically valid in note names and rejecting them would break legitimate inputs.
- **Trim brackets silently**: rejected at Clarifications (Q2) — see Clarifications Session 2026-05-25 Q2 for the full rejected-alternatives ledger.

## R8 — Output envelope echoes the locator (vault-relative path) per cohort write-side convention

**Decision**: The success response shape is:

```typescript
interface AppendNoteOutput {
  path: string;           // Vault-relative path of the note that was written
  vault: string;          // Vault display name (resolved from input.vault or active-mode eval)
  bytes_written: number;  // Total bytes the wrapper wrote in this call (post-edit file size minus pre-edit file size; useful for caller-side accounting)
  inline: boolean;        // Echo of the inline mode actually applied (helps callers confirm the intended mode landed)
}
```

The `path` field is ALWAYS the resolved vault-relative path, regardless of which locator shape the caller supplied (specific+path, specific+file, or active). FR-003 canonicalisation is satisfied here.

**Rationale**: Cohort parity with the write-side echo convention (`write_note` echoes `path`, `patch_heading` echoes `path` + `heading_path`, `patch_block` echoes `path` + `block_id` + `block_shape`). The `bytes_written` field is a one-line addition over the minimum cohort shape that gives callers a useful accounting hook (caller-side rate-limiting, total-bytes-per-session tracking) without inventing a new contract surface. The `inline` echo is a small confirmation hook — callers can detect schema-version drift if a future cohort change adds a new mode and the echo doesn't match what the caller expected.

The auto-memory entry `feedback_no_locator_echo_in_read_responses` captures the read-vs-write echo rule: read tools return data only; write tools echo the locator for write-verification. `append_note` is on the write side and echoes accordingly.

**Alternatives Considered**:
- **Minimum shape: just `path`**: rejected — `bytes_written` is cheap and useful; `vault` is needed for callers that operate against multiple vaults in a session.
- **Add `created: false` field (mirroring write_note's shape)**: rejected — `created` is always `false` for `append_note` (auto-create is out of scope per FR-012); publishing the field would just add noise to every success response.
- **Add `previous_size` / `new_size` fields**: rejected — `bytes_written` (the delta) is the more useful field; previous/new are derivable on the caller side if needed.

## R9 — Post-write metadataCache invalidation: cohort eval, best-effort, silent on failure

**Decision**: After a successful atomic rename, the handler invokes the cohort's standard `metadataCache.computeMetadataAsync(...)` eval via `invokeCli` to refresh Obsidian's in-memory file index. Failures are caught and silently swallowed — the write has already succeeded; cache freshness defers to Obsidian's own file-watcher.

This is byte-stable with `write_note`'s implementation:

```typescript
function buildInvalidateTemplate(absPath: string): string {
  return `(async()=>{const f=app.vault.getFileByPath(${JSON.stringify(absPath)});if(f)await app.metadataCache.computeMetadataAsync(f);})()`;
}
```

**Rationale**: Direct lift of `write_note` R-equivalent / handler line 41. Cohort default. Reusing the existing template keeps the cache-invalidation surface uniform — operationally, callers and observers (`outline`, `read_heading`, `find_by_property`, `links`, etc.) see freshly-appended content on the next call without needing a separate `reload` invocation.

Silent failure is the right policy because: (a) the write has already landed atomically on disk; (b) Obsidian's own file-watcher will pick up the change within ~1-2 seconds; (c) failing loud on cache-invalidation would surface a "the write succeeded but the cache is stale" error that callers cannot meaningfully act on.

**Alternatives Considered**: Same as `write_note`'s R-equivalent — invalidate-via-fs-event-only (slower, less reliable across platforms) and invalidate-via-full-vault-reload (heavy-handed) were both rejected by the cohort precedent.

## R10 — External-editor unsaved-changes detection: substrate-signalled only, inheriting BI-040 byte-stably

**Decision**: The wrapper does NOT implement its own cross-platform editor-state detection. It relies on the platform's natural `fs.rename` and `fs.open` error surfaces:

- **Windows**: `fs.rename` throws `EBUSY` (or `EPERM`) when the target is held open by a process without `FILE_SHARE_DELETE`. Most editors hold files with shared-read but not shared-delete. The wrapper catches and classifies as `EXTERNAL_EDITOR_CONFLICT` with `details.reason: "file-locked"`.
- **Linux / macOS**: `fs.rename` succeeds in the typical case (POSIX rename does not honour open file handles). The wrapper has no signal to fail on; the edit lands and the editor sees a refreshed file on next focus. Documented detection-capability caveat per FR-022.

`EXTERNAL_EDITOR_CONFLICT` `details.reason` enumeration (`"file-locked"`, `"unsaved-changes"`) is inherited byte-stably from BI-040 with no schema change.

**Rationale**: Direct lift of `patch_heading`'s R6 and `patch_block`'s R6. Cohort default. Reusing the existing enum keeps the `EXTERNAL_EDITOR_CONFLICT` cross-tool surface uniform — callers handling the error from `write_note` / `patch_heading` / `patch_block` need no new switch arms for `append_note`.

**Alternatives Considered**: Same as the cohort precedents (per-editor lock-file detection / pre-rename advisory open with `O_EXLOCK`) — both rejected as platform-divergent and not load-bearing for the cohort contract.

## R11 — Atomic write-temp-then-rename: cohort substrate, FR-021 inherited

**Decision**: The handler uses the cohort's atomic-rename pattern verbatim from `write_note`:

```typescript
const tmpPath = `${absPath}.${randomUUID()}.tmp`;
try {
  await fs.writeFile(tmpPath, newContent);
} catch (e) { /* mapFsError */ }
try {
  await fs.rename(tmpPath, absPath);
} catch (e) {
  await fs.unlink(tmpPath).catch(() => {});
  /* mapFsError */
}
```

FR-021's "no half-written observable instant" is satisfied by atomic rename — the file is always either the pre-rename content or the post-rename content, never an interleaved mix.

The `randomUUID()` suffix on the `.tmp` filename avoids filename collision between concurrent `append_note` calls against the same path (cohort parity with `write_note` / `patch_heading` / `patch_block`).

**Rationale**: Direct lift of the cohort substrate. No deviation, no innovation.

**Alternatives Considered**: Same as the cohort precedents — non-atomic write (rejected as breaking FR-021), append via `fs.appendFile` (rejected because it bypasses the separator-decide step in `appendEdit` and offers no atomicity guarantee against partial writes on power loss).

## R12 — Active-mode pre-write eval: focused-file resolution via existing cohort template

**Decision**: The handler uses the cohort's standard focused-file eval template from `write_note` byte-stably:

```typescript
const FOCUSED_FILE_TEMPLATE =
  "(async()=>{const f=app.workspace.getActiveFile();return JSON.stringify({path:f?.path??null,base:app.vault.adapter.basePath});})()";
```

The eval returns `{ base: vaultRoot, path: vaultRelativePath }`. A `null` path → `ERR_NO_ACTIVE_FILE` (cohort reuse). Successful resolution feeds the resolved path to the canonical-path check.

**Rationale**: Direct lift of `write_note`'s `FOCUSED_FILE_TEMPLATE`. Cohort default. The eval is small (well under the BI-0038 argv ceiling), fixed (no user-input interpolation, so no injection surface), and reused unchanged across every fs-direct write tool.

**Alternatives Considered**: Same as `write_note`'s rejected alternatives — caller-supplied focused-file path (rejected because the caller has no reliable way to know which file the user has focused), polling the focused file via a watch loop (rejected as needlessly stateful for a one-shot operation).

## Summary of plan-phase pipeline decisions

| Decision | Choice | Cohort precedent |
|---|---|---|
| Pipeline | fs-direct via ADR-009 substrate (R1) | `write_note`, `patch_heading`, `patch_block` |
| Tool name | `append_note` (descriptive; ADR-010 N/A) | `write_note` (doesn't mirror `create`) |
| Separator semantics | Pure helper `appendEdit(existing, content, inline)` (R2) | `body-edit.ts` / `block-edit.ts` |
| Size ceiling | No explicit cap; substrate-bounded; documented in help (R3) | `write_note`'s unbounded `content` |
| Active-mode opt-in | None (cohort exception per FR-004a) (R4) | DELIBERATE divergence from `write_note`'s `overwrite: true` |
| Missing-target | ENOENT → `NOTE_NOT_FOUND` (R5) | Read-side cohort discriminator |
| Empty content | `z.string().min(1)` + new `details.code: "CONTENT_EMPTY"` (R6) | Only new sub-code introduced by this BI |
| Wikilink-form brackets | `file`-field refinement, no new sub-code (R7) | Cohort's structural `VALIDATION_ERROR` channel |
| Output envelope | `{ path, vault, bytes_written, inline }` (R8) | Write-side echo convention |
| Cache invalidation | Cohort eval, best-effort, silent on failure (R9) | `write_note` lineage |
| External editor | Substrate-signalled, BI-040 inherited byte-stably (R10) | `patch_heading` / `patch_block` |
| Atomic write | Cohort temp-then-rename (R11) | `write_note` substrate |
| Focused-file resolution | Cohort eval template byte-stably (R12) | `write_note` substrate |

No decisions require a Constitution Compliance N. All gates resolve to Y or N/A per plan.md's Constitution Check.
