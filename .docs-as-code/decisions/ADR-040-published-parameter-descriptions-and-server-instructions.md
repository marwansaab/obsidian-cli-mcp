# ADR-040 — Published parameter descriptions and server instructions

- **Status:** Accepted
- **Date:** decided 2026-10-28 by the owner (spec 068 clarification C1);
  implemented 2026-10-30
- **Source:** PR #90 (BI-0165 B1 + B2 + C1; `specs/068-modernise-mcp-surface/`,
  US6, US7, US8, research R7, R8, FR-019 to FR-032), with the PR #90 review
  changes in commit `3c71bf7`
- **Supersedes:** ADR-005 (Token-Optimized Tool Definitions via Progressive
  Disclosure). The `help` tool and the `docs/tools/` reference that ADR-005
  introduced stay; the stripping of parameter descriptions and the "call help
  first" sentence in every tool description are retired.
- **Related:** ADR-003 (Enforce Target Mode in Typed Tools), whose flat schema
  and refinement are unchanged; ADR-006 (Centralized Tool Registration), whose
  `registerTool` stays the only path from a zod schema to a published tool;
  [ADR-039](ADR-039-dual-era-stdio-serving-on-sdk-v2-mcpserver.md), whose
  pass-through adapter this record stops stripping

The maintainer's working-notes copy of this record lives outside the
repository under the same number, with its Decision Log entry. This page
records the decision as PR #90 shipped it after review.

## Context

ADR-005 (2026-05-05) traded what the model sees for tokens. `registerTool`
removed every parameter `description` from the published `inputSchema`, and
each tool description told the model to call `help({ tool_name })` first. That
suited clients that loaded every tool definition into context at session
start.

By 2026-10 three things had changed. Current clients load tool definitions on
demand through a tool-search step, so the up-front cost ADR-005 avoided is no
longer paid at session start. Deferred-tool search matches a task against a
tool's name, title and descriptions, and bare parameter names plus a
"call help first" sentence gave it little to match; the model's first call
often failed validation or cost an extra `help` round trip. And the tool
descriptions themselves had grown back, largely with parameter prose and the
same cross-cutting rules repeated across many tools. Constitution v1.6.0
(*MCP Tool Surface Standards*) now requires a title, explicit four-hint
annotations, a description on every parameter, visible input rules and
server instructions.

## Decision

1. **Publish parameter descriptions.** `toSdkInputSchema`
   (`src/tools/_register.ts`) hands the SDK the zod schema's own JSON Schema
   emission unchanged. `stripSchemaDescriptions` and `src/help/strip-schema.ts`
   are deleted (FR-029).
2. **Describe every parameter.** Every input property of every tool, at every
   depth, has a one-line `.describe()` (FR-030). Output schemas are untouched.
3. **State the target-mode rules in the field descriptions.** Written once in
   `src/target-mode/target-mode.ts`, in `targetModeBaseSchema` and in
   `folderScopedTargetModeBaseSchema` for `files`, `paths` and
   `get_active_file` (FR-031). The schema stays flat and the refinement still
   enforces the rules at call time.
4. **Server instructions own the cross-cutting rules.** `buildInstructions`
   (`src/instructions/instructions.ts`) is built once in `createServer()` from
   the registered tools and passed as `McpServer` `instructions`, so both eras
   receive the same text (FR-025): a fixed opening that names no tool, a
   task-to-tool routing guide, and the rules. A line is kept only when every
   tool it names is offered (FR-026a); the whole stays under 2,000 characters
   (FR-027).
5. **Slim tool descriptions.** The call-help sentence leaves every tool
   description (FR-032), and the rules now in the instructions leave the tools
   that repeated them (FR-028).
6. **Titles and annotations.** Every tool carries a required `title` and all
   four behaviour hints as required booleans, per the spec FR-024 table
   (FR-019 to FR-024).
7. **Fingerprint gate.** The baseline gains `titleFingerprint` and
   `annotationsFingerprint` and was regenerated on purpose.

How each piece is built is in
[architecture.md](../architecture.md#registration--the-one-path-from-a-schema-to-a-published-tool)
and [architecture.md → Server instructions](../architecture.md#server-instructions).

## What review changed

The PR #90 review (commit `3c71bf7`) kept the published surface byte-identical
— the fingerprint gate passed against the committed baseline without
regenerating it — and changed how the source holds it:

- The 34 inline hint objects became the five named FR-024 rows in
  `src/tools/_shared.ts`. `src/tools/_surface.test.ts` keeps its own literal
  classification table on purpose, so the pin stays independent of the rows.
- Each instructions line's tool list is read from its backticked names rather
  than kept by hand, which closed a gap where a line could name a tool missing
  from its list and still be shown.
- Repeated field declarations became shared ones: `focusedVaultField`
  (`src/tools/_vault-field.ts`) and `BASE_PATH_DESCRIPTION`
  (`src/tools/_base-path.ts`).
- `ToolDescriptor` dropped `title` (only a test read it) and kept
  `annotations`, which the planned read-only tool filter (068 T074) selects
  on.

## Alternatives rejected

- **Keep ADR-005's stripping and the call-help sentence.** The smallest tool
  definitions, but it fails the Tool Surface Standards, costs extra round
  trips and leaves deferred-tool search little to match.
- **Publish per-mode `oneOf` variants for the target-mode tools.** The schema
  itself would enforce the rules, but it changes ADR-003's flat shape for every
  target-mode tool, and some clients handle `oneOf` or a non-object root
  poorly. Deferred by clarification C1 ("descriptions now, union later").
- **Put all guidance in the instructions.** One place to edit, but the
  instructions would pass 2,000 characters and per-parameter rules would sit
  far from the parameters (FR-027, FR-030).

## Consequences

- Every tool lists with a title, four hints and a fully described input
  schema. `src/tools/_surface.test.ts` enforces that registry-wide through a
  real client, and `src/instructions/instructions.test.ts` covers the
  instruction bounds.
- Every published `descriptionFingerprint` and `schemaFingerprint` changed
  once. Clients that cached schemas see new descriptions; no tool name moved.
- A client that loads every tool definition at session start pays for the
  parameter descriptions again.
- A parameter's behaviour is now written in two places, its `.describe()` and
  its `docs/tools/` page. `help` keeps the examples and error rosters so the
  one-liners stay short, but both must stay accurate.
- Titles are the tool name in Title Case. Rewording one is a published-surface
  change, left to the owner.
- Six tools (`append_note`, `prepend`, `patch_heading`, `patch_block`,
  `set_property`, `backlinks`) still restate the locator rule in a
  "Targeting:" paragraph; the PR body leaves their removal to the owner.
- The `vaults` routing rule is already written and appears when PR-5 adds that
  tool.
- The SC-006 release evidence — Claude Code running two read-only calls in
  parallel with no "may modify data" prompt — could not run in the unattended
  session (T058). The server side of SC-006 passes on the surface test; the
  client check is left to the owner.
