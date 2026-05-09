# Research — `read_property` Typed MCP Tool

**Feature**: [013-read-property](./spec.md)
**Date**: 2026-05-09

This document is the Phase 0 output of `/speckit-plan` for `013-read-property`. It records the design decisions ratified during plan-stage characterisation against the live Obsidian CLI, the spec-vs-actual-codebase reconciliations adopted from the [011-write-note](../011-write-note/research.md) and [012-delete-note](../012-delete-note/research.md) precedents, the FR-024 case-capture status, and — critically — the resolution of the two clarifications session contingencies (Q1 absent-vs-explicit-null distinguishability, Q2 mapping value handling).

The convention mirrors prior research artefacts: each decision (`Rn`) carries Decision / Rationale / Alternatives. Plan-stage live-CLI findings are quoted verbatim. The handler's two-call architecture, response parsing, and type-label translation will be locked against this artifact at implementation time.

---

## R1 — Logger surface (FR-009 reconciliation, supersedes spec FR-009 wording where applicable)

**Decision**: `read_property`'s handler is a thin wrapper that issues two `invokeCli` calls per request (see R3). It does NOT emit per-call `logger.callStart` / `logger.callEndSuccess` / `logger.callEndFailure` events at the tool layer. Observability flows through the cli-adapter's existing `dispatchTimeout` / `dispatchCap` / `dispatchKill` events, end-to-end, for each of the two underlying CLI invocations. `RegisterDeps` accepts `logger: Logger` for forwarding to the adapter / queue layer.

**Rationale**: Continues the [011-write-note PSR-1](../011-write-note/research.md) / [012-delete-note R1](../012-delete-note/research.md) precedent. The actual sibling handlers at [src/tools/read_note/handler.ts](../../src/tools/read_note/handler.ts), [src/tools/write_note/handler.ts](../../src/tools/write_note/handler.ts), and [src/tools/delete_note/handler.ts](../../src/tools/delete_note/handler.ts) are tight `invokeCli` wrappers that emit no per-call events. `read_property` mirrors them. The cli-adapter's dispatch events preserve observability for timeout / output-cap / kill-on-shutdown scenarios; per-call events are not wired in any tool.

**Alternatives**:
- (A) Add `callStart` / `callEndSuccess` / `callEndFailure` methods to the `Logger` interface AND emit them from `read_property`. Rejected: requires modifying the frozen `Logger` surface, asymmetry vs the four prior tools, and adds maintenance burden without a concrete observability requirement.
- (B) Emit per-CLI-call events from the tool layer to record the two-call structure (R3). Rejected: duplicates events the cli-adapter already emits for each underlying call; the two-call shape is internal implementation detail not directly observable from the MCP wire.

**Spec.md amendment**: NONE. Per R12 below, spec.md FR-009 wording is left in place for historical traceability; this PSR is the operative contract.

---

## R2 — CLI subcommand selection: `properties` (plural) with `format=json`, NOT `property:read`

**Decision**: `read_property` routes through the live CLI's `properties` subcommand (plural, with `format=json`), NOT the apparently more direct `property:read` subcommand. Two structural problems make `property:read` unsuitable for the typed surface:

1. **Lossy native types**: `property:read` returns the value as plain UTF-8 text on stdout, with no JSON / YAML / type-tagged envelope. A list value renders as one element per line; a number renders as text; a boolean renders as `true` / `false` (literal text); a YAML-null renders as the empty string; the literal YAML string `"null"` ALSO renders as the empty string... no wait, it renders as `null`. **The literal-null-vs-yaml-null distinction collapses at the wire** (Q1 contract violation).
2. **Broken on mapping values**: a YAML mapping value renders as the JavaScript stringification `[object Object]` — not the structural value. Q2's contract (`{value: <raw structural value>, type: "unknown"}`) cannot be satisfied through `property:read`.

The `properties` (plural) subcommand with `format=json` solves both: it returns the file's frontmatter as a JSON object with native types preserved per the JSON encoding (string / number / boolean / array / null / object) and distinguishes null-vs-"null" via JSON's structural distinction (`null` vs `"null"`). The wrapper extracts the requested property by name from the parsed JSON.

**Rationale**: live verification on 2026-05-09 against the test vault `TestVault-Obsidian-CLI-MCP`. Probe results are captured under [Live CLI Findings](#live-cli-findings) below.

**Subcommand argv shape** (from `obsidian help`):
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

Note that `name=<name>` on `properties` is **NOT** a value-extraction filter — it returns a count integer (`1` if the property exists in the vault, `0` if not). The wrapper does NOT pass `name=` to the CLI; it post-filters the JSON object in handler code to extract the requested property.

**Alternatives considered**:
- (A) `property:read name=<n> path=<p>`: **REJECTED** for the two structural problems above (lossy types, broken on mappings).
- (B) Custom-write a CLI plugin that returns `{value, type}` in one call: out of scope; the typed surface is meant to wrap the existing CLI surface, not extend it.
- (C) Parse the on-disk frontmatter directly with a YAML library: violates the project's "thin wrapper, no client-side YAML parsing" idiom (FR-018 spirit).

---

## R3 — Two-call architecture: file-scoped value + vault-scoped type label

**Decision**: each `read_property` MCP call fires **two** underlying CLI invocations.
1. **Call A — file-scoped value**: `obsidian vault=<v> properties path=<p> format=json` (specific mode) or `obsidian properties active format=json` (active mode). Returns the file's frontmatter as a JSON object. The wrapper parses it and extracts the requested property by name. Determines `value` AND whether the property is absent vs explicit-null.
2. **Call B — vault-scoped type metadata**: `obsidian vault=<v> properties format=json` (always vault-scoped, regardless of `target_mode`). Returns a JSON array of `{name, type, count}` objects covering every property name observed in the vault. The wrapper looks up the requested name and reads its `type` field.

The wrapper merges the two responses: `{value: <call-A value>, type: <call-B type, translated through R6's table>}`.

**Rationale**: the spec's `{value, type}` output requires two pieces of information that the live CLI surfaces through different channels. The file-scoped JSON channel (Call A) preserves native types via JSON encoding but **loses the date-vs-datetime-vs-text distinction** because all three render as JSON strings. The vault-scoped metadata channel (Call B) carries Obsidian's resolved type labels — the only authoritative source for the date / datetime / text distinction. There is no single-call subcommand that carries both.

**Performance cost**: per request, two CLI subprocess spawns. Both serialise through the project's single-in-flight queue (per FR-008 inherited from [006-read-note](../006-read-note/spec.md) FR-016), so the second call cannot start until the first completes. End-to-end latency per request ≈ 2× the single-call equivalent. The vault-scoped metadata response size scales with the number of distinct property names in the vault (typically ~10s; pathological vaults with thousands of properties produce ~50KB+ JSON responses). Both calls run within the typed-tool 10 s timeout / 10 MiB output cap.

**Optimisation deferred**: a "lazy on string ambiguity" optimisation would skip Call B when the JSON value's runtime type already determines the spec's type label (number → "number"; boolean → "checkbox"; array → "list" or "unknown"; object → "unknown"; null at-key-absent → "unknown"). Only when the JSON value is a string OR null-at-key-present does Call B become necessary. Estimated ~30-60% of real-world reads hit the string case (frontmatter is text-heavy), so the optimisation halves the worst-case but doesn't eliminate it. Deferred to a future BI; the baseline implementation makes Call B unconditionally for predictability and to keep the handler shape simple.

**Single-call alternative (rejected)**: structural type derivation from JSON runtime type alone, with date/datetime regex inference on string values. Rejected because:
- A user-typed-as-`text` field whose value happens to look date-shaped (e.g., `note_id: "2026-12-31"`) would be mislabelled `"date"` by regex, contradicting Obsidian's own resolved label.
- Conflicts with the spec's "whatever Obsidian's property-type system resolves" language (Edge Cases / CONTENT — null disambiguation).
- Invents semantics beyond what the CLI surfaces — violates the project's thin-wrapper idiom.

**Alternatives considered**:
- (A) Single-call structural derivation with regex-inferred date/datetime. Rejected per above.
- (B) Cache vault-scoped metadata across requests within a server lifetime (TTL or invalidate-on-mutation). **Rejected**: introduces stateful behaviour into the tool layer; cache invalidation is fragile (`property:set type=...` can mutate labels at any time, including from outside the MCP server's awareness). The project's existing tools are stateless.
- (C) Spec amendment: drop the date/datetime distinction; collapse all string-typed properties to `type: "text"`. **Rejected**: loses information the spec author explicitly required (US1 AC#5, AC#6).

**Trigger to revisit**: a future Obsidian CLI version exposes a single-call subcommand returning `{value, type}` (e.g., a `property:read` revision that includes type metadata, or a new `property:get` subcommand). Alternatively: a measured observability study shows the two-call latency hurts agents materially → adopt the lazy-on-string optimisation.

---

## R4 — Active mode: the `active` flag is the scope selector

**Decision**: in active mode, the wrapper invokes:

- Call A: `obsidian properties format=json active` (with the `active` flag — required to scope to the focused note).
- Call B: `obsidian properties format=json` (vault-scoped — does NOT use `active`; Obsidian's resolved type labels are vault-wide, not focused-note-specific).

Note that Call A in active mode does **not** include `vault=` (active mode has no vault locator per the target-mode primitive), but Call B for type lookup DOES need `vault=` to identify which vault's type-metadata to query. **This means active mode requires the wrapper to determine the focused note's vault before Call B can be issued.**

**Live verification**:

```
PS> obsidian properties format=json
[
  { "name": "aliases", "type": "aliases", "count": 0 },
  ...
]
```

Without the `active` flag, `properties format=json` (no vault, no path) returns vault-wide metadata for the **default vault** (whichever Obsidian considers active at the registry level — distinct from the focused-note's vault).

```
PS> obsidian properties format=json active
Error: No active file. Use file=<name> or path=<path> to specify a file.
```

When no Obsidian editor instance has a focused note, the `active` flag's resolution fails with the standard "no active file" error.

**Active-mode vault discovery**: there are two possible patterns:
1. **Single-vault assumption**: assume the user has only one Obsidian vault registered. The vault-scoped Call B can use `obsidian properties format=json` (no `vault=`). This works for users with one vault but fails silently for multi-vault setups (returns the wrong vault's metadata).
2. **Vault discovery via `obsidian vault info=name`**: a separate CLI call before Call B to determine the focused note's vault. **Adds a third CLI call** to active-mode requests.

**Decision for the planning phase**: the simpler single-vault assumption is **rejected** because the live test environment already shows two registered vaults (`The Setup`, `TestVault-Obsidian-CLI-MCP`). A multi-vault user would silently get wrong type labels in active mode.

**Adopted approach**: **active mode in `read_property` is documented as having a known limitation** in the case of multi-vault Obsidian configurations: the type metadata may be queried against the default vault, not the focused-note's vault. Specific mode is the recommended path for type-correctness when multiple vaults are registered. Single-vault users get correct behaviour with the simpler implementation. This is documented in `docs/tools/read_property.md` per FR-022.

The handler implementation: active-mode Call B uses `obsidian properties format=json` (no `vault=`). Multi-vault correctness in active mode is a deferred enhancement (would require introducing a vault-discovery probe; out of scope for this BI).

**Alternatives**:
- (A) Always issue a `vault info=name` discovery probe in active mode (3 CLI calls per active-mode request). Rejected: trebles latency for a corner case that single-vault users (the dominant use case) don't hit.
- (B) Forbid active mode entirely. Rejected: breaks consistency with the typed-tool target-mode contract; spec US2 explicitly requires active mode.
- (C) Document the limitation and fall back to "default vault" for type metadata in active mode. **ADOPTED**.

**Trigger to revisit**: a user reports incorrect type labels in active mode with multiple vaults. Resolution: introduce vault-discovery, accept the third CLI call.

---

## R5 — Unknown-vault response inspection: inherited from 011-write-note R5, no further changes

**Decision**: `read_property` inherits the cli-adapter's existing unknown-vault response-inspection clause introduced by 011-write-note R5 / T002 (see [src/cli-adapter/cli-adapter.ts:55-89](../../src/cli-adapter/cli-adapter.ts#L55-L89)). Both Call A and Call B run through `invokeCli` and benefit from the inspection automatically. No further adapter changes are needed.

**Live verification** — running an unknown-vault probe against the `properties` subcommand:

```
PS> obsidian vault=NoSuchVault properties path=Sandbox/013-plan-types.md format=json
Vault not found.
EXIT=0
```

Response is byte-identical to the wording observed against `create` (011) and `delete` (012). The adapter's `UNKNOWN_VAULT_PREFIX = "Vault not found."` re-classifier catches this and surfaces `CLI_REPORTED_ERROR` regardless of subcommand.

**FR-024 case (i) status — unknown vault**: VERIFIED during plan stage. No T0 work needed.

**Alternatives**:
- (A) Add `properties`-specific unknown-vault inspection. Rejected: duplicates adapter logic; the adapter-layer fix from 011 already covers this case.
- (B) Pre-validate vault names. Rejected: same reasoning as 012 R5 (no `list_vaults` primitive in the typed surface).

---

## R6 — Type label translation: Obsidian → spec enum

**Decision**: the wrapper translates Obsidian's resolved property-type labels (from Call B) to the spec's seven-label enum via a fixed lookup table. Unrecognised Obsidian labels collapse to `"unknown"`.

**Translation table**:

| Obsidian label (Call B `type`) | Spec label (output `type`) | Notes |
|---|---|---|
| `text` | `text` | Direct |
| `multitext` | `list` | Obsidian's internal name for "list of text" — translates to spec's "list" |
| `aliases` | `list` | Built-in Obsidian field; value is array-shaped |
| `tags` | `list` | Built-in Obsidian field; value is array-shaped |
| `number` | `number` | Direct |
| `checkbox` | `checkbox` | Direct |
| `date` | `date` | Direct |
| `datetime` | `datetime` | Direct |
| `unknown` | `unknown` | Direct (Obsidian itself uses this label for mapping values per Q2) |
| (anything else) | `unknown` | Future-Obsidian-version-safe fallback |

**Rationale**: live verification confirmed Obsidian uses `multitext` for arrays-of-strings rather than `list`; uses `aliases` and `tags` for the two built-in fields with array values; uses `unknown` for mapping (object) values. The spec's enum was authored against the hypothesised Obsidian labels (the six labels named in `property:set type=...`'s help output: `text|list|number|checkbox|date|datetime`); the actual labels diverge for the array case.

**Live characterisation snapshot** (vault metadata for the plan-stage fixture file):

```json
[
  { "name": "checkbox_field",       "type": "checkbox",  "count": 1 },
  { "name": "cssclasses",           "type": "multitext", "count": 0 },
  { "name": "date_field",           "type": "date",      "count": 1 },
  { "name": "datetime_field",       "type": "datetime",  "count": 1 },
  { "name": "explicit_null_field",  "type": "text",      "count": 1 },
  { "name": "list_field",           "type": "multitext", "count": 1 },
  { "name": "literal_null_string",  "type": "text",      "count": 1 },
  { "name": "mapping_field",        "type": "unknown",   "count": 1 },
  { "name": "number_field",         "type": "number",    "count": 1 },
  { "name": "text_field",           "type": "text",      "count": 1 }
]
```

(Built-in `aliases` / `tags` types appear with `count: 0` because the fixture file did not declare them; their type assignment was inferred from the help text and confirmed for `aliases` / `tags` semantics.)

**Type assignment for explicit-null vs absent**: a key with explicit YAML null value appeared with `type: "text"` — Obsidian assigned a typed label even though the value is null. Combined with the absent-key case (key not in Call B's metadata array OR appearing with `count: 0`), this **resolves the Q1 contingency** (see R8 below).

**Alternatives**:
- (A) Use Obsidian's labels verbatim in the spec output (no translation). Rejected: `multitext`, `aliases`, `tags` are Obsidian-internal vocabulary that the spec author explicitly chose against; the spec's seven-label enum is the public contract.
- (B) Pass through unrecognised labels unchanged (instead of falling back to `"unknown"`). Rejected: would let future-Obsidian-version label additions silently leak through the typed surface and break the output schema's strict shape.

---

## R7 — `No frontmatter found.` response: tool-layer detection, FR-011 / FR-012 spec amendment

**Decision**: when Call A's stdout starts with `No frontmatter found.` (verified live: this is Obsidian's response for both **a file with no frontmatter block** AND **a file with malformed frontmatter** — Obsidian conflates the two), the handler short-circuits and returns `{value: null, type: "unknown"}` per FR-011 semantics. No type lookup (Call B) is needed.

**Live verification — no frontmatter**:

```
PS> obsidian vault=TestVault-Obsidian-CLI-MCP properties path=Sandbox/013-plan-no-fm.md format=json
No frontmatter found.
EXIT=0
```

**Live verification — malformed frontmatter (missing closing fence)**:

```
PS> obsidian vault=TestVault-Obsidian-CLI-MCP properties path=Sandbox/013-plan-malformed.md format=json
No frontmatter found.
EXIT=0
```

**Spec amendment (FR-011 / FR-012 conflation)**: the spec's FR-011 ("no error on no-frontmatter") and FR-012 ("structured error on malformed frontmatter") cannot both be honoured against the live CLI because Obsidian's response is byte-identical for both shapes. The amendment direction:

- **FR-011 stays**: `No frontmatter found.` from Call A → `{value: null, type: "unknown"}` (no error).
- **FR-012 weakened**: malformed frontmatter is **conflated with no-frontmatter** by Obsidian. The wrapper does **not** distinguish the two cases. A malformed frontmatter block produces the same `{value: null, type: "unknown"}` response as a missing block.

The spec author's clarifications session 2026-05-09 contingency mechanism (the "Q1 contingency") establishes the precedent for this kind of "amend at planning time when live CLI conflates" amendment. FR-012's commitment to a structured error was authored in the absence of live-CLI characterisation; the amendment surfaces the conflation rather than synthesizing a structured error from no input data. The wrapper-side YAML parsing alternative (detecting the missing closing fence client-side before invoking the CLI) is rejected per the project's thin-wrapper idiom.

**Detection mechanism in the handler**: Call A's success-path response is one of three shapes:
1. A JSON object on stdout (frontmatter present and parseable) → JSON.parse + name lookup.
2. The string `No frontmatter found.` on stdout (frontmatter absent or malformed) → short-circuit return `{value: null, type: "unknown"}`.
3. Anything else → throw `UpstreamError({code: "CLI_REPORTED_ERROR", details: { stdout }, message: "read_property could not parse Call A response: ..."})`.

The detection is at the tool layer (handler), not the cli-adapter layer. The cli-adapter's existing inspection clauses (`Error:` prefix → `CLI_REPORTED_ERROR`, `Vault not found.` → `CLI_REPORTED_ERROR`) do not match `No frontmatter found.` because it's a tool-specific successful-response shape, not a cross-tool error.

**Spec.md amendment**: NONE — per R12, this PSR is the operative contract; FR-012's wording is left in place for historical traceability. The merge-stage Constitution Compliance checklist will cite R7 in its evidence section so reviewers can trace the resolution to the PR.

**Alternatives**:
- (A) Surface `No frontmatter found.` as a structured error, weakening FR-011 instead of FR-012. Rejected: FR-011 is the more useful behaviour for agents (no-fm files are common in Obsidian; agents shouldn't have to handle them as errors); the spec author's primary intent (US1 AC#8) is that no-fm == missing-property.
- (B) Add wrapper-side YAML parsing to detect malformed frontmatter pre-CLI. Rejected: violates thin-wrapper idiom; adds a YAML parser dependency.
- (C) Add `No frontmatter found.` to the cli-adapter's inspection clauses (cross-tool). Rejected: the response is tool-specific (only `properties` produces it); other tools wouldn't benefit and the adapter would carry semantically-meaningless inspection logic.

---

## R8 — Q1 contingency does NOT fire; Q2 confirmed

**Q1 — absent vs explicit-null distinguishability**: the clarifications session 2026-05-09 Q1 (locked answer C) committed to: "trust Obsidian's resolution — the `type` label is the discriminator; if Obsidian conflates the two at a single `{value: null, type: 'unknown'}` shape, this contract is amended at planning time." Live characterisation: **the contingency does NOT fire**. Obsidian distinguishes the two cases through the type-metadata channel:

- **Absent property** (key not in any file's frontmatter): the property does not appear in Call B's vault-scoped metadata array — i.e., `parsed_b.find(p => p.name === requested_name) === undefined` — OR appears with `count: 0`. The wrapper detects this absence in the file-scoped Call A (key not in JSON object) and returns `{value: null, type: "unknown"}` without consulting Call B.
- **Explicit YAML null property** (key in frontmatter with no value): the property appears in Call A's JSON object with `value: null` AND in Call B's metadata array with a typed label (e.g., `"text"` for the plan-stage fixture's `explicit_null_field`). The wrapper returns `{value: null, type: <translated Obsidian label>}`.

The two cases ARE distinguishable: absent surfaces `type: "unknown"`; explicit-null surfaces `type: "<typed-label>"`. SC-007 holds verbatim. Spec lines 111-112 / FR-009 are honoured.

**Q2 — mapping value handling**: the clarifications session 2026-05-09 Q2 (locked answer A) committed to: "extend US4's unresolvable-shape principle uniformly; mappings return `{value: <raw structural value>, type: 'unknown'}`." Live characterisation: **Obsidian's resolved label for mapping values is `"unknown"` natively** — so the wrapper's translation rule (R6) maps Obsidian `"unknown"` → spec `"unknown"` directly, no special handling. Q2's commitment is satisfied verbatim by Obsidian's own behaviour.

**Q1 + Q2 implication for the schema**: the output schema's `value` admits string / number / boolean / array / object / null. The handler emits the JSON-parsed value verbatim (no flattening, no coercion). FR-027 is the codifying entry; the schema in [data-model.md](./data-model.md) reflects the union.

**Alternatives**:
- For Q1 fall-back (had the contingency fired): drop distinguishability (option B from the original Q1) was the leading candidate. Not exercised because the contingency didn't fire.

---

## R9 — Test seams (FR-016)

**Decision**: handler tests inject `deps.spawnFn` per the cli-adapter's existing test-seam convention. **The test seam fires once per `read_property` MCP call but receives TWO spawn invocations** (one for Call A, one for Call B). Schema tests use `safeParse` directly (no adapter involvement). Registration tests assert the descriptor shape and exercise propagate-via-handler behaviours.

**Rationale**: adopts the [011-write-note R7](../011-write-note/research.md) / [012-delete-note R7](../012-delete-note/research.md) pattern. The spawnFn stub records each spawn invocation; tests assert both invocations' argv match expectations.

**Test scaffold sketch** (handler test for the happy path):

```ts
test("Story 1 AC#1 — text property happy path (Call A + Call B)", async () => {
  const argvCalls: string[][] = [];
  const stubResponses = [
    // Call A — file-scoped value
    { exitCode: 0, stdout: '{"status":"in-progress"}\n' },
    // Call B — vault-scoped type metadata
    { exitCode: 0, stdout: '[{"name":"status","type":"text","count":1}]\n' },
  ];
  let callIdx = 0;
  const stubSpawn = makeStubSpawn({
    onSpawn: (binary, argv) => argvCalls.push(argv),
    response: () => stubResponses[callIdx++]!,
  });
  const result = await executeReadProperty(
    { target_mode: "specific", vault: "Demo", path: "notes/x.md", name: "status" },
    { logger: createLogger(), queue: createQueue(), spawnFn: stubSpawn },
  );
  expect(result).toEqual({ value: "in-progress", type: "text" });
  expect(argvCalls.length).toBe(2);
  expect(argvCalls[0]).toEqual(["vault=Demo", "properties", "path=notes/x.md", "format=json"]);
  expect(argvCalls[1]).toEqual(["vault=Demo", "properties", "format=json"]);
});
```

**Sequencing constraint**: the queue's single-in-flight gate serialises Call A and Call B; the second spawn cannot start until the first resolves. Tests assert ordering by recording argv per spawn and verifying Call A's argv came before Call B's.

**Alternatives**:
- (A) Mock `invokeCli` directly. Rejected: doesn't exercise argv assembly, diverges from project test conventions.

---

## R10 — `import.meta.url` path resolution + coverage threshold preservation

**Decision**: adopts the [011-write-note R8 + R9](../011-write-note/research.md) / [012-delete-note R8 + R9](../012-delete-note/research.md) pattern verbatim.

- `import.meta.url`-based resolution in `index.test.ts` for the docs-existence assertion (avoids `process.cwd()` brittleness).
- The aggregate statements coverage floor at [vitest.config.ts:20](../../vitest.config.ts#L20) is preserved — `read_property`'s ~150 LOC source plus ~600 LOC of co-located tests provide near-100% coverage of the new module, so the aggregate either stays flat or ratchets up.

**Implementation pattern** (mirrors prior precedent):

```ts
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const docPath = resolve(__dirname, "../../../docs/tools/read_property.md");
const docBody = readFileSync(docPath, "utf8");
```

---

## R11 — Argv key for locator: `file=` and `path=` match schema fields directly (no rename)

**Decision**: the user-facing schema fields `file` and `path` map directly to CLI argv keys `file=<value>` and `path=<value>` for the `properties` subcommand. **No rename needed** — same posture as `read_note` and `delete_note` (and unlike `write_note` which renames `file` → `name=` for the create subcommand only).

**Live verification** (from `obsidian help`):

```
properties            List properties in the vault
    file=<name>         - Show properties for file
    path=<path>         - Show properties for path
```

The locator argv keys `file=` and `path=` match the user-facing schema field names directly. Handler emits `parameters: { file: input.file }` or `parameters: { path: input.path }` directly. No PSR-5-style rename clause.

**Alternatives**: same as 012 R3 — universal rename rejected, field rename rejected.

---

## R12 — Don't amend predecessor specs (project convention)

**Decision**: this research.md is the source of record for plan-stage discoveries that diverge from the spec's wording. The spec at [spec.md](./spec.md) is NOT amended retroactively; FR-009's logger-events wording, FR-012's structured-error-for-malformed wording, and Edge Cases / CONTENT — line-endings characterisation case (deferred to T0 per FR-024) are left in place even though R1, R7, and the FR-024 deferral list supersede them in operational terms.

**Rationale**: continues the [010-flatten-target-mode R10](../010-flatten-target-mode/spec.md) / [011-write-note R10](../011-write-note/research.md) / [012-delete-note R10](../012-delete-note/research.md) precedent. The spec captures intent at scaffold-time; plan-stage research surfaces "how the existing CLI actually behaves" findings that may differ from spec assumptions; those findings live in research.md (and in the merge-stage Constitution Compliance checklist's evidence section per FR-026 / Constitution Principle V). Retro-editing creates an archaeological problem.

The merge-stage Constitution Compliance checklist will cite R7 (FR-011/FR-012 conflation) and R3 (two-call architecture) explicitly so reviewers can trace each amendment to the implementing commit.

---

## Live CLI Findings (Plan-Stage Probes — 2026-05-09)

Probes run against `obsidian` CLI on Windows during plan stage, against the authorised test vault `TestVault-Obsidian-CLI-MCP` (per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md), inaccessible to the repo; CLAUDE.md `## Test Execution` section is the in-repo gate). Reproducible commands are in PowerShell. Fixture files were created under `Sandbox/` and cleaned up post-probe.

### Finding 1: `properties` subcommand argv shape

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

**Conclusions**:
- Subcommand: `properties` (plural). `name=` is **NOT** a value-extraction filter (returns count integer). The wrapper extracts the requested property by name client-side from the parsed JSON.
- `format=json` is the structural-encoding flag; the wrapper always uses it.
- `active` is the active-mode scope flag (per R4).
- File-scoped: `path=<p>` or `file=<n>` (R11 — direct map).

### Finding 2: file-scoped `properties format=json` returns native types via JSON

Fixture `Sandbox/013-plan-types.md` had frontmatter:

```yaml
---
text_field: in-progress
list_field: [alpha, beta]
number_field: 7
checkbox_field: true
date_field: 2026-12-31
datetime_field: 2026-05-08T14:30:00
literal_null_string: "null"
explicit_null_field:
mapping_field: {author: Marwan, source: 013-plan}
---
```

After explicit-typing date/datetime fields via `property:set type=date|datetime`, the file-scoped probe:

```
PS> obsidian vault=TestVault-Obsidian-CLI-MCP properties path=Sandbox/013-plan-types.md format=json
{
  "text_field": "in-progress",
  "list_field": ["alpha", "beta"],
  "number_field": 7,
  "checkbox_field": true,
  "date_field": "2026-12-31",
  "datetime_field": "2026-05-08T14:30:00",
  "literal_null_string": "null",
  "explicit_null_field": null,
  "mapping_field": {"author": "Marwan", "source": "013-plan"}
}
EXIT=0
```

**Conclusions**:
- Native JSON types preserved: string / number / boolean / array / null / object.
- `"null"` (literal YAML string) and `null` (YAML null) are distinguishable at the JSON wire (string `"null"` vs JSON null).
- date / datetime values both encode as JSON strings — **JSON encoding alone cannot distinguish text/date/datetime** (motivates Call B per R3).
- Mapping values preserve as JSON objects (Q2 confirmed).

### Finding 3: vault-scoped `properties format=json` returns Obsidian's resolved type labels

```
PS> obsidian vault=TestVault-Obsidian-CLI-MCP properties format=json
[
  { "name": "aliases",              "type": "aliases",   "count": 0 },
  { "name": "checkbox_field",       "type": "checkbox",  "count": 1 },
  { "name": "cssclasses",           "type": "multitext", "count": 0 },
  { "name": "date_field",           "type": "date",      "count": 1 },
  { "name": "datetime_field",       "type": "datetime",  "count": 1 },
  { "name": "explicit_null_field",  "type": "text",      "count": 1 },
  { "name": "list_field",           "type": "multitext", "count": 1 },
  { "name": "literal_null_string",  "type": "text",      "count": 1 },
  { "name": "mapping_field",        "type": "unknown",   "count": 1 },
  { "name": "number_field",         "type": "number",    "count": 1 },
  { "name": "tags",                 "type": "tags",      "count": 0 },
  { "name": "text_field",           "type": "text",      "count": 1 }
]
EXIT=0
```

**Conclusions**:
- Obsidian uses `multitext` (NOT `list`) for arrays of text. Translation table per R6 maps `multitext → list`.
- Built-in `aliases` / `tags` types appear with `count: 0` (the fixture didn't declare them); they translate to `list` per R6.
- Mapping values get `type: "unknown"` natively — Q2 → A is satisfied without wrapper translation.
- Explicit YAML null property (`explicit_null_field`) gets `type: "text"` — distinguishable from absent (which doesn't appear in the array). **Q1 contingency does NOT fire** (R8).
- Initial probe (before `property:set type=datetime` was run) showed `datetime_field → "text"` — Obsidian's auto-inference does NOT recognise unquoted YAML datetime as `datetime` type. After explicit `property:set type=datetime`, the label became `"datetime"`. **Implication**: the type label reflects Obsidian's stored property metadata (the `.obsidian/types.json` config), NOT a live YAML-parse inference. Files whose properties were never assigned a type via the Obsidian UI / CLI may report `type: "text"` for date / datetime values. Documented in `docs/tools/read_property.md` per FR-022 as a known limitation.

### Finding 4: Unknown-vault response (R5 inheritance)

```
PS> obsidian vault=NoSuchVault properties path=Sandbox/013-plan-types.md format=json
Vault not found.
EXIT=0
```

Byte-identical to 011 / 012 findings. R5 inheritance applies.

### Finding 5: Missing-file response (`Error:` prefix → CLI_REPORTED_ERROR)

```
PS> obsidian vault=TestVault-Obsidian-CLI-MCP properties path=Sandbox/__no_such_file__.md format=json
Error: File "Sandbox/__no_such_file__.md" not found.
EXIT=0
```

Caught by the dispatch layer's `Error:` prefix matcher → `CLI_REPORTED_ERROR`. No handler-layer change needed.

### Finding 6: No-frontmatter and malformed-frontmatter conflation (R7)

```
PS> obsidian vault=TestVault-Obsidian-CLI-MCP properties path=Sandbox/013-plan-no-fm.md format=json
No frontmatter found.
EXIT=0

PS> obsidian vault=TestVault-Obsidian-CLI-MCP properties path=Sandbox/013-plan-malformed.md format=json
No frontmatter found.
EXIT=0
```

Both cases produce identical responses. R7 amendment applies.

### Finding 7: Active mode without focused note

```
PS> obsidian properties format=json active
Error: No active file. Use file=<name> or path=<path> to specify a file.
EXIT=0
```

Caught by the dispatch layer's `Error:` prefix matcher. (The dispatch layer may further specialise to `ERR_NO_ACTIVE_FILE` per [003-cli-adapter](../003-cli-adapter/spec.md) FR-008(b); the handler propagates whichever code the adapter assigns.) Active mode with a focused note is deferred to T0 (requires a running interactive Obsidian instance and is straightforwardly the same response shape as specific mode per R4 + the file-scoped JSON encoding).

### Finding 8: Wikilink-form locator works identically

```
PS> obsidian vault=TestVault-Obsidian-CLI-MCP properties file="013-plan-types" format=json
{ ... same JSON as path= ... }
EXIT=0
```

`file=` and `path=` are interchangeable on the `properties` subcommand. R11 confirmed.

### Findings deferred to T0 (require destructive / live-Obsidian probes)

These FR-024 cases require either a running Obsidian instance with a focused note OR fixture content the plan stage didn't probe. They are deferred to T0 of `/speckit-implement`:

| Case | What to capture | Why deferred |
|------|-----------------|--------------|
| Active mode happy path | `obsidian properties format=json active` against a known focused note. Confirms the response shape is the same JSON object as specific mode. | Requires a running Obsidian instance with a known focused note. |
| YAML comments inside frontmatter | Probe a fixture with `# comment` lines inside the frontmatter block. Capture how Obsidian represents them (likely stripped). | Cosmetic edge case; deferring keeps plan-stage scope tight. |
| YAML anchors (`&name`) | Probe a fixture with anchor declarations. Capture whether Obsidian dereferences or preserves. | Cosmetic edge case. |
| YAML aliases (`*name`) | Probe a fixture with alias references. Capture flatten-vs-reject. | Cosmetic edge case. |
| CRLF-vs-LF round-tripping | Save the same logical fixture with both line-ending conventions; verify identical responses. | Requires fixture-by-fixture line-ending control. |
| Heterogeneous-list value | Probe `mixed: [1, "two", 3]`. Verify Call A returns the array verbatim AND Call B labels it `multitext` or `unknown`. | Critical for US4 confidence; deferred only to keep plan-stage probes minimal. |

---

## Summary of Plan-Stage Decisions

| ID | Decision | Status | Trigger to revisit |
|----|----------|--------|--------------------|
| R1 | Thin handler, no per-call logger events | RATIFIED (mirrors 011 / 012 / actual sibling impls) | Cross-tool observability requirement |
| R2 | `properties format=json` (NOT `property:read`) | RATIFIED (live-verified — `property:read` is structurally lossy) | CLI emits a `property:read` revision returning structured output |
| R3 | Two-call architecture (file-scoped value + vault-scoped type) | RATIFIED (single-call sub-strategies all violate spec contract) | CLI exposes a single-call subcommand returning `{value, type}` |
| R4 | Active mode uses `active` flag; multi-vault correctness deferred | RATIFIED (single-vault correct; multi-vault documented limitation) | Multi-vault active-mode bug report |
| R5 | Inherit unknown-vault inspection from cli-adapter (011-R5) | RATIFIED (live verified — `Vault not found.` byte-identical) | CLI changes unknown-vault response wording |
| R6 | Type label translation table (Obsidian → spec enum) | RATIFIED (live-verified — `multitext` / `aliases` / `tags` / `unknown` translations) | Future Obsidian version adds a new label not in the table → falls back to `"unknown"` (safe), table updated later |
| R7 | `No frontmatter found.` short-circuit; FR-011 / FR-012 conflation amendment | RATIFIED (live-verified — Obsidian conflates the two) | Future Obsidian version adds malformed-frontmatter distinguisher |
| R8 | Q1 contingency does NOT fire; Q2 confirmed | RATIFIED (live-verified) | Schema mismatch with Obsidian future-version |
| R9 | `deps.spawnFn` test seam — TWO spawns per request | RATIFIED (mirrors 011 / 012; tests assert both spawns) | Adapter changes its test-seam convention |
| R10 | `import.meta.url` path resolution + coverage floor preserved | RATIFIED (mirrors 011 / 012) | Project-wide test-path / coverage convention shift |
| R11 | `file=` / `path=` argv keys match schema fields directly | RATIFIED (live `obsidian help`) | CLI renames the locator keys |
| R12 | Don't amend predecessor specs | RATIFIED (010 / 011 / 012 precedent) | Project convention shift |

**Plan-stage status**: all 12 design decisions ratified. Eight FR-024 cases verified live; six deferred to T0 of `/speckit-implement` (see table above). Critical contingencies — Q1 absent-vs-explicit-null, Q2 mapping values — both resolved without spec amendment. The two spec amendments needed (R7's FR-011 / FR-012 conflation, R3's two-call architecture) are documented here per R12 (not amended in spec.md).

---

## Cross-references

- [spec.md](./spec.md) — FRs and SCs this artifact refines into runtime contract
- [data-model.md](./data-model.md) — schema diagrams, two-call argv assembly, type-translation table, audit / per-tool invariants
- [contracts/read-property-input.contract.md](./contracts/read-property-input.contract.md) — public input contract
- [contracts/read-property-handler.contract.md](./contracts/read-property-handler.contract.md) — handler invariants + two-call invokeCli shape
- [quickstart.md](./quickstart.md) — verification scenarios mapped to SCs
- [012-delete-note research.md](../012-delete-note/research.md) — sibling artifact this one mirrors (with the two-call architecture R3 as the load-bearing departure)
- [011-write-note research.md](../011-write-note/research.md) — sibling artifact for cli-adapter R5 inheritance + handler-layer thinness conventions

---

## T0 Live-CLI Capture (2026-05-09)

This section captures the 6 cases deferred from plan stage per the deferred-cases table (above). Probes ran against `obsidian` CLI on Windows during T0 of `/speckit-implement`, against the authorised test vault `TestVault-Obsidian-CLI-MCP` (per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md), CLAUDE.md `## Test Execution` gate). All fixtures created under `Sandbox/`; cleaned up post-capture (verified empty: `ls Sandbox/` returned 0 files).

### T0.1 — Active mode happy path / response shape parity

**Probe 1** (focused note in editor with no frontmatter):
```
PS> obsidian properties format=json active
No frontmatter found.
EXIT=0
```

**Probe 2** (no focused note):
```
PS> obsidian properties format=json active
Error: No active file. Use file=<name> or path=<path> to specify a file.
EXIT=0
```

**Conclusion**: active mode's response shape is structurally identical to specific mode (same `properties` subcommand + `format=json`). Captured paths:
- Frontmatter present → JSON object on stdout (structural parity locked from specific mode's plan-stage Finding 2; the `active` flag only changes target file resolution, not response shape).
- No frontmatter → `No frontmatter found.` on stdout (R7 short-circuit applies in active mode identically).
- No focused note → `Error: No active file. ...` on stdout (caught by dispatch layer's `Error:` prefix → `ERR_NO_ACTIVE_FILE` per cli-adapter classification, plan-stage Finding 7).

**TRIGGER not fired**: response shape did NOT differ from specific mode. No active-mode-specific branch needed in the handler. **Handler test #12 lock**: stub Call A returns a JSON object verbatim (same shape as specific mode); Call B issued without `vault=` per R4.

### T0.2 — YAML comments inside frontmatter

Fixture `Sandbox/013-T0-comments.md`:
```yaml
---
# This is a YAML comment line
status: in-progress  # inline trailing comment
# another comment
tags: [alpha, beta]
---
```

```
PS> obsidian vault=TestVault-Obsidian-CLI-MCP properties path=Sandbox/013-T0-comments.md format=json
{
  "status": "in-progress",
  "tags": [
    "alpha",
    "beta"
  ]
}
EXIT=0
```

**Conclusion**: YAML comments (line and inline) are stripped clean by Obsidian's parser. They do NOT appear in the JSON output. No artefacts. Wrapper handles them transparently.

### T0.3 — YAML anchors (`&name`)

Fixture `Sandbox/013-T0-anchors.md` (combined with T0.4 — anchor + alias in one file):
```yaml
---
project: &proj_anchor "my-project"
fallback: *proj_anchor
status: in-progress
---
```

```
PS> obsidian vault=TestVault-Obsidian-CLI-MCP properties path=Sandbox/013-T0-anchors.md format=json
{
  "project": "my-project",
  "fallback": "my-project",
  "status": "in-progress"
}
EXIT=0
```

**Conclusion**: anchors are dereferenced at parse time per standard YAML semantics. The anchor value is propagated to all alias references. The wrapper sees post-dereference values; no anchor syntax leaks to the JSON output.

### T0.4 — YAML aliases (`*name`)

Same fixture as T0.3 (same probe satisfies both cases). `fallback: *proj_anchor` resolves to `"my-project"` — alias dereferenced verbatim. **Conclusion**: aliases work as standard YAML; wrapper sees the resolved value.

### T0.5 — CRLF-vs-LF round-tripping

Fixtures `Sandbox/013-T0-lf.md` (LF, 49 bytes) and `Sandbox/013-T0-crlf.md` (CRLF, 54 bytes) — byte-distinct line endings, identical content. Verified byte-distinctness via hex dump:
```
LF:   2D 2D 2D 0A 73 74 61 74 75 73 ... (0A = LF only)
CRLF: 2D 2D 2D 0D 0A 73 74 61 74 75 73 ... (0D 0A = CRLF)
```

```
PS> obsidian vault=TestVault-Obsidian-CLI-MCP properties path=Sandbox/013-T0-lf.md format=json
{
  "status": "in-progress",
  "tags": [
    "a",
    "b"
  ]
}
EXIT=0

PS> obsidian vault=TestVault-Obsidian-CLI-MCP properties path=Sandbox/013-T0-crlf.md format=json
{
  "status": "in-progress",
  "tags": [
    "a",
    "b"
  ]
}
EXIT=0
```

**Conclusion**: byte-identical JSON responses for LF vs CRLF inputs. FR-020's "byte-identical responses regardless of line-ending convention" contract is honoured by Obsidian. No wrapper-side normalisation needed.

### T0.6 — Heterogeneous-list type label (US4 / FR-017)

Fixture `Sandbox/013-T0-mixed.md`:
```yaml
---
mixed: [1, "two", 3]
---
```

**Probe A** (file-scoped value):
```
PS> obsidian vault=TestVault-Obsidian-CLI-MCP properties path=Sandbox/013-T0-mixed.md format=json
{
  "mixed": [
    1,
    "two",
    3
  ]
}
EXIT=0
```

**Probe B** (vault-scoped type metadata):
```
PS> obsidian vault=TestVault-Obsidian-CLI-MCP properties format=json
[
  { "name": "aliases",        "type": "aliases",   "count": 0 },
  { "name": "cssclasses",     "type": "multitext", "count": 0 },
  { "name": "date_field",     "type": "date",      "count": 0 },
  { "name": "datetime_field", "type": "datetime",  "count": 0 },
  { "name": "mixed",          "type": "unknown",   "count": 1 },
  { "name": "tags",           "type": "tags",      "count": 0 },
]
EXIT=0
```

**Conclusion**: Obsidian labels the heterogeneous list `[1, "two", 3]` as `"unknown"` natively (NOT `"multitext"` as the alternative TRIGGER posited). The R6 translation table maps Obsidian's `"unknown"` → spec's `"unknown"` directly. **TRIGGER not fired** for this fixture: no `multitext` → `list` translation followed by post-processing downgrade. The handler's mixed-runtime-types post-processing rule remains in the implementation as defensive — it fires only if a future Obsidian version (or a property previously typed-as-multitext but later mutated to contain non-string values) reports `multitext` for a heterogeneous list. **Handler test #15 lock**: stub Call B returns `type: "unknown"` natively; expected output is `{value: [1, "two", 3], type: "unknown"}` directly.

### Cleanup verification

```
PS> ls Sandbox/
(empty)
PS> ls .trash/
ls: cannot access '.trash/': No such file or directory
```

Five fixtures created, all moved to trash via `obsidian vault=TestVault-Obsidian-CLI-MCP delete path=Sandbox/<file>`; trash recoverable per to-trash-default. `Welcome.md` at vault root untouched. No residue.
