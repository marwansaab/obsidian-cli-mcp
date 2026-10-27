// Original — no upstream. Tests for the runtime canonical-path check per ADR-009 / FR-014 — verifies the resolved absolute path lies under vaultRoot, with realpath resolving the nearest existing ancestor (spec 068 R5): fake-realpath unit cases plus real temp-dir symlink/junction cases.
import * as nodeFs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

import { afterAll, beforeAll, describe, expect, it, test } from "vitest";

import { checkCanonicalPath } from "./canonical.js";

// Use path.resolve to make expectations OS-portable (POSIX uses '/'; Windows uses backslash + drive prefix).
const VAULT_ROOT = resolve("/vault");

function enoent(): NodeJS.ErrnoException {
  const e = new Error("ENOENT") as NodeJS.ErrnoException;
  e.code = "ENOENT";
  return e;
}

/**
 * Fake realpath that behaves like the real one for existing paths: the longest
 * mapped link prefix is replaced by its target, and every other path resolves to itself.
 */
function linkRealpath(links: Record<string, string>) {
  return async (p: string): Promise<string> => {
    const prefix = Object.keys(links)
      .filter((l) => p === l || p.startsWith(l + sep))
      .sort((a, b) => b.length - a.length)[0];
    return prefix === undefined ? p : links[prefix]! + p.slice(prefix.length);
  };
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
  const realpath = linkRealpath({ [escapeLink]: escapeTarget });
  const result = await checkCanonicalPath(VAULT_ROOT, "escape/passwd.md", { realpath });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.attemptedPath).toBe("escape/passwd.md");
    expect(result.resolvedPath).toBe(`${escapeTarget}${sep}passwd.md`);
  }
});

// (3) Input's parent dirs don't exist (ENOENT) → walk up to the root, re-append the missing segments, ok=true
test("ENOENT on missing dirs → nearest existing ancestor + missing segments, ok=true", async () => {
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
  const realpath = linkRealpath({ [linkParent]: realParent });
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
  const realParent = resolve(REAL_ROOT, "Sandbox");
  const realpath = linkRealpath({ [SYMLINK_ROOT]: REAL_ROOT });
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
  const realpath = linkRealpath({ [escapeLink]: resolve("/elsewhere") });
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

// Real-filesystem containment cases (spec 068 US2 / SC-002). A directory link is a junction on
// Windows (no admin or Developer Mode needed) and a `dir` symlink elsewhere.
describe("real filesystem: nearest-existing-ancestor containment", () => {
  const isWin = process.platform === "win32";
  const deps = { realpath: (p: string) => nodeFs.realpath(p) };
  let base: string;
  let vault: string;
  let outside: string;

  beforeAll(async () => {
    base = await nodeFs.mkdtemp(join(tmpdir(), "canonical-"));
    vault = join(base, "Vault");
    outside = join(base, "outside");
    await nodeFs.mkdir(join(vault, "Existing"), { recursive: true });
    await nodeFs.mkdir(join(outside, "Existing"), { recursive: true });
    await nodeFs.mkdir(join(base, "Vault2"), { recursive: true });
    await nodeFs.symlink(outside, join(vault, "Linked"), isWin ? "junction" : "dir");
  });

  afterAll(async () => {
    await nodeFs.rm(base, { recursive: true, force: true });
  });

  it.each([
    ["link to outside with an existing child", "Linked/Existing/Note.md"],
    ["link to outside with a missing child", "Linked/New/Note.md"],
    ["link to outside with two missing levels", "Linked/New/Deeper/Note.md"],
    ["'..' that leaves the vault", "../outside/Note.md"],
    ["prefix-named sibling vault", "../Vault2/Note.md"],
  ])("%s → escape", async (_label, input) => {
    const result = await checkCanonicalPath(vault, input, deps);
    expect(result.ok).toBe(false);
  });

  it("ordinary new nested folder inside the vault → allowed", async () => {
    const result = await checkCanonicalPath(vault, "Existing/New/Deeper/Note.md", deps);
    expect(result).toEqual({
      ok: true,
      resolvedPath: join(await nodeFs.realpath(vault), "Existing", "New", "Deeper", "Note.md"),
    });
  });

  it.runIf(isWin)("mixed-case vault root argument → in-vault write allowed, junction escape still caught", async () => {
    const mixedRoot = join(base, "VAULT");
    const inside = await checkCanonicalPath(mixedRoot, "Existing/New/Note.md", deps);
    expect(inside.ok).toBe(true);
    const escape = await checkCanonicalPath(mixedRoot, "Linked/New/Note.md", deps);
    expect(escape.ok).toBe(false);
  });
});
