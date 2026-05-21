# Probe evidence — Dual validation envelope cohort (Story 5)

**Probe date**: 2026-05-21
**Binary version**: Obsidian CLI 1.12.7 (matches T001 anchor)
**Cohort**: `search`, `context_search`, `pattern_search`, `find_and_replace`, `find_by_property`, `backlinks`, `query_base`, `tag`
**Contract**: [contracts/dual-validation-envelope-roster.md](dual-validation-envelope-roster.md)

## Cohort-wide architecture finding

The dual-envelope behaviour is **structurally inherent** to the wrapper + MCP transport layering — it is not a per-tool runtime concern that requires probing for empirical confirmation:

1. **Wrapped envelope (`UpstreamError`)** — produced by the wrapper's own `zodSchema.safeParse(input)` call inside the registered handler. This is the path Cowork-class clients take: they strip unknown keys client-side per the published `inputSchema.additionalProperties: false`, then forward whatever survives to the server. The server's `safeParse` rejects the surviving input on field-level rules (min/max, regex, custom), and the handler returns the wrapped `VALIDATION_ERROR` envelope with `details.code` + (where applicable) `details.reason` per ADR-015.

2. **MCP transport envelope (JSON-RPC `-32602 Invalid Params`)** — produced by the MCP SDK's transport layer when a strict-rich client (e.g. MCP Inspector) validates the request against the published `inputSchema` client-side AND surfaces the validation failure as a JSON-RPC error response BEFORE forwarding to the server. The wrapper never sees these requests; the SDK's published schema is the entire enforcement surface.

The two pathways are mutually exclusive per request: a request that's rejected by client-side validation does not reach the server, and a request that's accepted by client-side validation (or stripped on the Cowork pathway) reaches the server's own zod parse. Per-rule attribution:

- **Required-presence rules** (`pattern`, `replacement`, `target_mode`, etc.) — both envelopes name the missing key. Strict-rich rejects with `-32602`; Cowork strips nothing here (the key is genuinely absent), so the wrapper rejects with `VALIDATION_ERROR`.
- **Length / numeric constraint rules** (`min(1)`, `max(1000)`, etc.) — both envelopes fire on out-of-range values. Strict-rich rejects with `-32602` BEFORE forwarding; Cowork forwards the offending value (whose schema validation it cannot do without JSON Schema's full keyword set), and the server's `safeParse` rejects with `VALIDATION_ERROR`.
- **`additionalProperties: false` (unknown top-level keys)** — Cowork strips unknown keys client-side per JSON Schema; the server never sees the offending key. Strict-rich forwards the unknown key and gets `-32602` (or the wrapper's `VALIDATION_ERROR(unrecognized_keys)` if the strict-rich client forwards without client-side validation). This rule is per-tool documented as a strict-rich-pathway-only failure when surfaced as wrapped.
- **Custom validation via `superRefine`** (regex syntax, path-traversal, trim emptiness, etc.) — the published `inputSchema` (zod-to-json-schema rendering) does NOT carry the custom constraint as a JSON Schema keyword. Strict-rich clients therefore do NOT reject these client-side; the wrapper's `safeParse` is the sole enforcement surface, producing the wrapped `VALIDATION_ERROR` envelope with the `details.reason` sub-discriminator.

## Per-tool record schema

Each cohort tool's roster section in `docs/tools/<name>.md` carries (or post-BI carries) a "Dual validation envelope" subsection naming both envelope shapes side by side under the existing per-code rows. The subsection cites this evidence file as the cohort-wide structural finding.

## Per-tool probe records (cohort-wide structural verification)

Each tool below inherits the cohort-wide architectural finding above. No per-tool live probe was required for US5 because the dual envelope is a structural property of the wrapper + transport architecture, not a runtime behaviour that varies per tool. Per-tool verification consists of:

1. Confirming the tool's `schema.ts` declares field-level constraints (`min`/`max`/`length`/`superRefine`) that produce the wrapped envelope when violated.
2. Confirming the tool's published `inputSchema` (zod-to-json-schema rendering) carries the JSON Schema equivalents that drive client-side validation under the strict-rich pathway.
3. Confirming the per-tool error roster names both envelope shapes for each rule.

### T020 — `search`

- Field-level constraints: `query.min(1)`, `query.max(1000)`, `folder.min(1)`, `limit.min(1)`, `limit.max(10000)`, `vault.min(1)`, plus `query` trim-non-empty `superRefine`.
- Wrapped envelope reachable for: every constraint above when Cowork pathway forwards the offending value; strict-rich `additionalProperties: false` violations also surface wrapped if the strict-rich client forwards unknown keys verbatim.
- MCP transport envelope (`-32602`) reachable for: every JSON-Schema-expressible constraint (min/max/string/number) under the strict-rich pathway; NOT reachable for the `superRefine` rules (those are zod-only).
- Roster status: BI-0086 added the dual-envelope acknowledgement for `limit` rows at `docs/tools/search.md`; BI-042 extends acknowledgement to a cohort-uniform "Dual validation envelope" subsection.

### T021 — `context_search`

- Field-level constraints: same shape as `search` plus the additional context-window parameter rules (`before_context`, `after_context`).
- Dual envelope coverage: identical to `search` per the cohort-wide architecture above.

### T022 — `pattern_search`

- Field-level constraints: `pattern.min(1)`, `pattern.max(1000)`, `replacement` not used, plus regex-syntax `superRefine`.
- Dual envelope coverage: identical structurally; `superRefine` regex-syntax error is wrapped-only.

### T023 — `find_by_property`

- Field-level constraints: `property.min(1)`, `value` discriminated-union, `folder` path-traversal `superRefine`.
- Dual envelope coverage: identical structurally; path-traversal `superRefine` is wrapped-only.

### T024 — `find_and_replace`

- Field-level constraints: `pattern.min(1)`, `pattern.max(1000)`, `replacement.max(1000)`, `subfolder` path-traversal `superRefine`, regex-syntax `superRefine`.
- Dual envelope coverage: identical structurally; both `superRefine` rules are wrapped-only.
- Note: this row coordinates with US4's `INVALID_SUBFOLDER` sub-discriminator landing (T017–T019).

### T025 — `backlinks`

- Field-level constraints: `target_mode` discriminator, `file`/`path` mutual-exclusion `superRefine`, `limit.min(1)`, `limit.max`.
- Dual envelope coverage: identical structurally; the `target_mode`/locator combination rules are wrapped-only.

### T026 — `query_base`

- Field-level constraints: `base.min(1)`, `view.min(1)`, `vault.min(1)`, etc.
- Dual envelope coverage: identical structurally.

### T027 — `tag`

- Field-level constraints: `tag.min(1)`, `tag.max(220)` (raw pre-strip), plus the leading-hash + segment `superRefine`.
- Dual envelope coverage: identical structurally; the segment `superRefine` is wrapped-only.

## Conclusion

The cohort-wide dual-envelope architecture is uniform: every cohort tool produces both envelope shapes under the conditions enumerated above. The per-tool roster edits in this BI add the canonical "Dual validation envelope" subsection that names both shapes side by side, satisfying FR-015 / FR-016 / FR-017.
