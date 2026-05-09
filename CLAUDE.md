<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
[specs/012-delete-note/plan.md](specs/012-delete-note/plan.md)

Active feature: **012-delete-note** — adds `delete_note`, the third
typed-tool wrap on top of the foundation completed by features 003–010,
and the second since [011-write-note](specs/011-write-note/spec.md)
closed the create/overwrite leg of the typed-write surface. Where
`read_note` retired `obsidian_exec` for reads and `write_note` retired
it for create/overwrite, `delete_note` retires it for destructive
single-file removal. Direct one-to-one wrap of the Obsidian CLI's
`delete` subcommand. The user-facing tool surface:
`delete_note({ target_mode, vault?, file? | path?, permanent? })`
returning `{ deleted: true, path: string, toTrash: boolean }`.
`obsidian_exec` remains as the freeform escape hatch for unwrapped
subcommands (the create subcommand's `newtab` flag in particular).

**Schema** (post-010 Pattern (a) flat-extension idiom; NO active-mode
`superRefine` clauses — departure from `write_note`):
`applyTargetModeRefinement(targetModeBaseSchema.extend({ permanent:
z.boolean().optional().default(false) }))`. The schema reduces to the
target-mode primitive's existing rules (vault required in specific,
locator XOR, vault/file/path forbidden in active, top-level
`additionalProperties: false`) plus the single `permanent` field with
default false. No tool-specific active-mode refinement because
`permanent` has well-defined semantics in BOTH modes: irreversibility
applies regardless of how the locator is resolved. User input [P1]
AC #9 explicitly permits active+permanent.

**Output shape**: `z.object({ deleted: z.literal(true), path:
z.string(), toTrash: z.boolean() }).strict()`. The `deleted` field is
a `z.literal(true)` because every successful return path produces
`deleted: true` — failures throw `UpstreamError`, never produce a
`deleted: false` shape (mirrors `read_note`'s no-discriminator
response). `toTrash` is **derived structurally** from the call's input:
`toTrash = !parsed.permanent`. Computed in the handler after a
successful adapter call; NOT parsed from the CLI's response wording.
The typed surface owns the safety-default contract per spec SC-014's
audit invariant.

**Live-CLI surface** (verified during plan via `obsidian help`):
- subcommand: `delete` (not `trash`, not `rm`).
- argv: `file=<name>` and `path=<path>` — the locator argv keys MATCH
  the user-facing schema field names directly. **No rename needed**
  (departure from `write_note`'s PSR-5: that rename was create-specific
  because `create` uses `name=` for the wikilink locator; `delete` and
  `read` both use `file=`). Plus the bare-word `permanent` flag form
  (no `=true`).
- safety default: the CLI's default is to-trash; the `permanent` flag
  is the opt-in to skip trash. Matches the typed surface's exposed
  contract verbatim — no inversion needed.
- unknown-vault response (R5 inheritance): `Vault not found.` on stdout
  — byte-identical to the create subcommand's response. The cli-adapter's
  existing 011-R5 / T002 inspection clause re-classifies this to
  `CLI_REPORTED_ERROR` regardless of subcommand; `delete_note` inherits
  without modification. FR-019 case (v) verified during plan stage.
- success response (R4): hypothesised regex `/^(Trashed|Deleted):
  (.+?)\s*$/m` — locked at T0 against a user-authorised scratch vault
  subdirectory. The first capture group is for diagnostic / future-
  extension purposes; `toTrash` is structural, not regex-derived.

**Logger surface (R1 — spec FR-009 reconciliation)**: same outcome as
[011-write-note PSR-1](specs/011-write-note/research.md). Thin handler;
no per-call `logger.callStart` / `callEndSuccess` / `callEndFailure`
events at the tool layer. The cli-adapter's `dispatchTimeout` /
`dispatchCap` / `dispatchKill` events preserve observability end-to-end.
Spec FR-009 superseded by research R1; spec.md NOT amended per R10
(don't amend predecessor specs).

**Module layout**: `src/tools/delete_note/{schema,handler,index}.ts`
(post-011 convention — `index.ts` not `tool.ts`); factory
`createDeleteNoteTool(deps)`; all three new source files carry the
`// Original — no upstream.` header per Constitution V. Tests co-located:
`src/tools/delete_note/{schema,handler,index}.test.ts` — 30 cases
total (13 schema / 12 handler / 5 registration per FR-016). Lower than
write_note's 32 because no superRefine clauses (one fewer field family,
fewer schema cases).

**Cross-cutting**: zero new error codes (FR-018 + Constitution IV);
zero new ADRs; 008-refactor surface frozen — `dispatchCli`,
`invokeCli`, `invokeBoundedCli`, `assertToolDocsExist`,
`obsidian_exec` argv contract, AND the 011-R5 cli-adapter
unknown-vault response-inspection clause all preserved. `read_note` /
`write_note` / `obsidian_exec` byte-stable (SC-009; only
`src/server.ts` registration list grows by one entry). The post-010
consolidated drift detector at
[src/tools/_register.test.ts](src/tools/_register.test.ts) auto-covers
`delete_note` via its `it.each` registry walk — no test-file
modifications required.

**FR-019 plan-stage characterisation**: 9 live-CLI cases. Cases (v)
unknown vault (`Vault not found.` byte-identical to create) and (ix)
subcommand discovery + argv shape verified during plan — see
[research.md](specs/012-delete-note/research.md). Cases (i)–(iv), (vi),
(vii), (viii) require destructive probes against a user-authorised
scratch vault subdir and are deferred to T0 of `/speckit-implement`.
**Two cases gate ship**: (vii) PATH-TRAVERSAL (SC-012 — silent
vault-escape on a destructive operation blocks ship); (viii)
TRASH-VOLUME-FULL silent fall-back (SC-013 — silent fall-back from
to-trash to permanent without caller opt-in is a safety violation).

**Audit-trail invariant** (SC-014): every successful response carries
`toTrash === !parsedInput.permanent`. Operators auditing logs filter
on `toTrash === false` to surface every irreversible deletion. The
typed `permanent` flag IS the audit point per the user input's
SECURITY adversarial bullet.

**Compatibility / release**: this BI is additive — no existing tool
changes, no error codes added, no ADRs amended. Public surface gains
one new typed tool. Version bump `0.2.4 → 0.2.5` (patch — purely
additive surface; type system unchanged from external view). The new
typed surface for delete operations is disclosed in `CHANGELOG.md`
per the project's release convention; the irreversibility warning for
`permanent: true` is highlighted in both the changelog entry and the
new `docs/tools/delete_note.md`.

See also:
- [spec.md](specs/012-delete-note/spec.md) — feature spec; no clarifications session needed (user input was exhaustive across [P1] + [P2] + [P3] + 6 adversarial categories)
- [research.md](specs/012-delete-note/research.md) — Phase 0 decisions R1–R10 + 9 FR-019 cases (R1 logger surface reconciliation; R2 `permanent` flag form verified; R3 NO file→name rename — `delete` matches schema fields directly; R4 `deleted: literal(true)` + structural `toTrash` + T0-locked path regex; R5 unknown-vault inspection inherited from 011 verbatim; R6 NO active-mode superRefine — `permanent` permitted in both modes; R7 test seams; R8 import.meta.url path resolution; R9 coverage preservation; R10 don't amend historical specs)
- [data-model.md](specs/012-delete-note/data-model.md) — input/output schema diagrams (no superRefine), argv-mapping table (no rename), audit invariant, per-tool invariants, module LOC budget (≤50 handler vs write_note's ≤70)
- [contracts/delete-note-input.contract.md](specs/012-delete-note/contracts/delete-note-input.contract.md) — public input contract: zod schema, emitted JSON Schema shape, per-mode field policy, failure-mode roster
- [contracts/delete-note-handler.contract.md](specs/012-delete-note/contracts/delete-note-handler.contract.md) — handler invariants: deps shape, invokeCli call shape, argv-mapping rules (no rename), structural toTrash, audit invariant test scaffold, failure propagation chain
- [quickstart.md](specs/012-delete-note/quickstart.md) — 15 verification scenarios mapped to SC-001..SC-015 (S-1..S-10 + S-14 in CI; S-11/S-12 manual against Claude Desktop + Cowork; S-13 deliberate-revert sanity check; S-15 docs cross-reference)

Predecessor features:
- **011-write-note**: [spec.md](specs/011-write-note/spec.md), [plan.md](specs/011-write-note/plan.md) — the second typed tool. THIS feature mirrors its module layout (post-011 `index.ts` + `createDeleteNoteTool` convention), `RegisterDeps` shape, and handler-thinness ceiling (lower at ≤50 because simpler shape). Inherits the cli-adapter's 011-R5 unknown-vault response-inspection clause without modification. **Departures**: no active-mode `superRefine` clauses (R6 — `permanent` permitted in both modes); no locator argv-key rename (R3 — `delete` uses `file=` directly, unlike `create`'s `name=`).
- **010-flatten-target-mode**: [spec.md](specs/010-flatten-target-mode/spec.md), [plan.md](specs/010-flatten-target-mode/plan.md) — flattened `targetModeSchema` to a single z.object().strict().superRefine(...) and consolidated the drift detector. THIS feature consumes the post-010 Pattern (a) flat-extension idiom directly + the strict-mode `additionalProperties: false` posture; no further changes to target-mode primitive needed.
- **006-read-note**: [spec.md](specs/006-read-note/spec.md), [plan.md](specs/006-read-note/plan.md) — the first typed tool. THIS feature mirrors its module layout, RegisterDeps shape, and (per R1) the actual no-per-call-logger-events shape. Also mirrors `read_note`'s no-discriminator output shape (R4 — `deleted: z.literal(true)` parallels `read_note`'s no-`read: false` posture).
- **005-help-tool**: [spec.md](specs/005-help-tool/spec.md), [plan.md](specs/005-help-tool/plan.md) — help tool, schema-stripping utility, registry-consistency test. THIS feature populates `docs/tools/delete_note.md` (new file per FR-014); the existing registry-consistency test at [src/server.test.ts](src/server.test.ts) auto-asserts the file's existence once delete_note is registered.
- **003-cli-adapter**: [spec.md](specs/003-cli-adapter/spec.md), [plan.md](specs/003-cli-adapter/plan.md) — `invokeCli` adapter. THIS feature routes through it; the 011-R5 unknown-vault response-inspection clause is inherited (no further adapter changes).
- **004-target-mode-schema**: [spec.md](specs/004-target-mode-schema/spec.md), [plan.md](specs/004-target-mode-schema/plan.md) — defined the target_mode primitive. THIS feature composes via post-010's `targetModeBaseSchema` + `applyTargetModeRefinement` exports.
- **008-refactor**, **007-fix-list-tools-schema**, **009-fix-inputschema-publication**, **002-detect-cli-errors**, **001-add-cli-bridge**: foundational; not touched.

References:
- [.specify/memory/constitution.md](.specify/memory/constitution.md) — All five principles satisfied (no Complexity Tracking entries needed). Principle I (per-surface module under `src/tools/delete_note/`); Principle II (30 co-located tests); Principle III (zod is the single source of truth for both input AND output, types via z.infer, `deleted: z.literal(true)` for the success-only return shape, no hand-rolled types); Principle IV (zero new error codes; failures flow through VALIDATION_ERROR + adapter's four codes; 011-R5 inherited); Principle V (Original-no-upstream headers on every new source file).
- [.decisions/ADR-003 - Enforce Target Mode in Typed Tools.md](.decisions/) — reaffirmed; delete_note enforces target_mode via the post-010 primitive, no amendment.
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
