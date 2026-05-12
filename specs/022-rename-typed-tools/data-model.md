# Phase 1 — Data Model: Rename Typed Tools to Match Upstream CLI Subcommand Names

**Branch**: `022-rename-typed-tools` | **Date**: 2026-05-12 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

This document captures the canonical data tables for the rename sweep: the punch-list, the alphabetical-sort orderings, the baseline JSON shape, and the per-tool invariants confirmation. There are no domain-entity diagrams in the usual sense — this BI is a wrapper-side surface rename — so the "data model" here is the **shape of the renames themselves** plus the data structures the durable test reads.

## 1. Rename punch-list (canonical)

| # | Old tool name | Old src dir | Old factory function | Old doc file | → | New tool name | New src dir | New factory function | New doc file | Naming-convention clause |
|---|---------------|-------------|----------------------|--------------|---|---------------|-------------|----------------------|--------------|--------------------------|
| 1 | `read_note` | `src/tools/read_note/` | `createReadNoteTool` | `docs/tools/read_note.md` | → | `read` | `src/tools/read/` | `createReadTool` | `docs/tools/read.md` | FR-003 (single-word verbatim — upstream `read`) |
| 2 | `delete_note` | `src/tools/delete_note/` | `createDeleteNoteTool` | `docs/tools/delete_note.md` | → | `delete` | `src/tools/delete/` | `createDeleteTool` | `docs/tools/delete.md` | FR-003 (single-word verbatim — upstream `delete`) |
| 3 | `list_files` | `src/tools/list_files/` | `createListFilesTool` | `docs/tools/list_files.md` | → | `files` | `src/tools/files/` | `createFilesTool` | `docs/tools/files.md` | FR-003 (single-word verbatim — upstream `files`; the wrapper-invented `list_` prefix drops) |
| 4 | `write_property` | `src/tools/write_property/` | `createWritePropertyTool` | `docs/tools/write_property.md` | → | `set_property` | `src/tools/set_property/` | `createSetPropertyTool` | `docs/tools/set_property.md` | FR-004 (`namespace:action` reversal — upstream `property:set` → `set_property`) |
| 5 | `rename_note` | `src/tools/rename_note/` | `createRenameNoteTool` | `docs/tools/rename_note.md` | → | `rename` | `src/tools/rename/` | `createRenameTool` | `docs/tools/rename.md` | FR-003 (single-word verbatim — upstream `rename`) |

Co-located test files (`schema.test.ts`, `handler.test.ts`, `index.test.ts`) migrate with their parent directories — they are NOT enumerated as separate rows because the dir-rename carries them.

## 2. `src/server.ts` import block — alphabetical ordering

### Pre-rename (current main, factory-name-sorted)

```typescript
import { createDeleteNoteTool }     from "./tools/delete_note/index.js";
import { createFindByPropertyTool } from "./tools/find_by_property/index.js";
import { createHelpTool }           from "./tools/help/index.js";
import { createListFilesTool }      from "./tools/list_files/index.js";
import { createObsidianExecTool }   from "./tools/obsidian_exec/index.js";
import { createReadHeadingTool }    from "./tools/read_heading/index.js";
import { createReadNoteTool }       from "./tools/read_note/index.js";
import { createReadPropertyTool }   from "./tools/read_property/index.js";
import { createRenameNoteTool }     from "./tools/rename_note/index.js";
import { createWriteNoteTool }      from "./tools/write_note/index.js";
import { createWritePropertyTool }  from "./tools/write_property/index.js";
```

### Post-rename (factory-name-sorted; re-sort required)

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
```

Movement summary:
- `createDeleteTool` stays at row 1 (was `createDeleteNoteTool`).
- `createFilesTool` enters at row 2 (was `createListFilesTool` at row 4 — `F < L` moves it up two rows).
- `createReadTool` enters between `createReadPropertyTool` and `createRenameTool` (alphabetical: `createReadH... < createReadP... < createReadT...`). Was `createReadNoteTool` at row 7; the new position is row 8.
- `createRenameTool` stays at the same logical position relative to its alphabetical neighbours (was `createRenameNoteTool` at row 9; new position row 9, neighbour names change).
- `createSetPropertyTool` enters at row 10 (was `createWritePropertyTool` at row 11 — `S < W` moves it up one row).
- `createWriteNoteTool` stays at row 11 alphabetically (was row 10; the W's deflate by one when `createWritePropertyTool` leaves the W block).

## 3. `src/server.ts` tools array — alphabetical ordering

### Pre-rename

```typescript
const tools: RegisteredTool[] = [
  createDeleteNoteTool({ logger, queue }),
  createFindByPropertyTool({ logger, queue }),
  createHelpTool(),
  createListFilesTool({ logger, queue }),
  createObsidianExecTool({ logger, queue }),
  createReadHeadingTool({ logger, queue }),
  createReadNoteTool({ logger, queue }),
  createReadPropertyTool({ logger, queue }),
  createRenameNoteTool({ logger, queue }),
  createWriteNoteTool({ logger, queue, vaultRegistry }),
  createWritePropertyTool({ logger, queue }),
];
```

### Post-rename

```typescript
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

The array order parallels the import-block order exactly (factory-name-sorted). `createWriteNoteTool` keeps its `vaultRegistry` dependency injection unchanged.

## 4. `src/tools/_register.test.ts` invariants-map — alphabetical ordering

### Pre-rename (key-by-registered-name; sort = arbitrary in source but logically alphabetical)

The current source has the invariants object literal authored in an alphabetical-by-key order, with `synthetic_pattern_a` appended last (deliberately, because it is a fixture, not a live tool). The pre-rename keys:

```
read_note, write_note, delete_note, read_heading, read_property, rename_note,
find_by_property, write_property, list_files, obsidian_exec, help, synthetic_pattern_a
```

(Source order at `_register.test.ts:253-326` actually puts them in this order, which is NOT strictly alphabetical — `write_note` appears second. Post-rename we keep the SAME source order rather than alphabetising, because reordering creates a misleading diff. The renames are key-rename-only edits.)

### Post-rename (key renames in place; same source order)

```
read, write_note, delete, read_heading, read_property, rename,
find_by_property, set_property, files, obsidian_exec, help, synthetic_pattern_a
```

Each rename is a single-key edit in the object literal. The per-entry invariant body (`type`, `properties_equals_set`, `required_equals`, `additionalProperties`) is **byte-identical** pre vs post rename for every renamed entry — see Section 6 below.

## 5. Baseline JSON schema (`src/tools/_register-baseline.json`)

### Schema (informal)

```typescript
type RegisterBaseline = {
  schemaVersion: 1;
  generatedFromBranch: string;   // informational; not asserted by FR-018 test
  generatedAt: string;           // informational; ISO date
  tools: Array<{
    name: string;                                // registered tool name
    descriptionFingerprint: string;              // SHA-256 hex of canonicalised description string
    schemaFingerprint: string;                   // SHA-256 hex of canonicalised inputSchema JSON Schema object
  }>;
};
```

### Canonicalisation rule

For each tool's published descriptor `{ name, description, inputSchema }`:

- **`descriptionFingerprint`** = `SHA-256(description as UTF-8 bytes)` rendered as lowercase hex.
- **`schemaFingerprint`** = `SHA-256(canonicalJSON(inputSchema))` rendered as lowercase hex, where `canonicalJSON(x)` is:
  - Object keys sorted lexicographically at every depth.
  - No whitespace between tokens.
  - Strings encoded as JSON strings (RFC 8259); booleans / numbers / null in their JSON-literal form.
  - Arrays in their original order (arrays are positional in JSON; we don't re-sort them).
  - No trailing newline.

### Worked post-rename example (truncated — fingerprints will be real SHA-256 hex at /speckit-implement time)

```json
{
  "schemaVersion": 1,
  "generatedFromBranch": "022-rename-typed-tools",
  "generatedAt": "2026-05-12",
  "tools": [
    { "name": "delete",            "descriptionFingerprint": "...", "schemaFingerprint": "..." },
    { "name": "files",             "descriptionFingerprint": "...", "schemaFingerprint": "..." },
    { "name": "find_by_property",  "descriptionFingerprint": "...", "schemaFingerprint": "..." },
    { "name": "help",              "descriptionFingerprint": "...", "schemaFingerprint": "..." },
    { "name": "obsidian_exec",     "descriptionFingerprint": "...", "schemaFingerprint": "..." },
    { "name": "read",              "descriptionFingerprint": "...", "schemaFingerprint": "..." },
    { "name": "read_heading",      "descriptionFingerprint": "...", "schemaFingerprint": "..." },
    { "name": "read_property",     "descriptionFingerprint": "...", "schemaFingerprint": "..." },
    { "name": "rename",            "descriptionFingerprint": "...", "schemaFingerprint": "..." },
    { "name": "set_property",      "descriptionFingerprint": "...", "schemaFingerprint": "..." },
    { "name": "write_note",        "descriptionFingerprint": "...", "schemaFingerprint": "..." }
  ]
}
```

The 11-tool count is the live registry minus `synthetic_pattern_a` (which is a test fixture, not a registered tool).

## 6. Per-tool invariants confirmation (pre = post)

For each of the five renamed tools, the published `inputSchema`'s `{ type, properties_equals_set, required_equals, additionalProperties }` triple is **byte-identical** pre vs post rename. The invariants table from `src/tools/_register.test.ts:253-326` is reproduced here for the five renamed tools as the pre-rename anchor; post-rename, the same body sits under the new key.

| Renamed tool | `type` | `properties_equals_set` | `required_equals` | `additionalProperties` |
|--------------|--------|--------------------------|-------------------|------------------------|
| `read` (was `read_note`) | `"object"` | `["target_mode", "vault", "file", "path"]` | `["target_mode"]` | `false` |
| `delete` (was `delete_note`) | `"object"` | `["target_mode", "vault", "file", "path", "permanent"]` | `["target_mode"]` | `false` |
| `files` (was `list_files`) | `"object"` | `["target_mode", "vault", "file", "path", "folder", "ext", "total"]` | `["target_mode"]` | `false` |
| `set_property` (was `write_property`) | `"object"` | `["target_mode", "vault", "file", "path", "name", "value", "type"]` | `["target_mode", "name", "value"]` | `false` |
| `rename` (was `rename_note`) | `"object"` | `["target_mode", "vault", "file", "path", "name"]` | `["target_mode", "name"]` | `false` |

This table is the structural justification for the spec's FR-005, FR-006, FR-007, FR-016, and SC-010 — the renamed tools accept and emit byte-identical schemas under their new names.

## 7. CLAUDE.md active-narrative top-block outline

The block between `<!-- SPECKIT START -->` and the start of the first predecessor narrative (`## Predecessor feature narrative (021-rename-note)`) is rewritten to describe 022. Outline:

```text
Active feature: 022-rename-typed-tools — surface-rename sweep aligning
five typed tools to upstream CLI subcommand names. Single-release MINOR
bump (0.4.4 → 0.5.0). No deprecation aliases.

PUNCH-LIST (5 renames):
- read_note → read (single-word verbatim)
- delete_note → delete
- list_files → files
- write_property → set_property (namespace:action reversal)
- rename_note → rename

LOCKED at clarification stage 2026-05-12:
- Q1 (lockstep): source dirs + factory functions rename together with
  the registered name.
- Q2 (durable test): registry-stability snapshot at
  src/tools/_register-baseline.json, baseline rolls forward in every
  future BI that intentionally adds/removes/renames a tool.
- Q3 (narrow sweep): README.md, docs/tools/*.md, and this CLAUDE.md
  active-narrative block only. ADRs / architecture / CONTRIBUTING /
  source-code comments NOT swept; predecessor specs preserved.

ARCHITECTURAL ADDITION (FR-018):
- src/tools/_register-baseline.json — checked-in JSON with per-tool
  description + schema fingerprints. Future BIs that change the
  registry must roll the baseline forward in the same commit. The
  durable test catches accidental renames anywhere in the codebase
  before merge.

References:
- specs/022-rename-typed-tools/spec.md
- specs/022-rename-typed-tools/plan.md
- specs/022-rename-typed-tools/research.md
- specs/022-rename-typed-tools/data-model.md
- specs/022-rename-typed-tools/quickstart.md
- specs/022-rename-typed-tools/contracts/

Predecessor narratives (021..015) retained below unchanged.
```

The actual block text written into CLAUDE.md at /speckit-implement time will be in normal prose (not the indented outline form above), matching the predecessor 021 narrative's voice and length.

## 8. Test inventory delta

This BI's test changes:

| Test category | Pre-rename count | Post-rename count | Net delta |
|---------------|------------------|-------------------|-----------|
| `src/tools/read_note/*.test.ts` | ~ existing count | (renamed to `read/`; same count) | 0 net |
| `src/tools/delete_note/*.test.ts` | existing count | (renamed to `delete/`; same count) | 0 net |
| `src/tools/list_files/*.test.ts` | existing count | (renamed to `files/`; same count) | 0 net |
| `src/tools/write_property/*.test.ts` | existing count | (renamed to `set_property/`; same count) | 0 net |
| `src/tools/rename_note/*.test.ts` | existing count | (renamed to `rename/`; same count) | 0 net |
| `src/tools/_register.test.ts` invariants drift detector | existing | existing + 5 key renames | 0 net cases (re-keyed) |
| `src/tools/_register.test.ts` baseline-stability tests | 0 | 3 new cases (matches, name-tamper-fails, fingerprint-tamper-fails) | +3 cases |

**Total net test additions: 3** (the FR-018 baseline-stability cases). All other test counts are unchanged — assertions migrate with their files.
