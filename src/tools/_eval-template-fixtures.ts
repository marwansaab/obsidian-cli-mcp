// Original — no upstream. Shared harness for the `_template.test.ts` suites that run a frozen eval template in-process: renders the template through composeEvalCode, runs it under node:vm with the globals the decode line needs plus a stub `app`, and JSON-parses what the IIFE returns (sync or async). `runEvalCode` is the vm run of already composed code on its own, used by `makeEvalRunnerSpawn` to run the code a handler sent (spec 094). Vitest-free on purpose: `_*fixtures.ts` is excluded from dist and coverage, never from type checking.
import { runInNewContext } from "node:vm";

import { composeEvalCode } from "./_shared.js";

export async function runEvalCode(code: string, app: unknown): Promise<string> {
  // setTimeout: templates that wait for Obsidian to settle (views_base's focus check, BI-0179).
  const result = runInNewContext(code, { TextDecoder, Uint8Array, atob, setTimeout, app }) as
    | string
    | Promise<string>;
  return String(await result);
}

export async function runEvalTemplate(
  template: string,
  payload: unknown,
  app: unknown,
): Promise<unknown> {
  return JSON.parse(await runEvalCode(composeEvalCode(template, payload), app));
}
