# Contract: `write_note` handler

**Feature**: `016-reliable-writer`
**Surface**: `executeWriteNote(input, deps)` at `src/tools/write_note/handler.ts`
**Plan reference**: [plan.md](../plan.md) | **Data model**: [data-model.md](../data-model.md)

## Function signature

```ts
export async function executeWriteNote(
  input: WriteNoteInput,        // already-validated zod-parsed input
  deps: ExecuteDeps,
): Promise<WriteNoteOutput>;     // { created: boolean, path: string }

interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  vaultRegistry: VaultRegistry;        // src/vault-registry/registry.ts
  fs?: { mkdir, writeFile, rename, realpath, unlink };  // test seam
  spawnFn?: SpawnLike;                  // test seam for cli-adapter spawns
  env?: NodeJS.ProcessEnv;
}
```

## Invariants

| # | Invariant | Source |
|---|---|---|
| H1 | User-supplied `input.content` MUST NOT cross any argv element at any size | FR-005, SC-007 |
| H2 | All argv elements emitted by this handler stay ≤ 250 bytes | SC-007 |
| H3 | Disk write is atomic — either the previous content remains, or the new content lands in full; never partial | FR-008, R4 |
| H4 | Collision detection is race-free — `wx` flag throws EEXIST atomically without a TOCTOU window | FR-009, R4 |
| H5 | `metadataCache` invalidation eval failure does NOT fail the call — write success is the contract | FR-011, R5 |
| H6 | `open: true` post-write eval failure does NOT fail the call — open is a UX nicety, not a contract | FR-017 (implicit via UX precedent) |
| H7 | Active mode emits exactly one pre-write eval (focused-file resolution) and one post-write eval (cache invalidation); 2 evals total | R5, R14 |
| H8 | Specific mode emits exactly one post-write eval (cache invalidation) plus optionally one for `open: true`; 1-2 evals total | R5, R9 |
| H9 | First call across the MCP-server lifetime triggers the lazy vault-registry probe; subsequent calls hit cache | R2, FR-012 |
| H10 | `pathEscapeAttempt` logger.warn event fires whenever runtime path-safety check rejects an input | FR-029, R6 |
| H11 | No `template` parameter ever reaches the handler (rejected at schema layer) | FR-016 |
| H12 | Output envelope shape EXACTLY `{ created, path }` — nothing else | FR-003, R10 |

## Per-step contract

### Step 1 — Vault path resolution

**Specific mode**: `vaultRoot = await deps.vaultRegistry.resolveVaultPath(input.vault)`

- On successful resolution → continue to Step 2 with `vaultRoot` set
- On `VALIDATION_ERROR` (vault not in registry) → propagate as-is
- On `CLI_BINARY_NOT_FOUND` / `CLI_REPORTED_ERROR` (probe failure) → propagate as-is

**Active mode**: emit pre-write eval

```ts
const FOCUSED_FILE_TEMPLATE =
  "(async()=>{const f=app.workspace.getActiveFile();return JSON.stringify({path:f?.path??null,base:app.vault.adapter.basePath});})()";
```

- Send via `invokeCli({ command: "eval", parameters: { code: FOCUSED_FILE_TEMPLATE }, target_mode: "active" })`
- Strip `=> ` prefix from response stdout, JSON.parse the rest
- Validate response shape: `{ path: string | null, base: string }`
- If `path === null` → throw `UpstreamError({ code: "ERR_NO_ACTIVE_FILE", message: "<existing project recovery message>" })`
- Otherwise: `vaultRoot = response.base; relPath = response.path` and continue to Step 2

### Step 2 — Path safety (pre-mkdir per FR-014)

```ts
const relPath = input.path ?? input.file ?? <focused-file-relpath>;
const check = await checkCanonicalPath(vaultRoot, relPath, { realpath: deps.fs.realpath });

if (!check.ok) {
  deps.logger.warn({ event: "pathEscapeAttempt", vault: input.vault ?? "<active>", attemptedPath: check.attemptedPath });
  throw new UpstreamError({
    code: "PATH_ESCAPES_VAULT",
    cause: null,
    details: { vault: input.vault ?? null, attemptedPath: check.attemptedPath, resolvedPath: check.resolvedPath },
  });
}

const absPath = check.resolvedPath;  // canonical (realpath) when parent exists; lexical fallback when ENOENT
```

### Step 3 — Auto-mkdir parent dirs

```ts
import { dirname } from "node:path";
await deps.fs.mkdir(dirname(absPath), { recursive: true });
```

- Idempotent (no error on existing dir)
- Errors here propagate as `FS_WRITE_FAILED` (typically EACCES on the vault root)

### Step 4 — Atomic write

**`overwrite: true` branch**: temp + rename

```ts
import { randomUUID } from "node:crypto";

const tmpPath = `${absPath}.${randomUUID()}.tmp`;
let existedBefore: boolean;
try {
  await deps.fs.realpath(absPath);  // throws ENOENT if absent
  existedBefore = true;
} catch (e: any) {
  if (e.code !== "ENOENT") throw mapFsError(e);
  existedBefore = false;
}

await deps.fs.writeFile(tmpPath, input.content);  // any size; UTF-8

try {
  await deps.fs.rename(tmpPath, absPath);
} catch (e: any) {
  await deps.fs.unlink(tmpPath).catch(() => { /* best-effort cleanup */ });
  throw mapFsError(e);
}

const created = !existedBefore;
```

**`overwrite: false` branch**: direct write with `wx` flag

```ts
try {
  await deps.fs.writeFile(absPath, input.content, { flag: "wx" });
  // wx flag: fails atomically with EEXIST if absPath already exists
} catch (e: any) {
  if (e.code === "EEXIST") {
    throw new UpstreamError({
      code: "FILE_EXISTS",
      cause: null,
      details: { path: relPath, vault: input.vault ?? null },
    });
  }
  throw mapFsError(e);
}

const created = true;  // wx flag guarantees the file did not exist before
```

### Step 5 — Cache invalidation (best-effort per FR-011 / R5)

```ts
const invalidateTemplate =
  `(async()=>{const f=app.vault.getFileByPath(${JSON.stringify(absPath)});if(f)await app.metadataCache.computeMetadataAsync(f);})()`;

try {
  await invokeCli(
    { command: "eval", parameters: { code: invalidateTemplate }, target_mode: "active" },
    { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
  );
} catch (e) {
  // Best-effort: write succeeded, cache freshness defers to Obsidian's file watcher
  // (~200-500 ms eventual consistency). Per FR-011 + Edge Cases bullet, the call
  // still returns success.
  deps.logger.debug({ event: "metadataCacheInvalidationFailed", absPath, cause: String(e) });
}
```

### Step 6 — Optional editor-open (best-effort, specific mode only)

```ts
if (input.target_mode === "specific" && input.open === true) {
  const openTemplate = `app.workspace.openLinkText(${JSON.stringify(absPath)},"")`;
  try {
    await invokeCli(
      { command: "eval", parameters: { code: openTemplate }, target_mode: "active" },
      { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
    );
  } catch (e) {
    // Best-effort: open is a UX nicety; write success is the contract.
    deps.logger.debug({ event: "openInEditorFailed", absPath, cause: String(e) });
  }
}
```

### Step 7 — Return

```ts
return { created, path: relPath };
```

## Error-mapping helper

```ts
function mapFsError(e: any): UpstreamError {
  // Convert NodeJS.ErrnoException to UpstreamError
  const errno = e?.code ?? "UNKNOWN";
  if (errno === "EEXIST") {
    // Caller should have used the wx flag branch; defensive mapping
    return new UpstreamError({
      code: "FILE_EXISTS",
      cause: e,
      details: { errno },
    });
  }
  return new UpstreamError({
    code: "FS_WRITE_FAILED",
    cause: e,
    details: { errno, syscall: e?.syscall, path: e?.path },
    message: `Filesystem write failed: ${errno}${e?.syscall ? ` on ${e.syscall}` : ""}${e?.path ? ` for ${e.path}` : ""}`,
  });
}
```

## Failure-propagation chain

```
schema layer ─→ VALIDATION_ERROR ─────────────────────→ caller
                  │
                  ▼
   handler step 1: vault registry / focused-file resolution
     │
     ├── vault registry lazy-probe failure ──→ CLI_BINARY_NOT_FOUND / CLI_REPORTED_ERROR / CLI_TIMEOUT ─→ caller
     ├── vault not in registry ────────────────→ VALIDATION_ERROR ─→ caller
     └── active mode + null focused file ─────→ ERR_NO_ACTIVE_FILE ─→ caller
                  │
                  ▼
   handler step 2: canonical path safety check
     │
     └── escape detected ─→ logger.warn(pathEscapeAttempt) + PATH_ESCAPES_VAULT ─→ caller
                  │
                  ▼
   handler step 3: mkdir
     │
     └── EACCES / EPERM / ... ─→ FS_WRITE_FAILED ─→ caller
                  │
                  ▼
   handler step 4: atomic write (temp+rename for overwrite=true OR wx flag for false)
     │
     ├── EEXIST (overwrite=false) ─→ FILE_EXISTS ─→ caller
     ├── ENOSPC / EACCES / EROFS / EIO / ... ─→ FS_WRITE_FAILED (with details.errno) ─→ caller
     └── rename failure ─→ best-effort tmp unlink ─→ FS_WRITE_FAILED ─→ caller
                  │
                  ▼
   handler step 5: cache invalidation eval
     │
     └── eval timeout / IPC failure ─→ logger.debug(metadataCacheInvalidationFailed) ─→ DOES NOT FAIL THE CALL
                  │
                  ▼
   handler step 6: optional open eval (specific mode + open: true)
     │
     └── eval failure ─→ logger.debug(openInEditorFailed) ─→ DOES NOT FAIL THE CALL
                  │
                  ▼
   handler step 7: return { created, path }
                  │
                  ▼
              caller
```

## Test seam patterns

### Pattern A — fs ops mocked, vault registry mocked, no real spawning

```ts
const fakeFs = {
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
  realpath: vi.fn().mockResolvedValue("/vault/Sandbox/note.md"),
  unlink: vi.fn().mockResolvedValue(undefined),
};
const fakeRegistry = { resolveVaultPath: vi.fn().mockResolvedValue("/vault") };

const result = await executeWriteNote(
  { target_mode: "specific", vault: "TestVault", path: "Sandbox/note.md", content: "hello" },
  { logger, queue, vaultRegistry: fakeRegistry, fs: fakeFs, spawnFn: stubSpawn },
);
```

### Pattern B — argv-length assertion across content sizes

```ts
const recordedArgs: string[][] = [];
const stubSpawn: SpawnLike = (cmd, args, opts) => {
  recordedArgs.push(args);
  // ... return a fake child returning the expected eval response stdout
};

await executeWriteNote(
  { target_mode: "specific", vault: "TestVault", path: "Sandbox/note.md", content: "x".repeat(100_000) },
  { logger, queue, vaultRegistry: fakeRegistry, fs: fakeFs, spawnFn: stubSpawn },
);

// SC-007: every argv element across every spawn must be ≤ 250 bytes
for (const args of recordedArgs) {
  for (const arg of args) {
    expect(arg.length).toBeLessThanOrEqual(250);
  }
}
// And: no argv element contains the user content
const allArgvBlob = recordedArgs.flat().join("|");
expect(allArgvBlob).not.toContain("xxxxx");  // sample of the content
```

## Single-eval-per-call invariant (specific mode)

| Mode | Pre-write eval | Post-write evals |
|---|---|---|
| Specific | none | invalidate (always) + openLinkText (if `open: true`) |
| Active | focused-file resolve (always) | invalidate (always) |

Total spawn calls per write:

- Specific + `open: false`: 1 eval (invalidate) + first-call probe ($+1$ on first ever write)
- Specific + `open: true`: 2 evals (invalidate + open) + first-call probe ($+1$ on first ever)
- Active + `open: false`: 2 evals (focused-file + invalidate)
- Active + `open: true`: forbidden (schema rejects)

All eval calls route through the existing `invokeCli` per ADR-004 / ADR-007 and inherit the typed-tool bounds (10 s / 10 MiB) per ADR-007's 2026-05-10 amendment carve-out.
