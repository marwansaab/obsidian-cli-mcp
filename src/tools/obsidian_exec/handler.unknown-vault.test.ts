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
});
