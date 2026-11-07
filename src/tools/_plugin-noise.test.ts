// Original — no upstream. Spec 080 noise matrix: every eval-composed tool, through its registered handler, gives the no-noise result when other plugins print around its answer (contract §3 N1–N13), reports its existing parse error with the §4 excerpt when the call's answer is missing, and survives seeded random noise (US6). Also guards that every eval template is a single expression the answer-tag wrapper can enclose (data-model R8).
import { readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { FOCUSED_FILE_TEMPLATE, FOCUSED_VAULT_TEMPLATE } from "./_active-file.js";
import { EXCERPT_CUT_MARKER, stdoutDetails } from "./_eval-parse.js";
import {
  answerLine,
  focusedFileResponse,
  makeQueuedSpawn,
  makeStubSpawn,
  silentLogger,
  unwrapEvalCode,
  withTaggedStdoutTransform,
  type StubResponse,
} from "./_handler-test-fixtures.js";
import { invalidateMetadataCache, openNote } from "./_note-io.js";
import { composeEvalCode } from "./_shared.js";
import { TYPED_RESULT_FIXTURES } from "./_typed-result-fixtures.js";
import { createBacklinksTool } from "./backlinks/index.js";
import { ACTIVE_EVAL, baseDeps, inMemoryFs, VAULT_ROOT as FIND_REPLACE_ROOT } from "./find_and_replace/_handler-fixtures.js";
import { createFindAndReplaceTool } from "./find_and_replace/index.js";
import { createFindByPropertyTool } from "./find_by_property/index.js";
import { createGetActiveFileTool } from "./get_active_file/index.js";
import { createLinksTool } from "./links/index.js";
import { createMoveTool } from "./move/index.js";
import { createOpenFileTool } from "./open_file/index.js";
import { createOutlineTool } from "./outline/index.js";
import { createPathsTool } from "./paths/index.js";
import { createPatternSearchTool } from "./pattern_search/index.js";
import {
  deps as prependDeps,
  fakeFs as prependFakeFs,
  fakeRegistry as prependFakeRegistry,
  PREPEND_OK,
  VAULT_ROOT as PREPEND_ROOT,
} from "./prepend/_handler-fixtures.js";
import { createPrependTool } from "./prepend/index.js";
import { createQueryBaseTool } from "./query_base/index.js";
import { createReadTool } from "./read/index.js";
import { createReadHeadingTool } from "./read_heading/index.js";
import { executeWriteProperty } from "./set_property/handler.js";
import { createSetPropertyTool } from "./set_property/index.js";
import { createSmartConnectionsQueryTool } from "./smart_connections_query/index.js";
import { createSmartConnectionsSimilarTool } from "./smart_connections_similar/index.js";
import { createTagTool } from "./tag/index.js";
import { createViewsBaseTool } from "./views_base/index.js";
import { wrapEvalCode } from "../cli-adapter/_eval-answer.js";
import { createQueue } from "../queue.js";

import type { RegisteredTool } from "./_shared.js";
import type { SpawnLike } from "../cli-adapter/cli-adapter.js";
import type { VaultRegistry } from "../vault-registry/registry.js";

type ToolResult = { isError?: boolean; structuredContent?: unknown; content: Array<{ type: string; text: string }> };

interface NoiseCase {
  label: string;
  name: string;
  build: () => RegisteredTool;
  args: Record<string, unknown>;
  /** The eval is the best-effort post-write refresh: the result never depends on its answer. */
  bestEffort?: boolean;
  /** The tool's top-level code for a malformed eval answer (default CLI_REPORTED_ERROR). */
  parseErrorCode?: string;
  /** The tool's `details.stage` for a missing or unparseable answer (default json-parse). */
  parseErrorStage?: string;
}

// ── Builders ──────────────────────────────────────────────────────────────────

function cli(...responses: StubResponse[]) {
  return { logger: silentLogger(), queue: createQueue(), env: {}, spawnFn: makeQueuedSpawn(responses).spawnFn };
}

function evalOut(value: unknown): StubResponse {
  return { stdout: `=> ${JSON.stringify(value)}\n`, exitCode: 0 };
}

function out(stdout: string): StubResponse {
  return { stdout, exitCode: 0 };
}

function registryAt(root: string): VaultRegistry {
  return { resolveVaultPath: async () => root, resolveVaultDisplayName: () => null };
}

/** Run `tool` with `args`, rewriting every wrapped eval spawn's stdout with `transform`; returns the result and the eval stdouts sent. */
async function run(
  build: () => RegisteredTool,
  args: Record<string, unknown>,
  transform?: (tagged: string, tag: string) => string,
): Promise<{ result: ToolResult; evalStdouts: string[] }> {
  const evalStdouts: string[] = [];
  const result = await withTaggedStdoutTransform(
    (tagged, tag) => {
      const sent = transform ? transform(tagged, tag) : tagged;
      evalStdouts.push(sent);
      return sent;
    },
    async () => (await build().handler(args)) as ToolResult,
  );
  return { result, evalStdouts };
}

function errorPayload(result: ToolResult): { code: string; message: string; details: Record<string, unknown> } {
  return JSON.parse(result.content[0]!.text) as { code: string; message: string; details: Record<string, unknown> };
}

/** The fixture's own answer line (`ANS`) and its body, from the tagged stdout. */
function answerOf(tagged: string, tag: string): { ans: string; body: string } {
  const marker = `=> <<${tag}>>`;
  const ans = tagged
    .split("\n")
    .map((l) => l.replace(/\r$/, "").trimStart())
    .find((l) => l.startsWith(marker));
  if (ans === undefined) throw new Error(`fixture stdout carries no answer line: ${tagged}`);
  return { ans, body: ans.slice(marker.length) };
}

/** Same data shape with every string and number altered, so a wrong pick shows in the result. */
function decoy(value: unknown): unknown {
  if (typeof value === "string") return `${value}-decoy`;
  if (typeof value === "number") return value + 1;
  if (Array.isArray(value)) return value.map(decoy);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decoy(v)]));
  }
  return value;
}

/** `LA`: an untagged look-alike of the answer whose body is valid for the tool but carries other data. */
function lookAlike(body: string): string {
  try {
    return `=> ${JSON.stringify(decoy(JSON.parse(body)))}`;
  } catch {
    return `=> ${body}-decoy`;
  }
}

// ── The cohort ────────────────────────────────────────────────────────────────

// The post-write refresh of the direct-fs writers is best-effort by contract (it never fails the
// write); its logging under noise is covered in _note-io.test.ts.
const BEST_EFFORT_WRITERS = new Set(["append_note", "patch_block", "patch_heading", "write_note", "find_and_replace"]);
const PARSE_ERROR_CODE: Record<string, string> = { open_file: "INTERNAL_ERROR", views_base: "INTERNAL_ERROR" };

const FIXTURE_CASES: NoiseCase[] = TYPED_RESULT_FIXTURES.map((f, i) => ({
  label: `${f.name} #${i}`,
  name: f.name,
  build: f.build,
  args: f.args,
  bestEffort: BEST_EFFORT_WRITERS.has(f.name),
  parseErrorCode: PARSE_ERROR_CODE[f.name],
}));

// Eval-composed tools (or modes) that no typed-result fixture exercises through an eval: tag has
// no typed-result fixture; views_base, set_property, query_base, find_and_replace, read, outline,
// move and prepend reach their eval only in active mode or with a named base.
const NOTE_ROOT = "/vaults/MyVault";
const DEDICATED_CASES: NoiseCase[] = [
  {
    label: "tag",
    name: "tag",
    build: () => createTagTool(cli(evalOut({ ok: true, mode: "default", count: 1, paths: ["x.md"] }))),
    args: { tag: "x", vault: "Demo" },
  },
  {
    label: "views_base (named base)",
    name: "views_base",
    build: () =>
      createViewsBaseTool({
        ...cli(evalOut({ ok: true, opened: "Indexes/Active.base" }), out("All\ttable\nActive\ttable\n")),
        vaultRegistry: registryAt("C:/vaults/Demo"),
      }),
    args: { base_path: "Indexes/Active.base", vault: "Demo" },
    parseErrorCode: "INTERNAL_ERROR",
  },
  {
    label: "set_property (active)",
    name: "set_property",
    build: () => createSetPropertyTool(cli(evalOut({ path: "x.md", vault: "V" }), out("Set k: v\n"))),
    args: { target_mode: "active", name: "k", value: "v" },
  },
  {
    label: "query_base (active)",
    name: "query_base",
    build: () =>
      createQueryBaseTool({
        ...cli(evalOut({ path: null, base: resolve("/vault") }), out(JSON.stringify([{ path: "x.md", status: "open" }]))),
        vaultRegistry: registryAt(resolve("/vault")),
        fs: { stat: async () => ({ size: 100 }), realpath: async (p: string) => p, readFile: async () => "views:\n  - type: table\n    name: Open\n" },
      }),
    args: { base_path: "Indexes/Active.base", view_name: "Open" },
    parseErrorStage: "focused-vault-resolve",
  },
  {
    label: "find_and_replace (active)",
    name: "find_and_replace",
    build: () => {
      const { fs } = inMemoryFs([{ abs: resolve(FIND_REPLACE_ROOT, "a.md"), content: "alpha beta\n" }], FIND_REPLACE_ROOT);
      return createFindAndReplaceTool(baseDeps({ fs, spawnFn: makeQueuedSpawn([ACTIVE_EVAL("a.md")]).spawnFn }));
    },
    args: { pattern: "alpha", replacement: "gamma" },
  },
  {
    label: "read (active)",
    name: "read",
    build: () =>
      createReadTool({
        ...cli(focusedFileResponse("Today.md", NOTE_ROOT), out("<active body>")),
        vaultRegistry: registryAt(NOTE_ROOT),
        fs: { readFile: async () => Buffer.from("<active body>") },
      }),
    args: { target_mode: "active" },
  },
  {
    label: "outline (active)",
    name: "outline",
    build: () =>
      createOutlineTool(cli(focusedFileResponse("Notes/x.md", NOTE_ROOT), out(JSON.stringify([{ level: 1, heading: "Top", line: 1 }]) + "\n"))),
    args: { target_mode: "active" },
  },
  {
    label: "move (active)",
    name: "move",
    build: () => createMoveTool({ ...cli(focusedFileResponse("Inbox/a.md", NOTE_ROOT), out("Moved: Inbox/a.md → Archive/a.md\n")), vaultRegistry: registryAt(NOTE_ROOT) }),
    args: { target_mode: "active", to: "Archive/" },
  },
  {
    label: "prepend (active)",
    name: "prepend",
    build: () =>
      createPrependTool(
        prependDeps({
          spawnFn: makeQueuedSpawn([focusedFileResponse("Sandbox/journal.md", PREPEND_ROOT), PREPEND_OK]).spawnFn,
          vaultRegistry: prependFakeRegistry({ TestVault: PREPEND_ROOT }),
          fs: prependFakeFs({ sizes: [100, 158] }),
        }),
      ),
    args: { target_mode: "active", content: "## TL;DR\n\nLead.", inline: false },
  },
];

/** Keep the cases whose call runs at least one wrapped eval, with their no-noise result. */
async function evalComposed(cases: NoiseCase[]): Promise<Array<NoiseCase & { baseline: ToolResult }>> {
  const kept: Array<NoiseCase & { baseline: ToolResult }> = [];
  for (const c of cases) {
    const { result, evalStdouts } = await run(c.build, c.args);
    if (evalStdouts.length > 0) kept.push({ ...c, baseline: result });
  }
  return kept;
}

const COHORT = await evalComposed([...FIXTURE_CASES, ...DEDICATED_CASES]);
const ANSWER_BEARING = COHORT.filter((c) => !c.bestEffort);
const rows = <T extends { label: string }>(list: T[]) => list.map((c) => [c.label, c] as const);

describe("noise matrix inventory", () => {
  it("covers every eval-composed tool named in spec 080 Key Entities", () => {
    expect(new Set(COHORT.map((c) => c.name))).toEqual(
      new Set([
        "backlinks",
        "context_search",
        "links",
        "get_active_file",
        "open_file",
        "views_base",
        "find_by_property",
        "read_heading",
        "paths",
        "tag",
        "pattern_search",
        "smart_connections_query",
        "smart_connections_similar",
        "set_property",
        "find_and_replace",
        "query_base",
        "write_note",
        "append_note",
        "prepend",
        "patch_block",
        "patch_heading",
        "read",
        "outline",
        "move",
        "rename",
      ]),
    );
  });

  it.each(rows(COHORT))("%s: the no-noise baseline is a success", (_label, c) => {
    expect(c.baseline.isError, c.baseline.content[0]?.text).toBeFalsy();
  });
});

// ── N1–N7: noise around the answer gives the baseline result ───────────────────

const SUCCESS_VARIANTS: Array<[string, (ans: string, la: string) => string]> = [
  ["N1 ANS", (ans) => ans],
  ["N2 noise\\nANS", (ans) => `noise\n${ans}`],
  ["N3 blank, [warn] and Error: lines before ANS", (ans) => `n1\n\n[warn] n2\nError: plugin says no\n${ans}`],
  ["N4 ANS\\nnoise", (ans) => `${ans}\nnoise`],
  ["N5 LA\\nANS", (ans, la) => `${la}\n${ans}`],
  ["N6 ANS\\nLA", (ans, la) => `${ans}\n${la}`],
  ["N7 noise\\r\\nANS\\r\\n", (ans) => `noise\r\n${ans}\r\n`],
];

describe.each(SUCCESS_VARIANTS)("%s → the baseline result", (_variant, make) => {
  it.each(rows(COHORT))("%s", async (_label, c) => {
    const { result } = await run(c.build, c.args, (tagged, tag) => {
      const { ans, body } = answerOf(tagged, tag);
      return make(ans, lookAlike(body));
    });
    expect(result).toEqual(c.baseline);
  });
});

// ── N8–N11: no answer for this call → the tool's parse error with the excerpt ──

const PARSE_ERROR_VARIANTS: Array<[string, (ans: string, la: string, tag: string) => string]> = [
  ["N8 noise\\nLA (no tagged line)", (_ans, la) => `noise\n${la}`],
  ["N9 noise only", () => "noise only"],
  ["N10 marker mid-line", (ans) => `noise${ans}`],
  ["N11 tagged answer that is not JSON", (_ans, _la, tag) => `noise\n${answerLine(tag, "not json")}`],
];

describe.each(PARSE_ERROR_VARIANTS)("%s", (_variant, make) => {
  it.each(rows(ANSWER_BEARING))("%s → its parse error, with the stdout excerpt and length", async (_label, c) => {
    const { result, evalStdouts } = await run(c.build, c.args, (tagged, tag) => {
      const { ans, body } = answerOf(tagged, tag);
      return make(ans, lookAlike(body), tag);
    });
    expect(result.isError).toBe(true);
    const payload = errorPayload(result);
    const raw = evalStdouts[0]!;
    expect(payload.code).toBe(c.parseErrorCode ?? "CLI_REPORTED_ERROR");
    expect(payload.details.stage).toBe(c.parseErrorStage ?? "json-parse");
    expect(payload.details.stdout).toBe(stdoutDetails(raw).stdout);
    expect(payload.details.stdoutLength).toBe(raw.length);
  });

  // The refresh never fails the write, whatever it prints (spec 068 FR-002).
  it.each(rows(COHORT.filter((c) => c.bestEffort)))("%s (best-effort refresh) → still the baseline result", async (_label, c) => {
    const { result } = await run(c.build, c.args, (tagged, tag) => {
      const { ans, body } = answerOf(tagged, tag);
      return make(ans, lookAlike(body), tag);
    });
    expect(result).toEqual(c.baseline);
  });
});

describe("E4: long noise with no answer", () => {
  it.each(rows(ANSWER_BEARING))("%s → head + cut marker + tail, the tail holding the expected answer region", async (_label, c) => {
    const { result, evalStdouts } = await run(c.build, c.args, (tagged, tag) => {
      const { body } = answerOf(tagged, tag);
      return `${"[plugin] chatty line\n".repeat(200)}${lookAlike(body)}\n`;
    });
    const raw = evalStdouts[0]!;
    const details = errorPayload(result).details;
    expect(raw.length).toBeGreaterThan(1000);
    expect(details.stdoutLength).toBe(raw.length);
    expect(details.stdout).toBe(raw.slice(0, 500) + EXCERPT_CUT_MARKER + raw.slice(-500));
  });
});

// ── N12 / N13: noise around the tool's own ok:false and zero-result envelopes ──

interface EnvelopeCase {
  label: string;
  build: (spawnFn: SpawnLike) => RegisteredTool;
  args: Record<string, unknown>;
  envelope: unknown;
}

const plain = (spawnFn: SpawnLike) => ({ logger: silentLogger(), queue: createQueue(), env: {}, spawnFn });
const withRegistry = (root: string) => (spawnFn: SpawnLike) => ({ ...plain(spawnFn), vaultRegistry: registryAt(root) });

/** Run one envelope case with `stdout`, returning the handler result. */
async function runEnvelope(c: EnvelopeCase, stdout: StubResponse["stdout"], extra: StubResponse[] = []): Promise<ToolResult> {
  const { spawnFn } = makeQueuedSpawn([{ stdout, exitCode: 0 }, ...extra]);
  return (await c.build(spawnFn).handler(c.args)) as ToolResult;
}

const noisy = (envelope: unknown) => ({ answerTag }: { answerTag?: string }) =>
  `noise\n[warn] x\n${lookAlike(JSON.stringify(envelope))}\n${answerLine(answerTag!, JSON.stringify(envelope))}\nnoise\n`;

// Tools whose eval envelope has no ok:false branch (find_by_property, get_active_file, the
// focused-file and focused-vault resolvers) have no N12 row.
const OK_FALSE_CASES: EnvelopeCase[] = [
  { label: "backlinks", build: (s) => createBacklinksTool(plain(s)), args: { target_mode: "specific", vault: "Demo", path: "a.md" }, envelope: { ok: false, code: "FILE_NOT_FOUND", detail: "a.md" } },
  { label: "links", build: (s) => createLinksTool(plain(s)), args: { target_mode: "specific", vault: "Demo", path: "a.md" }, envelope: { ok: false, code: "NOT_MARKDOWN", detail: "a.md" } },
  { label: "open_file", build: (s) => createOpenFileTool(withRegistry("/vaults/Work")(s)), args: { vault: "Work", path: "a.md" }, envelope: { ok: false, code: "FILE_NOT_FOUND", detail: "a.md" } },
  { label: "paths", build: (s) => createPathsTool(plain(s)), args: { target_mode: "specific", vault: "Demo", folder: "x" }, envelope: { ok: false, code: "FOLDER_NOT_FOUND", folder: "x" } },
  { label: "pattern_search", build: (s) => createPatternSearchTool(plain(s)), args: { pattern: "x", vault: "Demo", folder: "x" }, envelope: { ok: false, code: "FOLDER_NOT_FOUND", folder: "x" } },
  { label: "read_heading", build: (s) => createReadHeadingTool(plain(s)), args: { target_mode: "active", heading: "A::B" }, envelope: { ok: false, code: "HEADING_NOT_FOUND", detail: "A::B" } },
  { label: "tag", build: (s) => createTagTool(plain(s)), args: { tag: "x", vault: "Demo" }, envelope: { ok: false, code: "TAG_INVALID", detail: "x" } },
  { label: "smart_connections_query", build: (s) => createSmartConnectionsQueryTool(plain(s)), args: { query: "q", vault: "Demo" }, envelope: { ok: false, code: "SMART_CONNECTIONS_NOT_INSTALLED", detail: "x" } },
  { label: "smart_connections_similar", build: (s) => createSmartConnectionsSimilarTool(plain(s)), args: { target_mode: "specific", vault: "Demo", path: "a.md" }, envelope: { ok: false, code: "SOURCE_NOT_INDEXED", detail: "a.md" } },
  { label: "views_base (named base)", build: (s) => createViewsBaseTool(withRegistry("C:/vaults/Demo")(s)), args: { base_path: "x.base", vault: "Demo" }, envelope: { ok: false, code: "FILE_NOT_FOUND" } },
];

describe("N12: noise around the tool's ok:false envelope → its normal typed error", () => {
  it.each(rows(OK_FALSE_CASES))("%s", async (_label, c) => {
    const quiet = await runEnvelope(c, `=> ${JSON.stringify(c.envelope)}\n`);
    expect(quiet.isError).toBe(true);
    expect(errorPayload(quiet).details.stage).not.toBe("json-parse");
    expect(await runEnvelope(c, noisy(c.envelope))).toEqual(quiet);
  });
});

const ZERO_CASES: EnvelopeCase[] = [
  { label: "paths", build: (s) => createPathsTool(plain(s)), args: { target_mode: "specific", vault: "Demo" }, envelope: { ok: true, count: 0, paths: [] } },
  { label: "find_by_property", build: (s) => createFindByPropertyTool(plain(s)), args: { vault: "Demo", name: "id", value: "x" }, envelope: { count: 0, paths: [] } },
  { label: "links", build: (s) => createLinksTool(plain(s)), args: { target_mode: "specific", vault: "Demo", path: "a.md" }, envelope: { ok: true, count: 0, links: [] } },
  { label: "backlinks", build: (s) => createBacklinksTool(plain(s)), args: { target_mode: "specific", vault: "Demo", path: "a.md" }, envelope: { ok: true, count: 0, backlinks: [] } },
  { label: "pattern_search", build: (s) => createPatternSearchTool(plain(s)), args: { pattern: "x", vault: "Demo" }, envelope: { ok: true, count: 0, matches: [] } },
  { label: "smart_connections_query", build: (s) => createSmartConnectionsQueryTool(plain(s)), args: { query: "q", vault: "Demo" }, envelope: { ok: true, count: 0, matches: [] } },
  { label: "smart_connections_similar", build: (s) => createSmartConnectionsSimilarTool(plain(s)), args: { target_mode: "specific", vault: "Demo", path: "a.md" }, envelope: { ok: true, count: 0, matches: [] } },
  { label: "tag (default)", build: (s) => createTagTool(plain(s)), args: { tag: "x", vault: "Demo" }, envelope: { ok: true, mode: "default", count: 0, paths: [] } },
  { label: "tag (count-only: 0)", build: (s) => createTagTool(plain(s)), args: { tag: "x", vault: "Demo", total: true }, envelope: { ok: true, mode: "count-only", total: 0 } },
  { label: "get_active_file (no active file: null)", build: (s) => createGetActiveFileTool(withRegistry("/vaults/Work")(s)), args: { target_mode: "active" }, envelope: { active: null } },
];

describe("N13: noise around the tool's zero/empty success envelope → the zero result", () => {
  it.each(rows(ZERO_CASES))("%s", async (_label, c) => {
    const quiet = await runEnvelope(c, `=> ${JSON.stringify(c.envelope)}\n`);
    expect(quiet.isError, quiet.content[0]?.text).toBeFalsy();
    expect(await runEnvelope(c, noisy(c.envelope))).toEqual(quiet);
  });
});

// ── US6: arbitrary noise, with no plugin-specific setting ──────────────────────

/** mulberry32: a tiny seeded PRNG, so the noise is random but every run is the same. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const UNICODE = ["é", "ß", "日本語", "🎉", "Ω", "\u2028", "ñ", "中", "∑", "\u00a0"];

function noiseBlock(rand: () => number, la: string): string {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const text = (): string =>
    Array.from({ length: 1 + Math.floor(rand() * 30) }, () =>
      rand() < 0.2 ? pick(UNICODE) : String.fromCharCode(32 + Math.floor(rand() * 95)),
    ).join("");
  const kinds = [
    () => text(),
    () => `Error: ${text()}`,
    () => `[warn] ${text()}`,
    () => la,
    () => `=> ${text()}`,
    () => "",
  ];
  const lines = Array.from({ length: 1 + Math.floor(rand() * 6) }, () => pick(kinds)());
  return lines.map((l) => l + (rand() < 0.3 ? "\r\n" : "\n")).join("");
}

describe("US6: seeded random noise before and after the answer → the baseline result", () => {
  it.each(rows(COHORT))("%s", async (_label, c) => {
    const rand = prng(80);
    for (let i = 0; i < 20; i++) {
      const { result } = await run(c.build, c.args, (tagged, tag) => {
        const { ans, body } = answerOf(tagged, tag);
        const la = lookAlike(body);
        return `${noiseBlock(rand, la)}${ans}\n${noiseBlock(rand, la)}`;
      });
      expect(result, `noise block ${i}`).toEqual(c.baseline);
    }
  });
});

// ── R8: every eval template is one expression the answer-tag wrapper can enclose ─

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));

async function templateCodes(): Promise<Array<[string, string]>> {
  const codes: Array<[string, string]> = [
    ["FOCUSED_FILE_TEMPLATE", FOCUSED_FILE_TEMPLATE],
    ["FOCUSED_VAULT_TEMPLATE", FOCUSED_VAULT_TEMPLATE],
  ];
  for (const dir of readdirSync(TOOLS_DIR)) {
    const file = join(TOOLS_DIR, dir, "_template.ts");
    if (!existsSync(file)) continue;
    const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value !== "string" || !value.includes("=>")) continue;
      const code = value.includes("__PAYLOAD_B64__") ? composeEvalCode(value, { sample: "x" }) : value;
      codes.push([`${dir}/${name}`, code]);
    }
  }
  return codes;
}

/** The wrapped `code=` elements of calls whose templates are module-private. */
async function recordedWrappedCodes(): Promise<Array<[string, string]>> {
  const codeOf = (argv: string[]) => argv.find((a) => a.startsWith("code="))!.slice("code=".length);
  const evalDeps = (spawnFn: SpawnLike) => ({ logger: silentLogger(), queue: createQueue(), env: {}, spawnFn });

  const refresh = makeStubSpawn({ stdout: "=> ok\n" });
  await invalidateMetadataCache(evalDeps(refresh.spawnFn), { vault: "V", relPath: "a.md" });
  const open = makeStubSpawn({ stdout: "=> undefined\n" });
  await openNote(evalDeps(open.spawnFn), { vault: "V", relPath: "a.md" });
  const setProperty = makeQueuedSpawn([evalOut({ path: "x.md", vault: "V" }), out("Set k: v\n")]);
  await executeWriteProperty({ target_mode: "active", name: "k", value: "v" }, evalDeps(setProperty.spawnFn));

  return [
    ["_note-io invalidate", codeOf(refresh.recorded[0]!.argv)],
    ["_note-io open", codeOf(open.recorded[0]!.argv)],
    ["set_property focused file", codeOf(setProperty.recorded[0]!.argv)],
  ];
}

const TEMPLATE_CODES = await templateCodes();
const RECORDED_CODES = await recordedWrappedCodes();

describe("R8: every eval template parses inside the answer-tag wrapper (parsed, never run)", () => {
  it("finds the templates", () => {
    expect(TEMPLATE_CODES.length).toBeGreaterThanOrEqual(14);
  });

  it.each(TEMPLATE_CODES)("%s", (_name, code) => {
    expect(() => new Function("app", "return " + wrapEvalCode(code, "ocm-guard"))).not.toThrow();
  });

  it.each(RECORDED_CODES)("%s (recorded, already wrapped)", (_name, code) => {
    expect(unwrapEvalCode(code)).not.toBe(code);
    expect(() => new Function("app", "return " + code)).not.toThrow();
  });
});
