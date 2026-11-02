// Original — no upstream. move missing-destination and vault-relative failure tests (spec 090): an ENOENT rename becomes CLI_REPORTED_ERROR + details.code FOLDER_NOT_FOUND with the vault-relative folder, and every other move failure has the vault's absolute folder rewritten out (rows M1–M20 of contracts/missing-destination-contract.md).
import { afterEach, beforeEach, expect, test } from "vitest";

import { executeMove } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import {
  captureRejection,
  fileTsvResponse,
  focusedFileResponse,
  makeQueuedSpawn,
  makeStubSpawn,
  silentLogger,
  stubVaultRegistry,
  type StubResponse,
} from "../_handler-test-fixtures.js";

import type { SpawnLike } from "../../cli-adapter/_dispatch.js";
import type { VaultRegistry } from "../../vault-registry/registry.js";

const WIN_ROOT = "C:\\Vaults\\Work";
const POSIX_ROOT = "/home/u/Vault";

/** The CLI's missing-folder answer (research F1): Node's ENOENT rename line naming both absolute paths. */
function enoent(root: string, sep: string, src: string, dest: string): StubResponse {
  return {
    stdout: `Error: ENOENT: no such file or directory, rename '${root}${sep}${src}' -> '${root}${sep}${dest}'\n`,
    exitCode: 0,
  };
}

const EPERM: StubResponse = {
  stdout: `Error: EPERM: operation not permitted, rename '${WIN_ROOT}\\Inbox\\Note.md' -> '${WIN_ROOT}\\Archive\\Note.md'\n`,
  exitCode: 0,
};

/** A registry knowing vault "Work" at `root` (or failing with `failure`), recording each `resolveVaultPath` call. */
function recordingRegistry(
  root: string,
  failure?: unknown,
): { registry: VaultRegistry; calls: string[] } {
  const calls: string[] = [];
  const stub = stubVaultRegistry("Work", root);
  const registry: VaultRegistry = {
    ...stub,
    resolveVaultPath: async (name) => {
      calls.push(name);
      if (failure !== undefined) throw failure;
      return stub.resolveVaultPath(name);
    },
  };
  return { registry, calls };
}

function deps(spawnFn: SpawnLike, registry: VaultRegistry) {
  return {
    logger: silentLogger(),
    queue: createQueue(),
    spawnFn,
    env: {},
    vaultRegistry: registry,
  };
}

function folderNotFound(folder: string) {
  return {
    code: "CLI_REPORTED_ERROR",
    message: `move: the destination folder "${folder}" does not exist in the vault. Nothing was moved. Create the folder (writing a note into it with write_note creates it), then retry the move.`,
    details: { code: "FOLDER_NOT_FOUND", folder },
  };
}

function shape(err: UpstreamError) {
  return { code: err.code, message: err.message, details: err.details };
}

const M1_INPUT = {
  target_mode: "specific",
  vault: "Work",
  path: "Inbox/Note.md",
  to: "Archive/2026/",
} as const;

async function runM1() {
  const { spawnFn, recorded } = makeQueuedSpawn([
    enoent(WIN_ROOT, "\\", "Inbox\\Note.md", "Archive\\2026\\Note.md"),
  ]);
  const { registry, calls } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(M1_INPUT, deps(spawnFn, registry)),
  )) as UpstreamError;
  return { err, recorded, calls };
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// =========================================================================
// US1 — FOLDER_NOT_FOUND (M1–M7, M19)
// =========================================================================

test("M1: folder-form `to` into a missing folder → FOLDER_NOT_FOUND with the vault-relative folder; 1 spawn, no lookup", async () => {
  const { err, recorded, calls } = await runM1();
  expect(err).toBeInstanceOf(UpstreamError);
  expect(shape(err)).toEqual(folderNotFound("Archive/2026"));
  expect(err.cause).toBeNull();
  expect(recorded).toHaveLength(1);
  expect(calls).toHaveLength(0);
});

test("M2: full-path `to` into a missing folder → FOLDER_NOT_FOUND names the folder, not the file", async () => {
  const { spawnFn } = makeQueuedSpawn([
    enoent(WIN_ROOT, "\\", "Inbox\\Note.md", "Archive\\2026\\Old.md"),
  ]);
  const { registry } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", path: "Inbox/Note.md", to: "Archive/2026/Old.md" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(shape(err)).toEqual(folderNotFound("Archive/2026"));
});

test("M3: nested missing folder → the whole nested folder path", async () => {
  const { spawnFn } = makeQueuedSpawn([
    enoent(WIN_ROOT, "\\", "Inbox\\Note.md", "A\\B\\C\\Note.md"),
  ]);
  const { registry } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", path: "Inbox/Note.md", to: "A/B/C/" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(shape(err)).toEqual(folderNotFound("A/B/C"));
});

test("M4: a canvas moved to an extensionless `to` → FOLDER_NOT_FOUND for its folder; the forwarded to= is unchanged", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    enoent(WIN_ROOT, "\\", "Boards\\Plan.canvas", "Archive\\Roadmap.canvas"),
  ]);
  const { registry } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", path: "Boards/Plan.canvas", to: "Archive/Roadmap" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(shape(err)).toEqual(folderNotFound("Archive"));
  expect(recorded[0]!.argv).toContain("to=Archive/Roadmap.canvas");
});

test("M5: `file` locator → FOLDER_NOT_FOUND after the name resolution; the forwarded to=Archive/ is unchanged", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    fileTsvResponse("Inbox/Note.md"),
    enoent(WIN_ROOT, "\\", "Inbox\\Note.md", "Archive\\Note.md"),
  ]);
  const { registry } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", file: "Note", to: "Archive/" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(shape(err)).toEqual(folderNotFound("Archive"));
  expect(recorded).toHaveLength(2);
  expect(recorded[1]!.argv).toContain("to=Archive/");
});

test("M6: active mode → FOLDER_NOT_FOUND, no registry lookup", async () => {
  const { spawnFn } = makeQueuedSpawn([
    focusedFileResponse("Inbox/Note.md", WIN_ROOT),
    enoent(WIN_ROOT, "\\", "Inbox\\Note.md", "Archive\\Note.md"),
  ]);
  const { registry, calls } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove({ target_mode: "active", to: "Archive/" }, deps(spawnFn, registry)),
  )) as UpstreamError;
  expect(shape(err)).toEqual(folderNotFound("Archive"));
  expect(calls).toHaveLength(0);
});

test("M7: the POSIX form of the ENOENT line → FOLDER_NOT_FOUND", async () => {
  const { spawnFn } = makeQueuedSpawn([
    enoent(POSIX_ROOT, "/", "Inbox/Note.md", "Archive/Note.md"),
  ]);
  const { registry } = recordingRegistry(POSIX_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", path: "Inbox/Note.md", to: "Archive/" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(shape(err)).toEqual(folderNotFound("Archive"));
});

test("M19: a backslash full-path `to` → FOLDER_NOT_FOUND with forward slashes; to= forwarded as given; no lookup", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    enoent(WIN_ROOT, "\\", "Inbox\\Note.md", "Archive\\2026\\Old.md"),
  ]);
  const { registry, calls } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(
      {
        target_mode: "specific",
        vault: "Work",
        path: "Inbox/Note.md",
        to: "Archive\\2026\\Old.md",
      },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(shape(err)).toEqual(folderNotFound("Archive/2026"));
  expect(recorded[0]!.argv).toContain("to=Archive\\2026\\Old.md");
  expect(calls).toHaveLength(0);
});

// =========================================================================
// US2 — no absolute disk paths (M8–M12, M18, M20)
// =========================================================================

test("M8: the FOLDER_NOT_FOUND payload carries no part of the vault's absolute folder", async () => {
  const { err } = await runM1();
  const json = JSON.stringify(shape(err));
  expect(json).not.toMatch(/vaults/i);
  expect(json).not.toMatch(/c:/i);
});

test('M9: ENOENT into the vault root (folder "") is not FOLDER_NOT_FOUND; the root is rewritten out; 1 lookup', async () => {
  const { spawnFn } = makeQueuedSpawn([enoent(WIN_ROOT, "\\", "Inbox\\Note.md", "Renamed.md")]);
  const { registry, calls } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", path: "Inbox/Note.md", to: "Renamed.md" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  const line = "Error: ENOENT: no such file or directory, rename 'Inbox\\Note.md' -> 'Renamed.md'";
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.code).toBeUndefined();
  expect(err.details.message).toBe(line);
  expect(err.details.stdout).toBe(`${line}\n`);
  expect(calls).toEqual(["Work"]);
});

test("M10: an EPERM rename keeps its code and wording with the vault root removed; argv unchanged", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([EPERM]);
  const { registry } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", path: "Inbox/Note.md", to: "Archive/" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  const line =
    "Error: EPERM: operation not permitted, rename 'Inbox\\Note.md' -> 'Archive\\Note.md'";
  const argv = ["vault=Work", "move", "path=Inbox/Note.md", "to=Archive/Note.md"];
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.code).toBeUndefined();
  expect(err.details.message).toBe(line);
  expect(err.details.stdout).toContain(line);
  expect(recorded[0]!.argv).toEqual(argv);
  expect(err.details.argv).toEqual([recorded[0]!.binary, ...argv]);
  expect(JSON.stringify(shape(err))).not.toMatch(/vaults/i);
});

test("M11: every spelling of the root is rewritten (either separator, any case, bare root → .); a sibling folder sharing its prefix is left alone", async () => {
  const stdout =
    "Error: EPERM: operation not permitted, rename 'c:/vaults/WORK/Inbox/Note.md' -> 'C:\\VAULTS\\Work\\Archive\\Note.md' (vault C:\\Vaults\\Work, sibling C:\\Vaults\\Workshop\\x.md)\n";
  const { spawnFn } = makeQueuedSpawn([{ stdout, exitCode: 0 }]);
  const { registry } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", path: "Inbox/Note.md", to: "Archive/" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(err.details.message).toBe(
    "Error: EPERM: operation not permitted, rename 'Inbox/Note.md' -> 'Archive\\Note.md' (vault ., sibling C:\\Vaults\\Workshop\\x.md)",
  );
});

test("M12: active mode, a non-zero exit naming the root → CLI_NON_ZERO_EXIT with stderr rewritten; no registry lookup", async () => {
  const { spawnFn } = makeQueuedSpawn([
    focusedFileResponse("Inbox/Note.md", WIN_ROOT),
    {
      stderr: `EBUSY: resource busy or locked, rename '${WIN_ROOT}\\Inbox\\Note.md'\n`,
      exitCode: 1,
    },
  ]);
  const { registry, calls } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove({ target_mode: "active", to: "Archive/" }, deps(spawnFn, registry)),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
  expect(err.details.stderr).toBe("EBUSY: resource busy or locked, rename 'Inbox\\Note.md'\n");
  expect(err.details.exitCode).toBe(1);
  expect(calls).toHaveLength(0);
});

test("M18: the specific-mode lookup fails (not an unknown vault) → the CLI text is withheld, the move's code kept, the lookup failure as cause", async () => {
  const lookupErr = new UpstreamError({ code: "CLI_TIMEOUT", cause: null, details: {} });
  const { spawnFn } = makeQueuedSpawn([EPERM]);
  const { registry, calls } = recordingRegistry(WIN_ROOT, lookupErr);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", path: "Inbox/Note.md", to: "Archive/" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(shape(err)).toEqual({
    code: "CLI_REPORTED_ERROR",
    message:
      'move: moving "Inbox/Note.md" to "Archive/Note.md" failed with CLI_REPORTED_ERROR, and the vault\'s folder could not be looked up (CLI_TIMEOUT), so the command-line output is withheld to keep absolute paths out of this error. Retry the move.',
    details: { source: "Inbox/Note.md", destination: "Archive/Note.md" },
  });
  expect(err.cause).toBe(lookupErr);
  const json = JSON.stringify(shape(err));
  expect(json).not.toMatch(/Vaults/);
  expect(json).not.toMatch(/EPERM/);
  expect(calls).toEqual(["Work"]);
});

test("M20: an unparseable success naming the root → stage parse with the root rewritten out of stdout and message; 1 lookup", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `Unexpected: ${WIN_ROOT}\\Archive\\Note.md\n`, exitCode: 0 },
  ]);
  const { registry, calls } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", path: "Inbox/Note.md", to: "Archive/" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("parse");
  expect(err.details.stdout).toBe("Unexpected: Archive\\Note.md\n");
  expect(err.message).not.toContain("C:\\Vaults");
  expect(calls).toHaveLength(1);
});

// =========================================================================
// US3 + unchanged failures (M13–M17)
// =========================================================================

test("M13: an unknown vault (the registry does not know it either) → today's `Vault not found.` error, untouched", async () => {
  const notRegistered = new UpstreamError({
    code: "VALIDATION_ERROR",
    cause: null,
    details: {},
    message: "unknown",
  });
  const { spawnFn } = makeQueuedSpawn([{ stdout: "Vault not found.\n", exitCode: 0 }]);
  const { registry } = recordingRegistry(WIN_ROOT, notRegistered);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Nope", path: "Inbox/Note.md", to: "Archive/" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(shape(err)).toEqual({
    code: "CLI_REPORTED_ERROR",
    message: "Vault not found.",
    details: {
      command: "move",
      stdout: "Vault not found.\n",
      stderr: "",
      exitCode: 0,
      message: "Vault not found.",
    },
  });
});

test("M14: a missing source keeps today's error with no details.code, unlike M1's FOLDER_NOT_FOUND", async () => {
  const stdout = 'Error: File "Inbox/Missing.md" not found.\n';
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout, exitCode: 0 }]);
  const { registry } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", path: "Inbox/Missing.md", to: "Archive/" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(shape(err)).toEqual({
    code: "CLI_REPORTED_ERROR",
    message: "CLI bridge upstream error: CLI_REPORTED_ERROR",
    details: {
      argv: [
        recorded[0]!.binary,
        "vault=Work",
        "move",
        "path=Inbox/Missing.md",
        "to=Archive/Missing.md",
      ],
      command: "move",
      stdout,
      stderr: "",
      exitCode: 0,
      message: 'Error: File "Inbox/Missing.md" not found.',
    },
  });
  expect(err.details.code).toBeUndefined();
  const { err: missingFolder } = await runM1();
  expect(missingFolder.details.code).toBe("FOLDER_NOT_FOUND");
});

test("M15: an existing destination file (also what a file used as a folder gives) keeps today's error", async () => {
  const stdout = "Error: Destination file already exists!\n";
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout, exitCode: 0 }]);
  const { registry } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", path: "Inbox/Note.md", to: "Archive/B.md" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(shape(err)).toEqual({
    code: "CLI_REPORTED_ERROR",
    message: "CLI bridge upstream error: CLI_REPORTED_ERROR",
    details: {
      argv: [recorded[0]!.binary, "vault=Work", "move", "path=Inbox/Note.md", "to=Archive/B.md"],
      command: "move",
      stdout,
      stderr: "",
      exitCode: 0,
      message: "Error: Destination file already exists!",
    },
  });
});

test("M16: a missing binary → CLI_BINARY_NOT_FOUND unchanged; no registry lookup", async () => {
  const { spawnFn } = makeStubSpawn({
    errorOnSpawn: Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
  });
  const { registry, calls } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", path: "Inbox/Note.md", to: "Archive/" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
  expect(err.details.platform).toBe(process.platform);
  expect(calls).toHaveLength(0);
});

test("M17: a successful move → today's result; 1 spawn; no registry lookup", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: "Moved: Inbox/Note.md → Archive/Note.md\n", exitCode: 0 },
  ]);
  const { registry, calls } = recordingRegistry(WIN_ROOT);
  const result = await executeMove(
    { target_mode: "specific", vault: "Work", path: "Inbox/Note.md", to: "Archive/" },
    deps(spawnFn, registry),
  );
  expect(result).toEqual({ moved: true, fromPath: "Inbox/Note.md", toPath: "Archive/Note.md" });
  expect(recorded).toHaveLength(1);
  expect(calls).toHaveLength(0);
});
