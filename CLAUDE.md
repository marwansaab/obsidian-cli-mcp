<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
[specs/014-find-by-property/plan.md](specs/014-find-by-property/plan.md)

Active feature: **014-find-by-property** — adds `find_by_property`, the
**fifth** typed-tool wrap and the first **retrieval primitive** that
goes value→file rather than file→value. Where `read_note` /
`read_property` go file→value (given a path, return content) and
`write_note` / `delete_note` mutate a named file, `find_by_property`
inverts the relation: given a frontmatter property name and a value,
return the vault-relative paths of every note whose frontmatter matches.
Replaces the agent's "guess the path from convention" sequence (1–5
calls per identifier resolution) with a single typed call. The
user-facing tool surface:
`find_by_property({ vault?, property, value, folder?, arrayMatch?,
caseSensitive? })` returning `{ count: number, paths: string[] }`.
`obsidian_exec` remains as the freeform escape hatch.

**Schema** (NEW idiom — first typed tool that does NOT use the
`target_mode` discriminator per FR-002): a flat
`z.object({...}).strict().superRefine(...)`. Five fields:
`vault?: string` (optional, focused-vault default when omitted),
`property: string.min(1)`, `value: z.union([string, number, boolean,
null, array<scalar>])`, `folder?: string` (validated against the path-
traversal regex per FR-021 / Q2), `arrayMatch?: boolean` (default
`true`), `caseSensitive?: boolean` (default `true`). The cross-field
`superRefine` rejects `value: array` paired with `arrayMatch: true`.

**Output shape**: `z.object({ count: z.number().int().nonneg(),
paths: z.array(z.string()) }).strict()`. Paths-only contract — no
matched frontmatter alongside (out-of-scope per the user input).

**Live-CLI surface** (verified during plan via `obsidian help` and
probes against the authorised test vault `TestVault-Obsidian-CLI-MCP`
on 2026-05-09):
- **No native find-by-property subcommand exists** in the Obsidian
  CLI's 80+ commands. `properties name=X` returns counts only;
  `property:read` is file→value (inverse direction); `search` is full-
  text content search not frontmatter; iterating `files` + per-file
  `property:read` is N+1 calls and breaks the spec's single-call
  promise. R2 lock.
- subcommand: **`eval`** (developer section) — load-bearing departure
  from prior typed tools, which all wrap purpose-built CLI surfaces.
  The user input itself anticipated this with the "eval composition
  uses data-passing" clause.
- **SINGLE-CALL ARCHITECTURE (R3 — vs 013's two-call)**: each MCP
  request fires ONE `invokeCli` invocation with subcommand `eval` and
  parameter `code=<rendered-js>`. The JS template walks
  `app.metadataCache.fileCache` + `app.metadataCache.metadataCache`,
  applies all matching logic in-process (scalar / array / case-folding
  / folder-prefix), and returns one JSON `{count, paths}` envelope.
  ~200 ms per call; well within the typed-tool 10 s timeout.
- **Anti-injection via base64-encoded JSON payload (R6)**: the JS
  template is a frozen string constant; the only insertion is a base64
  payload (alphabet `[A-Za-z0-9+/=]` — structurally safe inside any
  JS string literal). User-supplied `property` / `value` / `folder`
  flow through `JSON.stringify` → `Buffer.from(...).toString("base64")`
  → `atob` + `JSON.parse` at JS runtime. No user input ever reaches
  the JS source as text. Verifies FR-020 / SC-017 structurally.
- **Adapter `target_mode` mapping (R4)**: the user-facing schema has
  no `target_mode` field. At the cli-adapter call boundary the handler
  maps `vault === undefined ⇒ target_mode: "active"` (no `vault=` in
  argv) and `vault !== undefined ⇒ target_mode: "specific"`
  (`vault=<v>` prefixed). The adapter is unchanged; the mapping is
  internal to `find_by_property`'s handler.
- unknown-vault response (R5 inheritance): `Vault not found.` exit 0
  byte-identical to `properties` / `create` / `delete` / `eval`. The
  cli-adapter's existing 011-R5 inspection clause re-classifies to
  `CLI_REPORTED_ERROR`; `find_by_property` inherits unchanged.
- output cap (R10): the cli-adapter's existing 10 MiB cap fires for
  pathologically large match sets — produces a structured
  `CLI_NON_ZERO_EXIT` (output-cap kill), never a silent truncation
  (FR-019 / SC-014).

**Clarifications session 2026-05-09**: three Q&As resolved at spec
stage and codified in spec.md before plan. (Q1) Array-exact-equality
element-order — locked **order-sensitive** (`[α,β]` does NOT equal
`[β,α]`); FR-016 amended. (Q2) Folder path-traversal closure — locked
**schema-level rejection** (`VALIDATION_ERROR` for `..` segments or
leading `/` `\`); FR-021 amended. (Q3) Vault-omitted multi-vault
behaviour — **documented limitation** (parity with 013's R4 multi-vault
limitation); FR-003 amended.

**Logger surface (R1)**: same outcome as 012 / 013 / prior tools.
Thin handler; no per-call `logger.callStart` / `callEndSuccess` /
`callEndFailure` events at the tool layer. The cli-adapter's
`dispatchTimeout` / `dispatchCap` / `dispatchKill` events preserve
observability for the underlying CLI invocation.

**Module layout**: `src/tools/find_by_property/{schema,handler,index}.ts`
(post-011 convention — `index.ts` not `tool.ts`); factory
`createFindByPropertyTool(deps)`; all three new source files carry the
`// Original — no upstream.` header per Constitution V. Tests
co-located: `src/tools/find_by_property/{schema,handler,index}.test.ts`
— **45 cases total** (18 schema / 22 handler / 5 registration per
FR-026). Higher than 013's 41 because the matching-logic surface area
is larger (six axes: scalar/array, contains/exact, case-sensitive/
insensitive, folder/no-folder, type-faithful, null-vs-absent).

**Cross-cutting**: zero new error codes (FR-019 + Constitution IV);
zero new ADRs; 008-refactor surface frozen — `dispatchCli`,
`invokeCli`, `invokeBoundedCli`, `assertToolDocsExist`,
`obsidian_exec` argv contract, AND the 011-R5 cli-adapter
unknown-vault response-inspection clause all preserved. `read_note` /
`write_note` / `delete_note` / `read_property` / `obsidian_exec` /
`help` byte-stable (SC-011); only `src/server.ts` registration list
grows by two lines: one import, one tools-array entry, alphabetical
position **first** (between `delete_note` and `help`). The post-010
consolidated drift detector at
[src/tools/_register.test.ts](src/tools/_register.test.ts) auto-covers
`find_by_property` via its `it.each` registry walk — no test-file
modifications required.

**FR-027 plan-stage characterisation**: 15 cases enumerated in spec;
all critical cases verified live during plan against
`TestVault-Obsidian-CLI-MCP` (per
[.memory/test-execution-instructions.md](.memory/test-execution-instructions.md)).
Cases verified: scalar happy-path; type-faithful number-vs-string;
boolean exact; null-vs-absent disambiguation; arrayMatch contains;
arrayMatch exact-equality positional; arrayMatch order-swap rejection
(Q1); case-insensitive opt-in; folder-narrow; folder-exclude; unknown
vault response shape; base64 anti-injection round-trip; single-call
latency. Cases deferred to T0: date / datetime comparison semantics,
Unicode NFC vs NFD, large match set cap boundary (require fixture
authoring beyond plan-stage scope).

**Compatibility / release**: this BI is additive — no existing tool
changes, no error codes added, no ADRs amended. Public surface gains
one new typed tool. Version bump `0.2.6 → 0.2.7` (patch — purely
additive surface). The new typed surface is disclosed in
`CHANGELOG.md`; the multi-vault default-ambiguity limitation
(Q3 / R11) and the eval-as-CLI-entry-point stability concern (R2)
are called out in `docs/tools/find_by_property.md`.

See also:
- [spec.md](specs/014-find-by-property/spec.md) — feature spec; one clarifications session ran 2026-05-09 (Q1 array-exact-equality element order, Q2 folder path-traversal closure, Q3 vault-omitted multi-vault behaviour); all three codified directly in the spec.
- [research.md](specs/014-find-by-property/research.md) — Phase 0 decisions R1–R14 + live CLI findings F1–F8 (R1 logger surface; R2 `eval` subcommand load-bearing departure; R3 single-call architecture; R4 adapter target_mode mapping; R5 unknown-vault inheritance; R6 base64 anti-injection; R7 in-eval matching logic; R8 folder traversal regex; R9 V8 insertion-order stability; R10 inherited 10 MiB cap; R11 multi-vault default ambiguity; R12 test seams — single spawn per request; R13 import.meta.url + coverage; R14 don't amend historical specs).
- [data-model.md](specs/014-find-by-property/data-model.md) — schema diagrams (polymorphic value union, count+paths output), JS template body, base64 payload assembly, per-tool invariants, module LOC budget (~110 handler), test inventory (18 / 22 / 5 = 45 cases).
- [contracts/find-by-property-input.contract.md](specs/014-find-by-property/contracts/find-by-property-input.contract.md) — public input contract: zod schema, emitted JSON Schema shape, field policy, seven worked examples (A-G), order-sensitivity contract, multi-vault ambiguity note, error roster.
- [contracts/find-by-property-handler.contract.md](specs/014-find-by-property/contracts/find-by-property-handler.contract.md) — handler invariants: deps shape, single invokeCli call shape, JS template assembly + base64 payload renderer, two-stage eval response parse (JSON.parse + schema validate), failure propagation chain, test seam pattern with argv-payload decode assertion.
- [quickstart.md](specs/014-find-by-property/quickstart.md) — 18 verification scenarios mapped to SC-001..SC-018 (S-1..S-15 in CI; S-16..S-18 manual against MCP Inspector / Claude Desktop).

Predecessor features:
- **013-read-property**: [spec.md](specs/013-read-property/spec.md), [plan.md](specs/013-read-property/plan.md) — the fourth typed tool and the first surgical-frontmatter-read primitive. THIS feature mirrors its post-011 module layout, the polymorphic-value-union pattern, and the no-discriminator output shape. **Departures**: SINGLE-CALL architecture (R3 — vs 013's two-call); the user-facing schema has NO `target_mode` field (FR-002 — first typed tool to depart from the discriminator); subcommand is `eval` not `properties` (R2 — no native find-by-property in the CLI); paths-only output (no per-file metadata).
- **012-delete-note**: [spec.md](specs/012-delete-note/spec.md), [plan.md](specs/012-delete-note/plan.md) — the third typed tool. THIS feature mirrors the `RegisterDeps` shape and Original-no-upstream attribution conventions. Departure: no `target_mode`.
- **011-write-note**: [spec.md](specs/011-write-note/spec.md), [plan.md](specs/011-write-note/plan.md) — introduced the cli-adapter's R5 unknown-vault response-inspection clause. THIS feature inherits the clause unchanged for the `eval` subcommand (verified live — `Vault not found.` byte-identical).
- **010-flatten-target-mode**: [spec.md](specs/010-flatten-target-mode/spec.md), [plan.md](specs/010-flatten-target-mode/plan.md) — flattened `targetModeSchema`. Not consumed by `find_by_property` (the tool has no target_mode); the post-010 module-layout convention IS consumed.
- **006-read-note**: [spec.md](specs/006-read-note/spec.md), [plan.md](specs/006-read-note/plan.md) — first typed tool. THIS feature mirrors the no-discriminator output shape pattern.
- **005-help-tool**: [spec.md](specs/005-help-tool/spec.md), [plan.md](specs/005-help-tool/plan.md) — registry-consistency test. THIS feature populates `docs/tools/find_by_property.md` (new file per FR-025); the existing registry-consistency test at [src/server.test.ts](src/server.test.ts) auto-asserts the file's existence once `find_by_property` is registered.
- **003-cli-adapter**: [spec.md](specs/003-cli-adapter/spec.md), [plan.md](specs/003-cli-adapter/plan.md) — `invokeCli` adapter. THIS feature routes through it once per request (R3); the 011-R5 unknown-vault response-inspection clause is inherited.
- **004-target-mode-schema**: [spec.md](specs/004-target-mode-schema/spec.md), [plan.md](specs/004-target-mode-schema/plan.md) — defined the target_mode primitive. **NOT consumed** by this feature (FR-002 — find_by_property is vault-wide, no target_mode). The primitive's existence is unaffected; predecessor specs are not amended.
- **008-refactor**, **007-fix-list-tools-schema**, **009-fix-inputschema-publication**, **002-detect-cli-errors**, **001-add-cli-bridge**: foundational; not touched.

References:
- [.specify/memory/constitution.md](.specify/memory/constitution.md) — All five principles satisfied (no Complexity Tracking entries needed). Principle I (per-surface module under `src/tools/find_by_property/`); Principle II (45 co-located tests); Principle III (zod is single source of truth for both input AND output, types via z.infer, polymorphic value union; no hand-rolled types); Principle IV (zero new error codes; failures flow through VALIDATION_ERROR + adapter's four codes; 011-R5 inherited); Principle V (Original-no-upstream headers on every new source file).
- [.decisions/ADR-003 - Enforce Target Mode in Typed Tools.md](.decisions/) — **deliberately not enforced** by this feature per FR-002 (find_by_property is inherently vault-wide; no target_mode). The ADR governs typed tools that operate on a single named file or active file; `find_by_property` is a value→file lookup with neither concept. The ADR is NOT amended; its scope simply doesn't reach this surface.
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
