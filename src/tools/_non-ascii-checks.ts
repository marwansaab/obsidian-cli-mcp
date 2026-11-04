// Original — no upstream. Non-ASCII release checks (spec 093): fixture set, scenario table, tool-result parsing, PASS / FAIL / BLOCKED classifiers, retry helper, report renderer and exit-status rule for scripts/check-non-ascii.ts; pure, zod only, no relative imports.
//
// Node loads this file by type stripping when the script imports it, so it uses erasable TypeScript only (no enum,
// namespace, parameter properties or `import = require`). Every comparison is exact `===` (research D9): never add a
// normalising helper here "for robustness", because the checks exist to catch a changed form of a string.
import { z } from "zod";

// === Run arguments (data-model E1) ===

export interface RunArgs {
  testVault: string;
  semanticVault: string;
  stagedNote?: string;
}

export const USAGE =
  "usage: npm run check:non-ascii -- --test-vault <name> --semantic-vault <name> [--staged-note <path>]";

/** Validate the parsed flags; a usage error means exit status 2 with no report (contract §C). */
export function validateArgs(values: {
  "test-vault"?: string;
  "semantic-vault"?: string;
  "staged-note"?: string;
}): RunArgs | { usageError: string } {
  const testVault = values["test-vault"];
  const semanticVault = values["semantic-vault"];
  if (testVault === undefined || testVault === "")
    return { usageError: "--test-vault is required" };
  if (semanticVault === undefined || semanticVault === "")
    return { usageError: "--semantic-vault is required" };
  if (testVault === semanticVault) return { usageError: "vault names must differ" };
  return { testVault, semanticVault, stagedNote: values["staged-note"] };
}

// === Fixture set (data-model E2) and semantic-vault inputs (E3) ===

export interface FixtureFile {
  path: string;
  content: string;
}

export interface SearchMatch {
  path: string;
  line: number;
  match: string;
  text: string;
}

export interface Fixtures {
  runFolder: string;
  folder: string;
  source: string;
  target: string;
  outside: string;
  missingFolder: string;
  /** The files to write, in order; every folder they need is `runFolder` or `folder`. */
  files: FixtureFile[];
  sourceMatch: SearchMatch;
  outsideMatch: SearchMatch;
}

/** `(level, text)` of every heading in the source note, in order. — is U+2014; 🚀 and 🎉 lie outside the BMP. */
export const EXPECTED_HEADINGS: ReadonlyArray<readonly [number, string]> = [
  [1, "BI-001 — Überblick 🚀"],
  [2, "Café — naïve 日本"],
  [3, "Ünïcödé 🎉 test"],
];
export const LINK_TARGET = "Résumé 東京";
export const PATTERN = "café\\d+";

const lines = (...l: string[]): string => `${l.join("\n")}\n`;

/** The E2 fixtures under `runFolder` (vault-relative, forward slashes). */
export function buildFixtures(runFolder: string): Fixtures {
  const folder = `${runFolder}/日本語フォルダ`;
  const source = `${folder}/Café 日記.md`;
  const target = `${runFolder}/${LINK_TARGET}.md`;
  const outside = `${runFolder}/outside.md`;
  return {
    runFolder,
    folder,
    source,
    target,
    outside,
    missingFolder: `${runFolder}/存在しないフォルダ`,
    files: [
      {
        path: source,
        content: lines(
          "# BI-001 — Überblick 🚀",
          "",
          "Order café42 arrived.",
          "",
          "## Café — naïve 日本",
          "",
          `See [[${LINK_TARGET}]].`,
          "",
          "### Ünïcödé 🎉 test",
        ),
      },
      { path: target, content: lines("Target note.") },
      { path: outside, content: lines("Price café77 noted.") },
    ],
    sourceMatch: { path: source, line: 3, match: "café42", text: "Order café42 arrived." },
    outsideMatch: { path: outside, line: 1, match: "café77", text: "Price café77 noted." },
  };
}

const two = (n: number): string => String(n).padStart(2, "0");

/** `Sandbox/non-ascii-check-<YYYYMMDD-HHMMSS>-<4 hex>`, in local time. */
export function runFolderName(at: Date, hex4: string): string {
  const date = `${at.getFullYear()}${two(at.getMonth() + 1)}${two(at.getDate())}`;
  const time = `${two(at.getHours())}${two(at.getMinutes())}${two(at.getSeconds())}`;
  return `Sandbox/non-ascii-check-${date}-${time}-${hex4}`;
}

/** The S2 path, never created in the semantic vault (research D6). */
export function missingNotePath(hex8: string): string {
  return `_non-ascii-check/存在しない ノート café — ${hex8}.md`;
}

/** True when some code point is above U+007F. */
export function hasNonAscii(s: string): boolean {
  return [...s].some((c) => (c.codePointAt(0) ?? 0) > 0x7f);
}

// === Tool result (data-model E5) ===

export interface ErrorPayload {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export type ToolResult =
  | { kind: "ok"; payload: Record<string, unknown> }
  | { kind: "error"; payload: ErrorPayload }
  | { kind: "unexpected"; raw: unknown };

const objectSchema = z.record(z.string(), z.unknown());
const callResultSchema = z
  .object({
    isError: z.boolean().optional(),
    structuredContent: objectSchema.optional(),
    content: z.array(z.object({ type: z.literal("text"), text: z.string() }).loose()).min(1),
  })
  .loose();
const errorPayloadSchema = z
  .object({ code: z.string(), message: z.string(), details: objectSchema })
  .loose();

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Parse a `callTool` result. Any shape other than a success or a `{code, message, details}` error is `unexpected`. */
export function parseToolResult(raw: unknown): ToolResult {
  const unexpected: ToolResult = { kind: "unexpected", raw };
  const parsed = callResultSchema.safeParse(raw);
  if (!parsed.success) return unexpected;
  const text = parsed.data.content[0]?.text ?? "";
  if (parsed.data.isError === true) {
    const payload = errorPayloadSchema.safeParse(parseJson(text));
    return payload.success ? { kind: "error", payload: payload.data } : unexpected;
  }
  if (parsed.data.structuredContent !== undefined)
    return { kind: "ok", payload: parsed.data.structuredContent };
  const payload = objectSchema.safeParse(parseJson(text));
  return payload.success ? { kind: "ok", payload: payload.data } : unexpected;
}

// === Check context (data-model E6) ===

export interface CheckContext {
  testVaultListed: boolean;
  semanticVaultListed: boolean;
  /** The message of a failing `vaults` call; both vaults then count as not listed. */
  vaultsError?: string;
  semanticRoot?: string;
  fixturesVisible: boolean;
  outsideSeenByP1: boolean;
  stagedNoteOnDisk: boolean;
  missingNoteAbsent: boolean;
}

export interface VaultFacts {
  testVaultListed: boolean;
  semanticVaultListed: boolean;
  vaultsError?: string;
  testRoot?: string;
  semanticRoot?: string;
}

const vaultsPayloadSchema = z
  .object({ vaults: z.array(z.object({ name: z.string(), path: z.string() }).loose()) })
  .loose();

/** Which of the two vaults the `vaults` tool lists, and their folders (the first entry wins on a duplicate name). */
export function vaultFacts(result: ToolResult, args: RunArgs): VaultFacts {
  const none = { testVaultListed: false, semanticVaultListed: false };
  if (result.kind === "error") return { ...none, vaultsError: result.payload.message };
  const parsed = result.kind === "ok" ? vaultsPayloadSchema.safeParse(result.payload) : undefined;
  if (parsed?.success !== true) return { ...none, vaultsError: "unexpected result shape" };
  const rootOf = (name: string) => parsed.data.vaults.find((v) => v.name === name)?.path;
  const testRoot = rootOf(args.testVault);
  const semanticRoot = rootOf(args.semanticVault);
  return {
    testVaultListed: testRoot !== undefined,
    semanticVaultListed: semanticRoot !== undefined,
    ...(testRoot !== undefined && { testRoot }),
    ...(semanticRoot !== undefined && { semanticRoot }),
  };
}

/** The readiness probe (research D4): `read` returned the outside note's exact content. */
export function fixturesVisibleIn(result: ToolResult, fixtures: Fixtures): boolean {
  const outside = fixtures.files.find((f) => f.path === fixtures.outside);
  return result.kind === "ok" && result.payload["content"] === outside?.content;
}

// === Scenario (E4), verdict and outcome (E7) ===

export interface RunInputs {
  args: RunArgs;
  fixtures: Fixtures;
  missingNote: string;
}

export type Verdict =
  | { status: "PASS" }
  | { status: "FAIL" }
  | { status: "BLOCKED"; precondition: string };

export interface Outcome {
  status: "PASS" | "FAIL" | "BLOCKED";
  id: string;
  capability: string;
  tool: string;
  input: Record<string, unknown>;
  expected?: string;
  actual?: unknown;
  precondition?: string;
}

export interface Scenario {
  id: string;
  capability: string;
  tool: string;
  vaultRole: "test" | "semantic";
  retry: boolean;
  input(inputs: RunInputs): Record<string, unknown>;
  /** The expectation in words and values, printed on FAIL. */
  expected(inputs: RunInputs): string;
  /** The first unmet precondition, proved without the route under test; null when the call may run. */
  precondition(ctx: CheckContext, inputs: RunInputs): string | null;
  /** Classify a parsed success or error payload (`unexpected` never reaches here; see `judge`). */
  classify(result: Exclude<ToolResult, { kind: "unexpected" }>, inputs: RunInputs): Verdict;
}

const PASS: Verdict = { status: "PASS" };
const FAIL: Verdict = { status: "FAIL" };
const verdict = (pass: boolean): Verdict => (pass ? PASS : FAIL);
const json = (v: unknown): string => JSON.stringify(v);

function vaultNotListed(ctx: CheckContext, role: string, name: string): string {
  return ctx.vaultsError !== undefined
    ? `vaults call failed: ${ctx.vaultsError}`
    : `${role} vault ${name} not listed by vaults`;
}

/** The precondition every test-vault scenario shares. */
function testVaultPrecondition(ctx: CheckContext, inputs: RunInputs): string | null {
  if (!ctx.testVaultListed) return vaultNotListed(ctx, "test", inputs.args.testVault);
  if (!ctx.fixturesVisible) return "fixtures not visible to Obsidian";
  return null;
}

/** A success payload parsed by `schema`, or undefined for an error or a different shape. */
function successOf<T>(
  result: Exclude<ToolResult, { kind: "unexpected" }>,
  schema: z.ZodType<T>,
): T | undefined {
  if (result.kind !== "ok") return undefined;
  const parsed = schema.safeParse(result.payload);
  return parsed.success ? parsed.data : undefined;
}

/** `[code, details.code, details]` of a `CLI_REPORTED_ERROR`, or undefined. */
function reportedError(
  result: Exclude<ToolResult, { kind: "unexpected" }>,
): { detailsCode: unknown; details: Record<string, unknown> } | undefined {
  if (result.kind !== "error" || result.payload.code !== "CLI_REPORTED_ERROR") return undefined;
  return { detailsCode: result.payload.details["code"], details: result.payload.details };
}

const SC_BLOCKED: Record<string, string> = {
  SMART_CONNECTIONS_NOT_INSTALLED:
    "Smart Connections not installed (SMART_CONNECTIONS_NOT_INSTALLED)",
  SMART_CONNECTIONS_NOT_READY: "Smart Connections not ready (SMART_CONNECTIONS_NOT_READY)",
  SOURCE_NOT_INDEXED: "staged note not indexed by Smart Connections (SOURCE_NOT_INDEXED)",
};

/** A Smart Connections lifecycle code that blocks the scenario (ADR-014), limited to `codes`. */
function smartConnectionsBlock(
  result: Exclude<ToolResult, { kind: "unexpected" }>,
  codes: readonly string[],
): Verdict | undefined {
  const code = reportedError(result)?.detailsCode;
  if (typeof code !== "string" || !codes.includes(code)) return undefined;
  return { status: "BLOCKED", precondition: SC_BLOCKED[code] ?? code };
}

const headingsSchema = z
  .object({ headings: z.array(z.object({ level: z.number(), text: z.string() }).loose()) })
  .loose();
const linksSchema = z.object({ links: z.array(z.object({ target: z.string() }).loose()) }).loose();
const pathsSchema = z.object({ paths: z.array(z.string()) }).loose();
const matchesSchema = z
  .object({
    matches: z.array(
      z.object({ path: z.string(), line: z.number(), match: z.string(), text: z.string() }).loose(),
    ),
  })
  .loose();
const similarSchema = z
  .object({ count: z.number(), matches: z.array(z.object({ path: z.string() }).loose()) })
  .loose();

const sameMatch = (a: SearchMatch, b: SearchMatch): boolean =>
  a.path === b.path && a.line === b.line && a.match === b.match && a.text === b.text;

/** True only when the outside note's match is among a pattern_search result's matches (the P2 gate). */
export function outsideSeen(result: ToolResult, fixtures: Fixtures): boolean {
  if (result.kind === "unexpected") return false;
  const found = successOf(result, matchesSchema);
  return found?.matches.some((m) => sameMatch(m, fixtures.outsideMatch)) ?? false;
}

const TEST_VAULT = { vaultRole: "test" as const, retry: true, precondition: testVaultPrecondition };

/** The eight checks for the spec's nine acceptance scenarios, in contract §S order. */
export const SCENARIOS: Scenario[] = [
  {
    id: "H1",
    capability: "headings",
    tool: "outline",
    ...TEST_VAULT,
    input: ({ args, fixtures }) => ({
      target_mode: "specific",
      vault: args.testVault,
      path: fixtures.source,
    }),
    expected: () => `headings (level, text) equal ${json(EXPECTED_HEADINGS)}`,
    classify: (result) => {
      const headings = successOf(result, headingsSchema)?.headings;
      return verdict(
        headings !== undefined &&
          headings.length === EXPECTED_HEADINGS.length &&
          headings.every(
            (h, i) => h.level === EXPECTED_HEADINGS[i]?.[0] && h.text === EXPECTED_HEADINGS[i]?.[1],
          ),
      );
    },
  },
  {
    id: "L1",
    capability: "links",
    tool: "links",
    ...TEST_VAULT,
    input: ({ args, fixtures }) => ({
      target_mode: "specific",
      vault: args.testVault,
      path: fixtures.source,
    }),
    expected: () => `links include target ${json(LINK_TARGET)}`,
    classify: (result) =>
      verdict(successOf(result, linksSchema)?.links.some((l) => l.target === LINK_TARGET) ?? false),
  },
  {
    id: "F1",
    capability: "folder listing",
    tool: "paths",
    ...TEST_VAULT,
    input: ({ args, fixtures }) => ({
      target_mode: "specific",
      vault: args.testVault,
      folder: fixtures.folder,
    }),
    expected: ({ fixtures }) => `paths equal ${json([fixtures.source])}`,
    classify: (result, { fixtures }) => {
      const paths = successOf(result, pathsSchema)?.paths;
      return verdict(paths !== undefined && paths.length === 1 && paths[0] === fixtures.source);
    },
  },
  {
    id: "F2",
    capability: "folder listing",
    tool: "paths",
    ...TEST_VAULT,
    input: ({ args, fixtures }) => ({
      target_mode: "specific",
      vault: args.testVault,
      folder: fixtures.missingFolder,
    }),
    expected: ({ fixtures }) =>
      `error CLI_REPORTED_ERROR with details.code FOLDER_NOT_FOUND and details.folder ${json(fixtures.missingFolder)}`,
    classify: (result, { fixtures }) => {
      const reported = reportedError(result);
      return verdict(
        reported?.detailsCode === "FOLDER_NOT_FOUND" &&
          reported.details["folder"] === fixtures.missingFolder,
      );
    },
  },
  {
    id: "P1",
    capability: "pattern search",
    tool: "pattern_search",
    ...TEST_VAULT,
    input: ({ args }) => ({ vault: args.testVault, pattern: PATTERN, limit: 10000 }),
    expected: ({ fixtures }) => `matches include ${json(fixtures.sourceMatch)}`,
    classify: (result, { fixtures }) =>
      verdict(
        successOf(result, matchesSchema)?.matches.some((m) => sameMatch(m, fixtures.sourceMatch)) ??
          false,
      ),
  },
  {
    id: "P2",
    capability: "pattern search",
    tool: "pattern_search",
    ...TEST_VAULT,
    precondition: (ctx, inputs) =>
      testVaultPrecondition(ctx, inputs) ??
      (ctx.outsideSeenByP1 ? null : "outside note not seen by the vault-wide search (P1)"),
    input: ({ args, fixtures }) => ({
      vault: args.testVault,
      pattern: PATTERN,
      folder: fixtures.folder,
      limit: 10000,
    }),
    expected: ({ fixtures }) =>
      `matches include ${json(fixtures.sourceMatch)} and every path starts with ${json(`${fixtures.folder}/`)}`,
    classify: (result, { fixtures }) => {
      const matches = successOf(result, matchesSchema)?.matches;
      return verdict(
        matches !== undefined &&
          matches.some((m) => sameMatch(m, fixtures.sourceMatch)) &&
          matches.every((m) => m.path.startsWith(`${fixtures.folder}/`)),
      );
    },
  },
  {
    id: "S1",
    capability: "similar notes",
    tool: "smart_connections_similar",
    vaultRole: "semantic",
    retry: false,
    input: ({ args }) => ({
      target_mode: "specific",
      vault: args.semanticVault,
      path: args.stagedNote,
      limit: 20,
    }),
    expected: ({ args }) =>
      `success with count ≥ 1 and no match path equal to ${json(args.stagedNote)}`,
    precondition: (ctx, { args }) => {
      if (args.stagedNote === undefined) return "no staged note path given";
      if (!hasNonAscii(args.stagedNote)) return "staged note path has no non-ASCII character";
      if (!ctx.semanticVaultListed) return vaultNotListed(ctx, "semantic", args.semanticVault);
      if (!ctx.stagedNoteOnDisk)
        return `staged note not found on disk at ${ctx.semanticRoot}/${args.stagedNote}`;
      return null;
    },
    classify: (result, { args }) => {
      const blocked = smartConnectionsBlock(result, Object.keys(SC_BLOCKED));
      if (blocked !== undefined) return blocked;
      const similar = successOf(result, similarSchema);
      return verdict(
        similar !== undefined &&
          similar.count >= 1 &&
          similar.matches.every((m) => m.path !== args.stagedNote),
      );
    },
  },
  {
    id: "S2",
    capability: "similar notes",
    tool: "smart_connections_similar",
    vaultRole: "semantic",
    retry: false,
    input: ({ args, missingNote }) => ({
      target_mode: "specific",
      vault: args.semanticVault,
      path: missingNote,
      limit: 1,
    }),
    expected: ({ missingNote }) =>
      `error CLI_REPORTED_ERROR with details.code FILE_NOT_FOUND and details.detail ${json(`path: ${missingNote}`)}`,
    precondition: (ctx, { args, missingNote }) => {
      if (!ctx.semanticVaultListed) return vaultNotListed(ctx, "semantic", args.semanticVault);
      if (!ctx.missingNoteAbsent) return `a file exists at ${ctx.semanticRoot}/${missingNote}`;
      return null;
    },
    classify: (result, { missingNote }) => {
      const blocked = smartConnectionsBlock(result, [
        "SMART_CONNECTIONS_NOT_INSTALLED",
        "SMART_CONNECTIONS_NOT_READY",
      ]);
      if (blocked !== undefined) return blocked;
      const reported = reportedError(result);
      return verdict(
        reported?.detailsCode === "FILE_NOT_FOUND" &&
          reported.details["detail"] === `path: ${missingNote}`,
      );
    },
  },
];

function outcomeOf(scenario: Scenario, input: Record<string, unknown>): Omit<Outcome, "status"> {
  return { id: scenario.id, capability: scenario.capability, tool: scenario.tool, input };
}

/** The outcome of one call: FAIL carries expected and actual (FR-011), BLOCKED its precondition (FR-012). */
export function judge(scenario: Scenario, inputs: RunInputs, result: ToolResult): Outcome {
  const base = outcomeOf(scenario, scenario.input(inputs));
  if (result.kind === "unexpected") {
    return {
      ...base,
      status: "FAIL",
      expected: scenario.expected(inputs),
      actual: `unexpected result shape: ${json(result.raw)}`,
    };
  }
  const v = scenario.classify(result, inputs);
  if (v.status === "BLOCKED") return { ...base, status: "BLOCKED", precondition: v.precondition };
  if (v.status === "PASS") return { ...base, status: "PASS" };
  return { ...base, status: "FAIL", expected: scenario.expected(inputs), actual: result.payload };
}

/** A call that threw (for example, the transport closed) fails its own scenario only (FR-010). */
export function outcomeFromError(
  scenario: Scenario,
  input: Record<string, unknown>,
  err: unknown,
): Outcome {
  return {
    ...outcomeOf(scenario, input),
    status: "FAIL",
    expected: "a tool result",
    actual: err instanceof Error ? err.message : String(err),
  };
}

// === Retry (research D4) ===

export const RETRY_INTERVAL_MS = 500;
export const DEADLINE_MS = 30000;

export interface RetryOptions {
  intervalMs: number;
  deadlineMs: number;
  sleep(ms: number): Promise<void>;
  now(): number;
}

/** Run `attempt` every `intervalMs` until `done` holds or `deadlineMs` has passed; return the last value. */
export async function retryUntil<T>(
  attempt: () => Promise<T>,
  done: (value: T) => boolean,
  opts: RetryOptions,
): Promise<T> {
  const start = opts.now();
  for (;;) {
    const value = await attempt();
    if (done(value) || opts.now() - start >= opts.deadlineMs) return value;
    await opts.sleep(opts.intervalMs);
  }
}

/** Retry until PASS (a garbled input never turns into a pass by waiting); BLOCKED also stops. */
export function retryUntilPass(
  attempt: () => Promise<Outcome>,
  opts: RetryOptions,
): Promise<Outcome> {
  return retryUntil(attempt, (o) => o.status !== "FAIL", opts);
}

export type CallTool = (tool: string, args: Record<string, unknown>) => Promise<unknown>;

/**
 * Run every scenario in order (contract §S steps 4–5). An unmet precondition is BLOCKED without a call; a
 * thrown call is that scenario's FAIL. P1's last result decides P2's gate.
 */
export async function runChecks(
  scenarios: readonly Scenario[],
  inputs: RunInputs,
  context: CheckContext,
  call: CallTool,
  opts: RetryOptions,
): Promise<Outcome[]> {
  const ctx = { ...context };
  const outcomes: Outcome[] = [];
  for (const scenario of scenarios) {
    const input = scenario.input(inputs);
    const precondition = scenario.precondition(ctx, inputs);
    if (precondition !== null) {
      outcomes.push({ ...outcomeOf(scenario, input), status: "BLOCKED", precondition });
      continue;
    }
    let last: ToolResult | undefined;
    const attempt = async (): Promise<Outcome> => {
      last = parseToolResult(await call(scenario.tool, input));
      return judge(scenario, inputs, last);
    };
    try {
      outcomes.push(scenario.retry ? await retryUntilPass(attempt, opts) : await attempt());
    } catch (err) {
      outcomes.push(outcomeFromError(scenario, input, err));
    }
    if (scenario.id === "P1")
      ctx.outsideSeenByP1 = last !== undefined && outsideSeen(last, inputs.fixtures);
  }
  return outcomes;
}

// === Report (data-model E8, contract §R) and exit status (§C) ===

export interface ReportHeader {
  /** `YYYY-MM-DD HH:MM`. */
  date: string;
  version: string;
  sha: string;
  serverVersion: string;
  args: RunArgs;
}

export type CleanupResult =
  | { kind: "removed"; path: string }
  | { kind: "residue"; path: string }
  | { kind: "none" };

const INDENT = "          ";
const show = (v: unknown): string => (typeof v === "string" ? v : json(v));

function cleanupLine(cleanup: CleanupResult): string {
  if (cleanup.kind === "removed") return `cleanup: removed ${cleanup.path}`;
  if (cleanup.kind === "residue") return `cleanup: RESIDUE ${cleanup.path}`;
  return "cleanup: nothing seeded";
}

/** The UTF-8 report: header, one block per outcome in order, the cleanup line and the summary. */
export function renderReport(
  header: ReportHeader,
  outcomes: readonly Outcome[],
  cleanup: CleanupResult,
): string {
  const { args } = header;
  const out = [
    `non-ascii check — ${header.date} — obsidian-cli-mcp ${header.version} (${header.sha}), server ${header.serverVersion}`,
    `test vault: ${args.testVault} · semantic vault: ${args.semanticVault} · staged note: ${args.stagedNote ?? "(none)"}`,
    "",
  ];
  for (const o of outcomes) {
    out.push(
      `${o.status.padEnd(7)} ${o.id} ${o.capability} (${o.tool})`,
      `${INDENT}input:    ${json(o.input)}`,
    );
    if (o.status === "FAIL")
      out.push(`${INDENT}expected: ${o.expected ?? ""}`, `${INDENT}actual:   ${show(o.actual)}`);
    if (o.status === "BLOCKED") out.push(`${INDENT}precondition: ${o.precondition ?? ""}`);
  }
  const count = (s: Outcome["status"]) => outcomes.filter((o) => o.status === s).length;
  out.push(
    cleanupLine(cleanup),
    `summary: ${count("PASS")} pass · ${count("FAIL")} fail · ${count("BLOCKED")} blocked`,
  );
  return `${out.join("\n")}\n`;
}

/** 0 when nothing failed and cleanup left nothing behind; 1 otherwise (research D7). */
export function exitStatus(outcomes: readonly Outcome[], cleanup: CleanupResult): 0 | 1 {
  return outcomes.some((o) => o.status === "FAIL") || cleanup.kind === "residue" ? 1 : 0;
}
