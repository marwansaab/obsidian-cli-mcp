# T0 Probe Plan: List Tags

**When**: the first tasks of `/speckit-implement`, before the handler is written against the wire format.
**Gate**: read `.memory/test-execution-instructions.md` first (CLAUDE.md § Test Execution). It names the authorised test vault, the scratch subdirectory, and the cleanup protocol. That file was not present at plan time; if it is still absent at implement time, **stop and escalate**. Do not probe an unauthorised vault.
**Read-only**: every probe below only lists tags. The fixture notes are created in the scratch subdirectory and removed afterwards, per the gate file.

## Fixture notes (scratch subdirectory)

| Note | Content purpose |
|---|---|
| `fence.md` | `#t068-real` inline, plus a fenced code block containing `#t068-fenced` |
| `mixed.md` | frontmatter `tags: [t068-fm]` plus inline `#t068-inline` |
| `hier.md` | `#t068-parent/child` (no standalone `#t068-parent`) |
| `case.md` | `#T068-Case` and `#t068-case` |
| `intl.md` | `#t068-café`, `#t068-日本語` |
| `count.md` | `#t068-multi` ×3 inline |
| `empty.md` | no tags |

## Probes

| ID | Command (via `obsidian`) | Question answered | Feeds |
|---|---|---|---|
| P1 | `vault=<V> tags format=json counts` | JSON shape: field names, `#` prefix on names, count type. Also run without `counts` and with `format=tsv` for the record. | `tagsUpstreamArraySchema`, D1 fallback |
| P2 | `vault=<V> tags format=json counts path=<scratch>/empty.md`; plus a tagless scratch vault if the gate file provides one | Empty-result stdout (`[]`, empty, or a sentinel string) for per-note and vault-wide | `EMPTY_TAGS_SENTINEL` (D5) |
| P3 | `… tags format=json counts path=<scratch>/fence.md` | `t068-fenced` absent, `t068-real` present (AC-8) | AC-8 evidence + handler fixture |
| P4 | `… path=` each of `mixed.md`, `hier.md`, `case.md`, `intl.md`; plus a vault-wide run filtered to `t068-*` | Frontmatter + inline both present; hierarchical presentation (is a `t068-parent` entry synthesised? does its count include the child?); case variants merged or separate; non-ASCII recognised | spec Edge Cases + FR-011 label (Q2/Q3) + docs |
| P5 | `… path=<scratch>/count.md` vs a vault-wide run | Per-note `count` meaning (occurrences in the note? 1? the vault-wide total?) | spec Edge Cases + docs |
| P6 | `… file=<bare name>`; `… path=<scratch>/missing.md`; `… file=does-not-exist` | `file` resolution by bare name; exact stdout for a missing note (`Error: …`?) | D6 / FR-017 fallback, docs error roster |
| P7 | `tags format=json counts active` with a scratch note focused, then with all panes closed | Active-note listing; exact stdout for no active note (`Error: No active file.`?) | D6 / AC-13 fallback |
| P8 | `vault=__t068_no_such_vault__ tags format=json counts` | Unknown-vault stdout + exit code (`Vault not found.`, exit 0?) | D6 / UNDERLYING fallback |
| P9 | P1 output size ÷ entry count on the test vault | Bytes per entry → documented size ceiling (10 MiB ÷ bytes per entry) | docs Inherited limitations |
| P10 | `tags format=json counts file=<bare name>` with **no** `vault=` (focused vault) | Focused-vault `file` scoping works without `vault=` (AC-10, vault omitted) | D2 |

## Recording

Append a `## P<n> evidence (<date>)` section per probe below, quoting the command and verbatim stdout (trimmed to the relevant lines). Then apply the decided fallback from [research.md](../research.md) § "T0 fallback table" where needed. Write the P4/P5 results back into `spec.md` Edge Cases (case variants, hierarchy, per-note count) and into `docs/tools/tags.md`.
