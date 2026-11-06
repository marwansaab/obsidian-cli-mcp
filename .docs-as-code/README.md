# obsidian-cli-mcp — documentation as code

This tree describes the system **as built**. It is written in Markdown,
reviewed in the same pull request as the code it describes, and kept true one
PR at a time by `/speckit-docs-as-code`
([.claude/skills/speckit-docs-as-code/SKILL.md](../.claude/skills/speckit-docs-as-code/SKILL.md)).
That skill runs on each PR after code review and before merge.

It is not a specification, a plan or a rulebook. Those exist and do their own
jobs:

| If you want | Read |
| --- | --- |
| The rules every change is held to | [.specify/memory/constitution.md](../.specify/memory/constitution.md) |
| What a feature was asked to do, and why | `specs/<NNN>-<name>/spec.md` |
| Install, client configuration, multi-vault behaviour | [README.md](../README.md) |
| Development environment and commit convention | [CONTRIBUTING.md](../CONTRIBUTING.md) |
| One tool's full contract — inputs, outputs, errors, examples | `docs/tools/<tool>.md` (also served at runtime by `help`) |
| What changed in each release | [CHANGELOG.md](../CHANGELOG.md) |
| **What the system is, and how it hangs together** | **this tree** |

Pages here link to those sources rather than copying them, because a copy
drifts and the copy is the one somebody ends up trusting.

## The pages

The baseline was written on 2026-10-24 from `main` at `b8b6fef` (package
version 0.8.11), after PR #82. Each later run of `/speckit-docs-as-code`
extends it.

- [architecture.md](architecture.md) — the boot, runtime and error spines;
  dual-era serving on SDK v2 `McpServer` and the registration adapter; tool
  titles, behaviour hints, published parameter descriptions and the server
  instructions; typed results (`outputSchema` and `structuredContent`); the
  owner's access settings; the per-call scope (cancellation, progress and
  confirmation); the queue, dispatch, cold-start retry and auto-launch; error classification and
  sub-discriminators; `target_mode`; file types and the resolved target
  (PR #97); renamed parameters and their deprecated aliases (PR #101); the
  direct-filesystem write path; the
  `eval` template pattern and the per-call answer tag that keeps other
  plugins' output out of it (PR #110); the hand-run release check that
  proves non-ASCII text survives that route (PR #144); the description
  budget and its audit (PR #143); logging, shutdown and module layout.
- [tech-stack.md](tech-stack.md) — what the server is built from, why each
  piece is here, and what it forces or rules out, including the current
  version holds.
- Capabilities, one page per tool group, in the same groups as the README's
  Tool inventory:
  - [capabilities/read.md](capabilities/read.md) — `read`, `read_heading`,
    `read_property`, and how `read` returns a file's exact text (PR #102).
  - [capabilities/search-and-discovery.md](capabilities/search-and-discovery.md)
    — the four searches, `find_by_property`, `tag`, `links`, `backlinks`,
    `open_file`, `get_active_file`.
  - [capabilities/mutate.md](capabilities/mutate.md) — the direct-filesystem
    write cohort, what `bytes_written` reports (PR #103),
    `find_and_replace` and its missing-note envelope for both locator forms
    (PR #134), how its regex replacements keep lookaround context
    (PR #149), `prepend` and its empty-body correction (PR #104)
    and missing-note check (PR #105), its UTF-8 byte limit (PR #106),
    line endings and the placement check in `patch_heading` and
    `patch_block` (PR #119), how they resolve a note name (PR #122),
    `set_property`, `delete`, `rename`, `move`.
  - [capabilities/list-and-inventory.md](capabilities/list-and-inventory.md) —
    `files`, `paths`, `outline`, `properties`, `vaults`.
  - [capabilities/bases.md](capabilities/bases.md) — `bases`, `views_base`,
    `query_base`, `create_base`, and their routing by the named vault
    (PR #114).
  - [capabilities/plugin-backed.md](capabilities/plugin-backed.md) — the two
    Smart Connections tools, and how `limit` cuts one fixed, sorted
    candidate list (PR #116), and how one shared fragment turns a plugin
    block key into a match (PR #141).
  - [capabilities/escape-hatch-and-meta.md](capabilities/escape-hatch-and-meta.md)
    — `obsidian_exec`, its default-off code-execution gate, and `help`.

## Decisions

ADR numbers form one series for the whole project. ADR-001 to ADR-032 are
kept in the maintainer's working notes, outside this repository, and are
cited here by number and title in plain text. New decision records written
from a PR go in `decisions/ADR-NNN-<slug>.md`, continuing the series from the
highest number already used anywhere. A number is never reused, and a
superseded record keeps its number and links forward to the one that replaced
it.

The baseline adds no new records. Every decision visible in the tracked
history is already an ADR in the series, and the pages cite it where it
applies. Records written since:

- [decisions/ADR-039-dual-era-stdio-serving-on-sdk-v2-mcpserver.md](decisions/ADR-039-dual-era-stdio-serving-on-sdk-v2-mcpserver.md)
  — the server moves to MCP SDK v2 `McpServer` behind a pass-through input
  adapter, split composition root and dual-era `serveStdio`; supersedes
  ADR-036 and the BI-067 low-level `Server` decision (PR #89).
- [decisions/ADR-040-published-parameter-descriptions-and-server-instructions.md](decisions/ADR-040-published-parameter-descriptions-and-server-instructions.md)
  — every tool publishes a title, four behaviour hints and a description on
  every parameter, and the server sends instructions carrying the
  cross-cutting rules; supersedes ADR-005 (PR #90).
- [decisions/ADR-041-exec-gate-matches-the-command-field.md](decisions/ADR-041-exec-gate-matches-the-command-field.md)
  — `obsidian_exec`'s code-execution gate matches the `command` field, and
  the schema refuses `=` in it (PR #88). It was numbered while ADR-040 was
  reserved by the 068 plan; ADR-040 landed with PR #90.
- [decisions/ADR-042-typed-results-checked-in-registertool.md](decisions/ADR-042-typed-results-checked-in-registertool.md)
  — typed results publish through a pass-through output adapter with an
  object root for unions of objects, and `registerTool`, not the SDK, checks
  each success so drift is the `INTERNAL_ERROR` envelope (PR #91).
- [decisions/ADR-043-call-scope-on-deps-and-throwing-confirmation.md](decisions/ADR-043-call-scope-on-deps-and-throwing-confirmation.md)
  — the request's signal and progress reporter ride on each call's deps,
  passed whole to `invokeCli`, and confirmation is a two-step `Confirmation`
  whose `confirm` throws the `input_required` prompt back through
  `registerTool` (PR #92).
- [decisions/ADR-044-file-path-tools-check-the-resolved-file-and-keep-its-type.md](decisions/ADR-044-file-path-tools-check-the-resolved-file-and-keep-its-type.md)
  — file-path tools declare the types they handle and check the file they
  will act on before changing anything; `rename` and `move` keep a file's
  type; active calls forward the resolved `path=` with no `vault=`, the
  path review argued the PR into (PR #97).
- [decisions/ADR-045-closed-vaults-recovered-only-by-the-dispatch-retry.md](decisions/ADR-045-closed-vaults-recovered-only-by-the-dispatch-retry.md)
  — the ADR-029 cold-start retry is the only closed-vault handling; the six
  per-tool `not-open` stages are deleted, and the post-retry error is
  documented as "vault unavailable" rather than given a new sub-reason
  (PR #100); amended on 2026-11-04 so the help pages, not the descriptions,
  carry it (PR #143).
- [decisions/ADR-046-shared-parameter-names-within-a-tool-family.md](decisions/ADR-046-shared-parameter-names-within-a-tool-family.md)
  — within a tool family one concept carries one snake-case parameter name;
  seven parameters on three tools are renamed, with the old names accepted
  until the next major release (PR #101). Numbered ADR-046 at the vault sync
  on 2026-11-01: by the owner's ruling on spec 073 (clarify Q2) the canonical
  copy is in the vault, and this mirror is kept byte-equal to it.
- [decisions/ADR-047-read-corrects-the-cli-text-from-two-disk-facts.md](decisions/ADR-047-read-corrects-the-cli-text-from-two-disk-facts.md)
  — `read` keeps its CLI call and undoes the CLI's added final line feed and
  dropped byte-order mark from two facts read from disk, rather than
  returning the disk text; a failed disk read is `FS_WRITE_FAILED` /
  `read` (PR #102). Numbered 047 because ADR-046 is the number spec 073's
  plan gave the record above.
- [decisions/ADR-048-bytes-written-is-the-size-change.md](decisions/ADR-048-bytes-written-is-the-size-change.md)
  — `bytes_written` means the size change (after minus before, a new note
  counting as 0) on the five single-note text writers; `write_note` gains it
  and fails before writing if it cannot measure the old note (PR #103).
- [decisions/ADR-049-prepend-keeps-obsidians-write-and-removes-the-added-line-break.md](decisions/ADR-049-prepend-keeps-obsidians-write-and-removes-the-added-line-break.md)
  — `prepend` keeps Obsidian's write and, in default mode, removes the LF it
  adds to an empty or properties-only note through `writeAtomic`, rather than
  moving to the direct-write path with its own frontmatter parser (PR #104).
- [decisions/ADR-050-prepend-checks-the-note-on-disk-before-calling-obsidian.md](decisions/ADR-050-prepend-checks-the-note-on-disk-before-calling-obsidian.md)
  — `prepend` reports a missing note from its pre-call `stat` before
  Obsidian is called and from Obsidian's confirmed line after, and one
  shared `noteNotFound` builder, the location review argued the PR into,
  reports it for the single-note writers (PR #105).
- [decisions/ADR-051-prepend-caps-content-in-utf-8-bytes-as-a-second-limit.md](decisions/ADR-051-prepend-caps-content-in-utf-8-bytes-as-a-second-limit.md)
  — `prepend` caps `content` at 3072 UTF-8 bytes beside its character cap,
  checked in the schema and reported as `CONTENT_TOO_LARGE` with
  `details.reason: "bytes"`; the character limit wins through zod's `abort`
  flag, the placement review argued the PR into (PR #106).
- [decisions/ADR-052-typed-evals-carry-a-per-call-answer-tag.md](decisions/ADR-052-typed-evals-carry-a-per-call-answer-tag.md)
  — every typed `eval` goes through `invokeEval`, which tags the call's answer
  line so other plugins' output around it is ignored, and dispatch reads
  `eval` output line by line; carries out the 2026-11-01 amendment to
  ADR-029, in the separate entry point review argued the PR into (PR #110).
- [decisions/ADR-053-create-base-contains-a-named-vault-item-and-reports-an-escape-it-cannot-prevent.md](decisions/ADR-053-create-base-contains-a-named-vault-item-and-reports-an-escape-it-cannot-prevent.md)
  — a named-vault `create_base` realpath-checks `base_path` and the item
  folder an eval template derives before creating, and checks the `Created:`
  path afterwards, reporting an escape with `createdPath` and never deleting;
  the template scans block YAML because the eval context has no parser, and
  the owner kept it over the TypeScript scanner review proposed (PR #114).
- [decisions/ADR-054-help-pages-are-checked-against-the-offered-tools-by-a-test.md](decisions/ADR-054-help-pages-are-checked-against-the-offered-tools-by-a-test.md)
  — the help pages and `index.md` must name exactly the tools a default
  server offers, checked by a test rather than at boot or by filtering
  `help`, reading pages through the `listToolPages` the review extracted
  (PR #115).
- [decisions/ADR-055-smart-connections-tools-fetch-a-fixed-candidate-list-before-sorting.md](decisions/ADR-055-smart-connections-tools-fetch-a-fixed-candidate-list-before-sorting.md)
  — both Smart Connections tools ask the plugin for 100 candidates on every
  call and cut to `limit` only after the documented sort, so a smaller
  `limit` is a leading slice of a larger one; the full plugin set and a
  bigger fetch were rejected (PR #116).
- [decisions/ADR-056-section-edits-keep-each-lines-ending-and-refuse-an-unsafe-placement.md](decisions/ADR-056-section-edits-keep-each-lines-ending-and-refuse-an-unsafe-placement.md)
  — `patch_heading` and `patch_block` split the lines they edit where their
  finders split, keep each line's own ending, and refuse an edit that would
  not keep the bytes around it with `UNSAFE_PLACEMENT`; normalising the note
  and a file-wide ending were rejected, and review moved the split and the
  check into one shared module (PR #119).
- [decisions/ADR-057-text-searches-send-the-query-as-one-escaped-literal-phrase.md](decisions/ADR-057-text-searches-send-the-query-as-one-escaped-literal-phrase.md)
  — `search` and `context_search` send the query as one double-quoted
  phrase with `\` and `"` escaped, so Obsidian search syntax is text, and
  their line-level modes list each line once through one shared
  `lineMatches` pipeline the review argued the PR into; wrapper-side
  filtering and an `eval` search were rejected (PR #120). Its quoting
  decision is superseded by ADR-063.
- [decisions/ADR-058-context-search-reads-matched-lines-back-and-fails-when-one-cannot-be.md](decisions/ADR-058-context-search-reads-matched-lines-back-and-fails-when-one-cannot-be.md)
  — `context_search` reads its selected lines back from the notes through a
  batched `eval` under a fixed code budget and fails the whole call with
  `MATCH_LINE_UNAVAILABLE` when one cannot be; reading from disk, an
  unbounded `eval` and a trimmed fallback were rejected, and review replaced
  `lineMatches` with `selectLines` and `lineOutput` (PR #121).
- [decisions/ADR-059-section-editors-resolve-note-names-through-the-shared-lookup.md](decisions/ADR-059-section-editors-resolve-note-names-through-the-shared-lookup.md)
  — `patch_heading` and `patch_block` resolve a `file` name through the
  shared `resolveFsTarget` lookup and pass its not-found failure through
  unchanged, as `read` gives it; a `NOTE_NOT_FOUND` conversion and a
  literal-path fallback were rejected (PR #122).
- [decisions/ADR-060-move-classifies-its-failure-after-the-cli-and-keeps-the-vault-folder-out.md](decisions/ADR-060-move-classifies-its-failure-after-the-cli-and-keeps-the-vault-folder-out.md)
  — `move` classifies a failure only after the CLI reports it, turning the
  ENOENT rename line into `FOLDER_NOT_FOUND` and rewriting the vault's
  absolute folder out of every other failure, withholding the text when the
  root cannot be looked up; a pre-check, withholding everywhere and a
  before-the-move lookup were rejected (PR #123).
- [decisions/ADR-061-obsidian-exec-fails-an-unknown-vault-only-on-the-exact-answer.md](decisions/ADR-061-obsidian-exec-fails-an-unknown-vault-only-on-the-exact-answer.md)
  — `obsidian_exec` fails with the typed tools' `CLI_REPORTED_ERROR` /
  `Vault not found.` only when the call names a vault and its whole trimmed
  stdout is exactly that answer, checked in the raw facade after dispatch;
  the typed tools' prefix rule and a private copy of the literal were
  rejected (PR #124).
- [decisions/ADR-062-write-note-resolves-names-through-the-shared-lookup-and-creates-only-on-obsidians-not-found.md](decisions/ADR-062-write-note-resolves-names-through-the-shared-lookup-and-creates-only-on-obsidians-not-found.md)
  — `write_note` looks a `file` name up with the shared `obsidian file`
  lookup and falls back to its vault-root rule only on Obsidian's not-found
  answer, owned by `_active-file.ts` as review argued the fix into; a lock is
  the cohort's `EXTERNAL_EDITOR_CONFLICT`; failing on a miss, a disk scan and
  a vault-confirming eval were rejected (PR #127, PR #128).
- [decisions/ADR-063-text-searches-send-the-query-as-an-escaped-regular-expression.md](decisions/ADR-063-text-searches-send-the-query-as-an-escaped-regular-expression.md)
  — `search` and `context_search` send the query as `/…/` with every regex
  syntax character and `/` escaped, because a quoted phrase matched whole
  words only; it supersedes ADR-057's quoting decision, and raw single-word
  queries, an `eval` search and a shared escape module (deferred) were not
  taken (PR #130).
- [decisions/ADR-064-tags-are-compared-and-returned-without-one-leading-hash.md](decisions/ADR-064-tags-are-compared-and-returned-without-one-leading-hash.md)
  — `find_by_property` and `read_property` remove one leading `#` from
  `tags` values (the exact key only), because Obsidian's cache holds them
  with or without it; the rule lives in `_tag-hash.ts` with an in-eval
  fragment, as review argued the fix into; query expansion, the `#` form and
  forcing the cache were rejected (PR #131).
- [decisions/ADR-065-pattern-search-sorts-notes-before-its-capped-scan-and-owns-result-order.md](decisions/ADR-065-pattern-search-sorts-notes-before-its-capped-scan-and-owns-result-order.md)
  — `pattern_search`'s template sorts notes by path before its capped scan,
  so `limit` keeps the leading matches, and it owns result order, as review
  argued the fix into; a handler-side sort and slice, a collect-all template
  and keeping the handler's re-sort were rejected (PR #132).
- [decisions/ADR-066-find-and-replace-reports-a-missing-named-note-as-invalid-note.md](decisions/ADR-066-find-and-replace-reports-a-missing-named-note-as-invalid-note.md)
  — `find_and_replace` reports a `file` name Obsidian cannot find with the
  documented `INVALID_NOTE` / `not-found` envelope a missing `path` already
  gave, through the shared null-on-miss lookup and one builder; BI-0171's
  pass-through shape and a handler-side match of Obsidian's text were
  rejected (PR #134).
- [decisions/ADR-067-deprecated-aliases-carry-the-type-only-and-the-current-name-keeps-its-checks.md](decisions/ADR-067-deprecated-aliases-carry-the-type-only-and-the-current-name-keeps-its-checks.md)
  — a deprecated alias field carries the value's type only, so an empty
  old-name value is reported under the new name; the current-name keys keep
  their published `.min(1)`, so issue-list parity holds for one mistake only;
  the `deprecated_parameters` notice is for successful calls; moving the
  checks into the folded schema was rejected (PR #135).
- [decisions/ADR-068-a-vault-root-that-cannot-be-resolved-fails-as-the-vaults-folder.md](decisions/ADR-068-a-vault-root-that-cannot-be-resolved-fails-as-the-vaults-folder.md)
  — the canonical-path guard realpaths a registered vault's root first and
  classifies only that failure, as `VAULT_NOT_FOUND` / `folder-missing` or a
  `vault-root-check` stage, with no disk path; mapping any escaping errno,
  re-probing the root after the check, and a third check outcome were
  rejected (PR #136).
- [decisions/ADR-069-a-disabled-command-line-fails-in-dispatch-on-the-exact-notice.md](decisions/ADR-069-a-disabled-command-line-fails-in-dispatch-on-the-exact-notice.md)
  — with Obsidian's command line switched off, dispatch fails the CLI's
  exit-0 notice for every surface as `CLI_REPORTED_ERROR` /
  `cli-disabled`, on an exact whole-output match and single-shot;
  facade-level rules, a prefix match and a new `details.code` were rejected
  (PR #137).
- [decisions/ADR-070-the-focused-vaults-name-is-looked-up-again-on-a-miss-and-never-falls-back-to-its-folder.md](decisions/ADR-070-the-focused-vaults-name-is-looked-up-again-on-a-miss-and-never-falls-back-to-its-folder.md)
  — the vault registry's reverse lookup probes once on a miss, and the
  active-mode name helper fails as `VAULT_NOT_FOUND` /
  `focused-unregistered` instead of using the folder path as the name;
  start-up priming in `server.ts`, fail-loud without a probe and a separate
  refresh method were rejected (PR #138).
- [decisions/ADR-071-move-checks-a-blocked-destination-on-disk-after-the-rename-fails.md](decisions/ADR-071-move-checks-a-blocked-destination-on-disk-after-the-rename-fails.md)
  — after an ENOENT or ENOTDIR rename failure `move` runs one eval that
  walks the destination folder's prefixes through `adapter.stat` and reports
  a file in the way as `NOT_A_FOLDER`, amending ADR-060's no-lookup reading
  of the ENOENT line; Obsidian's index (review argued the fix out of it), a
  server-side stat and dropping the folder-form expansion were rejected
  (PR #139).
- [decisions/ADR-072-views-base-lists-only-once-the-named-base-is-the-active-file.md](decisions/ADR-072-views-base-lists-only-once-the-named-base-is-the-active-file.md)
  — named-mode `views_base` checks that the named Base is the active file
  after `openLinkText`, waiting up to 1 s, and otherwise fails as
  `CLI_REPORTED_ERROR` with `details.stage: "focus"` before listing; a
  reserve `openFile` retry (by owner ruling), a `not-focused` reason on
  `BASE_NOT_FOUND`, `INTERNAL_ERROR` and an after-the-fact check were
  rejected (PR #140). Amended 2026-11-07: `open_file` applies the same
  check after every placement, and both templates share one wait,
  `AWAIT_ACTIVE_FILE_JS` (PR #151, BI-0189).
- [decisions/ADR-073-validation-sub-codes-are-lifted-only-where-the-help-page-promises-them.md](decisions/ADR-073-validation-sub-codes-are-lifted-only-where-the-help-page-promises-them.md)
  — `patch_heading`, `patch_block`, `query_base`, `append_note` and
  `prepend` lift a schema rejection's ADR-015 sub-code into `details` through
  the shared `src/tools/_validation-details.ts`, keeping `details.issues`;
  `views_base` keeps the generic envelope its page describes; docs only,
  lifting `views_base` too, and lifting inside the generic envelope were
  rejected (PR #142).
- [decisions/ADR-074-tool-descriptions-route-within-a-budget-and-the-help-page-holds-the-contract.md](decisions/ADR-074-tool-descriptions-route-within-a-budget-and-the-help-page-holds-the-contract.md)
  — each tool description says what the tool does, when to choose it over
  its named siblings and any data-loss caveat, in at most 400 characters and
  12,000 in total, with the long reference on its help page and each index
  entry its first sentence; mechanical checks gate, judgement verdicts only
  flag a changed description for review; a hand-written report, gating on
  judgement and a model evaluation were rejected; amends ADR-045's shared
  closed-vault sentence (PR #143).
- [decisions/ADR-075-set-property-sends-a-list-as-a-json-array.md](decisions/ADR-075-set-property-sends-a-list-as-a-json-array.md)
  — `set_property` sends an array whose resolved type is `list` as one
  JSON-array argv element, which `property:set` stores item for item, and
  keeps the comma join for an array with an explicit non-list `type`; JSON
  for every array, an `eval` write and comma escaping were rejected
  (PR #150).
