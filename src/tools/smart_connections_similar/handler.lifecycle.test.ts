// Original — no upstream. Lifecycle checks for smart_connections_similar (spec 094): each check builds the registered tool with a stand-in spawn that runs the eval code the handler sent against a simulated vault and Smart Connections plugin, and confirms the failure or result the agent receives and the documented order of precedence.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createSmartConnectionsSimilarTool } from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { makeEvalRunnerSpawn, silentLogger } from "../_handler-test-fixtures.js";

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

type PluginState = "absent" | "no-env" | "no-sources" | "no-items" | "items-null" | "ready";

interface SimState {
  files: SimFile[];
  active?: SimFile | null;
  plugin: PluginState;
  index?: Record<string, unknown>;
}

interface ToolResult {
  isError?: boolean;
  structuredContent?: unknown;
  content: Array<{ type: string; text: string }>;
}

function note(path: string): SimFile {
  return { path, extension: path.slice(path.lastIndexOf(".") + 1) };
}

/** The minimal `app` JS_TEMPLATE reads (data-model E2/E3). */
function simulatedApp(state: SimState): unknown {
  const plugins: Record<string, unknown> = {};
  switch (state.plugin) {
    case "absent":
      break;
    case "no-env":
      plugins["smart-connections"] = {};
      break;
    case "no-sources":
      plugins["smart-connections"] = { env: {} };
      break;
    case "no-items":
      plugins["smart-connections"] = { env: { smart_sources: {} } };
      break;
    case "items-null":
      plugins["smart-connections"] = { env: { smart_sources: { items: null } } };
      break;
    case "ready":
      plugins["smart-connections"] = { env: { smart_sources: { items: state.index } } };
      break;
  }
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
    plugins: { plugins },
  };
}

/** An index entry the plugin can search (data-model E3, "indexed"). */
function indexed(candidates: Candidate[]): { find_connections: (o: { limit: number }) => Promise<Candidate[]> } {
  return { find_connections: async ({ limit }) => candidates.slice(0, limit) };
}

function buildTool(state: SimState) {
  const { spawnFn, recorded, getCount } = makeEvalRunnerSpawn(simulatedApp(state));
  const tool = createSmartConnectionsSimilarTool({ logger: silentLogger(), queue: createQueue(), env: {}, spawnFn });
  return { call: async (args: Record<string, unknown>) => (await tool.handler(args)) as ToolResult, recorded, getCount };
}

async function callTool(state: SimState, args: Record<string, unknown>) {
  const { call, recorded, getCount } = buildTool(state);
  return { result: await call(args), recorded, getCount };
}

interface ExpectedFailure {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

/** Contract §H5: the failure as the agent receives it, whole `details` compared. */
function expectFailure(result: ToolResult, expected: ExpectedFailure): void {
  expect(result.isError).toBe(true);
  expect("structuredContent" in result).toBe(false);
  expect(JSON.parse(result.content[0]!.text)).toEqual(expected);
}

/** Data-model E5: a success, with the structured result equal to the text block and to `expected`. */
function expectSuccess(result: ToolResult, expected: unknown): void {
  expect(result.isError).toBeUndefined();
  expect(result.structuredContent).toEqual(JSON.parse(result.content[0]!.text));
  expect(result.structuredContent).toEqual(expected);
}

// Expected failures, written as literals from contract §S / §A (research D5) — never imported from production.
const NOT_INSTALLED: ExpectedFailure = {
  code: "CLI_REPORTED_ERROR",
  message:
    "smart_connections_similar: Smart Connections plugin is not installed in the vault (plugin not loaded in vault: Demo)",
  details: { stage: "envelope-error", code: "SMART_CONNECTIONS_NOT_INSTALLED", detail: "plugin not loaded in vault: Demo" },
};
const MISSING_PATH: ExpectedFailure = {
  code: "CLI_REPORTED_ERROR",
  message: "smart_connections_similar: file not found (path: Missing.md)",
  details: { stage: "envelope-error", code: "FILE_NOT_FOUND", detail: "path: Missing.md" },
};
const CANVAS_NOT_A_NOTE: ExpectedFailure = {
  code: "CLI_REPORTED_ERROR",
  message: "smart_connections_similar: target is not a Markdown note (path: Board.canvas extension: canvas)",
  details: { stage: "envelope-error", code: "NOT_MARKDOWN", detail: "path: Board.canvas extension: canvas" },
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
const NOT_INDEXED_SRC: ExpectedFailure = {
  code: "CLI_REPORTED_ERROR",
  message: "smart_connections_similar: source note has no embedding yet (Src.md)",
  details: { stage: "envelope-error", code: "SOURCE_NOT_INDEXED", detail: "Src.md" },
};
const NO_ACTIVE_FILE: ExpectedFailure = {
  code: "ERR_NO_ACTIVE_FILE",
  message: "smart_connections_similar: no note focused; switch to specific mode or focus a note.",
  details: { stage: "envelope-error", detail: "No note focused; switch to specific mode or focus a note." },
};

const SRC_ARGS = { target_mode: "specific", vault: "Demo", path: "Src.md" } as const;

describe("smart_connections_similar lifecycle — single states (contract §S)", () => {
  it("L7: ready + indexed with no neighbours → success, never not-indexed", async () => {
    const { result, getCount } = await callTool(
      { files: [note("Src.md")], plugin: "ready", index: { "Src.md": indexed([]) } },
      SRC_ARGS,
    );
    expectSuccess(result, { count: 0, matches: [] });
    expect(getCount()).toBe(1);
  });

  it("L1: plugin not installed → not-installed failure", async () => {
    const { result, getCount } = await callTool({ files: [note("Src.md")], plugin: "absent" }, SRC_ARGS);
    expectFailure(result, NOT_INSTALLED);
    expect(getCount()).toBe(1);
  });

  it("L2a: no file at the path → file-not-found failure (path)", async () => {
    const { result, getCount } = await callTool(
      { files: [], plugin: "ready", index: {} },
      { target_mode: "specific", vault: "Demo", path: "Missing.md" },
    );
    expectFailure(result, MISSING_PATH);
    expect(getCount()).toBe(1);
  });

  it("L2b: no note by that name → file-not-found failure (wikilink)", async () => {
    const { result, getCount } = await callTool(
      { files: [], plugin: "ready", index: {} },
      { target_mode: "specific", vault: "Demo", file: "Missing" },
    );
    expectFailure(result, {
      code: "CLI_REPORTED_ERROR",
      message: "smart_connections_similar: file not found (wikilink: Missing)",
      details: { stage: "envelope-error", code: "FILE_NOT_FOUND", detail: "wikilink: Missing" },
    });
    expect(getCount()).toBe(1);
  });

  // Plain loops, not it.each: vitest quotes and truncates `$field` titles, and each title must start with its id (H6).
  for (const { id, path, ext, kind } of [
    { id: "L3a", path: "Board.canvas", ext: "canvas", kind: "a canvas" },
    { id: "L3b", path: "Tasks.base", ext: "base", kind: "a base" },
    { id: "L3c", path: "Images/photo.png", ext: "png", kind: "an image attachment" },
    { id: "L3d", path: "Docs/paper.pdf", ext: "pdf", kind: "a PDF attachment" },
  ]) it(`${id}: target is ${kind} → not-a-note failure`, async () => {
    const { result, getCount } = await callTool(
      { files: [{ path, extension: ext }], plugin: "ready", index: {} },
      { target_mode: "specific", vault: "Demo", path },
    );
    const expected: ExpectedFailure =
      id === "L3a"
        ? CANVAS_NOT_A_NOTE
        : {
            code: "CLI_REPORTED_ERROR",
            message: `smart_connections_similar: target is not a Markdown note (path: ${path} extension: ${ext})`,
            details: { stage: "envelope-error", code: "NOT_MARKDOWN", detail: `path: ${path} extension: ${ext}` },
          };
    expectFailure(result, expected);
    expect(getCount()).toBe(1);
  });

  for (const { id, plugin, cause } of [
    { id: "L4a", plugin: "no-env", cause: "no env" },
    { id: "L4b", plugin: "no-sources", cause: "no smart_sources" },
    { id: "L4c", plugin: "no-items", cause: "no items" },
    { id: "L4d", plugin: "items-null", cause: "items null" },
  ] as const) it(`${id}: not ready (${cause}) → not-ready failure`, async () => {
    const { result, getCount } = await callTool({ files: [note("Src.md")], plugin }, SRC_ARGS);
    expectFailure(result, NOT_READY);
    expect(getCount()).toBe(1);
  });

  it("L5a: ready, source absent from the index → not-indexed failure", async () => {
    const { result, getCount } = await callTool({ files: [note("Src.md")], plugin: "ready", index: {} }, SRC_ARGS);
    expectFailure(result, NOT_INDEXED_SRC);
    expect(getCount()).toBe(1);
  });

  it("L5b: ready, source entry not searchable → not-indexed failure", async () => {
    const { result, getCount } = await callTool(
      { files: [note("Src.md")], plugin: "ready", index: { "Src.md": {} } },
      SRC_ARGS,
    );
    expectFailure(result, NOT_INDEXED_SRC);
    expect(getCount()).toBe(1);
  });

  it("L5c: ready, note named by wikilink not indexed → not-indexed failure names the resolved path", async () => {
    const { result, getCount } = await callTool(
      { files: [note("Notes/Src.md")], plugin: "ready", index: {} },
      { target_mode: "specific", vault: "Demo", file: "Src" },
    );
    expectFailure(result, {
      code: "CLI_REPORTED_ERROR",
      message: "smart_connections_similar: source note has no embedding yet (Notes/Src.md)",
      details: { stage: "envelope-error", code: "SOURCE_NOT_INDEXED", detail: "Notes/Src.md" },
    });
    expect(getCount()).toBe(1);
  });

  it("L6: not indexed, then indexed → same call returns results", async () => {
    const index: Record<string, unknown> = {};
    const state: SimState = { files: [note("Src.md")], plugin: "ready", index };
    const { call, getCount } = buildTool(state);

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
  for (const { title, state, path, expected } of [
    {
      title: "P1: not a note + not ready → not-a-note failure",
      state: { files: [note("Board.canvas")], plugin: "no-env" } as SimState,
      path: "Board.canvas",
      expected: CANVAS_NOT_A_NOTE,
    },
    {
      title: "P2: not ready + not indexed → not-ready failure",
      state: { files: [note("Src.md")], plugin: "no-sources" } as SimState,
      path: "Src.md",
      expected: NOT_READY,
    },
    {
      title: "P3: not installed + target missing → not-installed failure",
      state: { files: [], plugin: "absent" } as SimState,
      path: "Missing.md",
      expected: NOT_INSTALLED,
    },
    {
      title: "P4: not installed + not a note → not-installed failure",
      state: { files: [note("Board.canvas")], plugin: "absent" } as SimState,
      path: "Board.canvas",
      expected: NOT_INSTALLED,
    },
    {
      title: "P5: target missing + not ready → file-not-found failure",
      state: { files: [], plugin: "no-env" } as SimState,
      path: "Missing.md",
      expected: MISSING_PATH,
    },
  ]) it(title, async () => {
    const { result, getCount } = await callTool(state, { target_mode: "specific", vault: "Demo", path });
    expectFailure(result, expected);
    expect(getCount()).toBe(1);
  });
});

describe("smart_connections_similar lifecycle — active mode (contract §A)", () => {
  for (const { title, plugin, expected } of [
    { title: "A1: no note focused, plugin ready → no-active-file failure", plugin: "ready", expected: NO_ACTIVE_FILE },
    { title: "A2: no note focused + not installed → not-installed failure", plugin: "absent", expected: NOT_INSTALLED },
    { title: "A3: no note focused + not ready → no-active-file failure", plugin: "no-env", expected: NO_ACTIVE_FILE },
  ] as const) it(title, async () => {
    const { result, recorded, getCount } = await callTool(
      { files: [note("Src.md")], active: null, plugin, index: {} },
      { target_mode: "active" },
    );
    expectFailure(result, expected);
    expect(getCount()).toBe(1);
    expect(recorded.flatMap((r) => r.argv).some((a) => a.startsWith("vault="))).toBe(false);
  });
});
