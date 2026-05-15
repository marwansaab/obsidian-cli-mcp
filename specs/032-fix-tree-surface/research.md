# Phase 0 Research — Fix Tree Tool Surface

**Feature**: 032-fix-tree-surface | **Date**: 2026-05-15

Research consolidates decisions on the implementation mechanics of the rename + description-rewrite + schema-fix sweep. The spec already locked the three load-bearing decisions at clarify (name, schema-fix implementation, description-length cap). This document resolves the remaining mechanical questions and records the plan-stage live-codebase findings (F1..F5) that ratify the spec's edge-case assumptions.

## Decisions

### R1 — Help-pointer wording follows sibling-tool convention verbatim

**Decision**: The description's terminal sentence is `Call help({ tool_name: "paths" }) for full parameter docs, <one or two summary items>, and the error roster.`

**Rationale**: Survey of sibling tools' descriptions (extracted at plan time via `grep -oE 'Call help\(\{ tool_name: \\"[^"]+\\" \}\) [^"]+'` against `src/tools/*/index.ts`) returns six tools with this exact convention: `files`, `links`, `outline`, `properties`, `smart_connections_query`, `smart_connections_similar`. The pattern is `Call help({ tool_name: "<name>" }) for full parameter docs, <list of distinctive surfaces (count-only example, inherited-limitations note, etc.)>, and the error roster.` Adopting the same wording for `paths` matches FR-010 (spec) and preserves cross-tool reading economy.

**Alternatives considered**:
- Shorter `See help({ tool_name: "paths" })` — rejected, breaks the cross-tool wording uniformity surfaced by the survey.
- No help pointer at all — rejected by FR-010.
- Custom wording that calls out the `paths` tool's specific gotchas (multi-vault basename ambiguity, dotfile filter) inline — rejected because that bulk is the very content the BI is moving INTO `help`'s payload, not the description.

### R2 — Version bump granularity: MINOR (`0.5.8 → 0.6.0`)

**Decision**: Bump `package.json#version` from `0.5.8` to `0.6.0`. MINOR granularity on pre-v1.0 semver.

**Rationale**: The rename is a breaking surface change — any caller (an MCP client, an agent, or a tool-list-driven UI) that has hard-coded the literal `tree` name in a tool-name comparison or in a `help({ tool_name: "tree" })` invocation will fail on the post-change server. Per the BI-022 precedent (which renamed five tools in one sweep and bumped `0.4.4 → 0.5.0`), breaking renames in this project bump MINOR, not PATCH, even though the project is pre-v1.0 and any change CAN in theory be breaking. The spec's Assumption section pre-recommended MINOR while noting "0.5.9 MINOR-or-PATCH" — the post-clarify research confirms the correct target is `0.6.0`, not `0.5.9`, because the BI-022 precedent advances the MINOR digit, not the PATCH digit.

**Alternatives considered**:
- PATCH bump to `0.5.9` — rejected as inconsistent with BI-022's precedent. The change IS a breaking rename for any caller that has cached `tree`.
- MAJOR bump to `1.0.0` — out of scope; the project's v1.0 cut criteria are separately tracked.

### R3 — Architecture-doc roll-forward IN THIS BI's commit

**Decision**: `.architecture/Obsidian CLI MCP - Architecture.md` is rolled forward in the same commit as the source-tree rename, updating in-file `tree`-named references to `paths`. The historical ordinal anchor ("fifteenth typed-tool wrap") stays as a snapshot reference; only the NAME of the tool updates.

**Rationale**: The spec's edge case `Architecture-doc reference` recommends in-this-BI roll-forward to preserve doc-truth alignment (parity with BI-026/27/28/29/30 precedent of rolling forward the canonical doc in the same commit that mutates the tool registry). Deferring would create a documentation drift window where the canonical architecture doc names a tool (`tree`) that the live registry no longer exposes. The roll-forward is a textual `tree` → `paths` substitution scoped to the doc's tool-name occurrences; the bulk of the document (the structural narrative, the cohort lists, the inherited-limitations table) is unaffected.

**Alternatives considered**:
- Defer to the next architecture-impacting BI — rejected per the drift-window rationale above. The spec's FR-020 says "MAY be rolled forward"; research promotes the MAY to a DOES based on the spec's recommendation and the precedent.

### R4 — `git mv` directory-and-file rename mechanic

**Decision**: The rename is executed via four `git mv` operations performed in a single staging step:
1. `git mv src/tools/tree src/tools/paths` (renames the whole directory; all seven files inside move with it preserving git-blame history)
2. `git mv docs/tools/tree.md docs/tools/paths.md`

(Two `git mv` invocations total; the directory move is atomic at the git layer.)

**Rationale**: `git mv` preserves git-blame history per the BI-022 lockstep convention (FR-015). The directory-level `git mv` is the atomic minimum — git tracks the move via similarity detection in subsequent diff/blame queries. Two operations are required because `docs/tools/tree.md` is outside the `src/tools/tree/` tree; the directory move does not capture it.

**Alternatives considered**:
- Per-file `git mv` × 8 — rejected as needlessly verbose; the directory-level mv is atomic.
- `git rm` + `git add` — rejected because it breaks blame history per FR-015.

### R5 — In-file symbol-rename inventory inside the renamed directory

**Decision**: The following symbols are renamed in lockstep with the directory move:

| Old symbol (in `src/tools/tree/`) | New symbol (in `src/tools/paths/`) | Files affected |
|---|---|---|
| `TREE_TOOL_NAME` | `PATHS_TOOL_NAME` | `index.ts`, `index.test.ts` |
| `TREE_DESCRIPTION` | `PATHS_DESCRIPTION` | `index.ts`, `index.test.ts` |
| `createTreeTool` | `createPathsTool` | `index.ts`, `index.test.ts`, `src/server.ts` (one import line) |
| `treeInputSchema` | `pathsInputSchema` | `schema.ts`, `schema.test.ts`, `handler.ts`, `handler.test.ts` |
| `treeOutputSchema` | `pathsOutputSchema` | `schema.ts`, `schema.test.ts`, `handler.ts` |
| `treeEvalEnvelopeSchema` | `pathsEvalEnvelopeSchema` | `schema.ts`, `schema.test.ts`, `handler.ts` |
| `treeEnvelopeOk` (file-private) | `pathsEnvelopeOk` (file-private) | `schema.ts` |
| `treeEnvelopeError` (file-private) | `pathsEnvelopeError` (file-private) | `schema.ts` |
| `TreeInput`, `TreeOutput`, `TreeEvalEnvelope` (TS types) | `PathsInput`, `PathsOutput`, `PathsEvalEnvelope` | `schema.ts`, `handler.ts`, `index.ts`, `handler.test.ts` |
| `executeTree` (handler function) | `executePaths` | `handler.ts`, `index.ts` |
| `TreeOptions` / `ExecuteDeps` (deps type) | `PathsOptions` / `ExecuteDeps` (unchanged) | `handler.ts`, `index.ts` |

**Rationale**: Mechanical lockstep rename to preserve the "tool name = source-dir name = factory-fn name = constants prefix" invariant established by BI-022. The TS-type renames keep `z.infer<typeof <schema>>` aliases consistent.

### R6 — In-file literal-name and log-string updates

**Decision**: The following literal strings are updated inside the renamed dir's files:

- `src/tools/paths/handler.ts`: three log-message strings replace `"tree"` with `"paths"` — line 82 (`tree: eval response is not JSON: ...`), line 93 (`tree: eval response shape unexpected`), line 108 (`tree: ${envelope.code} for folder "${envelope.folder}"`). The eval-template JS body (everything inside the base64-encoded payload and the frozen template literal) is BYTE-STABLE per FR-016 — these log strings are wrapper-side error-message strings, NOT eval-body content.
- All four header comments (one per source file: `index.ts`, `handler.ts`, `schema.ts`, plus the three `*.test.ts` files) get their narrative-text `tree` references updated to `paths`. The `// Original — no upstream.` opening clause is preserved.
- `src/tools/paths/index.test.ts`: the literal-name expectations on lines 39, 46, 74, 83, 120 update (`"tree"` → `"paths"`). The case (2) test comment that explains "file/path appear in the property set because the folder-scoped refinement forbids them via superRefine, not via schema-shape removal" is REMOVED and replaced with the inverse assertion (file/path are ABSENT from the property set, per FR-001).
- `src/tools/paths/handler.test.ts` and `src/tools/paths/schema.test.ts`: header comments updated; symbol-name renames per R5; literal-name string updates if any.

**Rationale**: Preserves runtime byte-stability per FR-016 while completing the lockstep rename. Log strings are caller-visible (they reach the agent via `UpstreamError.details.message`), so they must reflect the new tool name.

### R7 — Schema-construction rewrite

**Decision**: `src/tools/paths/schema.ts` line 9-16 currently reads:

```typescript
export const treeInputSchema = applyTargetModeRefinementForFolderScoped(
  targetModeBaseSchema.extend({
    folder: z.string().min(1).optional(),
    depth: z.number().int().positive().optional(),
    ext: z.string().min(1).optional(),
    total: z.boolean().optional(),
  }),
);
```

Post-edit it reads:

```typescript
export const pathsInputSchema = applyTargetModeRefinementForFolderScoped(
  targetModeBaseSchema.omit({ file: true, path: true }).extend({
    folder: z.string().min(1).optional(),
    depth: z.number().int().positive().optional(),
    ext: z.string().min(1).optional(),
    total: z.boolean().optional(),
  }),
);
```

**Rationale**: Per the spec clarify decision, surgical inline `.omit({ file: true, path: true })` is applied to the base schema before `.extend(…)`. Because `targetModeBaseSchema` already carries `.strict()`, the returned object from `.omit(…).extend(…)` is also strict — unknown keys (including the now-removed `file` / `path`) raise a `ZodIssueCode.unrecognized_keys` validation error at parse time, BEFORE `superRefine` runs. The `applyTargetModeRefinementForFolderScoped` helper is unchanged; its `file`/`path` clauses are effectively unreachable for the `paths` tool but remain active for the sibling `files` tool (which still uses the unomitted base). SC-011 (sibling no-regress) is satisfied by construction because the helper is untouched.

**Alternatives considered**:
- `.omit()` chained AFTER `.extend()` — rejected because the omit target keys (`file`, `path`) live in the base, not in the extension. Chaining order is `base → omit → extend` for clarity.
- Extracting a new `targetModeFolderScopedBaseSchema` in `target-mode.ts` — rejected at clarify (premature abstraction, one consumer).

### R8 — Description rewrite shape

**Decision**: `PATHS_DESCRIPTION` is rewritten as a single string literal ≤ 512 characters. Structure:
1. **Opening sentence (≤ 120 chars)**: Names the output shape `{ count, paths: string[] }` and characterises `paths` as a flat list. FR-008 / SC-004 controlling.
2. **Trailing-slash note (≤ 80 chars)**: One sentence per FR-009 — "Folder entries end with `/`; file entries do not."
3. **Parameter summary (≤ 250 chars)**: Names all six parameters with one-clause descriptions. FR-012 controlling. Example template: `Required target_mode (specific | active). Optional vault (required in specific mode), folder (defaults to vault root), depth (positive int, unbounded by default), ext (filter to extension), total (return count only).`
4. **Help pointer (≤ 90 chars)**: Per R1 convention. `Call help({ tool_name: "paths" }) for full parameter docs, the inherited limitations, and the error roster.`

The four sections concatenate with single-space joins. Estimated final length: ~ 450-490 chars (well under the 512 cap).

**Rationale**: A four-section structure keeps each section's responsibility crisp and makes the length budget enforceable. The opening-sentence requirement (FR-008 / SC-004) covers the user's "agent reads first 80 chars and gets the right mental model" intent. The parameter summary preserves FR-012's "describe parameters tersely so callers don't always need `help`" intent without bloating into the v0.5.7 per-parameter implementation-detail dump. The help pointer (R1) closes the description so the agent knows where to get the bulk.

**Sample candidate** (draft for /speckit-tasks to refine; ~470 chars):

> `Flat path list under a vault folder (recursive). Returns { count, paths: string[] }; folder entries end with "/", file entries do not. Required target_mode ("specific" | "active"). In specific mode supply vault; in active mode the focused vault is used. Optional folder (defaults to vault root), depth (positive integer; unbounded by default), ext (filter to one extension, e.g. "md"), and total (true returns only the count). Call help({ tool_name: "paths" }) for full parameter docs, inherited limitations, and the error roster.`

The implementation may refine wording; the structure is the contract.

### R9 — `_register-baseline.json` roll-forward mechanic

**Decision**: After the source-tree changes are staged, run `npm run baseline:write` (registered as `scripts/write-register-baseline.ts`) which regenerates `src/tools/_register-baseline.json` from the live registry. The regenerated baseline:
- Removes the `{name: "tree", descriptionFingerprint, schemaFingerprint}` entry at the v0.5.7 position 22 (alphabetical, between `tag` and `write_note`).
- Inserts a new `{name: "paths", descriptionFingerprint, schemaFingerprint}` entry at the new alphabetical position 13 (between `outline` at position 12 and `properties` at position 14).
- Regenerates the description and schema fingerprints from the new `PATHS_DESCRIPTION` (≤ 512 char string) and the new `pathsInputSchema` (omits `file`/`path`).
- Leaves all 18 other tools' fingerprints byte-stable, including the sibling `files` entry (SC-011 verification anchor).

**Rationale**: The roll-forward is a regenerate-and-commit operation per FR-017, not a hand edit. The script's behaviour is established by BI-022. The "all 18 others byte-stable" claim is verifiable by `git diff src/tools/_register-baseline.json` showing only the `tree` removal and `paths` insertion.

### R10 — `src/server.ts` and `src/server.test.ts` edits

**Decision**:
- `src/server.ts` line 31: `import { createTreeTool } from "./tools/tree/index.js";` → `import { createPathsTool } from "./tools/paths/index.js";`. The tools array in `createServer` shifts the entry from its tree-position (alphabetically between `tag` and `write_note`) to the paths-position (alphabetically between `outline` and `properties`). ESLint's `import/order` rule with `alphabetize: asc` enforces the import-line repositioning.
- `src/server.test.ts` lines 42 + 51: the test that asserts the registered name set updates from `["delete", "files", "find_by_property", "help", "links", "move", "obsidian_exec", "outline", "properties", "read", "read_heading", "read_property", "rename", "set_property", "smart_connections_query", "smart_connections_similar", "tag", "tree", "write_note"]` (19 entries) to `["delete", "files", "find_by_property", "help", "links", "move", "obsidian_exec", "outline", "paths", "properties", "read", "read_heading", "read_property", "rename", "set_property", "smart_connections_query", "smart_connections_similar", "tag", "write_note"]` (19 entries — same count; `tree` removed, `paths` inserted at the alphabetical position). The test's verbose description string updates its `'tree'` → `'paths'` mention and its `BI-029` references stay (historical anchors).

**Rationale**: These are the two outside-the-renamed-dir source files that hold a hard-coded reference to the literal `tree` name. Updating them is part of the lockstep rename mechanic. No other source files are affected (the rest of the codebase is registry-driven via the `tools/_register.ts` factory pattern).

### R11 — `docs/tools/tree.md` → `docs/tools/paths.md` content edits

**Decision**: After the `git mv` of the docs file, the in-file content is edited:
- Top-level heading: `# \`tree\`` → `# \`paths\``.
- Nine occurrences of `"name": "tree"` (inside worked-example JSON code blocks at lines 194, 206, 224, 236, 254, 266, 282, 299, and one more) → `"name": "paths"`. The surrounding example payloads (parameter values, expected output shapes, etc.) are byte-stable.
- One paragraph in the Overview section that calls the tool "the fifteenth typed-tool wrap" stays — that's a historical anchor that the architecture doc also retains.
- All other prose, error rosters, inherited-limitations lists, and worked examples are byte-stable.

**Rationale**: The bulk of `docs/tools/tree.md` is the parameter docs, the failure roster, the four worked examples, and the inherited-limitations list — that content is exactly what the new ≤ 512-char description points the caller AT via the `Call help(...)` pointer. Rewriting the docs would defeat the BI's purpose. The minimal in-file edit (heading + worked-example JSON-key updates) is sufficient.

### R12 — Architecture-doc edit specifics

**Decision**: In `.architecture/Obsidian CLI MCP - Architecture.md`, replace each occurrence of the literal `tree` that names the tool with `paths`. The phrases `the tree tool`, `tree's eval-driven`, ``tree``-named, etc., become `the paths tool`, `paths's eval-driven`, etc. Preserve the structural / historical references — the doc may continue to say "the tool added by BI-029" or "the fifteenth typed-tool wrap" because those reference the CLASS of tool at a point in time, not the tool's current name.

**Rationale**: Per R3 above.

### R13 — Test-assertion updates inside the renamed `*.test.ts` files

**Decision**: The following existing-test assertion updates are part of the rename mechanic:

| Test file | Line / case | Pre-edit | Post-edit |
|---|---|---|---|
| `paths/index.test.ts` | line 39, 46 | `expect(tool.descriptor.name).toBe("tree")` and `.toBe(TREE_TOOL_NAME)` | `.toBe("paths")` and `.toBe(PATHS_TOOL_NAME)` |
| `paths/index.test.ts` | case (2) comment + assertion | Comment says "file/path appear in the property set"; assertion loop covers `{target_mode, vault, folder, depth, ext, total}` only | Comment replaced with "file/path are absent from the property set per FR-001"; assertion strengthened to also `expect(Object.hasOwn(props, "file")).toBe(false)` and same for `path` (NEW lines; this is NOT a new test case — it's a tightening of an existing assertion to reflect FR-001) |
| `paths/index.test.ts` | line 74, 83 | `'help({ tool_name: "tree" })'` | `'help({ tool_name: "paths" })'` |
| `paths/index.test.ts` | line 120 | `t.name === "tree"` | `t.name === "paths"` |
| `paths/schema.test.ts` | the "file forbidden" + "path forbidden" tests | Currently expect refinement-layer error message `"file is not allowed for folder-scoped tools"` | Update to expect strict-mode error: `code: "unrecognized_keys"` with `keys: ["file"]` (and same for `path`). This reflects the SC-006 transition |
| `paths/handler.test.ts` | symbol-imports + header comment | `treeInputSchema` import; header narrates `tree` | `pathsInputSchema` import; header narrates `paths` |
| `server.test.ts` | lines 42 + 51 per R10 | as above | as above |

**Rationale**: These are in-place updates to existing tests, not new tests. The user's "no new tests" out-of-scope is preserved; the tests CHANGE because the surface they cover changed. The case (2) tightening is the most architecturally significant — it converts an assertion that previously documented the leak (presence-implicit) into an assertion that documents the fix (absence-explicit). Functionally it COULD be argued as "new" coverage; structurally it's an update to an existing test case's assertions.

### R14 — `_template.ts` file role and edit posture

**Decision**: `src/tools/tree/_template.ts` is renamed to `src/tools/paths/_template.ts` via the directory-level `git mv`. Header comment updated. Body — the frozen JS source string passed to `eval` — is BYTE-STABLE per FR-016 (the eval template's behaviour is part of the runtime contract this BI does not touch).

**Rationale**: `_template.ts` holds the eval-body JS that runs inside `obsidian eval`. Spec FR-016 freezes this body. The only edit is the file's leading `// Original — no upstream.` header where it narrates the tool name.

### R15 — TypeScript / vitest / ESLint typecheck and import-order interactions

**Decision**: After all renames, run:
- `npm run typecheck` — catches any missed symbol rename across the codebase.
- `npm run lint` — catches any missed import-order regression in `src/server.ts` (the `import/order` rule auto-fixes the import-line repositioning, but the pre-fix state still lints fail if `--fix` isn't applied; the implementer applies the fix).
- `npm test` — runs the full vitest suite; the post-rename test files pass with the in-place updates per R13.
- `npm run baseline:write` — regenerates `_register-baseline.json`; the durable test at `_register-baseline.test.ts` passes immediately after.
- `npm run build` — the merge gate.

The post-change `npm run build` succeeds because every TypeScript reference to the old symbols (`createTreeTool`, `TREE_TOOL_NAME`, `treeInputSchema`, etc.) is exhausted by the lockstep rename per R5.

**Rationale**: Standard pre-merge gate sequence per the constitution.

### R16 — `details.code` and `UpstreamError` byte-stability anchor

**Decision**: The handler's three `UpstreamError`-emitting paths preserve their existing `details.code` strings verbatim:
- `FOLDER_NOT_FOUND` (when the eval envelope returns `{ok: false, code: "FOLDER_NOT_FOUND", folder}`)
- `NOT_A_FOLDER` (when the eval envelope returns `{ok: false, code: "NOT_A_FOLDER", folder}`)
- (inherited) `VAULT_NOT_FOUND(reason: "not-open")` from the closed-vault detection module
- (inherited) `VAULT_NOT_FOUND` from the `cli-adapter` 011-R5 inspection on `Vault not found.` plaintext
- (inherited) `ERR_NO_ACTIVE_FILE` from the dispatch-layer classifier on `Error: no active file`

The handler's log-message wrapper strings (per R6) update `"tree:"` prefix to `"paths:"`, but the structured `details.code` values are byte-stable.

**Rationale**: FR-016 byte-stability. The handler's outputs that are observable to the caller (the structured error codes) cannot change per spec.

### R17 — package.json scripts and engines untouched

**Decision**: `package.json` is edited only at the `version` field (`0.5.8 → 0.6.0`). The `scripts` block, `engines.node`, `dependencies`, `devDependencies`, and all other fields are byte-stable.

**Rationale**: No new tooling, no dependency bumps. The `baseline:write` script established by BI-022 is unchanged.

### R18 — README.md / CHANGELOG.md DEFERRED

**Decision**: `README.md` (which lists every typed tool by name) and `CHANGELOG.md` (which would announce the rename) are NOT edited in this BI. Deferred per FR-021 to the next release-prep BI.

**Rationale**: User's explicit out-of-scope statement. The rename ships in code + tests + baseline + docs/tools/paths.md + architecture doc; the consumer-facing README and CHANGELOG announcement follows in a separate pass.

### R19 — `graphify-out/` cache files are auto-regenerated

**Decision**: `src/graphify-out/cache/ast/*.json` files (three of which currently reference `tree`) are NOT edited in this BI. They are AST caches generated by the post-commit `graphify` hook; the hook will regenerate them on the next commit reflecting the post-rename source-tree state.

**Rationale**: These are generated artefacts, not source-of-truth. Editing them by hand would be churn. The post-commit hook (per CLAUDE.md) handles regeneration.

### R20 — Help tool is registry-driven; no edits required

**Decision**: `src/tools/help/handler.ts` and `src/tools/help/schema.ts` are NOT edited. Verified at plan time by `grep -c "tree"` against both files — zero matches.

**Rationale**: The help tool's name-resolution table is generated from the live registry at runtime (it walks `createServer`'s tool array). Renaming `tree` to `paths` in the registry automatically updates the help tool's known-names list. The spec edge case noted this contingency; F5 below ratifies it.

## Plan-stage live findings (codebase probes 2026-05-15)

These findings were gathered during plan synthesis to ratify the spec's assumptions. None drove a spec amendment; all are reported here for traceability.

### F1 — Sibling description-length survey

Probe: `for f in src/tools/{...}/index.ts; do count chars of <NAME>_DESCRIPTION literal; done`

Result:
- `delete`: 233 chars
- `move`: 309 chars
- `read`: 316 chars
- `rename`: 319 chars
- `files`: 987 chars
- `outline`: 1 061 chars
- `properties`: 1 379 chars
- `links`: 1 684 chars
- `tag`: 2 423 chars
- `tree` (v0.5.7): ~2 600 chars

Ratifies the spec's clarify decision to cap at 512 chars: the post-BI-022 renamed tools demonstrate ~300 chars is achievable for 3-parameter surfaces; `paths` (6 parameters) at ~470-490 chars per R8's draft is well within the cap.

### F2 — Help-pointer wording convention

Probe: `grep -oE 'Call help\(\{ tool_name: \\"[^"]+\\" \}\) [^"]+' src/tools/*/index.ts`

Result: Six matches with the convention `Call help({ tool_name: "<name>" }) for full parameter docs, <items>, and the error roster.` See R1 above.

### F3 — Tree-name reference inventory

Probe: `grep -rln '"tree"|TreeInput|TreeOutput|TreeEval|createTreeTool|TREE_TOOL_NAME|TREE_DESCRIPTION|tools/tree' src/ docs/ scripts/`

Result:
- 4 source files inside `src/tools/tree/` (`index.ts`, `handler.ts`, `schema.ts`, `_template.ts`).
- 3 test files inside `src/tools/tree/` (`index.test.ts`, `handler.test.ts`, `schema.test.ts`).
- 2 source files outside the dir: `src/server.ts`, `src/server.test.ts`.
- 1 baseline JSON: `src/tools/_register-baseline.json`.
- 1 docs file: `docs/tools/tree.md`.
- 3 generated graphify caches (NOT source — auto-regenerated per R19).
- ZERO references in any other source/test/doc/config file.

Total edit surface: 12 files (renamed + edited). Plus the architecture doc (one) and `package.json` (one). 14 files touched.

### F4 — `targetModeBaseSchema` shape probe

Probe: `Read src/target-mode/target-mode.ts:1-65`

Result: `targetModeBaseSchema` is a `z.object({ target_mode, vault, file, path }).strict()`. The `.omit({ file: true, path: true })` chain returns a strict ZodObject from which `.extend(…)` can be safely called. Ratifies R7's schema-construction rewrite.

### F5 — Help tool has zero `tree` references

Probe: `grep -c "tree" src/tools/help/handler.ts src/tools/help/schema.ts`

Result: 0 matches in either file. Confirms R20 — the help tool is registry-driven and needs no edits.
