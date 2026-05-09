<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
[specs/013-read-property/plan.md](specs/013-read-property/plan.md)

Active feature: **013-read-property** — adds `read_property`, the fourth
typed-tool wrap on top of the foundation completed by features 003–010
and the second since [012-delete-note](specs/012-delete-note/spec.md)
closed the destructive-removal leg of the typed surface. Where
`read_note` retired `obsidian_exec` for full-file reads, `write_note`
retired it for create/overwrite, and `delete_note` retired it for
destructive removal, `read_property` retires it for **surgical
frontmatter-property reads** — agents that want a single named property
no longer pay the token cost of a full-file fetch plus client-side YAML
parsing. The user-facing tool surface:
`read_property({ target_mode, vault?, file? | path?, name })` returning
`{ value: <native-typed>, type: <"text" | "list" | "number" | "checkbox"
 | "date" | "datetime" | "unknown"> }`. `obsidian_exec` remains as the
freeform escape hatch for unwrapped subcommands.

**Schema** (post-010 Pattern (a) flat-extension idiom; NO active-mode
`superRefine` clauses — parity with `delete_note`'s R6):
`applyTargetModeRefinement(targetModeBaseSchema.extend({ name:
z.string().min(1) }))`. The schema reduces to the target-mode
primitive's existing rules (vault required in specific, locator XOR,
vault/file/path forbidden in active, top-level
`additionalProperties: false`) plus the single required `name` field
(non-empty string in both modes).

**Output shape**: `z.object({ value: z.union([z.string(), z.number(),
z.boolean(), z.array(z.unknown()), z.record(z.unknown()), z.null()]),
type: z.enum(["text", "list", "number", "checkbox", "date", "datetime",
"unknown"]) }).strict()`. The polymorphic `value` covers all six runtime
shapes from JSON-parsed frontmatter values (FR-008 + FR-027 mappings —
the object branch). The seven-label `type` enum is the public contract;
internal mapping from Obsidian's labels via R6's translation table.
No discriminator (failures throw `UpstreamError`, never produce an
`ok: false` shape); mirrors `read_note`'s pattern.

**Live-CLI surface** (verified during plan via `obsidian help` and
probes against the authorised test vault `TestVault-Obsidian-CLI-MCP`):
- subcommand: `properties` (plural) with `format=json`, NOT
  `property:read` — the latter is structurally lossy (mappings render
  as `[object Object]`; literal-`"null"` and YAML-null collapse at the
  wire). R2 lock.
- **TWO-CALL ARCHITECTURE (R3 — load-bearing departure from prior
  typed tools)**: every MCP request fires TWO `invokeCli` calls.
  Call A (file-scoped, `properties path=<p> format=json`) returns the
  frontmatter as a JSON object — sources `value` and detects absent
  vs explicit-null. Call B (vault-scoped, `properties format=json`)
  returns Obsidian's resolved type-metadata array — sources the `type`
  label that distinguishes date/datetime/text strings (which JSON
  encoding alone cannot). Short-circuit cases (no-frontmatter, absent
  property) skip Call B because the type is structurally fixed at
  `"unknown"`. Latency cost ≈ 2× single-call.
- argv keys: `file=<name>` and `path=<path>` for Call A's locator
  (R11 — match user-facing schema fields directly, no rename, parity
  with `read_note` / `delete_note`). `format=json` is a parameter
  (key=value), NOT a flag. Active-mode Call A adds `active` flag.
- type label translation (R6): Obsidian uses `multitext` for arrays
  (translated to `list`); `aliases` and `tags` are built-in array
  fields (also translated to `list`); `unknown` is Obsidian's native
  label for mapping values (passthrough — Q2's pre-committed
  `{value: <object>, type: "unknown"}` answer is what Obsidian itself
  produces).
- unknown-vault response (R5 inheritance): `Vault not found.` byte-
  identical across `properties`, `create`, `delete`. The cli-adapter's
  existing 011-R5 inspection clause re-classifies; `read_property`
  inherits.
- `No frontmatter found.` (R7): live characterisation revealed
  Obsidian conflates "no frontmatter block" with "malformed frontmatter
  (missing closing fence)" — both produce identical stdout.
  Spec FR-012's "structured error for malformed" is **weakened to
  match Obsidian** — both cases follow FR-011's
  `{value: null, type: "unknown"}` semantic. Tool-layer short-circuit
  in the handler; no adapter change.

**Q1 / Q2 contingencies (clarifications session 2026-05-09)**: both
resolved without spec amendment. Q1 (absent vs explicit-null
distinguishability) does NOT fire — Obsidian's vault-scoped metadata
distinguishes (absent → `type: "unknown"`; explicit-null → typed label
e.g. `"text"`). Q2 (mapping values) confirmed — Obsidian itself
labels mappings as `"unknown"`, matching the spec's pre-committed
Q2 → A answer.

**Active-mode multi-vault limitation (R4)**: in active mode, Call B
is issued without `vault=` (queries Obsidian's default vault for type
metadata, not the focused-note's vault). Single-vault correct;
multi-vault may report wrong type labels in active mode. Documented
as a known limitation; specific mode is recommended for type-correctness
when multiple vaults are registered.

**Logger surface (R1 — spec FR-009 reconciliation)**: same outcome as
[012-delete-note R1](specs/012-delete-note/research.md). Thin handler;
no per-call `logger.callStart` / `callEndSuccess` / `callEndFailure`
events at the tool layer. The cli-adapter's `dispatchTimeout` /
`dispatchCap` / `dispatchKill` events preserve observability end-to-end
for each of the two underlying CLI invocations. Spec FR-009 superseded
by research R1; spec.md NOT amended per R12.

**Module layout**: `src/tools/read_property/{schema,handler,index}.ts`
(post-011 convention — `index.ts` not `tool.ts`); factory
`createReadPropertyTool(deps)`; all three new source files carry the
`// Original — no upstream.` header per Constitution V. Tests
co-located: `src/tools/read_property/{schema,handler,index}.test.ts` —
**36 cases total** (14 schema / 17 handler / 5 registration per
FR-023). Higher than `delete_note`'s 30 because of the two-call
architecture (handler tests cover both spawn invocations + short-
circuit branches) and the polymorphic value union (more schema cases).

**Cross-cutting**: zero new error codes (FR-021 + Constitution IV);
zero new ADRs; 008-refactor surface frozen — `dispatchCli`,
`invokeCli`, `invokeBoundedCli`, `assertToolDocsExist`,
`obsidian_exec` argv contract, AND the 011-R5 cli-adapter
unknown-vault response-inspection clause all preserved. The R7 short-
circuit lives in the read_property handler, NOT in the adapter — keeps
adapter-layer surface frozen. `read_note` / `write_note` /
`delete_note` / `obsidian_exec` byte-stable (SC-009; only
`src/server.ts` registration list grows by two lines: one import, one
tools-array entry, alphabetical between `read_note` and `write_note`).
The post-010 consolidated drift detector at
[src/tools/_register.test.ts](src/tools/_register.test.ts) auto-covers
`read_property` via its `it.each` registry walk — no test-file
modifications required.

**FR-024 plan-stage characterisation**: 15 cases enumerated; 9
verified live during plan against `TestVault-Obsidian-CLI-MCP` (per
[.memory/test-execution-instructions.md](.memory/test-execution-instructions.md)).
Cases verified: subcommand argv shape; file-scoped value preservation
for all six native types; vault-scoped type metadata (Obsidian's
resolved labels); unknown vault; missing file; no-frontmatter;
malformed-frontmatter conflation; active-mode no-focused-note; wikilink
locator. 6 cases deferred to T0: active-mode happy path, YAML
comments / anchors / aliases, CRLF-vs-LF, heterogeneous-list (T0 lock
for the type label Obsidian assigns).

**Compatibility / release**: this BI is additive — no existing tool
changes, no error codes added, no ADRs amended. Public surface gains
one new typed tool. Version bump `0.2.5 → 0.2.6` (patch — purely
additive surface; type system unchanged from external view). The new
typed surface is disclosed in `CHANGELOG.md`; the active-mode multi-
vault limitation (R4) and the FR-011/FR-012 conflation (R7) are
called out in `docs/tools/read_property.md`.

See also:
- [spec.md](specs/013-read-property/spec.md) — feature spec; one clarifications session ran 2026-05-09 (Q1 absent-vs-explicit-null discriminator, Q2 mapping-value handling); both resolved without spec amendment.
- [research.md](specs/013-read-property/research.md) — Phase 0 decisions R1–R12 + 9 FR-024 cases verified during plan (R1 logger surface; R2 subcommand selection; R3 two-call architecture; R4 active-mode flag + multi-vault limitation; R5 unknown-vault inheritance; R6 type label translation table; R7 No-frontmatter short-circuit + FR-011/FR-012 conflation amendment; R8 Q1/Q2 contingencies resolved; R9 test seams — TWO spawns per request; R10 import.meta.url + coverage; R11 locator argv direct map; R12 don't amend historical specs).
- [data-model.md](specs/013-read-property/data-model.md) — schema diagrams (polymorphic value union, seven-label type enum), two-call argv assembly tables, type-translation table (R6), response-parsing decision tree (R7), per-tool invariants, module LOC budget (≤80 handler).
- [contracts/read-property-input.contract.md](specs/013-read-property/contracts/read-property-input.contract.md) — public input contract: zod schema, emitted JSON Schema shape, per-mode field policy, `name` semantics + structural anti-injection guarantee.
- [contracts/read-property-handler.contract.md](specs/013-read-property/contracts/read-property-handler.contract.md) — handler invariants: deps shape, the TWO invokeCli call shapes, argv-mapping rules (no rename, `name` never forwarded), response-parsing for both calls (R7 short-circuit + JSON.parse + type lookup + R6 translation), failure propagation chain, test inventory.
- [quickstart.md](specs/013-read-property/quickstart.md) — 15 verification scenarios mapped to SC-001..SC-015 (S-1..S-11 in CI; S-12/S-13 manual against MCP Inspector / Claude Desktop; S-14 deliberate-revert sanity check; S-15 docs cross-reference).

Predecessor features:
- **012-delete-note**: [spec.md](specs/012-delete-note/spec.md), [plan.md](specs/012-delete-note/plan.md) — the third typed tool. THIS feature mirrors its module layout, `RegisterDeps` shape, no-active-mode-`superRefine` posture (parity), and locator-argv-direct-map (R11). **Departures**: TWO-CALL architecture (R3 — vs delete_note's single-call); polymorphic `value` union (vs delete_note's flat literal/string/boolean shape); R7 success-path short-circuit (vs delete_note's failure-only error envelope).
- **011-write-note**: [spec.md](specs/011-write-note/spec.md), [plan.md](specs/011-write-note/plan.md) — the second typed tool. THIS feature inherits the cli-adapter's 011-R5 unknown-vault response-inspection clause without modification. Mirrors the post-011 module layout (`index.ts` + factory pattern). Departure: no `superRefine` chain (parity with delete_note's R6; the `name` field has well-defined semantics in both modes).
- **010-flatten-target-mode**: [spec.md](specs/010-flatten-target-mode/spec.md), [plan.md](specs/010-flatten-target-mode/plan.md) — flattened `targetModeSchema` to a single z.object().strict().superRefine(...) and consolidated the drift detector. THIS feature consumes the post-010 Pattern (a) flat-extension idiom directly + the strict-mode `additionalProperties: false` posture; no further changes to target-mode primitive needed.
- **006-read-note**: [spec.md](specs/006-read-note/spec.md), [plan.md](specs/006-read-note/plan.md) — the first typed tool. THIS feature mirrors its no-discriminator output shape pattern (failures throw, never produce a `read: false` / `ok: false` shape).
- **005-help-tool**: [spec.md](specs/005-help-tool/spec.md), [plan.md](specs/005-help-tool/plan.md) — help tool, schema-stripping utility, registry-consistency test. THIS feature populates `docs/tools/read_property.md` (new file per FR-022); the existing registry-consistency test at [src/server.test.ts](src/server.test.ts) auto-asserts the file's existence once read_property is registered.
- **003-cli-adapter**: [spec.md](specs/003-cli-adapter/spec.md), [plan.md](specs/003-cli-adapter/plan.md) — `invokeCli` adapter. THIS feature routes through it for BOTH calls (R3); the 011-R5 unknown-vault response-inspection clause is inherited.
- **004-target-mode-schema**: [spec.md](specs/004-target-mode-schema/spec.md), [plan.md](specs/004-target-mode-schema/plan.md) — defined the target_mode primitive. THIS feature composes via post-010's `targetModeBaseSchema` + `applyTargetModeRefinement` exports.
- **008-refactor**, **007-fix-list-tools-schema**, **009-fix-inputschema-publication**, **002-detect-cli-errors**, **001-add-cli-bridge**: foundational; not touched.

References:
- [.specify/memory/constitution.md](.specify/memory/constitution.md) — All five principles satisfied (no Complexity Tracking entries needed). Principle I (per-surface module under `src/tools/read_property/`); Principle II (36 co-located tests); Principle III (zod is the single source of truth for both input AND output, types via z.infer, polymorphic value union; no hand-rolled types); Principle IV (zero new error codes; failures flow through VALIDATION_ERROR + adapter's four codes; 011-R5 inherited; R7 short-circuit is success-path branching not error); Principle V (Original-no-upstream headers on every new source file).
- [.decisions/ADR-003 - Enforce Target Mode in Typed Tools.md](.decisions/) — reaffirmed; read_property enforces target_mode via the post-010 primitive, no amendment.
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
