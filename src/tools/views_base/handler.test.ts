// Original — no upstream.
import { afterEach, beforeEach, expect, test } from "vitest";

import { executeViewsBase, type ExecuteDeps } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import {
  EVAL_NONCE_SEAM,
  evalAnswerLine,
  lookalike,
  makeQueuedSpawn,
  NO_ANSWER,
  NOISE_AFTER,
  NOISE_BEFORE,
  silentLogger,
  TEST_EVAL_TAG,
  type SpawnRecording,
  type StubResponse,
} from "../_handler-test-fixtures.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

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
  recorded: SpawnRecording[];
} {
  const { spawnFn, recorded } = makeQueuedSpawn(responses);
  return {
    deps: {
      logger: silentLogger(),
      queue: createQueue(), ...EVAL_NONCE_SEAM,
      vaultRegistry: vaultRegistry ?? makeVaultRegistry(),
      spawnFn,
    },
    recorded,
  };
}

// The subcommand for a recorded argv: the first element that is not a key=value pair
// (argv order is [vault=…, command, kvs…]).
function commandOf(argv: string[]): string | undefined {
  return argv.find((a) => !a.includes("="));
}
function commandsOf(recorded: SpawnRecording[]): Array<string | undefined> {
  return recorded.map((r) => commandOf(r.argv));
}

function evalOk(openedPath: string): StubResponse {
  return { stdout: `=> ${TEST_EVAL_TAG}${JSON.stringify({ ok: true, opened: openedPath })}` };
}
const evalMissing: StubResponse = {
  stdout: `=> ${TEST_EVAL_TAG}${JSON.stringify({ ok: false, code: "FILE_NOT_FOUND" })}`,
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
  const { deps, recorded } = makeDeps([
    evalOk("Tasks.base"),
    { stdout: "All\ttable\nBy Status\ttable\n" },
  ]);

  const result = await executeViewsBase({ base_path: "Tasks.base" }, deps);

  expect(result).toEqual({ views: ["All", "By Status"], count: 2 });
  // Sequence: focus eval first, then base:views.
  expect(commandsOf(recorded)).toEqual(["eval", "base:views"]);
  // Read-only (FR-011): only eval + base:views were ever issued — no mutating command.
  expect(commandsOf(recorded).every((c) => c === "eval" || c === "base:views")).toBe(true);
});

test("US2 named + vault: registry resolved, eval routed cross-vault with vault=, then base:views", async () => {
  const { deps, recorded } = makeDeps(
    [evalOk("Tasks.base"), { stdout: "All\ttable\n" }],
    makeVaultRegistry({ Other: "C:/vaults/Other" }),
  );

  const result = await executeViewsBase({ base_path: "Tasks.base", vault: "Other" }, deps);

  expect(result).toEqual({ views: ["All"], count: 1 });
  expect(commandsOf(recorded)).toEqual(["eval", "base:views"]);
  // The focus eval carried vault= for cross-vault routing (specific mode).
  expect(recorded[0]!.argv.some((a) => a === "vault=Other")).toBe(true);
});

test("US2 open-Base regression: no base_path → a single active base:views, no eval", async () => {
  const { deps, recorded } = makeDeps([{ stdout: "All\ttable\n" }]);

  const result = await executeViewsBase({}, deps);

  expect(result).toEqual({ views: ["All"], count: 1 });
  expect(commandsOf(recorded)).toEqual(["base:views"]);
});

test("US2: vault without base_path is an inherited no-op (open mode), registry not consulted", async () => {
  let consulted = false;
  const registry: VaultRegistry = {
    async resolveVaultPath(name) {
      consulted = true;
      return `C:/vaults/${name}`;
    },
  };
  const { deps, recorded } = makeDeps([{ stdout: "All\ttable\n" }], registry);

  const result = await executeViewsBase({ vault: "MyVault" }, deps);

  expect(result).toEqual({ views: ["All"], count: 1 });
  expect(consulted).toBe(false);
  expect(commandsOf(recorded)).toEqual(["base:views"]);
});

// ───────────────────────── US3 — distinguishable failures ──────────────────────

test("US3 named-not-found: focus FILE_NOT_FOUND → BASE_NOT_FOUND/named-missing, no base:views", async () => {
  const { deps, recorded } = makeDeps([evalMissing]);

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
  expect(commandsOf(recorded)).toEqual(["eval"]);
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
  const { deps, recorded } = makeDeps([], makeVaultRegistry({ Work: "C:/vaults/Work" }));

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
  expect(recorded.length).toBe(0);
});

test("US3 upstream CLI failure surfaces as UpstreamError (open mode)", async () => {
  const { deps } = makeDeps([{ stdout: "", exitCode: 1, stderr: "Error: something failed" }]);

  await expect(executeViewsBase({}, deps)).rejects.toThrow(UpstreamError);
});

// ───────────── Spec 080 — plugin output around the focus eval's tagged answer ─────────────

const FOCUS_OK = JSON.stringify({ ok: true, opened: "Tasks.base" });
const FOCUS_FAKE = JSON.stringify({ ok: true, opened: "Other.base" });
const VIEWS_OUT: StubResponse = { stdout: "All\ttable\nBy Status\ttable\n" };

test("spec 080 US1 (T019): plugin lines before the focus answer → normal views", async () => {
  const { deps, recorded } = makeDeps([{ stdout: `${NOISE_BEFORE}${evalAnswerLine(FOCUS_OK)}\n` }, VIEWS_OUT]);
  const result = await executeViewsBase({ base_path: "Tasks.base" }, deps);
  expect(result).toEqual({ views: ["All", "By Status"], count: 2 });
  expect(commandsOf(recorded)).toEqual(["eval", "base:views"]);
});

test("spec 080 US3 (T036): look-alikes before and after the focus answer never win", async () => {
  const fake = lookalike(FOCUS_FAKE);
  const { deps } = makeDeps([{ stdout: `${fake}\n${evalAnswerLine(FOCUS_OK)}\n${fake}\n` }, VIEWS_OUT]);
  const result = await executeViewsBase({ base_path: "Tasks.base" }, deps);
  expect(result).toEqual({ views: ["All", "By Status"], count: 2 });
});

test("spec 080 US3 (T036): a look-alike alone → INTERNAL_ERROR json-parse with the raw output; base:views never runs", async () => {
  const stdout = `${NO_ANSWER}${lookalike(FOCUS_FAKE)}\n`;
  const { deps, recorded } = makeDeps([{ stdout }]);
  const ue = await expectErr(executeViewsBase({ base_path: "Tasks.base" }, deps));
  expect(ue.code).toBe("INTERNAL_ERROR");
  expect(ue.details).toEqual({ stage: "json-parse", stdout });
  expect(commandsOf(recorded)).toEqual(["eval"]);
});

test("spec 080 US4 (T040): plugin output after the focus answer → normal views", async () => {
  const { deps } = makeDeps([{ stdout: `${evalAnswerLine(FOCUS_OK)}${NOISE_AFTER}\n` }, VIEWS_OUT]);
  const result = await executeViewsBase({ base_path: "Tasks.base" }, deps);
  expect(result).toEqual({ views: ["All", "By Status"], count: 2 });
});
