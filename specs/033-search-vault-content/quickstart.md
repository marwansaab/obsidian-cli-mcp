# Quickstart: Search Vault Content

**Branch**: `033-search-vault-content`
**Date**: 2026-05-16
**Phase**: 1 (Design & Contracts)

Verification scenarios Q-1..Q-23 mapped to SC-001..SC-011. Each Q-N either characterises an in-process test case (CI) or a manual `obsidian` CLI probe against `TestVault-Obsidian-CLI-MCP` (T0 — pre-implementation already proven during plan-stage probes; post-implementation re-verifies end-to-end).

## CI verification scenarios (mocked `invokeCli`)

### Q-1 → SC-001 Default-mode happy path

Setup: mock `invokeCli` to return stdout `["a.md","b.md"]` exit 0.
Call: `search({query: "foo"})`.
Assert: response `{count: 2, paths: ["a.md", "b.md"]}`; no `truncated`.

### Q-2 → SC-002 Line-mode happy path

Setup: mock `invokeCli` to return stdout `[{"file":"a.md","matches":[{"line":3,"text":"foo bar"}]}]`.
Call: `search({query: "foo", context_lines: true})`.
Assert: response `{count: 1, matches: [{path: "a.md", line: 3, text: "foo bar"}]}`.

### Q-3 → SC-001 Zero matches return empty result, not error

Setup: mock `invokeCli` to return stdout `"\nNo matches found.\n"` exit 0.
Call: `search({query: "nothing"})`.
Assert: response `{count: 0, paths: []}`; no error thrown; no `truncated`.

### Q-4 → SC-001 Zero matches in line mode

Setup: same sentinel, `context_lines: true`.
Assert: response `{count: 0, matches: []}`.

### Q-5 → SC-003 Folder scoping forwards `path`

Setup: mock `invokeCli`.
Call: `search({query: "foo", folder: "Projects"})`.
Assert: `invokeCli` called with `parameters.path === "Projects"`.

### Q-6 → SC-003 Folder normalisation (leading/trailing `/`)

Call: `search({query: "foo", folder: "/Projects/"})`.
Assert: `parameters.path === "Projects"` (FR-006).

### Q-7 → SC-003 Folder `/` alone → no `path` parameter

Call: `search({query: "foo", folder: "/"})`.
Assert: `parameters.path` is ABSENT (empty post-strip).

### Q-8 → SC-004 `limit` forwards `applied_cap + 1` in default mode

Call: `search({query: "foo", limit: 50})`.
Assert: `parameters.limit === "51"` (R3 +1 probe).

### Q-9 → SC-004 `limit` forwards `applied_cap` in line mode

Call: `search({query: "foo", limit: 50, context_lines: true})`.
Assert: `parameters.limit === "50"` (R3 conservative).

### Q-10 → SC-004 Default-mode cap-clip detection

Setup: mock `invokeCli` to return 51 paths.
Call: `search({query: "foo", limit: 50})`.
Assert: response `{count: 50, paths: [...], truncated: true}`; last entry of 51 was trimmed.

### Q-11 → SC-004 Default-mode no-truncation when underlying ≤ cap

Setup: mock `invokeCli` to return 49 paths.
Call: `search({query: "foo", limit: 50})`.
Assert: response `{count: 49, paths: [...]}`; no `truncated`.

### Q-12 → SC-004 Implicit 1000 cap when `limit` omitted

Setup: mock `invokeCli` to return 1001 paths.
Call: `search({query: "foo"})`.
Assert: `parameters.limit === "1001"`; response `{count: 1000, paths: [...], truncated: true}`.

### Q-13 → SC-004 Line-mode flat-exceeds-cap truncation

Setup: mock `invokeCli` to return 1 file with 1500 matches; `limit` omitted (implicit 1000).
Call: `search({query: "foo", context_lines: true})`.
Assert: response `{count: 1000, matches: [...], truncated: true}`.

### Q-14 → SC-004 Line-mode CLI-file-cap-fired conservative truncation

Setup: mock `invokeCli` to return 1000 files each with 1 match.
Call: `search({query: "foo", context_lines: true})`.
Assert: response `{count: 1000, matches: [...], truncated: true}` (conservative — CLI-side file cap may have clipped).

### Q-15 → SC-005 Case flag added when `case_sensitive: true`

Call: `search({query: "Foo", case_sensitive: true})`.
Assert: `parameters.case === true`.

### Q-16 → SC-005 Case flag omitted when `case_sensitive` absent/false

Call: `search({query: "Foo"})` and `search({query: "Foo", case_sensitive: false})`.
Assert: `parameters.case` is ABSENT in both.

### Q-17 → SC-006 Zero matches with `context_lines: true` → `count: 0, matches: []`

(Q-4 covers this.)

### Q-18 → SC-007 Deterministic sort default mode

Setup: mock CLI to return `["z.md","a.md","m.md"]`.
Call: `search({query: "foo"})`.
Assert: response `paths === ["a.md", "m.md", "z.md"]`.

### Q-19 → SC-007 Deterministic sort line mode (path-then-line)

Setup: mock CLI to return `[{"file":"z.md","matches":[{"line":1,"text":"x"}]},{"file":"a.md","matches":[{"line":5,"text":"y"},{"line":2,"text":"z"}]}]`.
Call: `search({query: "foo", context_lines: true})`.
Assert: response `matches` is `[{a.md,2,z},{a.md,5,y},{z.md,1,x}]`.

### Q-20 → SC-008 Post-cap output-too-large is the rare path

(Validated indirectly: handler's truncation flag fires for normal cap-clipping; the cli-adapter's 10 MiB output cap is the exceptional path. Tested in the cli-adapter test suite, not here.)

### Q-21 → SC-009 Validation rejects empty query before CLI call

Call: `search({query: ""})`.
Assert: throws `VALIDATION_ERROR`; `invokeCli` was NOT called.

### Q-22 → SC-009 Validation rejects whitespace-only query

Call: `search({query: "   "})`.
Assert: throws `VALIDATION_ERROR` with field path `["query"]`; `invokeCli` was NOT called.

### Q-23 → SC-009 Validation rejects `limit: 10001`

Call: `search({query: "foo", limit: 10001})`.
Assert: throws `VALIDATION_ERROR`; `invokeCli` was NOT called.

### Q-24 → SC-009 Validation rejects unknown key

Call: `search({query: "foo", unknown: "x"})`.
Assert: throws `VALIDATION_ERROR` (zod `unrecognized_keys`).

### Q-25 → SC-010 Unknown vault → `CLI_REPORTED_ERROR(VAULT_NOT_FOUND)`

Setup: mock `invokeCli` to throw `UpstreamError("CLI_REPORTED_ERROR", {details: {code: "VAULT_NOT_FOUND"}})`.
Call: `search({query: "foo", vault: "NoSuchVault"})`.
Assert: error propagates unchanged (no swallow, no transformation).

### Q-26 — Line-mode flatten drops `matches: []` entries

Setup: mock CLI to return `[{"file":"a.md","matches":[]},{"file":"b.md","matches":[{"line":1,"text":"y"}]}]`.
Call: `search({query: "foo", context_lines: true})`.
Assert: response `{count: 1, matches: [{path:"b.md", line:1, text:"y"}]}`. `a.md` does NOT appear.

### Q-27 — Line text cap: 500 chars verbatim

Setup: mock CLI to return one entry with `text` = `"x".repeat(500)`.
Call: `search({query: "x", context_lines: true})`.
Assert: response `matches[0].text === "x".repeat(500)` (no ellipsis).

### Q-28 — Line text cap: 501 chars → first 500 + ellipsis

Setup: mock CLI with `text = "x".repeat(501)`.
Assert: response `matches[0].text === "x".repeat(500) + "…"`; total length 501.

### Q-29 — Line text cap: 1000 chars → same first-500 + ellipsis

Setup: mock CLI with `text = "x".repeat(1000)`.
Assert: response `matches[0].text === "x".repeat(500) + "…"`.

### Q-30 — Defensive `.md` filter excludes non-`.md` rows (default mode)

Setup: mock CLI to return `["a.md", "b.canvas", "c.md"]` (synthetic; the current upstream wouldn't emit this).
Call: `search({query: "foo"})`.
Assert: response `paths === ["a.md", "c.md"]`; `b.canvas` filtered out (FR-021 defensive).

### Q-31 — Defensive `.md` filter excludes non-`.md` entries (line mode, file level)

Setup: mock CLI to return `[{"file":"a.md","matches":[{"line":1,"text":"x"}]},{"file":"b.canvas","matches":[{"line":1,"text":"y"}]}]`.
Call: `search({query: "x", context_lines: true})`.
Assert: response `matches` contains only the `a.md` row.

### Q-32 — JSON parse failure raises `CLI_REPORTED_ERROR(stage: "json-parse")`

Setup: mock CLI to return stdout `"not json {{{"`.
Call: any.
Assert: throws `UpstreamError("CLI_REPORTED_ERROR", {details: {stage: "json-parse"}})`.

### Q-33 — Wire-schema mismatch raises `CLI_REPORTED_ERROR(stage: "wire-parse")`

Setup: mock CLI to return stdout `'[null]'` (parses to JS array of null — fails wire-schema).
Assert: throws `UpstreamError("CLI_REPORTED_ERROR", {details: {stage: "wire-parse"}})`.

### Q-34 — Response key set is exactly the contract

Call: `search({query: "Welcome"})`.
Assert: `Object.keys(response).sort()` is `["count", "paths"]` (no `truncated` when none).
Then: with `truncated: true` scenario, keys are `["count", "paths", "truncated"]`.
Line-mode equivalent: `["count", "matches"]` (no truncated) OR `["count", "matches", "truncated"]`.

### Q-35 — Repeated identical call returns byte-identical payload

Call `search({query: "foo"})` twice with the SAME mocked `invokeCli` return.
Assert: `JSON.stringify(r1) === JSON.stringify(r2)` (deterministic ordering + assembly).

## Registration scenarios (index.test.ts)

### Q-36 — Tool name is `search`

`createSearchTool(deps).name === "search"`.

### Q-37 — Description non-empty

`createSearchTool(deps).description.length > 0`.

### Q-38 — Input schema published is the zod-derived JSON Schema

Round-trip via `zod-to-json-schema(searchInputSchema)` matches `createSearchTool(deps).inputSchema`.

### Q-39 — Alphabetical registration

`_register.ts` lists `createSearchTool` between `rename` and `set_property` (or wherever it falls alphabetically; verify via `_register-baseline.json`).

### Q-40 — Baseline fingerprint matches

`_register-baseline.json` contains the `search` entry post-`npm run baseline:write`; `_register.test.ts` passes.

## T0 manual probes (post-implementation, against real CLI)

Use the fixture-seeding plan from `data-model.md § Fixture seeding plan`. Probes invoke `obsidian` directly (NOT via MCP) to verify the underlying CLI behaviour the wrapper depends on is still as observed during plan-stage probes F1-F8.

### T0-1 → Q-1 / SC-001 Native search returns paths

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP search query=bi033-single format=json
["Sandbox/BI-033/single-line.md"]
```

### T0-2 → Q-2 / SC-002 Native search:context returns line context

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP "search:context" query=bi033-multi format=json
[{"file":"Sandbox/BI-033/multi-line.md","matches":[{"line":3,"text":"<line 3 content>"}]}]
```

### T0-3 → Q-15 / SC-005 Case flag is exact-match

```
$ obsidian ... search query=bi033-Case case format=json
["Sandbox/BI-033/case-test.md"]
$ obsidian ... search query=bi033-case case format=json
No matches found.
$ obsidian ... search query=bi033-case format=json  # no case flag
["Sandbox/BI-033/case-test.md"]
```

### T0-4 → Q-30 / SC-001 .md-only natively enforced

```
$ obsidian ... search query=bi033-canvas-test format=json
["Sandbox/BI-033/with-canvas.md"]
```

(`.canvas` peer file is NOT returned.)

### T0-5 → Q-5 / SC-003 Path filter segment-bounded

```
$ obsidian ... search query=bi033-nested path=Sandbox/BI-033/Nested format=json
["Sandbox/BI-033/Nested/deep.md"]
```

### T0-6 — Cleanup

Remove all `Sandbox/BI-033/` fixtures after T0 completes. The `Sandbox` parent stays.
