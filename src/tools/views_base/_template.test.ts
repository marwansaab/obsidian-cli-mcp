// Original — no upstream. views_base _template tests (BI-064) — frozen-string byte-stability of
// FOCUS_BASE_TEMPLATE (the focus-then-active mechanism's eval; must not drift) + a composeEvalCode
// round-trip asserting the locator is base64-encoded into the payload (anti-injection — NOT
// string-interpolated) + the BI-0179 focus check run under node:vm against a stub `app`. The
// template reuses the open MECHANISM via the shared composeEvalCode primitive; it must NOT import
// the sibling open_file module (Principle I).
import { describe, expect, it } from "vitest";

import { FOCUS_BASE_TEMPLATE } from "./_template.js";
import { runEvalTemplate } from "../_eval-template-fixtures.js";
import { codePayload } from "../_handler-test-fixtures.js";
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

  it("checks the active file against the resolved file after the open (BI-0179)", () => {
    expect(FOCUS_BASE_TEMPLATE.includes("app.workspace.getActiveFile()!==f")).toBe(true);
    expect(FOCUS_BASE_TEMPLATE.includes("code:'FOCUS_NOT_APPLIED',active:g?g.path:null")).toBe(true);
  });

  it("does NOT reach into the open_file placement machinery (minimal focus eval)", () => {
    expect(FOCUS_BASE_TEMPLATE.includes("iterateAllLeaves")).toBe(false);
    expect(FOCUS_BASE_TEMPLATE.includes("placement")).toBe(false);
    expect(FOCUS_BASE_TEMPLATE.includes("new_tab")).toBe(false);
  });
});

// BI-0179: the template runs under node:vm against a stub `app`. `activeAfter(n)` is the file
// `getActiveFile()` reports from its n-th call on (0-based), so a test can make the open land at
// once, land late, or never land.
interface StubFile {
  path: string;
  extension?: string;
}

function stubApp(files: StubFile[], active: (call: number) => StubFile | null) {
  const opened: unknown[][] = [];
  let calls = 0;
  const app = {
    vault: { getAbstractFileByPath: (p: string) => files.find((f) => f.path === p) ?? null },
    workspace: {
      openLinkText: async (...args: unknown[]) => {
        opened.push(args);
      },
      getActiveFile: () => active(calls++),
    },
  };
  return { app, opened, activeCalls: () => calls };
}

const A: StubFile = { path: "A/broken.base", extension: "base" };
const B: StubFile = { path: "B/broken.base", extension: "base" };

describe("views_base FOCUS_BASE_TEMPLATE — focus check (BI-0179)", () => {
  it("returns ok:true with the named path when the open lands at once (one check, no wait)", async () => {
    const { app, opened, activeCalls } = stubApp([A, B], () => B);

    const result = await runEvalTemplate(FOCUS_BASE_TEMPLATE, { path: B.path }, app);

    expect(result).toEqual({ ok: true, opened: B.path });
    expect(opened).toEqual([[B.path, "", false]]);
    expect(activeCalls()).toBe(2); // the loop's check + the final read, no polling
  });

  it("waits for an open that lands late and then returns ok:true", async () => {
    const { app, activeCalls } = stubApp([A, B], (n) => (n < 3 ? A : B));

    const result = await runEvalTemplate(FOCUS_BASE_TEMPLATE, { path: B.path }, app);

    expect(result).toEqual({ ok: true, opened: B.path });
    expect(activeCalls()).toBe(5); // three misses, the hit, the final read
  });

  it("returns FOCUS_NOT_APPLIED with the file still in front when the open never lands", async () => {
    const { app, activeCalls } = stubApp([A, B], () => A);

    const result = await runEvalTemplate(FOCUS_BASE_TEMPLATE, { path: B.path }, app);

    expect(result).toEqual({ ok: false, code: "FOCUS_NOT_APPLIED", active: A.path });
    expect(activeCalls()).toBe(21); // the bounded wait: 20 checks + the final read
  });

  it("returns FOCUS_NOT_APPLIED with active:null when nothing is in front after the open", async () => {
    const { app } = stubApp([A, B], () => null);

    const result = await runEvalTemplate(FOCUS_BASE_TEMPLATE, { path: B.path }, app);

    expect(result).toEqual({ ok: false, code: "FOCUS_NOT_APPLIED", active: null });
  });

  it("compares the file object, so another file in front is never taken for the named one", async () => {
    const lookalike: StubFile = { path: "C/broken.base", extension: "base" };
    const { app } = stubApp([A, B], () => lookalike);

    const result = await runEvalTemplate(FOCUS_BASE_TEMPLATE, { path: B.path }, app);

    expect(result).toEqual({ ok: false, code: "FOCUS_NOT_APPLIED", active: lookalike.path });
  });

  it("keeps FILE_NOT_FOUND for a missing path or a folder, without opening anything", async () => {
    const folder: StubFile = { path: "Folder" };
    const { app, opened, activeCalls } = stubApp([folder], () => A);

    expect(await runEvalTemplate(FOCUS_BASE_TEMPLATE, { path: "Missing.base" }, app)).toEqual({
      ok: false,
      code: "FILE_NOT_FOUND",
    });
    expect(await runEvalTemplate(FOCUS_BASE_TEMPLATE, { path: "Folder" }, app)).toEqual({
      ok: false,
      code: "FILE_NOT_FOUND",
    });
    expect(opened).toEqual([]);
    expect(activeCalls()).toBe(0);
  });
});

describe("views_base composeEvalCode round-trip (anti-injection)", () => {
  it("base64-encodes { path } into the payload and fills the frozen template exactly", () => {
    const code = composeEvalCode(FOCUS_BASE_TEMPLATE, { path: "Folder/Tasks.base" });
    expect(codePayload(code)).toEqual({ path: "Folder/Tasks.base" });
    const match = /atob\('([A-Za-z0-9+/=]+)'\)/.exec(code)!;
    expect(code).toBe(FOCUS_BASE_TEMPLATE.replace("__PAYLOAD_B64__", match[1]!));
  });

  it("never string-interpolates a hostile locator — it round-trips verbatim in the payload only", () => {
    const hostile = 'Tricky"); doSomething(); //.base';
    const code = composeEvalCode(FOCUS_BASE_TEMPLATE, { path: hostile });
    const payload = codePayload(code) as { path: string };
    expect(payload.path).toBe(hostile);
    const withoutPayload = code.replace(/atob\('[A-Za-z0-9+/=]+'\)/, "atob('')");
    expect(withoutPayload.includes(hostile)).toBe(false);
  });
});
