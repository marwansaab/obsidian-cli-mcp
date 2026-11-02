// Original — no upstream. create_base _template tests (spec 083) — frozen-string byte-stability of
// ITEM_FOLDER_TEMPLATE (the named-vault item-folder eval; must not drift) + a composeEvalCode
// round-trip asserting the base path is base64-encoded into the payload (anti-injection — NOT
// string-interpolated). Its in-Obsidian logic is verified live (contract §4, T1–T5).
import { describe, expect, it } from "vitest";

import { ITEM_FOLDER_TEMPLATE } from "./_template.js";
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
    expect(JSON.parse(Buffer.from(match[1]!, "base64").toString("utf-8"))).toEqual({ path: "A/B.base" });
    expect(code).toBe(ITEM_FOLDER_TEMPLATE.replace("__PAYLOAD_B64__", match[1]!));
    expect(code.includes("A/B.base")).toBe(false);
  });
});
