# ADR-041 — The `obsidian_exec` code-execution gate matches the `command` field, and the schema refuses `=` in it

- **Status:** Accepted
- **Date:** 2026-10-30
- **Source:** PR #88 (BI-0165 C2; `specs/068-modernise-mcp-surface/`, US3,
  FR-010 to FR-013, research R4), owner ruling on the PR #88 code review
  (option B), commit `9cc85e0`
- **Related:** ADR-015 (Sub-Discriminators via details.reason for Multi-State
  Error Codes), whose `details.code` form carries `COMMAND_BLOCKED`

## Context

PR #88 makes `obsidian_exec` refuse code-running and developer-tooling
commands (`eval`, `devtools`, `dev:*`, `restart`, `plugin:install`,
`plugin:enable`, `plugin:disable`) unless the vault owner sets
`OBSIDIAN_MCP_ALLOW_EVAL`. The gate has to decide *what* it compares against
the list.

The T0 probe for the PR (`specs/068-modernise-mcp-surface/evidence-c2.md`)
found that the Obsidian CLI consumes one leading `vault=<name>` token and runs
the **next** token as the command. `assembleArgv` emits `[vault=…?, command,
key=value…, flags…]`, so with no `vault` field, `{ command: "vault=X", flags:
["eval", "code=…"] }` spawns `obsidian vault=X eval code=…` and runs `eval`. A
gate that looked only at `command` would let it through.

## Decision

1. The input schema refuses any `command` containing `=`, as a plain
   `VALIDATION_ERROR` on the `command` path, regardless of `allowEval`. No CLI
   command name contains `=`: arguments go in `parameters` and the vault in
   `vault`.
2. Because of (1), `command` is always the token the CLI runs, and the gate in
   `executeObsidianExec` matches `input.command` alone: trimmed, lower-cased,
   against an exact set plus the `dev:` prefix. Parameter values are never
   inspected.
3. A hit is `VALIDATION_ERROR` with `details: { code: "COMMAND_BLOCKED",
   command }`, where `command` is always the caller's own value. No new
   top-level code.

## Alternatives rejected

- **Gate the "effective" command** — what PR #88 first shipped (commit
  `9d8591e`). The handler rebuilt the argv with the real `assembleArgv` and
  took the first token not starting with `vault=`. It closed the bypass, but
  it assembled the argv twice, made the handler import the private dispatch
  module, changed `assembleArgv` to take only the argv fields so the handler
  could call it, and put a
  shifted token (not the caller's input) into `details.command`. The PR #88
  review flagged it and the owner chose the schema refusal instead. Refusing
  malformed input at the zod boundary is where constitution Principle III
  puts it, and the refusal still happens before anything spawns.
- **Match the blocked names anywhere in the argv** — would refuse a `search`
  for the text "eval" (a spec edge case that must run).
- **An allowlist of safe commands** — overruled by the owner in spec
  clarification Q3. The gate stays an exact denylist (FR-010).

## Consequences

- A `command` with `=` in it can no longer reach the CLI through
  `obsidian_exec`, even with `OBSIDIAN_MCP_ALLOW_EVAL` on. A caller that used
  `command` to smuggle a `vault=` token must use the `vault` field.
- The refinement is invisible to the published JSON Schema, so the descriptor
  baseline (`src/tools/_register-baseline.json`) did not change. A client
  learns the rule from the `help` page or the error message, not from the
  schema.
- The gate's safety depends on the CLI's argv grammar as probed on
  2026-10-30. If a later CLI accepts some other leading token before the
  command, the schema rule needs revisiting; the T0 evidence file is the
  record to re-probe against.
- The denylist leaves known paths to plugin code open (`command`,
  `plugin:reload`, `plugin:uninstall`, `plugins:restrict`, `theme:*`,
  `snippet:*`, plugin-contributed commands); see
  [capabilities/escape-hatch-and-meta.md](../capabilities/escape-hatch-and-meta.md#known-limits).
