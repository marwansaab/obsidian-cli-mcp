// Original — no upstream. patch_heading handler tests for notes with mixed line endings (spec 086, contracts/placement-contract.md H1–H12): placement in all three modes, mixed-versus-uniform equivalence, kept terminators, final line break, agent-typed endings, lone CR, and unchanged bytes on uniform notes.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { deps, EVAL_OK, fakeFs, fakeRegistry, VAULT_ROOT } from "./_handler-fixtures.js";
import { executePatchHeading } from "./handler.js";
import { walkHeadings } from "./heading-walk.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { makeQueuedSpawn } from "../_handler-test-fixtures.js";
import {
  HEADING_TEMPLATE,
  mixFmCrlfBodyLf,
  mixFmLfBodyCrlf,
  toCrlf,
  toLf,
} from "../_line-ending-fixtures.js";
import { lineText, splitNoteLines } from "../_note-lines.js";

import type { FakeFsHandle } from "./_handler-fixtures.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

type Mode = "append" | "prepend" | "replace";

function written(fs: FakeFsHandle): string {
  expect(fs.writes).toHaveLength(1);
  return fs.writes[0]![1];
}

async function patch(raw: string, headingPath: string, mode: Mode, content: string) {
  const fs = fakeFs({ content: raw });
  const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
  await executePatchHeading(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "n.md",
      heading_path: headingPath,
      mode,
      content,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  return written(fs);
}

/** `raw` up to and including the line `line` and its terminator `ending`. */
function upTo(raw: string, line: string, ending: string): string {
  const at = raw.indexOf(line + ending);
  expect(at).toBeGreaterThanOrEqual(0);
  return raw.slice(0, at + line.length + ending.length);
}

/** `raw` from the start of the line `line` to EOF. */
function from(raw: string, line: string): string {
  const at = raw.indexOf(line);
  expect(at).toBeGreaterThanOrEqual(0);
  return raw.slice(at);
}

// Each mix with the line ending of its body (where every heading lives).
const MIXES = [
  ["mixFmLfBodyCrlf", mixFmLfBodyCrlf(HEADING_TEMPLATE), "\r\n"],
  ["mixFmCrlfBodyLf", mixFmCrlfBodyLf(HEADING_TEMPLATE), "\n"],
] as const;

const TARGETS = ["Top#First", "Top#Middle", "Top#Middle#Child", "Top#Last"] as const;
const MODES: readonly Mode[] = ["append", "prepend", "replace"];

describe("US1 — only the named section changes", () => {
  describe.each(MIXES)("on %s (H1–H4)", (_name, raw, e) => {
    it("H1/H4: replace Top#Last writes the new body after the heading line and nothing else", async () => {
      const out = await patch(raw, "Top#Last", "replace", "new1\nnew2");
      expect(out).toBe(upTo(raw, "## Last", e) + `new1${e}new2${e}`);
    });

    it("H2/H4: replace Top#First keeps ## Middle to EOF byte-identical", async () => {
      const out = await patch(raw, "Top#First", "replace", "new1\nnew2");
      expect(out).toBe(upTo(raw, "## First", e) + `new1${e}new2${e}` + from(raw, "## Middle"));
      expect(out).not.toContain("first-1");
      expect(out).not.toContain("first-2");
    });

    it("H3/H4: replace Top#Middle keeps ### Child to EOF byte-identical", async () => {
      const out = await patch(raw, "Top#Middle", "replace", "new1\nnew2");
      expect(out).toBe(upTo(raw, "## Middle", e) + `new1${e}new2${e}` + from(raw, "### Child"));
    });
  });

  describe.each(MIXES)("on %s (H5)", (_name, raw, e) => {
    it("H5: append on Top#Middle lands immediately before ## Last", async () => {
      const out = await patch(raw, "Top#Middle", "append", "x");
      const at = raw.indexOf("## Last");
      expect(out).toBe(raw.slice(0, at) + `x${e}` + raw.slice(at));
    });

    it("H5: prepend on Top#Middle lands immediately after the ## Middle line", async () => {
      const out = await patch(raw, "Top#Middle", "prepend", "x");
      const head = upTo(raw, "## Middle", e);
      expect(out).toBe(head + `x${e}` + raw.slice(head.length));
    });
  });

  it("H10: re-walking the written note returns exactly the new body", async () => {
    const out = await patch(mixFmLfBodyCrlf(HEADING_TEMPLATE), "Top#Last", "replace", "new1\nnew2");
    const r = walkHeadings(out, ["Top", "Last"]);
    expect(r).not.toBeNull();
    const lines = splitNoteLines(out);
    const body = lines
      .slice(r!.reachStartLineIndex, Math.min(r!.directBodyEndLineIndex, lines.length))
      .map(lineText);
    expect(body).toEqual(["new1", "new2"]);
  });
});

describe("US2 — mixed and uniform notes behave the same", () => {
  const variants = [
    HEADING_TEMPLATE,
    toCrlf(HEADING_TEMPLATE),
    mixFmLfBodyCrlf(HEADING_TEMPLATE),
    mixFmCrlfBodyLf(HEADING_TEMPLATE),
  ];

  describe.each(MODES)("H6: %s", (mode) => {
    it.each(["Top#First", "Top#Middle", "Top#Last"])(
      "on %s gives the same text in all four variants",
      async (target) => {
        const outs: string[] = [];
        for (const raw of variants) outs.push(toLf(await patch(raw, target, mode, "n1\nn2")));
        expect(new Set(outs).size).toBe(1);
      },
    );
  });

  // H9: today's bytes, written out by hand (FR-008 regression anchor).
  const H9_LF = {
    replace:
      "---\nstatus: draft\n---\n# Top\n## First\nfirst-1\nfirst-2\n## Middle\nx\n### Child\nchild-1\n## Last\nlast-1\nlast-2\n",
    append:
      "---\nstatus: draft\n---\n# Top\n## First\nfirst-1\nfirst-2\n## Middle\nmiddle-1\n### Child\nchild-1\nx\n## Last\nlast-1\nlast-2\n",
    prepend:
      "---\nstatus: draft\n---\n# Top\n## First\nfirst-1\nfirst-2\n## Middle\nx\nmiddle-1\n### Child\nchild-1\n## Last\nlast-1\nlast-2\n",
  } as const;
  const H9_CRLF = {
    replace:
      "---\r\nstatus: draft\r\n---\r\n# Top\r\n## First\r\nfirst-1\r\nfirst-2\r\n## Middle\r\nx\r\n### Child\r\nchild-1\r\n## Last\r\nlast-1\r\nlast-2\r\n",
    append:
      "---\r\nstatus: draft\r\n---\r\n# Top\r\n## First\r\nfirst-1\r\nfirst-2\r\n## Middle\r\nmiddle-1\r\n### Child\r\nchild-1\r\nx\r\n## Last\r\nlast-1\r\nlast-2\r\n",
    prepend:
      "---\r\nstatus: draft\r\n---\r\n# Top\r\n## First\r\nfirst-1\r\nfirst-2\r\n## Middle\r\nx\r\nmiddle-1\r\n### Child\r\nchild-1\r\n## Last\r\nlast-1\r\nlast-2\r\n",
  } as const;

  describe.each([
    ["LF", HEADING_TEMPLATE, H9_LF],
    ["CRLF", toCrlf(HEADING_TEMPLATE), H9_CRLF],
  ] as const)("H9: uniform %s note", (_name, raw, expected) => {
    it.each(MODES)("%s on Top#Middle writes today's bytes", async (mode) => {
      expect(await patch(raw, "Top#Middle", mode, "x")).toBe(expected[mode]);
    });
  });
});

describe("US3 — line endings outside the edit are preserved", () => {
  describe.each(MIXES)("H7: on %s", (_name, raw) => {
    describe.each(MODES)("%s", (mode) => {
      it.each(TARGETS)(
        "on %s keeps every line outside the edit point with its terminator",
        async (target) => {
          const original = splitNoteLines(raw);
          const r = walkHeadings(raw, target.split("#"))!;
          const reachEnd = Math.min(r.reachEndLineIndex, original.length);
          // E3 edit point: [cut, resume) is removed (empty for append / prepend).
          const [cut, resume] =
            mode === "replace"
              ? [r.reachStartLineIndex, Math.min(r.directBodyEndLineIndex, reachEnd)]
              : mode === "append"
                ? [reachEnd, reachEnd]
                : [r.markerLineIndex + 1, r.markerLineIndex + 1];
          const out = splitNoteLines(await patch(raw, target, mode, "n1\nn2"));
          const kept = original.slice(resume);
          expect(out.slice(0, cut)).toEqual(original.slice(0, cut));
          expect(out.slice(out.length - kept.length)).toEqual(kept);
        },
      );
    });
  });

  describe("H8: a note without a final line break keeps none", () => {
    const raw = mixFmLfBodyCrlf(HEADING_TEMPLATE).slice(0, -2);

    it.each(["replace", "append"] as const)("%s on Top#Last", async (mode) => {
      const out = await patch(raw, "Top#Last", mode, "n");
      expect(out.endsWith("\n")).toBe(false);
    });

    it('replace with "" ends at the heading line, with no terminator', async () => {
      const out = await patch(raw, "Top#Last", "replace", "");
      expect(out.endsWith("## Last")).toBe(true);
    });
  });

  it("H11: added lines take the heading line's ending, not the one the agent typed", async () => {
    const out = await patch(mixFmCrlfBodyLf(HEADING_TEMPLATE), "Top#Last", "replace", "a\r\nb");
    expect(out.endsWith("## Last\na\nb\n")).toBe(true);
  });

  it("H12: a last line ending in a lone CR takes the nearest earlier line's ending", async () => {
    const raw = mixFmLfBodyCrlf(HEADING_TEMPLATE)
      .replace(/last-1\r\nlast-2\r\n$/, "")
      .replace(/## Last\r\n$/, "## Last\r");
    expect(raw.endsWith("## Last\r")).toBe(true);
    const out = await patch(raw, "Top#Last", "append", "x");
    expect(out).toBe(raw + "\r\n" + "x");
  });
});
