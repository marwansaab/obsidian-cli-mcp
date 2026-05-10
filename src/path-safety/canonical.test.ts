// Original — no upstream. Tests for the runtime canonical-path check per ADR-009 / FR-014 — verifies the resolved absolute path lies under vaultRoot, with realpath-based symlink follow + ENOENT lexical fallback.
import { resolve, sep } from "node:path";

import { expect, test } from "vitest";

import { checkCanonicalPath } from "./canonical.js";

// Use path.resolve to make expectations OS-portable (POSIX uses '/'; Windows uses backslash + drive prefix).
const VAULT_ROOT = resolve("/vault");

function enoent(): NodeJS.ErrnoException {
  const e = new Error("ENOENT") as NodeJS.ErrnoException;
  e.code = "ENOENT";
  return e;
}

// (1) Input resolves under vault root (no symlinks) → ok=true with resolved path
test("input resolves under vault root → ok=true", async () => {
  const realpath = async (p: string): Promise<string> => p; // identity (no symlinks)
  const result = await checkCanonicalPath(VAULT_ROOT, "Sandbox/note.md", { realpath });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.resolvedPath).toBe(resolve(VAULT_ROOT, "Sandbox", "note.md"));
  }
});

// (2) Input resolves OUT of vault root via symlink in parent dir → ok=false
test("symlink-to-outside via parent dir → ok=false", async () => {
  const escapeTarget = resolve("/etc");
  const escapeLink = resolve(VAULT_ROOT, "escape");
  const realpath = async (p: string): Promise<string> => {
    if (p === VAULT_ROOT) return VAULT_ROOT;
    if (p === escapeLink) return escapeTarget;
    return p;
  };
  const result = await checkCanonicalPath(VAULT_ROOT, "escape/passwd.md", { realpath });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.attemptedPath).toBe("escape/passwd.md");
    expect(result.resolvedPath).toBe(`${escapeTarget}${sep}passwd.md`);
  }
});

// (3) Input's parent dir doesn't exist (ENOENT) → lexical fallback returns ok=true
test("ENOENT on parent realpath → lexical fallback returns ok=true", async () => {
  const realpath = async (p: string): Promise<string> => {
    if (p === VAULT_ROOT) return VAULT_ROOT;
    throw enoent();
  };
  const result = await checkCanonicalPath(VAULT_ROOT, "Daily/2026/05/note.md", { realpath });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.resolvedPath).toBe(
      resolve(VAULT_ROOT, "Daily", "2026", "05", "note.md"),
    );
  }
});

// (4) Realpath on nested-existing-symlink dir → canonical path checked correctly
test("nested-existing-symlink dir canonicalised via realpath", async () => {
  const linkParent = resolve(VAULT_ROOT, "link", "sub");
  const realParent = resolve(VAULT_ROOT, "real", "sub");
  const realpath = async (p: string): Promise<string> => {
    if (p === VAULT_ROOT) return VAULT_ROOT;
    if (p === linkParent) return realParent;
    return p;
  };
  const result = await checkCanonicalPath(VAULT_ROOT, "link/sub/note.md", { realpath });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.resolvedPath).toBe(`${realParent}${sep}note.md`);
  }
});

// (5) Vault root itself is a symlink → realpath canonicalises both root and target; check still works
test("vault root is a symlink → both root and parent canonicalised", async () => {
  const SYMLINK_ROOT = resolve("/symlink-vault");
  const REAL_ROOT = resolve("/real-vault");
  const symlinkParent = resolve(SYMLINK_ROOT, "Sandbox");
  const realParent = resolve(REAL_ROOT, "Sandbox");
  const realpath = async (p: string): Promise<string> => {
    if (p === SYMLINK_ROOT) return REAL_ROOT;
    if (p === symlinkParent) return realParent;
    return p;
  };
  const result = await checkCanonicalPath(SYMLINK_ROOT, "Sandbox/note.md", { realpath });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.resolvedPath).toBe(`${realParent}${sep}note.md`);
  }
});

// (6) resolvedPath returned by ok=true branch is an absolute path under vault root
test("ok=true resolvedPath is absolute and rooted at vault", async () => {
  const realpath = async (p: string): Promise<string> => p;
  const result = await checkCanonicalPath(VAULT_ROOT, "Sandbox/note.md", { realpath });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.resolvedPath.startsWith(VAULT_ROOT + sep)).toBe(true);
  }
});

// (7) attemptedPath in ok=false branch echoes input verbatim (for FR-029 logger event)
test("ok=false attemptedPath echoes input verbatim", async () => {
  const escapeLink = resolve(VAULT_ROOT, "escape");
  const realpath = async (p: string): Promise<string> => {
    if (p === VAULT_ROOT) return VAULT_ROOT;
    if (p === escapeLink) return resolve("/elsewhere");
    return p;
  };
  const inputPath = "escape/diagnostic.md";
  const result = await checkCanonicalPath(VAULT_ROOT, inputPath, { realpath });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.attemptedPath).toBe(inputPath);
  }
});

// (8) Non-ENOENT realpath error (e.g. EACCES) → propagates as-is (caller maps to FS_WRITE_FAILED)
test("non-ENOENT realpath error propagates as-is", async () => {
  const eaccess = new Error("EACCES") as NodeJS.ErrnoException;
  eaccess.code = "EACCES";
  const realpath = async (): Promise<string> => {
    throw eaccess;
  };
  await expect(
    checkCanonicalPath(VAULT_ROOT, "Sandbox/note.md", { realpath }),
  ).rejects.toBe(eaccess);
});
