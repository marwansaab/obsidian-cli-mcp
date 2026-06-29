// Original — no upstream.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

import { afterEach, beforeEach, expect, test } from "vitest";

import { executeViewsBase, type ExecuteDeps } from "./handler.js";
import {
  __resetInFlightRegistryForTests,
  type SpawnLike,
} from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

interface StubResponse {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
}

// Records the argv of every spawn so tests can assert the command SEQUENCE
// (focus eval → base:views) and prove read-only / no-silent-substitution.
function makeSpawn(responses: StubResponse[]): {
  spawnFn: SpawnLike;
  calls: string[][];
} {
  const calls: string[][] = [];
  let idx = 0;
  const spawnFn: SpawnLike = (_binary, argv, _options: SpawnOptions) => {
    calls.push([...(argv as string[])]);
    const spec = responses[idx++] ?? {};
    const child = new EventEmitter() as EventEmitter & {
      stdout: Readable;
      stderr: Readable;
      kill: (signal?: NodeJS.Signals) => boolean;
      pid?: number;
    };
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.pid = 7777;
    child.kill = () => true;
    setImmediate(() => {
      if (spec.stdout) child.stdout.push(Buffer.from(spec.stdout, "utf8"));
      child.stdout.push(null);
      if (spec.stderr) child.stderr.push(Buffer.from(spec.stderr, "utf8"));
      child.stderr.push(null);
      setImmediate(() => {
        child.emit("exit", spec.exitCode ?? 0, spec.signal ?? null);
      });
    });
    return child as unknown as ReturnType<SpawnLike>;
  };
  return { spawnFn, calls };
}

// Stub registry: known vault names resolve to a fake path; unknown throws the
// registry's VALIDATION_ERROR (which resolveVaultRootOrRemap remaps to
// VAULT_NOT_FOUND/unknown), exactly the production shape.
function makeVaultRegistry(known: Record<string, string> = { Work: "C:/vaults/Work" }): VaultRegistry {
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
  calls: string[][];
} {
  const { spawnFn, calls } = makeSpawn(responses);
  return {
    deps: {
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: vaultRegistry ?? makeVaultRegistry(),
      spawnFn,
    },
    calls,
  };
}

// The subcommand for a recorded argv: the first element that is not a key=value pair
// (argv order is [vault=…, command, kvs…]).
function commandOf(argv: string[]): string | undefined {
  return argv.find((a) => !a.includes("="));
}
function commandsOf(calls: string[][]): Array<string | undefined> {
  return calls.map(commandOf);
}

function evalOk(openedPath: string): StubResponse {
  return { stdout: `=> ${JSON.stringify({ ok: true, opened: openedPath })}` };
}
const evalMissing: StubResponse = {
  stdout: `=> ${JSON.stringify({ ok: false, code: "FILE_NOT_FOUND" })}`,
};

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// ─────────────────────────── US1 — clean view names ───────────────────────────

test("US1 strip: multi-view output drops the \\t<type> label (mixed types)", async () => {
  const stdout = "All\ttable\nActive\tcards\nCompleted\tlist\n";
  const { deps } = makeDeps([{ stdout }]);

  const result = await executeViewsBase({}, deps);

  expect(result.views).toEqual(["All", "Active", "Completed"]);
  expect(result.count).toBe(3);
});

test("US1 strip: internal spaces, hyphens and punctuation are preserved (SC-003)", async () => {
  const stdout =
    "Obsidian CLI MCP - Backlog\ttable\nActive Tasks\ttable\nDone (archived)\tcards\nNotes: Q1\ttable\n";
  const { deps } = makeDeps([{ stdout }]);

  const result = await executeViewsBase({}, deps);

  // Each returned name equals the name query_base accepts — no label, punctuation intact.
  expect(result.views).toEqual([
    "Obsidian CLI MCP - Backlog",
    "Active Tasks",
    "Done (archived)",
    "Notes: Q1",
  ]);
  expect(result.count).toBe(4);
});

test("US1 strip: a view named exactly like a type token keeps the name, drops only the label", async () => {
  // `table\ttable` → the NAME is "table", the LABEL is the trailing "\ttable".
  // `My table\ttable` → the internal "table" word survives (tab-anchored, not word-anchored).
  const stdout = "table\ttable\nMy table\ttable\n";
  const { deps } = makeDeps([{ stdout }]);

  const result = await executeViewsBase({}, deps);

  expect(result.views).toEqual(["table", "My table"]);
});

test("US1 strip: a line with no \\t<known-type> label is returned verbatim (defensive)", async () => {
  // No tab → no label to strip. An unknown trailing token is also not blind-trimmed.
  const stdout = "JustAName\nWeird Name\tgizmo\n";
  const { deps } = makeDeps([{ stdout }]);

  const result = await executeViewsBase({}, deps);

  expect(result.views).toEqual(["JustAName", "Weird Name\tgizmo"]);
});

test("US1: zero views returns count=0", async () => {
  const { deps } = makeDeps([{ stdout: "" }]);

  const result = await executeViewsBase({}, deps);

  expect(result.views).toEqual([]);
  expect(result.count).toBe(0);
});

// ─────────────────────── US2 — named Base (focus-then-active) ──────────────────

test("US2 named happy: focus eval → active base:views, in that order, names-only output", async () => {
  const { deps, calls } = makeDeps([
    evalOk("Tasks.base"),
    { stdout: "All\ttable\nBy Status\ttable\n" },
  ]);

  const result = await executeViewsBase({ base_path: "Tasks.base" }, deps);

  expect(result).toEqual({ views: ["All", "By Status"], count: 2 });
  // Sequence: focus eval first, then base:views.
  expect(commandsOf(calls)).toEqual(["eval", "base:views"]);
  // Read-only (FR-011): only eval + base:views were ever issued — no mutating command.
  expect(commandsOf(calls).every((c) => c === "eval" || c === "base:views")).toBe(true);
});

test("US2 named + vault: registry resolved, eval routed cross-vault with vault=, then base:views", async () => {
  const { deps, calls } = makeDeps(
    [evalOk("Tasks.base"), { stdout: "All\ttable\n" }],
    makeVaultRegistry({ Other: "C:/vaults/Other" }),
  );

  const result = await executeViewsBase({ base_path: "Tasks.base", vault: "Other" }, deps);

  expect(result).toEqual({ views: ["All"], count: 1 });
  expect(commandsOf(calls)).toEqual(["eval", "base:views"]);
  // The focus eval carried vault= for cross-vault routing (specific mode).
  expect(calls[0]!.some((a) => a === "vault=Other")).toBe(true);
});

test("US2 open-Base regression: no base_path → a single active base:views, no eval", async () => {
  const { deps, calls } = makeDeps([{ stdout: "All\ttable\n" }]);

  const result = await executeViewsBase({}, deps);

  expect(result).toEqual({ views: ["All"], count: 1 });
  expect(commandsOf(calls)).toEqual(["base:views"]);
});

test("US2: vault without base_path is an inherited no-op (open mode), registry not consulted", async () => {
  let consulted = false;
  const registry: VaultRegistry = {
    async resolveVaultPath(name) {
      consulted = true;
      return `C:/vaults/${name}`;
    },
  };
  const { deps, calls } = makeDeps([{ stdout: "All\ttable\n" }], registry);

  const result = await executeViewsBase({ vault: "MyVault" }, deps);

  expect(result).toEqual({ views: ["All"], count: 1 });
  expect(consulted).toBe(false);
  expect(commandsOf(calls)).toEqual(["base:views"]);
});

// ───────────────────────── US3 — distinguishable failures ──────────────────────

test("US3 named-not-found: focus FILE_NOT_FOUND → BASE_NOT_FOUND/named-missing, no base:views", async () => {
  const { deps, calls } = makeDeps([evalMissing]);

  try {
    await executeViewsBase({ base_path: "Nope/Missing.base" }, deps);
    throw new Error("expected rejection");
  } catch (err) {
    expect(err).toBeInstanceOf(UpstreamError);
    const ue = err as UpstreamError;
    expect(ue.code).toBe("CLI_REPORTED_ERROR");
    expect(ue.details.code).toBe("BASE_NOT_FOUND");
    expect(ue.details.reason).toBe("named-missing");
    expect(ue.details.base_path).toBe("Nope/Missing.base");
  }
  // No silent substitution (SC-006): base:views was NEVER reached.
  expect(commandsOf(calls)).toEqual(["eval"]);
});

test("US3 no-base-open: open-mode 'not a base file' → BASE_NOT_FOUND/not-open (dispatch-catch)", async () => {
  const { deps } = makeDeps([
    { stdout: "Error: Active file is not a base file: some/path.md", exitCode: 0 },
  ]);

  try {
    await executeViewsBase({}, deps);
    throw new Error("expected rejection");
  } catch (err) {
    const ue = err as UpstreamError;
    expect(ue.code).toBe("CLI_REPORTED_ERROR");
    expect(ue.details.code).toBe("BASE_NOT_FOUND");
    expect(ue.details.reason).toBe("not-open");
  }
});

test("US3 no-base-open: success-path guard (clean stdout, no Error: prefix), cause null", async () => {
  const { deps } = makeDeps([{ stdout: "Active file is not a base file: notes/x.md", exitCode: 0 }]);

  try {
    await executeViewsBase({}, deps);
    throw new Error("expected rejection");
  } catch (err) {
    const ue = err as UpstreamError;
    expect(ue.details.code).toBe("BASE_NOT_FOUND");
    expect(ue.details.reason).toBe("not-open");
    expect(ue.cause).toBeNull();
  }
});

test("US3 no-base-open: success-path guard via stderr channel", async () => {
  const { deps } = makeDeps([{ stdout: "", stderr: "active file is not a base file", exitCode: 0 }]);

  try {
    await executeViewsBase({}, deps);
    throw new Error("expected rejection");
  } catch (err) {
    const ue = err as UpstreamError;
    expect(ue.details.code).toBe("BASE_NOT_FOUND");
    expect(ue.details.reason).toBe("not-open");
    expect(ue.cause).toBeNull();
  }
});

async function expectErr(p: Promise<unknown>): Promise<UpstreamError> {
  try {
    await p;
    throw new Error("expected rejection");
  } catch (e) {
    expect(e).toBeInstanceOf(UpstreamError);
    return e as UpstreamError;
  }
}

test("US3 distinguishable: named-missing and not-open share BASE_NOT_FOUND but differ by reason (SC-004)", async () => {
  const named = makeDeps([evalMissing]);
  const open = makeDeps([{ stdout: "Error: Active file is not a base file: x.md", exitCode: 0 }]);

  const r1 = await expectErr(executeViewsBase({ base_path: "Missing.base" }, named.deps));
  const r2 = await expectErr(executeViewsBase({}, open.deps));

  expect(r1.details.code).toBe("BASE_NOT_FOUND");
  expect(r2.details.code).toBe("BASE_NOT_FOUND");
  expect(r1.details.reason).toBe("named-missing");
  expect(r2.details.reason).toBe("not-open");
  expect(r1.details.reason).not.toBe(r2.details.reason);
});

test("US3 malformed: post-focus 'not a base file' on a named Base → BASE_MALFORMED", async () => {
  const { deps } = makeDeps([
    evalOk("Broken.base"),
    { stdout: "Error: Active file is not a base file: Broken.base", exitCode: 0 },
  ]);

  try {
    await executeViewsBase({ base_path: "Broken.base" }, deps);
    throw new Error("expected rejection");
  } catch (err) {
    const ue = err as UpstreamError;
    expect(ue.code).toBe("CLI_REPORTED_ERROR");
    expect(ue.details.code).toBe("BASE_MALFORMED");
    expect(ue.details.base_path).toBe("Broken.base");
  }
});

test("US3 bad vault: unknown vault → VAULT_NOT_FOUND/unknown BEFORE any focus/list (no substitution)", async () => {
  const { deps, calls } = makeDeps([], makeVaultRegistry({ Work: "C:/vaults/Work" }));

  try {
    await executeViewsBase({ base_path: "Tasks.base", vault: "NoSuchVault" }, deps);
    throw new Error("expected rejection");
  } catch (err) {
    const ue = err as UpstreamError;
    expect(ue.code).toBe("CLI_REPORTED_ERROR");
    expect(ue.details.code).toBe("VAULT_NOT_FOUND");
    expect(ue.details.reason).toBe("unknown");
    expect(ue.details.vault).toBe("NoSuchVault");
  }
  // Failed before spawning anything — the open Base was never read.
  expect(calls.length).toBe(0);
});

test("US3 upstream CLI failure surfaces as UpstreamError (open mode)", async () => {
  const { deps } = makeDeps([{ stdout: "", exitCode: 1, stderr: "Error: something failed" }]);

  await expect(executeViewsBase({}, deps)).rejects.toThrow(UpstreamError);
});
