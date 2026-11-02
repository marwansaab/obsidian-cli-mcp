// Original — no upstream. Shared harness for the `_template.test.ts` suites that run a frozen eval template in-process: renders the template through composeEvalCode, runs it under node:vm with the globals the decode line needs plus a stub `app`, and JSON-parses what the IIFE returns (sync or async). Vitest-free on purpose: `_*fixtures.ts` is excluded from dist and coverage, never from type checking.
import { runInNewContext } from "node:vm";

import { composeEvalCode } from "./_shared.js";

export async function runEvalTemplate(
  template: string,
  payload: unknown,
  app: unknown,
): Promise<unknown> {
  const code = composeEvalCode(template, payload);
  const result = runInNewContext(code, { TextDecoder, Uint8Array, atob, app }) as
    | string
    | Promise<string>;
  return JSON.parse(await result);
}
