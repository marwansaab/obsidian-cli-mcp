// Original — no upstream. Unit tests for the shared active/specific locator-resolution module (_active-file.ts, F1 of the thermo-nuclear code-quality review). Covers the byte-stable eval templates, the eval answer decoders (spec 080: the tagged answer, noise ignored, parse errors with the stdout excerpt), focused-file active-mode resolution (happy + ERR_NO_ACTIVE_FILE + both parse-error stages), the reverse vault display-name lookup, the wikilink TSV resolver, the VAULT_NOT_FOUND remap, and the canonical-path / PATH_ESCAPES_VAULT guard.
import { resolve, sep } from "node:path";
import { Writable } from "node:stream";

import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
  assertCanonicalPath,
  decodeEvalEnvelope,
  FOCUSED_FILE_TEMPLATE,
  FOCUSED_VAULT_TEMPLATE,
  parseFocusedVault,
  remapVaultNotFound,
  resolveActiveFocusedFile,
  resolveActiveLocatorWithVault,
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

describe("decodeEvalEnvelope", () => {
  const schema = z.object({ ok: z.literal(true), count: z.number() });
  const opts = { toolName: "links", malformedCode: "CLI_REPORTED_ERROR" } as const;

  test("parses the call's answer, ignoring the rest of stdout", () => {
    const stdout = 'plugin line\n=> {"ok":false}\n=> <<ocm-t>>{"ok":true,"count":2}\n';
    expect(decodeEvalEnvelope({ stdout, answer: '{"ok":true,"count":2}' }, schema, opts)).toEqual({ ok: true, count: 2 });
  });

  test("no answer → json-parse with the stdout excerpt and length (a bare-JSON stdout is not an answer)", () => {
    const stdout = '{"ok":true,"count":2}';
    expect(() => decodeEvalEnvelope({ stdout, answer: null }, schema, opts)).toThrow(
      expect.objectContaining({
        code: "CLI_REPORTED_ERROR",
        details: { stage: "json-parse", stdout, stdoutLength: stdout.length },
      }),
    );
  });

  test("invalid JSON answer → json-parse; wrong shape → envelope-parse, both with the excerpt", () => {
    const stdout = "=> <<ocm-t>>not json{\n";
    expect(() => decodeEvalEnvelope({ stdout, answer: "not json{" }, schema, opts)).toThrow(
      expect.objectContaining({ details: { stage: "json-parse", stdout, stdoutLength: stdout.length } }),
    );
    expect(() =>
      decodeEvalEnvelope({ stdout, answer: '{"ok":true}' }, schema, { toolName: "open_file", malformedCode: "INTERNAL_ERROR" }),
    ).toThrow(
      expect.objectContaining({
        code: "INTERNAL_ERROR",
        details: { stage: "envelope-parse", stdout, stdoutLength: stdout.length },
      }),
    );
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

  test("ignores plugin output and look-alikes around the call's answer (spec 080)", async () => {
    const deps: EvalDeps = {
      ...evalDeps(""),
      spawnFn: makeRegistrationStubSpawn({
        stdout: ({ answerTag }) =>
          `plugin loaded\n=> {"path":"Decoy.md","base":"/decoy"}\n=> <<${answerTag}>>{"path":"Notes/a.md","base":"/vault"}\nbye\n`,
      }),
    };
    await expect(resolveActiveFocusedFile(deps, "write_note")).resolves.toEqual({
      vaultRoot: "/vault",
      relPath: "Notes/a.md",
    });
  });

  test("json-parse carries the stdout excerpt and length when no line carries the call's tag", async () => {
    const stdout = 'plugin loaded\n=> {"path":"Notes/a.md","base":"/vault"}\n';
    const deps: EvalDeps = { ...evalDeps(""), spawnFn: makeRegistrationStubSpawn({ stdout: () => stdout }) };
    await expect(resolveActiveFocusedFile(deps, "read")).rejects.toMatchObject({
      code: "CLI_REPORTED_ERROR",
      details: { stage: "json-parse", stdout, stdoutLength: stdout.length },
    });
  });

  test("E5: envelope-parse carries the stdout excerpt and length alongside parsed", async () => {
    const err = (await resolveActiveFocusedFile(evalDeps('=> {"unexpected":true}\n'), "append_note").catch(
      (e: unknown) => e,
    )) as UpstreamError;
    expect(err.details).toEqual({
      stage: "envelope-parse",
      parsed: { unexpected: true },
      stdout: expect.stringMatching(/^=> <<ocm-[^>]+>>\{"unexpected":true\}\n$/),
      stdoutLength: (err.details.stdout as string).length,
    });
  });
});

describe("parseFocusedVault", () => {
  test("parses the JSON-encoded-string (double-encoded) envelope form", () => {
    const answer = '"{\\"path\\":\\"Notes/a.md\\",\\"base\\":\\"/vault\\"}"';
    const r = parseFocusedVault({ stdout: `=> <<ocm-t>>${answer}`, answer });
    expect(r).toEqual({ ok: true, parsed: { path: "Notes/a.md", base: "/vault" } });
  });

  test("parses the bare-object form", () => {
    const r = parseFocusedVault({ stdout: "", answer: '{"path":null,"base":"/vault"}' });
    expect(r).toEqual({ ok: true, parsed: { path: null, base: "/vault" } });
  });

  test("coerces a non-string path to null", () => {
    const r = parseFocusedVault({ stdout: "", answer: '{"path":123,"base":"/vault"}' });
    expect(r).toEqual({ ok: true, parsed: { path: null, base: "/vault" } });
  });

  test("ok:false stage:json-parse when the answer is unparseable or absent", () => {
    expect(parseFocusedVault({ stdout: "", answer: "not json {" })).toMatchObject({ ok: false, stage: "json-parse" });
    expect(parseFocusedVault({ stdout: '=> {"path":null,"base":"/vault"}', answer: null })).toMatchObject({
      ok: false,
      stage: "json-parse",
    });
  });

  test("ok:false stage:envelope-parse when the inner string is not JSON", () => {
    expect(parseFocusedVault({ stdout: "", answer: '"not json {"' })).toMatchObject({ ok: false, stage: "envelope-parse" });
  });

  test("ok:false stage:envelope-parse on a wrong-shape object (no string base)", () => {
    expect(parseFocusedVault({ stdout: "", answer: '{"unexpected":true}' })).toMatchObject({
      ok: false,
      stage: "envelope-parse",
    });
  });
});

describe("resolveActiveLocatorWithVault", () => {
  function depsWithRegistry(stdout: string, registry: VaultRegistry): EvalDeps & { vaultRegistry: VaultRegistry } {
    return { ...evalDeps(stdout), vaultRegistry: registry };
  }

  test("returns {vaultRoot, relPath, vaultDisplayName} with the registry display name", async () => {
    const registry = {
      resolveVaultPath: async () => "/vault",
      resolveVaultDisplayName: (base: string) => (base === "/vault" ? "My Vault" : null),
    } as unknown as VaultRegistry;
    await expect(
      resolveActiveLocatorWithVault(depsWithRegistry('=> {"path":"Notes/a.md","base":"/vault"}', registry), "patch_block"),
    ).resolves.toEqual({ vaultRoot: "/vault", relPath: "Notes/a.md", vaultDisplayName: "My Vault" });
  });

  test("falls back to the base path when the registry has no display name", async () => {
    const registry = { resolveVaultPath: async () => "/vault" } as unknown as VaultRegistry;
    await expect(
      resolveActiveLocatorWithVault(depsWithRegistry('=> {"path":"Notes/a.md","base":"/vault"}', registry), "append_note"),
    ).resolves.toEqual({ vaultRoot: "/vault", relPath: "Notes/a.md", vaultDisplayName: "/vault" });
  });

  test("propagates ERR_NO_ACTIVE_FILE with the tool-named message when no file is focused", async () => {
    const registry = { resolveVaultPath: async () => "/vault" } as unknown as VaultRegistry;
    await expect(
      resolveActiveLocatorWithVault(depsWithRegistry('=> {"path":null,"base":"/vault"}', registry), "prepend"),
    ).rejects.toMatchObject({
      code: "ERR_NO_ACTIVE_FILE",
      message:
        "No active file in Obsidian. Open a note in the editor, or call prepend with target_mode=specific + vault + file/path.",
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
