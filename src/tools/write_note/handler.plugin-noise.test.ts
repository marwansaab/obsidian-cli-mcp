// Original — no upstream. write_note handler tests for spec 080 (tolerate plugin noise): plugin output around the active-mode focused-file eval answer, run as the shared noisyAnswerCases / noAnswerCases battery. write_note stands for the file cohort, which resolves through resolveActiveFocusedFile and attaches the full raw output on a parse failure. Split from handler.test.ts to keep each file under 1000 lines; shared fixtures live in _handler-fixtures.ts.
import { afterEach, beforeEach, expect, test } from "vitest";

import { deps, EVAL_OK, fakeFs, fakeRegistry, VAULT_ROOT } from "./_handler-fixtures.js";
import { executeWriteNote } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { makeQueuedSpawn, noAnswerCases, noisyAnswerCases } from "../_handler-test-fixtures.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

const FOCUSED_REAL = JSON.stringify({ path: "Daily/today.md", base: VAULT_ROOT });
const FOCUSED_FAKE = JSON.stringify({ path: "Other/fake.md", base: VAULT_ROOT });

async function activeWrite(focusedStdout: string) {
  const fs = fakeFs({ stat: async () => ({ size: 4 }) });
  const { spawnFn } = makeQueuedSpawn([{ stdout: focusedStdout, exitCode: 0 }, EVAL_OK]);
  return executeWriteNote(
    { target_mode: "active", content: "rewritten", overwrite: true },
    deps({ spawnFn, vaultRegistry: fakeRegistry({}), fs }),
  );
}

// US1 (T021), US3 (T037) check 1, US4 (T040), US5
test.each(noisyAnswerCases(FOCUSED_REAL, FOCUSED_FAKE))("spec 080 $name → normal write", async ({ stdout }) => {
  const result = await activeWrite(stdout);
  expect(result).toEqual({ created: false, path: "Daily/today.md", bytes_written: 5 });
});

// US3 (T037) checks 2–4: the full raw output, never stdoutTail
test.each(noAnswerCases(FOCUSED_FAKE))("spec 080 $name → CLI_REPORTED_ERROR json-parse with the full raw output", async ({ stdout }) => {
  const err = (await activeWrite(stdout).catch((e: unknown) => e)) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toEqual({ stage: "json-parse", stdout });
});
