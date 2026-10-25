// Original — no upstream. Co-located tests for the shared `format=json` stdout decode (068 / PR #85
// review). The outline, properties and tags suites pin the per-tool messages; these cases pin the
// helper's contract directly.
import { expect, test } from "vitest";

import { parseCliJson } from "./_cli-json.js";
import { UpstreamError } from "../errors.js";

test("returns the parsed value for valid JSON", () => {
  expect(parseCliJson('[{"a":1}]', "Sample")).toEqual([{ a: 1 }]);
});

test("non-JSON throws CLI_REPORTED_ERROR with the label-prefixed message, the json-parse stage and the SyntaxError cause", () => {
  let caught: unknown;
  try {
    parseCliJson("not json", "Sample");
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(UpstreamError);
  const err = caught as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.message).toMatch(/^Sample JSON parse failed: /);
  expect(err.details).toEqual({ stage: "json-parse", stdout: "not json" });
  expect(err.cause).toBeInstanceOf(SyntaxError);
});
