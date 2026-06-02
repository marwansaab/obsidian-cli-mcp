// Original — no upstream. open_file _template tests (BI-057; cross-vault rewrite ADR-031) —
// frozen-string byte-stability of JS_TEMPLATE (the constant must not drift; cohort parity with the
// eval-composed _template shape) + a composeEvalCode round-trip asserting args are base64-encoded
// into the payload (R12 anti-injection — NOT string-interpolated). Asserts the BI-057 focused-vault
// guard is GONE (no basePath check, no `expectedBase`, no VAULT_NOT_FOCUSED), the locator branches +
// type check survive, and the explicit placement branch (iterateAllLeaves → setActiveLeaf / new-leaf
// / active-leaf) is present.
import { describe, expect, it } from "vitest";

import { JS_TEMPLATE } from "./_template.js";
import { composeEvalCode } from "../_shared.js";

describe("open_file JS_TEMPLATE — frozen-string byte stability", () => {
  it("is a block-body async IIFE (async because the open branches await openLinkText)", () => {
    expect(JS_TEMPLATE.startsWith("(async()=>{")).toBe(true);
    expect(JS_TEMPLATE.endsWith("})()")).toBe(true);
  });

  it("carries the shared base64 payload placeholder, not string interpolation", () => {
    expect(JS_TEMPLATE.includes("__PAYLOAD_B64__")).toBe(true);
    expect(JS_TEMPLATE.includes("atob(")).toBe(true);
    expect(JS_TEMPLATE.includes("JSON.parse(")).toBe(true);
  });

  it("has NO focused-vault guard — no basePath check, no expectedBase, no VAULT_NOT_FOCUSED (ADR-031)", () => {
    expect(JS_TEMPLATE.includes("app.vault.adapter.basePath")).toBe(false);
    expect(JS_TEMPLATE.includes("expectedBase")).toBe(false);
    expect(JS_TEMPLATE.includes("VAULT_NOT_FOCUSED")).toBe(false);
  });

  it("reads both locator branches and the viewRegistry type check", () => {
    expect(JS_TEMPLATE.includes("app.vault.getFiles().find")).toBe(true);
    expect(JS_TEMPLATE.includes("app.metadataCache.getFirstLinkpathDest(a.file,'')")).toBe(true);
    expect(JS_TEMPLATE.includes("app.viewRegistry")).toBe(true);
    expect(JS_TEMPLATE.includes("isExtensionRegistered")).toBe(true);
  });

  it("derives placement via an explicit branch over iterateAllLeaves (ALL view types, not markdown-only)", () => {
    expect(JS_TEMPLATE.includes("app.workspace.iterateAllLeaves")).toBe(true);
    // The already-open scan matches on the leaf's view file path across every view type.
    expect(JS_TEMPLATE.includes("l.view.file.path===f.path")).toBe(true);
    // new_tab → a fresh leaf; reuse → setActiveLeaf(existing); else → active leaf.
    expect(JS_TEMPLATE.includes("app.workspace.openLinkText(f.path,'',true)")).toBe(true);
    expect(JS_TEMPLATE.includes("app.workspace.setActiveLeaf(existing,{focus:true})")).toBe(true);
    expect(JS_TEMPLATE.includes("app.workspace.openLinkText(f.path,'',false)")).toBe(true);
    expect(JS_TEMPLATE.includes("await ")).toBe(true);
  });

  it("emits both ok:false codes, all three placements, and the ok:true success branch with placement", () => {
    expect(JS_TEMPLATE.includes("code:'FILE_NOT_FOUND'")).toBe(true);
    expect(JS_TEMPLATE.includes("code:'UNSUPPORTED_FILE_TYPE'")).toBe(true);
    expect(JS_TEMPLATE.includes("placement='new_tab_created'")).toBe(true);
    expect(JS_TEMPLATE.includes("placement='existing_tab_reused'")).toBe(true);
    expect(JS_TEMPLATE.includes("placement='active_tab_used'")).toBe(true);
    expect(JS_TEMPLATE.includes("ok:true,opened:f.path,new_tab:a.new_tab,placement")).toBe(true);
  });
});

describe("open_file composeEvalCode round-trip (R12 anti-injection)", () => {
  function decodePayload(code: string): unknown {
    const match = /atob\('([A-Za-z0-9+/=]+)'\)/.exec(code);
    if (!match) throw new Error("composed code does not contain a base64 atob(...) payload");
    return JSON.parse(Buffer.from(match[1]!, "base64").toString("utf-8"));
  }

  it("base64-encodes { path, file, new_tab } into the payload — NO expectedBase (path branch)", () => {
    const code = composeEvalCode(JS_TEMPLATE, {
      path: "Projects/Roadmap.md",
      file: null,
      new_tab: false,
    });
    expect(decodePayload(code)).toEqual({
      path: "Projects/Roadmap.md",
      file: null,
      new_tab: false,
    });
    // The composed string is exactly the frozen template with the placeholder filled.
    const match = /atob\('([A-Za-z0-9+/=]+)'\)/.exec(code)!;
    expect(code).toBe(JS_TEMPLATE.replace("__PAYLOAD_B64__", match[1]!));
  });

  it("encodes the file branch (file set, path null) and new_tab:true", () => {
    const code = composeEvalCode(JS_TEMPLATE, {
      path: null,
      file: "Roadmap",
      new_tab: true,
    });
    expect(decodePayload(code)).toEqual({
      path: null,
      file: "Roadmap",
      new_tab: true,
    });
  });

  it("never string-interpolates a hostile locator — it round-trips verbatim in the payload only", () => {
    const hostile = 'Tricky"); doSomething(); //.md';
    const code = composeEvalCode(JS_TEMPLATE, {
      path: hostile,
      file: null,
      new_tab: false,
    });
    const payload = decodePayload(code) as { path: string };
    expect(payload.path).toBe(hostile);
    // The hostile substring appears ONLY inside the base64 payload, never raw in the code.
    const withoutPayload = code.replace(/atob\('[A-Za-z0-9+/=]+'\)/, "atob('')");
    expect(withoutPayload.includes(hostile)).toBe(false);
  });
});
