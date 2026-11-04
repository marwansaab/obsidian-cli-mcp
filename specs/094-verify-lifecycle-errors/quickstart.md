# Quickstart: Verify Lifecycle Errors

**Feature**: [spec.md](spec.md) · **Contract**: [contracts/lifecycle-checks-contract.md](contracts/lifecycle-checks-contract.md)

These checks run in-process. They stub the `obsidian` process with a stand-in that runs the real eval code against a simulated vault and plugin, so they need no running Obsidian, no test vault and no Smart Connections install. The live-CLI gate in `.memory/test-execution-instructions.md` does not apply: no real CLI is invoked.

## Prerequisites

- Node ≥ 22.13 (dev toolchain) and `npm ci` done.
- The branch `094-verify-lifecycle-errors` is checked out.

## V1 — The new checks pass

```bash
npx vitest run src/tools/smart_connections_similar/handler.lifecycle.test.ts
```

Expected: every check passes. Each title starts with its contract id: L1–L7 (single states, contract §S), P1–P5 (precedence, §P) and A1–A3 (active mode, §A). This proves User Stories 1–4 and SC-001 / SC-002.

## V2 — The shared harness change is neutral

```bash
npx vitest run src/tools/*/_template.test.ts src/tools/_smart-connections.test.ts
```

Expected: every existing template suite still passes unchanged. `runEvalTemplate` was re-expressed over `runEvalCode` with the same result (research D2).

## V3 — Release gates

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Expected: all green, coverage threshold included. Timing: the new file adds well under 5 s to `npm test` (SC-004). Check this with vitest's per-file duration line for `handler.lifecycle.test.ts`. CI runs the same on Linux and Windows (FR-011).

## V4 — Published surface unchanged

Expected:
- `git diff main -- src/tools/smart_connections_similar/_template.ts src/tools/smart_connections_similar/handler.ts src/tools/smart_connections_similar/schema.ts docs/tools/smart_connections_similar.md` is empty.
- The FR-018 registry-fingerprint test passes without `npm run baseline:write`.

Together these show SC-005 / FR-013.

## V5 — Swap-and-drop exercise (one-off, C-003)

For each edit M1–M9 in contract §M:

1. Apply the edit to `src/tools/smart_connections_similar/_template.ts`.
2. Run `npx vitest run src/tools/smart_connections_similar/handler.lifecycle.test.ts`. Expect at least the checks the contract lists for that edit to fail.
3. Record the edit, the failing check ids and one observed outcome in `specs/094-verify-lifecycle-errors/exercise.md`.
4. Restore the template with `git checkout -- src/tools/smart_connections_similar/_template.ts`.

Expected: all nine edits fail their listed checks, and `git status` shows no change under `src/tools/smart_connections_similar/_template.ts` afterwards. This proves User Story 5 scenario 2 and SC-003.
