// Original — no upstream.
import { resolve, sep } from "node:path";

import { afterEach, beforeEach, expect, test } from "vitest";

import { executeCreateBase, type ExecuteDeps } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { linkRealpath } from "../../path-safety/_realpath-fixtures.js";
import { createQueue } from "../../queue.js";
import {
  captureLogger,
  folderMissingDetails,
  makeQueuedSpawn,
  missingFolderRealpath,
  silentLogger,
  type SpawnRecording,
  type StubResponse,
} from "../_handler-test-fixtures.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

const WORK_ROOT = resolve("/vaults/Work");

// Stub registry: known vault names resolve to a fake path; unknown throws the
// registry's VALIDATION_ERROR (which resolveVaultRootOrRemap remaps to
// VAULT_NOT_FOUND/unknown), exactly the production shape.
function makeVaultRegistry(known: Record<string, string> = { Work: WORK_ROOT }): VaultRegistry {
  return {
    async resolveVaultPath(name: string): Promise<string> {
      const p = known[name];
      if (p === undefined) {
        throw new UpstreamError({
          code: "VALIDATION_ERROR",
          cause: null,
          details: { requestedVault: name, knownVaults: Object.keys(known) },
          message: `Vault "${name}" is not registered with Obsidian.`,
        });
      }
      return p;
    },
  };
}

function makeDeps(responses: StubResponse[], vaultRegistry?: VaultRegistry): {
  deps: ExecuteDeps;
  recorded: SpawnRecording[];
} {
  const { spawnFn, recorded } = makeQueuedSpawn(responses);
  return {
    deps: {
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: vaultRegistry ?? makeVaultRegistry(),
      spawnFn,
    },
    recorded,
  };
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// BI-0180: the response reports the path Obsidian created. `path` is the `Created:` value (backslashes
// as forward slashes), never composed from the base's own location; `name` is its last segment.
test.each([
  {
    title: "root item from a base in a folder",
    created: "New item.md",
    base_path: "220-Planning/Backlog (Base).base",
    name: "New item",
    expected: { path: "New item.md", name: "New item.md" },
  },
  {
    title: "root-level base, root new-note location",
    created: "Test.md",
    base_path: "Tasks.base",
    name: "Test",
    expected: { path: "Test.md", name: "Test.md" },
  },
  {
    title: "name collision auto-increment (R-005)",
    created: "New item 1.md",
    base_path: "220-Planning/Backlog (Base).base",
    name: "New item",
    expected: { path: "New item 1.md", name: "New item 1.md" },
  },
  {
    title: "folder-filtered base → the filter folder's item",
    created: "Fixtures/X/Items/New Item.md",
    base_path: "Fixtures/X/Filtered.base",
    name: "New Item",
    expected: { path: "Fixtures/X/Items/New Item.md", name: "New Item.md" },
  },
  {
    title: "base with no folder rule, root new-note location",
    created: "Task1.md",
    base_path: "Fixtures/BI-0083/target.base",
    name: "Task1",
    expected: { path: "Task1.md", name: "Task1.md" },
  },
  {
    title: "folder part in name → path keeps it, name is the last segment",
    created: "Items/sub/Item.md",
    base_path: "Tasks.base",
    name: "sub/Item",
    expected: { path: "Items/sub/Item.md", name: "Item.md" },
  },
  {
    title: "collision in a folder → name carries the suffix",
    created: "Items/Task 1.md",
    base_path: "Tasks.base",
    name: "Task",
    expected: { path: "Items/Task 1.md", name: "Task 1.md" },
  },
  {
    title: "backslash-separated Created: path, CRLF → forward slashes",
    created: "Items\\sub\\Item.md\r",
    base_path: "Tasks.base",
    name: "sub/Item",
    expected: { path: "Items/sub/Item.md", name: "Item.md" },
  },
])("happy: $title", async ({ created, base_path, name, expected }) => {
  const { deps } = makeDeps([{ stdout: `Created: ${created}\n` }]);

  const result = await executeCreateBase({ base_path, name }, deps);

  expect(result).toEqual(expected);
});

test("content parameter passthrough", async () => {
  const { deps, recorded } = makeDeps([{ stdout: "Created: Test.md\n" }]);

  await executeCreateBase(
    { base_path: "Tasks.base", name: "Test", content: "Body text" },
    deps,
  );

  const argv = recorded[0]!.argv;
  expect(argv.some((a) => a.includes("content="))).toBe(true);
});

test("view_name parameter passthrough (CLI parameter stays view=)", async () => {
  const { deps, recorded } = makeDeps([{ stdout: "Created: Test.md\n" }]);

  await executeCreateBase(
    { base_path: "Tasks.base", name: "Test", view_name: "All" },
    deps,
  );

  const argv = recorded[0]!.argv;
  expect(argv.some((a) => a.includes("view="))).toBe(true);
});

test("BASE_NOT_FOUND error classification (dispatch-layer catch)", async () => {
  const { deps } = makeDeps([{
    stdout: "Error: Base file not found: nonexistent.base",
    exitCode: 0,
  }]);

  try {
    await executeCreateBase(
      { base_path: "nonexistent.base", name: "x" },
      deps,
    );
    throw new Error("expected rejection");
  } catch (err) {
    expect(err).toBeInstanceOf(UpstreamError);
    const ue = err as UpstreamError;
    expect(ue.code).toBe("CLI_REPORTED_ERROR");
    expect(ue.details.code).toBe("BASE_NOT_FOUND");
  }
});

test("BASE_NOT_FOUND on success envelope (post-success path, cause null)", async () => {
  const { deps } = makeDeps([{
    stdout: "Base file not found: x.base\n",
    exitCode: 0,
  }]);

  try {
    await executeCreateBase(
      { base_path: "x.base", name: "x" },
      deps,
    );
    throw new Error("expected rejection");
  } catch (err) {
    expect(err).toBeInstanceOf(UpstreamError);
    const ue = err as UpstreamError;
    expect(ue.code).toBe("CLI_REPORTED_ERROR");
    expect(ue.details.code).toBe("BASE_NOT_FOUND");
    expect(ue.details.path).toBe("x.base");
    expect(ue.cause).toBeNull();
  }
});

test("upstream CLI failure surfaces as UpstreamError", async () => {
  const { deps } = makeDeps([{ stdout: "", exitCode: 1, stderr: "Error: something failed" }]);

  await expect(
    executeCreateBase({ base_path: "Tasks.base", name: "x" }, deps),
  ).rejects.toThrow(UpstreamError);
});

// ───────────────────── spec 083 — default path pinned (US4) ─────────────────────

// The subcommand for a recorded argv: the first element that is not a key=value pair.
function commandOf(argv: string[]): string | undefined {
  return argv.find((a) => !a.includes("="));
}

const throwingRealpath = async (): Promise<string> => {
  throw new Error("realpath must not run when no vault is named");
};

test("083 C1: no vault → one base:create, no eval, no vault=, no containment check; result as today", async () => {
  const { deps, recorded } = makeDeps([{ stdout: "Created: Test.md\n" }]);
  deps.fs = { realpath: throwingRealpath };

  const result = await executeCreateBase({ base_path: "Tasks.base", name: "Test" }, deps);

  expect(result).toEqual({ path: "Test.md", name: "Test.md" });
  expect(recorded.map((r) => commandOf(r.argv))).toEqual(["base:create"]);
  expect(recorded[0]!.argv.some((a) => a.startsWith("vault="))).toBe(false);
});

test("083 C1: no vault, base not found → details and message unchanged", async () => {
  const { deps } = makeDeps([{ stdout: "Error: Base file not found: Missing.base", exitCode: 0 }]);
  deps.fs = { realpath: throwingRealpath };

  const err = (await executeCreateBase({ base_path: "Missing.base", name: "x" }, deps).catch((e: unknown) => e)) as UpstreamError;

  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toEqual({ code: "BASE_NOT_FOUND", path: "Missing.base" });
  expect(err.message).toBe("create_base: base file not found: Missing.base");
});

// ──────────────────── spec 083 — named vault (US2 / US5) ────────────────────

function envelope(value: unknown): StubResponse {
  return { stdout: `=> ${JSON.stringify(value)}` };
}

const identityRealpath = async (p: string): Promise<string> => p;

async function rejectionOf(p: Promise<unknown>): Promise<UpstreamError> {
  const err = await p.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(UpstreamError);
  return err as UpstreamError;
}

test("083 C2: named vault → item-folder eval then base:create, both with vault=Work; result is the Created: path", async () => {
  const { deps, recorded } = makeDeps([envelope({ ok: true, folder: "Tasks" }), { stdout: "Created: Tasks/New.md\n" }]);
  const resolved: string[] = [];
  deps.fs = { realpath: async (p) => (resolved.push(p), p) };

  const result = await executeCreateBase({ base_path: "Tasks.base", name: "New", vault: "Work" }, deps);

  // BI-0180: the reported path is the path the post-creation backstop checked.
  expect(result).toEqual({ path: "Tasks/New.md", name: "New.md" });
  expect(resolved).toContain(resolve(WORK_ROOT, result.path));
  expect(recorded.map((r) => commandOf(r.argv))).toEqual(["eval", "base:create"]);
  expect(recorded.every((r) => r.argv.includes("vault=Work"))).toBe(true);
});

test("083 C3: unregistered vault → VAULT_NOT_FOUND/unknown, nothing spawned", async () => {
  const { deps, recorded } = makeDeps([]);
  deps.fs = { realpath: identityRealpath };

  const err = await rejectionOf(executeCreateBase({ base_path: "Tasks.base", name: "x", vault: "Nope" }, deps));

  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toEqual({ code: "VAULT_NOT_FOUND", reason: "unknown", vault: "Nope" });
  expect(recorded.length).toBe(0);
});

test("BI-0185: registered vault whose folder is missing → VAULT_NOT_FOUND/folder-missing, nothing spawned", async () => {
  const { deps, recorded } = makeDeps([]);
  deps.fs = { realpath: missingFolderRealpath(WORK_ROOT) };

  const err = await rejectionOf(executeCreateBase({ base_path: "Tasks.base", name: "x", vault: "Work" }, deps));

  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toEqual(folderMissingDetails("Work"));
  expect(err.message).not.toContain(WORK_ROOT);
  expect(recorded.length).toBe(0);
});

test("083 C4: base_path through a link out of the vault → PATH_ESCAPES_VAULT + log, nothing spawned", async () => {
  const events: Array<Record<string, unknown>> = [];
  const { deps, recorded } = makeDeps([]);
  deps.logger = captureLogger(events);
  deps.fs = { realpath: linkRealpath({ [resolve("/vaults/Work/out")]: resolve("/elsewhere") }) };

  const err = await rejectionOf(executeCreateBase({ base_path: "out/T.base", name: "x", vault: "Work" }, deps));

  expect(err.code).toBe("PATH_ESCAPES_VAULT");
  expect(err.details).toEqual({ vault: "Work", attemptedPath: "out/T.base", resolvedPath: resolve("/elsewhere/T.base") });
  expect(recorded.length).toBe(0);
  expect(events.filter((e) => e.event === "pathEscapeAttempt")).toHaveLength(1);
});

test("083 C5: item-folder eval finds no base → BASE_NOT_FOUND with details.vault; base:create never spawned", async () => {
  const { deps, recorded } = makeDeps([envelope({ ok: false, code: "BASE_NOT_FOUND" })]);
  deps.fs = { realpath: identityRealpath };

  const err = await rejectionOf(executeCreateBase({ base_path: "Missing.base", name: "x", vault: "Work" }, deps));

  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toEqual({ code: "BASE_NOT_FOUND", path: "Missing.base", vault: "Work" });
  expect(err.message).toBe('create_base: base file not found in vault "Work": Missing.base');
  expect(recorded.map((r) => commandOf(r.argv))).toEqual(["eval"]);
});

test("083 C6: derived item folder links outside → PATH_ESCAPES_VAULT naming the folder; nothing created", async () => {
  const { deps, recorded } = makeDeps([envelope({ ok: true, folder: "Items" })]);
  deps.fs = { realpath: linkRealpath({ [resolve("/vaults/Work/Items")]: resolve("/elsewhere") }) };

  const err = await rejectionOf(executeCreateBase({ base_path: "Tasks.base", name: "x", vault: "Work" }, deps));

  expect(err.code).toBe("PATH_ESCAPES_VAULT");
  expect(err.details.attemptedPath).toBe("Items");
  expect(err.details.vault).toBe("Work");
  expect(recorded.length).toBe(1);
});

test("083 C7: folder segments of name are joined into the checked folder", async () => {
  const seen: string[] = [];
  const { deps, recorded } = makeDeps([envelope({ ok: true, folder: "" }), { stdout: "Created: sub/Item.md\n" }]);
  deps.fs = {
    realpath: async (p) => {
      seen.push(p);
      return p;
    },
  };

  await executeCreateBase({ base_path: "Tasks.base", name: "sub/Item", vault: "Work" }, deps);

  expect(seen).toContain(resolve("/vaults/Work/sub"));
  expect(recorded.length).toBe(2);
});

test("083 C8: base:create reports the base missing → BASE_NOT_FOUND with details.vault", async () => {
  const { deps } = makeDeps([
    envelope({ ok: true, folder: "Tasks" }),
    { stdout: "Error: Base file not found: T.base", exitCode: 0 },
  ]);
  deps.fs = { realpath: identityRealpath };

  const err = await rejectionOf(executeCreateBase({ base_path: "T.base", name: "x", vault: "Work" }, deps));

  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toEqual({ code: "BASE_NOT_FOUND", path: "T.base", vault: "Work" });
  expect(err.message).toBe('create_base: base file not found in vault "Work": T.base');
});

test("083 C9: created path resolves outside → PATH_ESCAPES_VAULT with createdPath; the item is not deleted", async () => {
  const { deps, recorded } = makeDeps([envelope({ ok: true, folder: "Tasks" }), { stdout: "Created: Esc/New.md\n" }]);
  deps.fs = { realpath: linkRealpath({ [resolve("/vaults/Work/Esc")]: resolve("/elsewhere") }) };

  const err = await rejectionOf(executeCreateBase({ base_path: "Tasks.base", name: "New", vault: "Work" }, deps));

  expect(err.code).toBe("PATH_ESCAPES_VAULT");
  expect(err.details).toEqual({
    vault: "Work",
    attemptedPath: "Esc/New.md",
    resolvedPath: resolve("/elsewhere/New.md"),
    createdPath: "Esc/New.md",
  });
  expect(err.message).toBe(
    'create_base: the item was created at "Esc/New.md", which resolves outside vault "Work"; it was not deleted',
  );
  // Exactly the eval and base:create: no further spawn (no delete).
  expect(recorded.map((r) => commandOf(r.argv))).toEqual(["eval", "base:create"]);
});

test.each([
  ["json-parse", "=> not-json"],
  ["envelope-parse", '=> {"ok":true}'],
])("083 C10: malformed item-folder eval answer → CLI_REPORTED_ERROR stage %s", async (stage, stdout) => {
  const { deps, recorded } = makeDeps([{ stdout }]);
  deps.fs = { realpath: identityRealpath };

  const err = await rejectionOf(executeCreateBase({ base_path: "Tasks.base", name: "x", vault: "Work" }, deps));

  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe(stage);
  expect(recorded.length).toBe(1);
});

test("083 C12: base_path whose folders do not exist yet → containment walks to the nearest ancestor and proceeds", async () => {
  const newRoot = resolve("/vaults/Work/New");
  const { deps, recorded } = makeDeps([envelope({ ok: true, folder: "Tasks" }), { stdout: "Created: Tasks/x.md\n" }]);
  deps.fs = {
    realpath: async (p) => {
      if (p === newRoot || p.startsWith(newRoot + sep)) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return p;
    },
  };

  await executeCreateBase({ base_path: "New/Deep/T.base", name: "x", vault: "Work" }, deps);

  expect(recorded.map((r) => commandOf(r.argv))).toEqual(["eval", "base:create"]);
});

test("unparseable response throws UpstreamError", async () => {
  const { deps } = makeDeps([{ stdout: "Unexpected output\n" }]);

  try {
    await executeCreateBase({ base_path: "Tasks.base", name: "x" }, deps);
    throw new Error("expected rejection");
  } catch (err) {
    expect(err).toBeInstanceOf(UpstreamError);
    const ue = err as UpstreamError;
    expect(ue.code).toBe("CLI_REPORTED_ERROR");
    expect(ue.details.stage).toBe("response-parse");
  }
});

test("spec 073 F9: base_path / view_name reach the CLI as the unchanged path= / view= parameters", async () => {
  const { deps, recorded } = makeDeps([{ stdout: "Created: Test.md\n" }]);

  await executeCreateBase({ base_path: "Projects/Tasks.base", name: "Test", view_name: "All" }, deps);

  const argv = recorded[0]!.argv;
  expect(argv).toContain("path=Projects/Tasks.base");
  expect(argv).toContain("view=All");
  expect(argv.some((a) => a.startsWith("base_path=") || a.startsWith("view_name="))).toBe(false);
});

test("spec 073 contract §4: BASE_NOT_FOUND details keep the path key", async () => {
  const { deps } = makeDeps([{ stdout: "Base file not found: x.base\n", exitCode: 0 }]);

  const err = (await executeCreateBase({ base_path: "x.base", name: "x" }, deps).catch((e: unknown) => e)) as UpstreamError;
  expect(err.details).toEqual({ code: "BASE_NOT_FOUND", path: "x.base" });
});
