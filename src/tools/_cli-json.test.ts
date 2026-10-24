// Original — no upstream. Tests for the shared CLI JSON decode: a valid document parses, and
// unparseable stdout surfaces as CLI_REPORTED_ERROR with the labelled message, the parser error as
// cause, and `details: { stage: "json-parse", stdout }`.
import { expect, test } from "vitest";

import { parseCliJson } from "./_cli-json.js";
import { UpstreamError } from "../errors.js";

test("returns the parsed value for valid JSON", () => {
  expect(parseCliJson('[{ "a": 1 }]', "Thing")).toEqual([{ a: 1 }]);
});

test("unparseable stdout → CLI_REPORTED_ERROR json-parse carrying the full stdout", () => {
  let caught: unknown;
  try {
    parseCliJson("not json", "Thing");
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(UpstreamError);
  const err = caught as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.message).toMatch(/^Thing JSON parse failed: /);
  expect(err.cause).toBeInstanceOf(SyntaxError);
  expect(err.details).toEqual({ stage: "json-parse", stdout: "not json" });
});
