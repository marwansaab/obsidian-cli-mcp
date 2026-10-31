# ADR-044 — File-path tools check the type of the file they will act on, and rename and move keep it

- **Status:** Accepted
- **Date:** 2026-10-31
- **Source:** PR #97 (BI-0060, `specs/070-prevent-filetype-changes/`,
  FR-002 to FR-013, research D2 to D5 and the D3 amendment), commits
  `2e18e95`, `626f6a4` and `5cf24a1`
- **Related:** ADR-003 (Enforce Target Mode in Typed Tools), whose
  `file` / `path` / active locators this decision resolves before acting;
  ADR-015 (Sub-Discriminators via details.reason for Multi-State Error Codes),
  which governs the closed `details.reason` set; ADR-040 (Published Parameter
  Descriptions and Server Instructions), whose descriptions now carry the
  supported-types sentence

## Context

Before PR #97 nothing on the tool surface knew what a vault file was. `rename`
appended `.md` to any name that lacked it, so renaming `Plan.canvas` to `Plan2`
produced `Plan2.md`, a canvas turned into a broken note. `move` guarded only
sources given as a `path`. `write_note` turned `file: "Plan.canvas"` into
`Plan.canvas.md` and, in active mode, overwrote whatever was focused.
`append_note` and `prepend` wrote note text into any file; `read` returned
decoded binary for attachments. No description said which types a tool
handles.

The live CLI does not help. The T0 probes for PR #97 (P1 in
`specs/070-prevent-filetype-changes/contracts/t0-probe-plan.md`) showed it
renames across types in either direction without complaint, and that it reads
an extensionless `move` destination as a **folder**. The rule therefore has to
live in the wrapper, and it has to know the source's type before it calls the
CLI.

The type is not always in the input. A `file` locator is a wikilink-style name
that Obsidian resolves; active mode carries no name at all.

## Decision

1. **Each tool declares the types it handles, next to its handler.** An
   `X_SUPPORTED` constant in `handler.ts`, typed `SupportDeclaration` (a list
   of `note`, `canvas`, `base`, `attachment`, or `"any"`). The same constant
   drives the handler's check and the sentence `describeSupport` appends to
   the tool's published description, so the two cannot disagree.
2. **The check runs on the resolved file, before anything changes.** A `path`
   is classified as given. A `file` name is resolved through the
   `obsidian file` TSV resolver and the resolved path is classified. Active
   mode resolves the focused file through the focused-file `eval`. A rejection
   is `VALIDATION_ERROR` with `details.code: "UNSUPPORTED_FILE_TYPE"` and
   `details.reason` from the closed set `unsupported-type` | `type-change`;
   no top-level code is added.
3. **`rename` and `move` keep the source's type.** A destination with no
   extension gets the source's; one naming a *different* recognised type is
   rejected with `reason: "type-change"` and `alternative: "obsidian_exec"`,
   the deliberate route for a type change. An unrecognised trailing segment
   counts as part of the name, so it too gets the source's extension
   (`v1.2` on a canvas becomes `v1.2.canvas`). Markdown outcomes are
   byte-stable, including `Renamed.MD` → `Renamed.MD.md`.
4. **What is forwarded depends on the locator.** `file` calls forward the
   original `file=` (the action command resolves the name exactly as the
   check did, so Markdown argv is unchanged). Active calls forward the
   resolved `path=` and **no `vault=`**, so the CLI uses its current vault —
   the one the vault-less focused-file `eval` just read (T0 P6) — and a focus
   change to another file between the two calls cannot redirect the action.
5. **Existing rejections keep their names.** Tools that already refused other
   types (`NOT_MARKDOWN`, `INVALID_NOTE`, `INVALID_BASE_PATH`) gain only the
   description sentence; renaming a discriminator clients rely on would be a
   breaking change under ADR-015.

## Alternatives rejected

- **Forward `vault=<display name>` in active mode.** This is what PR #97 first
  shipped (`2e18e95`), with the vault registry injected into `read`, `rename`,
  `move` and `outline` and four `createServer` lines changed to pass it. Review
  found the display name came from `resolveVaultDisplayName`, which falls back
  to the vault's absolute folder path when the reverse lookup misses — and the
  CLI rejects `vault=<absolute path>`, so a registry miss would surface as a
  misleading "vault not found" (BI-0121 tracks that fallback). The owner ruled
  for sending no `vault=` at all (review ruling Q1 = B, BI-0117 fix path 3),
  verified first by T0 P6. The fix (`5cf24a1`) took the registry back out of
  the four tools, so `createServer`, a kernel node, is not touched by the
  merged PR. The recorded fallback — keep the display name but fail loudly on
  a null reverse lookup — was not needed.
- **Classify the locator string only.** Cheaper, but there is no string in
  active mode, and assuming an extensionless `file` name means a note relies
  on Obsidian's resolution rules rather than reading them.
- **Check after the CLI acts** (compare the response's `fromPath` and
  `toPath`). By then the vault has changed; the spec requires rejection before
  any change.
- **Forward the resolved `path=` in `file` mode too.** No safety gain, since
  both calls resolve the name the same way, and it would change Markdown
  action arguments.
- **A central tool → types registry**, or a `ToolSpec.fileTypes` field that
  `registerTool` turns into the sentence (raised as review finding F5). Either
  splits a tool's contract across two files, and the registry variant would
  make the leaf `src/file-type/` module import knowledge of every tool.

## Consequences

- `file` and active calls of `read`, `rename`, `move` and `outline` cost one
  extra CLI round-trip (the resolver or the focused-file `eval`). `path`
  calls, the form the server instructions recommend for automation, cost
  nothing extra.
- Active mode for those four tools now goes out in specific mode with a
  `path=` and no `vault=`. The residual risk is a switch of the focused
  **vault** between the `eval` and the action call; the owner accepted the
  same residual for the post-write metadata refresh (PR #87). In one
  non-reproducible P6 window both calls saw another vault and the action
  failed loudly rather than acting on the wrong file.
- The spec 021 `rename` clarification (".md-only; other types use
  `obsidian_exec`") and the spec 030 `move` source-`.md` guard are superseded
  by spec 070. They were spec-level locks, not ADRs, so no ADR is superseded.
- The attachment row of the extension table is Obsidian's no-plugin view
  registry as probed on the test vault (P5 added `oga` and `opus`). A plugin
  that registers a new extension does not make it a core type here: such a
  file is "other", handled by the `"any"` tools and rejected by the rest.
