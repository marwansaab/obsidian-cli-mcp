# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.3] - 2026-05-12

**PATCH release (contract-restorative + additive)** — two narrow handler-layer fixes to `write_note` against the 016-reliable-writer surface, both caught during acceptance testing of the 016 overhaul. (1) Short-form-name `file` target resolution restored to the predecessor 011's behaviour: when `input.file` is canonical (no `/` or `\` folder separator AND not ending in `.md`), the handler now resolves the target to `<input.file>.md` at the vault root and the response's `path` field reports the resolved value; any other `input.file` shape passes through verbatim per FR-001a. (2) `FILE_EXISTS` hot-path rejections gain `details.errno: "EEXIST"` alongside the existing `path` and `vault` fields — field-name parity with `FS_WRITE_FAILED`'s `details.errno`. Spec-id 020-fix-write-gaps, FR-001..FR-018, SC-001..SC-011.

### Fixed

- **Short-form-name `file` resolution restored.** Calls of the form `write_note({ target_mode: "specific", vault, file: "Daily Note", content })` now write `<vault-root>/Daily Note.md` and return `{ created: true, path: "Daily Note.md" }`. The 016-reliable-writer overhaul inadvertently dropped the `.md`-appending step the predecessor 011's CLI-routed handler performed, so canonical short-form inputs were writing extension-less files that Obsidian's file explorer hides and wikilinks can't resolve. Wired via two file-local helpers in `src/tools/write_note/handler.ts`: `isCanonicalShortForm(file)` (three literal-character checks — `!file.includes("/") && !file.includes("\\") && !file.endsWith(".md")`) and `resolveSpecificModePath(input)` (replaces the prior `relPath = (input.path ?? input.file)!` collapse). Internal periods are preserved by `endsWith(".md")` precision — `file: "version_1.2.3"` resolves to `version_1.2.3.md` (NOT to `version_1.2.md` as `path.extname` would). The `input.path` form is unchanged; FR-001a passthrough preserves `file: "Notes.md"` and `file: "Folder/Note"` shapes verbatim. The active-mode branch is untouched — the schema forbids `input.file` in active mode and the focused-file eval continues to resolve through `parsed.path`.
- **`FILE_EXISTS` rejection diagnostic precision.** The hot-path `wx`-flag write at `handler.ts:208-213` now throws with `details: { errno: "EEXIST", path: relPath, vault: input.vault ?? null }` (was `{ path, vault }`). The new `errno` field is additive — callers reading `response.details.path` and `response.details.vault` see no change. Field-name parity with `FS_WRITE_FAILED`'s `details.errno` means downstream callers can branch uniformly on `response.details?.errno` across both filesystem-level failure codes. The separate `mapFsError` path (rare mkdir/rename race) keeps its single-field `{ errno }` shape per research decision R4 — preserved asymmetry; reconciling would widen `mapFsError`'s signature, out of scope for this BI.

### Changed

- **`docs/tools/write_note.md`** gains two short callouts under existing sections. The input contract section gains a *Canonical short-form `file` resolution* paragraph defining the literal three-check predicate with worked examples (`file: "Daily Note"` → `Daily Note.md`; `file: "Notes.md"` and `file: "Folder/Note"` pass through verbatim; `file: "version_1.2.3"` → `version_1.2.3.md`). The error roster's FILE_EXISTS row now documents the full `details: { errno, path, vault }` shape with the additive-enrichment note and the field-name-parity note.

### Internal

- Eight new co-located handler test cases in `src/tools/write_note/handler.test.ts` covering all FR / AC scenarios — canonical short-form happy path, internal-period preservation, three FR-001a passthrough cases on `file` (ends-in-`.md`, contains-`/`, both), `path`-form regression guard, FILE_EXISTS hot-path additive details, `mapFsError` EEXIST asymmetry guard, overwrite-true on existing success guard. Test count grows 694 → 702; aggregate statements coverage rises 91.32% → 91.63%; `write_note/handler.ts` coverage rises 84.93% → 88.46%.
- **Frozen surfaces**: input contract (FR-012 — `src/tools/write_note/schema.ts` byte-stable, `file` and `path` continue to use the same `safePathField` validator), top-level error code roster (FR-011 — no new codes added to `src/errors.ts`), logger surface (R7 — no new typed logger methods; FILE_EXISTS does NOT emit per-call logger events per 016-FR-029, the new `errno` field doesn't change that), write mechanism (FR-017 — temp+rename atomic write, canonical-root path-safety, lazy vault-registry, post-write metadataCache invalidation, optional editor-open all preserved), other tools' surfaces (FR-014 — `obsidian_exec`, `help`, `read_note`, `read_heading`, `delete_note`, `read_property`, `find_by_property`, `write_property`, `list_files` are all byte-stable).
- **Compatibility**: this BI is additive on `details.errno` and contract-restorative on short-form resolution. Downstream callers that depended on the predecessor 011's `<file>.md` behaviour get their contract back; callers branching on `response.details` for FILE_EXISTS gain a new readable `errno` field without losing any existing field. No new error codes, no new ADRs, no ADR amendments.

### References

- Spec: [specs/020-fix-write-gaps/spec.md](specs/020-fix-write-gaps/spec.md)
- Plan: [specs/020-fix-write-gaps/plan.md](specs/020-fix-write-gaps/plan.md)
- Research: [specs/020-fix-write-gaps/research.md](specs/020-fix-write-gaps/research.md)
- Data model: [specs/020-fix-write-gaps/data-model.md](specs/020-fix-write-gaps/data-model.md)

## [0.4.2] - 2026-05-12

**PATCH release (additive surface)** — adds `list_files`, the eighth typed-tool wrap and the project's first FOLDER-scoped typed surface. Where the prior seven typed tools (`read_note` / `write_note` / `delete_note` / `read_property` / `find_by_property` / `read_heading` / `write_property`) all operate on a single named file or the focused file, `list_files` operates on a vault folder and returns the structured `{ count, paths }` shape. Public surface: `list_files({ target_mode, vault?, folder?, ext?, total? })` → `{ count: number, paths: string[] }`. Agents that want folder enumeration no longer pay the cost of `obsidian_exec` returning plain text plus client-side line parsing. Spec-id 019-list-files, FR-001..FR-028, SC-001..SC-022.

### Added

- **`list_files` typed MCP tool** at `src/tools/list_files/` — schema + handler + index + co-located tests (51 cases: 18 schema / 28 handler / 5 registration). Single-spawn architecture (R13): ONE `invokeCli` call per request regardless of mode or input parameters. Wraps the CLI's native `files` subcommand (NOT eval). User inputs (`folder`, `ext`) flow through discrete argv parameters — no eval source-text concatenation; the spec's "no eval injection vector" assertion holds structurally.
- **Wrapper-side filter pipeline** (per Plan-amendment-2 + R6 / R9): three filters apply post-CLI-fetch in this order — (1) sub-folder filter per FR-026 (defence-in-depth — F19 confirms the live CLI never emits sub-folder entries from `files`); (2) dotfile filter per FR-028 (defence-in-depth — F18 confirms the CLI already filters dotfiles natively; direct consequence: `folder: ".obsidian"` returns `{ count: 0, paths: [] }`); (3) non-recursive filter per R6 (**load-bearing** — F2 confirms the CLI returns the recursive subtree by default; the wrapper enforces FR-012's non-recursive contract post-fetch by filtering paths whose component count exceeds folder's component count + 1).
- **UTF-8 byte-compare lexical sort** (R8 / FR-027) via `Buffer.compare`. Byte-for-byte reproducible across platforms. Differs from JavaScript's default UTF-16 code-unit compare only for non-BMP characters.
- **`total: true` count-only mode** (R7): the wrapper does NOT delegate to the CLI's native `total` flag (which is recursive — incompatible with FR-007's identical-count-across-modes requirement). Both modes apply the same CLI fetch + filter pipeline; on `total: true` the response's `paths` is set to `[]` after counting. Token saving is realised at the wrapper→MCP-client boundary.
- **Folder-scoped target-mode refinement** at `src/target-mode/target-mode.ts` — a new helper `applyTargetModeRefinementForFolderScoped` (parallel to the existing `applyTargetModeRefinement`) that forbids the file-scoped locator fields (`file` and `path`) in BOTH modes while preserving the in-specific-requires-vault / in-active-forbids-vault rules. The ONE incremental change to the target-mode primitive in this feature.
- **`docs/tools/list_files.md`** — full progressive-disclosure documentation: per-field input contract, output shape for both branches of `total`, the lexical UTF-8 byte-compare ordering convention, the non-recursive contract (with the wrapper-side filter explanation), the dotfile filter (FR-028 with the `folder: ".obsidian"` consequence worked out), the failure-mode roster, six worked examples, Known Limitations section covering Plan-amendment-1, platform-dependent case-sensitivity, and the active-mode TOCTOU caveat.
- **`docs/tools/index.md`** entry for `list_files`.

### Changed

- **`package.json` description** updated to mention `list_files` alongside the existing typed tools.
- **`README.md`** tool list grew from nine to ten entries.
- **`src/server.ts`** registration list grew by two lines — one import, one tools-array entry, alphabetical between `createHelpTool` and `createObsidianExecTool`. The post-010 consolidated drift detector at `src/tools/_register.test.ts` gained one invariant entry for the new tool's published JSON Schema shape.

### Internal

- Module surface: ~205 LOC across `schema.ts` / `handler.ts` / `index.ts`. Plus ~50 LOC across `applyTargetModeRefinementForFolderScoped` + its co-located tests in `src/target-mode/`. Inherits the 011-R5 unknown-vault response-inspection clause from the cli-adapter unchanged.
- **Known limitations** (documented in `docs/tools/list_files.md`): per Plan-amendment-1, `total: true` is NOT a cap-evasion path — both modes share the same CLI fetch and so face the same 10 MiB output-cap threshold. Mitigation: callers needing recursive counts on pathological folders fall back to `obsidian_exec` with `files folder=X total` (CLI's native `total` flag is cap-friendly but produces a recursive count). Platform-dependent case-sensitivity on `folder` is preserved verbatim — the wrapper does NOT normalise case. Active-mode multi-vault setups cannot specify which vault to enumerate via active mode; prefer specific mode with explicit `vault`.
- **Zero new error codes** added to `src/errors.ts`. All failures flow through `VALIDATION_ERROR` (zod boundary) + `UpstreamError` codes from the cli-adapter (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `CLI_OUTPUT_TOO_LARGE`) + `ERR_NO_ACTIVE_FILE` (active mode with no focused vault, when classifier matches).
- **No edits to** existing per-tool modules — `obsidian_exec`, `help`, `read_note`, `read_heading`, `write_note`, `delete_note`, `read_property`, `find_by_property`, `write_property` are all byte-stable per SC-013 / FR-024.

### References

- Spec: [specs/019-list-files/spec.md](specs/019-list-files/spec.md)
- Plan: [specs/019-list-files/plan.md](specs/019-list-files/plan.md)
- Research (incl. Plan-amendments 1 + 2): [specs/019-list-files/research.md](specs/019-list-files/research.md)

## [0.4.1] - 2026-05-12

**PATCH release (additive surface)** — adds `write_property`, the seventh typed-tool wrap and the symmetric write companion to `read_property`. Surgical single-frontmatter-property writes — agents that want to flip one field no longer pay the cost of a full-file `read_note` plus `write_note` round-trip. Public surface: `write_property({ target_mode, vault?, file? | path?, name, value, type? })` → `{ written: true, path, name }`. Target-mode parity with the other typed tools. Six YAML types supported (text / list / number / checkbox / date / datetime); type inferred from `value`'s JavaScript shape when omitted; date and datetime require explicit type. Cross-type overwrite is native: writing a string to a number-typed property flips both the value and the on-disk type representation (per FR-033 + SC-021). Spec-id 018-write-property, FR-001..FR-033, SC-001..SC-021.

### Added

- **`write_property` typed tool** at `src/tools/write_property/` — schema + handler + index + co-located tests (57 cases: 17 schema / 35 handler / 5 registration). Per-mode call architecture: specific+path is one CLI invocation; specific+file pre-resolves the wikilink to a canonical path via the CLI's `file` subcommand (TSV parse) before the write; active mode pre-resolves the focused file's path and vault via a FIXED eval template before the write. Both two-call branches eliminate any TOCTOU window between path resolution and the write itself.
- **`docs/tools/write_property.md`** — full progressive-disclosure documentation: per-field input contract, type-inference table, six worked examples (one per YAML type plus active-mode and empty-list variants), error-code roster, Known Limitations section.
- **`docs/tools/index.md`** entry for `write_property`.

### Changed

- **`package.json` description** updated to mention `write_property` alongside the existing typed tools.
- **`src/server.ts`** registration list grew by two lines — one import, one tools-array entry, alphabetical between `createWriteNoteTool` and (no later entry). The post-010 consolidated drift detector at `src/tools/_register.test.ts` gained one invariant entry for the new tool's published JSON Schema shape.

### Internal

- Module surface: ~205 LOC across `schema.ts` / `handler.ts` / `index.ts`. Inherits the 011-R5 unknown-vault response-inspection clause from the cli-adapter unchanged. Cross-type overwrite, type-vs-value contradiction handling, and path-traversal confinement are all native CLI behaviours; the wrapper performs no pre-validation beyond zod-boundary input checking.
- **Known limitations** (documented in `docs/tools/write_property.md`): CRLF line-ending preservation is partial — all-LF files round-trip cleanly, but CRLF files end up with mixed line endings post-write because the CLI emits LF for the modified frontmatter region (per research.md R8). YAML flow-style sequences (`tags: [a, b]`) are re-emitted as block-style on every write (per research.md R7). List elements containing literal `,` characters are split by the CLI's parser; callers needing comma-containing elements fall back to `obsidian_exec`.
- **Zero new error codes** added to `src/errors.ts`. All failures flow through `VALIDATION_ERROR` (zod boundary) + `UpstreamError` codes from the cli-adapter (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`) + `ERR_NO_ACTIVE_FILE` (active-mode no focused file).
- **No edits to** existing per-tool modules — `obsidian_exec`, `help`, `read_note`, `read_heading`, `write_note`, `delete_note`, `read_property`, `find_by_property` are all byte-stable per SC-013 / FR-031.

### Notes on semver category

The surface IS additive (a new public MCP tool), which under strict semver would typically code as MINOR. Cut as PATCH (0.4.0 → 0.4.1) per maintainer decision — the bump reflects "another typed tool wrap on top of the established foundation" rather than a substantial new release vector. Future bumps that change existing tool surfaces, error codes, or schemas will use MINOR or MAJOR as the semver semantics demand.

## [0.4.0] - 2026-05-10

**MINOR release** — lifts the bridge's Windows-only restriction by extracting binary resolution into a new `src/binary-resolver/` module that performs an ordered three-tier resolution: (1) `OBSIDIAN_BIN` override, (2) platform-default install path, (3) fall-through to OS-spawn `PATH` lookup. Public-surface identity bumps from "Windows-host MCP server" to a tri-platform server (macOS, Linux, Windows). All eight currently-shipping tools and every future typed tool inherit cross-platform support without per-tool plumbing because the resolver lives below `dispatchCli`. Spec-id 017-cross-platform-support, FR-001..FR-020, SC-001..SC-010.

### Added

- **macOS support** — auto-detects `/usr/local/bin/obsidian` (the official installer's symlink) when `OBSIDIAN_BIN` is unset; falls through to `PATH` if the platform-default isn't present.
- **Linux support** — auto-detects `~/.local/bin/obsidian` (the user-local install location) when `OBSIDIAN_BIN` is unset; falls through to `PATH` if the platform-default isn't present. Some distributions don't include `~/.local/bin` on the default `PATH` — the bridge's platform-default branch sidesteps that gotcha. WSL guests with Obsidian installed inside the WSL guest behave as native Linux (FR-016).
- **`src/binary-resolver/`** — new internal module owning the three-tier resolution algorithm. Exports `resolveBinary(deps): Promise<{path, attempts}>` and the supporting `BinaryResolverDeps` / `BinaryResolverResult` / `ResolutionAttempt` types. Stateless — no caching (FR-009). Test seams accept injected `env` / `platform` / `homedir` / `access` so platform-specific behaviour can be unit-tested on any host.
- **README Installation subsections** for macOS and Linux (FR-012). The existing Windows subsection content is preserved unchanged.

### Changed

- **`CLI_BINARY_NOT_FOUND` UpstreamError `details` shape** (FR-004): the legacy `binaryAttempted` field is replaced with a richer `attempts: ResolutionAttempt[]` array recording each branch the resolver consulted (source / path / per-path outcome — `"resolved"` / `"not-found"` / `"found-but-not-executable"` / `"pending"`), plus a new `platform` field carrying the host platform name. The `PATH` field is preserved verbatim. Strictly richer diagnostic info; no new error code added (FR-010 + Constitution IV).
- **`OBSIDIAN_BIN` failure semantics** (FR-008 / FR-020): when `OBSIDIAN_BIN` is set but the path doesn't exist or isn't executable, the bridge now fails loudly with `CLI_BINARY_NOT_FOUND` instead of silently falling through to `PATH`. The structured error labels the override path as `outcome: "not-found"` (ENOENT) or `outcome: "found-but-not-executable"` (EACCES / EPERM / other errno). Pre-this-release callers who set `OBSIDIAN_BIN` to a typo and relied on the `PATH` fall-through will now see the typo surface immediately.
- **`package.json` `description`** bumped from "Windows-host MCP server..." to "Cross-platform MCP server bridging MCP clients to the Obsidian Integrated CLI binary on macOS, Linux, and Windows hosts...". README opening paragraph and Prerequisites updated to tri-platform framing.

### Internal

- New `src/binary-resolver/binary-resolver.ts` (~75 LOC) and co-located `binary-resolver.test.ts` (~30 cases covering all three tiers, error envelope shape, and platform-injection invariants).
- `src/cli-adapter/_dispatch.ts` integration: `dispatchCli` now `await`s `resolveBinary` before spawn. A private `settlePathAttempt` helper rewrites the trailing `pending` PATH attempt to `"resolved"` or `"not-found"` once the spawn outcome is known. Both ENOENT throw sites (spawn-throw catch and `child.error` ENOENT) emit the new `details` shape.
- `src/cli-adapter/_dispatch.test.ts` — 2 cases re-targeted to the new shape; 2 new cases added (resolver-throw propagation, happy-path resolved-binary spawn).
- `src/tools/obsidian_exec/handler.test.ts` — 1 integration assertion re-targeted to the new shape; the OBSIDIAN_BIN-override happy-path test swapped to `process.execPath` (definitionally executable on the host) so the new FR-008 / FR-020 executability check sees a real binary.
- Zero new error codes added; zero new ADRs; zero new MCP tools; no schema changes.

## [0.3.0] - 2026-05-10

**MINOR release** — wholesale-replaces the legacy `write_note` typed tool with a **direct-filesystem-write** implementation per [ADR-009](.decisions/ADR-009%20-%20Direct%20Filesystem%20Write%20Path%20Alongside%20CLI%20Bridge.md). User content no longer crosses the CLI argv pipe at any size, sidestepping the upstream argv→IPC chunk-boundary defect that crashed Obsidian's main process for content above ~4 KB on Windows. Two deliberate breaking changes on the `write_note` surface (the `template` parameter is no longer accepted; collision behaviour is now structured `FILE_EXISTS` instead of silent auto-rename) make MINOR the honest semver signal — existing callers using the legacy input shape will see `VALIDATION_ERROR` or `FILE_EXISTS` instead of silent success on the changed paths. Three new error codes added to the project roster.

### Changed

- **`write_note` redesigned** — replaces the legacy CLI-routed handler with a direct-fs-write implementation. The tool name, the `target_mode` discriminator (per ADR-003), and the output envelope shape `{ created: boolean, path: string }` are byte-stable with the predecessor. Per-write flow: `vaultRegistry.resolveVaultPath(input.vault)` (or focused-file eval in active mode) → `checkCanonicalPath(vaultRoot, relPath)` (two-layer path safety) → `fs.mkdir(parent, { recursive: true })` → atomic `temp+rename` for `overwrite=true` or `fs.writeFile(..., { flag: "wx" })` for `overwrite=false` → best-effort `metadataCache` invalidation eval → optional best-effort `openLinkText` eval (specific mode + `open: true`) → `{ created, path }` envelope. All eval argv elements stay under 250 bytes — orders of magnitude below the upstream IPC ceiling.
- **Multi-vault routing fixed for `write_note`** — `vault=Foo` now writes to Foo's absolute filesystem path regardless of which vault Obsidian currently has focused. The R11 limitation inherited by 011 / 013 / 014 / 015 (the CLI's `vault=` parameter being functionally ignored by `eval`) is **resolved** for this tool because the bridge owns path resolution end-to-end via the new vault registry. The legacy tool's effective single-vault routing is no longer the surface contract.

### Added

- **`src/vault-registry/`** — internal module: lazy `vaultName → absolutePath` map populated on first call via `obsidian vaults verbose` (FR-012); cached for the MCP-server-process lifetime once the first probe succeeds; retried-on-failure (cache only set on success); `inFlightProbe` deduplicates concurrent first-call races. Future `list_vaults` MCP tool can consume this module unchanged.
- **`src/path-safety/`** — internal module: two-layer vault-root sandboxing. Layer 1 (`schema.ts`) is a structural validator gated into the `file` / `path` zod schema fields — rejects empty strings, leading `/` or `\`, drive-letter prefix `[A-Za-z]:`, any `..` segment, and control characters `[\x00-\x1f\x7f]`. Layer 2 (`canonical.ts`) is a runtime `fs.realpath`-based symlink-escape check that runs pre-mkdir per FR-014. Reusable by future fs-touching tools.
- **Three new error codes** added to the project roster (FR-020):
  - `FILE_EXISTS` — specific mode + `overwrite: false` against an already-occupied path. Atomic via the `wx` flag — no TOCTOU race window.
  - `PATH_ESCAPES_VAULT` — runtime canonical check rejected an input that's structurally safe but resolves outside vault root via a symlink. Emits a typed `pathEscapeAttempt` logger event for operator audit.
  - `FS_WRITE_FAILED` — generic fs failure (ENOSPC / EACCES / EPERM / EROFS / EIO / ...). `details.errno` carries the underlying OS errno; `details.syscall` and `details.path` for diagnostic.
- **Typed `Logger.pathEscapeAttempt(event)` method** + `PathEscapeAttemptEvent` interface — security event emission per FR-029; consumed only by the runtime canonical-path rejection path (the two best-effort failure paths — cache invalidation eval and editor-open eval — are silent per Constitution IV's authorised carve-out).
- 30 co-located handler tests + 22 schema tests + 5 registration tests for `write_note` (~57 cases total replacing the predecessor's smaller set); 11 vault-registry tests; 13 path-safety/schema tests; 8 path-safety/canonical tests; 2 new logger tests.

### Removed

- **`template` parameter on `write_note`** — strict-mode rejects with `unrecognized_keys`. Migration: use `obsidian_exec` with the `create` subcommand and `template=<name>` argv element (template names are short enough to dodge the upstream defect). The migration is documented in `docs/tools/write_note.md` with a worked example.
- **Silent auto-rename on collision** — the legacy tool would auto-rename `Existing.md` → `Existing 1.md` and return `created: true` with the renamed path when `overwrite: false` collided. The new tool returns a structured `FILE_EXISTS` error instead. Callers who want create-or-replace semantics MUST pass `overwrite: true`.

### Documentation

- `docs/tools/write_note.md` — rewritten to cover all six FR-022 dimensions (purpose, when-to-use vs not, full input contract with template + open callouts, full output and error contract with each stable code's recovery hint, upstream rationale citing the forum bug + ADR-009, worked examples for specific + active modes plus the `template` migration).
- `package.json` description updated to mention the direct-fs-write redesign.

### Upstream rationale

The upstream defect filed at <https://forum.obsidian.md/t/cli-windows-json-parse-failure-crashes-obsidians-main-process-when-any-single-argv-element-exceeds-4-kb/114119> is the load-bearing motivation for ADR-009 and this release. An eval-bypass workaround was prototyped during the spec phase and empirically refuted on 2026-05-10 — both `obsidian create` and `obsidian eval` crash equally above the same per-argv-element threshold. The direct-fs-write design is the durable fix; it remains correct regardless of whether the upstream defect is ever resolved.

## [0.2.8] - 2026-05-09

Patch release — adds the sixth typed-tool surface, `read_heading`, the **first heading-targeted retrieval primitive**. Where `read_note` returns whole files (5–50k tokens for long documents) and `read_property` returns a single frontmatter field, `read_heading` returns just the body of a single named section (typically 100–500 tokens). Pure addition — no existing tool changes, no new error codes, no ADR amendments. `obsidian_exec` remains the freeform escape hatch.

### Added

- **`read_heading` typed MCP tool**, wrapping the Obsidian CLI's developer-section `eval` subcommand with a frozen JS template that walks `app.metadataCache.metadataCache[hash].headings` (Obsidian's pre-parsed heading array) to find a named heading and slice its body via `app.vault.adapter.read(path)`. Returns `{ content: string }` — the body bytes between the matched heading's `position.end.offset` and the next heading marker of any depth (or EOF). Replaces the agent's "full-file `read_note` + client-side Markdown parse" sequence (5–50k tokens for long documents) with a single typed call returning just the named section's body bytes (typically 100–500 tokens).
- **STANDARD `target_mode` discriminator** (parity with `read_note` / `write_note` / `delete_note` / `read_property`); this is the FIRST eval-composition typed tool to use it (014's `find_by_property` is vault-wide and has no discriminator).
- **Structural-only heading-path validator** (FR-006 / FR-007): the `heading` field is split on `::` and must yield ≥2 non-empty segments. Single-segment H1-only reads, headings whose text contains `::` literally, and Setext-style headings are out-of-reach (documented fallback: full-file `read_note` plus client-side parse).
- **Anti-injection via base64-encoded JSON payload** (R6 / parity with 014): user-supplied `path`, `file`, `heading` flow through `JSON.stringify` → `Buffer.from(...).toString("base64")` → frozen JS template's `atob` + `JSON.parse` chain at request time. The JS template itself is a frozen string constant; no user input ever reaches the JS source as text. The base64 alphabet `[A-Za-z0-9+/=]` is structurally safe inside any JS string literal.
- **Boundary rule**: **first-subsequent-heading-marker-of-any-depth** per the [Q1 clarification](specs/015-read-heading/spec.md#clarifications) — child subtrees are naturally excluded.
- **ATX-only**: Setext underlines are content, not boundaries — per the [Q2 clarification](specs/015-read-heading/spec.md#clarifications). The JS template applies a defence-in-depth filter (`text.charAt(start.offset) === '#'`) to enforce ATX-only even on Obsidian versions that include Setext entries in the headings array.
- **Segment matching**: case-sensitive minimal-normalisation byte compare per the [Q3 clarification](specs/015-read-heading/spec.md#clarifications). Closing-ATX (`## Heading ##`) and surrounding whitespace are stripped by Obsidian's pre-parser; inline markdown (`**bold**`, `[link](url)`) and Obsidian anchor markers (`^anchor-id`) survive in the heading text and MUST be supplied verbatim by the caller.
- **Single-call architecture**: each MCP request fires ONE `invokeCli` invocation. ~200 ms per call. The JS template resolves the file path (active mode `app.workspace.getActiveFile()`, specific+path direct, specific+file via `app.metadataCache.getFirstLinkpathDest`), walks the headings array, finds the first segment-path match, and slices the body via `app.vault.adapter.read`. All matching logic runs inside the Obsidian process.
- **Structured eval-response error envelope** (R13): discriminated union `{ok: true, content}` | `{ok: false, code: "FILE_NOT_FOUND" | "HEADING_NOT_FOUND" | "NO_ACTIVE_FILE", detail}` strict mode. Handler's two-stage parse (`JSON.parse` + envelope `safeParse`) maps both wire-format failures and envelope `ok: false` onto existing `UpstreamError` codes per FR-022. Heading-not-found, file-not-found, and active-mode-no-focus all surface as structured errors; **zero new error codes**.
- **Inherited vault-routing limitation**: the CLI's `vault=` parameter is functionally ignored by `eval`; multi-vault users open the target vault before invoking — same limitation as 014 / 013 / 011. Documented in [docs/tools/read_heading.md](docs/tools/read_heading.md).
- Per-mode validation enforced at the schema layer:
  - Specific mode requires `vault` and exactly one of `file` / `path` AND `heading`.
  - Active mode forbids `vault` / `file` / `path`; `heading` is required in both modes.
  - Unknown top-level keys are rejected (`additionalProperties: false`, post-010 strict-mode).
- Documentation at [docs/tools/read_heading.md](docs/tools/read_heading.md) — input/output schema, error roster (5 codes), 5 worked examples (specific path 2-segment / specific file 3-segment / active / validation rejection / heading-not-found), behavioural notes (single-call architecture, eval-as-CLI-entry-point stability concern, anti-injection guarantee, multi-vault default ambiguity, boundary rule, ATX-only, segment matching, duplicate first-match, CRLF/LF preservation, body byte-level preservation, 10 MiB ceiling).
- 55 co-located tests in `src/tools/read_heading/{schema,handler,index}.test.ts` (20 schema + 30 handler + 5 registration); the post-010 consolidated drift detector at [src/tools/_register.test.ts](src/tools/_register.test.ts) auto-covers `read_heading` via its `it.each` registry walk (one-line invariant entry added).

### Documentation

- `docs/tools/index.md` — `read_heading` entry added with the heading-body framing.
- `package.json` description updated to mention `read_heading` alongside the existing typed tools.

### Known limitations

- **Multi-vault default ambiguity** (R11): the CLI's `vault=` parameter is functionally ignored by `eval`; the eval runs against whichever vault Obsidian's running instance currently has focused. Multi-vault users must open the target vault before invoking. Same limitation as 014 / 013 / 011. Documented in `docs/tools/read_heading.md`.
- **`eval`-as-CLI-entry-point stability concern** (R2): there is no native heading-body subcommand in the Obsidian CLI; the wrapper reaches into Obsidian's internal `app.metadataCache.metadataCache[hash].headings`, `app.vault.adapter.read`, `app.workspace.getActiveFile`, and `app.metadataCache.getFirstLinkpathDest` APIs. Future Obsidian updates may surface as test failures rather than silent drift; the wrapper's two-stage envelope-parse step is the structural backstop.
- **Out-of-reach heading shapes**: single-segment H1-only reads (`heading: "Foo"` with no `::`), headings whose text contains `::` literally, and Setext-style headings are not addressable through `read_heading`. Documented fallback: full-file `read_note` plus client-side Markdown parse.
- **Practical 10 MiB body ceiling** (R10): heading bodies exceeding ~10 MiB after JSON encoding (~7 MiB raw content) trigger the cli-adapter's output cap, surfacing as `CLI_NON_ZERO_EXIT` (output-cap kill), never silent truncation.

### References

- Spec: [specs/015-read-heading/spec.md](specs/015-read-heading/spec.md)
- Plan: [specs/015-read-heading/plan.md](specs/015-read-heading/plan.md)
- Research: [specs/015-read-heading/research.md](specs/015-read-heading/research.md)

## [0.2.7] - 2026-05-09

Patch release — adds the fifth typed-tool surface, `find_by_property`, and the **first retrieval primitive that goes value → file** rather than file → value. Where `read_property` answers "what is the value of this property in this file?", `find_by_property` answers "which files have this value for this property?". Replaces the agent's "guess the path from convention" sequence (1–5 calls per identifier resolution) with a single typed call. Pure addition — no existing tool changes, no new error codes, no ADR amendments. `obsidian_exec` remains the freeform escape hatch.

### Added

- **`find_by_property` typed MCP tool**, wrapping the Obsidian CLI's developer-section `eval` subcommand with a frozen JS template that walks `app.metadataCache.fileCache` + `app.metadataCache.metadataCache`. Inputs: `{ vault?, property, value, folder?, arrayMatch?, caseSensitive? }`. Returns `{ count, paths }` — vault-relative paths of every match (string array) plus the integer count (with `count === paths.length` defensively asserted). Single CLI invocation per request (~200 ms latency, live-probed); all matching logic runs inside the Obsidian process via the JS template.
- **First typed tool that does NOT use the `target_mode` discriminator** — `find_by_property` is inherently vault-wide; there is no "active file" or "single named file" concept. The schema is a fresh flat `z.object({...}).strict().superRefine(...)` rather than the post-010 flat-extension idiom used by the four prior typed tools. Internal mapping at the cli-adapter call boundary: `vault === undefined ⇒ target_mode: "active"` (no `vault=` in argv); `vault !== undefined ⇒ target_mode: "specific"`. The cli-adapter is unchanged.
- **Six-axis matching surface**: scalar / array (contains or order-sensitive exact-equal); case-sensitive or case-insensitive; folder-scoped or whole-vault; type-faithful (number `7` distinct from string `"7"`, boolean `true` distinct from string `"true"`); null-vs-absent disambiguation (an explicit YAML `null` matches a query for `null`; a missing property never matches).
- **Anti-injection via base64-encoded JSON payload**: user inputs (`property`, `value`, `folder`) flow through `JSON.stringify` → `Buffer.from(...).toString("base64")` → the frozen JS template's `atob('<base64>')` + `JSON.parse` chain at request time. The JS template itself is a frozen string constant; the only insertion is a base64 payload whose alphabet (`[A-Za-z0-9+/=]`) is structurally safe inside any JS string literal. No user input ever reaches the JS source as text — verifies the spec's structural anti-injection contract (FR-020 / SC-017).
- **Order-sensitive array exact-equality** (Q1): `arrayMatch: false` with an array `value` performs **positional** comparison via `every((e, i) => eq(e, y[i]))`. `[α, β]` does NOT equal `[β, α]`. Set-membership semantics use the default `arrayMatch: true` plus a scalar `value`.
- **Folder path-traversal closure** (Q2 / FR-021): the schema rejects any `folder` value containing a `..` path segment OR starting with `/` `\` via the regex `/(?:^[/\\])|(?:^|[/\\])\.\.(?:[/\\]|$)/`. Defence-in-depth — the JS template's `path.startsWith(prefix)` check operates against in-memory cache keys (vault-relative paths only), so even if a traversal escape slipped past the schema, the cache contains no path outside the vault root.
- Per-field validation enforced at the schema layer:
  - `property` is required and length ≥ 1; passed through verbatim.
  - `value` accepts `string | number | boolean | null | array<scalar>`; the array branch is allowed only when `arrayMatch: false` (cross-field `superRefine`).
  - `folder` is optional; the path-traversal regex rejects malformed values.
  - `arrayMatch` and `caseSensitive` default to `true` (post-default the inferred type is `boolean`, not `boolean | undefined`).
  - Unknown top-level keys are rejected (`additionalProperties: false`).
- Documentation at [docs/tools/find_by_property.md](docs/tools/find_by_property.md) — input/output schema, error roster (4 codes), 7 worked examples (scalar / folder / array contains / case-insensitive / array exact-equal / type-faithful numeric / vault-omitted), behavioural notes (single-call architecture, eval-as-CLI-entry-point stability concern, anti-injection guarantee, multi-vault default ambiguity, order-sensitivity, hierarchical-tag-rollup non-performance, list-of-mappings non-match, date-as-string semantics, Unicode NFC/NFD non-normalisation, in-session output stability).
- 47 co-located tests in `src/tools/find_by_property/{schema,handler,index}.test.ts` (18 schema + 24 handler + 5 registration; bumped 45 → 47 by /speckit-analyze C2 remediation closing FR-023 / FR-024 wrapper-non-transformation coverage gaps), plus 1 new cli-adapter test for the R5 / T002 inheritance lock (`eval` subcommand inherits unknown-vault re-classification).

### Documentation

- `docs/tools/index.md` — `find_by_property` entry added with the value→file framing.
- `package.json` description updated to mention `find_by_property` alongside the existing typed tools.

### Known limitations

- **Multi-vault default ambiguity** (Q3 / R11): when `vault` is omitted in a multi-vault setup the underlying CLI's focused-vault default may resolve ambiguously (no Obsidian instance running, no vault foregrounded, or two vaults equally foregrounded). Multi-vault users requiring deterministic vault scoping must supply `vault` explicitly. Parity with [013-read-property's R4 multi-vault limitation](specs/013-read-property/research.md). Documented in `docs/tools/find_by_property.md`.
- **`eval`-as-CLI-entry-point stability concern** (R2): there is no native find-by-property subcommand in the Obsidian CLI; the wrapper reaches into Obsidian's internal `app.metadataCache` API. Future Obsidian updates may surface as test failures rather than silent drift; the wrapper's two-stage response parse (`JSON.parse` + output-schema validation) is the structural backstop. Documented in `docs/tools/find_by_property.md`.
- **Date / datetime comparison** (T0.1): Obsidian stores YAML date and datetime values in the metadata cache as plain JS strings (NOT `Date` objects). Queries must use the YAML serialisation form (`2026-12-31`, `2026-05-08T14:30:00`); slashed or otherwise reformatted equivalents do NOT match — they are different strings. Documented in `docs/tools/find_by_property.md`.
- **Unicode normalisation** (T0.2): the wrapper does NOT perform Unicode normalisation. A query for `café` (NFC, U+00E9) does not match an otherwise-identical NFD-encoded fixture (`e` + U+0301). Callers needing normalisation-insensitive comparison should normalise client-side or supply both forms.
- **Hierarchical-tag rollup is NOT performed** (FR-023): a query for `value: "work"` against a `tags` field does NOT match `tags: [work/tasks]`. Tags are matched as opaque values via `===`.
- **List-of-mappings non-match** (FR-024): a list-valued property whose elements are themselves YAML mappings surfaces as `count: 0` when queried with a scalar value, never as an error.
- **Output cap** (FR-019): pathologically large match sets may exceed the cli-adapter's 10 MiB stdout cap; the cap fires as `CLI_NON_ZERO_EXIT`, never silent truncation.

### References

- Spec: [specs/014-find-by-property/spec.md](specs/014-find-by-property/spec.md)
- Plan: [specs/014-find-by-property/plan.md](specs/014-find-by-property/plan.md)
- Research (incl. T0 Live-CLI Capture 2026-05-09): [specs/014-find-by-property/research.md](specs/014-find-by-property/research.md)

## [0.2.6] - 2026-05-09

Patch release — adds the fourth typed-tool surface, `read_property`. Symmetric counterpart of the prior typed tools: where `read_note` retired `obsidian_exec` for full-file reads, `write_note` retired it for create/overwrite, and `delete_note` retired it for destructive single-file removal, `read_property` retires it for **surgical frontmatter-property reads**. Agents wanting a single named property no longer pay the token cost of a full-file fetch plus client-side YAML parsing. Pure addition — no existing tool changes, no new error codes, no ADR amendments. `obsidian_exec` remains the freeform escape hatch for unwrapped subcommands.

### Added

- **`read_property` typed MCP tool**, wrapping the Obsidian CLI's `properties` (plural) subcommand with `format=json`. Discriminated by `target_mode: "specific" | "active"`; required `name` field in both modes. Returns `{ value, type }` with native YAML types preserved: `value` is one of string / number / boolean / array / object / null (the polymorphic union covers all six runtime shapes from JSON-decoded frontmatter values), and `type` is one of seven labels — `"text" | "list" | "number" | "checkbox" | "date" | "datetime" | "unknown"`.
- **Two-call architecture under the hood**: each request fires Call A (file-scoped — `properties path=<p> format=json` or `properties format=json active`) for the value AND Call B (vault-scoped — `properties format=json`) for Obsidian's resolved type label. The wrapper merges the responses. Latency cost ≈ 2× a single-call typed tool; both invocations serialise through the project's single-in-flight queue.
- **Subcommand selection rationale**: `properties` (plural) with `format=json` was chosen over `property:read` because the latter is structurally lossy — it renders mappings as `[object Object]`, conflates literal-`"null"` with YAML-null at the wire, and emits plain text without type info. The `properties format=json` channel preserves native types via JSON encoding and distinguishes null-vs-`"null"` structurally. Live-verified during plan stage.
- **No-error semantics for absent properties and frontmatter-less notes**: a missing property name returns `{ "value": null, "type": "unknown" }`. Files with no frontmatter block at all (or malformed frontmatter — Obsidian conflates the two) likewise return `{ "value": null, "type": "unknown" }`. Agents distinguishing absent vs explicit-null can read the `type` field — explicit-null retains a typed label; absent always reports `"unknown"`.
- **Type label translation table** — Obsidian's internal labels (`multitext`, `aliases`, `tags`) map to the spec's `"list"`; `text` / `number` / `checkbox` / `date` / `datetime` / `unknown` pass through directly; unrecognised future labels fall back to `"unknown"` for forward-compatibility.
- Per-mode validation enforced at the schema layer:
  - Specific mode requires `vault` and exactly one of `file` / `path` AND `name`.
  - Active mode forbids `vault` / `file` / `path`; `name` is required in both modes.
  - Unknown top-level keys are rejected (`additionalProperties: false`, post-010 strict-mode).
- Documentation at [docs/tools/read_property.md](docs/tools/read_property.md) — input/output schema, error roster (5 codes), 7 worked examples (specific path / file / date / number / active / absent / mapping), behavioural notes (two-call architecture, active-mode multi-vault limitation, no-frontmatter conflation, type-inference vs explicit-typing, YAML comments / anchors / aliases, CRLF/LF, name verbatim passthrough).
- 41 co-located tests in `src/tools/read_property/{schema,handler,index}.test.ts` (14 schema + 22 handler + 5 registration), plus 1 new cli-adapter test for the R5 / T002 inheritance lock (`properties` subcommand inherits unknown-vault re-classification).

### Documentation

- `docs/tools/index.md` — `read_property` entry added with the surgical-read framing.
- `package.json` description updated to mention `read_property` alongside the existing typed tools.

### Known limitations

- **Active-mode multi-vault correctness**: in active mode, Call B is issued without `vault=` — Obsidian returns type metadata for its **default vault**, which may differ from the focused-note's vault. Single-vault setups get correct behaviour. Multi-vault users may see incorrect type labels in active mode (the `value` is always correct; only `type` may mis-resolve). Recommendation: prefer `target_mode: "specific"` with an explicit `vault` argument when multiple vaults are registered and type-correctness matters. Documented in `docs/tools/read_property.md`.
- **No-frontmatter / malformed-frontmatter conflation**: Obsidian's CLI does not distinguish "no frontmatter block" from "malformed frontmatter (missing closing fence)" — both surface as `No frontmatter found.` on stdout. Spec FR-012's "structured error for malformed frontmatter" is weakened to match Obsidian's actual behaviour; both cases follow FR-011's `{ value: null, type: "unknown" }` semantic. Documented in `docs/tools/read_property.md`.
- **Type label inference**: Obsidian reports the property's type as stored in `.obsidian/types.json`, NOT a live YAML-parse inference. A property whose type was never explicit-typed (via the Obsidian UI Properties panel or `obsidian property:set type=...`) may report `"text"` even when its YAML value is date-/datetime-/number-shaped. The wrapper reflects Obsidian's authoritative resolution.

### References

- Spec: [specs/013-read-property/spec.md](specs/013-read-property/spec.md)
- Plan: [specs/013-read-property/plan.md](specs/013-read-property/plan.md)
- Research (incl. T0 Live-CLI Capture 2026-05-09): [specs/013-read-property/research.md](specs/013-read-property/research.md)

## [0.2.5] - 2026-05-08

Patch release — adds the third typed-tool surface, `delete_note`. Symmetric counterpart of `read_note` and `write_note`: where `read_note` retired `obsidian_exec` for reads and `write_note` retired it for create/overwrite, `delete_note` retires it for destructive single-file removal. Pure addition — no existing tool changes, no new error codes, no ADR amendments. `obsidian_exec` remains the freeform escape hatch for the `create` subcommand's `newtab` flag and any unwrapped subcommands; the `delete` subcommand is now FULLY covered by `delete_note`.

### Added

- **`delete_note` typed MCP tool**, wrapping the Obsidian CLI's `delete` subcommand. Direct one-to-one wrap with the target-mode primitive's input shape plus the `permanent` boolean flag. Discriminated by `target_mode: "specific" | "active"`. Returns `{ deleted: true, path: string, toTrash: boolean }`: `deleted` is always literal `true` on success (failures throw `UpstreamError`); `path` is the CLI-canonical vault-relative path at the moment of deletion; `toTrash` is the audit signal — `true` for recoverable trash, `false` for permanent deletion.
- **Safety default**: `permanent: false` (omitted or explicit) sends the file to the OS trash, where it is recoverable until the trash is emptied. **`permanent: true` skips trash and is irreversible** — the file is removed from both the vault and the OS trash with no undo. The irreversibility warning is surfaced in the tool's top-level description AND in [docs/tools/delete_note.md](docs/tools/delete_note.md).
- **Audit-trail invariant** (SC-014): every successful response satisfies `toTrash === !permanent`. The `toTrash` field is derived structurally from input, NOT parsed from CLI response — so the typed surface owns the safety-default contract regardless of CLI response wording. Operators auditing logs filter on `toTrash === false` to surface every irreversible deletion.
- Per-mode validation enforced at the schema layer:
  - Specific mode requires `vault` and exactly one of `file` / `path`; `permanent` defaults to `false`.
  - Active mode forbids `vault` / `file` / `path`; `permanent` is permitted in both modes (departure from `write_note` — `permanent` has well-defined semantics in active mode).
  - Unknown top-level keys are rejected (`additionalProperties: false`, post-010 strict-mode).
- Documentation at [docs/tools/delete_note.md](docs/tools/delete_note.md) — input/output schema, error roster (5 codes), 4+ worked examples (specific path, specific file, specific permanent, failure recovery, active mode), CLI behavioural notes captured during T0 live characterisation (`Moved to trash:` / `Deleted permanently:` response wording, path-traversal NOT normalised by the CLI, file-not-found wording, OS-reserved names on Windows, file-locked-by-external-editor caveat, trash-volume-full known limitation, active-mode TOCTOU caveat for irreversible operations).
- 30 co-located tests in `src/tools/delete_note/{schema,handler,index}.test.ts` (13 schema + 12 handler + 5 registration), plus 1 new cli-adapter test for the R5 / T002 inheritance lock (delete subcommand inherits unknown-vault re-classification).

### Documentation

- `docs/tools/index.md` — `delete_note` entry added with the safety-default phrasing.
- `docs/tools/obsidian_exec.md` — the "When to use a typed tool instead" section now lists three typed tools (read/write/delete) and clarifies that the `delete` subcommand is fully covered by `delete_note`; `obsidian_exec` is no longer the right fallback for delete operations.

### Behavioural notes for callers

- **`Moved to trash:` vs `Deleted permanently:` response wording**: the CLI distinguishes the two outcomes in stdout. The handler's regex captures both prefixes; `toTrash` is derived structurally from input, NOT from the response wording, so future CLI wording changes do not affect the audit invariant.
- **Path-traversal is NOT normalised by the CLI**: `subdir/../foo.md` is treated as a literal multi-component path, not resolved to `foo.md`. There is no vault-escape vector via path-traversal on the CLI's side; the bridge does not add a tool-layer reject (T0.7 verified, SC-012 PASS).
- **Trash-volume-full on Windows**: NOT probed during T0 (best-effort case per FR-019). On a full Windows recycle bin, the CLI's behaviour is unverified — it may surface a structured error, OR it may silently fall back to permanent delete. Until field-verified, callers requiring audit-grade confidence in the to-trash signal SHOULD verify the file's presence in the OS trash out-of-band when handling notes on volumes with constrained recycle-bin capacity. A future BI may add an on-disk verification step if this case surfaces in field reports.
- **Active-mode TOCTOU caveat**: the focused note may shift between parse and execution. For an irreversible operation, agents that need certainty about which file is deleted MUST use specific mode with an explicit locator.

### References

- Spec: [specs/012-delete-note/spec.md](specs/012-delete-note/spec.md)
- Plan: [specs/012-delete-note/plan.md](specs/012-delete-note/plan.md)
- Research (incl. T0 Live-CLI Capture 2026-05-08): [specs/012-delete-note/research.md](specs/012-delete-note/research.md)

## [0.2.4] - 2026-05-08

Patch release — adds the second typed-tool surface, `write_note`. Symmetric counterpart of `read_note`: where `read_note` retired `obsidian_exec` for reads, `write_note` retires it for create/overwrite operations. Pure addition — no existing tool changes, no new error codes, no ADR amendments. `obsidian_exec` remains the freeform escape hatch for the `newtab` flag and any unwrapped subcommands.

### Added

- **`write_note` typed MCP tool**, wrapping the Obsidian CLI's `create` subcommand. Direct one-to-one wrap with the same input shape as `read_note` plus `content`, `template`, `overwrite`, `open`. Discriminated by `target_mode: "specific" | "active"`. Returns `{ created: boolean, path: string }`: `created: true` for fresh creations (CLI emits `Created: <path>`), `created: false` for overwrites (CLI emits `Overwrote: <path>`).
- Per-mode validation enforced at the schema layer:
  - Specific mode requires `vault` and exactly one of `file` / `path`; `overwrite` defaults to `false`.
  - Active mode requires `overwrite: true` (active mode is treated as destructive — the explicit-opt-in posture binds uniformly per Clarifications 2026-05-08 Q1) and forbids `template` and `open` (Clarifications 2026-05-08 Q3).
  - Unknown top-level keys are rejected (`additionalProperties: false`, post-010 strict-mode).
- Adapter-layer R5 / T002 unknown-vault inspection clause in `src/cli-adapter/cli-adapter.ts`. The Obsidian CLI returns exit 0 with stdout `Vault not found.` for unknown vault display names; the adapter now re-classifies that response as `CLI_REPORTED_ERROR` so all typed tools (current and future) inherit the structured failure surface.
- Documentation at [docs/tools/write_note.md](docs/tools/write_note.md) — input/output schema, error roster (5 codes), 5 worked examples, CLI behavioural notes captured during live characterisation (silent auto-rename on collision, active-mode auto-naming, path-traversal CLI defect, empty `etc/` directory side-effect, unknown-vault wording, no-template-folder wording).
- 32 co-located tests in `src/tools/write_note/{schema,handler,index}.test.ts` (15 schema + 12 handler + 5 registration), plus 1 new cli-adapter test for the R5 / T002 clause.

### Documentation

- `docs/tools/index.md` — write_note entry replaces the prior placeholder.
- `docs/tools/obsidian_exec.md` — adds a "When to use a typed tool instead" section pointing agents at `read_note` / `write_note` and reserving `obsidian_exec` for the `newtab` flag and unwrapped subcommands.

### Behavioural notes for callers

- **Silent auto-rename on collision when `overwrite=false`**: if the target path already exists and `overwrite` is omitted or `false`, the CLI does NOT raise an error — it auto-renames the new file (e.g. `Existing.md` → `Existing 1.md`) and returns `created: true` with the renamed path. Callers requiring strict-fail-on-collision MUST pass `overwrite: true` AND inspect the returned `path` against the input.
- **Active-mode auto-naming**: `target_mode: "active"` produces `Untitled.md` (or an auto-incremented sibling) at the active vault's default location. Active mode does NOT rewrite the focused note's content; this is a deviation from the spec's pre-T0 description, reconciled per "spec follows the code that exists".
- **Path-traversal**: vault-relative paths containing `../` segments are rejected by the CLI with an unstructured `TypeError` (exit 0, no file written). The bridge does not add a tool-layer reject; sanitize paths upstream if you need a structured rejection.

### References

- Spec: [specs/011-write-note/spec.md](specs/011-write-note/spec.md)
- Plan: [specs/011-write-note/plan.md](specs/011-write-note/plan.md)
- Research (incl. T0 Live-CLI Capture 2026-05-08): [specs/011-write-note/research.md](specs/011-write-note/research.md)

## [0.2.2] - 2026-05-07

Patch release — structural simplification of the typed-tool publication pipeline introduced across features 007/008/009. `0.2.1` shipped a working compatibility shim (~140 LOC of envelope synthesis in `src/tools/_shared.ts` plus a three-group drift detector at `src/tools/_register.test.ts`) to bridge `targetModeSchema`'s `ZodEffects<ZodDiscriminatedUnion>` shape through the zod → JSON Schema → MCP `inputSchema` pipeline. `0.2.2` deletes the bridge by changing the input shape: `targetModeSchema` is re-encoded as a flat `z.object({...}).strict().superRefine(...)`, and `zodToJsonSchema` emits the natural single-flat-object descriptor directly. Same per-mode rules. Same accepted/rejected inputs, modulo the strict-mode carve-out documented below. NET ~400 LOC deletion.

### Changed

- **`read_note`'s published `inputSchema` simplified.** Where `0.2.1` published a wrapped envelope (`{ type: "object", oneOf: [...], properties: {<unioned>}, required: ["target_mode"], additionalProperties: true }`), `0.2.2` publishes a single flat object: `{ type: "object", properties: { target_mode, vault, file, path }, required: ["target_mode"], additionalProperties: false }`. Strict-rich MCP clients (Claude Desktop, MCP Inspector) and strict-naive clients (Cowork) both accept the new shape; behaviour is unchanged for valid inputs. Future typed tools that need target-mode behaviour now use the flat extension idiom `applyTargetModeRefinement(targetModeBaseSchema.extend({ <fields> }))`. Predecessor: `0.2.1` (feature 009) shipped a working compatibility shim that `0.2.2` replaces with a structurally simpler primitive.
- `src/target-mode/target-mode.ts` re-encoded. Three exports survive: `targetModeBaseSchema` (the bare `z.object({...}).strict()` before `.superRefine`, composable via `.extend({...})`), `applyTargetModeRefinement` (the per-mode dispatcher helper), and `targetModeSchema = applyTargetModeRefinement(targetModeBaseSchema)` (the canonical refined export). Six pre-010 exports deleted: `targetModeSpecificBaseSchema`, `targetModeActiveBaseSchema`, `targetModeSpecificSchema`, `targetModeActiveSchema`, `applyTargetModeSpecificRefinement`, `applyTargetModeActiveRefinement`. The `TargetMode` type flattens accordingly (no public re-export from `src/index.ts`, so the type flatten is internal-only).
- `src/tools/_shared.ts` `toMcpInputSchema` shrinks to a one-line delegate to `zodToJsonSchema`. The wrap branch + `unionTopLevelProperties` + `intersectionTopLevelRequired` + `stripInnerObjectType` helpers delete entirely.
- `src/tools/_register.test.ts` drift detector consolidates from three groups (unit walk + SDK round-trip + Pattern (a)/(b) synthetic fixtures) to one group with two layers (registry walk + SDK round-trip) plus one inline synthetic Pattern (a) fixture. Pattern (b) is removed from the canonical reuse roster outright.
- ADR-003 amended in place: line-20 wording flips from "discriminated union" to "flat `z.object` with a `superRefine`"; the rationale, Status, Consequences, and Related Notes sections are preserved verbatim. An "Amendment 2026-05-07 — Encoding switch (feature 010)" stanza records the rationale at the bottom.

### Behaviour change

- **`read_note` and any future target-mode-aware tool now reject unknown top-level keys.** The pre-`0.2.2` schema used `.passthrough()` and silently passed unknown keys through to the runtime. The post-`0.2.2` schema uses `.strict()` and produces `VALIDATION_ERROR` with `code: "unrecognized_keys"` and `keys: ["<offending>"]` at the parse boundary. Clients that depended on extra keys being silently tolerated must remove them or pin to `0.2.1`; spec-conformant clients that already validate against the published `additionalProperties` value see no observable change. For documented inputs (using only `target_mode`, `vault`, `file`, `path`), behaviour is preserved exactly.

## [0.2.1] - 2026-05-07

Patch release — fixes a release-blocking bug in `read_note`'s published `inputSchema` that made the tool uncallable from spec-conformant MCP clients (e.g. Cowork) whose hand-rolled `Tool` schema validator strips unknown top-level keys (`oneOf`, `additionalProperties`). MCP wire surface unchanged for SDK-shape consumers (Claude Desktop, Claude Code via SDK) — they already worked under `0.2.0`'s pure-`oneOf` envelope and continue to work under the widened envelope.

### Fixed

- `read_note` is now callable from strict-naive MCP clients (Cowork) whose `Tool` validator strips unknown top-level keys. The published `inputSchema` envelope now exposes the four target-mode property names (`target_mode`, `vault`, `file`, `path`) at top level via a widened `properties` map (union of branch property names with leaf-`{}` widening, except cross-branch string discriminators which surface as `{ type: "string" }`) and a top-level `required` array (intersection across branches). The proximate cause traces back to feature 007's deferred `targetModeJsonSchema` companion (T004) and the missing wire-level assertion in feature 008's drift-detector contract — see `specs/009-fix-inputschema-publication/research.md` R1 for the empirical correction to the original working hypothesis (the bug was a coverage gap in the strict-naive client validator, not a predicate gap in `_shared.ts`). Strict-rich clients see the same `oneOf` envelope they had under `0.2.0`; only new top-level keys (`properties`, `required`) are added.

### Changed

- `toMcpInputSchema` (`src/tools/_shared.ts`) wrap branch widened — emits top-level `properties` and `required` alongside `oneOf`. Pattern (a) inputs (`targetModeSchema.and(z.object({...}))`) walk both `allOf` arms: the inner-anyOf arm folds into `oneOf`, the extras arm contributes its `properties` (leaf widening) and `required` keys (UNION) to the top-level aggregates AND survives verbatim under top-level `allOf` so strict-rich clients still apply per-tool extension constraints. Future `write_note` / `append_note` (and any other Pattern (a) / Pattern (b) consumer of the target-mode primitive) inherit the protection by the same mechanism — no per-tool plumbing, no companion JSON Schema export, no opt-in flag.
- `obsidian_exec`'s flat `z.object` schema continues to hit the no-op branch and is byte-stable from `0.2.0` (six properties, `required: ["command"]`, `additionalProperties: false`). Strictly pinned by the new drift detector at `src/tools/_register.test.ts`.

### Added

- Parameterised drift detector at `src/tools/_register.test.ts` with three test groups: Group 1 walks the live registry from `createServer({ registerSignalHandlers: false })` and asserts per-tool invariants for every registered tool (a tool with no invariant entry fails the test, forcing every future typed-tool author to declare its published-shape contract); Group 2 runs the same assertions through a full `InMemoryTransport` SDK round-trip via `client.listTools()` (catches future MCP SDK transformations of the published shape on the wire); Group 3 covers synthetic Pattern (a) and Pattern (b) fixtures via `registerTool` direct invocation (verifies the roadmap unblock for `write_note` / `append_note`).

## [0.2.0] - 2026-05-07

Two architectural deepenings shipped together (feature 008-refactor, ADR-006 + ADR-007). Touches the register / publish / dispatch chain that every typed tool flows through.

### Added

- `registerTool(spec)` factory at `src/tools/_register.ts` — the only path from a zod schema to a published MCP tool descriptor. Owns the full publication pipeline (`toMcpInputSchema` envelope → `stripSchemaDescriptions` → `ZodError` → `VALIDATION_ERROR` marshalling → `UpstreamError` → structured-error envelope → `responseFormat: "json" | "raw"` dispatch).
- `assertToolDocsExist(tools, docsDir)` aggregator at `src/tools/_register.ts` — boot-time check that aggregates ALL missing `docs/tools/{name}.md` files into one error (fail-fast on the first miss is forbidden per FR-005).
- `dispatchCli(input, deps)` private primitive at `src/cli-adapter/_dispatch.ts` — single spawn-and-collect path with always-on bounds, four-priority error classification, and atomic in-flight registry insertion (FR-015a — synchronous with `spawn()`, before any `await` or microtask boundary).
- `invokeBoundedCli(input, overrides, deps)` escape-hatch facade at `src/cli-adapter/invoke-bounded-cli.ts` — default 30 s / 10 MiB; `overrides.timeoutMs` overridable up to a 120 s ceiling, **silently clamped** above (no `VALIDATION_ERROR`, no warning, no log line on the clamp itself).
- `ERR_NO_ACTIVE_FILE` is now reachable through `obsidian_exec` (FR-021) — previously this case surfaced as `CLI_REPORTED_ERROR`. The error roster in `docs/tools/obsidian_exec.md` is updated.
- Failure-only stderr logging discipline: dispatch primitive emits exactly ONE stderr JSON line per occurrence for `dispatch.timeout`, `dispatch.cap`, and `dispatch.kill`. ZERO emissions on the success path or on the four non-bounds verdicts (`CLI_NON_ZERO_EXIT`, `ERR_NO_ACTIVE_FILE`, `CLI_REPORTED_ERROR`, `CLI_BINARY_NOT_FOUND`).

### Changed

- Typed tools (`read_note` and any future typed tool) now route through `invokeCli` and are bounded at **10 s / 10 MiB** (previously unbounded). Operator-observable behavior change.
- Typed tools now serialize through the FIFO single-flight queue alongside `obsidian_exec` (research R6 — necessary for the single-cell registry's at-most-one invariant).
- argv assembly is unified to the documented order `[binary, vault=..., command, kvs..., flags..., --copy]` (FR-012). Today's `cli-adapter.ts` previously produced `[command, vault=..., kvs..., flags...]`; the deepening adopts the documented contract.
- Each tool collapses to `schema.ts` (zod only — no `*InputJsonSchema` companion) + `handler.ts` + `index.ts` (a thin `registerTool({...})` call replacing today's `tool.ts`).
- The exported function `killActiveChild` is renamed to `killInFlightChildren` and lives in `src/cli-adapter/cli-adapter.ts` (FR-016 / FR-017). `src/server.ts:9` re-points its import accordingly, fixing the Principle-I downward-flow violation as a side effect.

### Removed

- Per-call `call.start` / `call.end*` stderr lifecycle events (formerly emitted from `obsidian_exec/handler.ts`). Operator-observable signal change — replaced by failure-only `dispatch.*` events from the dispatch primitive.
- Per-tool `*InputJsonSchema` exports (`helpInputJsonSchema`, `obsidianExecInputJsonSchema`, `readNoteInputJsonSchema`) and the `targetModeJsonSchema` companion. The publication path is owned solely by `registerTool` (SC-002).
- Per-tool `tool.ts` boilerplate (`registerHelpTool`, `registerObsidianExecTool`, `registerReadNoteTool`) and their co-located test files. Replaced by ~10-line `index.ts` files calling `registerTool`.
- `Logger.callStart`, `Logger.callEndSuccess`, `Logger.callEndFailure` methods.
