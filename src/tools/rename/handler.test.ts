// Original — no upstream. Tests for the rename handler — argv assembly per /speckit-clarify Q1 (appendMdIfMissing), parseRenameResponse against T0-locked F2/F12 pattern, single-spawn invariant (R9), UpstreamError propagation across the four cli-adapter codes + ERR_NO_ACTIVE_FILE, same-name audit invariant (Story 9).
import { afterEach, beforeEach, expect, test } from "vitest";

import { executeRenameNote } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import { captureRejection, makeStubSpawn, silentLogger } from "../_handler-test-fixtures.js";

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
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Renamed: Inbox/QuickNote.md -> Inbox/Quick Note.md\n",
    exitCode: 0,
  });
  const result = await executeRenameNote(
    { target_mode: "specific", vault: "V", file: "QuickNote", name: "Quick Note" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({
    renamed: true,
    fromPath: "Inbox/QuickNote.md",
    toPath: "Inbox/Quick Note.md",
  });
  expect(recorded[0]!.argv).toContain("file=QuickNote");
  expect(recorded[0]!.argv).toContain("name=Quick Note.md");
  expect(recorded[0]!.argv.some((tok) => tok.startsWith("path="))).toBe(false);
});

// Case 7 — UTF-8 byte-perfect forwarding
test("specific+file+UTF-8 name: byte-perfect tokens (no transcoding/normalisation)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Renamed: 笔记.md -> 日記.md\n",
    exitCode: 0,
  });
  await executeRenameNote(
    { target_mode: "specific", vault: "V", file: "笔记", name: "日記" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded[0]!.argv).toContain("file=笔记");
  expect(recorded[0]!.argv).toContain("name=日記.md");
});

// =========================================================================
// US5 — Active-mode (2 cases)
// =========================================================================

// Case 8 — Story 5 AC#1: active mode → argv has no locator tokens
test("active+name → argv has 'rename', 'name=Today.md', NO vault/file/path tokens (Story 5 AC#1)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Renamed: Inbox/focused.md -> Inbox/Today.md\n",
    exitCode: 0,
  });
  const result = await executeRenameNote(
    { target_mode: "active", name: "Today" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({
    renamed: true,
    fromPath: "Inbox/focused.md",
    toPath: "Inbox/Today.md",
  });
  expect(recorded[0]!.argv).toContain("rename");
  expect(recorded[0]!.argv).toContain("name=Today.md");
  expect(recorded[0]!.argv.some((tok) => tok.startsWith("vault="))).toBe(false);
  expect(recorded[0]!.argv.some((tok) => tok.startsWith("file="))).toBe(false);
  expect(recorded[0]!.argv.some((tok) => tok.startsWith("path="))).toBe(false);
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

// Case 21 — b5 cross-extension narrowing
test("name='Sketch.canvas' → argv name=Sketch.canvas.md (cross-extension narrowing) (Story 3 b5)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Renamed: Old.md -> Sketch.canvas.md\n",
    exitCode: 0,
  });
  await executeRenameNote(
    { target_mode: "specific", vault: "V", path: "Old.md", name: "Sketch.canvas" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded[0]!.argv).toContain("name=Sketch.canvas.md");
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
