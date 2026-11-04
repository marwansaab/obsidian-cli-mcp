// Original — no upstream. Standing checks on the published tool surface (spec 092 FR-017): per-tool and total description budgets, no internal identifiers in any published text or the help index, the help pointer, index entries equal to first sentences, a parseable reviewer record, and one report row per registered tool. The mechanical checks read `auditSurface`'s verdicts, so the rule each one applies is written once, in _description-audit.ts. Judgement verdicts never gate here (Clarification Q4).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  auditSurface,
  collectPublishedSurface,
  CHECK_COLUMNS,
  DESCRIPTION_BUDGET,
  describedTexts,
  descriptionAuditRecordSchema,
  findInternalIds,
  renderAuditReport,
  TOTAL_DESCRIPTION_BUDGET,
  type AuditResult,
  type PublishedSurface,
} from "./_description-audit.js";

const RECORD_PATH = join(import.meta.dirname, "_description-audit-record.json");

// Q1, Q2, Q4 and Q5 read the mechanical verdicts, which do not depend on the record, so an empty
// record keeps them independent of Q6.
let surface: PublishedSurface;
let audit: AuditResult;
beforeAll(async () => {
  surface = await collectPublishedSurface();
  audit = auditSurface(surface, { schemaVersion: 1, tools: {}, routing: {} });
});

describe("published tool descriptions (spec 092 standing checks)", () => {
  it(`Q1: every description is at most ${DESCRIPTION_BUDGET} characters`, () => {
    const over = audit.tools
      .filter((t) => t.cells.Budget.verdict !== "PASS")
      .map((t) => `${t.name} (${t.cells.Budget.detail})`);
    expect(over).toEqual([]);
  });

  it(`Q2: all descriptions together are at most ${TOTAL_DESCRIPTION_BUDGET} characters`, () => {
    expect(audit.totalLength).toBeLessThanOrEqual(TOTAL_DESCRIPTION_BUDGET);
  });

  it("Q3: no internal identifier in any published text or the help index", () => {
    const hits: string[] = [];
    const scan = (where: string, text: string) => {
      for (const hit of findInternalIds(text)) hits.push(`${where}: ${hit.match}`);
    };
    for (const tool of surface.tools) {
      for (const [where, text] of describedTexts(tool)) scan(where, text);
    }
    scan("instructions", surface.instructions);
    scan("index.md", surface.indexText);
    expect(hits).toEqual([]);
  });

  it("Q4: the instructions and the help description say how to open a tool's full contract", () => {
    expect({ instructions: audit.helpPointerInInstructions, help: audit.helpPointerInHelp }).toEqual({
      instructions: "PASS",
      help: "PASS",
    });
  });

  it("Q5: every help-index entry is its tool's first sentence", () => {
    const mismatched = audit.tools.filter((t) => t.cells.Index.verdict !== "PASS").map((t) => t.name);
    expect(mismatched).toEqual([]);
  });

  it("Q6: the reviewer record parses (schema validity only)", () => {
    const parsed = descriptionAuditRecordSchema.safeParse(JSON.parse(readFileSync(RECORD_PATH, "utf8")));
    expect(parsed.error?.issues ?? []).toEqual([]);
  });

  it("Q7: the audit report has one row of nine verdict cells per registered tool", () => {
    const record = descriptionAuditRecordSchema.parse(JSON.parse(readFileSync(RECORD_PATH, "utf8")));
    const report = renderAuditReport(surface, record, { version: "0.0.0", sha: "0000000", branch: "test", date: "2026-01-01" });
    const matrix = report.split("## Matrix")[1]!.split("## Gaps")[0]!;
    const rows = matrix.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Tool |"));
    expect(rows).toHaveLength(surface.tools.length);
    for (const row of rows) expect(row.slice(2, -2).split(" | ")).toHaveLength(CHECK_COLUMNS.length + 1);
  });
});
