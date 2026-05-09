<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
[specs/015-read-heading/plan.md](specs/015-read-heading/plan.md)

Active feature: **015-read-heading** — adds `read_heading`, the
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
