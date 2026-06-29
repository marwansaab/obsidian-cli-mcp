# Phase 0 Research: Report Active File (`get_active_file`)

All decisions resolve the spec ([spec.md](spec.md)) + the clarify session (2026-06-29, Q1–Q4) into an implementable design. No `NEEDS CLARIFICATION` remains; the one empirical item (D9) is an implement-time verification with a clear path, not a design unknown.

Source grounding (direct lookup): `src/tools/_active-file.ts`, `src/target-mode/target-mode.ts`, `src/tools/_shared.ts`, `src/tools/backlinks/{schema,handler,_template,index}.ts`, `src/tools/open_file/{schema,handler,index}.ts`, `src/tools/files/schema.ts`, `src/server.ts`, `src/tools/_register-baseline.json`, `.decisions/ADR-031`, `.architecture/Obsidian CLI MCP - Architecture.md` (ARCH-014).

---

## D1 — Eval-composition, new leaf module

**Decision**: Implement `get_active_file` as a new eval-composition tool module `src/tools/get_active_file/{schema, _template, handler, index}.ts` + co-located tests, routing through `invokeCli` (→ `dispatchCli`).

**Rationale**: There is no native `obsidian active-file` subcommand to wrap; the active file is read from `app.workspace.getActiveFile()` via `obsidian eval`. This is the established eval-composition cohort (`backlinks`, `links`, `open_file`). ADR-010 (mirror upstream subcommand name) is therefore N/A.

**Alternatives**: Extend an existing tool (rejected — distinct surface, distinct contract); use `obsidian_exec` (rejected — that is the untyped escape hatch; a first-class typed surface is the whole point).

---

## D2 — `target_mode: "active" | "specific"`, no locator (Spec Q1)

**Decision**: Input schema = `applyTargetModeRefinementForFolderScoped(targetModeBaseSchema)` — `vault` required in `specific`, forbidden in `active`; `file`/`path` forbidden in **both** modes (the active file is the implicit target — there is no locator).

**Rationale**: `get_active_file` is the strongest "active file" concept on the surface, so per ADR-003 it implements the `target_mode` union, not the optional-`vault?` idiom ARCH-014 reserves for inherently-vault-wide, no-active-file tools (value→file lookups, vault-wide queries) — `get_active_file` is the inverse of that category. The folder-scoped refinement is the existing pattern for a target-mode tool with **no `file`/`path` locator** (used by `files`); reusing it avoids a bespoke refinement (Principle I — reuse over fork). The "omit `vault` → focused vault" default (spec option C) is rejected: it is exactly the implicit-vault default ADR-003 forbids ("exposing implicit state to an LLM risks silent errors on unintended files").

**Settled — cohort parity (I1, /speckit-analyze remediation)**: `targetModeBaseSchema` declares `file`/`path` as optional, so the published JSON schema lists them as always-rejected fields — **identical to the shipped `files`/`paths` tools**, which use the same folder-scoped refinement. This is the established cohort convention, adopted as-is; spec FR-009 + data-model are updated to state the published-but-rejected shape honestly rather than overclaim "no locator in the schema." A bespoke `{ target_mode, vault? }.strict()` base was reconsidered during analyze remediation and **rejected**: it would make `get_active_file` the lone target-mode tool not reusing the shared refinement — a structural divergence from `files`/`paths` for a cosmetic schema cleanup the cohort already accepts in production.

**Alternatives**: `vault` required, specific-only (open_file style) — rejected: forces the caller to know the vault to ask "what is focused" (spec Q1 option B). Optional `vault`, no discriminator — rejected (ADR-003, above).

---

## D3 — No-active-file is a **success** `{ active: null }` (Spec Q1/US2, FR-005/006)

**Decision**: When `getActiveFile()` is null (empty workspace, all panes closed, or a non-file view in front), the tool returns a **successful** result `{ active: null }`. It does **not** raise `ERR_NO_ACTIVE_FILE`.

**Rationale**: This is a deliberate divergence from the rest of the eval cohort. `_active-file.resolveActiveFocusedFile` (used by `backlinks`/write cohort) throws `ERR_NO_ACTIVE_FILE` because, for those tools, "no active file" is a usage error — they need a target. For `get_active_file`, "there is no active file" is the *legitimate queried answer* (US2): the whole point is to report presence/absence. Returning a typed success lets callers branch on `active === null` without catching an error (FR-006). This is **not** a Principle IV silent-empty-mask: the absence is the explicit, intended result of a successful query, authorized by the spec — not a masked failure. It adds **no** error vocabulary.

**Consequence**: `get_active_file` does not consume `resolveActiveFocusedFile`; it uses its own template + `decodeEvalEnvelope` and maps the `null` arm straight to the output. The handler has no `NO_ACTIVE_FILE` mapping branch.

**Alternatives**: Reuse `ERR_NO_ACTIVE_FILE` (rejected — forces failure-handling for an ordinary state, contradicts US2). A `{ present: false }` flag instead of `{ active: null }` (rejected — `null` is the simpler discriminator and avoids a redundant boolean; the absence of the nested object IS the signal).

---

## D4 — Dedicated frozen template, no payload / no `composeEvalCode` (FR-001..004)

**Decision**: A new frozen `obsidian eval` IIFE in `_template.ts`:

```js
(()=>{const f=app.workspace.getActiveFile();return JSON.stringify({active:f?{path:f.path,name:f.name,basename:f.basename,extension:f.extension}:null});})()
```

No `__PAYLOAD_B64__`, no `composeEvalCode`. No `ok`-wrapper: `getActiveFile()` has no in-eval failure arm, so the body emits the `{ active }` output shape directly and `decodeEvalEnvelope` validates it straight into `getActiveFileOutputSchema` (the dual `ok:true`-wrapped envelope from the original draft was collapsed in code-quality review — see [data-model.md](data-model.md)).

**Rationale**: The four FR-001 fields map directly to Obsidian `TFile` members — `path` (vault-relative), `name` (incl. extension), `basename` (without extension), `extension` (without dot). The `name = basename + extension`, multi-dot, and no-extension rules (FR-002/003) are Obsidian's own field semantics, so no re-parsing is implemented (the substrate is the source of truth). Crucially, the tool injects **no caller-supplied data** into the eval — active vs specific routing is carried by `invokeCli`'s `vault`/`target_mode`, not the template — so there is **no injection surface** and the base64 anti-injection machinery (`backlinks` needs it because it interpolates `path`/`file`) is unnecessary. A plain frozen string is simpler and equally safe.

**Unicode (FR-004, Spec Q3)**: The template returns `f.name`/`f.path` verbatim; `JSON.stringify` → `JSON.parse` round-trips Unicode losslessly. No `.normalize()` anywhere (none exists in `src`). "Faithful" = exactly what Obsidian reports, even an on-disk NFD name. See D8.

**Byte-stability**: The recorded eval string is asserted by `_template.test.ts` and `handler.test.ts` (argv). Sync-IIFE form mirrors `backlinks` (`(()=>{...})()`); the existing `FOCUSED_FILE_TEMPLATE` uses `(async()=>{...})()` — either works; the implement-T0 probe confirms the chosen form against the live CLI.

**Leading-dot / dotfile edge**: a name beginning with a dot (e.g. `.gitignore`) follows the substrate's `basename`/`extension` split exactly (whatever Obsidian reports); characterised by the implement-T0 probe (D9), not re-implemented.

---

## D5 — Cross-vault via vault-targeted eval; no focused-vault guard (Spec Q1, FR-011)

**Decision**: `specific` mode issues `invokeCli({ command:"eval", vault: input.vault, parameters:{code}, flags:[], target_mode:"specific" })`. Because B1 is false (`eval` honours `vault=`), the eval runs in the requested vault and `getActiveFile()` returns that vault's active file — even when it is open but not the focused window. No focused-vault guard; `details.reason:"not-open"` is **not** emitted.

**Rationale**: ADR-031 falsified B1 for `open_file` and BI-0134 verified it cohort-wide (`@marwansaab/obsidian-cli-mcp@0.8.6`). The spec's original guard model (mirrored from superseded BI-057) was a defect — it would have errored on US4-AC1 instead of reading the named vault. `active` mode issues the same eval with `target_mode:"active"` and no `vault`, running against the focused vault.

**Caveat → D9**: the cohort-wide B1 finding covers `vault=` *routing*; the active file is *UI state*. D9 verifies the active-file read specifically.

---

## D6 — Unknown vault via pre-eval `resolveVaultRootOrRemap` (FR-010)

**Decision**: In `specific` mode, before the eval, call `resolveVaultRootOrRemap(deps.vaultRegistry, input.vault, "get_active_file")`. An unregistered display name surfaces as `CLI_REPORTED_ERROR` + `details.code:"VAULT_NOT_FOUND"` + `details.reason:"unknown"` (via `remapVaultNotFound`). The returned base path is discarded.

**Rationale**: This is exactly how `open_file` produces the typed unknown-vault error (the sole hard vault error). Relying instead on the cli-adapter's R5 stdout reclassification (as `backlinks` does) yields only `details.message:"Vault not found."` — weaker than FR-010's required `details.code`/`reason`. The pre-eval registry check gives the precise, agent-actionable triple and fails fast before spawning an eval. Requires `vaultRegistry` in `ExecuteDeps` (DI via `server.ts`, like `open_file`).

**`active` mode** skips this entirely (no vault).

---

## D7 — Recovery inherited from `dispatchCli`, no per-tool code (Spec Q2, FR-012/013)

**Decision**: Closed-but-registered vault and app-down are handled by the inherited `dispatchCli` recovery — ADR-029 cold-start retry, ADR-030 app-down launch (on by default; `OBSIDIAN_AUTO_LAUNCH` opt-out → typed `CLI_NON_ZERO_EXIT/obsidian-not-running`). `get_active_file` adds no per-tool retry/poll/launch and imports no spawn site. The FR-011 cross-vault guarantee is verified (test-locked) for **open-but-unfocused** vaults only.

**Rationale**: ADR-029/030 sit at the dispatch chokepoint and are inherited by every eval-cohort tool with zero adaptation (ARCH-014); `get_active_file` routing `invokeCli → dispatchCli` gets them free. Spec Q2 rejected per-tool "never launch" (would need to suppress a global default — machinery the architecture doesn't provide) and rejected full `open_file`-style launch parity (over-promises a heavy side effect for a read). **Documented caveat (FR-013)**: when an app-down launch fires, the relaunched vault's active file may differ (null / last-open) from the pre-down state — the answer reflects post-launch focus. Any focus change here is an inherited recovery side effect, not a feature affordance (FR-019).

---

## D8 — Unicode pass-through, raw (Spec Q3, FR-004)

**Decision**: Return path/name characters exactly as the substrate reports them; no NFC/NFD normalization.

**Rationale**: No normalization code exists anywhere in `src` (verified by grep for `normaliz|NFC|NFD|.normalize(`); the cohort returns substrate strings as-is. Normalizing would diverge from the cohort and could mismatch an on-disk NFD name when the returned `path` is reused as a locator (FR-007). The base64/`TextDecoder` UTF-8 machinery in `_shared.ts` is about payload *input* survival (not used here, D4); the *output* round-trips through plain `JSON.stringify`/`parse`.

---

## D9 — Active-file-UI-state implement-T0 probe (Clarify directive)

**Decision**: At `/speckit-implement` time, run a forcing-gate T0 probe (per `.memory/test-execution-instructions.md`, driving `Obsidian.com`) confirming that a `target_mode:"specific"` eval against an **unfocused** named vault B (while vault A is focused) returns **B's** `getActiveFile()`, not A's. Also characterise the field shape against real notes: multi-dot name (`a.b.md`), no-extension file, non-ASCII path/name, and (best-effort) a leading-dot name. Findings recorded in `contracts/t0-probe-findings.md` (created at implement time).

**Rationale**: B1-false is verified for `vault=` *routing* cohort-wide (BI-0134), but the active file is *UI state* not yet probed for this surface. FR-011 / SC-006 (the cross-vault guarantee) depend on it. **Strong prior**: routing already proven; `getActiveFile()` reads the app instance the eval runs in. **Contingency**: if the probe shows specific-mode returns the *focused window's* active file rather than the named vault's, the cross-vault guarantee degrades and the spec/plan must be revised (e.g. specific mode constrained to the focused vault, or a documented limitation) — surfaced to the user before shipping, not silently shipped. The eval template and all other design elements are unaffected by the outcome.

---

## Cross-cutting: zero new error vocabulary (FR-016 / Principle IV / ADR-015)

The full error roster reuses existing codes only: `VALIDATION_ERROR` (schema — wrong mode fields, locator supplied, unknown field), `CLI_REPORTED_ERROR` with `details.code:"VAULT_NOT_FOUND"`/`reason:"unknown"` (D6) and the `decodeEvalEnvelope` malformed-eval classification, `CLI_NON_ZERO_EXIT`/`reason:"obsidian-not-running"` + `CLI_BINARY_NOT_FOUND` (inherited, D7). No new top-level code; no new `details.reason`. `ERR_NO_ACTIVE_FILE` is intentionally **not** used (D3).
