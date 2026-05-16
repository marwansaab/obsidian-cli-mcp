# Data Model: Search Vault Content

**Branch**: `033-search-vault-content`
**Date**: 2026-05-16
**Phase**: 1 (Design & Contracts)

Schemas, two-subcommand routing, post-process pipeline, per-tool invariants, module LOC budget, test inventory, architectural delta map vs the BI-028 / BI-030 cohort precedents.

## Input schema

```ts
// src/tools/search/schema.ts
import { z } from "zod";

export const searchInputSchema = z
  .object({
    query: z
      .string()
      .min(1, "query is required")
      .max(1000, "query exceeds 1000 chars (FR-010)"),
    folder: z.string().min(1).optional(),
    limit: z
      .number()
      .int()
      .min(1, "limit must be ≥ 1 (FR-008)")
      .max(10000, "limit must be ≤ 10000 (FR-008 / Q3)")
      .optional(),
    case_sensitive: z.boolean().optional(),
    context_lines: z.boolean().optional(),
    vault: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.query.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["query"],
        message: "query is empty or whitespace-only (FR-010)",
      });
    }
  });

export type SearchInput = z.infer<typeof searchInputSchema>;
```

Notes:
- `query.max(1000)` is the FR-010 structural cap on raw input.
- `query` is NOT transformed (no trim, no normalisation) — phrase-match per FR-001 / Q2 preserves internal whitespace verbatim.
- The post-trim emptiness check is in `superRefine` so the rejection error is field-scoped to `query`.
- `folder.min(1)` rejects empty-string folder (defensive — undefined or non-empty allowed; the wrapper strips leading/trailing `/` in the handler, not in the schema, so the post-strip empty-string case never reaches the CLI).
- `limit` accepts inclusive `1..10000` per Q3 / FR-007 / FR-008.
- `case_sensitive` and `context_lines` default to `false` (zod absent === undefined === falsy at runtime in the handler).
- `vault?` is the only vault-targeting field per FR-016 (restated by plan-stage Amendment 1). NO `mode` discriminator.
- `.strict()` rejects unknown keys per Principle III / FR-011.

## Output schemas

Two schemas — one per mode — picked at the response-boundary based on `input.context_lines`.

```ts
// src/tools/search/schema.ts (continued)

export const searchDefaultOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    paths: z.array(z.string().min(1)),
    truncated: z.literal(true).optional(),
  })
  .strict()
  .refine((o) => o.count === o.paths.length, "count must equal paths.length");

export const searchLineMatchSchema = z
  .object({
    path: z.string().min(1),
    line: z.number().int().min(1, "line is 1-based (FR-003)"),
    text: z.string(),
  })
  .strict();

export const searchLineOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    matches: z.array(searchLineMatchSchema),
    truncated: z.literal(true).optional(),
  })
  .strict()
  .refine((o) => o.count === o.matches.length, "count must equal matches.length");

export type SearchDefaultOutput = z.infer<typeof searchDefaultOutputSchema>;
export type SearchLineMatch = z.infer<typeof searchLineMatchSchema>;
export type SearchLineOutput = z.infer<typeof searchLineOutputSchema>;
```

Notes:
- `truncated` is `z.literal(true).optional()` — only ever PRESENT when truncation fired (FR-023). Callers MUST treat absent as `false`.
- `text` has no min-length — empty `text` is valid (whitespace-only matching line).
- `text` is NOT capped in the schema; the 500-char cap is enforced wrapper-side (R10 / FR-024) and the resulting capped value is the schema-validated value. (Putting the cap in the schema as `.max(501)` would couple validation to the truncation marker length; keeping it as a wrapper invariant is cleaner.)
- `count === array.length` invariant per FR-002 / FR-003.

## CLI wire schemas

The native subcommands' `format=json` output. Two distinct shapes — one per subcommand.

```ts
// src/tools/search/schema.ts (continued)

// `obsidian search query=... format=json` — flat array of vault-relative path strings.
export const searchDefaultWireSchema = z.array(z.string().min(1));

// `obsidian search:context query=... format=json` — file-grouped with optional matches array.
export const searchContextWireMatchSchema = z
  .object({
    line: z.number().int().min(1),
    text: z.string(),
  })
  .strict();

export const searchContextWireFileSchema = z
  .object({
    file: z.string().min(1),
    matches: z.array(searchContextWireMatchSchema),
  })
  .strict();

export const searchContextWireSchema = z.array(searchContextWireFileSchema);
```

## Two-subcommand routing

```ts
// src/tools/search/handler.ts (excerpt)
const subcommand = input.context_lines ? "search:context" : "search";
const cliParams: Record<string, string | true> = {
  query: input.query,
  format: "json",
};
if (input.folder !== undefined) {
  const normalised = stripBoundarySlashes(input.folder);
  if (normalised.length > 0) cliParams.path = normalised;
}
const appliedCap = input.limit ?? 1000;
cliParams.limit = String(input.context_lines ? appliedCap : appliedCap + 1);
if (input.case_sensitive === true) cliParams.case = true;
if (input.vault !== undefined) cliParams.vault = input.vault;

const result = await invokeCli({ subcommand, parameters: cliParams });
```

Notes:
- `stripBoundarySlashes(s)` strips ONE leading `/` and ONE trailing `/` (FR-006).
- `case` is the upstream presence-only boolean flag; emitting `true` triggers the presence-only encoding in `invokeCli`.
- Default mode requests `appliedCap + 1` to detect cap-clip (R3). Line mode requests `appliedCap` (R3 conservative trade-off).
- `format` is hard-coded to `"json"`.

## Post-process pipeline

### Default mode (`context_lines: false`)

```ts
// stage 0 — zero-match sentinel
if (result.stdout.trim() === "No matches found.") {
  return { count: 0, paths: [] };
}

// stage 1 — JSON parse + wire-schema validate
const raw = JSON.parse(result.stdout);
const wirePaths = searchDefaultWireSchema.parse(raw);

// stage 2 — defensive .md filter (FR-021; current no-op against upstream, R6)
const mdOnly = wirePaths.filter((p) => p.toLowerCase().endsWith(".md"));

// stage 3 — detect cap-clip + trim
const truncated = mdOnly.length === appliedCap + 1;
const trimmed = truncated ? mdOnly.slice(0, appliedCap) : mdOnly;

// stage 4 — deterministic sort
const sorted = [...trimmed].sort();

// stage 5 — assemble + validate at boundary
const out: SearchDefaultOutput = {
  count: sorted.length,
  paths: sorted,
  ...(truncated ? { truncated: true as const } : {}),
};
return searchDefaultOutputSchema.parse(out);
```

### Line mode (`context_lines: true`)

```ts
// stage 0 — zero-match sentinel
if (result.stdout.trim() === "No matches found.") {
  return { count: 0, matches: [] };
}

// stage 1 — JSON parse + wire-schema validate
const raw = JSON.parse(result.stdout);
const wireFiles = searchContextWireSchema.parse(raw);

// stage 2 — defensive .md filter (FR-021) AT FILE LEVEL before flatten
const mdOnlyFiles = wireFiles.filter((f) => f.file.toLowerCase().endsWith(".md"));

// stage 3 — flatten (drop empty matches per R9) + cap text (FR-024)
const TEXT_CAP = 500;
const flatten = (f: SearchContextWireFile) =>
  f.matches.map((m) => ({
    path: f.file,
    line: m.line,
    text: m.text.length <= TEXT_CAP ? m.text : m.text.slice(0, TEXT_CAP) + "…",
  }));
const flat = mdOnlyFiles.flatMap(flatten);

// stage 4 — detect truncation: either (a) wrapper-side clip needed
// because flat exceeds applied_cap, OR (b) CLI file-cap fired
// (file count == applied_cap, signalling possible drop of subsequent files)
const cliFileCapFired = mdOnlyFiles.length === appliedCap;
const flatExceedsCap = flat.length > appliedCap;
const truncated = cliFileCapFired || flatExceedsCap;
const trimmed = flatExceedsCap ? flat.slice(0, appliedCap) : flat;

// stage 5 — deterministic sort (path asc, then line asc)
const sorted = [...trimmed].sort((a, b) =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line
);

// stage 6 — assemble + validate at boundary
const out: SearchLineOutput = {
  count: sorted.length,
  matches: sorted,
  ...(truncated ? { truncated: true as const } : {}),
};
return searchLineOutputSchema.parse(out);
```

## Handler shape

```ts
// src/tools/search/handler.ts
// Original — no upstream. search handler — two-subcommand router (search /
// search:context) wrapping native CLI; zero-match sentinel detection; 500-char
// line truncation; deterministic sort; truncated-flag computation via +1 probe
// (default mode) and conservative file-cap-fired-OR-flat-exceeds-cap (line mode).
import type { ExecuteDeps } from "../_register.js";
import {
  searchInputSchema,
  searchDefaultOutputSchema,
  searchLineOutputSchema,
  searchDefaultWireSchema,
  searchContextWireSchema,
  type SearchInput,
  type SearchDefaultOutput,
  type SearchLineOutput,
} from "./schema.js";
import { UpstreamError } from "../../upstream-error/upstream-error.js";

const TEXT_CAP = 500;
const ELLIPSIS = "…";
const DEFAULT_CAP = 1000;
const ZERO_MATCH_SENTINEL = "No matches found.";

const stripBoundarySlashes = (s: string): string => {
  let r = s;
  if (r.startsWith("/")) r = r.slice(1);
  if (r.endsWith("/")) r = r.slice(0, -1);
  return r;
};

export const searchHandler = (deps: ExecuteDeps) =>
  async (rawInput: unknown): Promise<SearchDefaultOutput | SearchLineOutput> => {
    const input: SearchInput = searchInputSchema.parse(rawInput);
    const useLines = !!input.context_lines;
    const appliedCap = input.limit ?? DEFAULT_CAP;

    const params: Record<string, string | true> = {
      query: input.query,
      format: "json",
    };
    if (input.folder !== undefined) {
      const normalised = stripBoundarySlashes(input.folder);
      if (normalised.length > 0) params.path = normalised;
    }
    params.limit = String(useLines ? appliedCap : appliedCap + 1);
    if (input.case_sensitive === true) params.case = true;
    if (input.vault !== undefined) params.vault = input.vault;

    const result = await deps.invokeCli({
      subcommand: useLines ? "search:context" : "search",
      parameters: params,
    });

    // Zero-match sentinel (R4 / F2)
    if (result.stdout.trim() === ZERO_MATCH_SENTINEL) {
      return useLines
        ? searchLineOutputSchema.parse({ count: 0, matches: [] })
        : searchDefaultOutputSchema.parse({ count: 0, paths: [] });
    }

    // JSON parse
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout);
    } catch (cause) {
      throw new UpstreamError("CLI_REPORTED_ERROR", {
        cause,
        details: { stage: "json-parse" },
      });
    }

    if (useLines) {
      const wire = searchContextWireSchema.parse(parsed);
      const mdOnly = wire.filter((f) => f.file.toLowerCase().endsWith(".md"));
      const flat = mdOnly.flatMap((f) =>
        f.matches.map((m) => ({
          path: f.file,
          line: m.line,
          text: m.text.length <= TEXT_CAP ? m.text : m.text.slice(0, TEXT_CAP) + ELLIPSIS,
        }))
      );
      const cliFileCapFired = mdOnly.length === appliedCap;
      const flatExceedsCap = flat.length > appliedCap;
      const truncated = cliFileCapFired || flatExceedsCap;
      const trimmed = flatExceedsCap ? flat.slice(0, appliedCap) : flat;
      const sorted = [...trimmed].sort((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line
      );
      return searchLineOutputSchema.parse({
        count: sorted.length,
        matches: sorted,
        ...(truncated ? { truncated: true as const } : {}),
      });
    } else {
      const wire = searchDefaultWireSchema.parse(parsed);
      const mdOnly = wire.filter((p) => p.toLowerCase().endsWith(".md"));
      const truncated = mdOnly.length === appliedCap + 1;
      const trimmed = truncated ? mdOnly.slice(0, appliedCap) : mdOnly;
      const sorted = [...trimmed].sort();
      return searchDefaultOutputSchema.parse({
        count: sorted.length,
        paths: sorted,
        ...(truncated ? { truncated: true as const } : {}),
      });
    }
  };
```

## Per-tool invariants

| Invariant | Source | Test coverage |
|---|---|---|
| Strict input schema rejects unknown keys | FR-011 / Principle III | schema.test.ts |
| Empty / whitespace-only query → `VALIDATION_ERROR` before CLI call | FR-010 | schema.test.ts |
| Query > 1000 chars → `VALIDATION_ERROR` before CLI call | FR-010 | schema.test.ts |
| `limit` outside `1..10000` → `VALIDATION_ERROR` before CLI call | FR-008 | schema.test.ts |
| `folder` leading/trailing `/` normalised before CLI passthrough | FR-006 | handler.test.ts (mocked invokeCli params) |
| `subcommand` is `"search:context"` iff `context_lines === true`, else `"search"` | R2 | handler.test.ts |
| `parameters.format === "json"` always | R1 | handler.test.ts |
| `parameters.case === true` iff `case_sensitive === true`; absent otherwise | R8 | handler.test.ts |
| `parameters.limit` is `applied_cap + 1` default mode, `applied_cap` line mode | R3 | handler.test.ts |
| Zero-match sentinel → empty result, NEVER an error | FR-012 / R4 | handler.test.ts |
| Default-mode `paths` sorted UTF-16 code-unit ascending | FR-019 / R11 | handler.test.ts |
| Line-mode `matches` sorted by `path` asc, then `line` asc | FR-019 / R11 | handler.test.ts |
| Default mode trim when CLI returns `applied_cap + 1` → `truncated: true` | FR-022 / FR-023 / R3 | handler.test.ts |
| Line mode `truncated: true` when CLI file count == applied_cap OR flat > applied_cap | FR-022 / FR-023 / R3 | handler.test.ts |
| Line mode flatten DROPS file entries with empty `matches: []` | R9 / F7 | handler.test.ts |
| Line-mode `text` > 500 chars truncated to first 500 + `…` (U+2026) | FR-024 / R10 | handler.test.ts |
| Line-mode `text` ≤ 500 chars returned verbatim (NO ellipsis) | FR-024 / R10 | handler.test.ts |
| Non-`.md` paths excluded from response (defensive filter; current no-op against upstream) | FR-021 / R6 | handler.test.ts (mock CLI to return a synthetic `.canvas` path; assert filtered out) |
| `count === array.length` invariant in both shapes | FR-002 / FR-003 | output-schema refine |
| `truncated` field only present when `true`; absent === false | FR-023 | handler.test.ts |
| Response NEVER echoes locator (`vault`, `query`, `folder`, `limit`, `case_sensitive`, `context_lines`) | FR-013 | output-schema strict + handler.test.ts (assert response keys are exactly the allowed set) |
| Tool name `search` registered alphabetically; baseline roll-forward present | ADR-010 / FR-018 (project) | index.test.ts + _register-baseline.json |
| All new source files carry `// Original — no upstream.` header | Principle V | header-presence test (project-wide convention) |
| Zero new top-level error codes | Principle IV | grep / inspection at review |

## Module LOC budget

| File | Estimated LOC (incl. comments) | Cumulative |
|---|---|---|
| `src/tools/search/schema.ts` | ~70 | ~70 |
| `src/tools/search/schema.test.ts` | ~180 (20 cases) | ~250 |
| `src/tools/search/handler.ts` | ~120 | ~370 |
| `src/tools/search/handler.test.ts` | ~520 (35 cases) | ~890 |
| `src/tools/search/index.ts` | ~25 | ~915 |
| `src/tools/search/index.test.ts` | ~70 (5 cases) | ~985 |
| `docs/tools/search.md` | ~250 (FR-020 / FR-014 contract — 4+ examples, error roster, both output shapes) | (docs) |
| `src/server.ts` | +2 (import + tools-array entry) | — |
| `src/tools/_register.ts` | +1-2 (per BI-031 fixture pattern, may be auto-derived) | — |
| `src/tools/_register-baseline.json` | +1 entry | — |

Total new TS: ~985 LOC. Total new test cases: ~60. Comparable to BI-028's ~720 LOC / 53 cases. Slightly larger because of the two-subcommand routing and the line-mode flatten/cap/sort pipeline.

## Test inventory

### schema.test.ts (~20 cases)

1. happy path: `{query: "foo"}` parses to `{query: "foo"}`.
2. happy path: `{query: "foo", folder: "Projects"}` parses.
3. happy path: `{query: "foo", limit: 50}` parses.
4. happy path: `{query: "foo", case_sensitive: true}` parses.
5. happy path: `{query: "foo", context_lines: true}` parses.
6. happy path: `{query: "foo", vault: "MyVault"}` parses.
7. happy path: all-fields-set parses.
8. reject: `{}` (missing query).
9. reject: `{query: ""}` (FR-010 empty).
10. reject: `{query: "   "}` (FR-010 whitespace-only via superRefine).
11. reject: `{query: "a".repeat(1001)}` (FR-010 > 1000 chars).
12. accept: `{query: "a".repeat(1000)}` (boundary at exactly 1000 chars).
13. reject: `{query: "foo", limit: 0}` (FR-008 < 1).
14. reject: `{query: "foo", limit: -1}` (FR-008 negative).
15. reject: `{query: "foo", limit: 10001}` (FR-008 > 10000).
16. accept: `{query: "foo", limit: 1}` (FR-008 boundary at 1).
17. accept: `{query: "foo", limit: 10000}` (FR-008 boundary at 10000).
18. reject: `{query: "foo", limit: 50.5}` (non-integer).
19. reject: `{query: "foo", unknown: "x"}` (FR-011 strict).
20. accept: phrase-match preserves internal whitespace verbatim — `{query: "foo bar"}` parses to `{query: "foo bar"}` (FR-001 / Q2; no trim of internal whitespace).

### handler.test.ts (~35 cases)

**Default mode (`search` subcommand)**:
1. invokes `subcommand: "search"`, `format: "json"`, `query` flow-through.
2. invokes with no `folder`, no `path` parameter in CLI invocation.
3. invokes with `folder: "Projects"`, `path: "Projects"` in CLI invocation.
4. invokes with `folder: "/Projects/"`, `path: "Projects"` (FR-006 normalisation).
5. invokes with `folder: "/"`, `path` absent (empty post-strip).
6. invokes with `case_sensitive: true`, `case: true` flag added; absent otherwise.
7. invokes with `vault: "MyVault"`, `vault` flag added.
8. invokes with `limit: 50` AND no context_lines → CLI `limit=51` (R3 + 1 probe).
9. invokes with no `limit` AND no context_lines → CLI `limit=1001`.
10. zero-match sentinel → `{count: 0, paths: []}`, no error.
11. happy: CLI returns `["a.md", "b.md"]` → response `{count: 2, paths: ["a.md", "b.md"]}`.
12. truncation: CLI returns 1001 paths (no input.limit) → response trims to 1000, `truncated: true`.
13. no-truncation: CLI returns 999 paths → response `count: 999`, NO `truncated` field.
14. truncation with explicit limit: input.limit=5, CLI returns 6 → response 5 entries + `truncated: true`.
15. defensive `.md` filter: CLI returns `["a.md", "b.canvas"]` → response `{count: 1, paths: ["a.md"]}`.
16. sort: CLI returns `["z.md", "a.md", "m.md"]` → response sorted `["a.md", "m.md", "z.md"]`.
17. JSON parse failure: CLI returns invalid JSON → `UpstreamError(CLI_REPORTED_ERROR, details.stage: "json-parse")`.
18. wire-schema mismatch: CLI returns `[null]` → wire-schema parse error → `UpstreamError`.

**Line mode (`search:context` subcommand)**:
19. invokes `subcommand: "search:context"`, all other params identical.
20. invokes with `limit: 50` AND context_lines → CLI `limit=50` (R3 conservative).
21. invokes with no `limit` AND context_lines → CLI `limit=1000`.
22. zero-match sentinel → `{count: 0, matches: []}`, no error.
23. happy: CLI returns `[{file:"a.md", matches:[{line:1,text:"foo"}]}]` → response `{count:1, matches:[{path:"a.md", line:1, text:"foo"}]}`.
24. flatten: CLI returns `[{file:"a.md", matches:[{line:1,text:"x"},{line:5,text:"y"}]}]` → 2 entries.
25. drop empty matches: CLI returns `[{file:"a.md", matches:[]}, {file:"b.md", matches:[{line:3,text:"z"}]}]` → response 1 entry only (`b.md`).
26. text cap exact-501: 500-char text → returned verbatim, no ellipsis. 501-char text → first 500 + `…`.
27. text cap at boundary: text length === 500 returned verbatim (NO ellipsis).
28. text cap at boundary: text length === 501 truncated to first 500 + ellipsis (total 501 chars).
29. text cap with 1000-char text → first 500 + ellipsis.
30. sort: CLI returns `[{file:"z.md", matches:[{line:1, text:"x"}]}, {file:"a.md", matches:[{line:5, text:"y"},{line:2, text:"z"}]}]` → sorted `[{a.md,2,z},{a.md,5,y},{z.md,1,x}]`.
31. truncation: flat exceeds applied_cap → trim to applied_cap, `truncated: true`.
32. truncation: flat ≤ applied_cap BUT CLI returned applied_cap files → still `truncated: true` (conservative; R3).
33. truncation: flat ≤ applied_cap AND CLI returned < applied_cap files → no `truncated`.
34. defensive `.md` filter line mode: CLI returns canvas entry → filtered out at file level before flatten.
35. response does NOT echo locator fields (no `query`/`folder`/`limit`/etc. in response shape).

### index.test.ts (~5 cases)

1. `createSearchTool(deps)` returns object with `name: "search"`.
2. `description` is non-empty string.
3. `inputSchema` is the JSON Schema generated from `searchInputSchema` (round-trip via `zod-to-json-schema`).
4. `handler` is invokable with mocked deps.
5. `_register.ts` registers `createSearchTool` alphabetically between `rename` and `set_property`.

## Architectural delta map vs cohort precedents

| Dimension | BI-028 `tag` (eval-cohort) | BI-030 `move` (native-cohort) | BI-033 `search` (this BI) |
|---|---|---|---|
| Architecture | `eval` + JS template walk | native subcommand wrapper | **native subcommand wrapper** (R1) |
| Subcommands used | `eval` only | `move` only | **two: `search` AND `search:context`** (R2) |
| Anti-injection | base64-JSON payload | not applicable | not applicable (native CLI argv) |
| Shared-module use | `_eval-vault-closed-detection` | none | none |
| Vault-targeting field | `vault?` | `target_mode + vault? + (file/path)` | **`vault?`** (R7 / FR-016 restated) |
| Zero-match handling | natural empty envelope from eval | natural (no zero-match concept for move) | **sentinel-string detection** (R4 / F2) |
| Output filter | none | none | **defensive `.endsWith(".md")` post-filter** (R6 / FR-021) |
| Sort | inside eval JS template | none (single-row output) | **wrapper-side path-asc / path+line-asc** (R11) |
| Truncation flag | none (no cap) | none | **`truncated: boolean` via +1 probe (default) or conservative-cap (line)** (R3 / FR-023) |
| Per-line cap | not applicable | not applicable | **500-char + `…` ellipsis** (R10 / FR-024) |
| New error codes | 0 | 0 | **0** (Principle IV streak preserved) |
| New ADRs | 0 | 0 | **0** |

Most architecturally similar predecessor: **BI-019 `files`** — also a multi-subcommand native wrapper (`files` / `files:listing`) routed by an input flag. Schema convention (vault-scoped, `vault?`-only) parity with **BI-028 `tag`**.

## Fixture seeding plan (T0 manual, post-implementation validation)

For developer-machine T0 verification (run `obsidian` against TestVault directly, no MCP wrapper):

1. Seed `Sandbox/BI-033/single-line.md` with a single line containing `bi033-single`.
2. Seed `Sandbox/BI-033/multi-line.md` with content on lines 1, 3, 5 — only line 3 contains `bi033-multi`.
3. Seed `Sandbox/BI-033/case-test.md` with one line containing `bi033-Case` (capital C).
4. Seed `Sandbox/BI-033/long-line.md` with one 800-char line containing `bi033-long` at the start.
5. Seed `Sandbox/BI-033/Nested/deep.md` with one line containing `bi033-nested`.
6. Seed `Sandbox/BI-033/many-matches/` with 10 files each containing `bi033-many` (for cap tests).
7. Seed `Sandbox/BI-033/with-canvas.md` (contains `bi033-canvas-test`) AND `Sandbox/BI-033/with-canvas.canvas` (contains `bi033-canvas-test`) — verifies `.md` filter.

Probe coverage (run via PowerShell, NOT via MCP):
- T0-1: `obsidian vault=TestVault-Obsidian-CLI-MCP search query=bi033-single format=json` → `["Sandbox/BI-033/single-line.md"]`.
- T0-2: `obsidian vault=TestVault-Obsidian-CLI-MCP search:context query=bi033-multi format=json` → `[{file:"Sandbox/BI-033/multi-line.md", matches:[{line:3, text:"<line 3 text>"}]}]`.
- T0-3: `obsidian vault=TestVault-Obsidian-CLI-MCP search query=bi033-Case case format=json` → `["Sandbox/BI-033/case-test.md"]`; without `case` → same; `obsidian ... search query=bi033-case format=json` → still matches `case-test.md` (default case-insensitive).
- T0-4: `obsidian ... search query=bi033-canvas-test format=json` → returns `Sandbox/BI-033/with-canvas.md` only (NOT the .canvas).
- T0-5: `obsidian ... search query=bi033-nested path=Sandbox/BI-033/Nested format=json` → `["Sandbox/BI-033/Nested/deep.md"]`.
- T0-6: `obsidian ... search query=bi033-many limit=3 format=json` → returns 3 paths (no truncation signal in CLI — wrapper detects via +1 probe).
- T0-7: cleanup — remove all `Sandbox/BI-033/` fixtures.

## Open questions for `/speckit-implement` stage

None at this design phase. All decisions are locked. Live-probe findings F1-F8 align with spec contract after the two plan-stage amendments (FR-016 restated, FR-021 defensive-clause status documented).
