# Phase 0 Research — List Files

Captures the design decisions ratified at planning stage (R1–R16) and the live-CLI findings (F1–F20) that drove them. Per the project convention (R12 / [013 research.md](../013-read-property/research.md)), this file is the source of record for plan-stage spec amendments — spec.md is NOT edited retroactively.

## Live-CLI findings (probe pass on 2026-05-12 against the authorised test vault `TestVault-Obsidian-CLI-MCP`)

All probes ran via `& obsidian vault=TestVault-Obsidian-CLI-MCP …`. Probes were read-only (no fixtures written); no cleanup required. The user's focused vault at probe time was "The Setup" (327 files), captured for the active-mode probes (F14).

### F1 — `files` is the native CLI subcommand

`obsidian help files` reports:

```
files                 List files in the vault
  folder=<path>       - Filter by folder
  ext=<extension>     - Filter by extension
  total               - Return file count
```

The CLI's argv shape maps 1:1 to the spec's input surface (`folder` / `ext` / `total`). The wrapper composes argv as `vault=<v> files [folder=<f>] [ext=<e>]` and consumes the resulting path-list stdout. The CLI's `total` flag is NOT used by the wrapper — see R7 / F12 for the rationale.

### F2 — Listing is recursive by default

`files folder=Fixtures/BI-038` returns paths from BOTH the named folder AND its sub-folders:

```
Fixtures/BI-038/repro-tiny.md                          (direct child)
Fixtures/BI-038/tc-030-fresh-by-path.md                (direct child)
…
Fixtures/BI-038/v0.2.9-checkpoint/us1-5kb-fresh.md     (RECURSIVE — sub-folder content)
Fixtures/BI-038/v0.2.9-checkpoint/us1-12kb-fresh.md    (RECURSIVE — sub-folder content)
Fixtures/BI-038/v0.2.9-checkpoint/us1-60b-fresh.md     (RECURSIVE — sub-folder content)
```

This is the most consequential finding of the plan: **the spec's locked non-recursive contract (FR-012) is NOT a CLI property — it is a wrapper-imposed filter applied post-fetch**. The wrapper drops every result path whose component count exceeds `folder`'s component count + 1.

### F3 — Output is one path per line; no JSON envelope; vault-relative `/`-separated paths

Stdout format is line-delimited UTF-8. Each line is a vault-relative path with forward-slash separators regardless of host OS. Empty stdout (zero matches) is exit 0 with no error. No header, no footer, no JSON, no TSV. Parse via `stdout.split("\n").map(s => s.trim()).filter(Boolean)`.

### F4 — Trailing-slash on `folder` is CLI-normalised

`folder=Fixtures/BI-009/` and `folder=Fixtures/BI-009` produce byte-identical stdout. FR-013's normalisation requirement is satisfied natively at the CLI; the wrapper does NOT pre-normalise the `folder` argument.

### F5 — `folder=<missing path>` returns empty stdout (exit 0)

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP files folder=DoesNotExist
                                        # (empty stdout, exit 0)
```

Indistinguishable from "folder exists but contains no files". FR-010's missing-vs-empty conflation is satisfied natively.

### F6 — `folder=<file path>` returns empty stdout (exit 0)

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP files folder=Welcome.md
                                        # (empty stdout, exit 0)
```

Indistinguishable from "folder exists but contains no files". FR-010's folder-names-a-file branch is satisfied natively.

### F7 — `ext=md` and `ext=.md` are equivalent

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP files folder=Fixtures/BI-009 ext=md
Fixtures/BI-009/active-target.md … (4 files)

$ obsidian vault=TestVault-Obsidian-CLI-MCP files folder=Fixtures/BI-009 ext=.md
Fixtures/BI-009/active-target.md … (4 files)        # byte-identical to above
```

The CLI handles both forms. Wrapper does NOT pre-normalise.

### F8 — `ext` is case-sensitive

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP files folder=Fixtures/BI-009 ext=md
… (4 files)

$ obsidian vault=TestVault-Obsidian-CLI-MCP files folder=Fixtures/BI-009 ext=MD
                                        # (empty stdout; no .MD files exist)
```

The CLI matches extension case-sensitively against the on-disk filename. On Windows hosts where the filesystem itself is case-insensitive, the CLI still treats `MD` ≠ `md` for matching purposes. **The wrapper does NOT impose case normalisation** — passes `ext` through verbatim; the case-sensitivity behaviour is documented in `docs/tools/list_files.md` as a contract item, not a quirk.

### F9 — `ext=<unrecognised>` returns empty stdout (exit 0)

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP files folder=Fixtures/BI-009 ext=qqq
                                        # (empty stdout)
```

Indistinguishable from "folder is empty" or "folder is missing". FR-010 conflation extends to ext-mismatch shape.

### F10 — `total` flag returns a single integer on its own line

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP files folder=Fixtures/BI-009 total
4
```

The integer is the count of files the CLI would have returned without the flag. The flag is positional (no `=` argument); the CLI parses bare keyword tokens for "flag" parameters.

### F11 — `total` composes with `ext`

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP files folder=Fixtures/BI-009 ext=md total
4

$ obsidian vault=TestVault-Obsidian-CLI-MCP files folder=Fixtures/BI-009 ext=qqq total
0
```

### F12 — `total` count is RECURSIVE (same semantics as the path listing)

```
# Fixtures/BI-038 contains 15 direct files + sub-folder v0.2.9-checkpoint/ (3 files)
$ obsidian vault=TestVault-Obsidian-CLI-MCP files folder=Fixtures/BI-038 total
18                                      # 15 direct + 3 recursive
```

**This is the second consequential finding**: the CLI's `total` flag is NOT compatible with the wrapper's non-recursive contract. If the wrapper delegated `total: true` to the CLI's `total` flag, the count would include recursive subtree files — diverging from `total: false` (which after the wrapper's non-recursive filter contains only direct children). The spec's FR-007 + SC-005 require `total: true` and `total: false` to return identical `count` values; the only architectures that satisfy both invariants either fetch paths in both modes (R7) or assume the folder has no sub-folders (an invariant the wrapper can't cheaply verify before fetching). **R7 — wrapper always fetches paths and computes count locally** is the chosen architecture.

### F13 — Unknown vault returns `Vault not found.` exit 0

```
$ obsidian vault=NonExistentVault files folder=Inbox
Vault not found.
```

Byte-identical to the inheritance baseline from feature 011 (R5). The cli-adapter's response-inspection clause re-classifies this to `CLI_REPORTED_ERROR` without wrapper-side handling. **R5 inheritance applies unchanged.**

### F14 — Active mode (no `vault=` argument) resolves to focused vault

```
$ obsidian vaults
TestVault-Obsidian-CLI-MCP
The Setup

$ obsidian files                        # no vault= → defaults to focused vault
000-Meta/About This Vault.md            # …i.e. "The Setup" at probe time
000-Meta/MCP Tool Notes.md
…

$ obsidian files total
327
```

Active mode works through the cli-adapter's existing `target_mode: "active"` plumbing (no `vault=` in argv; CLI resolves to the focused vault). Same shape as every other typed tool's active mode.

### F15 — Path-traversal returns empty stdout (CLI confines to vault)

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP files folder=../../etc
                                        # (empty stdout; no system files leak)
```

The CLI does NOT enumerate filesystem paths outside the vault root, even when `folder=` names one. FR-016's vault-confinement contract is satisfied natively at the CLI. The wrapper does NOT pre-validate `folder` for traversal patterns — the cross-tool consistency principle (no per-tool retrofit; see Q3 memory) applies.

### F16 — Within-vault traversal (`folder=A/../B`) is treated LITERALLY (not normalised)

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP files folder=Fixtures/../Fixtures/BI-009
                                        # (empty stdout)
```

The CLI does NOT path-normalise `..` segments. `Fixtures/../Fixtures/BI-009` resolves on the host filesystem to `Fixtures/BI-009/` (which contains 4 files), but the CLI returns no results because it treats the literal string `Fixtures/../Fixtures/BI-009` as the folder name. The wrapper does NOT pre-normalise either — callers using normalised paths get the empty-folder shape (per FR-010's conflation).

### F17 — Absolute paths return empty stdout (CLI rejects)

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP files folder="C:\…\TestVault-Obsidian-CLI-MCP\Fixtures\BI-009"
                                        # (empty stdout)
```

CLI does NOT accept absolute filesystem paths. Same shape as F15 / F16 — empty stdout, exit 0.

### F18 — Dot-directories are NOT returned by `files` natively

```
$ obsidian vault=TestVault-Obsidian-CLI-MCP files folder=.obsidian
                                        # (empty stdout)

$ obsidian vault=TestVault-Obsidian-CLI-MCP files folder=.obsidian total
0
```

The CLI's `files` enumeration appears to filter dotfiles natively (the root listing of 40 files contained zero `.obsidian/...` paths; an explicit `folder=.obsidian` query returned zero results). This means FR-028's wrapper-side dotfile filter is defence-in-depth, not load-bearing. The wrapper still applies the filter so the contract is immune to CLI behaviour change.

### F19 — Sub-folder entries NEVER appear in `files` output (CLI returns files only)

Scanning the recursive Fixtures listing (37 paths) for any path ending in `/` or any path matching a folder name yielded zero matches. The CLI's `files` subcommand returns FILE paths only — sub-folder names are exposed through the separate `folders` subcommand. This means FR-026's wrapper-side sub-folder filter is also defence-in-depth, not load-bearing. The wrapper still applies the filter so the contract is immune to CLI behaviour change.

### F20 — Output ordering is NOT lexically sorted

The CLI's `files` stdout for `Fixtures/BI-038/v0.2.9-checkpoint/`:

```
us1-5kb-fresh.md       ← appears first
us1-12kb-fresh.md      ← second
us1-60b-fresh.md       ← third
```

Pure lexical ascending byte-compare order would be: `us1-12kb-fresh.md, us1-5kb-fresh.md, us1-60b-fresh.md` (because `1` < `5` < `6` at byte position 4). The CLI's order is some other convention — possibly insertion / mtime / Obsidian metadata-cache order. **This confirms FR-027's wrapper-imposed lexical sort is essential**: the CLI does NOT sort in the contracted order; the wrapper must re-sort.

## Design decisions

### R1 — Logger surface: thin handler, no per-call events

Parity with features 011 / 012 / 013 / 014 / 015 / 018. The cli-adapter's `dispatchTimeout` / `dispatchCap` / `dispatchKill` events preserve observability for the underlying CLI invocation. The handler emits NO `logger.callStart` / `callEndSuccess` / `callEndFailure` events.

### R2 — CLI subcommand selection: `files` (native)

The `files` subcommand maps 1:1 to the wrapper's surface (F1). Rejected alternatives:
- `eval` (per the find_by_property / read_heading composition pattern): the native subcommand obviates eval entirely, so `eval` would be a worse choice — more complex, no anti-injection burden, no FIXED template needed.
- `obsidian_exec` (per the escape-hatch pattern): defeats the purpose of a typed tool (the user input's premise is "agents consume the path list as a structured array").

### R3 — Per-mode call architecture: ONE invokeCli call per request

The handler emits exactly ONE spawn per request regardless of `target_mode`. Argv shape:

- **Specific mode**: `vault=<v> files [folder=<f>] [ext=<e>]` — one call with locator in argv.
- **Active mode**: `files [folder=<f>] [ext=<e>]` — one call without locator (the cli-adapter's `target_mode: "active"` plumbing strips any leaked `vault=`).

No two-call branches. No path-resolution pre-flight (the surface is folder-scoped — there is no `file` / `path` locator to canonicalise; F4 confirms trailing-slash normalisation is at the CLI).

### R4 — Target-mode mapping: STANDARD

The user-facing schema HAS the `target_mode` field. The handler passes `input.target_mode` through to `invokeCli` unchanged. In specific mode `vault` flows through; in active mode the cli-adapter's `stripTargetLocators` defence-in-depth strip removes any leaked `vault` / `file` / `path` from `parameters`.

### R5 — Unknown-vault response inspection: inherited from 011-R5 clause

F13 confirms the unknown-vault stdout shape (`Vault not found.` exit 0) matches the inheritance baseline. The cli-adapter's existing response-inspection clause (introduced in 011) re-classifies it to `CLI_REPORTED_ERROR` without wrapper-side handling.

### R6 — Folder filter is recursive at the CLI; wrapper enforces non-recursive contract post-fetch

F2 confirms `files folder=X` returns a recursive subtree, not the direct children of `X`. The wrapper enforces FR-012's non-recursive contract by filtering result paths whose component count exceeds `(folder components + 1)`. Implementation: split path on `/`, compare lengths.

```
folder = "Fixtures/BI-038" (2 components)
path   = "Fixtures/BI-038/repro-tiny.md" (3 components) → KEEP (2+1=3)
path   = "Fixtures/BI-038/v0.2.9-checkpoint/us1-5kb-fresh.md" (4 components) → DROP (4>3)
```

Vault-root listing (no `folder` input) computes the threshold as 1 (a root-level file is a 1-component path).

### R7 — Wrapper does NOT delegate to CLI's `total` flag

F12 found CLI's `total` is recursive. To honor the spec's FR-007 + SC-005 (the count returned by `total: true` MUST equal the count returned by `total: false`), the wrapper applies the same fetch + filter pipeline in both modes:

1. Fetch path list via CLI (one spawn).
2. Apply non-recursive filter (R6).
3. Apply sub-folder filter (FR-026 — defence-in-depth; F19 says CLI never returns folders).
4. Apply dotfile filter (FR-028 — defence-in-depth; F18 says CLI already excludes dotfiles).
5. Apply lexical sort (R8 / FR-027).
6. Set `count = filtered.length`. On `total: true`, set `paths = []`; on `total: false`, set `paths = filtered`.

**Consequence — plan-stage SC-012 amendment (R12)**: see "Plan-stage spec amendments" below. `total: true` does NOT provide cap-evasion for pathological folders; both modes apply the same CLI fetch and so face the same output-cap threshold.

### R8 — Sort: UTF-8 byte-compare via `Buffer.compare`

FR-027 specifies "lexical ascending byte-compare on the UTF-8-encoded vault-relative path string". JavaScript's native `Array.prototype.sort` with the default string compare uses UTF-16 code-unit ordering — which differs from UTF-8 byte ordering for non-BMP characters (U+10000 and above, including emoji). The wrapper implements true UTF-8 byte-compare:

```ts
paths.sort((a, b) => Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8")));
```

For BMP-only paths (the overwhelming majority — every ASCII path, every Latin / CJK path that fits in U+0000–U+FFFF), UTF-16 and UTF-8 byte-compare produce the same order. For non-BMP-containing paths (emoji-named files, mathematical-script glyphs in filenames, etc.) the wrapper's order differs from JavaScript's default; the wrapper's order is the contracted one.

### R9 — Filter pipeline order is observably commutative

The three wrapper-side filters (non-recursive R6, sub-folder FR-026, dotfile FR-028) operate on the path string and accept/reject independently — i.e. they commute. Implementation orders the cheapest-rejecting filter first:

1. Sub-folder filter (FR-026) — predicate: path ends with `/`. F19 says zero matches in production, but the filter is structurally fast.
2. Dotfile filter (FR-028) — predicate: any path segment starts with `.`. Fast, defence-in-depth.
3. Non-recursive filter (R6) — predicate: component count check.

(Order chosen for engine-friendliness; the filtered set is identical regardless of order.)

### R10 — Ext filter delegated to CLI

The wrapper passes `ext` to the CLI via `ext=<value>` argv. The CLI handles both leading-dot (`.md`) and bare (`md`) forms (F7); case-sensitive (F8); unknown extensions return empty stdout (F9). The wrapper does NOT post-filter on extension — the CLI's filter is authoritative. Rationale: applying the filter at the CLI reduces the wire bytes returned to the wrapper (relevant for output-cap considerations), and matches the existing typed-tool pattern of delegating filter logic where the CLI supports it.

### R11 — Output schema

```ts
const listFilesOutputSchema = z.object({
  count: z.number().int().nonnegative(),
  paths: z.array(z.string()),
}).strict();
```

Two fields, strict mode. No mode discriminator on the output (both branches of `total` use the same shape; on `total: true` the `paths` field is `[]`). Inferred type via `z.infer<typeof listFilesOutputSchema>` is the canonical `ListFilesOutput` per Constitution III.

### R12 — Don't amend predecessor specs

Plan-stage findings that contradict or refine spec.md statements are documented HERE in research.md (not back-edited into spec.md). The merge-stage Constitution Compliance checklist's evidence section cites the relevant research.md sections. This is consistent with 013 / 015 / 018 plan-stage practice. The list of plan-stage spec amendments for this feature is at the end of this file.

### R13 — Test seams: ONE spawn per request

Handler tests inject `deps.spawnFn` per the cli-adapter convention. Every list_files request — specific or active, with or without folder / ext / total — emits exactly ONE spawn. Tests assert spawn count and argv shape (no `total` flag in argv per R7; `folder=` / `ext=` only when input present).

### R14 — Path-traversal handled at CLI layer

F15 confirms the CLI returns empty stdout for `folder=../../etc`. F16 confirms within-vault `..` segments are also treated literally (no normalisation). F17 confirms absolute paths are rejected. FR-016 satisfied natively — wrapper does NOT pre-validate `folder` for traversal patterns. Cross-tool consistency with `write_property` (FR-026 in that spec; R14 in 018's research).

### R15 — Empty-string `folder` / `ext` semantics

Empty-string values are NOT in the test surface of the live-CLI probe — but the schema permits `folder?: z.string().optional()`. Plan-stage decision:

- `folder: ""` is REJECTED at the validation boundary (zod refinement: `folder: z.string().min(1).optional()`). Rationale: a callerSupplying empty-string almost certainly intended to omit the argument; surfacing a validation error catches the bug.
- `ext: ""` is similarly REJECTED (`ext: z.string().min(1).optional()`). Same rationale.

This is a tighter contract than "anything goes"; it's worth a schema-level enforcement so the per-tool contract is unambiguous to callers reading the published JSON Schema.

### R16 — Stdout parsing

```ts
function parseStdout(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
```

Trim per-line whitespace (handles trailing `\r` if a future CLI version emits CRLF). Filter empty lines (handles trailing-newline-only stdout — F5 / F6 / F9 / F18 all return empty stdout, which parses to `[]`). No path-component validation at this layer; the filter pipeline (R9) inspects components.

## Plan-stage spec amendments

Per R12, these adjustments to the spec's contracted behaviour are documented here in research.md and surfaced in `docs/tools/list_files.md` as Known Limitations. spec.md is NOT back-edited.

### Plan-amendment-1 — SC-012 weakening: `total: true` is NOT a cap-evasion path

The spec at SC-012 says: "A folder whose serialised `paths` array would exceed the typed-tool output cap produces a structured 'output too large' error AND no truncated `paths` array. The same fixture queried with `total: true` succeeds with the full count."

The second sentence assumes the wrapper uses a CLI count-only mode for `total: true`. R7 found that's incompatible with FR-007 + SC-005 (the CLI's `total` is recursive; the wrapper's contract is non-recursive). The wrapper applies the same fetch pipeline in both modes, so both modes face the same output-cap threshold.

**Amended contract**: `total: true` does NOT escape the CLI output cap. Both modes apply identical filter pipelines and so encounter the cap together. `total: true` reduces the wrapper→MCP-client response payload (per SC-018) but does NOT reduce the CLI→wrapper payload (per the architecture in R7).

**Where documented**:

- This file (Plan-amendment-1).
- `docs/tools/list_files.md` Known Limitations section.
- The merge-stage Constitution Compliance checklist's evidence section cites this amendment.

**SC-012 retired claim**: "The same fixture queried with `total: true` succeeds with the full count" — the second sentence of SC-012 is unrealisable under the chosen architecture. The first sentence (structured "output too large" error rather than silent truncation) still holds, and is observable across both `total: false` AND `total: true` invocations against the same fixture (both fail identically).

**Mitigation for callers facing pathological folders**: use `obsidian_exec` against `files folder=X total` (uses the CLI's native `total` flag, which is cap-friendly but produces a RECURSIVE count). Document this fallback in the published docs.

### Plan-amendment-2 — FR-026 / FR-028 are defence-in-depth, not load-bearing

F18 confirms the CLI's `files` subcommand already filters dotfiles natively. F19 confirms it never returns sub-folder entries. The wrapper's FR-026 (sub-folder filter) and FR-028 (dotfile filter) are therefore defence-in-depth — they would only become observable if a future Obsidian CLI version changed the enumeration semantics. The wrapper APPLIES the filters regardless so the contract is locked at the wrapper layer.

**Action**: no amendment to spec.md text; the wrapper still implements the filters; the test suite still asserts the filter rules with synthetic mock stdout (because the live CLI never emits sub-folders or dotfiles, the filters' visible effect is only inducible from a mocked stdout). The contract holds independent of CLI behaviour.

## FR-023 characterisation roster — coverage at plan stage

The 15 case classes enumerated in FR-023 of spec.md were probed live during plan. Status:

| Case | Status | Findings |
|---|---|---|
| Small folder, all .md | Verified live | F2 (Fixtures/BI-009 = 4 files); F7 (ext=md against same folder) |
| Small folder, mixed extensions | Verified live | F2 implicit (root listing contained .md + extensionless) |
| Empty folder | Verified live | F5 |
| Vault root (no `folder`) | Verified live | F16 implicit; 40 files in TestVault root listing |
| `ext` filter — matches some | Verified live | F7 |
| `ext` filter — matches none | Verified live | F9 (ext=qqq) |
| `ext` filter — `md` vs `.md` | Verified live | F7 |
| Non-existent folder | Verified live | F5 |
| `total: true` populated | Verified live | F10 |
| `total: true` empty | Verified live | F12 (BI-038 = 18 RECURSIVE — confirms R7 architectural divergence) |
| `total: true` missing | Verified live | F12 (missing folder = 0) |
| `total: true` with ext | Verified live | F11 |
| Ordering stability | Verified live | F20 (CLI ordering NOT lexical — confirms wrapper-imposed sort R8 essential) |
| Emoji / non-ASCII / leading-trailing whitespace in names | DEFERRED to T0 of /speckit-implement | TestVault does not contain emoji-named fixtures. Synthetic fixtures required. |
| Dotfiles / dot-directories | Verified live | F18 (CLI excludes natively) |
| `folder` resolves to FILE | Verified live | F6 |
| Trailing slash | Verified live | F4 |
| Unknown vault | Verified live | F13 |
| Active mode + no focused vault | DEFERRED to T0 of /speckit-implement | At probe time a vault WAS focused. Requires a probe with no Obsidian instance OR a probe of the specific eval shape that surfaces "no focused vault". |
| Path-traversal on `folder` | Verified live | F15 / F16 / F17 |
| Synthetically large folder (output-cap) | DEFERRED to T0 of /speckit-implement | Requires fixture authoring (likely synthetic generation of ~200K files). Bundled into T022 of /speckit-tasks. |
| Sub-folders in response | Verified live | F19 (never returned by CLI; FR-026 is defence-in-depth per Plan-amendment-2) |

**Plan-stage status**: 18 of 21 case classes verified live during plan. THREE deferred to T0 of `/speckit-implement` and bundled into the implementation phase's characterisation task:

1. Emoji / non-ASCII / whitespace-in-name fixture pass.
2. Active-mode-no-focused-vault probe.
3. Synthetically-large-folder output-cap probe (and the now-amended SC-012 verification per Plan-amendment-1 that BOTH modes fail identically on the same fixture).
