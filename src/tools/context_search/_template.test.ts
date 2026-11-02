// Original — no upstream. In-process tests for the context_search read-back eval template (spec 088): T1–T9 under runEvalTemplate with a stub app.
import { expect, test } from "vitest";

import { JS_TEMPLATE } from "./_template.js";
import { runEvalTemplate } from "../_eval-template-fixtures.js";

type NoteSpec = string | { folder: true } | { reject: Error };

/** A stub `app` whose vault holds `notes` (path → text, a folder, or a read that rejects). */
function stubApp(notes: Record<string, NoteSpec>) {
  return {
    vault: {
      getAbstractFileByPath(p: string) {
        const spec = notes[p];
        if (spec === undefined) return null;
        return typeof spec === "object" && "folder" in spec ? { path: p, children: [] } : { path: p };
      },
      cachedRead(f: { path: string }) {
        const spec = notes[f.path]!;
        return typeof spec === "string" ? Promise.resolve(spec) : Promise.reject((spec as { reject: Error }).reject);
      },
    },
  };
}

function run(payload: Array<[string, number[]]>, notes: Record<string, NoteSpec>) {
  return runEvalTemplate(JS_TEMPLATE, payload, stubApp(notes));
}

test("T1 returns the requested line raw, whitespace included", async () => {
  expect(await run([["a.md", [2]]], { "a.md": "a\n\tb  \nc" })).toEqual({
    notes: [{ path: "a.md", state: "read", lines: [{ line: 2, raw: "\tb  " }] }],
  });
});

test("T2 a CRLF line keeps its \\r (stripped later, in TS)", async () => {
  expect(await run([["a.md", [2]]], { "a.md": "x\r\n  y \r\n" })).toEqual({
    notes: [{ path: "a.md", state: "read", lines: [{ line: 2, raw: "  y \r" }] }],
  });
});

test("T3 a mid-line \\r is not a line break", async () => {
  expect(await run([["a.md", [1]]], { "a.md": "m\rn" })).toEqual({
    notes: [{ path: "a.md", state: "read", lines: [{ line: 1, raw: "m\rn" }] }],
  });
});

test("T4 a line past the note's end is null", async () => {
  expect(await run([["a.md", [5]]], { "a.md": "one\ntwo" })).toEqual({
    notes: [{ path: "a.md", state: "read", lines: [{ line: 5, raw: null }] }],
  });
});

test("T5 a missing path and a folder are note-not-found", async () => {
  expect(await run([["gone.md", [1]], ["dir.md", [1]]], { "dir.md": { folder: true } })).toEqual({
    notes: [
      { path: "gone.md", state: "note-not-found" },
      { path: "dir.md", state: "note-not-found" },
    ],
  });
});

test("T6 a rejected cachedRead is read-failed with its message", async () => {
  expect(await run([["a.md", [1]]], { "a.md": { reject: new Error("boom") } })).toEqual({
    notes: [{ path: "a.md", state: "read-failed", detail: "boom" }],
  });
});

test("T7 the answer keeps the request's note and line order", async () => {
  const answer = await run(
    [["b.md", [3, 1]], ["a.md", [2]]],
    { "a.md": "a1\na2", "b.md": "b1\nb2\nb3" },
  );
  expect(answer).toEqual({
    notes: [
      { path: "b.md", state: "read", lines: [{ line: 3, raw: "b3" }, { line: 1, raw: "b1" }] },
      { path: "a.md", state: "read", lines: [{ line: 2, raw: "a2" }] },
    ],
  });
});

test("T8 a non-ASCII path and line round-trip exactly", async () => {
  expect(await run([["Ünï/ç.md", [1]]], { "Ünï/ç.md": " é " })).toEqual({
    notes: [{ path: "Ünï/ç.md", state: "read", lines: [{ line: 1, raw: " é " }] }],
  });
});

test("T9 the template is at most 900 characters", () => {
  expect(JS_TEMPLATE.length).toBeLessThanOrEqual(900);
});
