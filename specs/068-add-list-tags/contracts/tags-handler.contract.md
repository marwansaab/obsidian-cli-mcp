# Contract: `executeTags` handler invariants

**Feature**: [../spec.md](../spec.md) | **Research**: [../research.md](../research.md)

## H1 — Exactly one CLI call per valid request; zero per invalid request

`registerTool` parses input before the handler runs, so validation failures never reach `invokeCli`. A valid request performs exactly one `invokeCli` call. The ADR-029 cold-start retry happens inside dispatch and is invisible at this layer.

## H2 — Call shape

```ts
invokeCli({
  command: "tags",
  target_mode: "specific",          // ALWAYS — avoids invokeCli's active-mode file/path strip (research R3)
  vault: input.vault,               // undefined in active mode → no vault= in argv → focused vault
  parameters: { format: "json", ...(file && { file }), ...(path && { path }) },
  flags: activeOnly ? ["counts", "active"] : ["counts"],
}, { spawnFn, env, logger, queue })
```

Never sent: `sort`, `total`, `format=tsv` / `format=csv`.

## H3 — Reply interpretation

| Trimmed stdout | Result |
|---|---|
| `No tags found.` | `{ total: 0, tags: [] }` |
| JSON array matching the upstream schema | transform (H4) |
| not JSON | `UpstreamError` `CLI_REPORTED_ERROR`, `details: { stage: "json-parse", stdout }`, `cause` = the SyntaxError |
| JSON that does not match the upstream schema | `CLI_REPORTED_ERROR`, `details: { stage: "shape-parse", stdout }`, `cause` = the ZodError |
| an entry with a missing or non-`/^\d+$/` count | `CLI_REPORTED_ERROR`, `details: { stage: "count-parse", tag, count }` |

## H4 — Transform

1. Set `name = tag.startsWith("#") ? tag.slice(1) : tag`, stripping exactly one `#`.
2. Set `count = Number(countString)`.
3. Sort with `compareTagNames`, or by count descending and then `compareTagNames`.
4. If `includeCounts === false`, emit `{ name }` with no `count` key.
5. Set `total = tags.length`.

## H5 — Error pass-through

| Error | Handling |
|---|---|
| `UpstreamError` with `code === "ERR_NO_ACTIVE_FILE"` | rethrown as a new `UpstreamError({ code: "ERR_NO_ACTIVE_FILE", cause: original, details: { ...original.details, tool: "tags" }, message: <tags-specific: focus a note, or use file / path> })` |
| every other error | propagates unchanged |

There is no `catch` that returns an empty or default result.

## H6 — Acceptance-criterion → test map

The `index` / `schema` / `handler` columns name the test file. Every test title is prefixed with `AC n —` (FR-020).

| AC | Layer | Test sketch |
|---|---|---|
| 1 | handler | vault-wide fixture JSON → entries with counts; argv contains no `file` / `path` / `active` |
| 2 | handler | `file: "Alpha"` → argv `file=Alpha`; note-scoped fixture |
| 3 | handler | `path: "x/Alpha.md"` → argv `path=…`; output identical to AC 2 for the same stdout |
| 4 | handler | `activeOnly: true` → argv flag `active`; in active mode, argv has no `vault=` |
| 5 | handler | default order `Aardvark, aardvark, Banana`; `sortByCount` count-desc with comparator ties; ignores upstream order |
| 6 | handler | `includeCounts: false` → `Object.hasOwn(e, "count") === false` for every entry |
| 7 | handler | `No tags found.` → `{ total: 0, tags: [] }`, for both vault-wide and note scopes |
| 8 | handler + T0 | stub replays the live reply for a vault whose `#fencedonly` exists only in a fence → absent; T0 live re-check |
| 9 | schema | every pair and the triple of `file` / `path` / `activeOnly: true` → fail; `activeOnly: false` + `file` → pass; spawn recorder sees 0 calls (index layer) |
| 10 | schema | specific without `vault` → issue path `["vault"]` |
| 11 | schema + index | `{ …, bogus: 1 }` → fail. The index-layer test names the server-side pathway (client-class note) and asserts 0 spawns |
| 12 | schema | active + `vault` → issue path `["vault"]` |
| 13 | handler | stdout `Error: No active file. Use file=<name> …` → `ERR_NO_ACTIVE_FILE`, message mentions `file` and `path`, `cause` preserved |
| 14 | index | `docs/tools/tags.md` exists, has the required section headings and four example headings; catalogue lists `tags` |
| 15 | all | the suite is deterministic (no clock, no randomness, fixtures inline); run twice in CI (`vitest run`) |
| 16 | handler | fixture tags shaped like built-ins (`todo`, `excalidraw`, `daily-note`) returned verbatim like any other tag |
| FR-012 | schema | `../x.md`, `/x.md`, `C:/x.md`, `a/../b.md`, `x\u0000.md` → fail |
| FR-015 | handler | stdout `Vault not found.` → `CLI_REPORTED_ERROR`, `details.message` |
| FR-016 | handler | stdout `Error: File "Missing" not found.` → `CLI_REPORTED_ERROR` (not an empty list) |
| FR-018 | handler | stub exceeding the cap → `CLI_OUTPUT_TOO_LARGE` |
| R3 | handler | active mode + `file` → argv still contains `file=…` (no silent strip) |
