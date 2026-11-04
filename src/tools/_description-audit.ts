// Original — no upstream. Tool-description audit (spec 092): budgets, family and shared-field rosters, internal-identifier patterns, first-sentence and index parsing, the reviewer-record schema, the live-surface collector, the typed audit result (`auditSurface`) and its Markdown rendering. Test-support module: used by _description-quality.test.ts and scripts/audit-descriptions.ts, excluded from dist/.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { listPublished, quietServer } from "./_mcp-client-fixtures.js";
import { fingerprintTool } from "./_register-baseline.js";
import { DOCS_DIR, listToolPages } from "./help/handler.js";

import type { Tool } from "@modelcontextprotocol/client";
import type { McpServer } from "@modelcontextprotocol/server";

/** The most characters one tool's top-level description may have. */
export const DESCRIPTION_BUDGET = 400;
/** The most characters all top-level descriptions together may have. */
export const TOTAL_DESCRIPTION_BUDGET = 12_000;

/** Tools that do overlapping jobs; each member's description names every other member (data-model E6). */
export const FAMILIES: Record<string, readonly string[]> = {
  "text-search": ["search", "context_search", "pattern_search"],
  "frontmatter-property": ["read_property", "set_property", "find_by_property", "properties"],
  "metadata-search": ["find_by_property", "tag"],
  reading: ["read", "read_heading", "read_property"],
  "note-writers": ["write_note", "append_note", "prepend", "patch_heading", "patch_block", "find_and_replace"],
  "file-operations": ["move", "rename", "delete"],
  "folder-listing": ["files", "paths"],
  "note-structure": ["links", "backlinks", "outline"],
  "smart-connections": ["smart_connections_query", "smart_connections_similar"],
  "active-file": ["get_active_file", "open_file"],
  bases: ["bases", "views_base", "query_base", "create_base"],
};

/** Parameter names several tools share; each should mean the same thing everywhere (data-model E7). */
export const SHARED_FIELDS = ["vault", "target_mode", "file", "path", "folder", "case_sensitive", "total", "limit"] as const;

export interface InternalIdPattern {
  id: string;
  pattern: RegExp;
  /** Applied only outside backtick code spans and double-quoted strings. */
  outsideQuotes: boolean;
}

/** Shapes of internal tracking identifiers that must not appear in published text (data-model E8). */
export const INTERNAL_ID_PATTERNS: readonly InternalIdPattern[] = [
  { id: "P1", pattern: /\b(?:BI|FR|NFR|SC|ADR|TC)-\d+[a-z]?\b/g, outsideQuotes: false },
  { id: "P2", pattern: /\bUS\d+\b/g, outsideQuotes: false },
  { id: "P3", pattern: /\bT\d{3}\b/g, outsideQuotes: false },
  { id: "P4", pattern: /\bspecs? \d{3}\b/gi, outsideQuotes: false },
  { id: "P5", pattern: /\bper spec\b/gi, outsideQuotes: false },
  { id: "P6", pattern: /\bBI\b/g, outsideQuotes: false },
  { id: "P7", pattern: /\b[ABDQR]\d{1,2}\b/g, outsideQuotes: true },
];

/** The report's nine verdict columns, in matrix order (data-model E10). */
export const CHECK_COLUMNS = [
  "Purpose",
  "Budget",
  "Safety",
  "Detail",
  "IDs",
  "Self-contained",
  "Family",
  "Shared fields",
  "Index",
] as const;
export type CheckColumn = (typeof CHECK_COLUMNS)[number];

/** The instructions line that says how to open any tool's full contract (contract §I1). */
export const HELP_POINTER_LINE = "- `help` with a tool's name returns its full contract; with none, it lists every tool.";

// ---------- pure helpers ----------

export interface InternalIdHit {
  pattern: string;
  match: string;
  index: number;
}

// Blank backtick spans and double-quoted strings with spaces of the same length, so indices stay true.
function blankQuoted(text: string): string {
  return text.replace(/`[^`]*`|"[^"]*"/g, (m) => " ".repeat(m.length));
}

export function findInternalIds(text: string): InternalIdHit[] {
  const blanked = blankQuoted(text);
  const hits: InternalIdHit[] = [];
  for (const { id, pattern, outsideQuotes } of INTERNAL_ID_PATTERNS) {
    for (const m of (outsideQuotes ? blanked : text).matchAll(pattern)) {
      hits.push({ pattern: id, match: m[0], index: m.index });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** The description up to and including the first `.` followed by whitespace or the end (data-model E4). */
export function firstSentence(description: string): string {
  const m = /^[\s\S]*?\.(?=\s|$)/.exec(description);
  return m ? m[0] : description;
}

/** `- **<name>** — <text>` lines of docs/tools/index.md, as name → text (data-model E5). */
export function parseIndexEntries(indexText: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const m of indexText.matchAll(/^- \*\*([^*]+)\*\* — (.*?)\r?$/gm)) {
    entries.set(m[1]!, m[2]!);
  }
  return entries;
}

/** Every other member of every family that contains `name`, sorted. */
export function siblingsOf(name: string): string[] {
  const siblings = new Set<string>();
  for (const members of Object.values(FAMILIES)) {
    if (!members.includes(name)) continue;
    for (const member of members) if (member !== name) siblings.add(member);
  }
  return [...siblings].sort();
}

/** The siblings of `name` that `description` does not name in backticks. */
export function missingSiblings(name: string, description: string): string[] {
  return siblingsOf(name).filter((sibling) => !description.includes(`\`${sibling}\``));
}

/** A tool as `tools/list` publishes it, with a missing description read as empty. */
export type PublishedTool = Tool & { description: string };

function collectDescriptions(node: unknown, path: string, out: Array<[string, string]>): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((item, i) => collectDescriptions(item, `${path}.${i}`, out));
    return;
  }
  const record = node as Record<string, unknown>;
  if (typeof record.description === "string") out.push([path, record.description]);
  for (const [key, value] of Object.entries(record)) collectDescriptions(value, `${path}.${key}`, out);
}

/** `[path, text]` for the tool's description and every `description` at any depth of its schemas. */
export function describedTexts(tool: PublishedTool): Array<[string, string]> {
  const out: Array<[string, string]> = [[`${tool.name}#description`, tool.description]];
  collectDescriptions(tool.inputSchema, `${tool.name}#input`, out);
  collectDescriptions(tool.outputSchema, `${tool.name}#output`, out);
  return out;
}

/** The routing lines of the instructions: those between `Which tool:` and the next blank line. */
export function routingLines(instructions: string): string[] {
  const lines = instructions.split("\n");
  const start = lines.indexOf("Which tool:");
  if (start === -1) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length && lines[i]!.trim() !== ""; i++) out.push(lines[i]!);
  return out;
}

// ---------- reviewer record (data-model E9) ----------

const verdictSchema = z.enum(["PASS", "PARTIAL", "FAIL", "N/A"]);
type Verdict = z.infer<typeof verdictSchema>;

const checkVerdictSchema = z
  .strictObject({ verdict: verdictSchema, gap: z.string().min(1).optional() })
  .superRefine((value, ctx) => {
    if ((value.verdict === "FAIL" || value.verdict === "PARTIAL") && value.gap === undefined) {
      ctx.addIssue({ code: "custom", path: ["gap"], message: `gap is required when verdict is ${value.verdict}` });
    }
  });

const fingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/, "must be 64 lowercase hex characters");

const toolRecordSchema = z.strictObject({
  descriptionFingerprint: fingerprintSchema,
  schemaFingerprint: fingerprintSchema,
  checks: z.strictObject({
    purpose: checkVerdictSchema,
    safety: checkVerdictSchema,
    detail: checkVerdictSchema,
    selfContained: checkVerdictSchema,
    family: checkVerdictSchema,
    sharedFields: checkVerdictSchema,
  }),
});

export const descriptionAuditRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  tools: z.record(z.string(), toolRecordSchema),
  routing: z.record(z.string(), checkVerdictSchema),
});

export type DescriptionAuditRecord = z.infer<typeof descriptionAuditRecordSchema>;
type ToolRecord = DescriptionAuditRecord["tools"][string];
type JudgementCheck = keyof ToolRecord["checks"];

// ---------- live surface (data-model E1) ----------

export interface PublishedSurface {
  tools: PublishedTool[];
  instructions: string;
  indexText: string;
  helpPageCount: number;
}

export interface CollectDeps {
  /** Builds the server to audit; defaults to the real composition root with empty access settings. */
  buildMcpServer?: () => McpServer;
  /** The help pages directory; defaults to the one `help` serves. */
  docsDir?: string;
}

/**
 * The published surface as a client sees it. The default server is built with an empty `env`, so the
 * owner's access settings never shrink the audited list (data-model E1).
 */
export async function collectPublishedSurface(deps: CollectDeps = {}): Promise<PublishedSurface> {
  const build = deps.buildMcpServer ?? (() => quietServer({}).buildMcpServer());
  const docsDir = deps.docsDir ?? DOCS_DIR;
  const { tools, instructions } = await listPublished(build(), "description-audit");
  return {
    tools: tools.map((t) => ({ ...t, description: t.description ?? "" })),
    instructions: instructions ?? "",
    indexText: await readFile(join(docsDir, "index.md"), "utf8"),
    helpPageCount: (await listToolPages(docsDir)).length,
  };
}

// ---------- audit result ----------

const NEEDS_REVIEW = "NEEDS REVIEW";

/** One verdict cell of the matrix or the routing table. */
export interface Cell {
  verdict: Verdict | typeof NEEDS_REVIEW;
  /** Shown in parentheses after the verdict: the length in `PASS (312)`, the old verdict in `NEEDS REVIEW (was PASS)`. */
  detail?: string;
  /** Text for the Gaps (FAIL / PARTIAL) or Notes (any other verdict) section. */
  note?: string;
}

/** The cell as the report prints it (data-model E10). */
export function cellText(cell: Cell): string {
  return cell.detail === undefined ? cell.verdict : `${cell.verdict} (${cell.detail})`;
}

function isGap(cell: Cell): boolean {
  return cell.verdict === "FAIL" || cell.verdict === "PARTIAL";
}

function withNote(cell: Cell, note: string | undefined): Cell {
  return note === undefined ? cell : { ...cell, note };
}

export interface ToolAudit {
  name: string;
  cells: Record<CheckColumn, Cell>;
}

export interface AuditResult {
  /** One entry per registered tool, sorted by name. */
  tools: ToolAudit[];
  /** One entry per published routing line, in instructions order. */
  routing: Array<{ line: string; cell: Cell }>;
  toolCount: number;
  helpPageCount: number;
  /** All top-level descriptions together, in characters. */
  totalLength: number;
  totalVerdict: Verdict;
  helpPointerInInstructions: Verdict;
  helpPointerInHelp: Verdict;
  /** Internal identifiers in the instructions and the index header, as `where: match`. */
  headerIdHits: string[];
  /** Cells whose verdict is NEEDS REVIEW, routing lines included. */
  needsReview: number;
  /** Per shared field (E7), its distinct descriptions with the tools that carry each, in roster order. */
  sharedFieldDescriptions: Array<{ field: string; descriptions: Array<{ text: string; tools: string[] }> }>;
}

const pass = (ok: boolean): Verdict => (ok ? "PASS" : "FAIL");

function inputFieldNames(tool: PublishedTool): string[] {
  return Object.keys(tool.inputSchema.properties ?? {});
}

function fieldDescription(tool: PublishedTool, field: string): string | undefined {
  const property = tool.inputSchema.properties?.[field];
  if (property === null || typeof property !== "object" || Array.isArray(property)) return undefined;
  return typeof property.description === "string" ? property.description : undefined;
}

function judgedCell(recorded: ToolRecord | undefined, fresh: boolean, check: JudgementCheck): Cell {
  if (recorded === undefined) return { verdict: NEEDS_REVIEW, detail: "not recorded" };
  const { verdict, gap } = recorded.checks[check];
  return withNote(fresh ? { verdict } : { verdict: NEEDS_REVIEW, detail: `was ${verdict}` }, gap);
}

function auditTool(tool: PublishedTool, recorded: ToolRecord | undefined, indexEntry: string | undefined): ToolAudit {
  const live = fingerprintTool(tool);
  const fresh =
    recorded !== undefined &&
    recorded.descriptionFingerprint === live.descriptionFingerprint &&
    recorded.schemaFingerprint === live.schemaFingerprint;
  const judged = (check: JudgementCheck): Cell => judgedCell(recorded, fresh, check);
  // A judged check the tool's shape makes not applicable: N/A, keeping any recorded note.
  const notApplicable = (check: JudgementCheck): Cell => withNote({ verdict: "N/A" }, recorded?.checks[check].gap);

  const length = tool.description.length;
  const budget: Cell =
    length <= DESCRIPTION_BUDGET
      ? { verdict: "PASS", detail: String(length) }
      : {
          verdict: "FAIL",
          detail: String(length),
          note: `The description is ${length} characters, ${length - DESCRIPTION_BUDGET} over the ${DESCRIPTION_BUDGET}-character budget.`,
        };

  const idHits: string[] = [];
  for (const [where, text] of describedTexts(tool)) {
    for (const hit of findInternalIds(text)) idHits.push(`${where}: ${hit.match}`);
  }
  if (indexEntry !== undefined) {
    for (const hit of findInternalIds(indexEntry)) idHits.push(`index.md#${tool.name}: ${hit.match}`);
  }
  const ids: Cell =
    idHits.length === 0 ? { verdict: "PASS" } : { verdict: "FAIL", note: `Internal identifiers found: ${idHits.join("; ")}.` };

  const first = firstSentence(tool.description);
  const index: Cell =
    indexEntry === undefined
      ? { verdict: "FAIL", note: "docs/tools/index.md has no entry for this tool." }
      : indexEntry === first
        ? { verdict: "PASS" }
        : { verdict: "FAIL", note: `The index entry is "${indexEntry}" but the first sentence is "${first}".` };

  const missing = missingSiblings(tool.name, tool.description);
  const family: Cell =
    siblingsOf(tool.name).length === 0
      ? notApplicable("family")
      : missing.length > 0
        ? { verdict: "FAIL", note: `The description does not name ${missing.map((m) => `\`${m}\``).join(", ")}.` }
        : judged("family");

  const fields = inputFieldNames(tool);
  const sharedFields = SHARED_FIELDS.some((f) => fields.includes(f)) ? judged("sharedFields") : notApplicable("sharedFields");

  return {
    name: tool.name,
    cells: {
      Purpose: judged("purpose"),
      Budget: budget,
      Safety: judged("safety"),
      Detail: judged("detail"),
      IDs: ids,
      "Self-contained": judged("selfContained"),
      Family: family,
      "Shared fields": sharedFields,
      Index: index,
    },
  };
}

/** Every verdict of the audit (data-model E10), mechanical ones computed and judged ones read from `record`. */
export function auditSurface(surface: PublishedSurface, record: DescriptionAuditRecord): AuditResult {
  const sorted = [...surface.tools].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const indexEntries = parseIndexEntries(surface.indexText);
  const tools = sorted.map((t) => auditTool(t, record.tools[t.name], indexEntries.get(t.name)));

  const routing = routingLines(surface.instructions).map((line) => {
    const entry = record.routing[line];
    const cell: Cell = entry === undefined ? { verdict: NEEDS_REVIEW } : withNote({ verdict: entry.verdict }, entry.gap);
    return { line, cell };
  });

  const allCells = [...tools.flatMap((t) => Object.values(t.cells)), ...routing.map((r) => r.cell)];
  const totalLength = surface.tools.reduce((sum, t) => sum + t.description.length, 0);
  const help = surface.tools.find((t) => t.name === "help");
  const indexHeader = surface.indexText
    .split("\n")
    .filter((line) => !/^- \*\*[^*]+\*\* — /.test(line))
    .join("\n");

  return {
    tools,
    routing,
    toolCount: surface.tools.length,
    helpPageCount: surface.helpPageCount,
    totalLength,
    totalVerdict: pass(totalLength <= TOTAL_DESCRIPTION_BUDGET),
    helpPointerInInstructions: pass(surface.instructions.includes(HELP_POINTER_LINE)),
    helpPointerInHelp: pass(
      help !== undefined && help.description.includes("full contract") && help.description.includes("tool_name"),
    ),
    headerIdHits: [
      ...findInternalIds(surface.instructions).map((h) => `instructions: ${h.match}`),
      ...findInternalIds(indexHeader).map((h) => `index header: ${h.match}`),
    ],
    needsReview: allCells.filter((c) => c.verdict === NEEDS_REVIEW).length,
    sharedFieldDescriptions: SHARED_FIELDS.map((field) => {
      const byText = new Map<string, string[]>();
      for (const tool of sorted) {
        if (!inputFieldNames(tool).includes(field)) continue;
        const text = fieldDescription(tool, field)?.replace(/\s+/g, " ") ?? "(no description)";
        byText.set(text, [...(byText.get(text) ?? []), tool.name]);
      }
      return { field, descriptions: [...byText].map(([text, names]) => ({ text, tools: names })) };
    }),
  };
}

// ---------- report (data-model E10) ----------

export interface ReportMeta {
  version: string;
  sha: string;
  branch: string;
  date: string;
}

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** The audit report as Markdown (data-model E10): `auditSurface`'s result, formatted. */
export function renderAuditReport(
  surface: PublishedSurface,
  record: DescriptionAuditRecord,
  meta: ReportMeta,
): string {
  const audit = auditSurface(surface, record);
  const gaps: string[] = [];
  const notes: string[] = [];
  const file = (heading: string, cell: Cell) => {
    if (cell.note !== undefined) (isGap(cell) ? gaps : notes).push(`### ${heading} (${cellText(cell)})\n\n${cell.note}`);
  };

  const rows = audit.tools.map(({ name, cells }) => {
    for (const column of CHECK_COLUMNS) file(`${name}: ${column}`, cells[column]);
    return `| ${name} | ${CHECK_COLUMNS.map((c) => cellText(cells[c])).join(" | ")} |`;
  });
  const routingRows = audit.routing.map(({ line, cell }) => {
    file(`Routing: ${line}`, cell);
    return `| ${line} | ${cellText(cell)} |`;
  });

  const countVerdict =
    audit.toolCount === audit.helpPageCount
      ? "PASS"
      : `FAIL (${audit.toolCount} tools registered, ${audit.helpPageCount} help pages)`;
  const headerIds = audit.headerIdHits.length === 0 ? "PASS" : `FAIL (${audit.headerIdHits.join("; ")})`;

  const lines = [
    `# Tool description audit: ${meta.version} (${meta.sha}, ${meta.branch}), ${meta.date}`,
    "",
    `- Registered tools: ${audit.toolCount}, measured with empty access settings; help pages: ${audit.helpPageCount}. ${countVerdict}`,
    `- Per-tool description budget: ${DESCRIPTION_BUDGET} characters.`,
    `- Total description budget: ${formatCount(TOTAL_DESCRIPTION_BUDGET)} characters; measured ${formatCount(audit.totalLength)}. ${audit.totalVerdict}`,
    `- Help pointer in the instructions: ${audit.helpPointerInInstructions}`,
    `- Help pointer in the \`help\` description: ${audit.helpPointerInHelp}`,
    `- Internal identifiers in the instructions and the index header: ${headerIds}`,
    `- Cells needing review: ${audit.needsReview}`,
    "",
    "## Matrix",
    "",
    `| Tool | ${CHECK_COLUMNS.join(" | ")} |`,
    `|---|${CHECK_COLUMNS.map(() => "---").join("|")}|`,
    ...rows,
    "",
    "## Gaps",
    "",
    ...(gaps.length === 0 ? ["None."] : gaps.flatMap((g) => [g, ""])),
    "",
    "## Notes",
    "",
    ...(notes.length === 0 ? ["None."] : notes.flatMap((n) => [n, ""])),
    "",
    "## Routing walk-through",
    "",
    "| Routing line | Verdict |",
    "|---|---|",
    ...routingRows,
    "",
    "## Shared-field descriptions",
    "",
  ];

  for (const { field, descriptions } of audit.sharedFieldDescriptions) {
    lines.push(`### \`${field}\``, "");
    if (descriptions.length === 0) lines.push("No tool takes this field.");
    for (const { text, tools } of descriptions) lines.push(`- ${tools.map((n) => `\`${n}\``).join(", ")}: ${text}`);
    lines.push("");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
