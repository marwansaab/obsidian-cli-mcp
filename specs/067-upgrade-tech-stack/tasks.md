# Tasks: Tech Stack Upgrade

**Input**: Design documents from `/specs/067-upgrade-tech-stack/`
**Prerequisites**: plan.md, spec.md, research.md (R1–R9), data-model.md,
contracts/descriptor-parity.contract.md, contracts/zod4-api-mapping.contract.md,
quickstart.md

**Tests**: included — mandated by the spec (FR-010 message-asserting tests, the
descriptor-parity contract's per-rule obligations) and Principle II (tests co-located
in the same change that modifies a surface). This repo is unit-test-only; no
integration/TC scaffolding.

**Organization**: one phase per user story (US1–US5), executed strictly in order
(FR-015). Per the user's directive, every increment ends with a **commit + PR
checkpoint**: gates run → conventional commit(s) per scope-honesty → PR opened with the
Constitution Compliance checklist → **STOP for human review and merge before the next
increment begins**. Small sequential PRs are what make the reviews meaningful; the only
large PR (US4) is internally structured as four independently revertable, suite-green
commits so it can be reviewed commit-by-commit.

## Format: `[ID] [P?] [Story] Description`

## Branch & PR scheme (constitution gate 8 + FR-015)

- **PR-0 (docs)**: the current `067-upgrade-tech-stack` branch (spec, plan, tasks) →
  `main`. Docs-only. Merges FIRST so every increment branch cuts from a main that
  contains the spec artifacts.
- **PR-1…PR-5**: one short-lived branch per increment, cut from **updated main** after
  the previous PR merges: `067-us1-deps-baseline`, `067-us2-typescript`,
  `067-us3-eslint`, `067-us4-zod4`, `067-us5-ci`. Sequential merges enforce FR-015
  ordering and keep each review scoped to one increment.
- Every PR body: summary, gate evidence (lint/typecheck/build/suite/coverage), the
  9-row Constitution Compliance checklist with the values given in that increment's PR
  task, and the `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
  footer. Any `N` row requires a Complexity Tracking entry in plan.md (none expected).
- Commits follow CONTRIBUTING.md (type(scope), WHY body, SHOUTY-CAPS groups, FR/SC/T
  references, `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer).

---

## Phase 1: Setup (docs PR + pre-flight evidence)

**Purpose**: land the spec artifacts on main and freeze the pre-upgrade baseline that
PR bodies will cite.

- [X] T001 Capture pre-upgrade evidence in specs/067-upgrade-tech-stack/evidence-pre-upgrade.md: `npm audit` summary (8 vulns: 5 moderate, 3 high, names + fixAvailable), `npm ls --depth=0` output, `node --version`, and the current `src/tools/_register-baseline.json` schemaVersion + tool count (34)
- [X] T002 Commit tasks.md + evidence file on `067-upgrade-tech-stack` via the repo commit convention (`docs(067-upgrade-tech-stack): generate task breakdown`)
- [X] T003 Open **PR-0** `067-upgrade-tech-stack` → `main` (gh pr create): title "067: tech-stack upgrade — spec, plan, tasks (docs only)"; Constitution checklist: Principles I–V **N/A** (docs-only, no governed surface), ADR-010/013/014/015 **N/A**; **STOP — request review, merge before Phase 3** (opened as [#74](https://github.com/marwansaab/obsidian-cli-mcp/pull/74))

---

## Phase 2: Foundational

**None.** The increments are sequential by design; the only shared prerequisite is
PR-0 being merged (enforced by the STOP in T003). No blocking infrastructure tasks.

---

## Phase 3: User Story 1 — Vulnerability-Free Dependency Baseline (P1) 🎯 MVP

**Goal**: zero known advisories; toolchain current within existing majors; formatter
held at 3.8.x (FR-001, FR-002, FR-003).

**Independent Test**: quickstart.md § US1 — audit 0; audit fix changed no direct deps;
suite green; prettier = 3.8.5.

- [X] T004 [US1] Cut branch `067-us1-deps-baseline` from updated main (`git fetch && git switch -c 067-us1-deps-baseline origin/main`)
- [X] T005 [US1] package.json (R1 rows): vitest `^4.1.9` + @vitest/coverage-v8 `^4.1.9` (lockstep — coverage peer-pins vitest exactly), typescript-eslint `^8.62.1`, eslint-plugin-jsonc `^3.2.0`, @types/node `^22.20.0`, prettier `"3.8.5"` **exact, no range**; then `npm install`
- [X] T006 [US1] Run `npm update && npm audit fix`; verify `npm audit` reports 0 vulnerabilities (SC-001) and `git diff package.json` shows NO audit-fix-driven direct-dependency changes (FR-001 — only T005's explicit edits)
- [X] T007 [US1] Verify formatter hold (FR-003): `npm ls prettier` = 3.8.5; run `npx prettier --check .` — if the 3.8.3→3.8.5 patch reflows anything, commit the reflow separately as `style(067-upgrade-tech-stack): prettier 3.8.5 reflow` before T009. **Finding (2026-07-04)**: no reflow commit made — full-tree probe (scratchpad, both versions `--write` over LF-clean archive copies) shows the 3.8.3→3.8.5 version delta is 16 prose files (one loose-list blank-line rule), but the repo was never format-clean under 3.8.3 to begin with (743 files carry pre-existing content-level drift; `format:check` is not a CI gate and additionally always fails on Windows working trees — CRLF checkout vs `endOfLine: "lf"`). A style commit cannot isolate the version delta from the pre-existing drift, and a repo-wide reflow would contradict PR-1's manifest-only scope. Formatter-drift cleanup recorded as a follow-up BI candidate; FR-003's normative core (prettier held at 3.8.5 exact) is satisfied.
- [X] T008 [US1] Run all constitution gates: `npm run lint`, `npm run typecheck`, `npm run build`, and `mkdir -p coverage/.tmp && npx vitest run --coverage --pool=forks --no-file-parallelism` (SC-002; coverage threshold untouched)
- [X] T009 [US1] Commit `chore(067-upgrade-tech-stack): US1 dependency baseline (T004-T008)` — body: audit 8→0 with the 8 advisory names, bump table, FR-001/002/003 mapping, gate results
- [X] T010 [US1] Open **PR-1** → main: title "067/US1: dependency baseline — audit 8→0, minors, prettier hold"; Constitution checklist: I–V **N/A** (lockfile + manifest ranges only, no source/surface change; suite re-run is the evidence), ADRs **N/A**; cite evidence-pre-upgrade.md; **STOP — review + merge before Phase 4** (opened as [#75](https://github.com/marwansaab/obsidian-cli-mcp/pull/75))

**Checkpoint**: main is vulnerability-free and current-within-majors. This alone is a
shippable MVP.

---

## Phase 4: User Story 2 — Current Compiler Major (P2)

**Goal**: TypeScript ~6.0.3, zero deprecation warnings, unchanged build artifact
layout (FR-004, FR-005).

**Independent Test**: quickstart.md § US2.

- [X] T011 [US2] Cut branch `067-us2-typescript` from updated main
- [X] T012 [US2] package.json: typescript `"~6.0.3"` (**tilde** — typescript-eslint 8.62.1 peer caps `<6.1.0`, R1); `npm install`
- [X] T013 [US2] tsconfig.json: add `"types": ["node"]` to compilerOptions (TS 6.0 defaults `types` to `[]`; tsconfig.build.json extends this file — one edit covers both)
- [X] T014 [US2] Gates: `npm run typecheck` clean; `npx tsc --noEmit` output contains no deprecation text (FR-005); `npm run build` then verify dist layout unchanged (dist/index.js bin entry + index.d.ts present); lint; full suite via the reliable coverage invocation
- [X] T015 [US2] Commit `chore(067-upgrade-tech-stack): US2 TypeScript 6.0.3 (T011-T014)` — body: types:[] default-flip rationale, tilde-pin rationale, TS-7 on-ramp note, gate results
- [X] T016 [US2] Open **PR-2** → main: title "067/US2: TypeScript ~6.0.3 + explicit node types"; Constitution checklist: I–V **N/A** (compiler config + manifest only; Technical Standards row satisfied: strict/NodeNext/ES2024 unchanged), ADRs **N/A**; **STOP — review + merge before Phase 5** (opened as [#76](https://github.com/marwansaab/obsidian-cli-mcp/pull/76))

---

## Phase 5: User Story 3 — Current Linter Major (P3)

**Goal**: ESLint 10 with equivalent rule coverage via import-x; redundant legacy lint
deps removed; dev-floor documented (FR-006, FR-007, FR-013).

**Independent Test**: quickstart.md § US3 — lint zero new violations; mis-ordered
import still flagged.

- [X] T017 [US3] Cut branch `067-us3-eslint` from updated main
- [X] T018 [US3] package.json: eslint `^10.6.0`, eslint-plugin-n `^18.2.1`; REMOVE eslint-plugin-import; ADD eslint-plugin-import-x `^4.17.1`; REMOVE `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser` (unused by config — meta-package wires both, FR-007); `npm install` (PR #77 review fix 2026-07-04: eslint-plugin-n subsequently REMOVED instead of upgraded — flat config never enabled any `n/` rule, only three `"off"` entries since its introduction, so the plugin contributed zero lint signal; same FR-007 redundant-dep rationale as the legacy pair)
- [X] T019 [US3] eslint.config.js: `import importX from "eslint-plugin-import-x"`; plugins key `import` → `"import-x": importX`; rules `import/order` → `import-x/order` (options object unchanged) and `import/no-unresolved` → `import-x/no-unresolved` (stays `"off"`, keep the tsc-owns-resolution comment)
- [X] T020 [US3] Rule-coverage probe (US3 acceptance 2): temporarily swap two import lines in any src file → `npm run lint` must report `import-x/order`; revert the swap (probe 2026-07-04: swapped node:fs/node:path in _register.ts → `import-x/order` error fired; reverted clean)
- [X] T021 [US3] Document dev-toolchain minimum in CONTRIBUTING.md (or README.md § Development if no CONTRIBUTING): Node ≥ 22.13 required to run lint (eslint 10 / eslint-plugin-n 18 engines); published runtime floor `>=22.11` unchanged (FR-013 — constitution Node-floor amendment trigger NOT pulled) (PR #77 review fix 2026-07-04: floor attribution reworded to cite eslint 10 alone after plugin-n removal — identical engines string, floor unchanged)
- [X] T022 [US3] Gates: `npm run lint` zero new violations (SC-007), typecheck, build, full suite
- [X] T023 [US3] Commit `chore(067-upgrade-tech-stack): US3 ESLint 10 + import-x (T017-T022)` — body: sole-blocker rationale (eslint-plugin-import peer cap ^9, dormant), legacy-pair removal, dev-floor note, gate results
- [X] T024 [US3] Open **PR-3** → main: title "067/US3: ESLint 10 — import-x swap, plugin-n 18, legacy pair removal"; Constitution checklist: I–V **N/A** (lint config + manifest + docs; no MCP surface), Technical Standards row: flat config zero warnings Y; ADRs **N/A**; **STOP — review + merge before Phase 6** (opened as [#77](https://github.com/marwansaab/obsidian-cli-mcp/pull/77); retitled after the review fix to "067/US3: ESLint 10 — import-x swap, legacy pair + dead plugin-n removal")

---

## Phase 6: User Story 4 — Current Schema-Validation Major (P4)

**Goal**: zod 4 full modernization; zod-to-json-schema removed; descriptors
byte-identical (baseline UNREGENERATED); custom messages + machine codes verbatim;
permanent SC-009 gates (FR-008…FR-012, FR-016).

**Independent Test**: quickstart.md § US4 — `git diff --exit-code
src/tools/_register-baseline.json` + baseline test green + SC-009 greps empty.

**Structure**: four suite-green commits (A→D), each independently revertable (plan
§ Increment sequencing). Graph-path note: strip-schema.ts → _register.ts →
toMcpInputSchema, so T032 MUST land inside commit A; the baseline test exercises
registerTool → fingerprintLiveRegistry, so T033's gate covers T027–T032 jointly.

### Commit A — descriptor pipeline + compile-forced migrations

- [X] T025 [US4] Cut branch `067-us4-zod4` from updated main
- [X] T026 [US4] package.json: zod `^4.4.3`; REMOVE zod-to-json-schema; @modelcontextprotocol/sdk `^1.29.0` (FR-012 floors); `npm install` (compile breaks until T027–T032 — expected, resolved within this commit)
- [X] T027 [US4] src/tools/_shared.ts: rewrite `toMcpInputSchema` per contracts/descriptor-parity.contract.md — `z.toJSONSchema(zodSchema, { io: "input", target: "draft-7" })` + private recursive normalizer with rules N1 (propertyNames === {type:"string"} → delete), N1b (else additionalProperties {} → true), N2 (all-primitive bare anyOf → type array, order preserved), N3 (integer MAX_SAFE_INTEGER sentinel bounds → delete, with future-author guard comment), N4 (oneOf → anyOf); N1 evaluated before N1b; `ZodTypeAny` → `z.ZodType` (M4); update the module header description (Principle V, stays `Original — no upstream`)
- [X] T028 [P] [US4] src/tools/_shared.test.ts: per-rule fire test + per-rule boundary no-fire test (mixed union stays anyOf; explicit int bounds kept; record-of-unknown keeps additionalProperties {}; checked-key record keeps propertyNames) + one untouched-shape control fixture (contract § Test obligations)
- [X] T029 [P] [US4] src/tools/_register.ts: `ZodTypeAny` → `z.ZodType`, `ZodIssue` → `z.core.$ZodIssue` (M4/M5); envelope mapping `{path, message, code}` untouched (FR-011)
- [X] T030 [P] [US4] src/tools/read_property/schema.ts:38: `z.record(z.unknown())` → `z.record(z.string(), z.unknown())` (M3, compile-forced)
- [X] T031 [P] [US4] M1 error callbacks: src/tools/create_base/schema.ts + src/tools/query_base/schema.ts (4 fields, lines ~11–18) → `{ error: (issue) => issue.input === undefined ? "<required msg>" : "<type msg>" }` preserving the EXACT current strings; ADD message-asserting tests to the co-located schema.test.ts files (v4 silently ignores old params — these tests are the only guard, FR-010)
- [X] T032 [US4] src/help/strip-schema.test.ts: replace the 5 `zodToJsonSchema(schema, {$refStrategy:"none"})` fixture calls with the new `toMcpInputSchema` pipeline; assert stripped-help output unchanged
- [X] T033 [US4] **GATE + Commit A**: `git diff --exit-code src/tools/_register-baseline.json` (untouched) + `npx vitest run src/tools/_register-baseline.test.ts` green + full suite green → commit `feat(067-upgrade-tech-stack): US4-A zod 4 descriptor pipeline (T026-T032)` citing FR-008/FR-009/SC-003. **Commit-A findings (2026-07-04) — two R3-mapping gaps surfaced by tsc and resolved in-commit**: (1) src/target-mode/target-mode.ts used `z.UnknownKeysParam` + `z.ZodEffects` — REMOVED in v4 (hard TS2694) — generics modernized to `<T extends z.ZodObject>(schema: T): T` (v4 superRefine returns the object schema itself); the broken generic had cascaded implicit-any into ~125 downstream test diagnostics, all cleared by this fix. (2) src/tools/read_heading/schema.ts used the v3 function-form second arg to `.refine()` — removed in v4 — migrated to `{ error: (issue) => … }` preserving the exact dynamic message. **Additional accepted drift**: zod 4 consolidates v3 enum/literal mismatch codes into `invalid_value` (wire-visible in envelope `code` for enum-mismatch input only; ADR-015 `params` machine codes unaffected); target-mode.test.ts AC#5/AC#6/invariant assertions updated accordingly.

### Commit B — remaining mandatory deprecated-API migrations

- [X] T034 [P] [US4] `.passthrough()` → `.loose()` in src/tools/outline/schema.ts:33 and src/tools/properties/schema.ts:44 (M2)
- [X] T035 [US4] `z.ZodIssueCode.custom` → string literal `"custom"` across ~45 sites / 18 files (M6; grep-driven sweep: src/target-mode/target-mode.ts, src/tools/_base-path.ts, patch_heading, patch_block, find_and_replace, open_file, create_base, query_base, views_base, rename, et al.); type-safe per contract (actual count at sweep time: 49 sites / 15 files, all exact-form `z.ZodIssueCode.custom`; also migrated the two M5 leftover `ZodIssue` imports in find_and_replace/index.ts + prepend/index.ts to `z.core.$ZodIssue`)
- [X] T036 [US4] **GATE + Commit B**: full suite green including every customIssueParams machine-code assertion (SC-004, ADR-015 codes verbatim) → commit `feat(067-upgrade-tech-stack): US4-B deprecated-API migration (T034-T035)` citing FR-016 mandatory rows (landed as e9c2abb)

### Commit C — strictObject modernization sweep

- [X] T037 [US4] S1 sweep: `z.object({...}).strict()` → `z.strictObject({...})` across 115 occurrences / 43 schema files (mechanical; preserve `.extend()`/`.omit()` chains; `.superRefine()` deliberately KEPT per corrected clarify Q2 — do NOT touch it) (actual: 97 call sites / 41 files converted via paren-matching codemod; the plan-time 115 counted prose mentions — residual occurrences are comments/test-name strings only; zero `.extend()`-receiver `.strict()` calls existed)
- [X] T038 [US4] **GATE + Commit C**: baseline test green UNREGENERATED + full suite → commit `feat(067-upgrade-tech-stack): US4-C strictObject sweep (T037)` citing S1 + parity proof (landed as df38f3a)

### Commit D — permanent SC-009 gates

- [X] T039 [US4] eslint.config.js (contract § Regression guards): add `"@typescript-eslint/no-deprecated": "error"` to the type-aware src block; `no-restricted-syntax` selectors for zero-arg `.strict()`, `.passthrough()`, `.strip()` (messages naming v4 replacements; **no superRefine selector**); `no-restricted-imports` banning `zod-to-json-schema` and `zod/v3` (gate fire-probed: a scratch zero-arg `.strict()` file produced the expected no-restricted-syntax error)
- [X] T040 [US4] Triage `no-deprecated` repo-wide fallout beyond zod (first type-aware rule — non-zod deprecated APIs may surface): fix trivially or per-line `eslint-disable` with justification; run the one-off blind-spot grep for `{ message:` in `.min/.max/.refine` param position (expect zero, contract note). **Triage record (2026-07-04, 18 findings)**: (a) `toMatchTypeOf` deprecated in expect-type — 13 sites / 5 schema.test.ts files → `toExtend` (same extends semantics); (b) SDK low-level `Server` deprecated in favor of `McpServer` — 2 sites in src/server.ts → per-line eslint-disable with justification (constitution Technical Standards mandates the low-level API; migrating the composition root is an architectural decision, NOT a dependency-refresh side effect — **note: comment-only touch to the otherwise no-touch kernel file, flagged in PR-4 body**); (c) `.finite()` no-op-deprecated in v4 — 2 sites (smart_connections_query/similar wire schemas) → removed; (d) `Dirent.path` deprecated since v20.12 — 1 site (find_and_replace/handler.ts dead fallback under the >=22.11 floor) → removed; (e) 1 import-x/order violation in strip-schema.test.ts (introduced by T032) → autofixed. Blind-spot grep: zero hits as predicted.
- [X] T041 [US4] **GATE + Commit D**: `npm run lint` zero warnings; SC-009 greps empty (`zod-to-json-schema|ZodTypeAny|ZodIssueCode|passthrough\(\)|required_error|invalid_type_error` in src/ — four prose mentions reworded so the grep measures API usage, not commentary); full suite → commit `feat(067-upgrade-tech-stack): US4-D SC-009 permanent gates (T039-T040)` citing SC-009
- [X] T042 [US4] Open **PR-4** → main: title "067/US4: zod 4 full modernization — descriptors byte-stable, baseline unregenerated"; body includes a reviewer guide (review the four commits independently: A pipeline, B mandatory, C mechanical sweep, D gates), the baseline-unregenerated proof, accepted default-message-drift note (spec assumption), and Constitution checklist: **I Y, II Y, III Y, IV Y, V Y** (evidence per plan.md Constitution Check), ADR-010/013/014/015 **N/A**; **STOP — review + merge before Phase 7** (opened as [#78](https://github.com/marwansaab/obsidian-cli-mcp/pull/78))

---

## Phase 7: User Story 5 — Supported CI Runtime (P5)

**Goal**: actions on supported runtime; two-lane matrix (FR-014).

**Independent Test**: quickstart.md § US5 — both lanes green, zero runtime deprecation
warnings.

- [X] T043 [US5] Cut branch `067-us5-ci` from updated main; edit .github/workflows/ci.yml: `actions/checkout@v7`, `actions/setup-node@v6`, `strategy.matrix.node-version: [22, 24]` with `node-version: ${{ matrix.node-version }}`, keep `cache: npm`; reflect matrix in job name
- [X] T044 [US5] Commit `ci(067-upgrade-tech-stack): US5 actions v7/v6 + node 22/24 matrix (T043)` — body: node20-runtime hygiene rationale (no hard deadline — verify-pass correction), matrix rationale
- [X] T045 [US5] Push branch and open **PR-5** → main as a DRAFT: title "067/US5: CI actions modernization + [22,24] matrix" — ci.yml triggers are `push: [main]` + `pull_request: [main]`, so CI runs for this branch only once the PR exists (opened as [#79](https://github.com/marwansaab/obsidian-cli-mcp/pull/79))
- [X] T046 [US5] Verify CI on PR-5: both lanes green, run logs contain no runner-runtime deprecation warnings (SC-005); a 24-lane failure is a release blocker, not a reason to drop the lane (spec edge case); then mark the PR ready for review, adding Constitution checklist: I–V **N/A** (workflow only), ADRs **N/A**; **STOP — review + merge** (verified 2026-07-05: Node 22 lane pass 57s, Node 24 lane pass 51s, full-run-log deprecation grep = 0 matches; PR marked ready)

---

## Phase 8: Polish & Post-Implement (after PR-5 merges)

- [X] T047 Run `/graphify --update`, then the post-implement structural verification on main (plan § Graphify hooks): (1) no new error-class nodes outside src/errors.ts; (2) no production handler imports createLogger/createQueue directly; (3) normalizer landed in the boot-spine community beside toMcpInputSchema; (4) no orphaned production code — record results + any deviations in specs/067-upgrade-tech-stack/post-implement.md (run 2026-07-05: ALL FOUR PASS, zero structural deviations — see post-implement.md)
- [X] T048 [P] Version bump: **0.8.10 → 0.8.11** (maintainer call made at implement invocation 2026-07-04: patch bump by 0.0.1, overriding the earlier 0.9.0 recommendation) — `chore(release): bump version to 0.8.11`; note in body: prettier 3.9-line hold contingent on prettier/prettier#19510, and typescript `~6.0.3` tilde hold contingent on the typescript-eslint peer cap `typescript <6.1.0` (PR #76 review 2026-07-04: do not normalize the tilde to caret for manifest consistency — a caret drifts onto 6.1 the day it ships and breaches the peer range on the next fresh install; widen only when typescript-eslint's peer range moves) — re-check both at next dependency-refresh BI. Bump via `npm version patch --no-git-tag-version` (or run `npm install` after editing package.json by hand) so both package-lock.json `version` fields move with it — PR #75 review (2026-07-04) found main's lockfile root version stuck at **0.1.6** against package.json 0.8.10 because past release bumps edited package.json alone; PR #75's install re-synced it, and this rule keeps the drift from restarting
- [ ] T049 [P] Execute the prepared `/speckit-constitution` PATCH prompt (Principle III exemplar wording: zod-to-json-schema → z.toJSONSchema) — **dedicated PR** per the amendment procedure, never bundled with 067 feature work; its precondition gate (zod-to-json-schema absent from manifest) is satisfied once PR-4 merges

---

## Dependencies

```
T001 → T002 → T003 (PR-0 merge)
  → Phase 3 (US1): T004 → T005 → T006 → T007 → T008 → T009 → T010 (PR-1 merge)
  → Phase 4 (US2): T011 → T012 → T013 → T014 → T015 → T016 (PR-2 merge)
  → Phase 5 (US3): T017 → T018 → T019 → T020 → T021 → T022 → T023 → T024 (PR-3 merge)
  → Phase 6 (US4): T025 → T026 → T027 → {T028, T029, T030, T031 in parallel} → T032 → T033
                   → {T034 ∥ T035} → T036 → T037 → T038 → T039 → T040 → T041 → T042 (PR-4 merge)
  → Phase 7 (US5): T043 → T044 → T045 → T046 (PR-5 merge)
  → Phase 8: T047 → {T048 ∥ T049}
```

Stories are strictly sequential (FR-015 + merged-PR gating). Parallelism exists only
WITHIN phases, on tasks marked [P] (different files, no shared state).

## Parallel example (US4 commit A, after T027)

```
T028 src/tools/_shared.test.ts          (normalizer tests)
T029 src/tools/_register.ts             (type modernization)
T030 src/tools/read_property/schema.ts  (two-arg record)
T031 create_base + query_base schemas   (error callbacks + tests)
```

## Implementation strategy

MVP = Phase 3 (US1) alone — zero-vuln baseline is shippable value. Each subsequent
phase is optional-but-ordered; stopping after any merged PR leaves main releasable
(FR-015). The reliable Windows coverage invocation (`mkdir -p coverage/.tmp && npx
vitest run --coverage --pool=forks --no-file-parallelism`) is the suite gate
everywhere — a cold-run `coverage/.tmp` race is infrastructure noise, not an upgrade
regression (spec edge case).

## Notes

- Graphify (CLAUDE.md tasks rule, queries run 2026-07-04): path
  `strip-schema.ts → _register.ts → toMcpInputSchema()` puts the help fixtures inside
  US4 commit A (T032); path `registerTool() → _register.test.ts →
  fingerprintLiveRegistry()` confirms the baseline test is the joint gate for
  T027–T032. Kernel nodes (UpstreamError, createServer, createLogger, createQueue)
  appear in NO task — the plan's no-touch claim holds at task granularity.
- src/tools/_register-baseline.json appears in NO edit task by design: it is the gate
  (FR-009). If any task run leaves it diffed, the change is wrong — fix the code, never
  the baseline.
- Test scope is unit-only per project convention; descriptor parity is proven
  in-process (baseline test + InMemoryTransport in _register.test.ts), no live vault
  probes required anywhere in this BI.
