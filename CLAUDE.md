<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
[specs/011-write-note/plan.md](specs/011-write-note/plan.md)

Active feature: **011-write-note** — adds `write_note`, the second
typed-tool wrap on top of the foundation completed by features 003–010.
Symmetric counterpart of [006-read-note](specs/006-read-note/spec.md):
where `read_note` retired `obsidian_exec` for reads, `write_note`
retires it for create/overwrite operations. Direct one-to-one wrap of
the Obsidian CLI's `create` subcommand. The user-facing tool surface:
`write_note({ target_mode, vault?, file? | path?, content, template?,
overwrite?, open? })` returning `{ created: boolean, path: string }`.
`obsidian_exec` remains as the freeform escape hatch for the `newtab`
flag and unwrapped subcommands.

**Schema** (post-010 Pattern (a) flat-extension idiom + three
write_note-specific active-mode `superRefine` clauses per
Clarifications 2026-05-08):
`applyTargetModeRefinement(targetModeBaseSchema.extend({ content,
template, overwrite, open })).superRefine(<active-mode rules>)`.
The active-mode rules: (i) `overwrite: true` REQUIRED (the
safety-default rule applies uniformly across both modes; active mode
is destructive by definition, so the explicit-opt-in posture binds);
(ii) `template` FORBIDDEN (templates apply at creation; active-mode
rewrites the content of a note that already exists); (iii) `open`
FORBIDDEN (focused = already open). Asymmetry vs. `overwrite`'s
field declaration: per research R6, the `open` field is declared
`z.boolean().optional()` WITHOUT `.default(false)` so the
`superRefine` can distinguish "key absent" (specific-mode acceptable)
from "key present" (active-mode rejected); the handler reads
`parsed.open ?? false`. The `overwrite` field keeps its
`.default(false)` because the active-mode rule is "must be exactly
true" — `false` (the default) fails that check naturally.

**Live-CLI surface** (verified during plan via `obsidian help create`):
- argv: `name=<name>` (NOT `file=<name>` like `read`), `path=<path>`,
  `content=<text>`, `template=<name>`; flag form (no `=true`) for
  `overwrite`, `open`, `newtab`. Per research R3, the user-facing
  schema field stays `file` (parity with `read_note`); the handler
  maps `file` → `name=<value>` for the create subcommand at argv
  assembly.
- success response (R4 provisional): `Created: <path>` on stdout;
  `created: true`/`false` derivation locks against this prefix.
  Overwrite-success wording (R4 residual) captured at T0.
- unknown-vault response (R5): `Vault not found.` on stdout —
  structured enough for adapter-layer response-inspection. R5 ratified;
  inspection clause added to cli-adapter (NOT to write_note) so all
  typed tools benefit.

**Logger surface (R1 — spec FR-009 reconciliation)**: the spec's
FR-009 mandated handler-emitted `logger.callStart` /
`logger.callEndSuccess` / `logger.callEndFailure` events "in parity
with read_note". Live verification: read_note's actual handler does
NOT emit those events; the `Logger` interface at
[src/logger.ts](src/logger.ts) does NOT define those methods. Per
"spec follows the code that exists" (CLAUDE.md / 006-read-note
background), `write_note` mirrors the actual sibling implementation:
thin `invokeCli` wrapper, no per-call logger events fire from the
tool layer. The cli-adapter's existing `dispatchTimeout` /
`dispatchCap` / `dispatchKill` events preserve observability
end-to-end. Spec FR-009 superseded by research R1; spec.md NOT
amended per R10 (don't amend predecessor specs).

**Module layout** (per research, verified against sibling read_note):
`src/tools/write_note/{schema,handler,index}.ts` (NOT `tool.ts`);
factory `createWriteNoteTool(deps)` (NOT `registerWriteNoteTool`);
all three new source files carry the `// Original — no upstream.`
header per Constitution V. Tests co-located:
`src/tools/write_note/{schema,handler,index}.test.ts` — 32 cases
total (15 schema / 12 handler / 5 registration per FR-016).

**Cross-cutting**: zero new error codes (FR-018 + Constitution IV);
zero new ADRs; 008-refactor surface frozen — `dispatchCli`,
`invokeCli`, `invokeBoundedCli`, `assertToolDocsExist`,
`obsidian_exec` argv contract all preserved. `read_note` and
`obsidian_exec` byte-stable (SC-009; only `src/server.ts` registration
list grows by one entry). The post-010 consolidated drift detector
at [src/tools/_register.test.ts](src/tools/_register.test.ts)
auto-covers `write_note` via its `it.each` registry walk — no
test-file modifications required.

**FR-019 plan-stage characterisation**: 8 live-CLI cases captured.
Cases (i), (ii), (v) verified during plan (`Created: <path>` for
fresh creations; `Vault not found.` for unknown-vault) — see
[research.md](specs/011-write-note/research.md). Cases (iii) overwrite
signal, (iv) overwrite=false-on-existing, (vi) non-existent template,
(vii) PATH-TRAVERSAL (gates SC-012 — silent vault-escape blocks
ship), (viii) active-mode focused-path return are deferred to T0
(runs at start of /speckit-implement against a user-authorised
scratch subdir; results appended to research.md). The handler's
response-parsing logic locks against captured wording.

**Compatibility / release**: this BI is additive — no existing tool
changes, no error codes added, no ADRs amended. Public surface gains
one new typed tool. Version bump `0.2.3 → 0.2.4` (patch — purely
additive surface; type system unchanged from external view per the
post-010 internal-only `TargetMode` precedent). The new strict-mode
posture (active mode requires overwrite=true; active mode forbids
template/open) is disclosed in `CHANGELOG.md` per the project's
release convention.

See also:
- [spec.md](specs/011-write-note/spec.md) — feature spec + 3 resolved clarifications (C1–C3, Session 2026-05-08)
- [research.md](specs/011-write-note/research.md) — Phase 0 decisions R1–R10 + 8 FR-019 cases (R1 logger surface reconciliation; R2 argv flag form vs key=value verified; R3 file → name argv rename; R4 created true/false signal — `Created: <path>` provisional, T0 verifies; R5 unknown-vault response-inspection ratified; R6 active-mode superRefine packaging + open-field asymmetry; R7 test seams; R8 import.meta.url path resolution; R9 coverage preservation; R10 don't amend historical specs)
- [data-model.md](specs/011-write-note/data-model.md) — input/output schema diagrams, the three new active-mode superRefine clauses with issue shapes, the user-field → CLI-argv mapping table, response-parsing decision tree, per-tool invariants, module layout LOC budget
- [contracts/write-note-input.contract.md](specs/011-write-note/contracts/write-note-input.contract.md) — public input contract: zod schema, emitted JSON Schema shape, per-mode field policy, failure-mode roster
- [contracts/write-note-handler.contract.md](specs/011-write-note/contracts/write-note-handler.contract.md) — handler invariants: deps shape, invokeCli call shape, argv-mapping rules, success-response parsing, failure propagation chain
- [quickstart.md](specs/011-write-note/quickstart.md) — 13 verification scenarios mapped to SC-001..SC-013 (S-1..S-10 in CI; S-11/S-12 manual against Claude Desktop + Cowork; S-13 deliberate-revert sanity check)

Predecessor features:
- **010-flatten-target-mode**: [spec.md](specs/010-flatten-target-mode/spec.md), [plan.md](specs/010-flatten-target-mode/plan.md) — flattened `targetModeSchema` to a single z.object().strict().superRefine(...) and consolidated the drift detector. THIS feature consumes the post-010 Pattern (a) flat-extension idiom directly + the strict-mode `additionalProperties: false` posture; no further changes to target-mode primitive needed.
- **006-read-note**: [spec.md](specs/006-read-note/spec.md), [plan.md](specs/006-read-note/plan.md) — the first typed tool. THIS feature mirrors its module layout, RegisterDeps shape, and handler-thinness ceiling. Per R1, the actual read_note handler does NOT emit per-call logger events (despite the spec's FR-017 wording); write_note matches the actual shape.
- **005-help-tool**: [spec.md](specs/005-help-tool/spec.md), [plan.md](specs/005-help-tool/plan.md) — help tool, schema-stripping utility, registry-consistency test. THIS feature populates `docs/tools/write_note.md` (new file per FR-014); the existing registry-consistency test at [src/server.test.ts](src/server.test.ts) auto-asserts the file's existence once write_note is registered.
- **003-cli-adapter**: [spec.md](specs/003-cli-adapter/spec.md), [plan.md](specs/003-cli-adapter/spec.md) — `invokeCli` adapter. THIS feature routes through it; R5 adds an unknown-vault response-inspection clause (additive — does NOT break existing callers).
- **004-target-mode-schema**: [spec.md](specs/004-target-mode-schema/spec.md), [plan.md](specs/004-target-mode-schema/plan.md) — defined the target_mode primitive. THIS feature composes via post-010's `targetModeBaseSchema` + `applyTargetModeRefinement` exports.
- **008-refactor**, **007-fix-list-tools-schema**, **009-fix-inputschema-publication**, **002-detect-cli-errors**, **001-add-cli-bridge**: foundational; not touched.

References:
- [.specify/memory/constitution.md](.specify/memory/constitution.md) — All five principles satisfied (no Complexity Tracking entries needed). Principle I (per-surface module under `src/tools/write_note/`); Principle II (32 co-located tests); Principle III (zod is the single source of truth for both input AND output, types via z.infer, no hand-rolled types); Principle IV (zero new error codes; failures flow through VALIDATION_ERROR + adapter's four codes); Principle V (Original-no-upstream headers on every new source file).
- [.decisions/ADR-003 - Enforce Target Mode in Typed Tools.md](.decisions/) — reaffirmed; write_note enforces target_mode via the post-010 primitive, no amendment.
- [.decisions/ADR-005 - Token-Optimized Tool Definitions.md](.decisions/) — reaffirmed; `stripSchemaDescriptions` applied at registration via `registerTool` (auto).
- [.decisions/ADR-006 - Centralized Tool Registration.md](.decisions/) — reaffirmed; `registerTool` factory wraps schema parse + UpstreamError propagation + JSON serialisation.
- [.architecture/Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md) — the architecture this BI continues to implement.
<!-- SPECKIT END -->

## Architecture & Decision References

Two reference folders document the project's design rationale. Consult them **before** proposing or making design decisions, and cite the relevant ADR/architecture section when justifying choices:

- [.architecture/](.architecture/) — high-level architecture notes describing the system's structure, module boundaries, and design principles. Start with [Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md).
- [.decisions/](.decisions/) — Architecture Decision Records (ADRs). [Decision Log.md](.decisions/Decision%20Log.md) is the index; each ADR-NNN file contains the full decision text.

When a design choice conflicts with an existing ADR, surface the conflict to the user rather than silently overriding it — superseding an ADR is a deliberate act that should produce a new ADR, not an undocumented drift.
