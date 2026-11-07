// Original — no upstream. files FOLDER_CHECK_TEMPLATE tests (BI-0205): runs the frozen eval template in-process against a stub vault adapter and pins its wiring (it stats the payload's folder as given and answers the shared fragment's fact as `{kind}`; the fragment's own semantics are pinned in `_folder-stat.test.ts`), plus the base64 payload anti-injection.
import { describe, expect, it } from "vitest";

import { FOLDER_CHECK_TEMPLATE } from "./_template.js";
import { runEvalTemplate } from "../_eval-template-fixtures.js";
import { composeEvalCode } from "../_shared.js";

describe("files FOLDER_CHECK_TEMPLATE", () => {
  it("stats the payload's folder as given and answers { kind } from the fragment", async () => {
    const seen: string[] = [];
    const app = {
      vault: {
        adapter: {
          stat: async (p: string) => {
            seen.push(p);
            return p === "Inbox/Empty" ? { type: "folder" } : null;
          },
        },
      },
    };
    expect(await runEvalTemplate(FOLDER_CHECK_TEMPLATE, { folder: "Inbox/Empty" }, app)).toEqual({ kind: "folder" });
    expect(await runEvalTemplate(FOLDER_CHECK_TEMPLATE, { folder: "Inbox/" }, app)).toEqual({ kind: "missing" });
    expect(seen).toEqual(["Inbox/Empty", "Inbox/"]);
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
