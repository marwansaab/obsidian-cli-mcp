# Quickstart — Extract Registration Stub Fixture

**Branch**: `031-extract-registration-fixture` | **Date**: 2026-05-15
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md) | **Data Model**: [data-model.md](data-model.md) | **Contract**: [contracts/registration-stub.contract.md](contracts/registration-stub.contract.md)

This file enumerates the verification scenarios mapped to the spec's Success Criteria (SC-001..SC-008). Every scenario is CI-runnable — none require a live `obsidian` CLI binary or an opened test vault, because the refactor does not touch any path that invokes a real subprocess. No `T0 manual` cases; no destructive-probe protocol per `.memory/test-execution-instructions.md`; no live-vault gating.

---

## Verification scenario index

| ID | Scenario | Maps to SC | Where it runs |
|----|----------|-----------|---------------|
| Q-1 | The shared fixture file exists at the locked path | SC-001, SC-006 | `npm test` (co-located test imports the module — failure to resolve fails the test run) |
| Q-2 | The shared fixture exports `makeRegistrationStubSpawn` AND `RegistrationStubOpts` | SC-006, SC-008 | `npm run typecheck` (consumers' imports succeed) + `_registration-stub.test.ts` |
| Q-3 | Default invocation produces an exit-0 child with empty stdout and empty stderr | SC-003 | `_registration-stub.test.ts` case 1 |
| Q-4 | `opts.stdout` propagates as UTF-8 bytes into the child's stdout before the null push | SC-003 | `_registration-stub.test.ts` case 2 |
| Q-5 | `opts.exitCode` propagates to the `exit` event | SC-003 | `_registration-stub.test.ts` case 3 |
| Q-6 | Both `opts` together exercise the full pipeline | SC-003 | `_registration-stub.test.ts` case 4 |
| Q-7 | The returned child satisfies the SpawnLike shape contract (`.stdout`, `.stderr`, `.pid = 7`, `.kill`) | SC-003 | `_registration-stub.test.ts` case 5 |
| Q-8 | Lifecycle order: stdout-push → null-push (stdout) → null-push (stderr) → exit emit (on next tick) | SC-003 | `_registration-stub.test.ts` case 6 |
| Q-9 | Default `exitCode = 0` when omitted | SC-003 | `_registration-stub.test.ts` case 7 |
| Q-10 | All 16 modified `index.test.ts` files compile under `tsc --noEmit` with `noUnusedLocals: true` | SC-004 | `npm run typecheck` |
| Q-11 | All 16 modified `index.test.ts` files pass under `vitest run` | SC-003 | `npm test` |
| Q-12 | `src/tools/obsidian_exec/index.test.ts` retains its local `function makeStubSpawn(` declaration and does NOT import from `_registration-stub` | SC-001, SC-008 | `grep -n` assertion in the co-located test OR a one-line check in the existing `_register.test.ts` durable test suite (decision deferred to /speckit-implement; the simpler grep is sufficient for SC-008 reviewer-verification) |
| Q-13 | Exactly one file in `src/tools/*/index.test.ts` contains `function makeStubSpawn(` after the refactor (the `obsidian_exec` file) | SC-001 | `grep -rl "function makeStubSpawn(" src/tools/*/index.test.ts | wc -l` returns `1` |
| Q-14 | Zero new `function makeStubSpawn(` declarations elsewhere — the 16 modified files contain none | SC-001 | Same `grep` as Q-13; the count is `1`, not `17` |
| Q-15 | The number of byte-distinct `makeStubSpawn` bodies in the repository tree drops from 5 to 2 | SC-002 | Manual `sha256sum` audit (the count is verified in data-model.md §4 as a pre-refactor reference) |
| Q-16 | `src/tools/_register-baseline.test.ts` passes WITHOUT running `npm run baseline:write` between pre- and post-refactor states | SC-007, SC-008 | `npm test` (the durable test is part of the suite) |
| Q-17 | The vitest test inventory — total test files, total cases, per-case names, pass/fail outcomes — is byte-stable pre vs post refactor | SC-003 | `npm test` output diff before vs after the refactor |
| Q-18 | The `statements` coverage metric remains ≥ `91.3` (the pinned floor) | SC-005 | `npx vitest run --coverage` after the refactor; the `vitest.config.ts` threshold gate fires on regression |
| Q-19 | The per-file diff for each of the 16 modified `index.test.ts` files shows: (a) the 22-line `makeStubSpawn` function block deleted; (b) one new import line for the fixture; (c) the four now-unused imports cleaned up per R3 | SC-008 | Reviewer-level `git diff` inspection — no automated test |
| Q-20 | `npm run lint` passes with zero warnings (constitutional Workflow gate point 1) | constitutional gate | `npm run lint` |
| Q-21 | `npm run build` succeeds (constitutional Workflow gate point 3) | constitutional gate | `npm run build` |

---

## SC ↔ Q mapping summary

| SC | Description | Verified by |
|----|-------------|-------------|
| SC-001 | `function makeStubSpawn(` declarations drop from 17 to 1 | Q-13, Q-14 |
| SC-002 | Byte-distinct bodies drop from 5 to 2 | Q-15 |
| SC-003 | `npm test` passes with no inventory drift | Q-3..Q-9 (fixture-contract cases), Q-11 (16 consumers), Q-17 (inventory) |
| SC-004 | `npm run typecheck` passes | Q-10 |
| SC-005 | Coverage floor holds | Q-18 |
| SC-006 | Net source diff matches expected shape | Q-1, Q-2 |
| SC-007 | Registry-stability baseline passes without regeneration | Q-16 |
| SC-008 | Reviewer one-pass verifiability | Q-12, Q-19 |

---

## Manual checks (none for this BI)

No manual / live-CLI / live-vault scenarios. The refactor touches only test-infrastructure code that wraps in-memory streams; no real `obsidian` binary is invoked at any point. Reviewers MAY spot-check a sample of the 16 modified files in their editor to confirm the diff shape matches Q-19, but the assertion is mechanical and falls inside the standard PR review workflow.

---

## Order of execution during `/speckit-implement`

1. Add `src/tools/_registration-stub.ts` (the fixture).
2. Add `src/tools/_registration-stub.test.ts` (the co-located tests). Verify Q-1..Q-9 pass on the new fixture in isolation.
3. Edit each of the 16 consumers in alphabetical order (`delete`, `files`, `find_by_property`, `links`, `move`, `outline`, `properties`, `read`, `read_heading`, `read_property`, `rename`, `set_property`, `smart_connections_query`, `smart_connections_similar`, `tag`, `tree`):
   - Delete the local `function makeStubSpawn(...) { ... }` block.
   - Add the fixture import line.
   - Clean up the now-unused imports per R3.
4. After each edit, run `npm run typecheck` to confirm the file compiles. (Batching is acceptable — the granularity is per-file, but the verification is per-batch.)
5. After all 16 consumers are edited, run `npm test` to verify Q-10..Q-18.
6. Run `npm run lint` to verify Q-20.
7. Run `npm run build` to verify Q-21.
8. Spot-check a sample of the 16 diffs to verify Q-19.
9. Optional CHANGELOG entry (deferred decision per spec Assumptions).

The order above is approximate — the spec is not prescriptive about implementation sequence beyond the dependency that the fixture file must exist before consumers import it.
