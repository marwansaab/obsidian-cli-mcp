// Original — no upstream. Tests for the schema-layer structural path-safety validator per ADR-009 / FR-013 — accepts safe vault-relative paths; rejects ../ segments, leading absolute markers, drive letters, control chars, and DEL (per T002 (d) decision 2026-05-10).
import { expect, test } from "vitest";

import {
  isStructurallySafePath,
  STRUCTURALLY_UNSAFE_PATH_MESSAGE,
} from "./schema.js";

// (1) Plain vault-relative path accepted
test("plain vault-relative path accepted", () => {
  expect(isStructurallySafePath("Daily/2026-05-10.md")).toBe(true);
});

// (2) Path with spaces and Unicode accepted
test("spaces + Unicode accepted", () => {
  expect(isStructurallySafePath("Notes/My Note 📝.md")).toBe(true);
});

// (3) Path with brackets / parens accepted
test("brackets and parens accepted", () => {
  expect(isStructurallySafePath("[[wiki]]/note (2).md")).toBe(true);
});

// (4) ../escape.md rejected
test("'../escape.md' rejected", () => {
  expect(isStructurallySafePath("../escape.md")).toBe(false);
});

// (5) a/../escape.md rejected
test("'a/../escape.md' rejected (mid-path traversal)", () => {
  expect(isStructurallySafePath("a/../escape.md")).toBe(false);
});

// (6) a/../../escape.md rejected
test("'a/../../escape.md' rejected (multi traversal)", () => {
  expect(isStructurallySafePath("a/../../escape.md")).toBe(false);
});

// (7) /abs/path.md rejected (POSIX leading slash)
test("'/abs/path.md' rejected", () => {
  expect(isStructurallySafePath("/abs/path.md")).toBe(false);
});

// (8) \\abs\\path.md rejected (Windows leading backslash)
test("'\\\\abs\\\\path.md' rejected", () => {
  expect(isStructurallySafePath("\\abs\\path.md")).toBe(false);
});

// (9) C:/path.md rejected (drive-letter, forward slash)
test("'C:/path.md' rejected", () => {
  expect(isStructurallySafePath("C:/path.md")).toBe(false);
});

// (10) c:\\path.md rejected (drive-letter, backslash, lowercase)
test("'c:\\\\path.md' rejected", () => {
  expect(isStructurallySafePath("c:\\path.md")).toBe(false);
});

// (11) Path with control characters rejected
test("control characters [\\x00-\\x1f] rejected", () => {
  expect(isStructurallySafePath("a\x00b.md")).toBe(false);
  expect(isStructurallySafePath("a\x07b.md")).toBe(false);
  expect(isStructurallySafePath("a\x1fb.md")).toBe(false);
});

// (12) Empty string rejected (z.string().min(1) refinement boundary)
test("empty string rejected", () => {
  expect(isStructurallySafePath("")).toBe(false);
});

// (13) DEL (\x7f) rejected per T002 (d) decision 2026-05-10
test("DEL character (\\x7f) rejected (T002 (d) extension)", () => {
  expect(isStructurallySafePath("a\x7fb.md")).toBe(false);
});

// Tripping rejection-message export (consumed by callers as zod error message)
test("STRUCTURALLY_UNSAFE_PATH_MESSAGE is a non-empty string", () => {
  expect(typeof STRUCTURALLY_UNSAFE_PATH_MESSAGE).toBe("string");
  expect(STRUCTURALLY_UNSAFE_PATH_MESSAGE.length).toBeGreaterThan(0);
});
