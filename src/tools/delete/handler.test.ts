// Original — no upstream. Tests for the delete handler — argv assembly (no rename), response parsing, structural toTrash, audit invariant, UpstreamError propagation.
import { afterEach, beforeEach, expect, test } from "vitest";

import { executeDeleteNote } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import { makeStubSpawn, silentLogger, captureRejection } from "../_handler-test-fixtures.js";

import type { DeleteNoteInput } from "./schema.js";


beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// (a) Story 1 IT — specific path mode to-trash happy path
test("specific+path to-trash returns { deleted, path, toTrash:true } and emits T0.1 argv shape (Story 1 IT)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Moved to trash: Inbox/Old.md\n",
    exitCode: 0,
  });
  const result = await executeDeleteNote(
    { target_mode: "specific", vault: "MyVault", path: "Inbox/Old.md", permanent: false },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({ deleted: true, path: "Inbox/Old.md", toTrash: true });
  expect(recorded[0]!.argv).toEqual([
    "vault=MyVault",
    "delete",
    "path=Inbox/Old.md",
  ]);
  expect(recorded[0]!.argv).not.toContain("permanent");
});

// (b) Story 2 IT — specific file mode (NO rename per R3)
test("specific+file maps file → file= argv directly (Story 2 IT, R3 no-rename departure from write_note)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Moved to trash: 1000- Testing/QuickNote.md\n",
    exitCode: 0,
  });
  const result = await executeDeleteNote(
    { target_mode: "specific", vault: "MyVault", file: "QuickNote", permanent: false },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({ deleted: true, path: "1000- Testing/QuickNote.md", toTrash: true });
  expect(recorded[0]!.argv).toContain("file=QuickNote");
  expect(recorded[0]!.argv).not.toContain("name=QuickNote");
});

// (c) Story 3 IT — specific permanent
test("specific+permanent=true returns toTrash:false and emits 'permanent' flag (Story 3 IT, T0.3)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Deleted permanently: Old.md\n",
    exitCode: 0,
  });
  const result = await executeDeleteNote(
    { target_mode: "specific", vault: "V", path: "Old.md", permanent: true },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({ deleted: true, path: "Old.md", toTrash: false });
  expect(recorded[0]!.argv[recorded[0]!.argv.length - 1]).toBe("permanent");
});

// (d) Story 1 AC#2 + Story 3 AC#2 — permanent default-false omits flag in argv
test.each<["omitted" | "explicit-false", DeleteNoteInput]>([
  ["omitted", { target_mode: "specific", vault: "V", path: "P.md", permanent: false }],
  ["explicit-false", { target_mode: "specific", vault: "V", path: "P.md", permanent: false }],
])("permanent=%s does NOT emit 'permanent' token in argv (Story 1 AC#2 + Story 3 AC#2)", async (_label, input) => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Moved to trash: P.md\n",
    exitCode: 0,
  });
  await executeDeleteNote(input, { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} });
  expect(recorded[0]!.argv).not.toContain("permanent");
});

// (e) Story 4 AC#1 — active mode happy path to-trash
test("active mode emits ['delete'] with no locator and no permanent token (Story 4 AC#1, T0.6)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Moved to trash: 1000- Testing-to-be-deleted/focused.md\n",
    exitCode: 0,
  });
  const result = await executeDeleteNote(
    { target_mode: "active", permanent: false },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({
    deleted: true,
    path: "1000- Testing-to-be-deleted/focused.md",
    toTrash: true,
  });
  expect(recorded[0]!.argv).toEqual(["delete"]);
});

// (f) Story 4 AC#2 — active mode + permanent
test("active mode + permanent emits ['delete','permanent'] and returns toTrash:false (Story 4 AC#2)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Deleted permanently: 1000- Testing/focused.md\n",
    exitCode: 0,
  });
  const result = await executeDeleteNote(
    { target_mode: "active", permanent: true },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({
    deleted: true,
    path: "1000- Testing/focused.md",
    toTrash: false,
  });
  expect(recorded[0]!.argv).toEqual(["delete", "permanent"]);
});

// (g) Story 6 AC#1 — CLI_BINARY_NOT_FOUND
test("ENOENT on spawn → CLI_BINARY_NOT_FOUND (Story 6 AC#1)", async () => {
  const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  const { spawnFn } = makeStubSpawn({ errorOnSpawn: enoent });
  const err = (await captureRejection(
    executeDeleteNote(
      { target_mode: "specific", vault: "V", path: "P.md", permanent: false },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
});

// (h) Story 6 AC#2 — CLI_NON_ZERO_EXIT
test("non-zero exit + stderr → CLI_NON_ZERO_EXIT (Story 6 AC#2)", async () => {
  const { spawnFn } = makeStubSpawn({ stderr: "permission denied", exitCode: 1 });
  const err = (await captureRejection(
    executeDeleteNote(
      { target_mode: "specific", vault: "V", path: "P.md", permanent: false },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
  expect(err.details.exitCode).toBe(1);
  expect(err.details.stderr).toBe("permission denied");
});

// (i) Story 6 AC#3 — CLI_REPORTED_ERROR (file not found)
test("exit-0 stdout 'Error: File not found' → CLI_REPORTED_ERROR with verbatim message (Story 6 AC#3, T0.4)", async () => {
  const { spawnFn } = makeStubSpawn({
    stdout: 'Error: File "Inbox/Missing.md" not found.\n',
    exitCode: 0,
  });
  const err = (await captureRejection(
    executeDeleteNote(
      { target_mode: "specific", vault: "V", path: "Inbox/Missing.md", permanent: false },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.message).toBe('Error: File "Inbox/Missing.md" not found.');
});

// (i2) parsePath fallthrow — exit-0 stdout matching NEITHER success RESPONSE_RE NOR any
// upstream-classified error form (no "Error:" prefix, no no-active-file, not "Vault not
// found.") reaches parsePath and throws CLI_REPORTED_ERROR with details.stdout (handler.ts L22-27)
test("exit-0 stdout matching no known shape → parsePath throws CLI_REPORTED_ERROR with raw stdout in details", async () => {
  const { spawnFn } = makeStubSpawn({ stdout: "Something unexpected\n", exitCode: 0 });
  const err = (await captureRejection(
    executeDeleteNote(
      { target_mode: "specific", vault: "V", path: "P.md", permanent: false },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stdout).toBe("Something unexpected\n");
  expect(err.message).toBe("delete_note could not parse CLI response: Something unexpected\n");
});

// (j) Story 4 AC#4 — ERR_NO_ACTIVE_FILE
test("active mode no-active-file → ERR_NO_ACTIVE_FILE with recovery hint (Story 4 AC#4)", async () => {
  const { spawnFn } = makeStubSpawn({ stdout: "Error: no active file\n", exitCode: 0 });
  const err = (await captureRejection(
    executeDeleteNote(
      { target_mode: "active", permanent: false },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
  expect(err.message).toContain("No active file");
});

// (k) Story 6 AC#4 — non-UpstreamError re-throw
test("non-UpstreamError exception is re-thrown verbatim (Story 6 AC#4)", async () => {
  const synthetic = new Error("unexpected runtime error");
  const { spawnFn } = makeStubSpawn({ errorOnSpawn: synthetic });
  const rejection = await captureRejection(
    executeDeleteNote(
      { target_mode: "specific", vault: "V", path: "P.md", permanent: false },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  );
  expect(rejection).toBe(synthetic);
  expect(rejection).not.toBeInstanceOf(UpstreamError);
});

// (l) Story 8 / SC-014 — audit invariant: toTrash === !permanent across all six combinations
test.each<[string, DeleteNoteInput, boolean]>([
  ["specific+permanent=omitted", { target_mode: "specific", vault: "V", path: "P.md", permanent: false }, true],
  ["specific+permanent=false", { target_mode: "specific", vault: "V", path: "P.md", permanent: false }, true],
  ["specific+permanent=true", { target_mode: "specific", vault: "V", path: "P.md", permanent: true }, false],
  ["active+permanent=omitted", { target_mode: "active", permanent: false }, true],
  ["active+permanent=false", { target_mode: "active", permanent: false }, true],
  ["active+permanent=true", { target_mode: "active", permanent: true }, false],
])("audit invariant: %s → toTrash=%s (SC-014, Story 8)", async (_desc, input, expectedToTrash) => {
  const stdout = expectedToTrash
    ? "Moved to trash: P.md\n"
    : "Deleted permanently: P.md\n";
  const { spawnFn } = makeStubSpawn({ stdout, exitCode: 0 });
  const result = await executeDeleteNote(input, {
    logger: silentLogger(),
    queue: createQueue(),
    spawnFn,
    env: {},
  });
  expect(result.toTrash).toBe(expectedToTrash);
  expect(result.toTrash).toBe(!input.permanent);
});
