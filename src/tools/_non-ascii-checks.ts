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
  /** The outside note's exact text, which the readiness probe waits for. */
  outsideContent: string;
  missingFolder: string;
  /** The files to write, in order; every folder they need is `runFolder` or `folder`. */
  files: FixtureFile[];
  sourceMatch: SearchMatch;
  outsideMatch: SearchMatch;
}

/** `(level, text)` of every heading in the source note, in order. — is U+2014; 🚀 and 🎉 lie outside the BMP. */
export const EXPECTED_HEADINGS = [
  [1, "BI-001 — Überblick 🚀"],
  [2, "Café — naïve 日本"],
  [3, "Ünïcödé 🎉 test"],
] as const satisfies ReadonlyArray<readonly [number, string]>;
export const LINK_TARGET = "Résumé 東京";
export const PATTERN = "café\\d+";

const lines = (...l: string[]): string => `${l.join("\n")}\n`;

/** The E2 fixtures under `runFolder` (vault-relative, forward slashes). The file text is built from the expected values. */
export function buildFixtures(runFolder: string): Fixtures {
  const folder = `${runFolder}/日本語フォルダ`;
  const source = `${folder}/Café 日記.md`;
  const target = `${runFolder}/${LINK_TARGET}.md`;
  const outside = `${runFolder}/outside.md`;
  const sourceMatch = { path: source, line: 3, match: "café42", text: "Order café42 arrived." };
  const outsideMatch = { path: outside, line: 1, match: "café77", text: "Price café77 noted." };
  const outsideContent = lines(outsideMatch.text);
  const heading = ([level, text]: readonly [number, string]): string =>
    `${"#".repeat(level)} ${text}`;
  const [h1, h2, h3] = EXPECTED_HEADINGS;
  return {
    runFolder,
    folder,
    source,
    target,
    outside,
    outsideContent,
    missingFolder: `${runFolder}/存在しないフォルダ`,
    files: [
      {
        path: source,
        content: lines(
          heading(h1),
          "",
          sourceMatch.text,
          "",
          heading(h2),
          "",
          `See [[${LINK_TARGET}]].`,
          "",
          heading(h3),
        ),
      },
      { path: target, content: lines("Target note.") },
      { path: outside, content: outsideContent },
    ],
    sourceMatch,
    outsideMatch,
  };
}

const two = (n: number): string => String(n).padStart(2, "0");

/** `Sandbox/non-ascii-check-<YYYYMMDD-HHMMSS>-<4 hex>`, in local time. */
export function runFolderName(at: Date, hex4: string): string {
  const date = `${at.getFullYear()}${two(at.getMonth() + 1)}${two(at.getDate())}`;
  const time = `${two(at.getHours())}${two(at.getMinutes())}${two(at.getSeconds())}`;
  return `Sandbox/non-ascii-check-${date}-${time}-${hex4}`;
}

/** The report header's `YYYY-MM-DD HH:MM`, in local time. */
export function reportDate(at: Date): string {
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}`;
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

/** What the `vaults` tool said. A vault is listed exactly when its folder is known. */
export interface VaultFacts {
  testRoot?: string;
  semanticRoot?: string;
  /** The message of a failing `vaults` call; both vaults then count as not listed. */
  vaultsError?: string;
}

/** The facts proved before the calls, independently of the routes under test (research D4, D5). */
export interface CheckContext extends VaultFacts {
  fixturesVisible: boolean;
  stagedNoteOnDisk: boolean;
  missingNoteAbsent: boolean;
}

const vaultsPayloadSchema = z
  .object({ vaults: z.array(z.object({ name: z.string(), path: z.string() }).loose()) })
  .loose();

/** The two vaults' folders as listed by the `vaults` tool (the first entry wins on a duplicate name). */
export function vaultFacts(result: ToolResult, args: RunArgs): VaultFacts {
  if (result.kind === "error") return { vaultsError: result.payload.message };
  const parsed = result.kind === "ok" ? vaultsPayloadSchema.safeParse(result.payload) : undefined;
  if (parsed?.success !== true) return { vaultsError: "unexpected result shape" };
  const rootOf = (name: string) => parsed.data.vaults.find((v) => v.name === name)?.path;
  return { testRoot: rootOf(args.testVault), semanticRoot: rootOf(args.semanticVault) };
}

/** The readiness probe (research D4): `read` returned the outside note's exact content. */
export function fixturesVisibleIn(result: ToolResult, fixtures: Fixtures): boolean {
  return result.kind === "ok" && result.payload["content"] === fixtures.outsideContent;
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

/** Which scenario an outcome belongs to, and the arguments it was (or would have been) called with. */
export interface OutcomeHead {
  id: string;
  capability: string;
  tool: string;
  input: Record<string, unknown>;
}

/** FAIL always carries expected and actual (FR-011); BLOCKED always carries its precondition (FR-012). */
export type Failure = OutcomeHead & { status: "FAIL"; expected: string; actual: unknown };
export type Outcome =
  | (OutcomeHead & { status: "PASS" })
  | Failure
  | (OutcomeHead & { status: "BLOCKED"; precondition: string });

/** The last parsed result of each scenario that has run so far, by scenario id. */
export type EarlierResults = ReadonlyMap<string, ToolResult>;

/** A success or error payload: what `classify` sees once `judge` has failed an `unexpected` shape. */
export type Answer = Exclude<ToolResult, { kind: "unexpected" }>;

export interface Scenario {
  id: string;
  capability: string;
  tool: string;
  retry: boolean;
  input(inputs: RunInputs): Record<string, unknown>;
  /** The expectation in words and values, printed on FAIL. */
  expected(inputs: RunInputs): string;
  /** The first unmet precondition, proved without the route under test; null when the call may run. */
  precondition(ctx: CheckContext, inputs: RunInputs, earlier: EarlierResults): string | null;
  /** Classify a parsed success or error payload. */
  classify(result: Answer, inputs: RunInputs): Verdict;
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
  if (ctx.testRoot === undefined) return vaultNotListed(ctx, "test", inputs.args.testVault);
  if (!ctx.fixturesVisible) return "fixtures not visible to Obsidian";
  return null;
}

/** A success payload parsed by `schema`, or undefined for an error or a different shape. */
function successOf<T>(result: ToolResult, schema: z.ZodType<T>): T | undefined {
  if (result.kind !== "ok") return undefined;
  const parsed = schema.safeParse(result.payload);
  return parsed.success ? parsed.data : undefined;
}

/** The `details` of a `CLI_REPORTED_ERROR`, or undefined for anything else. */
function reportedDetails(result: ToolResult): Record<string, unknown> | undefined {
  if (result.kind !== "error" || result.payload.code !== "CLI_REPORTED_ERROR") return undefined;
  return result.payload.details;
}

const SC_BLOCKED = {
  SMART_CONNECTIONS_NOT_INSTALLED:
    "Smart Connections not installed (SMART_CONNECTIONS_NOT_INSTALLED)",
  SMART_CONNECTIONS_NOT_READY: "Smart Connections not ready (SMART_CONNECTIONS_NOT_READY)",
  SOURCE_NOT_INDEXED: "staged note not indexed by Smart Connections (SOURCE_NOT_INDEXED)",
} as const;
type SmartConnectionsBlockCode = keyof typeof SC_BLOCKED;
const SC_LIFECYCLE = [
  "SMART_CONNECTIONS_NOT_INSTALLED",
  "SMART_CONNECTIONS_NOT_READY",
] as const satisfies readonly SmartConnectionsBlockCode[];

/** A Smart Connections lifecycle code that blocks the scenario (ADR-014), limited to `codes`. */
function smartConnectionsBlock(
  result: ToolResult,
  codes: readonly SmartConnectionsBlockCode[],
): Verdict | undefined {
  const code = reportedDetails(result)?.["code"];
  const hit = codes.find((c) => c === code);
  return hit === undefined ? undefined : { status: "BLOCKED", precondition: SC_BLOCKED[hit] };
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
  const found = successOf(result, matchesSchema);
  return found?.matches.some((m) => sameMatch(m, fixtures.outsideMatch)) ?? false;
}

const TEST_VAULT = { retry: true, precondition: testVaultPrecondition };

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
      const details = reportedDetails(result);
      return verdict(
        details?.["code"] === "FOLDER_NOT_FOUND" && details["folder"] === fixtures.missingFolder,
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
    precondition: (ctx, inputs, earlier) => {
      const p1 = earlier.get("P1");
      return (
        testVaultPrecondition(ctx, inputs) ??
        (p1 !== undefined && outsideSeen(p1, inputs.fixtures)
          ? null
          : "outside note not seen by the vault-wide search (P1)")
      );
    },
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
      if (ctx.semanticRoot === undefined)
        return vaultNotListed(ctx, "semantic", args.semanticVault);
      if (!ctx.stagedNoteOnDisk)
        return `staged note not found on disk at ${ctx.semanticRoot}/${args.stagedNote}`;
      return null;
    },
    classify: (result, { args }) => {
      const blocked = smartConnectionsBlock(result, [...SC_LIFECYCLE, "SOURCE_NOT_INDEXED"]);
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
      if (ctx.semanticRoot === undefined)
        return vaultNotListed(ctx, "semantic", args.semanticVault);
      if (!ctx.missingNoteAbsent) return `a file exists at ${ctx.semanticRoot}/${missingNote}`;
      return null;
    },
    classify: (result, { missingNote }) => {
      const blocked = smartConnectionsBlock(result, SC_LIFECYCLE);
      if (blocked !== undefined) return blocked;
      const details = reportedDetails(result);
      return verdict(
        details?.["code"] === "FILE_NOT_FOUND" && details["detail"] === `path: ${missingNote}`,
      );
    },
  },
];

function headOf(scenario: Scenario, inputs: RunInputs): OutcomeHead {
  const { id, capability, tool } = scenario;
  return { id, capability, tool, input: scenario.input(inputs) };
}

/** The outcome of one call: FAIL carries expected and actual (FR-011), BLOCKED its precondition (FR-012). */
export function judge(scenario: Scenario, inputs: RunInputs, result: ToolResult): Outcome {
  const head = headOf(scenario, inputs);
  if (result.kind === "unexpected") {
    return {
      ...head,
      status: "FAIL",
      expected: scenario.expected(inputs),
      actual: `unexpected result shape: ${json(result.raw)}`,
    };
  }
  const v = scenario.classify(result, inputs);
  if (v.status === "FAIL")
    return { ...head, status: "FAIL", expected: scenario.expected(inputs), actual: result.payload };
  return { ...head, ...v };
}

/** A call that threw (for example, the transport closed) fails its own scenario only (FR-010). */
export function outcomeFromError(scenario: Scenario, inputs: RunInputs, err: unknown): Failure {
  return {
    ...headOf(scenario, inputs),
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
 * thrown call is that scenario's FAIL. Each scenario's last parsed result is passed to the later
 * preconditions, which is how P1's result decides P2's gate.
 */
export async function runChecks(
  scenarios: readonly Scenario[],
  inputs: RunInputs,
  ctx: CheckContext,
  call: CallTool,
  opts: RetryOptions,
): Promise<Outcome[]> {
  const earlier = new Map<string, ToolResult>();
  const outcomes: Outcome[] = [];
  for (const scenario of scenarios) {
    const precondition = scenario.precondition(ctx, inputs, earlier);
    if (precondition !== null) {
      outcomes.push({ ...headOf(scenario, inputs), status: "BLOCKED", precondition });
      continue;
    }
    const attempt = async (): Promise<Outcome> => {
      const result = parseToolResult(await call(scenario.tool, scenario.input(inputs)));
      earlier.set(scenario.id, result);
      return judge(scenario, inputs, result);
    };
    try {
      outcomes.push(scenario.retry ? await retryUntilPass(attempt, opts) : await attempt());
    } catch (err) {
      outcomes.push(outcomeFromError(scenario, inputs, err));
    }
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
      out.push(`${INDENT}expected: ${o.expected}`, `${INDENT}actual:   ${show(o.actual)}`);
    if (o.status === "BLOCKED") out.push(`${INDENT}precondition: ${o.precondition}`);
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
