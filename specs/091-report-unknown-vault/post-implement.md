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
