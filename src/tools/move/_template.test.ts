// Original — no upstream. move BLOCKER_TEMPLATE tests (BI-0177): runs the frozen eval template in-process against a stub vault adapter and pins its prefix walk on the disk's answers (the first prefix that exists and is not a folder wins; a missing prefix ends the walk with null; a case-different name matches exactly when the file system says it exists), plus the base64 payload anti-injection.
import { describe, expect, it } from "vitest";

import { BLOCKER_TEMPLATE } from "./_template.js";
import { runEvalTemplate } from "../_eval-template-fixtures.js";
import { composeEvalCode } from "../_shared.js";

/**
 * A stub `app` whose `vault.adapter.stat` answers from `folders` and `files` like a disk:
 * null for a missing path, `{ type }` otherwise. `caseInsensitive` matches names the way
 * Windows and default macOS volumes do. `throws` lists paths whose stat rejects.
 */
function diskWith(folders: string[], files: string[], opts: { caseInsensitive?: boolean; throws?: string[] } = {}) {
  const key = (p: string) => (opts.caseInsensitive ? p.toLowerCase() : p);
  const has = (list: string[], p: string) => list.some((x) => key(x) === key(p));
  return {
    vault: {
      adapter: {
        stat: async (p: string) => {
          if (opts.throws?.includes(p)) throw new Error("stat failed");
          if (has(folders, p)) return { type: "folder" };
          if (has(files, p)) return { type: "file" };
          return null;
        },
      },
    },
  };
}

const FOLDERS = ["Fixtures", "Fixtures/c07", "Inbox"];
const FILES = ["Fixtures/c07/Blocker.md", "Inbox/Note.md"];

describe("move BLOCKER_TEMPLATE — prefix walk", () => {
  it.each([
    { title: "the last segment is a file", folder: "Fixtures/c07/Blocker.md", blocker: "Fixtures/c07/Blocker.md" },
    { title: "an ancestor is a file", folder: "Inbox/Note.md/Sub/Deeper", blocker: "Inbox/Note.md" },
    { title: "the folder is missing", folder: "Fixtures/c07/Missing", blocker: null },
    { title: "a missing ancestor ends the walk", folder: "Missing/Fixtures/c07/Blocker.md", blocker: null },
    { title: "every prefix is an existing folder", folder: "Fixtures/c07", blocker: null },
    { title: "a different case on a case-sensitive disk is absent", folder: "Fixtures/c07/blocker.md", blocker: null },
  ])("$title → blocker $blocker", async ({ folder, blocker }) => {
    expect(await runEvalTemplate(BLOCKER_TEMPLATE, { folder }, diskWith(FOLDERS, FILES))).toEqual({ ok: true, blocker });
  });

  it("a different case on a case-insensitive disk is the file in the way, named as the caller wrote it", async () => {
    const app = diskWith(FOLDERS, FILES, { caseInsensitive: true });
    expect(await runEvalTemplate(BLOCKER_TEMPLATE, { folder: "fixtures/C07/blocker.md" }, app)).toEqual({
      ok: true,
      blocker: "fixtures/C07/blocker.md",
    });
  });

  it("a stat that rejects reads as a missing prefix", async () => {
    const app = diskWith(FOLDERS, FILES, { throws: ["Fixtures/c07"] });
    expect(await runEvalTemplate(BLOCKER_TEMPLATE, { folder: "Fixtures/c07/Blocker.md" }, app)).toEqual({ ok: true, blocker: null });
  });

  it("carries the folder only in the base64 payload, never interpolated", () => {
    const hostile = "A');app.vault.delete(x);('";
    const code = composeEvalCode(BLOCKER_TEMPLATE, { folder: hostile });
    expect(code.includes(hostile)).toBe(false);
    expect(code).toBe(BLOCKER_TEMPLATE.replace("__PAYLOAD_B64__", Buffer.from(JSON.stringify({ folder: hostile })).toString("base64")));
  });
});
