<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
[specs/026-smart-connections-similar/plan.md](specs/026-smart-connections-similar/plan.md)

Active feature: **026-smart-connections-similar** — adds the
**twelfth** typed-tool wrap and the project's **first plugin-backed
typed surface**. Tool name `smart_connections_similar` follows a NEW
**plugin-namespace prefix** naming convention `<plugin_name>_<operation>`
codified in [ADR-013](.decisions/ADR-013%20-%20Plugin-Namespace%20Tool%20Naming%20Convention.md)
(created during this BI's plan phase per FR-029) — a sibling track to
ADR-010's single-word-verbatim-from-upstream rule which applies only
to native-CLI-subcommand wrappers. User surface:
`smart_connections_similar({ target_mode, vault?, file?, path?,
limit?, total? })` returning
`{ count: number, matches: Array<{ path, headingPath, score }> }`.
Wraps the Smart Connections plugin's similarity API (`app.plugins.plugins
["smart-connections"].env.smart_sources.items[<key>].find_connections
({limit})`) reached via the `eval` subcommand — parity with BI-014 /
BI-015 / BI-025 (eval-driven cohort) but distinct in routing into a
plugin's runtime object rather than Obsidian's core metadataCache
(this BI is the first member of a new **eval-driven plugin-backed
cohort**). Single-call architecture branched **at envelope-emission on
`a.total`** (R3) — the same eval JS computes the full match array
regardless of mode; cross-mode invariant (FR-006a) holds by
construction. STANDARD `target_mode` discriminator per ADR-003. The
2026-05-15 clarifications session locked FIVE Q&As (Q1 docs-only
soft-pin for minimum plugin version, Q2 silently drop non-finite
scores via `Number.isFinite` filter, Q3 originally focused-vault
mismatch detection — REVISED by post-test live-probe amendment, Q4
outer-to-inner / cheapest-first error precedence chain, Q5
architecture-doc snapshot semantics — new file frozen vs base file
canonical) plus TWO live-probe-driven amendments (post-test
2026-05-15): amendment 1 contradicted Q3's premise (live probe
confirmed `vault=<name> eval` routes correctly to the named vault's
`app` instance — `app.vault.getName()` returns the requested name,
not the focused-window name) → FR-017a repurposed for closed-but-
registered vault detection (`details.code = "VAULT_NOT_FOUND"`,
`details.reason = "not-open"`); amendment 2 contradicted grilling-Q3
source-only granularity (live probe confirmed `find_connections()`
returns BLOCK-level matches by default; even `exclude_blocks: true`
filter returned zero source-level matches) → v1 per-match shape
switched from `{path, score}` to `{path, headingPath, score}` where
`path` is the source file (everything before first `#`) and
`headingPath` is an array of heading segments after the first `#`
(empty `[]` for source-level matches; literal `["---frontmatter---"]`
for frontmatter-block matches with the plugin's sentinel preserved
verbatim). Three-level sort intra-eval (R8 / FR-008): `score`
descending / `path` byte-asc / `headingPath.join("#")` byte-asc.
Source-path-keyed self-exclusion (R9 / FR-010) excludes source AND
blocks inside source. Closed-vault detection via empty-stdout
signature (R5a / FR-017a — observed by live probe 2026-05-15 after
user closed two vaults: CLI emits empty stdout + exit 0 AND
transparently OPENS the vault as side effect; cli-adapter's existing
011-R5 clause does NOT fire because no `Vault not found.` string in
empty output; detection branch lives in the typed-tool handler, NOT
in the cli-adapter — 008-refactor surface stays FROZEN). Eight-entry
failure-mode roster: `VALIDATION_ERROR`, `VAULT_NOT_FOUND` (with
`details.reason: "unknown" | "not-open"` sub-discriminator),
`FILE_NOT_FOUND`, `NO_ACTIVE_FILE`, `NOT_MARKDOWN`,
`SMART_CONNECTIONS_NOT_INSTALLED`, `SMART_CONNECTIONS_NOT_READY`,
`SOURCE_NOT_INDEXED` — ALL via `CLI_REPORTED_ERROR` with `details.code`
discriminator; **zero new top-level error codes**; the eleven-tool
zero-new-top-level-codes streak since BI-011 is preserved (per
FR-021). Error precedence chain (FR-017b): outer-to-inner /
cheapest-first; specific mode: `VAULT_NOT_FOUND(unknown)` →
`VAULT_NOT_FOUND(not-open)` → `SMART_CONNECTIONS_NOT_INSTALLED` →
`FILE_NOT_FOUND` → `NOT_MARKDOWN` → `SMART_CONNECTIONS_NOT_READY` →
`SOURCE_NOT_INDEXED` → success. Five documented inherited limitations:
embedding-model-dependent score bands; indexing freshness; folder
exclusions; plugin-version drift (surfaces via NOT_READY per Q1);
multi-vault basename ambiguity (vault= routes correctly but basename
lookup is per-vault). Anti-injection via base64-encoded JSON payload
+ frozen JS template (R6, parity with BI-014 / BI-015 / BI-025).
Plan-phase deliverables per FR-029 / FR-030 / FR-030a:
**ADR-013 created** (plugin-namespace tool-naming convention), the
**architecture snapshot file populated** as BI-026-frozen historical
artefact at `.architecture/Obsidian CLI MCP - Architecture with Smart
Connections.md`, AND the **canonical base architecture file rolled
forward** at `.architecture/Obsidian CLI MCP - Architecture.md`
(forward-going source-of-truth for future plugin BIs). Constitution
v1.3.0 → v1.4.0 amendment adds a seventh Compliance checklist row
for ADR-013. Additive surface; zero existing-tool public-shape
changes; zero new top-level error codes; ONE new ADR (ADR-013); NO
spec amendments at plan stage beyond the seven 2026-05-15
clarifications-session decisions + amendments already integrated.
Predecessor narratives for 025-list-links, 024-list-properties,
023-outline, 022-rename-typed-tools, 021-rename-note, 020-fix-write-gaps,
019-list-files, 018, 017, 015 retained below.

See also:

- [spec.md](specs/026-smart-connections-similar/spec.md) — feature
  spec; one /speckit-clarify session ran 2026-05-15 (Q1 docs-only
  soft-pin for minimum plugin version, Q2 silently-drop non-finite
  scores, Q3 vault-mismatch detection — superseded by live-probe
  amendment to closed-vault `not-open`, Q4 error-precedence chain,
  Q5 architecture-doc snapshot semantics); two live-probe-driven
  amendments to Q3 / grilling-Q3 ran 2026-05-15 post-test (vault=
  routing premise + block-level granularity).
- [plan.md](specs/026-smart-connections-similar/plan.md) —
  implementation plan; Constitution Check PASS on initial +
  post-Phase-1 evaluation; no Complexity Tracking entries.
- [research.md](specs/026-smart-connections-similar/research.md) —
  Phase 0 decisions R1..R14 (incl. R5a closed-vault detection branch,
  R7 path/headingPath extraction, R8 three-level sort, R9
  source-path-keyed self-exclusion, R10 non-finite-score filter, R11
  SOURCE_NOT_INDEXED detection, R13 precedence chain, R14
  plugin-namespace name) + plan-stage live-CLI/plugin findings F1..F14
  (vault= routes correctly; plugin API path; block-level shape;
  closed-vault empty-stdout transparent-open; three-vault probe data;
  limit-vs-threshold cap; score range).
- [data-model.md](specs/026-smart-connections-similar/data-model.md)
  — input/output/eval-envelope schema shapes
  (`smartConnectionsSimilarInputSchema` extends `targetModeBaseSchema`
  with `limit: 1..100 default 20` + optional `total`;
  `matchEntrySchema` strict with `{path, headingPath, score}`; eval
  envelope discriminated union with 6 envelope codes), frozen JS
  template (~60-80 LOC), base64 payload assembly, per-tool invariants
  table, module LOC budget (~230 source / ~1280 test), test inventory
  (20 / 32 / 5 = 57 cases), architectural delta map (first member of
  eval-driven plugin-backed cohort).
- [contracts/smart-connections-similar-input.contract.md](specs/026-smart-connections-similar/contracts/smart-connections-similar-input.contract.md)
  — public input contract: zod schema, emitted JSON Schema shape,
  field policy (6 fields), 8 worked examples (A–H), 15-row error
  response roster (incl. `VAULT_NOT_FOUND × 2 reasons` and handler
  stage codes), multi-vault basename-ambiguity note (inherited
  limitation #5), 15-row out-of-scope upstream surfaces table.
- [contracts/smart-connections-similar-handler.contract.md](specs/026-smart-connections-similar/contracts/smart-connections-similar-handler.contract.md)
  — handler invariants: deps shape, single invokeCli call shape
  (subcommand=eval, parameters.code=<rendered-js>), frozen JS template
  render (single `__PAYLOAD_B64__` substitution), multi-stage parse
  step (stage 0 closed-vault empty-stdout detection per R5a, stage 1
  `=> ` prefix strip, stage 2 JSON.parse, stage 3 envelope safeParse,
  stage 4 discriminate on `ok`, stage 5 return), envelope-error →
  UpstreamError mapping table (6 rows), failure propagation chain
  diagram, test seam pattern with base64 round-trip, single-spawn
  invariant.
- [quickstart.md](specs/026-smart-connections-similar/quickstart.md)
  — 31 verification scenarios Q-1..Q-28 (with Q-6a, Q-7a, Q-11a,
  Q-11b inserts) mapped to SC-001..SC-028; bulk in CI; 3 MANUAL T0
  cases (closed-vault, plugin-uninstall, full 17-case characterisation
  pass).
- [.decisions/ADR-013 - Plugin-Namespace Tool Naming Convention.md](.decisions/ADR-013%20-%20Plugin-Namespace%20Tool%20Naming%20Convention.md)
  — NEW ADR codifying the `<plugin_name>_<operation>` convention;
  sibling rule to ADR-010; mutually exclusive in scope and exhaustive
  over the typed-tool naming space.
- [.architecture/Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md)
  — canonical forward-going architecture document, rolled forward
  with the BI-026 changes (plugin-backed typed-content tools as
  fourth tool category; plugin-API routing-via-eval pattern;
  closed-but-registered vault detection branch; ADR-013 link).
- [.architecture/Obsidian CLI MCP - Architecture with Smart Connections.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture%20with%20Smart%20Connections.md)
  — BI-026-time-frozen snapshot; historical artefact; future BIs
  update the base file, not this snapshot.
- [.specify/memory/constitution.md](.specify/memory/constitution.md)
  — v1.3.0 → v1.4.0 amendment adds the seventh Compliance checklist
  row pointing at ADR-013; Sync Impact Report regenerated.

---

## Predecessor feature narrative (025-list-links) — RETAINED FOR CONTEXT

The 025 narrative below is retained for downstream cross-references
but is NOT the active planning context. Consult
[specs/026-smart-connections-similar/plan.md](specs/026-smart-connections-similar/plan.md)
for the active feature; consult
[specs/025-list-links/plan.md](specs/025-list-links/plan.md) for the
025 source. Summary: 025 added the (then-)twelfth typed-tool wrap
and the project's first link-graph primitive — outgoing-link
inventory for a single named note. User surface
`links({ target_mode, vault?, file?, path?, total? })` returning
`{ count, links: Array<{ target, line, kind, displayText? }> }`.
Wraps the upstream `eval` subcommand (NOT native `links` — F1 / R2
confirmed plain-text-only output). Closed three-value kind enum
`{wikilink, embed, markdown}` per Q3 clarification; frontmatter-link
inclusion via cache merge per Q4; displayText omit-when-equal
transform per Q1. Eval cohort with BI-014 / BI-015. Zero new error
codes; zero new ADRs; additive surface; PATCH version bump 0.5.2 →
0.5.3. Original detail below.

Active feature (pre-BI-026): **025-list-links** — adds the twelfth typed-tool wrap
and the project's **first link-graph primitive**. Tool name `links`
follows BI-022's single-word-verbatim-from-upstream convention (matches
the upstream `obsidian links` subcommand; parity with `outline` from
BI-023, `properties` from BI-024). User surface: `links({ target_mode,
vault?, file?, path?, total? })` returning `{ count: number, links:
Array<{ target, line, kind, displayText? }> }`. Wraps the upstream
**`eval` subcommand** (NOT native `links` — F1 / R2 confirmed the
native `links` subcommand is plain-text-only with no `format=json`
support; the wrapper CANNOT satisfy the locked per-entry shape via
upstream `links` and routes through `app.metadataCache.getFileCache`
inside eval — parity with BI-014 / BI-015, NOT BI-019 / BI-023 /
BI-024). Single-call architecture branched **at envelope-emission on
`a.total`** (R3) — the same eval JS computes the full entries array
regardless of mode; cross-mode invariant (FR-005a) holds by
construction. STANDARD `target_mode` discriminator per ADR-003
(specific / active). Three upstream-to-wrapper transforms per entry
(R7 / F3 / F4 / F6): (a) kind synthesis from `original` prefix or
origin-array — `links[]` → wikilink/markdown by `[[` vs `[`; `embeds[]`
→ embed; `frontmatterLinks[]` → wikilink (Q3 closed three-value
enum); (b) line conversion `position.start.line + 1` for body
links/embeds, synthetic `line: 1` for frontmatterLinks (F5 — cache
lacks per-entry position); (c) displayText omit-when-equal-to-target
(Q1 / F6 — Obsidian's natural shape is always-present-sometimes-equal;
wrapper omits when equal). Source-order sort intra-eval (R8 / FR-008)
with intra-line `_col`-ascending tiebreak, `_col` stripped before
emission (Q5). Frontmatter-link inclusion intermingled in source order
(Q4 / FR-006b). The 2026-05-13 clarifications session locked FIVE
Q&As: Q1 displayText absent-when-no-alias, Q2 heading/block fragment
embedded in `target`, Q3 closed three-value `kind` enum (no bare
URLs), Q4 frontmatter-link inclusion, Q5 column NOT surfaced
(internal-only sort key). The 2026-05-13 plan-stage findings F1–F14
confirmed all five Q&As survive live-CLI verification AND resolved
FR-012's unknown-vault outcome — `eval` DOES emit "Vault not found."
(F7), so the cli-adapter's 011-R5 inspection clause FIRES and the
spec-stage structured-error commitment HOLDS without amendment.
Different from BI-019 / BI-023 / BI-024 inheritance pattern in this
single respect; matches BI-014 / BI-015 inheritance for the eval
cohort. F9 confirmed non-`.md` files yield `{}` empty cache → wrapper
guards in-eval via `f.extension === 'md'` check, surfacing envelope
code `NOT_MARKDOWN` → `CLI_REPORTED_ERROR`. F10 confirmed empty-list
contract is natural via `|| []` coalescing (no sentinel-detection
branch). Anti-injection via base64-encoded JSON payload + frozen JS
template (R6, parity with BI-014 / BI-015). Additive surface; zero
existing-tool public-shape changes; zero new error codes; zero new
ADRs; NO spec amendments at plan stage. Predecessor narratives for
024-list-properties, 023-outline, 022-rename-typed-tools,
021-rename-note, 020-fix-write-gaps, 019-list-files, 018, 017, 015
retained below.

See also:

- [spec.md](specs/025-list-links/spec.md) — feature spec; one
  /speckit-clarify session ran 2026-05-13 (Q1 displayText
  absent-when-no-alias, Q2 fragment embedded in `target`, Q3 closed
  three-value `kind` enum, Q4 frontmatter-link inclusion, Q5 column
  not surfaced); zero plan-stage spec amendments.
- [plan.md](specs/025-list-links/plan.md) — implementation plan;
  Constitution Check PASS on initial + post-Phase-1 evaluation; no
  Complexity Tracking entries.
- [research.md](specs/025-list-links/research.md) — Phase 0 decisions
  R1..R14 + plan-stage live-CLI findings F1..F14 (14 findings spanning
  native `links` plain-text-only output, metadataCache shape for
  links/embeds/frontmatterLinks, 0-based-to-1-based line conversion,
  kind detection via `original` prefix or origin-array, frontmatterLinks
  lacks position → synthetic line=1, displayText always-present in
  cache → wrapper omit-when-equal, `eval` emits "Vault not found." for
  unknown vault → 011-R5 clause FIRES, `getFileCache(canvasFile)`
  returns `{}` → in-eval `f.extension === 'md'` guard, empty cache →
  empty-list natural, source-order preserved by cache, self-references
  appear, no-active-file path, `total` integer return semantic).
- [data-model.md](specs/025-list-links/data-model.md) — input/output/
  eval-envelope schema shapes (STANDARD target_mode discriminator;
  `linksInputSchema` extends `targetModeBaseSchema` with optional
  `total`), frozen JS template with three load-bearing transforms,
  base64 payload assembly, per-tool invariants table, module LOC
  budget (~195 source / ~1120 test), test inventory (18 / 28 / 5 = 51
  cases), architectural delta map vs predecessors (eval-driven cohort
  with BI-014 / BI-015).
- [contracts/links-input.contract.md](specs/025-list-links/contracts/links-input.contract.md)
  — public input contract: zod schema, emitted JSON Schema shape,
  field policy, seven worked examples (A–G), error response roster
  (VALIDATION_ERROR / VAULT_NOT_FOUND / FILE_NOT_FOUND × 2 / NOT_MARKDOWN
  / NO_ACTIVE_FILE / json-parse / envelope-parse / cap-kill), multi-vault
  note (structured error, NOT inherited-limitation — different from
  BI-019 / BI-023 / BI-024), out-of-scope upstream surfaces table
  (format=json / total flag at CLI level / bare URLs / fragment as
  separate field / column field / source-discriminator / resolved
  flag / original / endLine,endColumn / backlinks / multi-hop /
  vault-wide / canonical-path / request-side filter,sort all rejected).
- [contracts/links-handler.contract.md](specs/025-list-links/contracts/links-handler.contract.md)
  — handler invariants: deps shape, single invokeCli call shape
  (subcommand=eval, parameters.code=<rendered-js>), frozen JS template
  render (single `__PAYLOAD_B64__` substitution), multi-stage parse
  step (stage 0 `=> ` prefix strip, stage 1 JSON.parse, stage 2
  envelope safeParse, stage 3 discriminate on `ok`, stage 4 return),
  envelope-error → UpstreamError mapping table (NO_ACTIVE_FILE →
  ERR_NO_ACTIVE_FILE or CLI_REPORTED_ERROR per T0 lock; FILE_NOT_FOUND
  / NOT_MARKDOWN → CLI_REPORTED_ERROR(stage: envelope-error)), failure
  propagation chain diagram, test seam pattern with base64 round-trip,
  single-spawn invariant.
- [quickstart.md](specs/025-list-links/quickstart.md) — 24 verification
  scenarios Q-1..Q-24 mapped to SC-001..SC-024; Q-1..Q-18 in CI;
  Q-19..Q-24 manual against TestVault during T0 of /speckit-implement.

---

## Predecessor feature narrative (024-list-properties) — RETAINED FOR CONTEXT

The 024 narrative below is retained for downstream cross-references
but is NOT the active planning context. Consult
[specs/025-list-links/plan.md](specs/025-list-links/plan.md) for the
active feature; consult
[specs/024-list-properties/plan.md](specs/024-list-properties/plan.md)
for the 024 source. Summary: 024 added the eleventh typed-tool wrap
and the project's SECOND structural-discovery primitive (after BI-023
outline). User surface `properties({ vault?, total? })` returning `{
count, properties: Array<{ name, noteCount }> }`. Wraps upstream
`obsidian properties format=json` natively (NOT eval). Two
clarifications-session Q&As (Q1 case-insensitive primary sort with
byte-order tiebreak, Q2 `total: true` outer count = distinct names)
plus one plan-stage amendment (F4 unknown-vault → documented inherited
limitation per upstream silently-honoured-as-noop `vault=`). Wrapper-
side post-fetch sort applied for drift-adjacent display (`Tags` next
to `tags`). NO target_mode discriminator — vault-only surface. Additive
surface; PATCH version bump 0.5.1 → 0.5.2; zero new error codes; zero
new ADRs. Original detail below.

Active feature: **024-list-properties** — adds the eleventh typed-tool
wrap and the project's **second** structural-discovery primitive (after
BI-023 `outline`). Tool name `properties` follows BI-022's single-word-
verbatim-from-upstream convention (matches the upstream `obsidian
properties` subcommand; parity with `files` from BI-019 post-rename).
User surface: `properties({ vault?, total? })` returning `{ count:
number, properties: Array<{ name, noteCount }> }`. Wraps the upstream
`properties` subcommand natively (NOT eval — F1 / R2 confirmed
`format=json` returns the structured array shape directly).
Single-call architecture branched on `input.total` (default →
`format=json` parameter; count-only → `total` flag). NO `target_mode`
discriminator (vault-only surface — different from `outline` / `read` /
`read_heading` / etc.); ADR-003 NOT APPLICABLE. Two upstream-to-wrapper
transforms per entry: DROP `type` (per FR-004 — type metadata out of
scope), RENAME `count` → `noteCount` (per FR-007 — avoids collision
with outer envelope's `count`). Wrapper-side post-fetch sort (R8 /
FR-013): case-insensitive primary with byte-order tiebreak —
drift-adjacent display (`Tags` next to `tags`) per the 2026-05-13 Q1
clarification. The 2026-05-13 clarifications session locked TWO Q&As:
Q1 sort order (drift-adjacent case-insensitive primary), Q2 outer
`count` semantic when `total: true` (distinct names count, not
sum-of-occurrences). The 2026-05-13 plan-stage finding F3 CONFIRMED Q2
holds by upstream construction (upstream's `total` flag returns array
length, not sum-of-counts — verified live with 73 distinct names / 4159
total occurrences). The 2026-05-13 plan-stage finding F4 drove ONE
spec amendment: FR-015 rewritten from "MUST surface a structured
error" to "MUST be documented as an inherited limitation" — live probe
revealed `vault=` is silently honoured-as-noop by the upstream
`properties` subcommand (parity with BI-019 / BI-023 / BI-015 / BI-014
defer-to-upstream pattern). Additive surface; zero existing-tool
public-shape changes; zero new error codes; zero new ADRs.

See also:

- [spec.md](specs/024-list-properties/spec.md) — feature spec; one
  /speckit-clarify session ran 2026-05-13 (Q1 sort order
  case-insensitive primary, Q2 `total: true` outer count = distinct
  names); one plan-stage amendment ran 2026-05-13 (F4 unknown-vault
  → documented inherited limitation per upstream silently-honoured-
  as-noop `vault=`).
- [plan.md](specs/024-list-properties/plan.md) — implementation plan;
  Constitution Check PASS on initial + post-Phase-1 evaluation; no
  Complexity Tracking entries.
- [research.md](specs/024-list-properties/research.md) — Phase 0
  decisions R1..R14 + plan-stage live-CLI findings F1..F14 (14
  findings spanning native subcommand structure, wire-format
  `{name, type, count}` shape, `counts` flag no-op for JSON,
  `total` flag distinct-names semantic CONFIRMED, vault-routing
  silently-honoured-as-noop, type-metadata drop, count-to-noteCount
  rename, per-file scope different wire shape OOS, name= integer OOS,
  sort=count frequency-order OOS, path-traversal deferred to T0,
  empty-vault deferred to T0, body-content opacity deferred to T0,
  case-distinct sort deferred to T0, wire-format leniency).
- [data-model.md](specs/024-list-properties/data-model.md) — input/
  output/upstream-wire schema shapes (NO target_mode; plain
  `z.object({vault, total}).strict()`), handler shape with
  multi-stage parse step (default mode) + single-stage (count-only
  mode) + wrapper-side post-fetch sort, per-tool invariants table,
  module LOC budget (~140 source / ~920 test), test inventory (16 /
  24 / 5 = 45 cases), architectural delta map vs predecessors.
- [contracts/properties-input.contract.md](specs/024-list-properties/contracts/properties-input.contract.md)
  — public input contract: zod schema, emitted JSON Schema shape,
  field policy, seven worked examples (A–G), error response roster,
  multi-vault inherited limitation, out-of-scope upstream surfaces
  table (file=/path=/active/name=/sort=/counts/format= all rejected).
- [contracts/properties-handler.contract.md](specs/024-list-properties/contracts/properties-handler.contract.md)
  — handler invariants: deps shape, single invokeCli call shape × 2
  modes, multi-stage parse step (default mode: JSON.parse → zod
  validation → drop type + rename count → post-fetch sort) +
  single-stage parse step (count-only mode: integer parse), failure
  propagation chain, test seam pattern, single-spawn invariant.
- [quickstart.md](specs/024-list-properties/quickstart.md) — 21
  verification scenarios Q-1..Q-21 mapped to SC-001..SC-021;
  Q-1..Q-17 in CI; Q-18..Q-21 manual against TestVault during T0 of
  /speckit-implement.

---

## Predecessor feature narrative (023-outline) — RETAINED FOR CONTEXT

The 023 narrative below is retained for downstream cross-references
but is NOT the active planning context. Consult
[specs/024-list-properties/plan.md](specs/024-list-properties/plan.md)
for the active feature; consult
[specs/023-outline/plan.md](specs/023-outline/plan.md) for the 023
source. Summary: 023 added the tenth typed-tool wrap and the project's
FIRST structural-discovery primitive — `outline({ target_mode, vault?,
file?, path?, total? })` returning `{ count, headings: Array<{ level,
text, line }> }`. Wraps upstream `obsidian outline format=json`
natively. Empty-outline detection (R9 sentinel `No headings found.`)
is the only load-bearing handler quirk. Three clarifications-session
Q&As (Q1 marker-strip, Q2 indented-code defer-to-upstream, Q3 non-`.md`
rejection) + one plan-stage amendment (F10 Setext defer-to-upstream).
Additive surface; PATCH version bump 0.5.0 → 0.5.1; zero new error
codes; zero new ADRs. Original detail below.

Tool name `outline` follows BI-022's single-word-verbatim-from-upstream
convention (matches the upstream `obsidian outline` subcommand). User
surface: `outline({ target_mode, vault?, file?, path?, total? })`
returning `{ count: number, headings: Array<{ level, text, line }> }`.
Wraps the upstream `outline` subcommand natively (NOT eval — F1 / R2
confirmed `format=json` returns the structured array shape directly).
Single-call architecture branched on `input.total` (default →
`format=json` parameter; count-only → `total` flag — mutually exclusive
per F14). Empty-outline files return upstream literal `No headings
found.` plain text — handler detects sentinel and maps to `{ count: 0,
headings: [] }` for both modes (R9, the only load-bearing handler
quirk). FR-027 non-`.md` filetype rejection satisfied entirely by
upstream + dispatch-layer's `Error:`-prefix classifier (R8 / F9). The
2026-05-13 spec clarifications session locked three Q&As: marker-
stripping (Q1/A1 strip-leading-marker + closing-ATX + surrounding-
whitespace — satisfied automatically by upstream per F3), indented-
code-block opacity (Q2/A2 deferred-to-upstream — confirmed F12), and
non-`.md` rejection (Q3/A3 wrapper boundary — actually satisfied by
upstream per F9). The 2026-05-13 plan-stage finding F10 drove ONE spec
amendment: FR-013 rewritten from "Setext MUST NOT be returned" to
"Setext defers to upstream" — live probe revealed upstream INCLUDES
Setext entries, applying same Q2/A2 defer-to-upstream pattern keeps the
single-call architecture intact.

See also:

- [spec.md](specs/023-outline/spec.md) — feature spec; one
  /speckit-clarify session ran 2026-05-13 (Q1 marker-strip, Q2
  indented-code defer-to-upstream, Q3 non-`.md` rejection); one
  plan-stage amendment ran 2026-05-13 (F10 Setext defer-to-upstream).
- [plan.md](specs/023-outline/plan.md) — implementation plan;
  Constitution Check PASS on initial + post-Phase-1 evaluation; no
  Complexity Tracking entries.
- [research.md](specs/023-outline/research.md) — Phase 0 decisions
  R1..R14 + plan-stage live-CLI findings F1..F16.
- [data-model.md](specs/023-outline/data-model.md) — input/output/
  upstream-wire schema shapes, handler shape with two-stage parse
  step, per-tool invariants table, module LOC budget (~145 source /
  ~930 test), test inventory (18 / 28 / 5 = 51 cases).
- [contracts/outline-input.contract.md](specs/023-outline/contracts/outline-input.contract.md)
  — public input contract: zod schema, emitted JSON Schema shape,
  field policy, seven worked examples (A–G), error response roster.
- [contracts/outline-handler.contract.md](specs/023-outline/contracts/outline-handler.contract.md)
  — handler invariants: deps shape, single invokeCli call shape × 2
  modes, two-stage parse step (default mode) + single-stage (count-
  only mode), failure propagation chain, test seam pattern.
- [quickstart.md](specs/023-outline/quickstart.md) — 23 verification
  scenarios Q-1..Q-23 mapped to SC-001..SC-021.

---

## Predecessor feature narrative (022-rename-typed-tools) — RETAINED FOR CONTEXT

The 022 narrative below is retained for downstream cross-references
but is NOT the active planning context. Consult
[specs/023-outline/plan.md](specs/023-outline/plan.md) for the active
feature; consult [specs/022-rename-typed-tools/plan.md](specs/022-rename-typed-tools/plan.md)
for the 022 source. Summary: 022 was a surface-rename sweep aligning
five typed tools to upstream Obsidian CLI subcommand names. Single-
release MINOR-bump breaking change (`0.4.4` → `0.5.0`); no deprecation
aliases. Renamed `read_note → read`, `delete_note → delete`,
`list_files → files`, `write_property → set_property`, `rename_note →
rename`. Schema fields, output shapes, and error codes byte-identical
pre vs post rename — only the names changed. Introduced the durable
FR-018 baseline machinery (`src/tools/_register-baseline.{json,ts,test.ts}`
+ `scripts/write-register-baseline.ts` + `npm run baseline:write`)
that every future BI mutating the tool registry rolls forward in the
same commit. The 023-outline BI consumes this machinery — adds one
new tool (`outline`), rolls the baseline forward via `npm run
baseline:write`. Original detail follows verbatim.

**Punch-list** (locked):

- `read_note` → `read` (FR-003 single-word verbatim — upstream `read`)
- `delete_note` → `delete` (FR-003)
- `list_files` → `files` (FR-003 — drops wrapper-invented `list_` prefix)
- `write_property` → `set_property` (FR-004 — `namespace:action`
  reversal of upstream `property:set`)
- `rename_note` → `rename` (FR-003)

**022-rename-typed-tools touch surface** (LOCKED): RENAMED dirs via
`git mv` preserving git-blame history —
[src/tools/read_note/](src/tools/read_note/) → `src/tools/read/`,
[src/tools/delete_note/](src/tools/delete_note/) → `src/tools/delete/`,
[src/tools/list_files/](src/tools/list_files/) → `src/tools/files/`,
[src/tools/write_property/](src/tools/write_property/) →
`src/tools/set_property/`,
[src/tools/rename_note/](src/tools/rename_note/) → `src/tools/rename/`.
Each dir keeps its `{schema, handler, index}.ts` plus three co-located
`*.test.ts` files; bodies byte-identical save for factory-function-name
updates in `index.ts` (`createXxxNoteTool` → `createXxxTool` etc., per
Q1 lockstep). EDITED: [src/server.ts](src/server.ts) (5 import-name
updates + tools-array re-sort; alphabetical-by-import-path because
ESLint's `import/order` rule with `alphabetize: asc` constrains
imports — the only conflict with the data-model's factory-name sort
is `read/` vs `read_heading/` / `read_property/`, where ASCII `/`
(47) < `_` (95) puts `read/` first; the tools-array follows the same
order for internal consistency),
[src/tools/_register.test.ts](src/tools/_register.test.ts) (5
invariants-map key renames + new durable baseline test suite + a
no-retired-names assertion). NEW: `src/tools/_register-baseline.json`
(FR-018 registry-stability baseline; SHA-256 fingerprints of every
published tool's description + inputSchema),
`src/tools/_register-baseline.ts` (shared canonicalJSON / sha256 /
fingerprintLiveRegistry helper consumed by both the verifier test
and the regen script — locked at /speckit-analyze U6 remediation),
`src/tools/_register-baseline.test.ts` (co-located unit tests for the
shared helper per Principle II),
[scripts/write-register-baseline.ts](scripts/write-register-baseline.ts)
(regen script invoked via `npm run baseline:write`), and the matching
`baseline:write` entry in [package.json](package.json) `scripts`.
RENAMED docs: `docs/tools/{read_note → read,
delete_note → delete, list_files → files, write_property →
set_property, rename_note → rename}.md` via `git mv`. EDITED:
[README.md](README.md), this CLAUDE.md active-narrative block,
[docs/tools/index.md](docs/tools/index.md). EDITED release mechanics:
[CHANGELOG.md](CHANGELOG.md) (new `## [0.5.0]` section with single
migration block per FR-010), [package.json](package.json) (`0.4.4` →
`0.5.0`).

**Clarifications session 2026-05-12** (locked at /speckit-clarify):

- **Q1 (lockstep)**: source dirs AND factory functions rename together
  with the registered tool name. `createReadNoteTool` →
  `createReadTool`; `src/tools/read_note/` → `src/tools/read/`; etc.
  across all five. Upholds the path-matches-name convention every
  prior typed tool follows; eliminates path/name drift.
- **Q2 (durable test)**: FR-018's registry-stability test ships as
  permanent machinery, not transient. The checked-in baseline at
  `src/tools/_register-baseline.json` is rolled forward by every
  future BI that intentionally adds, removes, or renames a tool —
  in the same commit as the registry change. Catches accidental
  renames in every future feature, not just this BI's intended five.
- **Q3 (narrow sweep)**: tool-name references rewritten ONLY in
  `README.md`, `docs/tools/*.md`, and this CLAUDE.md active-narrative
  block. `.decisions/` ADR text, `.architecture/` docs,
  `CONTRIBUTING.md`, source-code comments in `src/`, and predecessor
  `specs/0XX-*/` files NOT proactively swept (stale references age
  along with the rest of their content).

**Architectural addition** (FR-018): the durable registry-stability
test is the visible structural delta from this BI. The baseline JSON
stores `{ name, descriptionFingerprint, schemaFingerprint }` per tool
(SHA-256 hex of canonicalised JSON). The test loads the baseline and
asserts `expect(live).toEqual(baseline.tools)` against fingerprints of
the live registry. Failure modes (any registry mutation) produce a
vitest deep-equality diff naming the deviating tool and the changed
fingerprint. The baseline file is checked in at a pinned path; the
test lives in `src/tools/_register.test.ts` as a new `describe(...)`
block beside the existing per-tool invariants drift detector. The two
coexist: invariants detect schema-shape drift; the baseline detects
byte-level mutations including description text. Contract at
[contracts/registry-baseline.contract.md](specs/022-rename-typed-tools/contracts/registry-baseline.contract.md).

**Compatibility / release**: this BI is a breaking-change rename
sweep. No new error codes (FR-008); no new ADRs; no ADR amendments;
no schema-field renames (FR-016); behaviour byte-identical for every
renamed tool (FR-005..FR-007, SC-002 / SC-003). The handler-layer
filetype widening that the new names imply (e.g. `read` operating on
Canvas / PDF / attachments, not just Markdown) is tracked separately
under **BI-060**, which ships after this rename per the spec's
out-of-scope guard. The temporary mismatch where new names imply
broader scope than the description text describes is accepted and
resolved when BI-060 lands (before v1.0). Version bump 0.4.4 → 0.5.0
(MINOR; pre-v1.0 semver permits MINOR-level breaking).

See also:

- [spec.md](specs/022-rename-typed-tools/spec.md) — feature spec; one
  /speckit-clarify session ran 2026-05-12 (Q1 lockstep, Q2 durable
  test, Q3 narrow sweep).
- [plan.md](specs/022-rename-typed-tools/plan.md) — implementation
  plan; Constitution Check PASS on initial + post-Phase-1 evaluation;
  no Complexity Tracking entries.
- [research.md](specs/022-rename-typed-tools/research.md) — Phase 0
  decisions R1..R10 (git-mv mechanic, baseline JSON format, doc-file
  mechanic, CHANGELOG shape, version bump target, server.ts edit
  shape, invariants-map sweep, README/index sweep, this CLAUDE.md
  rewrite, baseline capture timing).
- [data-model.md](specs/022-rename-typed-tools/data-model.md) —
  rename punch-list table, alphabetical-sort tables for server.ts
  imports + tools-array + invariants map, baseline JSON shape + 11-
  tool worked example, per-tool invariants confirmation pre = post.
- [contracts/registry-baseline.contract.md](specs/022-rename-typed-tools/contracts/registry-baseline.contract.md)
  — FR-018 durable test contract; baseline schema, canonicalisation
  rule, three test assertions, baseline-roll-forward protocol.
- [contracts/changelog-migration-block.contract.md](specs/022-rename-typed-tools/contracts/changelog-migration-block.contract.md)
  — FR-010 migration block shape; section header, required content
  blocks (headline / migration / internal / references), structural
  rules.
- [quickstart.md](specs/022-rename-typed-tools/quickstart.md) — 12
  verification scenarios Q-1..Q-12 mapped to SC-001..SC-010; no
  manual/live-CLI scenarios (wrapper-side rename only).

---

## Predecessor feature narrative (021-rename-note) — RETAINED FOR CONTEXT

The 021 narrative below is retained for downstream cross-references
but is NOT the active planning context. Consult
[specs/022-rename-typed-tools/plan.md](specs/022-rename-typed-tools/plan.md)
for the active feature; consult
[specs/021-rename-note/plan.md](specs/021-rename-note/plan.md) for
the 021 source. Summary: 021 added the ninth typed-tool wrap, an
in-place rename primitive for `.md` notes registered as `rename_note`
at the time and renamed to `rename` in this 022 sweep. Public surface:
`{ target_mode, vault?, file?, path?, name }` → `{ renamed: true,
fromPath, toPath }`. Wraps the Obsidian CLI's `rename` subcommand
natively (not eval). The wrapper appends `.md` to `name` upstream of
the CLI unless `name.endsWith(".md")` (literal, case-sensitive byte
equality — mirroring 020-fix-write-gaps R2). Folder-separator
rejection at the schema layer per /speckit-clarify Q2 (`name` matches
`/^[^/\\]+$/`); folder relocation deferred to a future `move_note`
typed tool wrapping the CLI's `move` subcommand. Link-rewriting is
vault-config-dependent — the vault's "Automatically update internal
links" setting governs whether existing wikilinks are rewritten; the
wrapper documents the dependency rather than enforcing it. Zero new
error codes; zero new ADRs. See [021
spec.md](specs/021-rename-note/spec.md) and [021
plan.md](specs/021-rename-note/plan.md) for the full detail. Note:
post-022 rename, the registered tool name is `rename`, the source
dir is `src/tools/rename/`, and the factory function is
`createRenameTool` — the body of the implementation and the
clarifications-decided contracts are otherwise unchanged.

---

## Predecessor feature narrative (020-fix-write-gaps) — RETAINED FOR CONTEXT

The 020 narrative below is retained for downstream cross-references
but is NOT the active planning context. Consult
[specs/021-rename-note/plan.md](specs/021-rename-note/plan.md) for
the active feature; consult
[specs/020-fix-write-gaps/plan.md](specs/020-fix-write-gaps/plan.md)
for the 020 source. Summary: 020 closed two narrow handler-layer
contract gaps in the existing `write_note` operation against the
016-reliable-writer surface — (1) short-form-name target resolution:
when `input.file` matches the canonical short-form shape (no `/` or
`\` AND not ending in `.md`), the handler resolves the target to
`<input.file>.md` at the vault root; non-canonical `input.file`
shapes pass through verbatim; and (2) `FILE_EXISTS` additive
`details.errno: "EEXIST"` enrichment for field-name parity with
`FS_WRITE_FAILED.details.errno`. R2 locked the predicate as three
literal-character checks (`!file.includes("/") && !file.includes("\\")
&& !file.endsWith(".md")`) — case-sensitive byte equality, NOT
`path.extname`. The 021-rename-note `appendMdIfMissing` helper
inherits the same `endsWith(".md")` precedent. Zero new error codes;
zero new ADRs; zero schema edits. Module unchanged at
`src/tools/write_note/handler.ts` (~8 LOC of new helper + 1 line of
`details.errno` addition). See
[020 spec.md](specs/020-fix-write-gaps/spec.md) and [020
plan.md](specs/020-fix-write-gaps/plan.md) for the full detail.

---

## Predecessor feature narrative (019-list-files) — RETAINED FOR CONTEXT

The 019 narrative below is retained for downstream cross-references
but is NOT the active planning context. Consult
[specs/021-rename-note/plan.md](specs/021-rename-note/plan.md)
for the active feature; consult
[specs/019-list-files/plan.md](specs/019-list-files/plan.md) for the
019 source. Summary: 019 added the eighth typed-tool wrap (`list_files`),
the project's first FOLDER-scoped typed surface. Where the prior seven
typed tools (`read_note` / `write_note` / `delete_note` /
`read_property` / `find_by_property` / `read_heading` /
`write_property`) all operate on a single named file or the focused
file, `list_files` operates on a vault folder. The user-facing surface:
`list_files({ target_mode, vault?, folder?, ext?, total? })` returning
`{ count: number, paths: string[] }`. The CLI subcommand is `files`
(native, NOT eval); the most consequential architectural finding was
R6 — the CLI's `files folder=X` returns the RECURSIVE subtree, and
the wrapper enforces FR-012's non-recursive contract by filtering
post-fetch. Zero new error codes; zero new ADRs. Module at
`src/tools/list_files/{schema,handler,index}.ts`. See [019
spec.md](specs/019-list-files/spec.md) and [019
plan.md](specs/019-list-files/plan.md) for the full detail.

---

## Predecessor feature narrative (018-write-property) — RETAINED FOR CONTEXT

The 018 narrative below is retained for downstream cross-references
but is NOT the active planning context. Consult
[specs/019-list-files/plan.md](specs/019-list-files/plan.md) for the
active feature; consult
[specs/018-write-property/plan.md](specs/018-write-property/plan.md)
for the 018 source. Summary: 018 added the seventh typed-tool wrap
(`write_property`), the symmetric write companion to
[013-read-property](specs/013-read-property/spec.md). The CLI
subcommand `property:set` (native, NOT eval) drove the wrapper.
Per-mode call architecture: ONE spawn for specific+path, TWO spawns
for specific+file (`file` → `property:set`) and active (`eval` →
`property:set`). Type inference from JS value shape (FR-008). Empty
array maps to literal `value=[]` (R10 / F2). Cross-type overwrite
satisfied by native CLI behaviour (FR-033 / F3). Plan-stage spec
amendments: R8 CRLF preservation PARTIAL; R7 YAML flow→block
normalisation observable. Zero new error codes; zero new ADRs. Module
at `src/tools/write_property/{schema,handler,index}.ts`. See [018
spec.md](specs/018-write-property/spec.md) and [018 plan.md](specs/018-write-property/plan.md)
for the full detail.

---

## Predecessor feature narrative (017-cross-platform-support) — RETAINED FOR CONTEXT

The 017 narrative below is retained for downstream cross-references
but is NOT the active planning context. Consult
[specs/018-write-property/plan.md](specs/018-write-property/plan.md)
for the active feature; consult
[specs/017-cross-platform-support/plan.md](specs/017-cross-platform-support/plan.md)
for the 017 source. Summary: 017 lifted the bridge's Windows-only
restriction by extracting binary resolution into
`src/binary-resolver/`, a three-tier fall-through (OBSIDIAN_BIN →
platform-default → PATH-via-OS-spawn) verified via
`fs.access(X_OK)` predicate. The error envelope's
`CLI_BINARY_NOT_FOUND.details` gained `{platform, attempts[], PATH}`
in place of the legacy `binaryAttempted` field; zero new error codes;
the 008-refactor surface and the 011-R5 unknown-vault inspection
clause were preserved unchanged. README and `package.json` description
bumped from "Windows-host" to tri-platform framing per FR-019.
See [017 spec.md](specs/017-cross-platform-support/spec.md) and
[017 plan.md](specs/017-cross-platform-support/plan.md) for the full
detail.

---

## Predecessor feature narrative (015-read-heading) — RETAINED FOR CONTEXT

The narrative below is from the predecessor `015-read-heading`
feature; it is retained for downstream cross-references but is NOT the
active planning context. Resume reading the active 017 narrative
above.

Adds `read_heading`, the
**sixth** typed-tool wrap and the first **heading-targeted retrieval
primitive**. Where `read_note` returns whole files (5–50k tokens for
long documents) and `read_property` returns a single frontmatter
field, `read_heading` returns just the body of a single named section
(typically 100–500 tokens) — replacing the agent's "full read_note +
client-side Markdown parse" sequence with a single typed call. The
user-facing tool surface:
`read_heading({ target_mode, vault?, file?, path?, heading })`
returning `{ content: string }`. The `heading` field is a
`::`-separated path with at least two non-empty segments
(`H1::H2` or `H1::H2::H3`); single-segment H1-only reads, headings
whose text contains `::` literally, and Setext underline-style
headings are explicitly out of reach (documented fallback: full-file
`read_note` plus client-side parse). `obsidian_exec` remains as the
freeform escape hatch.

**Schema** (STANDARD target_mode discriminator idiom — NOT 014's flat
departure): reuses [`targetModeBaseSchema`](src/target-mode/target-mode.ts)
extended with `heading: z.string().min(1).refine(validateHeadingPath)`.
The validator is structural-only per FR-006 / FR-007: split on the
literal `::`, require ≥2 non-empty segments. The `applyTargetModeRefinement`
helper provides specific/active enforcement (vault required-in-specific,
file/path XOR, vault/file/path forbidden-in-active) per the post-010
flat extension idiom. Heading existence is NOT pre-validated — semantic
resolution is a runtime concern surfaced as `CLI_REPORTED_ERROR` with
`details.code = "HEADING_NOT_FOUND"`.

**Output shape**: `z.object({ content: z.string() }).strict()`. Single-
string contract — no metadata sidecar (FR-009).

**Eval-envelope wire schema**: `z.discriminatedUnion("ok", [...])`
strict union. `{ok: true, content: string}` on success;
`{ok: false, code: "FILE_NOT_FOUND" | "HEADING_NOT_FOUND" | "NO_ACTIVE_FILE", detail: string}`
on failure. Handler's two-stage parse (`JSON.parse` then envelope
safeParse) maps both wire-format failures and envelope `ok: false`
onto existing `UpstreamError` codes per FR-022 (zero new error codes).

**Live-CLI surface** (verified during plan via `obsidian help` and
probes against the focused vault on 2026-05-09; happy-path verification
against `TestVault-Obsidian-CLI-MCP` deferred to T0 because the test
vault was not focused at probe time):
- **No native heading-body subcommand exists** in the Obsidian CLI's
  80+ commands. `read` returns whole files (no `subpath` param);
  `outline` lists headings (no body content); `bookmark` accepts
  `subpath` but writes a bookmark; `read` + client-side parse defeats
  the spec's "single typed call replaces the brittle parse" promise
  (SC-015). R2 lock — `eval` is load-bearing.
- subcommand: **`eval`** (developer section) — load-bearing departure
  (parity with 014). The user input itself anticipated this with the
  "the bridge's eval primitive with the input passed as data" clause.
- **SINGLE-CALL ARCHITECTURE (R3)**: each MCP request fires ONE
  `invokeCli` invocation with subcommand `eval` and parameter
  `code=<rendered-js>`. The JS template resolves the file path
  (active mode `app.workspace.getActiveFile()`, specific+path direct,
  specific+file via `app.metadataCache.getFirstLinkpathDest`), walks
  `app.metadataCache.metadataCache[fc.hash].headings`, finds the first
  matching segment-path, slices the file content via
  `await app.vault.adapter.read(path)`, and returns one JSON envelope.
  ~200 ms per call.
- **CRITICAL R7 finding**: Obsidian's pre-parsed `headings` array
  (probed live against `000-Meta/About This Vault.md`) carries
  `{heading, level, position: {start: {offset}, end: {offset}}}` per
  ATX heading. **Obsidian has ALREADY done ATX-marker recognition AND
  fence-opacity** — heading-like text inside fenced code blocks does
  NOT appear in the headings array. Body slicing is just
  `text.slice(headings[matchIdx].position.end.offset,
  headings[matchIdx+1]?.position.start.offset ?? text.length)` with a
  leading-line-terminator strip. This collapses the spec-stage
  assumption of an in-eval line-by-line ATX scanner with explicit
  fence tracking into a metadata-cache lookup.
- **Anti-injection via base64-encoded JSON payload (R6)**: parity with
  014. Frozen JS template + base64 payload (alphabet `[A-Za-z0-9+/=]`).
  User-supplied `path` / `file` / `heading` flow through
  `JSON.stringify` → `Buffer.from(...).toString("base64")` → `atob` +
  `JSON.parse` at JS runtime. No user input ever reaches the JS source
  as text. Verifies FR-021 / SC-021 structurally.
- **Adapter `target_mode` mapping (R4)**: STANDARD — the user-facing
  schema HAS the `target_mode` field. The handler passes
  `input.target_mode` through to `invokeCli` unchanged. In specific
  mode `vault` flows through; in active mode the cli-adapter's
  `stripTargetLocators` defence-in-depth strip removes any leaked
  vault/file/path. Parity with 013-read-property.
- **Inherited vault-routing limitation**: the CLI's `vault=` parameter
  is functionally ignored by `eval` (probed live — `obsidian
  vault=TestVault... eval ...` returned The Setup's name). Multi-vault
  users open the target vault before invoking. Same limitation as
  014 / 013 / 011. Documented in `docs/tools/read_heading.md`.
- unknown-vault response (R5 inheritance): `Vault not found.` exit 0
  byte-identical across `eval` (cited from 014's verification) and
  prior typed tools' subcommands. The cli-adapter's existing 011-R5
  inspection clause re-classifies to `CLI_REPORTED_ERROR`;
  `read_heading` inherits unchanged.
- **Setext exclusion (R14 defence-in-depth)**: the JS template filters
  the headings array via `text.charAt(h.position.start.offset) === '#'`
  to enforce Q2's ATX-only rule regardless of Obsidian's metadataCache
  behaviour on the host's version. T0 verifies whether the filter is
  functional or a no-op.
- output cap (R10): the cli-adapter's existing 10 MiB cap fires for
  pathologically large body slices — produces a structured
  `CLI_NON_ZERO_EXIT` (output-cap kill), never silent truncation.
- **Structured eval-response error envelope (R13)**: handler's two-
  stage parse wraps `JSON.parse` failure as
  `CLI_REPORTED_ERROR(stage: json-parse)`, envelope-schema-parse
  failure as `CLI_REPORTED_ERROR(stage: envelope-parse)`, and envelope
  `ok: false` codes per the R13 mapping table — `NO_ACTIVE_FILE` →
  `ERR_NO_ACTIVE_FILE`; `FILE_NOT_FOUND` and `HEADING_NOT_FOUND` →
  `CLI_REPORTED_ERROR(stage: envelope-error, code: <eval-code>)`.

**Clarifications session 2026-05-09**: three Q&As resolved at spec
stage and codified in spec.md before plan. (Q1) Body terminator rule —
locked **first-subsequent-heading-marker-of-any-depth** (FR-010); the
parenthetical "sibling-or-higher" and the explicit "no child subtrees"
collapse onto this single rule. (Q2) Heading marker syntax — locked
**ATX only**; Setext underlines are content, not boundaries. Setext
added to out-of-scope; Q2 also drives R14's defence-in-depth filter.
(Q3) Heading-path segment matching — locked **minimal-normalisation,
case-sensitive byte compare** (FR-028); inline markdown and Obsidian
anchor markers survive in the comparison.

**Logger surface (R1)**: same outcome as 011 / 012 / 013 / 014. Thin
handler; no per-call `logger.callStart` / `callEndSuccess` /
`callEndFailure` events at the tool layer. The cli-adapter's
`dispatchTimeout` / `dispatchCap` / `dispatchKill` events preserve
observability for the underlying CLI invocation.

**Module layout**: `src/tools/read_heading/{schema,handler,index}.ts`
(post-011 convention — `index.ts` not `tool.ts`); factory
`createReadHeadingTool(deps)`; all three new source files carry the
`// Original — no upstream.` header per Constitution V. Tests
co-located: `src/tools/read_heading/{schema,handler,index}.test.ts`
— **55 cases total** (20 schema / 30 handler / 5 registration). Higher
than 014's 47 because the schema layer needs target_mode discriminator
coverage AND structural-heading-path validator coverage, and the
handler layer needs additional segment-matching characterisation
(closing-ATX, surrounding whitespace, inline markdown, anchor markers,
mis-cased) AND CRLF/LF round-trip locks.

**Cross-cutting**: zero new error codes (FR-022 + Constitution IV);
zero new ADRs (ADR-003 enforced via `applyTargetModeRefinement`
reuse); 008-refactor surface frozen — `dispatchCli`, `invokeCli`,
`invokeBoundedCli`, `assertToolDocsExist`, `obsidian_exec` argv
contract, AND the 011-R5 cli-adapter unknown-vault response-inspection
clause all preserved. `read_note` / `write_note` / `delete_note` /
`read_property` / `find_by_property` / `obsidian_exec` / `help`
byte-stable (SC-016); only `src/server.ts` registration list grows by
two lines: one import, one tools-array entry, alphabetical position
between `createObsidianExecTool` and `createReadNoteTool`. The
post-010 consolidated drift detector at
[src/tools/_register.test.ts](src/tools/_register.test.ts) auto-covers
`read_heading` via its `it.each` registry walk — no test-file
modifications required.

**FR-025 plan-stage characterisation**: 23 cases enumerated in spec
(post-/speckit-analyze A1 remediation: 19 → 23 — SC-020's count was
out of date with FR-025's actual enumeration; the original 18 cases
plus Setext (Q2) plus four segment-matching cases (Q3) total 23).
Of those, 20 are deferred to T0 of `/speckit-implement` (the 4 added
by /speckit-analyze A2 remediation are empty-body, duplicate-first-
match, file-not-found-path, file-not-found-wikilink); 3 are plan-
verified (2-seg happy, 3+-seg nested, unknown-vault).
Critical architecture-locking findings verified live during plan:
F1 — no native heading-body subcommand; F2 — eval argv shape;
F3 — eval `=> ` prefix on stdout; F4 — eval errors as `Error: <msg>`
caught by dispatch-layer classifier; F5 — `app.vault.adapter.read`
async + string return; F6 — `app.metadataCache.metadataCache[hash].headings`
shape (`{heading, level, position}` with byte offsets); F7 — vault-
routing limitation reproduced; F8 — sandbox empty cleanup verified.
Cases deferred to T0 (require fixtures in TestVault and the test vault
opening): segment-matching characterisation (closing-ATX, surrounding-
whitespace, inline-markdown-survives, anchor-survives, mis-cased);
Setext-as-content (verifies R14 defence-in-depth filter); fenced-
code-block-with-inside-heading; CRLF / LF round-trip; duplicate
heading path first-match; very-large-body cap-boundary; active-mode
focused-note happy path; active-mode no-focus error; file-not-found
error; specific-mode unresolved-locator.

**Compatibility / release**: this BI is additive — no existing tool
changes, no error codes added, no ADRs amended. Public surface gains
one new typed tool. Version bump `0.2.7 → 0.2.8` (patch — purely
additive surface). The new typed surface is disclosed in
`CHANGELOG.md`; the multi-vault default-ambiguity limitation
(R11), the eval-as-CLI-entry-point stability concern (R2), the
documented fallback for out-of-reach paths (single-segment H1-only,
`::`-in-text, Setext), and the practical 10 MiB body ceiling (R10) are
called out in `docs/tools/read_heading.md`.

See also:
- [spec.md](specs/015-read-heading/spec.md) — feature spec; one clarifications session ran 2026-05-09 (Q1 boundary rule, Q2 ATX-only, Q3 segment-matching minimal-normalisation); all three codified directly in the spec.
- [research.md](specs/015-read-heading/research.md) — Phase 0 decisions R1–R14 + live CLI findings F1–F8 (R1 logger surface; R2 `eval` subcommand load-bearing departure; R3 single-call architecture; R4 standard target_mode mapping; R5 unknown-vault inheritance; R6 base64 anti-injection; R7 in-eval boundary detection via Obsidian's pre-parsed headings array; R8 in-eval segment matcher with stack-by-level + first-match; R9 file path resolution three modes; R10 inherited 10 MiB cap; R11 multi-vault default ambiguity; R12 test seams — single spawn per request; R13 structured eval-response error envelope; R14 Setext exclusion defence-in-depth filter).
- [data-model.md](specs/015-read-heading/data-model.md) — schema diagrams (input + output + eval-envelope), JS template body (~50 LOC formatted), base64 payload assembly, per-tool invariants table, module LOC budget (~205 source / ~960 test), test inventory (20 / 30 / 5 = 55 cases).
- [contracts/read-heading-input.contract.md](specs/015-read-heading/contracts/read-heading-input.contract.md) — public input contract: zod schema, emitted JSON Schema shape, field policy, structural heading-path validator, six worked examples (A–F), error response roster, multi-vault notes.
- [contracts/read-heading-handler.contract.md](specs/015-read-heading/contracts/read-heading-handler.contract.md) — handler invariants: deps shape, single invokeCli call shape, JS template assembly + base64 payload renderer, two-stage eval response parse, envelope-error → UpstreamError mapping table, failure propagation chain (with diagram), test seam pattern with argv-payload decode assertion, single-spawn invariant.
- [quickstart.md](specs/015-read-heading/quickstart.md) — 22 verification scenarios mapped to SC-001..SC-022 (S-1..S-19 in CI; S-20..S-22 manual against MCP Inspector / Claude Desktop with TestVault opened).

Predecessor features:
- **014-find-by-property**: [spec.md](specs/014-find-by-property/spec.md), [plan.md](specs/014-find-by-property/plan.md) — the fifth typed tool and the first eval-composition typed tool. THIS feature mirrors the eval composition pattern (R2 / R3), the base64 anti-injection pattern (R6), the inherited vault-routing limitation (R4 / R11), the structured error envelope idiom (R13). **Departures**: STANDARD target_mode discriminator (this feature has it; 014 doesn't); structural heading-path validator (different shape vs 014's folder-traversal regex); pre-parsed Obsidian headings array reuse (R7 collapses what would otherwise be a wrapper-side Markdown parser).
- **013-read-property**: [spec.md](specs/013-read-property/spec.md), [plan.md](specs/013-read-property/plan.md) — the fourth typed tool and the first surgical-frontmatter-read primitive. THIS feature mirrors its target_mode discriminator (R4) and the post-011 module layout. Departure: single-call architecture (vs 013's two-call); subcommand is `eval` not `properties`; output is `{content: string}` (vs 013's typed value+type).
- **012-delete-note**: [spec.md](specs/012-delete-note/spec.md), [plan.md](specs/012-delete-note/plan.md) — the third typed tool. THIS feature mirrors the `RegisterDeps` shape and Original-no-upstream attribution conventions.
- **011-write-note**: [spec.md](specs/011-write-note/spec.md), [plan.md](specs/011-write-note/plan.md) — introduced the cli-adapter's R5 unknown-vault response-inspection clause. THIS feature inherits the clause unchanged for the `eval` subcommand (cited via 014's verification — `Vault not found.` byte-identical).
- **010-flatten-target-mode**: [spec.md](specs/010-flatten-target-mode/spec.md), [plan.md](specs/010-flatten-target-mode/plan.md) — flattened `targetModeSchema`. CONSUMED by `read_heading` via `applyTargetModeRefinement` + `targetModeBaseSchema` reuse.
- **006-read-note**: [spec.md](specs/006-read-note/spec.md), [plan.md](specs/006-read-note/plan.md) — first typed tool. THIS feature follows its content-string output shape pattern.
- **005-help-tool**: [spec.md](specs/005-help-tool/spec.md), [plan.md](specs/005-help-tool/plan.md) — registry-consistency test. THIS feature populates `docs/tools/read_heading.md` (new file per FR-023); the existing registry-consistency test at [src/server.test.ts](src/server.test.ts) auto-asserts the file's existence once `read_heading` is registered.
- **003-cli-adapter**: [spec.md](specs/003-cli-adapter/spec.md), [plan.md](specs/003-cli-adapter/plan.md) — `invokeCli` adapter. THIS feature routes through it once per request (R3); the 011-R5 unknown-vault response-inspection clause is inherited; the dispatch layer's four-priority error classifier (`Error: no active file` → `ERR_NO_ACTIVE_FILE`; general `Error:` → `CLI_REPORTED_ERROR`) is leveraged as a safety net for unexpected eval runtime errors.
- **004-target-mode-schema**: [spec.md](specs/004-target-mode-schema/spec.md), [plan.md](specs/004-target-mode-schema/plan.md) — defined the target_mode primitive. **CONSUMED** by this feature via `targetModeBaseSchema` extension.
- **008-refactor**, **007-fix-list-tools-schema**, **009-fix-inputschema-publication**, **002-detect-cli-errors**, **001-add-cli-bridge**: foundational; not touched.

References:
- [.specify/memory/constitution.md](.specify/memory/constitution.md) — All five principles satisfied (no Complexity Tracking entries needed). Principle I (per-surface module under `src/tools/read_heading/`); Principle II (55 co-located tests); Principle III (zod is single source of truth for input AND output AND eval envelope; types via z.infer; no hand-rolled types); Principle IV (zero new error codes; failures flow through VALIDATION_ERROR + adapter's four codes + ERR_NO_ACTIVE_FILE; 011-R5 inherited); Principle V (Original-no-upstream headers on every new source file).
- [.decisions/ADR-003 - Enforce Target Mode in Typed Tools.md](.decisions/) — **enforced** by this feature via `applyTargetModeRefinement` + `targetModeBaseSchema` reuse from `src/target-mode/target-mode.ts`. The ADR governs typed tools that operate on a single named file or active file; `read_heading` is exactly that surface. The ADR is NOT amended.
- [.decisions/ADR-005 - Token-Optimized Tool Definitions.md](.decisions/) — reaffirmed; `stripSchemaDescriptions` applied at registration via `registerTool` (auto).
- [.decisions/ADR-006 - Centralized Tool Registration.md](.decisions/) — reaffirmed; `registerTool` factory wraps schema parse + UpstreamError propagation + JSON serialisation.
- [.architecture/Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md) — the architecture this BI continues to implement.
<!-- SPECKIT END -->

## Test Execution

Before invoking any test that touches the filesystem or the `obsidian` CLI binary, read [.memory/test-execution-instructions.md](.memory/test-execution-instructions.md). It names the authorised test vault, the scratch subdirectory, the destructive-probe protocol, and the cleanup expectations. The `.memory/` folder is gitignored — those instructions are for the assistant, not the project, so do not move them into a checked-in location and do not edit them on the user's behalf without being asked.

This gate applies to every test category that produces real CLI invocations: T0 live-CLI probes during `/speckit-implement`, FR-019 characterisation cases, manual quickstart scenarios, and any ad-hoc validation of a tool call's behaviour against a real vault. It does not apply to in-process unit tests that mock `invokeCli`.

## Communication Style

**Default mode**: caveman full — implicitly active for every response in this project. The user has set this as the project-wide default; you do NOT need to invoke `/caveman full` per response, and you do NOT need to mention that caveman mode is active.

**What "full" means** (per the caveman skill at `~/.claude/skills/caveman/SKILL.md`):
- Drop articles (a/an/the), filler ("just", "really", "basically", "actually", "simply"), pleasantries ("Sure!", "Of course", "Happy to help"), and hedging.
- Fragments OK. Short synonyms (big not extensive, fix not "implement a solution for").
- Pattern: `[thing] [action] [reason]. [next step].`
- Technical terms exact. Code blocks unchanged. Errors quoted exact. Function names, API names, error strings: never abbreviate.

**Auto-clarity carve-outs** (drop the full-mode terseness when):
- Security warnings or destructive-action confirmations.
- Irreversible action confirmations.
- Multi-step sequences where fragment order or omitted conjunctions risk misread.
- Compression itself creates technical ambiguity.
- The user asks for a clarification or repeats a question.
Resume full mode after the clear part is done.

**Override**: the user can switch level mid-conversation with `/caveman lite|ultra|wenyan-lite|wenyan-full|wenyan-ultra` or revert entirely with `stop caveman` / `normal mode`. Honour the override for the rest of the session.

**Writing artifacts (CLAUDE.md, spec.md, plan.md, research.md, source files, commit messages, PR descriptions)**: write in normal prose — these are durable artifacts read out-of-conversation. Caveman full applies to chat responses only.

## Architecture & Decision References

Two reference folders document the project's design rationale. Consult them **before** proposing or making design decisions, and cite the relevant ADR/architecture section when justifying choices:

- [.architecture/](.architecture/) — high-level architecture notes describing the system's structure, module boundaries, and design principles. Start with [Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md).
- [.decisions/](.decisions/) — Architecture Decision Records (ADRs). [Decision Log.md](.decisions/Decision%20Log.md) is the index; each ADR-NNN file contains the full decision text.

When a design choice conflicts with an existing ADR, surface the conflict to the user rather than silently overriding it — superseding an ADR is a deliberate act that should produce a new ADR, not an undocumented drift.
