# Phase 0 Research: List Tags

**Feature**: `068-list-tags` — the `tags` typed tool (vault tag index, or one note's tag set, with optional counts)
**Input**: [spec.md](spec.md) · **Governing decisions**: ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand), ADR-015 (Sub-Discriminators via `details.reason` for Multi-State Error Codes), ADR-032 (Find And Replace File Scope via Sibling Locators), ARCH-014 (Tool categories)

The output contract (bare names, inherited case-variant handling, wrapper-side collation) was settled by the 2026-10-24 clarify session. The addressing pattern (sibling locators, no `target_mode`) was settled by the plan-stage ruling recorded in the spec's Clarifications. This document records the implementation decisions that follow. No `NEEDS CLARIFICATION` markers remain. The remaining empirical questions about the upstream surface are implement-time T0 gates ([contracts/t0-probe-plan.md](contracts/t0-probe-plan.md)). Every one of them has a decided fallback, so none blocks the design.

> **Why the probes are implement-time, not plan-time.** CLAUDE.md gates every real `obsidian` CLI invocation behind `.memory/test-execution-instructions.md` (authorised test vault, scratch folder, cleanup protocol). That file is not present in this checkout, so no live probe was run during planning. The probes run as T0 tasks under `/speckit-implement` once the gate file is available. Their results are written back into the spec (case variants, per-note counts, hierarchical tags, non-ASCII tags) and into `docs/tools/tags.md` as the contract.

---

## D1 — New tool `tags`, wrapping the native `tags` subcommand directly

**Decision**: Add a new tool module `src/tools/tags/` (`schema.ts`, `handler.ts`, `index.ts` + co-located tests). It is a single-spawn `invokeCli` wrapper around the Obsidian Integrated CLI's native `tags` subcommand. The tool name is `tags`.

**Rationale**:
- **Naming (ADR-010)**: the upstream subcommand is `tags` ("List tags in the vault"; BI-028 research F1 captured its help text: `file=`, `path=`, `total`, `counts`, `sort=count`, `format=json|tsv|csv`, `active`). BI-028 research R15 explicitly reserved the name `tags` for this inventory operation when `tag` was named.
- **Native subcommand, not `eval`**: the native subcommand already offers every scope the spec needs (vault-wide, `file`, `path`, `active`), counts, and a JSON output format. The spec's fenced-code requirement (FR-014) is met natively by Obsidian's metadata cache, which is the index the subcommand reads. `tag` went to `eval` (BI-028 R2) for reasons that do not apply here: the native `tag` lookup is case-sensitive and has no JSON output. The `properties` and `outline` tools are the direct precedent: native subcommand plus `format=json`, then a wrapper-side reshape.
- **No new runtime dependency**, no new spawn site (ADR-030's two-spawn-site invariant holds: the call goes through `invokeCli` → `dispatchCli`).

**Alternatives considered**: An `eval` template walking `app.metadataCache.getTags()` (the `tag` tool's approach). Rejected because it duplicates what the native surface already returns, adds an anti-injection payload channel for `file`/`path`, and `getTags()` has no per-file mode. It stays the fallback only if T0 probe P1 shows `format=json` is unusable for `tags` (see the T0 fallback table).

## D2 — Addressing: sibling locators, no `target_mode` (ADR-032 / ARCH-014)

**Decision**: The input schema is a flat `z.strictObject` with `vault?`, `file?`, `path?`, `activeOnly?`, `sortByCount?`, `includeCounts?`. It does **not** import `src/target-mode/target-mode.ts` and adds no refinement variant there. `invokeCli` and ADR-003 are unchanged. No new ADR.

**Rationale**: The plan-stage ruling (spec Clarifications, "plan-stage ruling"): a vault-wide tool with an optional single-note scope follows ADR-032's sibling-locator pattern, as ARCH-014 (Tool categories) requires. It also sidesteps a concrete hazard: `invokeCli` strips `file`/`path` from `parameters` whenever `target_mode === "active"` (`src/cli-adapter/cli-adapter.ts`, `stripTargetLocators`), so an active-mode-plus-`file` request would have silently widened to vault-wide.

**`invokeCli` call shape**: the handler always passes `target_mode: "specific"` to the `invokeCli` facade, with `vault: input.vault` (possibly `undefined`). This is the established optional-`vault` idiom (`properties/handler.ts` and `search/handler.ts` do exactly this). With `vault` undefined, `dispatchCli` omits the `vault=` argv prefix and the CLI acts on the focused vault, and `file`/`path` are not stripped. The `target_mode` here is the facade's internal routing field, not a published input.

**Alternatives considered**: (A) `target_mode` as a vault selector with a third refinement variant. Rejected by the ruling. (B) Active mode allowing `file`/`path`. Rejected by the ruling; it would also have needed an `invokeCli` change.

## D3 — Scope mutual-exclusivity matrix (schema `superRefine`)

**Decision**: A `superRefine` on `tagsInputSchema` emits `custom` issues carrying `params: { subCode, subReason }`. `index.ts` supplies a `mapValidationError` hook (the `registerTool` seam) that maps them to `VALIDATION_ERROR` + `details.code` + `details.reason` + `details.issues` (the zod field paths, which Principle III requires on every validation error; analyze remediation R1). `activeOnly: false` (or absent) counts as "not set".

| Combination supplied | Verdict | `details.code` / `details.reason` |
|---|---|---|
| `file` + `path` | reject | `SCOPE_CONFLICT` / `file+path` |
| `activeOnly: true` + (`file` \| `path`) | reject | `SCOPE_CONFLICT` / `active+note` |
| `activeOnly: true` + `vault` | reject | `SCOPE_CONFLICT` / `active+vault` |
| (`file` \| `path`) + `vault` | **allow** | — (`vault` selects the note's vault) |
| `vault` alone, or nothing | **allow** | — (vault-wide listing; focused vault when `vault` omitted) |
| `activeOnly: true` alone | **allow** | — (the focused note in the focused vault) |

When several conflicts apply at once (e.g. `activeOnly` + `file` + `path` + `vault`), the first matching row in table order is reported, so each request yields exactly one scope-conflict reason. This matches ADR-032's single-reason behaviour.

**Field-level issues** (also through the same hook):
- `file` / `path` failing `isStructurallySafePath` (`src/path-safety/schema.ts`: rejects empty, leading `/` or `\`, drive letters, `..` segments, control characters) → `VALIDATION_ERROR` + `details.code: "INVALID_NOTE"` + `details.reason: "path-traversal"`. Parity with `find_and_replace`.
- `file` containing `[[` or `]]` → `VALIDATION_ERROR` through the generic issues channel. The message tells the caller to supply the bare name. Parity with `find_and_replace` and `append_note`.
- Unknown top-level key → zod `unrecognized_keys` → generic `VALIDATION_ERROR` (AC-11).
- Wrong types, or an empty `vault` (`min(1)`) → generic `VALIDATION_ERROR`.

**Rationale**: Reuses the established `params.subCode`/`subReason` → `details.code`/`details.reason` mapping shape from `find_and_replace/index.ts` (`mapZodIssuesToToolError`). `SCOPE_CONFLICT` and `INVALID_NOTE` are existing `details.code` values under the existing top-level `VALIDATION_ERROR`. No new top-level code, and no new sub-state on an existing pair: the reasons are reused verbatim from ADR-032's roster (`file+path`, `active+note`, `active+vault`, `path-traversal`). ADR-015 is therefore satisfied with no roster growth.

**Alternatives considered**: Generic validation issues with no sub-discriminator. Rejected because the ruling asks for the ADR-015 shape, and the sub-code lets an agent tell "fix the combination" apart from "fix the value". A shared scope-conflict helper extracted from `find_and_replace`: deferred. Two consumers of a ~20-line matrix do not justify a new shared module yet (Principle I bias against premature shared modules). The plan notes it as a candidate for a third consumer. *Superseded at PR #84 review*: the file/path field checks and the wikilink-bracket message were already repeated verbatim across tools, so the locator checks and the scope matrix were extracted into `src/tools/_note-locator.ts`, which both `tags` and `find_and_replace` now call. The reasons, messages and row order are unchanged.

## D4 — One upstream call shape; the wrapper owns ordering and projection

**Decision**: Every successful call issues exactly one CLI invocation:

```
obsidian [vault=<vault>] tags format=json [file=<file> | path=<path>] counts [active]
```

`counts` is always sent, and `sort=count` is never sent. The wrapper then:
1. Parses the JSON array against a `.loose()` upstream entry schema (field names pinned at T0 P1).
2. Strips exactly one leading `#` from each name (FR-013).
3. Sorts: default by `compareTagNames`; `sortByCount` by count descending, then `compareTagNames` (FR-011).
4. Projects: drops `count` from every entry when `includeCounts === false` (FR-009).
5. Builds `{ total: tags.length, tags }` and parses it defensively against `tagsOutputSchema`.

`compareTagNames(a, b)` = compare `a.toLowerCase()` with `b.toLowerCase()` by UTF-16 code unit; if equal, compare `a` with `b` by UTF-16 code unit. This is the `properties` handler's comparator (`src/tools/properties/handler.ts` — case-insensitive primary, byte-order tiebreak). It is never locale-aware.

**Rationale**:
- Counts are always fetched because `sortByCount: true` with `includeCounts: false` must still order by count (FR-011). One upstream shape also means one wire schema and one set of fixtures.
- Wrapper-side sorting makes ordering independent of undocumented upstream collation (Q3 clarification). Upstream `sort=count` tie order is unknown, so it is not trusted.
- The upstream `total` flag is not used: `total` in the output is always `tags.length`.

**Alternatives considered**: Passing `sort=count` through. Rejected: it would add a second upstream shape to test and still need a wrapper re-sort for ties. Omitting `counts` when `includeCounts: false`. Rejected because of the sortByCount interaction above. The payload saving is negligible next to one CLI spawn.

## D5 — Empty result

**Decision**: An untagged vault or an untagged note returns `{ total: 0, tags: [] }`. The handler recognises both a JSON empty array (`[]`) and a fixed plain-text sentinel, if the CLI emits one. Precedent: `outline`'s `"No headings found."` (`EMPTY_OUTLINE_SENTINEL`). T0 probe P2 pins the exact sentinel string (if any) for both the vault-wide and the per-note case. It is exported as `EMPTY_TAGS_SENTINEL` and matched only by exact equality after trimming. A sentinel-shaped string that does not match exactly falls through to JSON parsing, which fails loudly (Principle IV).

## D6 — Failure classification (zero new top-level codes)

| Situation | Classified by | Code surfaced | Notes |
|---|---|---|---|
| Schema / scope / path-safety failure | `registerTool` + `mapValidationError` | `VALIDATION_ERROR` (± `details.code`/`reason`) | No CLI call (AC-9, AC-11, AC-12, FR-007) |
| Unknown `vault` | `invokeCli` success-path re-classification (`Vault not found.` on stdout, exit 0) | `CLI_REPORTED_ERROR` (`details.message: "Vault not found."`) | The UNDERLYING edge case: the dispatch classifier alone would treat this as success; `invokeCli` catches it explicitly. A handler test locks it for `tags`. T0 P8 confirms `tags` emits the same signature; fallback in the T0 table. |
| `activeOnly: true`, no active note | `dispatchCli` priority (b) (`Error: No active file.` on stdout) → `ERR_NO_ACTIVE_FILE`; the handler re-throws with a `tags`-specific message | `ERR_NO_ACTIVE_FILE` | The dispatch message advises `target_mode: "specific"`, which `tags` does not have. The handler catches `ERR_NO_ACTIVE_FILE` and re-throws an `UpstreamError` with the same code, the original as `cause`, the original `details` preserved, and the message: *"No active file in Obsidian. Open a note in the editor, or call tags with `file` or `path` instead of `activeOnly`."* (FR-016 / AC-13). T0 P7 confirms the `tags active` signature. |
| `file` / `path` names no note | `dispatchCli` priority (c) (`Error: …` on stdout) | `CLI_REPORTED_ERROR` with the upstream message | FR-017. T0 P6 pins the stdout wording for the docs. Fallback if the CLI instead returns an empty listing for a missing file: see the T0 table. |
| Output over 10 MiB | `dispatchCli` bounds | `CLI_OUTPUT_TOO_LARGE` | FR-019. No partial list. |
| Timeout / binary missing / non-zero exit / Obsidian down | `dispatchCli` (+ ADR-029 cold-start retry, ADR-030 app-down launch) | existing codes | Inherited, no per-tool code |
| Unparseable stdout, or JSON not matching the upstream schema | handler | `CLI_REPORTED_ERROR` (`details.stage: "json-parse"` / `"upstream-shape"`, full stdout) | FR-020. Parity with `outline` / `properties` |
| The wrapper's own output fails `tagsOutputSchema` (e.g. a duplicate name after `#`-strip) | `registerTool` runtime-ZodError branch | `INTERNAL_ERROR` | FR-010 safety net. Should be unreachable. |

**Rationale**: Every code above already exists. Principle IV: no `catch` returns an empty result; the only catch in the handler re-throws with the same code.

## D7 — Content and limits behaviours are inherited; the probes turn them into the contract

| Behaviour | Wrapper action | Where it is fixed in place |
|---|---|---|
| Fenced-code tokens excluded (FR-014, AC-8) | none (metadata cache excludes them) | T0 P3 fixture + live characterisation case; handler unit test proves the wrapper adds nothing |
| Frontmatter + inline both present (FR-015) | none | T0 P4 |
| Hierarchical `#parent/child` (parent entry? rolled-up count?) | none (no rollup, no split) | T0 P4 → spec Edge Cases + docs |
| Case variants (merged vs separate) | none (Q2) | T0 P4 → spec Edge Cases + docs; if merged, FR-011's byte-order tiebreak is labelled "unobservable end-to-end" (Q3) |
| Non-ASCII / non-Latin names | none (no normalisation) | T0 P4 → docs |
| Per-note `count` meaning | none | T0 P5 → spec Edge Cases + docs |
| Built-in-looking tag names (AC-16) | none (no special casing) | handler unit test with fixture names |
| Staleness window | none (single snapshot, no re-index wait) | docs (Inherited limitations) |
| Size ceiling | none (no truncation) | T0 P9 measures bytes per entry; docs state ceiling ≈ 10 MiB ÷ observed bytes per entry (order of 10⁵ tags at typical name lengths) |

## D8 — Surface text, docs, registration, baseline

**Decision**:
- `index.ts`: `TAGS_TOOL_NAME = "tags"`, a description that points at `help({ tool_name: "tags" })` and contrasts the tool with `tag`, `responseFormat` json (default), and the `mapValidationError` hook (D3).
- `src/server.ts`: one import and one `createTagsTool({ logger, queue })` line in the alphabetical registration list. No new DI argument (no `vaultRegistry` needed).
- `docs/tools/tags.md` (new; `assertToolDocsExist` requires it at boot) + one `docs/tools/index.md` entry. Four or more worked examples: vault-wide, file-scoped, sortByCount, activeOnly (+ includeCounts:false). Full error roster. Inherited limitations: staleness, case, non-ASCII, hierarchy, per-note counts, size ceiling, client-class unknown-key pathways.
- `src/tools/_register-baseline.json`: regenerated via `npm run baseline:write`, adding exactly one `tags` entry. No other tool's fingerprints move.
- `README.md`: one row in the tools table.
- `CLAUDE.md`: the active-plan pointer rotates to this plan.

**Rationale**: Mirrors the per-tool registration cohort (ADR-006). The FR-018 baseline test catches any unintended drift in other tools.

## D9 — Test design (Principle II; AC → test map)

All automated tests are in-process with a mocked spawn (`makeRegistrationStubSpawn` / the handler-test fixtures). They need no live CLI and are exempt from the `.memory` gate. Each one is deterministic, so it passes unchanged on repeated runs (FR-024, SC-004).

| AC | Locked by |
|---|---|
| AC-1 vault-wide with counts | `handler.test.ts`: argv has `tags format=json counts`, no `file`/`path`/`active`; output entries carry counts; `total` = length |
| AC-2 / AC-3 file / path scope | `handler.test.ts`: argv carries `file=` / `path=` verbatim; `vault=` prefix present iff `vault` supplied |
| AC-4 activeOnly | `handler.test.ts`: argv carries `active` flag, no `vault=` |
| AC-5 ordering | `handler.test.ts`: default alphabetical (case-insensitive + byte tiebreak, non-ASCII fixture); `sortByCount` count-desc with name tiebreak; order ignores upstream order |
| AC-6 includeCounts:false | `handler.test.ts`: no entry has a `count` key (`Object.keys`); sortByCount still applied |
| AC-7 empty | `handler.test.ts`: `[]` and the sentinel → `{ total: 0, tags: [] }` |
| AC-8 fenced code | `handler.test.ts` (upstream fixture captured at T0 P3 from the fence fixture note; the wrapper passes through, adds nothing) + live characterisation case recorded in `contracts/t0-probe-plan.md` evidence |
| AC-9 two scopes | `schema.test.ts` (each conflict row) + `index.test.ts` (`SCOPE_CONFLICT`/reason; spawn never called) |
| AC-10 vault omitted / supplied | `handler.test.ts`: argv `vault=` absent vs present (alone and with `file`/`path`) |
| AC-11 unknown key | `schema.test.ts` + `index.test.ts` (spawn never called). The test description documents the dual pathway: clients that strip unknown keys before sending never reach this rejection; it is observable only on forwarding clients |
| AC-12 activeOnly + vault | `schema.test.ts` + `index.test.ts` (`SCOPE_CONFLICT`/`active+vault`; spawn never called) |
| AC-13 no active note | `handler.test.ts`: stub stdout `Error: No active file.` → `ERR_NO_ACTIVE_FILE` with the `tags` message naming `file`/`path` |
| AC-14 docs | `index.test.ts` / existing `assertToolDocsExist` boot check + help-tool lookup test that `help({tool_name:"tags"})` returns the page with the four example headings |
| AC-15 | this map: every AC has ≥ 1 test |
| AC-16 built-in-looking names | `handler.test.ts`: names like `todo`, `inbox`, `#`-heavy forms pass through unchanged |
| Security (path traversal) | `schema.test.ts` + `index.test.ts`: `../x.md`, `/abs.md`, `C:\x.md` → `INVALID_NOTE`/`path-traversal`, no spawn |
| UNDERLYING (unknown vault) | `handler.test.ts`: stub stdout `Vault not found.` exit 0 → `CLI_REPORTED_ERROR` |
| Output cap / malformed JSON | `handler.test.ts`: `CLI_OUTPUT_TOO_LARGE` propagates; non-JSON stdout → `CLI_REPORTED_ERROR` `json-parse` |

## T0 fallback table (decided before probing)

| Probe outcome | Decided fallback |
|---|---|
| P1: `format=json` not honoured by `tags`, or JSON lacks counts | Parse `format=tsv` (`<tag>\t<count>` lines) with a strict line schema instead. Same output contract. Recorded in research as D1-amend. If neither works, escalate before switching to `eval`. |
| P2: no sentinel (empty stdout or `[]`) | Treat trimmed-empty stdout and `[]` as empty; drop `EMPTY_TAGS_SENTINEL`. |
| P6: missing `file`/`path` returns an empty listing instead of `Error:` | Add a handler pre-check: before listing, resolve the note via `obsidian file` (the `resolveFileByTsv` helper in `_active-file.ts`) and raise `CLI_REPORTED_ERROR` on a miss. FR-017 forbids a silent empty list. |
| P7: `tags active` with no active note does not emit `Error: No active file.` | Detect the observed signature in the handler and raise `ERR_NO_ACTIVE_FILE` explicitly, with the same message. |
| P8: unknown vault under `tags` does not start with `Vault not found.` | Add an explicit handler check for the observed signature → `CLI_REPORTED_ERROR` (the UNDERLYING requirement). |
| P4: case variants merged | Edit FR-011 / Edge Cases: byte-order tiebreak "unobservable end-to-end". The comparator stays implemented and unit-tested. |

### T0 outcomes (2026-10-24)

Evidence: [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md). Mismatches are logged in spec Clarifications ("implement-time T0 probe results").

| Probe | Fallback fired? | Applied |
|---|---|---|
| P1 | no: `format=json` works and carries counts | Wire entry is `{ tag: "#…", count: "<digits>" }`. **D4 amendment**: `count` arrives as a digit string, so the upstream schema validates `^\d+$` and the handler converts it to an integer. No TSV parse. |
| P2 | partially: a sentinel exists | `EMPTY_TAGS_SENTINEL = "No tags found."` (both scopes). `[]` is also accepted; trimmed-empty stdout is not. |
| P4 | **scope-dependent** (not anticipated) | Merged vault-wide, separate per note. The tiebreak is labelled "unobservable end-to-end" for vault-wide listings only. |
| P6 / P7 / P8 | no | Signatures match the existing dispatch / `invokeCli` classifiers. No handler signature checks, no `vaultRegistry` DI. |
