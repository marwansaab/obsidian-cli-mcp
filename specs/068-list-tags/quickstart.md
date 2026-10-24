# Quickstart Validation: List Tags

How to prove the `tags` tool works end to end. Contracts: [input](contracts/input.md) · [output](contracts/output.md) · [errors](contracts/errors.md). Live steps follow `.memory/test-execution-instructions.md` (authorised vault, scratch folder, cleanup). Do not run them without it.

## 1. Gates (no live CLI)

```bash
npm run lint
npm run typecheck
npm run build
npm test                     # vitest run --coverage; includes src/tools/tags/*.test.ts and the FR-018 baseline test
```

Expected: all green; the statements coverage threshold holds; `_register-baseline.test.ts` passes with exactly one new `tags` entry.

## 2. Focused unit runs

```bash
npx vitest run src/tools/tags
```

Expected: every AC in [research.md](research.md) § D9 has a passing test. Run it three times; the results are identical (SC-004).

## 3. Live scenarios (MCP client against the built server, authorised test vault)

Use the fixture notes from [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md).

| # | Call | Expected |
|---|---|---|
| 1 | `tags({ vault: V })` | every `t068-*` fixture tag present with counts; alphabetical; `total` = length; `t068-fenced` absent |
| 2 | `tags({ vault: V, path: "<scratch>/mixed.md" })` | exactly `t068-fm`, `t068-inline` |
| 3 | `tags({ vault: V, file: "mixed" })` | same as #2 |
| 4 | focus `count.md`; `tags({ activeOnly: true })` | exactly `t068-multi` |
| 5 | `tags({ vault: V, sortByCount: true })` | counts non-increasing; equal counts in name order |
| 6 | `tags({ vault: V, includeCounts: false })` | no entry has `count` |
| 7 | `tags({ vault: V, path: "<scratch>/empty.md" })` | `{ "total": 0, "tags": [] }` |
| 8 | close all panes; `tags({ activeOnly: true })` | `ERR_NO_ACTIVE_FILE`, message names `file`/`path` |
| 9 | `tags({ vault: V, file: "a", path: "b.md" })` | `VALIDATION_ERROR` / `SCOPE_CONFLICT` / `file+path` |
| 10 | `tags({ activeOnly: true, vault: V })` | `VALIDATION_ERROR` / `SCOPE_CONFLICT` / `active+vault` |
| 11 | `tags({ vault: V, path: "../outside.md" })` | `VALIDATION_ERROR` / `INVALID_NOTE` / `path-traversal`, with `details.issues[0].path` = `["path"]` |
| 12 | `tags({ vault: "__no_such_vault__" })` | `CLI_REPORTED_ERROR`, message `Vault not found.` |
| 13 | `help({ tool_name: "tags" })` | full page: inputs, output, errors, ≥ 4 worked examples |
| 14 | SC-005: using only the scenario-13 help text (no spec, no source), write the four requests for vault-wide, file-scoped, `sortByCount` and `activeOnly`, then run each | all four succeed on the first attempt, with no validation error and the expected shape. Record any wording that caused a wrong first attempt and fix `docs/tools/tags.md` |

Clean up the fixture notes per the gate file.
