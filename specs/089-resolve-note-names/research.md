# Research: Resolve Note Names

**Feature**: [spec.md](spec.md) (BI-0171) | **Date**: 2026-11-02 | **HEAD**: `5bc2621`

## T0 method

The live probes ran against `TestVault-Obsidian-CLI-MCP`, following `.memory/test-execution-instructions.md`. The CLI was `Obsidian.com` (bare `obsidian`, version `1.14.5 (installer 1.14.4)`), started with `Start-Process` and with stdout and stderr captured separately. Every command named `vault=` explicitly.

Fixtures, written under `Sandbox/089-probe/`:

- `a/deep/Probe089 Unique.md`
- `a/Probe089Dup.md`
- `b/Probe089Dup.md`

Before the run `Sandbox/` held 13 entries. Afterwards `089-probe/` was removed, `Sandbox/` was back to the same 13 entries, and `Welcome.md` was untouched.

## Code findings

- **F1: the defect is the same in both editors.** `patch_heading/handler.ts:58` and `patch_block/handler.ts:57` each define a private `resolveLocator`. In specific mode it returns `(input.file ?? input.path)!` as the vault-relative path, so a `file` name is never resolved. The `file` parameter's published description is the shared `TARGET_MODE_FILE_DESCRIPTION` (`src/target-mode/target-mode.ts:9`, "Note name, resolved like a wikilink"), so both editors publish a contract they do not keep.
- **F2: the shared resolver already exists, and it does exactly what is missing.** `resolveFsTarget` (`src/tools/_file-target.ts:66`) is the direct-fs locator used by `append_note` and `prepend`. In active mode it calls `resolveActiveLocatorWithVault`, which both editors already call. In specific mode it resolves the vault through the registry first, so an unknown vault fails before any spawn (refactor-decisions item 32: keep that order). It then takes `path` as given, or resolves `file` through `resolveFileByTsv` (`obsidian file file=<name>`, then the `path\t` line). Its return type, `ActiveLocatorWithVault` (`{vaultRoot, relPath, vaultDisplayName}`), is exactly the shape the two private `resolveLocator`s return.
- **F3: for `path` and active mode, swapping in `resolveFsTarget` changes nothing anyone can observe.** Active mode runs the same function. With `path`, `resolveVaultPath` runs first and the path is then used as given, the same steps as today, and no extra spawn is made.
- **F4: the two editors' deps fit `resolveFsTarget`.** Each `ExecuteDeps` is `{logger, queue, vaultRegistry, fs?, spawnFn?, env?}`, which satisfies `EvalDeps & {vaultRegistry}`, because `EvalDeps`' `CallScope` fields are optional. `resolveActiveLocatorWithVault` already takes the same deps.
- **F5: no existing test uses `file` in specific mode against either editor's handler.** The only `file:` occurrences are in the two `schema.test.ts` files, which never call a handler. The handler suites and the `patch_*` entries in `_typed-result-fixtures.ts` all use `path`. So the switch needs no edit to any existing test (refactor-decisions item 5).
- **F6: neither editor has a file-type check.** Spec 070 FR-013 left `patch_block` and `patch_heading` out (refactor-decisions item 32). A path-based call on a non-note file today simply fails to find the heading or block.
- **F7: an unmatched name already produces a uniform failure.** When `obsidian file` prints `Error: File "<name>" not found.` (exit 0), the dispatch layer's priority (c) turns it into `CLI_REPORTED_ERROR` with `details.message` set to that line and no `details.code`. `resolveFsTarget` passes it through unchanged, and `append_note` and `prepend` let it propagate. A stdout with no `path\t` line gives `CLI_REPORTED_ERROR` with `details.stage: "file-tsv-parse"`.
- **F8: the help pages contradict the published description.** `docs/tools/patch_heading.md:41` and `docs/tools/patch_block.md:42` both describe `file` as "Vault-relative file path". `patch_heading.md:201` says the output `path` "echoes the input's `file`/`path`". Neither error roster mentions a name that does not resolve.
- **F9 (out of scope, recorded): `PATCH_HEADING_DESCRIPTION` lists `NOTE_NOT_FOUND`, but the handler never throws it.** A missing path gives `FS_WRITE_FAILED` (`patch_heading/handler.ts:96–103`). Spec Out of Scope keeps path-based behaviour unchanged, and FR-009 keeps the description unchanged. This goes in the follow-ups list.

## Live-probe findings

| Probe | Command (`vault=TestVault-Obsidian-CLI-MCP` on each) | stdout (verbatim, exit 0, stderr empty) |
|---|---|---|
| P1 | `file "file=Probe089 Unique"` | `path	Sandbox/089-probe/a/deep/Probe089 Unique.md` + name/extension/size/created/modified lines |
| P2 | `file file=Probe089Missing` | `Error: File "Probe089Missing" not found.` |
| P3 | `read file=Probe089Missing` | `Error: File "Probe089Missing" not found.` |
| P4 | `file file=Probe089Dup` | `path	Sandbox/089-probe/a/Probe089Dup.md` … |
| P5 | `read file=Probe089Dup` | `# A` / blank line / `in a` (the content of `a/Probe089Dup.md`) |
| P6 | `file file=Sandbox/089-probe/b/Probe089Dup` | `path	Sandbox/089-probe/b/Probe089Dup.md` … |
| P7 | `file "file=Probe089 Unique.md"` | `path	Sandbox/089-probe/a/deep/Probe089 Unique.md` … |
| P8 | `file file=b/Probe089Dup` | `path	Sandbox/089-probe/b/Probe089Dup.md` … |

- **F10: a bare name finds a note two folders down** (P1), and so does a name ending in `.md` (P7). This is User Story 1 AS1 and AS4.
- **F11: an unmatched name fails the same way for `file` and `read`** (P2, P3). Both print the same line, so the reading tools and the resolver produce the same `CLI_REPORTED_ERROR` (F7). This is User Story 2 AS1 and AS2, and Clarification Q2.
- **F12: a name shared by two notes resolves, it does not fail, and `file` and `read` pick the same note** (P4, P5 both chose `a/`). A path-qualified name picks the other note (P6, P8). FR-004 therefore resolves to "the same note is chosen". The spec's Assumption already expected this: no ambiguous-name error is added.

## Decisions

### D1: replace both private `resolveLocator`s with `resolveFsTarget`

Both handlers call `resolveFsTarget(input, deps, "<tool>")` and their `resolveLocator` functions are deleted. This is FR-011. It also closes the item-32 note ("patch_block/patch_heading still have their own — migrate when touched").

- **Rationale**: the shared resolver already does exactly the missing step (F2), and changes nothing on the `path` and active routes (F3). A name then resolves through the same Obsidian call the reading tools rely on (F11, F12).
- **Alternatives considered**:
  - (a) Call `resolveFileByTsv` inside each `resolveLocator`. This keeps two private copies of a locator that already exists, against item 32.
  - (b) Forward `file` to a CLI command. The editors write directly to the filesystem and have no CLI action command to forward it to.
  - (c) Map the resolver's not-found error to `NOTE_NOT_FOUND`. Rejected by Clarification Q2 (Option B).

### D2: no file-type check is added

The editors keep having no file-type check (F6). The spec's edge case about a name that resolves to a canvas or base wrongly said "by the existing file-type rule". It was corrected at plan time to "unchanged from path-based targeting" (see Plan-time spec alignment).

- **Rationale**: FR-008 says checks run "as they do today". Adding `UNSUPPORTED_FILE_TYPE` would be a new published failure for both editors, outside BI-0171's scope.
- **Alternative considered**: add `assertSupportedFileType` with `["note"]`. That is a separate BI.

### D3: error contract

There are no new codes and no new mapping:

- An unmatched name gives the resolver's `CLI_REPORTED_ERROR` unchanged (F7, Clarification Q2).
- An unparseable resolver answer gives `CLI_REPORTED_ERROR` with `details.stage: "file-tsv-parse"`.
- An unknown vault gives the registry's error before any spawn.
- Everything after resolution is unchanged and runs on the resolved path: `PATH_ESCAPES_VAULT`, the read and write errors, and `HEADING_NOT_FOUND` / `BLOCK_NOT_FOUND`.

If the resolved note vanishes between the lookup and the read, `patch_heading` returns its existing `FS_WRITE_FAILED` ENOENT error and `patch_block` its existing `NOTE_NOT_FOUND`. The spec's Assumptions accept this.

### D4: tests

There is one new co-located suite per editor: `handler.note-name.test.ts`, rows N1–N9 in each (contract §T). Each suite has happy-path, boundary and failure rows (Principle II, FR-012). For the resolver's canned TSV answer, both suites reuse the existing shared `fileTsvResponse(relPath)` (`src/tools/_handler-test-fixtures.ts:241`, refactor-decisions item 9) and the per-tool `_handler-fixtures.ts` builders (`fakeFs`, `fakeRegistry`, `deps`, `EVAL_OK`). No fixture module changes. No existing test is edited (F5).

### D5: documentation and published surface

- **Published surface**: the published descriptions, schemas and fingerprint baseline do not change (FR-009). The description becomes true without being edited.
- **Help pages (FR-010)**: both pages get these edits:
  - the `file` row matches the `append_note` and `prepend` wording, and names the pre-flight `obsidian file` call;
  - the error roster gets a row for a name that does not resolve;
  - in `patch_heading.md`, the output `path` row says it is the resolved path.
- **CHANGELOG**: one `[Unreleased]` spec line and one `Fixed` entry.

### D6: live check

Quickstart §3 runs the built server against the test vault Sandbox. It edits a heading and a block in a note two folders down by bare name, reads the note back by name, and calls both editors with an unmatched name. The results are recorded in `post-implement.md`.

## Plan-time spec alignment

- **Edge case "A name that resolves to a file that is not a Markdown note"**: the spec said it is "treated the way the add-to-note capabilities treat it today, by the existing file-type rule". The editors have no such rule (F6), and FR-008 keeps checks "as they do today". The edge case now says the outcome is the same as path-based targeting of that file, because this feature adds no file-type check (D2).
- No other change. F10–F12 confirm every other statement in the spec, and F12 settles FR-004 as "the same note is chosen".

## Follow-ups (out of scope)

1. `PATCH_HEADING_DESCRIPTION` and its help page say `NOTE_NOT_FOUND`, but a missing path gives `FS_WRITE_FAILED` (F9). The fix needs a decision on `patch_heading`'s path-based not-found failure, which is a published-error change.
2. The editors' `file` schema uses `safePathField`, while `append_note` and `prepend` also reject `[[` and `]]` in `file`. Aligning them would change the published schema, which FR-009 rules out here.
3. Neither editor has a file-type check (F6, D2).
