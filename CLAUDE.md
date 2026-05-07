<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
[specs/010-flatten-target-mode/plan.md](specs/010-flatten-target-mode/plan.md)

Active feature: **010-flatten-target-mode** — a `0.2.1 → 0.2.2`
structural simplification of the publication pipeline introduced
across features 007/008/009. `0.2.1` (feature 009) shipped a working
compatibility shim — ~140 LOC of envelope synthesis in
[src/tools/_shared.ts](src/tools/_shared.ts) (wrap branch, `oneOf`
rewrite, top-level `properties` union, `required` intersection,
Pattern (a) `allOf` walking, leaf widening with cross-branch string-
discriminator surfacing) plus a three-group drift detector at
[src/tools/_register.test.ts](src/tools/_register.test.ts) — to bridge
`targetModeSchema`'s `ZodEffects<ZodDiscriminatedUnion>` shape through
the zod → JSON Schema → MCP `inputSchema` pipeline. **THIS feature
deletes the bridge by changing the input shape**: `targetModeSchema`
is re-encoded as a flat `z.object({...}).strict().superRefine(...)`,
and `zodToJsonSchema` emits the natural single-flat-object descriptor
directly. Same per-mode rules. Same accepted/rejected inputs (modulo
the strict-mode carve-out below). NET ~400 LOC deletion.

**Encoding split** (clarification C7 + research R2). Three exports
survive in [src/target-mode/target-mode.ts](src/target-mode/target-mode.ts):
(a) `targetModeBaseSchema` — the bare `z.object({ target_mode, vault?,
file?, path? }).strict()` *before* `.superRefine`, exposed for
Pattern (a) consumers to extend; (b) `applyTargetModeRefinement<T
extends ZodObject>(s: T): ZodEffects<T>` — single dispatcher helper
attaching the per-mode rules (XOR `file`/`path`, vault required when
specific, locator-keys forbidden when active); (c) `targetModeSchema =
applyTargetModeRefinement(targetModeBaseSchema)` — the canonical
no-extension export. Six pre-010 exports DELETE per FR-017:
`targetModeSpecificBaseSchema`, `targetModeActiveBaseSchema`,
`targetModeSpecificSchema`, `targetModeActiveSchema`,
`applyTargetModeSpecificRefinement`, `applyTargetModeActiveRefinement`.

**Pattern (a) idiom** — `applyTargetModeRefinement(targetModeBaseSchema.extend({
<fields> }))`. NOT `.merge()` — research R2 verified empirically that
`.merge()` resets `unknownKeys` to `"strip"` (silently drops unknown
keys at parse time), while `.extend()` preserves the parent's
`.strict()` mode. Both calls produce identical JSON Schema descriptors,
but only `.extend()` honours the FR-002 strict-mode carve-out at runtime.

**Strict-mode carve-out (FR-002 / clarification C3)**. The post-010
`.strict()` mode produces a deliberate, narrow runtime-behaviour
change vs. `0.2.1`: unknown top-level keys produce `VALIDATION_ERROR`
with `code: "unrecognized_keys"`, `keys: ["<offending>"]`, `path: []`
at parse time, instead of being silently passed through `.passthrough()`.
For documented inputs (using only `target_mode`, `vault`, `file`,
`path`), behaviour is preserved exactly. The change is disclosed in
`CHANGELOG.md` per FR-012.

**Pattern (b) deletion (clarification C4 / FR-009 / FR-013)**. Pattern
(b) (fresh discriminated union with union-level `superRefine`) is
removed from the canonical reuse roster. Zero in-repo consumers.
The synthetic Pattern (b) fixture at
[_register.test.ts:436-472](src/tools/_register.test.ts#L436-L472)
deletes; the wrap branch in `_shared.ts` (whose only justification was
to handle Pattern (b)'s shape) deletes entirely. A future consumer
that genuinely needs a fresh discriminated union re-adds a narrower
wrap branch in its own feature.

**Drift detector consolidation (FR-008)**. The three-group structure
in [_register.test.ts](src/tools/_register.test.ts) collapses to one
group with two layers: (1) registry walk + per-tool invariants
(`it.each` over the live `tools/list` registry); (2) SDK round-trip
via `InMemoryTransport` (defence-in-depth against future SDK
behaviour changes). The Pattern (a) fixture is folded into Layer 1's
invariant table as a fourth row (`synthetic_pattern_a` —
`applyTargetModeRefinement(targetModeBaseSchema.extend({ note_text }))`).
Pattern (b) fixture deleted outright. Per-tool invariants pin
`additionalProperties: false` for `read_note` (vs. `true` in 009 —
the Cowork accommodation flips back). Target post-feature: ~270 LOC
(SC-008, down from 473).

**ADR-003 amendment (FR-013 / R7)**. Line 20's "discriminated union"
wording amends in place to "flat `z.object` with `superRefine`". The
rationale (force explicit intent on every call, validate at the
boundary, separate co-pilot from orchestrator context) preserved
verbatim. `updated:` frontmatter bumps to `2026-05-07`; an
"Amendment 2026-05-07" stanza appended at the bottom records why the
encoding changed. NO new ADR (clarification C5).

**Cross-cutting**: zero new error codes (FR-010); zero new ADRs
(SC-013); 008-refactor surface frozen outside of `target-mode.ts` and
`_shared.ts` (FR-016) — `dispatchCli`, `invokeCli`,
`invokeBoundedCli`, the in-flight registry, the four-priority error
classification, the always-on bounds, `assertToolDocsExist`, and the
`obsidian_exec` argv-assembly contract are all frozen.
`obsidian_exec`'s published `inputSchema` is byte-stable from `0.2.0`
(FR-007). `help`'s schema is byte-stable. `read_note`'s
[handler.ts:21-27](src/tools/read_note/handler.ts#L21-L27) gains
`input.vault!` non-null assertion + single-line comment naming the
`superRefine` runtime invariant (clarification C1).

**Compatibility / release** — `read_note`'s wire descriptor flips
from `0.2.1`'s `{ type, oneOf, properties: {<unioned>}, required,
additionalProperties: true, $schema }` to `0.2.2`'s flat `{ type,
properties: {<typed>}, required, additionalProperties: false,
$schema }`. Both strict-rich (Claude Desktop, MCP Inspector) and
strict-naive (Cowork) clients accept the new shape — `additionalProperties:
false` is strictly more conservative than `true`; any client that
accepted the latter accepts the former. Version bumps `0.2.1 → 0.2.2`
(patch; clarification C6 — `TargetMode` is not publicly re-exported
from `src/index.ts`, so the type flatten is internal-only). The
strict-mode behaviour change is the only user-visible delta and is
documented in `CHANGELOG.md` per FR-012.

See also:
- [spec.md](specs/010-flatten-target-mode/spec.md) — feature spec + 7 resolved clarifications (C1–C7)
- [research.md](specs/010-flatten-target-mode/research.md) — Phase 0 decisions R1–R10 (R1 zodToJsonSchema emit verified; R2 `.extend()` over `.merge()` for strict-preservation; R3 helper signature; R4 `unrecognized_keys` issue shape; R5 drift-detector consolidation; R6 test migration map; R7 ADR-003 amendment text; R8 CHANGELOG entry; R9 coverage threshold ratchet; R10 don't amend historical specs)
- [data-model.md](specs/010-flatten-target-mode/data-model.md) — pre-010 → post-010 export inventory diff, flat schema shape, JSON Schema emit shape, per-tool invariants, test-case migration map
- [contracts/flat-target-mode.contract.md](specs/010-flatten-target-mode/contracts/flat-target-mode.contract.md) — public export contract for `targetModeBaseSchema` / `applyTargetModeRefinement` / `targetModeSchema` (SUPERSEDES feature 004's contract)
- [contracts/drift-detector.contract.md](specs/010-flatten-target-mode/contracts/drift-detector.contract.md) — post-010 consolidated drift-detector contract (SUPERSEDES feature 009's contract)
- [quickstart.md](specs/010-flatten-target-mode/quickstart.md) — 13 verification scenarios mapped to SC-001..SC-013 (S-1..S-10 in CI; S-11/S-12 manual against Cowork + Claude Desktop; S-13 deliberate-revert sanity check)

Predecessor features:
- **009-fix-inputschema-publication**: [spec.md](specs/009-fix-inputschema-publication/spec.md), [plan.md](specs/009-fix-inputschema-publication/plan.md) — shipped the working compatibility shim THIS feature replaces. The widened envelope helper, the three-group drift detector, and the `additionalProperties: true` accommodation all delete; `read_note` continues to work end-to-end through every observed client class (S-11 / S-12).
- **008-refactor**: [spec.md](specs/008-refactor/spec.md), [plan.md](specs/008-refactor/plan.md) — introduced `registerTool` and the registry pipeline. THIS feature's `_shared.ts` shrink + flat schema work alongside `registerTool`'s existing `zodToJsonSchema` call site (one-line edit if the helper is inlined).
- **007-fix-list-tools-schema**: [spec.md](specs/007-fix-list-tools-schema/spec.md), [plan.md](specs/007-fix-list-tools-schema/plan.md) — introduced `toMcpInputSchema` and the wrap branch. THIS feature retires the wrap branch entirely.
- **006-read-note**: [spec.md](specs/006-read-note/spec.md), [plan.md](specs/006-read-note/plan.md) — the typed `read_note` tool. Wire behaviour preserved (modulo the strict-mode carve-out for documented inputs); error roster and parameter contract unchanged.
- **004-target-mode-schema**: [spec.md](specs/004-target-mode-schema/spec.md), [plan.md](specs/004-target-mode-schema/plan.md) — defined the discriminated-union encoding and the Pattern (a)/(b) reuse framework. Encoding flattens (FR-001); reuse framework loses Pattern (b) (FR-013); Pattern (a) survives as the flat extension idiom. Historical specs/contracts NOT amended (R10).
- **003-cli-adapter**, **002-detect-cli-errors**, **001-add-cli-bridge**: foundational; not touched.

References:
- [.specify/memory/constitution.md](.specify/memory/constitution.md) — Principle III (zod is the single source of truth) reaffirmed with a TRIVIAL derivation (one `zodToJsonSchema` call, no envelope synthesis layer). Principle II (co-located tests) reaffirmed. Principle I (downward flow) preserved.
- [.decisions/ADR-003 - Enforce Target Mode in Typed Tools.md](.decisions/) — line-20 wording amends in place; rationale preserved. THIS feature is the only post-ratification amendment (R7).
- [.decisions/ADR-006 - Centralized Tool Registration.md](.decisions/) — `registerTool` factory reaffirmed; structural change only.
- [.decisions/ADR-005 - Token-Optimized Tool Definitions.md](.decisions/) — `stripSchemaDescriptions` runs unchanged downstream of the trivial `zodToJsonSchema` call.
- [.architecture/Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md) — the architecture this simplification reaffirms.
<!-- SPECKIT END -->

## Architecture & Decision References

Two reference folders document the project's design rationale. Consult them **before** proposing or making design decisions, and cite the relevant ADR/architecture section when justifying choices:

- [.architecture/](.architecture/) — high-level architecture notes describing the system's structure, module boundaries, and design principles. Start with [Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md).
- [.decisions/](.decisions/) — Architecture Decision Records (ADRs). [Decision Log.md](.decisions/Decision%20Log.md) is the index; each ADR-NNN file contains the full decision text.

When a design choice conflicts with an existing ADR, surface the conflict to the user rather than silently overriding it — superseding an ADR is a deliberate act that should produce a new ADR, not an undocumented drift.
