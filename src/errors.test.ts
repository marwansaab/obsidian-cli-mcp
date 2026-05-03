// Original — no upstream. Tests for the project-wide UpstreamError class (FR-018, Principle IV).
import { test } from "node:test";
import assert from "node:assert/strict";
import { UpstreamError } from "./errors.js";

test("UpstreamError extends Error", () => {
  const e = new UpstreamError({ code: "X", cause: null, details: {} });
  assert.ok(e instanceof Error);
  assert.ok(e instanceof UpstreamError);
  assert.equal(e.name, "UpstreamError");
});

test("UpstreamError preserves code, cause, details verbatim", () => {
  const cause = { exitCode: 2, signal: null };
  const details = { argv: ["obsidian", "version"], stdout: "out", stderr: "err" };
  const e = new UpstreamError({ code: "CLI_NON_ZERO_EXIT", cause, details });
  assert.equal(e.code, "CLI_NON_ZERO_EXIT");
  assert.deepEqual(e.cause, cause);
  assert.deepEqual(e.details, details);
});

test("UpstreamError preserves explicit message when given", () => {
  const e = new UpstreamError({ code: "X", cause: null, details: {}, message: "custom msg" });
  assert.equal(e.message, "custom msg");
});

test("UpstreamError synthesizes message from code when message omitted", () => {
  const e = new UpstreamError({ code: "CLI_TIMEOUT", cause: null, details: {} });
  assert.match(e.message, /CLI_TIMEOUT/);
});

test("UpstreamError details are JSON-serializable", () => {
  const e = new UpstreamError({
    code: "CLI_OUTPUT_TOO_LARGE",
    cause: null,
    details: { argv: ["a"], stream: "stdout", limitBytes: 10485760, capturedBytes: 11000000, partial: "x" },
  });
  const json = JSON.stringify(e.details);
  const parsed = JSON.parse(json);
  assert.deepEqual(parsed, e.details);
});
