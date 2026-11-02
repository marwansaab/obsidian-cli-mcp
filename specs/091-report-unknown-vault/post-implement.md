# Post-implement: 091 Report unknown vault

## T001 baseline

Branch `091-report-unknown-vault` at HEAD `c632243`, before any source edit, in PowerShell:

- `npm run typecheck`: clean.
- `npm run lint`: clean.
- `npm test`: 4466 passed, 6 skipped (4472). Coverage: statements 97.07%, branches 94.6%, functions 92.32%, lines 97.83%.

No pre-existing failure.

## Hand-off to the implementation session (2026-11-02)

The analyze session wrote T001 only. Owner ruling: `/speckit-implement` runs in the later implementation session, where `src/` is writable, so T002 onwards is deliberately left unticked. The analyze session's attempt to write under `src/` was refused by its permission settings ("File is in a directory that is denied by your permission settings."), which is expected for that session. No `src/**` file has been changed.

### Drafted T002 suite (U1–U14)

The implementation session should write this, as drafted, to `src/tools/obsidian_exec/handler.unknown-vault.test.ts` at T002. It follows contract §T and tasks T002, including the analyze I1 harness (`env: {}`, with `argv[0]` from `recorded[0].binary`). Check it against the code at HEAD before the T005 red check.

```typescript
// Original — no upstream. obsidian_exec unknown-vault rows (spec 091): a named vault whose whole stdout, trimmed, is "Vault not found." fails as CLI_REPORTED_ERROR; every other output and every call without vault is unchanged.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { executeObsidianExec, type ExecuteDeps } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import { captureRejection, makeQueuedSpawn, silentLogger, type StubResponse } from "../_handler-test-fixtures.js";

import type { ObsidianExecInput } from "./schema.js";

const UNKNOWN = "NoSuchVault";
const ANSWER = "Vault not found.";

function run(input: ObsidianExecInput, response: StubResponse, extra: Partial<ExecuteDeps> = {}) {
  const stub = makeQueuedSpawn([response]);
  const deps: ExecuteDeps = { logger: silentLogger(), queue: createQueue(), spawnFn: stub.spawnFn, env: {}, ...extra };
  return { stub, promise: executeObsidianExec(input, deps) };
}

/** The argv dispatch reports: the spawned binary, then the recorded spawn arguments. */
function argvOf(stub: ReturnType<typeof makeQueuedSpawn>): string[] {
  const call = stub.recorded[0]!;
  return [call.binary, ...call.argv];
}

/** Asserts the E-1 failure (contract §E) for one call. */
async function expectUnknownVault(
  input: ObsidianExecInput,
  response: StubResponse & { stdout: string },
  extra: Partial<ExecuteDeps> = {},
): Promise<ReturnType<typeof makeQueuedSpawn>> {
  const { stub, promise } = run(input, response, extra);
  const err = (await captureRejection(promise)) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect({ code: err.code, message: err.message, cause: err.cause, details: err.details }).toEqual({
    code: "CLI_REPORTED_ERROR",
    message: ANSWER,
    cause: null,
    details: {
      argv: argvOf(stub),
      command: input.command,
      stdout: response.stdout,
      stderr: response.stderr ?? "",
      exitCode: 0,
      message: ANSWER,
    },
  });
  return stub;
}

/** Asserts the call resolves with the stub's own output, unchanged (contract E-2). */
async function expectUnchangedSuccess(
  input: ObsidianExecInput,
  response: StubResponse & { stdout: string },
  extra: Partial<ExecuteDeps> = {},
): Promise<void> {
  const { stub, promise } = run(input, response, extra);
  const out = await promise;
  expect(out).toEqual({ stdout: response.stdout, stderr: response.stderr ?? "", exitCode: 0, argv: argvOf(stub) });
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("obsidian_exec — a named unknown vault fails (spec 091 US1)", () => {
  it("U1: the CLI's answer fails as CLI_REPORTED_ERROR with the raw tool's details; spawned once", async () => {
    const stub = await expectUnknownVault({ command: "files", vault: UNKNOWN }, { stdout: `${ANSWER}\n`, exitCode: 0 });
    expect(stub.recorded[0]!.argv).toEqual([`vault=${UNKNOWN}`, "files"]);
    expect(stub.getCount()).toBe(1);
  });

  it("U2: surrounding blank lines and whitespace (CRLF) still fail; details.stdout stays untrimmed", async () => {
    await expectUnknownVault({ command: "files", vault: UNKNOWN }, { stdout: `\r\n  ${ANSWER}\r\n\n`, exitCode: 0 });
  });

  it("U3: the answer without a line break fails", async () => {
    await expectUnknownVault({ command: "files", vault: UNKNOWN }, { stdout: ANSWER, exitCode: 0 });
  });

  it.each<ObsidianExecInput>([
    { command: "read", parameters: { path: "a.md" }, vault: UNKNOWN },
    { command: "search", parameters: { query: "x" }, vault: UNKNOWN },
    { command: "version", vault: UNKNOWN },
    { command: "help", vault: UNKNOWN },
    { command: "vaults", vault: UNKNOWN },
    { command: "tags", vault: UNKNOWN },
    { command: "notacommand", vault: UNKNOWN },
  ])("U4: `$command` fails the same way (research F1)", async (input) => {
    await expectUnknownVault(input, { stdout: `${ANSWER}\n`, exitCode: 0 });
  });

  it("U5: an allowed eval with no `=> ` answer fails", async () => {
    await expectUnknownVault(
      { command: "eval", parameters: { code: "1+1" }, vault: UNKNOWN },
      { stdout: `${ANSWER}\n`, exitCode: 0 },
      { allowEval: true },
    );
  });

  it("U13: a non-empty stderr is carried in details.stderr", async () => {
    await expectUnknownVault({ command: "files", vault: UNKNOWN }, { stdout: `${ANSWER}\n`, stderr: "warn\n", exitCode: 0 });
  });
});

describe("obsidian_exec — other output is unchanged (spec 091 US3)", () => {
  it("U6: a known vault's output that starts with the sentence and goes on succeeds", async () => {
    await expectUnchangedSuccess(
      { command: "read", parameters: { path: "a.md" }, vault: "Known" },
      { stdout: `${ANSWER}\nmore text\n`, exitCode: 0 },
    );
  });

  it("U7: the sentence after other text on the line succeeds", async () => {
    await expectUnchangedSuccess(
      { command: "search", parameters: { query: "x" }, vault: "Known" },
      { stdout: `Result: ${ANSWER} here\n`, exitCode: 0 },
    );
  });

  it("U8: the sentence on a later line succeeds", async () => {
    await expectUnchangedSuccess(
      { command: "read", parameters: { path: "a.md" }, vault: "Known" },
      { stdout: `first line\n${ANSWER}\n`, exitCode: 0 },
    );
  });

  it.each(["vault not found.\n", "Vault not found\n"])("U9: a different spelling (%j) succeeds", async (stdout) => {
    await expectUnchangedSuccess({ command: "files", vault: "Known" }, { stdout, exitCode: 0 });
  });

  it("U10: a call without vault (focused vault) succeeds on the exact sentence", async () => {
    await expectUnchangedSuccess({ command: "files" }, { stdout: `${ANSWER}\n`, exitCode: 0 });
  });

  it("U11: a vault passed in parameters does not name a vault (research F2) and succeeds", async () => {
    await expectUnchangedSuccess({ command: "files", parameters: { vault: UNKNOWN } }, { stdout: `${ANSWER}\n`, exitCode: 0 });
  });

  it("U12: an allowed eval whose output has a `=> ` answer succeeds (FR-005)", async () => {
    await expectUnchangedSuccess(
      { command: "eval", parameters: { code: "1+1" }, vault: "Known" },
      { stdout: `${ANSWER}\n=> 2\n`, exitCode: 0 },
      { allowEval: true },
    );
  });
});

describe("obsidian_exec — other failures keep their classification (spec 091 FR-006)", () => {
  it("U14a: a non-zero exit stays CLI_NON_ZERO_EXIT", async () => {
    const { stub, promise } = run({ command: "files", vault: UNKNOWN }, { stdout: `${ANSWER}\n`, exitCode: 1 });
    const err = (await captureRejection(promise)) as UpstreamError;
    expect(err.code).toBe("CLI_NON_ZERO_EXIT");
    expect(err.details).toEqual({
      argv: argvOf(stub),
      command: "files",
      stdout: `${ANSWER}\n`,
      stderr: "",
      exitCode: 1,
      signal: null,
    });
  });

  it("U14b: an `Error:` answer stays dispatch's CLI_REPORTED_ERROR, with its default message", async () => {
    const { stub, promise } = run({ command: "files", vault: UNKNOWN }, { stdout: "Error: something\n", exitCode: 0 });
    const err = (await captureRejection(promise)) as UpstreamError;
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.message).toBe("CLI bridge upstream error: CLI_REPORTED_ERROR");
    expect(err.details).toEqual({
      argv: argvOf(stub),
      command: "files",
      stdout: "Error: something\n",
      stderr: "",
      exitCode: 0,
      message: "Error: something",
    });
  });

  it("U14c: a blocked command naming an unknown vault is refused before any spawn", async () => {
    const stub = makeQueuedSpawn([]);
    const err = (await captureRejection(
      executeObsidianExec(
        { command: "eval", vault: UNKNOWN },
        { logger: silentLogger(), queue: createQueue(), spawnFn: stub.spawnFn, env: {} },
      ),
    )) as UpstreamError;
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details).toMatchObject({ code: "COMMAND_BLOCKED", command: "eval" });
    expect(stub.getCount()).toBe(0);
  });
});
```

Notes for the implementation session:

- `captureRejection` returns the "expected rejection but promise resolved" `Error` when a call succeeds, so the T005 red check shows U1–U5 and U13 failing on the `toBeInstanceOf(UpstreamError)` assertion. Confirm that this is the failure reason recorded, and that no row fails with `CLI_BINARY_NOT_FOUND`.
- In U14c, `makeQueuedSpawn([])` counts an overflow attempt in `getCount()`, so a count of 0 proves that nothing was spawned.

## T002–T004 rows written

- T002: `src/tools/obsidian_exec/handler.unknown-vault.test.ts` written from the drafted suite above, unchanged (U1–U14; 23 tests with the `it.each` expansions).
- T003: `describe("invokeBoundedCli — unknown-vault answer (spec 091)")` with B1 and B2 appended to `src/cli-adapter/invoke-bounded-cli.test.ts`; header phrase added; `invokeCli` imported from `./cli-adapter.js`.
- T004: R1 appended to the `handler integration via registerTool` describe in `src/tools/obsidian_exec/index.test.ts`.

## T005 red check

`npx vitest run src/tools/obsidian_exec src/cli-adapter/invoke-bounded-cli.test.ts` before any production change: 15 failed, 107 passed (122), 3 of 5 files failed.

Failing rows, each because the call resolved (the vault check is missing); none failed with `CLI_BINARY_NOT_FOUND` or any other rejection:

- U1, U2, U3, U4 (×7: read, search, version, help, vaults, tags, notacommand), U5, U13: `AssertionError: expected Error: expected rejection but promise res… to be an instance of UpstreamError` (the `captureRejection` sentinel).
- B1, B2: `Error: expected rejection but promise resolved` (the file's `pendingRejection`; B2 fails on the raw facade's call).
- R1: `AssertionError: expected undefined to be true` on `result.isError`.

Passing: U6–U12 (U9 ×2), U14a, U14b, U14c, and every pre-existing test in the five files. Outcome matches the T005 expectation.

## T006–T007 code change

- T006: `src/cli-adapter/invoke-bounded-cli.ts` gains `import { UpstreamError } from "../errors.js";` (after the `_dispatch.js` value import, ahead of the `import type` lines), the private `UNKNOWN_VAULT_ANSWER` constant with its comment, the check inside `deps.queue.run` after `dispatchCli` resolves, and the spec 091 header sentence. `dispatchInput`, the `dispatchCli` deps object, the queue options and every export are unchanged.
- T007: one comment line above `UNKNOWN_VAULT_PREFIX` in `src/cli-adapter/cli-adapter.ts`; no code change, `runTyped` byte-identical.

## T008 US1

`npx vitest run src/tools/obsidian_exec/handler.unknown-vault.test.ts src/cli-adapter/invoke-bounded-cli.test.ts` (run together with T009's wider set and a verbose pass over the three touched suites): U1–U14 (all 23 expansions) and B1 pass.

## T009 US2

`npx vitest run src/cli-adapter src/tools/obsidian_exec`: 9 files, 282 tests, all passed. B2 and R1 pass. Every existing `cli-adapter.test.ts` `Vault not found.` row passes unchanged (the file is untouched; FR-008).

## T010 US3

- Same run: U6–U12 (U9 ×2) and U14a–c pass after T006, as at T005.
- `git diff --stat main -- src/tools/obsidian_exec/handler.test.ts src/tools/obsidian_exec/schema.test.ts src/cli-adapter/cli-adapter.test.ts src/cli-adapter/_dispatch.test.ts` is empty (§X).

## T011 description

`OBSIDIAN_EXEC_DESCRIPTION` in `src/tools/obsidian_exec/index.ts` set to contract §H1: `unknown vault, ` inserted after `in-band Error: prefix, `. Header and every other line unchanged.

## T012 surface gate

1. `npx vitest run src/tools/_register` after T011: 1 failed (`registry: stability baseline (FR-018) > live registry fingerprints match the checked-in baseline`), the diff naming `"name": "obsidian_exec"` only; 94 passed.
2. `npm run baseline:write`: "Wrote 35 entries".
3. `git diff src/tools/_register-baseline.json`: the `obsidian_exec` entry's `descriptionFingerprint` (`664816d0…` → `5b39038e…`) is the only tool fingerprint that moved. The file's `generatedFromBranch` header also moved (`090-classify-missing-destination` → `091-report-unknown-vault`), which the generator writes on every regeneration, as in every earlier feature's baseline commit; it is metadata, not a tool fingerprint, so P2 holds. `generatedAt` is unchanged (`2026-11-02`).
4. Re-run: 3 files, 95 tests, all passed.

## T013–T014 docs

- `docs/tools/obsidian_exec.md`: §H4 sentence in the "Freeform escape hatch" note, §H3 example in the existing `CLI_REPORTED_ERROR` row, and the §H2 row inserted directly after it, word for word.
- `CHANGELOG.md`: `Spec 091-report-unknown-vault (BI-0173).` after `Spec 090-classify-missing-destination.`, and the §C bullet as the first under the Unreleased `### Fixed`, word for word.

## T015 full gate

`npm run typecheck`: clean. `npm run lint`: clean. `npm test`: 191 files passed, 1 skipped; 4492 passed, 6 skipped (4498), up from 4466 at T001 by the 26 new tests (23 U rows, B1, B2, R1). Coverage: statements 97.07%, branches 94.61%, functions 92.32%, lines 97.84%, at or above the `vitest.config.ts` floor (no threshold error). No pre-existing test failed.

## T016 live check

Followed `.memory/test-execution-instructions.md`. `npm run build` passed. Pre-state: `Sandbox/` had 13 entries (`BI-0008, BI-0016, BI-0165, BI-0168, BV, TC-00005, TC-00030, TC-00033, TC-00034, TN, pr3-check-2026-10-30.md, Serial-focus.md, TC-00038-focus.md`); `Welcome.md` SHA-256 `94194952…C8D5`; no `.trash/`. Seeded `Sandbox/091-probe/first-line.md` with `Vault not found.\nSecond line.\n` (LF, no BOM; SHA-256 `35D77298…1EA6`).

The calls went through the built server (`node dist/index.js` over stdio, raw JSON-RPC, protocol `2025-06-18`, driver script kept outside the repository and deleted afterwards), as in spec 090's live check; the MCP client's own `obsidian-cli-mcp-local` registration was not reloaded from this unattended session. Unknown vault: `NoSuchVault-091` only. Verbatim results (`content[0].text`):

- **L1** `obsidian_exec` `{ command: "files", vault: "NoSuchVault-091" }`, `isError: true`:
  `{"code":"CLI_REPORTED_ERROR","message":"Vault not found.","details":{"argv":["obsidian","vault=NoSuchVault-091","files"],"command":"files","stdout":"Vault not found.\n","stderr":"","exitCode":0,"message":"Vault not found."}}`
- **L2** `files` `{ target_mode: "specific", vault: "NoSuchVault-091" }`, `isError: true`:
  `{"code":"CLI_REPORTED_ERROR","message":"Vault not found.","details":{"command":"files","stdout":"Vault not found.\n","stderr":"","exitCode":0,"message":"Vault not found."}}`
  `code`, `message` and `details.message` equal L1's.
- **L3** `obsidian_exec` `{ command: "version", vault: "NoSuchVault-091" }`, `isError: true`:
  `{"code":"CLI_REPORTED_ERROR","message":"Vault not found.","details":{"argv":["obsidian","vault=NoSuchVault-091","version"],"command":"version","stdout":"Vault not found.\n","stderr":"","exitCode":0,"message":"Vault not found."}}`
- **L4** `obsidian_exec` `{ command: "files", vault: "TestVault-Obsidian-CLI-MCP", parameters: { folder: "Sandbox" } }`, `isError: false`: `stdout` is the Sandbox listing, one vault-relative path per line, starting `Sandbox/091-probe/first-line.md\nSandbox/BI-0008/tc-00425-path.md\n…` and ending `…Sandbox/TN/G4/sp.md\n`; `"stderr":"","exitCode":0,"argv":["obsidian","vault=TestVault-Obsidian-CLI-MCP","files","folder=Sandbox"]`.
- **L5** `obsidian_exec` `{ command: "read", vault: "TestVault-Obsidian-CLI-MCP", parameters: { path: "Sandbox/091-probe/first-line.md" } }`, `isError: false`:
  `{"stdout":"Vault not found.\nSecond line.\n","stderr":"","exitCode":0,"argv":["obsidian","vault=TestVault-Obsidian-CLI-MCP","read","path=Sandbox/091-probe/first-line.md"]}`
  `stdout` is the fixture's text.
- **L6** `obsidian_exec` `{ command: "version" }`, `isError: false`:
  `{"stdout":"1.14.5 (installer 1.14.4)\n","stderr":"","exitCode":0,"argv":["obsidian","version"]}`

Every row matches contract §L. Cleanup: `Sandbox/091-probe/` deleted; `Sandbox/` back to the same 13 entries; `Welcome.md` hash unchanged; no `.trash/`. No residue.

## T017 structural check

`codegraph sync`, then `codegraph_explore "invokeBoundedCli executeObsidianExec UpstreamError UNKNOWN_VAULT_ANSWER"`:

1. **Codes**: no new error class or top-level code. `git diff --stat main -- src/errors.ts` is empty. The one new `new UpstreamError` (`invoke-bounded-cli.ts:86`) uses the existing `CLI_REPORTED_ERROR`, with no `details.code` / `details.reason`.
2. **DI**: `git diff --stat main -- src/server.ts` is empty, and no `handler.ts` under `src/tools/` mentions `createLogger` or `createQueue`. Kernel-node touch as the plan claimed: `createServer()`, `createLogger()` and `createQueue()` untouched; `UpstreamError` not edited, one new construction site.
3. **Imports**: `invoke-bounded-cli.ts` imports `./_dispatch.js` (value `dispatchCli` plus types), `../errors.js` (`UpstreamError`) and the types `Logger` and `Queue`; all downward. It does not import `cli-adapter.ts`, and no production file under `src/cli-adapter/` imports from `src/tools/`.
4. **No orphans**: `UNKNOWN_VAULT_ANSWER` (`invoke-bounded-cli.ts:22`) is not exported; its only references are inside `invokeBoundedCli` (lines 85, 95, 97), and the index shows its single caller is `invokeBoundedCli`. The change adds no production export. `invokeBoundedCli`'s production caller is still `executeObsidianExec` alone; the new test file is among its tests.

No structural deviation.

## T018 close-out: spec traceability

| Requirement | Proved by |
|---|---|
| FR-001 (a named unknown vault fails) | U1–U5, U13 (T008); L1, L3 (T016) |
| FR-002 (same code and message as the typed tools) | U1 `toEqual`, B2 (T008/T009); L1 vs L2 (T016) |
| FR-003 (raw tool's `details` with `message`) | U1, U2, U13 whole-`details` `toEqual` (T008) |
| FR-004 (other output unchanged) | U6–U11 (T010); L4, L5 (T016) |
| FR-005 (eval answers unchanged) | U12 (T010) |
| FR-006 (other failures unchanged) | U14a–c (T010) plus the unchanged facade suites for timeout, output cap, cancellation and missing binary (T009, T015) |
| FR-007 (no retry, no launch) | U1 spawn count 1, B1 one spawn and `launches === 0` (T008) |
| FR-008 (typed tools unchanged) | B2 and the untouched `cli-adapter.test.ts` rows and typed-tool suites (T009, T015); `runTyped` byte-identical (T007) |
| FR-009 (description) | §H1 (T011); baseline gate P1/P2 (T012) |
| SC-001 | U1–U5 (T008); L1, L3 (T016) |
| SC-002 | B2 (T009); L2 (T016) |
| SC-003 | U6–U11 (T010); L4, L5, L6 (T016) |
| SC-004 | R1 `isError` (T009); L1 (T016) |
| SC-005 | §X: no existing test edited (T010 diff), full suite green (T015) |

Every task T001–T018 is complete and marked `[X]` in tasks.md.
