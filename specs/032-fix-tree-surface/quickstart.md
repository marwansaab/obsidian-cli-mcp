# Quickstart Verification — Fix Tree Tool Surface

**Feature**: 032-fix-tree-surface | **Date**: 2026-05-15

This document maps each Success Criterion (SC-001..SC-011) to a verification scenario (Q-1..Q-N) that the implementer / reviewer runs to validate the BI is complete. All scenarios are CI-runnable; none require T0 manual probes against a real Obsidian CLI binary or a real vault. The BI is description-and-schema surface only — no runtime-behaviour changes — so no live-CLI verification is needed.

## CI verification scenarios

### Q-1 — Description length cap (SC-001 / FR-011)

**Steps**:
1. Open `src/tools/paths/index.ts`.
2. Read the `PATHS_DESCRIPTION` literal.
3. In a JavaScript or TypeScript REPL, evaluate `PATHS_DESCRIPTION.length`.

**Pass criterion**: The value is ≤ 512.

**Alternative check (one-liner)**: `node -e "import('./src/tools/paths/index.js').then(m => console.log(m.PATHS_DESCRIPTION.length))"` after `npm run build`. Print value MUST be ≤ 512.

### Q-2 — Description has zero internal artefacts (SC-002 / FR-005, FR-006)

**Steps**:
1. Grep `PATHS_DESCRIPTION` against the regex set from the description-quality contract:
   - `\b(FR|BI|ADR|SC|TC|US)-\d+\b`
   - `\b[FQR]-\d+[a-z]?\b`
   - `\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth) typed-tool wrap\b`

**Pass criterion**: Zero matches against each regex.

**Command**: `grep -oE '\b(FR|BI|ADR|SC|TC|US)-[0-9]+\b' src/tools/paths/index.ts | head -1` — empty output expected.

### Q-3 — Description has zero internal-identifier substrings (SC-003 / FR-007)

**Steps**:
1. Search `PATHS_DESCRIPTION` for literal substrings: `_eval-vault-closed-detection`, `targetModeBaseSchema`, `applyTargetModeRefinementForFolderScoped`.

**Pass criterion**: Zero matches.

**Command**: `grep -F -e "_eval-vault-closed-detection" -e "targetModeBaseSchema" -e "applyTargetModeRefinementForFolderScoped" src/tools/paths/index.ts` — empty output expected.

### Q-4 — First 80 chars name the output as flat (SC-004 / FR-008)

**Steps**:
1. Read `PATHS_DESCRIPTION` first 80 characters.
2. Confirm BOTH the word `paths` and a flat-output synonym (`flat`, `non-nested`, `single-level`, `array`, etc.) appear.

**Pass criterion**: Both conditions satisfied.

**Command**: `node -e "import('./src/tools/paths/index.js').then(m => { const lead = m.PATHS_DESCRIPTION.slice(0, 80); console.log(lead); console.log('paths?', /paths/i.test(lead), 'flat?', /flat|non-nested|single-level|array/i.test(lead)); })"`

### Q-5 — Published `inputSchema.properties` keys equal the six-key set (SC-005 / FR-001, FR-004)

**Steps**:
1. After `npm run build`, run `node -e "import('./src/tools/paths/index.js').then(m => { const tool = m.createPathsTool({ logger: { ... }, queue: ..., spawnFn: ... }); console.log(Object.keys(tool.descriptor.inputSchema.properties).sort()); })"` (or equivalent).

**Pass criterion**: Output is `["depth","ext","folder","target_mode","total","vault"]` exactly (six entries; no `file`; no `path`).

**Alternative (faster)**: Read `src/tools/paths/schema.ts` and verify the `pathsInputSchema` construction includes `.omit({ file: true, path: true })` and `.extend(…)` for the six fields. The schema-shape contract pins this.

### Q-6 — Schema rejects `path` with strict-mode error, not refinement error (SC-006 / FR-002)

**Steps**:
1. Construct an input `{ target_mode: "specific", vault: "X", path: "Y/" }`.
2. Run `pathsInputSchema.safeParse(input)`.
3. Inspect `result.error.issues`.

**Pass criterion**: The `issues` array contains one entry with `code: "unrecognized_keys"`, `keys: ["path"]`, `path: []`. The message does NOT say "path is not allowed for folder-scoped tools" (the refinement-layer message).

**Alternative**: Construct `{ target_mode: "specific", vault: "X", folder: "Y" }` and verify it parses successfully.

### Q-7 — No tool with `name === "tree"` in `tools/list` (SC-007 / FR-013, FR-014)

**Steps**:
1. After `npm run build`, start the server and connect a client.
2. Issue `tools/list`.
3. Enumerate the response's `tools[].name` values.

**Pass criterion**: No entry has `name === "tree"`. Exactly one entry has `name === "paths"`. The total count is 19.

**Alternative (test-level)**: `src/server.test.ts` line 51 already encodes this expectation — `npm test` includes the assertion. Post-edit, the array is `["delete", "files", "find_by_property", "help", "links", "move", "obsidian_exec", "outline", "paths", "properties", "read", "read_heading", "read_property", "rename", "set_property", "smart_connections_query", "smart_connections_similar", "tag", "write_note"]`.

### Q-8 — `npm test` exit code is 0 (SC-008 / FR-018)

**Steps**:
1. Run `npm test` (or `npm run test:run` if the project has a CI-targeted alias).

**Pass criterion**: Exit code 0. No vitest failure messages. Test-count delta vs v0.5.7 baseline ≤ 0 (no new tests added; existing tests pass with in-place assertion updates per FR-018).

### Q-9 — `npm run baseline:write` produces a coherent baseline (SC-009 / FR-017)

**Steps**:
1. After the source-tree edits, run `npm run baseline:write`.
2. Inspect the regenerated `src/tools/_register-baseline.json`.
3. Confirm:
   - A `{name: "paths", descriptionFingerprint, schemaFingerprint}` entry exists.
   - No `{name: "tree", ...}` entry exists.
   - The 18 other entries (everything but the renamed one) have byte-stable fingerprints relative to v0.5.7.

**Pass criterion**: All three confirmed.
4. Run `npm test` again; the durable test at `src/tools/_register-baseline.test.ts` passes (it walks the live registry and compares fingerprints to the baseline JSON).

**Alternative one-liner for the "18 byte-stable" check**: `git diff src/tools/_register-baseline.json` shows only the `tree`-entry removal and the `paths`-entry insertion — no other lines change.

### Q-10 — `docs/tools/paths.md` exists and the docs-presence test passes (SC-010 / FR-019)

**Steps**:
1. Confirm `docs/tools/paths.md` exists.
2. Confirm `docs/tools/tree.md` does NOT exist (the file was moved, not duplicated).
3. Confirm `git log --follow docs/tools/paths.md` returns commit history that traces back to `docs/tools/tree.md` (the `git mv` operation surfaces in the log).
4. Open `docs/tools/paths.md` and confirm:
   - Top-level heading is `# \`paths\``.
   - Nine `"name": "tree"` JSON-key occurrences in worked-example code blocks have been replaced with `"name": "paths"`.
5. Run the existing docs-file-presence test at `src/tools/paths/index.test.ts` describe block `docs/tools/paths.md exists and is non-stub`.

**Pass criterion**: All five confirmed.

### Q-11 — Sibling `files` tool is byte-stable (SC-011)

**Steps**:
1. Compare the v0.5.7 `_register-baseline.json` entry for `files` with the post-edit one.
2. Confirm `descriptionFingerprint` and `schemaFingerprint` are byte-identical pre vs post.

**Pass criterion**: Both fingerprints byte-stable.

**Alternative**: `git diff` on the relevant baseline JSON lines shows zero changes for the `files` entry. The `src/tools/files/schema.ts` file is not in the modified-files list.

### Q-12 — Build, typecheck, lint all pass

**Steps**:
1. `npm run typecheck` — exit code 0.
2. `npm run lint` — exit code 0, zero warnings.
3. `npm run build` — exit code 0.

**Pass criterion**: All three exit code 0.

**Note**: The `import/order` ESLint rule auto-fixes the import-line position shift in `src/server.ts`. If the implementer forgets to run `eslint --fix`, the lint gate flags it.

### Q-13 — Version bump applied (R2)

**Steps**:
1. Open `package.json`.
2. Confirm `"version": "0.6.0"`.

**Pass criterion**: Confirmed.

### Q-14 — Architecture doc reflects rename (R3)

**Steps**:
1. Open `.architecture/Obsidian CLI MCP - Architecture.md`.
2. Grep for references to the tool: every occurrence of `the tree tool`, `tree's eval-driven`, etc. is updated to use `paths`.
3. Confirm any "fifteenth typed-tool wrap" ordinal anchor stays as-is (historical reference).

**Pass criterion**: All tool-name references updated; historical anchors preserved.

## Coverage map (SC → Q)

| Success criterion | Verification scenario |
|---|---|
| SC-001 (≤ 512 chars) | Q-1 |
| SC-002 (zero internal-ref regex matches) | Q-2 |
| SC-003 (zero internal-identifier substrings) | Q-3 |
| SC-004 (first 80 chars names flat output) | Q-4 |
| SC-005 (six-key property set; no file/path) | Q-5 |
| SC-006 (strict-mode rejection vs refinement) | Q-6 |
| SC-007 (no `tree`, exactly one `paths`) | Q-7 |
| SC-008 (`npm test` exit 0) | Q-8 |
| SC-009 (baseline roll-forward coherent) | Q-9 |
| SC-010 (`docs/tools/paths.md` with `git mv` history) | Q-10 |
| SC-011 (sibling `files` byte-stable) | Q-11 |
| (R2 release-mechanic) | Q-13 |
| (R3 architecture-doc roll-forward) | Q-14 |
| (Build / typecheck / lint gates) | Q-12 |

## Manual / T0 verification

**None required.** This BI is description-and-schema surface only; no runtime-behaviour changes; no live-CLI probing needed. The renamed `paths` tool's runtime correctness was established by BI-029's T0 probes; FR-016 byte-stability inherits those probes intact.
