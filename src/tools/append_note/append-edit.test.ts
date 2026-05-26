// Original — no upstream. append-edit pure-function cohort per BI-044 / R2 / data-model.md — table-driven over the 4 file-tail shapes × 2 inline states (8 core cases) plus line-ending preservation (FR-008), byte-stability invariants (FR-010 / FR-010a), content-verbatim assertions, and multi-line content edge cases.
import { describe, expect, it } from "vitest";

import { appendEdit, detectLineEnding } from "./append-edit.js";

describe("appendEdit — default-separator branch (8 core cases)", () => {
  it("non-newline-trailing + default → inserts LF separator (FR-006)", () => {
    expect(appendEdit("abc", "def", false)).toBe("abc\ndef");
  });

  it("LF-trailing + default → existing LF IS separator (FR-006a)", () => {
    expect(appendEdit("abc\n", "def", false)).toBe("abc\ndef");
  });

  it("CRLF-trailing + default → existing CRLF IS separator (FR-006a + FR-008)", () => {
    expect(appendEdit("abc\r\n", "def", false)).toBe("abc\r\ndef");
  });

  it("0-byte + default → no leading separator (FR-009)", () => {
    expect(appendEdit("", "def", false)).toBe("def");
  });

  it("non-newline-trailing + inline → fuses bytes directly (FR-007)", () => {
    expect(appendEdit("Partial", "Tail", true)).toBe("PartialTail");
  });

  it("LF-trailing + inline → content lands immediately after the \\n", () => {
    expect(appendEdit("abc\n", "def", true)).toBe("abc\ndef");
  });

  it("CRLF-trailing + inline → content lands immediately after the \\r\\n", () => {
    expect(appendEdit("abc\r\n", "def", true)).toBe("abc\r\ndef");
  });

  it("0-byte + inline → returns content verbatim", () => {
    expect(appendEdit("", "def", true)).toBe("def");
  });
});

describe("appendEdit — content-verbatim invariant (FR-010a)", () => {
  it("preserves caller-supplied trailing newline against non-newline-trailing file", () => {
    expect(appendEdit("prior", "new line\n", false)).toBe("prior\nnew line\n");
  });

  it("preserves caller-supplied trailing newline against LF-trailing file", () => {
    expect(appendEdit("prior\n", "new line\n", false)).toBe("prior\nnew line\n");
  });

  it("FR-006a separator-not-inserted branch preserves content suffix byte-for-byte", () => {
    const result = appendEdit("abc\n", "def", false);
    expect(result.endsWith("def")).toBe(true);
  });

  it("FR-006 separator-inserted branch ends with separator + content", () => {
    const existing = "abc";
    const content = "def";
    const result = appendEdit(existing, content, false);
    expect(result.endsWith(detectLineEnding(existing) + content)).toBe(true);
  });

  it("inline branch ends with content verbatim", () => {
    const result = appendEdit("Partial", "Tail and now finished.", true);
    expect(result.endsWith("Tail and now finished.")).toBe(true);
  });
});

describe("appendEdit — prior-content byte-stability (FR-010)", () => {
  it("startsWith existing for all non-empty branches", () => {
    const cases: Array<[string, string, boolean]> = [
      ["abc", "def", false],
      ["abc\n", "def", false],
      ["abc\r\n", "def", false],
      ["Partial", "Tail", true],
      ["abc\n", "def", true],
      ["abc\r\n", "def", true],
    ];
    for (const [existing, content, inline] of cases) {
      expect(appendEdit(existing, content, inline).startsWith(existing)).toBe(true);
    }
  });
});

describe("detectLineEnding — line-ending detection (FR-008)", () => {
  it("LF-only file → '\\n'", () => {
    expect(detectLineEnding("abc\ndef")).toBe("\n");
  });

  it("CRLF-only file → '\\r\\n'", () => {
    expect(detectLineEnding("abc\r\ndef")).toBe("\r\n");
  });

  it("mixed file with LF first → '\\n' (first-newline-wins per R2)", () => {
    expect(detectLineEnding("abc\ndef\r\nghi")).toBe("\n");
  });

  it("mixed file with CRLF first → '\\r\\n' (first-newline-wins)", () => {
    expect(detectLineEnding("abc\r\ndef\nghi")).toBe("\r\n");
  });

  it("0-byte file → '\\n' (POSIX default)", () => {
    expect(detectLineEnding("")).toBe("\n");
  });

  it("no-newline file → '\\n' (POSIX default)", () => {
    expect(detectLineEnding("no newline anywhere")).toBe("\n");
  });
});

describe("appendEdit — multi-line content edge cases", () => {
  it("default + multi-line content inserts separator before content; internal newlines preserved", () => {
    expect(appendEdit("abc", "line1\nline2", false)).toBe("abc\nline1\nline2");
  });

  it("inline + multi-line content fuses without separator; internal newlines preserved", () => {
    expect(appendEdit("abc", "line1\nline2", true)).toBe("abcline1\nline2");
  });

  it("whitespace-only content is appended verbatim under default (FR-010a)", () => {
    expect(appendEdit("abc", " ", false)).toBe("abc\n ");
  });

  it("bare-newline content is appended verbatim under default — produces 'blank line'", () => {
    expect(appendEdit("abc", "\n", false)).toBe("abc\n\n");
  });

  it("content equals trailing line break against LF-trailing file (FR-006a + FR-010a)", () => {
    expect(appendEdit("abc\n", "\n", false)).toBe("abc\n\n");
  });
});
