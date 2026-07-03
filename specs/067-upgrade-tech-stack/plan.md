# Implementation Plan: Tech Stack Upgrade

**Branch**: `067-upgrade-tech-stack` | **Date**: 2026-07-04 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/067-upgrade-tech-stack/spec.md`

## Summary

Bring the toolchain current in five ordered, independently releasable increments —
dependency/security baseline, TypeScript 6.0, ESLint 10, zod 4 (full modernization),
CI runtime — while keeping the published MCP surface byte-stable: the committed
registry fingerprint baseline must pass **unregenerated** after the zod migration, and
all custom validation messages and ADR-015 machine codes must survive verbatim. Every
load-bearing compatibility and parity claim in this plan is empirically proven (two
adversarially verified research passes on 2026-07-04, including a live dump of all 34
tool descriptors and 22-fixture byte-parity probes); see [research.md](research.md).

Two clarify-session premises were corrected by plan-time probes and are amended in the
spec's Clarifications section: (Q1) today's descriptors already embed the draft-07
`$schema` key, so parity is achieved via `z.toJSONSchema(…, { target: "draft-7" })` +
a 4-rule normalizer — not by stripping the key; (Q2) `.strict()`/`.superRefine()` are
not actually deprecated in zod 4.4.3 — the sweep migrates all genuinely deprecated
forms, converts `.strict()` → `z.strictObject()` as the chosen modernization posture,
and keeps `.superRefine()` (it is the v4-canonical form; `.check()` is worse).

## Technical Context

**Language/Version**: TypeScript 5.9.3 → **~6.0.3** (tilde pin — typescript-eslint
8.62.1 caps `<6.1.0`); ESM, module/moduleResolution NodeNext, target ES2024, strict,
verbatimModuleSyntax; new: `"types": ["node"]` (TS 6.0 defaults `types` to `[]`)
**Primary Dependencies**: @modelcontextprotocol/sdk ^1.0.4 → **^1.29.0** (installed
1.29.0 = npm latest; zod peer `^3.25 || ^4.0`); zod ^3.23.8 → **^4.4.3**;
zod-to-json-schema **removed** (deprecated upstream; replaced by built-in
`z.toJSONSchema`)
**Lint/Format**: eslint 9.39.4 → **10.6.0** (flat config already); typescript-eslint →
**8.62.1**; eslint-plugin-import → **eslint-plugin-import-x 4.17.1** (sole ESLint-10
blocker replaced); eslint-plugin-n → **18.2.1**; prettier pinned **3.8.5 exact**
(3.9-line hold, open upstream regression #19510); legacy
@typescript-eslint/eslint-plugin+parser devDeps removed (unused by config)
**Storage**: N/A (no persistence changes; the committed descriptor fingerprint baseline
`src/tools/_register-baseline.json` is the parity gate and is NOT regenerated)
**Testing**: vitest + @vitest/coverage-v8 4.1.5 → **4.1.9 in lockstep** (coverage-v8
peer-pins vitest exactly); Windows-reliable invocation for verification runs:
`mkdir -p coverage/.tmp && npx vitest run --coverage --pool=forks --no-file-parallelism`
**Target Platform**: Node.js ≥22.11 (engines unchanged — constitution amendment
trigger deliberately avoided); dev-toolchain minimum Node ≥22.13 (eslint 10 /
plugin-n 18 engines) documented as dev-only; CI matrix Node [22, 24]
**Project Type**: single-package npm CLI / MCP stdio server
**Performance Goals**: N/A (no runtime perf surface; lint gains ~one type-check from
the first type-aware rule — accepted, R4)
**Constraints**: published tool descriptors byte-identical (fingerprint baseline
unregenerated); validation envelope `{path, message, code}` unchanged; zero new
top-level error codes; custom messages + ADR-015 `params` machine codes verbatim;
accepted drift: default-locale message text on fields without custom errors
**Scale/Scope**: 5 increments; zod sweep touches ~43 schema files + 2 shared
chokepoints; ~45 `ZodIssueCode` sites; 115 `.strict()` conversions; 4 error-callback
migrations; 1 normalizer (~30 lines + tests); 3 config files (tsconfig, eslint.config,
ci.yml)

## Constitution Check

*GATE: evaluated pre-Phase-0 and re-evaluated post-Phase-1 design — PASS, no
violations, no Complexity Tracking entries needed.*

| Gate | Status | Evidence |
|---|---|---|
| Principle I (Modular Code Organization) | **Y** | No new modules; normalizer lives in `src/tools/_shared.ts` beside `toMcpInputSchema` (same surface); import direction unchanged (tool → shared → external SDK). No upward/cyclic deps introduced. |
| Principle II (Public Surface Test Coverage) | **Y** | Descriptor pipeline change ships with normalizer unit tests (4 rules × happy + boundary) in `_shared.test.ts`; the 4 error-callback fields get message-asserting tests (silent-ignore hazard, R3); existing FR-018 fingerprint baseline test is the registry-wide gate; `customIssueParams` tests re-exercise machine codes. All 34 tool surfaces re-verified by the existing co-located suites. |
| Principle III (Boundary Input Validation with Zod) | **Y** | zod remains the sole boundary validator; schemas stay the single source of truth for published shape (now via built-in `z.toJSONSchema` + normalizer) and runtime parse; `z.infer` flow unchanged (proven under `z.ZodType` constraint). Constitution names `zod-to-json-schema` as exemplar with "or equivalent" — swap is compliant as-is; PATCH wording amendment queued post-BI (separate PR, prompt already prepared). |
| Principle IV (Explicit Upstream Error Propagation) | **Y** | `UpstreamError` untouched (graph-verified below); zero new top-level codes; VALIDATION_ERROR envelope mapping in `_register.ts` preserves `{path, message, code}` per issue (probe-proven under v4). |
| Principle V (Attribution & Layered Composition) | **Y** | `_shared.ts` header updated when the zodToJsonSchema delegate is replaced (module stays `Original — no upstream`; README Attributions has no zod-to-json-schema entry — grep-verified, no README edit needed). No new borrowed code. |
| ADR-010 (Typed Tool Names Mirror CLI Subcommand) | **N/A** | No tool added or renamed. |
| ADR-013 (Plugin-Namespace Tool Naming) | **N/A** | No plugin-backed tool added. |
| ADR-014 (Plugin-Backed Runtime-Dependency Pattern) | **N/A** | No plugin-backed tool added. |
| ADR-015 (Sub-Discriminators via details.reason) | **N/A** | No new `(top-level-code, details.code)` pair, no new sub-states; existing `params` machine codes preserved verbatim (probe-proven). |

**Technical Standards conformance**: TS strict + `tsc --noEmit` clean (US2 gate); zod
sole validation library (unchanged); SDK `Server` API registration (unchanged); vitest
+ coverage-v8, statements threshold untouched (no thresholds keys added); eslint flat
config zero warnings (US3 gate); prettier formatter of record (held at 3.8.5); runtime
floor `>=22.11` unchanged — the constitution's Node-floor amendment trigger is
deliberately not pulled.

## Project Structure

### Documentation (this feature)

```text
specs/067-upgrade-tech-stack/
├── plan.md              # This file
├── research.md          # Phase 0 — pins, parity proofs, API mapping, gates (R1–R9)
├── data-model.md        # Phase 1 — descriptor pipeline + envelope invariants
├── quickstart.md        # Phase 1 — per-increment verification commands
├── contracts/
│   ├── descriptor-parity.contract.md   # normalizer rules + baseline gate semantics
│   └── zod4-api-mapping.contract.md    # old-form → v4-form table + test obligations
├── checklists/requirements.md
├── evidence-pre-upgrade.md  # created by T001 — frozen pre-upgrade audit + deps snapshot
├── post-implement.md        # created by T047 — structural verification results
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
package.json                     # US1/US2/US3/US4 pin changes (R1 table)
package-lock.json                # US1 audit-fix refresh (only artifact of FR-001)
tsconfig.json                    # US2: + "types": ["node"]
eslint.config.js                 # US3: import-x swap; US4: SC-009 gate rules (R4)
.github/workflows/ci.yml         # US5: checkout@v7, setup-node@v6, matrix [22, 24]
src/tools/_shared.ts             # US4: toMcpInputSchema → z.toJSONSchema + normalizer
src/tools/_shared.test.ts        # US4: normalizer rule tests
src/tools/_register.ts           # US4: ZodTypeAny→z.ZodType, ZodIssue→z.core.$ZodIssue
src/tools/*/schema.ts (~43)      # US4: sweep per R3 mapping table
src/tools/create_base/schema.ts  # US4: error callbacks (4 fields total w/ query_base)
src/tools/query_base/schema.ts   # US4: error callbacks + message-assert tests
src/tools/read_property/schema.ts# US4: two-arg z.record
src/tools/outline/schema.ts      # US4: .passthrough() → .loose()
src/tools/properties/schema.ts   # US4: .passthrough() → .loose()
src/help/strip-schema.ts         # US4: consumes registerTool descriptors (blast radius)
src/help/strip-schema.test.ts    # US4: zodToJsonSchema fixtures → z.toJSONSchema
src/tools/_register-baseline.json# NOT touched — the gate that must pass unregenerated
CONTRIBUTING.md / README.md      # US3: dev-toolchain Node ≥22.13 note (FR-013)
```

**Structure Decision**: existing single-package layout; no files move. The one design
seam is `toMcpInputSchema` in `src/tools/_shared.ts` — graph-verified single conversion
chokepoint (called by `registerTool()`, imported across the per-tool `schema.test.ts`
cohort), so the descriptor pipeline change lands in exactly one production function
plus its co-located tests.

### Graphify structural check

Queries run at plan time (2026-07-04, AST graph at HEAD):

- **Kernel nodes — explicit no-touch claim**: `createLogger()`, `createQueue()`,
  `createServer()`, and `UpstreamError` (src/errors.ts error-spine star, in:15/out:117
  with handler-wide fan-in) are **not modified** by any increment. `server.ts` (sole
  constructor of the DI factories) is untouched.
- **Kernel-adjacent touches (named per CLAUDE.md rule)**: `registerTool()`
  (src/tools/_register.ts, boot-spine community, in:5/out:88) receives type-level edits
  (ZodTypeAny/ZodIssue replacements) and its ZodError→envelope mapping is re-verified;
  `toMcpInputSchema()` (src/tools/_shared.ts, in:4/out:19, called by registerTool,
  imported by ~10 per-tool schema.test.ts) is **rewritten** — this is the
  highest-blast-radius change in the BI and warrants reviewer attention even though no
  constitutional principle is violated.
- **Surprise dependency surfaced by the graph**: `src/help/strip-schema.ts` imports
  `registerTool()` — the help subsystem consumes the descriptor pipeline, so
  `strip-schema.test.ts` (5 zodToJsonSchema fixture calls) is in US4's blast radius and
  its fixtures move to the new pipeline in the same change.
- **Communities affected**: boot-spine community (_register.ts, _shared.ts), the
  per-tool schema communities (~43 schema.ts files in the R3 sweep), the help community
  (strip-schema), and test communities (expected weakly-connected). Error-spine
  community (errors.ts) untouched.
- **Post-implement verification hooks** (for the post-implement structural pass): no
  new error-class nodes outside src/errors.ts; no production handler importing
  createLogger/createQueue directly; new symbols (the normalizer) land in the
  boot-spine community beside toMcpInputSchema; no orphaned production code.

## Complexity Tracking

No constitutional violations — table intentionally empty.

## Increment sequencing & rollback contract (FR-015)

Each increment = one conventional-commit series, suite-green at its boundary,
independently revertable:

1. **US1** `chore(067)`: lockfile refresh + minor pins (R9 row 1). Rollback: revert
   lockfile+package.json.
2. **US2** `chore(067)`: TS ~6.0.3 + tsconfig types. Rollback: single revert, no
   source edits.
3. **US3** `chore(067)`: ESLint 10 + import-x + n 18 + legacy pair removal + dev-floor
   doc note. Rollback: single revert of config+manifest+doc.
4. **US4** `feat(067)`: zod 4 + pipeline + sweep + SC-009 gates. Largest; lands as
   ordered sub-steps (pipeline first with baseline gate proving parity, then sweep,
   then gates). Rollback: revert series; baseline file never changes so parity is
   re-provable at every sub-step.
5. **US5** `ci(067)`: workflow modernization. Rollback: trivial.

PR packaging (one PR per increment vs. one PR with five commit series) stays the
maintainer's call at review time per spec assumption; the plan requires only the
ordering and the green-at-boundary property.
