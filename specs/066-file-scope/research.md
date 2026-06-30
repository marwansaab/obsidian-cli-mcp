# Phase 0 Research: File Scope

**Feature**: `066-file-scope` — single-note scope for `find_and_replace`
**Input**: [spec.md](spec.md) · **Governing decision**: [ADR-032](../../.decisions/ADR-032%20-%20Find%20And%20Replace%20File%20Scope%20via%20Sibling%20Locators.md)

The schema-modelling direction, the error-discriminator roster, and bare-name resolution were settled by ADR-032 + the 2026-06-30 clarify session. This document records the implementation decisions that follow, and the two empirical T0 verification gates that remain. No `NEEDS CLARIFICATION` markers remain.

---

## D1 — Modify the existing tool, do not add a new one

**Decision**: `find_and_replace` already exists and is registered. This feature edits its `schema.ts` (new fields + scope `superRefine`), `handler.ts` (scope-resolution front end), `index.ts` (description + validation-error mapping), their co-located tests, `docs/tools/find_and_replace.md`, and the regenerated `find_and_replace` fingerprints in `_register-baseline.json`. No new tool, no new `server.ts` registration line, no new DI argument.

**Rationale**: The feature is purely additive to an existing surface (FR-001, FR-014). Adding a separate tool would fragment the find-and-replace surface and duplicate the scan/commit machinery.

**Alternatives considered**: A separate `find_and_replace_note` tool — rejected; it would duplicate the entire preview/commit/region/atomic-write substrate and split the agent's mental model.

## D2 — The single-note scope is a front-end narrowing of `eligible`

**Decision**: The existing handler resolves a `scanRoot` (vault root or subfolder), walks it to a list of eligible vault-relative paths (`listEligibleNotes`), then runs Stages 4–7 (scan → bound-check → drift-check → atomic write) over that list. The single-note scope replaces only the resolve-and-walk front end with a resolution that yields `eligible = [relPath]` (exactly one path). Stages 4–7 are inherited verbatim.

**Rationale**: Every BI-038 safety guard and preservation invariant (region skip/opt-in, case-sensitivity, regex/literal, zero-width skip, line scoping, the safe-upper-bound guard, two-scan drift detection, per-note `Queue`-serialized temp+rename atomic write, byte-for-byte preservation) already operates per-note over the eligible list. Narrowing the list to one entry confines all of them to the one note for free (FR-011), with the affected-notes cardinality structurally capped at one (FR-009).

**Alternatives considered**: A parallel single-note code path with its own scan/write — rejected; it would duplicate the region-aware scan + atomic write and risk divergence from the vault-wide path's preservation guarantees.

## D3 — Sibling locator fields, not `target_mode` (ADR-032)

**Decision**: Add three optional input fields — `file` (bare note name), `path` (vault-relative), `active_note` (boolean opt-in for the open note) — alongside the existing flat `subfolder` / `vault`. A `superRefine` enforces the scope mutual-exclusivity matrix (D7). The schema does **not** import `src/target-mode/target-mode.ts`.

**Rationale**: ADR-032. Adopting `target_mode` would overload a file-targeted primitive onto a vault-wide surface, forge a new `schema → target-mode` dependency edge, and require an ADR-003 amendment. Sibling optional fields keep ADR-003 untouched, keep every existing flat caller byte-stable (all new fields optional → FR-014), and make the open-note opt-in a find_and_replace-local addition.

**Alternatives considered**: (A) adopt `target_mode` — rejected by ADR-032 (overload + ADR-003 amendment). (C) a nested discriminated `scope` object — rejected; breaks every existing vault-wide/folder caller (FR-014 violation).

## D4 — Three resolution forks, all reusing `_active-file.ts`

**Decision**: `find_and_replace/handler.ts` already imports `_active-file.ts`. The scope-resolution front end adds three forks, each producing `{ vaultRoot, relPath }`:

- **`active_note`** → `resolveActiveFocusedFile(deps, "find_and_replace")` returns `{ vaultRoot, relPath }` directly from the focused-file eval (`FOCUSED_FILE_TEMPLATE`), and throws `ERR_NO_ACTIVE_FILE` when nothing is open (FR-005).
- **`path`** → resolve the vault root as today (`resolveVaultRootOrRemap` when `vault` is named, else the existing focused-vault eval `defaultInvokeEval`); the rel-path is the given vault-relative `path`.
- **`file`** → resolve the vault root as today, then resolve the bare name to a rel-path via `resolveFileByTsv` (`obsidian file file=<name>` → TSV `path` line) for shortest-unique-name parity (D6).

Each fork then runs the existing `assertCanonicalPath` guard on the resolved note and the D5 eligibility/existence check before handing `eligible = [relPath]` downstream.

**Rationale**: `resolveActiveFocusedFile` and `resolveFileByTsv` already live in the module the handler imports — these are added calls, not a new coupling (Principle I; ADR-032 rationale). Reusing the cohort resolvers gives byte-identical addressing semantics with the rest of the note-level surface (FR-002, SC-006).

**Alternatives considered**: A direct-FS bare-name resolver (scan eligible notes for a basename match) — rejected; it does not replicate Obsidian's shortest-unique-name semantics and would make a name resolve differently than `write_note`/`append_note` (the "feels bolted on" failure the feature avoids).

## D5 — Eligibility + existence checks for the single target

**Decision**: After a fork resolves `relPath`, the handler verifies:
1. **Eligibility** — `relPath` ends in `.md` (case-insensitive) AND no path segment starts with `.` (reusing the existing `.md`/dot-dir rules). Failure → `VALIDATION_ERROR` + `details.code:"INVALID_NOTE"` + `details.reason:"not-eligible"`.
2. **Existence** — the resolved absolute path exists on disk (`realpath`/`stat`). `ENOENT` → `VALIDATION_ERROR` + `details.code:"INVALID_NOTE"` + `details.reason:"not-found"` + `details.note`.

Both checks run before any scan/read of content; an explicitly-targeted ineligible or missing note is a hard error, never a silent `{ affected_notes: [] }` (FR-008, FR-012; Principle IV).

**Rationale**: Parity with the existing `INVALID_SUBFOLDER`/`not-found` shape (handler.ts:424) — a caller who names a thing that does not resolve gets a typed error naming it, not an empty success. The `active_note` fork's eligibility check covers the "a PDF/canvas is the active file" case.

**Alternatives considered**: Treat an ineligible/missing single-note target as a zero-match success — rejected; it is indistinguishable from "the pattern matched nothing in a real note" and hides the caller's addressing mistake.

## D6 — Focused + bare-name resolution (T0-verified)

**Decision**: When `file` is supplied with `vault` absent, the vault root comes from the existing focused-vault eval; the bare name is resolved against the focused vault via the `obsidian file` subcommand. **Plan of record**: reverse-resolve the focused vault's display name via `resolveVaultDisplayName(deps.vaultRegistry, base)` (the helper `_active-file.ts` exports) and pass it to `resolveFileByTsv(deps, displayName, file, "find_and_replace")` — no change to the shared helper's signature. When `vault` is named, pass it directly.

**Rationale**: `resolveFileByTsv` types `vault` as `string`, and `obsidian file` resolves a bare name within a vault. The reverse-lookup gives a concrete vault name without modifying the shared helper or the byte-stable eval templates.

**T0 gate (P1)**: confirm `obsidian file file=<bare-name>` returns the TSV `path` line resolving shortest-unique-name for the focused vault. If T0 shows the subcommand accepts focused mode without a `vault=` arg (resolving against the focused vault directly), a simpler variant — call `resolveFileByTsv` with the reverse-resolved name OR a focused-mode call — is available; the choice is recorded, not blocking (both reach the same TSV `path` line).

**Alternatives considered**: Require an explicit `vault` whenever `file` is used — rejected; contradicts FR-015 (named-note keeps find_and_replace's optional-vault focused-default). Extend `FOCUSED_VAULT_TEMPLATE` to also emit `app.vault.getName()` — rejected for now; the template is byte-stable with test assertions, and the registry reverse-lookup avoids touching it.

## D7 — Scope mutual-exclusivity matrix (schema `superRefine`)

**Decision**: The `superRefine` on `findAndReplaceInputSchema` emits `custom` issues for conflicts, carrying `params: { subCode: "SCOPE_CONFLICT", subReason: <pair> }`. `index.ts` `mapZodIssuesToToolError` maps any such issue to `VALIDATION_ERROR` + `details.code:"SCOPE_CONFLICT"` + `details.reason:<pair>`. The matrix (let single-note = `file | path | active_note`):

| Combination supplied | Verdict | `details.reason` |
|---|---|---|
| `file` + `path` | reject | `file+path` |
| (`file`\|`path`) + `subfolder` | reject | `note+folder` |
| `active_note` + (`file`\|`path`) | reject | `active+note` |
| `active_note` + `subfolder` | reject | `active+folder` |
| `active_note` + `vault` | reject | `active+vault` |
| `file`\|`path` + `vault` | **allow** | — (vault selects the named note's vault) |
| none of the scope fields | **allow** | — (vault-wide default, byte-stable) |

The `[[`/`]]` bracket reject on `file` is a separate field-level `custom` issue surfaced through the cohort's standard `VALIDATION_ERROR` channel (no sub-code, parity with `append_note/schema.ts`). Structural path-safety failures on `file`/`path` map to `VALIDATION_ERROR` + `details.code:"INVALID_NOTE"` + `details.reason:"path-traversal"` (parity with `INVALID_SUBFOLDER`/`path-traversal`).

**Rationale**: Reuses the established `params.subCode`/`subReason` → `details.code`/`details.reason` mapping already in `index.ts` for `INVALID_PATTERN`/`INVALID_SUBFOLDER`. `vault` is an orthogonal vault-selector, permitted with a named target and forbidden only under `active_note` (the open note determines its own vault) — ADR-032 Decision.

**Alternatives considered**: A distinct `details.code` per conflict pair — rejected; looser namespace, the single `SCOPE_CONFLICT` + `reason` is tighter and parity with the existing sub-discriminator shape (ADR-015).

## D8 — Commit re-scan reuse for single-note

**Decision**: The existing commit path (Stage 6) re-walks the scan root (`listEligibleNotes` again) for the second drift scan. Under single-note scope there is nothing to re-walk — the second scan re-reads the same fixed `[relPath]`. The handler branches: single-note → second scan reuses the resolved one-element list; folder/vault-wide → second scan re-walks as today.

**Rationale**: Drift detection compares occurrence counts between two scans of the same invocation; for a fixed single note, re-reading that note's content twice still catches a between-scan edit (count differs → `OCCURRENCE_COUNT_DRIFT`). Re-walking is meaningless when the target is a fixed path. The scope is resolved once at the top of `executeFindAndReplace`, so both scans share the resolved `eligible`.

**Alternatives considered**: Re-resolve the `active_note` target for the second scan — rejected; resolution happens once per invocation, and re-resolving could retarget mid-invocation if the user switched the active file between preview-scan and commit-scan, which is surprising. The fixed-target re-read is the safer, more predictable contract.

## D9 — Surface text + baseline regeneration

**Decision**: Rewrite `FIND_AND_REPLACE_DESCRIPTION` (`index.ts`) to remove the "WARNING — vault-wide scope, no single-file mode" / "There is NO single-file scoping option" text and document the single-note scope (`path` / `file` / `active_note`, the conflict roster, the `INVALID_NOTE` states). Rewrite `docs/tools/find_and_replace.md` similarly with worked examples. Regenerate the `find_and_replace` entry in `src/tools/_register-baseline.json` — both `descriptionFingerprint` (new description) and `schemaFingerprint` (new input fields) move — and let the FR-018 baseline-stability test re-assert the new baseline in the same change.

**Rationale**: The existing description actively tells agents the scope does NOT exist; leaving it would contradict the feature and steer agents to the `write_note` workaround the feature replaces. The fingerprint move is the single expected published-surface change (it is gated, by design, by the FR-018 test — regenerating the baseline in the same change keeps the gate honest).

**Alternatives considered**: Leave the description and only change the schema — rejected; the contradictory warning would mislead callers and the `schemaFingerprint` moves regardless (new fields), so the baseline regen is unavoidable.

---

## T0 verification gates (implement-time, drive `Obsidian.com`)

Both gates verify resolution channels the design already assumes; neither forks the design. Full plan in [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md).

- **P1 — focused bare-name `file` resolution**: `obsidian file file=<bare-name>` against the focused vault (TestVault). Expected: a TSV `path\t<relPath>` line resolving shortest-unique-name. Confirms D6.
- **P2 — focused-file eval shape**: `obsidian eval` of `FOCUSED_FILE_TEMPLATE` with (a) a `.md` note open, (b) a non-`.md` file active, (c) nothing open. Expected: `{ path: <relPath|null>, base: <absPath> }`; `path === null` only when nothing is open. Confirms the `active_note` fork (D4) + its eligibility check (D5).

Per `.memory/test-execution-instructions.md`, T0 probes run at `/speckit-implement` against the authorised TestVault scratch subdir, driving the production-resolved `Obsidian.com` shim (never the GUI `Obsidian.exe`).
