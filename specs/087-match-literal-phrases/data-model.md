# Data model: Match literal phrases

**Spec**: [spec.md](spec.md) | **Research**: [research.md](research.md) | **Contract**: [contracts/literal-phrase-contract.md](contracts/literal-phrase-contract.md)

No published schema changes. The entities below are the in-memory values the two handlers pass between steps. Only E2 and E4 are new.

## E1. Query (unchanged)

The validated `input.query` of `search` or `context_search` (`z.infer` of the existing input schemas): 1 to 1000 characters, not empty after trimming. The trim is used only by the validation check; the value passed on is untrimmed (spec Clarification Q2).

- **V1**: every character of E1, including leading, trailing and internal whitespace, reaches the CLI inside E2 unchanged, apart from the two escapes.

## E2. Literal phrase query (new)

The string sent as the CLI's `query=` parameter: `"` + E1 with `\` → `\\` and `"` → `\"` + `"`. It is built by `literalPhraseQuery` (research D1).

- **V2**: unescaping E2 (drop the outer quotes, then map `\\` → `\` and `\"` → `"`, left to right) gives E1 exactly. This is pinned by contract rows L1 to L6.
- **V3**: E2 is used for every text-search mode: `search` (`search` subcommand), `search` with `context_lines: true`, and `context_search` (both through the `search:context` subcommand).

## E3. Wire file (unchanged type)

`SearchContextWireFile` (`src/tools/search/schema.ts`): `{ file, matches: [{ line, text }] }`, the parsed `search:context` output. The CLI may repeat a `{ line, text }` entry once per occurrence of the phrase in that line (research F8). Its `text` is the line with leading and trailing whitespace trimmed by the CLI (research F9).

## E4. Per-line wire (new value, same type)

The output of `oneMatchPerLine(E1, E3[])`: the same files in the same order, where:

- **V4**: no two entries in one file's `matches` share a `line`. The entry kept is the first for that line in wire order, and its `text` is unchanged.
- **V5**: if E1 contains `\n` or `\r`, every file's `matches` is empty.
- **V6**: the input array and its objects are not mutated.

## E5. Line-level row and output (unchanged types)

`SearchLineMatch` / `ContextSearchMatch` `{ path, line, text }`, and the existing `{ count, matches, truncated? }` outputs. Each handler builds them from E4 instead of E3, with its existing steps:

- `search` line mode: text cap only;
- `context_search`: trailing-`\r` strip, then text cap.

After that come the `flat.length >= appliedCap` truncation test, the `(path, line)` sort and the slice.

- **V7**: `count` equals the number of distinct `(path, line)` pairs kept, up to the cap (FR-006).

## Per-call flow (line-level modes)

```text
input (E1) ──validate (unchanged)──► literalPhraseQuery ──► E2 as query=
   └──► invokeCli(search:context, …) ──► sentinel? ──► (context_search: folder probe, unchanged) ──► empty
                                     └─► JSON.parse ─► wire parse (E3) ─► .md filter ─► oneMatchPerLine (E4)
                                                       ─► flatten (E5) ─► truncation test ─► sort ─► slice ─► output
```

Default path mode follows the same flow up to `invokeCli(search, …)`. It then parses the path array exactly as today; there are no rows to reduce.
