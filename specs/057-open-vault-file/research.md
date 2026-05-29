# Research: Open Vault File

**Branch**: `057-open-vault-file` | **Date**: 2026-05-29
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Phase 0 research resolving the plan's open technical questions. Every NEEDS-CLARIFICATION-class item from Technical Context is settled here; the live-CLI confirmations are gathered into the T0 probe protocol (R7) and run at `/speckit-implement` time, not now, per CLAUDE.md's T0 gate and `.memory/test-execution-instructions.md`.

## R1 — Pipeline pick: eval-composed (not fs-direct, not CLI-wrap)

**Decision**: `open_file` is **eval-composed** — it performs the open through a single `obsidian eval` round-trip against Obsidian's `app.workspace` / `app.vault` / `app.viewRegistry` core API, via the existing `invokeCli({ command: "eval", target_mode: "active", parameters: { code } })` substrate. It performs no filesystem syscalls and wraps no native CLI subcommand.

**Rationale**:
- There is **no native `obsidian open` subcommand**. The upstream subcommand inventory characterised in `.architecture/Obsidian CLI - Upstream Issues and Limitations.md` (prepend/append/create/set_property/read/move/properties/search/search:context/eval/file/vaults/property:read/property:set) contains no `open`. Opening a file in the workspace is only reachable through the `app.workspace` API, which `eval` exposes. ADR-009 already established this: `write_note`'s `open` parameter runs `app.workspace.openLinkText(absPath, "")` via `eval`.
- The open argv is tiny and fixed-shape — a vault-relative path string plus a boolean — so it stays far below the ~4 KB Windows IPC ceiling that drove the *content-write* family to fs-direct (ADR-009 / BI-0038). The bug that motivates fs-direct does not fire here; there is no large user content crossing argv.
- fs-direct is inapplicable: the deliverable is a *workspace-state mutation* (what the user sees), not a file-content write. Node's `fs` cannot focus an Obsidian tab. Only the running Obsidian process can open a view.

**Alternatives considered**:
- *fs-direct* — rejected: cannot affect workspace focus at all; `fs` has no path to `app.workspace`.
- *CLI-wrap a native `open` subcommand* — rejected: no such subcommand exists to wrap (ADR-010 N/A).
- *Reuse `write_note`'s open by requiring a write* — rejected: that is exactly the coupling the feature removes (the spec's "Why"); it cannot surface a file the caller only located.

## R2 — Guard + resolve + open folded into ONE eval

**Decision**: A single composed eval performs all of: (1) compare `app.vault.adapter.basePath` to the expected base path (the focused-vault guard); (2) `app.vault.getAbstractFileByPath(relPath)` existence + file-vs-folder check; (3) `app.viewRegistry` extension-registered check; (4) `app.workspace.openLinkText(relPath, "", newTab)`. The eval returns a discriminated JSON result: `{ stage: "ok" | "vault-not-focused" | "file-not-found" | "unsupported-type", opened?, extension?, newTab? }`. The expected base path is computed in TypeScript via `resolveVaultPath(vault)` (vault-registry) and embedded into the eval string as a JSON-encoded literal.

**Rationale**:
- **TOCTOU elimination**: a separate `FOCUSED_VAULT_TEMPLATE` eval (guard) followed by a separate open eval leaves a window in which the user re-focuses a different vault between the two spawns — the guard would pass and the open would land in the wrong vault, defeating the entire point of the guard. One eval makes the compare-then-open atomic within a single Obsidian tick.
- **One spawn, not two**: improves on the "accept one extra eval round-trip" cost the user signed off at Clarifications 2026-05-29 — the guard adds no spawn because it rides the open eval.
- **Discriminated result drives the classifier**: the handler maps each `stage` to its typed `UpstreamError` (R3) or to the success envelope. No best-effort swallowing — for `open_file` the open IS the contract (FR-017), the deliberate divergence from `write_note`'s silent open.
- **`openLinkText` after a pre-existence check is safe**: `openLinkText` on an unresolved link can create a new note (silent no-op-ish for the caller). Gating it behind the explicit `getAbstractFileByPath` existence check (which yields `file-not-found` first) means `openLinkText` only ever runs on a confirmed-existing file, so its create-on-missing path is unreachable. `openLinkText(path, "", newTab)` then natively provides FR-008's semantics: `newTab=false` focuses an existing leaf showing that file (no duplicate) or opens in the active leaf; `newTab=true` always opens a fresh leaf.

**Alternatives considered**:
- *Separate `FOCUSED_VAULT_TEMPLATE` guard eval + open eval* — rejected: TOCTOU window + a second spawn. Reuse of the existing template is the only upside and is not worth the correctness hole for a tool whose contract is "surface the *correct* file".
- *`getLeaf(newTab).openFile(tfile)` instead of `openLinkText`* — viable and avoids any link-resolution ambiguity, but does not natively dedup to an existing tab for `newTab=false` (would require manual leaf iteration). `openLinkText` gives the dedup for free; the existence pre-check removes its only hazard. Final choice deferred to T0 (R7) — whichever reliably yields FR-008's dedup wins; the contract is identical either way.

## R3 — Error vocabulary: zero new top-level codes, one new `details.code`

**Decision**: All failures route through `UpstreamError` reusing existing top-level codes. The map:

| Condition | `code` | `details.code` | `details.reason` | New? |
|-----------|--------|----------------|------------------|------|
| Vault name not registered | `CLI_REPORTED_ERROR` | `VAULT_NOT_FOUND` | `unknown` | reused (cohort + `remapVaultNotFound`) |
| Vault registered but not the focused vault | `CLI_REPORTED_ERROR` | `VAULT_NOT_FOUND` | `not-open` (broadened semantic) | reused value |
| No file at the resolved location (or folder) | `CLI_REPORTED_ERROR` | `FILE_NOT_FOUND` | — | reused (`backlinks`/`links`) |
| File type not recognised / no registered view | `CLI_REPORTED_ERROR` | `UNSUPPORTED_FILE_TYPE` | — | **NEW (single-state)** |
| Input shape violations | `VALIDATION_ERROR` | (Zod issue path) | — | reused |
| Obsidian not running / eval failure | `CLI_BINARY_NOT_FOUND` / `CLI_NON_ZERO_EXIT` / `CLI_REPORTED_ERROR` | — | — | reused (cli-adapter) |

**Rationale**:
- `FILE_NOT_FOUND` and `VAULT_NOT_FOUND` (with the `unknown`/`not-open` `details.reason` pair) are already in the eval-composed cohort's vocabulary — verified in `src/tools/backlinks/index.ts` ("sub-discriminators `VAULT_NOT_FOUND` / `FILE_NOT_FOUND` / `NOT_MARKDOWN`") and `src/tools/_active-file.ts` `remapVaultNotFound` (`CLI_REPORTED_ERROR` + `details.code: "VAULT_NOT_FOUND"` + `details.reason: "unknown"`). Reusing them keeps the streak.
- `UNSUPPORTED_FILE_TYPE` is genuinely new — the cohort has `NOT_MARKDOWN` (`backlinks`), but that is markdown-link-graph-specific; `open_file` supports non-markdown by design, so "this extension has no registered Obsidian view" is a distinct, single-state condition. Per ADR-015 a new single-state `details.code` needs no `details.reason` enumeration (parity with `prepend`'s `CONTENT_TOO_LARGE`).
- `FILE_NOT_FOUND` over reusing `NOTE_NOT_FOUND`: `open_file` opens any type, so "note" is the wrong noun; `FILE_NOT_FOUND` is the honest, cohort-present name. (Rejected alternative: reuse `NOTE_NOT_FOUND` — cohort-parity-by-reuse but semantically wrong for attachments, and `FILE_NOT_FOUND` already exists so reuse buys nothing.)
- `not-open` reused with broadened semantic (not adding `not-focused`): settled at Clarifications 2026-05-29. The remediation ("make the requested vault active in Obsidian") is identical whether the vault is closed or background-open-but-not-focused, so a finer enum member buys no agent-actionable signal; the docs carry the broadened wording.

**Alternatives considered**: adding a `not-focused` `details.reason` (rejected — no distinct remediation; enum-minimalism per ADR-015); a new top-level `WORKSPACE_ERROR` code (rejected — breaks the Principle IV streak for no benefit; `CLI_REPORTED_ERROR` + `details.code` is the cohort idiom).

## R4 — Target-mode treatment: no discriminator (specific-only)

**Decision**: `open_file` omits the `target_mode` discriminator. The schema unconditionally requires `vault` and exactly one of `path`/`file`, plus an optional `new_tab` boolean (default false).

**Rationale**:
- There is no meaningful `active` mode: "open the file that is already the focused/active file" is a no-op (spec Assumption, settled at clarify). ADR-003 exists to *force explicit intent and forbid implicit active-vault/active-note execution*; with no second mode there is nothing to discriminate.
- The focused-vault guard (R2/FR-011) satisfies ADR-003's intent *more strictly* than the discriminator would: the tool always requires an explicit `vault` name and actively refuses (rather than silently routing) when that vault is not the focused one. This is the same posture `links`/`backlinks` take with their vault-resolution inspection clause.

**Alternatives considered**: a required `target_mode: "specific"` literal (rejected — redundant single-value ceremony with no second arm; would diverge the published `inputSchema` from a meaningful shape and add a baseline-fixture field that always holds one value). The ADR-003 row in the plan records this as a justified deviation, not an `N`.

## R5 — basePath comparison normalisation

**Decision**: The guard compares `app.vault.adapter.basePath` (focused vault) to the registry-resolved expected base path after normalising both: forward-slash separators and, on Windows, case-insensitive comparison of the drive letter and path. The normalisation runs inside the eval (so the focused base never leaves Obsidian un-normalised) and/or in the TS pre-step on the expected base.

**Rationale**: `resolveVaultPath` returns the OS-native absolute path; `app.vault.adapter.basePath` is Obsidian's own basePath string. On Windows these can differ in separator (`\` vs `/`) and drive-letter case (`C:` vs `c:`) while denoting the same directory. A naive `===` would yield a false `vault-not-focused` for the *correct* vault. The cohort's `FOCUSED_VAULT_TEMPLATE` consumers (`find_and_replace`, `query_base`) already deal with the focused base; their normalisation approach is the reference.

**Alternatives considered**: exact string equality (rejected — false negatives on Windows). The precise normalisation (whether to `realpath`-canonicalise both sides) is confirmed at T0 (R7) against the authorised test vault on Windows; the wrapper avoids `fs.realpath` if a string normalisation suffices (it has no other fs touch — see plan Technical Context).

## R6 — Success envelope

**Decision**: `{ opened: string, vault: string, new_tab: boolean }` — `opened` is the resolved vault-relative path of the file that was opened (canonicalised from whichever locator the caller supplied, FR-003); `vault` echoes the requested vault display name; `new_tab` echoes the effective new-tab flag.

**Rationale**: Opening mutates observable workspace state, so the response echoes the resolved locator for write-verification per the project's read-vs-write echo convention (mutating tools echo; pure-read tools do not — the `feedback_no_locator_echo_in_read_responses` convention). The caller verifies the hand-off landed on the intended file (FR-016 / SC-007) without re-inspecting the workspace. No file-type field is echoed: FR-009 requires the response shape be identical across types, and a type field would invite callers to branch on it.

**Alternatives considered**: echoing `was_already_open` / `created_new_tab` booleans (deferred — useful telemetry but not required by any FR; adding them later is additive and non-breaking); echoing the absolute path (rejected — vault-relative is the cohort's canonical locator shape and avoids leaking the host filesystem layout).

## R7 — T0 live-CLI probe protocol (run at /speckit-implement)

These confirmations require a running Obsidian + the authorised test vault; per CLAUDE.md they run as T0 probes during `/speckit-implement`, **after** reading `.memory/test-execution-instructions.md`. They do not block plan approval — each has a documented fallback already encoded above.

1. **Unsupported-type signal**: confirm the `app.viewRegistry` method that reports whether an extension has a registered view (candidate: `isExtensionRegistered(ext)` / `getTypeByExtension(ext)`), and its return for {`md`, `canvas`, `pdf`, `png`} (registered) vs a synthetic unknown extension (unregistered). Drives the `stage: "unsupported-type"` branch.
2. **`openLinkText` vs `getLeaf().openFile` dedup** (R2): confirm `openLinkText(relPath, "", false)` focuses an existing leaf for an already-open file (no duplicate) and that `openLinkText(relPath, "", true)` always creates a new leaf. If `openLinkText`'s create-on-missing cannot be fully suppressed by the pre-existence check, fall back to `getLeaf(newTab).openFile(tfile)` + a manual existing-leaf reveal for `newTab=false`.
3. **basePath normalisation** (R5): confirm `app.vault.adapter.basePath` shape on Windows vs `resolveVaultPath` output; settle the normalisation (string vs realpath).
4. **Obsidian-not-running classification**: confirm which `invokeCli` failure surfaces when Obsidian is not running (empty-stdout+exit-0 vs non-zero vs binary-not-found) and that the handler maps it to a loud `CLI_*` error, never a silent success.
5. **Eval-result envelope shape**: confirm the `=> <json>` echo strip (via the cohort's `parseEvalStdout`) round-trips the discriminated `{ stage, ... }` object cleanly.

## Summary of decisions

| # | Decision |
|---|----------|
| R1 | Eval-composed pipeline (no native subcommand; reuses `invokeCli` eval; no `fs`). |
| R2 | Single composed eval folds guard + existence + type-check + open; discriminated `{ stage }` result; eliminates TOCTOU; one spawn. |
| R3 | Zero new top-level codes; reuse `VAULT_NOT_FOUND{unknown,not-open}` + `FILE_NOT_FOUND`; one new single-state `details.code` `UNSUPPORTED_FILE_TYPE`. |
| R4 | No `target_mode` discriminator (specific-only); guard satisfies ADR-003 intent. |
| R5 | basePath comparison normalised (separator + Windows case). |
| R6 | Success envelope `{ opened, vault, new_tab }` (write-verification echo). |
| R7 | Five T0 probes deferred to `/speckit-implement`, each with an encoded fallback. |
