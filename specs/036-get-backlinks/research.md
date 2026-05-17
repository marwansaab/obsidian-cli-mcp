# Research: Backlinks — Inbound-Reference Inventory for a Single Note

**Branch**: `036-get-backlinks`
**Date**: 2026-05-17
**Phase**: 0 (Outline & Research)

Phase 0 decisions (R1..R12) plus plan-stage live-CLI probes (F1..F4) against the authorised `TestVault-Obsidian-CLI-MCP` (per `.memory/test-execution-instructions.md`). Cohort placement: this BI joins the **eval-driven typed-tool cohort** alongside BI-014 (`find_by_property`), BI-015 (`read_heading`), and BI-025 (`links`). The decisions below cite BI-025 wherever the wrapper's shape is a direct mirror.

## Phase 0 Decisions

### R1 — Architecture: `eval`-driven, NOT native `backlinks` subcommand

The new tool invokes `obsidian eval code="<rendered-js>"` via `invokeCli`. The frozen JS template inside the eval payload calls `app.metadataCache.getBacklinksForFile(file)` and post-processes the result. Same architecture as BI-025's `links` tool (which uses `app.metadataCache.getFileCache(f).{links, embeds, frontmatterLinks}` for outgoing) and BI-014 / BI-015 (which use eval for the same "upstream wire format cannot serialise the structured shape we need" reason).

**Rationale**: The user-facing contract (FR-003 per-source aggregation under `with_counts: true`; FR-005 envelope with optional per-source `count`; FR-014 code-block exclusion; FR-016 frontmatter inclusion) requires structured per-source metadata that the upstream `obsidian backlinks` subcommand is not known to expose. By analogy with BI-025 — where `obsidian help links` documented only plain-text output — the wrapper cannot trust the native subcommand to serve the locked envelope shape. Routing via `app.metadataCache.getBacklinksForFile()` gives the wrapper direct access to the host's combined backlinks cache (which already includes body + frontmatter sources uniformly per FR-016), eliminating the need to re-derive any link-graph plumbing. F1 below confirms the upstream-subcommand-shape gap at probe time.

**Alternatives considered**:
- **Native `obsidian backlinks --format json`** — rejected pre-probe per the BI-025 precedent. If F1 reveals that `backlinks` natively emits per-source-count JSON (a contract delta from `links`), the BI's plan can be revised to route via the native subcommand instead — but the wrapper-side aggregation, sort, cap, and envelope-emission logic stays identical because the user-facing contract is the same. F1 is the gating decision; if positive, switch to native; if negative (as expected by analogy with `links`), stay with eval.
- **Wrapper-side `files` enumeration + per-file `read` + client-side link parse** — rejected; the architecture is one CLI call per request per BI-025 R3; reimplementing the backlinks query client-side defeats the point of the tool (and re-derives the host's link parser, which the `.canvas`/code-block / alias edge cases would silently mishandle).
- **Direct filesystem `.md` walk + regex extraction** — rejected; outside the ADR-004 single-seam principle (cli-adapter is the sole bridge to vault state); regex extraction is exactly the fragile path the user spec calls out in the WHY section.

### R2 — Single-call architecture branched at envelope-emission

ONE `invokeCli` per request. The eval JS contains all conditional logic (`a.target_mode`, `a.with_counts`, `a.total`, `a.limit`); the same eval call answers default, `with_counts: true`, `total: true`, and capped variants. No client-side post-processing of the response payload beyond the standard staged parse (JSON.parse → discriminated-union safeParse → envelope-error → UpstreamError mapping per BI-025 handler shape).

**Rationale**: Parity with BI-025 R3. The cross-mode invariant (FR-005a per the 2026-05-17 Q1 clarification — `total: true` reports the full pre-cap count; `total: false` reports the post-cap entry-array length with `truncated: true` when clipping fires) holds by construction because the eval JS is the single source of truth for the outer `count` calculation. A two-call architecture (first call computes total, second call computes entries) would break atomicity (vault state could change between calls) AND would pay 2× the per-call cost without any contract win.

**Cost analysis**:
- All modes (default / `with_counts: true` / `total: true` / capped / truncated): **1 CLI call**. No mode pays a different cost.
- The cap-bypass under `total: true` (per Q1 / R9) does NOT add an extra call — the eval JS calculates the pre-cap count and post-cap slice in the same evaluation.

**Alternatives considered**:
- **Two calls: count-only then entries** — rejected per BI-025 R3 precedent and the atomicity concern above.
- **Cache + cursor pagination** — rejected; the cap-and-truncate signal (FR-011) is sufficient for v1; pagination is explicitly out-of-scope per the user spec.

### R3 — Source-corpus `.md`-only filter inside eval (Q2 — wrapper-side post-filter)

Per spec Clarification 2026-05-17 Q2=A: the source-note corpus is restricted to `.md` files only (case-insensitive extension match — `.md`, `.MD`, `.Md` accepted). The eval JS implements this as a post-filter on the keys of `getBacklinksForFile().data`:

```js
const data = (app.metadataCache.getBacklinksForFile(f) || {}).data || {};
const sources = Object.keys(data).filter(p => /\.md$/i.test(p));
```

**Rationale**: Q2 locked the wrapper-side post-filter (not the upstream level), uniform across execution paths. The filter MUST run BEFORE the per-source aggregation (so `.count` reflects `.md`-only references) AND BEFORE the sort/cap/envelope steps. Parity with `context_search` FR-017 and `search` FR-021 — both restrict their corpus to `.md` regardless of upstream classification.

**Implementation note**: the regex form `/\.md$/i` is intentional (case-insensitive — covers `.md`, `.MD`, `.Md`). String `.toLowerCase().endsWith('.md')` would equivalently work; the regex form is one expression and slightly faster on large vaults.

**Alternatives considered**:
- **Deferring to upstream's classification** — rejected per Q2. Obsidian's `getBacklinksForFile` may include `.canvas` sources (Canvas files embedding wikilinks to the target), which the project's mental-model contract (backlinks = "notes you can `read`") would silently violate.
- **String `.toLowerCase().endsWith('.md')`** — equivalent and acceptable; the regex form is the chosen idiom for consistency with similar filters in the codebase.

### R4 — Target resolution and non-`.md` rejection inside eval

Three-branch target resolver, identical to BI-025's `_template.ts`:

```js
let f;
if (a.active) {
  f = app.workspace.getActiveFile();
  if (!f) return JSON.stringify({ok:false, code:'NO_ACTIVE_FILE', detail:'No note focused; switch to specific mode or focus a note.'});
} else if (a.path) {
  f = app.vault.getFiles().find(x => x.path === a.path);
  if (!f) return JSON.stringify({ok:false, code:'FILE_NOT_FOUND', detail:'path: ' + a.path});
} else {
  f = app.metadataCache.getFirstLinkpathDest(a.file, '');
  if (!f) return JSON.stringify({ok:false, code:'FILE_NOT_FOUND', detail:'wikilink: ' + a.file});
}
if (f.extension !== 'md') return JSON.stringify({ok:false, code:'NOT_MARKDOWN', detail:'path: ' + f.path + ' extension: ' + f.extension});
```

**Rationale**: Parity with BI-025 R4 / F9. The three-branch resolver is the established convention for typed tools that consume the target_mode discriminator. The post-resolution `f.extension === 'md'` guard rejects Canvas / PDF / attachment targets per FR-020 — without the guard, `getBacklinksForFile(canvasFile)` would return either an empty result or undefined, masking the binary-attachment-target error path.

**Mapping in handler.ts** (mirrors BI-025 handler.ts:77-103):
- envelope `NO_ACTIVE_FILE` → `UpstreamError(ERR_NO_ACTIVE_FILE, stage:'envelope-error', detail)`
- envelope `FILE_NOT_FOUND` → `UpstreamError(CLI_REPORTED_ERROR, stage:'envelope-error', code:'FILE_NOT_FOUND', detail)`
- envelope `NOT_MARKDOWN` → `UpstreamError(CLI_REPORTED_ERROR, stage:'envelope-error', code:'NOT_MARKDOWN', detail)`

**Alternatives considered**:
- **Lifting the resolver to `_shared.ts`** — possible improvement, deferred. Two consumers (BI-025 and this BI) is the conventional threshold for a lift; a third consumer in a future BI would justify the lift. For v1, the resolver lives inside `backlinks/_template.ts` per BI-025 precedent.

### R5 — Unknown-vault outcome: structured error (eval-cohort)

Because R1 chooses `eval`, the cli-adapter's 011-R5 unknown-vault response-inspection clause FIRES for `backlinks`. Live probe F2 will confirm the expected behaviour: `obsidian vault=NonExistent eval code="…"` returns `Vault not found.` (plain text, exit 0); the clause reclassifies to `CLI_REPORTED_ERROR(code: 'VAULT_NOT_FOUND')`.

**Rationale**: Parity with BI-014 (`find_by_property`) / BI-015 (`read_heading`) / BI-025 (`links`). The structured-error path holds across all `eval`-driven tools. The wrapper's FR-018 commitment (structured error for unknown vault) is satisfied without any new top-level code AND without any handler-level classification logic — the inherited 011-R5 clause does the reclassification for free.

**Cohort separation**: tools routing via NATIVE subcommands (BI-019 `files`, BI-023 `outline`, BI-024 `properties`) observed upstream silently honouring `vault=` as a noop and settling on the inherited-limitation surface. Tools routing via `eval` (this cohort) observe the structured `Vault not found.` envelope and the 011-R5 clause fires. The cohort split is determined by execution path, not by tool intent.

**Alternatives considered**:
- **Pre-flight vault-existence check via `obsidian vaults`** — rejected; the 011-R5 clause already does the structured-error reclassification at zero additional cost; a pre-flight check would pay 2× the per-call cost on every backlinks call.
- **Wrapper-side `Vault not found.` parsing** — rejected; the cli-adapter is the single classification seam (ADR-004) and the 011-R5 clause is the canonical place for this rule.

### R6 — Per-source aggregation under `with_counts: true`

`getBacklinksForFile(file)` returns a `CustomArrayDict<LinkCache>` whose `.data` is an object keyed by source-note vault-relative path, valued by an array of `LinkCache` entries (one per occurrence of a reference from that source to the target). The eval JS computes per-source aggregates:

```js
const data = (app.metadataCache.getBacklinksForFile(f) || {}).data || {};
const sources = Object.keys(data).filter(p => /\.md$/i.test(p)).sort();
const preCapCount = sources.length;
const cap = a.total ? preCapCount : (a.limit || 1000);
const slice = sources.slice(0, cap);
const entries = slice.map(p => {
  const e = { source: p };
  if (a.with_counts) e.count = (data[p] || []).length;
  return e;
});
const env = { ok: true, count: a.total ? preCapCount : entries.length, backlinks: a.total ? [] : entries };
if (!a.total && preCapCount > cap) env.truncated = true;
return JSON.stringify(env);
```

**Rationale**:
- `data[p].length` is the correct per-source count because each `LinkCache` entry represents one reference occurrence from that source. The Obsidian metadata cache combines body links, body embeds, AND frontmatter links into the same backlinks dict (F3 will confirm), so the per-source count uniformly aggregates across all reference kinds (FR-016 frontmatter inclusion AND FR-015 alias-attribution because Obsidian's resolver already attributes aliased wikilinks to the resolved target).
- `count: 0` is impossible by construction — `Object.keys(data)` only includes sources with at least one entry.
- The `a.total` branch on the cap line implements FR-005a per Q1: `total: true` bypasses the cap (uses `preCapCount` as the cap so the slice is a no-op).
- The `env.count = a.total ? preCapCount : entries.length` line implements the cross-mode invariant: under `total: true` the outer count is the full pre-cap source count; under `total: false` the outer count equals `entries.length` which equals `slice.length` (the actual entry-array length).

**F3 verification case**: a vault where `Notes/Source.md` contains both a body wikilink `[[Target]]` AND a frontmatter property `related: "[[Target]]"`. Expected: `getBacklinksForFile(Target).data["Notes/Source.md"]` carries TWO LinkCache entries (one body, one frontmatter); the wrapper's `with_counts: true` response carries `{ source: "Notes/Source.md", count: 2 }`.

**Alternatives considered**:
- **Per-occurrence response shape** (`backlinks: [{ source, line, kind, displayText? }, ...]`) — rejected per spec Assumption "Per-source aggregation, NOT per-occurrence". The user spec frames the response as "list of source notes that reference it" (per-FILE framing). Per-occurrence would be a separate future tool.
- **Summing kinds separately** (`{ source, body_count, frontmatter_count, embed_count }`) — rejected per FR-007 / FR-016: uniform aggregation. Callers wanting kind breakdown iterate via `links` (BI-025) on each source.

### R7 — Self-reference inclusion (FR-013)

The eval does NOT filter the source-keys list against the target's own path. A note that links to itself appears in its own backlinks list, with `count` reflecting the number of self-references when `with_counts: true`.

**Rationale**: Locked at clarification stage (no Q asked because the user spec said "the contract picks either include or exclude and locks it" and the spec locked to include per FR-013). Matches Obsidian's "Backlinks" pane semantic; preserves bidirectional symmetry with the outgoing-links sibling `links` (which lists a note's outgoing self-link if any).

**Implementation note**: the lack of a filter is the load-bearing choice; no code is required to enable self-reference inclusion. Tests (handler.test.ts) MUST include a self-reference fixture to lock this behaviour against accidental future filtering.

### R8 — Code-block-only references excluded (FR-014)

`getBacklinksForFile()` returns only references the host's link parser classifies as real links — references inside fenced code blocks (e.g. `[[Target]]` written verbatim inside a triple-backtick block) and indented code blocks are NOT in the cache. The wrapper inherits this exclusion at zero additional logic cost.

**Rationale**: Defer-to-upstream for code-block opacity. The host's Markdown parser handles fenced/indented-code detection correctly; the wrapper does NOT add a Markdown parser of its own (would defeat the eval architecture and introduce a divergent parser).

**F4 verification case**: a vault where `Notes/CodeOnly.md` contains `[[Target]]` only inside a fenced code block (no body or frontmatter references outside the block). Expected: `getBacklinksForFile(Target).data` does NOT include `Notes/CodeOnly.md` as a key. The wrapper's response excludes `Notes/CodeOnly.md` from `backlinks`.

### R9 — Implicit-cap + `truncated` flag inside eval (FR-010 + FR-011 + Q1)

Per spec Clarification 2026-05-17 Q1=B: the cap applies ONLY when `!a.total`. Under `a.total`, the cap is bypassed and the outer `count` reports the full pre-cap source count.

The eval applies `a.limit ?? 1000` as the effective cap on `backlinks.length` only when `!a.total`. When `a.total`, the cap is set to `preCapCount` (effectively no cap). When the underlying source-key array exceeds the cap (only possible when `!a.total`), the eval slices to cap length AND sets `truncated: true` on the envelope. Under `a.total`, the `truncated` field is ABSENT (no clipping occurs).

**Rationale**: Locked at clarification stage per Q1. The cap exists to bound entry-array payload size; under `total: true` the response carries no entries, so the cap has nothing to bound. Capping `total: true`'s `count` would make the mode useless for the dominant "how many backlinks does this MOC note have?" use case.

**FR-005a verification at handler test level**: a fixture vault with 1500 source notes referencing one target. Three test variants:
- `total: false, limit: 50`: expected `count: 50, backlinks: 50-entries, truncated: true`.
- `total: false, limit: 10000`: expected `count: 1500, backlinks: 1500-entries, NO truncated`.
- `total: true`: expected `count: 1500, backlinks: [], NO truncated`.

The cross-mode invariant holds only when the underlying source set fits the entry-list cap (per the refined FR-005a). When the set exceeds the cap, `total: true` reports 1500 and `total: false` reports 1000 (with `truncated: true`) — the two `count` values legitimately diverge by Q1's commitment.

### R10 — Source-path ordering inside eval (FR-008)

The eval sorts the `.md`-filtered source-key array via `.sort()` (JavaScript's default lexicographic sort on strings — equivalent to UTF-16 code-unit ascending). The sort fires BEFORE the cap so the first N entries are deterministic.

**Rationale**: Matches the deterministic-ordering convention shared by `search` FR-019 and `context_search` FR-018. UTF-16 code-unit order is the natural JavaScript default; no custom comparator needed. Stability across vault state (FR-018 deterministic) holds because the sort key is the source-path string (uniquely keyed per `Object.keys(data)` semantics).

**Alternatives considered**:
- **`.localeCompare` (ICU collation-aware)** — rejected; non-deterministic across locales / Node versions; the project standardises on UTF-16 code-unit order (parity with `search` / `context_search`).
- **Caller-supplied sort order parameter** — rejected per spec Out of scope; callers re-sort client-side for alternative orderings (e.g. by `count` descending for refactoring prioritisation).

### R11 — Output-too-large kill via inherited cli-adapter (FR-024)

The post-cap response may still exceed the cli-adapter's 10 MiB output cap on extraordinarily long source-path strings. The inherited output-cap-kill surfaces as `CLI_NON_ZERO_EXIT` from `invokeCli`; the wrapper does NOT customise the message.

**Rationale**: Parity with BI-025 / BI-035 defer-to-cli-adapter pattern. The 10 MiB cap is the project's existing output-budget infrastructure (set in `src/cli-adapter/`); no new threshold or wrapper-side measurement is introduced. Routine cap-clipping surfaces as `truncated: true` per R9; only pathological cases (e.g. 1000 sources × 10 KB path each) cross the 10 MiB threshold and surface as `CLI_NON_ZERO_EXIT`.

**Test coverage**: `handler.test.ts` includes one test case that stubs `invokeCli` to throw the cli-adapter's output-cap-kill `UpstreamError` and asserts the wrapper propagates it verbatim (no customisation, no swallow).

### R12 — Anti-injection via base64-encoded JSON payload

User-supplied `vault` / `file` / `path` / `target_mode` / `with_counts` / `total` / `limit` flow through `JSON.stringify → Buffer.from.toString('base64') → atob/JSON.parse at JS runtime`. Frozen JS template with single `__PAYLOAD_B64__` substitution point. The handler imports the shared `B64_PAYLOAD_DECODE_EXPR` from `src/tools/_shared.ts` (the BI-034 UTF-8-safe decode helper — already in production).

**Rationale**: Parity with BI-014 / BI-015 / BI-025. The base64 wrapping ensures user input cannot escape the JSON payload into the surrounding JS template (no string-concatenation escape paths). The frozen template + single substitution point makes the surface trivially auditable (one line for the payload boundary). UTF-8 safety is handled by the BI-034 decode helper, which uses TextDecoder under the hood — verified against non-ASCII vault names and file names.

## Plan-stage live-CLI probes (to be executed before /speckit-tasks)

The four probes below MUST be executed against `TestVault-Obsidian-CLI-MCP` per `.memory/test-execution-instructions.md` before the `/speckit-tasks` phase. Findings are folded back into the spec (Clarifications section) if any case deviates from the eval-cohort precedent.

### F1 — Upstream `obsidian backlinks` subcommand shape

**Setup**: `obsidian help backlinks` on the host machine.
**Expected**: documents only plain-text output; no `format=json` flag; no per-source count fields. This is the gating finding for R1 (eval-vs-native).
**If F1 reveals native JSON support with per-source counts**: the BI's plan is revised to route via `obsidian backlinks --format json` instead. The wrapper-side aggregation, sort, cap, and envelope-emission logic stays IDENTICAL; only the `composeEvalCode` call is replaced with a parameter-passing call to `invokeCli` (cheaper because no JS template). The R5 unknown-vault cohort placement flips from eval-cohort to native-subcommand-cohort (inherited-limitation surface) — this WOULD require a spec amendment to FR-018.
**If F1 confirms plain-text only**: plan proceeds as written.

### F2 — Unknown-vault behaviour via eval (R5 confirmation)

**Setup**: `obsidian vault=NonExistent eval code="(()=>{return 'probe';})()"` on the host.
**Expected**: stdout `Vault not found.` (exit 0); cli-adapter's 011-R5 clause fires; classified as `CLI_REPORTED_ERROR(code: 'VAULT_NOT_FOUND')`.
**If F2 deviates**: revisit R5; potentially flip to inherited-limitation surface (would require a spec amendment to FR-018).

### F3 — Frontmatter-link inclusion in `getBacklinksForFile()` (R6 verification)

**Setup**: fixture vault with `Notes/Target.md` and `Notes/Source.md` where Source carries BOTH a body wikilink `[[Target]]` AND a frontmatter property `related: "[[Target]]"`. Probe via eval: `app.metadataCache.getBacklinksForFile(app.vault.getFiles().find(x=>x.path==='Notes/Target.md')).data["Notes/Source.md"].length`.
**Expected**: returns `2` (one LinkCache entry for the body wikilink, one for the frontmatter wikilink).
**If F3 reveals frontmatter is NOT counted**: revisit R6; the per-source `count` semantic would need an explicit frontmatter merge step (combining `getBacklinksForFile` result with a frontmatter-scan inside the eval). FR-016 still holds at the source-presence level, but the count semantic shifts.

### F4 — Code-block exclusion (R8 verification)

**Setup**: fixture vault with `Notes/Target.md` and `Notes/CodeOnly.md` where CodeOnly contains `[[Target]]` ONLY inside a fenced code block (no body or frontmatter references outside the block). Probe via eval: `Object.keys(app.metadataCache.getBacklinksForFile(target).data)` includes `Notes/CodeOnly.md`?
**Expected**: `Notes/CodeOnly.md` is NOT a key — Obsidian's link parser excludes code-block-only tokens from the backlinks cache.
**If F4 reveals CodeOnly IS a key**: revisit R8; the wrapper would need an additional source-side scan to exclude code-block-only sources, OR FR-014 would need amendment to defer to Obsidian's behaviour (whichever way it lands).

## Constitution Compliance pre-evaluation (per the plan template's Constitution Check gate)

All nine gates satisfied per the plan's Constitution Check table. Summary:

- **Principle I**: new module follows the `{schema, handler, index, _template}.ts` shape; imports flow one-way; no reach into `server.ts`.
- **Principle II**: ~57 co-located test cases planned across schema / handler / index.
- **Principle III**: zod input + output + eval-envelope schemas; `.strict()` everywhere; `z.infer` for downstream types; no hand-rolled types.
- **Principle IV**: zero new top-level error codes; all five envelope-error paths surface as `CLI_REPORTED_ERROR` with `details.stage` discriminators or as `ERR_NO_ACTIVE_FILE`; 011-R5 clause inherited for unknown-vault.
- **Principle V**: every new source file carries `// Original — no upstream.` header.
- **ADR-010**: tool name `backlinks` is single-word verbatim from upstream `obsidian backlinks` subcommand.
- **ADR-013 / 014 / 015**: N/A — native-CLI wrapper; no plugin; no new (top-level, details.code) pair.

## Graph-grounding analysis (per CLAUDE.md /speckit-plan guidance)

The plan's structural delta against the four kernel god-nodes per the CLAUDE.md "Validated architectural facts" section:

- **`createServer()`** — touched (one new factory invocation + one new import in `server.ts`). The change is additive and structurally identical to every prior typed-tool registration (BI-014 / BI-015 / BI-019 / BI-023 / BI-024 / BI-025 / BI-028 / BI-033 / BI-035 all followed this seam). Does not alter the boot spine's shape.
- **`UpstreamError`** — touched as the 34th importer. `backlinks/handler.ts` constructs `UpstreamError` instances at the same five sites as `links/handler.ts` (json-parse, envelope-parse, NO_ACTIVE_FILE → ERR_NO_ACTIVE_FILE, FILE_NOT_FOUND, NOT_MARKDOWN). Zero new top-level codes — the star-shape with `UpstreamError` at the centre is preserved.
- **`createLogger()` / `createQueue()`** — NOT touched at construction site. `backlinks/handler.ts`'s `ExecuteDeps` includes both as injected fields, matching the project's DI discipline. The factory passes them straight to `invokeCli` calls.

Community placement (CLAUDE.md /speckit-analyze rule 3): `backlinks/` MUST land inside the `src/tools/` community at the next `/graphify --update`. Surprise placement (e.g. orphan community, mis-clustering with `src/cli-adapter/`) would indicate a structural problem worth investigating before ship.

Connectivity verification (CLAUDE.md /speckit-analyze rule 4): new production files in `backlinks/` (schema.ts, handler.ts, index.ts, _template.ts) MUST be structurally connected via the registration path (`server.ts` → `index.ts` → factory → handler.ts → cli-adapter), NOT orphaned. Test files (schema.test.ts, handler.test.ts, index.test.ts) are expected to be weakly connected per CLAUDE.md hygiene note 2 (test files run 80-90% weakly-connected by design).
