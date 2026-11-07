# Bug Assessment: Classify similarity failures (unembedded source, stale index entry)

- **Slug**: bi-0195
- **Created**: 2026-11-07
- **Source**: pasted text (backlog item BI-0195, with the `/speckit-specify` prompt "Classify similarity failures")
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

Condensed from the pasted BI-0195 text. Filed 2026-11-05 from the black-box validation of the 0.9.0 BIs (post-#145 0.9.0-local build, `TestVault-Obsidian-CLI-MCP` with Smart Connections installed and indexed). Widened the same day (repo-session assessment C5, owner-approved) so the stale-entry part covers `smart_connections_query` too. Two defects:

1. **A source note with no embedding yet returns the plugin's raw error.** The plugin lists a note as a source before it has embedded it, so the "source not indexed" check passes and the plugin's lookup then throws. The tool returns `CLI_REPORTED_ERROR`, message `CLI bridge upstream error: CLI_REPORTED_ERROR`, stdout `Error: Invalid vector input to nearest()`, with no `details.code`. This happens on any brand-new note probed straight after writing, and always on a short note. Evidence: TC-00892 (fail), TC-00899 (fail). The "then results" half of TC-00892 passed about 1–2 minutes later.
2. **One stale index entry fails the whole call.** After a note was moved, the plugin still held an entry for the old location. That entry comes back with an empty path, and the call fails with `smart_connections_similar: eval response shape unexpected` / `details.stage: "envelope-parse"`. A `limit` that cuts just above the stale entry succeeds. Evidence: TC-00225 (fail). The same empty-path entry fails `smart_connections_query` the same way (reproduced in-process, not live).

Acceptance criteria (from the prompt): an unprocessed or very short source gets the "source not indexed" outcome naming the note; the same note gets results once processed; an outdated entry for a moved or deleted note no longer fails `smart_connections_similar` or `smart_connections_query`, and no result has an empty or missing path; not-installed, not-ready and not-Markdown outcomes are unchanged. Out of scope: plugin indexing speed, index repair, any query-tool change beyond skipping outdated entries, and changes to which notes count as similar or to their scores and order. The `details.argv` leak of the internal script is BI-0197, not this BI.

## Symptom

`smart_connections_similar` on a note the plugin has listed but not embedded fails with an untyped `CLI_REPORTED_ERROR` (stdout `Error: Invalid vector input to nearest()`, no `details.code`). It should fail with `details.code: "SOURCE_NOT_INDEXED"` naming the note. Separately, when one of the plugin's candidates has an empty key (a stale entry left by a moved note), both Smart Connections tools fail the whole call at `envelope-parse`. They should drop that entry and return the valid matches.

## Reproduction

Defect 1 (unembedded source):

1. In a vault with Smart Connections 4.7.2 ready, write a new note (or a very short one) under `Sandbox/`.
2. Straight away, call `smart_connections_similar` with `target_mode: "specific"`, the vault, and the note's `path`.
3. Observe `CLI_REPORTED_ERROR`, message `CLI bridge upstream error: CLI_REPORTED_ERROR`, stdout `Error: Invalid vector input to nearest()`, no `details.code`. For a normal-length note the same call returns results one to two minutes later; a short note keeps failing.

Defect 2 (stale entry):

1. In the same vault, move an indexed note whose content is similar to a source note.
2. Before the plugin re-indexes, call `smart_connections_similar` on the source (or `smart_connections_query` with text that matches the moved note) with a `limit` that reaches the stale entry.
3. Observe `CLI_REPORTED_ERROR`, message `smart_connections_similar: eval response shape unexpected`, `details.stage: "envelope-parse"`. A smaller `limit` that stops above the stale entry succeeds.

Both are reproduced in the report (TC-00892, TC-00899, TC-00225). This assessment did not re-run them live. The exact plugin state that turns a moved note into an empty-keyed entry was not reproduced.

Resolved (Relay): whether a moved or deleted note can also leave stale entries that keep its old, non-empty path (for example the moved note's block entries `old.md#Heading`) is **unconfirmed live and not ruled out**: treat it as possible, not observed. TC-00225 saw only `path: ""`, and both TC-00261 runs were blocked. Per the owner ruling of 2026-11-07, "Filter old paths in similar only" (BI-0195 Status), the filters are sized per tool: `smart_connections_similar` leaves out both empty-path entries and entries whose old path no longer resolves to a vault note; `smart_connections_query` leaves out only empty-path entries and still passes non-empty stale paths through verbatim, with no existence check (the BI-0074 Q2 pass-through stands, TC-00261).

Note for the live checks: `.memory/test-execution-instructions.md` says the test vault has no plugins, but `TestVault-Obsidian-CLI-MCP/.obsidian/plugins/smart-connections/` holds Smart Connections 4.7.2 (manifest read during this assessment). The instructions are out of date on this point. They are not edited here, because they are the owner's file.

## Suspected Code Paths

- `src/tools/smart_connections_similar/_template.ts:25-30` — Stage 5 treats a source as indexed when `env.smart_sources.items[f.path]` exists and has a `find_connections` function, then calls `src.find_connections({limit:MAX_LIMIT})` with no check that the source has a vector. In plugin 4.7.2, `find_connections` (smart-sources action, `main.js` around line 7062) calls `this.env.smart_blocks.entities_vector_adapter.nearest(this.vec, …)` and, when blocks are not embedded, the smart-entities `find_connections` (`main.js` around line 5689), which calls `nearest(this, …)`. `nearest` (`main.js:5016-5020`) throws `new Error("Invalid vector input to nearest()")` when the resolved `vec` is not an array or typed array. A source's `vec` getter reads `data.embeddings[embed_model_key].vec` (`main.js:5595-5597`), which is `undefined` until the plugin embeds the note. That is the source of defect 1.
- `src/cli-adapter/_dispatch.ts` (`dispatchCli`) — the rejected eval prints `Error: Invalid vector input to nearest()` on stdout, and the dispatch layer's `Error:`-prefix classification turns it into the generic `CLI_REPORTED_ERROR` with the default message and the argv in `details`. Working as designed; it explains the reported shape. No change needed here.
- `src/tools/_smart-connections.ts:11-12` (`TO_MATCH_JS`) — turns a candidate key into `{path, headingPath, score}`. An empty key gives `path: ""`.
- `src/tools/smart_connections_similar/_template.ts:32-35` and `src/tools/smart_connections_query/_template.ts:18-20` — map each candidate with `toMatch((r.item&&r.item.key)||r.key||'', r.score)` / `toMatch(m.key||'', m.score)` and filter only on `Number.isFinite(score)` (plus self-exclusion on the similar side). Nothing drops a candidate whose path is empty, so it reaches the envelope.
- `src/tools/smart_connections_similar/schema.ts:23-28` and `src/tools/smart_connections_query/schema.ts:39-41` (`matchEntrySchema`, `path: z.string().endsWith(".md")`) — the empty path fails the eval-envelope schema.
- `src/tools/_active-file.ts:84-92` (`decodeEvalEnvelope`) — a schema failure throws `CLI_REPORTED_ERROR` with `details.stage: "envelope-parse"` and the message `<tool>: eval response shape unexpected`. That is the reported failure of defect 2. Working as designed.
- `src/tools/smart_connections_similar/handler.ts:93-99` (`mapEnvelopeError`, `SOURCE_NOT_INDEXED` case) — already maps the envelope code to `CLI_REPORTED_ERROR` with `details: { stage: "envelope-error", code, detail }` and the message `smart_connections_similar: source note has no embedding yet (<path>)`. The fix reuses it unchanged.

## Root Cause Hypothesis

Defect 1 (high confidence): the template's Stage 5 asks only whether the plugin has an entry for the source, while the plugin creates the entry before it embeds the note, and for notes below its size threshold it may never embed them. Calling `find_connections` on an entry without a vector makes the plugin's `nearest()` throw, the eval's promise rejects, and the throw surfaces as the dispatch layer's untyped `CLI_REPORTED_ERROR`. The plugin source read for this assessment (4.7.2, the version in the test vault) shows the throw condition directly. Defect 2 (high confidence on the code path, medium on the plugin trigger): both templates pass every finite-scored candidate through to the envelope, and the envelope schema requires every path to end in `.md`, so one candidate with an empty key fails the whole call. Why a moved note leaves an empty-keyed entry is plugin-internal (an item's `key` is `data.key || get_key()`, and `get_key()` is `data.key || data.path`, so an item whose data has been cleared has no key). The wrapper only needs the observed fact that such an entry can come back. Stale entries that keep a moved or deleted note's old, non-empty path are unconfirmed live but not ruled out (Resolved (Relay), Reproduction); today they pass the schema and come back as valid-looking matches.

## Proposed Remediation

**Preferred**:

*Defect 1.* In `smart_connections_similar/_template.ts` Stage 5, also report `SOURCE_NOT_INDEXED` (same `detail: sourceKey`) when the source has no usable vector, checked with the plugin's own condition before calling `find_connections`: `const v=src.vec; if(!v||(!Array.isArray(v)&&!ArrayBuffer.isView(v)))`. It reads the public `vec` getter and calls nothing, so no plugin state changes. The handler, the envelope schema and the `SOURCE_NOT_INDEXED` mapping stay as they are: the outcome, its message ("source note has no embedding yet") and `details` are exactly the documented ones, so agents see one "not indexed" state whether the entry is missing or not embedded yet. When the plugin embeds the note, `vec` becomes an array and the call returns results (criterion 3). The check sits after the readiness check and before the query, so the ADR-014 precedence (not installed → no active file / not found → not Markdown → not ready → not indexed) is unchanged. No `try/catch` around `find_connections`: matching the plugin's error text would tie the wrapper to one message string, and a broader catch would hide other plugin failures (Principle IV).

*Defect 2.* One in-eval filter per tool, each with its own rule (owner ruling 2026-11-07, "Filter old paths in similar only"; Resolved (Relay) Q1). Each runs after the `toMatch` map and before `SORT_SLICE_AND_EMIT`, so it runs before the sort and the one cut to `a.limit`; the leading-slice guarantee, the tie-break, `count` and the `total` mode then all count only the kept matches.

- `smart_connections_similar/_template.ts`: keep a match only when `app.vault.getAbstractFileByPath(m.path)` returns a file with `extension === "md"`; drop everything else, including empty paths and the old paths of moved or deleted notes. It sits beside the existing self-exclusion filter.
- `smart_connections_query/_template.ts`: drop only matches whose `path` is empty (`m.path!==''`). Every non-empty path passes through verbatim, with no existence check and no `.md`-suffix filter: the BI-0074 Q2 pass-through for stale non-empty paths stands (TC-00261, the Smart Connections Query Caveats).

The two rules differ by ruling, so they are not one shared fragment. Each is used by exactly one template and can be written inline there; a helper in `src/tools/_smart-connections.ts` is fine only if each template picks its own rule. The output schemas stay as they are (`path` still ends in `.md`), so nothing in the published surface or the FR-018 fingerprint changes. Dropped entries are not reported (the acceptance criterion allows "leaving out"); adding a marker field would change the strict three-field match contract (TC-00225).

**Alternatives** (considered; not taken):
- One shared filter for both tools (the original recommendation, Q1 option A for both). Declined by the owner ruling: query keeps its BI-0074 Q2 pass-through for non-empty stale paths.
- Q1 option B (empty paths only) for similar too. Declined: it would still return a moved or deleted note's old path from similar. It is the rule query uses.
- Q1 option C: drop matches whose `path` does not end in `.md`. Not used for either tool; the ruling allows query to drop only empty-path entries.
- Defect 1 via `try/catch` on the plugin's message `Invalid vector input to nearest()` → `SOURCE_NOT_INDEXED`, rethrowing anything else. No change to existing test stubs, but it depends on one plugin's error text and runs the failing call first. Not preferred.
- Defect 1 via the plugin's `is_unembedded`. Rejected: it is also true when the note was edited after its last embedding (`embed_hash !== read_hash`), so it would turn today's "results from the previous version" (documented on the help page) into a failure.

**Files likely to change**:
- `src/tools/smart_connections_similar/_template.ts` (Stage 5 vector check; the vault-note filter; header comment)
- `src/tools/smart_connections_query/_template.ts` (the empty-path filter; header comment)
- `src/tools/_smart-connections.ts` only if a helper is used (each template must still pick its own rule); otherwise unchanged
- `src/tools/smart_connections_similar/_template.test.ts` (new rows; the approved stub edits in Q2)
- `src/tools/smart_connections_similar/handler.lifecycle.test.ts` (new lifecycle rows; the approved stub edits in Q2)
- A new co-located query template test file, e.g. `src/tools/smart_connections_query/_template.stale-entry.test.ts`, for the empty-path rows. The existing `smart_connections_query/_template.test.ts` is not edited (Q2 ruling).
- `docs/tools/smart_connections_similar.md` (SOURCE_NOT_INDEXED row: also "listed but not embedded yet", and very short notes the plugin may never embed; a line on entries for notes that no longer exist being left out), `docs/tools/smart_connections_query.md` (empty-path entries are left out; non-empty stale paths still pass through, as the Caveats already say). Docs are updated by the docs-as-code pass if not in the fix commit.

**Tests to add or update**:
- Lifecycle (`handler.lifecycle.test.ts`, via the registered tool and the eval runner): a source entry with `find_connections` but no `vec` → the SOURCE_NOT_INDEXED failure naming the resolved path, in one spawn; the same with `file` naming the note → `detail` is the resolved path; once `vec` is set on the same entry, the next call returns results (L6-style two-call row); a `find_connections` stub that throws `Invalid vector input to nearest()` when `vec` is missing, so a regression to the old order fails loudly; the not-installed / not-ready / not-Markdown rows unchanged.
- Similar template (`smart_connections_similar/_template.test.ts`): a candidate with an empty key among valid ones → success, the empty-keyed candidate absent, every returned `path` non-empty and ending in `.md`; a candidate whose path no longer resolves to a vault note (moved or deleted note, whole-note key `old.md` and block key `old.md#H`) is absent; the leading-slice property still holds across limits with the stale entries in the fixture (a limit that would have reached one returns the next valid match instead); `total: true` counts the kept matches only.
- Similar lifecycle (`handler.lifecycle.test.ts`): a ready index whose candidates include an empty-keyed entry and an entry for a note not in the simulated vault → success through the registered tool, both absent, one spawn.
- Query template (new co-located file): an empty-keyed candidate among valid ones → success, the empty-keyed candidate absent; a non-empty candidate path that names no vault note still comes back verbatim (pins the BI-0074 Q2 pass-through); the leading-slice property and `total: true` count hold with the empty-keyed entry in the fixture.
- Existing suites (both tools' `handler.test.ts`, `_template.test.ts`, `_smart-connections.test.ts`, `handler.lifecycle.test.ts`) pass with only the Q2-approved stub edits.

## Risks & Considerations

- **Existing test stubs** (Q2, approved for similar only): the stubs in `smart_connections_similar/_template.test.ts` and `handler.lifecycle.test.ts` (`indexed()`) model an indexed source without a `vec`, so the defect-1 check would report them as not indexed, and their vaults know only the source, so the similar filter would drop every candidate. The approved field-only edits cover both. Query's stub needs nothing: its filter does no vault lookup. Any other existing test that fails stops the work and goes to the owner (`.memory/refactor-decisions.md` item 5).
- **Two different rules in two templates**: the tools now drop different stale entries on purpose (owner ruling). A later "tidy into one shared filter" would either break query's BI-0074 Q2 pass-through or weaken similar's filter, so the fix's header comments should name the ruling.
- **ADR-014 wording**: ADR-014 defines `SOURCE_NOT_INDEXED` as "the specific source … has no entry in the plugin's index". The fix also uses it when the entry exists but has no embedding yet. This keeps to the ADR's intent and introduces no new code (Principle IV streak intact), and the handler's message already says "has no embedding yet". The ADR's sentence then reads narrower than the behaviour, so an amendment line on ADR-014 ("no entry, or an entry with no embedding yet") is recommended. Superseding it is not needed.
- **Silently dropped entries**: leaving out outdated entries means `count` can be below `limit` even when the plugin returned 100 candidates. This matches the existing non-finite-score drop (documented on both help pages), so a similar documented line covers it. In similar, a candidate that exists but is not a Markdown file is also dropped. Today it fails the whole call, so no working output changes.
- **Plugin-version coupling**: the vector check reads `src.vec`, a public getter in 4.7.2. If a later plugin version renames it, every source would read as not indexed: a typed, documented failure rather than a wrong result, and the help page's soft version pin (ADR-014 drift policy) covers it.
- **Cost**: the similar filter adds one in-memory `getAbstractFileByPath` per candidate (at most `MAX_LIMIT` = 100) inside the existing eval. No extra spawn, so the one-spawn rule (§H3) holds.
- **Not covered here**: the `details.argv` script leak on the generic `CLI_REPORTED_ERROR` (BI-0197). After this fix, defect 1 no longer reaches that path for this case.

## Open Questions

- **Q1 — Which outdated index entries should the shared filter drop?** Context: the plugin's candidates go through `TO_MATCH_JS` (`src/tools/_smart-connections.ts:11`) in both templates (`smart_connections_similar/_template.ts:33`, `smart_connections_query/_template.ts:19`), and today only non-finite scores are dropped before `SORT_SLICE_AND_EMIT`. The observed outdated entry has an empty key, so its path is `""`, which fails `matchEntrySchema` (`path: z.string().endsWith(".md")`). It is not known whether a moved or deleted note can also leave entries that keep the old path.

  | Option | Description |
  |---|---|
  | A (recommended) | Keep a match only when its path is a Markdown note that exists in the vault now (`app.vault.getAbstractFileByPath`). Drops empty paths and old paths of moved or deleted notes. Needs the template stubs to know the candidate paths (part of Q2). |
  | B | Drop only matches whose path is empty. Fixes the observed failure with the fewest test edits; an outdated entry that keeps its old path is still returned. |
  | C | Drop matches whose path does not end in `.md` (the schema's rule). Same gap as B for old paths; also prevents any other schema-rejected path from failing the whole call. |

  Recommended: A, because the acceptance criterion names entries "for a note that was moved or deleted", and only A leaves out the ones that still carry a real-looking path.

  Resolved (Relay): **a separate filter per tool, not one shared filter** (owner ruling 2026-11-07, "Filter old paths in similar only", BI-0195 Status). `smart_connections_similar` applies A: keep a match only when `app.vault.getAbstractFileByPath(path)` returns a file with extension `md`, and drop everything else, including empty paths and the old paths of moved or deleted notes. `smart_connections_query` applies B only: drop matches whose path is empty, and pass every non-empty path through verbatim with no existence check (the BI-0074 Q2 pass-through stands, TC-00261 and the Smart Connections Query Caveats). No `.md`-suffix filter (C) in query. In both templates the filter runs before the sort and the cut to `limit`. A shared helper is fine only if each template picks its own rule. Proposed Remediation, Files and Tests are updated to match.

- **Q2 — May the fix make field-only edits to existing test stubs?** Per `.memory/refactor-decisions.md` item 5. Proposed scope, and nothing else: (1) add a `vec` array to every stubbed indexed source in `smart_connections_similar/_template.test.ts` (the `items[SRC]` stub) and `smart_connections_similar/handler.lifecycle.test.ts` (`indexed()`); (2) with Q1 = A only, give the template stubs in `smart_connections_similar/_template.test.ts` and `smart_connections_query/_template.test.ts`, and the lifecycle simulated vault, a `getAbstractFileByPath` that knows every candidate note path in their fixtures. No assertion, expected value, title or spawn count may change; any other existing test that fails stops the work and goes to the owner.

  | Option | Description |
  |---|---|
  | A (recommended) | Approve the edits above as written. |
  | B | Decline. Defect 1 would then use the `try/catch` alternative on the plugin's error text, and Q1 is limited to options B or C (no vault lookup). |

  Resolved (Relay): **approved for `smart_connections_similar` only** (owner ruling 2026-11-07, "Approve, similar stubs only", BI-0195 Status). Approved edits, and nothing else: (1) add a `vec` array to the `items[SRC]` stub in `smart_connections_similar/_template.test.ts` and to `indexed()` in `smart_connections_similar/handler.lifecycle.test.ts`; (2) give the `smart_connections_similar/_template.test.ts` stubs and the lifecycle test's simulated vault a `getAbstractFileByPath` that knows every candidate note path in their fixtures. `smart_connections_query/_template.test.ts` is not edited: query's filter drops only empty paths and does no vault lookup, so it needs no stub change (Q1 ruling). No assertion, expected value, test title or spawn count may change. If any other existing test fails, stop and take it to the owner. The defect-1 vector check therefore stays as preferred (no `try/catch`).

## CodeGraph structural check

Queried `executeSmartConnectionsSimilar`, `mapEnvelopeError` (both tools), `executeSmartConnectionsQuery`, `createSmartConnectionsSimilarTool`, `createSmartConnectionsQueryTool`, `TO_MATCH_JS`, `SORT_SLICE_AND_EMIT`, `decodeEvalEnvelope` and `invokeEval`, and checked the kernel nodes.

- **Affected modules**: `src/tools/smart_connections_similar/` (template only) and `src/tools/smart_connections_query/` (template only). The cohort leaf `src/tools/_smart-connections.ts` changes only if the fix adds a helper, and then each template still picks its own rule (Q1 ruling). `SORT_SLICE_AND_EMIT` and `TO_MATCH_JS` are interpolated only by the two Smart Connections templates and are not changed. Each `mapEnvelopeError` has one caller, its own `executeX`; neither changes.
- **Blast radius**: the two templates are reached only through their handlers (`executeSmartConnectionsSimilar` / `executeSmartConnectionsQuery`), which are called from their tools' `index.ts`. The tests that exercise them are the two `_template.test.ts` suites, `handler.lifecycle.test.ts`, `_smart-connections.test.ts` and the two `handler.test.ts` suites; only the two similar suites get the Q2-approved stub edits. The handler suites pin the rendered code against `JS_TEMPLATE` itself (`JS_TEMPLATE.replace("__PAYLOAD_B64__", …)`), not a literal, so a template change needs no edit there. Cross-tool fixtures (`_typed-result-fixtures.ts`, `_plugin-noise.test.ts`) stub the eval answer and are not affected. `decodeEvalEnvelope` and `invokeEval` are shared widely across the eval cohort but are not changed.
- **Kernel nodes**: the fix touches none. `createLogger()` and `createQueue()` are not changed (the tools keep receiving them as injected deps), `createServer()` is not changed, and `UpstreamError` is only constructed through the existing `SOURCE_NOT_INDEXED` branch of `mapEnvelopeError`. No new error code is introduced. The post-fix verification checks against this no-touch claim.
- **Published surface**: no schema, description, title or annotation changes, so `_register-baseline.json` should not move.
