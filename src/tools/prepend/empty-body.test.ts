// Original — no upstream. Tests for landedAtEmptyBody, the spec 076 predicate that tells whether
// Obsidian's prepend landed at the very end of a note with no body (research D2).
import { describe, expect, test } from "vitest";

import { landedAtEmptyBody } from "./empty-body.js";

describe("landedAtEmptyBody — empty notes (spec 076 US1)", () => {
  test.each([
    ["", "first", "first\n"],
    ["", "first\n", "first\n\n"],
    ["", "first\r\n", "first\r\n\n"],
    ["", "café", "café\n"],
  ])("true: before %j, content %j, after %j", (before, content, after) => {
    expect(landedAtEmptyBody(before, content, after)).toBe(true);
  });

  test.each([
    ["inline-shaped (no added LF)", "", "first", "first"],
    ["another writer changed the note", "", "first", "first\nX"],
    ["Obsidian did not write", "", "first", ""],
  ])("false: %s", (_label, before, content, after) => {
    expect(landedAtEmptyBody(before, content, after)).toBe(false);
  });
});

describe("landedAtEmptyBody — notes with a body", () => {
  test.each([
    ["text body", "abc", "def", "def\nabc"],
    ["a lone line break is a body", "\n", "first", "first\n\n"],
  ])("false: %s", (_label, before, content, after) => {
    expect(landedAtEmptyBody(before, content, after)).toBe(false);
  });
});

describe("landedAtEmptyBody — ambiguity guard (research D2)", () => {
  test("false when the note ends with the primitive root of content + LF", () => {
    expect(landedAtEmptyBody("x\n", "x", "x\nx\n")).toBe(false);
  });

  test("false when the primitive root is shorter than content + LF", () => {
    expect(landedAtEmptyBody("x\n", "x\nx", "x\nx\nx\n")).toBe(false);
  });
});

describe("landedAtEmptyBody — properties-only notes (spec 076 US3)", () => {
  test.each([
    ["LF", "---\nkey: v\n---\n", "Lead", "---\nkey: v\n---\nLead\n"],
    ["CRLF", "---\r\nkey: v\r\n---\r\n", "Lead", "---\r\nkey: v\r\n---\r\nLead\n"],
    ["no line break after the closing ---", "---\nkey: v\n---", "Lead", "---\nkey: v\n---Lead\n"],
  ])("true: %s", (_label, before, content, after) => {
    expect(landedAtEmptyBody(before, content, after)).toBe(true);
  });

  test.each([
    ["a note with a body", "---\nkey: v\n---\nbody", "Lead", "---\nkey: v\n---\nLead\nbody"],
    ["a blank body", "---\nkey: v\n---\n\n", "Lead", "---\nkey: v\n---\nLead\n\n"],
    ["ambiguity case E12", "---\nkey: v\n---\n", "---", "---\nkey: v\n---\n---\n"],
  ])("false: %s", (_label, before, content, after) => {
    expect(landedAtEmptyBody(before, content, after)).toBe(false);
  });
});
