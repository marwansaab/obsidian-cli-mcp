// Original — no upstream. Spec 080 tests for the smart_connections_similar handler: the shared plugin-noise battery (plugin lines before / after / around the tagged answer, look-alikes, no answer, long no answer) plus the envelope-error-behind-noise case. Split out of handler.test.ts to keep that file under the 1000-line gate.
import { afterEach, beforeEach, expect, test } from "vitest";

import { executeSmartConnectionsSimilar } from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import {
  captureRejection,
  EVAL_NONCE_SEAM,
  evalAnswerLine,
  makeQueuedSpawn,
  noAnswerCases,
  NOISE_BEFORE,
  noisyAnswerCases,
  silentLogger,
} from "../_handler-test-fixtures.js";

function deps(spawnFn: SpawnLike) {
  return { logger: silentLogger(), queue: createQueue(), ...EVAL_NONCE_SEAM, spawnFn, env: {} };
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

const SCS_INPUT = { target_mode: "specific" as const, vault: "Demo", path: "Source/Note.md", limit: 20 };
const SCS_MATCHES = [{ path: "Topics/AI.md", headingPath: ["Overview"], score: 0.91 }];
const SCS_REAL = JSON.stringify({ ok: true, count: 1, matches: SCS_MATCHES });
const SCS_FAKE = JSON.stringify({ ok: true, count: 1, matches: [{ path: "Fake.md", headingPath: [], score: 0.1 }] });

async function scsRun(stdout: string) {
  const { spawnFn } = makeQueuedSpawn([{ stdout, exitCode: 0 }]);
  return executeSmartConnectionsSimilar(SCS_INPUT, deps(spawnFn));
}

async function scsFail(stdout: string): Promise<UpstreamError> {
  const { spawnFn } = makeQueuedSpawn([{ stdout, exitCode: 0 }]);
  return (await captureRejection(executeSmartConnectionsSimilar(SCS_INPUT, deps(spawnFn)))) as UpstreamError;
}

test.each(noisyAnswerCases(SCS_REAL, SCS_FAKE))("spec 080 $name → normal result", async ({ stdout }) => {
  expect(await scsRun(stdout)).toEqual({ count: 1, matches: SCS_MATCHES });
});

test.each(noAnswerCases(SCS_FAKE))("spec 080 $name → json-parse failure with the raw output", async ({ stdout, excerpt }) => {
  const err = await scsFail(stdout);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toEqual({ stage: "json-parse", ...excerpt });
});

test("spec 080 US1: SOURCE_NOT_INDEXED envelope behind plugin lines → its specific error", async () => {
  const err = await scsFail(
    `${NOISE_BEFORE}${evalAnswerLine('{"ok":false,"code":"SOURCE_NOT_INDEXED","detail":"Source/Note.md"}')}\n`,
  );
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({ stage: "envelope-error", code: "SOURCE_NOT_INDEXED" });
});
