// Original — no upstream. write_note NAME_LOOKUP_TEMPLATE tests (BI-0176): runs the frozen lookup eval in-process under node:vm against a stub `app` (the shared runEvalTemplate harness), so the eval's own logic — wikilink resolution from the vault root and the reported vault name — is pinned, not just what a handler stub returns. Also pins base64 payload anti-injection (R12).
import { describe, expect, it } from "vitest";

import { NAME_LOOKUP_TEMPLATE } from "./_template.js";
import { runEvalTemplate } from "../_eval-template-fixtures.js";
import { composeEvalCode } from "../_shared.js";

function stubApp(vault: string, notes: Record<string, string>, calls: Array<[string, string]> = []) {
  return {
    vault: { getName: () => vault },
    metadataCache: {
      getFirstLinkpathDest: (linkpath: string, source: string) => {
        calls.push([linkpath, source]);
        const path = notes[linkpath];
        return path === undefined ? null : { path };
      },
    },
  };
}

describe("NAME_LOOKUP_TEMPLATE", () => {
  it("resolves the name from the vault root and reports the vault it ran in", async () => {
    const calls: Array<[string, string]> = [];
    const result = await runEvalTemplate(
      NAME_LOOKUP_TEMPLATE,
      { file: "Alpha" },
      stubApp("TestVault", { Alpha: "Sub/Alpha.md" }, calls),
    );
    expect(result).toEqual({ vault: "TestVault", path: "Sub/Alpha.md" });
    expect(calls).toEqual([["Alpha", ""]]);
  });

  it("answers path null when no note has the name", async () => {
    const result = await runEvalTemplate(NAME_LOOKUP_TEMPLATE, { file: "Beta" }, stubApp("Other", {}));
    expect(result).toEqual({ vault: "Other", path: null });
  });

  it("carries a hostile name only inside the base64 payload", async () => {
    const hostile = "x');app.vault.delete(1);('";
    const code = composeEvalCode(NAME_LOOKUP_TEMPLATE, { file: hostile });
    expect(code.includes(hostile)).toBe(false);
    const result = await runEvalTemplate(NAME_LOOKUP_TEMPLATE, { file: hostile }, stubApp("V", { [hostile]: "h.md" }));
    expect(result).toEqual({ vault: "V", path: "h.md" });
  });
});
