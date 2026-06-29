// Original — no upstream. views_base _template tests (BI-064) — frozen-string byte-stability of
// FOCUS_BASE_TEMPLATE (the focus-then-active mechanism's eval; must not drift) + a composeEvalCode
// round-trip asserting the locator is base64-encoded into the payload (anti-injection — NOT
// string-interpolated). The template reuses the open MECHANISM via the shared composeEvalCode
// primitive; it must NOT import the sibling open_file module (Principle I).
import { describe, expect, it } from "vitest";

import { FOCUS_BASE_TEMPLATE } from "./_template.js";
import { composeEvalCode } from "../_shared.js";

describe("views_base FOCUS_BASE_TEMPLATE — frozen-string byte stability", () => {
  it("is a block-body async IIFE (async because it awaits openLinkText)", () => {
    expect(FOCUS_BASE_TEMPLATE.startsWith("(async()=>{")).toBe(true);
    expect(FOCUS_BASE_TEMPLATE.endsWith("})()")).toBe(true);
  });

  it("carries the shared base64 payload placeholder, not string interpolation", () => {
    expect(FOCUS_BASE_TEMPLATE.includes("__PAYLOAD_B64__")).toBe(true);
    expect(FOCUS_BASE_TEMPLATE.includes("atob(")).toBe(true);
    expect(FOCUS_BASE_TEMPLATE.includes("JSON.parse(")).toBe(true);
  });

  it("resolves the locator by exact path and opens it into the active leaf (focus)", () => {
    expect(FOCUS_BASE_TEMPLATE.includes("app.vault.getAbstractFileByPath(a.path)")).toBe(true);
    expect(FOCUS_BASE_TEMPLATE.includes("app.workspace.openLinkText(f.path,'',false)")).toBe(true);
    expect(FOCUS_BASE_TEMPLATE.includes("await ")).toBe(true);
  });

  it("emits the FILE_NOT_FOUND envelope for a missing/non-file locator and the ok:true success branch", () => {
    expect(FOCUS_BASE_TEMPLATE.includes("code:'FILE_NOT_FOUND'")).toBe(true);
    expect(FOCUS_BASE_TEMPLATE.includes("ok:true,opened:f.path")).toBe(true);
    // Rejects a folder (no `extension`) as well as a missing path.
    expect(FOCUS_BASE_TEMPLATE.includes("f.extension===undefined")).toBe(true);
  });

  it("does NOT reach into the open_file placement machinery (minimal focus eval)", () => {
    expect(FOCUS_BASE_TEMPLATE.includes("iterateAllLeaves")).toBe(false);
    expect(FOCUS_BASE_TEMPLATE.includes("placement")).toBe(false);
    expect(FOCUS_BASE_TEMPLATE.includes("new_tab")).toBe(false);
  });
});

describe("views_base composeEvalCode round-trip (anti-injection)", () => {
  function decodePayload(code: string): unknown {
    const match = /atob\('([A-Za-z0-9+/=]+)'\)/.exec(code);
    if (!match) throw new Error("composed code does not contain a base64 atob(...) payload");
    return JSON.parse(Buffer.from(match[1]!, "base64").toString("utf-8"));
  }

  it("base64-encodes { path } into the payload and fills the frozen template exactly", () => {
    const code = composeEvalCode(FOCUS_BASE_TEMPLATE, { path: "Folder/Tasks.base" });
    expect(decodePayload(code)).toEqual({ path: "Folder/Tasks.base" });
    const match = /atob\('([A-Za-z0-9+/=]+)'\)/.exec(code)!;
    expect(code).toBe(FOCUS_BASE_TEMPLATE.replace("__PAYLOAD_B64__", match[1]!));
  });

  it("never string-interpolates a hostile locator — it round-trips verbatim in the payload only", () => {
    const hostile = 'Tricky"); doSomething(); //.base';
    const code = composeEvalCode(FOCUS_BASE_TEMPLATE, { path: hostile });
    const payload = decodePayload(code) as { path: string };
    expect(payload.path).toBe(hostile);
    const withoutPayload = code.replace(/atob\('[A-Za-z0-9+/=]+'\)/, "atob('')");
    expect(withoutPayload.includes(hostile)).toBe(false);
  });
});
