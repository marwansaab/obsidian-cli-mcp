// Original — no upstream. open_file handler tests (BI-057; cross-vault rewrite ADR-031) —
// vault-targeted specific-mode argv assembly (vault=requested, command "eval"), base64 payload
// round-trip without `expectedBase` (R12 anti-injection lock), eval-envelope classification with the
// "=> " echo, the success shape { opened, vault, new_tab, placement }, the three placement outcomes
// (US3) + new_tab control (US4), the typed error roster (US5: unknown vault pre-eval, FILE_NOT_FOUND,
// UNSUPPORTED_FILE_TYPE, malformed → INTERNAL_ERROR; the retired VAULT_NOT_FOCUSED/not-open is NEVER
// produced), inherited app-down propagation (US2 — no per-tool retry/launch), and determinism (SC-006).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, expect, test } from "vitest";

import { executeOpenFile } from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import { captureRejection, makeQueuedSpawn, silentLogger, type StubResponse } from "../_handler-test-fixtures.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

/** Registry that resolves any name to a fixed base path (the requested vault is registered). */
function fakeRegistry(base = "/vaults/Work"): VaultRegistry {
  return { resolveVaultPath: async () => base };
}

/** Registry that raises the cohort's unknown-vault VALIDATION_ERROR. */
function unknownVaultRegistry(): VaultRegistry {
  return {
    resolveVaultPath: async () => {
      throw new UpstreamError({
        code: "VALIDATION_ERROR",
        cause: null,
        details: { requestedVault: "Typo" },
        message: 'Vault "Typo" is not registered with Obsidian.',
      });
    },
  };
}

function deps(
  spawnFn: SpawnLike,
  vaultRegistry: VaultRegistry = fakeRegistry(),
  env: NodeJS.ProcessEnv = {},
) {
  return { logger: silentLogger(), queue: createQueue(), vaultRegistry, spawnFn, env };
}

function decodePayload(argv: string[]): Record<string, unknown> {
  const codeArg = argv.find((a) => a.startsWith("code="));
  if (!codeArg) throw new Error("argv missing code= parameter");
  const match = /atob\('([A-Za-z0-9+/=]+)'\)/.exec(codeArg);
  if (!match) throw new Error("argv code= does not contain base64 atob(...) payload");
  return JSON.parse(Buffer.from(match[1]!, "base64").toString("utf-8")) as Record<string, unknown>;
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// =====================================================================
// US1 — cross-vault happy path (MVP): one vault-targeted specific-mode eval
// =====================================================================

test("happy path by path: returns { opened, vault, new_tab, placement }; specific-mode argv carries vault=requested; payload has NO expectedBase (US1)", async () => {
  const envelope = { ok: true, opened: "Projects/Roadmap.md", new_tab: false, placement: "active_tab_used" };
  const { spawnFn, recorded, getCount } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeOpenFile(
    { vault: "Work", path: "Projects/Roadmap.md", new_tab: false },
    deps(spawnFn),
  );
  expect(result).toEqual({
    opened: "Projects/Roadmap.md",
    vault: "Work",
    new_tab: false,
    placement: "active_tab_used",
  });
  expect(getCount()).toBe(1);
  const argv = recorded[0]!.argv;
  // Specific mode → assembleArgv prefixes vault= before the command (data-model §6).
  expect(argv[0]).toBe("vault=Work");
  expect(argv[1]).toBe("eval");
  expect(argv.includes("vault=Work")).toBe(true);
  expect(decodePayload(argv)).toEqual({
    path: "Projects/Roadmap.md",
    file: null,
    new_tab: false,
  });
  expect(decodePayload(argv)).not.toHaveProperty("expectedBase");
});

test("happy path by file: payload encodes file set / path null; opened is the canonical path; vault echoed (US1/FR-019)", async () => {
  const envelope = { ok: true, opened: "Projects/Roadmap.md", new_tab: false, placement: "active_tab_used" };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeOpenFile({ vault: "Work", file: "Roadmap" }, deps(spawnFn));
  expect(result).toEqual({
    opened: "Projects/Roadmap.md",
    vault: "Work",
    new_tab: false,
    placement: "active_tab_used",
  });
  expect(decodePayload(recorded[0]!.argv)).toEqual({ path: null, file: "Roadmap", new_tab: false });
});

test("cross-vault: the REQUESTED (unfocused/closed) vault is echoed, never a focused vault (US1-AC2)", async () => {
  const envelope = { ok: true, opened: "Sandbox/cv.md", new_tab: false, placement: "active_tab_used" };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeOpenFile(
    { vault: "Background", path: "Sandbox/cv.md" },
    deps(spawnFn, fakeRegistry("/vaults/Background")),
  );
  expect(result.vault).toBe("Background");
  expect(recorded[0]!.argv[0]).toBe("vault=Background");
});

test("determinism (SC-006): two identical calls produce byte-equal eval argv + identical envelopes", async () => {
  const envelope = { ok: true, opened: "a.md", new_tab: false, placement: "active_tab_used" };
  const { spawnFn: s1, recorded: r1 } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const { spawnFn: s2, recorded: r2 } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const out1 = await executeOpenFile({ vault: "Work", path: "a.md" }, deps(s1));
  const out2 = await executeOpenFile({ vault: "Work", path: "a.md" }, deps(s2));
  expect(JSON.stringify(out1)).toBe(JSON.stringify(out2));
  expect(r1[0]!.argv).toEqual(r2[0]!.argv);
  expect(Object.keys(out1).sort()).toEqual(["new_tab", "opened", "placement", "vault"]);
});

// =====================================================================
// US2 — type-agnostic open (markdown AND any recognised type)
// =====================================================================

for (const opened of ["Boards/Architecture.canvas", "Papers/transformer.pdf", "Assets/diagram.png"]) {
  test(`any-type happy path: ${opened} → identical { opened, vault, new_tab, placement } shape (US2/FR-020)`, async () => {
    const envelope = { ok: true, opened, new_tab: false, placement: "active_tab_used" };
    const { spawnFn } = makeQueuedSpawn([
      { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
    ]);
    const result = await executeOpenFile(
      { vault: "Research", path: opened },
      deps(spawnFn, fakeRegistry("/vaults/Research")),
    );
    expect(result).toEqual({ opened, vault: "Research", new_tab: false, placement: "active_tab_used" });
    expect(Object.keys(result).sort()).toEqual(["new_tab", "opened", "placement", "vault"]);
  });
}

// =====================================================================
// US3 — placement is machine-verifiable (closes the BI-0129 gap): exactly
// one of new_tab_created / existing_tab_reused / active_tab_used per success.
// =====================================================================

test("placement new_tab_created: new_tab:true → payload new_tab:true; result.placement is new_tab_created (US3/FR-009)", async () => {
  const envelope = { ok: true, opened: "Reference/Style Guide.md", new_tab: true, placement: "new_tab_created" };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeOpenFile(
    { vault: "Work", path: "Reference/Style Guide.md", new_tab: true },
    deps(spawnFn),
  );
  expect(result.placement).toBe("new_tab_created");
  expect(result.new_tab).toBe(true);
  expect(decodePayload(recorded[0]!.argv).new_tab).toBe(true);
});

test("placement existing_tab_reused: already-open + new_tab:false → result.placement is existing_tab_reused (US3/FR-010)", async () => {
  const envelope = { ok: true, opened: "a.md", new_tab: false, placement: "existing_tab_reused" };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeOpenFile({ vault: "Work", path: "a.md" }, deps(spawnFn));
  expect(result.placement).toBe("existing_tab_reused");
  expect(decodePayload(recorded[0]!.argv).new_tab).toBe(false);
});

test("placement active_tab_used: not-open + new_tab:false → result.placement is active_tab_used (US3/FR-011)", async () => {
  const envelope = { ok: true, opened: "a.md", new_tab: false, placement: "active_tab_used" };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeOpenFile({ vault: "Work", path: "a.md" }, deps(spawnFn));
  expect(result.placement).toBe("active_tab_used");
});

test("exactly one placement per success: the result carries a single placement from the enum (US3/SC-003)", async () => {
  for (const placement of ["new_tab_created", "existing_tab_reused", "active_tab_used"]) {
    const envelope = { ok: true, opened: "a.md", new_tab: placement === "new_tab_created", placement };
    const { spawnFn } = makeQueuedSpawn([
      { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
    ]);
    const result = await executeOpenFile(
      { vault: "Work", path: "a.md", new_tab: placement === "new_tab_created" },
      deps(spawnFn),
    );
    expect(result.placement).toBe(placement);
    expect(["new_tab_created", "existing_tab_reused", "active_tab_used"]).toContain(result.placement);
  }
});

// =====================================================================
// US4 — new-tab control: the new_tab opt-in maps to the placement branch.
// =====================================================================

test("new-tab control: new_tab:true forces new_tab_created even when the file is already open (US4/FR-009)", async () => {
  // Force-new: the eval opens a fresh leaf regardless of an existing tab → new_tab_created.
  const envelope = { ok: true, opened: "a.md", new_tab: true, placement: "new_tab_created" };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeOpenFile({ vault: "Work", path: "a.md", new_tab: true }, deps(spawnFn));
  expect(result.placement).toBe("new_tab_created");
  expect(decodePayload(recorded[0]!.argv).new_tab).toBe(true);
});

test("new-tab control: new_tab omitted defaults to false in the payload (reuse/active per open state) (US4/FR-008)", async () => {
  const envelope = { ok: true, opened: "a.md", new_tab: false, placement: "existing_tab_reused" };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeOpenFile({ vault: "Work", path: "a.md" }, deps(spawnFn));
  expect(result.new_tab).toBe(false);
  expect(decodePayload(recorded[0]!.argv).new_tab).toBe(false);
});

// =====================================================================
// US5 — distinct typed errors; the retired VAULT_NOT_FOCUSED is never emitted.
// =====================================================================

test("unknown vault → CLI_REPORTED_ERROR + VAULT_NOT_FOUND/unknown, pre-eval (no spawn) (US5/FR-013)", async () => {
  const { spawnFn, getCount } = makeQueuedSpawn([]);
  const err = (await captureRejection(
    executeOpenFile({ vault: "Typo", path: "a.md" }, deps(spawnFn, unknownVaultRegistry())),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({ code: "VAULT_NOT_FOUND", reason: "unknown", vault: "Typo" });
  expect(getCount()).toBe(0);
});

test("FILE_NOT_FOUND envelope → CLI_REPORTED_ERROR/FILE_NOT_FOUND (US5/FR-014)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"ok":false,"code":"FILE_NOT_FOUND","detail":"Sandbox/missing.md"}\n', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeOpenFile({ vault: "Work", path: "Sandbox/missing.md" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({ code: "FILE_NOT_FOUND", path: "Sandbox/missing.md", vault: "Work" });
});

test("UNSUPPORTED_FILE_TYPE envelope → CLI_REPORTED_ERROR/UNSUPPORTED_FILE_TYPE + extension (US5)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"ok":false,"code":"UNSUPPORTED_FILE_TYPE","detail":"sqlite"}\n', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeOpenFile({ vault: "Work", path: "data/export.sqlite" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    code: "UNSUPPORTED_FILE_TYPE",
    extension: "sqlite",
    path: "data/export.sqlite",
    vault: "Work",
  });
});

test("FILE_NOT_FOUND and UNSUPPORTED_FILE_TYPE are mutually distinguishable (US5/FR-015)", async () => {
  const { spawnFn: s1 } = makeQueuedSpawn([
    { stdout: '=> {"ok":false,"code":"UNSUPPORTED_FILE_TYPE","detail":"sqlite"}\n', exitCode: 0 },
  ]);
  const { spawnFn: s2 } = makeQueuedSpawn([
    { stdout: '=> {"ok":false,"code":"FILE_NOT_FOUND","detail":"x.md"}\n', exitCode: 0 },
  ]);
  const unsupported = (await captureRejection(
    executeOpenFile({ vault: "Work", path: "data/export.sqlite" }, deps(s1)),
  )) as UpstreamError;
  const notFound = (await captureRejection(
    executeOpenFile({ vault: "Work", path: "x.md" }, deps(s2)),
  )) as UpstreamError;
  expect(unsupported.details.code).toBe("UNSUPPORTED_FILE_TYPE");
  expect(notFound.details.code).toBe("FILE_NOT_FOUND");
  expect(unsupported.details.code).not.toBe(notFound.details.code);
});

test("malformed eval result (non-JSON) → INTERNAL_ERROR + details.stage:'json-parse' (US5)", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "=> not-valid-json{\n", exitCode: 0 }]);
  const err = (await captureRejection(
    executeOpenFile({ vault: "Work", path: "a.md" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("INTERNAL_ERROR");
  expect(err.details.stage).toBe("json-parse");
});

test("wrong-shape eval result (ok:true, no placement) → INTERNAL_ERROR + details.stage:'envelope-parse' (US5)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"ok":true,"opened":"a.md","new_tab":false}\n', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeOpenFile({ vault: "Work", path: "a.md" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("INTERNAL_ERROR");
  expect(err.details.stage).toBe("envelope-parse");
});

test("the retired VAULT_NOT_FOCUSED/not-open is NEVER produced (ADR-031; Principle IV — zero new codes/reasons)", async () => {
  // A legacy VAULT_NOT_FOCUSED envelope is no longer a recognised code: it fails
  // schema validation → INTERNAL_ERROR, NOT a VAULT_NOT_FOUND/reason:"not-open".
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"ok":false,"code":"VAULT_NOT_FOCUSED"}\n', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeOpenFile({ vault: "Archive", path: "old.md" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("INTERNAL_ERROR");
  expect(err.details.reason).not.toBe("not-open");
  expect(err.details.code).not.toBe("VAULT_NOT_FOUND");
});

test("every failure case rejects, never issues a success envelope (FR-017)", async () => {
  const failures: StubResponse[] = [
    { stdout: '=> {"ok":false,"code":"FILE_NOT_FOUND","detail":"x.md"}\n', exitCode: 0 },
    { stdout: '=> {"ok":false,"code":"UNSUPPORTED_FILE_TYPE","detail":"sqlite"}\n', exitCode: 0 },
    { stdout: "=> not-valid-json{\n", exitCode: 0 },
  ];
  for (const f of failures) {
    const { spawnFn } = makeQueuedSpawn([f]);
    const err = await captureRejection(executeOpenFile({ vault: "Work", path: "x" }, deps(spawnFn)));
    expect(err).toBeInstanceOf(UpstreamError);
  }
});

// =====================================================================
// US2 — closed/down vault recovery is INHERITED from dispatchCli; open_file
// adds none. The handler only threads vault=requested (asserted above) and
// surfaces the inherited error unchanged.
// =====================================================================

test("app down + auto-launch opt-out → inherited CLI_NON_ZERO_EXIT/obsidian-not-running propagates unchanged (US2/FR-016)", async () => {
  // One spawn: the app-not-running stderr signature; OBSIDIAN_AUTO_LAUNCH=0 makes
  // dispatchCli surface the distinct obsidian-not-running error with no launch/poll.
  const { spawnFn, getCount } = makeQueuedSpawn([
    {
      stdout: "",
      stderr: "The CLI is unable to find Obsidian. Please make sure Obsidian is running.",
      exitCode: 1,
    },
  ]);
  const err = (await captureRejection(
    executeOpenFile({ vault: "Work", path: "a.md" }, deps(spawnFn, fakeRegistry(), { OBSIDIAN_AUTO_LAUNCH: "0" })),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
  expect(err.details.reason).toBe("obsidian-not-running");
  expect(getCount()).toBe(1); // no per-tool retry — recovery is dispatch-layer only.
});

test("CLI_BINARY_NOT_FOUND (ENOENT) propagates unchanged, never a fabricated success", async () => {
  const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
  enoent.code = "ENOENT";
  const { spawnFn } = makeQueuedSpawn([{ errorOnSpawn: enoent }]);
  const err = (await captureRejection(
    executeOpenFile({ vault: "Work", path: "a.md" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
});

test("structural: the handler imports no app-launcher / launchFn and contains no per-tool retry loop (US2; ADR-029/030 own recovery)", () => {
  const handlerSrc = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "handler.ts"),
    "utf8",
  );
  // No import from a spawn site / launcher module (a prose comment may name them; an
  // `import … from "…app-launcher…"` statement must not exist).
  expect(handlerSrc).not.toMatch(/from\s+["'][^"']*app-launcher/);
  expect(handlerSrc).not.toMatch(/import\s+\{[^}]*launchObsidian/);
  // No launchFn dependency declared or destructured (`launchFn?:`, `launchFn:`, `deps.launchFn`).
  expect(handlerSrc).not.toMatch(/launchFn\s*[?:]/);
  expect(handlerSrc).not.toMatch(/\.launchFn\b/);
  // The eval is issued exactly once — no retry/poll loop in the handler body.
  expect(handlerSrc).not.toMatch(/\bwhile\s*\(/);
  expect(handlerSrc).not.toContain("setTimeout");
});

// =====================================================================
// R12 — anti-injection lock (retained)
// =====================================================================

test("anti-injection (R12): a hostile locator round-trips ONLY inside the base64 payload", async () => {
  const envelope = { ok: true, opened: "a.md", new_tab: false, placement: "active_tab_used" };
  const hostile = 'Tricky"); doSomething(); //.md';
  const { spawnFn, recorded, getCount } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  await executeOpenFile({ vault: "Work", path: hostile }, deps(spawnFn));
  expect(getCount()).toBe(1);
  const argv = recorded[0]!.argv;
  expect(decodePayload(argv).path).toBe(hostile);
  for (const a of argv) {
    if (a.startsWith("code=")) continue;
    expect(a.includes(hostile)).toBe(false);
  }
});
