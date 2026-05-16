# Research: Fix Unicode Lookups

**Branch**: `034-fix-unicode-lookups` | **Date**: 2026-05-17 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

This document resolves the open questions raised by `/speckit-plan`'s anchor input. The biggest open question — whether the spec's named three-tool list is the right scope of fix — turned out to require an empirical audit that materially changes the implementation footprint relative to the spec's framing. The audit also surfaces a contradiction with one of the spec's three named tools.

## 1. Cohort audit: where does the defect actually live?

### 1.1 Method

Static survey of every tool under `src/tools/<name>/` for the eval-composition pattern that combines:

1. `command: "eval"` in the `invokeCli` call (handler emits JS to the Obsidian CLI's eval subcommand), AND
2. `Buffer.from(payloadJson, "utf-8").toString("base64")` on the Node side (handler base64-encodes the JSON payload), AND
3. `JSON.parse(atob('__PAYLOAD_B64__'))` (or equivalent) in the JS template (eval side decodes the base64).

A tool with all three is structurally affected by the defect. A tool that uses `command: "eval"` without the base64 indirection is not (its payload reaches eval through a different channel — typically as a JS literal embedded in the template via a different placeholder).

### 1.2 Results

| Tool | `command:"eval"` | base64-payload encode | `atob()` in template | Affected? | Spec listed |
|---|---|---|---|---|---|
| `read_heading` | yes | yes (`handler.ts:32`) | yes (`_template.ts:3`) | **YES** | yes |
| `find_by_property` | yes | yes (`handler.ts:52`) | yes (`handler.ts:17`, inlined) | **YES** | yes |
| `paths` | yes | yes (`handler.ts`) | yes (`_template.ts:3`) | **YES** | no |
| `links` | yes | yes (`handler.ts`) | yes (`_template.ts:3`) | **YES** | no |
| `tag` (list_tagged_files) | yes | yes (`handler.ts`) | yes (`_template.ts:3`) | **YES** | no |
| `smart_connections_similar` | yes | yes (`handler.ts`) | yes (`_template.ts:3`) | **YES** | no |
| `smart_connections_query` | yes | yes (`handler.ts`) | yes (`_template.ts:3`) | **YES** | no |
| `read_property` | no — uses `command:"properties"` | no | no | **NO** (see §2) | yes (in spec) |
| `set_property` | yes | no — uses argv-string payload, not base64 | no | NO | no |
| `write_note` | yes | no — uses different payload mechanism | no | NO | no |
| `outline` | no — uses `command:"outline"` | no | no | NO | no |
| `search` | no — uses `command:"search"` / `"search:context"` | no | no | NO | no |
| `read`, `delete`, `move`, `rename`, `files`, `properties`, `obsidian_exec`, `help` | no (argv/native subcommands) | no | no | NO | spec lists 6 of these explicitly as unaffected |

**Cohort verdict**: the atob+base64 defect affects **seven** tools, not three. The four tools shipped in v0.5.x (`paths`, `links`, `smart_connections_similar`, `smart_connections_query`) and the BI-028 cohort tool (`tag`) inherit the same defect class as the three named in the spec. They are absent from the spec only because the spec was authored when the bug-reporter's reproduction surface was the three originally named tools.

## 2. Spec contradiction: read_property is not atob-affected

### 2.1 What the spec asserts

The spec names `read_property` as one of three tools "[that] share the eval-composition pattern in the cli-adapter that base64-encodes the user payload". The anchor input from `/speckit-plan` repeats this claim verbatim.

### 2.2 What the code shows

`src/tools/read_property/handler.ts` does NOT use `command:"eval"` and does NOT base64-encode the property name. The chain is:

1. `input.name` arrives as a JS string after zod validation (MCP transport → JSON-RPC → JSON.parse-UTF-8 → JS string).
2. The handler spawns `obsidian properties --path=<path> --format=json` via the `properties` subcommand. The `name` field is NOT in the argv at all — `read_property/handler.ts:45-51` builds `parametersA` from only `file`, `path`, and `format`.
3. The handler receives stdout (`Buffer.concat(...).toString("utf8")` per `cli-adapter/_dispatch.ts:222`) and `JSON.parse`s it into `parsedA`.
4. The lookup is a pure JS-side check: `Object.prototype.hasOwnProperty.call(parsedA, input.name)` (`handler.ts:60`).

Both sides of that comparison are correctly-decoded JS strings. `JSON.parse` on UTF-8-decoded stdout produces correctly-encoded JS keys; `input.name` arrives correctly via the MCP transport (the same transport that delivers `path`, `file`, etc. correctly to the unaffected six). The comparison is a native JS string equality on two correctly-encoded strings. There is no atob in the path.

### 2.3 Decision

**`read_property` is OUT OF SCOPE for the atob defect repair.** The spec's inclusion of `read_property` reflects a defect-class-by-similarity assumption that does not survive static audit.

That said, the spec's user-story for `read_property` (non-ASCII property names should match) **is still a contract** — it's just a contract this code already satisfies (per static analysis). The right response is to verify it empirically rather than ignore it:

1. Add a non-ASCII regression test to `read_property/handler.test.ts` exercising a property name containing each of: em-dash, accented letter, CJK character, emoji. Co-located per Principle II.
2. If the test passes (predicted outcome), the spec's `read_property` user story is satisfied with no production code change.
3. If the test fails (unexpected), reopen the read_property branch of this BI and investigate the alternative defect path before merging.

This approach honours the spec's intent (non-ASCII property names must work) while reflecting the audit truth (no atob bug to fix in read_property). The plan documents the prediction explicitly so the test outcome is interpretable as either confirmation or new defect.

### 2.4 Why not just drop `read_property` from the spec?

The spec is the contract with the reporter, not a description of the code. Even if `read_property` already works, the reporter is asking for an assurance that it works. The test IS the assurance. Removing it from scope without proof would leave a future regression undetected.

## 3. Scope-of-fix decision: broaden to the full atob+base64 cohort

### 3.1 The choice

Two valid options from the anchor:

- **Option A (Honour the spec verbatim)**: fix `read_heading` and `find_by_property` only. Leave `paths`, `links`, `smart_connections_similar`, `smart_connections_query`, `tag` for follow-up specs. (The spec also named `read_property`, but per §2 that one needs only a test, not a fix.)
- **Option B (Broaden to the cohort)**: fix the defect in all seven atob+base64 tools in this BI.

### 3.2 Decision: Option B

The atob+base64 defect is identical across all seven affected tools — same offending expression, same fix expression, same root cause. Five rationales weigh in favour of broadening:

1. **ADR-004 (Centralized Obsidian CLI Adapter) preference.** A defect in the eval-composition pattern is a defect in shared adapter behaviour. Fixing it once (via a shared decoder helper) honours the centralised-adapter spirit; fixing it in 2 of 7 sites and leaving 5 to follow-up specs creates exactly the per-tool drift ADR-004 was authored to prevent.
2. **Same one-line edit per template.** The fix is `JSON.parse(atob(...))` → `JSON.parse(new TextDecoder("utf-8").decode(Uint8Array.from(atob(...), c => c.charCodeAt(0))))`. The 5 extra tools cost only 5 extra one-line edits plus tests; spawning 5 follow-up specs costs vastly more in spec-kit overhead.
3. **Avoid partial-fix landmine.** If we ship a "fix" that leaves 5 of 7 cohort tools broken, the next agent who hits the bug on `paths` or `smart_connections_similar` will reasonably assume the underlying defect was already addressed and waste time before realising the fix was scoped narrowly. The dirty cohort is a future-tax.
4. **Cohort is growing, not shrinking.** v0.5.x added 4 new eval-composition tools; the cohort grew from 3 (at original-defect time) to 7 today. A shared decoder helper amortises across future cohort growth; per-tool patches do not.
5. **The user's anchor input explicitly authorises this option** ("Both are valid — the trade-off is bigger blast radius vs. honouring the spec's explicit named tool list") and frames the audit finding as the decision input. The audit finding is: the cohort is 7, not 3. The corresponding decision is to broaden.

### 3.3 Spec-vs-implementation reconciliation

The spec's user-story acceptance criteria are written against three named tools. Broadening the implementation to seven does NOT invalidate any spec acceptance criterion — it satisfies them all and additionally satisfies the equivalent criteria for four tools the spec did not enumerate. There is no contract that says "do NOT fix the other four"; the spec's "Out of scope" enumerates a different list (the six argv-based / native-subcommand tools that round-trip correctly today). The broadening is additive, not contradictory.

### 3.4 Constitution Compliance implication

Every tool whose code changes earns a Principle II row: at least one happy-path + one non-ASCII-boundary test in the same change. For the seven atob+base64 cohort tools that means seven non-ASCII test additions. For `read_property` it means one non-ASCII verification test per §2.

## 4. Fix shape: shared decoder, per-template embedding

### 4.1 The root cause (restated)

`atob()` in V8 (and in the Obsidian CLI's eval context, which is V8-based) returns a "binary string" — one JS code point per base64-decoded byte. UTF-8 multi-byte sequences (em-dash `0xE2 0x80 0x94`, accented letters `0xC3 0xA9` etc., CJK `0xE4 0xB8 0x80` etc., emoji `0xF0 0x9F 0x98 0x80` etc.) are correctly preserved through base64 → atob at the byte level, but the resulting JS string treats each byte as its own code point (Latin-1 interpretation). `JSON.parse` then sees mojibake — `â\x80\x94` instead of `—` — and downstream comparisons fail.

### 4.2 The fix (one-line expression)

Replace:
```
const a = JSON.parse(atob('__PAYLOAD_B64__'));
```

With:
```
const a = JSON.parse(new TextDecoder('utf-8').decode(Uint8Array.from(atob('__PAYLOAD_B64__'), c => c.charCodeAt(0))));
```

The pattern: `atob()` still does the base64 → binary-string conversion (this is the only base64-decoder available in the V8 eval context), then `Uint8Array.from(...)` converts each Latin-1 code point back to its original byte, then `TextDecoder("utf-8")` correctly re-interprets the byte sequence as UTF-8 to produce the original string. The result is what `JSON.parse(atob(...))` would have been if `atob` had returned UTF-8 instead of Latin-1.

`TextDecoder` is part of the WHATWG Encoding Standard and is available in every V8 context (including Electron renderers, where the Obsidian CLI's eval runs). `Uint8Array.from(string, mapFn)` and `c.charCodeAt(0)` are ES2015 baseline.

### 4.3 Locus of fix: shared decoder snippet + per-template embedding

The user's anchor lays out two patterns:

- **Pattern X (shared helper)**: extract a single decoder expression / function and have every template embed it. Single source of truth; future cohort growth picks it up free.
- **Pattern Y (parallel edits)**: edit each `_template.ts` independently; accept the duplication; defer consolidation to a follow-up spec.

**Decision: Pattern X.** A shared text constant exposing the decoder snippet lives in `src/tools/_shared.ts` (which already exists per `ls src/tools/`). Each of the seven templates substitutes the snippet into its `JSON.parse(...)` line; the underlying decode expression is defined once.

Two sub-options for Pattern X:

- **X.a**: shared text constant `B64_PAYLOAD_DECODE_EXPR` — a string fragment that each template embeds via template-literal interpolation. The simplest form.
- **X.b**: Node-side helper `composeEvalCode(template, payload)` — encapsulates the base64-encode + placeholder-substitute compose step that every handler does today (3 lines per handler). Combined with X.a's shared decoder fragment, this also centralises the Node-side compose.

**Recommendation: do both X.a and X.b in this BI.** The two changes are tiny (one shared constant + one shared function in an existing shared module) and they jointly close the defect at both endpoints of the compose. Together they ensure no future eval-composition tool can resurrect the bug by writing fresh template/handler boilerplate.

### 4.4 Inlined-template anomaly: find_by_property

`find_by_property/handler.ts` has its JS template INLINED in the handler (`const JS_TEMPLATE = ...` at line 16) rather than living in a sibling `_template.ts` per the cohort convention. While fixing the decode expression, also extract the template to `src/tools/find_by_property/_template.ts` so the cohort layout becomes uniform (Principle I — modular per-surface layout). This is a minor refactor that the constitution favours and that this BI's edits would otherwise leave skewed.

## 5. ADR alignment

| ADR | In play? | Rationale |
|---|---|---|
| ADR-004 (Centralized Obsidian CLI Adapter) | YES | The shared decoder helper IS the on-pattern outcome. The fix lives in the centralisation seam ADR-004 was authored to maintain. |
| ADR-009 (Direct Filesystem Write Path) | NO | `write_note` is unaffected. Confirmed in §1. No change to the direct-fs path. |
| ADR-010 (Typed Tool Names Mirror Upstream) | N/A | No tool is renamed. |
| ADR-013 (Plugin-Namespace Tool Naming) | N/A | No plugin-namespace tool is added or renamed. The two affected plugin-namespace tools (`smart_connections_similar` / `smart_connections_query`) get the decoder fix only; their lifecycle-state checks are untouched (verified by §6.2). |
| ADR-014 (Plugin-Backed Runtime-Dependency Pattern) | N/A (mostly) | The fix touches `smart_connections_*` _template.ts files only on the decode line; the `SMART_CONNECTIONS_NOT_INSTALLED` / `SMART_CONNECTIONS_NOT_READY` / `SOURCE_NOT_INDEXED` lifecycle-state branches (which live below the decode line) are byte-identical post-fix. Verified at task-execution time by diffing only the decode-line locus. |
| ADR-015 (`details.reason` Sub-Discriminators) | N/A | No new `(top-level-code, details.code)` pair; no new sub-state. |

## 6. Defence-in-depth: what else could break?

### 6.1 The Latin-1 path was the WHOLE bug

Spec, anchor input, and code-walk all agree: the defect is one expression in seven sites. Once that expression is fixed:

- Comparators inside each template (`x.toLowerCase()===y.toLowerCase()`, `stack[j]!==a.segments[j]`, `x===y`) are JS-native and are already correct on Unicode strings.
- Output paths (`JSON.stringify(...)` → CLI stdout → `Buffer.toString("utf8")` → MCP response) round-trip UTF-8 correctly today and stay unchanged.
- The MCP transport (JSON-RPC over stdio with default UTF-8) round-trips the inbound `input.foo` strings correctly today (the six unaffected tools confirm this).

No second-order Unicode defect is suspected once the decode-line fix lands. The cohort audit (§1) and the read_property analysis (§2) bracket the surface.

### 6.2 Plugin-lifecycle state interaction (smart_connections_*)

The `smart_connections_*` tools' templates contain three lifecycle-state branches that emit `SMART_CONNECTIONS_NOT_INSTALLED` / `SMART_CONNECTIONS_NOT_READY` / `SOURCE_NOT_INDEXED` (per ADR-014 stage-order). These branches live BELOW the decode line and depend on `a.<field>` values that the decoder produced. They are byte-identical pre/post-fix at the source level. The change is a no-op at the lifecycle-check layer.

Verification: at implementation time, diff each `smart_connections_*/_template.ts` against pre-fix and confirm the only delta is on the decode line; the lifecycle-state branches are byte-identical.

### 6.3 Defence-in-depth filters (read_heading R14 Setext filter)

`read_heading/_template.ts` carries an "ATX-only Setext defence-in-depth filter" per the file header. The filter operates on heading text retrieved from `app.metadataCache`; it does not interact with the decode line. Unchanged.

## 7. Fixture inventory and gaps

### 7.1 What already exists (verified)

The test vault at `…\TestVault-Obsidian-CLI-MCP\Fixtures\BI-038\` (shipped under spec branch `016-reliable-writer`) contains:

| Fixture | Non-ASCII content | Usable by |
|---|---|---|
| `tc-108-roundtrip-5kb.md` | Em-dash in H1: `# TC-108 Round Trip Fixture — 5 KB` | `read_heading` |
| `tc-mojibake-fbp.md` | Frontmatter property value: `unicode_marker: café — naïve` | `find_by_property`, `read_property` |
| `tc-mojibake-probe.md` | (not inspected) | TBD |

### 7.2 Gaps to fill before T0 probes

The full atob-cohort scope expansion (§3) means T0 probes need fixture coverage for `paths`, `links`, `tag`, `smart_connections_similar`, `smart_connections_query`, and a non-ASCII property NAME case (not just a value) for `read_property`.

The plan defers fixture pre-staging to a T0-prep task in `tasks.md`. Fixtures should be created under `…\TestVault-Obsidian-CLI-MCP\Sandbox\unicode\` per `.memory/test-execution-instructions.md` and cleaned up after the live-CLI probe session (the Sandbox convention).

Fixtures needed:

- `read_property`: a note with frontmatter property whose KEY contains non-ASCII (e.g., `café_key: value`). The existing tc-mojibake-fbp.md only has a non-ASCII VALUE, not a non-ASCII KEY.
- `paths`: not strictly needed — `paths` does not take a string-identifier input subject to lookup; the input is `folder` (a path) and `depth`. Non-ASCII folder names would exercise the same defect path. A test fixture with a non-ASCII folder name (e.g., `Sandbox/unicode/cafés/note.md`).
- `links`: a note containing a wikilink target whose name is non-ASCII.
- `tag` (list_tagged_files): a note with a non-ASCII tag (e.g., `#café`).
- `smart_connections_*`: requires the Smart Connections plugin in the test vault. Per `.memory/test-execution-instructions.md` the vault has no plugins installed. T0 probes for these two tools require either temporary plugin install (per-session, reverted after) OR are SKIPPED as plan-stage manually-verified and the unit tests cover the decoder fix.

**Decision: skip `smart_connections_*` T0 live-CLI probes.** Per the test-execution-instructions ("intentionally bare so tests reveal CLI-only behaviour and so no third-party plugin can mutate state mid-test"), installing Smart Connections in TestVault-Obsidian-CLI-MCP violates the vault's invariant. The unit tests with mocked `invokeCli` cover the decoder fix at the template-render-and-spawn-arg level; the live-CLI probe adds nothing the unit tests don't already cover for this specific bug class. Record this in plan Complexity Tracking as a deliberate scope-narrowing.

## 8. Graph queries deferred

The anchor proposed three graph queries:

- `/graphify query "what depends on atob"` — already answered by §1's Grep audit; the structural answer is "seven _template.ts files plus one inlined handler.ts, all directly".
- `/graphify explain <eval-template-renderer-node>` — there is no central renderer node; the audit (§1) shows handler-side compose is duplicated. The query would return "node not found" or point at each per-handler `JS_TEMPLATE.replace(...)` site. No new information beyond §1.
- `/graphify query "what depends on cli-adapter"` — sizing the blast radius. The fix lands at the per-tool compose seam, not in `cli-adapter` itself, so cli-adapter's downstream blast radius is not the relevant measure. If the shared decoder helper goes into `cli-adapter`, the query becomes relevant — see §4.3 — but a Grep audit already establishes the seven-handler caller set.

**Graph queries deferred.** The Grep audit produced the precise list the graph query would. Running `/graphify` would be redundant. Per the project's "Query-first" rule in CLAUDE.md, the structural question was answered by the most direct tool (Grep against the named symbol `atob`), and the queries are not needed.

If the shared decoder location moves to `cli-adapter/` (Pattern X.b variant), `/graphify query "what depends on cli-adapter"` SHOULD be run pre-implementation to verify the blast radius didn't change unexpectedly. Recorded in `tasks.md` as a pre-implementation gate task.

## 9. Open items (none blocking)

- Whether the shared helper lives in `src/tools/_shared.ts` (per-tool seam) or `src/cli-adapter/` (lower-level adapter seam). The plan recommends `_shared.ts` because the decoder is a tool-template concern, not a CLI-dispatch concern. Final placement decision logged in `plan.md` Structure Decision.
- Whether `find_by_property`'s template extracts to `_template.ts` in this BI or is left for a follow-up Principle-I-housekeeping spec. The plan recommends extracting in this BI (§4.4).

Both are implementation-locality calls, not blockers. No NEEDS CLARIFICATION remains.
