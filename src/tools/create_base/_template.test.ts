// Original — no upstream. create_base _template tests (spec 083) — frozen-string byte-stability of
// ITEM_FOLDER_TEMPLATE (the named-vault item-folder eval; must not drift) + a composeEvalCode
// round-trip asserting the base path is base64-encoded into the payload (anti-injection — NOT
// string-interpolated) + the template run in node:vm against a stub `app`, row by row (contract §4,
// T1–T5, which were also verified live).
import { describe, expect, it } from "vitest";

import { ITEM_FOLDER_TEMPLATE } from "./_template.js";
import { runEvalTemplate } from "../_eval-template-fixtures.js";
import { composeEvalCode } from "../_shared.js";

describe("create_base ITEM_FOLDER_TEMPLATE — frozen-string byte stability", () => {
  it("is a block-body async IIFE (async because it awaits cachedRead)", () => {
    expect(ITEM_FOLDER_TEMPLATE.startsWith("(async()=>{")).toBe(true);
    expect(ITEM_FOLDER_TEMPLATE.endsWith("})()")).toBe(true);
  });

  it("carries the shared base64 payload placeholder, not string interpolation", () => {
    expect(ITEM_FOLDER_TEMPLATE.includes("__PAYLOAD_B64__")).toBe(true);
    expect(ITEM_FOLDER_TEMPLATE.includes("atob(")).toBe(true);
    expect(ITEM_FOLDER_TEMPLATE.includes("JSON.parse(")).toBe(true);
  });

  it("resolves the base by exact path and emits BASE_NOT_FOUND for a missing or non-file path", () => {
    expect(ITEM_FOLDER_TEMPLATE.includes("app.vault.getAbstractFileByPath(a.path)")).toBe(true);
    expect(ITEM_FOLDER_TEMPLATE.includes("f.extension===undefined")).toBe(true);
    expect(ITEM_FOLDER_TEMPLATE.includes("code:'BASE_NOT_FOUND'")).toBe(true);
  });

  it("derives the folder from a single top-level file.inFolder filter, else the new-note parent", () => {
    expect(ITEM_FOLDER_TEMPLATE.includes("app.vault.cachedRead(f)")).toBe(true);
    // Scans the top-level `filters:` key and its block `and:` list (no YAML parser in the eval context).
    expect(ITEM_FOLDER_TEMPLATE.includes("/^filters:/")).toBe(true);
    expect(ITEM_FOLDER_TEMPLATE.includes("and:\\s*$")).toBe(true);
    expect(ITEM_FOLDER_TEMPLATE.includes("parseYaml")).toBe(false);
    expect(ITEM_FOLDER_TEMPLATE.includes("file\\.inFolder")).toBe(true);
    expect(ITEM_FOLDER_TEMPLATE.includes("app.fileManager.getNewFileParent(f.path)")).toBe(true);
  });

  it("emits the ok:true envelope carrying the folder", () => {
    expect(ITEM_FOLDER_TEMPLATE.includes("ok:true")).toBe(true);
    expect(ITEM_FOLDER_TEMPLATE.includes("folder")).toBe(true);
  });
});

describe("create_base composeEvalCode round-trip (anti-injection)", () => {
  function payloadMatch(code: string): RegExpExecArray {
    const match = /atob\('([A-Za-z0-9+/=]+)'\)/.exec(code);
    if (!match) throw new Error("composed code does not contain a base64 atob(...) payload");
    return match;
  }

  it("base64-encodes { path } into the payload and fills the frozen template exactly", () => {
    const code = composeEvalCode(ITEM_FOLDER_TEMPLATE, { path: "A/B.base" });
    const match = payloadMatch(code);
    expect(JSON.parse(Buffer.from(match[1]!, "base64").toString("utf-8"))).toEqual({
      path: "A/B.base",
    });
    expect(code).toBe(ITEM_FOLDER_TEMPLATE.replace("__PAYLOAD_B64__", match[1]!));
    expect(code.includes("A/B.base")).toBe(false);
  });
});

describe("create_base ITEM_FOLDER_TEMPLATE — execution against a stub app (contract §4)", () => {
  const BASE = "Bases/Tasks.base";

  interface Stub {
    /** The `.base` text; null when nothing exists at the path. */
    text: string | null;
    /** A folder (no `extension`) sits at the path instead of a file. */
    isFolder?: boolean;
    /** What `getNewFileParent` reports; Obsidian reports the vault root as "/". */
    newFileParent?: string;
  }

  async function runTemplate(stub: Stub): Promise<unknown> {
    const entry = stub.isFolder
      ? { path: BASE }
      : stub.text === null
        ? null
        : { path: BASE, extension: "base" };
    const app = {
      vault: {
        getAbstractFileByPath: (p: string) => (p === BASE ? entry : null),
        cachedRead: async () => stub.text,
      },
      fileManager: { getNewFileParent: () => ({ path: stub.newFileParent ?? "/" }) },
    };
    return runEvalTemplate(ITEM_FOLDER_TEMPLATE, { path: BASE }, app);
  }

  it.each([
    ["missing", { text: null }],
    ["a folder at the path", { text: null, isFolder: true }],
  ])("T1: %s → BASE_NOT_FOUND", async (_label, stub) => {
    expect(await runTemplate(stub)).toEqual({ ok: false, code: "BASE_NOT_FOUND" });
  });

  it.each([
    ["T2 single-quoted scalar", `filters: 'file.inFolder("A")'\n`, "A"],
    ["T2 double-quoted scalar", `filters: "file.inFolder(\\"A\\")"\n`, "A"],
    ["T2 single quotes inside the call", `filters: "file.inFolder('A/B')"\n`, "A/B"],
    [
      "T3 block and: list, plain entries",
      `filters:\n  and:\n    - file.inFolder("A")\n    - x > 1\n`,
      "A",
    ],
    [
      "T3 block and: list, quoted entries",
      `filters:\n  and:\n    - 'file.inFolder("A")'\n    - 'x > 1'\n`,
      "A",
    ],
    [
      "T3 CRLF, comments and blank lines",
      `# c\r\nfilters:\r\n\r\n  and:\r\n    # c\r\n    - file.inFolder("A")\r\nviews: []\r\n`,
      "A",
    ],
  ])("%s → that folder", async (_label, text, folder) => {
    expect(await runTemplate({ text, newFileParent: "Inbox" })).toEqual({ ok: true, folder });
  });

  it.each([
    [
      "T4 two file.inFolder entries",
      `filters:\n  and:\n    - file.inFolder("A")\n    - file.inFolder("B")\n`,
    ],
    ["T4 an or group", `filters:\n  or:\n    - file.inFolder("A")\n`],
    [
      "T4 a nested group's entry is not top-level",
      `filters:\n  and:\n    - or:\n        - file.inFolder("A")\n`,
    ],
    ["T4 no filters", `views:\n  - type: table\n    name: All\n`],
    ["T4 a scalar filter that is not file.inFolder", `filters: 'x > 1'\n`],
    [
      "T5 flow style (research D5: takes the new-note branch)",
      `filters: {and: ['file.inFolder("A")']}\n`,
    ],
    ["T5 unparseable YAML", `filters: [unclosed\n`],
  ])("%s → the new-note parent", async (_label, text) => {
    expect(await runTemplate({ text, newFileParent: "Inbox" })).toEqual({
      ok: true,
      folder: "Inbox",
    });
  });

  it('T4: a new-note parent at the vault root ("/") becomes ""', async () => {
    expect(await runTemplate({ text: "views: []\n", newFileParent: "/" })).toEqual({
      ok: true,
      folder: "",
    });
  });
});
