# Quickstart: Reliable Writer

**Feature**: `016-reliable-writer`
**Plan reference**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md)

This document enumerates verification scenarios mapped to the spec's Success Criteria (SC-001..SC-012). Scenarios prefixed `S-` are runnable as part of `vitest run` (CI-gated). Scenarios prefixed `M-` require a real Obsidian app + the authorised TestVault per `.memory/test-execution-instructions.md` and are run manually against MCP Inspector / Claude Desktop after the implementation lands.

## CI-gated scenarios (vitest)

### S-1 — Specific mode happy path at every BI-038 size threshold

**Mapped SC**: SC-001 (no host crash dialog), SC-002 (byte-faithful)
**Test home**: `src/tools/write_note/handler.test.ts`

For each content size in `{60 B, 5 KB, 12 KB, 100 KB}`:

```ts
const result = await executeWriteNote(
  { target_mode: "specific", vault: "TestVault", path: `Sandbox/s1-${size}.md`, content: contentOfSize(size), overwrite: true },
  { logger, queue, vaultRegistry, fs: realFs, spawnFn: stubSpawn },
);
expect(result).toEqual({ created: true, path: `Sandbox/s1-${size}.md` });
const written = await readFile(`/vault/Sandbox/s1-${size}.md`, "utf8");
expect(written).toBe(contentOfSize(size));
// SC-007: no spawn carried the content as argv
for (const args of recordedSpawnArgs) {
  for (const arg of args) {
    expect(arg).not.toContain(written.slice(0, 100));  // sample
    expect(arg.length).toBeLessThanOrEqual(250);
  }
}
```

PASS criterion: every size succeeds; written bytes match; no spawn argv carried content.

### S-2 — Trigger characters byte-faithful round-trip

**Mapped SC**: SC-002
**Test home**: `src/tools/write_note/handler.test.ts`

Content includes the BI-038 trigger fragments (`,]`, `,"Calls.md",]`, `","",`, mixed CRLF/LF, multi-byte UTF-8, emoji, frontmatter delimiters at non-start positions, wikilinks, YAML special chars):

```ts
const trickyContent = `---\ntitle: probe\ntags: [bi-038, probe]\n---\n\n# Heading\n\nQuotes "x", brackets ,], JSON {"tty":"false"}, empty-strings ","",\nCRLF line\r\nLF line\nUTF-8: → ™ — © ☕\nEmoji: 🚀 🐛 ✅\nWikilink: [[Other Note]]\nYAML special: : # & * ! | > ?\n`;

await executeWriteNote(
  { target_mode: "specific", vault: "TestVault", path: "Sandbox/s2-tricky.md", content: trickyContent, overwrite: true },
  ...
);
expect(await readFile("/vault/Sandbox/s2-tricky.md", "utf8")).toBe(trickyContent);
```

PASS: content survives byte-for-byte through the temp + rename pipeline.

### S-3 — Collision behaviour (User Story 2 ACs)

**Mapped SC**: SC-003 (no silent rename)
**Test home**: `src/tools/write_note/handler.test.ts`

```ts
await executeWriteNote({ ...specific, path: "Sandbox/s3.md", content: "v1" }, deps);  // create
// Default overwrite: false → second create against the same path:
await expect(
  executeWriteNote({ ...specific, path: "Sandbox/s3.md", content: "v2" }, deps),
).rejects.toMatchObject({ code: "FILE_EXISTS" });
expect(await readFile("/vault/Sandbox/s3.md", "utf8")).toBe("v1");  // unchanged

// overwrite: true → replace
const r = await executeWriteNote({ ...specific, path: "Sandbox/s3.md", content: "v3", overwrite: true }, deps);
expect(r).toEqual({ created: false, path: "Sandbox/s3.md" });
expect(await readFile("/vault/Sandbox/s3.md", "utf8")).toBe("v3");
```

PASS: collision returns `FILE_EXISTS`, original unchanged; overwrite replaces.

### S-4 — Path-safety vault-escape rejection

**Mapped SC**: SC-005 (path-escape probes 100% rejected)
**Test home**: `src/path-safety/{schema,canonical}.test.ts` + `src/tools/write_note/handler.test.ts`

For each escape pattern in `{"../escape.md", "subdir/../../escape.md", "/abs/escape.md", "C:\\Windows\\escape.md", "\\\\server\\share\\escape.md"}`:

```ts
await expect(
  executeWriteNote({ ...specific, path: pattern, content: "x" }, deps),
).rejects.toMatchObject({ code: "VALIDATION_ERROR" });  // Layer 1 schema reject
```

For symlink-escape (canonical.test.ts with mocked realpath):

```ts
const fakeRealpath = vi.fn().mockResolvedValue("/etc/passwd");  // simulates symlink resolution
const outcome = await checkCanonicalPath("/vault", "bridge/passwd.md", { realpath: fakeRealpath });
expect(outcome.ok).toBe(false);
expect((outcome as CanonicalCheckEscape).attemptedPath).toBe("bridge/passwd.md");
// Handler-level integration:
await expect(executeWriteNote(symlinkEscapeInput, deps)).rejects.toMatchObject({ code: "PATH_ESCAPES_VAULT" });
expect(loggerCalls.warn).toContainEqual(expect.objectContaining({ event: "pathEscapeAttempt" }));
```

PASS: every escape rejected with the correct error code; logger event fired for symlink-escape.

### S-5 — `metadataCache` invalidation eval failure does NOT fail the call

**Mapped SC**: SC-006 (write→read freshness — happy path) + FR-011 best-effort invariant
**Test home**: `src/tools/write_note/handler.test.ts`

```ts
const stubSpawnInvalidationFails: SpawnLike = (cmd, args) => {
  if (args.some((a) => a.includes("metadataCache"))) {
    return makeFakeFailingChild();  // simulates eval timeout / IPC hang
  }
  return makeFakeSuccessfulChild();
};

const result = await executeWriteNote(
  { ...specific, path: "Sandbox/s5.md", content: "hello", overwrite: true },
  { ..., spawnFn: stubSpawnInvalidationFails },
);
expect(result).toEqual({ created: true, path: "Sandbox/s5.md" });  // SUCCESS despite eval failure
expect(await readFile("/vault/Sandbox/s5.md", "utf8")).toBe("hello");
expect(loggerCalls.debug).toContainEqual(expect.objectContaining({ event: "metadataCacheInvalidationFailed" }));
```

PASS: write succeeds; response is success envelope; failure logged at debug.

### S-6 — Argv-length invariant across content sizes

**Mapped SC**: SC-007 (zero bytes of content cross argv; all argv elements ≤ 250 bytes)
**Test home**: `src/tools/write_note/handler.test.ts`

```ts
const recordedArgs: string[][] = [];
const stubSpawn: SpawnLike = (cmd, args, opts) => {
  recordedArgs.push(args);
  return makeFakeSuccessfulChild();
};

for (const size of [100, 5_000, 100_000]) {
  recordedArgs.length = 0;
  await executeWriteNote(
    { ...specific, path: `Sandbox/s6-${size}.md`, content: "x".repeat(size), overwrite: true },
    { ..., spawnFn: stubSpawn },
  );
  for (const args of recordedArgs) {
    for (const arg of args) {
      expect(arg.length).toBeLessThanOrEqual(250);
      expect(arg).not.toContain("xxxxx");  // sample of content
    }
  }
}
```

PASS: every size has every spawn argv element under 250 bytes; no content sample appears in any argv element.

### S-7 — Active-mode focused-file write

**Mapped SC**: User Story 3 ACs
**Test home**: `src/tools/write_note/handler.test.ts`

```ts
const stubSpawnFocused: SpawnLike = (cmd, args) => {
  if (args.some((a) => a.includes("getActiveFile"))) {
    return makeFakeChildReturning(`=> ${JSON.stringify({ path: "Daily/2026-05-10.md", base: "/vault" })}`);
  }
  return makeFakeSuccessfulChild();
};

const result = await executeWriteNote(
  { target_mode: "active", content: "(focused content replaced)", overwrite: true },
  { ..., spawnFn: stubSpawnFocused },
);
expect(result).toEqual({ created: false, path: "Daily/2026-05-10.md" });
expect(await readFile("/vault/Daily/2026-05-10.md", "utf8")).toBe("(focused content replaced)");
```

PASS: focused-file resolved + write happens at resolved path; response carries the focused path.

### S-8 — Active mode with no focused file

**Mapped SC**: User Story 3 AC#2
**Test home**: `src/tools/write_note/handler.test.ts`

```ts
const stubSpawnNoFocus: SpawnLike = (cmd, args) => {
  if (args.some((a) => a.includes("getActiveFile"))) {
    return makeFakeChildReturning(`=> ${JSON.stringify({ path: null, base: "/vault" })}`);
  }
  return makeFakeSuccessfulChild();
};

await expect(
  executeWriteNote({ target_mode: "active", content: "x", overwrite: true }, { ..., spawnFn: stubSpawnNoFocus }),
).rejects.toMatchObject({ code: "ERR_NO_ACTIVE_FILE" });
```

PASS: structured error returned; no fs touch.

### S-9 — `template` parameter rejection + migration hint

**Mapped SC**: SC-005 (template-supplied schema reject) + FR-016
**Test home**: `src/tools/write_note/schema.test.ts`

```ts
const result = writeNoteInputSchema.safeParse({
  target_mode: "specific",
  vault: "TestVault",
  path: "Daily/2026-05-10.md",
  template: "Daily",
  content: "",
});
expect(result.success).toBe(false);
expect(result.error.issues[0].code).toBe("unrecognized_keys");
expect(result.error.issues[0].keys).toEqual(["template"]);
```

PASS: schema rejects with the expected zod error code.

### S-10 — Tool list inventory check

**Mapped SC**: SC-006 (tool list contains write_note)
**Test home**: `src/tools/write_note/index.test.ts` + `src/tools/_register.test.ts` (drift detector)

```ts
const tool = createWriteNoteTool({ logger, queue, vaultRegistry: stubRegistry });
expect(tool.name).toBe("write_note");
expect(tool.inputSchema.required).toContain("target_mode");
expect(tool.inputSchema.additionalProperties).toBe(false);
```

PASS: registration happens; schema additionalProperties locks out unknown keys (including the dropped `template`).

### S-11 — Vault-registry lazy probe + cache

**Mapped SC**: User Story 1 + R2
**Test home**: `src/vault-registry/registry.test.ts`

```ts
const probeMock = vi.fn().mockResolvedValue("TestVault\t/vault\nThe Setup\t/setup\n");
const registry = createVaultRegistry({ invokeProbe: probeMock });

// First call → probe fires
const p1 = await registry.resolveVaultPath("TestVault");
expect(p1).toBe("/vault");
expect(probeMock).toHaveBeenCalledTimes(1);

// Second call → cache hit, no second probe
const p2 = await registry.resolveVaultPath("TestVault");
expect(probeMock).toHaveBeenCalledTimes(1);
```

PASS: first call probes; second call is cache hit.

### S-12 — Vault-registry probe failure + retry on next call

**Mapped SC**: R2 retry semantics
**Test home**: `src/vault-registry/registry.test.ts`

```ts
const probeMock = vi.fn()
  .mockRejectedValueOnce(new UpstreamError({ code: "CLI_REPORTED_ERROR", cause: null, details: {}, message: "Obsidian not running" }))
  .mockResolvedValueOnce("TestVault\t/vault\n");

const registry = createVaultRegistry({ invokeProbe: probeMock });

await expect(registry.resolveVaultPath("TestVault")).rejects.toMatchObject({ code: "CLI_REPORTED_ERROR" });
// cache stays unset; second call retries probe
const p = await registry.resolveVaultPath("TestVault");
expect(p).toBe("/vault");
expect(probeMock).toHaveBeenCalledTimes(2);
```

PASS: probe failure propagates; second call retries; success on second attempt populates cache.

### S-13 — Vault-not-found surfaces as `VALIDATION_ERROR`

**Mapped SC**: FR-021
**Test home**: `src/vault-registry/registry.test.ts`

```ts
const registry = createVaultRegistry({ invokeProbe: () => Promise.resolve("TestVault\t/vault\n") });
await expect(registry.resolveVaultPath("NoSuchVault")).rejects.toMatchObject({
  code: "VALIDATION_ERROR",
});
```

PASS: clean validation error (not CLI_REPORTED_ERROR); details carry the requested vault and the known list.

### S-14 — Auto-mkdir parents

**Mapped SC**: FR-010
**Test home**: `src/tools/write_note/handler.test.ts`

```ts
await executeWriteNote(
  { ...specific, path: "Daily/2026/05/2026-05-10.md", content: "x", overwrite: true },
  { ..., fs: realFsInTempVault },
);
expect(await stat("/vault/Daily/2026/05/2026-05-10.md")).toBeDefined();
```

PASS: nested fresh path creates parent dirs; write lands in the leaf.

### S-15 — `open: true` post-write eval

**Mapped SC**: FR-017
**Test home**: `src/tools/write_note/handler.test.ts`

```ts
const recordedArgs: string[][] = [];
const stubSpawn: SpawnLike = (cmd, args) => { recordedArgs.push(args); return makeFakeSuccessfulChild(); };

await executeWriteNote(
  { ...specific, path: "Sandbox/s15.md", content: "x", overwrite: true, open: true },
  { ..., spawnFn: stubSpawn },
);
const evalArgs = recordedArgs.flat().filter((a) => a.startsWith("code="));
expect(evalArgs.some((a) => a.includes("openLinkText"))).toBe(true);
```

PASS: `openLinkText` eval fired post-write.

### S-16 — Output envelope shape parity

**Mapped SC**: FR-003 (byte-stable with predecessor)
**Test home**: `src/tools/write_note/{schema,handler}.test.ts`

```ts
expect(writeNoteOutputSchema.safeParse({ created: true, path: "x" })).toMatchObject({ success: true });
expect(writeNoteOutputSchema.safeParse({ created: true, path: "x", extra: 1 })).toMatchObject({ success: false });

const r = await executeWriteNote({ ...specific, path: "Sandbox/s16.md", content: "x", overwrite: true }, deps);
expect(Object.keys(r).sort()).toEqual(["created", "path"]);
```

PASS: shape exactly `{ created, path }`; strict mode rejects extras.

### S-17 — Other typed tools unchanged (cross-cutting non-impact)

**Mapped SC**: SC-009
**Test home**: existing tests for `read_note`, `read_property`, `read_heading`, `find_by_property`, `delete_note`, `obsidian_exec`, `help` — should continue to pass without modification

Run `vitest run` against the full suite. Compare CI test counts and failure baseline before vs. after the 016 implementation merges. Zero changes expected.

PASS: full suite green; no regression in any other tool's test count or behaviour.

### S-18 — Constitution V attribution headers

**Mapped SC**: FR-027 + Constitution V
**Test home**: `src/_attribution.test.ts` (existing project test that walks `src/**/*.ts` and asserts every file has a header comment matching either `// Original — no upstream.` or an upstream attribution stanza). If no such test exists yet, this is a one-off check to add as part of T0; otherwise the existing test auto-covers the new files.

PASS: every new source file (`src/vault-registry/registry.ts`, `src/path-safety/{schema,canonical}.ts`, `src/tools/write_note/{schema,handler,index}.ts`) has the standard header.

### S-19 — Help doc presence + content coverage

**Mapped SC**: SC-010 + FR-022
**Test home**: `src/tools/write_note/index.test.ts` + manual checklist against `docs/tools/write_note.md`

```ts
const docsPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/tools/write_note.md");
expect(existsSync(docsPath)).toBe(true);
const content = readFileSync(docsPath, "utf8");
// FR-022 six dimensions:
expect(content).toMatch(/what.*tool does|purpose|description/i);
expect(content).toMatch(/when to use|when not to use/i);
expect(content).toMatch(/input.*contract|parameter/i);
expect(content).toMatch(/output.*contract|error.*roster|stable error code/i);
expect(content).toMatch(/upstream|BI-038|forum\.obsidian\.md/i);
expect(content).toMatch(/example|invocation/i);
// Stable error codes named:
expect(content).toMatch(/PATH_ESCAPES_VAULT/);
expect(content).toMatch(/FILE_EXISTS/);
expect(content).toMatch(/FS_WRITE_FAILED/);
expect(content).toMatch(/ERR_NO_ACTIVE_FILE/);
```

PASS: doc exists at expected path; covers all six FR-022 dimensions; names all four stable error codes specific to this tool.

## Manual scenarios (require real Obsidian + TestVault)

These run against the focused TestVault per `.memory/test-execution-instructions.md`. Before invoking, focus `TestVault-Obsidian-CLI-MCP` in Obsidian.

### M-1 — End-to-end write through MCP Inspector or Claude Desktop

**Mapped SC**: SC-001 (no host crash dialog at any size up to 100 KB)

1. Build & install the new MCP server: `npm run build` + register in MCP client config.
2. Open MCP Inspector (or Claude Desktop) with the new server.
3. Invoke `write_note` with content sizes `60 B`, `5 KB`, `12 KB`, `100 KB` against `Sandbox/m1-<size>.md`.
4. After each call, verify in Obsidian that no "JavaScript error occurred in the main process" dialog has appeared.
5. Open each file in Obsidian's file browser; verify content matches what was sent.
6. Clean up: delete the M-1 fixtures.

PASS: every size succeeds; zero crash dialogs; content byte-faithful per Obsidian's display.

### M-2 — Multi-vault routing (R11 resolution)

**Mapped SC**: User Story 1 + ADR-009 R11 resolution

1. Ensure both `TestVault-Obsidian-CLI-MCP` and `The Setup` (or any second registered vault) are visible in `obsidian vaults verbose`.
2. Focus `The Setup` in Obsidian.
3. Invoke `write_note` with `vault: "TestVault-Obsidian-CLI-MCP", path: "Sandbox/m2-multivault.md"`.
4. Verify the file lands in `TestVault-Obsidian-CLI-MCP\Sandbox\m2-multivault.md`, NOT in `The Setup`.
5. Clean up: delete the M-2 fixture.

PASS: file lands in the named vault, not the focused one — proves R11 is dead under the new design.

### M-3 — Write→read freshness through MCP

**Mapped SC**: SC-006

1. Invoke `write_note` with new content for an existing note.
2. Immediately invoke `read_property` (or `read_heading`) against the same note.
3. Verify the read returns the post-write value, not stale cache.
4. Clean up.

PASS: read sees the new value without delay.

### M-4 — Mid-write SIGTERM crash safety

**Mapped SC**: SC-008

1. Invoke `write_note` with a large content (~10 MB) against a temp path inside `Sandbox/`.
2. While the write is in flight, send SIGTERM to the MCP server process (or kill it via task manager).
3. After restart, inspect `Sandbox/<path>.md`: contents are either entirely the old version or absent (if it was a fresh create); never partial.
4. Inspect `Sandbox/` for orphan `.tmp` files; clean up if any.

PASS: no torn write observed.

### M-5 — Help discovery through MCP

**Mapped SC**: SC-007 (agent constructs valid invocation from help alone)

1. Through MCP Inspector / Claude Desktop, invoke `help` with `tool_name: "write_note"`.
2. Read the returned doc; construct a `write_note` invocation from the help alone (no spec, no source).
3. Invoke; verify it succeeds.

PASS: doc is sufficient on its own.

## Mapping table — SC → scenarios

| SC | Scenarios |
|---|---|
| SC-001 (no host crash) | S-1, M-1 |
| SC-002 (byte-faithful) | S-1, S-2 |
| SC-003 (no silent rename) | S-3 |
| SC-004 (no empty-response failure at any tested size) | S-1 (covered by happy-path success across sizes) |
| SC-005 (path-escape probes 100% rejected) | S-4, S-9 (template) |
| SC-006 (tool list correct) | S-10, M-3 (freshness side) |
| SC-007 (zero bytes of content cross argv; ≤250B argv) | S-6, M-5 (agent constructs from help alone) |
| SC-008 (mid-write SIGTERM atomicity) | M-4 |
| SC-009 (other tools unchanged) | S-17 |
| SC-010 (help covers six FR-022 dimensions) | S-19 |
| SC-011 (test inventory present) | data-model.md test inventory + S-1..S-19 themselves |
| SC-012 (ADR-009 referenced) | data-model.md (Constitution V test S-18 verifies headers) |

All twelve SCs covered by either a CI-gated S-scenario, a manual M-scenario, or both.
