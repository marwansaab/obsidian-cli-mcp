# Data Model: Add Context Search

**Branch**: `035-context-search`
**Date**: 2026-05-17
**Phase**: 1 (Design & Contracts)

Documents the entity shapes, zod schemas, wire shapes, and test inventory for the new `context_search` tool. The zod schemas listed here ARE the single source of truth (Constitution Principle III); the `contracts/` siblings render the same shapes for human review but do not re-declare them.

## Entities

### `ContextSearchInput` (boundary input shape)

| Field | Type | Required | Constraints | Notes |
|-------|------|----------|-------------|-------|
| `query` | `string` | yes | length 1..1000 chars; rejected if whitespace-only post-trim (superRefine) | Phrase match — single literal substring; internal whitespace preserved verbatim. FR-001, FR-008. |
| `folder` | `string` | no | length ≥ 1 if present | Vault-relative path prefix. Leading + trailing `/` stripped wrapper-side (FR-004 / R6). FR-003. |
| `limit` | `number` | no | integer in inclusive range `1..10000` | Caps the response `matches` array (line-count, post-flatten). Implicit cap 1000 when omitted. FR-005, FR-006, FR-010. |
| `case_sensitive` | `boolean` | no | — | Defaults to `false` (ASCII lower-fold case-insensitive). When `true`, sets upstream `case` flag. FR-007. |
| `vault` | `string` | no | length ≥ 1 if present | Implicit-active on omit (project-wide vault-scoped query convention). FR-015. |

The schema is `.strict()` — unknown keys reject (FR-009).

### `ContextSearchOutput` (success boundary shape)

| Field | Type | Required | Constraints | Notes |
|-------|------|----------|-------------|-------|
| `count` | `number` | yes | integer ≥ 0; equals `matches.length` (post-cap, post-strip, post-sort) | FR-002. Refine asserts `count === matches.length` at the boundary. |
| `matches` | `Array<{path, line, text}>` | yes | each entry shaped per `ContextSearchMatch` below | Empty array on zero-match (no error). FR-002. |
| `truncated` | `true` literal | no | only present when the underlying pre-cap match set exceeded the applied cap | Absent === false. `z.literal(true).optional()` semantic. FR-011. |

The output schema is `.strict()` — extra fields reject. Locator inputs are never echoed (FR-021; memory note: read tools don't echo locator).

### `ContextSearchMatch` (per-entry shape inside `matches`)

| Field | Type | Required | Constraints | Notes |
|-------|------|----------|-------------|-------|
| `path` | `string` | yes | length ≥ 1; vault-relative; forward-slash separators | Inherited from upstream wire shape's `file` field. |
| `line` | `number` | yes | integer ≥ 1 | 1-based line number (FR-002). |
| `text` | `string` | yes | length ≤ 501 chars (500 + optional `…` U+2026 marker); single trailing `\r` stripped before cap measurement | FR-012. Post-strip length ≤ 500 → verbatim; > 500 → first 500 chars + `…`. |

### `ContextSearchWireFile` (upstream `obsidian search:context --format json` wire entry)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `file` | `string` | yes | Vault-relative path (forward-slash). Flattens to `ContextSearchMatch.path`. |
| `matches` | `Array<{line: number, text: string}>` | yes | Per-line entries inside the file. Empty `matches: []` entries (filename-only matches with no body line) are silently dropped during flatten (R8 inherited limitation parity with BI-033 R9). |

Re-used from `src/tools/search/schema.ts` (`searchContextWireSchema`); see research R8.

## Zod schemas (source-of-truth declarations)

The following zod declarations will land in `src/tools/context_search/schema.ts`. They are reproduced here for plan-stage review; the implementation must match these byte-for-byte. Locator-input handling and `.strict()` modes match `searchInputSchema` / `searchLineOutputSchema` parity exactly, minus the `context_lines` field.

```ts
// src/tools/context_search/schema.ts (target)
// Original — no upstream. context_search input/output schemas — vault-scoped
// per-line context primitive. NO context_lines flag (the tool always returns
// line-level matches). Re-uses search/schema.ts's wire shape (searchContextWireSchema)
// for the upstream parse step (R8).
import { z } from "zod";

export const contextSearchInputSchema = z
  .object({
    query: z
      .string()
      .min(1, "query is required")
      .max(1000, "query exceeds 1000 chars (FR-008)"),
    folder: z.string().min(1).optional(),
    limit: z
      .number()
      .int()
      .min(1, "limit must be >= 1 (FR-006)")
      .max(10000, "limit must be <= 10000 (FR-006)")
      .optional(),
    case_sensitive: z.boolean().optional(),
    vault: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.query.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["query"],
        message: "query is empty or whitespace-only (FR-008)",
      });
    }
  });

export const contextSearchMatchSchema = z
  .object({
    path: z.string().min(1),
    line: z.number().int().min(1, "line is 1-based (FR-002)"),
    text: z.string(),
  })
  .strict();

export const contextSearchOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    matches: z.array(contextSearchMatchSchema),
    truncated: z.literal(true).optional(),
  })
  .strict()
  .refine((o) => o.count === o.matches.length, "count must equal matches.length");

export type ContextSearchInput = z.infer<typeof contextSearchInputSchema>;
export type ContextSearchMatch = z.infer<typeof contextSearchMatchSchema>;
export type ContextSearchOutput = z.infer<typeof contextSearchOutputSchema>;
```

## Handler shape (`src/tools/context_search/handler.ts` target)

The handler signature and pipeline shape:

```ts
import { searchContextWireSchema } from "../search/schema.js";
import { stripBoundarySlashes } from "../search/handler.js";
import { contextSearchOutputSchema, type ContextSearchInput, type ContextSearchOutput } from "./schema.js";
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

const TEXT_CAP = 500;
const ELLIPSIS = "…";
const DEFAULT_CAP = 1000;
const ZERO_MATCH_SENTINEL = "No matches found.";

export async function executeContextSearch(
  input: ContextSearchInput,
  deps: ExecuteDeps,
): Promise<ContextSearchOutput>;
```

### Pipeline stages (in order)

1. **Compute applied cap**: `appliedCap = input.limit ?? DEFAULT_CAP` (FR-010).
2. **Normalise `folder`**: `normalisedFolder = input.folder !== undefined ? stripBoundarySlashes(input.folder) : undefined`. Empty post-strip → treat as absent (omit `path` parameter).
3. **First CLI call** — `obsidian search:context query=<input.query> [path=<normalisedFolder>] limit=<appliedCap> [case] format=json [vault=<input.vault>]`.
4. **Zero-match sentinel detection** — if `result.stdout.trim() === ZERO_MATCH_SENTINEL`:
   - If `input.folder` is defined AND `normalisedFolder` is non-empty: invoke **second CLI call** `obsidian folder path=<normalisedFolder> [vault=<input.vault>]`. This second call either (a) succeeds → return empty envelope `{count: 0, matches: []}`, or (b) throws `UpstreamError(CLI_REPORTED_ERROR)` from the dispatch classifier catching `Error: Folder "X" not found.` (FR-013) — propagate verbatim.
   - If `input.folder` is undefined OR empty post-strip: return empty envelope `{count: 0, matches: []}` (no probe).
5. **JSON parse** — `JSON.parse(result.stdout)`. Failure → `UpstreamError(CLI_REPORTED_ERROR, details: { stage: "json-parse", stdout: ... })`.
6. **Wire parse** — `searchContextWireSchema.safeParse(parsed)`. Failure → `UpstreamError(CLI_REPORTED_ERROR, details: { stage: "wire-parse", stdout: ... })`.
7. **`.md`-only filter** — `wire.filter((f) => f.file.toLowerCase().endsWith(".md"))` (FR-017 / R10).
8. **Flatten + CRLF-strip + 500-char cap**:
   ```ts
   const flat = mdOnly.flatMap((f) =>
     f.matches.map((m) => ({
       path: f.file,
       line: m.line,
       text: capLine(stripCr(m.text)), // R5
     })),
   );
   ```
9. **Truncation detection** — `cliFileCapFired = (mdOnly.length === appliedCap)`, `flatExceedsCap = (flat.length > appliedCap)`, `truncated = cliFileCapFired || flatExceedsCap` (R9 inherited from BI-033 R3).
10. **Trim if `flatExceedsCap`**: `flat.slice(0, appliedCap)`.
11. **Sort by `(path, line)` ascending** (R11 / FR-018).
12. **Boundary validate via `contextSearchOutputSchema.parse(...)`** and return.

### Helper functions

```ts
function stripCr(s: string): string {
  return s.endsWith("\r") ? s.slice(0, -1) : s;
}

function capLine(text: string): string {
  return text.length <= TEXT_CAP ? text : text.slice(0, TEXT_CAP) + ELLIPSIS;
}
```

## Test inventory

### `schema.test.ts` (~22 cases)

Parity with `search/schema.test.ts` (~22 cases) minus the `context_lines` field. Cases:

| # | Case | Asserts |
|---|------|---------|
| 1 | happy path — `{ query: "foo" }` parses | data.query === "foo" |
| 2 | happy path — `{ query, folder }` parses | data.folder === supplied |
| 3 | happy path — `{ query, limit }` parses | data.limit === supplied |
| 4 | happy path — `{ query, case_sensitive }` parses | data.case_sensitive === supplied |
| 5 | happy path — `{ query, vault }` parses | data.vault === supplied |
| 6 | happy path — all fields set parses | success: true |
| 7 | reject — `{}` missing query | issues include path "query" |
| 8 | reject — empty `query: ""` (FR-008) | issues include path "query" |
| 9 | reject — whitespace-only `query: "   "` via superRefine | issues at path "query" |
| 10 | reject — `query` 1001 chars exceeds cap (FR-008) | issues at path "query" |
| 11 | accept — `query` exactly 1000 chars (boundary) | success: true |
| 12 | reject — `limit: 0` below floor (FR-006) | issues at path "limit" |
| 13 | reject — `limit: -1` negative | issues at path "limit" |
| 14 | reject — `limit: 10001` above ceiling (FR-006) | issues at path "limit" |
| 15 | accept — `limit: 1` at lower boundary | success: true |
| 16 | accept — `limit: 10000` at upper boundary | success: true |
| 17 | reject — `limit: 50.5` non-integer | issues at path "limit" |
| 18 | reject — unknown top-level key triggers `unrecognized_keys` (FR-009) | issues code === "unrecognized_keys" |
| 19 | phrase-match preserves internal whitespace verbatim (FR-001) — `query: "foo bar"` parses to "foo bar" | data.query === "foo bar" |
| 20 | inferred types compile against representative shapes | expectTypeOf<ContextSearchInput, ContextSearchOutput, ContextSearchMatch> |
| 21 | output schema strict — extra field on output rejected | success: false |
| 22 | output schema refine — count mismatch with matches.length rejected | success: false |

**Notable absence from `search/schema.test.ts`**: case 5 in BI-033 was the `context_lines` happy-path; that case has no analog here (the field doesn't exist in `contextSearchInputSchema`). Renumber accordingly.

### `handler.test.ts` (~14 cases)

The eight BI-033 R12 parity points + four BI-035-specific + CRLF variants. Mock seam: `invokeCli` (or an injected `spawnFn` per BI-033's test pattern).

| # | Case | Asserts |
|---|------|---------|
| H1 | happy path — single call, 1 file with 2 matches, sorted | 1 invokeCli call; subcommand "search:context"; output matches sorted (path asc, line asc); count = 2; no truncated. |
| H2 | happy path — folder supplied, results found, single call | 1 invokeCli call; parameters.path === normalised folder; subsequent existence probe NOT invoked. |
| H3 | happy path — vault supplied, flows through | parameters.vault === supplied; rest happy. |
| H4 | happy path — case_sensitive=true sets `case` flag | parameters.case === true; rest happy. |
| H5 | zero-match (no folder) — sentinel `"No matches found."` returns empty envelope, single call | 1 invokeCli call; output: { count: 0, matches: [] }; NO probe. |
| H6 | zero-match + folder exists — sentinel triggers probe, probe succeeds, returns empty envelope | 2 invokeCli calls; second call command === "folder", parameters.path === normalised; output: { count: 0, matches: [] }. |
| H7 | zero-match + folder missing — sentinel triggers probe, probe throws CLI_REPORTED_ERROR, handler propagates verbatim | 2 invokeCli calls; second call throws UpstreamError(code: "CLI_REPORTED_ERROR", details.message starts "Error: Folder"); handler rethrows. |
| H8 | malformed JSON in first-call stdout — CLI_REPORTED_ERROR(details.stage: "json-parse") | error.code === "CLI_REPORTED_ERROR"; details.stage === "json-parse". |
| H9 | wire-shape parse failure — CLI_REPORTED_ERROR(details.stage: "wire-parse") | error.code === "CLI_REPORTED_ERROR"; details.stage === "wire-parse". |
| H10 | non-`.md` wire entry filtered (FR-017 / R10) — synthetic `{file: "x.canvas", ...}` does NOT appear in output | output.matches does not contain entries with non-.md paths. |
| H11 | per-line text > 500 chars — capped to 500 + U+2026 marker (FR-012 / R5) | matched entry's text length === 501; text ends with "…". |
| H12 | per-line text === 500 chars — verbatim, no ellipsis | matched entry's text === input; no "…" appended. |
| H13 | CRLF strip — line text ending `\r` stripped before cap measurement (R5) | matched entry's text does not end with `\r`; trailing-spaces-before-CRLF preserved; embedded `\r` mid-line NOT stripped. |
| H14 | truncation — wire returns `appliedCap` files (line-mode conservative fires) | output.truncated === true; output.count === appliedCap (or appropriate trim). |

### `index.test.ts` (smoke)

| # | Case | Asserts |
|---|------|---------|
| I1 | createContextSearchTool returns a registered tool with the expected name and a non-empty description | tool.name === "context_search"; tool.description.length > 0. |

### `_register.test.ts` modification

Existing registration test enumerates the registered tool set against `_register-baseline.json`. Update the baseline JSON to include `"context_search"` (alphabetical position: between `context_search` and the next adjacent tool — actually `context_search` is alphabetically between `obsidian_exec` and `delete`... wait, alphabetical: `context_search` falls between `_baseline` rows; concretely it slots into the existing array sort order). The baseline-rolling step is FR-018 boilerplate; the registration test continues to pass under the updated baseline.

## Help-tool content shape

The help-tool integration adds one new entry and modifies one existing entry. The exact help-content data structure depends on the project's current help-tool implementation (see `src/tools/help/`). Conceptually:

**New entry — `context_search`**:

```text
Tool: context_search
Description: Returns each match of a keyword in a vault as a single entry carrying file path,
1-based line number, and the matching line's text — collapsing the dominant "find file → read
file → locate line" grep-style three-call pattern to one call.

Input:
  query           (required) — phrase-match keyword, 1..1000 chars, non-empty-post-trim.
  folder          (optional) — vault-relative folder prefix; leading/trailing "/" stripped;
                    recursive subtree-prefix match.
  limit           (optional) — integer 1..10000; caps response array; implicit cap 1000.
  case_sensitive  (optional) — boolean, default false (ASCII lower-fold).
  vault           (optional) — vault name; routes to focused vault when omitted.

Output: { count, matches: [{path, line, text}], truncated? }
  - matches sorted by (path, line) ascending.
  - text capped at 500 chars + "…" (U+2026) marker on truncation; trailing "\r" stripped.

Prefer this tool over `search` when: you need per-match line context in one call without a
follow-up `read`. Prefer `search` when: you only need the file paths (faster, smaller payload).

Failures: VALIDATION_ERROR (invalid input); CLI_REPORTED_ERROR(folder-not-found —
details.message starts "Error: Folder"); CLI_REPORTED_ERROR(VAULT_NOT_FOUND);
CLI_REPORTED_ERROR(stage: "json-parse" / "wire-parse"); CLI_BINARY_NOT_FOUND; CLI_TIMEOUT;
CLI_NON_ZERO_EXIT; CLI_OUTPUT_TOO_LARGE.

Examples: minimal happy-path; folder-scoped; capped+truncated; CRLF-source vault.
```

**Modified entry — `search`**:

- The `context_lines` parameter row gains a `deprecated — prefer the dedicated context_search tool` marker.
- The description body gains a one-sentence cross-pointer: "For per-line context, prefer `context_search` (added in BI-035); `context_lines=true` is retained for backward compatibility but will be removed in a future BI."

No other touches to `search`'s help block.

## Registration baseline update

`src/tools/_register-baseline.json` adds `"context_search"` (alphabetical) — the FR-018 registry-stability lock that catches accidental future drift. The new entry's JSON-position is determined by alphabetical sort against the existing array; the registration test compares the live registry against this baseline.

## Module boundary diagram

```
                                  ┌──────────────┐
                                  │  invokeCli   │  (kernel god-node, runtime spine)
                                  └──────┬───────┘
                                         │
                                         │ (two calls on cold-error path)
                                         │
            ┌────────────────────────────┴──────────────┐
            │                                           │
            ▼                                           ▼
┌──────────────────────────┐              ┌──────────────────────────┐
│ context_search/handler.ts│              │   search/handler.ts      │  (helper consumer for stripBoundarySlashes)
│   - executeContextSearch │──────────────│   - stripBoundarySlashes │  (re-exported)
│   - capLine, stripCr     │              │                          │
└──────────┬───────────────┘              └──────────────────────────┘
           │
           │ (wire-shape parse)
           ▼
┌──────────────────────────┐              ┌──────────────────────────┐
│ context_search/schema.ts │              │   search/schema.ts       │  (wire-shape consumer for searchContextWireSchema)
│   - contextSearchInput   │──────────────│   - searchContextWireSchema│ (re-exported)
│   - contextSearchOutput  │              │                          │
└──────────────────────────┘              └──────────────────────────┘
           │
           │ (registration)
           ▼
┌──────────────────────────┐
│ context_search/index.ts  │
│   - createContextSearchTool │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│   _register.ts           │  (boot spine — server.ts → _register.ts → createXTool())
└──────────────────────────┘
```

All imports flow downward/outward — no cycles, no upward dependencies (Principle I).
