// Original — no upstream. write_note handler tests for BI-0176's error half: a lock on the target (EBUSY / EPERM, injected from the fs double) is the cohort's CLI_REPORTED_ERROR / EXTERNAL_EDITOR_CONFLICT, and every FS_WRITE_FAILED (EACCES included, ADR-009 Decision point 7) carries the vault-relative path. No failure echoes the vault's absolute folder.
import { join } from "node:path";

import { afterEach, beforeEach, expect, test } from "vitest";

import { deps, fakeFs, fakeRegistry, VAULT_ROOT } from "./_handler-fixtures.js";
import { executeWriteNote } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { captureRejection, fileTsvResponse, makeQueuedSpawn } from "../_handler-test-fixtures.js";

import type { ExecuteFs } from "./handler.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

const ABS = join(VAULT_ROOT, "Sub/Alpha.md");

function errnoError(code: string, syscall: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: ${syscall} '${ABS}'`), { code, syscall, path: ABS });
}

async function writeByName(over: Partial<ExecuteFs>, overwrite = true) {
  const fs = fakeFs(over);
  const { spawnFn } = makeQueuedSpawn([fileTsvResponse("Sub/Alpha.md")]);
  const err = await captureRejection(
    executeWriteNote(
      { target_mode: "specific", vault: "TestVault", file: "Alpha", content: "new", overwrite },
      deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
    ),
  );
  expect(err).toBeInstanceOf(UpstreamError);
  return { err: err as UpstreamError, fs };
}

function expectNoAbsolutePath(err: UpstreamError): void {
  expect(err.message).not.toContain(VAULT_ROOT);
  for (const value of Object.values(err.details)) {
    expect(String(value)).not.toContain(VAULT_ROOT);
  }
}

function throwing(code: string, syscall: string) {
  return async () => {
    throw errnoError(code, syscall);
  };
}

test.each(["EPERM", "EBUSY"])(
  "%s on the rename → EXTERNAL_EDITOR_CONFLICT with the vault-relative path, tmp unlinked",
  async (errno) => {
    const { err, fs } = await writeByName({ rename: throwing(errno, "rename") });
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details).toEqual({
      code: "EXTERNAL_EDITOR_CONFLICT",
      reason: "file-locked",
      path: "Sub/Alpha.md",
      errno,
    });
    expect(err.message).toContain('"Sub/Alpha.md"');
    expectNoAbsolutePath(err);
    expect(fs.unlinks).toHaveLength(1);
  },
);

test.each([
  ["stat", "stat"],
  ["writeFile", "open"],
  ["mkdir", "mkdir"],
] as const)("EPERM on %s → EXTERNAL_EDITOR_CONFLICT, no absolute path", async (method, syscall) => {
  const { err, fs } = await writeByName({ [method]: throwing("EPERM", syscall) });
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({ code: "EXTERNAL_EDITOR_CONFLICT", path: "Sub/Alpha.md", errno: "EPERM" });
  expectNoAbsolutePath(err);
  expect(fs.renames).toHaveLength(0);
});

test.each([
  ["ENOSPC", "write"],
  ["EACCES", "open"],
])("%s → FS_WRITE_FAILED with the vault-relative path and no OS path", async (errno, syscall) => {
  const { err } = await writeByName({ writeFile: throwing(errno, syscall) });
  expect(err.code).toBe("FS_WRITE_FAILED");
  expect(err.details).toEqual({ errno, syscall, path: "Sub/Alpha.md" });
  expect(err.message).toBe(`Filesystem write failed: ${errno} on ${syscall} for "Sub/Alpha.md"`);
  expectNoAbsolutePath(err);
});

test("EPERM on the overwrite=false create is also the editor conflict", async () => {
  const { err } = await writeByName({ writeFile: throwing("EPERM", "open") }, false);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.code).toBe("EXTERNAL_EDITOR_CONFLICT");
  expectNoAbsolutePath(err);
});
