// Original — no upstream. get_active_file _template tests (BI-063) — frozen-string byte-stability of
// ACTIVE_FILE_TEMPLATE (the recorded eval string the handler argv tests also assert; it MUST NOT drift),
// the field-derivation intent (name = basename + extension; multi-dot; no-extension — supplied by the
// substrate, not re-parsed), no caller-data payload (no __PAYLOAD_B64__ / atob), and read-only-ness
// (no openLinkText / setActiveLeaf / mutation call — FR-019 never changes the active file). [U1]
import { describe, expect, it } from "vitest";

import { ACTIVE_FILE_TEMPLATE } from "./_template.js";

describe("get_active_file ACTIVE_FILE_TEMPLATE — frozen-string byte stability", () => {
  it("is the exact recorded sync-IIFE eval string (byte-stable)", () => {
    expect(ACTIVE_FILE_TEMPLATE).toBe(
      "(()=>{const f=app.workspace.getActiveFile();return JSON.stringify(f?{ok:true,active:{path:f.path,name:f.name,basename:f.basename,extension:f.extension}}:{ok:true,active:null});})()",
    );
  });

  it("is a block-body SYNC IIFE (no async — getActiveFile() is synchronous)", () => {
    expect(ACTIVE_FILE_TEMPLATE.startsWith("(()=>{")).toBe(true);
    expect(ACTIVE_FILE_TEMPLATE.endsWith("})()")).toBe(true);
    expect(ACTIVE_FILE_TEMPLATE.includes("async")).toBe(false);
    expect(ACTIVE_FILE_TEMPLATE.includes("await")).toBe(false);
  });

  it("reads getActiveFile() and emits the four TFile fields (name = basename + extension; multi-dot / no-ext from the substrate)", () => {
    expect(ACTIVE_FILE_TEMPLATE.includes("app.workspace.getActiveFile()")).toBe(true);
    // The four fields are read straight off the TFile — no client-side re-parse of basename/extension.
    expect(ACTIVE_FILE_TEMPLATE.includes("path:f.path")).toBe(true);
    expect(ACTIVE_FILE_TEMPLATE.includes("name:f.name")).toBe(true);
    expect(ACTIVE_FILE_TEMPLATE.includes("basename:f.basename")).toBe(true);
    expect(ACTIVE_FILE_TEMPLATE.includes("extension:f.extension")).toBe(true);
    // No re-derivation logic (no split/slice/lastIndexOf on the name).
    expect(ACTIVE_FILE_TEMPLATE.includes(".split(")).toBe(false);
    expect(ACTIVE_FILE_TEMPLATE.includes("lastIndexOf")).toBe(false);
  });

  it("emits the ok:true wrapper for both the present and the null-active arm", () => {
    expect(ACTIVE_FILE_TEMPLATE.includes("ok:true,active:{")).toBe(true);
    expect(ACTIVE_FILE_TEMPLATE.includes("{ok:true,active:null}")).toBe(true);
  });

  it("injects NO caller-supplied payload (no __PAYLOAD_B64__ / atob / JSON.parse of a payload)", () => {
    expect(ACTIVE_FILE_TEMPLATE.includes("__PAYLOAD_B64__")).toBe(false);
    expect(ACTIVE_FILE_TEMPLATE.includes("atob(")).toBe(false);
    expect(ACTIVE_FILE_TEMPLATE.includes("JSON.parse(")).toBe(false);
  });

  it("is READ-ONLY — no openLinkText / setActiveLeaf / mutation call (FR-019 never changes the active file)", () => {
    expect(ACTIVE_FILE_TEMPLATE.includes("openLinkText")).toBe(false);
    expect(ACTIVE_FILE_TEMPLATE.includes("setActiveLeaf")).toBe(false);
    expect(ACTIVE_FILE_TEMPLATE.includes("getLeaf")).toBe(false);
    expect(ACTIVE_FILE_TEMPLATE.includes("openFile")).toBe(false);
    // The only workspace call is the read accessor getActiveFile().
    expect(ACTIVE_FILE_TEMPLATE.includes("app.vault.adapter")).toBe(false);
  });
});
