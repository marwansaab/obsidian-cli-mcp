// Original — no upstream. Schema validation tests for obsidian_exec across US1/US2/US3 fields.
import { test, expect } from "vitest";
import { obsidianExecSchema } from "./schema.js";

// --- US1 (command + parameters) ---

test("schema accepts { command: 'version' }", () => {
  const parsed = obsidianExecSchema.parse({ command: "version" });
  expect(parsed.command).toBe("version");
});

test("schema accepts command + parameters with mixed primitive value types", () => {
  const parsed = obsidianExecSchema.parse({
    command: "search",
    parameters: { query: "foo", limit: 10, silent: true },
  });
  expect(parsed.command).toBe("search");
  expect(parsed.parameters).toEqual({ query: "foo", limit: 10, silent: true });
});

test("schema rejects empty command (FR-003)", () => {
  expect(() => obsidianExecSchema.parse({ command: "" })).toThrow();
});

test("schema rejects extra unknown fields (strict)", () => {
  expect(() => obsidianExecSchema.parse({ command: "version", bogus: 1 })).toThrow();
});

test("schema rejects parameters values that are arrays", () => {
  expect(() => obsidianExecSchema.parse({ command: "x", parameters: { k: ["a", "b"] } })).toThrow();
});

test("schema rejects parameters values that are objects", () => {
  expect(() => obsidianExecSchema.parse({ command: "x", parameters: { k: { nested: 1 } } })).toThrow();
});

test("schema accepts missing parameters", () => {
  const parsed = obsidianExecSchema.parse({ command: "version" });
  expect(parsed.parameters).toBeUndefined();
});

// --- US2 (vault, flags, copy) ---

test("schema accepts vault as a non-empty string", () => {
  const parsed = obsidianExecSchema.parse({ command: "search", vault: "v" });
  expect(parsed.vault).toBe("v");
});

test("schema rejects empty vault (FR-006)", () => {
  expect(() => obsidianExecSchema.parse({ command: "search", vault: "" })).toThrow();
});

test("schema accepts bare-word flags", () => {
  const parsed = obsidianExecSchema.parse({ command: "x", flags: ["silent", "overwrite"] });
  expect(parsed.flags).toEqual(["silent", "overwrite"]);
});

test("schema rejects flags element starting with -- (FR-005)", () => {
  let captured: unknown;
  try {
    obsidianExecSchema.parse({ command: "x", flags: ["--silent"] });
  } catch (e) {
    captured = e;
  }
  expect(captured).toBeTruthy();
  const issues = (captured as { issues: { path: (string | number)[] }[] }).issues;
  expect(issues.some((i) => i.path.includes("flags") && i.path.includes(0))).toBe(true);
});

test("schema rejects empty flags element", () => {
  expect(() => obsidianExecSchema.parse({ command: "x", flags: [""] })).toThrow();
});

test("schema accepts copy: true and copy: false", () => {
  const t = obsidianExecSchema.parse({ command: "x", copy: true });
  const f = obsidianExecSchema.parse({ command: "x", copy: false });
  expect(t.copy).toBe(true);
  expect(f.copy).toBe(false);
});

test("schema accepts the all-fields-together example", () => {
  const parsed = obsidianExecSchema.parse({
    command: "read",
    parameters: { path: "Inbox/today.md" },
    vault: "work-notes",
    flags: ["silent"],
    copy: true,
  });
  expect(parsed.command).toBe("read");
  expect(parsed.vault).toBe("work-notes");
  expect(parsed.copy).toBe(true);
  expect(parsed.flags).toEqual(["silent"]);
});

// --- US3 (timeoutMs) ---

test("schema accepts timeoutMs at the boundary values", () => {
  expect(obsidianExecSchema.parse({ command: "x", timeoutMs: 1 }).timeoutMs).toBe(1);
  expect(obsidianExecSchema.parse({ command: "x", timeoutMs: 30000 }).timeoutMs).toBe(30000);
  expect(obsidianExecSchema.parse({ command: "x", timeoutMs: 120000 }).timeoutMs).toBe(120000);
});

test("schema rejects timeoutMs <= 0 (FR-008)", () => {
  expect(() => obsidianExecSchema.parse({ command: "x", timeoutMs: 0 })).toThrow();
  expect(() => obsidianExecSchema.parse({ command: "x", timeoutMs: -1 })).toThrow();
});

test("schema rejects timeoutMs above the 120000 cap (FR-008)", () => {
  expect(() => obsidianExecSchema.parse({ command: "x", timeoutMs: 120001 })).toThrow();
});

test("schema rejects non-integer timeoutMs", () => {
  expect(() => obsidianExecSchema.parse({ command: "x", timeoutMs: 1.5 })).toThrow();
});

test("schema rejects timeoutMs as a string", () => {
  expect(() => obsidianExecSchema.parse({ command: "x", timeoutMs: "30000" })).toThrow();
});
