# ADR-035 — Shared Sibling-Locator Rules for Vault-Wide Tools

- **Status:** Decided
- **Date:** 2026-10-24
- **Source:** BI-0014 / `specs/068-list-tags/` (plan-stage ruling Q4, research
  D3), PR #84 and the code-quality review of PR #84 (commit `95c161c`)
- **Extends:** ADR-032 (Find And Replace File Scope via Sibling Locators). It
  does not supersede it.
- **Related:** ADR-003 (Enforce Target Mode in Typed Tools), ADR-015
  (Sub-Discriminators via details.reason for Multi-State Error Codes)

## Context

ADR-032 gave `find_and_replace` a single-note scope through optional sibling
fields (`file`, `path`, `active_note`) next to `vault` and `subfolder`, rather
than through `target_mode`. It was written for one tool.

`tags` (BI-0014) has the same shape of problem: it lists the whole vault by
default and can be narrowed to one note. The original request gave it
`target_mode`. At plan time the owner ruled that it follow ADR-032 instead
(spec Clarifications, plan-stage ruling): the architecture note's tool
categories (ARCH-014) already require sibling locators for vault-wide tools
with an optional note scope, and keep `target_mode` for file-targeted tools.
The ruling needed no new ADR, and this record does not re-make it.

What the ruling left open was where the rules live once two tools follow
them. Research D3 chose to copy the
roughly twenty-line scope matrix into `tags` and wait for a third consumer
before extracting it. Review of PR #84 rejected that.

## Decision

1. **Recorded, not decided here:** a vault-wide tool with an optional
   single-note scope uses ADR-032's sibling locators, not `target_mode`
   (ARCH-014 and the plan-stage ruling). Optional `vault`, then at most one
   of `file`, `path` and an active-note flag; none means the whole vault; the
   active flag forbids `vault`; the schema does not import
   `src/target-mode/`.
2. **The rules live in one module,
   [src/tools/_note-locator.ts](../../src/tools/_note-locator.ts),** from the
   second consumer onwards. It holds the path-safety and wikilink-bracket
   checks on `file` and `path`, the conflict matrix in ADR-032's row order,
   the closed set of `SCOPE_CONFLICT` reasons as a type, and the emitter that
   tags the issue for the tool's `mapValidationError`. A tool supplies only
   which flags it has and its own message for each reason, typed so that
   every reason it can produce has one.
3. **No new error codes or sub-states.** Conflicts are `VALIDATION_ERROR` /
   `SCOPE_CONFLICT` with a reason from ADR-032's roster; unsafe locators are
   `VALIDATION_ERROR` / `INVALID_NOTE` / `path-traversal` (ADR-015).

## Alternatives rejected

- **`target_mode` for `tags`.** Rejected at plan time by the ruling in point
  1, as the original request's input. Listed here only so the record of the
  scope pattern is complete.
- **Copy now, extract at the third consumer** (research D3, written before
  review). Rejected in review of PR #84. The checks were not new: the
  path-safety and bracket checks and the bracket message were already repeated
  word for word across `find_and_replace`, `append_note` and `prepend`, and
  the matrix encodes a contract (ADR-032's reasons and their order) that must
  not differ between tools. Two copies of a contract are where drift starts,
  so the count of consumers was the wrong test. Research D3 now records that
  it was superseded.

## Consequences

- `find_and_replace` and `tags` emit byte-identical reasons for the same
  conflict, and a future tool of this shape gets them by calling three
  functions. `find_and_replace`'s behaviour, messages and registration
  fingerprint did not change in the extraction.
- `append_note` and `prepend` import the wikilink-bracket message from the
  module. `open_file` keeps its own message, because its wording differs.
- The module is a leaf under `src/tools/` that imports only `path-safety`
  downward, so no tool imports another tool (constitution Principle I).
- The reason set is closed in the type `ScopeConflict`. Adding a reason is a
  change to this module and a new sub-state under ADR-015, not a per-tool
  choice.
- `target_mode` stays the rule for tools that address one note (ADR-003,
  unamended). This record covers only tools whose default is the whole vault.
