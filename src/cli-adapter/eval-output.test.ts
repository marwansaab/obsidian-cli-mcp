// Original — no upstream. Co-located vitest cases for eval-output: contract §1 answer location (A1–A15, spec 080), the wrapper text, the tag format, the answer-marker scan and last-`Error:`-line selection.
import { describe, expect, it } from "vitest";

import {
  evalAnswerTag,
  findReportedErrorLine,
  findTaggedEvalAnswer,
  hasEvalAnswerLine,
  wrapEvalCode,
} from "./eval-output.js";

const T = evalAnswerTag("11111111-1111-4111-8111-111111111111");
const T2 = evalAnswerTag("22222222-2222-4222-8222-222222222222");
const A = '{"ok":true,"count":1}';
const B = '{"ok":true,"count":2}';
const L = '{"ok":true,"count":99}';

describe("evalAnswerTag / wrapEvalCode", () => {
  it("evalAnswerTag gives the exact obsidian-cli-mcp:<nonce>: format", () => {
    expect(evalAnswerTag("abc")).toBe("obsidian-cli-mcp:abc:");
  });

  it("wrapEvalCode embeds the template verbatim behind the quoted tag", () => {
    const template = "(()=>JSON.stringify({a:'x\"y'}))()";
    const wrapped = wrapEvalCode(template, T);
    expect(wrapped).toContain(template);
    expect(wrapped.startsWith('(async()=>{return "obsidian-cli-mcp:')).toBe(true);
    expect(wrapped).toBe(`(async()=>{return ${JSON.stringify(T)}+(await (${template}))})()`);
  });
});

describe("findTaggedEvalAnswer — contract §1", () => {
  const rows: Array<[string, string, string | null]> = [
    ["A1 tagged answer alone", `=> ${T}${A}`, A],
    ["A2 plugin lines before", `Found and returned 3 smart_blocks.\n[warn] x\n=> ${T}${A}`, A],
    ["A3 plugin line after", `=> ${T}${A}\nplugin: done`, A],
    ["A4 plugin lines before and after", `p1\n=> ${T}${A}\np2`, A],
    ["A5 look-alike before", `=> ${L}\n=> ${T}${A}`, A],
    ["A6 look-alike after", `=> ${T}${A}\n=> ${L}`, A],
    ["A7 look-alikes before and after", `=> ${L}\n=> ${T}${A}\n=> ${L}`, A],
    ["A8 another call's tag", `=> ${T2}${L}\n=> ${T}${A}`, A],
    ["A9 quoted form", `=> ${JSON.stringify(T + A)}`, A],
    ["A10 CRLF", `=> ${T}${A}\r\n`, A],
    ["A11 identical repeat", `=> ${T}${A}\n=> ${T}${A}`, A],
    ["A12 conflicting tagged lines", `=> ${T}${A}\n=> ${T}${B}`, null],
    ["A13 look-alike only", `p1\n=> ${L}`, null],
    ["A14 no marker at all", "p1\np2", null],
    ["A15 tagged non-JSON", `=> ${T} not json`, " not json"],
  ];

  it.each(rows)("%s", (_name, stdout, expected) => {
    expect(findTaggedEvalAnswer(stdout, T)).toBe(expected);
  });

  it("quoted and raw forms of the same answer agree", () => {
    expect(findTaggedEvalAnswer(`=> ${JSON.stringify(T + A)}\n=> ${T}${A}`, T)).toBe(A);
  });

  it("a quoted look-alike carrying another tag is ignored", () => {
    expect(findTaggedEvalAnswer(`=> ${JSON.stringify(T2 + L)}\n=> ${T}${A}`, T)).toBe(A);
  });

  it("an unterminated quoted tagged line is not an answer", () => {
    expect(findTaggedEvalAnswer(`=> "${T}${A}`, T)).toBeNull();
  });
});

describe("findTaggedEvalAnswer — works whatever plugins print (US5, SC-005)", () => {
  const shapes: Array<[string, string]> = [
    ["invented", "§§ zz-unknown-plugin ¤ 42 :: {not json} [[x]]"],
    ["empty line", ""],
    ["whitespace only", "   \t "],
    ["bare JSON", '{"ok":false}'],
    ["bracketed warning", "[warn] x"],
    ["2,000-character line", "y".repeat(2000)],
    ["non-ASCII", "插件已加载 — Ünïcödé ✓"],
    ["line ending in CR", "plugin: ready\r"],
    ["untagged answer marker", '=> {"ok":false}'],
  ];

  it.each(shapes)("%s before and after the tagged answer", (_name, shape) => {
    const stdout = `${shape}\n=> ${T}{"ok":true}\n${shape}`;
    expect(findTaggedEvalAnswer(stdout, T)).toBe('{"ok":true}');
  });
});

describe("hasEvalAnswerLine", () => {
  it("is true when any line carries the => marker, tagged or not", () => {
    expect(hasEvalAnswerLine("p1\n  => {}\n")).toBe(true);
  });

  it("is false when no line carries the marker", () => {
    expect(hasEvalAnswerLine("p1\nError: x =>\n=>no-space")).toBe(false);
  });
});

describe("findReportedErrorLine", () => {
  it("returns null when no line starts with Error:", () => {
    expect(findReportedErrorLine("p1\nan Error: inside\n")).toBeNull();
  });

  it("returns the one trimmed Error: line", () => {
    expect(findReportedErrorLine("p1\n  Error: boom  \r\np2")).toBe("Error: boom");
  });

  it("returns the last of several Error: lines", () => {
    expect(findReportedErrorLine("Error: plugin says hi\np1\nError: No active file.\n")).toBe(
      "Error: No active file.",
    );
  });
});
