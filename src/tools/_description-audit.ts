// Original — no upstream. Tool-description audit (spec 092): budgets, family and shared-field rosters, internal-identifier patterns, first-sentence and index parsing, the reviewer-record schema, the live-surface collector and the Markdown report. Test-support module: used by _description-quality.test.ts and scripts/audit-descriptions.ts, excluded from dist/.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { createServer } from "../server.js";
import { connectInMemoryClient } from "./_mcp-client-fixtures.js";
import { canonicalJSON, sha256 } from "./_register-baseline.js";
import { DOCS_DIR, listToolPages } from "./help/handler.js";

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

export const JUDGEMENT_CHECKS = ["purpose", "safety", "detail", "selfContained", "family", "sharedFields"] as const;
export type JudgementCheck = (typeof JUDGEMENT_CHECKS)[number];

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
type CheckColumn = (typeof CHECK_COLUMNS)[number];

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

export interface PublishedTool {
  name: string;
  description: string;
  inputSchema: unknown;
  outputSchema?: unknown;
}

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

export function toolFingerprints(tool: PublishedTool): { descriptionFingerprint: string; schemaFingerprint: string } {
  return {
    descriptionFingerprint: sha256(tool.description),
    schemaFingerprint: sha256(canonicalJSON(tool.inputSchema)),
  };
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
type CheckVerdict = z.infer<typeof checkVerdictSchema>;

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
  const build =
    deps.buildMcpServer ?? (() => createServer({ registerSignalHandlers: false, env: {} }).buildMcpServer());
  const docsDir = deps.docsDir ?? DOCS_DIR;
  const client = await connectInMemoryClient(build(), "description-audit");
  try {
    const { tools } = await client.listTools(undefined, { cacheMode: "bypass" });
    return {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description ?? "",
        inputSchema: t.inputSchema,
        ...(t.outputSchema !== undefined ? { outputSchema: t.outputSchema } : {}),
      })),
      instructions: client.getInstructions() ?? "",
      indexText: await readFile(join(docsDir, "index.md"), "utf8"),
      helpPageCount: (await listToolPages(docsDir)).length,
    };
  } finally {
    await client.close();
  }
}

// ---------- report (data-model E10) ----------

export interface ReportMeta {
  version: string;
  sha: string;
  branch: string;
  date: string;
}

interface Cell {
  display: string;
  /** Text for the Gaps (FAIL / PARTIAL) or Notes (anything else) section. */
  note?: string;
}

const NEEDS_REVIEW = "NEEDS REVIEW";

function isGapVerdict(display: string): boolean {
  return display.startsWith("FAIL") || display.startsWith("PARTIAL");
}

function inputFieldNames(tool: PublishedTool): string[] {
  const properties = (tool.inputSchema as { properties?: Record<string, unknown> } | null)?.properties;
  return properties ? Object.keys(properties) : [];
}

function fieldDescription(tool: PublishedTool, field: string): string | undefined {
  const properties = (tool.inputSchema as { properties?: Record<string, { description?: unknown }> }).properties;
  const description = properties?.[field]?.description;
  return typeof description === "string" ? description : undefined;
}

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

function judgedCell(
  recorded: DescriptionAuditRecord["tools"][string] | undefined,
  fresh: boolean,
  check: JudgementCheck,
): Cell {
  if (recorded === undefined) return { display: `${NEEDS_REVIEW} (not recorded)` };
  const entry: CheckVerdict = recorded.checks[check];
  if (!fresh) return { display: `${NEEDS_REVIEW} (was ${entry.verdict})`, ...(entry.gap ? { note: entry.gap } : {}) };
  return { display: entry.verdict, ...(entry.gap ? { note: entry.gap } : {}) };
}

function toolCells(
  tool: PublishedTool,
  recorded: DescriptionAuditRecord["tools"][string] | undefined,
  indexEntries: Map<string, string>,
): Record<CheckColumn, Cell> {
  const live = toolFingerprints(tool);
  const fresh =
    recorded !== undefined &&
    recorded.descriptionFingerprint === live.descriptionFingerprint &&
    recorded.schemaFingerprint === live.schemaFingerprint;
  const judged = (check: JudgementCheck): Cell => judgedCell(recorded, fresh, check);

  const length = tool.description.length;
  const budget: Cell =
    length <= DESCRIPTION_BUDGET
      ? { display: `PASS (${length})` }
      : {
          display: `FAIL (${length})`,
          note: `The description is ${length} characters, ${length - DESCRIPTION_BUDGET} over the ${DESCRIPTION_BUDGET}-character budget.`,
        };

  const indexEntry = indexEntries.get(tool.name);
  const idHits: string[] = [];
  for (const [where, text] of describedTexts(tool)) {
    for (const hit of findInternalIds(text)) idHits.push(`${where}: ${hit.match}`);
  }
  if (indexEntry !== undefined) {
    for (const hit of findInternalIds(indexEntry)) idHits.push(`index.md#${tool.name}: ${hit.match}`);
  }
  const ids: Cell =
    idHits.length === 0
      ? { display: "PASS" }
      : { display: "FAIL", note: `Internal identifiers found: ${idHits.join("; ")}.` };

  const first = firstSentence(tool.description);
  const index: Cell =
    indexEntry === undefined
      ? { display: "FAIL", note: "docs/tools/index.md has no entry for this tool." }
      : indexEntry === first
        ? { display: "PASS" }
        : { display: "FAIL", note: `The index entry is "${indexEntry}" but the first sentence is "${first}".` };

  let family: Cell;
  if (siblingsOf(tool.name).length === 0) {
    family = { display: "N/A" };
    const recordedNote = judged("family").note;
    if (recordedNote) family.note = recordedNote;
  } else {
    const missing = missingSiblings(tool.name, tool.description);
    family =
      missing.length > 0
        ? { display: "FAIL", note: `The description does not name ${missing.map((m) => `\`${m}\``).join(", ")}.` }
        : judged("family");
  }

  const fields = inputFieldNames(tool);
  const hasShared = SHARED_FIELDS.some((f) => fields.includes(f));
  let sharedFields: Cell;
  if (hasShared) {
    sharedFields = judged("sharedFields");
  } else {
    sharedFields = { display: "N/A" };
    const recordedNote = judged("sharedFields").note;
    if (recordedNote) sharedFields.note = recordedNote;
  }

  return {
    Purpose: judged("purpose"),
    Budget: budget,
    Safety: judged("safety"),
    Detail: judged("detail"),
    IDs: ids,
    "Self-contained": judged("selfContained"),
    Family: family,
    "Shared fields": sharedFields,
    Index: index,
  };
}

function helpPointerInDescription(surface: PublishedSurface): boolean {
  const help = surface.tools.find((t) => t.name === "help");
  return help !== undefined && help.description.includes("full contract") && help.description.includes("tool_name");
}

/** The audit report as Markdown (data-model E10). */
export function renderAuditReport(
  surface: PublishedSurface,
  record: DescriptionAuditRecord,
  meta: ReportMeta,
): string {
  const tools = [...surface.tools].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const indexEntries = parseIndexEntries(surface.indexText);
  const gaps: string[] = [];
  const notes: string[] = [];
  let needsReview = 0;

  const rows: string[] = [];
  for (const tool of tools) {
    const cells = toolCells(tool, record.tools[tool.name], indexEntries);
    for (const column of CHECK_COLUMNS) {
      const cell = cells[column];
      if (cell.display.startsWith(NEEDS_REVIEW)) needsReview++;
      if (cell.note === undefined) continue;
      const entry = `### ${tool.name}: ${column} (${cell.display})\n\n${cell.note}`;
      (isGapVerdict(cell.display) ? gaps : notes).push(entry);
    }
    rows.push(`| ${tool.name} | ${CHECK_COLUMNS.map((c) => cells[c].display).join(" | ")} |`);
  }

  const routingRows: string[] = [];
  for (const line of routingLines(surface.instructions)) {
    const entry = record.routing[line];
    if (entry === undefined) needsReview++;
    const display = entry === undefined ? NEEDS_REVIEW : entry.verdict;
    routingRows.push(`| ${line} | ${display} |`);
    if (entry?.gap !== undefined) {
      const text = `### Routing: ${line} (${display})\n\n${entry.gap}`;
      (isGapVerdict(display) ? gaps : notes).push(text);
    }
  }

  const total = surface.tools.reduce((sum, t) => sum + t.description.length, 0);
  const countVerdict =
    surface.tools.length === surface.helpPageCount
      ? "PASS"
      : `FAIL (${surface.tools.length} tools registered, ${surface.helpPageCount} help pages)`;
  const totalVerdict: Verdict = total <= TOTAL_DESCRIPTION_BUDGET ? "PASS" : "FAIL";
  const indexHeader = surface.indexText
    .split("\n")
    .filter((line) => !/^- \*\*[^*]+\*\* — /.test(line))
    .join("\n");
  const headerHits = [
    ...findInternalIds(surface.instructions).map((h) => `instructions: ${h.match}`),
    ...findInternalIds(indexHeader).map((h) => `index header: ${h.match}`),
  ];

  const lines = [
    `# Tool description audit: ${meta.version} (${meta.sha}, ${meta.branch}), ${meta.date}`,
    "",
    `- Registered tools: ${surface.tools.length}, measured with empty access settings; help pages: ${surface.helpPageCount}. ${countVerdict}`,
    `- Per-tool description budget: ${DESCRIPTION_BUDGET} characters.`,
    `- Total description budget: ${formatCount(TOTAL_DESCRIPTION_BUDGET)} characters; measured ${formatCount(total)}. ${totalVerdict}`,
    `- Help pointer in the instructions: ${surface.instructions.includes(HELP_POINTER_LINE) ? "PASS" : "FAIL"}`,
    `- Help pointer in the \`help\` description: ${helpPointerInDescription(surface) ? "PASS" : "FAIL"}`,
    `- Internal identifiers in the instructions and the index header: ${headerHits.length === 0 ? "PASS" : `FAIL (${headerHits.join("; ")})`}`,
    `- Cells needing review: ${needsReview}`,
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

  for (const field of SHARED_FIELDS) {
    const byText = new Map<string, string[]>();
    for (const tool of tools) {
      if (!inputFieldNames(tool).includes(field)) continue;
      const text = fieldDescription(tool, field)?.replace(/\s+/g, " ") ?? "(no description)";
      byText.set(text, [...(byText.get(text) ?? []), tool.name]);
    }
    lines.push(`### \`${field}\``, "");
    if (byText.size === 0) lines.push("No tool takes this field.");
    for (const [text, names] of byText) lines.push(`- ${names.map((n) => `\`${n}\``).join(", ")}: ${text}`);
    lines.push("");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
