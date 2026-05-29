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

## R2 — Guard + resolve + open folded into ONE eval (cohort `_template.ts` mechanism)

**Decision**: A single composed eval performs all of: (1) compare (normalised) `app.vault.adapter.basePath` to the expected base path (the focused-vault guard); (2) resolve the target — for the `path` locator `app.vault.getFiles().find(x => x.path === a.path)` (files only, so a folder yields no match), for the `file` locator `app.metadataCache.getFirstLinkpathDest(a.file, "")`; (3) `app.viewRegistry` extension-registered check; (4) `await app.workspace.openLinkText(f.path, "", a.new_tab)`. The eval is a **frozen `JS_TEMPLATE` constant in `src/tools/open_file/_template.ts`** — byte-identical in convention to `backlinks/_template.ts` / `links/_template.ts` / `read_heading/_template.ts`. Args (`expectedBase`, `path`, `file`, `new_tab`) are passed via the shared `composeEvalCode(JS_TEMPLATE, {...})` helper from `_shared.ts`, which **base64-encodes the payload** (`B64_PAYLOAD_DECODE_EXPR`) so the template reads `const a = JSON.parse(<b64-decode>)` — R12 anti-injection, mandatory because `path`/`file` are user-controlled. The eval returns a cohort-standard discriminated envelope: `{ ok: true, opened, new_tab } | { ok: false, code: "VAULT_NOT_FOCUSED" | "FILE_NOT_FOUND" | "UNSUPPORTED_FILE_TYPE", detail }` (parity with `backlinks`' `{ok:false, code, detail}`). The expected base path is computed in TypeScript via `resolveVaultPath(vault)` (vault-registry).

**Decode is settled (not a T0 unknown)**: the template is a **block-body async IIFE** (`(async()=>{ … return JSON.stringify(env); })()`), the same shape as `FOCUSED_FILE_TEMPLATE`, which `resolveActiveFocusedFile` decodes with a **single** `JSON.parse` after stripping the `"=> "` echo. `backlinks` decodes its eval identically (strip `"=> "` → single `JSON.parse` → zod `safeParse`). open_file therefore uses the same two-stage decode: strip `"=> "` → `JSON.parse` → `openEvalResponseSchema.safeParse`. The double-decode quirk of `FOCUSED_VAULT_TEMPLATE` is specific to its *expression-body* IIFE (`(async()=>JSON.stringify(...))()`) and does not apply to the block-body shape — so a separate decode probe is unnecessary.

**Rationale**:
- **TOCTOU elimination**: a separate `FOCUSED_VAULT_TEMPLATE` guard eval followed by a separate open eval leaves a window in which the user re-focuses a different vault between the two spawns — the guard would pass and the open would land in the wrong vault. One eval makes compare-then-open atomic within a single Obsidian tick.
- **One spawn, not two**: improves on the "accept one extra eval round-trip" cost signed off at Clarifications 2026-05-29 — the guard rides the open eval.
- **Cohort-parity name resolution (resolves analysis I1/C1)**: `getFirstLinkpathDest(a.file, "")` is the established eval-composed read-side rule — `backlinks/_template.ts`, `links/_template.ts`, `read_heading/_template.ts` all use it for the `file` locator. So FR-002's "same rule the read-side `file` parameter follows" is satisfied with no new resolution algorithm.
- **Discriminated envelope drives the classifier**: the handler maps each `{ok:false,code}` to its typed `UpstreamError` (R3) or returns the success envelope. No best-effort swallowing — for `open_file` the open IS the contract (FR-017), the deliberate divergence from `write_note`'s silent open.
- **`openLinkText` after a pre-existence check is safe**: `openLinkText` on an unresolved link can create a new note. Gating it behind the explicit resolve step (which yields `FILE_NOT_FOUND` first) means it only ever runs on a confirmed-existing file, so its create-on-missing path is unreachable. `openLinkText(f.path, "", new_tab)` then natively provides FR-008's semantics: `new_tab=false` focuses an existing leaf for the file (no duplicate) or opens in the active leaf; `new_tab=true` always opens a fresh leaf.

**Alternatives considered**:
- *Separate `FOCUSED_VAULT_TEMPLATE` guard eval + open eval* — rejected: TOCTOU window + a second spawn.
- *Per-tool `composeOpenEval(...)` function returning a JSON-literal-interpolated string* — rejected: diverges from the cohort's frozen-`JS_TEMPLATE` + shared-`composeEvalCode` + base64 convention, and JSON-literal interpolation of user-controlled `path`/`file` is weaker than the base64 payload's R12 anti-injection.
- *`getLeaf(new_tab).openFile(tfile)` instead of `openLinkText`* — viable, but does not natively dedup to an existing tab for `new_tab=false` (would need manual leaf iteration). `openLinkText` gives the dedup for free; the existence pre-check removes its only hazard. Fallback retained at T0 (R7) if `openLinkText`'s create-on-missing cannot be suppressed.

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

1. **Unsupported-type signal** → drives the `{ok:false, code:"UNSUPPORTED_FILE_TYPE"}` branch: confirm the `app.viewRegistry` method that reports whether an extension has a registered view (candidate: `isExtensionRegistered(ext)` / `getTypeByExtension(ext)`), and its return for {`md`, `canvas`, `pdf`, `png`} (registered) vs a synthetic unknown extension (unregistered).
2. **`openLinkText` vs `getLeaf().openFile` dedup** (R2): confirm `openLinkText(f.path, "", false)` focuses an existing leaf for an already-open file (no duplicate) and that `openLinkText(f.path, "", true)` always creates a new leaf. If `openLinkText`'s create-on-missing cannot be fully suppressed by the pre-existence check, fall back to `getLeaf(new_tab).openFile(tfile)` + a manual existing-leaf reveal for `new_tab=false`.
3. **basePath normalisation** (R5): confirm `app.vault.adapter.basePath` shape on Windows vs `resolveVaultPath` output; settle the normalisation (string vs realpath).
4. **Obsidian-not-running classification**: confirm which `invokeCli` failure surfaces when Obsidian is not running (empty-stdout+exit-0 vs non-zero vs binary-not-found) and that the handler maps it to a loud `CLI_*` error, never a silent success.
5. **`getFirstLinkpathDest` name resolution** (R2): confirm `getFirstLinkpathDest(a.file, "")` resolves bare names INCLUDING non-markdown attachments (image/PDF/canvas) by name — the eval-composed cohort precedent (`backlinks`/`links`/`read_heading`) uses it for markdown notes; open_file extends it to any-type. (The eval-result *decode* itself is NOT a probe — it is settled by the block-body-async-IIFE precedent: single `JSON.parse` + `safeParse`, parity with `FOCUSED_FILE_TEMPLATE` / `backlinks`. See R2.)

## Summary of decisions

| # | Decision |
|---|----------|
| R1 | Eval-composed pipeline (no native subcommand; reuses `invokeCli` eval; no `fs`). |
| R2 | Single composed eval (frozen `JS_TEMPLATE` in `_template.ts` + shared `composeEvalCode` base64 payload, cohort parity) folds guard + resolve (`getFiles().find`/`getFirstLinkpathDest`) + type-check + `openLinkText`; `{ok,code,detail}` envelope; single-decode + `safeParse` (settled by precedent); eliminates TOCTOU; one spawn. |
| R3 | Zero new top-level codes; reuse `VAULT_NOT_FOUND{unknown,not-open}` + `FILE_NOT_FOUND`; one new single-state `details.code` `UNSUPPORTED_FILE_TYPE`. |
| R4 | No `target_mode` discriminator (specific-only); guard satisfies ADR-003 intent. |
| R5 | basePath comparison normalised (separator + Windows case). |
| R6 | Success envelope `{ opened, vault, new_tab }` (write-verification echo). |
| R7 | Five T0 probes deferred to `/speckit-implement`, each with an encoded fallback (viewRegistry signal, openLinkText dedup, basePath normalisation, Obsidian-not-running, getFirstLinkpathDest attachment resolution). The eval *decode* is settled by precedent, not a probe. |
