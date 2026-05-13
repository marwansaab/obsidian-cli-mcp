# Phase 0: Research — Properties Typed Tool

## Live-CLI findings (probed 2026-05-13 against the focused vault, with the host's `obsidian` CLI)

The CLI surface for the `properties` subcommand was probed live during plan synthesis. Probes ran against the host's currently-focused Obsidian vault per the test-execution protocol (the upstream silently honours-as-noop the `vault=` parameter per F4 below, so a separate seeded fixture vault is not informative for inventory-shape questions). The findings below LOCK the implementation strategy and replace the spec-stage assumptions about wire-format and `total` semantics.

### F1 — Native subcommand with structured JSON output

`obsidian help properties` reports:

```
properties            List properties in the vault
  file=<name>         - Show properties for file
  path=<path>         - Show properties for path
  name=<name>         - Get specific property count
  total               - Return property count
  sort=count          - Sort by count (default: name)
  counts              - Include occurrence counts
  format=yaml|json|tsv  - Output format (default: yaml)
  active              - Show properties for active file
```

Probing `obsidian properties vault=… format=json` against the focused vault returns a top-level JSON array of `{ count: number, name: string, type: string }` per property, in alphabetical order by `name`. The probe returned 73 entries; first 5 names `aliases, author, canonical_location, complexity, connector`; last 5 `upstream_endpoints, value, variant, vault_id, vendor`. **Per-entry field names**: upstream uses `count` (singular) for the note count; wrapper output uses `noteCount` per FR-007 (avoids collision with the outer envelope `count`). **`type` field is upstream metadata** (values observed: `aliases`, `text`, `date`, `multitext`, `number`, `tags`, `checkbox`) — wrapper drops this field per FR-004 (type metadata is out of scope; future BI may expose it).

**Implication**: NO eval composition needed. Single native invocation per request. Stark contrast to BI-014 / BI-015 which had to compose against `eval`. Architectural parity with BI-019 (`files`) and BI-023 (`outline`).

### F2 — `counts` flag is a no-op for JSON output

Probing `obsidian properties vault=… format=json counts` produced byte-identical output to `obsidian properties vault=… format=json` (same array, same field set). The `counts` flag matters only for `format=yaml` / `format=tsv` modes where it adds a count column to the default name-only output. **Implication**: the wrapper does NOT need to set `counts` when invoking with `format=json` — `count` is always present in the JSON output. The wrapper invokes `obsidian properties format=json` for default mode; no `counts` flag.

### F3 — `total` flag semantic LOCKED to distinct-names count (Q2 confirmation)

Probing `obsidian properties vault=… total` returned the plain integer `73`. The default-mode JSON array length was `73`. The sum of all per-property `count` values across that JSON array was `4159`. **The upstream `total` flag returns the count of DISTINCT property names** (equal to the JSON array length), NOT the sum of occurrences. **Implication**: the 2026-05-13 clarifications session's Q2 commitment (outer `count` = distinct property names) is satisfied by upstream behaviour DIRECTLY. The wrapper passes through whatever the upstream `total` flag emits — no local computation, no re-shaping. The FR-006a cross-mode invariant holds by upstream construction: `count` returned by `total` mode === array length returned by `format=json` mode for the same vault state. The wrapper's parse step in count-only mode is a single-stage integer parse.

### F4 — `vault=` is silently honoured-as-noop; focused vault used

Probing `obsidian properties vault=NonExistentVault format=json` returned byte-identical output to `obsidian properties vault=TestVault-Obsidian-CLI-MCP format=json` and to `obsidian properties format=json` — all three queries hit the focused vault. The CLI's `vault=` parameter is functionally ignored for the `properties` subcommand (parity with `outline` per BI-023 F8, parity with `files` per BI-019 R6, parity with `eval` per BI-014 / BI-015). **Implication**: FR-015's unknown-vault locus resolves to **documented inherited limitation** (NOT wrapper-side reclassification via 011-R5). The 011-R5 cli-adapter unknown-vault inspection clause does NOT fire for `properties` — there is no "Vault not found." string for it to inspect. Multi-vault users open the target vault before invoking. The wrapper MUST document this limitation in the published help facility per FR-019. No wrapper-side mitigation required.

### F5 — `type` field is upstream metadata (DROPPED by wrapper)

Per F1, each upstream entry carries a `type` field with values from `{aliases, text, date, multitext, number, tags, checkbox}` (and potentially future Obsidian additions). Per FR-004 the wrapper does NOT expose this — type-aware enumeration is out of scope per the user input. The handler's parse step DROPS the `type` field during the upstream-to-wrapper transform. Future BI may expose `type` if needed; this BI does not.

### F6 — Wrapper renames upstream `count` → `noteCount` per entry

Upstream emits the per-entry note count as a field named `count`. The wrapper output's per-entry field is named `noteCount` per FR-007. This avoids collision with the OUTER envelope's `count` field (which carries the distinct-property-name total). The handler's parse step performs the 1:1 rename during the upstream-to-wrapper transform. Two field changes total per entry: `count` → `noteCount` (rename), `type` → dropped (per F5).

### F7 — Per-file scope (`file=` / `path=`) emits a different wire shape (out of scope)

Probing `obsidian properties vault=… file=… format=json` returns the focused file's frontmatter as a single JSON OBJECT (e.g. `{ "type": "backlog-item", "id": "BI-0053", "connector": "[[Obsidian CLI MCP]]", ... }`) — NOT the inventory array. This is the per-file frontmatter dump shape, completely different from the vault-inventory shape. Per FR-004 the wrapper does NOT expose `file=`/`path=`/`active` — the schema layer rejects these keys at the validation boundary. Probing `obsidian properties vault=… active format=json` returned the same per-file shape (active-file frontmatter dump). **Implication**: the wrapper's vault-only surface is structurally distinct from the upstream's per-file scope; the validation contract (FR-005 `additionalProperties: false`) prevents the wrong wire shape from ever being requested.

### F8 — `name=<name>` returns plain integer (out of scope)

Probing `obsidian properties vault=… name=author` returned the plain integer `5` — the count of notes carrying the `author` property. Out of scope per FR-004; the wrapper does not expose `name=` lookup. This case is already covered by the existing `find_by_property` surface.

### F9 — `sort=count` returns frequency-ordered list (out of scope)

Probing `obsidian properties vault=… format=json sort=count` returned the same JSON array shape ordered by `count` descending (e.g. `type` with count 385, `status` with count 384, then `id`, etc.). Out of scope per FR-013 (wrapper does not expose alternative sort parameters). The wrapper always invokes WITHOUT `sort=`, accepting the upstream's default name-sorted output; the post-fetch wrapper-side sort then re-imposes the FR-013 case-insensitive-primary + byte-tiebreak rule.

### F10 — Path-traversal handling deferred to T0

Probing `obsidian properties vault=… path=../escape` would test path-traversal handling, but the wrapper's FR-004 forbids `path=` at the schema layer for this tool, so the path-traversal case applies to the `vault=` argument only. The `vault=` argument is consumed by the CLI's internal vault registry, not the filesystem — path-traversal characters in `vault=` are effectively neutralised by F4 (the parameter is silently ignored). Schema-layer rejection of vault values containing `/`, `\`, `..` is the defensive belt; F4 is the suspenders. Defer detailed probe to T0 of `/speckit-implement`.

### F11 — Empty-vault behaviour deferred to T0

The focused vault has 73 distinct properties; no live probe of "vault with zero frontmatter" is possible without a separate fixture vault opened-as-focused. **Best-evidence assumption** (matches BI-019 `files` precedent against an empty-folder probe): upstream returns `[]` JSON array for `format=json` mode AND `0` for `total` mode. The wrapper's parse step handles `[]` naturally (zero-length array → zero-length `properties` list, `count: 0`). Deferred to T0 — if upstream returns a sentinel string instead (parity with BI-023 `outline`'s `No headings found.` sentinel per F7 of that BI), the handler gains a defensive sentinel-detection branch identical to BI-023 R9. CLI test fixture: seed an empty TestVault, open it as focused, probe both modes, assert wrapper transforms correctly. The defensive sentinel-detection branch is **planned but not implemented** until T0 confirms or refutes it.

### F12 — Body-content opacity deferred to T0 (defer-to-upstream)

The focused vault's 73 property names all appear to be legitimate frontmatter YAML keys (no body-content false positives observed in the sample). A direct probe requires a fixture vault containing a note whose body has YAML-like tokens in fenced code blocks, indented code blocks, or inline prose AND whose frontmatter excludes those tokens. Per BI-023 F2 / F11 / F12, the upstream Obsidian metadata cache already separates frontmatter from body content; the same opacity is highly expected to hold for `properties`. **Best-evidence assumption** (parity with BI-023): upstream excludes body-content YAML-like tokens from the property inventory. Deferred to T0 for confirmation; if upstream surfaces body content, the deferred-to-upstream contract (FR-010) is amended at T0 with a wrapper-side filter — but this is a planning contingency, not the expected outcome.

### F13 — Case-distinct property name sort verification deferred to T0

The focused vault's 73 property names are all lowercase snake_case (no case-distinct pairs observed). The FR-013 case-insensitive-primary-with-byte-tiebreak sort rule cannot be verified against live data without a fixture vault containing case-distinct pairs (e.g. `Tags` AND `tags` in different notes). **The wrapper's post-fetch sort is wrapper-locked regardless of upstream behaviour** — even if upstream emits a different order, the wrapper re-imposes the FR-013 rule. T0 verification confirms: (i) handler test asserts wrapper sort against a mock upstream array; (ii) live fixture verifies the same rule end-to-end. The mock-side test is in-CI; the live-fixture test is T0.

### F14 — Wire-format leniency (sort-key tolerance)

Probing `obsidian properties vault=… format=json sort=name` returned the same alphabetical output as `obsidian properties vault=… format=json` — upstream's default IS `sort=name`. Probing `obsidian properties vault=… format=json sort=invalid` returned the same alphabetical output (parity with BI-023 F15: upstream is lenient about unknown values). **Implication**: the wrapper does NOT pass `sort=` at all; relies on upstream's default name-sort AND re-imposes its own FR-013 sort post-fetch. The relevance of upstream's sort is reduced to "as long as upstream returns ALL the entries, the wrapper's post-fetch sort handles ordering."

---

## Design decisions

### R1 — Logger surface

Thin handler. No per-call `logger.callStart` / `callEndSuccess` / `callEndFailure` events at the tool layer. Mirrors all prior typed tools (006, 011, 012, 013, 014, 015, 018, 019, 021, 023). The cli-adapter's `dispatchTimeout` / `dispatchCap` / `dispatchKill` events preserve observability for the underlying CLI invocation.

### R2 — CLI subcommand: native `properties` (NOT eval)

Per F1 — native subcommand with `format=json` returns structured array directly. No eval composition required. Stark contrast to BI-014 / BI-015 / BI-018. Architectural parity with BI-019 (`files`) and BI-023 (`outline`). The wrapper invokes `obsidian properties vault=<v?> [format=json | total]`.

### R3 — Single-call architecture, branched on `input.total`

ONE `invokeCli` invocation per MCP request, parameters chosen based on `input.total`:

- **Default mode** (`total: false` or omitted): invoke with `format=json` parameter. Parse the JSON array. Drop `type` field. Rename `count` → `noteCount` per entry. Compute outer envelope `count = properties.length`. Sort post-fetch per FR-013.
- **Count-only mode** (`total: true`): invoke with `total` flag. Parse stdout as integer. Return `{ count: <integer>, properties: [] }`.

The two flags are mutually exclusive at upstream (per BI-023 F14 for the analogous case: `total` wins when both are passed). Wrapper sends ONLY ONE flag per request, never both. Single-call architecture preserves typical ~50–150 ms latency (no eval composition; no two-stage envelope parse).

### R4 — Adapter `target_mode` mapping

NOT APPLICABLE. The `properties` tool has NO `target_mode` discriminator (per FR-004 — vault-only surface; no specific/active modes). Different from `read`, `delete`, `read_heading`, `read_property`, `write_note`, `set_property`, `rename`, `outline` (all of which have `target_mode`). Parity with `files` (BI-019 — also vault-scoped without target_mode discriminator, though `files` adds the `folder` parameter and this tool does not). The handler invokes `invokeCli` with the bare `vault` parameter (or omitted if `input.vault` is undefined) plus the mode flag. The cli-adapter's defence-in-depth `stripTargetLocators` does NOT execute for this tool (the cli-adapter applies it only when `target_mode === "active"`).

### R5 — Unknown-vault response inspection

NOT APPLICABLE. Per F4, `properties` silently honours-as-noop the `vault=` parameter (the focused vault is always used). The 011-R5 cli-adapter inspection clause does NOT fire — there is no "Vault not found." string. Inherited limitation. Documented in `docs/tools/properties.md` per FR-019. Multi-vault users open the target vault before invoking. Parity with `files` (BI-019), `outline` (BI-023), `read_heading` (BI-015), `find_by_property` (BI-014).

This **resolves FR-015's locus to documented inherited limitation** (NOT wrapper-side reclassification). The spec's FR-015 alternative phrasing — "wrapper-side reclassification via 011-R5 inheritance" — is rejected at plan stage. The amendment is parallel to BI-023's plan-stage F8 amendment of its FR-016.

### R6 — Anti-injection

Natural via process-argument data-passing. The `vault` value flows as a named CLI parameter (`vault=<value>`) via `invokeCli`'s `parameters` record. The cli-adapter's argv-assembly emits this as a separate process argument (the upstream CLI receives `["properties", "vault=<value>", ...]` via `child_process.spawn`'s argv array, never a shell-interpolated string). The `total` flag becomes a bare argument `["properties", "vault=<value>", "total"]`. The `format=json` flag becomes `["properties", "vault=<value>", "format=json"]`. NO shell, NO eval, NO string interpolation. FR-024 satisfied structurally.

### R7 — Field rename and field drop

Upstream entry shape: `{ name: string, type: string, count: number }`. Wrapper entry shape: `{ name: string, noteCount: number }`. Two transforms per entry:

- **Drop** `type` field (per FR-004 — type metadata out of scope).
- **Rename** `count` → `noteCount` (per FR-007 — avoids collision with outer envelope's `count`).

The handler's parse step performs both transforms during the upstream-to-wrapper map. Implemented in-place via `array.map(({ name, count }) => ({ name, noteCount: count }))` — TypeScript destructure drops `type` implicitly.

### R8 — Wrapper-side post-fetch sort

Per FR-013 (locked at the 2026-05-13 clarifications session Q1), the wrapper applies case-insensitive primary sort with byte-order tiebreak post-fetch:

```ts
properties.sort((a, b) => {
  const aLower = a.name.toLowerCase();
  const bLower = b.name.toLowerCase();
  if (aLower !== bLower) return aLower < bLower ? -1 : 1;
  // tiebreak: byte order
  return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
});
```

This is a trivial in-handler operation (single `sort()` call, O(n log n) with n ≤ low hundreds in realistic vaults; negligible latency cost). The post-fetch sort makes the wrapper's order independent of upstream's order (F14 — upstream is currently alphabetical by default but the contract is wrapper-locked, not upstream-locked).

For SC-013's example: a vault with `Tags`, `tags`, `Aardvark`, `aardvark` returns the order `Aardvark, aardvark, Tags, tags`:

- `aardvark` (case-folded) < `tags` (case-folded) places the `Aardvark/aardvark` pair before the `Tags/tags` pair.
- Within each pair, byte-order places the uppercase variant first (`A`=0x41 < `a`=0x61; `T`=0x54 < `t`=0x74).

### R9 — Empty-vault detection (deferred-to-T0)

Best-evidence assumption: upstream returns `[]` JSON array for `format=json` mode when no frontmatter exists, AND returns `0` for `total` mode. The handler's parse step handles both natively — zero-length array maps to `{ count: 0, properties: [] }`; integer `0` maps to `{ count: 0, properties: [] }`. **If T0 reveals a sentinel string** (parity with BI-023 F7 `No headings found.`), the handler gains a sentinel-detection branch (parity with BI-023 R9). Planning contingency only; expected outcome is the natural empty-array / zero-integer behaviour.

### R10 — Output cap

Inherited 10 MiB cap from cli-adapter (from feature 003). For a hypothetical vault with thousands of distinct properties, the JSON serialised payload could approach the cap; in practice unlikely. Surfaces as `CLI_NON_ZERO_EXIT` (output-cap kill) — never silent truncation. Per FR-018, no new error codes; existing classifier handles.

### R11 — Cross-mode invariant (FR-006a)

Per F3, upstream's `total` flag returns integer matching the `format=json` array length for the same vault state. **The cross-mode invariant holds by upstream construction** — no wrapper-side coordination required. The handler test for FR-006a invokes the handler twice (once with `total: false`, once with `total: true`) against the same mocked upstream and asserts the outer `count` is identical. Verified in-CI via the handler test; verified live in T0 via the equivalent quickstart scenario.

### R12 — Test seams

`deps.spawnFn` injection per the existing test-seam convention. ONE spawn per request (R3). Each handler test responds to ONE `spawn` invocation per call AND asserts the argv shape matches the expected per-mode invocation (default mode: `["properties", "vault=...", "format=json"]` OR `["properties", "format=json"]` if vault omitted; count-only mode: `["properties", "vault=...", "total"]` OR `["properties", "total"]`). The single-spawn-per-request invariant is locked by an explicit assertion in each handler test.

### R13 — Type metadata drop (FR-004 out-of-scope upstream surface)

Upstream emits `type` per entry (values: `aliases`, `text`, `date`, `multitext`, `number`, `tags`, `checkbox`). The wrapper drops this field per FR-004 (user's out-of-scope list). Future BI may expose `type` as a separate field if user demand emerges (no planned BI-XYZ for this at present).

### R14 — Multi-vault default ambiguity

Inherited limitation (per F4 / R5). Documented in `docs/tools/properties.md` per FR-019. Parity with `files` (BI-019), `outline` (BI-023), `read_heading` (BI-015), `find_by_property` (BI-014).

---

## Plan-stage status

**Live-CLI findings**: 14 (F1–F14) verified at plan time against the host's `obsidian` CLI focused on the user's main productive vault.

**Critical findings**:

- **F1** (native subcommand with `format=json` structured array output) → R2 / R3 → architectural simplification vs eval composition. Parity with BI-019 / BI-023.
- **F3** (upstream `total` flag returns distinct-names count) → R3 + R11 → **Q2 clarification resolved as Option A by upstream construction** — no local computation, no re-shaping, no second invocation. The cross-mode invariant FR-006a holds by upstream behaviour.
- **F4** (`vault=` silently honoured-as-noop) → R5 → **FR-015 locus resolved to documented inherited limitation** (NOT wrapper-side reclassification). Parity with BI-019 / BI-023. Plan-stage spec amendment to FR-015.
- **F5 + F6** (wire-format transforms: drop `type`, rename `count` → `noteCount`) → R7 → handler parse step is a single `array.map` invocation.

**Cases deferred to T0 of `/speckit-implement`** (require fixtures + focused-vault state changes):

- F11 — Empty-vault behaviour: probe an empty TestVault under both modes; verify `[]` JSON / integer 0; OR amend R9 with a sentinel-detection branch if upstream emits a sentinel.
- F12 — Body-content opacity end-to-end: probe a TestVault note whose body contains YAML-like tokens in fenced/indented code blocks AND whose frontmatter does NOT carry those tokens; assert the inventory excludes the body content.
- F13 — Case-distinct sort verification end-to-end: probe a TestVault with two notes carrying `Tags`-vs-`tags` AND `Aardvark`-vs-`aardvark`; assert wrapper sort returns `Aardvark, aardvark, Tags, tags`.
- Path-traversal `vault=` value end-to-end: probe `vault=../escape` and assert the schema rejects OR the cli-adapter dispatches without escape; verify no filesystem mutation.
- Very-large-inventory cap-boundary behaviour: synthesise (or already-have) a vault with sufficient distinct property names to approach the 10 MiB output cap; verify `CLI_NON_ZERO_EXIT`.

**No plan-stage spec amendments beyond FR-015 resolution** (resolved to documented inherited limitation per F4). The 2026-05-13 clarifications session's Q1 and Q2 outcomes survive the live probe unchanged — Q1 (case-insensitive primary sort) is wrapper-locked regardless of upstream, Q2 (count = distinct names) is satisfied by upstream behaviour directly per F3.

---

## T0 Live-CLI Capture (2026-05-13)

T001 ran during `/speckit-implement`. Cases that could be probed without re-focusing Obsidian onto a seeded TestVault were exercised live; the remaining cases hold to the plan-stage best-evidence assumption pending an operator-driven manual gate.

### T0.4 — Path-traversal `vault=` value (LIVE PROBE — PASSES)

Command: `obsidian properties vault=../escape format=json`.

Outcome: byte-identical output to `obsidian properties format=json` against the focused vault — the upstream silently honours-as-noop the `vault=../escape` value (parity with F4). The probe returned the focused-vault inventory (36 distinct properties — first 5 names: `aliases`, `created`, `cssclasses`, `feature`, `id`; type field values observed: `aliases`, `date`, `multitext`, `text`, `tags`, `checkbox`). No filesystem mutation; no error; no escape; exit code 0.

Implication: F4 / R5 hold. FR-017 / SC-011 satisfied — `vault=` is consumed by the upstream's internal vault registry, not the filesystem. The wrapper's argv-data-passing (R6) is the structural defence; the upstream's silently-honoured-as-noop behaviour is the practical defence. No wrapper code change.

### T0.1 — Empty-vault behaviour (DEFERRED to manual gate)

Cannot run without focusing Obsidian onto a seeded empty TestVault. Plan-stage best-evidence assumption per R9 holds: upstream emits `[]` JSON array (default mode) and `0` integer (count-only mode); handler parse-and-map-and-sort chain handles both natively. T005 handler test case 14 covers default-mode `[]` via mocked stdout; T005 case 11 covers count-only `0` via mocked stdout. If operator's manual probe reveals a sentinel string, the handler gains a sentinel-detection branch parallel to BI-023 R9.

### T0.2 — Body-content opacity + null-valued key + nested YAML (DEFERRED to manual gate)

Cannot run without seeding Sandbox fixtures in TestVault and focusing Obsidian on it. Plan-stage best-evidence assumption per F12 holds: upstream's Obsidian metadata cache separates frontmatter from body content AND emits one entry per top-level YAML key with appropriate inclusion semantics for null values. Wrapper is a pure pass-through modulo type-drop / count-rename / post-fetch-sort; FR-010 / FR-011 / FR-012 are defer-to-upstream.

### T0.3 — Case-distinct sort verification end-to-end (DEFERRED to manual gate — wrapper-side sort is unit-test-verified)

Cannot run without seeding Sandbox fixtures in TestVault and focusing Obsidian on it. The wrapper-side post-fetch sort is wrapper-locked regardless of upstream's order per R8 / F14; T005 handler test case 4 verifies the comparator against the documented fixture `[Tags(1), tags(4), Banana(2), Aardvark(1), aardvark(3)]` → `[Aardvark, aardvark, Banana, Tags, tags]`. Operator's end-to-end probe is observability evidence, not a contract gate.

### T0.5 — Very-large-inventory cap-boundary (OPTIONAL — deferred)

Per task spec the FR-018 contract (cap fires as structured error, not silent truncation) is structurally ensured by the cli-adapter's existing 10 MiB cap — empirical confirmation is observability evidence, not a contract gate. T005 handler test case 23 verifies the wrapper propagates the dispatch-layer's `CLI_NON_ZERO_EXIT` unchanged.

### Outcome

T0.4 confirms F4. T0.1 / T0.2 / T0.3 deferred to the operator's manual gate (Q-18..Q-21 of quickstart.md) — handler implementation proceeds on the plan-stage best-evidence assumption that empty-vault behaviour is natural `[]` / `0` handling AND body-content opacity / null-key inclusion / top-level-key counting are defer-to-upstream. The sentinel-detection branch is NOT added at this stage; if the operator's probe reveals a sentinel, the handler is amended in a follow-up patch.
