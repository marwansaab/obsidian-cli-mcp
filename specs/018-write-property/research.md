# Phase 0 Research — Write Property

Captures the design decisions ratified at planning stage (R1–R16) and the live-CLI findings (F1–F15) that drove them. Per the project convention (R12 / [013-research.md R12](../013-read-property/research.md)), this file is the source of record for plan-stage spec amendments — spec.md is NOT edited retroactively.

## Live-CLI findings (probe pass on 2026-05-10 against the authorised test vault `TestVault-Obsidian-CLI-MCP`)

All probes ran via `& obsidian vault=TestVault-Obsidian-CLI-MCP …` against an Obsidian instance with `Fixtures/BI-038/tc-mojibake-fbp.md` focused. Fixtures seeded under `Sandbox/` with unique probe IDs and cleaned up after the pass.

### F1 — `property:set` is the native CLI subcommand

The Obsidian CLI exposes `property:set` as a first-class subcommand. Argv shape from `obsidian help property:set`:

```
property:set          Set a property on a file
  name=<name>         - Property name (required)
  value=<value>       - Property value (required)
  type=text|list|number|checkbox|date|datetime  - Property type
  file=<name>         - File name
  path=<path>         - File path
```

Notes:
- No `active=` flag listed. Active mode is implicit — omit `file=` and `path=`, the CLI defaults to the focused file (CLI help preamble: "Most commands default to the active file when file/path is omitted").
- Stdout success shape: `Set <name>: <value>\n`. No JSON envelope, no path echo. The wrapper cannot recover the canonical path from `property:set` stdout.
- Exit code: 0 on success.
- `vault=<name>` is accepted as a global flag (same as every other typed-tool subcommand).

### F2 — Empty list via literal `value=[]`

The CLI recognises the literal `[]` syntax as "write an empty YAML list":

```
$ obsidian vault=… property:set name=labels value=[] path=Sandbox/fix.md
Set labels: []

$ cat fix.md
---
status: queued
labels: []
---
```

Behaviour identical with `type=list` and without. The wrapper's empty-array case maps to argv `value=[]` directly — no special handling beyond a string-substitution at the value-serialisation step.

### F3 — Cross-type overwrite is native CLI behaviour

`property:set` with no `type` argument lets the CLI infer the type from `value`'s shape AND overwrite both the value AND the on-disk type representation. Probe:

```
# Before: count: 7 (number)
$ obsidian vault=… property:set name=count value=abc path=…
Set count: abc

# After: count: abc (text)
$ obsidian vault=… property:read name=count path=…
abc
```

The vault's property-type registry also updates: `count` flips from `number` to `text`. This means **FR-033 is satisfied by native CLI behaviour** — the wrapper needs no special logic to "make the resolved type win". Cross-type retype is exactly what `property:set` does when invoked without an explicit `type`.

### F4 — Type-vs-value contradictions are CLI-rejected

The CLI validates value-vs-type at its own boundary and refuses to write malformed YAML:

```
$ obsidian vault=… property:set name=count value=abc type=number path=…
Error: Invalid number: abc
# (exit 0, file unchanged)

$ obsidian vault=… property:set name=due value=hello type=date path=…
Error: Invalid date format. Use YYYY-MM-DD
# (exit 0, file unchanged)
```

The dispatch-layer four-priority classifier at [src/cli-adapter/_dispatch.ts:onTerminal](../../src/cli-adapter/_dispatch.ts) maps the `Error: …` prefix to `CLI_REPORTED_ERROR`. **FR-012's structured-error-on-contradiction contract is satisfied at the CLI layer** — the wrapper does no pre-validation of value-vs-type compatibility.

### F5 — Unknown vault response inherits 011-R5 inspection clause

```
$ obsidian vault=NonExistentVault property:set name=foo value=bar path=Welcome.md
Vault not found.
# (exit 0)
```

Stdout is byte-identical to the response inherited by every typed tool since feature 011 (`create`, `delete`, `properties`, `eval`, `file`). The cli-adapter's [response-inspection clause](../../src/cli-adapter/_dispatch.ts) re-classifies this to `CLI_REPORTED_ERROR` without any wrapper-side handling. **R5 inheritance applies unchanged.**

### F6 — Non-existent file surfaces structured CLI error

```
$ obsidian vault=… property:set name=foo value=bar path=Sandbox/does-not-exist.md
Error: File "Sandbox/does-not-exist.md" not found.
# (exit 0)
```

`Error:` prefix → dispatch-layer classifier → `CLI_REPORTED_ERROR`. **FR-016 satisfied natively** — no auto-create, the CLI refuses on non-existent files.

### F7 — Path-traversal CLI-confined

```
$ obsidian vault=… property:set name=foo value=bar path=../OtherVault/secret.md
Error: File "../OtherVault/secret.md" not found.

$ obsidian vault=… property:set name=foo value=bar path=../../etc/passwd
Error: File "../../etc/passwd" not found.
```

The CLI's vault-confinement layer reverse-engineers any `..` segments to "not in vault" and rejects via the standard non-existent-file path. **FR-026 satisfied at the CLI layer** — the wrapper does no path-traversal validation; it inherits the CLI's confinement plus the `CLI_REPORTED_ERROR` mapping.

### F8 — Active-mode multi-vault inheritance (`vault=` flag is functionally ignored)

In active mode (no `file=`/`path=`), the CLI targets the focused Obsidian file regardless of the `vault=` flag. Probe via the active-mode write that landed on `Fixtures/BI-038/tc-mojibake-fbp.md` (the file Obsidian had focused), not on a file in the vault named by `vault=`. Same limitation inherited by 013 / 014 / 015. Documented in `docs/tools/write_property.md`.

### F9 — YAML control characters auto-quoted by the CLI

Values containing `#`, `:`, leading `!`, leading `|`, leading `&`, leading `*` are all double-quoted automatically:

| Input `value=` | On-disk YAML |
|---|---|
| `hello # world` | `note: "hello # world"` |
| `k: v` | `note: "k: v"` |
| `!alert` | `note: "!alert"` |
| `\|literal` | `note: "\|literal"` |
| `&anchor` | `note: "&anchor"` |
| `*ref` | `note: "*ref"` |

All round-trip through Obsidian's YAML parser via `property:read`. **FR-021 satisfied at the CLI layer.**

### F10 — Exotic property names accepted verbatim

```
$ obsidian vault=… property:set name=my.key value=val path=…
my.key: val           # dot accepted

$ obsidian vault=… property:set name=my-key value=val path=…
my-key: val           # dash accepted

$ obsidian vault=… property:set name=my:key value=val path=…
my:key: val           # colon accepted; round-trips via property:read
```

The colon-in-key case (`my:key`) produces unquoted-colon YAML that is borderline-invalid by YAML spec, but Obsidian's parser tolerates it on read. Documented as observed behaviour; the wrapper passes names through verbatim per FR-019.

### F11 — Pre-existing YAML re-serialised on write (flow → block normalisation)

A file containing `tags: [alpha, beta]` (flow style) — after a write to a DIFFERENT key — becomes:

```yaml
---
status: queued
count: 7
archived: false
tags:
  - alpha
  - beta
newField: hello
---
```

The CLI normalises flow-sequence YAML to block-sequence on every write. **The values are preserved byte-stable; the YAML style is not.** Per FR-022 wording ("preserved... to whatever degree the underlying serialiser supports"), this is contract-compliant — but it IS an observable diff and worth documenting as a known limitation.

### F12 — CRLF preservation is PARTIAL — plan-stage amendment of FR-023

The CLI re-emits the file's content with the OS-native line ending (LF on the test host) for the modified portion. CRLF and LF probe:

| Input encoding | Pre-write CRLF pairs | Post-write CRLF pairs | Post-write lone LFs |
|---|---|---|---|
| CRLF file, 5 pairs | 5 | 4 | 2 |
| LF file, 0 CR | 0 | 0 | preserved |

For a CRLF-encoded file, the post-write file has MIXED line endings: the unmodified body retains its CRLF pairs, but the modified frontmatter portion uses LF only. For an all-LF file, post-write is still all-LF.

**Spec FR-023 is amended at plan stage** (per R12 — documented here, NOT in spec.md): CRLF preservation is **best-effort and partial**. The wrapper's contract is "all-LF files round-trip cleanly; CRLF files may have mixed line endings post-write". The amendment is reflected in:
- `docs/tools/write_property.md` (Known Limitations section).
- The plan-stage spec quality re-evaluation gate (SC-012 wording is preserved per R12; the live-CLI characterisation pass reports the divergence).

### F13 — List wire format is comma-separated

`type=list` (or inference) interprets the comma-separated `value=a,b,c` as a multi-element YAML list:

```
$ obsidian vault=… property:set name=labels value=alpha,beta,gamma type=list path=…
Set labels: alpha,beta,gamma

$ cat …
labels:
  - alpha
  - beta
  - gamma
```

Edge case: list elements containing commas WILL be split incorrectly. `value=hello, world,bye` produces `[hello, world, bye]` (three elements), not `[hello, world, bye]` (two elements with the comma preserved). **Documented as a known limitation** — the wrapper passes the `string[]` input joined with `,` to the CLI; callers needing comma-containing list elements fall back to the `obsidian_exec` escape hatch.

### F14 — Empty-string value with `type=list` produces a one-element list (NOT an empty list)

```
$ obsidian vault=… property:set name=labels value= type=list path=…
labels:
  - ""
```

This is the trap that makes F2's literal `[]` syntax load-bearing — the wrapper MUST send `value=[]` (not an empty string) when the input `value` is the empty array `[]`.

### F15 — `file file=<wikilink>` resolves to canonical path

```
$ obsidian vault=… file file=Welcome
path	Welcome.md
name	Welcome
extension	md
size	220
created	1778239632126
modified	1778458814684
```

TSV output (one tab-separated key/value pair per line). Parseable by splitting on `\n` and `\t`. **Used by R3 specific+file branch** to discover the canonical path for the response envelope.

## Design decisions

### R1 — Logger surface (parity with 011–015)

**Decision**: thin handler; NO per-call `logger.callStart` / `callEndSuccess` / `callEndFailure` events at the tool layer. Observability is inherited from the cli-adapter's `dispatchTimeout` / `dispatchCap` / `dispatchKill` events.

**Rationale**: matches the actual implementation of `read_note` / `write_note` / `delete_note` / `read_property` / `find_by_property` / `read_heading`. The spec's FR-029 mentions regression tests, not a per-tool logging contract.

**Alternatives considered**: per-call instrumentation. Rejected — adds a logging surface that every typed tool would need to maintain; redundant with the cli-adapter's existing layer.

### R2 — CLI subcommand selection: `property:set` (native), NOT eval

**Decision**: the wrapper composes a single `property:set` invocation per write (plus optional path-resolution calls per R3). NO `eval` composition for the write itself.

**Rationale**: F1 confirmed `property:set` is a native CLI subcommand with the exact argv shape the spec requires. The spec's note in the SECURITY edge case — *"There is no eval injection vector because this surface composes via a typed CLI command, not an eval"* — locks this choice. The eval path-resolution call (R3 / active mode) uses a FIXED template with no user input interpolation, so the assertion holds for `name` and `value`.

**Alternatives considered**:
- Eval composition (similar to `find_by_property` / `read_heading`). Rejected — `property:set` is native; eval adds CLI-internal-JS-engine-version coupling for no benefit.
- `properties` subcommand with a write-mode flag. Rejected — `properties` is read-only per its argv shape (no `value=`).

### R3 — Per-mode call architecture (1 or 2 calls)

**Decision**:
- **Specific + path**: ONE `invokeCli` call. Send `property:set vault=<v> path=<p> name=<n> value=<v> [type=<t>]`. Response.path = input.path.
- **Specific + file** (wikilink): TWO `invokeCli` calls. Call 1: `file vault=<v> file=<wikilink>` (TSV parse to discover canonical path). Call 2: `property:set vault=<v> path=<canonical> name=<n> value=<v> [type=<t>]`. Response.path = canonical from Call 1.
- **Active**: TWO `invokeCli` calls. Call 1: `eval code=<FIXED_TEMPLATE>` (returns `{path, vault}` from `app.workspace.getActiveFile()` + `app.vault.getName()`). Call 2: `property:set vault=<resolved> path=<resolved> name=<n> value=<v> [type=<t>]` (target_mode=specific at the adapter layer, with the resolved locator). Response.path = resolved from Call 1.

**Rationale**: FR-011 mandates `path` in the response be "the vault-relative path of the file that received the write". In specific+path mode the input already supplies this. In specific+file mode the input is a wikilink that needs canonicalisation. In active mode the input has no path at all. The TWO-call branches resolve the canonical path BEFORE the write — eliminating any TOCTOU window where a focus-change between resolution and write could land the write on a different file than reported in the response.

The architecture mirrors [013-read-property R3](../013-read-property/research.md) (two-call architecture for separate value + type metadata) — write_property's two-call is per-mode rather than per-data-channel, but the latency and test-seam consequences are the same.

**Alternatives considered**:
- ALWAYS resolve via eval (mode-symmetric two-call). Rejected — adds overhead to the dominant specific+path case for no contract benefit.
- Echo input.file verbatim in specific+file mode (skip canonicalisation). Rejected — contradicts FR-011 ("vault-relative path"; a wikilink is not vault-relative).
- Use property:set's native active resolution (no eval pre-flight) and discover post-write via `file` (no args). Rejected — TOCTOU window between the write and the discovery.

### R4 — Target-mode mapping at the adapter layer

**Decision**: STANDARD target_mode mapping per ADR-003. In specific mode, the handler passes `input.target_mode = "specific"` to `invokeCli` and the cli-adapter routes vault/file/path normally. In active mode, the handler resolves to a canonical path via R3's eval pre-flight, then invokes property:set with `target_mode: "specific"` at the adapter layer (with the resolved vault+path) — the active-mode eval is the ONLY active-mode adapter call.

**Rationale**: the cli-adapter's adapter-layer target_mode handling per [target-mode primitive](../../src/target-mode/target-mode.ts) is what gates locator validation downstream. We use specific-mode at the adapter for the write step regardless of the user's input mode, because by the time we invoke property:set we have an explicit canonical path. The eval pre-flight runs in active mode (no locator); the cli-adapter accepts both.

### R5 — Unknown-vault response inspection (011-R5 inheritance)

**Decision**: inherited from the cli-adapter's existing 011-R5 unknown-vault response-inspection clause without modification.

**Rationale**: F5 confirmed `property:set` returns `Vault not found.` byte-identical to the response surfaces handled by the 011-R5 clause. No write_property-specific handling needed.

### R6 — Type-vs-value contradictions handled by the CLI

**Decision**: NO wrapper-side pre-validation of value-vs-type compatibility. The CLI rejects contradictions at the underlying layer with `Error: Invalid <type>: <value>` (F4); the dispatch-layer four-priority classifier maps the `Error:` prefix to `CLI_REPORTED_ERROR`.

**Rationale**: FR-012 admits either layer ("Whether the rejection happens at the validation boundary or at the underlying serialiser layer is an implementation choice"). The CLI is the rejection layer; wrapper validation would duplicate CLI logic and risk falling out of sync as Obsidian's parsers evolve.

**Alternatives considered**: wrapper-side regex validation (e.g. `type=date` ⇒ value must match `^\d{4}-\d{2}-\d{2}$`). Rejected — duplicates CLI logic, locks the wrapper to a date format that Obsidian could broaden.

### R7 — Pre-existing flow-style YAML re-serialised to block-style (F11 — documented limitation)

**Decision**: the wrapper does NOT preserve YAML style for neighbouring frontmatter fields. FR-022's "preserved to whatever degree the underlying serialiser supports" is the contract; the CLI's normalisation behaviour (flow → block) is the realised support level.

**Rationale**: F11 confirmed the CLI re-emits flow-style sequences as block-style on write. Wrapper-side preservation would require a read-modify-write where the wrapper parses and re-emits YAML — exactly the brittle path the typed surface was designed to replace. Documented in `docs/tools/write_property.md` as a known limitation.

### R8 — CRLF preservation is PARTIAL — plan-stage FR-023 amendment

**Decision**: FR-023 ("CRLF and LF line endings on the on-disk file MUST be preserved through the write") is amended at plan stage. The realised contract is **all-LF files round-trip cleanly; CRLF files may have mixed line endings post-write** (the unmodified body retains CRLF; the CLI-emitted modified frontmatter uses LF).

**Rationale**: F12 demonstrated the divergence. Wrapper-side full CRLF preservation would require:
1. Read the file's pre-write line-ending dominant pattern.
2. After the property:set call, read the file again.
3. Replace LF with CRLF in the modified region.

This is heavy, racy (concurrent writers), and a substantial new responsibility surface. Defer to a future feature if needed.

**R12-precedent**: the divergence is captured here in research.md, in the per-tool docs (`docs/tools/write_property.md` Known Limitations), and in the live-CLI characterisation pass log. spec.md's FR-023 / SC-012 wording is preserved untouched — readers of spec.md who need the realised contract are pointed here via the per-tool docs and the CLAUDE.md plan reference.

### R9 — List wire format (comma-separated; element-with-comma is a documented limitation)

**Decision**: the wrapper joins `value: string[]` with `,` and passes the joined string to the CLI's `value=` parameter (with or without `type=list`). Elements containing literal `,` characters are out-of-scope for the typed surface; documented as a known limitation. Callers needing comma-containing list elements fall back to `obsidian_exec`.

**Rationale**: F13 confirmed comma is the list separator. F14 confirmed empty-string-with-type-list does NOT produce an empty list — locked the R10 / F2 `value=[]` path. The element-with-comma limitation is a known restriction of the CLI surface, not a wrapper bug; documenting it preserves the typed-tool simplicity.

**Alternatives considered**:
- Wrapper-side element-escape encoding (e.g. URL-encode commas). Rejected — adds wire-format complexity for a rare case; callers expect transparent `string[]` → YAML list.
- Per-element eval composition. Rejected — pulls eval into the write path; violates R2.

### R10 — Empty-list special case (`value: []` → `value=[]` literal)

**Decision**: when the input `value` is the empty array `[]`, the handler sends the literal string `"[]"` to the CLI's `value=` parameter. With or without `type=list`, the CLI recognises this as "write an empty YAML list" (F2).

**Rationale**: F14 demonstrated empty-string-with-type=list produces a one-element list, NOT an empty list. F2 demonstrated `value=[]` produces a valid empty list. The wrapper's empty-array detection is one branch in `serialiseValue`.

### R11 — Output schema shape

**Decision**: `writePropertyOutputSchema = z.object({ written: z.literal(true), path: z.string(), name: z.string() }).strict()`. Three fields; success-shape only.

**Rationale**: FR-011 contract. `z.literal(true)` for `written` makes the success-shape compile-time-verifiable (a `false` shape doesn't exist; failures throw UpstreamError). Strict mode rejects unknown output keys at compile time.

### R12 — Don't amend predecessor specs (project convention)

**Decision**: plan-stage findings that contradict or weaken spec.md are documented HERE, in research.md, and surfaced via the per-tool docs and CLAUDE.md plan reference. spec.md is NOT edited retroactively.

**Rationale**: established precedent across [013-read-property R12](../013-read-property/research.md) and predecessor features. Editing spec.md after Phase 0 confuses the audit trail; a reader who pulls spec.md as-of-clarify-time should see the same wording later.

This feature has one R12-classed amendment: FR-023 / SC-012 weakening per R8.

### R13 — Test seams: `deps.spawnFn` injection (one or two spawns per request)

**Decision**: handler tests inject the cli-adapter's stub `spawnFn` via `deps.spawnFn` per the existing test-seam convention. Per request, the handler emits:
- ONE spawn invocation in specific+path mode (just property:set).
- TWO spawn invocations in specific+file mode (file → property:set) AND in active mode (eval → property:set).
- ONE spawn invocation in active-mode no-focused-file (the eval; the property:set is short-circuited).

**Rationale**: matches the existing test-seam convention; preserves the no-real-binary-in-CI posture.

### R14 — Path-traversal handled at CLI layer (no wrapper validation)

**Decision**: per F7, the CLI confines paths to the vault root and rejects `../` with `Error: File "..." not found.`. The wrapper performs NO path-traversal validation; FR-026 is satisfied at the CLI layer.

**Rationale**: avoids duplicating CLI logic; aligns with R6's "trust the CLI's rejection layer" philosophy.

### R15 — Eval template for active mode is fixed (no anti-injection encoding needed)

**Decision**: the eval template used in R3's active-mode branch is a FIXED string with no user input interpolation:

```javascript
(()=>{const f=app.workspace.getActiveFile();return JSON.stringify({path:f?.path??null,vault:app.vault.getName()});})()
```

Base64 anti-injection (per [015-read-heading R6](../015-read-heading/research.md)) is NOT needed because user inputs (`name`, `value`, `type`) do NOT flow into the eval template — they flow into the property:set call's discrete argv parameters, never into eval source text.

**Rationale**: the spec's SECURITY edge case asserts the typed surface has no eval-injection vector; R15 preserves that assertion structurally.

### R16 — Specific+file wikilink resolution via `file file=<wikilink>` (TSV parse)

**Decision**: the Call 1 of the specific+file two-call architecture uses `file file=<wikilink>` (returns TSV per F15). The wrapper parses the TSV by splitting on `\n` and finding the line starting with `path\t`.

**Rationale**:
- Avoids pulling eval into the specific-mode path (per R2's stated assertion).
- `file` subcommand is native and stable across Obsidian versions.
- TSV parsing is trivial (~5 LOC).

**Alternatives considered**:
- Eval composition via `app.metadataCache.getFirstLinkpathDest(name, "")`. Rejected — adds eval to specific mode for a single-call replacement (a marginal wire-format choice).
- Skip canonicalisation, echo wikilink in response.path. Rejected per R3 rationale.

## Plan-stage spec amendments (per R12)

This research artefact records two plan-stage amendments to the spec that are NOT propagated to spec.md:

1. **FR-023 / SC-012 weakening (CRLF preservation is PARTIAL)** — per R8. Surfaced in `docs/tools/write_property.md` Known Limitations, in the live-CLI characterisation pass log, and in the CLAUDE.md plan reference once registered.
2. **FR-022 realisation (YAML style normalisation is observable)** — per R7. The contract wording supports the realised behaviour; the limitation is documented for caller awareness rather than amended.

Plan-stage characterisation status (corrected post-/speckit-analyze finding F1 — the original tally of "15 of 16" was off by 2 because two additional FR-030-enumerated cases were silently dropped from the plan-stage sweep):
- **13 of the 16 FR-030 enumerated cases verified live during plan** (cases noted as F1–F15 above).
- **Three cases deferred to T0 of `/speckit-implement` and bundled into T022's probe set**:
  1. Two concurrent writes to the same file (FR-030 — "Two concurrent writes to the same file ... confirms the underlying serialiser's atomicity guarantees and any observed interleaving behaviour"). Deferred because concurrent probing requires orchestrated parallel CLI invocations against the same fixture.
  2. Anchors / aliases / comments in pre-existing frontmatter (FR-030 — "Setting a property on a file that has YAML anchors / aliases / comments in its frontmatter — confirms whether the underlying serialiser flattens, reorders, or strips comments"). Deferred — surface F11 documented the general flow→block normalisation behaviour but did not exercise the anchor / alias / comment sub-cases specifically.
  3. External-editor-open behaviour (FR-030 — "write_property against a file that an external editor currently has open — confirms reload / rejection / overwrite behaviour"). Deferred — requires coordinating a second editor process which exceeded the plan-stage timeboxed sweep.

  Findings from the three deferred probes land as F16 (concurrent writes), F18 (anchors/aliases/comments), F19 (external-editor-open) — see T022 in tasks.md.

## Test inventory summary (motivates SC-015 / FR-029)

Total cases planned: **57** (post-/speckit-analyze remediation; bumped 54 → 57 to close E1 — three cross-type retype pairs per SC-021 — and C1 — active-mode cross-type retype per US2#4; vs SC-015's floor of 30). Breakdown:
- **schema.test.ts** — 17 cases (target-mode primitive interactions + name + value union + type enum + unknown-key rejection).
- **handler.test.ts** — 35 cases (per-mode happy paths, per-YAML-type assertions, error code propagation, name/value passthrough, **three cross-type retype pairs (number→text, text→number, list→text) + active-mode cross-type retype**, CLI argv shape).
- **index.test.ts** — 5 cases (descriptor name, description token presence, stripped schema, help mention, doc-file presence; the drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) auto-covers via its `it.each` registry walk).

Test inventory is enumerated in [data-model.md](./data-model.md).

## References

- [013-read-property/research.md](../013-read-property/research.md) — precedent for two-call architecture, R12 convention, unknown-vault inheritance.
- [014-find-by-property/research.md](../014-find-by-property/research.md) — precedent for eval-composition + base64 anti-injection (this feature does NOT inherit R6 / base64 because user inputs don't reach eval per R15).
- [015-read-heading/research.md](../015-read-heading/research.md) — precedent for plan-stage live-CLI characterisation methodology.
- [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) — authorised test vault, sandbox protocol, destructive-probe rules. Followed for all F1–F15 probes.
