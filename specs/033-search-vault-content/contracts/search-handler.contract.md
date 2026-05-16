# Contract: `search` Tool — Handler Invariants

**Branch**: `033-search-vault-content`
**Date**: 2026-05-16
**Surface**: `src/tools/search/handler.ts` (`searchHandler`)
**Authority**: research.md R1..R16 + spec.md FR-001..FR-024 + data-model.md per-tool invariants table

Handler invariants the implementation MUST satisfy. Each is referenced by one or more handler.test.ts cases.

---

## I-1 Validate input before any CLI dispatch

The handler's FIRST operation MUST be `searchInputSchema.parse(rawInput)`. Validation failures (empty/whitespace query, > 1000 chars, limit outside `1..10000`, unknown key) MUST throw BEFORE the handler issues any `invokeCli` call.

**Test seam**: spy on `deps.invokeCli`; assert call count is zero on schema-failure cases.

## I-2 Single `invokeCli` call per request

Each invocation of the handler MUST issue EXACTLY one call to `deps.invokeCli`. No retries, no fan-out, no probe-then-fetch.

**Test seam**: spy on `deps.invokeCli`; assert call count is one on success and on CLI-side error cases.

## I-3 Subcommand routing on `context_lines`

`deps.invokeCli` MUST be called with `subcommand: "search:context"` when `input.context_lines === true`; otherwise `subcommand: "search"`.

## I-4 CLI parameter assembly invariants

For every call, `parameters` MUST contain:
- `query: input.query` (verbatim, no trim, no normalisation).
- `format: "json"` (hard-coded).
- `limit: String(input.context_lines ? appliedCap : appliedCap + 1)` where `appliedCap = input.limit ?? 1000`.

`parameters` MUST CONDITIONALLY contain:
- `path: stripBoundarySlashes(input.folder)` IFF `input.folder !== undefined` AND the stripped value is non-empty.
- `case: true` (presence-only) IFF `input.case_sensitive === true`.
- `vault: input.vault` IFF `input.vault !== undefined`.

`parameters` MUST NEVER contain any other key (no `total`, no `verbose`, no leftover input fields).

## I-5 Folder normalisation strips one leading + one trailing `/`

`stripBoundarySlashes` strips AT MOST one leading `/` AND at most one trailing `/`. Inputs `Projects`, `Projects/`, `/Projects`, `/Projects/` MUST all produce `path: "Projects"`. Input `//Projects//` MUST produce `path: "/Projects/"` (only ONE level stripped on each side — defensive against accidental double-strip). Input `/` MUST produce empty post-strip, in which case `path` MUST be ABSENT from CLI parameters.

## I-6 Zero-match sentinel: empty result, no error

If `result.stdout.trim() === "No matches found."` AND exit code is 0, the handler MUST return the empty-result shape (`{count: 0, paths: []}` default, `{count: 0, matches: []}` line) and MUST NOT throw `UpstreamError`. Validation against the output schema still runs.

## I-7 JSON parse failure raises `CLI_REPORTED_ERROR(stage: "json-parse")`

If `result.stdout` is NOT the zero-match sentinel AND `JSON.parse` throws, the handler MUST throw `new UpstreamError("CLI_REPORTED_ERROR", { cause, details: { stage: "json-parse" } })`. No silent fallback to empty result.

## I-8 Wire-schema parse failure raises `CLI_REPORTED_ERROR(stage: "wire-parse")`

If the JSON-parsed value fails its per-mode wire schema (`searchDefaultWireSchema` for default mode, `searchContextWireSchema` for line mode), the handler MUST throw `UpstreamError("CLI_REPORTED_ERROR", { details: { stage: "wire-parse" } })`. No silent fallback.

## I-9 Default mode: cap-clip detection + trim + `truncated` flag

Default-mode response assembly:
1. Filter wire array to `.endsWith(".md")` (case-insensitive on extension) — defensive `.md`-only enforcement (FR-021 / R6).
2. If filtered array length === `appliedCap + 1`: set `truncated = true`; trim to first `appliedCap` entries.
3. Sort the trimmed array via `Array.prototype.sort()` (UTF-16 code-unit ascending).
4. Assemble `{count: sorted.length, paths: sorted, ...(truncated ? {truncated: true} : {})}`.
5. Validate via `searchDefaultOutputSchema.parse(...)`.

## I-10 Line mode: flatten + drop-empty + cap-text + truncation + sort

Line-mode response assembly:
1. Filter wire array to entries where `entry.file.toLowerCase().endsWith(".md")` (FR-021 defensive filter, FILE-LEVEL).
2. Flatten: for each remaining `{file, matches}` entry, emit one row per match shaped `{path: file, line: match.line, text: capLine(match.text)}` where `capLine(t) = t.length <= 500 ? t : t.slice(0, 500) + "…"` (U+2026 single character).
3. Entries with `matches: []` contribute ZERO rows to the flat array.
4. Compute `truncated = (filteredFiles.length === appliedCap) || (flat.length > appliedCap)`.
5. If `flat.length > appliedCap`: trim to first `appliedCap` entries.
6. Sort the trimmed array by `path` ascending, then `line` ascending.
7. Assemble `{count: sorted.length, matches: sorted, ...(truncated ? {truncated: true} : {})}`.
8. Validate via `searchLineOutputSchema.parse(...)`.

## I-11 `truncated` field encoding

When truncation fires, the response MUST contain literal `truncated: true`. When it does not fire, the field MUST be ABSENT (not `truncated: false`). This makes the spec contract "callers treat absent as false" (FR-023) trivially true under JSON.

## I-12 Per-line `text` cap exact behaviour

- `text.length === 500` → returned verbatim (NO ellipsis appended).
- `text.length === 501` → returned as `text.slice(0, 500) + "…"` (final length 501 — first 500 raw chars + ellipsis).
- `text.length > 501` → same as 501 case: first 500 + ellipsis.
- Ellipsis is the single character `…` (U+2026), NOT three ASCII dots (`...`).

## I-13 Sort determinism

Two calls with identical inputs and identical mocked `invokeCli` return value MUST produce byte-identical response payloads. JSON serialisation order is determined by V8's stable insertion order for the response object's keys (`count`, `paths` or `matches`, then optional `truncated`) — the handler MUST assemble fields in that order.

## I-14 Locator never echoed in response

Response objects MUST contain EXACTLY the keys:
- Default mode: `count`, `paths`, and optionally `truncated` (when `true`).
- Line mode: `count`, `matches`, and optionally `truncated`.

No `vault`, `query`, `folder`, `limit`, `case_sensitive`, `context_lines`, `mode` — none of these appear in any response shape (FR-013, read-tool convention).

## I-15 Output schema validation at the boundary

The handler's final return value MUST pass through `searchDefaultOutputSchema.parse(...)` or `searchLineOutputSchema.parse(...)` (per mode) before being returned. This provides a defense-in-depth check that the assembly logic above honoured every invariant (count === length, `truncated` only `true` or absent, line ≥ 1, etc.).

## I-16 Original-no-upstream attribution

`src/tools/search/{schema, handler, index}.ts` MUST each carry an `// Original — no upstream. <one-line description>` header per Constitution Principle V. README Attributions section is unchanged (no upstream lifted for this BI).

---

## Test inventory (handler.test.ts coverage map)

Each invariant above MUST have at least one direct test case. Cross-reference:

| Invariant | Direct cases (handler.test.ts) |
|---|---|
| I-1  | schema-rejection cases that assert `invokeCli` was not called (5 cases) |
| I-2  | every happy-path AND CLI-error case implicitly verifies call count = 1 |
| I-3  | cases verifying `subcommand: "search"` (default) and `subcommand: "search:context"` (line) |
| I-4  | cases verifying each parameter's presence/absence (~8 cases) |
| I-5  | folder normalisation cases (`Projects`, `Projects/`, `/Projects`, `/Projects/`, `/`) |
| I-6  | zero-match sentinel cases (default + line) |
| I-7  | malformed-JSON case |
| I-8  | wire-schema-mismatch case (returns `[null]`) |
| I-9  | default-mode cap-clip + trim + sort cases (~4 cases) |
| I-10 | line-mode flatten + drop-empty + flat-clip + sort cases (~5 cases) |
| I-11 | `truncated` field present/absent cases |
| I-12 | text-cap boundary cases (500, 501, 1000 chars) |
| I-13 | byte-identical-repeated-call case |
| I-14 | response-key-set assertion case |
| I-15 | output-schema-violation defensive case (synthetic mismatch) |
| I-16 | header-presence test (shared infra; may already exist project-wide) |
