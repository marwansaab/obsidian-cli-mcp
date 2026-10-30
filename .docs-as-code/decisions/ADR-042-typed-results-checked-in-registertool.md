# ADR-042 — Typed results are published through a pass-through output adapter and checked in `registerTool`, not by the SDK

- **Status:** Accepted
- **Date:** 2026-10-30
- **Source:** PR #91 (BI-0165 B5; `specs/068-modernise-mcp-surface/`, US12,
  FR-039 to FR-042, research R6), owner ruling on PR #91 code-review finding
  B2 (option A), commit `4e35987`
- **Related:** ADR-006 (Centralized Tool Registration), which makes
  `registerTool` the one place results are marshalled; ADR-039 (Dual-Era
  Stdio Serving on MCP SDK v2 McpServer), whose `toSdkInputSchema` this
  mirrors

## Context

Constitution v1.6.0's MCP Tool Surface Standards require every tool whose
result is a JSON object to publish an `outputSchema` and return the result as
`structuredContent` with identical text, in both protocol eras, with no
per-era exceptions (FR-039, owner ruling 2026-10-28). Every typed tool already
had a zod output schema. Two facts shaped how to publish them:

- `McpServer` (SDK v2) validates `structuredContent` against the
  `outputSchema` itself. A failure reaches the client as free-text `isError`
  (`"Output validation error: …"`), not the project's
  `{code, message, details}` envelope — the same problem research R2 solved
  for input.
- The 2025-era codec wraps an output schema whose root is not
  `type: "object"`. zod emits a union (`search`'s default | line,
  `find_and_replace`'s preview | commit) as a bare `anyOf` / `oneOf` with no
  root `type`, so those two would publish differently per era.

## Decision

1. `registerTool` takes an optional `outputSchema` on the `ToolSpec` and hands
   the SDK **`toSdkOutputSchema(schema)`** (`src/tools/_register.ts:97`). Its
   JSON Schema is zod's own draft-2020-12 emission, plus root
   `type: "object"` only when the root is a union whose variants are all
   objects. The result data is never wrapped.
2. Its `~standard.validate` **accepts every value**. The registered callback
   runs `spec.outputSchema.parse(result)` in the handler's own `try`, so drift
   is the existing `INTERNAL_ERROR` "produced a response that failed its
   output contract" envelope with `details.issues` and no
   `structuredContent`. The check only validates; the handler's value is what
   is sent.
3. `registerTool` refuses at boot an output schema whose root is not
   `type: "object"`. A tool whose result is not always an object publishes no
   `outputSchema` rather than an era-specific one: `tag` (count-only mode is a
   bare integer), plus `read`, `help` and `obsidian_exec` (FR-041).
4. `ToolSpec` is a type with three result cases (raw, JSON, JSON with
   `outputSchema`), so an `outputSchema` on a raw tool does not type-check and
   a typed tool's handler must return `z.input` of its schema.

## Alternatives rejected

- **Let the SDK run the output check** — what PR #91 first shipped: the
  adapter's `validate` delegated to zod. Review finding B2 showed the result:
  a tool whose handler had its own trailing output `.parse()` reported drift
  as `INTERNAL_ERROR`, and one without (`append_note`, `delete`, `move`,
  `write_note` and others) reported it as SDK free text. Constitution
  Principle IV and BI-0165 A2 require the envelope for every tool failure, and
  ADR-006 puts marshalling in `registerTool`. The owner chose option A,
  amending research R6.
- **Rely on the SDK's own union handling** — SDK 2.4.0's conversion would also
  add root `type: "object"` to a union of objects, but that is private
  behaviour. Stating the rule in project code keeps the published bytes
  independent of it, and the boot guard catches any tool the rule does not
  cover.
- **Wrap union results in a synthetic object** (`{ result: … }`) — changes the
  result shape agents already rely on.
- **Publish no `outputSchema` for unions, or a different one per era** —
  FR-039 forbids both.

## Consequences

- 31 tools publish an `outputSchema`; the published bytes are identical in
  both eras, pinned by `src/tools/_surface.test.ts` and fingerprinted in
  `src/tools/_register-baseline.json` (`outputSchemaFingerprint`).
- Output drift is caught twice for handlers that still end with their own
  `.parse()`. Removing those redundant calls was deferred out of PR #91 by
  the owner's ruling.
- `tag`'s results stay untyped until its count-only shape changes, which
  would be a published-surface change of its own. PR #91 put the exclusion to
  the owner for review.
- Like `toSdkInputSchema`, the adapter tracks the SDK's Standard Schema
  contract. `src/tools/_register.output.test.ts` pins `validate` as
  pass-through and drives a drifted result through a real client to the
  envelope, so an SDK release that changed how drift reaches the client would
  fail there.
