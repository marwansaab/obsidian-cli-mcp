// Original — no upstream. Unit tests for the shared active/specific locator-resolution module (_active-file.ts, F1 of the thermo-nuclear code-quality review). Covers the byte-stable eval templates, the eval stdout parse idiom, focused-file active-mode resolution (happy + ERR_NO_ACTIVE_FILE + both parse-error stages), the reverse vault display-name lookup, the wikilink TSV resolver, the VAULT_NOT_FOUND remap, and the canonical-path / PATH_ESCAPES_VAULT guard.
import { resolve, sep } from "node:path";
import { Writable } from "node:stream";

import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
  assertCanonicalPath,
  decodeEvalEnvelope,
  evalParseFailureStdout,
  FOCUSED_FILE_TEMPLATE,
  FOCUSED_VAULT_TEMPLATE,
  parseEvalAnswer,
  parseFocusedVault,
  remapVaultNotFound,
  resolveActiveFocusedFile,
  resolveActiveLocatorWithVault,
  resolveFileByTsv,
  resolveVaultDisplayName,
  type EvalDeps,
} from "./_active-file.js";
import {
  EVAL_NONCE_SEAM,
  evalAnswerLine,
  LONG_NO_ANSWER,
  lookalike,
  NO_ANSWER,
  NOISE_AFTER,
  NOISE_BEFORE,
  TEST_EVAL_TAG,
} from "./_handler-test-fixtures.js";
import { makeRegistrationStubSpawn } from "./_registration-stub.js";
import { findTaggedEvalAnswer } from "../cli-adapter/eval-output.js";
import { UpstreamError } from "../errors.js";
import { createLogger, type Logger } from "../logger.js";
import { createQueue } from "../queue.js";

import type { VaultRegistry } from "../vault-registry/registry.js";

const sink = new Writable({ write(_chunk, _enc, cb) { cb(); } });

function evalDeps(stdout: string): EvalDeps {
  return {
    logger: createLogger({ stream: sink }),
    queue: createQueue(),
    ...EVAL_NONCE_SEAM,
    spawnFn: makeRegistrationStubSpawn({ stdout }),
  };
}

/** The `invokeCli` result for `stdout` under the test tag: the raw output plus its located answer. */
function tagged(stdout: string): { stdout: string; answer: string | null } {
  return { stdout, answer: findTaggedEvalAnswer(stdout, TEST_EVAL_TAG) };
}

const FOCUSED = JSON.stringify({ path: "Notes/a.md", base: "/vault" });

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

describe("parseEvalAnswer", () => {
  test("parses the call's tagged answer", () => {
    expect(parseEvalAnswer(tagged(evalAnswerLine('{"a":1}')))).toEqual({ a: 1 });
  });

  test("tolerates leading whitespace before the answer marker", () => {
    expect(parseEvalAnswer(tagged(`   ${evalAnswerLine('{"a":1}')}`))).toEqual({ a: 1 });
  });

  test("throws when the call carries no answer (bare JSON is not an answer)", () => {
    expect(() => parseEvalAnswer(tagged('{"a":1}'))).toThrow(SyntaxError);
    expect(() => parseEvalAnswer({ answer: null })).toThrow("eval output carries no answer for this call");
  });

  test("throws on invalid JSON (caller wraps the stage)", () => {
    expect(() => parseEvalAnswer(tagged(evalAnswerLine("not json{")))).toThrow();
  });

  // Spec 080 US1 / US4: plugin output around the tagged answer is ignored.
  test.each([
    ["before", `${NOISE_BEFORE}${evalAnswerLine('{"a":1}')}`],
    ["after", `${evalAnswerLine('{"a":1}')}${NOISE_AFTER}`],
    ["before and after", `${NOISE_BEFORE}${evalAnswerLine('{"a":1}')}${NOISE_AFTER}`],
  ])("plugin output %s the answer is ignored", (_where, stdout) => {
    expect(parseEvalAnswer(tagged(stdout))).toEqual({ a: 1 });
  });

  // Spec 080 US3: look-alikes never win.
  test("look-alikes before and after the tagged answer never win", () => {
    const stdout = `${lookalike('{"a":2}')}\n${evalAnswerLine('{"a":1}')}\n${lookalike('{"a":2}')}`;
    expect(parseEvalAnswer(tagged(stdout))).toEqual({ a: 1 });
  });

  test("a look-alike alone is a parse failure, never its own value", () => {
    expect(() => parseEvalAnswer(tagged(`${NO_ANSWER}${lookalike('{"a":2}')}`))).toThrow(SyntaxError);
  });
});

describe("evalParseFailureStdout (spec 080 FR-014)", () => {
  test("500 characters or fewer: stdout only, no stdoutTail", () => {
    const s = "y".repeat(500);
    expect(evalParseFailureStdout(s)).toStrictEqual({ stdout: s });
  });

  test("over 500 characters: the first 500 as stdout and the last 500 as stdoutTail", () => {
    const s = "a" + "y".repeat(499) + "z";
    expect(evalParseFailureStdout(s)).toStrictEqual({ stdout: s.slice(0, 500), stdoutTail: s.slice(-500) });
  });
});

describe("decodeEvalEnvelope (spec 080)", () => {
  const schema = z.object({ ok: z.literal(true), n: z.number() });
  const opts = { toolName: "links", malformedCode: "CLI_REPORTED_ERROR" as const };

  test("decodes the tagged answer behind plugin lines and look-alikes", () => {
    const stdout = `${NOISE_BEFORE}${lookalike('{"ok":true,"n":2}')}\n${evalAnswerLine('{"ok":true,"n":1}')}${NOISE_AFTER}`;
    expect(decodeEvalEnvelope(tagged(stdout), schema, opts)).toEqual({ ok: true, n: 1 });
  });

  test("a look-alike alone fails at json-parse with the raw output", () => {
    const stdout = `${NO_ANSWER}${lookalike('{"ok":true,"n":2}')}`;
    expect(() => decodeEvalEnvelope(tagged(stdout), schema, opts)).toThrow(
      expect.objectContaining({ code: "CLI_REPORTED_ERROR", details: { stage: "json-parse", stdout } }),
    );
  });

  test("json-parse on long output carries stdoutTail", () => {
    expect(() => decodeEvalEnvelope(tagged(LONG_NO_ANSWER), schema, opts)).toThrow(
      expect.objectContaining({
        details: { stage: "json-parse", stdout: LONG_NO_ANSWER.slice(0, 500), stdoutTail: LONG_NO_ANSWER.slice(-500) },
      }),
    );
  });

  test("envelope-parse on long output carries stdoutTail", () => {
    const stdout = `${LONG_NO_ANSWER}\n${evalAnswerLine('{"ok":false}')}`;
    expect(() => decodeEvalEnvelope(tagged(stdout), schema, opts)).toThrow(
      expect.objectContaining({
        details: { stage: "envelope-parse", stdout: stdout.slice(0, 500), stdoutTail: stdout.slice(-500) },
      }),
    );
  });
});

describe("resolveActiveFocusedFile", () => {
  test("returns {vaultRoot, relPath} on a well-formed focused-file envelope", async () => {
    const deps = evalDeps(`=> ${TEST_EVAL_TAG}{"path":"Notes/a.md","base":"/vault"}`);
    await expect(resolveActiveFocusedFile(deps, "write_note")).resolves.toEqual({
      vaultRoot: "/vault",
      relPath: "Notes/a.md",
    });
  });

  test("throws ERR_NO_ACTIVE_FILE with the tool-named message when no file is focused", async () => {
    const deps = evalDeps(`=> ${TEST_EVAL_TAG}{"path":null,"base":"/vault"}`);
    await expect(resolveActiveFocusedFile(deps, "patch_block")).rejects.toMatchObject({
      code: "ERR_NO_ACTIVE_FILE",
      message:
        "No active file in Obsidian. Open a note in the editor, or call patch_block with target_mode=specific + vault + file/path.",
    });
  });

  test("throws CLI_REPORTED_ERROR stage:json-parse on unparseable eval stdout", async () => {
    const deps = evalDeps(`=> ${TEST_EVAL_TAG}definitely not json {`);
    await expect(resolveActiveFocusedFile(deps, "prepend")).rejects.toMatchObject({
      code: "CLI_REPORTED_ERROR",
      details: { stage: "json-parse" },
    });
  });

  test("throws CLI_REPORTED_ERROR stage:envelope-parse on a wrong-shape envelope", async () => {
    const deps = evalDeps(`=> ${TEST_EVAL_TAG}{"unexpected":true}`);
    await expect(resolveActiveFocusedFile(deps, "append_note")).rejects.toMatchObject({
      code: "CLI_REPORTED_ERROR",
      details: { stage: "envelope-parse" },
    });
  });

  // Spec 080 US1 / US4: plugin output around the tagged answer is ignored.
  test.each([
    ["before", `${NOISE_BEFORE}${evalAnswerLine(FOCUSED)}`],
    ["after", `${evalAnswerLine(FOCUSED)}${NOISE_AFTER}`],
    ["before and after", `${NOISE_BEFORE}${evalAnswerLine(FOCUSED)}${NOISE_AFTER}`],
  ])("plugin output %s the answer gives the normal locator", async (_where, stdout) => {
    await expect(resolveActiveFocusedFile(evalDeps(stdout), "write_note")).resolves.toEqual({
      vaultRoot: "/vault",
      relPath: "Notes/a.md",
    });
  });

  // Spec 080 §3: the full output is already attached here, so no stdoutTail.
  test("long output with no answer fails at json-parse with the full stdout and no stdoutTail", async () => {
    await expect(resolveActiveFocusedFile(evalDeps(LONG_NO_ANSWER), "write_note")).rejects.toSatisfy(
      (e: UpstreamError) =>
        e.code === "CLI_REPORTED_ERROR" &&
        e.details.stage === "json-parse" &&
        e.details.stdout === LONG_NO_ANSWER &&
        !("stdoutTail" in e.details),
    );
  });
});

describe("parseFocusedVault", () => {
  test("parses the JSON-encoded-string (double-encoded) envelope form", () => {
    const r = parseFocusedVault(tagged(`=> ${TEST_EVAL_TAG}"{\\"path\\":\\"Notes/a.md\\",\\"base\\":\\"/vault\\"}"`));
    expect(r).toEqual({ ok: true, parsed: { path: "Notes/a.md", base: "/vault" } });
  });

  test("parses the bare-object form", () => {
    const r = parseFocusedVault(tagged(`=> ${TEST_EVAL_TAG}{"path":null,"base":"/vault"}`));
    expect(r).toEqual({ ok: true, parsed: { path: null, base: "/vault" } });
  });

  test("coerces a non-string path to null", () => {
    const r = parseFocusedVault(tagged(`=> ${TEST_EVAL_TAG}{"path":123,"base":"/vault"}`));
    expect(r).toEqual({ ok: true, parsed: { path: null, base: "/vault" } });
  });

  test("ok:false stage:json-parse when the outer stdout is unparseable", () => {
    expect(parseFocusedVault(tagged(`=> ${TEST_EVAL_TAG}not json {`))).toMatchObject({ ok: false, stage: "json-parse" });
  });

  test("ok:false stage:envelope-parse when the inner string is not JSON", () => {
    expect(parseFocusedVault(tagged(`=> ${TEST_EVAL_TAG}"not json {"`))).toMatchObject({
      ok: false,
      stage: "envelope-parse",
    });
  });

  test("ok:false stage:envelope-parse on a wrong-shape object (no string base)", () => {
    expect(parseFocusedVault(tagged(`=> ${TEST_EVAL_TAG}{"unexpected":true}`))).toMatchObject({
      ok: false,
      stage: "envelope-parse",
    });
  });

  // Spec 080 US1 / US4: plugin output around the tagged answer is ignored.
  test.each([
    ["before", `${NOISE_BEFORE}${evalAnswerLine(FOCUSED)}`],
    ["after", `${evalAnswerLine(FOCUSED)}${NOISE_AFTER}`],
    ["before and after", `${NOISE_BEFORE}${evalAnswerLine(FOCUSED)}${NOISE_AFTER}`],
  ])("plugin output %s the answer gives the normal parse", (_where, stdout) => {
    expect(parseFocusedVault(tagged(stdout))).toEqual({ ok: true, parsed: { path: "Notes/a.md", base: "/vault" } });
  });

  // Spec 080 US3: look-alikes never win.
  test("look-alikes before and after the tagged answer never win", () => {
    const other = JSON.stringify({ path: "Other.md", base: "/elsewhere" });
    const stdout = `${lookalike(other)}\n${evalAnswerLine(FOCUSED)}\n${lookalike(other)}`;
    expect(parseFocusedVault(tagged(stdout))).toEqual({ ok: true, parsed: { path: "Notes/a.md", base: "/vault" } });
  });

  test("a look-alike alone is a json-parse failure", () => {
    const other = JSON.stringify({ path: "Other.md", base: "/elsewhere" });
    expect(parseFocusedVault(tagged(`${NO_ANSWER}${lookalike(other)}`))).toMatchObject({ ok: false, stage: "json-parse" });
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
      resolveActiveLocatorWithVault(depsWithRegistry(`=> ${TEST_EVAL_TAG}{"path":"Notes/a.md","base":"/vault"}`, registry), "patch_block"),
    ).resolves.toEqual({ vaultRoot: "/vault", relPath: "Notes/a.md", vaultDisplayName: "My Vault" });
  });

  test("falls back to the base path when the registry has no display name", async () => {
    const registry = { resolveVaultPath: async () => "/vault" } as unknown as VaultRegistry;
    await expect(
      resolveActiveLocatorWithVault(depsWithRegistry(`=> ${TEST_EVAL_TAG}{"path":"Notes/a.md","base":"/vault"}`, registry), "append_note"),
    ).resolves.toEqual({ vaultRoot: "/vault", relPath: "Notes/a.md", vaultDisplayName: "/vault" });
  });

  test("propagates ERR_NO_ACTIVE_FILE with the tool-named message when no file is focused", async () => {
    const registry = { resolveVaultPath: async () => "/vault" } as unknown as VaultRegistry;
    await expect(
      resolveActiveLocatorWithVault(depsWithRegistry(`=> ${TEST_EVAL_TAG}{"path":null,"base":"/vault"}`, registry), "prepend"),
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
