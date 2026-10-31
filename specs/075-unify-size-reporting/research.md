# Research: Unify Size Reporting

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

All findings were traced against HEAD `a45d8b8` with `codegraph_explore`. Line numbers are as of that commit.

## Findings

### F1: How each writer computes `bytes_written` today

| Tool | Site | Computation | Meaning |
|------|------|-------------|---------|
| `append_note` | `src/tools/append_note/handler.ts:95-113` | `Buffer.byteLength(newContent) - Buffer.byteLength(existingContent)` | delta |
| `prepend` | `src/tools/prepend/handler.ts:149-201` | `fs.stat` size after the CLI call minus `fs.stat` size before | delta |
| `patch_heading` | `src/tools/patch_heading/handler.ts:232` | `Buffer.byteLength(editedContent)` | total after edit |
| `patch_block` | `src/tools/patch_block/handler.ts:185` | `Buffer.byteLength(editedContent)` | total after edit |
| `write_note` | `src/tools/write_note/handler.ts:176` | not reported; returns `{ created, path }` | — |

`patch_heading` and `patch_block` already hold `originalContent` (the string they read, `handler.ts:117` and `:107`). The delta is one subtraction away and needs no new I/O.

### F2: Published output schemas

- `appendNoteOutputSchema.bytes_written` and `prependOutputSchema.bytes_written`: `z.number().int().min(1)`.
- `patchHeadingOutputSchema.bytes_written` (`schema.ts:128`) and `patchBlockOutputSchema.bytes_written` (`schema.ts:102`): `z.number().int().min(0)`. **The `min(0)` floor rejects a shrinking edit's negative delta**, so it must go (FR-004).
- `writeNoteOutputSchema` (`schema.ts:58`): `strictObject({ created, path })`. The field must be added (FR-006).
- No `bytes_written` field carries a `.describe()` today. The `vaults` output schema (`src/tools/vaults/schema.ts:17-18`) is the precedent for described output fields.

### F3: write_note never reads the existing note

With `overwrite: true`, `executeWriteNote` probes existence with `fs.realpath(absPath)` (`handler.ts:133`): ENOENT means create, and any other errno goes to `mapFsError` and becomes `FS_WRITE_FAILED { errno, syscall, path }`. With `overwrite: false` it writes with the `wx` flag, so a success guarantees the note did not exist. The note's old size is therefore unknown today in the overwrite branch, and is exactly 0 in the `wx` branch.

### F4: Tool descriptions and docs

- None of the five tools' published descriptions (`index.ts`) mentions `bytes_written` or the result shape, so the field's own description is the only published text about the figure.
- The reference pages disagree:
  - `docs/tools/append_note.md:115,121` and `docs/tools/prepend.md:154,160` describe a delta.
  - `docs/tools/patch_heading.md:180` and `docs/tools/patch_block.md:164` describe a total, and call a near-zero value "a red flag".
  - `docs/tools/write_note.md:5,129-137,184,201,216` say the result is exactly `{ created, path }`.
- `docs/tools/index.md:5` spells out append_note's envelope.
- `.docs-as-code/capabilities/mutate.md:195` mentions `bytes_written: 0` in prepend's no-op guard. That statement stays true.
- The gitignored `.architecture/Obsidian CLI - Upstream Issues and Limitations.md:144` advises trusting `bytes_written` from append_note, patch_heading and patch_block "for byte-exact size". Under the new meaning that advice is wrong for the patch tools; see the follow-ups in plan.md.

### F5: Tests that pin the figure or write_note's shape

- `bytes_written` appears in the handler, index and schema tests of append_note, prepend, patch_heading and patch_block.
- write_note's tests pin `{ created, path }` with `toEqual`, and one of them asserts exactly two keys (`handler.test.ts:763-776`).
- `src/tools/_typed-result-fixtures.ts:346` drives write_note through `_surface.test.ts`; that test parses the result against the published output schema, so it follows the schema automatically.
- The write_note fake fs (`write_note/_handler-fixtures.ts:32`) has no `stat`; tests that simulate an existing note override `realpath`.

### F6: Fingerprint baseline

`_register-baseline.ts` fingerprints each tool's published `outputSchema`. Changing the bounds or descriptions of `bytes_written` moves `outputSchemaFingerprint` for every tool whose schema changes. The constitution makes this a deliberate-change gate: review the change, then regenerate the baseline in the same PR.

### F7: Unit of measure

- append_note and the patch tools read the note with `readFile(…, "utf8")`. Node's UTF-8 decoding keeps a leading byte-order mark as U+FEFF, so `Buffer.byteLength` of the decoded string equals the on-disk size for any valid UTF-8 note.
- prepend uses `stat` sizes, which are on-disk bytes.
- write_note writes `input.content` as UTF-8, so the size after the write is exactly `Buffer.byteLength(input.content, "utf8")`.

## Decisions

### D1: One meaning, computed where each tool already has the data

`bytes_written = size after − size before`, in bytes.

- **append_note**: unchanged.
- **prepend**: unchanged. Its `bytesWritten <= 0` guard (`FS_WRITE_FAILED` with `reason: "post-stat-byte-delta-zero"`) stays as it is.
- **patch_heading / patch_block**: `Buffer.byteLength(editedContent, "utf8") − Buffer.byteLength(originalContent, "utf8")`, the same formula append_note uses. `originalContent` is the content the edit was derived from, so in patch_heading's tolerated race (identity unchanged, other bytes changed; last-write-wins) the figure describes the write the tool made, as the spec's concurrency edge case requires.
- **write_note**: `Buffer.byteLength(input.content, "utf8") − oldSize`. `oldSize` is 0 in the `wx` branch and the `stat` size in the overwrite branch (D2).

**Rationale**: no new I/O except write_note's probe, and the patch tools reuse append_note's existing formula.

**Alternatives considered**:

- Re-`stat` the file after every write. This adds I/O to four tools and opens a race window in which another program's edit leaks into the figure.
- A shared `byteDelta(before, after)` helper. Each call site is a single subtraction, so a helper would be an abstraction for one line (Karpathy §2).

### D2: write_note's existence probe becomes a `stat` that also yields the old size

Replace `await fs.realpath(absPath)` (`handler.ts:133`) with `oldSize = (await fs.stat(absPath)).size`. The error handling stays as it is:

- ENOENT → `existedBefore = false`, `oldSize = 0`;
- any other errno → `throw mapFsError(e)`, which is `FS_WRITE_FAILED { errno, syscall: "stat", path }` and happens before anything is written (clarification Q3, FR-006a, ADR-009 Decision §7).

write_note's `ExecuteFs` gains `stat: (p) => Promise<{ size: number }>`, the same seam prepend has. `DEFAULT_FS` maps it to `nodeFs.stat`.

**Rationale**: one call gives both existence and size, so there is no second probe. The failure surface keeps the same code and shape; only `details.syscall` reads `stat` instead of `realpath`, which is a value inside the existing shape.

**Alternatives considered**:

- Keep `realpath` and add a `stat`. Two round trips for one fact, with a window between them.
- `readFile` the old note. This reads the whole note just to get its length.
- Write anyway and omit or guess the figure. Rejected in clarification Q3 (Principle IV).

### D3: Schema changes

- **patch_heading, patch_block**: `bytes_written: z.number().int().describe(BYTES_WRITTEN_DESCRIPTION)`, with `min(0)` removed.
- **append_note, prepend**: `bytes_written: z.number().int().min(1).describe(BYTES_WRITTEN_DESCRIPTION)`. The bound is unchanged, because a successful add always grows the note (FR-005); only the description is added.
- **write_note**: `strictObject({ created, path, bytes_written: z.number().int().describe(BYTES_WRITTEN_DESCRIPTION) })`.

### D4: One shared description string

`BYTES_WRITTEN_DESCRIPTION` is exported from `src/tools/_shared.ts`, beside `closedVaultNote`, the existing shared description text. The five schemas import it. Proposed text:

> Change in the note's size in bytes caused by this write: its size after the write minus its size before, counting a note that did not exist as 0. Zero when the size did not change; negative when the note shrank.

The same words appear on all five tools (FR-008, SC-003). The zero and negative clauses never occur for append_note or prepend, but they are true of those tools too.

**Rationale**: a shared constant cannot drift, which is the pattern of `TARGET_MODE_FILE_DESCRIPTION`. A string constant is used rather than a shared zod field, because each schema chains its own bound and a description attached before a chained bound would not reliably carry over.

**Alternative considered**: putting the constant in a new `_bytes-written.ts` module. That adds a file for one string, while `_shared.ts` already holds shared description text and imports only types.

### D5: Docs and release notes

- The five `docs/tools/*.md` result tables use one sentence for `bytes_written`, matching D4.
- The "near-zero is a red flag" advice is removed and replaced with verification advice that holds for every tool: compare `bytes_written` with the size change you intended.
- `docs/tools/write_note.md` documents the new field and loses "exactly two keys".
- `docs/tools/index.md`: append_note's envelope stays; write_note's entry mentions `bytes_written`.
- `CHANGELOG.md` `[Unreleased]` gains `Spec 075-unify-size-reporting (BI-0116).`, a **Changed** entry for patch_heading and patch_block with a migration note, and an **Added** entry for write_note's `bytes_written` (FR-010).
- `.docs-as-code/` is updated by `/speckit-docs-as-code` after review, per CLAUDE.md.

### D6: Tests, co-located (Principle II)

- **patch_heading** handler tests: each of the three modes yields `after − before`; a `replace` with same-size content yields 0; a shrink or clear yields a negative value.
- **patch_block** handler tests: grow, same-size and shrink or clear, including a separately-placed block.
- **write_note** handler tests:
  - create with `overwrite: false` → `byteLength(content)`;
  - create with `overwrite: true` on an absent path → `byteLength(content)`;
  - replace longer, shorter and same-size → delta;
  - empty create → 0;
  - multi-byte content counts bytes, not characters;
  - `stat` fails with EACCES → `FS_WRITE_FAILED { errno: "EACCES", syscall: "stat" }` and nothing is written (no `writeFile` or `rename` recorded);
  - the active mode case;
  - the "exactly two keys" test becomes three keys.
- **Schema tests**: patch schemas accept negative values; write_note's output requires `bytes_written` and rejects a non-integer; append and prepend still reject 0.
- **Index tests**: assertions on the published output schema pick up the description.
- **Uniform check (User Story 4)**: each handler test file gets one test that applies the same check, reported figure equals the size after minus the size before, measured from the content the fake fs saw before and after the write. No per-tool adjustment.
- The baseline is regenerated; `outputSchemaFingerprint` changes for exactly these five tools.

### D7: No T0 live-CLI probe is required

Four of the tools never call the CLI to write. prepend's CLI call and its stat bracketing are unchanged. The optional live check in [quickstart.md](quickstart.md) §3 exercises the real filesystem under `.memory/test-execution-instructions.md`.

### D8: Recording the convention

Record the convention in an ADR during the docs-as-code pass: `bytes_written` means the size change on every single-note text writer (append_note, prepend, patch_heading, patch_block, write_note). The number is allocated at the next vault sync, as spec 073 did. Spec 074 recorded ADR-047, so the next number is not assumed here.
