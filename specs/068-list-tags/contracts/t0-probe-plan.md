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

## Run context (2026-10-24)

- **Vault**: `TestVault-Obsidian-CLI-MCP`, registered at `C:\Marwan-Saab-ADO\My-Setup\My-Setup\TestVault-Obsidian-CLI-MCP` (confirmed with `obsidian vaults verbose`). The owner ruled this path authoritative (GL-003, vault moved 2026-10-20). The path in the gate file is stale; correcting it is an owner action.
- **Binary**: `Obsidian.com` (`C:\Users\sirzi\AppData\Local\Programs\Obsidian\Obsidian.com`), driven through `Start-Process` with stdout and stderr redirected separately. `Obsidian.exe` was never invoked.
- **Pre-state**: the vault root held only `.obsidian/` and `Welcome.md` (no tags). `Sandbox/` did not exist, so it was created. The fixtures were written to `Sandbox/t068/`.
- Every probe below exited with code 0 and empty stderr, unless noted.

## P1 evidence (2026-10-24)

`vault=TestVault-Obsidian-CLI-MCP tags format=json counts` returned a pretty-printed JSON array (479 bytes, 9 entries):

```json
[
  { "tag": "#t068-café", "count": "1" },
  { "tag": "#T068-Case", "count": "2" },
  { "tag": "#t068-fm", "count": "1" },
  { "tag": "#t068-inline", "count": "1" },
  { "tag": "#t068-multi", "count": "3" },
  { "tag": "#t068-parent", "count": "1" },
  { "tag": "#t068-parent/child", "count": "1" },
  { "tag": "#t068-real", "count": "1" },
  { "tag": "#t068-日本語", "count": "1" }
]
```

(The output is reflowed here to one line per entry; upstream puts each key on its own line.)

- The field names are **`tag`** and **`count`**.
- Every name carries a **leading `#`**, including the frontmatter-only tag `t068-fm`.
- **`count` is a JSON string of decimal digits** (`"1"`), not a number. The wrapper parses it to an integer; the upstream schema accepts only `^\d+$`.
- Without `counts`, each entry is `{ "tag": "…" }` (317 bytes). `format=tsv counts` and bare `counts` both emit `#<tag>\t<count>` lines.
- **Outcome**: `format=json` is usable, so the TSV fallback is **not** applied. The wire hypothesis in data-model § 2 is amended so that `count` is a digit string.

## P2 evidence (2026-10-24)

- `… tags format=json path=Sandbox/t068/empty.md counts` returned stdout `No tags found.` (15 bytes including the newline).
- Vault-wide on a tagless vault (re-run after the fixtures were deleted: `vault=TestVault-Obsidian-CLI-MCP tags format=json counts`) also returned `No tags found.`.
- `[]` and empty stdout were not observed.
- **Outcome**: `EMPTY_TAGS_SENTINEL = "No tags found."`, matched by exact equality after trim. `[]` is also accepted as empty, as defensive parity with research D5. Trimmed-empty stdout is **not** treated as empty, because it was never observed; it fails loudly as `json-parse`.

## P3/P4/P5 evidence (2026-10-24)

| Probe | Stdout (entries) |
|---|---|
| P3 `path=Sandbox/t068/fence.md` | `[{"tag":"#t068-real","count":"1"}]`; `t068-fenced` absent. Verbatim stdout: `[\n  {\n    "tag": "#t068-real",\n    "count": "1"\n  }\n]\n` (the AC-8 handler fixture) |
| P4 `path=…/mixed.md` | `#t068-fm` 1, `#t068-inline` 1 (frontmatter and inline both present) |
| P4 `path=…/hier.md` | `#t068-parent/child` 1 only, with **no** synthesised parent entry in single-note scope |
| P4 `path=…/case.md` | `#T068-Case` 1, `#t068-case` 1: **case variants separate** in single-note scope |
| P4 `path=…/intl.md` | `#t068-café` 1, `#t068-日本語` 1 (recognised, bytes unchanged) |
| P4 vault-wide | `#T068-Case` **2** (case variants **merged**, reported with the first-seen casing); `#t068-parent` **1** synthesised alongside `#t068-parent/child` 1 |
| P4 extra (hierarchy roll-up): added `hier2.md` with a standalone `#t068-parent`, then vault-wide TSV | `#t068-parent	2`, `#t068-parent/child	1`: the vault-wide parent count **includes** its children's occurrences |
| P5 `path=…/count.md` | `#t068-multi` **3** (three inline occurrences in one note) |
| P5 vault-wide | `#t068-multi` **3** |

- **Count meaning**: `count` is the number of **occurrences**, not the number of notes. In single-note scope it is the occurrences within that note; vault-wide it is the occurrences across the vault.
- **Case variants**: the outcome is scope-dependent. Vault-wide, the index merges case variants into one entry with a summed count. In single-note scope it keeps them separate. FR-011's byte-order tiebreak is therefore unobservable end-to-end in **vault-wide** listings only, and observable in single-note listings.
- **Hierarchy**: vault-wide, every ancestor of a nested tag gets its own entry, whose count rolls up its descendants. In single-note scope only the literal tags appear.

## P6/P7/P8/P10 evidence (2026-10-24)

| Probe | Stdout | Classification |
|---|---|---|
| P6 `… file=fence` | `[{"tag":"#t068-real","count":"1"}]` | bare-name resolution works |
| P6 `… path=Sandbox/t068/missing.md` | `Error: File "Sandbox/t068/missing.md" not found.` (exit 0) | dispatch priority (c) → `CLI_REPORTED_ERROR` |
| P6 `… file=does-not-exist` | `Error: File "does-not-exist" not found.` (exit 0) | dispatch priority (c) → `CLI_REPORTED_ERROR` |
| P7 `tags format=json counts active` with no active file in the focused window | `Error: No active file. Use file=<name> or path=<path> to specify a file.` (exit 0) | dispatch priority (b) → `ERR_NO_ACTIVE_FILE` (prefix match) |
| P7 after `vault=TestVault-Obsidian-CLI-MCP open path=Sandbox/t068/count.md` | `[{"tag":"#t068-multi","count":"3"}]` | active-note listing works |
| P8 `vault=__t068_no_such_vault__ tags format=json counts` | `Vault not found.` (exit 0) | `invokeCli` re-classification → `CLI_REPORTED_ERROR` |
| P10 `tags format=json file=fence counts` (no `vault=`, test vault focused) | `[{"tag":"#t068-real","count":"1"}]` | focused-vault `file` scoping works |

- **Outcome**: the P6, P7 and P8 fallbacks are **not** applied. The missing-note case returns `Error:` rather than an empty listing, so no `vaultRegistry` DI is needed and plan.md is unchanged. The no-active-note and unknown-vault signatures match the existing dispatch and `invokeCli` classifiers.

## P9 evidence (2026-10-24)

The P1 JSON was 479 bytes for 9 entries with names of 8–18 characters, about 53 bytes per entry (pretty-printed: roughly 40 bytes of structure plus the name and the count digits). At 10 MiB (10,485,760 bytes), the ceiling is about **190,000 tags** at that name length, and about 100,000 at 60-byte names. The documented ceiling is "on the order of 10⁵ distinct tags".

## Cleanup (2026-10-24)

`Sandbox/t068/` (eight fixture notes, including the extra `hier2.md`) was deleted from the filesystem. The deletion bypassed Obsidian, so there is no `.trash/` residue. Post-state: the vault root holds `.obsidian/`, `Welcome.md` (untouched) and an empty `Sandbox/`. The vault-wide tagless P2 re-run confirmed the index dropped the fixtures. The only UI side effect was opening `Sandbox/t068/count.md` for P7; that note no longer exists.
