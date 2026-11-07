// Original — no upstream. query_base grouped-view handler tests (BI-0207): base:query is stubbed with its flat rows and every later spawn runs the eval the handler actually sent against a stub `app` (makeEvalRunnerSpawn), so these pin the whole path: the view's groupBy read from the .base, the group values read in batches, Obsidian's group order, the reserved `group` key and `group_by`, the cap after the reorder, the ungrouped and zero-row paths that make no eval call, and the typed failures that never fall back to flat rows. Acceptance criteria 1–4 of the BI-0207 report are marked C1–C4.
import { resolve as resolvePath } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { executeQueryBase, type ExecuteDeps } from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import { captureRejection, makeEvalRunnerSpawn, makeQueuedSpawn, silentLogger } from "../_handler-test-fixtures.js";

const VAULT = resolvePath("/vault");
const INPUT = { base_path: "Sandbox/grouped.base", view_name: "Grouped", vault: "Demo" };

function base(groupBy: string, extra = ""): string {
  return ["views:", "  - type: table", "    name: Grouped", groupBy, extra, "    order:", "      - file.name", ""].filter((l) => l !== "").join("\n");
}
const GROUPED_ASC = base("    groupBy:\n      property: note.status\n      direction: ASC");
const GROUPED_DESC = base("    groupBy:\n      property: note.status\n      direction: DESC");

type Frontmatter = Record<string, unknown>;

function stubApp(notes: Record<string, Frontmatter | undefined>) {
  return {
    vault: {
      getAbstractFileByPath: (p: string) => {
        if (!(p in notes)) return null;
        const slash = p.lastIndexOf("/");
        return { path: p, extension: "md", parent: { path: slash < 0 ? "/" : p.slice(0, slash) }, stat: { ctime: 0, mtime: 0 } };
      },
    },
    metadataCache: {
      getFileCache: (f: { path: string }) => ({ frontmatter: notes[f.path] }),
      getFirstLinkpathDest: () => null,
    },
  };
}

/** base:query answers `rows`; every later spawn runs the sent eval against `app`. */
function spawnFor(rows: unknown[], app: unknown): { spawnFn: SpawnLike; evalCalls: () => number } {
  const query = makeQueuedSpawn([{ stdout: JSON.stringify(rows), exitCode: 0 }]);
  const evals = makeEvalRunnerSpawn(app);
  let calls = 0;
  const spawnFn: SpawnLike = (binary, argv, options) => (calls++ === 0 ? query.spawnFn(binary, argv, options) : evals.spawnFn(binary, argv, options));
  return { spawnFn, evalCalls: evals.getCount };
}

function deps(spawnFn: SpawnLike, baseText: string | (() => Promise<string>)): ExecuteDeps {
  return {
    logger: silentLogger(),
    queue: createQueue(),
    spawnFn,
    env: {},
    vaultRegistry: { resolveVaultPath: async () => VAULT },
    fs: {
      stat: async () => ({ size: 100 }),
      realpath: async (p: string) => p,
      readFile: typeof baseText === "string" ? async () => baseText : baseText,
    },
  };
}

const NOTES = {
  "Sandbox/a-note.md": { status: "two" },
  "Sandbox/b-note.md": { status: "one" },
  "Sandbox/c-note.md": { status: "two" },
};
const ROWS = [
  { path: "Sandbox/a-note.md", "file name": "a-note" },
  { path: "Sandbox/b-note.md", "file name": "b-note" },
  { path: "Sandbox/c-note.md", "file name": "c-note" },
];

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("grouped views", () => {
  it("C1–C3: rows come in ascending group order, each naming its group, though the group property is not a column", async () => {
    const { spawnFn, evalCalls } = spawnFor(ROWS, stubApp(NOTES));
    const r = await executeQueryBase(INPUT, deps(spawnFn, GROUPED_ASC));
    expect(r).toEqual({
      columns: ["path", "group", "file name"],
      rows: [
        { path: "Sandbox/b-note.md", group: "one", "file name": "b-note" },
        { path: "Sandbox/a-note.md", group: "two", "file name": "a-note" },
        { path: "Sandbox/c-note.md", group: "two", "file name": "c-note" },
      ],
      truncated: false,
      group_by: { property: "note.status", direction: "ASC" },
    });
    expect(evalCalls()).toBe(1);
  });

  it("orders groups descending, keeping upstream's order within a group and the null group last", async () => {
    const notes = { ...NOTES, "Sandbox/d-note.md": undefined, "Sandbox/e-note.md": { status: "one" } };
    const rows = [...ROWS, { path: "Sandbox/d-note.md", "file name": "d-note" }, { path: "Sandbox/e-note.md", "file name": "e-note" }];
    const { spawnFn } = spawnFor(rows, stubApp(notes));
    const r = await executeQueryBase(INPUT, deps(spawnFn, GROUPED_DESC));
    expect(r.rows.map((row) => [row["path"], row["group"]])).toEqual([
      ["Sandbox/a-note.md", "two"],
      ["Sandbox/c-note.md", "two"],
      ["Sandbox/b-note.md", "one"],
      ["Sandbox/e-note.md", "one"],
      ["Sandbox/d-note.md", null],
    ]);
    expect(r.group_by).toEqual({ property: "note.status", direction: "DESC" });
  });

  it("groups by a file property", async () => {
    const notes = { "Top.md": {}, "Sub/x.md": {}, "Sub/y.md": {} };
    const rows = [{ path: "Sub/x.md" }, { path: "Sub/y.md" }, { path: "Top.md" }];
    const { spawnFn } = spawnFor(rows, stubApp(notes));
    const r = await executeQueryBase(INPUT, deps(spawnFn, base("    groupBy:\n      property: file.folder\n      direction: ASC")));
    expect(r.rows).toEqual([
      { path: "Top.md", group: "/" },
      { path: "Sub/x.md", group: "Sub" },
      { path: "Sub/y.md", group: "Sub" },
    ]);
  });

  it("moves a view column named group to group_view", async () => {
    const rows = ROWS.map((row, i) => ({ ...row, group: `g${i}` }));
    const { spawnFn } = spawnFor(rows, stubApp(NOTES));
    const r = await executeQueryBase(INPUT, deps(spawnFn, GROUPED_ASC));
    expect(r.columns).toEqual(["path", "group", "file name", "group_view"]);
    expect(r.rows[0]).toEqual({ path: "Sandbox/b-note.md", group: "one", "file name": "b-note", group_view: "g1" });
  });

  it("applies the 1000-row cap after the reorder", async () => {
    const notes: Record<string, Frontmatter> = {};
    const rows = Array.from({ length: 1001 }, (_, i) => {
      const path = `n${String(i).padStart(4, "0")}.md`;
      notes[path] = { status: i === 1000 ? "a" : "b" };
      return { path };
    });
    const { spawnFn, evalCalls } = spawnFor(rows, stubApp(notes));
    const r = await executeQueryBase(INPUT, deps(spawnFn, GROUPED_ASC));
    expect(r.truncated).toBe(true);
    expect(r.total_rows).toBe(1001);
    expect(r.rows).toHaveLength(1000);
    expect(r.rows[0]).toEqual({ path: "n1000.md", group: "a" });
    expect(r.rows[999]).toEqual({ path: "n0998.md", group: "b" });
    expect(evalCalls()).toBeGreaterThan(1);
  });

  it("returns a zero-row grouped view with group_by and no eval call", async () => {
    const { spawnFn, evalCalls } = spawnFor([], stubApp({}));
    const r = await executeQueryBase(INPUT, deps(spawnFn, GROUPED_ASC));
    expect(r).toEqual({ columns: ["path", "group"], rows: [], truncated: false, group_by: { property: "note.status", direction: "ASC" } });
    expect(evalCalls()).toBe(0);
  });
});

describe("ungrouped views (C4)", () => {
  it("return exactly today's result with no group_by, no group and no eval call", async () => {
    const { spawnFn, evalCalls } = spawnFor(ROWS, stubApp(NOTES));
    const r = await executeQueryBase(INPUT, deps(spawnFn, base("")));
    expect(r).toEqual({ columns: ["path", "file name"], rows: ROWS, truncated: false });
    expect(evalCalls()).toBe(0);
  });

  it("treat a groupBy Obsidian ignores (direction not ASC or DESC) as ungrouped", async () => {
    const { spawnFn, evalCalls } = spawnFor(ROWS, stubApp(NOTES));
    const r = await executeQueryBase(INPUT, deps(spawnFn, base("    groupBy:\n      property: note.status\n      direction: asc")));
    expect(r).toEqual({ columns: ["path", "file name"], rows: ROWS, truncated: false });
    expect(evalCalls()).toBe(0);
  });
});

describe("typed failures, never flat rows", () => {
  async function failure(baseText: string | (() => Promise<string>), app: unknown = stubApp(NOTES)) {
    const { spawnFn, evalCalls } = spawnFor(ROWS, app);
    const err = (await captureRejection(executeQueryBase(INPUT, deps(spawnFn, baseText)))) as UpstreamError;
    expect(err).toBeInstanceOf(UpstreamError);
    return { err, evalCalls };
  }

  it("rejects a custom group order", async () => {
    const { err, evalCalls } = await failure(base("    groupBy:\n      property: note.status\n      direction: ASC", "    groupOrder:\n      - two\n      - one"));
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details).toEqual({ code: "GROUPING_UNSUPPORTED", reason: "custom-group-order", base_path: INPUT.base_path, view_name: "Grouped" });
    expect(evalCalls()).toBe(0);
  });

  it("rejects a groupBy the scan cannot read", async () => {
    const { err } = await failure(base("    groupBy: {property: note.status, direction: ASC}"));
    expect(err.details).toMatchObject({ code: "GROUPING_UNSUPPORTED", reason: "unreadable-group-by", view_name: "Grouped" });
  });

  it("rejects a formula grouping", async () => {
    const { err, evalCalls } = await failure(base("    groupBy:\n      property: formula.score\n      direction: ASC"));
    expect(err.details).toEqual({ code: "GROUPING_UNSUPPORTED", reason: "property", property: "formula.score" });
    expect(evalCalls()).toBe(0);
  });

  it("rejects a value it cannot mirror", async () => {
    const { err } = await failure(GROUPED_ASC, stubApp({ ...NOTES, "Sandbox/b-note.md": { status: { nested: true } } }));
    expect(err.details).toMatchObject({ code: "GROUPING_UNSUPPORTED", reason: "value-type", path: "Sandbox/b-note.md" });
  });

  it("surfaces a failed batch as a typed error", async () => {
    const { err } = await failure(GROUPED_ASC, { vault: {}, metadataCache: {} });
    expect(err.code).toBe("CLI_REPORTED_ERROR");
  });

  it("maps a .base that vanished before the read to BASE_NOT_FOUND", async () => {
    const enoent = Object.assign(new Error("ENOENT: gone"), { code: "ENOENT" });
    const { err } = await failure(async () => {
      throw enoent;
    });
    expect(err.details).toEqual({ code: "BASE_NOT_FOUND", base_path: INPUT.base_path });
    expect(err.cause).toBe(enoent);
  });
});
