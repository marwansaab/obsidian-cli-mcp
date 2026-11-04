// Original — no upstream. Unit rows for the tool-description audit helpers (spec 092 contract §T).
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { McpServer } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";

import {
  auditSurface,
  cellText,
  CHECK_COLUMNS,
  collectPublishedSurface,
  descriptionAuditRecordSchema,
  findInternalIds,
  firstSentence,
  HELP_POINTER_LINE,
  missingSiblings,
  parseIndexEntries,
  renderAuditReport,
  siblingsOf,
  type AuditResult,
  type CheckColumn,
  type DescriptionAuditRecord,
  type PublishedSurface,
  type PublishedTool,
} from "./_description-audit.js";
import { fingerprintTool } from "./_register-baseline.js";
import { listToolPages } from "./help/handler.js";

const META = { version: "0.0.0", sha: "abc1234", branch: "test", date: "2026-11-04" };
const FP = "a".repeat(64);

const matches = (text: string): string[] => findInternalIds(text).map((h) => h.match);

describe("findInternalIds", () => {
  it("T-ID1: P1–P6 find their samples", () => {
    const text =
      "See BI-0134, FR-006a, ADR-031, TC-00586, US6 and T066 from spec 078; per spec this is a new BI.";
    const found = matches(text);
    for (const sample of ["BI-0134", "FR-006a", "ADR-031", "TC-00586", "US6", "T066", "spec 078", "per spec", "BI"]) {
      expect(found).toContain(sample);
    }
    expect(findInternalIds("a new BI").map((h) => h.pattern)).toEqual(["P6"]);
  });

  it("T-ID2: P7 finds one-letter labels outside quotes", () => {
    expect(matches("per the Q1 clarification")).toEqual(["Q1"]);
    expect(matches("B1 falsified")).toEqual(["B1"]);
    expect(matches("Assumption A10")).toEqual(["A10"]);
    const hit = findInternalIds("x Q1 y")[0]!;
    expect(hit).toEqual({ pattern: "P7", match: "Q1", index: 2 });
  });

  it("T-ID3: public tokens, codes and quoted examples are not reported", () => {
    for (const text of [
      "UTF-8",
      "UTF-16",
      "V8",
      "2026-05-17",
      "UNSUPPORTED_FILE_TYPE",
      "ERR_NO_ACTIVE_FILE",
      "`Q1 Goals`",
      '"Q1 Goals"',
      "H2",
      "limit 1..100",
    ]) {
      expect(findInternalIds(text), text).toEqual([]);
    }
  });
});

describe("firstSentence", () => {
  it("T-FS: stops at the first period followed by whitespace or the end", () => {
    expect(firstSentence("Read a note. Use it often.")).toBe("Read a note.");
    expect(firstSentence("Lists `.md` files in a folder. More.")).toBe("Lists `.md` files in a folder.");
    expect(firstSentence("Ends here.")).toBe("Ends here.");
    expect(firstSentence("No period at all")).toBe("No period at all");
  });
});

describe("parseIndexEntries", () => {
  it("T-IX: returns name → text and ignores the header lines", () => {
    const text = "# Available Tools\r\n\r\nCall help.\r\n\r\n- **read** — Read a note.\r\n- **files** — List a folder.\r\n";
    expect([...parseIndexEntries(text)]).toEqual([
      ["read", "Read a note."],
      ["files", "List a folder."],
    ]);
  });
});

describe("family roster", () => {
  it("T-FAM: siblings, missing siblings and tools in no family", () => {
    expect(siblingsOf("read_property")).toEqual([
      "find_by_property",
      "properties",
      "read",
      "read_heading",
      "set_property",
    ]);
    expect(missingSiblings("files", "List a folder. Use `paths` for every level.")).toEqual([]);
    expect(missingSiblings("search", "Find notes. Use `context_search` for lines.")).toEqual(["pattern_search"]);
    expect(siblingsOf("help")).toEqual([]);
    expect(siblingsOf("vaults")).toEqual([]);
    expect(siblingsOf("obsidian_exec")).toEqual([]);
  });
});

const checks = (verdict: string, gap?: string) => {
  const one = gap === undefined ? { verdict } : { verdict, gap };
  return { purpose: one, safety: one, detail: one, selfContained: one, family: one, sharedFields: one };
};

describe("descriptionAuditRecordSchema", () => {
  const valid = {
    schemaVersion: 1,
    tools: {
      read: { descriptionFingerprint: FP, schemaFingerprint: FP, checks: checks("PASS") },
      files: { descriptionFingerprint: FP, schemaFingerprint: FP, checks: checks("N/A", "possibly stale") },
    },
    routing: { "- line": { verdict: "PASS", gap: "a note" } },
  };

  it("T-REC1: a valid record parses, including PASS or N/A with a gap note", () => {
    expect(descriptionAuditRecordSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["an unknown key", { ...valid, extra: 1 }, []],
    [
      "a bad verdict",
      { ...valid, tools: { read: { descriptionFingerprint: FP, schemaFingerprint: FP, checks: checks("OK") } } },
      ["tools", "read", "checks", "purpose", "verdict"],
    ],
    [
      "a FAIL without gap",
      { ...valid, tools: { read: { descriptionFingerprint: FP, schemaFingerprint: FP, checks: checks("FAIL") } } },
      ["tools", "read", "checks", "purpose", "gap"],
    ],
    ["a PARTIAL routing line without gap", { ...valid, routing: { "- line": { verdict: "PARTIAL" } } }, ["routing", "- line", "gap"]],
    [
      "a short fingerprint",
      { ...valid, tools: { read: { descriptionFingerprint: "abc", schemaFingerprint: FP, checks: checks("PASS") } } },
      ["tools", "read", "descriptionFingerprint"],
    ],
  ])("T-REC1: rejects %s with the issue path", (_label, input, path) => {
    const result = descriptionAuditRecordSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.path).toEqual(path);
  });
});


// ---------- report fixtures ----------

const FILES_TOOL: PublishedTool = {
  name: "files",
  description: "List a folder's direct children. Use `paths` for every level.",
  inputSchema: { type: "object", properties: { folder: { type: "string", description: "The folder." } } },
};
const VAULTS_TOOL: PublishedTool = {
  name: "vaults",
  description: "List the registered vaults.",
  inputSchema: { type: "object", properties: {} },
};
const LEAKY_TOOL: PublishedTool = {
  name: "leaky",
  description: "Do a thing.",
  inputSchema: { type: "object", properties: { mode: { type: "string", description: "Added in BI-0001." } } },
};
const HELP_TOOL: PublishedTool = {
  name: "help",
  description: "Return any tool's full contract when given its name in tool_name.",
  inputSchema: { type: "object", properties: {} },
};

const ROUTE_FILES = "- List a folder: `files`.";
const ROUTE_VAULTS = "- Vault names: `vaults`.";

function surfaceOf(tools: PublishedTool[], overrides: Partial<PublishedSurface> = {}): PublishedSurface {
  const index = [
    "# Available Tools",
    "",
    "Call help with a name.",
    "",
    ...tools.map((t) => `- **${t.name}** — ${firstSentence(t.description)}`),
    "",
  ].join("\n");
  return {
    tools,
    instructions: `Opening.\n\nWhich tool:\n${ROUTE_FILES}\n${ROUTE_VAULTS}\n\nRules:\n${HELP_POINTER_LINE}`,
    indexText: index,
    helpPageCount: tools.length,
    ...overrides,
  };
}

function entryFor(tool: PublishedTool, verdict = "PASS", gap?: string) {
  const { descriptionFingerprint, schemaFingerprint } = fingerprintTool(tool);
  return { descriptionFingerprint, schemaFingerprint, checks: checks(verdict, gap) };
}

function recordOf(tools: Record<string, unknown>, routing: Record<string, unknown> = {}): DescriptionAuditRecord {
  return descriptionAuditRecordSchema.parse({ schemaVersion: 1, tools, routing });
}

/** `name`'s matrix cells as the report prints them, keyed by column. */
function cellsOf(audit: AuditResult, name: string): Record<CheckColumn, string> {
  const tool = audit.tools.find((t) => t.name === name);
  expect(tool, `audit for ${name}`).toBeDefined();
  return Object.fromEntries(CHECK_COLUMNS.map((c) => [c, cellText(tool!.cells[c])])) as Record<CheckColumn, string>;
}

const noteOf = (audit: AuditResult, name: string, column: CheckColumn): string | undefined =>
  audit.tools.find((t) => t.name === name)?.cells[column].note;

function matrixRows(report: string): string[] {
  const body = report.split("## Matrix")[1]!.split("## Gaps")[0]!;
  return body.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Tool |"));
}

describe("auditSurface and renderAuditReport", () => {
  const tools = [FILES_TOOL, VAULTS_TOOL, LEAKY_TOOL];

  it("T-REP1: one row per tool, nine cells each, a Gaps entry for every FAIL or PARTIAL", () => {
    const record = recordOf({
      files: entryFor(FILES_TOOL, "PARTIAL", "Detail half moved."),
      vaults: entryFor(VAULTS_TOOL),
      leaky: entryFor(LEAKY_TOOL),
    });
    const surface = surfaceOf(tools);
    const report = renderAuditReport(surface, record, META);
    const rows = matrixRows(report);
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.slice(2, -2).split(" | ")).toHaveLength(10);
    let failing = 0;
    for (const { name, cells } of auditSurface(surface, record).tools) {
      for (const column of CHECK_COLUMNS) {
        const cell = cells[column];
        if (cell.verdict === "FAIL" || cell.verdict === "PARTIAL") {
          failing++;
          expect(report).toContain(`### ${name}: ${column} (${cellText(cell)})`);
        }
      }
    }
    expect(failing).toBeGreaterThan(0);
    const gapsSection = report.split("## Gaps")[1]!.split("## Notes")[0]!;
    expect(gapsSection.match(/^### /gm)).toHaveLength(failing);
  });

  it("T-REP2: a stale or missing record entry needs review; mechanical cells are still computed", () => {
    const stale = { ...entryFor(FILES_TOOL), descriptionFingerprint: FP };
    const audit = auditSurface(surfaceOf(tools), recordOf({ files: stale, leaky: entryFor(LEAKY_TOOL) }));
    const files = cellsOf(audit, "files");
    for (const column of ["Purpose", "Safety", "Detail", "Self-contained", "Family", "Shared fields"] as const) {
      expect(files[column]).toBe("NEEDS REVIEW (was PASS)");
    }
    expect(files.Budget).toMatch(/^PASS \(\d+\)$/);
    expect(files.Index).toBe("PASS");
    const vaults = cellsOf(audit, "vaults");
    for (const column of ["Purpose", "Safety", "Detail", "Self-contained"] as const) {
      expect(vaults[column]).toBe("NEEDS REVIEW (not recorded)");
    }
    expect(vaults.IDs).toBe("PASS");
  });

  it("T-REP3: budget, index and identifier failures are computed with their gaps", () => {
    const long: PublishedTool = { ...VAULTS_TOOL, description: `List the registered vaults. ${"x".repeat(400)}` };
    const surface = surfaceOf([FILES_TOOL, long, LEAKY_TOOL]);
    surface.indexText = surface.indexText.replace("List a folder's direct children.", "List a folder.");
    const audit = auditSurface(surface, recordOf({}));
    expect(cellsOf(audit, "vaults").Budget).toBe(`FAIL (${long.description.length})`);
    expect(noteOf(audit, "vaults", "Budget")).toContain(`${long.description.length - 400} over the 400-character budget`);
    expect(cellsOf(audit, "files").Index).toBe("FAIL");
    expect(cellsOf(audit, "leaky").IDs).toBe("FAIL");
    expect(noteOf(audit, "leaky", "IDs")).toContain("leaky#input.properties.mode: BI-0001");
  });

  it("T-REP4: family and shared-field cells computed N/A or FAIL override the record", () => {
    const silent: PublishedTool = { ...FILES_TOOL, description: "List a folder's direct children." };
    const audit = auditSurface(
      surfaceOf([silent, VAULTS_TOOL, LEAKY_TOOL]),
      recordOf({ files: entryFor(silent), vaults: entryFor(VAULTS_TOOL), leaky: entryFor(LEAKY_TOOL) }),
    );
    expect(cellsOf(audit, "vaults").Family).toBe("N/A");
    expect(cellsOf(audit, "files").Family).toBe("FAIL");
    expect(noteOf(audit, "files", "Family")).toContain("does not name `paths`");
    expect(cellsOf(audit, "vaults")["Shared fields"]).toBe("N/A");
    expect(cellsOf(audit, "files")["Shared fields"]).toBe("PASS");
  });

  it("T-REP5: header verdicts, the needs-review count and unrecorded routing lines", () => {
    const long: PublishedTool = { ...LEAKY_TOOL, description: `Do a thing. ${"x".repeat(12_000)}` };
    const surface = surfaceOf([FILES_TOOL, VAULTS_TOOL, long], { instructions: "Opening.\n\nWhich tool:\n" + ROUTE_FILES });
    const record = recordOf({ files: entryFor(FILES_TOOL), vaults: entryFor(VAULTS_TOOL) });
    const audit = auditSurface(surface, record);
    expect(audit.totalVerdict).toBe("FAIL");
    expect(audit.helpPointerInInstructions).toBe("FAIL");
    expect(audit.helpPointerInHelp).toBe("FAIL");
    // 4 judged cells for the unrecorded tool (its Family and Shared fields are computed N/A),
    // plus the one unrecorded routing line.
    expect(audit.needsReview).toBe(5);
    expect(audit.routing).toEqual([{ line: ROUTE_FILES, cell: { verdict: "NEEDS REVIEW" } }]);
    const report = renderAuditReport(surface, record, META);
    expect(report).toMatch(/Total description budget: .*FAIL/);
    expect(report).toContain("- Help pointer in the instructions: FAIL");
    expect(report).toContain("- Help pointer in the `help` description: FAIL");
    expect(report).toContain("- Cells needing review: 5");
    expect(report).toContain(`| ${ROUTE_FILES} | NEEDS REVIEW |`);

    const ok = auditSurface(
      surfaceOf([FILES_TOOL, VAULTS_TOOL, HELP_TOOL]),
      recordOf(
        { files: entryFor(FILES_TOOL), vaults: entryFor(VAULTS_TOOL), help: entryFor(HELP_TOOL) },
        { [ROUTE_FILES]: { verdict: "PASS" }, [ROUTE_VAULTS]: { verdict: "PASS" } },
      ),
    );
    expect(ok.totalVerdict).toBe("PASS");
    expect(ok.helpPointerInInstructions).toBe("PASS");
    expect(ok.helpPointerInHelp).toBe("PASS");
    expect(ok.needsReview).toBe(0);
    expect(ok.routing.find((r) => r.line === ROUTE_VAULTS)?.cell).toEqual({ verdict: "PASS" });
  });

  it("T-REP6: a PASS cell with a gap note goes to Notes; one without gets none", () => {
    const record = recordOf({
      files: entryFor(FILES_TOOL),
      vaults: { ...entryFor(VAULTS_TOOL), checks: { ...checks("PASS"), detail: { verdict: "PASS", gap: "Possibly stale claim." } } },
      leaky: entryFor(LEAKY_TOOL, "FAIL", "Fixed by another item."),
    });
    const report = renderAuditReport(surfaceOf(tools), record, META);
    const notes = report.split("## Notes")[1]!.split("## Routing")[0]!;
    expect(notes).toContain("### vaults: Detail (PASS)\n\nPossibly stale claim.");
    expect(notes).not.toContain("### files:");
    const gaps = report.split("## Gaps")[1]!.split("## Notes")[0]!;
    expect(gaps).toContain("### leaky: Purpose (FAIL)\n\nFixed by another item.");
  });

  it("T-REP7: the tool-count guard compares registered tools with help pages", async () => {
    const docsDir = mkdtempSync(join(tmpdir(), "audit-docs-"));
    try {
      writeFileSync(join(docsDir, "index.md"), "# Available Tools\n");
      for (const name of ["one", "two", "three"]) writeFileSync(join(docsDir, `${name}.md`), `# ${name}\n`);
      const buildMcpServer = () => {
        const server = new McpServer({ name: "fake", version: "0.0.0" }, { capabilities: { tools: { listChanged: false } } });
        for (const name of ["one", "two", "three"]) {
          server.registerTool(name, { description: `Tool ${name}.` }, () => ({ content: [] }));
        }
        return server;
      };
      const equal = await collectPublishedSurface({ buildMcpServer, docsDir });
      expect(equal.helpPageCount).toBe(3);
      expect(renderAuditReport(equal, recordOf({}), META)).toMatch(/help pages: 3\. PASS/);

      writeFileSync(join(docsDir, "four.md"), "# four\n");
      const more = await collectPublishedSurface({ buildMcpServer, docsDir });
      expect(renderAuditReport(more, recordOf({}), META)).toContain("FAIL (3 tools registered, 4 help pages)");
    } finally {
      rmSync(docsDir, { recursive: true, force: true });
    }
  });
});

describe("collectPublishedSurface", () => {
  it("T-COL: measures the full default list whatever the access settings", async () => {
    const saved = { ro: process.env.OBSIDIAN_MCP_READ_ONLY, dis: process.env.OBSIDIAN_MCP_DISABLE };
    process.env.OBSIDIAN_MCP_READ_ONLY = "1";
    process.env.OBSIDIAN_MCP_DISABLE = "delete";
    try {
      const surface = await collectPublishedSurface();
      const pages = await listToolPages(join(import.meta.dirname, "..", "..", "docs", "tools"));
      expect(surface.tools.length).toBe(surface.helpPageCount);
      expect(surface.tools.map((t) => t.name).sort()).toEqual(pages);
      expect(surface.instructions).toContain("Which tool:");
      expect(surface.indexText).toContain("# Available Tools");
    } finally {
      if (saved.ro === undefined) delete process.env.OBSIDIAN_MCP_READ_ONLY;
      else process.env.OBSIDIAN_MCP_READ_ONLY = saved.ro;
      if (saved.dis === undefined) delete process.env.OBSIDIAN_MCP_DISABLE;
      else process.env.OBSIDIAN_MCP_DISABLE = saved.dis;
    }
  });
});
