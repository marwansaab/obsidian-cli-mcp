// Original — no upstream. move BLOCKER_TEMPLATE tests (BI-0177): runs the frozen eval template in-process against a stub vault index and pins its prefix walk (the first prefix that is a file wins; folders and missing prefixes are passed over), plus the base64 payload anti-injection.
import { describe, expect, it } from "vitest";

import { BLOCKER_TEMPLATE } from "./_template.js";
import { runEvalTemplate } from "../_eval-template-fixtures.js";
import { composeEvalCode } from "../_shared.js";

/** A stub `app` whose vault index holds `folders` (entries with `children`) and `files`. */
function vaultWith(folders: string[], files: string[]) {
  return {
    vault: {
      getAbstractFileByPath: (p: string) => {
        if (folders.includes(p)) return { path: p, children: [] };
        if (files.includes(p)) return { path: p, extension: "md" };
        return null;
      },
    },
  };
}

const VAULT = vaultWith(["Fixtures", "Fixtures/c07", "Inbox"], ["Fixtures/c07/Blocker.md", "Inbox/Note.md"]);

describe("move BLOCKER_TEMPLATE — prefix walk", () => {
  it.each([
    { title: "the last segment is a file", folder: "Fixtures/c07/Blocker.md", blocker: "Fixtures/c07/Blocker.md" },
    { title: "an ancestor is a file", folder: "Inbox/Note.md/Sub/Deeper", blocker: "Inbox/Note.md" },
    { title: "the folder is missing", folder: "Fixtures/c07/Missing", blocker: null },
    { title: "every prefix is an existing folder", folder: "Fixtures/c07", blocker: null },
    { title: "a different case misses the case-sensitive index (known limit)", folder: "Fixtures/c07/blocker.md", blocker: null },
  ])("$title → blocker $blocker", async ({ folder, blocker }) => {
    expect(await runEvalTemplate(BLOCKER_TEMPLATE, { folder }, VAULT)).toEqual({ ok: true, blocker });
  });

  it("carries the folder only in the base64 payload, never interpolated", () => {
    const hostile = "A');app.vault.delete(x);('";
    const code = composeEvalCode(BLOCKER_TEMPLATE, { folder: hostile });
    expect(code.includes(hostile)).toBe(false);
    expect(code).toBe(BLOCKER_TEMPLATE.replace("__PAYLOAD_B64__", Buffer.from(JSON.stringify({ folder: hostile })).toString("base64")));
  });
});
