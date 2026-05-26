# Quickstart: Fix Prepend Reliability

**BI**: 047-fix-prepend-reliability
**Date**: 2026-05-27
**Audience**: an engineer (or AFK agent) who needs to (a) reproduce the v0.7.4 bug locally, (b) run the regression cohort that validates the fix, (c) verify the host-process stability invariant, and (d) confirm the over-cap rejection latency.

This quickstart targets Windows (the empirically reproduced failure host per [research.md](research.md)) and includes POSIX-equivalent invocations where they differ. Run all commands from the repo root unless otherwise noted.

## Prerequisites

- **Node.js**: 22.11 LTS or newer (per [Constitution Technical Standards](../../.specify/memory/constitution.md)).
- **Obsidian desktop application**: a build with the `Obsidian Integrated CLI` plugin installed and the `obsidian` binary on PATH. The empirical baseline was `Obsidian CLI` v1.12.7-equivalent (observed during the prior BI-0017 active-mode investigation).
- **Authorised test vault**: `TestVault-Obsidian-CLI-MCP` registered with the Obsidian CLI. Path discipline and scratch-subdir conventions live in [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md). DO NOT run these probes against a production vault.
- **Repo state**: branch `047-fix-prepend-reliability` checked out; dependencies installed via `npm install`.

## 1 — Reproduce the v0.7.4 bug (BEFORE the fix lands)

This step is for empirical baseline only. Skip if you trust the spec's failure-mode description.

```powershell
# Confirm the v0.7.4 tag exists before relying on it.
git tag --list 'v0.7.4'
# If empty, the release was published without a git tag — look up the pre-fix commit hash instead via
#   git log --oneline --grep '0.7.4'
# and substitute that hash for `v0.7.4` in the checkout command below.

# Build the wrapper from the v0.7.4 tag (or whichever pre-fix commit you want as baseline).
git checkout v0.7.4 -- src/tools/prepend/
npm run build

# Spawn the MCP server (locally, stdio transport — the same shape Claude Code talks to).
node ./build/index.js
```

From a separate session, drive the prepend tool with a ~10 KB payload against a scratch file under the authorised test vault's `Sandbox/BI-047/repro/` subdirectory. The empirical reproducer:

```
{
  "vault": "TestVault-Obsidian-CLI-MCP",
  "path": "Sandbox/BI-047/repro/tc-baseline.md",
  "content": "<10240 ASCII chars — e.g., a repeated 'x'>",
  "target_mode": "specific"
}
```

The v0.7.4 wrapper returns ONE of the three failure shapes nondeterministically:

- **Silent no-op**: success envelope with `bytes_written: 0` (the FR-003 anti-pattern this BI fixes).
- **Wrapper timeout**: `UpstreamError { code: "CLI_TIMEOUT", ... }` after ~10 seconds.
- **Obsidian crash dialog**: a modal `Obsidian.exe has stopped working` (or platform equivalent) that requires manual dismissal.

Restore the working tree before proceeding to step 2:

```powershell
git checkout HEAD -- src/tools/prepend/
npm run build
```

## 2 — Build and verify on the fix branch

```powershell
# Lint, typecheck, build (per Constitution Development Workflow & Quality Gates).
npm run lint
npm run typecheck
npm run build
```

Expected: zero warnings, zero errors. The Constitution Compliance checklist in the PR description tracks the gate result.

## 3 — Run the 50-call regression cohort (SC-002)

The regression cohort is implemented as a `vitest` unit test (per the user's test-scope convention — see `MEMORY.md` `feedback_test_scope`). The test uses dependency injection on the handler's `spawnFn` and `fs` deps so it can drive the exact failure surface without an actual Obsidian process. Once the implementation lands at `/speckit-implement`, the test lives at `src/tools/prepend/handler.test.ts` and is invoked via:

```powershell
npx vitest run src/tools/prepend/handler.test.ts
```

The regression assertions per [spec.md](spec.md) SC-002:

- 50 consecutive calls × 10240 ASCII characters per call.
- 0 silent no-ops (no success envelope with `bytes_written === 0`, no success envelope when on-disk byte count is unchanged).
- 0 wrapper timeouts (no `CLI_TIMEOUT` from the substrate).
- 0 host-process crash dialogs (simulated via `spawnFn` returning an abnormal exit; the wrapper's response is asserted as a structured `CLI_NON_ZERO_EXIT` envelope, not a silent failure).

## 4 — Verify the over-cap rejection latency (SC-003)

The over-cap rejection assertion is one of FR-002's hard requirements: ≤ 1 second for a 24577-character payload, no file modified, no Obsidian dialog. Test invocation:

```powershell
npx vitest run src/tools/prepend/schema.test.ts
```

The test asserts:

- A payload of 24577 ASCII characters fails Zod's `.max(24576)` check.
- The Zod issue carries `code: "too_big"`, the wrapper boundary re-emits it as `VALIDATION_ERROR` with `details.code: CONTENT_TOO_LARGE`.
- No `spawnFn` invocation occurs (verified via a spying `spawnFn` that throws if invoked).
- The end-to-end test latency is ≤ 1 second (vitest's per-test timeout).

## 5 — Verify host-process stability (SC-004)

The host-process stability invariant is harder to assert as a unit test (no real Obsidian process is spawned in unit tests). The unit-test surface covers:

- Each payload-size bucket (well-under-cap, at-cap-boundary, exactly-at-cap, above-cap) produces the correct structured response.
- No code path constructs a `bytes_written: 0` envelope or a `bytes_written` value that disagrees with the post-call stat.

Manual verification against a real Obsidian host (run by the maintainer at PR review time, not by the AFK agent):

```powershell
# Drive the wrapper through the MCP server against the authorised test vault.
# Repeat at each payload-size bucket. Confirm: no crash dialog, no recent-crash latency spike on the subsequent call.
```

The manual-verification result lands in the PR description's `Test plan` section.

## 6 — Verify p95 latency (SC-007)

The wall-clock latency assertion (p95 ≤ 500 ms per FR-009) is verified across the 50-call regression cohort:

- Each call's wall-clock latency is recorded by the test harness.
- The p95 across the 50 samples is asserted ≤ 500 ms.
- The test fails if any single call's latency exceeds 5 seconds (a defensive ceiling well below the 10-second wrapper timeout).

## 7 — Constitution gates (per PR review)

Before merging:

1. `npm run lint` — zero warnings.
2. `npm run typecheck` — zero errors.
3. `npm run build` — succeeds.
4. `npx vitest run` — full suite passes, including the new regression cohort.
5. The aggregate statements coverage threshold in `vitest.config.ts` is met (per Principle II / Constitution gate 5).
6. The Constitution Compliance checklist in the PR description has Y / N / N/A per principle + ADR — expected values per [plan.md](plan.md) `## Constitution Check`:
   - Principles I-V: Y
   - ADR-010, ADR-013, ADR-014: N/A
   - ADR-015: Y (per [research.md](research.md) R5 — one new sub-discriminator under an existing top-level code)
7. Post-implement structural verification per the CLAUDE.md `/speckit-plan` rule:
   - `/graphify --update` (refresh semantic nodes).
   - Confirm no new error-class nodes outside `src/errors.ts` community.
   - Confirm no production handler imports `createLogger()` / `createQueue()` directly.
   - Confirm new symbols land in the expected `prepend` tool community.
   - Confirm new production code is structurally connected (the new guard site is one statement in an existing function — connectivity is trivially preserved).

## 8 — Acceptance gate

The BI is complete when:

- [ ] Regression cohort passes (SC-002).
- [ ] Over-cap rejection passes (SC-003).
- [ ] No `bytes_written: 0` envelope is producible by any code path under any input shape (SC-005).
- [ ] p95 latency ≤ 500 ms across the regression cohort (SC-007).
- [ ] Manual host-process stability verification recorded in PR description (SC-004).
- [ ] Schema cap remains at 24576 UTF-16 code units, byte-stable with v0.7.4 (SC-006).
- [ ] PR Constitution Compliance checklist matches expected values per the table above.
