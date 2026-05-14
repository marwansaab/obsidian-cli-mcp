# Research — Smart Connections Query (BI-027)

Plan-phase outputs: Phase 0 design decisions (R1–R15) + plan-stage live-CLI / live-plugin findings (F1–F15).

## Phase 0 — Design Decisions

### R1 — Logger surface

**Decision**: thin handler. No per-call `logger.callStart` / `callEndSuccess` / `callEndFailure` events at the typed-tool layer.

**Rationale**: parity with BI-014 / BI-015 / BI-025 / BI-026 and every prior typed tool. The cli-adapter's `dispatchTimeout` / `dispatchCap` / `dispatchKill` events preserve observability for the underlying CLI invocation. Tool-layer logging would duplicate signal without adding actionable information.

**Alternatives considered**: per-call event emission. Rejected — no consumer downstream of the logger is keyed on tool-layer events; the cli-adapter layer's events are sufficient.

### R2 — CLI subcommand: `eval`

**Decision**: route through `eval`, NOT a native subcommand.

**Rationale**: no native Obsidian CLI subcommand exists for semantic-query operations. The Smart Connections plugin's lookup API is reached via `app.plugins.plugins["smart-connections"].env.smart_sources.lookup(...)` from inside the eval JS template (LIVE-VERIFIED at plan stage — F1). Parity with BI-014 / BI-015 / BI-025 / BI-026 (eval-driven cohort) — BI-027 is the second member of the eval-driven plugin-backed sub-cohort opened by BI-026.

**Alternatives considered**: a hypothetical native `obsidian search` subcommand. Rejected — does not exist; would not give access to the plugin's index.

### R3 — Single-call architecture, branched at envelope-emission on `a.total`

**Decision**: ONE `invokeCli` invocation per request with `subcommand: 'eval'` and `parameters.code: <rendered-js>`. The same eval JS computes the full match array regardless of mode; the `a.total` branch at envelope-emission decides whether `matches` carries the entries or `[]`. PLUS one optional second `invokeCli` to the `vaults` subcommand from inside the shared `_eval-vault-closed-detection` detector, fired only when the empty-stdout + `vault=` supplied signature matches.

**Rationale**: parity with BI-026 R3. Cross-mode `count` invariant (FR-006a) holds by construction. Single spawn per call keeps the queue cost predictable.

**Alternatives considered**: two-call architecture (count call + matches call). Rejected — embed cost would be paid twice; cross-mode invariant would be harder to assert.

### R4 — No `target_mode` discriminator

**Decision**: flat input schema with optional `vault`. NO `target_mode` discriminator.

**Rationale**: query is a fileless surface — no source file is involved on input. ADR-003 governs PER-FILE typed tools; fileless surfaces (BI-014 `find_by_property`, BI-019 `files`, BI-024 `properties`) consistently use a flat schema with optional `vault`. Parity with that precedent.

**Alternatives considered**: a discriminated input with `target_mode: 'specific' | 'active'` mapping to "named vault" vs "focused vault". Rejected — overloads the `target_mode` term in a way that diverges from ADR-003's per-file intent; the optional `vault?` pattern conveys the same information without the discriminator overhead.

### R5 — Unknown-vault response inspection

**Decision**: ACTIVE — cli-adapter's existing 011-R5 clause fires for unregistered vault (`Vault not found.` string emission). Inherited unchanged.

**Rationale**: parity with BI-014 / BI-015 / BI-025 / BI-026. The cli-adapter's existing inspection clause re-classifies the "Vault not found." stdout to `CLI_REPORTED_ERROR` with `details.code = "VAULT_NOT_FOUND"` (and `details.reason` absent or `"unknown"`).

### R5a — Closed-but-registered vault detection via shared module

**Decision**: closed-vault detection (the empty-stdout + exit-0 + named-vault + vault-in-registry signature) lives in a NEW cross-cutting shared module at `src/tools/_eval-vault-closed-detection/{detector, registry-parser, index}.ts`. BI-027's handler invokes the detector via `await detector.detectIfClosed(...)`. BI-026's handler is refactored in this same BI to consume the same detector (behaviour-preserving — `_register-baseline.json` fingerprint unchanged).

**Rationale**: Q8 hybrid (c) from the grilling session. The closed-vault detection is plugin-AGNOSTIC — it characterises a property of the Obsidian CLI's response to `vault=<closed>` eval, not a property of Smart Connections. Extracting it at tool #2 satisfies a clear cross-cutting need (any future eval-driven typed tool with a vault parameter MAY consume it) without over-shaping a plugin-cohort abstraction the rule-of-three principle says to wait for.

**Alternatives considered**:
- (a) Extract everything plugin-cohort-shared on tool #2. Rejected — violates rule-of-three; tool #3 will surface the right factoring.
- (b) Wait for tool #3, duplicate the BI-026 inline code in BI-027. Rejected — closed-vault detection is the ONE genuinely cross-cohort piece; deferring its extraction risks accumulating divergent inline copies.

### R6 — Anti-injection via base64-encoded JSON payload + frozen JS template

**Decision**: serialise the entire payload (query, vault flag, limit, total flag) to JSON, base64-encode the JSON, substitute the base64 string into a frozen JS template at a single `__PAYLOAD_B64__` slot, decode + `JSON.parse` the payload inside the JS at runtime.

**Rationale**: parity with BI-014 / BI-015 / BI-025 / BI-026 R6. No part of user input ever reaches the JS source as text. Verifiable structurally: the JS template contains exactly one substitution slot AND the substituted value decodes round-trip to the original input via `atob` + `JSON.parse`.

### R7 — Per-match transform: in-eval extraction of `{path, headingPath, score}` from `{key, score}`

**Decision**: in-eval transform per match. `path = key.split('#')[0]`; `headingPath = key.split('#').slice(1)`; `score = score`. Empty `headingPath: []` for source-level matches; literal preserved `["---frontmatter---"]` for frontmatter blocks; multi-segment for nested-heading blocks including the plugin's `#{N}` sub-block-id suffix segments verbatim.

**Rationale**: parity with BI-026 R7. Live-probe-verified shape (F5 / F6) carries top-level `key` AND `score` on each match (BI-027's `lookup` return shape differs from BI-026's `find_connections` shape only in field placement — BI-027 has top-level `key`, BI-026 had nested `item.key`). The split rule is identical because both APIs emit the same block-key format.

### R8 — Three-level sort intra-eval

**Decision**: primary `score` descending; secondary `path` byte-compare ascending; tertiary `headingPath.join("#")` byte-compare ascending. Sort applied INSIDE the eval JS template BEFORE the limit slice and BEFORE envelope emission.

**Rationale**: parity with BI-026 R8. Deterministic across repeat calls; no `localeCompare`. Cross-mode invariant holds because sort runs in both default and count-only modes.

### R9 — Self-exclusion: NONE

**Decision**: NO self-exclusion filter. The query is text, not a source path — there is no "self" to exclude.

**Rationale**: BI-026's R9 self-exclusion (`m.path !== sourcePath`) exists because `find_connections` is keyed off a source note and would otherwise return blocks from inside the source note dominating the result list. For `query` there's no analogous self.

### R10 — Non-finite-score filter

**Decision**: `.filter(m => Number.isFinite(m.score))`. Silently drops bad-score entries.

**Rationale**: parity with BI-026 R10 / FR-009. A NaN/null/undefined score means the plugin failed to compute similarity for that pair — silently dropping is the conservative thin-adapter behaviour.

### R11 — Lookup return-value error-sentinel detection

**Decision**: in-eval `if (r && r.error)` check after awaiting `lookup`. Maps the sentinel to envelope error code `SMART_CONNECTIONS_NOT_READY` with `detail = r.error`. Handler stage maps envelope → `CLI_REPORTED_ERROR(details.code = "SMART_CONNECTIONS_NOT_READY", details.reason = "embed-failed")`.

**Rationale**: live-probe-driven amendment 2 (F12). The plugin's `smart_blocks.lookup` source returns `{ error: <string> }` sentinels for empty `hypotheticals` and missing embed model (`"Embedding search is not enabled."`). Other configuration / network / rate-limit failures are expected to surface through the same path. NO try/catch (the plugin does not throw); the wrapper checks the return value.

**Alternatives considered**: in-eval try/catch around `lookup(...)`. Rejected — would not fire for the actual error mechanism (return-value sentinel).

### R12 — API-shape check

**Decision**: in-eval `typeof env.smart_sources?.lookup !== 'function'` check. If not callable, emit envelope `{ ok: false, code: "SMART_CONNECTIONS_NOT_READY", detail: "lookup is not a function" }` → handler maps to `details.reason = "api-missing"`.

**Rationale**: detects API-path drift across plugin versions. Pairs with R11's return-value-sentinel check to produce the two NOT_READY sub-discriminators (`api-missing` vs `embed-failed`) — ADR-015 pattern.

### R13 — Error-precedence chain

**Decision**: outer-to-inner / cheapest-first per FR-017. `VAULT_NOT_FOUND(unknown)` → `VAULT_NOT_FOUND(not-open)` → `SMART_CONNECTIONS_NOT_INSTALLED` → `SMART_CONNECTIONS_NOT_READY(api-missing)` → `SMART_CONNECTIONS_NOT_READY(embed-failed)` → success.

**Rationale**: parity with BI-026 R13 / FR-017b. Each check that fires is independently meaningful; cheap string comparisons run before expensive embed calls; `VAULT_NOT_FOUND(unknown)` is naturally first because the cli-adapter's 011-R5 inspection intercepts before eval runs.

### R14 — Stdout extraction strategy for `=> ` marker

**Decision**: handler stage-1 parse locates the LAST `=> ` occurrence in stdout (NOT trimStart-and-slice-from-the-beginning). Extracted via `const idx = stdout.lastIndexOf('\n=> '); return idx >= 0 ? stdout.slice(idx + 4) : stdout.startsWith('=> ') ? stdout.slice(3) : stdout;` (or equivalent — see contracts/handler.contract.md for the canonical form).

**Rationale**: live-probe-driven amendment 2 (F2 / F5). The CLI captures plugin-side `console.log` AND `[warn]` lines on stdout BEFORE the `=> ` eval-return marker. BI-026's `find_connections` API doesn't emit plugin-side console output so its handler's `trimStart` + `startsWith('=> ')` pattern works; BI-027's `lookup` API does emit (`"Found and returned N smart_blocks."`). The new stage-1 extraction handles both cases.

### R15 — Plugin-namespace tool name

**Decision**: tool name is `smart_connections_query` per ADR-013 convention `<plugin>_<operation>`. The plugin's hyphen-separated name `smart-connections` joins to `smart_connections` (underscore-joined); operation is `query`.

**Rationale**: ADR-013 codifies the convention; this BI is the SECOND consumer (after BI-026). No new ADR needed.

---

## Plan-Stage Live-CLI / Live-Plugin Findings

All probes against the user's open vault `The Setup` on 2026-05-15. Probe transcript captured below for each finding.

### F1 — Lookup API existence

**Probe**:
```
obsidian "vault=The Setup" eval "code=typeof app.plugins.plugins['smart-connections'].env.smart_sources.lookup"
=> function
```

**Finding**: `env.smart_sources.lookup` exists as a callable function on the live installed plugin version.

**Implication**: locks R12's API-shape check predicate (`typeof env.smart_sources?.lookup !== 'function'`). Locks the wrapper's primary call path.

### F2 — Lookup arity / signature shape

**Probe**:
```
obsidian "vault=The Setup" eval "code=app.plugins.plugins['smart-connections'].env.smart_sources.lookup.length"
=> 0
```

**Finding**: `lookup.length` reports 0, indicating destructured-object first parameter (`async lookup(params = {}) {...}`).

**Implication**: confirms the call shape is `lookup(<object>)`; the inner destructuring extracts named fields.

### F3 — Lookup signature via source inspection (CRITICAL — drove amendment 1)

**Probe**:
```
obsidian "vault=The Setup" eval "code=app.plugins.plugins['smart-connections'].env.smart_blocks.lookup.toString().slice(0,800)"
=> async lookup(params = {}) {
    const { hypotheticals = [] } = params;
    if (!hypotheticals?.length) return { error: "hypotheticals is required" };
    if (!this.embed_model) return { error: "Embedding search is not enabled." };
    const hyp_vecs = await this.embed_model.embed_batch(hypotheticals.map((h) => ({ embed_input: h })));
    const limit = params.filter?.limit || params.k || this.env.settings.lookup_k || 10;
    if (params.filter?.limit) delete params.filter.limit;
    const filter = {
      ...this.env.chats?.current?.scope || {},
      ...params.filter || {}
    };
    const results = await hyp_vecs.reduce(async (acc_promise, embedding, i) => {
      const acc
    ...
```

**Findings**:
- `hypotheticals` is destructured at the TOP LEVEL of `params`, NOT inside `filter`. Spec FR-011 amended (live-probe-driven amendment 1).
- World A confirmed: `embed_model.embed_batch(hypotheticals.map(h => ({embed_input: h})))` embeds internally.
- Error sentinels: empty hypotheticals → `{error: "hypotheticals is required"}`; missing embed model → `{error: "Embedding search is not enabled."}`. NOT throws.
- `params.filter?.limit` is honoured AND deleted from filter before downstream use (so callers don't accidentally double-process it).
- The default limit fallback chain is `params.filter?.limit || params.k || env.settings.lookup_k || 10`.

**Implication**: spec FR-011 corrected; R11 + R12 lock the dual-sub-discriminator detection mechanism.

### F4 — `filter.limit` honouring

**Probe**:
```
obsidian "vault=The Setup" eval "code=(async()=>{const r=await app.plugins.plugins['smart-connections'].env.smart_sources.lookup({hypotheticals:['neural network training'],filter:{limit:3},collection:'smart_blocks'});return JSON.stringify({len:r.length})})()"
=> {"len":3}
```

**Finding**: passing `filter:{limit:3}` returned exactly 3 results. The plugin honours `filter.limit`.

**Implication**: confirms FR-011 placement of `limit` inside `filter`. The wrapper's `limit` parameter maps directly to `filter.limit`.

### F5 — Return shape

**Probe**:
```
obsidian "vault=The Setup" eval "code=(async()=>{const r=await app.plugins.plugins['smart-connections'].env.smart_sources.lookup({hypotheticals:['ML training'],filter:{limit:3},collection:'smart_blocks'});return JSON.stringify(r.map(x=>({k:x.key,s:x.score})))})()"
=> [{"key":"425-Skills/Skill Creator.md#Skill Creator#Gotchas#{1}","score":0.5908826916609741},{"key":"425-Skills/Setup Cowork.md#Setup Cowork#{1}","score":0.5880731307519483},{"key":"426-Custom Skills/Vault Analyser Skill - Design Recommendations.md#Vault Analyser Skill — Design Recommendations#Status and next step","score":0.5880221094106013}]
```

**Findings**:
- Return is `Array<{key, score, item, hypothetical_i}>` (top-level `key`, NOT `item.key` as in BI-026's `find_connections`).
- `key` shape: `"folder/file.md#h1#h2#{N}"` — `path#headingPath` joined by `#`. Sub-block sentinel `{N}` for unnamed-section blocks under a heading.
- `score` is a finite float ~0.59 for these results.
- The `item` field carries the smart_block back-reference object — NOT serialisable in full (circular reference to plugin's HTTP adapter — see F7). Wrapper MUST extract `{key, score}` only; pass the `item` field through `JSON.stringify` would fail.

**Implication**: R7 transform uses TOP-LEVEL `key`, NOT `item.key`. BI-026's `r.item.key` access pattern is BI-026-specific.

### F6 — Block-key format

**Finding**: key format is `<folder>/<file>.md#<h1>#<h2>...#{N}` where `{N}` is a numeric sub-block id for unnamed sub-sections under a heading. Multi-segment heading paths split on `#`. Path is everything before the first `#`.

**Implication**: same R7 split rule as BI-026. Wrapper's transform: `path = key.split('#')[0]; headingPath = key.split('#').slice(1)`. Source-level matches (key without `#`) yield `headingPath: []`. Frontmatter-block matches yield `headingPath: ["---frontmatter---"]` (sentinel preserved verbatim).

### F7 — Circular-reference protection (CRITICAL)

**Probe**:
```
obsidian "vault=The Setup" eval "code=(async()=>{const r=await app.plugins.plugins['smart-connections'].env.smart_sources.lookup({hypotheticals:['ML'],filter:{limit:1},collection:'smart_blocks'});return JSON.stringify(r[0])})()"
=> Error: Converting circular structure to JSON
    --> starting at object with constructor 'SmartHttpRequest'
    |     property 'adapter' -> object with constructor 'SmartHttpObsidianRequestAdapter'
    --- property 'main' closes the circle
```

**Finding**: serialising the raw match object (with `item` field) fails with a circular-reference error. The plugin's smart_block items have back-references to the plugin's HTTP adapter and the Obsidian Plugin object.

**Implication**: the wrapper's in-eval transform MUST extract `{key, score}` ONLY — never pass the raw match through `JSON.stringify`. The frozen JS template must do this transform inside the eval, NOT defer it to the handler stage.

### F8 — Plugin-side console output captures to stdout (CRITICAL — drove amendment 2)

**Finding** (across all lookup probes): the plugin's `console.log("Found and returned N smart_blocks.")` AND warning lines like `[warn] hypotheticals is required` are captured by the CLI on stdout BEFORE the `=> ` eval-return marker.

Example transcript:
```
[warn] hypotheticals is required
=> {"type":"object","isArray":true,"len":0}
```

Or:
```
Found and returned 10 smart_blocks.
=> [{"key":"...","score":0.59},...]
```

**Implication**: spec FR-011 amended (amendment 2). Handler stage-1 parse MUST locate the LAST `=> ` occurrence on stdout, NOT trimStart-and-slice-from-the-beginning. R14 codifies the canonical extraction.

### F9 — Zero-result behaviour for out-of-domain queries

**Probe**:
```
obsidian "vault=The Setup" eval "code=(async()=>{const r=await app.plugins.plugins['smart-connections'].env.smart_sources.lookup({hypotheticals:['xyzzy random nonsense gibberish'],filter:{limit:2},collection:'smart_blocks'});return JSON.stringify({len:r.length})})()"
Found and returned 10 smart_blocks.
=> {"len":2,"sample":[{"k":"421-Custom Connectors/...","s":0.617757455182317},{"k":"421-Custom Connectors/...","s":0.6095737950518162}]}
```

**Finding**: even for nonsense queries, the plugin returns up to `filter.limit` matches with relatively-low scores (~0.6). The plugin does NOT apply a minimum-score threshold by default — every query returns matches as long as the corpus has any indexed content.

**Implication**: the "zero results" case is uncommon for this tool (in contrast to BI-026's `find_connections` which can legitimately return 0 for outlier source notes). Still possible (empty vault; all-matches-have-non-finite-score) but rare. The empty-result-as-success contract (FR-014) still holds.

### F10 — Empty hypotheticals behaviour

**Probe**:
```
obsidian "vault=The Setup" eval "code=(async()=>{const r=await app.plugins.plugins['smart-connections'].env.smart_sources.lookup({hypotheticals:[],filter:{limit:3},collection:'smart_blocks'});return JSON.stringify(r)})()"
[warn] hypotheticals is required
=> {"error":"hypotheticals is required"}
```

**Finding**: empty `hypotheticals: []` returns the sentinel `{error: "hypotheticals is required"}`.

**Implication**: the wrapper's schema-level `.trim().min(1)` cap on `query` ensures the wrapper never sends an empty hypotheticals array. But the error-sentinel handling in the JS template still covers the case where an unknown future plugin condition produces this state (defensive — won't fire in current tested usage).

### F11 — Missing embed model behaviour

**Derived from source inspection in F3**: `if (!this.embed_model) return { error: "Embedding search is not enabled." };` — surfaces as the sentinel `{error: "Embedding search is not enabled."}`.

**Implication**: detected by R11's `r && r.error` check → mapped to `SMART_CONNECTIONS_NOT_READY(embed-failed)`. T0 can exercise this case by disabling the embed model in a fresh vault.

### F12 — Vault routing on lookup-based eval

**Probe**:
```
obsidian "vault=The Setup" eval "code=app.vault.getName()"
=> The Setup
```

**Finding**: `vault=<name> eval` routes the call to the named vault's `app` instance. Parity with BI-026 F1.

**Implication**: locks the wrapper's behaviour when the requested vault is OPEN. The cli-adapter's 011-R5 unknown-vault inspection clause handles the UNREGISTERED case; the shared `_eval-vault-closed-detection` module handles the REGISTERED-BUT-CLOSED case (F13 deferred).

### F13 — Closed-but-registered vault behaviour on lookup-based eval (DEFERRED TO T0)

**Deferred to T0 of `/speckit-implement`**. Requires the user to close a registered vault mid-session, which is intrusive at plan stage. The shared `_eval-vault-closed-detection` module is plugin-agnostic (it characterises the Obsidian CLI's response to `vault=<closed>` eval, not the plugin's response); BI-026's plan-stage probe confirmed the empty-stdout + transparent-open signature against `find_connections`-based eval. We expect the same signature for `lookup`-based eval — T0 verifies.

### F14 — First-install / settings-never-opened state (DEFERRED TO T0)

**Deferred to T0**. Requires a fresh vault before the user has opened Smart Connections settings and configured an embed model. Expected behaviour: `env.smart_sources.lookup` exists but `this.embed_model` is falsy → returns `{error: "Embedding search is not enabled."}` → wrapper emits `SMART_CONNECTIONS_NOT_READY(embed-failed)`. Distinct from the "plugin not installed" state (lookup doesn't exist at all).

### F15 — Very long query behaviour (DEFERRED TO T0)

**Deferred to T0**. The schema-level `.max(4000)` cap ensures the wrapper never sends a > 4000-char query. Local embed models with smaller context windows (256-512 tokens ≈ 1K-2K chars) will silently truncate at the embedding step; this is documented as inherited limitation #5. T0 can exercise by configuring a local model and submitting a 4000-char query, observing whether the truncation surfaces in any observable way (it should not — silently truncated per the model's tokenizer).

---

## Cases deferred to T0 of `/speckit-implement`

Per FR-024 / FR-026, the following F-findings are confirmed at plan stage but their full behavioural envelope is exercised at T0:

- F13: closed-but-registered vault on lookup-based eval (parity with BI-026's `find_connections` probe expected — same shared detector).
- F14: first-install / embed-model-not-configured state.
- F15: very-long-query truncation observability.
- Plugin-not-installed path: requires temporarily disabling Smart Connections in a vault.
- Path-traversal-in-query value end-to-end (verify base64-injection-protection holds against shell-metacharacter-bearing queries).
- Output-cap kill at impractical-but-contractual `limit` × match-length boundary (essentially unreachable per F9's observation).

---

## Summary

15 design decisions ratified (R1–R15). 12 live-CLI/live-plugin findings verified at plan stage (F1–F12); 3 deferred to T0 (F13–F15).

**Critical plan-stage live-probe-driven amendments**:
- **Amendment 1**: `hypotheticals` lives at the TOP LEVEL of `lookup({...})` params, NOT inside `filter` (drove FR-011 rewrite).
- **Amendment 2**: lookup errors return as `{error: <string>}` sentinels (not thrown); plugin-side console output captures to stdout before the `=> ` marker (drove FR-011 + handler stage-1 parse strategy rewrite per R14).

Both amendments preserve the spec's locked failure-mode roster (FR-013), the precedence chain (FR-017), and the shared-module factoring (FR-020). Only the in-eval call shape and the handler stage-1 parse logic change vs the pre-amendment design.
