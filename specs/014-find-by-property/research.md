# Research — `find_by_property` Typed MCP Tool

**Feature**: [014-find-by-property](./spec.md)
**Date**: 2026-05-09

This document is the Phase 0 output of `/speckit-plan` for `014-find-by-property`. It records the design decisions ratified during plan-stage characterisation against the live Obsidian CLI, the load-bearing departures from the prior typed-tool pattern (most notably the reliance on the developer-section `eval` subcommand because no native find-by-property primitive exists), and the resolution of the three clarifications session amendments (Q1 array-exact-equality element order, Q2 folder path-traversal closure, Q3 vault-omitted multi-vault semantics).

The convention mirrors prior research artefacts: each decision (`Rn`) carries Decision / Rationale / Alternatives. Plan-stage live-CLI probe results are captured under [Live CLI Findings](#live-cli-findings) below and quoted verbatim where they are load-bearing for a decision.

---

## R1 — Logger surface (FR observability reconciliation)

**Decision**: `find_by_property`'s handler is a thin `invokeCli` wrapper that issues ONE underlying CLI invocation per request (see R3). It does NOT emit per-call `logger.callStart` / `logger.callEndSuccess` / `logger.callEndFailure` events at the tool layer. Observability flows through the cli-adapter's existing `dispatchTimeout` / `dispatchCap` / `dispatchKill` events for the underlying CLI invocation. `RegisterDeps` accepts `logger: Logger` for forwarding to the adapter / queue layer.

**Rationale**: continues the [011-write-note PSR-1](../011-write-note/research.md), [012-delete-note R1](../012-delete-note/research.md), and [013-read-property R1](../013-read-property/research.md) precedents. The actual sibling handlers at [src/tools/read_note/handler.ts](../../src/tools/read_note/handler.ts), [src/tools/write_note/handler.ts](../../src/tools/write_note/handler.ts), [src/tools/delete_note/handler.ts](../../src/tools/delete_note/handler.ts), and [src/tools/read_property/handler.ts](../../src/tools/read_property/handler.ts) are tight `invokeCli` wrappers that emit no per-call events. `find_by_property` mirrors them.

**Alternatives**:
- (A) Add `callStart` / `callEndSuccess` / `callEndFailure` methods to the `Logger` interface AND emit them from `find_by_property`. Rejected: requires modifying the frozen `Logger` surface, asymmetry vs the five prior tools, no concrete observability requirement.

**Spec.md amendment**: NONE.

---

## R2 — CLI subcommand selection: `eval` (load-bearing departure)

**Decision**: `find_by_property` routes through the live CLI's developer-section `eval` subcommand, executing a fixed JavaScript template that walks `app.metadataCache.fileCache` + `app.metadataCache.metadataCache` and returns a JSON `{count, paths}` envelope. **There is no native find-by-property subcommand in the Obsidian CLI** — `obsidian help` enumerates 80+ commands and none of them performs a value→file lookup over frontmatter properties. The only structural alternatives are: (a) `properties name=<n>` returns a count of files, NOT paths; (b) `property:read` is file → value, the inverse direction; (c) `search query=<text>` matches free-text content not frontmatter; (d) iterate `files` plus per-file `property:read` (N+1 calls, breaks the spec's single-call replacement contract).

The user input itself confirms this design path with the phrase "the eval composition uses data-passing, NOT string concatenation, so eval injection is structurally impossible" — eval-based implementation was the assumed mechanism at spec authoring time.

**Rationale**: live verification on 2026-05-09 against the test vault `TestVault-Obsidian-CLI-MCP`. Probe results captured under [Live CLI Findings](#live-cli-findings) below.

**Subcommand argv shape** (from `obsidian help eval`):

```
eval                  Execute JavaScript and return result
    code=<javascript>   - JavaScript code to execute (required)
```

Single required parameter (`code=<js>`). The CLI executes the JS in the running Obsidian process (Electron renderer context with `app` global) and prints `=> <result>` on stdout. Numeric returns print as numbers; objects print as a pretty-printed JSON-ish (NOT strict JSON — the wrapper ensures the result is `JSON.stringify`-d inside the JS template so the wire format is parseable JSON).

**Latency**: ~200ms per call (single probe — `obsidian eval "code=Object.keys(app.metadataCache.fileCache).length"` returned in `0m0.195s` on the host). Comparable to the existing typed tools' single-call latency. Single-in-flight queue serialises across all CLI invocations.

**Stability concern**: `eval` reaches into Obsidian's internal API (`app.metadataCache.fileCache`, `app.metadataCache.metadataCache`). Obsidian's internals MAY change shape between Obsidian versions. This is a known fragility — captured in this research artefact and surfaced to the user via `docs/tools/find_by_property.md`. The plan-stage characterisation pass locked the shape on the host's Obsidian version (whatever it is at probe time on 2026-05-09); future Obsidian updates may surface as test failures rather than silent drift.

**Alternatives considered**:
- (A) Iterate `files` then `property:read` per file: rejected — N+1 spawns blow the spec's "single typed call replaces 1–5 calls" promise (SC-016) and exceed the typed-tool 10 s timeout for any non-trivial vault.
- (B) Walk the on-disk vault directly via filesystem reads + a YAML parser: rejected — re-implements YAML parsing in the wrapper, breaks the "thin wrapper, no client-side YAML parsing" idiom (parity with R2 of [013-read-property](../013-read-property/research.md)), introduces the YAML-parser dependency the project has avoided to date.
- (C) Use `base:query` against a `.base` file: rejected — requires a pre-defined Obsidian base; not applicable to ad-hoc frontmatter properties on regular notes.
- (D) Wait until Obsidian CLI gains a native subcommand: rejected — out of project scope (the Obsidian CLI is a separate project not under this repository's control); deferring would withhold the highest-leverage retrieval primitive indefinitely.
- (E) Expand the existing `obsidian_exec` escape hatch with a worked-example doc rather than build a typed wrapper: rejected — `obsidian_exec` requires the agent to author the JS template themselves, defeating the "typed surface that codifies the contract" purpose of this BI; agents would re-derive the matching logic per call with high error rates.

---

## R3 — Single-call architecture (one `invokeCli` per request)

**Decision**: each `find_by_property` MCP call fires exactly ONE underlying `invokeCli` invocation, with subcommand `eval` and the parameter `code=<rendered-js-template>`. The JS template walks the metadata cache, applies all matching logic in-process inside Obsidian, and returns a single `{count, paths}` JSON envelope.

**Rationale**: unlike `read_property` (which needed two CLI calls because the value and the type label live on different channels — see [013-read-property R3](../013-read-property/research.md)), `find_by_property`'s output is a list of paths only. The matching logic — type-faithful comparison, array contains / exact-equal, case folding, folder filtering — runs entirely inside the JS template. There is no second piece of information to fetch, so there is no second CLI call.

**Performance cost**: one CLI subprocess spawn per request, ≈200 ms. Within the typed-tool 10 s timeout. The eval-side walk is O(file_count); a vault with 100k notes still completes well under 10 s based on the per-cache-entry cost (each entry is a hash-table lookup and a small comparison).

**Single-call vs two-call**:

| Tool | CLI calls | Why |
|---|---|---|
| `read_note`, `write_note`, `delete_note` | 1 | Single CLI subcommand fully covers contract |
| `read_property` (013) | 2 | Type label needs vault-scoped metadata; value needs file-scoped frontmatter |
| `find_by_property` (014) | 1 | All matching is in-eval; one envelope back |

**Alternatives**:
- (A) Two-call (e.g., one for the matching, one for re-checking type metadata): rejected — adds latency for no contract gain. Type metadata is not part of the output (paths-only contract per spec).

---

## R4 — Adapter `target_mode` mapping (no user-facing `target_mode`)

**Decision**: the user-facing schema has NO `target_mode` field (per FR-002 — find_by_property is inherently vault-wide). At the cli-adapter call boundary, the handler maps the user-facing `vault?` field onto the adapter's existing `target_mode` axis as follows:

| User input | Adapter `target_mode` | Adapter `vault` | Effect |
|---|---|---|---|
| `vault: "Demo"` | `"specific"` | `"Demo"` | argv prefix `vault=Demo`; `eval` runs against the Demo vault |
| `vault` omitted | `"active"` | (n/a, stripped) | no `vault=` in argv; `eval` runs against Obsidian's currently-focused vault |

The `target_mode` field on `InvokeCliInput` is the adapter's internal signal for "should I pass `vault=` and / or strip locator parameters". The adapter's `stripTargetLocators` only strips `vault` / `file` / `path` from `parameters` in active mode; for our `parameters: { code: <js> }` shape there is nothing to strip in either mode (we never put vault/file/path in `parameters`).

**Rationale**: re-uses the existing adapter without modification. The adapter's `InvokeCliInput.target_mode` is an internal abstraction over "do I prefix argv with `vault=`"; this maps cleanly onto find_by_property's "vault supplied vs not". User-facing `target_mode` is absent per the spec — this design satisfies both the spec contract and the adapter's existing API.

**Alternatives**:
- (A) Add a third `target_mode` value (`"vault-wide"`) to the adapter: rejected — modifies the adapter's frozen public API for no gain over the existing two-value mapping.
- (B) Bypass `invokeCli` and call `dispatchCli` directly: rejected — loses the 011-R5 unknown-vault inspection clause (R5 below) and the queue serialisation. The mapping above keeps full inheritance.

---

## R5 — Unknown-vault response inspection (inherited from cli-adapter's 011-R5)

**Decision**: `find_by_property` inherits the cli-adapter's existing 011-R5 unknown-vault response-inspection clause **without any wrapper-side modification**. When the user supplies an unrecognised `vault` display name, the CLI's `eval` subcommand returns `Vault not found.` on stdout with exit code 0 — byte-identical to the response shape covered by the inspection clause for `properties` / `create` / `delete`. The clause at [src/cli-adapter/cli-adapter.ts:86](../../src/cli-adapter/cli-adapter.ts#L86) re-classifies the response to `CLI_REPORTED_ERROR` before the wrapper's parse step runs.

**Live verification** (2026-05-09):

```
$ obsidian vault=NoSuchVault eval "code=app.vault.getName()"
Vault not found.
$ echo $?
0
```

The response is the same first-line `Vault not found.` plus exit 0 that the adapter already inspects. No find_by_property-specific handling is needed; FR-017 (US6 acceptance) is satisfied by the inherited clause.

**Rationale**: parity with [011-write-note R5](../011-write-note/research.md), [012-delete-note R5](../012-delete-note/research.md), [013-read-property R5](../013-read-property/research.md). The adapter is the single point where unknown-vault gets reclassified across every typed tool; preserving that consolidation is load-bearing for future maintainability.

**Alternatives**:
- (A) Re-inspect at the find_by_property handler: rejected — duplicates logic already centralised in the adapter.

---

## R6 — Anti-injection via base64-encoded JSON payload

**Decision**: user-supplied `property`, `value`, `folder`, `arrayMatch`, and `caseSensitive` flow into the JS template via the chain `JSON.stringify` → `Buffer.from(...).toString("base64")` → embedded as a single-quoted base64 string in the JS source. The JS template at runtime calls `JSON.parse(atob('<base64-payload>'))` to rebuild the typed payload. The JS template itself is a frozen string constant; user inputs **never reach the JS source as text**.

**Why base64 specifically**: the base64 alphabet is `[A-Za-z0-9+/=]` — a subset of characters that can be safely embedded inside any JS string literal (single-quoted, double-quoted, backtick) without escaping. A naive `JSON.stringify(...)` embedding inside a single-quoted JS string fails on user inputs containing `'` (which JSON.stringify does NOT escape). Base64 sidesteps that by ensuring no quote character can appear in the encoded payload.

**Live verification** (2026-05-09):

```
$ PAYLOAD=$(node -e 'console.log(Buffer.from(JSON.stringify({property:"id",value:"BI-030"})).toString("base64"))')
$ obsidian vault=TestVault-Obsidian-CLI-MCP eval "code=(()=>{const args=JSON.parse(atob('$PAYLOAD'));return JSON.stringify(args);})()"
=> {"property":"id","value":"BI-030"}
```

Payload round-trips without any escape handling at the wrapper layer. An attacker supplying `value: "'; alert(1); //"` would have the apostrophe and shell-metacharacters survive `JSON.stringify` (which keeps `'` as-is), but the base64 encoding step yields `eyJ2YWx1ZSI6IiIzsg2FsZXJ0..."` — a string from `[A-Za-z0-9+/=]` only, structurally safe to embed.

**Rationale**: satisfies FR-020's "discrete argv parameters, NEVER concatenated into a shell-evaluated string and NEVER interpolated into an `eval` call" — by data-passing through a frozen template + base64 payload. The injection surface is closed structurally rather than by per-input escaping (per the user input's anti-injection clause).

**Alternatives considered**:
- (A) Embed `JSON.stringify(payload)` directly in single-quoted JS string and escape each `'`. Rejected: ad-hoc escape rules are easy to mis-implement; base64 has no failure mode.
- (B) Embed payload as a JS object literal generated by `JSON.stringify` then injected as `const args = ${JSON.stringify(payload)};`. Rejected: JSON-as-JS-object-literal is roughly equivalent to direct string concat — any user input that `JSON.stringify` doesn't sanitise (single quotes don't, backslashes only escape themselves) becomes JS code. Base64 is structurally simpler.
- (C) Pass payload via a separate argv param (`payload=<base64>`) instead of inline in `code`. Rejected: `eval` accepts only `code=<javascript>` per `obsidian help eval`; no second-argument channel exists.
- (D) Use a hex encoding instead of base64. Rejected: hex doubles payload size; base64 has the same structural-safety guarantee with smaller wire weight.

---

## R7 — In-eval matching logic (scalar, array, case-folding, folder filter)

**Decision**: all matching logic runs inside the JS template, not in the Node wrapper. The template implements a single comparison function `eq(x, y, caseSensitive)`:

- `typeof x === "string" && typeof y === "string" && !caseSensitive` → `x.toLowerCase() === y.toLowerCase()`
- otherwise → `x === y` (JavaScript strict equality — type-faithful, distinguishes number `7` from string `"7"`, boolean `true` from string `"true"`, `null` from missing)

For list-valued properties (when the cached frontmatter value is a JS array):
- `arrayMatch: true` AND scalar query → `frontmatterArray.some(elem => eq(elem, query, caseSensitive))` (contains)
- `arrayMatch: true` AND array query → no match (`Array.isArray(value)` rejected at the wrapper schema; defensive `false` here)
- `arrayMatch: false` AND scalar query → no match (a list cannot equal a scalar)
- `arrayMatch: false` AND array query → length-equal AND `every((e, i) => eq(e, query[i], caseSensitive))` (positional equality, order-sensitive per Q1)

For scalar property values: array queries never match (scalar ≠ array); scalar queries use `eq(value, query, caseSensitive)`.

For absence: `if (!fm || !(args.property in fm)) continue;` — uses the `in` operator to distinguish absent from explicit-null. A property present-with-`null` reaches the comparison and matches `value: null` queries; an absent property is skipped entirely. This is the FR-014 distinguishability contract.

For folder scoping: a normalised prefix `<folder.replace(/[/\\]+$/, "")>/` is computed once before the loop. The loop body short-circuits on `if (prefix && !path.startsWith(prefix)) continue;`. Empty / omitted folder yields `prefix === ""` and the check is a no-op (whole-vault search per FR-006).

**Live verification matrix** (2026-05-09 against the seeded probe vault):

| Probe | Result | Spec hit |
|---|---|---|
| `id=BI-030` (unique) | `{count:1,paths:["…BI-030.md"]}` | US1 AC#1 |
| `status=queued` (multi) | `{count:2,paths:[…BI-030, …BI-031]}` | US1 AC#2 |
| `count=7` (number) vs `count="7"` (string) on BI-031 | matches BI-030 only (number 7 is the only ===-equal value) | US1 AC#4, FR-013 |
| `value: null` against `explicit_null:` (BI-029) | `{count:1,paths:[…BI-029.md]}` | FR-014 explicit-null path |
| `value: null` against absent property (BI-030) | `{count:0,paths:[]}` | FR-014 absent path |
| `tags=alpha`, `arrayMatch:true` | `{count:2,paths:[…BI-030, …BI-031]}` (both lists contain "alpha") | US3 AC#1 (FR-016 contains) |
| `tags=["alpha","beta"]`, `arrayMatch:false` | `{count:1,paths:[…BI-030.md]}` (BI-030 has `[alpha,beta]`) | US3 AC#3 (FR-016 exact-equal) |
| `tags=["beta","alpha"]`, `arrayMatch:false` (Q1 order swap) | `{count:0,paths:[]}` | US3 AC#4 (Q1 — order-sensitive) |
| `mixed-case=ALPHA`, `caseSensitive:false` | `{count:1,paths:[…BI-031.md]}` | US4 AC#2 (FR-015) |
| `id=BI-030`, `folder="Sandbox/find-probe-014/backlog"` | matches | US2 AC#1 |
| `id=BI-030`, `folder="Sandbox/find-probe-014/archive"` | `{count:0,paths:[]}` | US2 AC#2 |

Every matrix row matches the spec contract exactly. The matching logic is locked.

**Rationale**: pushing all matching into the eval'd JS minimises wire payload (only the result envelope crosses back), eliminates a Node-side YAML parser dependency, and runs against Obsidian's already-parsed in-memory cache (no re-parse cost per query).

**Alternatives considered**:
- (A) Return raw frontmatter for every file, filter in Node: rejected — for large vaults the per-call wire payload becomes massive (every file's frontmatter as JSON), violating the typed-tool 10 MiB cap on non-trivial vaults.
- (B) Use Obsidian's `app.metadataCache.getFileCache(file)` per-file API in a loop inside eval: rejected — the direct-walk through `app.metadataCache.fileCache` + `app.metadataCache.metadataCache` is one indirection cheaper and the live probe confirmed it produces correct frontmatter.

---

## R8 — Folder path-traversal closure (Q2 → schema-level rejection)

**Decision**: the schema's `folder` field is validated by a regex that rejects any value containing a `..` path segment (`..` alone, `../foo`, `foo/..`, `foo/../bar`) OR starting with `/` or `\` (absolute-path forms). Failure produces `VALIDATION_ERROR` before any CLI dispatch (no eval call). The schema regex is the **primary** security control per the Q2 clarification (spec [Clarifications session 2026-05-09](./spec.md#clarifications)).

**Schema regex** (one-shot test for forbidden patterns):

```ts
const FOLDER_TRAVERSAL_REGEX = /(?:^[/\\])|(?:^|[/\\])\.\.(?:[/\\]|$)/;
// Rejects:
//   "/anything"                    — starts with /
//   "\anything"                    — starts with \
//   ".."                            — exactly "..".
//   "../foo"                       — leading ../
//   "foo/.."                       — trailing /..
//   "foo/../bar"                   — middle /../
//   "..\\foo", "foo\\..\\bar"     — Windows separator equivalents
// Accepts:
//   ""                              — empty (whole-vault, per FR-006)
//   "Sandbox"
//   "Sandbox/backlog"
//   "Sandbox/work-2026-05-08"
//   "..foo" or "foo..bar"          — `..` not as a path segment, treated as part of a filename component
```

The pattern uses a path-segment boundary check (`(?:^|[/\\])\.\.(?:[/\\]|$)`) rather than a substring `..` check, so a folder name like `foo..bar` (with `..` not bordered by separators on both sides) is accepted.

**Defence-in-depth**: even if a `folder` value somehow reached eval, the JS template's `path.startsWith(prefix)` check operates against the in-memory `fileCache` keys, which are vault-relative paths. There is no way for `app.metadataCache.fileCache` to contain a path key outside the vault root — Obsidian's filesystem walker already constrains what enters the cache. So the JS template is a defence-in-depth backstop; the schema rejection is the primary control.

**Rationale**: the [Q2 → A clarification](./spec.md#clarifications) committed to schema-level rejection. Codified as FR-021. The regex implementation is one of two equivalent canonicalisations that satisfy the contract; the chosen pattern matches both Unix (`/`) and Windows (`\`) path separators because the `folder` field is documented as a vault-relative prefix and Obsidian on Windows uses backslashes in some surface paths.

**Alternatives considered**:
- (A) Trust the underlying CLI: explicitly rejected by Q2 clarification.
- (B) Path-segment-by-segment normalisation (split on `/`, reject any segment === `..`): rejected — more code; the regex is a single-pattern test that handles every observable traversal form. Equivalent semantics.

---

## R9 — Output ordering (V8 insertion-order stability)

**Decision**: the JS template walks `app.metadataCache.fileCache` keys via `for (const path in app.metadataCache.fileCache)`. V8 (Chromium / Node's underlying JS engine, which Obsidian's Electron also uses) iterates object keys in insertion order for string keys (ECMA-262 §6.1.7.1). Within a single MCP server session — and assuming no vault state changes between calls — repeated queries return the `paths` array in byte-identical order.

**Rationale**: satisfies FR-022 (in-session stability) and SC-018. The order is undefined across sessions or after vault state changes (file additions / removals reorder the cache).

**Live verification**: not a separate probe — V8's insertion-order property is documented in the language spec; the matching probes (R7's matrix) showed paths in lexicographic-by-vault-walk-order (e.g., `archive/BI-029.md` < `backlog/BI-030.md` < `backlog/BI-031.md`) consistent across re-runs.

**Alternatives**:
- (A) Sort paths lexicographically inside the JS template before returning: explicit sort breaks the FR-022 "underlying CLI's enumeration's stable order" wording (the contract is to mirror Obsidian's order, not to impose our own). Rejected.
- (B) Sort paths in the wrapper after parse: same objection. Rejected.

---

## R10 — Output cap (existing 10 MiB CLI cap, no new code)

**Decision**: the cli-adapter's existing `TYPED_TOOL_OUTPUT_CAP_BYTES` of 10 MiB ([src/cli-adapter/cli-adapter.ts:11](../../src/cli-adapter/cli-adapter.ts#L11)) applies to the eval response. If the matching set is so large that the JSON envelope exceeds 10 MiB, `dispatchCli` kills the process and the wrapper surfaces `CLI_NON_ZERO_EXIT` (output-cap kill) — a structured error per FR-019.

**Capacity estimate**: a typical vault-relative path is ~50-100 bytes. With JSON envelope overhead (`{"count":N,"paths":["…"]}` plus quotes and commas), ~100k–200k matching paths fit in 10 MiB before the cap fires. For most real vaults, even a `status: queued` query returning every backlog item won't approach this.

**Rationale**: satisfies SC-014's "no new error codes" (FR-019). The output-cap path produces a structured error, never a silent truncation. Edge Cases / LIMITS — large match set is handled by the inherited cap.

**Alternatives**:
- (A) Add a wrapper-side per-result cap (e.g., max 10k paths) that returns a structured "too many matches" error: rejected — introduces a new error code (violates FR-019 / SC-014) and a new tunable that doesn't exist on prior tools. The 10 MiB byte cap is sufficient.

---

## R11 — Multi-vault default ambiguity (Q3 → documented limitation)

**Decision**: when the user-facing `vault` is omitted, the handler maps to `target_mode: "active"` (R4) which strips vault from argv — the CLI's `eval` subcommand then runs against whatever vault Obsidian's running instance currently has focused. In multi-vault setups (multiple registered vaults, no Obsidian instance running, no vault foregrounded, or two equally foregrounded) the default may resolve ambiguously. **The wrapper surfaces whatever the underlying CLI returns; it does NOT detect or surface a structured error for the ambiguous case.** Documented in `docs/tools/find_by_property.md`.

**Rationale**: the [Q3 → B clarification](./spec.md#clarifications) committed to documented-limitation parity with [013-read-property R4](../013-read-property/research.md) (active-mode multi-vault limitation). Codified as FR-003.

**Detected behaviours** (live):
- Single vault registered AND Obsidian running with that vault open: `eval` runs against that vault. `app.vault.getName()` returns the vault's display name.
- Single vault registered AND no Obsidian instance running: `eval` returns `Error: Could not connect to Obsidian` or similar — surfaces as `CLI_REPORTED_ERROR` via the existing dispatch-layer error classification. Not silent.
- Multi-vault registered, Obsidian running with vault A focused: `eval` runs against vault A. Caller wanting vault B must supply `vault: "B"` explicitly.
- Multi-vault registered, no Obsidian instance running: similar to single-vault no-instance — error.

**Alternatives**:
- (A) Always-required `vault`: rejected by Q3 (would break the user input's "vault: optional" contract).
- (B) Pre-flight probe to detect ambiguity: rejected by Q3 (adds a CLI call for value smaller than the explicit-vault workaround).

---

## R12 — Test seams (single spawn per request)

**Decision**: tests inject the cli-adapter's stub `spawnFn` via `deps.spawnFn` per the existing test-seam convention ([012-delete-note R10](../012-delete-note/research.md) precedent). Each handler test responds to **ONE** spawn invocation per request — single-call architecture per R3. Schema tests do not invoke spawn at all (they exercise the boundary).

**Argv-shape assertion contract** (per test):
- `obsidian` binary path
- `vault=<v>` (when user supplied vault) — first positional arg
- `eval` (subcommand)
- `code=<rendered-js-template>` (single parameter)

The rendered JS template is asserted to (a) start with the frozen prefix `(()=>{const args=JSON.parse(atob('` and (b) contain a base64 payload that `atob`+`JSON.parse` produces the expected `{property, value, folder, arrayMatch, caseSensitive}` object. Tests do NOT assert the entire JS template byte-for-byte (would couple the test suite to incidental whitespace / variable names); they assert the structural contract (prefix + decodable payload + suffix returns JSON envelope).

**Rationale**: parity with prior tools' test-seam conventions; keeps the test surface tight against changes to the JS template's incidental shape while still locking the security contract (base64-payload anti-injection per R6) and the argv shape.

**Alternatives**:
- (A) Assert the entire JS template byte-for-byte: rejected — false positives on any incidental refactor.

---

## R13 — `import.meta.url` path resolution + coverage threshold preservation

**Decision**: identical to [011-write-note R8](../011-write-note/research.md) and [013-read-property R10](../013-read-property/research.md). The new module's tests use `import.meta.url`-based path resolution where they need the test vault path; the aggregate statements coverage threshold ([vitest.config.ts](../../vitest.config.ts)) stays at the current floor — the new module's high test density (~45 cases for ~150 LOC) keeps the aggregate flat or ratchets up.

**Rationale**: parity.

---

## R14 — Don't amend predecessor specs (project convention)

**Decision**: this research artefact is the source of record for plan-stage findings. spec.md is NOT edited retroactively. Where plan-stage findings refine or weaken a spec contract (none in this BI), the refinement is documented in this artefact and surfaced via a footnote-style cross-reference in spec.md if necessary (no such case occurs for find_by_property — all spec contracts hold against the live CLI without amendment).

**Rationale**: parity with [013-read-property R12](../013-read-property/research.md) and predecessor features.

---

## Live CLI Findings

All probes executed 2026-05-09 against `TestVault-Obsidian-CLI-MCP` per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md). Fixtures seeded under `Sandbox/find-probe-014/`; cleaned up after the probe pass.

### F1 — `obsidian eval` echoes returns

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP eval "code=1+1"
=> 2
$ obsidian vault=TestVault-Obsidian-CLI-MCP eval "code=JSON.stringify({hello:'world',n:42})"
=> {"hello":"world","n":42}
```

The `=> ` prefix is part of every successful eval response. The wrapper trims it before `JSON.parse`.

### F2 — Vault scoping via `vault=<name>` BEFORE the subcommand

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP eval "code=app.vault.getName()"
=> TestVault-Obsidian-CLI-MCP
```

`vault=` MUST appear before the subcommand. After the subcommand it is silently ignored (treated as a positional arg the eval subcommand doesn't understand). This matches the CLI's documented argv convention (`obsidian <vault=name> <command> <args>`); the cli-adapter's existing argv assembly already produces the correct order.

### F3 — Metadata cache shape

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP eval "code=Object.keys(app.metadataCache).slice(0,30)"
=> ["_","worker","inProgressTaskCount","db","fileCache","metadataCache","workQueue","uniqueFileLookup",…]

$ obsidian vault=TestVault-Obsidian-CLI-MCP eval \
  "code=JSON.stringify(app.metadataCache.fileCache['Sandbox/find-probe-014/backlog/BI-030.md'])"
=> {"mtime":1778306490684,"size":147,"hash":"06b1e964dbf40577ec7ddd6259f7fcf909de4ec7ed6bc76d45abe61e134cc297"}

$ obsidian vault=TestVault-Obsidian-CLI-MCP eval \
  "code=JSON.stringify(app.metadataCache.metadataCache['06b1e964…cc297'])"
=> {"sections":[…],"frontmatter":{"id":"BI-030","status":"queued","count":7,"archived":false,"tags":["alpha","beta"]},…}
```

`app.metadataCache.fileCache[path]` carries `{mtime, size, hash}`. The frontmatter is keyed under `app.metadataCache.metadataCache[hash].frontmatter`. The two-table indirection (path → hash → metadata) is the chain the JS template walks.

### F4 — Native types preserved through metadata cache

Fixtures BI-030 (`count: 7` numeric, `archived: false` boolean, `tags: [alpha, beta]` array) and BI-031 (`count: "7"` quoted string, `archived: true` boolean, `tags: [alpha]` array). Single eval reading both:

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP eval "code=JSON.stringify(Object.entries(app.metadataCache.fileCache).map(([p,fc])=>({p,fm:app.metadataCache.metadataCache[fc.hash]?.frontmatter})))"
=> [
  {"p":"…/BI-029.md","fm":{"id":"BI-029","status":"done","explicit_null":null}},
  {"p":"…/BI-030.md","fm":{"id":"BI-030","status":"queued","count":7,"archived":false,"tags":["alpha","beta"]}},
  {"p":"…/BI-031.md","fm":{"id":"BI-031","status":"queued","count":"7","archived":true,"tags":["alpha"],"mixed-case":"Alpha"}}
]
```

Native-type preservation confirmed: number `7` vs string `"7"` distinct; boolean `false` / `true` not strings; array elements preserved; YAML null surfaces as JS `null`; absent property simply absent from the fm object (no key).

### F5 — Anti-injection round-trip

```
$ PAYLOAD=$(node -e 'console.log(Buffer.from(JSON.stringify({property:"id",value:"BI-030"})).toString("base64"))')
$ obsidian vault=TestVault-Obsidian-CLI-MCP eval \
  "code=(()=>{const args=JSON.parse(atob('$PAYLOAD'));return JSON.stringify(args);})()"
=> {"property":"id","value":"BI-030"}
```

Payload survives the wrapper → CLI argv → eval JS → JSON.parse round-trip without any escape handling.

### F6 — End-to-end matching matrix

(See [R7](#r7--in-eval-matching-logic-scalar-array-case-folding-folder-filter) for the full matrix — 11 probes, all matching the spec contract.)

### F7 — Unknown vault response shape

```
$ obsidian vault=NoSuchVault eval "code=app.vault.getName()"
Vault not found.
$ echo $?
0
```

Identical first-line `Vault not found.` plus exit 0 to the response shape the cli-adapter's 011-R5 inspection clause already handles. R5 inheritance confirmed.

### F8 — Single-call latency

```
$ time obsidian vault=TestVault-Obsidian-CLI-MCP eval "code=Object.keys(app.metadataCache.fileCache).length"
=> 4
real  0m0.195s
```

~200ms. Within the typed-tool 10 s timeout. Single-call architecture (R3) keeps this as the per-request floor; no second call to add latency.

### Cleanup

```
$ rm -rf Sandbox/find-probe-014
$ obsidian vault=TestVault-Obsidian-CLI-MCP reload
Reloading...
$ obsidian vault=TestVault-Obsidian-CLI-MCP files
Welcome.md
```

Test vault back to baseline. No residue.

---

## Plan-stage spec amendments

NONE. All spec contracts hold against the live CLI characterisation pass. The three Clarifications session amendments (Q1 element-order sensitivity, Q2 folder path-traversal closure, Q3 vault-omitted multi-vault semantics) are codified directly in spec.md per the [Clarifications session 2026-05-09](./spec.md#clarifications); plan-stage findings refine the implementation strategy (single-call eval-based, base64 anti-injection, schema-regex traversal closure) but do NOT contradict the spec.

The one structural departure — using `eval` instead of a purpose-built CLI subcommand — is dictated by the CLI surface (no native find-by-property exists) and was anticipated by the user input's "eval composition" clause. R2 makes this explicit.

---

## Decision summary

| Rn | Decision | Status |
|---|---|---|
| R1 | Logger surface — thin handler, no per-call events | Locked |
| R2 | CLI subcommand: `eval` (load-bearing departure) | Locked |
| R3 | Single-call architecture | Locked |
| R4 | Adapter `target_mode` mapping (no user-facing target_mode) | Locked |
| R5 | Unknown-vault inspection — inherited from cli-adapter | Locked |
| R6 | Anti-injection via base64-encoded JSON payload | Locked |
| R7 | In-eval matching logic — full live verification matrix | Locked |
| R8 | Folder path-traversal closure — schema regex | Locked |
| R9 | Output ordering — V8 insertion order | Locked |
| R10 | Output cap — existing 10 MiB cli-adapter cap | Locked |
| R11 | Multi-vault default ambiguity — documented limitation | Locked |
| R12 | Test seams — single spawn per request | Locked |
| R13 | `import.meta.url` + coverage threshold preservation | Locked |
| R14 | Don't amend predecessor specs (project convention) | Locked |
