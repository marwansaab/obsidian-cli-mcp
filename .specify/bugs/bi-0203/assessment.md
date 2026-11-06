# Bug Assessment: set_property writes wikilink lists as one scalar and splits list items on commas

- **Slug**: bi-0203
- **Created**: 2026-11-07
- **Source**: pasted text (BI-0203 backlog item; reproductions recorded in vault test cases TC-00904 "Set Property List Of Wikilinks Lands As A YAML List" and TC-00905 "Set Property List Item Containing A Comma Stays One Item"). No URL was supplied, so the URL Trust Policy did not apply.
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

> **Impact.** Wikilink lists (`related`, `depends_on`, `bugs_raised`) are the commonest list properties in every project vault, and Base views and `find_by_property` filter on them. Each write reports success while corrupting the data shape, and later property writes do not repair it. Comma splitting silently changes item content (a name such as `Smith, John` becomes two items).
>
> **Status and evidence.** Queued 2026-11-07, awaiting owner triage. Filed from the imported-tool-notes sweep, reproduced on the published `@marwansaab/obsidian-cli-mcp@0.9.0` from Claude Code (TC-00904, TC-00905). Reported by the Slipwright, Funwright-Studio-Vault, YouTube Channels, Wrightyard and Game-Server-Vault notes; the older notes blamed the Cowork client, but Claude Code sends the array natively and the defect still occurs.
>
> **Defect.** `set_property` with a list `value`:
> - `["[[A]]","[[B]]"]` (with or without `type: "list"`) lands as one quoted scalar, `related: "[[A]],[[B]]"`. `read_property` then reports `type: "list"` with the joined string as value, and Base views show one value.
> - `["one","two, three"]` lands as three items (`one`, `two`, `three`).
> - Plain items (`["x","y"]`) land correctly as a block list.
>
> Raw `obsidian_exec property:set value=[[A]],[[B]] type=list` writes the same scalar, so the array appears to be joined with commas before it reaches the CLI, which splits plain values on commas but not wikilinks. The existing Tool Notes bullet on single-element wikilink lists is likely the same cause.

The report also carries an expected-behaviour draft (feature "Preserve list items"), whose acceptance criteria this assessment adopts as the fix's success criteria:

1. Writing `related` with the items `[[A]]` and `[[B]]` stores a two-item list `[[A]]`, `[[B]]`.
2. The same write without `type` gives the same two-item list.
3. A one-item list holding one link stores a one-item list.
4. Writing the items `one` and `two, three` stores exactly those two items.
5. Reading any such list back returns the same items in the same order.
6. A list of plain words is stored as before.

Out of scope (from the report): repairing notes already damaged by earlier writes; changing how other property types (text, number, date) are written; removing properties.

## Symptom

`set_property` sends a list `value` to the CLI as its items joined with commas. The CLI's comma parsing then either splits items that contain a comma, or, when the joined text starts with `[`, as any list of wikilinks does, stores the whole text as a single quoted scalar. In both cases the tool reports `written: true`. Expected: the note's property holds exactly the items sent, one YAML list item per element.

## Reproduction

Live probes against the authorised test vault (`TestVault-Obsidian-CLI-MCP`, fixtures under `Sandbox/BI-0203/`, since removed) on 2026-11-07. Each probe spawned `obsidian vault=TestVault-Obsidian-CLI-MCP property:set name=related <value> [type=list] path=Sandbox/BI-0203/<n>.md` from Node with an argv array and `shell: false`, which is how `_dispatch.ts` spawns. The resulting frontmatter was then read from disk:

| `value=` argv sent | `type=` | Frontmatter written |
|---|---|---|
| `[[A]],[[B]]` (today's wire for `["[[A]]","[[B]]"]`) | `list` | `related: "[[A]],[[B]]"` (one scalar) |
| `[[A]],[[B]]` | omitted | `related: "[[A]],[[B]]"` (one scalar) |
| `[[A]]` (today's wire for `["[[A]]"]`) | `list` | `related: "[[A]]"` (one scalar) |
| `one,two, three` (today's wire for `["one","two, three"]`) | `list` | `- one` / `- two` / `- three` |
| `x,y` | `list` | `- x` / `- y` (correct) |

This reproduces every symptom in the report from the handler's exact wire form. The two quoted-scalar rows also explain the Tool Notes bullet on single-element wikilink lists: a one-link list hits the same parsing.

## Suspected Code Paths

- `src/tools/set_property/handler.ts:38` `serialiseValue()` is the defect. For a non-empty array it returns `value.join(",")`, so the CLI gets one comma-delimited string and the item boundaries are lost before the spawn. The empty-array branch (`"[]"`) is the one array case that reaches the CLI unambiguously.
- `src/tools/set_property/handler.ts:70` `executeWriteProperty()` is the only caller. It passes the serialised string as the `value` parameter of the single `property:set` `invokeCli` call (all three target modes share it), then returns `{ written: true }` without reading the note back. That return is where the false success becomes visible, and it is faithful to what the CLI accepted.
- The CLI's `property:set` parser (upstream, not in this repository) splits plain text on commas, and stores text that starts with `[` but does not parse as a JSON array as a single string. This parsing is the documented "known limitation" that `specs/018-write-property/research.md` F13 / R9 accepted for commas. The wikilink case was not characterised then.

## Root Cause Hypothesis

The handler flattens a `string[]` into comma-joined text, which the CLI cannot split back into the original items. Text that starts with `[` and is not a valid JSON array becomes a quoted scalar. Plain text is split on every comma, including commas inside items. Confidence: **high**. The probes above reproduce each reported symptom byte for byte from the handler's wire form. The probes below show that the CLI parses a JSON-array `value=` into exactly the items sent, so the information is lost in the wrapper, not upstream.

## Proposed Remediation

**Preferred** (amended by the Open Questions resolution, option B): send an array as a JSON array when the resolved type is `list`. `serialiseValue` takes the resolved type as a second argument (`serialiseValue(value, resolvedType)`; `executeWriteProperty` already computes `resolvedType` with `inferType` just before the call). When `value` is an array and the resolved type is `list` (an inferred or explicit `list`), it returns `JSON.stringify(value)`. `JSON.stringify([])` is the literal `"[]"`, so the empty-list contract (FR-018 / R10) is kept. When `value` is an array and the caller gave an explicit non-list `type`, the output stays byte-identical to today: `"[]"` for an empty array, `value.join(",")` otherwise. Scalar values are unchanged. No other code changes: `inferType`, the three target-mode branches, the schema and the published surface stay as they are. Update the handler's header comment and the comments in `serialiseValue` to describe the JSON wire form for lists (BI-0203), and keep the comma join documented as the explicit non-list-type path only.

Live evidence for the preferred fix (same harness as the reproduction, read back from disk and through `obsidian properties path=… format=json`):

| `value=` argv (JSON) | `type=` | Frontmatter written | Read back |
|---|---|---|---|
| `["[[A]]","[[B]]"]` | `list` | `- "[[A]]"` / `- "[[B]]"` | `["[[A]]","[[B]]"]` |
| `["[[A]]","[[B]]"]` | omitted | `- "[[A]]"` / `- "[[B]]"` | same |
| `["[[A]]"]` | `list` | `- "[[A]]"` | `["[[A]]"]` |
| `["one","two, three"]` | `list` | `- one` / `- two, three` | `["one","two, three"]` |
| `["x","y"]` | `list` | `- x` / `- y` (unchanged from today) | `["x","y"]` |
| `["Smith, John","a \"q\" b","#tag","- dash","[[N\|Alias]]"]` | `list` | five items, YAML-quoted where needed | the same five strings |
| `["7","true","null","2026-01-01"]` | `list` | four items, the first three quoted | the same four strings |
| `["café ✓","[[Café note]]","日本"]` | `list` | three items | identical (`equal: true`) |
| `["line1\nline2","  pad  ",""]` | `list` | block scalar, quoted padding, `""` | identical |

Every acceptance criterion holds on these probes, including the existing plain-word case (criterion 6). The CLI does its own YAML quoting, so the wrapper adds none, which is the same division of labour as FR-021 for scalars.

**Alternatives**:
- Write list properties through an `eval` that calls `app.fileManager.processFrontMatter` with the items as a base64 payload (`composeEvalCode`). That also gives exact items, but it reverses research R2 (native `property:set`, no eval for user values), adds a frozen template and its node:vm tests, and makes `set_property` take a different route for lists than for scalars. Not recommended now that the native subcommand is known to accept a JSON array.
- Escape commas in the joined string. Rejected in R9, and the CLI has no comma escape. It would not fix the wikilink scalar either.

**Files likely to change**:
- `src/tools/set_property/handler.ts` (`serialiseValue` array branch and the header comment)
- `src/tools/set_property/handler.test.ts`
- `docs/tools/set_property.md` (Value serialisation table rows for string[] and the 1-element list; Example 2's argv; the "List elements containing literal `,` characters" known limitation, which this fix removes, plus the matching `obsidian_exec` reference bullet). The docs pass may land in `/speckit-docs-as-code`, but the help page is runtime payload (`help` serves it), so it should move with the fix.

**Tests to add or update**:
- Existing assertions that change, and nothing else (per `.memory/refactor-decisions.md` item 5, these are the full list of existing-test edits): `handler.test.ts` case (5) asserts `value=alpha,beta,gamma` and becomes `value=["alpha","beta","gamma"]`, with "comma-joined" dropped from its title and comment. Case (6) asserts `value=alpha` and becomes `value=["alpha"]`. Case (7) (`value=[]`) and all scalar cases stay byte-identical. `set_property/index.test.ts`, `_typed-result-fixtures.ts` and `_plugin-noise.test.ts` use only scalar values and are untouched.
- New `handler.test.ts` case locking the explicit non-list-type path (owner ruling, option B): `value: ["a","b"], type: "text"` gives argv `value=a,b` with `type=text` (stored as the text `a,b`, byte-identical to today).
- New `handler.test.ts` cases: `["[[A]]","[[B]]"]` without `type` gives argv `value=["[[A]]","[[B]]"]` with `type=list`; the same with explicit `type: "list"`; `["[[A]]"]` gives `value=["[[A]]"]`; `["one","two, three"]` gives `value=["one","two, three"]` as one argv element; an item containing `"` and `\` is JSON-escaped (round-trips through `JSON.parse` to the input); the specific+file and active modes carry the same JSON wire form on their `property:set` call.
- Live-CLI confirmation of TC-00904 and TC-00905 during `/speckit-bug-test`, following `.memory/test-execution-instructions.md` (authorised test vault, `Sandbox/` only), including a `read_property` read-back of each list.

## Risks & Considerations

- **Explicit non-list `type` with an array value.** A probe showed that sending the JSON form with an explicit `type=text` writes a list (`value=["a","b"] type=text` wrote a two-item list), while today's `value=a,b type=text` writes the text `a,b`. Under the resolved option B, the JSON form is sent only when the resolved type is `list`, so this combination keeps today's comma-joined wire form and output byte for byte, and a new test locks it. The comma limitation therefore still applies to an array written with an explicit non-list type. That is intended: the report puts other property types out of scope.
- **Arguments on Windows.** The JSON form puts `"` characters into an argv element. `_dispatch.ts` spawns with `shell: false`, and Node quotes argv for `CreateProcess`. The probes used that same spawn path against `Obsidian.com` and round-tripped quotes, backslash-escaped quotes, non-ASCII text and newlines. Under PowerShell 5.1 the quotes are stripped from native arguments, which is a hazard for hand-typed `obsidian_exec`-style reproductions only, not for the server. CI covers Linux and Windows at the unit level only (the spawn is stubbed).
- **YAML style.** Items the CLI considers ambiguous are quoted (`"[[A]]"`, `"7"`, `"#tag"`). This is standard Obsidian frontmatter output, and Obsidian, Bases and `find_by_property` read the values as strings. Plain items stay unquoted, so criterion 6 holds byte for byte (`- x` / `- y`).
- **Strings with `type: "list"` are unchanged.** A string `value` (for example `"a,b"` with `type: "list"`) still passes through verbatim and is still comma-split by the CLI. It is not an array, so it is outside the report.
- **No new error codes, no schema change, no published-surface change.** The tool description, parameter descriptions and the schema fingerprint baseline (`_register-baseline.json`) do not move. The spawn count per mode is unchanged.
- **Security**: none new. User values still flow as one discrete argv element to a native subcommand, never into eval source (R2 holds).
- **Existing damaged notes stay damaged** (out of scope). A later `set_property` write of the list now repairs that property, because `property:set` replaces the value.

## CodeGraph structural check

- **Affected module**: `src/tools/set_property/` only. `serialiseValue` and `inferType` are exported from `handler.ts`, but their only caller is `executeWriteProperty` in the same file. No other module or test imports them (grep confirms). `executeWriteProperty` is reached only through `createSetPropertyTool` (`index.ts`), which `server.ts` and `_typed-result-fixtures.ts` construct.
- **Blast radius**: the single `property:set` call shared by all three target modes, plus `set_property/handler.test.ts`. `read_property` and `find_by_property` are separate modules with no import edge to `set_property`. They gain correct list data on disk but no code changes.
- **Kernel nodes**: the fix touches **none** of them (`createLogger()`, `createQueue()`, `UpstreamError`, `createServer()`). The handler keeps using the injected `deps.logger` / `deps.queue` through `invokeCli`, and no failure classification changes.

## Open Questions

- An array `value` sent with an explicit non-list `type` (for example `type: "text"`) changes from comma-joined text to a list under the preferred fix. Should it?
  - **Option A (recommended)**: yes. Every array goes out as JSON, and `serialiseValue` stays one rule (`JSON.stringify` for arrays). The agent's items are kept exactly as sent, which is the feature's stated goal. Today's output for this combination (`a,b` as text) is itself the lossy join this bug removes. The combination is an undocumented contradiction that R6 already leaves to the CLI.
  - **Option B**: no. Send JSON only when the resolved type is `list`, and keep the comma join for an array with an explicit non-list type, so that combination stays byte-identical to today. This costs a second argument to `serialiseValue` and keeps the lossy join alive for that case.

  **Resolved (Relay):** Option B. Send JSON only when the resolved type is `list`. When the caller sends an array with an explicit non-list `type`, keep today's output byte for byte. Pass the resolved type into `serialiseValue`, and add one test that locks `value: ["a","b"], type: "text"` → the text `a,b`. Rationale (owner): the report's Out of scope excludes "Changing how other property types (text, number, date) are written". The `set_property` feature page (FEAT-014) says an explicit `type` is honoured, and its "Type-mismatch" edge case rules out silent coercion. Option A would turn a text-typed write into a list and ignore the type the caller asked for. The Proposed Remediation, Tests and Risks sections above are updated to match. The root cause and the files to change are unchanged.
