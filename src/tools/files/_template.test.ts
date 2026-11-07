// Original — no upstream. files FOLDER_CHECK_TEMPLATE tests (BI-0205): runs the frozen eval template in-process against a stub vault adapter and pins its answers (a folder or a file is ok, a missing path is FOLDER_NOT_FOUND naming the folder, one trailing `/` is stripped before the stat), plus the base64 payload anti-injection.
import { describe, expect, it } from "vitest";

import { FOLDER_CHECK_TEMPLATE } from "./_template.js";
import { runEvalTemplate } from "../_eval-template-fixtures.js";
import { composeEvalCode } from "../_shared.js";

/** A stub `app` whose `vault.adapter.stat` answers from `folders` and `files`, null otherwise; `seen` records each stat. */
function diskWith(folders: string[], files: string[]) {
  const seen: string[] = [];
  const app = {
    vault: {
      adapter: {
        stat: async (p: string) => {
          seen.push(p);
          if (folders.includes(p)) return { type: "folder" };
          if (files.includes(p)) return { type: "file" };
          return null;
        },
      },
    },
  };
  return { app, seen };
}

const FOLDERS = ["Inbox", "Inbox/Empty"];
const FILES = ["Inbox/Note.md"];

describe("files FOLDER_CHECK_TEMPLATE", () => {
  it.each([
    { title: "an existing folder", folder: "Inbox/Empty", expected: { ok: true } },
    { title: "a path that names a file (out of scope, stays ok)", folder: "Inbox/Note.md", expected: { ok: true } },
    { title: "a missing folder", folder: "Inbox/Missing", expected: { ok: false, code: "FOLDER_NOT_FOUND", folder: "Inbox/Missing" } },
  ])("$title → $expected", async ({ folder, expected }) => {
    expect(await runEvalTemplate(FOLDER_CHECK_TEMPLATE, { folder }, diskWith(FOLDERS, FILES).app)).toEqual(expected);
  });

  it("strips one trailing '/' before the stat, and names the stripped folder", async () => {
    const existing = diskWith(FOLDERS, FILES);
    expect(await runEvalTemplate(FOLDER_CHECK_TEMPLATE, { folder: "Inbox/" }, existing.app)).toEqual({ ok: true });
    expect(existing.seen).toEqual(["Inbox"]);

    const missing = diskWith(FOLDERS, FILES);
    expect(await runEvalTemplate(FOLDER_CHECK_TEMPLATE, { folder: "Gone/" }, missing.app)).toEqual({
      ok: false,
      code: "FOLDER_NOT_FOUND",
      folder: "Gone",
    });
    expect(missing.seen).toEqual(["Gone"]);
  });

  it("carries the folder only in the base64 payload, never interpolated", () => {
    const hostile = "A');app.vault.delete(x);('";
    const code = composeEvalCode(FOLDER_CHECK_TEMPLATE, { folder: hostile });
    expect(code.includes(hostile)).toBe(false);
    expect(code).toBe(
      FOLDER_CHECK_TEMPLATE.replace("__PAYLOAD_B64__", Buffer.from(JSON.stringify({ folder: hostile })).toString("base64")),
    );
  });
});
