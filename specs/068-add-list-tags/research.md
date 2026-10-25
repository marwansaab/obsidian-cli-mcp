# Research: Add List Tags (`tags`)

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-25

Phase 0 output. Live-CLI findings (F-series) come first: they were probed at plan stage against the authorised test vault and they drive the design decisions (R-series). Every Technical Context unknown is resolved here. No NEEDS CLARIFICATION remains.

## Plan-stage live-CLI findings

**Probe set-up.** Probes ran on 2026-10-25 against `TestVault-Obsidian-CLI-MCP`, through `Obsidian.com` (bare `obsidian`), with `vault=` passed explicitly, following `.memory/test-execution-instructions.md`. The probes were read-only apart from fixture seeding. Fixtures were seeded under `Sandbox/068-probe/` and removed afterwards. `Sandbox/` was left empty and `Welcome.md` was untouched.

The fixtures were:

- `Alpha.md`: frontmatter `tags: [fm-only, Project, shared]`. Body has `#shared` three times, `#project`, `#parent/child`, `#café`, `#日本語`, an inline-code `` `#inlinecode` ``, and `#fencedonly` inside a fenced code block.
- `Beta.md`: frontmatter `tags: ["#hashfm", shared]`. Body has `#Aardvark #aardvark #Banana #parent #shared`.
- `Empty.md`: no tags.
- `Gamma.md`: `#solo/leaf #deep/a/b`.

> **Environment note.** The vault is registered at `C:\Marwan-Saab-ADO\My-Setup\My-Setup\TestVault-Obsidian-CLI-MCP`. The path recorded in `.memory/test-execution-instructions.md` (`…\Marwan at Metcash\Obsidian\…`) no longer exists. The vault name is unchanged, and so is its layout (`Sandbox/` plus `Welcome.md`). The `.memory/` file has not been edited; per CLAUDE.md, it is only edited at the owner's request.

### F1 — Upstream surface

`obsidian help tags`:

```
tags                  List tags in the vault
  file=<name>         - File name
  path=<path>         - File path
  total               - Return tag count
  counts              - Include tag counts
  sort=count          - Sort by count (default: name)
  format=json|tsv|csv - Output format (default: tsv)
  active              - Show tags for active file
```

Every scope the spec needs (vault-wide, `file`, `path`, active) is native to this subcommand. No `eval` composition is required.

### F2 — JSON wire shape: `count` is a STRING

`tags format=json counts` returns a pretty-printed JSON array of `{ "tag": "#Aardvark", "count": "2" }`. `count` is a decimal **string**, not a number. Without `counts`, each entry is `{ "tag": "#Aardvark" }`. The output always starts with `[` and exits 0.

### F3 — Empty sentinel

When there are no tags, the reply is the literal `No tags found.` (exit 0, not JSON). This happens both vault-wide and for a tagless file (`path=…/Empty.md`), with or without `format=json`.

### F4 — Names always carry exactly one leading `#`

Inline tags, frontmatter tags written without `#` (`fm-only` → `#fm-only`), and frontmatter tags written with `#` (`"#hashfm"` → `#hashfm`, never `##hashfm`) all come back with exactly one `#`. Stripping one leading `#` therefore always yields the bare canonical form (spec FR-007).

### F5 — Code exclusion is native

`#fencedonly` (fenced block) and `#inlinecode` (inline code span) are absent from every listing. Spec AC 8 / FR-009 is satisfied upstream, and inline-code exclusion comes along for free.

### F6 — Non-ASCII tags are first-class

`#café` and `#日本語` are listed and counted exactly like ASCII tags, with UTF-8 preserved in the JSON output.

### F7 — Counts are raw occurrences, not notes

Vault-wide `#shared` = 6. That is Alpha's frontmatter entry plus three inline occurrences (4), plus Beta's frontmatter entry plus one inline occurrence (2). Per-file `Alpha` `#shared` = 4. So a count is the total number of tag occurrences, inline and frontmatter alike, with no per-note de-duplication. This **differs from** the existing `tag` tool, whose `count` is the number of distinct notes.

### F8 — Case variants: merged vault-wide, separate per-file

- **Vault-wide**: `#Project` + `#project` → one entry `#Project` with count 2, and `#Aardvark` + `#aardvark` → `#Aardvark` with count 2. The casing shown is the one Obsidian encountered first.
- **Per-file and active**: `#Project` and `#project` are separate entries (Alpha), and so are `#Aardvark` and `#aardvark` (Beta).

So the byte-order tie-break settled in Clarifications Q3 can be observed in per-file and active scopes. In the vault-wide scope it cannot, which mirrors `properties`.

### F9 — Hierarchical tags: vault-wide synthesises ancestors and rolls up counts; per-file does not

- **Vault-wide**: `#solo/leaf` alone produces `#solo` (1) and `#solo/leaf` (1). `#deep/a/b` produces `#deep` (1), `#deep/a` (1) and `#deep/a/b` (1). `#parent` = 2, made of Beta's own `#parent` plus Alpha's `#parent/child`.
- **Per-file** (`Gamma`): only `#deep/a/b` and `#solo/leaf` appear. No ancestors are listed.

This **falsifies the factual premise** of the Q4 option-A wording ("an implied-only parent is absent"). It does **not** change the Q4 decision itself, which is that the wrapper synthesises nothing and passes through exactly what upstream reports (FR-008). Vault-wide, upstream itself lists implied parents with rolled-up counts; per-file, it does not. The spec carries a plan-stage note recording this (see [spec.md Clarifications](./spec.md#clarifications)).

### F10 — Upstream `sort=count` ties are not deterministic by name

`sort=count` returned the tied count-2 group as `#Project, #parent, #Aardvark` and the count-1 group in no name order. This confirms that wrapper-side sorting is required (R7).

### F11 — Failure replies (all exit 0 on stdout)

| Probe | Reply | Existing classification |
|---|---|---|
| `vault=NoSuchVault-068 tags counts` | `Vault not found.` | `invokeCli` R5 success-path inspection → `CLI_REPORTED_ERROR`, `details.message: "Vault not found."` |
| `path=Sandbox/068-probe/Missing.md` | `Error: File "Sandbox/068-probe/Missing.md" not found.` | dispatch priority (c) → `CLI_REPORTED_ERROR` |
| `file=Missing` | `Error: File "Missing" not found.` | priority (c) → `CLI_REPORTED_ERROR` |
| `path=../outside.md` | `Error: File "../outside.md" not found.` | priority (c). Upstream does not escape the vault; the wrapper rejects this earlier anyway (R5) |
| `active` (nothing focused) | `Error: No active file. Use file=<name> or path=<path> to specify a file.` | dispatch priority (b) → `ERR_NO_ACTIVE_FILE` |
| first `tags` call after idle | `Error: Command "tags" not found. Did you mean: bases?` | ADR-029 cold-start retry (dispatch-layer, automatic) |

The spec's UNDERLYING edge case ("unknown vault may not be treated as an error") is real at the raw CLI level, where it is exit 0 with a plain sentence. It is **already handled** by the frozen `invokeCli` R5 clause, and the tool inherits that with zero wrapper code. A regression test locks it (FR-015).

### F12 — Active-file scoping

After `open path=Sandbox/068-probe/Beta.md`, `tags format=json counts active` returned exactly Beta's per-file listing. That held both with `vault=TestVault-…` and with no `vault=`. `file=Alpha active` returned Alpha (`file` wins upstream), but the wrapper schema forbids that combination anyway.

### F13 — `total` returns the entry count as an integer

`tags total` returned `10`, matching the number of vault-wide entries. The wrapper does not use it, because `total` in the output is computed from the parsed array.

## Design decisions

### R1 — Tool name `tags` (ADR-010)

**Decision**: Register the tool as `tags`, the verbatim name of the upstream subcommand.
**Rationale**: ADR-010 says typed tool names mirror the upstream CLI subcommand. BI-028 research R-naming already reserved `tags` for this inventory BI. It sits next to `tag`, the per-tag file lookup.
**Alternatives**: `list_tags` (invented by the wrapper, so rejected by ADR-010); `tag_index` (same reason).

### R2 — Single native `invokeCli` call, always `format=json` + `counts`

**Decision**: Every request makes exactly ONE `invokeCli({ command: "tags", … })` call. The parameters are always `format: "json"` plus the scope parameter (`file` or `path`, if supplied). The flags are always `["counts"]`, plus `"active"` when `activeOnly` is true. `sort=count` and `total` are never sent.
**Rationale**:
- `counts` is always requested because `sortByCount: true` needs counts even when `includeCounts: false`. One parse path also serves every option combination (F2).
- `sort=count` ties are non-deterministic (F10), and FR-004 needs a wrapper-locked comparator in either case.
- `total` is not needed (F13).
**Alternatives**:
- Pass `sort=count` through. Rejected because of F10.
- Omit `counts` when `includeCounts: false && !sortByCount`. That saves a few bytes but adds a second wire shape to parse. Rejected for simplicity.

### R3 — Route through `invokeCli` with `target_mode: "specific"` in both modes

**Decision**: The handler always calls `invokeCli` with `target_mode: "specific"` and `vault: input.vault`. In active mode `input.vault` is `undefined`, so no `vault=` reaches argv and the CLI targets the focused vault.
**Rationale**: `invokeCli` (frozen since the 008 refactor) *strips `file` / `path` from `parameters` when `target_mode === "active"`*, as a defence-in-depth measure for the standard per-file cohort. Under ADR-038, `tags` allows `file` / `path` in active mode. Passing `target_mode: "active"` would silently drop the caller's scope and return a vault-wide listing when a single note was asked for: a Principle IV silent-wrong-result. Passing `"specific"` with an undefined vault gives exactly the focused-vault argv. This is the established precedent: `properties` passes `target_mode: "specific"` with an optional vault. Validation (R4) has already ensured that `vault` is absent in active mode.
**Alternatives**:
- Amend `invokeCli` so it only strips locators for the per-file cohort. Rejected: it touches a frozen kernel-adjacent surface to serve one tool.
- Re-add `file` / `path` after the strip. Rejected: impossible from outside the adapter.

### R4 — Schema: `targetModeBaseSchema.extend(...)` plus a tool-local `superRefine` (ADR-038)

**Decision**: The input schema is `targetModeBaseSchema.extend({ file, path, activeOnly, sortByCount, includeCounts })`, followed by a **tool-local** `superRefine`. It does not use `applyTargetModeRefinement` (which requires exactly one locator and forbids locators in active mode), and it does not use `applyTargetModeRefinementForFolderScoped` (which forbids locators in both modes).

Refinement matrix:

| Condition | Issue path | Message |
|---|---|---|
| `target_mode: "specific"` and `vault` absent | `["vault"]` | `vault is required in specific mode` (verbatim cohort wording) |
| `target_mode: "active"` and `vault` present (not `undefined`) | `["vault"]` | `vault is not allowed in active mode` (verbatim cohort wording) |
| more than one of `file` set / `path` set / `activeOnly === true` | one issue on each offending key | `at most one of \`file\`, \`path\`, \`activeOnly\` may be set` |

`activeOnly: false` counts as "not set" (it is the default), so `{ file, activeOnly: false }` is valid.

Field shapes:
- `file`: `z.string().min(1).optional()`, overriding the base's unconstrained string. An empty `file=` could otherwise reach upstream as an empty locator.
- `path`: `z.string().min(1).refine(isStructurallySafePath, STRUCTURALLY_UNSAFE_PATH_MESSAGE).optional()`.
- `activeOnly`, `sortByCount`, `includeCounts`: `z.boolean().optional()`. The defaults (`false`, `false`, `true`) are resolved in the handler, following the cohort's `total: z.boolean().optional()` convention, so the published input schema shows them as optional rather than defaulted.
- `targetModeBaseSchema` is a `strictObject`, so unknown keys are rejected (AC 11).

**Rationale**: Reusing the base keeps `target_mode` / `vault` byte-identical to the cohort's published shape. That brings no new dependency edge: 15+ schemas already import `target-mode.ts`. Only the refinement is tool-local, which ADR-038 records.
**Alternatives**:
- A plain `z.strictObject` that re-declares `target_mode` / `vault`. Rejected: it duplicates the shared field shapes, and the declarations could drift apart.
- Add a third exported refinement to `target-mode.ts`. Rejected: that changes a shared primitive for a single consumer. ADR-038 can be promoted later if a second consumer appears.

### R5 — Path traversal is rejected at the boundary (Layer 1 only)

**Decision**: `path` gets the ADR-009 Layer-1 structural predicate `isStructurallySafePath`, which rejects a leading `/` or `\`, a drive letter, any `..` segment, and control characters / DEL. The Layer-2 canonical-path check (`checkCanonicalPath`) is NOT used.
**Rationale**: Spec FR-012 requires rejection at the validation boundary, before any CLI call. Layer 2 guards direct filesystem *writes* against symlink escape. `tags` is read-only and goes through the CLI, which already refuses out-of-vault paths (F11, `../outside.md` → not found). `file` is a link-style name resolved by Obsidian, so a path predicate does not apply to it.
**Alternatives**: Rely on upstream rejection only. That is allowed by the feature description, but spec FR-012 chose boundary rejection.

### R6 — Output transform

**Decision**: The handler pipeline:

1. Trim stdout.
2. If the result equals `No tags found.` (F3), return `{ total: 0, tags: [] }`.
3. Otherwise run `JSON.parse`. On failure, throw `UpstreamError` with `CLI_REPORTED_ERROR` and `details.stage: "json-parse"`.
4. Validate with `tagsUpstreamArraySchema` (`z.array(z.object({ tag: z.string(), count: z.string().optional() }).loose())`). A mismatch throws `CLI_REPORTED_ERROR` with `details.stage: "shape-parse"`.
5. For each entry:
   - The name is the tag with exactly one leading `#` stripped (F4).
   - The count is parsed strictly. It must match `/^\d+$/` and be a safe integer, otherwise throw `CLI_REPORTED_ERROR` with `details.stage: "count-parse"` and the offending `tag` / `count` values. A missing `count` is also an error, because the call always sends `counts`.
6. Sort (R7).
7. If `includeCounts` is false, map each entry to `{ name }` with no `count` key (AC 6).
8. Return `{ total: tags.length, tags }`.

**Rationale**: The `json-parse` / `total-parse` stage-discriminator idiom is lifted from the `outline` and `properties` handlers. A single CLI round trip, with no reshaping beyond the `#` strip, follows FR-008.
**Alternatives**: Keep `count` as a string. Rejected: the spec's output says `count?: number`.

### R7 — Wrapper-side comparator (Clarifications Q3)

**Decision**: A tool-local `compareTagNames(a, b)` does the ordering:

- The primary key is the name with only `A`–`Z` lower-folded (`s.replace(/[A-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + 32))`). Non-ASCII characters are not folded.
- Primary keys are compared by **UTF-8 byte order**, and ties on the primary key are broken by UTF-8 byte order of the original name. In both cases the comparison is `Buffer.compare(Buffer.from(x, "utf8"), Buffer.from(y, "utf8"))`.

With `sortByCount`, entries sort by `count` descending and fall back to `compareTagNames`.

**Rationale**:
- JS `<` compares UTF-16 code units. That differs from UTF-8 byte order for supplementary-plane characters compared against U+E000–U+FFFF.
- `String.prototype.toLowerCase` folds non-ASCII characters, which Q3 forbids.
- Two distinct names never compare equal, because byte-order equality means string equality. The order is therefore total and deterministic.

**Alternatives**:
- Import `compareUtf8Bytes` from `src/tools/files/handler.ts`. Rejected: a lateral tool→tool import goes against the Principle I one-directional layout. Moving it into a shared module would edit the frozen `files` tool, so the comparator (about 10 lines) stays tool-local. It is a candidate for a later shared-helper lift.
  - *PR #85 review follow-up (2026-10-25).* The lift was done. The code-quality review flagged the copy as a duplicate of `compareUtf8Bytes`, so the byte comparator moved to the shared leaf `src/tools/_utf8-compare.ts`. Both `files` and `tags` import it from there, so no tool imports another (Principle I). `compareTagNames` and its ASCII-only fold stay in `tags`. The `files` edit is a pure import swap and does not change its behaviour.
- `Intl.Collator`. Rejected: locale-dependent, which would violate determinism.

> **Discrepancy surfaced, not acted on.** The owner's Q3 rationale cites the `tag` tool's "ASCII lower-fold" (FEAT-018, TC-00272), and `docs/tools/tag.md` describes it that way. However, `src/tools/tag/_template.ts` `normTag` uses JS `toLowerCase()`, which folds non-ASCII characters too (for example `É` → `é`). `tags` follows the Q3 ruling (ASCII-only fold, for ordering only), so the discrepancy does not affect this feature. It does not break the FR-007 round trip either: any name from `tags` still matches in `tag`, whose fold is a superset of ASCII-only. Logged here for the owner as a possible `tag` doc or code drift.

### R8 — Errors: zero new codes, zero new sub-discriminators

| Spec requirement | Failure | Code (existing) | Source |
|---|---|---|---|
| FR-011 / FR-012 | Validation (scope conflict, missing or forbidden `vault`, unknown key, bad type, unsafe `path`, empty `file`/`path`) | `VALIDATION_ERROR` with zod `details.issues` | `registerTool` ZodError wrap |
| FR-014 | `activeOnly` and no focused note | `ERR_NO_ACTIVE_FILE` | dispatch priority (b), re-messaged (R9) |
| FR-015 | Unknown vault | `CLI_REPORTED_ERROR`, `details.message: "Vault not found."` | `invokeCli` R5 |
| FR-016 | `file` / `path` not found | `CLI_REPORTED_ERROR`, `details.stdout: "Error: File \"…\" not found."` | dispatch priority (c) |
| FR-018 | Response over 10 MiB | `CLI_OUTPUT_TOO_LARGE` | dispatch bounds |
| Uninterpretable reply | — | `CLI_REPORTED_ERROR`, `details.stage` ∈ `json-parse` / `shape-parse` / `count-parse` | handler |
| Other | Binary missing, non-zero exit, timeout | `CLI_BINARY_NOT_FOUND` / `CLI_NON_ZERO_EXIT` / `CLI_TIMEOUT` | dispatch |

**Rationale**: This keeps the Principle IV zero-new-top-level-codes streak. `details.stage` is an existing per-handler parse discriminator, not a new `(code, details.code)` pair with sub-states, so ADR-015 is N/A.

### R9 — Re-message `ERR_NO_ACTIVE_FILE` for the `tags` surface

**Decision**: The handler catches `UpstreamError` with `code === "ERR_NO_ACTIVE_FILE"` and rethrows a new `UpstreamError`. The code is unchanged, the `cause` is the original error, and the `details` are the original details spread with `tool: "tags"`. The message reads: `No active file in Obsidian. Focus a note in the editor, or call tags with \`file\` or \`path\` instead of \`activeOnly: true\`.`
**Rationale**: The dispatch-layer message tells callers to "call this tool with target_mode: \"specific\" and an explicit vault/file". For `tags`, switching to specific mode does not help, because `activeOnly` remains valid in specific mode (ADR-038). AC 13 / FR-014 requires the error to point to `file` / `path`. The code, cause chain and details are all preserved, so Principle IV holds.
**Alternatives**: Keep the dispatch message. Rejected: it is misleading under ADR-038's matrix.

### R10 — Snapshot and staleness semantics (CONCURRENCY edge case)

**Decision**: Document, don't handle. One CLI call reads Obsidian's in-memory metadata cache once. Edits that Obsidian has not yet re-indexed (typically sub-second after a save; longer during a bulk external sync) are not reflected. There is no retry and no reconciliation.
**Rationale**: This follows the same snapshot semantics documented for `tag` and `properties`.

### R11 — Output-cap ceiling (LIMITS edge case)

**Decision**:
- **Plan-stage estimate.** The pretty-printed upstream JSON costs about 40 bytes per entry plus the UTF-8 name length. Against the 10 MiB `TYPED_TOOL_OUTPUT_CAP_BYTES` cap, that is roughly 150,000–250,000 unique tags for typical name lengths of 10–30 bytes.
- **T0 measurement.** T0 generates a fixture of 2,000 unique tags in `Sandbox/`, measures bytes per entry, and replaces the estimate in `docs/tools/tags.md` with the measured ceiling (SC-006, ±10%).
- **On overflow.** The call fails with `CLI_OUTPUT_TOO_LARGE`, never a truncated list. Because the cap applies to upstream bytes and R2 always requests counts, `includeCounts: false` does not raise the ceiling. The documentation says so, and recommends `file` / `path` scoping as the mitigation.

**Rationale**: The spec text that suggested names-only mode as the lower-cost alternative is superseded by R2. The saving would be about 15 bytes per entry, which is not worth a second wire shape. The plan-stage spec note records this.

### R12 — Registration, docs, baseline

**Decision**:
- `src/tools/tags/{schema,handler,index}.ts` plus the three co-located `*.test.ts` files.
- `createTagsTool({ logger, queue })` is inserted in `src/server.ts` immediately after `createTagTool` (ASCII order `tag` < `tags` < `views_base`).
- `docs/tools/tags.md` is a new full document. There is no stub to replace, as the spec assumption records.
- `docs/tools/index.md` gets one new line after `tag`.
- `npm run baseline:write` rolls `_register-baseline.json` forward (the FR-018 acknowledgement gate).
- The tool description disambiguates `tags` (inventory) from `tag` (notes carrying one tag), and the doc names the count-semantics difference (F7).
- The version bump and CHANGELOG follow the current release convention at the polish task.

## Resolved unknowns summary

| Unknown | Resolved by |
|---|---|
| Upstream wire format / count type | F2 |
| Empty-vault and empty-file reply | F3 |
| Name form | F4 + Clarifications Q2 |
| Code-block exclusion | F5 |
| Non-ASCII behaviour | F6 |
| Count meaning | F7 |
| Case-variant behaviour | F8 |
| Hierarchical behaviour | F9 |
| Unknown-vault classification | F11 + R8 |
| Missing-file classification | F11 + R8 |
| No-focus classification and message | F11 + R9 |
| Path traversal | R5 |
| Active-mode routing without locator strip | R3 |
| Ordering | R7 + Clarifications Q3 |
| Size ceiling | R11 (estimate now, measured at T0) |
| Specific-mode `activeOnly` against an unfocused named vault | Deferred to T0. The documented expectation is that the named vault's focused note is used, or `ERR_NO_ACTIVE_FILE` is raised. Not reproducible at plan stage with a single vault open. **Resolved at T0 (below): the named vault's focused note is used.** |

## T0 live re-check (implement)

**Set-up.** Re-run on 2026-10-25 at the start of `/speckit-implement`, against `TestVault-Obsidian-CLI-MCP` (still registered at `C:\Marwan-Saab-ADO\My-Setup\My-Setup\TestVault-Obsidian-CLI-MCP`), through bare `obsidian`, which resolves to `Obsidian.com` (now installed at `%LOCALAPPDATA%\Programs\Obsidian\Obsidian.com`; CLI `version` reports `1.14.5 (installer 1.14.4)`). `vault=` was passed explicitly on every vault-scoped probe, and stdout / stderr were captured separately with `Start-Process -RedirectStandardOutput/-RedirectStandardError`. The quickstart fixtures (`Alpha`, `Beta`, `Gamma`, `Empty`) were seeded under `Sandbox/068-t0/` with the same content as the plan-stage `068-probe` set. `Sandbox/` was empty before the run.

**Result: no drift.** Every plan-stage finding reproduced byte-for-byte in shape, so neither the spec nor the research needed amending.

| Probe | Raw reply (exit 0 in every case, stderr empty) | Matches |
|---|---|---|
| L-1 `tags format=json counts` | 15 entries, pretty-printed JSON, every `count` a string. `#shared` "6", `#Project` "2" (merged with `#project`), `#Aardvark` "2" (merged), `#parent` "2", implied `#solo` / `#deep` / `#deep/a` "1", `#café` and `#日本語` present. No `#fencedonly`, no `#inlinecode`. Upstream order: ASCII-case-insensitive by name, with non-ASCII last. | F2, F5, F6, F7, F8, F9 |
| L-2 `path=Sandbox/068-t0/Beta.md` | `#Aardvark`, `#aardvark`, `#Banana`, `#hashfm`, `#parent`, `#shared` "2" | F4 (`"#hashfm"` → one `#`), F8 (per-note variants separate) |
| `file=Alpha` | `#café`, `#fm-only`, `#parent/child`, `#Project` "1", `#project` "1", `#shared` "4", `#日本語` | F4, F7, F8 |
| L-3 `path=…/Gamma.md` | `#deep/a/b`, `#solo/leaf` only | F9 (no per-note ancestors) |
| L-4 `path=…/Empty.md` | `No tags found.` | F3 |
| L-5 `path=…/Missing.md` | `Error: File "Sandbox/068-t0/Missing.md" not found.` | F11 |
| `file=Missing` | `Error: File "Missing" not found.` | F11 |
| L-6 `vault=NoSuchVault-068` | `Vault not found.` | F11 |
| `sort=count` | count-2 tie group returned as `#Project, #parent, #Aardvark`; count-1 group in no name order | F10 |
| `tags total` | `15` (equals the L-1 entry count) | F13 |
| L-7 after `open path=…/Beta.md`, `active` with and without `vault=` | identical to L-2 in both cases | F12 |
| `file=Alpha active` | Alpha's listing (`file` wins upstream; the wrapper schema forbids this pair) | F12 |
| L-8 after `command id=workspace:close` (leaves an empty tab), `active` with and without `vault=` | `Error: No active file. Use file=<name> or path=<path> to specify a file.` | F11 |

No cold-start `Command "tags" not found` reply was observed in this run; the first call (`tags total`) was answered directly.

**L-9 (specific-mode `activeOnly` against an unfocused vault): verified.** Obsidian's `obsidian.json` showed four vaults open. With the test vault focused and no note active in it, `vault=Game-Server-Vault tags format=json counts active` returned a JSON listing (3 entries) for that vault's focused note, while the control call without `vault=` returned `Error: No active file. …` for the focused test vault. So in specific mode, `activeOnly` lists the focused note **of the named vault**, which is the documented expectation. The probe was read-only, and the other vault's tag names were deliberately not recorded.

**Clean-up.** The Beta tab opened for L-7 was closed again, restoring the original single empty tab. `Sandbox/068-t0/` was removed; `Sandbox/` is empty and `Welcome.md` is present.
