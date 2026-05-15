# Research — 029-list-files-recursive

**Branch**: `029-list-files-recursive`
**Date**: 2026-05-15
**Status**: Phase 0 complete; all NEEDS-CLARIFICATION resolved.

This document captures the Phase 0 research that drives the BI-029 plan. It is the source-of-truth for the architectural decisions R1..R15 and the live-CLI / `app.vault.adapter` findings F1..F12 that drove them. The findings were collected by direct invocation of `obsidian` against the authorised test vault per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md).

## Research decisions

### R1 — Logger surface

**Decision**: defer to the cli-adapter's existing dispatch events (`dispatchTimeout` / `dispatchCap` / `dispatchKill`). No per-call `logger.callStart` / `callEndSuccess` / `callEndFailure` events at the typed-tool layer.

**Rationale**: parity with every eval-cohort BI from BI-014 onwards. The cli-adapter already emits observability events for the underlying CLI invocation; adding a per-typed-tool wrapper layer of events would duplicate signal without adding agent-actionable detail. Typed tools are thin transforms over the dispatch boundary; the boundary is the right observability seam.

**Alternatives considered**: add per-call typed-tool events (rejected — duplicates dispatch-layer signal); add a per-feature subscriber that taps the dispatch stream (rejected — not needed for v1; can be lifted to a shared module if a future BI requires distinct per-call attribution).

### R2 — Subcommand routing: `eval` (load-bearing departure from native)

**Decision**: route through `obsidian eval` with a frozen JS template that walks `app.vault.adapter` recursively in a single invocation.

**Rationale**: the native CLI surface offers `files` (recursive flat file list) AND `folders` (recursive flat folder list) as TWO separate subcommands. To satisfy the BI-029 spec in a single CLI invocation, the wrapper would need a way to combine those two outputs — but the single-call architecture rule (R3 across the project) forbids two spawns per request. The `eval` route walks `app.vault.adapter` ONCE per request and emits a structured envelope containing both files and folders, depth-bounded, ext-filtered, dotfile-filtered, with folder-vs-file distinguishability — all in a single invocation. The native route is rejected.

A secondary reason: native `files` and `folders` lack depth bounding, missing-folder distinguishability (`files folder=NonExistent` returns empty stdout exit 0 — observed per F1 below; `folders folder=NonExistent` returns `Error: Folder "NonExistent" not found.` — observed per F2), and trailing-slash on folder entries (per FR-028). The eval route handles all three contracts in-eval without wrapper-side post-processing.

**Alternatives considered**:
- (A) Two spawns: `files` + `folders` → reject (violates single-call architecture);
- (B) One spawn: native `files` + wrapper-side re-walk for folders → reject (incomplete data — `files` doesn't return folder entries at all; would still need a separate `folders` spawn);
- (C) One spawn: `eval` walking `app.vault.adapter` → ACCEPTED.

### R3 — Single-call architecture; envelope branches at emission on `payload.total`

**Decision**: each MCP request issues exactly ONE `invokeCli` call with subcommand `eval` and a single rendered JS template carrying the base64-encoded payload. The JS template branches its return shape at envelope emission based on `payload.total`: when `total: false` the envelope carries `{ ok: true, count, paths: [...sorted-filtered] }`; when `total: true` the envelope carries `{ ok: true, count, paths: [] }`. The full walk runs unconditionally regardless of `total` — the branch is purely the SHAPE of the returned `paths` field.

**Rationale**: identical pattern to BI-014 / BI-015 / BI-025 / BI-026 / BI-027 / BI-028. The cross-mode count invariant (FR-008 + FR-010) holds by construction because both branches derive `count` from the same `out.length` after filtering. Single-call simplifies test-seam isolation (only one dispatcher call to mock).

**Alternatives considered**: two-mode architecture firing different invocations per `total` value (rejected — duplicates the eval template and creates a cross-mode count-drift risk).

### R4 — Tool name: `tree`

**Decision**: register the typed tool as `tree`. Single-word, original (no upstream subcommand collision — the CLI has `files` and `folders` but no `tree`, `walk`, or `find` per probe F-help).

**Rationale**: ADR-010 (single-word-verbatim-from-upstream) is N/A because the wrapper composes via `eval`, not a single named native subcommand. ADR-013 (plugin-namespace) is N/A because the underlying surface is core-cache-backed, not plugin-backed. The naming space is therefore the "single-word original" branch.

Candidates considered: `tree` (evocative of file-system tree structure; matches the Unix `tree` command's domain), `walk` (action-verb; matches `os.walk` / `filepath.Walk` etc.), `subtree` (compound feel, less natural), `inventory` (slightly off-domain), `find` (overloaded with Unix `find`). `tree` is the strongest by the "agent recognises the domain on sight" heuristic AND avoids overload with project-internal verbs.

**Alternatives considered**: `walk` (rejected — slightly weaker domain signal); `subtree` (rejected — compound-feel); `find` (rejected — overload with Unix `find`).

### R5 — Standard target_mode discriminator with folder-scoped adaptation

**Decision**: input schema is the post-010 flat-extension shape via `targetModeBaseSchema` + `applyTargetModeRefinement` reuse — STANDARD `target_mode` discriminator (`"specific" | "active"`) with the same folder-scoped adaptation already established by `files` (BI-019): forbid the file-scoped locator fields `file` and `path` in BOTH modes; accept `folder` instead. No adapter change required — the schema layer applies the field-presence refinement.

**Rationale**: cross-tool consistency. Every folder-scoped or file-scoped typed tool that supports both modes uses the same discriminator shape; BI-029 is the second member of the folder-scoped sub-cohort (after BI-019). ADR-003 governs; the folder-scoped adaptation is unchanged from BI-019.

**Alternatives considered**: FLAT schema with no `target_mode` (rejected — BI-026/027 plugin-backed FLAT cohort applies to fileless surfaces, but this tool can address a specific named folder so the discriminator is meaningful); per-tool discriminator helper (rejected — `applyTargetModeRefinement` already covers folder-scoped form via BI-019).

### R6 — Anti-injection via base64-encoded JSON payload + frozen JS template

**Decision**: user-supplied inputs (`folder`, `depth`, `ext`, `total`) flow through `JSON.stringify({folder, depth, ext, total})` → `Buffer.from(...).toString("base64")` → single token substitution `__PAYLOAD_B64__` inside a frozen JS template. The JS template runs `atob(b64) → JSON.parse(...)` at eval-runtime; user-supplied text NEVER reaches the JS source as code.

**Rationale**: identical to BI-014 / BI-015 / BI-025 / BI-026 / BI-027 / BI-028. The injection vector (FR-016) is closed structurally — no per-field sanitisation is the primary defence. Verified by inspection of the rendered argv: the only place user input appears is inside the base64 string, which is opaque to a JS parser.

**Alternatives considered**: stringify user input directly into JS code (rejected — known injection surface); use stdin to pass the payload (rejected — `eval` subcommand reads code from argv, not stdin, per cli-adapter contract).

### R7 — Folder existence trichotomy via `app.vault.adapter.stat`

**Decision**: in-eval, pre-walk, call `app.vault.adapter.stat(folder)`. Three branches:
- `null` (path does not exist) → emit `{ ok: false, code: "FOLDER_NOT_FOUND", folder }`;
- `{type: "file"}` → emit `{ ok: false, code: "NOT_A_FOLDER", folder }`;
- `{type: "folder"}` → proceed to walk.

When `folder` is omitted (caller wants vault root), skip the stat entirely and treat as folder — `app.vault.adapter.list('')` succeeds against the vault root unconditionally per F5.

**Rationale**: `stat` is the cleanest probe — it returns a single object covering all three cases without needing `try/catch` wrapping. Tested live per F6.

**Alternatives considered**: probe via `app.vault.adapter.list().catch(...)` (rejected — throws ENOTDIR for files and ENOENT for missing; same information but requires error-message-string discrimination — more brittle than the stat-type discrimination); probe via `app.vault.getAbstractFileByPath` (rejected — returns instances with minified class names in production; we'd need an `instanceof TFolder` check that requires importing TFolder into eval scope — fragile).

### R8 — Recursive walk via `app.vault.adapter.list` with in-eval level counter

**Decision**: walk recursively via `app.vault.adapter.list(currentPath)`. The adapter returns `{ files: string[], folders: string[] }` with VAULT-ROOT-RELATIVE paths (no trailing slash on folders, file extensions preserved). The walk is DFS via a recursive async function with a level counter starting at 1; when `depth` is set, the walk stops descending when `level > depth`.

```javascript
// Pseudocode (the real template renders this with payload binding)
const out = [];  // array of { p: string, d: boolean }
const walk = async (current, level) => {
  if (depth !== null && level > depth) return;
  const r = await app.vault.adapter.list(current);
  for (const f of r.files) out.push({ p: f, d: false });
  for (const d of r.folders) {
    out.push({ p: d, d: true });
    await walk(d, level + 1);
  }
};
await walk(start, 1);
```

The starting folder is at level 0 (and is NEVER added to `out` per FR-012); the immediate children are at level 1.

**Rationale**: matches the live-probe behaviour (F5). Vault-root-relative paths from `list()` mean no path-prefix bookkeeping is required — paths flow through verbatim.

**Alternatives considered**: BFS via a queue (rejected — DFS is more natural for the sort key and uses less in-eval memory for narrow-deep subtrees); pre-computed depth via path-segment counting (rejected — duplicates the level-counter signal already present in the recursion).

### R9 — Depth bounding semantics (depth-1 = immediate children; starting folder = depth 0 = never returned)

**Decision**: `depth` measures level FROM the starting folder. The starting folder is depth 0 and is NEVER included in `paths` (per FR-012). Immediate children are depth 1. `depth: 1` returns ONLY depth-1 entries. `depth: N` returns depth-1..N entries. When `depth` is omitted, traversal is unbounded.

A `depth` value greater than the actual maximum depth of the subtree is SILENTLY accepted — the response is identical to an omitted `depth` for that subtree (the contract is "at MOST `depth` levels deep", not "exactly `depth` levels deep").

**Rationale**: this matches the spec FR-006 exactly and is the natural interpretation of "depth bound". The asymmetry (starting folder at depth 0 not returned; immediate children at depth 1 returned) is the standard file-system convention.

**Alternatives considered**: depth measured from vault root regardless of starting folder (rejected — breaks the sub-folder use case in US3 scenario 2 where `folder: "Inbox", depth: 1` should return immediate children of `Inbox/` not arbitrary depth-1 entries); zero-based depth meaning "include the starting folder" (rejected — contradicts FR-012).

### R10 — Trailing slash on folder entries; bare names on file entries (per FR-028)

**Decision**: the in-eval pipeline appends `/` to every folder entry's path before adding it to the output array; file entries flow through unchanged. The trailing-slash transformation applies AFTER the walk (in the final mapping step) so the recursion bookkeeping uses the bare path (matching `app.vault.adapter.list()`'s return shape), but the published output carries the trailing-slash form.

```javascript
// After walk: out is array of { p, d }
const rendered = out.map(e => e.d ? (e.p + "/") : e.p);
```

The wrapper-imposed lexical sort (R13) operates on the trailing-slash-rendered form.

**Rationale**: locked by FR-028 / SC-022 / the Session 2026-05-15 clarification. The trailing-slash discrimination rule is in-band and unambiguous; callers parse with `path.endsWith("/")`.

**Alternatives considered**: emit `paths` as objects `{path, type}` (rejected — breaks the flat-string-array shape the user explicitly locked); emit two separate fields `files: [], folders: []` (rejected — same).

### R11 — Extension filter interaction with folder entries

**Decision**: when `ext` is set, the filter pipeline drops ALL folder entries (regardless of which extension they carry) AND drops file entries whose extension does NOT match. When `ext` is omitted, both file AND folder entries appear. The filter applies AFTER the dotfile filter and BEFORE the trailing-slash transformation.

```javascript
// Pseudocode
let filtered = dotfileFiltered;  // R12 output
if (ext !== null) {
  filtered = filtered.filter(e => !e.d && e.p.toLowerCase().endsWith("." + extNormalised));
}
```

The leading-dot form (`.md`) and bare form (`md`) of the input are normalised to the bare-then-prefix form (`.md` after a `replace(/^\./, "")` and then a prepended dot during the match).

**Rationale**: locked by FR-007. The "filter folders when ext set" rule is wrapper-side; the underlying `app.vault.adapter.list()` does not natively express this combination. Tested in mock fixtures during handler-test phase.

**Alternatives considered**: keep folder entries even when `ext` is set if they CONTAIN a matching file (rejected — overcomplicated, callers can compute this from the file paths themselves); include folders unconditionally and apply `ext` as a label-only filter (rejected — confusing UX, contradicts the spec).

### R12 — Dotfile filter; in-eval, applied during the walk

**Decision**: the in-eval filter drops any entry whose VAULT-RELATIVE path contains a segment beginning with `.` (one or more). The filter applies during the walk — when iterating `r.folders`, skip any folder whose name starts with `.` (so the recursion never descends into `.obsidian/`, `.smart-env/`, etc.); when iterating `r.files`, skip any file whose name starts with `.` (`.gitkeep`, `.hidden.md`, etc.).

```javascript
// Pseudocode (inside walk)
for (const f of r.files) {
  if (!hasDotSegment(f)) out.push({ p: f, d: false });
}
for (const d of r.folders) {
  if (!hasDotSegment(d)) {
    out.push({ p: d, d: true });
    await walk(d, level + 1);
  }
}
```

The `hasDotSegment` predicate splits on `/` and tests `seg.startsWith(".")` for each segment. The check is applied to the FULL vault-relative path; a file like `notes/.draft.md` is dropped because the `.draft.md` segment matches.

**Rationale**: efficient — skipping dotfolders early avoids walking their subtrees entirely. Identical filter rule to BI-019 FR-028 (this BI's FR-027).

**Alternatives considered**: apply the filter post-walk on the full collected array (rejected — wastes traversal time inside dotdirs); filter only on the LAST segment of each path (rejected — does not handle the `folder: ".obsidian"` case where every result is rooted in a dot-prefixed segment).

### R13 — Wrapper-imposed lexical sort on the final string array

**Decision**: after all filtering (dotfile + depth + ext + folder/file inclusion) and after the trailing-slash transformation (R10), sort the resulting `string[]` byte-asc using the default `String.prototype.sort()` (UTF-8 byte-compare semantics in practice for ASCII; for non-ASCII the V8 default sort approximates byte-compare on the UTF-16 code-unit representation — close enough for portability; locked into FR-013).

**Rationale**: locked by FR-013 / SC-007. Pure byte-asc on the final published form means the sort is deterministic and observable by inspection. The trailing-slash form produces natural depth-first ordering (folders sort BEFORE their children because the trailing `/` (47) < `R` (82), `a` (97), etc. — and shorter prefixes sort first).

**Alternatives considered**: locale-aware sort (rejected — platform-dependent and not reproducible across hosts); Unicode-collation sort (rejected — heavyweight, unnecessary for this surface); sort with folders-first across each level (rejected — natural byte-asc already produces depth-first-ish ordering that callers can rely on).

### R14 — Structured eval-envelope errors via ADR-015 sub-discriminator pattern

**Decision**: the eval JS template emits a discriminated envelope `{ ok: true, count, paths } | { ok: false, code: <CODE>, ... }`. Two new envelope `code` values are introduced: `FOLDER_NOT_FOUND` (the starting folder does not exist) and `NOT_A_FOLDER` (the starting path resolves to a file). Both are mapped to the existing `CLI_REPORTED_ERROR` top-level error code with `details.code = "FOLDER_NOT_FOUND"` or `details.code = "NOT_A_FOLDER"` respectively (ADR-015 sub-discriminator pattern via `details.code`).

The handler's stage-by-stage parse maps:
- `{ ok: true, ... }` → success;
- `{ ok: false, code: "FOLDER_NOT_FOUND" }` → `CLI_REPORTED_ERROR(stage: "envelope-error", code: "FOLDER_NOT_FOUND", folder)`;
- `{ ok: false, code: "NOT_A_FOLDER" }` → `CLI_REPORTED_ERROR(stage: "envelope-error", code: "NOT_A_FOLDER", folder)`;
- malformed envelope → `CLI_REPORTED_ERROR(stage: "envelope-parse")`;
- malformed JSON → `CLI_REPORTED_ERROR(stage: "json-parse")`.

**Rationale**: locked by FR-011 / FR-021 / SC-017. Zero new top-level error codes (Constitution Principle IV; BI-029 preserves the eleven-tool-and-counting zero-new-codes streak as the twelfth consecutive). The `details.code` strings are NEW within `CLI_REPORTED_ERROR`'s sub-namespace but the top-level code shape is unchanged.

**Alternatives considered**: introduce two new top-level error codes (`FOLDER_NOT_FOUND` / `NOT_A_FOLDER` as top-level) — rejected (breaks Principle IV streak; agents already match on `details.code` per ADR-015); conflate with existing `FILE_NOT_FOUND` code — rejected (semantically different — `FILE_NOT_FOUND` means the path is a file that does not exist; `FOLDER_NOT_FOUND` means the path is a folder slot that does not exist; the surface meaning is clearer with distinct sub-codes).

### R15 — Fourth consumer of `_eval-vault-closed-detection/` shared module

**Decision**: the handler imports `detectEvalVaultClosed` from `src/tools/_eval-vault-closed-detection/index.ts` and uses it as the stage-0 closed-vault detection branch (parity with BI-026 / BI-027 / BI-028).

When `app.vault.adapter.list()` is called against a closed-but-registered vault, the eval subcommand returns empty stdout exit 0 (the Obsidian CLI transparently opens the vault as a side effect — the call succeeds on the SECOND invocation but the FIRST returns nothing). The shared module's detector inspects the stdout for the empty-with-transparent-open signature and synthesises a `CLI_REPORTED_ERROR(details.code: "VAULT_NOT_FOUND", details.reason: "not-open")` response per ADR-015.

**Rationale**: cross-cutting module is now at THREE consumers (BI-026 inline → BI-027 lifted → BI-028 confirmed); BI-029 makes FOUR. The pattern of routing through the shared module is now well-established for any eval-driven typed tool with a `vault?` parameter.

**Alternatives considered**: inline the detector logic (rejected — duplication that the shared module exists to prevent); skip the detection (rejected — silent empty-listing would be ambiguous with empty-vault).

## Live-CLI / `app.vault.adapter` findings

All findings were collected against the authorised test vault `TestVault-Obsidian-CLI-MCP` on 2026-05-15 via direct `obsidian` invocations.

### F1 — Native `files` subcommand: recursive flat file list, no folder entries, missing-folder conflated

`obsidian vault=TestVault-Obsidian-CLI-MCP files folder=Sandbox` returns empty stdout exit 0 against an empty folder. `obsidian vault=TestVault-Obsidian-CLI-MCP files folder=NonExistent` returns empty stdout exit 0 against a non-existent folder — confirming BI-019 FR-010's missing/empty conflation. Native `files` output is one path per line, vault-relative, with no trailing slash on any entry (because no entries are folders). No `format=json` on this subcommand despite BI-019 plan-stage assertion (the help text shows `total` / `folder=` / `ext=` flags only; `format=json` is not in the help and was not observed when probed).

### F2 — Native `folders` subcommand: recursive flat folder list, missing-folder structured error

`obsidian vault=TestVault-Obsidian-CLI-MCP folders` returns one folder path per line, recursive descent through the vault. A standalone `/` entry appears at the root (the vault root itself, represented as `/`). `obsidian vault=TestVault-Obsidian-CLI-MCP folders folder=NonExistent` returns `Error: Folder "NonExistent" not found.` exit non-zero — DISTINCT from the `files` subcommand's silent-empty behaviour. No `format=json` support.

### F3 — Native `files` + `folders` lack three contracts the spec requires

Neither native subcommand supports:
- **Depth bounding**: both return the FULL recursive subtree always; no depth cap.
- **Combined files + folders output**: each subcommand emits one shape exclusively; combining them requires two CLI spawns.
- **Trailing slash on folder entries**: native `folders` emits bare folder paths; the wrapper would need a post-process transform.

The first contract (depth) is the most load-bearing — the spec FR-006 requires depth bounding in-tool. With no native support, the wrapper would have to walk twice (once with `files` + once with `folders`) and then trim to depth wrapper-side. That defeats the single-call architecture (R3).

### F4 — `obsidian eval` works against the test vault

`obsidian vault=TestVault-Obsidian-CLI-MCP eval code="1+1"` returns `=> 2`. `obsidian vault=UnknownVault123 eval code="1+1"` returns `Vault not found.` — the same R5 dispatch-layer reclassification that BI-014 / BI-015 / BI-025 / BI-026 / BI-027 / BI-028 already inherit applies.

### F5 — `app.vault.adapter.list(path)` shape

`(async () => await app.vault.adapter.list(''))()` returns `{ files: string[], folders: string[] }` where:
- `files` carries vault-root-relative file paths WITHOUT trailing slash (e.g. `Welcome.md`, `Sandbox/notes/x.md`).
- `folders` carries vault-root-relative folder paths WITHOUT trailing slash (e.g. `Sandbox`, `Fixtures/BI-005`).
- The list is IMMEDIATE CHILDREN only — recursion is the wrapper's responsibility.
- Dotfile entries (`.obsidian`, `.smart-env`, `.gitkeep`, etc.) appear in the result — the adapter does NOT filter them.

When called with a nested path, the recursive output uses vault-root-relative paths consistently — `await app.vault.adapter.list('Fixtures/BI-005')` returns `{ files: ["Fixtures/BI-005/all-types.md", "Fixtures/BI-005/malformed.md"], folders: [] }`.

### F6 — `app.vault.adapter.stat(path)` returns trichotomy

`(async () => app.vault.adapter.stat('Sandbox'))()` returns `{ type: "folder", ctime, mtime, size }`. `stat('Welcome.md')` returns `{ type: "file", ctime, mtime, size }`. `stat('Nonexistent')` returns `null`. The trichotomy {folder, file, null} is the load-bearing finding for R7 — the missing-folder vs not-a-folder distinction can be decided from a single stat call before any walk.

### F7 — `app.vault.adapter.list(path)` on file → ENOTDIR; on missing → ENOENT

Direct call `await app.vault.adapter.list('Welcome.md')` throws `ENOTDIR: not a directory, scandir 'C:\…\Welcome.md'`. Direct call `await app.vault.adapter.list('Nonexistent')` throws `ENOENT: no such file or directory, scandir 'C:\…\Nonexistent'`. We pre-check via `stat` (F6) and never reach the throw paths.

### F8 — Unknown vault behaviour for `eval`

`obsidian vault=UnknownVault123 eval code="1+1"` returns `Vault not found.` — the cli-adapter's 011-R5 inspection clause fires and reclassifies to `CLI_REPORTED_ERROR(details.code: "VAULT_NOT_FOUND")`. Inherited unchanged from BI-014.

### F9 — Closed-but-registered vault behaviour for `eval`

Inherited from BI-026 finding: a vault that is registered but currently closed produces empty stdout exit 0 from `eval` — the Obsidian CLI transparently opens the vault as a side effect. The `_eval-vault-closed-detection/` shared module's `detectEvalVaultClosed` function inspects the stdout for this signature and synthesises `CLI_REPORTED_ERROR(details.code: "VAULT_NOT_FOUND", details.reason: "not-open")` per ADR-015. BI-029 is the FOURTH consumer of this module (after BI-026 inline → BI-027 lifted-to-shared → BI-028 third-consumer-confirms).

### F10 — Folder paths from `adapter.list` have no trailing slash; wrapper appends `/`

Direct observation per F5. The wrapper's R10 transform appends `/` to every folder-classified entry in the final published `paths` array.

### F11 — `adapter.list` returns dotfile entries; wrapper drops via R12

Direct observation per F5: `.obsidian`, `.smart-env`, etc. appear in the result. The R12 / FR-027 dotfile filter drops them.

### F12 — Trailing slash on input folder path: silently accepted by adapter

`(async () => await app.vault.adapter.list('Sandbox/'))()` returns the same result as `list('Sandbox')`. The adapter accepts trailing slash silently — but the wrapper normalises (`/$` stripped) for spec FR-014 consistency and to avoid double-slash bugs in path concatenation during the walk.

## Architectural delta map vs predecessors

| Aspect | BI-019 (`files`) | BI-028 (`tag`) | BI-029 (`tree`) |
|---|---|---|---|
| Subcommand | native `files` | `eval` | `eval` |
| Single-call | yes | yes | yes |
| target_mode | yes (folder-scoped) | no (vault-only fileless) | yes (folder-scoped) |
| Anti-injection | argv pass-through | base64 + frozen template | base64 + frozen template |
| Sort | byte-asc wrapper-side | byte-asc wrapper-side | byte-asc wrapper-side (post-trailing-slash) |
| Dotfile filter | yes | n/a (tag-keyed) | yes |
| Folder entries in output | dropped (FR-026) | n/a | INCLUDED (when ext absent) with trailing `/` |
| Depth bound | n/a (non-recursive) | n/a | in-eval level counter |
| Missing-folder | conflated with empty | n/a (tag-keyed) | DISTINCT structured error |
| Not-a-folder | n/a | n/a | DISTINCT structured error |
| New top-level codes | 0 | 0 | 0 |
| New `details.code` strings | 0 | 0 | 2 (FOLDER_NOT_FOUND, NOT_A_FOLDER) |
| `_eval-vault-closed-detection/` consumer | n/a | 3rd | 4th |
| New ADRs | 0 | 0 | 0 |
| Constitution amendment | n/a | none | none |

## Open items deferred to T0 of /speckit-implement

Live-CLI characterisation cases enumerated in spec FR-024 will run during T0 against the authorised test vault. The characterisation roster covers:

1. Vault root with mixed top-level files and folders (no `folder`, no `depth`, no `ext`).
2. Sub-folder subtree (US2 fixture) — small flat, deep narrow, wide shallow.
3. Depth bound observable (`depth: 1` / `2` / `3`).
4. Depth greater than subtree height — silent-acceptance contract.
5. `ext` filter (matches some, matches none, leading-dot vs bare).
6. `ext` set vs unset — folder-entry inclusion observable.
7. Missing folder — `CLI_REPORTED_ERROR(details.code: "FOLDER_NOT_FOUND")`.
8. Not-a-folder (path resolves to a file) — `CLI_REPORTED_ERROR(details.code: "NOT_A_FOLDER")`.
9. Empty folder that exists — `{ count: 0, paths: [] }` success.
10. `total: true` — populated, empty, with `ext`, with `depth`.
11. Two consecutive identical calls — byte-identical sort.
12. Emoji / non-ASCII / whitespace in entry names.
13. Dotfile filter coverage (FR-027 plus FR-028 trailing-slash on visible folders).
14. Trailing slash on input `folder` versus without.
15. Unknown vault display name — `CLI_REPORTED_ERROR(details.code: "VAULT_NOT_FOUND", details.reason: "unknown")`.
16. Active mode with no focused vault.
17. Path-traversal on `folder` (`../escape`).
18. Synthetic large subtree exceeding output cap.

T0 cleanup follows the destructive-probe protocol in [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md). All fixture authoring goes under `…\TestVault-Obsidian-CLI-MCP\Sandbox\` with timestamped subdirectories.
