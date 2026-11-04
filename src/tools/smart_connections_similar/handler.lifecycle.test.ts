// Original — no upstream. Lifecycle checks for smart_connections_similar (spec 094): each check builds the registered tool with a stand-in spawn that runs the eval code the handler sent against a simulated vault and Smart Connections plugin, and confirms the failure or result the agent receives and the documented order of precedence.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createSmartConnectionsSimilarTool } from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { makeEvalRunnerSpawn, silentLogger } from "../_handler-test-fixtures.js";

import type { ToolCallResult } from "../_shared.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

interface SimFile {
  path: string;
  extension: string;
}

interface Candidate {
  item: { key: string };
  score: number;
}

type NotReadyPlugin = "no-env" | "no-sources" | "no-items" | "items-null";

/** The plugin: not installed, loaded but not ready, or ready with its index (`env.smart_sources.items`). */
type PluginState = "absent" | NotReadyPlugin | { index: Record<string, unknown> };

interface SimState {
  files: SimFile[];
  /** The focused note; none when absent. */
  active?: SimFile;
  plugin: PluginState;
}

type Args = Record<string, unknown>;

/** The loaded plugin object for each not-ready condition (data-model E3). */
const NOT_READY_PLUGINS: Record<NotReadyPlugin, unknown> = {
  "no-env": {},
  "no-sources": { env: {} },
  "no-items": { env: { smart_sources: {} } },
  "items-null": { env: { smart_sources: { items: null } } },
};

function note(path: string): SimFile {
  return { path, extension: path.slice(path.lastIndexOf(".") + 1) };
}

/** A ready plugin whose index is `index`; the check may add to it between two calls (L6). */
function ready(index: Record<string, unknown> = {}): PluginState {
  return { index };
}

function pluginObject(plugin: PluginState): unknown {
  if (plugin === "absent") return undefined;
  if (typeof plugin === "string") return NOT_READY_PLUGINS[plugin];
  return { env: { smart_sources: { items: plugin.index } } };
}

/** The minimal `app` JS_TEMPLATE reads (data-model E2/E3); a not-installed plugin has no `"smart-connections"` key. */
function simulatedApp(state: SimState): unknown {
  const plugin = pluginObject(state.plugin);
  return {
    vault: {
      getName: () => "Demo",
      getAbstractFileByPath: (p: string) => state.files.find((f) => f.path === p) ?? null,
    },
    metadataCache: {
      getFirstLinkpathDest: (name: string, _from: string) =>
        state.files.find((f) => f.path.slice(f.path.lastIndexOf("/") + 1).replace(/\.md$/, "") === name) ?? null,
    },
    workspace: { getActiveFile: () => state.active ?? null },
    plugins: { plugins: plugin === undefined ? {} : { "smart-connections": plugin } },
  };
}

/** An index entry the plugin can search (data-model E3, "indexed"). */
function indexed(candidates: Candidate[]): { find_connections: (o: { limit: number }) => Promise<Candidate[]> } {
  return { find_connections: async ({ limit }) => candidates.slice(0, limit) };
}

function buildTool(state: SimState) {
  const { spawnFn, recorded, getCount } = makeEvalRunnerSpawn(simulatedApp(state));
  const tool = createSmartConnectionsSimilarTool({ logger: silentLogger(), queue: createQueue(), env: {}, spawnFn });
  return { call: (args: Args) => tool.handler(args), recorded, getCount };
}

/** One tool call against `state`, asserting contract §H3: the call spawns exactly once. */
async function callOnce(state: SimState, args: Args) {
  const { call, recorded, getCount } = buildTool(state);
  const result = await call(args);
  expect(getCount(), "spawns per call (§H3)").toBe(1);
  return { result, recorded };
}

interface ExpectedFailure {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

/** Contract §H5: the failure as the agent receives it, whole `details` compared. */
function expectFailure(result: ToolCallResult, expected: ExpectedFailure): void {
  expect("isError" in result && result.isError).toBe(true);
  expect("structuredContent" in result).toBe(false);
  expect(JSON.parse(result.content[0]!.text)).toEqual(expected);
}

/** Data-model E5: a success, with the structured result equal to the text block and to `expected`. */
function expectSuccess(result: ToolCallResult, expected: unknown): void {
  expect("isError" in result).toBe(false);
  const structured = "structuredContent" in result ? result.structuredContent : undefined;
  expect(structured).toEqual(JSON.parse(result.content[0]!.text));
  expect(structured).toEqual(expected);
}

// Expected failures, written here from contract §S / §A (research D5) — never imported from production.
const NOT_INSTALLED: ExpectedFailure = {
  code: "CLI_REPORTED_ERROR",
  message:
    "smart_connections_similar: Smart Connections plugin is not installed in the vault (plugin not loaded in vault: Demo)",
  details: { stage: "envelope-error", code: "SMART_CONNECTIONS_NOT_INSTALLED", detail: "plugin not loaded in vault: Demo" },
};
const NOT_READY: ExpectedFailure = {
  code: "CLI_REPORTED_ERROR",
  message:
    "smart_connections_similar: Smart Connections plugin is loaded but its similarity API is not ready (env.smart_sources unavailable)",
  details: {
    stage: "envelope-error",
    code: "SMART_CONNECTIONS_NOT_READY",
    reason: "api-missing",
    detail: "env.smart_sources unavailable",
  },
};
const NO_ACTIVE_FILE: ExpectedFailure = {
  code: "ERR_NO_ACTIVE_FILE",
  message: "smart_connections_similar: no note focused; switch to specific mode or focus a note.",
  details: { stage: "envelope-error", detail: "No note focused; switch to specific mode or focus a note." },
};

function fileNotFound(detail: string): ExpectedFailure {
  return {
    code: "CLI_REPORTED_ERROR",
    message: `smart_connections_similar: file not found (${detail})`,
    details: { stage: "envelope-error", code: "FILE_NOT_FOUND", detail },
  };
}

function notMarkdown(path: string, extension: string): ExpectedFailure {
  const detail = `path: ${path} extension: ${extension}`;
  return {
    code: "CLI_REPORTED_ERROR",
    message: `smart_connections_similar: target is not a Markdown note (${detail})`,
    details: { stage: "envelope-error", code: "NOT_MARKDOWN", detail },
  };
}

function notIndexed(path: string): ExpectedFailure {
  return {
    code: "CLI_REPORTED_ERROR",
    message: `smart_connections_similar: source note has no embedding yet (${path})`,
    details: { stage: "envelope-error", code: "SOURCE_NOT_INDEXED", detail: path },
  };
}

const MISSING_PATH = fileNotFound("path: Missing.md");
const CANVAS_NOT_A_NOTE = notMarkdown("Board.canvas", "canvas");
const NOT_INDEXED_SRC = notIndexed("Src.md");

const at = (path: string): Args => ({ target_mode: "specific", vault: "Demo", path });
const named = (file: string): Args => ({ target_mode: "specific", vault: "Demo", file });
const SRC_ARGS = at("Src.md");

/** One row of a contract table: the state, the call (default `SRC_ARGS`) and the failure it must give. */
interface FailureRow {
  title: string;
  state: SimState;
  args?: Args;
  expected: ExpectedFailure;
}

// Plain loops, not it.each: vitest quotes and truncates `$field` titles, and each title must start with its id (H6).
function itFails(rows: FailureRow[]): void {
  for (const { title, state, args = SRC_ARGS, expected } of rows) {
    it(title, async () => expectFailure((await callOnce(state, args)).result, expected));
  }
}

const SINGLE_STATE_FAILURES: FailureRow[] = [
  {
    title: "L1: plugin not installed → not-installed failure",
    state: { files: [note("Src.md")], plugin: "absent" },
    expected: NOT_INSTALLED,
  },
  {
    title: "L2a: no file at the path → file-not-found failure (path)",
    state: { files: [], plugin: ready() },
    args: at("Missing.md"),
    expected: MISSING_PATH,
  },
  {
    title: "L2b: no note by that name → file-not-found failure (wikilink)",
    state: { files: [], plugin: ready() },
    args: named("Missing"),
    expected: fileNotFound("wikilink: Missing"),
  },
  ...[
    { id: "L3a", path: "Board.canvas", ext: "canvas", kind: "a canvas" },
    { id: "L3b", path: "Tasks.base", ext: "base", kind: "a base" },
    { id: "L3c", path: "Images/photo.png", ext: "png", kind: "an image attachment" },
    { id: "L3d", path: "Docs/paper.pdf", ext: "pdf", kind: "a PDF attachment" },
  ].map(({ id, path, ext, kind }) => ({
    title: `${id}: target is ${kind} → not-a-note failure`,
    state: { files: [{ path, extension: ext }], plugin: ready() },
    args: at(path),
    expected: notMarkdown(path, ext),
  })),
  ...(
    [
      { id: "L4a", plugin: "no-env", cause: "no env" },
      { id: "L4b", plugin: "no-sources", cause: "no smart_sources" },
      { id: "L4c", plugin: "no-items", cause: "no items" },
      { id: "L4d", plugin: "items-null", cause: "items null" },
    ] as const
  ).map(({ id, plugin, cause }) => ({
    title: `${id}: not ready (${cause}) → not-ready failure`,
    state: { files: [note("Src.md")], plugin },
    expected: NOT_READY,
  })),
  {
    title: "L5a: ready, source absent from the index → not-indexed failure",
    state: { files: [note("Src.md")], plugin: ready() },
    expected: NOT_INDEXED_SRC,
  },
  {
    title: "L5b: ready, source entry not searchable → not-indexed failure",
    state: { files: [note("Src.md")], plugin: ready({ "Src.md": {} }) },
    expected: NOT_INDEXED_SRC,
  },
  {
    title: "L5c: ready, note named by wikilink not indexed → not-indexed failure names the resolved path",
    state: { files: [note("Notes/Src.md")], plugin: ready() },
    args: named("Src"),
    expected: notIndexed("Notes/Src.md"),
  },
];

const PRECEDENCE_FAILURES: FailureRow[] = [
  {
    title: "P1: not a note + not ready → not-a-note failure",
    state: { files: [note("Board.canvas")], plugin: "no-env" },
    args: at("Board.canvas"),
    expected: CANVAS_NOT_A_NOTE,
  },
  {
    title: "P2: not ready + not indexed → not-ready failure",
    state: { files: [note("Src.md")], plugin: "no-sources" },
    expected: NOT_READY,
  },
  {
    title: "P3: not installed + target missing → not-installed failure",
    state: { files: [], plugin: "absent" },
    args: at("Missing.md"),
    expected: NOT_INSTALLED,
  },
  {
    title: "P4: not installed + not a note → not-installed failure",
    state: { files: [note("Board.canvas")], plugin: "absent" },
    args: at("Board.canvas"),
    expected: NOT_INSTALLED,
  },
  {
    title: "P5: target missing + not ready → file-not-found failure",
    state: { files: [], plugin: "no-env" },
    args: at("Missing.md"),
    expected: MISSING_PATH,
  },
];

describe("smart_connections_similar lifecycle — single states (contract §S)", () => {
  it("L7: ready + indexed with no neighbours → success, never not-indexed", async () => {
    const { result } = await callOnce({ files: [note("Src.md")], plugin: ready({ "Src.md": indexed([]) }) }, SRC_ARGS);
    expectSuccess(result, { count: 0, matches: [] });
  });

  itFails(SINGLE_STATE_FAILURES);

  it("L6: not indexed, then indexed → same call returns results", async () => {
    const index: Record<string, unknown> = {};
    const { call, getCount } = buildTool({ files: [note("Src.md")], plugin: ready(index) });

    expectFailure(await call(SRC_ARGS), NOT_INDEXED_SRC);

    index["Src.md"] = indexed([
      { item: { key: "Other.md#H1" }, score: 0.9 },
      { item: { key: "Src.md#Intro" }, score: 0.95 },
    ]);
    expectSuccess(await call(SRC_ARGS), { count: 1, matches: [{ path: "Other.md", headingPath: ["H1"], score: 0.9 }] });
    expect(getCount()).toBe(2);
  });
});

describe("smart_connections_similar lifecycle — precedence (contract §P)", () => {
  itFails(PRECEDENCE_FAILURES);
});

describe("smart_connections_similar lifecycle — active mode (contract §A)", () => {
  for (const { title, plugin, expected } of [
    { title: "A1: no note focused, plugin ready → no-active-file failure", plugin: ready(), expected: NO_ACTIVE_FILE },
    { title: "A2: no note focused + not installed → not-installed failure", plugin: "absent", expected: NOT_INSTALLED },
    { title: "A3: no note focused + not ready → no-active-file failure", plugin: "no-env", expected: NO_ACTIVE_FILE },
  ] satisfies Array<{ title: string; plugin: PluginState; expected: ExpectedFailure }>) {
    it(title, async () => {
      const { result, recorded } = await callOnce({ files: [note("Src.md")], plugin }, { target_mode: "active" });
      expectFailure(result, expected);
      expect(recorded.flatMap((r) => r.argv).some((a) => a.startsWith("vault="))).toBe(false);
    });
  }
});
