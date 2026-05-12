# Phase 0 — Research: Rename Typed Tools to Match Upstream CLI Subcommand Names

**Branch**: `022-rename-typed-tools` | **Date**: 2026-05-12 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

## Decisions

### R1 — Source-directory rename mechanic

**Decision**: Use `git mv` for each of the five source-directory renames.

```
git mv src/tools/read_note         src/tools/read
git mv src/tools/delete_note       src/tools/delete
git mv src/tools/list_files        src/tools/files
git mv src/tools/write_property    src/tools/set_property
git mv src/tools/rename_note       src/tools/rename
```

**Rationale**: `git mv` is the natural form for path renames. Each rename is then followed in the same commit by:

- A factory-function rename inside the moved `index.ts` (text edit; one identifier).
- Optional `describe(...)` block title updates inside the moved `*.test.ts` files (cosmetic).
- An import-name update inside `src/server.ts`.
- An invariants-map key update inside `src/tools/_register.test.ts`.

Git's similarity detection presents the move as a `rename` in `git diff` / `git log --follow` rather than a "delete A, add B." `git blame -- src/tools/read/handler.ts` continues to walk through the pre-rename history at `src/tools/read_note/handler.ts`.

**Alternatives considered**:

- *Delete-and-create*: discarded — destroys git-blame continuity, which is the only audit trail explaining why each tool's handler body has its current shape. The predecessor BI's commits become detached from the renamed file paths.
- *Symlinks during a deprecation window*: rejected by spec FR-002 and the Q1 lockstep clarification — no aliasing, no transitional state.

---

### R2 — FR-018 baseline JSON format

**Decision**: A single checked-in JSON file at `src/tools/_register-baseline.json` containing an alphabetically-ordered `tools` array of `{ name, descriptionFingerprint, schemaFingerprint }` entries. Both fingerprints are SHA-256 hex digests of canonicalised JSON: keys sorted lexicographically, no extra whitespace, no trailing newline. The `descriptionFingerprint` covers the tool's free-text `description:` string; the `schemaFingerprint` covers the published `inputSchema` JSON Schema object (post-`stripSchemaDescriptions`, post-`zod-to-json-schema`).

```json
{
  "schemaVersion": 1,
  "generatedFromBranch": "022-rename-typed-tools",
  "generatedAt": "2026-05-12",
  "tools": [
    { "name": "delete",            "descriptionFingerprint": "<sha256-hex>", "schemaFingerprint": "<sha256-hex>" },
    { "name": "files",             "descriptionFingerprint": "<sha256-hex>", "schemaFingerprint": "<sha256-hex>" },
    { "name": "find_by_property",  "descriptionFingerprint": "<sha256-hex>", "schemaFingerprint": "<sha256-hex>" },
    { "name": "help",              "descriptionFingerprint": "<sha256-hex>", "schemaFingerprint": "<sha256-hex>" },
    { "name": "obsidian_exec",     "descriptionFingerprint": "<sha256-hex>", "schemaFingerprint": "<sha256-hex>" },
    { "name": "read",              "descriptionFingerprint": "<sha256-hex>", "schemaFingerprint": "<sha256-hex>" },
    { "name": "read_heading",      "descriptionFingerprint": "<sha256-hex>", "schemaFingerprint": "<sha256-hex>" },
    { "name": "read_property",     "descriptionFingerprint": "<sha256-hex>", "schemaFingerprint": "<sha256-hex>" },
    { "name": "rename",            "descriptionFingerprint": "<sha256-hex>", "schemaFingerprint": "<sha256-hex>" },
    { "name": "set_property",      "descriptionFingerprint": "<sha256-hex>", "schemaFingerprint": "<sha256-hex>" },
    { "name": "write_note",        "descriptionFingerprint": "<sha256-hex>", "schemaFingerprint": "<sha256-hex>" }
  ]
}
```

**Rationale**: Storing fingerprints (SHA-256) rather than the full description and inputSchema bodies keeps the baseline file small (~1 KB) and version-control-friendly while still detecting any change to either the description text or the schema shape. The alphabetical ordering is a stable canonicalisation — independent of the `src/server.ts` tools-array order. Storing the description fingerprint separately from the schema fingerprint lets future PR reviews see whether a baseline-rolling commit changed only the description (low-stakes) or also the schema (high-stakes, possibly a Constitution III concern).

The `schemaVersion: 1` field is a forward-compat hook in case future BIs add a field (e.g. `outputSchemaFingerprint`). The `generatedFromBranch` and `generatedAt` fields are informational; the test does NOT assert against them.

**Alternatives considered**:

- *Snapshot the full `tools/list` envelope verbatim*: rejected — the file becomes ~30 KB of nested JSON Schema, painful to diff and noisy to review when an intentional change rolls it forward.
- *Use `expect.toMatchSnapshot()` (vitest's built-in)*: rejected — snapshot files live in a sibling `__snapshots__/` directory which violates the co-location convention; they also auto-regenerate on `vitest run -u`, which weakens the "intentional roll-forward" guarantee.
- *Store names only (no fingerprints)*: rejected — protects against accidental renames but not against accidental schema mutations under an unchanged name (e.g. someone widens a renamed tool's input schema without realising).
- *Use MD5 / CRC32 instead of SHA-256*: rejected — performance is identical at this scale; SHA-256 is the default cryptographic hash available in Node.js without extra deps.

---

### R3 — Doc-file rename mechanic

**Decision**: `git mv docs/tools/<old>.md docs/tools/<new>.md` per file (5 invocations), then in-file body edits in the same commit to update any self-references to the new name.

**Rationale**: Same as R1 — `git mv` preserves history. The body edits are minimal: most per-tool docs reference the tool's own name in the H1 title and a few prose sentences; everything else (input schema, examples, error roster) is name-agnostic.

The renamed doc files MUST preserve the FR-012 "filetype-scope language" carve-out: phrases like "Reads a Markdown note from the vault" stay byte-identical. BI-060 widens those phrases; this BI only renames.

**Alternatives considered**:

- *Delete old + create new under new name*: discarded for the same git-blame reason as R1.

---

### R4 — CHANGELOG migration block shape

**Decision**: Single `## [0.5.0] - 2026-05-12` section atop `CHANGELOG.md`, containing one contiguous "BREAKING: Typed tool renames" subsection that lists all 5 mappings together. The block also documents the two-clause naming convention, the no-aliases stance, the help-tool routing behaviour, and the BI-060 forward reference for the filetype-scope widening that ships separately.

Full block shape locked in [contracts/changelog-migration-block.contract.md](contracts/changelog-migration-block.contract.md).

**Rationale**: Per FR-010, the migration must be "presented together rather than scattered across entries." A single contiguous subsection under one release header is the natural form. Existing CHANGELOG sections (0.4.4, 0.4.3, ...) follow the same shape; the rename release fits naturally above them.

**Alternatives considered**:

- *Five separate `### Changed` entries, one per rename*: rejected — explicitly violates FR-010's "single migration block" requirement.
- *A separate `MIGRATION.md` file*: rejected — adds a new doc surface that callers have to discover. The changelog is where callers already look for version-bump rationale.

---

### R5 — Version bump

**Decision**: `package.json` `version` field bumps from `"0.4.4"` to `"0.5.0"`.

**Rationale**: Per FR-011 and SC-005, this is a MINOR bump (MAJOR unchanged at `0`, MINOR `4 → 5`, PATCH `4 → 0`). Pre-v1.0 semver semantics permit MINOR-level breaking changes; the rename is a breaking change but not a MAJOR-level structural rework.

**Alternatives considered**:

- *PATCH bump `0.4.4 → 0.4.5`*: rejected — understates the breaking change. Callers reading `0.4.x` patch increments do not expect tool-name changes.
- *MAJOR bump `0.4.4 → 1.0.0`*: rejected — the rename does not warrant a v1.0 line crossing. v1.0 implies a stability guarantee that this codebase is not yet ready to make (per the spec's "Pre-v1.0 window" assumption).

---

### R6 — `src/server.ts` edit shape

**Decision**: Five sequential edits to the import block (rename each `createXxxNoteTool` → `createXxxTool`; update path `tools/read_note/index.js` → `tools/read/index.js`), then re-sort both the import block and the `tools` array to alphabetical-by-factory-name.

**Post-rename alphabetical order** (factory-name-sorted; matches the existing convention):

```typescript
import { createDeleteTool }         from "./tools/delete/index.js";
import { createFilesTool }          from "./tools/files/index.js";
import { createFindByPropertyTool } from "./tools/find_by_property/index.js";
import { createHelpTool }           from "./tools/help/index.js";
import { createObsidianExecTool }   from "./tools/obsidian_exec/index.js";
import { createReadHeadingTool }    from "./tools/read_heading/index.js";
import { createReadPropertyTool }   from "./tools/read_property/index.js";
import { createReadTool }           from "./tools/read/index.js";
import { createRenameTool }         from "./tools/rename/index.js";
import { createSetPropertyTool }    from "./tools/set_property/index.js";
import { createWriteNoteTool }      from "./tools/write_note/index.js";

const tools: RegisteredTool[] = [
  createDeleteTool({ logger, queue }),
  createFilesTool({ logger, queue }),
  createFindByPropertyTool({ logger, queue }),
  createHelpTool(),
  createObsidianExecTool({ logger, queue }),
  createReadHeadingTool({ logger, queue }),
  createReadPropertyTool({ logger, queue }),
  createReadTool({ logger, queue }),
  createRenameTool({ logger, queue }),
  createSetPropertyTool({ logger, queue }),
  createWriteNoteTool({ logger, queue, vaultRegistry }),
];
```

**Rationale**: Alphabetical-by-factory-name is the existing convention (current code is sorted this way). Maintaining the sort keeps PR diffs grep-friendly. The sort key is the factory function identifier, not the registered tool name; both happen to be alphabetically-correlated post-rename so a single sort satisfies both.

**Alternatives considered**:

- *Sort by registered tool name instead*: rejected — would invert the existing convention. Future readers expect factory-name ordering.
- *Insert each renamed tool at its old position*: rejected — leaves the array unsorted post-rename (e.g. `createReadTool` would land between `createReadPropertyTool` and `createWriteNoteTool` which breaks the alphabetical pattern).

---

### R7 — `_register.test.ts` invariants-map sweep

**Decision**: Rename five keys in the `invariants` object literal at [src/tools/_register.test.ts:253-326](../../src/tools/_register.test.ts#L253-L326). Body of each invariant entry (properties, required, additionalProperties) is byte-identical pre vs post rename — only the key name changes. The derived `liveRegistryToolNames` array auto-updates because it walks `Object.keys(invariants)`.

**Per-key changes** (alphabetical, post-rename):

| Old key | New key | Body changes |
|---------|---------|--------------|
| `read_note` | `read` | none |
| `delete_note` | `delete` | none |
| `list_files` | `files` | none |
| `write_property` | `set_property` | none |
| `rename_note` | `rename` | none |

**Rationale**: The drift detector keys-by-name and the keying is the ONLY name-dependent part of the file. Schema invariants are intrinsic to the schema, not the registered name; they survive the rename unchanged. The `it.each(liveRegistryToolNames)` test rows re-derive automatically from the renamed keys.

**Alternatives considered**:

- *Add new entries with new names and leave old entries in place during a "transition"*: rejected by Q1 lockstep clarification.

---

### R8 — README + docs/tools/index.md cross-reference sweep

**Decision**: Per-file text sweep in `README.md` and `docs/tools/index.md` replacing each retired name with its new name. After the sweep, run `grep -E '(read_note|delete_note|list_files|write_property|rename_note)' README.md docs/tools/index.md` and confirm zero matches.

The sweep is **mechanical**: replace the literal token (case-sensitive, byte-equality). Surrounding prose (tool descriptions, "Markdown note" filetype-scope language) is preserved per the BI-060 split documented in spec's Out of Scope.

**Rationale**: Both files are tool catalogues, not tool descriptions — the retired names appear exclusively as entry labels and short cross-references. A literal token replace cleanly handles every occurrence.

**Alternatives considered**:

- *Manual word-by-word edit pass*: rejected — error-prone; missed references would fail FR-012 / SC-007.
- *Regex with word boundaries*: equivalent outcome, but unnecessary at this scale (the retired names are 9-13 chars and don't appear as substrings of unrelated words).

---

### R9 — CLAUDE.md active-narrative top-block rewrite

**Decision**: Rewrite the active-narrative block between `<!-- SPECKIT START -->` and the start of the first predecessor narrative ("Predecessor feature narrative (021-rename-note)") to describe **022-rename-typed-tools** as the active feature. The block:

- Opens with "Active feature: **022-rename-typed-tools** — the rename-sweep BI on top of features 003–021."
- Lists the five renames in punch-list form (old → new) with the naming-convention rationale.
- References the three clarifications (Q1 lockstep, Q2 durable test, Q3 narrow rewrite scope).
- Calls out the FR-018 durable registry-stability test as the visible architectural addition.
- Points at [specs/022-rename-typed-tools/plan.md](specs/022-rename-typed-tools/plan.md) and the supporting artifacts.

The 021..015 predecessor narrative blocks underneath remain byte-identical (FR-020 narrow-scope exemption). When 023 ships, its `/speckit-plan` step will roll the 022 block into a "Predecessor feature narrative (022-rename-typed-tools)" section beneath the new 023 active block, preserving the same retain-vs-rewrite split.

**Rationale**: CLAUDE.md's active-narrative block is read in every conversation as part of the auto-loaded project context. A stale block (e.g. one that still references `rename_note` as the active feature) would confuse downstream assistants. Per Q3 the rewrite is in scope; per spec's edge-case section the rewrite uses new names.

**Alternatives considered**:

- *Leave CLAUDE.md untouched and let 023 update it*: rejected — Q3 explicitly puts CLAUDE.md's active-narrative top block in scope, and the active block describes the *current* feature. Letting it lag by one release contradicts that semantic.

---

### R10 — Test execution + baseline capture timing

**Decision**: Baseline capture happens in a dedicated commit on the rename branch, immediately after T0 and before T001..T005. The baseline JSON is computed by running the existing test suite (which exercises `listToolsViaRegistry()` via the drift detector) and dumping the post-rename registry's fingerprints. The FR-018 test (which loads the baseline and compares against the live registry) is added in a separate commit at the end of the branch — after the renames stabilise.

**Two-phase capture** during /speckit-implement:

1. **Phase A (pre-rename baseline, optional)**: Run `npm test` on a checkout of `main` (pre-022) and dump the pre-rename fingerprints to a scratch file. Used purely as a witness — confirms our understanding of what the registry looks like before the BI runs.
2. **Phase B (post-rename baseline, mandatory)**: After T001..T010 land, run `npm test` and dump the post-rename fingerprints. Check the resulting JSON in as `src/tools/_register-baseline.json` in the same commit as the FR-018 test. The FR-018 test then passes against its own baseline.

**Rationale**: Capturing the baseline AFTER the renames stabilise avoids checking in a baseline that becomes immediately stale. The pre-rename baseline (Phase A) is informational only — it gives `/speckit-implement` a clear "before" snapshot to compare against in the implementation commit messages, but is not checked in.

The post-rename baseline is the durable artifact. The "tamper-test" sub-scenario in [quickstart.md](quickstart.md) Q-12 verifies that mutating either the baseline or the registry causes the FR-018 test to fail with a clear deviation-named message.

**Alternatives considered**:

- *Capture baseline in T0 and freeze it before T001..T005 run*: rejected — the registry mutates during T001..T005 (new names added, old names removed), so a T0 baseline would intentionally diverge from the live registry mid-branch. The FR-018 test would fail at every intermediate commit. Capturing at branch tip avoids the mid-branch noise.
- *Generate baseline at test runtime instead of checking it in*: rejected — defeats the entire point of FR-018. A runtime-generated baseline cannot detect accidental renames because it always matches the registry by construction.

---

## NEEDS CLARIFICATION resolution

Zero markers remained at the end of /speckit-clarify (3 Q&A locked at spec stage). No additional clarifications surfaced during Phase 0; all ten decisions above are fully resolved within the scope set by the spec and the existing codebase.

## Live-CLI / external-system findings

**None applicable.** This BI is a wrapper-side surface rename with no upstream CLI interaction in the implementation path. The `cli-adapter`'s contract with the Obsidian binary is unchanged; argv assembly, exit-code classification, and stdout parsing remain byte-identical for every renamed tool. No `T0` live-CLI probe is needed at /speckit-implement time.

## Deferred to /speckit-implement T0

**None.** This BI has no live-CLI characterisation deferrals (contrast with 021's 11-case T0 roster). The implementation is mechanical: rename in `git`, edit identifiers in source, re-run the test suite, capture the baseline, ship. The /speckit-tasks generation does not need a `T0xx` bundled task.
