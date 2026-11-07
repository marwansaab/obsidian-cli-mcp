// Original — no upstream. Group-value eval template tests (BI-0207): each template runs under node:vm against a stub `app` and must report each row's value the way Obsidian 1.15's Bases code builds it (frontmatter conversion, tags, links, dates, file properties), in request order, with the collator locale; and both stay small enough to leave room for paths in the 2,900-character eval budget.
import { describe, expect, it } from "vitest";

import { FILE_GROUP_TEMPLATE, NOTE_GROUP_TEMPLATE } from "./_template.js";
import { runEvalTemplate } from "../_eval-template-fixtures.js";

interface StubNote {
  frontmatter?: Record<string, unknown>;
  tags?: string[];
  ctime?: number;
  mtime?: number;
}

function stubApp(notes: Record<string, StubNote>, links: Record<string, string> = {}) {
  const files = new Map(
    Object.entries(notes).map(([path, note]) => {
      const slash = path.lastIndexOf("/");
      const file = {
        path,
        extension: path.slice(path.lastIndexOf(".") + 1),
        parent: { path: slash < 0 ? "/" : path.slice(0, slash) },
        stat: { ctime: note.ctime ?? 0, mtime: note.mtime ?? 0 },
      };
      return [path, { file, note }] as const;
    }),
  );
  return {
    vault: {
      getAbstractFileByPath: (p: string) => files.get(p)?.file ?? (p === "Folder" ? { path: p, children: [] } : null),
    },
    metadataCache: {
      getFileCache: (f: { path: string }) => {
        const note = files.get(f.path)?.note;
        if (note === undefined) return null;
        return { frontmatter: note.frontmatter, tags: note.tags?.map((tag) => ({ tag })) };
      },
      getFirstLinkpathDest: (linkpath: string) => (links[linkpath] ? { path: links[linkpath] } : null),
    },
  };
}

function batch(paths: string[]): Array<[string, string[]]> {
  const out: Array<[string, string[]]> = [];
  for (const p of paths) {
    const slash = p.lastIndexOf("/");
    const [folder, name] = slash < 0 ? ["", p] : [p.slice(0, slash), p.slice(slash + 1)];
    const last = out.at(-1);
    if (last && last[0] === folder) last[1].push(name);
    else out.push([folder, [name]]);
  }
  return out;
}

async function noteValues(property: string, notes: Record<string, StubNote>, links?: Record<string, string>) {
  return (await runEvalTemplate(NOTE_GROUP_TEMPLATE, { p: property, f: batch(Object.keys(notes)) }, stubApp(notes, links))) as {
    locale: string;
    values: unknown[];
  };
}

describe("NOTE_GROUP_TEMPLATE", () => {
  it("reports strings, numbers, booleans and a missing property, in request order, with the collator locale", async () => {
    const r = await noteValues("status", {
      "a.md": { frontmatter: { status: "two" } },
      "sub/b.md": { frontmatter: { status: 9 } },
      "c.md": { frontmatter: { status: true } },
      "d.md": { frontmatter: {} },
      "e.md": {},
    });
    expect(r.values).toEqual([{ s: "two" }, { n: 9 }, { b: true }, null, null]);
    expect(r.locale).toBe(new Intl.Collator(undefined, { usage: "sort", sensitivity: "base", numeric: true }).resolvedOptions().locale);
  });

  it("matches the property exactly, else case-insensitively", async () => {
    const r = await noteValues("Status", { "a.md": { frontmatter: { status: "x" } }, "b.md": { frontmatter: { status: "y", Status: "z" } } });
    expect(r.values).toEqual([{ s: "x" }, { s: "z" }]);
  });

  it("turns date and date-time strings into dates, printed and compared as Obsidian does", async () => {
    const r = await noteValues("d", { "a.md": { frontmatter: { d: "2026-01-05" } }, "b.md": { frontmatter: { d: "2026-01-05T10:00:00" } } });
    const day = new Date("2026-01-05T00:00:00").getTime();
    expect(r.values).toEqual([
      { d: day, t: false, s: "2026-01-05", o: day },
      { d: new Date("2026-01-05T10:00:00").getTime(), t: true, s: "2026-01-05T10:00:00", o: day },
    ]);
  });

  it("turns [[links]] into links with their display text and resolved file", async () => {
    const r = await noteValues("p", { "a.md": { frontmatter: { p: "[[Proj#Part|Shown]]" } }, "b.md": { frontmatter: { p: "[[Gone]]" } } }, { Proj: "Projects/Proj.md" });
    expect(r.values).toEqual([
      { l: "Proj#Part", y: "Shown", r: "Projects/Proj.md" },
      { l: "Gone", y: null, r: null },
    ]);
  });

  it("reports lists with each element converted and primitive elements kept raw", async () => {
    const r = await noteValues("l", { "a.md": { frontmatter: { l: ["a", 2, null, "2026-01-05"] } }, "b.md": { frontmatter: { l: [] } } });
    const day = new Date("2026-01-05T00:00:00").getTime();
    expect(r.values).toEqual([
      { a: [{ v: { s: "a" }, w: "a" }, { v: { n: 2 }, w: 2 }, { v: null, w: null }, { v: { d: day, t: false, s: "2026-01-05", o: day }, w: "2026-01-05" }] },
      { a: [] },
    ]);
  });

  it("turns a tags property holding a string or a list of strings into '#'-prefixed tags", async () => {
    const r = await noteValues("tags", {
      "a.md": { frontmatter: { tags: ["x", "#y"] } },
      "b.md": { frontmatter: { Tags: "solo" } },
      "c.md": { frontmatter: { tags: 5 } },
    });
    expect(r.values).toEqual([{ a: [{ v: { s: "#x" } }, { v: { s: "#y" } }] }, { a: [{ v: { s: "#solo" } }] }, { n: 5 }]);
  });

  it("marks values it cannot mirror and paths that are not notes", async () => {
    const r = await noteValues("p", {
      "a.md": { frontmatter: { p: { nested: 1 } } },
      "b.md": { frontmatter: { p: Number.POSITIVE_INFINITY } },
      "c.md": { frontmatter: { p: "2026-13-45" } },
      "d.md": { frontmatter: { tags: ["x", null] } },
    });
    expect(r.values).toEqual([{ u: "object" }, { u: "non-finite-number" }, { u: "invalid-date" }, null]);
    const t = await noteValues("tags", { "d.md": { frontmatter: { tags: ["x", null] } } });
    expect(t.values).toEqual([{ u: "tag-list-null" }]);
    const missing = (await runEvalTemplate(NOTE_GROUP_TEMPLATE, { p: "p", f: [["", ["nope.md", "Folder"]]] }, stubApp({}))) as { values: unknown[] };
    expect(missing.values).toEqual([{ u: "note-not-found" }, { u: "note-not-found" }]);
  });
});

describe("FILE_GROUP_TEMPLATE", () => {
  const notes: Record<string, StubNote> = {
    "top.md": { frontmatter: { tags: ["fm", "two words", " spaced "] }, tags: ["#inline", "#fm"], ctime: new Date(2026, 10, 7, 19, 35, 44, 120).getTime() },
    "Sub/inner.md": { mtime: new Date(2026, 0, 2, 3, 4, 5).getTime() },
  };
  const run = async (p: string) =>
    ((await runEvalTemplate(FILE_GROUP_TEMPLATE, { p, f: batch(Object.keys(notes)) }, stubApp(notes))) as { values: unknown[] }).values;

  it("reports the folder (\"/\" at the vault root) and the extension", async () => {
    expect(await run("folder")).toEqual([{ s: "/" }, { s: "Sub" }]);
    expect(await run("ext")).toEqual([{ s: "md" }, { s: "md" }]);
  });

  it("reports ctime and mtime as dates with time, printed to the second", async () => {
    const ctime = new Date(2026, 10, 7, 19, 35, 44, 120);
    const [top] = await run("ctime");
    expect(top).toEqual({ d: ctime.getTime(), t: true, s: "2026-11-07T19:35:44", o: new Date(2026, 10, 7).getTime() });
    const [, inner] = await run("mtime");
    expect(inner).toMatchObject({ t: true, s: "2026-01-02T03:04:05" });
  });

  it("reports tags as inline tags then trimmed, spaceless frontmatter tags, '#'-prefixed, without repeats", async () => {
    expect(await run("tags")).toEqual([{ a: [{ v: { s: "#inline" } }, { v: { s: "#fm" } }, { v: { s: "#spaced" } }] }, { a: [] }]);
  });
});

describe("template size", () => {
  it("leaves room for paths in the 2,900-character eval budget", () => {
    expect(NOTE_GROUP_TEMPLATE.length).toBeLessThanOrEqual(2000);
    expect(FILE_GROUP_TEMPLATE.length).toBeLessThanOrEqual(1500);
  });
});
