# Research: List Tagged Files

**Branch**: `028-list-tagged-files`
**Date**: 2026-05-15
**Phase**: 0 (Outline & Research)

This document captures the Phase 0 decisions (R1..R15) plus the plan-stage live-CLI / metadataCache probe findings (F1..F8) that contradicted the Q1 spec-stage premise and drove the architecture pivot from "wrap native `tag` subcommand" to "wrap via `eval` + metadataCache walk".

## Phase 0 Decisions

### R1 — Logger surface: thin handler, no per-call tool-layer logging

The handler does NOT emit `logger.callStart` / `callEndSuccess` / `callEndFailure` events at the tool layer. Same outcome as BI-014 / BI-015 / BI-025 / BI-026 / BI-027. The cli-adapter's `dispatchTimeout` / `dispatchCap` / `dispatchKill` events preserve observability for the underlying CLI invocation.

**Rationale**: Per-call logging at the typed-tool layer adds noise without unlocking debug paths the adapter doesn't already cover. The eval cohort has converged on this stance.

**Alternatives considered**: Per-call logger events for cache-walk performance characterisation. Rejected — perf characterisation belongs to integration-level T0 cases, not production logs.

### R2 — Subcommand: `eval`, NOT native `tag`

The wrapper invokes `obsidian eval code=<rendered-js>`. The wrapper does NOT invoke the native `obsidian tag` subcommand.

**Rationale**: Live-probe finding F3 surfaced three native-subcommand mismatches with the spec contract:
1. Plain-text-only output (no `format=json`) — handler would need plain-text parsing of the `<tag>\t<count>\n<path>\n...` shape, brittle against future Obsidian CLI changes.
2. Zero-match returns `Error: Tag "#X" not found.` exit 0 — would surface as `CLI_REPORTED_ERROR` and violate FR-012's "never an error" guarantee unless the handler did sentinel-string detection.
3. No child-tag subsumption — `tag name=foo` returns only files tagged exactly `foo`, not `foo/bar`. FR-004 (parent-subtree subsumption) would require either multi-call enumeration (1 call per matching tag) OR wrapper-side aggregation.

Each of these would be a wrapper-side override of native behaviour. Switching to `eval` collapses all three into a single in-JS template that walks `app.metadataCache.fileCache` × `app.metadataCache.metadataCache` directly. Sixth member of the eval-driven typed-tool cohort (BI-014 / BI-015 / BI-025 / BI-026 / BI-027 precedents).

**Alternatives considered**: Wrap `tag` subcommand with handler-side overrides — rejected for plain-text-parsing fragility AND for needing multi-call aggregation for child-subsumption. Hybrid (eval for case+subsumption, `tag` for the exact-case happy path) — rejected for architectural complexity.

### R3 — Single-call architecture branched at envelope-emission on `a.total`

Each MCP request fires ONE `invokeCli` invocation with subcommand `eval` and parameter `code=<rendered-js>`. The same eval JS computes the full path array regardless of mode; cross-mode invariant (count-only `total` === default-mode `paths.length`) holds by construction.

**Rationale**: Parity with BI-026 / BI-027 single-call architecture. Branching at envelope emission rather than at JS-template selection keeps the rendered template byte-stable across calls (only the `__PAYLOAD_B64__` substitution varies).

**Alternatives considered**: Two separate eval templates (one returns `{count, paths}`, one returns just `count`). Rejected — doubles the surface area of frozen JS templates AND the cross-mode invariant proof.

### R4 — STANDARD vault-only schema; NO `target_mode` discriminator

User-facing schema: `z.object({tag, vault?, total?}).strict()`. No `target_mode` discriminator. Parity with BI-024 `properties` (vault-only).

**Rationale**: The operation is intrinsically vault-wide — "give me all files in the vault carrying tag X". There's no `active`-mode counterpart that semantically maps to "the focused file's tags" (that's a different BI). ADR-003 governs per-file typed tools and does NOT apply here.

**Alternatives considered**: Add `target_mode` to support an `active` variant that returns the active file's tag set. Rejected — different output shape (returns tags, not paths), different BI.

### R5 — Unknown-vault: inherited `Vault not found.` → `CLI_REPORTED_ERROR`

Live probe F5 confirmed `obsidian vault=NoSuchVault eval code=...` returns `Vault not found.` exit 0 byte-identical to the native subcommands. The cli-adapter's 011-R5 response-inspection clause fires and classifies as `CLI_REPORTED_ERROR`.

**Rationale**: Inherited unchanged. Zero new error codes.

### R5a — Closed-but-registered-vault: consume shared module from BI-026/027

Stage-0 closed-vault detection in the handler consumes the shared `src/tools/_eval-vault-closed-detection/` module (introduced inline by BI-026, lifted cross-cutting by BI-027). Detection signature: empty stdout + exit 0 + transparent vault-open side effect on the host. Third-tool consumer.

**Rationale**: Pattern is plugin-agnostic and applies to any eval-driven typed tool with a `vault?` parameter. FR-021 explicit consumer requirement.

**Alternatives considered**: Inline detection branch in this tool's handler — rejected for the rule-of-three reason. Lift it now or duplicate it again.

### R6 — Anti-injection: base64-encoded JSON payload + frozen JS template

All user-supplied data (the normalised tag query string) flows through `JSON.stringify({query})` → `Buffer.from(...).toString("base64")` → `atob` + `JSON.parse` at JS runtime. The JS source is byte-stable across calls except for the single `__PAYLOAD_B64__` substitution.

**Rationale**: Parity with BI-014 / BI-015 / BI-025 / BI-026 / BI-027. Structurally prevents template-injection regardless of input charset.

### R7 — Tag-set computation per file

For each file in `app.metadataCache.fileCache` where the file extension is `.md` (the only filetype with tags in Obsidian's cache):

- Read `m = app.metadataCache.metadataCache[fileCache[path].hash]`
- If `m` is missing → skip (file in fileCache but not yet hashed — rare race condition)
- Body inline tags: `m.tags || []`, each entry shape `{tag: "#foo", position: {...}}` — extract `.tag` strings
- Frontmatter tags: `m.frontmatter?.tags || []`, JS array of strings WITHOUT leading `#` — whatever Obsidian's YAML parser produced (Q3 defer-to-upstream)

Concatenate both sources, normalise each tag value (strip leading `#`, lower-fold), build a `Set` for the file. The set is the authoritative tag carrier set.

**Rationale**: Mirrors how Obsidian's tag-pane UI counts a note as "tagged with X" — both sources contribute equally.

**Alternatives considered**: Use `app.metadataCache.getTags()` for the global inventory and reverse-walk. Rejected — `getTags()` returns `{tag: count}` and has no path attribution; cannot answer "which paths carry X".

### R8 — Wrapper-side byte-ascending sort post-fetch

After collecting matching paths into an array, sort with `Array.prototype.sort()` (default V8 byte-asc on strings). Determinism + parity with BI-026 / BI-027.

**Rationale**: Locked by Clarifications Q5. The sort runs INSIDE the eval JS (not in the handler) so the envelope already contains a sorted array — handler does NOT re-sort. Single source of truth for ordering.

### R9 — Empty result is a natural envelope, NOT an error

Zero-match queries return `{ok: true, count: 0, paths: []}` (default mode) or `{ok: true, total: 0}` (count-only mode) from the eval. Handler maps to caller as `{count: 0, paths: []}` or `0` respectively. NEVER an error envelope.

**Rationale**: FR-012 lock. Eval-architecture delivers this naturally (no special-casing needed); the native `tag` subcommand's `Error: Tag not found.` is bypassed entirely by R2.

### R10 — Output cap inherited from cli-adapter (10 MiB)

The cli-adapter's existing 10 MiB output cap fires for pathologically large path arrays — produces a structured `CLI_NON_ZERO_EXIT` (output-cap kill). Inherited unchanged.

**Rationale**: Even at ~500 bytes/path × 20 000 paths = 10 MB, the cap protects against runaway vaults. Practical safety net.

**Alternatives considered**: A wrapper-level path-count cap (e.g. ≤10 000). Rejected — pagination is out of scope at v1; users can branch on `total: true` for size-aware logic.

### R11 — Multi-vault behaviour: `vault=` routes correctly per BI-026 amendment

Live probe F4 confirmed `obsidian vault=TestVault-Obsidian-CLI-MCP eval code=...` routes to the requested vault's `app` instance (parity with BI-026's post-test live-probe amendment finding). Multi-vault basename ambiguity inherits from the project-wide vault-routing convention.

### R12 — Test seam: single spawn, base64 round-trip

Handler tests mock `invokeCli`. Assertions verify:
1. Exactly one `invokeCli` call per request.
2. `parameters.code` is a string of the form `<frozen-template-prefix>__PAYLOAD_B64__-substituted<frozen-template-suffix>` — round-trip decode the base64 payload and assert it equals the expected `{query: "<normalised>"}` shape.
3. `subcommand === "eval"`, `vault` flows through from input when present.

**Rationale**: Parity with BI-014 / BI-015 / BI-025 / BI-026 / BI-027 test patterns.

### R13 — Structured eval-response error envelope

Handler's multi-stage parse:
- **Stage 0**: Shared closed-vault detector — if empty stdout, throw `UpstreamError(CLI_REPORTED_ERROR, details: {code: "VAULT_NOT_FOUND", reason: "not-open"})`.
- **Stage 1**: Extract JSON via `stdout.trimStart()`'s `startsWith("=> ") ? slice(3) : passthrough` (BI-026 pattern — no `console.log` noise since our JS template is quiet).
- **Stage 2**: `JSON.parse` the extracted string. Failure → `UpstreamError(CLI_REPORTED_ERROR, details: {stage: "json-parse"})`.
- **Stage 3**: `safeParse` the parsed object against the discriminated-union envelope schema. Failure → `UpstreamError(CLI_REPORTED_ERROR, details: {stage: "envelope-parse"})`.
- **Stage 4**: Discriminate on `envelope.ok`. `true` → return data. `false` → map `code` field to `UpstreamError(CLI_REPORTED_ERROR, details: {stage: "envelope-error", code})`. (At v1, the only envelope-error code is the catch-all unexpected case — no domain-specific failure codes inside the eval since the JS template handles zero-match naturally.)
- **Stage 5**: Return the appropriate caller-shape based on input `total` flag.

**Rationale**: Parity with BI-025 / BI-026 / BI-027 staged parse. No new top-level error codes.

### R14 — Defence-in-depth: segment-boundary precision enforced inside the JS template

Even though the natural matching rule `tag === query || tag.startsWith(query + "/")` enforces segment-boundary precision (FR-016), the JS template makes this explicit with a single helper function `isMatch(tag, queryNorm)` that is unit-test characterisable via the base64-payload-round-trip seam.

**Rationale**: FR-016 lock. Wrapper-enforced rather than upstream-inherited because the eval template owns the matching logic top-to-bottom.

### R15 — Tool name: `tag` (single-word verbatim from upstream `obsidian tag` subcommand)

Tool name follows ADR-010 single-word-verbatim-from-upstream. The Obsidian CLI has an `obsidian tag` subcommand (help output: "Get tag info" with `name=<tag>`, `total`, `verbose` flags). Per ADR-010, the typed-tool wrapper takes the upstream subcommand name verbatim, even though THIS BI does NOT wrap that subcommand (R2 / R19) — the conceptual operation ("read tag-related info, including file list") aligns with `obsidian tag`.

**Rationale**: ADR-010 governs the NAMING dimension (what users type), not the IMPLEMENTATION dimension (what subcommand the wrapper internally invokes). BI-025 `links` set this precedent — wraps `eval` internally but names itself `links` because the upstream `links` subcommand exists with a different output shape.

**Alternatives considered**: `tagged_files` (wrapper-invented, more descriptive of operation) — rejected per ADR-010. `find_by_tag` (parallel to `find_by_property` BI-014) — rejected; ADR-010 prefers single-word-verbatim. `tags` (plural — matches the vault-wide-list `obsidian tags` subcommand) — rejected; `tags` is the appropriate name for a future "list ALL tags" inventory BI, not this per-tag BI.

## Plan-stage live-CLI / metadataCache probe findings

### F1 — `obsidian` CLI exposes BOTH `tag` and `tags` subcommands

`obsidian help` output:
```
tag                   Get tag info
  name=<tag>          - Tag name (required)
  total               - Return occurrence count
  verbose             - Include file list and count

tags                  List tags in the vault
  file=<name>         - File name
  path=<path>         - File path
  total               - Return tag count
  counts              - Include tag counts
  sort=count          - Sort by count (default: name)
  format=json|tsv|csv - Output format (default: tsv)
  active              - Show tags for active file
```

`tag` is per-tag info (THIS BI's domain). `tags` is vault-wide tag inventory (a sibling future BI's domain — different output shape, see spec Out-of-scope).

**Impact**: ADR-010 naming → tool name `tag`. Architecture decision separate (R2 — chose `eval` not `tag`).

### F2 — Native `tag` subcommand is CASE-SENSITIVE; `app.metadataCache.getTags()` keys are case-PRESERVED

Live probes against `TestVault-Obsidian-CLI-MCP`:

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP tag name=alpha
Fixtures/BI-031/lists/contains.md
Fixtures/BI-031/lists/exact-ordered.md
Fixtures/BI-031/lists/reversed.md

$ obsidian vault=TestVault-Obsidian-CLI-MCP tag name=Alpha
Error: Tag "#Alpha" not found.

$ obsidian vault=TestVault-Obsidian-CLI-MCP eval code='JSON.stringify(Object.keys(app.metadataCache.getTags()))'
=> ["#bi-005","#fixture","#alpha","#beta","#gamma"]
```

The CLI lookup AND the underlying `metadataCache.getTags()` index BOTH key on case-preserved tag strings. `Alpha` ≠ `alpha`. The CLI does NOT case-fold.

Obsidian's tag-pane UI groups case-variants together (case-insensitive display). The CLI-layer divergence from the UI-layer behaviour means Q1's explicit conditional fires — wrapper-side normalisation is warranted.

**Impact**: Spec amendment 1 (FR-008, SC-009, Edge Case, Assumptions). Wrapper applies ASCII lower-fold inside the eval JS template against BOTH the input tag AND every stored tag value.

### F3 — Native `tag` subcommand: three additional contract mismatches with spec

(a) Plain-text-only output, no `format=json` flag:
```
$ obsidian vault=TestVault-Obsidian-CLI-MCP tag name=alpha verbose
#alpha    3
Fixtures/BI-031/lists/contains.md
Fixtures/BI-031/lists/exact-ordered.md
Fixtures/BI-031/lists/reversed.md
```

(b) Zero-match returns `Error: Tag "#X" not found.` exit 0 — would surface as `CLI_REPORTED_ERROR` and violate FR-012 ("never an error"):
```
$ obsidian vault=TestVault-Obsidian-CLI-MCP tag name=nonexistent
Error: Tag "#nonexistent" not found.
$ echo $?
0
```

(c) No child-tag subsumption — `tag name=parent` returns only files tagged exactly `parent`, NOT files tagged `parent/child`. (Not directly probed in TestVault since no hierarchical tags exist there at probe time; inferred from CLI semantics and confirmed by the absence of any `subtree` or `recursive` flag in the help output. T0 verifies this directly.)

**Impact**: Spec amendment 2 (FR-019..FR-021 new). Architecture pivot from `tag` subcommand to `eval` + metadataCache walk.

### F4 — `vault=` routes correctly through `eval` subcommand

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP eval code='app.vault.getName()'
=> "TestVault-Obsidian-CLI-MCP"
```

Parity with BI-026 / BI-027 post-test amendments. Multi-vault basename ambiguity is the inherited limitation.

### F5 — Unknown vault: `Vault not found.` exit 0 byte-identical across native and eval

```
$ obsidian vault=NoSuchVault tag name=alpha
Vault not found.
$ obsidian vault=NoSuchVault eval code='JSON.stringify(Object.keys(app.metadataCache.getTags()))'
Vault not found.
$ echo $?
0
```

cli-adapter's 011-R5 inspection clause fires. Inherited unchanged.

### F6 — `app.metadataCache.fileCache[path] = {hash}` × `metadataCache[hash] = {tags?, frontmatter?, ...}` two-level shape

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP eval code='const fc=app.metadataCache.fileCache; const mc=app.metadataCache.metadataCache; const k=Object.keys(fc)[0]; JSON.stringify({path:k, hash:fc[k].hash, meta:mc[fc[k].hash]})'
=> {"path":"BI019/Destination-158.md","hash":"...","meta":{...}}
```

`fileCache` is the path → hash map. `metadataCache` is the hash → entry map. Each entry contains optional `tags: [{tag, position}, ...]`, optional `frontmatter: {tags?, ...}`, etc. Both fields may be missing on tagless files.

**Impact**: JS template's cache walk handles missing fields via `m?.tags || []` and `m?.frontmatter?.tags || []` defensive reads.

### F7 — TestVault tag fixtures: frontmatter-only tags, no body inline tags at probe time

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP eval code='...all-tagged-files dump...'
=> [{"path":"Fixtures/BI-005/all-types.md","fmTags":["bi-005","fixture"]},
    {"path":"Fixtures/BI-031/lists/contains.md","fmTags":["alpha","beta","gamma"]},
    {"path":"Fixtures/BI-031/lists/exact-ordered.md","fmTags":["alpha","beta"]},
    {"path":"Fixtures/BI-031/lists/reversed.md","fmTags":["beta","alpha"]}]
```

Frontmatter `tags:` values are stored WITHOUT leading `#`. Body inline tags (`m.tags`) — when present — store WITH leading `#` per F8.

**Impact**: T0 must seed fixtures covering body inline tags, fenced-code-block tags (negative case), case-variant tags, hierarchical/child tags, duplicate-source dedup. The existing TestVault fixtures cover only the frontmatter-list-of-strings happy path.

### F8 — Body inline tag entry shape: `{tag: "#foo", position: {...}}`, leading `#` included

Inferred from Obsidian's documented metadataCache schema (m.tags is `TagCache[]` per the Obsidian API). T0 confirms live.

**Impact**: Normalisation function must strip leading `#` from body inline tag values before comparing with frontmatter tag values (which lack `#`).

## Inherited limitations (documented in tool docs)

1. **Multi-vault basename ambiguity** — same as BI-019 / BI-024 / BI-025 / BI-026 / BI-027. `vault=<name>` resolves a single vault per call; basename collisions across registered vaults route to the first match.
2. **Unicode case-folding NOT supported at v1** — wrapper-side ASCII lower-fold only. Tags written in non-ASCII case (e.g. `#日本語`) match each other byte-for-byte (since lower-fold is a no-op on non-ASCII), which is the same behaviour Obsidian's UI exhibits.
3. **Stale metadataCache** — if Obsidian's cache is mid-rebuild (e.g. after a large vault import), tag membership may briefly diverge from on-disk reality. Inherent to Obsidian; same limitation as BI-025's stale-link cache caveat.
4. **Output cap inherited from cli-adapter** (10 MiB) — pathologically large path arrays produce structured `CLI_NON_ZERO_EXIT` (output-cap kill), never silent truncation.
5. **No pagination at v1** — full path array returned regardless of size; callers branching on size use `total: true` for the count.
6. **Tag-cache filetype scope** — Obsidian's tag cache only indexes `.md` files in current versions. The wrapper's `.md` extension guard in the JS template aligns with this; if a future Obsidian version extends tag indexing to other filetypes, the wrapper inherits whatever the cache surfaces (defer-to-upstream).
