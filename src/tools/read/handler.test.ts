// Original — no upstream. Tests for the read handler — schema-typed input → invokeCli → text envelope; bounds-via-dispatchCli failures surface verbatim; spec 070 file-type support (notes, canvases, bases) and file/active target resolution; spec 074 exact content (the CLI's added final line feed dropped, its removed byte-order mark restored, from the note's bytes on disk) and the disk-read failure.
import { join } from "node:path";

import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { executeReadNote, type ReadFs } from "./handler.js";
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
  stubVaultRegistry,
} from "../_handler-test-fixtures.js";

import type { SpawnLike } from "../../cli-adapter/_dispatch.js";

const ROOT = "/registry/MyVault";

/** An fs stub whose readFile returns `disk` (the note's bytes on disk) for any path. */
function diskFs(disk: string | Buffer = "") {
  return { readFile: vi.fn(async (_p: string) => Buffer.from(disk)) } satisfies ReadFs;
}

function deps(spawnFn: SpawnLike, fs: ReadFs = diskFs()) {
  return {
    logger: silentLogger(),
    queue: createQueue(),
    spawnFn,
    env: {},
    vaultRegistry: stubVaultRegistry("MyVault", ROOT),
    fs,
  };
}

function pendingRejection<T>(p: Promise<T>): Promise<UpstreamError> {
  return p.then(
    () => { throw new Error("expected rejection but promise resolved"); },
    (e: unknown) => {
      if (!(e instanceof UpstreamError)) throw new Error(`expected UpstreamError, got ${String(e)}`);
      return e;
    },
  );
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// --- US1: specific + file (happy + boundary) ---

test("US1 specific+file invokes adapter and returns content (Story 1 AC#1)", async () => {
  const stdoutText = "# Recipe\n\nIngredients...\n";
  const { spawnFn, recorded } = makeQueuedSpawn([
    fileTsvResponse("Cooking/Recipe.md"),
    { stdout: stdoutText, exitCode: 0 },
  ]);
  const result = await executeReadNote(
    { target_mode: "specific", vault: "MyVault", file: "Recipe" },
    deps(spawnFn, diskFs(stdoutText)),
  );
  expect(result).toEqual({ content: stdoutText });
  // Spec 070: the resolution spawn (own test below) precedes the read spawn.
  expect(recorded).toHaveLength(2);
  expect(recorded[1]!.binary).toBe("obsidian");
  // FR-012 documented argv order: [vault=..., command, kvs..., flags..., --copy].
  expect(recorded[1]!.argv).toEqual(["vault=MyVault", "read", "file=Recipe"]);
});

test("US1 boundary empty stdout returns { content: '' } (Story 1 AC#2; spec 074 US3: an empty note stays empty)", async () => {
  const { spawnFn } = makeQueuedSpawn([fileTsvResponse("Empty.md"), { stdout: "", exitCode: 0 }]);
  const result = await executeReadNote(
    { target_mode: "specific", vault: "MyVault", file: "Empty" },
    deps(spawnFn, diskFs(Buffer.alloc(0))),
  );
  expect(result).toEqual({ content: "" });
});

// --- US2: specific + path ---

test("US2 specific+path invokes adapter and returns content (Story 2 AC#1)", async () => {
  const stdoutText = "<template body>";
  const { spawnFn, recorded } = makeStubSpawn({ stdout: stdoutText, exitCode: 0 });
  const result = await executeReadNote(
    { target_mode: "specific", vault: "MyVault", path: "Templates/Recipe.md" },
    deps(spawnFn, diskFs(stdoutText)),
  );
  expect(result).toEqual({ content: stdoutText });
  expect(recorded[0]!.argv).toEqual(["vault=MyVault", "read", "path=Templates/Recipe.md"]);
});

// --- US3: active mode (happy + ERR_NO_ACTIVE_FILE) ---

test("US3 active resolves the focused file and reads it by path with no vault= (Story 3 AC#1, spec 070 FR-009)", async () => {
  const stdoutText = "<active body>";
  const { spawnFn, recorded } = makeQueuedSpawn([
    focusedFileResponse("Daily/Today.md"),
    { stdout: stdoutText, exitCode: 0 },
  ]);
  const result = await executeReadNote({ target_mode: "active" }, deps(spawnFn, diskFs(stdoutText)));
  expect(result).toEqual({ content: stdoutText });
  expect(recorded[1]!.argv).toEqual(["read", "path=Daily/Today.md"]);
});

test("US3 active propagates ERR_NO_ACTIVE_FILE from the adapter (Story 3 AC#3)", async () => {
  const { spawnFn } = makeStubSpawn({ stdout: "Error: no active file\n", exitCode: 0 });
  const err = (await captureRejection(
    executeReadNote(
      { target_mode: "active" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
  expect(err.details.message).toContain("no active file");
});

// --- US5: classification surfaces ---

test("US5 propagates CLI_NON_ZERO_EXIT (Story 5 AC#1)", async () => {
  const { spawnFn } = makeStubSpawn({ stderr: "file not found", exitCode: 1 });
  const err = (await captureRejection(
    executeReadNote(
      { target_mode: "specific", vault: "MyVault", file: "Missing" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
  expect(err.details.exitCode).toBe(1);
});

test("US5 propagates CLI_REPORTED_ERROR for in-band Error: prefix (Story 5 AC#2)", async () => {
  const { spawnFn } = makeStubSpawn({ stdout: "Error: File not found\n", exitCode: 0 });
  const err = (await captureRejection(
    executeReadNote(
      { target_mode: "specific", vault: "MyVault", file: "Missing" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.message).toBe("Error: File not found");
});

test("US5 propagates CLI_BINARY_NOT_FOUND when spawn raises ENOENT (Story 5 AC#3)", async () => {
  const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  const { spawnFn } = makeStubSpawn({ errorOnSpawn: enoent });
  const err = (await captureRejection(
    executeReadNote(
      { target_mode: "specific", vault: "MyVault", file: "Recipe" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
});

test("US5 re-throws non-UpstreamError verbatim (Story 5 AC#4)", async () => {
  const synthetic = new Error("synthetic non-UpstreamError");
  const { spawnFn } = makeStubSpawn({ errorOnSpawn: synthetic });
  const rejection = await captureRejection(
    executeReadNote(
      { target_mode: "specific", vault: "MyVault", file: "Recipe" },
      deps(spawnFn),
    ),
  );
  expect(rejection).toBe(synthetic);
  expect(rejection).not.toBeInstanceOf(UpstreamError);
});

// --- New under 008-refactor: typed-tool bounds reachable through invokeCli (FR-009 / FR-010 / SC-003 / SC-004) ---

// Synchronously-resolving resolver stub — bypasses real fs.access I/O so timing-
// sensitive tests (fake timers, microtask kills) don't race with the production
// resolver's libuv access call.
const stubResolveBinary = async () => ({
  path: "obsidian",
  attempts: [{ source: "PATH" as const, path: "obsidian", outcome: "pending" as const }],
});

test("typed-tool TIMEOUT: synthetic 11 s hang → CLI_TIMEOUT within ~10.5 s (SC-003)", async () => {
  vi.useFakeTimers();
  try {
    const { spawnFn } = makeStubSpawn({ hold: true });
    const rejected = pendingRejection(
      executeReadNote(
        { target_mode: "active" },
        { ...deps(spawnFn), resolveBinary: stubResolveBinary },
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10_001);
    const err = await rejected;
    expect(err.code).toBe("CLI_TIMEOUT");
    expect(err.details).toMatchObject({ timeoutMs: 10_000 });
  } finally {
    vi.useRealTimers();
  }
});

test("typed-tool CAP: synthetic > 10 MiB → CLI_OUTPUT_TOO_LARGE with partial ≤ 10 MiB (SC-004)", async () => {
  const oneMiB = Buffer.alloc(1024 * 1024, 0x41);
  const elevenMiBChunks = Array.from({ length: 11 }, () => oneMiB);
  const { spawnFn } = makeStubSpawn({ chunkedStdout: elevenMiBChunks, hold: true });
  const err = (await captureRejection(
    executeReadNote(
      { target_mode: "active" },
      { ...deps(spawnFn), resolveBinary: stubResolveBinary },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_OUTPUT_TOO_LARGE");
  expect(err.details.stream).toBe("stdout");
  expect((err.details.partial as string).length).toBe(10 * 1024 * 1024);
});

// --- Spec 070: file-type support (notes, canvases, bases) ---

test.each(["Boards/Plan.canvas", "Views/Tasks.base", "Notes/N.MD"])(
  "spec 070: path=%s is a supported type → read spawn with the path unchanged",
  async (path) => {
    const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: "{}", exitCode: 0 }]);
    const result = await executeReadNote({ target_mode: "specific", vault: "MyVault", path }, deps(spawnFn, diskFs("{}")));
    expect(result).toEqual({ content: "{}" });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.argv).toEqual(["vault=MyVault", "read", `path=${path}`]);
  },
);

test.each([
  ["Att/photo.png", "png", "open_file"],
  ["Docs/paper.pdf", "pdf", "open_file"],
  ["Misc/todo.txt", "txt", undefined],
  ["Misc/README", "", undefined],
])("spec 070: path=%s → UNSUPPORTED_FILE_TYPE / unsupported-type, no read spawn", async (path, extension, alternative) => {
  const { spawnFn, recorded } = makeQueuedSpawn([]);
  const err = (await captureRejection(
    executeReadNote({ target_mode: "specific", vault: "MyVault", path }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("VALIDATION_ERROR");
  expect(err.details).toEqual({
    code: "UNSUPPORTED_FILE_TYPE",
    reason: "unsupported-type",
    path,
    extension,
    supported: ["note", "canvas", "base"],
    ...(alternative !== undefined ? { alternative } : {}),
  });
  expect(recorded).toHaveLength(0);
});

test("spec 070: file mode runs the `obsidian file` resolution call first, in the named vault", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([fileTsvResponse("Boards/Plan.canvas"), { stdout: "{}", exitCode: 0 }]);
  await executeReadNote({ target_mode: "specific", vault: "MyVault", file: "Plan.canvas" }, deps(spawnFn));
  expect(recorded[0]!.argv).toEqual(["vault=MyVault", "file", "file=Plan.canvas"]);
  expect(recorded[1]!.argv).toEqual(["vault=MyVault", "read", "file=Plan.canvas"]);
});

test("spec 070: file mode resolving to an attachment → rejected, no read spawn", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([fileTsvResponse("Att/I.png")]);
  const err = (await captureRejection(
    executeReadNote({ target_mode: "specific", vault: "MyVault", file: "I.png" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.details).toMatchObject({ code: "UNSUPPORTED_FILE_TYPE", path: "Att/I.png", alternative: "open_file" });
  expect(recorded).toHaveLength(1);
});

test("spec 070: file mode resolution failure surfaces unchanged, no read spawn", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([{ stdout: 'Error: File "Nope" not found.\n', exitCode: 0 }]);
  const err = (await captureRejection(
    executeReadNote({ target_mode: "specific", vault: "MyVault", file: "Nope" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.message).toBe('Error: File "Nope" not found.');
  expect(recorded).toHaveLength(1);
});

test("spec 070: active mode on a focused image → rejected, no read spawn", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([focusedFileResponse("Att/K.png")]);
  const err = (await captureRejection(executeReadNote({ target_mode: "active" }, deps(spawnFn)))) as UpstreamError;
  expect(err.details).toMatchObject({ code: "UNSUPPORTED_FILE_TYPE", reason: "unsupported-type", path: "Att/K.png" });
  expect(recorded).toHaveLength(1);
});

test("spec 070: active mode with no focused file → ERR_NO_ACTIVE_FILE, no read spawn", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([focusedFileResponse(null)]);
  const err = (await captureRejection(executeReadNote({ target_mode: "active" }, deps(spawnFn)))) as UpstreamError;
  expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
  expect(recorded).toHaveLength(1);
});

// --- Spec 074: exact content (contract §2) — disk bytes → CLI stdout → content ---

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

async function readWith(disk: string | Buffer, stdout: string): Promise<string> {
  const { spawnFn } = makeStubSpawn({ stdout, exitCode: 0 });
  const result = await executeReadNote(
    { target_mode: "specific", vault: "MyVault", path: "N.md" },
    deps(spawnFn, diskFs(disk)),
  );
  return result.content;
}

// US1: a note with no final line feed reads back with nothing added.
test.each([
  ["first", "first\n", "first"],
  ["a\r\nb", "a\r\nb\n", "a\r\nb"],
  ["a\r", "a\r\n", "a\r"],
  ["# T\n\nlast line", "# T\n\nlast line\n", "# T\n\nlast line"],
])("spec 074 US1: disk %j, stdout %j → content %j", async (disk, stdout, expected) => {
  expect(await readWith(disk, stdout)).toBe(expected);
});

// US2: real final line breaks (LF, CRLF, repeated, mixed) are kept.
test.each([
  ["first\n", "first\n"],
  ["a\r\nb\r\n", "a\r\nb\r\n"],
  ["a\n\n", "a\n\n"],
  ["\n", "\n"],
  ["a\r\nb\nc\n", "a\r\nb\nc\n"],
])("spec 074 US2: disk %j, stdout %j → content unchanged", async (disk, stdout) => {
  expect(await readWith(disk, stdout)).toBe(disk);
});

// US4: the leading byte-order mark the CLI removes is restored; any other BOM is the CLI's text.
test.each([
  ["BOM a", Buffer.concat([BOM, Buffer.from("a")]), "a\n", "\uFEFFa"],
  ["BOM a LF", Buffer.concat([BOM, Buffer.from("a\n")]), "a\n", "\uFEFFa\n"],
  ["BOM only", BOM, "", "\uFEFF"],
  ["BOM BOM a", Buffer.concat([BOM, BOM, Buffer.from("a")]), "\uFEFFa\n", "\uFEFF\uFEFFa"],
  ["a BOM b", Buffer.concat([Buffer.from("a"), BOM, Buffer.from("b")]), "a\uFEFFb\n", "a\uFEFFb"],
])("spec 074 US4: %s → content restored exactly", async (_label, disk, stdout, expected) => {
  expect(await readWith(disk, stdout)).toBe(expected);
});

test.each([
  ["file", { file: "Plan.canvas" }, [fileTsvResponse("Boards/Plan.canvas")], '{"nodes":[]}'],
  ["path", { path: "B.base" }, [], "views:\n  - type: table"],
])("spec 074 US4: %s-mode canvas/base reads back its disk text exactly", async (_mode, locator, pre, disk) => {
  const { spawnFn } = makeQueuedSpawn([...pre, { stdout: `${disk}\n`, exitCode: 0 }]);
  const result = await executeReadNote(
    { target_mode: "specific", vault: "MyVault", ...locator },
    deps(spawnFn, diskFs(disk)),
  );
  expect(result).toEqual({ content: disk });
});

// --- Spec 074: which file is read, and when ---

test("spec 074: path mode reads <registry root>/<path> from disk", async () => {
  const { spawnFn } = makeStubSpawn({ stdout: "x\n", exitCode: 0 });
  const fs = diskFs("x");
  await executeReadNote({ target_mode: "specific", vault: "MyVault", path: "Templates/Recipe.md" }, deps(spawnFn, fs));
  expect(fs.readFile).toHaveBeenCalledExactlyOnceWith(join(ROOT, "Templates/Recipe.md"));
});

test("spec 074: file mode reads the TSV-resolved path from disk", async () => {
  const { spawnFn } = makeQueuedSpawn([fileTsvResponse("Cooking/Recipe.md"), { stdout: "x\n", exitCode: 0 }]);
  const fs = diskFs("x");
  await executeReadNote({ target_mode: "specific", vault: "MyVault", file: "Recipe" }, deps(spawnFn, fs));
  expect(fs.readFile).toHaveBeenCalledExactlyOnceWith(join(ROOT, "Cooking/Recipe.md"));
});

test("spec 074: active mode reads <eval base>/<path> and never calls the vault registry", async () => {
  const { spawnFn } = makeQueuedSpawn([
    focusedFileResponse("Daily/Today.md", "/vaults/Focused"),
    { stdout: "x\n", exitCode: 0 },
  ]);
  const fs = diskFs("x");
  const resolveVaultPath = vi.fn(async () => ROOT);
  const result = await executeReadNote(
    { target_mode: "active" },
    { ...deps(spawnFn, fs), vaultRegistry: { ...stubVaultRegistry("MyVault", ROOT), resolveVaultPath } },
  );
  expect(result).toEqual({ content: "x" });
  expect(fs.readFile).toHaveBeenCalledExactlyOnceWith(join("/vaults/Focused", "Daily/Today.md"));
  expect(resolveVaultPath).not.toHaveBeenCalled();
});

test.each([
  ["CLI_REPORTED_ERROR", { stdout: 'Error: Vault "Nope" not found.\n', exitCode: 0 }],
  ["CLI_NON_ZERO_EXIT", { stderr: "vault not found", exitCode: 1 }],
])("spec 074: a CLI failure (%s) surfaces unchanged, before any registry lookup or disk read", async (code, response) => {
  const { spawnFn } = makeStubSpawn(response);
  const fs = diskFs("x");
  const resolveVaultPath = vi.fn(async () => ROOT);
  const err = (await captureRejection(
    executeReadNote(
      { target_mode: "specific", vault: "Nope", path: "N.md" },
      { ...deps(spawnFn, fs), vaultRegistry: { ...stubVaultRegistry("MyVault", ROOT), resolveVaultPath } },
    ),
  )) as UpstreamError;
  expect(err.code).toBe(code);
  expect(resolveVaultPath).not.toHaveBeenCalled();
  expect(fs.readFile).not.toHaveBeenCalled();
});

test("spec 074: a failed disk read → FS_WRITE_FAILED { reason: 'read' }, no fallback content", async () => {
  const { spawnFn } = makeStubSpawn({ stdout: "x\n", exitCode: 0 });
  const enoent = Object.assign(new Error("ENOENT: no such file or directory"), {
    code: "ENOENT",
    syscall: "open",
    path: join(ROOT, "Gone.md"),
  });
  const fs = { readFile: vi.fn(async () => { throw enoent; }) };
  const err = (await captureRejection(
    executeReadNote({ target_mode: "specific", vault: "MyVault", path: "Gone.md" }, deps(spawnFn, fs)),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("FS_WRITE_FAILED");
  expect(err.details).toEqual({ reason: "read", errno: "ENOENT", syscall: "open", path: "Gone.md" });
  expect(err.cause).toBe(enoent);
  expect(err.message).toBe('read: filesystem read failed: ENOENT for "Gone.md"');
});
