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
  `eval` template pattern; logging, shutdown and module layout.
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
    `find_and_replace`, `prepend`, `set_property`, `delete`, `rename`,
    `move`.
  - [capabilities/list-and-inventory.md](capabilities/list-and-inventory.md) —
    `files`, `paths`, `outline`, `properties`, `vaults`.
  - [capabilities/bases.md](capabilities/bases.md) — `bases`, `views_base`,
    `query_base`, `create_base`.
  - [capabilities/plugin-backed.md](capabilities/plugin-backed.md) — the two
    Smart Connections tools.
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
  (PR #100).
- [decisions/ADR-NNN-shared-parameter-names-within-a-tool-family.md](decisions/ADR-NNN-shared-parameter-names-within-a-tool-family.md)
  — within a tool family one concept carries one snake-case parameter name;
  seven parameters on three tools are renamed, with the old names accepted
  until the next major release (PR #101). Its number is not allocated yet: by
  the owner's ruling on spec 073 (clarify Q2) the canonical copy is written in
  the vault and this mirror is renamed at the next vault sync, as listed in
  `specs/073-align-parameter-names/research.md` ("Pending vault sync").
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
