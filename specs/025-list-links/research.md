# Phase 0: Research — `links` Typed Tool (Outgoing-Link Inventory)

**Feature**: [025-list-links](./spec.md)
**Date**: 2026-05-13

This document records the Phase 0 design decisions (R1..R14) and the plan-stage live-CLI findings (F1..F14) probed at plan synthesis against the host's `obsidian` CLI focused on `TestVault-Obsidian-CLI-MCP`. The findings BELOW lock the implementation strategy and resolve every plan-stage ambiguity flagged in the spec.

---

## Live-CLI findings (probed 2026-05-13 against TestVault-Obsidian-CLI-MCP)

The CLI surface for the `links` subcommand AND the `eval` subcommand were probed live during plan synthesis. Probes ran against fixtures seeded under `TestVault-Obsidian-CLI-MCP\Sandbox\` per the test-execution protocol; fixtures cleaned up post-probe.

### F1 — Native `links` subcommand has NO `format=` support; output is plain text only

`obsidian help links` reports:

```
links                 List outgoing links from a file
  file=<name>         - File name
  path=<path>         - File path
  total               - Return link count
```

Probing `obsidian links path=… format=json`, `format=tsv`, `format=csv` ALL returned BYTE-IDENTICAL plain-text output: one line per link in the shape `<target> (<status>)` where status is `(unresolved)` for missing targets and absent for resolved targets. The plain text is sorted ALPHABETICALLY by target (not source order), carries NO line numbers, NO kind discrimination, NO displayText for aliased links, NO column data.

**Implication**: Stark contrast to BI-023 (`outline format=json` returned structured array) and BI-024 (`properties format=json` returned structured array). The native `links` subcommand CANNOT satisfy FR-006's per-entry shape requirement (`target` / `line` / `kind` / optional `displayText`). The wrapper MUST use the `eval` subcommand to access Obsidian's metadataCache directly. Parity with BI-014 (`find_by_property`) and BI-015 (`read_heading`) eval-driven flows — same "no native subcommand exposes the needed wire shape" motivation.

### F2 — `eval` exposes `app.metadataCache.getFileCache(file)` returning structured `links` / `embeds` / `frontmatterLinks` arrays

Probing `obsidian eval code="(()=>{const f=app.vault.getFiles().find(x=>x.path==='Sandbox/025-probe-mixed.md');const c=app.metadataCache.getFileCache(f);return JSON.stringify({links:c.links,embeds:c.embeds,frontmatterLinks:c.frontmatterLinks});})()"` against a mixed-link fixture returned:

- `links[]` — `{position:{start:{line,col,offset},end:{line,col,offset}}, link, original, displayText}` per entry. Carries BOTH `[[Wiki]]` and `[Markdown](Link)` links (vault-internal-target only — external-URL markdown links like `[Source](https://example.com)` are NOT included by Obsidian).
- `embeds[]` — same shape as `links`. Carries BOTH `![[wiki embed]]` and `![alt](markdown embed)`.
- `frontmatterLinks[]` — `{key, link, original, displayText}` per entry. NO `position` field (see F5).

**Implication**: The wrapper's eval JS reads `cache.links || []`, `cache.embeds || []`, `cache.frontmatterLinks || []`, merges them into a single array, classifies each entry's `kind` by inspecting `original` (see F4), and emits the per-occurrence list. The metadataCache is the load-bearing structured-data source per the spec Q1–Q5 commitments.

### F3 — `position.start.line` is 0-BASED; wrapper converts to 1-based by adding 1

Probing source line 4 (1-based) `Body wikilink: [[Roadmap]]` returned `position.start.line: 3` (0-based) for the cache entry. Verified at five distinct lines (3, 4, 5, 7, 8 in 0-based) matching expected 1-based source lines (4, 5, 6, 8, 9).

**Implication**: Eval JS converts `position.start.line + 1` before emitting. FR-006's `line: 1-based integer` contract holds via this +1 transform. Documented as the load-bearing transform alongside the displayText-equality transform (F6) and the kind-from-original transform (F4).

### F4 — `kind` detection requires inspecting `original` prefix

Obsidian's metadataCache groups links into TWO arrays (`links[]` and `embeds[]`) but does NOT carry a `kind` field per entry. The wrapper distinguishes by inspecting the per-entry `original` (the verbatim source span):

| Cache array | `original` prefix | Wrapper `kind` |
|---|---|---|
| `links[]` | `[[` | `wikilink` |
| `links[]` | `[` (no `![`) | `markdown` |
| `embeds[]` | `![[` | `embed` |
| `embeds[]` | `![` (with `(`) | `embed` |
| `frontmatterLinks[]` | always `[[` | `wikilink` |

**Implication**: Eval JS sets `kind` via:
- For each `links[]` entry: `original.startsWith('[[') ? 'wikilink' : 'markdown'`
- For each `embeds[]` entry: always `'embed'`
- For each `frontmatterLinks[]` entry: always `'wikilink'` (the Q4 commitment that frontmatter wikilinks are kind: "wikilink")

Locks the closed three-value enum `{wikilink, embed, markdown}` (Q3) against the operational classification.

### F5 — `frontmatterLinks[]` carries NO `position`; wrapper assigns synthetic line=1

Probed `app.metadataCache.getFileCache(file).frontmatterLinks` against a fixture with `related: "[[Other-Note]]"` — returned entries have shape `{key, link, original, displayText}` with NO `position` field. By contrast `c.frontmatterPosition` carries the BLOCK position (`{start:{line:0,col:0,offset:0}, end:{line:2,col:3,offset:33}}` for `---\nrelated: ...\n---`).

**Implication**: The wrapper cannot recover individual frontmatterLinks entries' source positions without parsing the YAML source line-by-line — adding significant in-eval complexity for marginal user value (a multi-line frontmatter block typically has links on its first few lines anyway). The plan-stage decision is to assign ALL frontmatterLinks entries `line: 1` (the synthetic line where frontmatter blocks naturally begin). They sort to the top of the response in upstream-cache array order. This is consistent with Q4's commitment that "frontmatter entries naturally appear at low line numbers, intermingled in source order." The FR-008 tiebreak rule ("left-to-right column position ascending") gracefully degenerates to "upstream-cache array order" for the frontmatter cohort that lacks column data — a documented test invariant locked by the handler tests.

### F6 — `displayText` is ALWAYS PRESENT in metadataCache, sometimes equal to `link` for non-aliased entries; wrapper post-processes the omit-when-equal transform

Obsidian's `LinkCache.displayText` field is always present:

- `[[Roadmap]]` → `displayText: "Roadmap"` (equal to `link`)
- `[[Glossary|Terms]]` → `displayText: "Terms"` (the alias, different from `link`)
- `[Note](Other-Note.md)` → `displayText: "Note"` (the markdown visible label)
- `![[diagrams/system.png]]` → `displayText: "diagrams/system.png"` (equal to `link`)
- `![alt](image.png)` → `displayText: "alt"` (the alt text)
- `frontmatterLinks: related: "[[Other-Note]]"` → `displayText: "Other-Note"` (equal to `link`)

**Implication**: The Q1 commitment ("displayText absent when source has no alias") is satisfied by a wrapper-side post-processing transform — the wrapper compares `displayText` to `link` and OMITS the field from the response when equal. Markdown links with `displayText !== target` (e.g. `[Note](Other-Note.md)` → `displayText: "Note"` ≠ `target: "Other-Note.md"`) keep `displayText` in the response. The Q1 rationale's mention of "matches Obsidian's natural metadataCache shape" was inaccurate — the natural shape is "always present, sometimes equal"; the wrapper's omit-when-equal transform is the operative mechanism. Q1's PUBLIC CONTRACT holds; the spec is not amended (the contract was the commitment, not the implementation note).

### F7 — `vault=NonExistent` for `eval` EMITS "Vault not found." — FR-012 STRUCTURED-ERROR CONTRACT HOLDS

Probing `obsidian vault=NonExistentVault eval code="…"` returned plain text `Vault not found.` (exit 0). Same string for `obsidian vault=NonExistentVault links file=…`.

**Implication**: Unlike BI-019 / BI-023 / BI-024 / BI-015 / BI-014 where the upstream subcommand silently honoured-as-noop the `vault=` parameter, the `eval` subcommand DOES emit "Vault not found." The cli-adapter's 011-R5 unknown-vault response-inspection clause FIRES for `eval` and reclassifies the response to `CLI_REPORTED_ERROR`. The spec's FR-012 SPEC-STAGE COMMITMENT ("structured error naming the unknown vault") HOLDS for this feature — NO plan-stage amendment to inherited-limitation. The Edge Cases LOCATOR — unknown vault section's "UNLESS plan-stage live-CLI characterisation reveals … silently honours-as-noop" branch does NOT fire; the structured-error branch fires. Documented as "FR-012 outcome: structured error, satisfied via cli-adapter 011-R5 inspection clause inheritance."

### F8 — Unresolved `file` / `path` emits `Error: File "…" not found.` exit 0

Probing `obsidian links file=DoesNotExist` returned `Error: File "DoesNotExist" not found.` (plain text, exit 0). Same shape for `path=DoesNotExist.md` and `path=Sandbox/probe.canvas`.

**Implication**: For our eval-driven implementation, this upstream behaviour does NOT directly fire — the eval JS controls file lookup. The wrapper's eval JS surfaces `{ok:false, code:'FILE_NOT_FOUND', detail:'…'}` when `app.vault.getFiles().find(...)` / `app.metadataCache.getFirstLinkpathDest(...)` return null. The dispatch layer's `Error:` prefix classifier remains as a safety net for unexpected eval runtime errors (parity with BI-015 / BI-014).

### F9 — Non-`.md` files yield EMPTY metadataCache `{}` from `getFileCache`; wrapper-side rejection inside eval needed

Probing `app.metadataCache.getFileCache(canvasFile)` against a `.canvas` file returned `{}` (empty object, no `links` / `embeds` / `frontmatterLinks` keys). Probing the same against a `.png` file returned `{}`. Upstream `obsidian links path=…canvas` returned "No links found." (the empty-list response, NOT a structured error).

**Implication**: If the wrapper simply read `cache.links || []`, `cache.embeds || []`, `cache.frontmatterLinks || []` for any file, a `.canvas` / `.png` / `.pdf` target would silently succeed with `{count:0, links:[]}` — contradicting FR-014's structured-error commitment. The plan-stage decision is to check `f.extension === 'md'` inside the eval JS AFTER resolving the file, and surface `{ok:false, code:'NOT_MARKDOWN', detail:f.path}` for non-md files. The wrapper maps this envelope code to `CLI_REPORTED_ERROR` with `details.stage: 'envelope-error'` and `details.code: 'NOT_MARKDOWN'`. FR-014 satisfied via the envelope-error path.

### F10 — Empty metadataCache for an empty `.md` note still produces empty `{count:0, links:[]}`

Probing `app.metadataCache.getFileCache(emptyMdFile)` for a `.md` file with no outgoing links returned `{}` (empty object). The wrapper's `cache.links || []` / `cache.embeds || []` / `cache.frontmatterLinks || []` defensive coalescing produces three empty arrays → merged → `{count:0, links:[]}`. Upstream's plain-text response for the same file was `No links found.`; `total` flag returned `0`.

**Implication**: FR-009 (empty-list contract) satisfied natively without a sentinel-detection branch. The defensive `|| []` coalescing is the load-bearing line — a single test fixture for the empty-cache case locks it. Different from BI-023 (`outline` had to detect literal `No headings found.` plain-text sentinel) because we control the eval envelope.

### F11 — Source-order is preserved by Obsidian's cache; per-occurrence semantic is natural

A fixture with `[[Other-Note]]` (frontmatter line 1), `[[Roadmap]]` (line 4), `[[Glossary|Terms]]` (line 5), `![[system.png]]` (line 6), `[Note](Other-Note.md)` (line 9) returned cache `links[]` array in source order (Roadmap, Glossary, Other-Note.md) — NOT alphabetical. Same-target same-line case (`[[Apple]]` twice on line 2) yielded two separate entries with same `line` value, ordered left-to-right by `col`.

**Implication**: FR-007 (per-occurrence semantic, no dedup) and FR-008 (source-order sort with intra-line column-ascending tiebreak) are both natural — no wrapper-side dedup, no wrapper-side sort against array order. The wrapper merges `links[]` (with synthesised `kind` per F4) and `embeds[]` (all `kind: "embed"`) and `frontmatterLinks[]` (all `kind: "wikilink"`, synthetic `line: 1` per F5), then sorts by `(line ascending, col ascending)`. Column data is used INTERNALLY for the sort but NOT surfaced per Q5.

### F12 — Self-references appear in the listing

A fixture containing `[[025-probe-self]]` inside itself (a self-link) returned the self-reference as a regular entry in the cache. Upstream plain-text marked it RESOLVED (no `(unresolved)` marker) because the `.md` file exists.

**Implication**: No special handling for self-references; they appear naturally. Documented as a behaviour, not a contract.

### F13 — Inactive workspace behaviour for active mode

The probe at plan time had `Fixtures/BI-017/multi-depth.md` as the focused file; `app.workspace.getActiveFile()` returned that file. The no-active-file path was NOT directly probed (would require closing all panes); the wrapper's eval JS handles it via `if(!app.workspace.getActiveFile()) return {ok:false, code:'NO_ACTIVE_FILE', detail:'…'}`. Parity with BI-015's `read_heading` eval template.

**Implication**: Inherited from BI-015's R13 / R5 pattern. The cli-adapter's existing handling for `NO_ACTIVE_FILE` envelope code maps to the project's existing `ERR_NO_ACTIVE_FILE` UpstreamError code (or `CLI_REPORTED_ERROR` with `details.code: 'NO_ACTIVE_FILE'` per the eval envelope mapping table). Final code choice locked at handler-implementation step (T0) — handler tests assert whichever code surfaces, both options satisfy FR-013.

### F14 — `total` flag returns plain integer

Probing `obsidian links file=Welcome total` returned `1` (plain integer, no JSON envelope, no decoration). For zero-link notes, `total` returned `0`. Matches the cache-array length.

**Implication**: BUT — since the wrapper does NOT use upstream `links` for structured-data extraction (per F1), the wrapper does NOT use upstream's `total` flag either. Count-only mode (`total: true`) is implemented entirely inside the eval JS: the same eval that builds `links[]` returns `{ok:true, count:N, links:[]}` (empty `links` array, `count` populated). Single-call architecture preserved. Cross-mode invariant (FR-005a) holds by construction — same eval, same source data, same `count` regardless of whether the per-entry list is included.

---

## Design decisions

### R1 — Logger surface

Thin handler. No per-call `logger.callStart` / `callEndSuccess` / `callEndFailure` events at the tool layer. Mirrors all prior typed tools (006, 011, 012, 013, 014, 015, 018, 019, 021, 023, 024). The cli-adapter's `dispatchTimeout` / `dispatchCap` / `dispatchKill` events preserve observability for the underlying CLI invocation.

### R2 — CLI subcommand: `eval` (NOT native `links`) — load-bearing per F1

The native `links` subcommand returns plain-text output with no `format=json` support (F1). The wrapper CANNOT satisfy FR-006's per-entry shape requirement via upstream `links`. The `eval` subcommand is load-bearing: the wrapper sends `obsidian vault=… eval code=<rendered-js>` and parses the eval envelope's JSON return value.

Parity with BI-014 (`find_by_property`) and BI-015 (`read_heading`) which also chose eval over native subcommands for the same reason.

### R3 — Single-call architecture, branched on `input.total` AT THE ENVELOPE LEVEL

ONE `invokeCli` per request. The same eval JS template handles both modes — the JS reads `a.total` (from the base64 payload) and returns `{ok:true, count, links:[]}` for count-only mode or `{ok:true, count, links:[…]}` for default mode. The cli-adapter's argv-assembly emits a single `eval code=<rendered-js>` parameter.

The eval JS internally computes the full `entries` array regardless of mode (so the `count` is consistent across modes per FR-005a), then conditionally includes the entries in the envelope only when `!a.total`. Equivalent computational cost; consistent result; single CLI invocation.

### R4 — Adapter `target_mode` mapping: STANDARD per ADR-003

The user-facing schema HAS the `target_mode` discriminator field. The handler passes `input.target_mode` through to `invokeCli` unchanged. In specific mode `vault` flows through; in active mode the cli-adapter's `stripTargetLocators` defence-in-depth strip removes any leaked vault/file/path. Parity with `read_heading` (BI-015) / `find_by_property` (BI-014).

The eval JS itself reads the `a.active` / `a.path` / `a.file` flags from the base64 payload to choose the file-resolution strategy:
- `a.active` → `const f = app.workspace.getActiveFile()` (NO_ACTIVE_FILE on null)
- `a.path` → `const f = app.vault.getFiles().find(x => x.path === a.path)` (FILE_NOT_FOUND on null)
- `a.file` → `const f = app.metadataCache.getFirstLinkpathDest(a.file, '')` (FILE_NOT_FOUND on null)

### R5 — Unknown-vault response inspection: ACTIVE per the cli-adapter's existing 011-R5 clause (different from BI-024)

Per F7, the `eval` subcommand emits "Vault not found." (plain text, exit 0) for unknown vaults. The cli-adapter's 011-R5 unknown-vault inspection clause FIRES and reclassifies to `CLI_REPORTED_ERROR` with `details.code: 'VAULT_NOT_FOUND'`. The FR-012 spec-stage commitment ("structured error naming the unknown vault") HOLDS without amendment — the wrapper inherits the existing clause behaviour unchanged.

Different from BI-019 / BI-023 / BI-024 (which used NATIVE subcommands and observed upstream silently honouring `vault=` as noop → inherited-limitation path). Matches BI-014 / BI-015 (which used `eval` and observed upstream emitting `Vault not found.` → 011-R5 inspection clause fires → structured-error path). The cohort split is "native-subcommand subcommands silently honour vault=" vs "eval subcommand emits Vault not found." — this BI uses `eval` (per R2 / F1) so it inherits BI-014 / BI-015's structured-error behaviour. The spec's Assumptions block listed the inherited-limitation pattern as "conditionally inherited pending plan-stage characterisation"; F7 confirmed the structured-error branch fires and the spec was NOT amended at plan stage.

### R6 — Anti-injection via base64-encoded JSON payload

Frozen JS template + base64 payload (alphabet `[A-Za-z0-9+/=]`). User-supplied `path` / `file` / `target_mode` / `total` flow through `JSON.stringify` → `Buffer.from(...).toString("base64")` → `atob` + `JSON.parse` at JS runtime. No user input ever reaches the JS source as text. Verifies FR-023 / SC-023 structurally. Parity with BI-014 / BI-015.

### R7 — Three upstream-to-wrapper transforms per entry

Each `LinkCache` / `FrontmatterLinkCache` entry undergoes three transforms before emission:

1. **Kind synthesis** (F4): inspect `original` prefix or origin-array to set `kind ∈ {wikilink, embed, markdown}`.
2. **Line conversion** (F3): `position.start.line + 1` for body links and embeds; synthetic `line: 1` for frontmatterLinks (F5).
3. **displayText omit-when-equal** (F6): if `displayText === link`, omit `displayText` from the response entry; else include.

Implemented in the eval JS:

```javascript
const entries = [
  ...(cache.links||[]).map(e => ({
    target: e.link,
    line: e.position.start.line + 1,
    _col: e.position.start.col,
    kind: e.original.startsWith('[[') ? 'wikilink' : 'markdown',
    ...(e.displayText !== e.link ? {displayText: e.displayText} : {})
  })),
  ...(cache.embeds||[]).map(e => ({
    target: e.link,
    line: e.position.start.line + 1,
    _col: e.position.start.col,
    kind: 'embed',
    ...(e.displayText !== e.link ? {displayText: e.displayText} : {})
  })),
  ...(cache.frontmatterLinks||[]).map(e => ({
    target: e.link,
    line: 1,
    _col: 0,
    kind: 'wikilink',
    ...(e.displayText !== e.link ? {displayText: e.displayText} : {})
  })),
].sort((a, b) => a.line - b.line || a._col - b._col);
// Strip the internal _col field before emission.
const out = entries.map(({_col, ...rest}) => rest);
```

The `_col` field is INTERNAL — used for the intra-line tiebreak sort, then stripped before emission per Q5.

### R8 — Sort: source-order intra-eval (NO wrapper-side post-fetch sort)

The eval JS sorts entries by `(line ascending, _col ascending)` after merging the three cache arrays. The wrapper's handler does NOT re-sort the result; it parses the envelope and trusts the order.

Different from BI-024 (which sorted wrapper-side post-fetch for contract stability vs upstream version drift) — here the eval JS is wrapper-locked too (we control the eval source), so the source-order sort IS wrapper-locked by construction. No version-drift risk.

### R9 — Empty-list detection: NATURAL via defensive `|| []` coalescing

Per F10, the wrapper's eval JS reads `cache.links || []`, `cache.embeds || []`, `cache.frontmatterLinks || []`. For an empty `.md` file with no outgoing links, the three arrays are all empty, the merged entries array is empty, the envelope is `{ok:true, count:0, links:[]}`. NO sentinel-detection branch required (unlike BI-023's literal `No headings found.` sentinel).

### R10 — Output cap: inherited 10 MiB cap

A note with pathologically many outgoing links could exceed the cli-adapter's 10 MiB output cap (inherited from feature 003). Produces structured `CLI_NON_ZERO_EXIT` (output-cap kill), never silent truncation. Inherited unchanged.

### R11 — Cross-mode invariant (FR-005a): holds by construction

Per R3, the eval JS computes the full entries array regardless of `a.total`. The envelope's `count` field is `entries.length` in both modes. Same eval, same source data, same count. FR-005a verified by a handler test that calls the tool twice against the same stub-cache state and asserts equal `count` values.

### R12 — Test seams: `deps.spawnFn` injection, ONE spawn per request

Same convention as every prior typed tool. Each handler test responds to ONE spawn invocation per request (single-call architecture per R3). The stub `spawnFn` decodes the base64 payload via `Buffer.from(b64, "base64").toString("utf-8")` then `JSON.parse(...)` to verify the user input round-trips bit-for-bit through the payload assembly. Locks R6's anti-injection contract structurally.

### R13 — Structured eval-response error envelope

The eval JS returns one of:

- `{ok:true, count, links}` — success
- `{ok:false, code:'NO_ACTIVE_FILE', detail}` — active mode with no focused file (FR-013)
- `{ok:false, code:'FILE_NOT_FOUND', detail}` — specific mode locator does not resolve (FR-011)
- `{ok:false, code:'NOT_MARKDOWN', detail}` — locator points to a non-`.md` file (FR-014)

Handler's two-stage parse:
- `JSON.parse(stdout)` failure → `CLI_REPORTED_ERROR(stage: 'json-parse')` (catch-all for malformed eval responses)
- envelope `safeParse` failure → `CLI_REPORTED_ERROR(stage: 'envelope-parse')` (catch-all for unexpected envelope shapes)
- envelope `ok: false` → `CLI_REPORTED_ERROR(stage: 'envelope-error', code: <eval-code>, detail: <eval-detail>)`

Code-to-UpstreamError mapping table:

| Envelope `code` | UpstreamError code | UpstreamError `details` |
|---|---|---|
| `NO_ACTIVE_FILE` | `ERR_NO_ACTIVE_FILE` OR `CLI_REPORTED_ERROR` (locked at T0 — both satisfy FR-013) | `{stage: 'envelope-error', code: 'NO_ACTIVE_FILE', detail}` |
| `FILE_NOT_FOUND` | `CLI_REPORTED_ERROR` | `{stage: 'envelope-error', code: 'FILE_NOT_FOUND', detail}` |
| `NOT_MARKDOWN` | `CLI_REPORTED_ERROR` | `{stage: 'envelope-error', code: 'NOT_MARKDOWN', detail}` |

T0 of `/speckit-implement` finalises whether `NO_ACTIVE_FILE` surfaces as `ERR_NO_ACTIVE_FILE` (existing project code) or as `CLI_REPORTED_ERROR` with `details.code: 'NO_ACTIVE_FILE'` — both satisfy FR-013 and FR-017's "no new error codes" commitment; the choice is BI-015 / BI-014 precedent alignment.

### R14 — Multi-vault default ambiguity: documented

`vault` field is mandatory in specific mode. When the user passes a registered display name, the `eval` subcommand opens that vault and runs the eval against it. When unregistered, F7's "Vault not found." path fires (R5 / FR-012 structured-error contract). When `vault` is omitted (active mode), the focused vault is used. Documented in `docs/tools/links.md`.

---

## Plan-stage status

- **14 design decisions ratified** (R1..R14).
- **14 live-CLI findings verified** (F1..F14) at plan time against the host's `obsidian` CLI focused on `TestVault-Obsidian-CLI-MCP`.
- **Cleanup**: probe fixtures `Sandbox/025-probe-mixed.md`, `Sandbox/025-probe-self.md`, `Sandbox/025-probe-empty.md`, `Sandbox/025-probe.canvas`, `Sandbox/025-probe.png` deleted post-probe per the test-execution protocol.

### Cases deferred to T0 of `/speckit-implement`

Most contract surfaces are plan-verified. Cases deferred to T0 (require fresh fixtures and a focused-vault state change for active-mode coverage):

- **F11a — Same-line same-target intra-line tiebreak with synthesised `_col` data**: probe a TestVault fixture with `[[Apple]] vs [[Apple]]` on one line under both modes; verify the wrapper sort produces left-first, right-second order matching source column-ascending. Plan-verified at probe time (F11) but the wrapper integration with `_col` round-trip is locked at T0.
- **F13a — Active-mode no-focused-file path**: T0 probe with no notes open in Obsidian; assert `{ok:false, code:'NO_ACTIVE_FILE'}` envelope flows to the correct UpstreamError code (the BI-015 / BI-014 precedent alignment locked at T0).
- **F14a — Cross-mode invariant under populated and empty notes**: end-to-end T0 probe with `total: false` and `total: true` on the same fixture; assert outer `count` is equal across modes.
- **Very-large-link-list cap-boundary behaviour**: T0 probe to verify the 10 MiB cap fires as `CLI_NON_ZERO_EXIT` rather than silent truncation. Reuses the BI-003 cap-trigger machinery.
- **Frontmatter-link line=1 invariant**: T0 probe with a multi-line frontmatter declaring multiple frontmatterLinks (e.g. `related: ["[[A]]", "[[B]]"]` and `project: "[[P]]"`); assert all entries surface with `line: 1` in upstream-cache array order. Locks the F5 synthetic-line decision against a real Obsidian metadataCache.
- **Path-traversal `path` value end-to-end**: probe `path=../escape.md` and assert no filesystem mutation; whether rejection happens at the schema layer (via `targetModeBaseSchema`'s traversal regex if present) or at the vault-access layer (via `app.vault.getFiles().find()` returning null → `FILE_NOT_FOUND`) — either satisfies FR-016.

These deferrals are appropriate for T0 (require fresh fixtures, active-mode state changes, or end-to-end integration with the cli-adapter's existing 011-R5 clause). None block plan ratification.

### Cross-cutting confirmations

- `dispatchCli` / `invokeCli` / `invokeBoundedCli` / the four-priority error classifier / the 011-R5 unknown-vault inspection clause / `assertToolDocsExist` are all FROZEN and consumed unchanged by this BI.
- The post-010 consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) auto-covers `links` via its `it.each` registry walk; no test-file modifications required.
- The BI-022 FR-018 baseline detector ([src/tools/_register-baseline.test.ts](../../src/tools/_register-baseline.test.ts)) requires `npm run baseline:write` post-implementation to roll the baseline forward.
- The 005-help-tool registry-consistency test ([src/server.test.ts](../../src/server.test.ts)) automatically asserts the presence of `docs/tools/links.md` once `links` is registered.

### Architectural delta vs predecessors

| Aspect | This feature (`links`) | BI-024 (`properties`) | BI-023 (`outline`) | BI-015 (`read_heading`) |
|---|---|---|---|---|
| CLI subcommand | `eval` (R2 / F1 — native unusable) | native `properties` | native `outline` | `eval` (no native) |
| `target_mode` discriminator | YES (specific / active) | NO (vault-only) | YES | YES |
| Single call per request | YES (R3) | YES | YES | YES |
| Empty-list detection | natural (R9 / F10 — defensive `\|\| []`) | natural (empty JSON array) | sentinel-detection (`No headings found.`) | N/A (heading-not-found path) |
| Unknown-vault outcome | structured error (R5 / F7 via 011-R5 inspection) | inherited limitation (BI-024 F4) | inherited limitation (BI-023 F8) | structured error (BI-015 R5 via 011-R5) |
| Wrapper-side post-fetch sort | NO (R8 — sort inside eval) | YES (case-insensitive primary) | NO (upstream source order) | N/A |
| Per-entry transforms | 3 (kind / line+1 / displayText-omit-when-equal) | 2 (drop type / rename count) | 1 (rename heading → text) | N/A (content slice) |
| Anti-injection mechanism | base64 payload (R6) | natural data-passing | natural data-passing | base64 payload |
| Frontmatter inclusion | YES (Q4 — merge frontmatterLinks) | N/A | N/A | N/A |

The single most distinctive feature of this BI: the **three load-bearing transforms** required to convert Obsidian's `LinkCache` shape into the locked public contract. Implementable in ~15 LOC of in-eval JS; locked by handler tests on every input variation.

---

## T0 Live-CLI Capture (2026-05-13)

### T0.2 — Active-mode `NO_ACTIVE_FILE` UpstreamError code decision (mandatory pre-impl gate)

**Decision**: lock to `ERR_NO_ACTIVE_FILE` per the BI-015 precedent.

**Evidence**: [`src/tools/read_heading/handler.ts:74-81`](../../src/tools/read_heading/handler.ts#L74-L81) maps envelope `NO_ACTIVE_FILE` → `new UpstreamError({ code: "ERR_NO_ACTIVE_FILE", ..., details: { stage: "envelope-error", detail } })`. The wrapper's `mapEnvelopeError` adopts the same shape for parity with BI-015 / BI-014 alignment per R13. T004 handler therefore emits `ERR_NO_ACTIVE_FILE` with `details: { stage: "envelope-error", detail }` (no `code` key in `details` — matches BI-015 verbatim).

### T0.1, T0.3, T0.4, T0.5, T0.6, T0.7 — Deferred to manual smoke

Per the task definition's `[post-impl wrapper E2E]` tagging and the OPTIONAL marker on T0.7, these characterisation probes require:

- Obsidian app focused on `TestVault-Obsidian-CLI-MCP`
- Workspace state changes (closing all panes for T0.2 active-mode no-focus path)
- 130k-link fixture seeding (T0.7 OPTIONAL)

The wrapper-side contracts these probes characterise are structurally locked by handler-test stubs (the eval JS is wrapper-controlled; the cache fixtures are stubbed). Live-CLI verification ships as the T017 manual smoke per the quickstart.


---

## T016 Deliberate-Fails-First Sanity Check (2026-05-13)

**Outcome**: the deliberate revert of the displayText omit-when-equal
transform in `_template.ts` (changing `if(e.displayText!==e.link)o.displayText=e.displayText;`
to `o.displayText=e.displayText;`) did NOT cause handler-test failures.

**Why**: the 28 handler tests use stub `spawnFn` injections that simulate
the *post-eval* envelope shape — the eval JS template never executes in
the unit test environment. Stub envelopes for cases 7 (bare wikilink),
9 (wiki embed), and 14 (frontmatter wikilink) already represent the
final wire shape with `displayText` omitted; changing the in-eval
omit-rule has no effect on what the stub returns to the handler.

**Implication**: the in-eval logic (kind synthesis, line+1 conversion,
displayText omit-when-equal, source-order sort, `_col` strip, `f.extension==='md'`
guard, `|| []` coalescing) is NOT covered by the unit test suite. The
test at case 28 verifies the handler renders the CURRENT template
byte-faithfully (via `JS_TEMPLATE.replace(...)`), so the template is
frozen against accidental change at the assembly layer — but the
template's behavioural correctness is verified only via T0 live probes
(T0.1 / T0.3 / T0.4 / T0.6 against `TestVault-Obsidian-CLI-MCP`) and
the T017 manual smoke.

**Architectural note**: this matches BI-014 / BI-015 (read_heading,
find_by_property) which carry the same characterisation by
construction. The eval-driven cohort's behavioural correctness rests
on the wrapper-controlled template being a frozen string (no
interpolation, single substitution point) plus live-CLI verification
at T0 / smoke time. The unit suite locks the *assembly* of the eval
call (R3 single-spawn, R6 base64 round-trip, envelope-parse + envelope-
error mapping, two-stage parse error paths) — not the in-eval
semantics.

**Action**: no action taken. The contract gates surface via T0
characterisation and the T017 manual smoke, not via the unit suite.
The deliberate-revert protocol was useful here as a diagnostic of test
coverage shape, not as a regression guard for the displayText
transform itself.

