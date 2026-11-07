// Original — no upstream. move missing-destination and vault-relative failure tests (spec 090): an ENOENT rename becomes CLI_REPORTED_ERROR + details.code FOLDER_NOT_FOUND with the vault-relative folder, and every other move failure has the vault's absolute folder rewritten out (rows M1–M20 of contracts/missing-destination-contract.md). BI-0177 (rows B1–B7): a rename failure first runs the blocked-destination lookup eval; a folder prefix that is a file gives details.code NOT_A_FOLDER, and a failed lookup withholds the CLI text. BI-0177 round 2 (B7 corrected, B8–B13): a `file` or active call's folder-form `to` answered with "Destination file already exists!" runs the same lookup.
import { afterEach, beforeEach, expect, test } from "vitest";

import { executeMove } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import {
  captureRejection,
  evalPayload,
  fileTsvResponse,
  findKv,
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

/** BI-0177: the blocked-destination lookup's answer — the first folder prefix that is a file, or null. */
function blockerAnswer(blocker: string | null): StubResponse {
  return { stdout: `=> ${JSON.stringify({ ok: true, blocker })}\n`, exitCode: 0 };
}

/** The CLI's answer to a collision, and (spec 090 P5, BI-0177 round 2 T0) to a raw folder form whose last segment is a file. */
const DESTINATION_EXISTS: StubResponse = { stdout: "Error: Destination file already exists!\n", exitCode: 0 };

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

interface FolderRow {
  id: string;
  title: string;
  path: string;
  to: string;
  stub: StubResponse;
  folder: string;
  /** The `to=` the CLI must receive, when the row pins it. */
  forwarded?: string;
}

const FOLDER_ROWS: FolderRow[] = [
  {
    id: "M1",
    title: "folder-form `to` into a missing folder → FOLDER_NOT_FOUND with the vault-relative folder",
    path: "Inbox/Note.md",
    to: "Archive/2026/",
    stub: enoent(WIN_ROOT, "\\", "Inbox\\Note.md", "Archive\\2026\\Note.md"),
    folder: "Archive/2026",
  },
  {
    id: "M2",
    title: "full-path `to` into a missing folder → FOLDER_NOT_FOUND names the folder, not the file",
    path: "Inbox/Note.md",
    to: "Archive/2026/Old.md",
    stub: enoent(WIN_ROOT, "\\", "Inbox\\Note.md", "Archive\\2026\\Old.md"),
    folder: "Archive/2026",
  },
  {
    id: "M3",
    title: "nested missing folder → the whole nested folder path",
    path: "Inbox/Note.md",
    to: "A/B/C/",
    stub: enoent(WIN_ROOT, "\\", "Inbox\\Note.md", "A\\B\\C\\Note.md"),
    folder: "A/B/C",
  },
  {
    id: "M4",
    title: "a canvas moved to an extensionless `to` → FOLDER_NOT_FOUND for its folder; the forwarded to= is unchanged",
    path: "Boards/Plan.canvas",
    to: "Archive/Roadmap",
    stub: enoent(WIN_ROOT, "\\", "Boards\\Plan.canvas", "Archive\\Roadmap.canvas"),
    folder: "Archive",
    forwarded: "Archive/Roadmap.canvas",
  },
  {
    id: "M7",
    title: "the POSIX form of the ENOENT line → FOLDER_NOT_FOUND",
    path: "Inbox/Note.md",
    to: "Archive/",
    stub: enoent(POSIX_ROOT, "/", "Inbox/Note.md", "Archive/Note.md"),
    folder: "Archive",
  },
  {
    id: "M19",
    title: "a backslash full-path `to` → FOLDER_NOT_FOUND with forward slashes; to= forwarded as given",
    path: "Inbox/Note.md",
    to: "Archive\\2026\\Old.md",
    stub: enoent(WIN_ROOT, "\\", "Inbox\\Note.md", "Archive\\2026\\Old.md"),
    folder: "Archive/2026",
    forwarded: "Archive\\2026\\Old.md",
  },
];

async function runRow(row: FolderRow) {
  const { spawnFn, recorded } = makeQueuedSpawn([row.stub, blockerAnswer(null)]);
  const { registry, calls } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", path: row.path, to: row.to },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  return { err, recorded, calls };
}

const runM1 = () => runRow(FOLDER_ROWS[0]!);

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// =========================================================================
// US1 — FOLDER_NOT_FOUND (M1–M7, M19)
// =========================================================================

test.each(FOLDER_ROWS)("$id: $title; 2 spawns (the move, then a blocker lookup finding no file), no registry lookup", async (row) => {
  const { err, recorded, calls } = await runRow(row);
  expect(err).toBeInstanceOf(UpstreamError);
  expect(shape(err)).toEqual(folderNotFound(row.folder));
  expect(err.cause).toBeNull();
  expect(recorded).toHaveLength(2);
  if (row.forwarded !== undefined) expect(recorded[0]!.argv).toContain(`to=${row.forwarded}`);
  expect(findKv(recorded[1]!.argv, "vault")).toBe("Work");
  expect(evalPayload(recorded[1]!).folder).toBe(row.folder);
  expect(calls).toHaveLength(0);
});

test("M5: `file` locator → FOLDER_NOT_FOUND after the name resolution; the forwarded to=Archive/ is unchanged", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    fileTsvResponse("Inbox/Note.md"),
    enoent(WIN_ROOT, "\\", "Inbox\\Note.md", "Archive\\Note.md"),
    blockerAnswer(null),
  ]);
  const { registry } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", file: "Note", to: "Archive/" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(shape(err)).toEqual(folderNotFound("Archive"));
  expect(recorded).toHaveLength(3);
  expect(recorded[1]!.argv).toContain("to=Archive/");
});

test("M6: active mode → FOLDER_NOT_FOUND, no registry lookup; the blocker lookup runs in the focused vault (no vault=)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    focusedFileResponse("Inbox/Note.md", WIN_ROOT),
    enoent(WIN_ROOT, "\\", "Inbox\\Note.md", "Archive\\Note.md"),
    blockerAnswer(null),
  ]);
  const { registry, calls } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove({ target_mode: "active", to: "Archive/" }, deps(spawnFn, registry)),
  )) as UpstreamError;
  expect(shape(err)).toEqual(folderNotFound("Archive"));
  expect(recorded).toHaveLength(3);
  expect(findKv(recorded[2]!.argv, "vault")).toBeUndefined();
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

test("M15: an existing destination file keeps today's error", async () => {
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

// =========================================================================
// BI-0177 — a file in the way of the destination folder (B1–B7)
// =========================================================================

function notAFolder(file: string) {
  return {
    code: "CLI_REPORTED_ERROR",
    message: `move: "${file}" is an existing file, where the destination needs a folder of that name. Nothing was moved. Rename or remove that file, or pick another destination, then retry the move.`,
    details: { code: "NOT_A_FOLDER", folder: file },
  };
}

function expectNoCreateFolderAdvice(err: UpstreamError) {
  expect(err.message).not.toContain("does not exist");
  expect(err.message).not.toContain("Create the folder");
}

test("B1: folder-form `to` naming an existing note (TC-00701; the ENOENT line T0 captured on Windows) → NOT_A_FOLDER naming that file; 2 spawns, no registry lookup", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    enoent(WIN_ROOT, "\\", "Fixtures\\c07\\MoveMe.md", "Fixtures\\c07\\Blocker.md\\MoveMe.md"),
    blockerAnswer("Fixtures/c07/Blocker.md"),
  ]);
  const { registry, calls } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", path: "Fixtures/c07/MoveMe.md", to: "Fixtures/c07/Blocker.md/" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(shape(err)).toEqual(notAFolder("Fixtures/c07/Blocker.md"));
  expect("reason" in err.details).toBe(false);
  expect(err.cause).toBeNull();
  expectNoCreateFolderAdvice(err);
  expect(JSON.stringify(shape(err))).not.toMatch(/vaults|c:/i);
  expect(recorded).toHaveLength(2);
  expect(recorded[0]!.argv).toContain("to=Fixtures/c07/Blocker.md/MoveMe.md");
  expect(findKv(recorded[1]!.argv, "vault")).toBe("Work");
  expect(evalPayload(recorded[1]!).folder).toBe("Fixtures/c07/Blocker.md");
  expect(calls).toHaveLength(0);
});

test("B2: the file in the way is an ancestor of the destination folder → NOT_A_FOLDER naming the ancestor", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    enoent(WIN_ROOT, "\\", "Inbox\\Other.md", "Inbox\\Note.md\\Sub\\Other.md"),
    blockerAnswer("Inbox/Note.md"),
  ]);
  const { registry } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", path: "Inbox/Other.md", to: "Inbox/Note.md/Sub/" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(shape(err)).toEqual(notAFolder("Inbox/Note.md"));
  expect(evalPayload(recorded[1]!).folder).toBe("Inbox/Note.md/Sub");
});

test("B3: the POSIX ENOTDIR rename line (inferred from libuv, not probed) with a file in the way → NOT_A_FOLDER, no absolute path", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: `Error: ENOTDIR: not a directory, rename '${POSIX_ROOT}/Fixtures/c07/MoveMe.md' -> '${POSIX_ROOT}/Fixtures/c07/Blocker.md/MoveMe.md'\n`,
      exitCode: 0,
    },
    blockerAnswer("Fixtures/c07/Blocker.md"),
  ]);
  const { registry, calls } = recordingRegistry(POSIX_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", path: "Fixtures/c07/MoveMe.md", to: "Fixtures/c07/Blocker.md/" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(shape(err)).toEqual(notAFolder("Fixtures/c07/Blocker.md"));
  expect(JSON.stringify(shape(err))).not.toContain("/home/u");
  expect(calls).toHaveLength(0);
});

test("B4: ENOTDIR (inferred) with no file found is not FOLDER_NOT_FOUND → the CLI's error with the vault root rewritten out; 1 registry lookup", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: `Error: ENOTDIR: not a directory, rename '${POSIX_ROOT}/Inbox/Note.md' -> '${POSIX_ROOT}/Archive/Note.md'\n`,
      exitCode: 0,
    },
    blockerAnswer(null),
  ]);
  const { registry, calls } = recordingRegistry(POSIX_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", path: "Inbox/Note.md", to: "Archive/" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.code).toBeUndefined();
  expect(err.details.message).toBe("Error: ENOTDIR: not a directory, rename 'Inbox/Note.md' -> 'Archive/Note.md'");
  expect(calls).toEqual(["Work"]);
});

test.each([
  {
    id: "B5a",
    title: "the lookup eval exits non-zero",
    lookup: { stderr: "boom\n", exitCode: 1 } as StubResponse,
    lookupCode: "CLI_NON_ZERO_EXIT",
  },
  {
    id: "B5b",
    title: "the lookup answer cannot be parsed",
    lookup: { stdout: "=> not-json{\n", exitCode: 0 } as StubResponse,
    lookupCode: "CLI_REPORTED_ERROR",
  },
  {
    id: "B5c",
    title: "the lookup answer has the wrong shape",
    lookup: { stdout: '=> {"ok":true}\n', exitCode: 0 } as StubResponse,
    lookupCode: "CLI_REPORTED_ERROR",
  },
])("$id: $title → not FOLDER_NOT_FOUND: the CLI text is withheld, the move's code kept, the lookup failure as cause", async ({ lookup, lookupCode }) => {
  const { spawnFn } = makeQueuedSpawn([enoent(WIN_ROOT, "\\", "Inbox\\Note.md", "Archive\\Note.md"), lookup]);
  const { registry, calls } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", path: "Inbox/Note.md", to: "Archive/" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(shape(err)).toEqual({
    code: "CLI_REPORTED_ERROR",
    message: `move: moving "Inbox/Note.md" to "Archive/Note.md" failed with CLI_REPORTED_ERROR, and the destination folder could not be checked (${lookupCode}), so the command-line output is withheld to keep absolute paths out of this error. Retry the move.`,
    details: { source: "Inbox/Note.md", destination: "Archive/Note.md" },
  });
  expect(err.cause).toBeInstanceOf(UpstreamError);
  expect((err.cause as UpstreamError).code).toBe(lookupCode);
  const json = JSON.stringify(shape(err));
  expect(json).not.toMatch(/Vaults/);
  expect(json).not.toMatch(/ENOENT/);
  expect(calls).toHaveLength(0);
});

test("B6: a full-path `to` through an existing file → NOT_A_FOLDER; to= forwarded as given", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    enoent(WIN_ROOT, "\\", "Inbox\\Other.md", "Inbox\\Note.md\\Renamed.md"),
    blockerAnswer("Inbox/Note.md"),
  ]);
  const { registry } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", path: "Inbox/Other.md", to: "Inbox/Note.md/Renamed.md" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(shape(err)).toEqual(notAFolder("Inbox/Note.md"));
  expect(recorded[0]!.argv).toContain("to=Inbox/Note.md/Renamed.md");
});

test("B7: active mode → NOT_A_FOLDER; the lookup runs in the focused vault (no vault=), no registry lookup", async () => {
  // BI-0177 round 2: the stub is the line TC-00900 saw live for the raw folder form, not ENOENT.
  const { spawnFn, recorded } = makeQueuedSpawn([
    focusedFileResponse("Inbox/Other.md", WIN_ROOT),
    DESTINATION_EXISTS,
    blockerAnswer("Inbox/Note.md"),
  ]);
  const { registry, calls } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove({ target_mode: "active", to: "Inbox/Note.md/" }, deps(spawnFn, registry)),
  )) as UpstreamError;
  expect(shape(err)).toEqual(notAFolder("Inbox/Note.md"));
  expect(recorded).toHaveLength(3);
  expect(recorded[1]!.argv).toContain("to=Inbox/Note.md/");
  expect(findKv(recorded[1]!.argv, "vault")).toBeUndefined();
  expect(findKv(recorded[2]!.argv, "vault")).toBeUndefined();
  expect(evalPayload(recorded[2]!).folder).toBe("Inbox/Note.md");
  expect(calls).toHaveLength(0);
});

// =========================================================================
// BI-0177 round 2 — a `file` or active call forwards the folder form for the CLI to expand, and a
// last segment that is an existing file gets the CLI's "already exists" line (B8–B13)
// =========================================================================

test("B8: `file` locator, folder-form `to` naming an existing note (TC-00865 step 4) → NOT_A_FOLDER; to= forwarded as given; 3 spawns, lookup in vault Work, no registry lookup", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    fileTsvResponse("Inbox/Other.md"),
    DESTINATION_EXISTS,
    blockerAnswer("Inbox/Note.md"),
  ]);
  const { registry, calls } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", file: "Other", to: "Inbox/Note.md/" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(shape(err)).toEqual(notAFolder("Inbox/Note.md"));
  expect(err.cause).toBeNull();
  expectNoCreateFolderAdvice(err);
  expect(recorded).toHaveLength(3);
  expect(recorded[1]!.argv).toContain("file=Other");
  expect(recorded[1]!.argv).toContain("to=Inbox/Note.md/");
  expect(findKv(recorded[2]!.argv, "vault")).toBe("Work");
  expect(evalPayload(recorded[2]!).folder).toBe("Inbox/Note.md");
  expect(calls).toHaveLength(0);
});

test("B9: `file` locator, folder-form `to` onto a genuinely existing destination file → today's CLI error (no details.code) after a lookup finding no file; 1 registry lookup", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    fileTsvResponse("Inbox/Note.md"),
    DESTINATION_EXISTS,
    blockerAnswer(null),
  ]);
  const { registry, calls } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", file: "Note", to: "Archive/" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.code).toBeUndefined();
  expect(err.details.message).toBe("Error: Destination file already exists!");
  expect(recorded).toHaveLength(3);
  expect(evalPayload(recorded[2]!).folder).toBe("Archive");
  expect(calls).toEqual(["Work"]);
});

test("B10: active mode, the lookup after the CLI's already-exists line fails → the CLI text is withheld, never FOLDER_NOT_FOUND; the lookup failure as cause", async () => {
  const { spawnFn } = makeQueuedSpawn([
    focusedFileResponse("Inbox/Other.md", WIN_ROOT),
    DESTINATION_EXISTS,
    { stderr: "boom\n", exitCode: 1 },
  ]);
  const { registry, calls } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove({ target_mode: "active", to: "Inbox/Note.md/" }, deps(spawnFn, registry)),
  )) as UpstreamError;
  expect(shape(err)).toEqual({
    code: "CLI_REPORTED_ERROR",
    message:
      'move: moving "Inbox/Other.md" to "Inbox/Note.md/Other.md" failed with CLI_REPORTED_ERROR, and the destination folder could not be checked (CLI_NON_ZERO_EXIT), so the command-line output is withheld to keep absolute paths out of this error. Retry the move.',
    details: { source: "Inbox/Other.md", destination: "Inbox/Note.md/Other.md" },
  });
  expect((err.cause as UpstreamError).code).toBe("CLI_NON_ZERO_EXIT");
  expect(JSON.stringify(shape(err))).not.toMatch(/already exists/);
  expect(calls).toHaveLength(0);
});

test.each([
  {
    id: "B11a",
    title: "the ENOENT rename line the T0 probe captured (destination without the basename)",
    stub: enoent(WIN_ROOT, "\\", "Inbox\\Other.md", "Inbox\\Note.md\\Sub"),
  },
  {
    id: "B11b",
    title: "the already-exists line (inferred, not seen by the T0 probe)",
    stub: DESTINATION_EXISTS,
  },
])("$id: `file` locator, folder-form `to` through an ancestor file, $title → NOT_A_FOLDER naming the ancestor", async ({ stub }) => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    fileTsvResponse("Inbox/Other.md"),
    stub,
    blockerAnswer("Inbox/Note.md"),
  ]);
  const { registry, calls } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", file: "Other", to: "Inbox/Note.md/Sub/" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(shape(err)).toEqual(notAFolder("Inbox/Note.md"));
  expect(recorded[1]!.argv).toContain("to=Inbox/Note.md/Sub/");
  expect(evalPayload(recorded[2]!).folder).toBe("Inbox/Note.md/Sub");
  expect(calls).toHaveLength(0);
});

test("B12: a `path` call with a folder-form `to` (expanded by the handler) getting the already-exists line keeps today's error; 1 spawn, no lookup", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([DESTINATION_EXISTS]);
  const { registry, calls } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", path: "Inbox/Note.md", to: "Archive/" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(err.details.code).toBeUndefined();
  expect(err.details.message).toBe("Error: Destination file already exists!");
  expect(recorded).toHaveLength(1);
  expect(calls).toEqual(["Work"]);
});

test("B13: a `file` call with a full-path `to` getting the already-exists line keeps today's error; no lookup", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([fileTsvResponse("Inbox/Note.md"), DESTINATION_EXISTS]);
  const { registry } = recordingRegistry(WIN_ROOT);
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "Work", file: "Note", to: "Archive/B.md" },
      deps(spawnFn, registry),
    ),
  )) as UpstreamError;
  expect(err.details.code).toBeUndefined();
  expect(err.details.message).toBe("Error: Destination file already exists!");
  expect(recorded).toHaveLength(2);
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
