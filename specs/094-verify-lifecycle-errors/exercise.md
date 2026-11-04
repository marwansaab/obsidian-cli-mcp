# Swap-and-drop exercise: Verify Lifecycle Errors

**Feature**: [spec.md](spec.md) · **Contract**: [contracts/lifecycle-checks-contract.md](contracts/lifecycle-checks-contract.md) §M · **Date**: 2026-11-04

This is the C-003 record. Each of the nine edits below was applied alone to `src/tools/smart_connections_similar/_template.ts` in the working tree. The new checks (`npx vitest run src/tools/smart_connections_similar/handler.lifecycle.test.ts`) were run against it, and the template was restored with `git checkout -- src/tools/smart_connections_similar/_template.ts` before the next edit. Nothing from the exercise is committed to `src/`.

**How the edits were made**: the detection steps are S1 (`if(!p)` guard), S2 (file resolution and its three `if(!f)` guards), S3 (`f.extension!=='md'` guard), S4 (readiness guard) and S5 (`const sourceKey`, `const src` and the `if(!src||…)` guard). A swap moved the later step ahead of the earlier one. The shared declarations `let f;` and `const env=p.env;` were kept ahead of every step that reads them, so that a swap tests the order of the guards and does not just throw on a temporal-dead-zone read. A drop deleted the step's guard `return`(s) and kept its declarations.

**Observed outcome**: the received `details.code` of the first failing check, or the `Error:` line the stand-in wrote when the edited template threw. The thrown cases reach the agent as `CLI_REPORTED_ERROR` with the `Error:` line as `details.stdout`.

| Edit | Change | Contract §M: must fail at least | Checks that failed | Observed outcome (first failing check) |
|---|---|---|---|---|
| M1 | swap S1 ↔ S2 | P3, A2 | P3, A2 | P3: `FILE_NOT_FOUND` (`path: Missing.md`) instead of `SMART_CONNECTIONS_NOT_INSTALLED` |
| M2 | swap S2 ↔ S3 | all except L1, P3, P4, A2 (amended) | L7, L2a, L2b, L3a–d, L4a–d, L5a–c, L6, P1, P2, P5, A1, A3 (20 of 24) | L7: `Error: Cannot read properties of undefined (reading 'extension')` |
| M3 | swap S3 ↔ S4 | P1 | P1 | P1: `SMART_CONNECTIONS_NOT_READY` instead of `NOT_MARKDOWN` |
| M4 | swap S4 ↔ S5 | L4a–d, P2 | L4a–d, P2 | L4a: `Error: Cannot read properties of undefined (reading 'smart_sources')` |
| M5 | drop S1 | L1, P3, P4, A2 | L1, P3, P4, A2 | L1: `Error: Cannot read properties of undefined (reading 'env')` |
| M6 | drop S2's guards | L2a, L2b, P5, A1, A3 | L2a, L2b, P5, A1, A3 | L2a: `Error: Cannot read properties of null (reading 'extension')` |
| M7 | drop S3 | L3a–d, P1 | L3a–d, P1 | L3a: `SOURCE_NOT_INDEXED` (`Board.canvas`) instead of `NOT_MARKDOWN` |
| M8 | drop S4 | L4a–d, P2 | L4a–d, P2 | L4a: `Error: Cannot read properties of undefined (reading 'smart_sources')` |
| M9 | drop S5 | L5a, L5b, L5c, L6 | L5a, L5b, L5c, L6 | L5a: `Error: Cannot read properties of undefined (reading 'find_connections')` |

Every edit failed at least one check (SC-003), and every edit failed at least the checks contract §M lists.

**M2 and the §M amendment**: §M first expected M2 to fail every check. Four checks passed instead: L1, P3, P4 and A2. All four set the plugin to `absent`, so S1 returns not-installed before the moved S3 guard runs, and the edit changes nothing in those states. This was raised to the owner, who ruled (option A, 2026-11-04) that the contract's "all" was the error, not the checks: ADR-014 places not-installed first in both chains, so with the plugin absent the result does not depend on the order of the later steps. §M's M2 row now reads "all except the plugin-absent checks (L1, P3, P4, A2)". The item's goal, that a swapped or dropped step gets caught, is met by the 20 failing checks and by SC-003.

After the last edit, `git diff -- src/tools/smart_connections_similar/_template.ts` is empty.
