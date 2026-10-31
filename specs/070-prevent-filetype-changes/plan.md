# Implementation Plan: Prevent File Type Changes

**Branch**: `070-prevent-filetype-changes` | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/070-prevent-filetype-changes/spec.md` (BI-0060)

> **Modify existing typed tools; add one shared helper module.** No new tool. Every tool that takes a vault file path gets a declared set of supported file types, enforced in its handler and named in its description. `rename` and `move` keep a file's type and reject an explicit change to another type; `read` accepts notes, canvases and bases; the content-editing tools accept notes only. The clarify session fixed the rejection envelope (`VALIDATION_ERROR` + `details.code: "UNSUPPORTED_FILE_TYPE"`, zero new top-level codes) and the `read` support set. The open items are live-CLI verification gates, not design forks.

## Summary

Renaming a canvas today succeeds and turns it into a Markdown note: `rename` appends `.md` to any name that lacks it (`appendMdIfMissing`, `src/tools/rename/handler.ts`), whatever the source type. `move` guards against this only when the source is given as a `path`; with a `file` name or in active mode it forwards `to` as given. `write_note` turns `file: "Plan.canvas"` into `Plan.canvas.md` and, in active mode, overwrites whatever file is focused; `append_note` and `prepend` write note text into any file they are pointed at; `read` returns decoded binary for attachments; `outline` surfaces an undiscriminated upstream error. No description tells the agent which types a tool handles.

**Primary requirements** (from spec, post-clarify): core file types recognised case-insensitively (FR-001); every in-scope tool declares, enforces and documents its supported types (FR-002, FR-010); `rename`, `move`, `delete`, `open_file` support every type (FR-003); `read` supports notes, canvases and bases and rejects attachments (FR-003a); rename/move append the source extension when the destination has none, never double it, and reject an explicit different recognised extension (FR-004–FR-006); rejection happens before any vault change, as `VALIDATION_ERROR` + `UNSUPPORTED_FILE_TYPE` naming the received type, the accepted types and the alternative (FR-007, FR-008); the check applies to the file actually acted on, however addressed (FR-009); existing non-Markdown rejections unchanged — `NOT_MARKDOWN` (links, backlinks, smart_connections_similar), `INVALID_NOTE`/`not-eligible` (find_and_replace), `INVALID_BASE_PATH` (Bases trio), `open_file`'s CLI-reported `UNSUPPORTED_FILE_TYPE` (FR-007a); Markdown behaviour unchanged (FR-012); heading/block/property tools untouched (FR-013).

**Technical approach** (one kernel-node touch: four `createServer` registration lines gain the existing `vaultRegistry` argument; published descriptions move, so the register baseline regenerates):

- **One pure helper module, `src/file-type/file-type.ts`** (research D1): the core extension table, `extensionOf`, `categoryOf`, and `assertSupportedFileType`, which throws the D4 rejection. Leaf module, imports only `src/errors.ts`.
- **Per-tool declarations** (research D2, [contracts/tool-support.md](contracts/tool-support.md)): each in-scope tool exports a `readonly` support tuple read by both its handler check and its description sentence, so text and behaviour cannot drift (SC-002).
- **Check the resolved target** (research D3): `path` → classify the string (no extra call). `file` / `active` → tools that already resolve (`append_note`, `prepend`, `write_note` active) check the resolved path at no cost; the four CLI-pass-through tools (`read`, `rename`, `move`, `outline`) resolve with the existing `resolveFileByTsv` / `resolveActiveFocusedFile` and check the resolved path. In `file` mode they then forward the original `file=` (same resolver, so Markdown action-call arguments stay byte-stable); in active mode they forward the resolved `path=` so the CLI acts on exactly the file checked even if focus moves (analysis I2, option (b)). Active-mode forwarding needs the vault display name, so those four tools gain `vaultRegistry` in their deps and their `createServer` registration lines pass it (research D3, DI consequence).
- **One destination rule for rename and move** (research D5, [data-model.md](data-model.md) worked rows): reject a recognised destination extension that differs from the source's (`type-change`); otherwise forward verbatim if the destination already carries the source extension (byte-exact `.md` for notes, keeping FR-012), else append the source extension. Replaces `appendMdIfMissing` and the source-`.md` guard; supersedes the spec 021 and spec 030 clarify locks that scoped rename to `.md`.
- **Surface text**: description sentence per in-scope tool, `docs/tools/<tool>.md` updates, three server-instruction lines (research D6). `npm run baseline:write` regenerates `_register-baseline.json`; the diff is reviewed so that only in-scope tools move.
- **Unchanged emissions** (research D7): `NOT_MARKDOWN` (links, backlinks, smart_connections_similar), `open_file`'s CLI-reported `UNSUPPORTED_FILE_TYPE`, `find_and_replace`'s `INVALID_NOTE` / `not-eligible`, the Bases `INVALID_BASE_PATH`.

**T0 forcing-gate probes** (implement-time, `Obsidian.com`, TestVault `Sandbox/` per `.memory/test-execution-instructions.md`): P1 CLI rename/move extension behaviour and response shapes for non-note sources; P2 `obsidian file` resolution of non-note names; P3 focused-file eval for non-note active files; P4 before-state of `read` / `outline` on non-note files; P5 attachment table vs. `app.viewRegistry`. See [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md). Each has a recorded fallback.

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11 — unchanged.
**Primary Dependencies**: `zod` 4 (schemas unchanged in shape), `@modelcontextprotocol/server` (SDK v2, registration unchanged). Reused in-tree: `src/tools/_active-file.ts` (`resolveFileByTsv`, `resolveActiveFocusedFile`, `resolveActiveLocatorWithVault`, `resolveVaultDisplayName`), `src/cli-adapter/cli-adapter.ts` (`invokeCli`), `src/errors.ts` (`UpstreamError`). **No new runtime dependency.**
**Storage**: N/A. Vault files via the Obsidian CLI and the existing direct-filesystem write path, unchanged.
**Testing**: `vitest run`, co-located `*.test.ts` (Principle II). Handler tests mock `invokeCli` / spawn and the `_active-file.ts` round-trips through the existing `ExecuteDeps` seams; rejection tests assert the action call and any write were never made. Live T0 evidence per [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md).
**Target Platform**: Windows (reference, probed), macOS, Linux; CI on Linux and Windows.
**Project Type**: Single project — MCP server (`src/**`).
**Performance Goals**: `path` calls (the recommended automation form) add no CLI call and a constant-time string check. `file` / `active` calls of `read`, `rename`, `move`, `outline` add one resolution round-trip each; all other tools add nothing.
**Constraints**: Zero new top-level error code (Principle IV, Clarifications Q2); one new `(VALIDATION_ERROR, UNSUPPORTED_FILE_TYPE)` pair with a closed two-value `details.reason` (ADR-015). Reject before any vault change (FR-007). Markdown outcomes byte-stable, including the documented `Renamed.MD` → `Renamed.MD.md` row (FR-012, SC-005). Existing discriminators unchanged (FR-007a).
**Scale/Scope**: New `src/file-type/{file-type,file-type.test}.ts`. Code edits in `rename`, `move`, `read`, `write_note`, `append_note`, `prepend`, `outline` (`handler.ts` + tests; `index.ts` description). Description-only edits in `delete`, `open_file`, `find_and_replace`, `links`, `backlinks`, `smart_connections_similar`, `views_base`, `query_base`, `create_base`. 16 docs pages, `src/instructions/instructions.ts`, `_register-baseline.json`, and four registration lines in `src/server.ts` (`createReadTool`, `createRenameTool`, `createMoveTool`, `createOutlineTool` gain `vaultRegistry`). **No edits to** `_register.ts`, `errors.ts`, `_active-file.ts`, `target-mode/**`, `cli-adapter/**`, or the five out-of-scope heading/block/property tools.

**Resolved unknowns**: envelope and `read` support set (clarify); per-tool declarations, resolution strategy, destination rule, precedence (research D2–D5, D9). Remaining: five T0 verification gates.

## Constitution Check

*GATE: must pass before Phase 0 — re-checked after Phase 1 design (below). Constitution v1.6.0 (ratified 2026-05-03, last amended 2026-10-28).*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | New leaf module `src/file-type/` (one responsibility: classify extensions and build the rejection), imported by tool handlers/indexes only — tool → helper, the same direction as `src/path-safety/`. It imports only `src/errors.ts`. Each tool's support tuple lives in its own module; no tool imports another tool; no central tool registry in the helper (research D2 alternative rejected for being an upward dependency). Handlers gain calls into the existing `_active-file.ts` module, which `append_note`, `prepend`, `write_note`, `find_and_replace` already import; `read`, `rename`, `move`, `outline` gain that existing shared-helper edge. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | Every modified tool ships happy + failure tests in the same change, co-located: supported-type pass-through and `unsupported-type` rejection per locator form (`path`, `file`, `active`) for `read`, `write_note`, `append_note`, `prepend`, `outline`; every data-model worked row plus `type-change` rejection and `file`/`active` → `path=` forwarding for `rename`, `move`. Description-only tools are covered by the table-driven description test (each in-scope description names its declared types) and the baseline test. `file-type.test.ts` covers the helper. |
| **III. Boundary Input Validation with Zod** | **Y** | Input schemas keep their shape and remain the single source of truth; no new fields. The type check is not input validation in the zod sense: for `file` and `active` locators the type is only known after resolution, so it runs in the handler on the resolved path (as `find_and_replace`'s `assertEligible` does under ADR-032), throwing a structured `UpstreamError`. No hand-rolled `typeof`/`instanceof` boundary checks; `extensionOf`/`categoryOf` operate on already-parsed strings. |
| **IV. Explicit Upstream Error Propagation** | **Y** | Zero new top-level codes: the rejection is `VALIDATION_ERROR` + `details.code: "UNSUPPORTED_FILE_TYPE"` (Clarifications Q2). Resolution errors propagate unchanged ahead of the type check (research D9). No catch-and-continue; nothing is masked as an empty result. Tool failures return as `isError: true` via the existing `_register.ts` path, which forwards `details` unchanged. No change to cancellation or progress handling (added resolution calls go through `invokeCli`, which already honours the call scope). |
| **V. Attribution & Layered Composition** | **Y** | New files carry `// Original — no upstream.` headers; edited files keep theirs with the one-line intent updated where the module's purpose changes (rename, move). No lifted code. |
| **ADR-010** (typed tool names mirror CLI subcommand) | **N/A** | No new or renamed tool. |
| **ADR-013 / ADR-014** (plugin cohort) | **N/A** | No plugin-backed tool changes behaviour; `smart_connections_similar` gets a description sentence only, its lifecycle checks are untouched. |
| **ADR-015** (sub-discriminators) | **Y** | One new `(VALIDATION_ERROR, UNSUPPORTED_FILE_TYPE)` pair with closed `details.reason` ∈ {`unsupported-type`, `type-change`}; the three-condition gate is met (two real sub-states, distinguishable at failure, different remediation — research D4). Enumerated in [contracts/errors.md](contracts/errors.md). Existing pairs untouched (additive only). |
| **MCP Tool Surface Standards** | **Y** | Descriptions of 16 tools gain a supported-types sentence; `rename.name` and `move.to` parameter descriptions are reworded; server instructions gain one rule line and reword two lines, staying within the 512/4,096-character limits (`instructions.test.ts`). Titles, annotations and output schemas unchanged. The registry fingerprint baseline is regenerated and reviewed in the same PR (schema-dialect rule: deliberate change, no normalising). Visible input rules: the type-preservation rule is stated in the parameter descriptions it constrains. |
| **Security Defaults** | **Y** | Touches write paths (`write_note`, `append_note`, `prepend`, `rename`, `move`) only by adding a reject-before-write check; `realpath` containment, confirmation of irreversible operations and escape-hatch gating are unchanged. `obsidian_exec` remains the route for deliberate type changes and keeps its default policy (`rename`/`move` subcommands are not on the refused list). |

**No `N` verdicts → no Complexity Tracking entry required.**

**Kernel-node attention (per CLAUDE.md)**: **`createServer` is touched** — reviewer attention required. Four registration lines in its body (`createReadTool`, `createRenameTool`, `createMoveTool`, `createOutlineTool`) gain the `vaultRegistry` argument it already constructs and already passes to nine other tools; nothing new is constructed or imported, and the boot-spine shape (`createServer → createXTool → executeX`, graph-confirmed for `move`) is unchanged. `createLogger` / `createQueue` keep arriving through `ExecuteDeps`; no handler imports them. `UpstreamError` is imported by the new helper and thrown as a value — no new error class, no new top-level code. The other high-blast-radius surface is the shared `_active-file.ts` resolvers, consumed unchanged.

**ADR note**: no new ADR. The rejection envelope follows ADR-015 and the ADR-032 precedent; the per-tool support sets are spec-level choices recorded in the spec's Clarifications (the user asked for the `read` choice to stay out of the ADR log). This BI supersedes two earlier spec-level clarify locks — spec 021 Q1 (rename `.md`-only allowlist) and spec 030 Q1+Q2 (move source-`.md` guard) — recorded in research D5. Neither was an ADR, so no ADR is superseded.

## Project Structure

### Documentation (this feature)

```text
specs/070-prevent-filetype-changes/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1–D9 + five T0 gates
├── data-model.md        # Phase 1 — FileCategory, SupportDeclaration, ResolvedTarget, DestinationNameRule (worked rows)
├── quickstart.md        # Phase 1 — automated gate + manual scenarios per user story
├── contracts/
│   ├── tool-support.md  # per-tool declared support, behaviour, description content, server-instruction lines
│   ├── errors.md        # UNSUPPORTED_FILE_TYPE envelope, reasons, precedence, unchanged emissions
│   └── t0-probe-plan.md # implement-time probes P1–P5 with fallbacks
├── checklists/requirements.md
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
src/file-type/
├── file-type.ts         # NEW — extension table, extensionOf, categoryOf, assertSupportedFileType (D1, D4)
└── file-type.test.ts    # NEW

src/tools/rename/        # handler.ts: D5 destination rule replaces appendMdIfMissing; file/active resolve → path=
                         # schema.ts: name description; index.ts: description; tests
src/tools/move/          # handler.ts: D5 rule replaces source-.md guard in resolveTo; file/active resolve → path=
                         # schema.ts: to description; index.ts: description; tests
src/tools/read/          # handler.ts: type check (note/canvas/base); file/active resolve → path=; index.ts; tests
src/tools/outline/       # handler.ts: type check (note); file/active resolve → path=; index.ts; tests
src/tools/write_note/    # handler.ts: type check on canonical path, file string, active relPath; index.ts; tests
src/tools/append_note/   # handler.ts: type check on resolved relPath; index.ts; tests
src/tools/prepend/       # handler.ts: type check on resolved relPath; index.ts; tests
src/tools/{delete,open_file,find_and_replace,links,backlinks,smart_connections_similar,
           views_base,query_base,create_base}/index.ts   # description sentence only
src/tools/_surface.test.ts (or a new co-located test)    # table-driven: descriptions name declared types
src/instructions/instructions.ts (+ test)                # three lines (contracts/tool-support.md)
src/tools/_register-baseline.json                        # regenerated (npm run baseline:write), reviewed
src/server.ts                                            # four registration lines pass vaultRegistry (read, rename, move, outline)

docs/tools/{rename,move,delete,open_file,read,write_note,append_note,prepend,outline,find_and_replace,
            links,backlinks,smart_connections_similar,views_base,query_base,create_base}.md

# UNCHANGED: src/tools/_register.ts, src/errors.ts, src/tools/_active-file.ts,
#   src/target-mode/**, src/cli-adapter/**, src/path-safety/**,
#   read_heading / read_property / set_property / patch_heading / patch_block (FR-013)
```

**Structure Decision**: Single project. One new leaf helper module under `src/` beside `path-safety/`; every other change is inside existing per-tool modules plus their docs pages, the server instructions and the regenerated baseline.

## Phase 0: Research → research.md

Decisions (full detail in [research.md](research.md)):

- **D1** — One pure `src/file-type/` module holds the table and the check.
- **D2** — Per-tool support declarations (table in research; contract in [contracts/tool-support.md](contracts/tool-support.md)).
- **D3** — Check the resolved target; the four CLI-pass-through tools resolve `file`/`active` first; `file` forwards the original `file=`, `active` forwards the resolved `path=`.
- **D4** — Rejection envelope: `VALIDATION_ERROR` + `UNSUPPORTED_FILE_TYPE`, reasons `unsupported-type` / `type-change`.
- **D5** — Rename/move destination rule; supersedes spec 021 Q1 and spec 030 Q1+Q2.
- **D6** — Description sentence from the declaration; docs; server instructions; baseline regen.
- **D7** — Existing non-Markdown emissions unchanged.
- **D8** — Attachment table and casing; non-core extensions.
- **D9** — Not-found precedence.

**Output**: research.md, no `NEEDS CLARIFICATION` remaining.

## Phase 1: Design & Contracts

- **[data-model.md](data-model.md)** — FileCategory table, SupportDeclaration, ResolvedTarget (extra-call matrix), DestinationNameRule with 15 worked rows that become handler test cases.
- **[contracts/tool-support.md](contracts/tool-support.md)** — per-tool declarations, behaviour, description content, server-instruction lines, four tested invariants.
- **[contracts/errors.md](contracts/errors.md)** — envelope fields, example envelopes, precedence, unchanged emissions, the `open_file` vs. new `UNSUPPORTED_FILE_TYPE` distinction.
- **[contracts/t0-probe-plan.md](contracts/t0-probe-plan.md)** — P1–P5.
- **[quickstart.md](quickstart.md)** — automated gate and manual scenarios per user story.
- **Agent context** — `CLAUDE.md` SPECKIT block now points at this plan.

## Phase 1 re-check (post-design Constitution Check)

Re-evaluated after the data model and contracts: input schemas unchanged in shape (III); the rejection is one new `details.code` under an existing top-level code with an enumerated two-value `details.reason` (IV, ADR-015); the helper is a leaf module and no tool imports another; four tools receive the existing `vaultRegistry` by injection, not by import (I); every modified tool has co-located happy + failure tests, and description-only tools are covered by the table-driven description test and the baseline (II); headers retained or added (V); surface text and baseline move deliberately and are reviewed (MCP Tool Surface Standards); write paths only gain a reject-before-write check (Security Defaults). **No gate regressed; Complexity Tracking empty.**

## Graphify structural check

Per the CLAUDE.md `/speckit-plan` rule; scoped lookups (`graphify explain`) on the symbols the spec and survey named, not the full report.

**Affected communities**: the per-tool handler communities of `rename`, `move`, `read`, `outline`, `write_note`, `append_note`, `prepend` (graph fact: `executeRenameNote` sits in a handler community with OUT-edges to `invokeCli`, `appendMdIfMissing`, `parseRenameResponse`; `resolveTo` forms its own small community inside `move/handler.ts`). The shared `_active-file.ts` community is consumed, not edited: graph fact — `resolveFileByTsv` is called today by `append_note`, `prepend` and `find_and_replace` (`resolveSingleNoteScope`), and `resolveActiveFocusedFile` is among the most-connected symbols in that community; this plan adds `read`, `rename`, `move`, `outline` as consumers. A new `src/file-type/` community is expected to appear, connected to those handlers and to `UpstreamError`.

**Kernel-node touch surface**: graph fact — `UpstreamError` is the error-spine value type, among the top god-nodes by degree, imported by nearly every handler and by `invokeCli`. This plan adds one importer (`src/file-type/file-type.ts`) and no new error class. `createLogger`, `createQueue`: no edges added. `createServer`: graph fact — `createServer → createMoveTool → executeMove` is a two-hop boot-spine path; the plan edits four of its registration call sites to pass `vaultRegistry`, adding no node and no edge to the boot spine (the `vaultRegistry` value already flows from `createServer` to nine tools). **Kernel-node touch: `createServer` body (argument-only).**

**Guardrail impact**: the registry fingerprint baseline moves for the 16 in-scope tools (descriptions) and for `rename` / `move` schemas (parameter descriptions); no other tool's fingerprint may move — the reviewer checks the baseline diff against [contracts/tool-support.md](contracts/tool-support.md). The tool count (35) is unchanged. ADR-030's spawn-site invariant is untouched: added resolution calls go through `invokeCli`.

**Post-implement structural verification** (after `/speckit-implement`, `graphify update .` then `/graphify --update`): (1) no new error-class node outside `src/errors.ts`; (2) no handler imports `createLogger` / `createQueue` / `createServer`, no tool module imports another tool module, and `server.ts` gained no new import; (3) `src/file-type/` forms its own community connected to the seven code-changed handlers, and `appendMdIfMissing` is gone from the graph; (4) `src/file-type/file-type.ts` is structurally connected (not orphaned); (5) only in-scope tools' fingerprints moved.

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
