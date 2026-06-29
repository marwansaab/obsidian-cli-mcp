// Original — no upstream. get_active_file handler tests (BI-063) — active-mode argv assembly (command
// "eval", target_mode "active", NO vault), the four-field success shape, the field-shape characterisation
// (single-ext, multi-dot, no-extension, non-ASCII raw), the { active: null } SUCCESS boundary (US2 — no
// error/throw, distinguishable from a present file), the echo convention (result carries ONLY `active`;
// path round-trips verbatim — US3), specific-mode cross-vault argv (vault=requested, target_mode
// "specific"), the typed unknown-vault pre-eval error (VAULT_NOT_FOUND/unknown), malformed-eval
// classification (CLI_REPORTED_ERROR), and inherited app-down propagation (US4 — no per-tool retry/launch).
import { afterEach, beforeEach, expect, test } from "vitest";

import { ACTIVE_FILE_TEMPLATE } from "./_template.js";
import { executeGetActiveFile } from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import { captureRejection, makeQueuedSpawn, silentLogger } from "../_handler-test-fixtures.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

/** Registry that resolves any name to a fixed base path (the requested vault is registered). */
function fakeRegistry(base = "/vaults/Work"): VaultRegistry {
  return { resolveVaultPath: async () => base };
}

/** Registry that raises the cohort's unknown-vault VALIDATION_ERROR (an unregistered display name). */
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

function codeArg(argv: string[]): string {
  const found = argv.find((a) => a.startsWith("code="));
  if (!found) throw new Error("argv missing code= parameter");
  return found.slice("code=".length);
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// =====================================================================
// US1 — active-mode happy path (MVP): one no-vault eval, four fields
// =====================================================================

test("active mode: returns { active: {path,name,basename,extension} }; argv is command 'eval' with NO vault (US1)", async () => {
  const envelope = {
    active: { path: "Folder/note.md", name: "note.md", basename: "note", extension: "md" },
  };
  const { spawnFn, recorded, getCount } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeGetActiveFile({ target_mode: "active" }, deps(spawnFn));
  expect(result).toEqual({
    active: { path: "Folder/note.md", name: "note.md", basename: "note", extension: "md" },
  });
  expect(getCount()).toBe(1);
  const argv = recorded[0]!.argv;
  // active mode → no vault= prefix; the command is the first argv element.
  expect(argv[0]).toBe("eval");
  expect(argv.some((a) => a.startsWith("vault="))).toBe(false);
  // The frozen template is passed verbatim as the code= parameter (no base64 payload).
  expect(codeArg(argv)).toBe(ACTIVE_FILE_TEMPLATE);
});

// Field-shape characterisation driven through the mocked envelope (FR-002/003/004). The handler does not
// re-derive the fields — it returns exactly what the substrate reported, so these assert pass-through.
const FIELD_SHAPES = [
  {
    label: "single extension",
    active: { path: "note.md", name: "note.md", basename: "note", extension: "md" },
  },
  {
    label: "multi-dot",
    active: { path: "a.b.md", name: "a.b.md", basename: "a.b", extension: "md" },
  },
  {
    label: "no extension",
    active: { path: "README", name: "README", basename: "README", extension: "" },
  },
  {
    label: "non-ASCII raw",
    active: { path: "café/日本語.md", name: "日本語.md", basename: "日本語", extension: "md" },
  },
];

for (const shape of FIELD_SHAPES) {
  test(`active mode field shape (${shape.label}): the four fields pass through verbatim`, async () => {
    const { spawnFn } = makeQueuedSpawn([
      { stdout: `=> ${JSON.stringify({ active: shape.active })}\n`, exitCode: 0 },
    ]);
    const result = await executeGetActiveFile({ target_mode: "active" }, deps(spawnFn));
    expect(result.active).toEqual(shape.active);
    if (result.active) {
      expect(result.active.name).toBe(result.active.basename + (result.active.extension ? "." : "") + result.active.extension);
    }
  });
}

// =====================================================================
// US2 — "no active file" is a SUCCESS, not an error
// =====================================================================

test("no active file: { active: null } → { active: null } SUCCESS (not isError / not a throw) (US2)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify({ active: null })}\n`, exitCode: 0 },
  ]);
  const result = await executeGetActiveFile({ target_mode: "active" }, deps(spawnFn));
  expect(result).toEqual({ active: null });
  expect(result.active).toBeNull();
});

test("no active file is distinguishable from a present file via active === null (US2/FR-006)", async () => {
  const { spawnFn: sNull } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify({ active: null })}\n`, exitCode: 0 },
  ]);
  const { spawnFn: sPresent } = makeQueuedSpawn([
    {
      stdout: `=> ${JSON.stringify({ active: { path: "a.md", name: "a.md", basename: "a", extension: "md" } })}\n`,
      exitCode: 0,
    },
  ]);
  const absent = await executeGetActiveFile({ target_mode: "active" }, deps(sNull));
  const present = await executeGetActiveFile({ target_mode: "active" }, deps(sPresent));
  expect(absent.active).toBeNull();
  expect(present.active).not.toBeNull();
  expect(absent.active === null).not.toBe(present.active === null);
});

// =====================================================================
// US3 — echo convention + path-as-locator round-trip
// =====================================================================

test("echo convention: the result carries ONLY `active` — no vault / target_mode echo (US3/FR-015)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: `=> ${JSON.stringify({ active: { path: "a.md", name: "a.md", basename: "a", extension: "md" } })}\n`,
      exitCode: 0,
    },
  ]);
  const result = await executeGetActiveFile({ target_mode: "specific", vault: "Work" }, deps(spawnFn));
  expect(Object.keys(result)).toEqual(["active"]);
  expect(result).not.toHaveProperty("vault");
  expect(result).not.toHaveProperty("target_mode");
});

test("path round-trip: active.path equals the envelope path verbatim (the value an agent reuses as a locator) (US3/FR-007)", async () => {
  const path = "Projects/Q2 Roadmap.md";
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: `=> ${JSON.stringify({ active: { path, name: "Q2 Roadmap.md", basename: "Q2 Roadmap", extension: "md" } })}\n`,
      exitCode: 0,
    },
  ]);
  const result = await executeGetActiveFile({ target_mode: "active" }, deps(spawnFn));
  expect(result.active?.path).toBe(path);
});

// =====================================================================
// US4 — specific mode, cross-vault, typed unknown-vault error
// =====================================================================

test("specific mode: argv carries vault=<name> + command 'eval'; returns the named vault's active file (US4/FR-011)", async () => {
  const envelope = {
    active: { path: "B-note.md", name: "B-note.md", basename: "B-note", extension: "md" },
  };
  const { spawnFn, recorded, getCount } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeGetActiveFile(
    { target_mode: "specific", vault: "B" },
    deps(spawnFn, fakeRegistry("/vaults/B")),
  );
  expect(result).toEqual({ active: envelope.active });
  expect(getCount()).toBe(1);
  const argv = recorded[0]!.argv;
  // specific mode → assembleArgv prefixes vault= before the command.
  expect(argv[0]).toBe("vault=B");
  expect(argv[1]).toBe("eval");
  expect(codeArg(argv)).toBe(ACTIVE_FILE_TEMPLATE);
});

test("specific mode, unregistered vault → CLI_REPORTED_ERROR / VAULT_NOT_FOUND / unknown, pre-eval (no spawn) (US4/FR-010)", async () => {
  const { spawnFn, getCount } = makeQueuedSpawn([]);
  const err = (await captureRejection(
    executeGetActiveFile({ target_mode: "specific", vault: "Typo" }, deps(spawnFn, unknownVaultRegistry())),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({ code: "VAULT_NOT_FOUND", reason: "unknown", vault: "Typo" });
  // The unknown-vault check fires BEFORE any eval is spawned.
  expect(getCount()).toBe(0);
});

test("specific mode, app down + auto-launch opt-out → inherited CLI_NON_ZERO_EXIT/obsidian-not-running propagates unchanged (US4/FR-012)", async () => {
  const { spawnFn, getCount } = makeQueuedSpawn([
    {
      stdout: "",
      stderr: "The CLI is unable to find Obsidian. Please make sure Obsidian is running.",
      exitCode: 1,
    },
  ]);
  const err = (await captureRejection(
    executeGetActiveFile(
      { target_mode: "specific", vault: "Work" },
      deps(spawnFn, fakeRegistry(), { OBSIDIAN_AUTO_LAUNCH: "0" }),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
  expect(err.details.reason).toBe("obsidian-not-running");
  // No per-tool retry — recovery is dispatch-layer only.
  expect(getCount()).toBe(1);
});

// =====================================================================
// Malformed eval (cohort default for reads) — never a fabricated success
// =====================================================================

test("malformed eval (non-JSON) → CLI_REPORTED_ERROR + details.stage:'json-parse'", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "=> not-valid-json{\n", exitCode: 0 }]);
  const err = (await captureRejection(
    executeGetActiveFile({ target_mode: "active" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("json-parse");
});

test("wrong-shape eval (active missing fields) → CLI_REPORTED_ERROR + details.stage:'envelope-parse'", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"active":{"path":"a.md"}}\n', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeGetActiveFile({ target_mode: "active" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("envelope-parse");
});

test("CLI_BINARY_NOT_FOUND (ENOENT) propagates unchanged, never a fabricated success", async () => {
  const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
  enoent.code = "ENOENT";
  const { spawnFn } = makeQueuedSpawn([{ errorOnSpawn: enoent }]);
  const err = (await captureRejection(
    executeGetActiveFile({ target_mode: "active" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
});
