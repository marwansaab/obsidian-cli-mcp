# Phase 1: Design & Contracts — Data Model

**Feature**: `016-reliable-writer`
**Created**: 2026-05-10
**Plan reference**: [plan.md](plan.md) | **Research reference**: [research.md](research.md)

This document captures the concrete TypeScript types, zod schemas, module-level interfaces, test inventory, and LOC budget for the Reliable Writer feature. Decisions captured here are downstream of (and consistent with) Phase 0 research and [ADR-009](../../.decisions/ADR-009%20-%20Direct%20Filesystem%20Write%20Path%20Alongside%20CLI%20Bridge.md).

## Module: `src/vault-registry/`

### Public surface

```ts
// src/vault-registry/registry.ts
// Original — no upstream. Lazy vault-name → absolute-path map per ADR-009.

export interface VaultRegistryDeps {
  /** Bug-safe wrapper over `obsidian vaults verbose` — returns the raw stdout. */
  invokeProbe: () => Promise<string>;
}

export interface VaultRegistry {
  /**
   * Resolve a caller-supplied vault name to its canonical absolute filesystem path.
   * On first call, fires the lazy probe; on success the result is cached for the
   * MCP-server-process lifetime. On probe failure, the underlying error propagates
   * and the next call retries.
   *
   * @throws UpstreamError(VALIDATION_ERROR) if the probe succeeded but the vault
   *         name is not in the resulting registry.
   * @throws UpstreamError(CLI_BINARY_NOT_FOUND | CLI_REPORTED_ERROR | ...) if the
   *         probe itself failed.
   */
  resolveVaultPath(vaultName: string): Promise<string>;
}

export function createVaultRegistry(deps: VaultRegistryDeps): VaultRegistry;
```

### Internal state

```ts
type CachedRegistry = ReadonlyMap<string, string>;  // name → absolute path

// Module-private state inside createVaultRegistry's closure:
let cache: CachedRegistry | null = null;  // null until first successful probe
```

### Probe response parser

```ts
function parseVaultsVerboseOutput(stdout: string): CachedRegistry {
  // Output format (verified F2):
  //   <name>\t<absolute-path>\n
  //   <name>\t<absolute-path>\n
  //   ...
  // Strip BOM if present; split on \n; ignore empty trailing line; split each
  // row on the FIRST \t (vault names cannot contain \t per Obsidian's filename
  // rules, but the path may contain spaces).
}
```

### Test seam

The handler dependency injection passes a `vaultRegistry: VaultRegistry` argument; tests inject a fake registry without touching the CLI. The `createVaultRegistry` factory itself is tested directly with a mocked `invokeProbe`.

## Module: `src/path-safety/`

### Public surface

```ts
// src/path-safety/schema.ts
// Original — no upstream. Schema-layer path-safety validators per ADR-009 / FR-013.

import { z } from "zod";

/**
 * Refinement for vault-relative paths. Use as `.refine(isSafePath, ...)` on a
 * z.string() field.
 *
 * Rejects:
 *   - any '../' or '..\' segment
 *   - leading '/' or '\' (POSIX or Windows absolute)
 *   - drive-letter prefix '[A-Za-z]:'
 *   - control characters [\x00-\x1f]
 *
 * Accepts everything else; runtime canonical check (path-safety/canonical.ts) is
 * the second layer.
 */
export function isStructurallySafePath(input: string): boolean;
export const STRUCTURALLY_UNSAFE_PATH_MESSAGE: string;
```

```ts
// src/path-safety/canonical.ts
// Original — no upstream. Runtime canonical-path check per ADR-009 / FR-014.

export interface CanonicalCheckDeps {
  /** Resolves a path to its canonical real path; throws on ENOENT. */
  realpath: (p: string) => Promise<string>;
}

export interface CanonicalCheckResult {
  ok: true;
  /** The absolute path the write should target (resolved via realpath when
   *  parent exists; lexical fallback when ENOENT). */
  resolvedPath: string;
}

export interface CanonicalCheckEscape {
  ok: false;
  /** The vault-relative input that escaped. Use for the pathEscapeAttempt
   *  logger event (FR-029). */
  attemptedPath: string;
  /** The canonical resolved path (or lexical fallback) that violated the
   *  startsWith check. */
  resolvedPath: string;
}

/**
 * Verify the resolved absolute path lies under vaultRoot. Runs BEFORE the
 * caller's mkdir step (per FR-014's pre-mkdir order). On the parent-dir
 * realpath ENOENT case, falls back to lexical path.resolve — safe because the
 * caller is expected to have run isStructurallySafePath first.
 */
export function checkCanonicalPath(
  vaultRoot: string,
  inputPath: string,
  deps: CanonicalCheckDeps,
): Promise<CanonicalCheckResult | CanonicalCheckEscape>;
```

### Test seam

`CanonicalCheckDeps.realpath` is injectable; tests cover the happy path (no symlinks), the symlink-to-outside path, and the ENOENT fallback path without touching the real filesystem.

## Module: `src/tools/write_note/`

### Input schema

```ts
// src/tools/write_note/schema.ts
// Original — no upstream. Direct-fs-write input/output schemas per ADR-009.

import { z } from "zod";
import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";
import { isStructurallySafePath, STRUCTURALLY_UNSAFE_PATH_MESSAGE } from "../../path-safety/schema.js";

const fileFieldSafe = z.string().min(1).refine(isStructurallySafePath, STRUCTURALLY_UNSAFE_PATH_MESSAGE);
const pathFieldSafe = z.string().min(1).refine(isStructurallySafePath, STRUCTURALLY_UNSAFE_PATH_MESSAGE);

export const writeNoteInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema
    .extend({
      content: z.string(),
      overwrite: z.boolean().optional().default(false),
      open: z.boolean().optional(),
    })
    .refine(
      (data) => {
        // Override the base file/path fields with safe variants when supplied.
        // Validation flows through targetModeBaseSchema's existing XOR rule;
        // the path-safety refinement runs in addition.
        if (data.target_mode === "specific") {
          if (data.file !== undefined && !isStructurallySafePath(data.file)) return false;
          if (data.path !== undefined && !isStructurallySafePath(data.path)) return false;
        }
        return true;
      },
      { message: STRUCTURALLY_UNSAFE_PATH_MESSAGE },
    ),
).superRefine((input, ctx) => {
  if (input.target_mode !== "active") return;
  if (input.overwrite !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["overwrite"],
      message:
        "overwrite must be true in active mode (active mode is destructive by definition; explicit-opt-in posture binds uniformly)",
    });
  }
  if (input.open !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["open"],
      message: "open is not allowed in active mode",
    });
  }
});

// `template` parameter explicitly NOT in the schema. If a caller supplies it,
// the strict-mode reject from targetModeBaseSchema's `.strict()` fires:
//   VALIDATION_ERROR with `code: "unrecognized_keys"`, `keys: ["template"]`
// The progressive-disclosure help (FR-022) explains the migration path
// (use obsidian_exec for template-based creation).

export const writeNoteOutputSchema = z
  .object({
    created: z.boolean(),
    path: z.string(),
  })
  .strict();

export type WriteNoteInput = z.infer<typeof writeNoteInputSchema>;
export type WriteNoteOutput = z.infer<typeof writeNoteOutputSchema>;
```

### Handler interface

```ts
// src/tools/write_note/handler.ts
// Original — no upstream. Direct-fs-write handler per ADR-009.

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";
import type { SpawnLike } from "../../cli-adapter/cli-adapter.js";
import type { VaultRegistry } from "../../vault-registry/registry.js";
import type { WriteNoteInput, WriteNoteOutput } from "./schema.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  vaultRegistry: VaultRegistry;
  /** Test seam for fs operations. Default uses node:fs/promises. */
  fs?: {
    mkdir: (p: string, opts: { recursive: true }) => Promise<unknown>;
    writeFile: (p: string, content: string, opts?: { flag?: "wx" }) => Promise<void>;
    rename: (from: string, to: string) => Promise<void>;
    realpath: (p: string) => Promise<string>;
    unlink: (p: string) => Promise<void>;
  };
  /** Test seam for the small eval calls. Default uses cli-adapter's invokeCli. */
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export async function executeWriteNote(input: WriteNoteInput, deps: ExecuteDeps): Promise<WriteNoteOutput>;
```

### Handler IO sequence

Implements the per-write IO sequence from ADR-009 *Decision* + spec FR-005..FR-019:

```text
Specific mode (input.target_mode === "specific"):
  1. vaultRoot = deps.vaultRegistry.resolveVaultPath(input.vault!)
  2. relPath = input.path ?? input.file!
     check = await checkCanonicalPath(vaultRoot, relPath, { realpath: deps.fs.realpath })
     if !check.ok:
       deps.logger.pathEscapeAttempt({ vault: input.vault ?? null, attemptedPath: check.attemptedPath })
       throw UpstreamError({ code: "PATH_ESCAPES_VAULT", details: { vault: input.vault!, attemptedPath: check.attemptedPath } })
     absPath = check.resolvedPath
  3. await deps.fs.mkdir(dirname(absPath), { recursive: true })
  4. if input.overwrite:
       tmpPath = `${absPath}.${randomUUID()}.tmp`
       await deps.fs.writeFile(tmpPath, input.content)
       try {
         await deps.fs.rename(tmpPath, absPath)
       } catch (e) {
         await deps.fs.unlink(tmpPath).catch(() => {})  // best-effort tmp cleanup
         throw mapFsError(e)
       }
       created = !existedBefore  // see step 4a
     else:
       try {
         await deps.fs.writeFile(absPath, input.content, { flag: "wx" })
         created = true
       } catch (e: any) {
         if (e.code === "EEXIST") throw UpstreamError({ code: "FILE_EXISTS", details: { path: relPath } })
         throw mapFsError(e)
       }
  5. await invalidateCache(absPath, deps).catch(() => {})  // best-effort per FR-011 / R5
  6. if input.open === true:
       await openInEditor(absPath, deps).catch(() => {})  // best-effort per FR-017 (open is UX nicety)
  7. return { created, path: relPath }

  4a. To populate `created` correctly when input.overwrite === true, do an
      fs.access (or fs.stat) on absPath BEFORE the temp-write to determine if
      the file existed prior. This is a benign race (TOCTOU) — it only affects
      the boolean in the success envelope, never the write itself. If the file
      was absent at step 4a but appears between 4a and the rename, the rename
      still succeeds (overwrite=true semantics) and the response says
      created=false (which is now wrong but only by a microsecond's worth of
      vault state). Acceptable; documented as Edge Case.

Active mode (input.target_mode === "active"):
  1. eval to resolve focused-file path:
       (async () => {
         const f = app.workspace.getActiveFile();
         return JSON.stringify({path: f?.path ?? null, base: app.vault.adapter.basePath});
       })()
     → resp = { path: string | null, base: string }
     if resp.path === null: throw UpstreamError({ code: "ERR_NO_ACTIVE_FILE", details: ... })
     vaultRoot = resp.base
     relPath = resp.path
  2..7. as specific mode, with vaultRoot/relPath set per step 1
  (input.open is forbidden in active mode per FR-017 / target-mode contract — rejected at schema layer)
```

### Eval template details

```ts
// src/tools/write_note/eval-templates.ts (or inlined into handler.ts)

const FOCUSED_FILE_TEMPLATE =
  "(async()=>{const f=app.workspace.getActiveFile();return JSON.stringify({path:f?.path??null,base:app.vault.adapter.basePath});})()";

function buildInvalidateTemplate(absPath: string): string {
  // path is JSON-encoded for embedding; the resulting argv stays under 250 bytes
  // for paths up to ~150 chars (typical Obsidian paths are well under).
  return `(async()=>{const f=app.vault.getFileByPath(${JSON.stringify(absPath)});if(f)await app.metadataCache.computeMetadataAsync(f);})()`;
}

function buildOpenTemplate(absPath: string): string {
  return `app.workspace.openLinkText(${JSON.stringify(absPath)},"")`;
}
```

### Tool registration

```ts
// src/tools/write_note/index.ts
// Original — no upstream. write_note tool registration via registerTool per ADR-006.

import { registerTool } from "../_register.js";
import { executeWriteNote, type ExecuteDeps } from "./handler.js";
import { writeNoteInputSchema } from "./schema.js";
import type { RegisteredTool } from "../_shared.js";

export const WRITE_NOTE_TOOL_NAME = "write_note";

export const WRITE_NOTE_DESCRIPTION =
  "Create a new note in an Obsidian vault, or overwrite an existing one when overwrite=true. Defaults: overwrite=false, open=false. Active mode requires overwrite=true (writes a new file in the active vault context). Content is written directly to the vault filesystem (bypasses the upstream argv-IPC defect; see ADR-009). Call help({ tool_name: \"write_note\" }) for full parameter docs and the error-code roster.";

export type RegisterDeps = ExecuteDeps;

export function createWriteNoteTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: WRITE_NOTE_TOOL_NAME,
    description: WRITE_NOTE_DESCRIPTION,
    schema: writeNoteInputSchema,
    deps,
    handler: async (input, d) => executeWriteNote(input, d),
  });
}
```

## Server-level wiring

```ts
// src/server.ts (delta — only the touches needed):

// (Existing import — no change)
import { createWriteNoteTool } from "./tools/write_note/index.js";

// NEW import
import { createVaultRegistry } from "./vault-registry/registry.js";
import { invokeCli } from "./cli-adapter/cli-adapter.js";

export function createServer(ctx: ShutdownContext = {}): CreatedServer {
  const logger = createLogger({ stream: ctx.loggerStream });
  const queue = createQueue();
  // ... existing setup ...

  // NEW: construct the lazy vault registry
  const vaultRegistry = createVaultRegistry({
    invokeProbe: async () => {
      const { stdout } = await invokeCli(
        { command: "vaults", parameters: {}, flags: ["verbose"], target_mode: "specific" },
        { logger, queue },
      );
      return stdout;
    },
  });

  const tools: RegisteredTool[] = [
    createDeleteNoteTool({ logger, queue }),
    createFindByPropertyTool({ logger, queue }),
    createHelpTool(),
    createObsidianExecTool({ logger, queue }),
    createReadHeadingTool({ logger, queue }),
    createReadNoteTool({ logger, queue }),
    createReadPropertyTool({ logger, queue }),
    createWriteNoteTool({ logger, queue, vaultRegistry }),  // CHANGED: + vaultRegistry dep
  ];

  // ... rest unchanged ...
}
```

## Per-tool invariants

| Invariant | Source | Test |
|---|---|---|
| User content NEVER crosses argv at any size | FR-005, SC-007, ADR-009 | handler.test.ts: spawn-arg-length assertion across content sizes 100B / 5KB / 100KB |
| All eval argv elements ≤ 250 bytes | R1, R5, R6, R14 | handler.test.ts: per-call eval argv length assertion |
| Specific mode honours `vault=Foo` end-to-end (no R11 limitation) | F4, ADR-009 | handler.test.ts: vault=Foo writes to Foo's absolute path even when focused vault is Bar |
| Path-traversal at schema boundary → VALIDATION_ERROR | FR-013, R3 | schema.test.ts: rejection cases for `../`, `/abs`, `C:`, control chars |
| Symlink-escape at runtime → PATH_ESCAPES_VAULT + typed `logger.pathEscapeAttempt({vault, attemptedPath})` event | FR-014, FR-029, R3, R6 (typed Logger method per Analyze C1) | canonical.test.ts: symlink rejection; handler.test.ts: logger event assertion |
| File exists + overwrite=false → FILE_EXISTS atomically (no race window) | FR-009, R4 | handler.test.ts: wx-flag EEXIST mapping; concurrency test if practical |
| Atomic write via temp-then-rename for overwrite=true | FR-008, R4 | handler.test.ts: rename-failure cleanup of tmp file; happy-path no orphan tmp |
| Auto-mkdir parent dirs (parity with predecessor) | FR-010, R4 | handler.test.ts: nested fresh path creates parents |
| metadataCache invalidation eval failure → success envelope still returned (best-effort) | FR-011, R5 | handler.test.ts: eval-failure mock; assert success response |
| Active mode → ERR_NO_ACTIVE_FILE on null focused-file | FR-019, R14 | handler.test.ts: focused-file eval returns null; assert error code |
| open: true → post-write openLinkText eval (best-effort) | FR-017, R9 | handler.test.ts: open-true happy path; open-true eval-failure tolerated |
| `template` rejected at schema → VALIDATION_ERROR with `unrecognized_keys` | FR-016, R9 | schema.test.ts: input with template field |
| Output shape `{ created, path }` byte-stable with predecessor | FR-003, R10 | schema.test.ts: writeNoteOutputSchema strict-shape; handler.test.ts: response envelope |

## Test inventory

Co-located vitest cases per Principle II. All counts target FR-coverage of at-least-one happy-path + at-least-one failure-or-boundary case per FR.

### `src/vault-registry/registry.test.ts` — ~10 cases

| # | Case | FR cover |
|---|---|---|
| 1 | First call fires probe; subsequent calls hit cache (no second probe) | FR-012 |
| 2 | Probe response with multiple vaults parsed correctly (tab-separated) | FR-012, F2 |
| 3 | resolveVaultPath("known") returns expected absolute path | FR-012 |
| 4 | resolveVaultPath("unknown") throws VALIDATION_ERROR (vault not in registry) | FR-021 |
| 5 | First call probe failure (CLI_BINARY_NOT_FOUND) propagates; cache stays empty | FR-012 |
| 6 | First call probe failure → second call retries probe (no stuck-failed state) | FR-012, R2 |
| 7 | Successful probe after a previous failure populates cache | R2 |
| 8 | Probe response with empty stdout returns empty registry → all lookups VALIDATION_ERROR | F2, edge |
| 9 | Probe response with malformed row (no `\t`) is skipped silently; well-formed rows still parsed | F2, robustness |
| 10 | Concurrent first-calls share one probe (no double-probe on race) | concurrency |

### `src/path-safety/schema.test.ts` — ~12 cases

| # | Case | FR cover |
|---|---|---|
| 1 | Plain vault-relative path accepted (e.g. `"Daily/2026-05-10.md"`) | FR-013 |
| 2 | Path with spaces and Unicode accepted (e.g. `"Notes/My Note 📝.md"`) | FR-013 (positive) |
| 3 | Path with brackets / parens accepted (e.g. `"[[wiki]]/note.md"`) | FR-013 (positive) |
| 4 | `"../escape.md"` → rejected | FR-013 |
| 5 | `"a/../escape.md"` → rejected | FR-013 |
| 6 | `"a/../../escape.md"` → rejected | FR-013 |
| 7 | `"/abs/path.md"` → rejected (POSIX leading slash) | FR-013 |
| 8 | `"\\abs\\path.md"` → rejected (Windows leading backslash) | FR-013 |
| 9 | `"C:/path.md"` → rejected (drive-letter) | FR-013 |
| 10 | `"c:\\path.md"` → rejected (drive-letter, backslash) | FR-013 |
| 11 | Path with control characters (`\x00`..`\x1f`) → rejected | FR-013 |
| 12 | Empty string → rejected (z.string().min(1) refinement boundary) | FR-013, schema base |

### `src/path-safety/canonical.test.ts` — ~8 cases

| # | Case | FR cover |
|---|---|---|
| 1 | Input resolves under vault root (no symlinks) → ok=true with resolved path | FR-014 |
| 2 | Input resolves OUT of vault root via symlink in parent dir → ok=false | FR-014 |
| 3 | Input's parent dir doesn't exist (ENOENT) → lexical fallback returns ok=true | FR-014 (ENOENT path) |
| 4 | Realpath on nested-existing-symlink dir → canonical path checked correctly | FR-014 |
| 5 | Vault root itself is a symlink → realpath canonicalises both vault root and target; check still works | FR-014 (vault root symlink) |
| 6 | resolvedPath returned by ok=true branch is suitable for fs.writeFile (absolute path) | FR-014 |
| 7 | attemptedPath in ok=false branch echoes the input verbatim (for logger event in FR-029) | FR-014, FR-029 |
| 8 | Realpath throws non-ENOENT error (e.g. EACCES) → propagates as is (caller maps to FS_WRITE_FAILED) | FR-020 |

### `src/tools/write_note/schema.test.ts` — ~22 cases

| # | Case | FR cover |
|---|---|---|
| 1 | Specific mode + vault + path + content + overwrite=true accepted | FR-002 |
| 2 | Specific mode + vault + file + content accepted (file/path XOR base) | FR-002 |
| 3 | Specific mode without vault → VALIDATION_ERROR | target-mode rule |
| 4 | Specific mode with both file and path → VALIDATION_ERROR | target-mode rule |
| 5 | Specific mode with neither file nor path → VALIDATION_ERROR | target-mode rule |
| 6 | Active mode + content + overwrite=true accepted | FR-002, FR-018 |
| 7 | Active mode without overwrite → VALIDATION_ERROR | active-mode rule |
| 8 | Active mode with vault → VALIDATION_ERROR | target-mode rule |
| 9 | Active mode with file → VALIDATION_ERROR | target-mode rule |
| 10 | Active mode with path → VALIDATION_ERROR | target-mode rule |
| 11 | Active mode with open → VALIDATION_ERROR | FR-017 |
| 12 | Specific mode with `template: "Daily"` → VALIDATION_ERROR (unrecognized_keys) | FR-016 |
| 13 | Specific mode with `open: true` accepted | FR-017 |
| 14 | overwrite default is false (omitted in input → parsed as false) | FR-002 |
| 15 | Path with `../` → VALIDATION_ERROR | FR-013 (path-safety integration) |
| 16 | Path with leading `/` → VALIDATION_ERROR | FR-013 |
| 17 | Path with drive letter → VALIDATION_ERROR | FR-013 |
| 18 | Empty content accepted | edge case |
| 19 | Very large content (e.g. 100KB) accepted at schema layer | FR-005, R7 |
| 20 | Output shape `{ created: true, path: "..." }` parses | FR-003 |
| 21 | Output shape with extra field rejected (strict) | FR-003 |
| 22 | Output shape with wrong type for `created` rejected | FR-003 |

### `src/tools/write_note/handler.test.ts` — ~30 cases

| # | Case | FR cover |
|---|---|---|
| 1 | Specific mode happy path: fresh file written, returns `{ created: true, path: ... }` | FR-005, FR-006 |
| 2 | Specific mode overwrite=true happy path: existing file replaced, returns `{ created: false, path: ... }` | FR-006 |
| 3 | Specific mode overwrite=false against existing file → FILE_EXISTS, original content unchanged | FR-009 |
| 4 | Specific mode overwrite=false against fresh path → FILE_EXISTS NOT raised; file created | FR-009 |
| 5 | Auto-mkdir of nested parent dirs (e.g. `Daily/2026/05/note.md`) on fresh path | FR-010 |
| 6 | vault=Foo when focused vault is Bar → write lands at Foo's absolute path (resolves R11) | F4, FR-012 |
| 7 | vault=Unknown → VALIDATION_ERROR (vault not in registry) | FR-021 |
| 8 | Path-escape attempt (symlink to outside) → PATH_ESCAPES_VAULT + typed `logger.pathEscapeAttempt({vault, attemptedPath})` event fired | FR-014, FR-029 |
| 9 | Atomic write: tmp file orphaned cleanly when rename fails (best-effort unlink) | FR-008 |
| 10 | Atomic write: temp file uniqueness via UUID — concurrent writes don't collide on tmp | FR-008 |
| 11 | metadataCache invalidation eval succeeds; response is success | FR-011 |
| 12 | metadataCache invalidation eval fails → response is STILL success (best-effort per R5) | FR-011, R5 |
| 13 | Active mode with focused file → focused-file path resolved + write happens at resolved path | FR-018 |
| 14 | Active mode with no focused file → ERR_NO_ACTIVE_FILE | FR-019 |
| 15 | Active mode → eval is ~120 bytes argv (assertion on spawn args) | SC-007, F1 |
| 16 | open=true → post-write openLinkText eval fired | FR-017 |
| 17 | open=true + post-write open eval fails → response is STILL success (best-effort) | FR-017 |
| 18 | open=false (default) → no openLinkText eval | FR-017 |
| 19 | FS_WRITE_FAILED with details.errno=ENOSPC mapping | FR-020 |
| 20 | FS_WRITE_FAILED with details.errno=EACCES mapping | FR-020 |
| 21 | Content with double quotes survives byte-for-byte | FR-004 |
| 22 | Content with `,]"Calls.md",]` (BI-038 trigger fragment) survives byte-for-byte | FR-004 |
| 23 | Content with mixed CRLF/LF line endings preserved | FR-004 |
| 24 | Content with multi-byte UTF-8 + emoji preserved | FR-004 |
| 25 | Spawn arg length assertion: NO spawn call carries content as an argv element | FR-005, SC-007 |
| 26 | Spawn arg length assertion: every emitted spawn argv element ≤ 250 bytes | SC-007 |
| 27 | 100KB content write succeeds (large-content sanity) | SC-001, SC-007 |
| 28 | First write triggers vault-registry probe; second write hits cache (no second probe) | FR-012, R2 |
| 29 | Vault-registry probe failure (Obsidian not running) → first write fails with CLI_REPORTED_ERROR; second write retries probe | FR-012, R2 |
| 30 | Output envelope shape exactly `{ created: boolean, path: string }` (no extra fields, parity lock) | FR-003, R10 |

### `src/tools/write_note/index.test.ts` — ~5 cases

| # | Case | FR cover |
|---|---|---|
| 1 | Tool registers with name `"write_note"` | FR-001 |
| 2 | Tool description ends with `Call help({ tool_name: "write_note" })` per ADR-005 | FR-022 |
| 3 | docs/tools/write_note.md exists at the expected path | FR-022, ADR-005 |
| 4 | Tool's published `inputSchema.required` includes `target_mode` (under-promise pattern per architecture) | architecture |
| 5 | Tool's published `inputSchema.additionalProperties` is false (catches `template`, etc., at strict-naive client layer) | FR-016 |

**Total test count**: ~10 + 12 + 8 + 22 + 30 + 5 = **~87 cases**.

### Drift detector

The post-010 consolidated drift detector at `src/tools/_register.test.ts` auto-covers `write_note` via its `it.each` registry walk — no test-file modifications required for this feature.

## LOC budget

Estimates based on the per-file inventory above and the contour of similar prior typed tools (013-read-property: ~205 source / ~960 test; 015-read-heading: ~205 source / ~960 test).

| File | Lines (source) | Lines (test) |
|---|---|---|
| `src/vault-registry/registry.ts` | ~50 | ~120 |
| `src/path-safety/schema.ts` | ~30 | ~80 |
| `src/path-safety/canonical.ts` | ~40 | ~100 |
| `src/tools/write_note/schema.ts` | ~50 | ~250 |
| `src/tools/write_note/handler.ts` | ~120 | ~400 |
| `src/tools/write_note/index.ts` | ~25 | ~80 |
| `src/server.ts` (delta) | +5 | (no test delta — _register.test.ts auto-covers) |
| `docs/tools/write_note.md` | ~150 (doc) | n/a |
| **Total NEW lines** | **~315** source + ~150 doc | **~1030** test |

LOC budget is comparable to 013/015 (~205 source / ~960 test) plus ~110 LOC overhead for the two new internal modules (vault-registry + path-safety) that the predecessor didn't need.

## Out of scope (deferred to T0 of `/speckit-implement`)

- Path-safety extended-character coverage: DEL `\x7f`, Unicode RTL/zero-width chars (U+200B-U+200F, U+202A-U+202E, U+FEFF). Marginal security value for an agent-driven write surface; T0 decides whether to extend the schema regex by one character (DEL) or leave as-is.
- Orphan `.tmp` cleanup on rare rename failure: spec FR-008 says best-effort `unlink`. T0 decides exact retry-on-cleanup-failure semantics or no-retry.
- Concurrency test for FILE_EXISTS race-freeness (User Story 2 AC#4 bonus): may not be reliable to test deterministically in vitest; T0 decides whether to skip or use a deliberate-stall mock.
- Mid-write SIGTERM crash-safety test (User Story 1 AC#7): hard to reproduce deterministically in vitest; T0 may defer to a manual / external integration test.
