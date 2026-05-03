// Original — no upstream. Schema validation tests for obsidian_exec (US1 fields only — command + parameters; vault/flags/copy/timeoutMs land in US2/US3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { obsidianExecSchema } from "./schema.js";

test("schema accepts { command: 'version' }", () => {
  const parsed = obsidianExecSchema.parse({ command: "version" });
  assert.equal(parsed.command, "version");
});

test("schema accepts command + parameters with mixed primitive value types", () => {
  const parsed = obsidianExecSchema.parse({
    command: "search",
    parameters: { query: "foo", limit: 10, silent: true },
  });
  assert.equal(parsed.command, "search");
  assert.deepEqual(parsed.parameters, { query: "foo", limit: 10, silent: true });
});

test("schema rejects empty command (FR-003)", () => {
  assert.throws(() => obsidianExecSchema.parse({ command: "" }));
});

test("schema rejects extra unknown fields (strict)", () => {
  assert.throws(() => obsidianExecSchema.parse({ command: "version", bogus: 1 }));
});

test("schema rejects parameters values that are arrays", () => {
  assert.throws(() => obsidianExecSchema.parse({ command: "x", parameters: { k: ["a", "b"] } }));
});

test("schema rejects parameters values that are objects", () => {
  assert.throws(() => obsidianExecSchema.parse({ command: "x", parameters: { k: { nested: 1 } } }));
});

test("schema accepts missing parameters", () => {
  const parsed = obsidianExecSchema.parse({ command: "version" });
  assert.equal(parsed.parameters, undefined);
});

// --- US2 cases (vault, flags, copy) ---

test("schema accepts vault as a non-empty string", () => {
  const parsed = obsidianExecSchema.parse({ command: "search", vault: "v" });
  assert.equal(parsed.vault, "v");
});

test("schema rejects empty vault (FR-006)", () => {
  assert.throws(() => obsidianExecSchema.parse({ command: "search", vault: "" }));
});

test("schema accepts bare-word flags", () => {
  const parsed = obsidianExecSchema.parse({ command: "x", flags: ["silent", "overwrite"] });
  assert.deepEqual(parsed.flags, ["silent", "overwrite"]);
});

test("schema rejects flags element starting with -- (FR-005)", () => {
  let captured: unknown;
  try {
    obsidianExecSchema.parse({ command: "x", flags: ["--silent"] });
  } catch (e) {
    captured = e;
  }
  assert.ok(captured, "parse threw");
  const issues = (captured as { issues: { path: (string | number)[] }[] }).issues;
  assert.ok(issues.some((i) => i.path.includes("flags") && i.path.includes(0)), "issue path includes flags index 0");
});

test("schema rejects empty flags element", () => {
  assert.throws(() => obsidianExecSchema.parse({ command: "x", flags: [""] }));
});

test("schema accepts copy: true and copy: false", () => {
  const t = obsidianExecSchema.parse({ command: "x", copy: true });
  const f = obsidianExecSchema.parse({ command: "x", copy: false });
  assert.equal(t.copy, true);
  assert.equal(f.copy, false);
});

test("schema accepts the all-fields-together example", () => {
  const parsed = obsidianExecSchema.parse({
    command: "read",
    parameters: { path: "Inbox/today.md" },
    vault: "work-notes",
    flags: ["silent"],
    copy: true,
  });
  assert.equal(parsed.command, "read");
  assert.equal(parsed.vault, "work-notes");
  assert.equal(parsed.copy, true);
  assert.deepEqual(parsed.flags, ["silent"]);
});

// --- US3 cases (timeoutMs) ---

test("schema accepts timeoutMs at the boundary values", () => {
  assert.equal(obsidianExecSchema.parse({ command: "x", timeoutMs: 1 }).timeoutMs, 1);
  assert.equal(obsidianExecSchema.parse({ command: "x", timeoutMs: 30000 }).timeoutMs, 30000);
  assert.equal(obsidianExecSchema.parse({ command: "x", timeoutMs: 120000 }).timeoutMs, 120000);
});

test("schema rejects timeoutMs <= 0 (FR-008)", () => {
  assert.throws(() => obsidianExecSchema.parse({ command: "x", timeoutMs: 0 }));
  assert.throws(() => obsidianExecSchema.parse({ command: "x", timeoutMs: -1 }));
});

test("schema rejects timeoutMs above the 120000 cap (FR-008)", () => {
  assert.throws(() => obsidianExecSchema.parse({ command: "x", timeoutMs: 120001 }));
});

test("schema rejects non-integer timeoutMs", () => {
  assert.throws(() => obsidianExecSchema.parse({ command: "x", timeoutMs: 1.5 }));
});

test("schema rejects timeoutMs as a string", () => {
  assert.throws(() => obsidianExecSchema.parse({ command: "x", timeoutMs: "30000" }));
});
