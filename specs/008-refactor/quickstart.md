# Quickstart — 008-refactor verification

**Status**: design
**Date**: 2026-05-07

Twelve verification scenarios, each mapped to a Success Criterion (SC-001 through SC-011) plus the doc-aggregation drill. Each scenario gives the *what* (test command or measurement procedure), the *expected* observation, and the binding spec reference.

The order is roughly "smallest first" — unit-level scenarios first, then per-tool integration, then full-suite + e2e.

---

## Scenario 1 — `_register.ts` unit tests pass

**SC**: SC-001 (boilerplate elimination, `index.ts` ≤ 10 lines), SC-002 (no direct `zodToJsonSchema` calls outside the registration pipeline)

**Run**:
```sh
npx vitest run src/tools/_register.test.ts
```

**Expected**: every leg of the publication pipeline asserts green:
- `toMcpInputSchema` applied to descriptor.inputSchema → top-level `type: "object"`
- `stripSchemaDescriptions` applied → no `description` keys at any depth (root is preserved if present)
- `responseFormat: "json"` (default) wraps result in `{ content: [{ type: "text", text: JSON.stringify(result) }] }`
- `responseFormat: "raw"` passes the handler's return value through unchanged
- ZodError → `VALIDATION_ERROR` envelope with `details.issues` shape preserved
- UpstreamError → `asToolError({ code, message, details })` envelope

**Manual companion**: `grep -rn "zodToJsonSchema\|stripSchemaDescriptions" src/tools/` should show no hits outside `_register.ts`, `_register.test.ts`, `_shared.ts` (the helper home), and `_shared.test.ts`.

---

## Scenario 2 — `assertToolDocsExist` aggregates misses (Clarifications Q4 / FR-005)

**SC**: SC-001 / FR-005

**Run** (manual or via test fixture):
1. Rename `docs/tools/help.md` → `docs/tools/help.md.bak`
2. Rename `docs/tools/read_note.md` → `docs/tools/read_note.md.bak`
3. Boot the server: `node dist/index.js`

**Expected**: the process exits with non-zero code, stderr carries the aggregated error message:

```
Missing tool documentation files:
  - docs/tools/help.md
  - docs/tools/read_note.md

Server boot failed because these registered tools have no documentation. Create the missing files and try again.
```

`obsidian_exec.md` is NOT in the list (it's still present). The error names BOTH missing files in declaration order — fail-fast on the first missing file is forbidden per Clarifications Q4.

**Cleanup**: rename the `.bak` files back. Add `_register.test.ts` cases that drive the aggregation logic against a synthetic `RegisteredTool[]` fixture (no real filesystem manipulation in unit tests).

---

## Scenario 3 — `dispatchCli` classification table

**SC**: FR-014 (uniform four-priority classification)

**Run**:
```sh
npx vitest run src/cli-adapter/_dispatch.test.ts
```

**Expected**: every row of the classification table in [contracts/dispatch-cli.contract.md](contracts/dispatch-cli.contract.md#four-priority-error-classification-fr-014) asserts green via synthetic spawn fixtures. Specifically:
- spawn ENOENT → `CLI_BINARY_NOT_FOUND`
- exit code 1 → `CLI_NON_ZERO_EXIT`
- exit 0, stdout `Error: no active file...` → `ERR_NO_ACTIVE_FILE`
- exit 0, stdout `Error: vault not found` → `CLI_REPORTED_ERROR`
- exit 0, stdout `<note content>` → success
- timeout fires → `CLI_TIMEOUT` + ONE `dispatch.timeout` stderr line
- output cap exceeded → `CLI_OUTPUT_TOO_LARGE` + ONE `dispatch.cap` stderr line

---

## Scenario 4 — Typed-tool timeout fires within 10.5 s (SC-003)

**SC**: SC-003

**Run**:
```sh
npx vitest run src/cli-adapter/cli-adapter.test.ts -t "timeout"
```

The test uses a synthetic spawn that never exits. The test calls `invokeCli({ command: "read", parameters: {...}, flags: [], target_mode: "specific" }, deps)`. Wall-clock measurement around the awaited promise: rejection time MUST fall within 10.5 s of dispatch (10 s timeout + 500 ms scheduling slack).

**Expected**: rejection with `UpstreamError { code: "CLI_TIMEOUT", details: { timeoutMs: 10000, ... } }` AND wall-clock duration ≤ 10500 ms. Stderr capture shows exactly ONE `dispatch.timeout` JSON line.

---

## Scenario 5 — Typed-tool output-cap kills child within 10 MiB (SC-004)

**SC**: SC-004

**Run**:
```sh
npx vitest run src/cli-adapter/cli-adapter.test.ts -t "output cap"
```

Synthetic spawn emits 11 MiB of stdout in tight chunks. The test asserts:
- Rejection with `UpstreamError { code: "CLI_OUTPUT_TOO_LARGE", details: { stream: "stdout", limitBytes: 10485760, capturedBytes: <11 MiB-ish>, partial: <≤ 10 MiB string> } }`.
- The captured `partial` field is ≤ 10 MiB.
- The host process's resident-memory growth between before and after the test is < 20 MiB (measured via `process.memoryUsage().rss` delta).
- Stderr capture shows exactly ONE `dispatch.cap` JSON line.

---

## Scenario 6 — SIGINT mid-dispatch kills child + zero orphans (SC-005)

**SC**: SC-005

**Run**:
```sh
npx vitest run src/cli-adapter/_dispatch.test.ts -t "SIGINT"
```

The test:
1. Starts a synthetic-spawn `dispatchCli` call against a child that takes 5 s to exit.
2. Mid-flight (after the spawn returns), invokes `killInFlightChildren()` directly (simulating server.ts's `triggerShutdown` path).
3. Asserts:
   - The child receives SIGTERM.
   - If the child has not exited within 2 s, SIGKILL is delivered.
   - Stderr capture shows exactly ONE `dispatch.kill` JSON line with the killed child's PID and command.
   - `killInFlightChildren()` returned `true`.
   - After the test, `ps` (or Node's `child_process` introspection) shows zero leftover children with the spawned binary's signature.

---

## Scenario 7 — `invokeBoundedCli` 120 s clamp is silent (Clarifications Q1 / FR-011)

**SC**: FR-011 / clarifications behavior

**Run**:
```sh
npx vitest run src/cli-adapter/invoke-bounded-cli.test.ts -t "clamp"
```

The test calls `invokeBoundedCli(input, { timeoutMs: 200_000 }, deps)` against a synthetic spawn that hangs 121 s. Asserts:
- Rejection with `UpstreamError { code: "CLI_TIMEOUT", details: { timeoutMs: 120000, ... } }` — clamped value, NOT the requested 200000.
- NO `VALIDATION_ERROR` raised at any point.
- Stderr capture shows exactly ONE `dispatch.timeout` JSON line (the clamp itself does NOT log).

---

## Scenario 8 — Atomic registry insertion (Clarifications Q5 / FR-015a)

**SC**: FR-015a

**Run**:
```sh
npx vitest run src/cli-adapter/_dispatch.test.ts -t "atomic"
```

The test races: a synthetic spawn that returns a child handle, immediately followed by a synthetic SIGINT delivered via `process.emit("SIGINT")` on the next tick. The dispatch-flow inserts the child into the registry SYNCHRONOUSLY, before any `await` boundary.

**Expected**:
- At the moment the SIGINT-driven `killInFlightChildren()` runs, `inFlightChild !== null`.
- `killInFlightChildren()` returns `true`.
- The child receives SIGTERM, then SIGKILL after 2 s if still alive.
- ONE `dispatch.kill` log line is emitted.

If the registry insertion were async (e.g., behind an `await`), this test would fail with `inFlightChild === null` and orphan leak.

---

## Scenario 9 — `tools/list` byte-equivalence vs 0.1.7 (SC-006)

**SC**: SC-006 / FR-019

**Run**:
1. Boot the server (post-feature) and capture its `tools/list` response: `node dist/index.js < /dev/null | head -1` (or via the SDK's test harness).
2. Compare against the corresponding 0.1.7 snapshot (the registry-consistency block tests + `src/server.test.ts`'s assertion that all three tools register).

**Expected**: the published descriptors for `read_note`, `obsidian_exec`, `help` are byte-equivalent (modulo whitespace / property order) to 0.1.7's output. Specifically:
- All three `inputSchema` objects have `type === "object"` at the top level.
- `description` fields are present at the descriptor level, absent at every nested level.
- `obsidianExecSchema.timeoutMs.maximum === 120000` is preserved (per research R2 — the zod `.max(120000)` constraint is NOT removed).

---

## Scenario 10 — Full pre-existing test suite passes with no regressions (SC-007)

**SC**: SC-007

**Run**:
```sh
npm run test         # equivalent to: vitest run --coverage
npm run lint
npm run typecheck
npm run build
```

**Expected**: every pre-existing test that was green on `main` is green on this branch. New tests are additive. Coverage threshold in `vitest.config.ts` does not regress (Development Workflow gate #5; if it does, the threshold ratchets in the same PR per the visible-edit rule).

---

## Scenario 11 — `src/errors.ts` shows zero new identifiers; obsidian_exec.md gains ERR_NO_ACTIVE_FILE only (SC-008 reworded)

**SC**: SC-008 (post-Q6 wording) / FR-021

**Run**:
```sh
git diff main -- src/errors.ts          # expect: empty diff
git diff main -- docs/tools/             # expect: changes only in obsidian_exec.md
```

**Expected**:
- `src/errors.ts` diff is empty (no new error identifiers globally).
- `docs/tools/obsidian_exec.md` diff adds `ERR_NO_ACTIVE_FILE` to the error-codes section (per research R11).
- No other tool's docs gain new code references.
- `CHANGELOG.md` (NEW per research R12) has a 0.2.0 section enumerating the operator-observable changes including the `obsidian_exec` reachable-set expansion.

---

## Scenario 12 — Principle-I downward-flow violation at server.ts:9 is fixed (SC-009)

**SC**: SC-009 / FR-017

**Run**:
```sh
grep -n "from \"./tools/" src/server.ts
```

**Expected**: ZERO matches for any import from `./tools/*/handler.js`. Specifically, the old import `import { killActiveChild as defaultKillActiveChild } from "./tools/obsidian_exec/handler.js"` is gone, replaced by:

```ts
import { killInFlightChildren } from "./cli-adapter/cli-adapter.js";
```

(The factory imports `import { createHelpTool } from "./tools/help/index.js"` etc. remain — those are downward-flow imports of a tool's PUBLIC factory, NOT of its internals.)

---

## Doc-aggregation drill (FR-005 / Clarifications Q4)

**Bonus** — exercised by Scenario 2 above, but worth calling out as the deliberate-malformation test:

**Procedure**:
1. Rename `docs/tools/help.md`, `docs/tools/read_note.md`, AND `docs/tools/obsidian_exec.md` away in one go.
2. Boot.
3. Observe stderr.

**Expected**: the error message lists ALL THREE missing files in declaration order. Boot fails non-zero. The first missing file is NOT special-cased.

---

## SC-010 — Release lands

**SC**: SC-010

**Run**: after merge to main:
```sh
npm version minor       # 0.1.7 → 0.2.0 per research R9
git push --tags
npm publish             # if the project's release pipeline still uses npm publish
gh release create v0.2.0 --notes-from-tag   # if using GitHub releases
```

**Expected**: a tagged release at `v0.2.0` lands in the project's release pipeline (npm registry + GitHub releases). `CHANGELOG.md`'s 0.2.0 section is the binding release notes content.

---

## SC-011 — Dispatch-primitive log-emission count (failure-only)

**SC**: SC-011

**Run**: covered by Scenarios 4 (timeout), 5 (cap), 6 (kill) — each asserts EXACTLY ONE stderr line for the corresponding failure-lifecycle event AND EXACTLY ZERO additional lines from the dispatch primitive. Plus a dedicated success-path no-log assertion:

```sh
npx vitest run src/cli-adapter/_dispatch.test.ts -t "no log"
```

The test runs a synthetic-spawn `dispatchCli` happy path (exit 0, < 1 KB stdout) and asserts the captured stderr is empty (zero JSON lines from the dispatch primitive). The `bridge.shutdown` log line from `server.ts` is unaffected (it's emitted from a different layer).

---

## End-to-end manual smoke (optional but recommended before tag)

1. Run `node dist/index.js` against a real Obsidian vault.
2. From an MCP client, call `tools/list` → assert all three tools are present with correct shapes.
3. Call `read_note({ target_mode: "specific", vault: "...", file: "..." })` → success.
4. Call `read_note({ target_mode: "active" })` against a server with no active note → `ERR_NO_ACTIVE_FILE`.
5. Call `obsidian_exec({ command: "eval", parameters: { code: "1+1" } })` → success.
6. Call `obsidian_exec({ command: "<nonexistent>" })` → `CLI_NON_ZERO_EXIT` (or `CLI_REPORTED_ERROR` depending on the binary's behavior).
7. Call `help()` → success, returns the index of available tool docs.
8. Call `help({ tool_name: "read_note" })` → success, returns the full markdown content of `docs/tools/read_note.md`.
9. Send SIGINT to the server while a long-running `obsidian_exec` is in flight → child is killed; `bridge.shutdown` log line shows `inFlightKilled: true`; server exits cleanly.

If all nine smoke checks pass, the feature is ready to tag.
