// Original — no upstream. Unit tests for the shared active/specific locator-resolution module (_active-file.ts, F1 of the thermo-nuclear code-quality review). Covers the byte-stable eval templates, the eval stdout parse idiom, focused-file active-mode resolution (happy + ERR_NO_ACTIVE_FILE + both parse-error stages), the reverse vault display-name lookup, the wikilink TSV resolver, the VAULT_NOT_FOUND remap, and the canonical-path / PATH_ESCAPES_VAULT guard.
import { resolve, sep } from "node:path";
import { Writable } from "node:stream";

import { describe, expect, test } from "vitest";

import {
  assertCanonicalPath,
  FOCUSED_FILE_TEMPLATE,
  FOCUSED_VAULT_TEMPLATE,
  parseEvalStdout,
  remapVaultNotFound,
  resolveActiveFocusedFile,
  resolveFileByTsv,
  resolveVaultDisplayName,
  type EvalDeps,
} from "./_active-file.js";
import { makeRegistrationStubSpawn } from "./_registration-stub.js";
import { UpstreamError } from "../errors.js";
import { createLogger, type Logger } from "../logger.js";
import { createQueue } from "../queue.js";

import type { VaultRegistry } from "../vault-registry/registry.js";

const sink = new Writable({ write(_chunk, _enc, cb) { cb(); } });

function evalDeps(stdout: string): EvalDeps {
  return {
    logger: createLogger({ stream: sink }),
    queue: createQueue(),
    spawnFn: makeRegistrationStubSpawn({ stdout }),
  };
}

// A logger that records only the pathEscapeAttempt events (the sole method
// assertCanonicalPath touches). Cast through unknown — the guard never calls
// any other Logger method on these paths.
function recordingLogger(): { logger: Logger; events: Array<{ vault: string | null; attemptedPath: string }> } {
  const events: Array<{ vault: string | null; attemptedPath: string }> = [];
  const logger = {
    pathEscapeAttempt: (e: { vault: string | null; attemptedPath: string }) => events.push(e),
  } as unknown as Logger;
  return { logger, events };
}

const identityRealpath = (p: string): Promise<string> => Promise.resolve(p);

describe("eval templates are byte-stable", () => {
  test("FOCUSED_FILE_TEMPLATE matches the frozen focused-file string", () => {
    expect(FOCUSED_FILE_TEMPLATE).toBe(
      "(async()=>{const f=app.workspace.getActiveFile();return JSON.stringify({path:f?.path??null,base:app.vault.adapter.basePath});})()",
    );
  });

  test("FOCUSED_VAULT_TEMPLATE matches the frozen focused-vault string", () => {
    expect(FOCUSED_VAULT_TEMPLATE).toBe(
      "(async()=>JSON.stringify({path:app.workspace.getActiveFile()?.path??null,base:app.vault.adapter.basePath}))()",
    );
  });
});

describe("parseEvalStdout", () => {
  test("strips the '=> ' echo prefix before parsing", () => {
    expect(parseEvalStdout('=> {"a":1}')).toEqual({ a: 1 });
  });

  test("parses bare JSON with no prefix", () => {
    expect(parseEvalStdout('{"a":1}')).toEqual({ a: 1 });
  });

  test("tolerates leading whitespace before the prefix", () => {
    expect(parseEvalStdout('   => {"a":1}')).toEqual({ a: 1 });
  });

  test("throws on invalid JSON (caller wraps the stage)", () => {
    expect(() => parseEvalStdout("=> not json{")).toThrow();
  });
});

describe("resolveActiveFocusedFile", () => {
  test("returns {vaultRoot, relPath} on a well-formed focused-file envelope", async () => {
    const deps = evalDeps('=> {"path":"Notes/a.md","base":"/vault"}');
    await expect(resolveActiveFocusedFile(deps, "write_note")).resolves.toEqual({
      vaultRoot: "/vault",
      relPath: "Notes/a.md",
    });
  });

  test("throws ERR_NO_ACTIVE_FILE with the tool-named message when no file is focused", async () => {
    const deps = evalDeps('=> {"path":null,"base":"/vault"}');
    await expect(resolveActiveFocusedFile(deps, "patch_block")).rejects.toMatchObject({
      code: "ERR_NO_ACTIVE_FILE",
      message:
        "No active file in Obsidian. Open a note in the editor, or call patch_block with target_mode=specific + vault + file/path.",
    });
  });

  test("throws CLI_REPORTED_ERROR stage:json-parse on unparseable eval stdout", async () => {
    const deps = evalDeps("=> definitely not json {");
    await expect(resolveActiveFocusedFile(deps, "prepend")).rejects.toMatchObject({
      code: "CLI_REPORTED_ERROR",
      details: { stage: "json-parse" },
    });
  });

  test("throws CLI_REPORTED_ERROR stage:envelope-parse on a wrong-shape envelope", async () => {
    const deps = evalDeps('=> {"unexpected":true}');
    await expect(resolveActiveFocusedFile(deps, "append_note")).rejects.toMatchObject({
      code: "CLI_REPORTED_ERROR",
      details: { stage: "envelope-parse" },
    });
  });
});

describe("resolveVaultDisplayName", () => {
  test("returns the registry display name when one resolves", () => {
    const registry = {
      resolveVaultPath: async () => "/vault",
      resolveVaultDisplayName: (base: string) => (base === "/vault" ? "My Vault" : null),
    } as unknown as VaultRegistry;
    expect(resolveVaultDisplayName(registry, "/vault")).toBe("My Vault");
  });

  test("falls back to the base path when the registry returns null", () => {
    const registry = {
      resolveVaultPath: async () => "/vault",
      resolveVaultDisplayName: () => null,
    } as unknown as VaultRegistry;
    expect(resolveVaultDisplayName(registry, "/vault")).toBe("/vault");
  });

  test("falls back to the base path when the registry omits the method (pre-F3 stub)", () => {
    const registry = { resolveVaultPath: async () => "/vault" } as unknown as VaultRegistry;
    expect(resolveVaultDisplayName(registry, "/vault")).toBe("/vault");
  });
});

describe("resolveFileByTsv", () => {
  test("extracts the path line from the file subcommand TSV", async () => {
    const deps = evalDeps("name\tFoo\npath\tNotes/Foo.md\n");
    await expect(resolveFileByTsv(deps, "MyVault", "Foo", "append_note")).resolves.toBe(
      "Notes/Foo.md",
    );
  });

  test("throws CLI_REPORTED_ERROR stage:file-tsv-parse with the tool name when no path line is present", async () => {
    const deps = evalDeps("name\tFoo\n");
    await expect(resolveFileByTsv(deps, "MyVault", "Foo", "prepend")).rejects.toMatchObject({
      code: "CLI_REPORTED_ERROR",
      details: { stage: "file-tsv-parse" },
      message: 'prepend: file subcommand stdout did not contain a path line',
    });
  });
});

describe("remapVaultNotFound", () => {
  test("remaps a registry VALIDATION_ERROR to CLI_REPORTED_ERROR/VAULT_NOT_FOUND", () => {
    const registryErr = new UpstreamError({ code: "VALIDATION_ERROR", cause: null, details: {} });
    try {
      remapVaultNotFound(registryErr, "Ghost", "query_base");
      throw new Error("expected remapVaultNotFound to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(UpstreamError);
      const u = err as UpstreamError;
      expect(u.code).toBe("CLI_REPORTED_ERROR");
      expect(u.details).toMatchObject({ code: "VAULT_NOT_FOUND", reason: "unknown", vault: "Ghost" });
      expect(u.message).toBe('query_base: vault "Ghost" is not registered');
      expect(u.cause).toBe(registryErr);
    }
  });

  test("rethrows a non-VALIDATION_ERROR UpstreamError unchanged", () => {
    const other = new UpstreamError({ code: "CLI_TIMEOUT", cause: null, details: {} });
    expect(() => remapVaultNotFound(other, "MyVault", "find_and_replace")).toThrow(other);
  });

  test("rethrows a plain Error unchanged", () => {
    const plain = new Error("boom");
    expect(() => remapVaultNotFound(plain, "MyVault", "find_and_replace")).toThrow(plain);
  });
});

describe("assertCanonicalPath", () => {
  const vaultRoot = resolve("fixture-vault");

  test("returns the canonical absolute path for an in-vault relative input", async () => {
    const { logger, events } = recordingLogger();
    const abs = await assertCanonicalPath(vaultRoot, "Notes/a.md", {
      realpath: identityRealpath,
      logger,
      vaultLabel: "MyVault",
    });
    expect(abs).toBe(resolve(vaultRoot, "Notes/a.md"));
    expect(events).toHaveLength(0);
  });

  test("logs pathEscapeAttempt and throws PATH_ESCAPES_VAULT on an escaping input", async () => {
    const { logger, events } = recordingLogger();
    await expect(
      assertCanonicalPath(vaultRoot, "../escape.md", {
        realpath: identityRealpath,
        logger,
        vaultLabel: "MyVault",
      }),
    ).rejects.toMatchObject({
      code: "PATH_ESCAPES_VAULT",
      details: { vault: "MyVault", attemptedPath: "../escape.md" },
    });
    expect(events).toEqual([{ vault: "MyVault", attemptedPath: "../escape.md" }]);
  });

  test("honours attemptedPathLabel for the logged + echoed escape label", async () => {
    const { logger, events } = recordingLogger();
    await expect(
      assertCanonicalPath(vaultRoot, ["..", "escape.md"].join(sep), {
        realpath: identityRealpath,
        logger,
        vaultLabel: null,
        attemptedPathLabel: "../escape.md",
      }),
    ).rejects.toMatchObject({
      code: "PATH_ESCAPES_VAULT",
      details: { vault: null, attemptedPath: "../escape.md" },
    });
    expect(events).toEqual([{ vault: null, attemptedPath: "../escape.md" }]);
  });
});
