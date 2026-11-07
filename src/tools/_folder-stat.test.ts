// Original — no upstream. Tests for the shared folder-type fragment (BI-0205): `FOLDER_STAT_KIND_JS`, run under node:vm against a stub `app.vault.adapter.stat`, answers "missing" for a null or throwing stat, "folder" for a folder and "file" for a file.
import { runInNewContext } from "node:vm";

import { expect, test } from "vitest";

import { FOLDER_STAT_KIND_JS } from "./_folder-stat.js";

function kindOf(stat: (p: string) => Promise<unknown>): (p: string) => Promise<string> {
  return runInNewContext(FOLDER_STAT_KIND_JS, { app: { vault: { adapter: { stat } } } }) as (p: string) => Promise<string>;
}

test.each<[string, () => Promise<unknown>, string]>([
  ["null", async () => null, "missing"],
  ["{ type: 'folder' }", async () => ({ type: "folder" }), "folder"],
  ["{ type: 'file' }", async () => ({ type: "file" }), "file"],
  [
    "a throwing stat",
    async () => {
      throw new Error("stat failed");
    },
    "missing",
  ],
])("stat answering %s → %j", async (_label, stat, expected) => {
  expect(await kindOf(stat)("Some/Path")).toBe(expected);
});

test("stats the path it is given, as is", async () => {
  const seen: string[] = [];
  await kindOf(async (p) => {
    seen.push(p);
    return null;
  })("Inbox/Sub");
  expect(seen).toEqual(["Inbox/Sub"]);
});
