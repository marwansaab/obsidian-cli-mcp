// Original — no upstream. Tests for the rename handler — argv assembly with the spec 070 type-preservation rule (resolveDestinationName; supersedes the spec 021 appendMdIfMissing lock), file/active source resolution, parseRenameResponse against T0-locked F2/F12 pattern, single-spawn invariant (R9), UpstreamError propagation across the four cli-adapter codes + ERR_NO_ACTIVE_FILE, same-name audit invariant (Story 9).
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { executeRenameNote } from "./handler.js";
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
} from "../_handler-test-fixtures.js";

import type { SpawnLike } from "../../cli-adapter/_dispatch.js";

function deps(spawnFn: SpawnLike) {
  return { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} };
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// =========================================================================
// US1 — Specific-mode + path locator + appendMdIfMissing (5 cases)
// =========================================================================

// Case 1 — Story 1 IT: bare name appended with .md; argv shape
test("specific+path+name='Fixed' → argv has name=Fixed.md, fromPath/toPath extracted (Story 1 IT)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Renamed: Inbox/Typo.md -> Inbox/Fixed.md\n",
    exitCode: 0,
  });
  const result = await executeRenameNote(
    { target_mode: "specific", vault: "MyVault", path: "Inbox/Typo.md", name: "Fixed" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({
    renamed: true,
    fromPath: "Inbox/Typo.md",
    toPath: "Inbox/Fixed.md",
  });
  expect(recorded[0]!.argv).toEqual([
    "vault=MyVault",
    "rename",
    "path=Inbox/Typo.md",
    "name=Fixed.md",
  ]);
});

// Case 2 — appendMdIfMissing baseline: bare name produces `<name>.md`
test("appendMdIfMissing baseline: name='Fixed' produces argv token 'name=Fixed.md'", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Renamed: Inbox/Old.md -> Inbox/Fixed.md\n",
    exitCode: 0,
  });
  await executeRenameNote(
    { target_mode: "specific", vault: "V", path: "Inbox/Old.md", name: "Fixed" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded[0]!.argv).toContain("name=Fixed.md");
});

// Case 3 — parseRenameResponse extracts byte-perfect from F2/F12 pattern
test("parseRenameResponse against F2 pattern → byte-perfect fromPath/toPath", async () => {
  const { spawnFn } = makeStubSpawn({
    stdout: "Renamed: Inbox/Has Space.md -> Inbox/New Name.md\n",
    exitCode: 0,
  });
  const result = await executeRenameNote(
    { target_mode: "specific", vault: "V", path: "Inbox/Has Space.md", name: "New Name" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result.fromPath).toBe("Inbox/Has Space.md");
  expect(result.toPath).toBe("Inbox/New Name.md");
});

// Case 4 — Single-spawn invariant (R9)
test("R9 single-spawn invariant: specific+path → spawnFn.callCount === 1", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Renamed: Inbox/Old.md -> Inbox/Fixed.md\n",
    exitCode: 0,
  });
  await executeRenameNote(
    { target_mode: "specific", vault: "V", path: "Inbox/Old.md", name: "Fixed" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded).toHaveLength(1);
});

// Case 5 — Vault hoist: vault=V is a discrete top-level token, NOT nested in parameters
test("specific+path: argv has 'vault=V' as discrete token (PSR-3 vault hoist)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Renamed: P.md -> Q.md\n",
    exitCode: 0,
  });
  await executeRenameNote(
    { target_mode: "specific", vault: "V", path: "P.md", name: "Q" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  // vault=V appears BEFORE 'rename' in the dispatch argv order
  expect(recorded[0]!.argv[0]).toBe("vault=V");
  expect(recorded[0]!.argv[1]).toBe("rename");
});

// =========================================================================
// US2 — Specific-mode + wikilink locator (file=) (2 cases)
// =========================================================================

// Case 6 — Story 2 IT: file= locator produces argv with file=, NO path=
test("specific+file+name → argv has file= and no path= (Story 2 IT)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    fileTsvResponse("Inbox/QuickNote.md"),
    { stdout: "Renamed: Inbox/QuickNote.md -> Inbox/Quick Note.md\n", exitCode: 0 },
  ]);
  const result = await executeRenameNote(
    { target_mode: "specific", vault: "V", file: "QuickNote", name: "Quick Note" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({
    renamed: true,
    fromPath: "Inbox/QuickNote.md",
    toPath: "Inbox/Quick Note.md",
  });
  // Spec 070: recorded[0] is the resolution spawn; the rename spawn follows it.
  expect(recorded[1]!.argv).toContain("file=QuickNote");
  expect(recorded[1]!.argv).toContain("name=Quick Note.md");
  expect(recorded[1]!.argv.some((tok) => tok.startsWith("path="))).toBe(false);
});

// Case 7 — UTF-8 byte-perfect forwarding
test("specific+file+UTF-8 name: byte-perfect tokens (no transcoding/normalisation)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    fileTsvResponse("笔记.md"),
    { stdout: "Renamed: 笔记.md -> 日記.md\n", exitCode: 0 },
  ]);
  await executeRenameNote(
    { target_mode: "specific", vault: "V", file: "笔记", name: "日記" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded[1]!.argv).toContain("file=笔记");
  expect(recorded[1]!.argv).toContain("name=日記.md");
});

// =========================================================================
// US5 — Active-mode (2 cases)
// =========================================================================

// Case 8 — Story 5 AC#1, restated by spec 070 (research D3, FR-009): active mode resolves the
// focused file, then renames it by path with no vault=, in the CLI's current vault (the eval's).
test("active+name → focused-file eval, then 'rename path=<focused> name=Today.md' with no vault= (Story 5 AC#1, spec 070)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    focusedFileResponse("Inbox/focused.md"),
    { stdout: "Renamed: Inbox/focused.md -> Inbox/Today.md\n", exitCode: 0 },
  ]);
  const result = await executeRenameNote(
    { target_mode: "active", name: "Today" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({
    renamed: true,
    fromPath: "Inbox/focused.md",
    toPath: "Inbox/Today.md",
  });
  expect(recorded[0]!.argv[0]).toBe("eval");
  expect(recorded[1]!.argv).toEqual(["rename", "path=Inbox/focused.md", "name=Today.md"]);
});

// Case 9 — Story 5 AC#3: active mode no-active-file → ERR_NO_ACTIVE_FILE propagates
test("active mode no-active-file → ERR_NO_ACTIVE_FILE propagates (Story 5 AC#3)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Error: no active file\n",
    exitCode: 0,
  });
  const err = (await captureRejection(
    executeRenameNote(
      { target_mode: "active", name: "Today" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
  expect(recorded).toHaveLength(1);
});

// =========================================================================
// US4 — Source-not-found and destination-collision structured errors (2 cases)
// =========================================================================

// Case 10 — Story 4 AC#1: source not found → CLI_REPORTED_ERROR with F6 verbatim
test("source-not-found → CLI_REPORTED_ERROR with F6 verbatim wording (Story 4 AC#1)", async () => {
  const { spawnFn } = makeStubSpawn({
    stdout: 'Error: File "Sandbox/Missing.md" not found.\n',
    exitCode: 0,
  });
  const err = (await captureRejection(
    executeRenameNote(
      { target_mode: "specific", vault: "V", path: "Sandbox/Missing.md", name: "Anything" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.message).toBe('Error: File "Sandbox/Missing.md" not found.');
});

// Case 11 — Story 4 AC#2: destination collision → CLI_REPORTED_ERROR with F7 verbatim
test("destination-collision → CLI_REPORTED_ERROR with F7 verbatim wording (Story 4 AC#2)", async () => {
  const { spawnFn } = makeStubSpawn({
    stdout: "Error: Destination file already exists!\n",
    exitCode: 0,
  });
  const err = (await captureRejection(
    executeRenameNote(
      { target_mode: "specific", vault: "V", path: "Sandbox/a.md", name: "b" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.message).toBe("Error: Destination file already exists!");
});

// =========================================================================
// US7 — CLI failure propagation across the four adapter codes + parse failure + non-UpstreamError (6 cases)
// =========================================================================

// Case 12 — Story 7 AC#1: ENOENT spawn → CLI_BINARY_NOT_FOUND
test("ENOENT on spawn → CLI_BINARY_NOT_FOUND (Story 7 AC#1)", async () => {
  const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  const { spawnFn } = makeStubSpawn({ errorOnSpawn: enoent });
  const err = (await captureRejection(
    executeRenameNote(
      { target_mode: "specific", vault: "V", path: "P.md", name: "Q" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
});

// Case 13 — Story 7 AC#2: non-zero exit + stderr → CLI_NON_ZERO_EXIT
test("non-zero exit + stderr → CLI_NON_ZERO_EXIT (Story 7 AC#2)", async () => {
  const { spawnFn } = makeStubSpawn({ stderr: "permission denied", exitCode: 1 });
  const err = (await captureRejection(
    executeRenameNote(
      { target_mode: "specific", vault: "V", path: "P.md", name: "Q" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
  expect(err.details.exitCode).toBe(1);
  expect(err.details.stderr).toBe("permission denied");
});

// Case 14 — Story 7 AC#3: exit-0 'Error:' prefix → CLI_REPORTED_ERROR
test("exit-0 stdout 'Error: <msg>' → CLI_REPORTED_ERROR (Story 7 AC#3)", async () => {
  const { spawnFn } = makeStubSpawn({
    stdout: "Error: something went wrong\n",
    exitCode: 0,
  });
  const err = (await captureRejection(
    executeRenameNote(
      { target_mode: "specific", vault: "V", path: "P.md", name: "Q" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.message).toBe("Error: something went wrong");
});

// Case 15 — 011-R5 inherited: unknown-vault response → CLI_REPORTED_ERROR
test("unknown-vault stdout 'Vault not found.' → CLI_REPORTED_ERROR (011-R5 inherited)", async () => {
  const { spawnFn } = makeStubSpawn({
    stdout: "Vault not found.\n",
    exitCode: 0,
  });
  const err = (await captureRejection(
    executeRenameNote(
      { target_mode: "specific", vault: "DoesNotExist", path: "P.md", name: "Q" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.message).toBe("Vault not found.");
});

// Case 16 — Story 7 AC#4: non-UpstreamError re-thrown verbatim
test("non-UpstreamError exception is re-thrown verbatim (Story 7 AC#4)", async () => {
  const synthetic = new Error("unexpected runtime error");
  const { spawnFn } = makeStubSpawn({ errorOnSpawn: synthetic });
  const rejection = await captureRejection(
    executeRenameNote(
      { target_mode: "specific", vault: "V", path: "P.md", name: "Q" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  );
  expect(rejection).toBe(synthetic);
  expect(rejection).not.toBeInstanceOf(UpstreamError);
});

// Case 17 — parseRenameResponse failure: unparseable stdout → CLI_REPORTED_ERROR with stdout in details
test("parseRenameResponse failure: unparseable stdout → CLI_REPORTED_ERROR with stdout in details", async () => {
  const { spawnFn } = makeStubSpawn({
    stdout: "OK\n",
    exitCode: 0,
  });
  const err = (await captureRejection(
    executeRenameNote(
      { target_mode: "specific", vault: "V", path: "P.md", name: "Q" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stdout).toBe("OK\n");
});

// =========================================================================
// US3 — Extension-rule edge cases (4 cases)
// =========================================================================

// Case 18 — b2 verbatim-`.md`-forwarding
test("name='Fixed.md' → argv name=Fixed.md (no double-append) (Story 3 b2)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Renamed: Inbox/Old.md -> Inbox/Fixed.md\n",
    exitCode: 0,
  });
  await executeRenameNote(
    { target_mode: "specific", vault: "V", path: "Inbox/Old.md", name: "Fixed.md" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded[0]!.argv).toContain("name=Fixed.md");
  expect(recorded[0]!.argv.some((t) => t === "name=Fixed.md.md")).toBe(false);
});

// Case 19 — b3 case-sensitive: .MD ≠ .md → append
test("name='Renamed.MD' → argv name=Renamed.MD.md (case-sensitive .MD ≠ .md) (Story 3 b3)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Renamed: Old.md -> Renamed.MD.md\n",
    exitCode: 0,
  });
  await executeRenameNote(
    { target_mode: "specific", vault: "V", path: "Old.md", name: "Renamed.MD" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded[0]!.argv).toContain("name=Renamed.MD.md");
});

// Case 20 — b4 internal periods preserved
test("name='Doc.v1.draft' → argv name=Doc.v1.draft.md (internal periods preserved) (Story 3 b4)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Renamed: Old.md -> Doc.v1.draft.md\n",
    exitCode: 0,
  });
  await executeRenameNote(
    { target_mode: "specific", vault: "V", path: "Old.md", name: "Doc.v1.draft" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded[0]!.argv).toContain("name=Doc.v1.draft.md");
});

// Case 21 — b5, superseded by spec 070 (replaces the spec 021 Q1 `.md`-only lock): a name
// naming another recognised type is a type change and is rejected, not narrowed to `.canvas.md`.
test("name='Sketch.canvas' on a note → UNSUPPORTED_FILE_TYPE / type-change, no rename spawn (Story 3 b5, superseded by spec 070)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([]);
  const err = (await captureRejection(
    executeRenameNote(
      { target_mode: "specific", vault: "V", path: "Old.md", name: "Sketch.canvas" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("VALIDATION_ERROR");
  expect(err.details).toMatchObject({ code: "UNSUPPORTED_FILE_TYPE", reason: "type-change" });
  expect(recorded).toHaveLength(0);
});

// =========================================================================
// US9 — Same-name rename is a successful no-op (1 case)
// =========================================================================

// Case 22 — Story 9 AC#1: same-name → fromPath === toPath by string equality
test("same-name rename: response carries renamed:true AND fromPath===toPath (Story 9 / F5)", async () => {
  const { spawnFn } = makeStubSpawn({
    stdout: "Renamed: Inbox/Note.md -> Inbox/Note.md\n",
    exitCode: 0,
  });
  const result = await executeRenameNote(
    { target_mode: "specific", vault: "V", path: "Inbox/Note.md", name: "Note" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({
    renamed: true,
    fromPath: "Inbox/Note.md",
    toPath: "Inbox/Note.md",
  });
  expect(result.fromPath === result.toPath).toBe(true);
});

// =========================================================================
// Spec 070 — the file keeps its type (US1, US2, US4)
// =========================================================================

function dirOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i + 1);
}

// data-model.md DestinationNameRule worked rows that are not rejections.
const WORKED_ROWS: Array<[source: string, name: string, forwarded: string]> = [
  ["Inbox/Note.md", "Renamed", "Renamed.md"],
  ["Inbox/Note.md", "Renamed.md", "Renamed.md"],
  ["Inbox/Note.md", "Renamed.MD", "Renamed.MD.md"],
  ["Inbox/Note.md", "Doc.v1.draft", "Doc.v1.draft.md"],
  ["Boards/Plan.canvas", "Roadmap", "Roadmap.canvas"],
  ["Boards/Plan.canvas", "Roadmap.canvas", "Roadmap.canvas"],
  ["Boards/Plan.canvas", "Plan.v2", "Plan.v2.canvas"],
  ["Views/Tasks.base", "Open Tasks", "Open Tasks.base"],
  ["Att/Photo.PNG", "New", "New.PNG"],
  ["Att/Photo.PNG", "New.png", "New.png"],
  ["Misc/README", "Readme2", "Readme2"],
  ["Misc/todo.txt", "done", "done.txt"],
];

test.each(WORKED_ROWS)("spec 070 worked row: path=%s name=%j → argv name=%s", async (source, name, forwarded) => {
  const toPath = dirOf(source) + forwarded;
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: `Renamed: ${source} -> ${toPath}\n`, exitCode: 0 }]);
  const result = await executeRenameNote({ target_mode: "specific", vault: "V", path: source, name }, deps(spawnFn));
  expect(recorded).toHaveLength(1);
  expect(recorded[0]!.argv).toEqual(["vault=V", "rename", `path=${source}`, `name=${forwarded}`]);
  expect(result).toEqual({ renamed: true, fromPath: source, toPath });
});

test("spec 070: file mode resolves the name first — `vault=MyVault file file=Plan` precedes the rename", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    fileTsvResponse("Boards/Plan.canvas"),
    { stdout: "Renamed: Boards/Plan.canvas -> Boards/Roadmap.canvas\n", exitCode: 0 },
  ]);
  await executeRenameNote({ target_mode: "specific", vault: "MyVault", file: "Plan", name: "Roadmap" }, deps(spawnFn));
  expect(recorded).toHaveLength(2);
  expect(recorded[0]!.argv).toEqual(["vault=MyVault", "file", "file=Plan"]);
});

test("spec 070: file mode on a canvas forwards the original file= (no path=) with name=Roadmap.canvas", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    fileTsvResponse("Boards/Plan.canvas"),
    { stdout: "Renamed: Boards/Plan.canvas -> Boards/Roadmap.canvas\n", exitCode: 0 },
  ]);
  const result = await executeRenameNote(
    { target_mode: "specific", vault: "MyVault", file: "Plan", name: "Roadmap" },
    deps(spawnFn),
  );
  expect(recorded[1]!.argv).toEqual(["vault=MyVault", "rename", "file=Plan", "name=Roadmap.canvas"]);
  expect(result.toPath).toBe("Boards/Roadmap.canvas");
});

test("spec 070: active mode on a focused canvas in an unregistered vault → rename by path, no vault=, no registry lookup", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    focusedFileResponse("Boards/Plan.canvas", "/vaults/Unregistered"),
    { stdout: "Renamed: Boards/Plan.canvas -> Boards/Roadmap.canvas\n", exitCode: 0 },
  ]);
  await executeRenameNote({ target_mode: "active", name: "Roadmap" }, deps(spawnFn));
  expect(recorded[1]!.argv).toEqual(["rename", "path=Boards/Plan.canvas", "name=Roadmap.canvas"]);
});

test("spec 070: a file-mode resolution failure surfaces its CLI_REPORTED_ERROR and spawns no rename", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: 'Error: File "Plan" not found.\n', exitCode: 0 }]);
  const err = (await captureRejection(
    executeRenameNote({ target_mode: "specific", vault: "MyVault", file: "Plan", name: "Roadmap" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.message).toBe('Error: File "Plan" not found.');
  expect(recorded).toHaveLength(1);
});

test("spec 070: active mode with no focused file → ERR_NO_ACTIVE_FILE, no rename spawn", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([focusedFileResponse(null)]);
  const err = (await captureRejection(executeRenameNote({ target_mode: "active", name: "X" }, deps(spawnFn)))) as UpstreamError;
  expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
  expect(recorded).toHaveLength(1);
});

// data-model.md rejection rows, in each locator form.
const REJECTION_ROWS: Array<[source: string, name: string, extension: string, destinationExtension: string]> = [
  ["Inbox/Note.md", "Sketch.canvas", "md", "canvas"],
  ["Boards/Plan.canvas", "Plan.md", "canvas", "md"],
  ["Att/Photo.png", "New.jpg", "png", "jpg"],
];

describe.each(["path", "file", "active"] as const)("spec 070 type-change rejection (%s locator)", (locator) => {
  test.each(REJECTION_ROWS)("%s → %j rejected, rename never spawned", async (source, name, extension, destinationExtension) => {
    const resolution =
      locator === "file" ? [fileTsvResponse(source)] : locator === "active" ? [focusedFileResponse(source)] : [];
    const { spawnFn, recorded } = makeQueuedSpawn(resolution);
    const input =
      locator === "path"
        ? ({ target_mode: "specific", vault: "MyVault", path: source, name } as const)
        : locator === "file"
          ? ({ target_mode: "specific", vault: "MyVault", file: source.slice(source.lastIndexOf("/") + 1), name } as const)
          : ({ target_mode: "active", name } as const);
    const err = (await captureRejection(executeRenameNote(input, deps(spawnFn)))) as UpstreamError;
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details).toEqual({
      code: "UNSUPPORTED_FILE_TYPE",
      reason: "type-change",
      path: source,
      extension,
      supported: ["note", "canvas", "base", "attachment"],
      destination: name,
      destinationExtension,
      alternative: "obsidian_exec",
    });
    expect(recorded.some((r) => r.argv.includes("rename"))).toBe(false);
  });
});

// US4 / FR-011 invariant, one case per category and locator form: an extensionless name keeps
// the source's extension.
describe.each(["path", "file", "active"] as const)("spec 070 invariant: type kept (%s locator)", (locator) => {
  test.each(["Dir/S.md", "Dir/S.canvas", "Dir/S.base", "Dir/S.png"])("%s renamed to 'T' keeps its extension", async (source) => {
    const ext = source.slice(source.lastIndexOf("."));
    const resolution =
      locator === "file" ? [fileTsvResponse(source)] : locator === "active" ? [focusedFileResponse(source)] : [];
    const { spawnFn, recorded } = makeQueuedSpawn([
      ...resolution,
      { stdout: `Renamed: ${source} -> Dir/T${ext}\n`, exitCode: 0 },
    ]);
    const input =
      locator === "path"
        ? ({ target_mode: "specific", vault: "MyVault", path: source, name: "T" } as const)
        : locator === "file"
          ? ({ target_mode: "specific", vault: "MyVault", file: `S${ext}`, name: "T" } as const)
          : ({ target_mode: "active", name: "T" } as const);
    const result = await executeRenameNote(input, deps(spawnFn));
    expect(recorded.at(-1)!.argv).toContain(`name=T${ext}`);
    expect(result.toPath.endsWith(ext)).toBe(true);
  });
});
