# Handler Delta Contract: write_note (020-fix-write-gaps)

**Feature**: 020-fix-write-gaps
**Scope**: handler-layer patch to `src/tools/write_note/handler.ts`
**Date**: 2026-05-12

This contract documents the precise delta between the 016-reliable-writer shipping handler and the post-020 handler. It is intentionally narrow: this BI does NOT touch the schema, the cli-adapter, the path-safety modules, the vault registry, the write mechanism, the logger surface, the error catalogue, or any other tool. Only the two contract gaps named in the spec are fixed.

## What changes

### Change 1 — Target-path resolution for specific mode

**Site**: [src/tools/write_note/handler.ts:147-150](../../src/tools/write_note/handler.ts#L147-L150).

**Before**:

```ts
} else {
  vaultRoot = await deps.vaultRegistry.resolveVaultPath(input.vault!);
  relPath = (input.path ?? input.file)!;
}
```

**After**:

```ts
} else {
  vaultRoot = await deps.vaultRegistry.resolveVaultPath(input.vault!);
  relPath = resolveSpecificModePath(input);
}
```

**New helper** (file-local, declared inside `handler.ts`):

```ts
function resolveSpecificModePath(input: WriteNoteInput): string {
  if (input.path !== undefined) return input.path;
  const file = input.file!;
  if (isCanonicalShortForm(file)) return `${file}.md`;
  return file;
}

function isCanonicalShortForm(file: string): boolean {
  return !file.includes("/") && !file.includes("\\") && !file.endsWith(".md");
}
```

**Behaviour**:

- `input.path` supplied → return verbatim (unchanged from 016 behaviour for `path` form per FR-004).
- `input.path` absent AND `input.file` matches the canonical short-form shape (no `/`, no `\`, does not end in `.md`) → return `${input.file}.md` (FR-001 / FR-002).
- `input.path` absent AND `input.file` is non-canonical (contains a separator OR ends in `.md`) → return `input.file` verbatim (FR-001a passthrough).

**Invariants preserved**:

- Active mode still uses `parsed.path` from the focused-file eval result (handler.ts:145-146). The new helper is never invoked in active mode.
- The `relPath` value flows into `checkCanonicalPath` (handler.ts:152) downstream; path safety validates the *resolved* path, not the raw input (R5).
- The `relPath` value flows into the response's `path` field (handler.ts:253) on success.

### Change 2 — FILE_EXISTS details additive enrichment

**Site**: [src/tools/write_note/handler.ts:207-213](../../src/tools/write_note/handler.ts#L207-L213).

**Before**:

```ts
if (isErrnoCode(e, "EEXIST")) {
  throw new UpstreamError({
    code: "FILE_EXISTS",
    cause: e,
    details: { path: relPath, vault: input.vault ?? null },
    message: `File already exists at "${relPath}" and overwrite is false.`,
  });
}
```

**After**:

```ts
if (isErrnoCode(e, "EEXIST")) {
  throw new UpstreamError({
    code: "FILE_EXISTS",
    cause: e,
    details: { errno: "EEXIST", path: relPath, vault: input.vault ?? null },
    message: `File already exists at "${relPath}" and overwrite is false.`,
  });
}
```

**Behaviour**:

- Top-level error code `FILE_EXISTS` — UNCHANGED (FR-006 / FR-011).
- `details` object — `errno: "EEXIST"` added; `path` and `vault` preserved verbatim (FR-007).
- `cause` and `message` — UNCHANGED.

**Invariants preserved**:

- The `wx`-flag write mechanism (handler.ts:205) is unchanged — collision detection is still race-free via O_CREAT|O_EXCL semantics (FR-009 atomicity).
- No auto-renamed sibling file is created (FR-009 / FR-015).
- The on-disk content of the existing file is preserved byte-for-byte (FR-009).

## What does NOT change

| Surface | Status | Why |
|---------|--------|-----|
| `src/tools/write_note/schema.ts` | FROZEN | FR-012 — no input contract changes |
| `src/tools/write_note/schema.test.ts` | FROZEN | Schema unchanged |
| `src/tools/write_note/index.ts` | FROZEN | Registration unchanged |
| `src/tools/write_note/index.test.ts` | FROZEN | Descriptor unchanged |
| `mapFsError` function (handler.ts:79-97) | FROZEN per R4 | Out of scope to widen its signature |
| Active-mode resolution (handler.ts:128-146) | FROZEN | Active mode forbids `input.file`; short-form rule N/A |
| `checkCanonicalPath` (handler.ts:152) | FROZEN per FR-017 | Path-safety mechanism unchanged; validates resolved path |
| Temp-file-then-rename atomic write (handler.ts:187-198) | FROZEN per FR-017 | Write mechanism unchanged |
| Post-write `metadataCache` invalidation (handler.ts:220-233) | FROZEN per FR-017 | Cache-freshness handling unchanged |
| Post-write editor-open (handler.ts:235-251) | FROZEN per FR-017 | Optional `open` flag handling unchanged |
| `src/path-safety/**` | FROZEN | No path-safety rules change |
| `src/target-mode/**` | FROZEN | `applyTargetModeRefinement` unchanged |
| `src/vault-registry/**` | FROZEN | Lazy probe + cache mechanism unchanged |
| `src/logger.ts` | FROZEN per R7 | No new logger events for FILE_EXISTS |
| `src/errors.ts` | FROZEN per FR-011 | No new top-level error codes |
| `src/cli-adapter/**` | FROZEN | 008-refactor surface frozen |
| All other `src/tools/*/` | FROZEN per FR-014 | Other tools untouched |

## Helper contract: `resolveSpecificModePath`

### Signature

```ts
function resolveSpecificModePath(input: WriteNoteInput): string;
```

### Inputs

`input: WriteNoteInput` — the zod-validated handler input. Caller is the handler's specific-mode branch; the function is unreachable in active mode (active mode's branch returns from `parsed.path` directly).

### Outputs

A `string` value representing the vault-relative path the write will land at.

### Invariants

| # | Invariant | Test case |
|---|-----------|-----------|
| H1 | If `input.path` is supplied, the return value equals `input.path` verbatim | #5 |
| H2 | If `input.path` is absent and `input.file` is canonical short-form, the return value equals `${input.file}.md` | #1, #2 |
| H3 | If `input.path` is absent and `input.file` is non-canonical (contains `/` or `\` or ends in `.md`), the return value equals `input.file` verbatim | #3, #4 |
| H4 | The function never mutates its input | (axiom — pure function, no side effects) |
| H5 | The function never throws | (axiom — branches over input fields, no exception sources) |
| H6 | Internal periods in `input.file` (e.g. `version_1.2.3`) are NOT treated as extension boundaries — only a trailing literal `.md` ends in `.md` | #2 |

### Edge cases (documented in research.md R10)

- `file: "."` → fires the rule → resolved value is `".md"` prefixed by `.` → `"..md"`. Acceptable; documented.
- `file: ".md"` → ends in `.md` → verbatim → resolved value is `".md"`. Acceptable; documented.
- `file: ""` → rejected at schema by `min(1)`. Never reaches the helper.
- `file: "Folder\\Note"` (Windows-style separator) → contains `\` → verbatim per FR-001a.

## Helper contract: `isCanonicalShortForm`

### Signature

```ts
function isCanonicalShortForm(file: string): boolean;
```

### Inputs

`file: string` — a non-empty string (caller passes `input.file` after `path` absence is established).

### Outputs

`true` iff `file` matches the canonical short-form shape (no `/`, no `\`, does not end in `.md`); `false` otherwise.

### Invariants

| # | Invariant |
|---|-----------|
| P1 | Returns `false` if `file` contains `/` |
| P2 | Returns `false` if `file` contains `\` |
| P3 | Returns `false` if `file` ends in the literal three-character string `.md` |
| P4 | Returns `true` if none of P1 / P2 / P3 apply |
| P5 | Pure function; no side effects; never throws |
| P6 | Treats internal periods as part of the name, not extension boundaries (asserted by P3's use of `endsWith` not `extname`) |

## Failure propagation chain

UNCHANGED from 016-reliable-writer. The new `errno` field on FILE_EXISTS does not change the propagation chain; it enriches the payload on the existing rejection path.

```text
zod parse failure → ZodError → registerTool wraps as VALIDATION_ERROR
                                          │
                                          ▼
                                       caller receives
                                       { code: "VALIDATION_ERROR", details: { issues } }

handler throws UpstreamError → registerTool catches → asToolError serialises
                                          │
                                          ▼
                                       caller receives
                                       { code, message, details, cause? }

Specific UpstreamError variants relevant to this BI:
  - FILE_EXISTS  → details: { errno: "EEXIST", path, vault }    (THIS BI's enrichment)
  - FS_WRITE_FAILED  → details: { errno, syscall, path }
  - PATH_ESCAPES_VAULT → details: { vault, attemptedPath, resolvedPath }
  - ERR_NO_ACTIVE_FILE → details: {}
```

## Test-seam pattern

UNCHANGED from 016-reliable-writer. Handler tests inject `nodeFs.writeFile` (and other fs primitives) via `deps`, plus `spawnFn`, `vaultRegistry.resolveVaultPath`, `env`, `logger`, `queue`. Synthetic stdout / synthetic fs errors exercise each branch. The eight new test cases reuse the existing pattern; no new test-seam introductions. (Audit-confirmation T005 verified zero existing `file:`-parameter cases — the eight new tests are pure additions.)

### Specific seam touch points

| Test case | Seams exercised |
|-----------|-----------------|
| #1–#4 | `nodeFs.writeFile` (success), `nodeFs.realpath` (vault root canonicalisation), `vaultRegistry.resolveVaultPath` (vault lookup) |
| #5 | Same as #1–#4 |
| #6 | `nodeFs.writeFile` (rejects with `EEXIST` from the `wx` flag) |
| #7 | `nodeFs.mkdir` (rejects with `EEXIST`) — exercises the `mapFsError` path |
| #8 | `nodeFs.writeFile` (success path on the `overwrite: true` branch) + `nodeFs.realpath` (existedBefore lookup) + `nodeFs.rename` (atomic rename) |

## Cross-failure-type field-name parity (FR-008 / SC-007)

The cross-failure-type contract is on the `details.errno` field name and value vocabulary, NOT on full `details`-object shape. After this BI:

| UpstreamError code | `details.errno` value | Full `details` shape |
|--------------------|----------------------|---------------------|
| `FILE_EXISTS` (hot path) | `"EEXIST"` | `{ errno, path, vault }` |
| `FILE_EXISTS` (via `mapFsError`) | `"EEXIST"` | `{ errno }` (per R4 — preserved asymmetry) |
| `FS_WRITE_FAILED` | `"ENOSPC"` / `"EACCES"` / `"EROFS"` / `"ENOENT"` / etc. | `{ errno, syscall, path }` |

Callers reading `response.details?.errno` see one shape across all filesystem-level failure types. Broader fields differ per error code — that's expected; only `errno` is the load-bearing branching surface.

## Migration / compatibility

| Concern | Disposition |
|---------|-------------|
| Callers depending on `FILE_EXISTS` `details: { path, vault }` exactly | NOT BROKEN — both fields preserved; `errno` added alongside |
| Callers branching on `response.code === "FILE_EXISTS"` alone | NOT BROKEN — top-level code unchanged |
| Callers reading `response.details.errno` | NEW — was undefined; now `"EEXIST"` |
| Callers passing `file: "short-form"` expecting `<short-form>.md` (matches 011 behaviour) | FIX — was broken in 016 (produced extension-less file); now restored per FR-001 / FR-002 |
| Callers passing `file: "Notes.md"` expecting verbatim | NOT BROKEN — FR-001a passthrough applies |
| Callers passing `path: "Subfolder/Note.md"` | NOT BROKEN — `path` form unchanged |
| Vault contents created during the 016-broken window (extension-less notes) | NOT MIGRATED — going-forward fix only per spec Out of scope |

## Acceptance summary

This delta implements all of:

- FR-001 / FR-001a / FR-002 / FR-003 / FR-004 (short-form resolution + verbatim passthrough + response.path reporting)
- FR-007 / FR-008 / FR-009 / FR-010 (FILE_EXISTS additive details + field-name parity + preserved invariants)
- FR-018 (help update; outside this contract — see [docs/tools/write_note.md](../../docs/tools/write_note.md))

It does NOT introduce or modify:

- Top-level error codes (FR-011)
- Input schema (FR-012)
- Output schema structure (FR-013)
- Other tools (FR-014)
- Silent auto-rename behaviour (FR-015)
- Retired `template` parameter (FR-016)
- Write mechanism (FR-017)
