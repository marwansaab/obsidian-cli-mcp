// Original — no upstream. patch_block handler tests for notes with mixed line endings (spec 086, contracts/placement-contract.md B1–B6).
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { deps, EVAL_OK, fakeFs, fakeRegistry, VAULT_ROOT } from "./_handler-fixtures.js";
import { executePatchBlock } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { captureRejection, makeQueuedSpawn } from "../_handler-test-fixtures.js";
import {
  BLOCK_TEMPLATE,
  mixFmCrlfBodyLf,
  mixFmLfBodyCrlf,
  toCrlf,
  toLf,
} from "../_line-ending-fixtures.js";
import { splitNoteLines } from "../_note-lines.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

const vaultRegistry = fakeRegistry({ TestVault: VAULT_ROOT });

function call(blockId: string, content: string) {
  return {
    target_mode: "specific" as const,
    vault: "TestVault",
    path: "n.md",
    block_id: blockId,
    content,
  };
}

async function patch(raw: string, blockId: string, content: string): Promise<string> {
  const fs = fakeFs({ content: raw });
  const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
  await executePatchBlock(call(blockId, content), deps({ spawnFn, vaultRegistry, fs }));
  expect(fs.writes).toHaveLength(1);
  return fs.writes[0]![1];
}

// Each mix with the line ending of its body (where every block lives).
const MIXES = [
  ["mixFmLfBodyCrlf", mixFmLfBodyCrlf(BLOCK_TEMPLATE), "\r\n"],
  ["mixFmCrlfBodyLf", mixFmCrlfBodyLf(BLOCK_TEMPLATE), "\n"],
] as const;

// Per shape: the block id, the new content, and the E3 edit point [cut, resume) in BT's lines.
const SHAPES = [
  ["para", "New", 3, 4],
  ["li", "New", 5, 6],
  ["tbl", "| c | d |", 7, 9],
] as const;

describe("B1/B2 — only the found block changes", () => {
  describe.each(MIXES)("on %s", (_name, raw, e) => {
    it("para: the line becomes `New ^para`", async () => {
      expect(await patch(raw, "para", "New")).toBe(raw.replace("Para text ^para", "New ^para"));
    });

    it("li: the line becomes `- New ^li`", async () => {
      expect(await patch(raw, "li", "New")).toBe(raw.replace("- item ^li", "- New ^li"));
    });

    it("tbl: the two rows are replaced and the ^tbl line is kept verbatim", async () => {
      expect(await patch(raw, "tbl", "| c | d |")).toBe(
        raw.replace(`| a | b |${e}| - | - |${e}`, `| c | d |${e}`),
      );
    });
  });
});

describe("B3 — mixed and uniform notes behave the same", () => {
  const variants = [
    BLOCK_TEMPLATE,
    toCrlf(BLOCK_TEMPLATE),
    mixFmLfBodyCrlf(BLOCK_TEMPLATE),
    mixFmCrlfBodyLf(BLOCK_TEMPLATE),
  ];

  it.each(SHAPES)("%s gives the same text in all four variants", async (blockId, content) => {
    const outs: string[] = [];
    for (const raw of variants) outs.push(toLf(await patch(raw, blockId, content)));
    expect(new Set(outs).size).toBe(1);
  });
});

describe("B4 — kept lines keep their terminators", () => {
  describe.each(MIXES)("on %s", (_name, raw) => {
    it.each(SHAPES)("%s", async (blockId, content, cut, resume) => {
      const original = splitNoteLines(raw);
      const out = await patch(raw, blockId, content);
      const lines = splitNoteLines(out);
      const kept = original.slice(resume);
      expect(lines.slice(0, cut)).toEqual(original.slice(0, cut));
      expect(lines.slice(lines.length - kept.length)).toEqual(kept);
      expect(out.endsWith("\n")).toBe(true);
    });
  });
});

describe("B5 — uniform notes keep today's bytes", () => {
  // Today's bytes, written out by hand (FR-008 regression anchor).
  const LF = {
    para: "---\nstatus: draft\n---\nNew ^para\n\n- item ^li\n\n| a | b |\n| - | - |\n^tbl\n",
    li: "---\nstatus: draft\n---\nPara text ^para\n\n- New ^li\n\n| a | b |\n| - | - |\n^tbl\n",
    tbl: "---\nstatus: draft\n---\nPara text ^para\n\n- item ^li\n\n| c | d |\n^tbl\n",
  } as const;
  const CRLF = {
    para: "---\r\nstatus: draft\r\n---\r\nNew ^para\r\n\r\n- item ^li\r\n\r\n| a | b |\r\n| - | - |\r\n^tbl\r\n",
    li: "---\r\nstatus: draft\r\n---\r\nPara text ^para\r\n\r\n- New ^li\r\n\r\n| a | b |\r\n| - | - |\r\n^tbl\r\n",
    tbl: "---\r\nstatus: draft\r\n---\r\nPara text ^para\r\n\r\n- item ^li\r\n\r\n| c | d |\r\n^tbl\r\n",
  } as const;

  describe.each([
    ["LF", BLOCK_TEMPLATE, LF],
    ["CRLF", toCrlf(BLOCK_TEMPLATE), CRLF],
  ] as const)("%s", (_name, raw, expected) => {
    it.each(SHAPES)("%s", async (blockId, content) => {
      expect(await patch(raw, blockId, content)).toBe(expected[blockId]);
    });
  });
});

describe("B6 — a mixed frontmatter does not change which block is found or refused", () => {
  async function refused(raw: string, blockId: string) {
    const fs = fakeFs({ content: raw });
    const { spawnFn } = makeQueuedSpawn([]);
    const err = await captureRejection(
      executePatchBlock(call(blockId, "x"), deps({ spawnFn, vaultRegistry, fs })),
    );
    expect(err).toBeInstanceOf(UpstreamError);
    expect(fs.writes).toHaveLength(0);
    expect(fs.renames).toHaveLength(0);
    return err as UpstreamError;
  }

  it("a marker on a heading line is BLOCK_ON_HEADING (atx)", async () => {
    const err = await refused(
      mixFmLfBodyCrlf("---\nstatus: draft\n---\n## Heading ^hd\nbody\n"),
      "hd",
    );
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details).toMatchObject({ code: "BLOCK_ON_HEADING", heading_shape: "atx" });
  });

  it("a marker only inside the frontmatter is BLOCK_NOT_FOUND", async () => {
    const err = await refused(mixFmLfBodyCrlf("---\nkey: ^fm\n---\nbody\n"), "fm");
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details).toMatchObject({ code: "BLOCK_NOT_FOUND" });
  });
});
