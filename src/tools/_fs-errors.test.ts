// Original — no upstream. Unit tests for the shared filesystem-error mapper (_fs-errors.ts, F4 of the thermo-nuclear code-quality review). Covers getErrno narrowing and mapFsWriteError's two branches (EXTERNAL_EDITOR_CONFLICT vs FS_WRITE_FAILED), the per-tool divergence parameters (conflictErrnos, conflictVerb, includeFsPath), and the byte-exact details shapes + messages the handler cohort relies on.
import { describe, expect, test } from "vitest";

import { getErrno, mapFsWriteError } from "./_fs-errors.js";
import { UpstreamError } from "../errors.js";

function errnoError(code: string, extra: { syscall?: string; path?: string } = {}): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code, ...extra }) as NodeJS.ErrnoException;
}

describe("getErrno", () => {
  test("returns the errno code from a NodeJS error", () => {
    expect(getErrno(errnoError("EBUSY"))).toBe("EBUSY");
  });

  test("returns undefined for non-objects, null, and objects without a string code", () => {
    expect(getErrno(null)).toBeUndefined();
    expect(getErrno("EBUSY")).toBeUndefined();
    expect(getErrno(new Error("no code"))).toBeUndefined();
    expect(getErrno({ code: 42 })).toBeUndefined();
  });
});

describe("mapFsWriteError — EXTERNAL_EDITOR_CONFLICT branch", () => {
  const conflictErrnos = new Set(["EBUSY", "EPERM", "EACCES"]);

  test("an errno in conflictErrnos → CLI_REPORTED_ERROR with the file-locked details", () => {
    const err = mapFsWriteError(errnoError("EBUSY"), {
      relPath: "Notes/n.md",
      conflictErrnos,
      conflictVerb: "append to",
    });
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details).toEqual({
      code: "EXTERNAL_EDITOR_CONFLICT",
      reason: "file-locked",
      path: "Notes/n.md",
      errno: "EBUSY",
    });
    expect(err.message).toBe(
      'Cannot append to "Notes/n.md" — the file is held open by an external editor (EBUSY). Save and close the file in the editor, then retry.',
    );
    expect(err.cause).toBeInstanceOf(Error);
  });

  test("the conflictVerb is interpolated into the message", () => {
    const err = mapFsWriteError(errnoError("EPERM"), {
      relPath: "x.md",
      conflictErrnos,
      conflictVerb: "patch",
    });
    expect(err.message).toBe(
      'Cannot patch "x.md" — the file is held open by an external editor (EPERM). Save and close the file in the editor, then retry.',
    );
  });

  test("conflictErrnos is honoured — an errno NOT in the set falls through to FS_WRITE_FAILED", () => {
    // EACCES is absent from patch_block's set; it must NOT be classified as a conflict.
    const err = mapFsWriteError(errnoError("EACCES"), {
      relPath: "x.md",
      conflictErrnos: new Set(["EBUSY", "EPERM"]),
      conflictVerb: "patch",
    });
    expect(err.code).toBe("FS_WRITE_FAILED");
    expect(err.details).toMatchObject({ errno: "EACCES" });
  });
});

describe("mapFsWriteError — FS_WRITE_FAILED branch", () => {
  const conflictErrnos = new Set(["EBUSY", "EPERM"]);

  test("a non-conflict errno → FS_WRITE_FAILED with {errno, syscall, path} and no fsPath by default", () => {
    const err = mapFsWriteError(errnoError("ENOSPC", { syscall: "write", path: "/abs/x.md" }), {
      relPath: "x.md",
      conflictErrnos,
      conflictVerb: "patch",
    });
    expect(err.code).toBe("FS_WRITE_FAILED");
    expect(err.details).toEqual({ errno: "ENOSPC", syscall: "write", path: "x.md" });
    expect(err.message).toBe('Filesystem write failed: ENOSPC on write for "x.md"');
  });

  test("includeFsPath echoes the raw errno path as details.fsPath", () => {
    const err = mapFsWriteError(errnoError("ENOSPC", { syscall: "write", path: "/abs/x.md" }), {
      relPath: "x.md",
      conflictErrnos,
      conflictVerb: "patch",
      includeFsPath: true,
    });
    expect(err.details).toEqual({ errno: "ENOSPC", syscall: "write", path: "x.md", fsPath: "/abs/x.md" });
  });

  test("includeFsPath omits fsPath when the errno carries no path", () => {
    const err = mapFsWriteError(errnoError("EROFS"), {
      relPath: "x.md",
      conflictErrnos,
      conflictVerb: "patch",
      includeFsPath: true,
    });
    expect(err.details).toEqual({ errno: "EROFS", syscall: undefined, path: "x.md" });
    expect("fsPath" in (err.details as object)).toBe(false);
  });

  test("a non-errno throw maps to errno 'UNKNOWN'", () => {
    const err = mapFsWriteError(new Error("boom"), {
      relPath: "x.md",
      conflictErrnos,
      conflictVerb: "patch",
    });
    expect(err.code).toBe("FS_WRITE_FAILED");
    expect(err.details).toMatchObject({ errno: "UNKNOWN" });
    expect(err.message).toBe('Filesystem write failed: UNKNOWN for "x.md"');
  });
});
