// Original — no upstream. group-values.ts tests (BI-0207): the property-to-source mapping; the folder-grouped batch plan under the eval budget; and readGroupValues' typed failures at the decode boundary, the collator locale included (no fallback to ungrouped rows).
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GROUP_VALUES_CODE_MAX, groupSource, planGroupBatches, readGroupValues } from "./group-values.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import { captureRejection, makeQueuedSpawn, silentLogger } from "../_handler-test-fixtures.js";
import { composeEvalCode } from "../_shared.js";

describe("groupSource", () => {
  it.each([
    ["note.status", { kind: "note", name: "status" }],
    ["status", { kind: "note", name: "status" }],
    ["my.prop", { kind: "note", name: "my.prop" }],
    ["file.folder", { kind: "file", name: "folder" }],
    ["file.Ext", { kind: "file", name: "ext" }],
    ["file.tags", { kind: "file", name: "tags" }],
    ["file.ctime", { kind: "file", name: "ctime" }],
    ["file.mtime", { kind: "file", name: "mtime" }],
  ])("%s", (property, expected) => {
    expect(groupSource(property)).toEqual(expected);
  });

  it.each(["formula.score", "file.name", "file.size", "file"])("%s is GROUPING_UNSUPPORTED/property", (property) => {
    let caught: unknown;
    try {
      groupSource(property);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UpstreamError);
    expect((caught as UpstreamError).code).toBe("CLI_REPORTED_ERROR");
    expect((caught as UpstreamError).details).toEqual({ code: "GROUPING_UNSUPPORTED", reason: "property", property });
  });
});

describe("planGroupBatches", () => {
  it("groups paths by folder in order and keeps every batch's code within the budget", () => {
    const paths = Array.from({ length: 300 }, (_, i) => `Projects/Long folder name ${i % 3}/note number ${i}.md`);
    const source = { kind: "note" as const, name: "status" };
    const batches = planGroupBatches(source, paths);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flatMap((b) => b.flatMap(([folder, names]) => names.map((n) => `${folder}/${n}`)))).toEqual(paths);
    for (const b of batches) expect(composeEvalCode("__PAYLOAD_B64__", { p: "status", f: b }).length).toBeLessThan(GROUP_VALUES_CODE_MAX);
  });

  it("sends a root note with an empty folder", () => {
    expect(planGroupBatches({ kind: "file", name: "folder" }, ["top.md", "a/b.md", "a/c.md"])).toEqual([[["", ["top.md"]], ["a", ["b.md", "c.md"]]]]);
  });
});

describe("readGroupValues", () => {
  beforeEach(() => __resetInFlightRegistryForTests());
  afterEach(() => __resetInFlightRegistryForTests());

  const deps = (responses: Parameters<typeof makeQueuedSpawn>[0]) => {
    const spawn = makeQueuedSpawn(responses);
    return { spawn, deps: { logger: silentLogger(), queue: createQueue(), spawnFn: spawn.spawnFn, env: {} } };
  };
  const answer = (body: unknown) => ({ stdout: `=> ${JSON.stringify(body)}\n`, exitCode: 0 });
  const source = { kind: "note" as const, name: "status" };

  it("returns the values and the locale, sending vault= when named", async () => {
    const { spawn, deps: d } = deps([answer({ locale: "en-US", values: [{ s: "x" }, null] })]);
    expect(await readGroupValues(source, ["a.md", "b.md"], "Demo", d)).toEqual({ locale: "en-US", values: [{ s: "x" }, null] });
    expect(spawn.recorded[0]!.argv).toContain("vault=Demo");
  });

  it("asks once per batch", async () => {
    const paths = Array.from({ length: 200 }, (_, i) => `Folder ${i}/note ${i}.md`);
    const n = planGroupBatches(source, paths).length;
    const responses = planGroupBatches(source, paths).map((b) => answer({ locale: "en-US", values: b.map(() => null) }));
    const { spawn, deps: d } = deps(responses);
    const r = await readGroupValues(source, paths, undefined, d);
    expect(r.values).toHaveLength(200);
    expect(spawn.getCount()).toBe(n);
  });

  it.each<[string, unknown, Record<string, unknown>]>([
    ["a missing note", { locale: "en-US", values: [{ u: "note-not-found" }] }, { stage: "group-values", reason: "note-not-found", path: "a.md" }],
    ["a value it cannot mirror", { locale: "en-US", values: [{ u: "object" }] }, { code: "GROUPING_UNSUPPORTED", reason: "value-type", path: "a.md", value_type: "object" }],
    ["a list element it cannot mirror", { locale: "en-US", values: [{ a: [{ v: { u: "object" } }] }] }, { code: "GROUPING_UNSUPPORTED", reason: "value-type", path: "a.md" }],
    ["an answer for a different number of rows", { locale: "en-US", values: [] }, { stage: "envelope-parse", asked: 1, answered: 0 }],
    ["a malformed answer", { locale: "en-US", values: [{ x: 1 }] }, { stage: "envelope-parse" }],
  ])("fails with a typed CLI_REPORTED_ERROR on %s", async (_label, body, details) => {
    const { deps: d } = deps([answer(body)]);
    const err = (await captureRejection(readGroupValues(source, ["a.md"], undefined, d))) as UpstreamError;
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details).toMatchObject(details);
  });

  it("fails with a typed json-parse error when the eval answers no JSON", async () => {
    const { deps: d } = deps([{ stdout: "=> not json\n", exitCode: 0 }]);
    const err = (await captureRejection(readGroupValues(source, ["a.md"], undefined, d))) as UpstreamError;
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details).toMatchObject({ stage: "json-parse" });
  });

  it("fails when batches report different locales", async () => {
    const paths = Array.from({ length: 200 }, (_, i) => `Folder ${i}/note ${i}.md`);
    const responses = planGroupBatches(source, paths).map((b, i) => answer({ locale: i === 0 ? "en-US" : "fr", values: b.map(() => null) }));
    const { deps: d } = deps(responses);
    const err = (await captureRejection(readGroupValues(source, paths, undefined, d))) as UpstreamError;
    expect(err.details).toMatchObject({ stage: "envelope-parse" });
  });

  it("names both locales when batches disagree (PR #158 review)", async () => {
    const paths = Array.from({ length: 200 }, (_, i) => `Folder ${i}/note ${i}.md`);
    const responses = planGroupBatches(source, paths).map((b, i) => answer({ locale: i === 0 ? "en-US" : "fr", values: b.map(() => null) }));
    const { deps: d } = deps(responses);
    const err = (await captureRejection(readGroupValues(source, paths, undefined, d))) as UpstreamError;
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details).toEqual({ stage: "envelope-parse", locales: ["en-US", "fr"] });
  });

  it("refuses no paths as INTERNAL_ERROR without an eval, instead of inventing a locale (PR #158 review)", async () => {
    const { spawn, deps: d } = deps([]);
    const err = (await captureRejection(readGroupValues(source, [], undefined, d))) as UpstreamError;
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.details).toEqual({ stage: "group-values" });
    expect(spawn.getCount()).toBe(0);
  });
  it("fails GROUPING_UNSUPPORTED/collator-locale for a locale this server's ICU lacks", async () => {
    const { deps: d } = deps([answer({ locale: "zz-Unknown-x-none", values: [{ s: "a" }] })]);
    const err = (await captureRejection(readGroupValues(source, ["a.md"], undefined, d))) as UpstreamError;
    expect(err.details).toMatchObject({ code: "GROUPING_UNSUPPORTED", reason: "collator-locale" });
  });
});
