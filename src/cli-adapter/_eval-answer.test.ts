// Original — no upstream. Tests for the eval answer tag and stdout line scanning (spec 080, contract A1–A5, C2–C3).
import { describe, expect, it } from "vitest";

import {
  EVAL_ANSWER_PREFIX,
  findAnswer,
  findErrorLine,
  findNoActiveFileLine,
  mintAnswerTag,
  stdoutLines,
  wrapEvalCode,
} from "./_eval-answer.js";

const TAG = "ocm-11111111-2222-3333-4444-555555555555";

describe("wrapEvalCode (A1)", () => {
  it("wraps the code exactly", () => {
    expect(wrapEvalCode("app.vault.getName()", TAG)).toBe(
      `(async()=>'<<${TAG}>>'+(await (app.vault.getName())))()`,
    );
  });

  it("evaluates to the tag followed by the awaited value", async () => {
    const wrapped = wrapEvalCode("(async()=>JSON.stringify({a:1}))()", TAG);
    const value: unknown = await (new Function("return " + wrapped) as () => Promise<unknown>)();
    expect(value).toBe(`<<${TAG}>>{"a":1}`);
  });
});

describe("mintAnswerTag", () => {
  it("returns ocm- plus a UUID", () => {
    expect(mintAnswerTag()).toMatch(/^ocm-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("mints a different tag each call", () => {
    const tags = new Set(Array.from({ length: 50 }, () => mintAnswerTag()));
    expect(tags.size).toBe(50);
  });
});

describe("stdoutLines", () => {
  it("splits on \\n, drops one trailing \\r and leading whitespace", () => {
    expect(stdoutLines("  a\r\n\tb\r\r\nc")).toEqual(["a", "b\r", "c"]);
  });
});

describe("findAnswer (A2, A3, A5)", () => {
  const answer = `${EVAL_ANSWER_PREFIX}<<${TAG}>>{"ok":true}`;

  it("returns the body of the tagged line after leading noise", () => {
    expect(findAnswer(`plugin line\n[warn] x\nError: plugin says no\n${answer}\n`, TAG)).toBe('{"ok":true}');
  });

  it("ignores untagged look-alikes before and after the answer", () => {
    expect(findAnswer(`=> {"ok":false}\n${answer}\n=> {"ok":"later"}\n`, TAG)).toBe('{"ok":true}');
  });

  it("takes the first tagged line", () => {
    expect(findAnswer(`${answer}\n=> <<${TAG}>>second\n`, TAG)).toBe('{"ok":true}');
  });

  it("handles \\r\\n line endings", () => {
    expect(findAnswer(`noise\r\n${answer}\r\n`, TAG)).toBe('{"ok":true}');
  });

  it("ignores leading whitespace on the answer line", () => {
    expect(findAnswer(`noise\n   ${answer}\n`, TAG)).toBe('{"ok":true}');
  });

  it("does not match the marker in the middle of a line (N10)", () => {
    expect(findAnswer(`noise${answer}\n`, TAG)).toBeUndefined();
  });

  it("does not split a JSON body on U+2028", () => {
    expect(findAnswer(`${EVAL_ANSWER_PREFIX}<<${TAG}>>"a b"\n`, TAG)).toBe('"a b"');
  });

  it("returns undefined when no line carries the tag", () => {
    expect(findAnswer(`noise\n=> {"ok":true}\n`, TAG)).toBeUndefined();
    expect(findAnswer("", TAG)).toBeUndefined();
  });

  it("does not match another call's tag", () => {
    expect(findAnswer(`=> <<ocm-other>>{"ok":true}\n`, TAG)).toBeUndefined();
  });

  it("returns an empty body when nothing follows the marker", () => {
    expect(findAnswer(`=> <<${TAG}>>\n`, TAG)).toBe("");
  });

  it("untagged: returns the body of the first line starting with => ", () => {
    expect(findAnswer("Error: plugin\n=> 42\n=> 43\n")).toBe("42");
    expect(findAnswer("no answer here\n")).toBeUndefined();
  });
});

describe("findNoActiveFileLine (C2)", () => {
  it("finds the line at the head or after noise, case-insensitively", () => {
    expect(findNoActiveFileLine("Error: No active file.\n")).toBe("Error: No active file.");
    expect(findNoActiveFileLine("noise\n  error: no active file\n")).toBe("error: no active file");
  });

  it("returns undefined when absent", () => {
    expect(findNoActiveFileLine("Error: something\n")).toBeUndefined();
  });
});

describe("findErrorLine (C3)", () => {
  it("finds the first Error: line at the head or after noise", () => {
    expect(findErrorLine("Error: first\nError: second\n")).toBe("Error: first");
    expect(findErrorLine("noise\nError: something\r\n")).toBe("Error: something");
  });

  it("does not match Error: in the middle of a line", () => {
    expect(findErrorLine("noise Error: x\n")).toBeUndefined();
  });

  it("returns undefined when absent", () => {
    expect(findErrorLine("all good\n")).toBeUndefined();
  });
});
