// Original — no upstream. open_file _template tests (BI-057; cross-vault rewrite ADR-031) —
// frozen-string byte-stability of JS_TEMPLATE (the constant must not drift; cohort parity with the
// eval-composed _template shape) + a composeEvalCode round-trip asserting args are base64-encoded
// into the payload (R12 anti-injection — NOT string-interpolated). Asserts the BI-057 focused-vault
// guard is GONE (no basePath check, no `expectedBase`, no VAULT_NOT_FOCUSED), the locator branches +
// type check survive, and the explicit placement branch (iterateAllLeaves → setActiveLeaf / new-leaf
// / active-leaf) is present. BI-0189: the focus check after every placement, run under node:vm
// against a stub `app` on fake timers.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JS_TEMPLATE } from "./_template.js";
import { runEvalTemplate } from "../_eval-template-fixtures.js";
import { codePayload } from "../_handler-test-fixtures.js";
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

// BI-0189: the template runs under node:vm against a stub `app` (BI-0179's views_base harness).
// `active(n)` is the file `getActiveFile()` reports on its n-th call (0-based). The wait runs on fake
// timers: `runEvalTemplate` hands the vm context the global `setTimeout`, so `vi.useFakeTimers()`
// reaches the template's poll. The wait itself (a late landing, `active:null`, object identity) is the
// shared `AWAIT_ACTIVE_FILE_JS`, pinned by views_base's BI-0179 suite; these rows pin its wiring after
// each placement: lands at once → ok:true, never lands → FOCUS_NOT_APPLIED with no retry of the open.
interface StubFile {
  path: string;
  extension: string;
}

function stubApp(
  files: StubFile[],
  active: (call: number) => StubFile | null,
  opts: { openLeafFiles?: readonly StubFile[]; registered?: string[] } = {},
) {
  const calls: { openLinkText: unknown[][]; setActiveLeaf: unknown[][] } = { openLinkText: [], setActiveLeaf: [] };
  const leaves = (opts.openLeafFiles ?? []).map((file) => ({ view: { file } }));
  let activeCalls = 0;
  const app = {
    vault: { getFiles: () => files },
    metadataCache: {
      getFirstLinkpathDest: (name: string) => files.find((f) => f.path.split("/").pop() === name) ?? null,
    },
    viewRegistry: {
      isExtensionRegistered: (ext: string) => (opts.registered ?? ["md"]).includes(ext),
    },
    workspace: {
      iterateAllLeaves: (cb: (leaf: unknown) => void) => leaves.forEach(cb),
      openLinkText: async (...args: unknown[]) => {
        calls.openLinkText.push(args);
      },
      setActiveLeaf: (...args: unknown[]) => {
        calls.setActiveLeaf.push(args);
      },
      getActiveFile: () => active(activeCalls++),
    },
  };
  return { app, calls, activeCalls: () => activeCalls };
}

const A: StubFile = { path: "Notes/A.md", extension: "md" };
const B: StubFile = { path: "Notes/B.md", extension: "md" };

async function runOpen(app: unknown, payload: { path?: string; file?: string; new_tab: boolean }): Promise<unknown> {
  const result = runEvalTemplate(JS_TEMPLATE, { path: payload.path ?? null, file: payload.file ?? null, new_tab: payload.new_tab }, app);
  await vi.runAllTimersAsync();
  return result;
}

// One row per placement branch: how the stub is set up to take it, and the one open call it makes.
const PLACEMENTS = [
  { placement: "new_tab_created", new_tab: true, openLeafFiles: [], openCall: "openLinkText", args: [B.path, "", true] },
  { placement: "existing_tab_reused", new_tab: false, openLeafFiles: [B], openCall: "setActiveLeaf", args: undefined },
  { placement: "active_tab_used", new_tab: false, openLeafFiles: [], openCall: "openLinkText", args: [B.path, "", false] },
] as const;

describe("open_file JS_TEMPLATE — focus check after every placement (BI-0189)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe.each(PLACEMENTS)("$placement", ({ placement, new_tab, openLeafFiles, openCall, args }) => {
    it("returns ok:true when the open lands at once (one check, no wait)", async () => {
      const { app, calls, activeCalls } = stubApp([A, B], () => B, { openLeafFiles });

      const result = await runOpen(app, { path: B.path, new_tab });

      expect(result).toEqual({ ok: true, opened: B.path, new_tab, placement });
      const other = openCall === "openLinkText" ? "setActiveLeaf" : "openLinkText";
      expect(calls[openCall]).toHaveLength(1);
      expect(calls[other]).toHaveLength(0);
      if (args) expect(calls[openCall][0]).toEqual(args);
      expect(activeCalls()).toBe(2); // the loop's check + the final read, no polling
    });

    it("returns FOCUS_NOT_APPLIED naming the file and what is in front when the open never lands", async () => {
      const { app, calls, activeCalls } = stubApp([A, B], () => A, { openLeafFiles });

      const result = await runOpen(app, { path: B.path, new_tab });

      expect(result).toEqual({ ok: false, code: "FOCUS_NOT_APPLIED", opened: B.path, active: A.path });
      expect(activeCalls()).toBe(21); // the bounded wait: 20 checks + the final read
      expect(calls[openCall]).toHaveLength(1); // no retry of the open
    });
  });

  it("names the resolved path when the caller gave a bare file name", async () => {
    const { app } = stubApp([A, B], () => A);

    expect(await runOpen(app, { file: "B.md", new_tab: false })).toEqual({
      ok: false,
      code: "FOCUS_NOT_APPLIED",
      opened: B.path,
      active: A.path,
    });
  });

  it("keeps FILE_NOT_FOUND and UNSUPPORTED_FILE_TYPE ahead of any open or focus check", async () => {
    const sqlite: StubFile = { path: "data/export.sqlite", extension: "sqlite" };
    const { app, calls, activeCalls } = stubApp([A, sqlite], () => A);

    expect(await runOpen(app, { path: "Missing.md", new_tab: false })).toEqual({ ok: false, code: "FILE_NOT_FOUND" });
    expect(await runOpen(app, { path: sqlite.path, new_tab: true })).toEqual({
      ok: false,
      code: "UNSUPPORTED_FILE_TYPE",
      detail: "sqlite",
    });
    expect(calls).toEqual({ openLinkText: [], setActiveLeaf: [] });
    expect(activeCalls()).toBe(0);
  });
});

describe("open_file composeEvalCode round-trip (R12 anti-injection)", () => {
  it("base64-encodes { path, file, new_tab } into the payload — NO expectedBase (path branch)", () => {
    const code = composeEvalCode(JS_TEMPLATE, {
      path: "Projects/Roadmap.md",
      file: null,
      new_tab: false,
    });
    expect(codePayload(code)).toEqual({
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
    expect(codePayload(code)).toEqual({
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
    const payload = codePayload(code) as { path: string };
    expect(payload.path).toBe(hostile);
    // The hostile substring appears ONLY inside the base64 payload, never raw in the code.
    const withoutPayload = code.replace(/atob\('[A-Za-z0-9+/=]+'\)/, "atob('')");
    expect(withoutPayload.includes(hostile)).toBe(false);
  });
});
