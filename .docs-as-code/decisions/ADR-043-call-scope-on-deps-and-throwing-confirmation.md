# ADR-043 — Cancellation and progress ride on each call's deps, and confirmation is a throwing two-step handed to the handler

- **Status:** Accepted
- **Date:** 2026-10-30
- **Source:** PR #92 (BI-0165 PR-6; `specs/068-modernise-mcp-surface/`,
  US13–US16, FR-047 to FR-054, research R11 and R12), commit `e93fac2`, and
  the PR #92 code-quality review fixes, commit `ca25c67`
- **Related:** ADR-006 (Centralized Tool Registration), which makes
  `registerTool` the one place a call is set up; ADR-015 (Sub-Discriminators
  via details.reason for Multi-State Error Codes), whose `details.code` form
  carries `CONFIRMATION_UNAVAILABLE` and `CONFIRMATION_DECLINED`;
  ADR-039 (Dual-Era Stdio Serving on MCP SDK v2 McpServer), whose SDK supplies
  the signal, the progress token and the `input_required` result

## Context

Constitution v1.6.0 requires long-running calls to honour cancellation and to
report progress when given a token (Principle IV), and the Security Defaults
require the human's confirmation before an irreversible operation. SDK v2
gives each `tools/call` an `AbortSignal` (`ctx.mcpReq.signal`), a progress
token (`ctx.mcpReq._meta.progressToken`) and an `input_required` result that
it fulfils as an elicitation in both protocol eras.

None of that reached the code that needs it. The signal has to arrive at the
queue and at the spawned child, three layers below the handler; about thirty
handlers called `invokeCli`, and most of them copied `spawnFn`, `env`,
`logger` and `queue` out of their deps into a fresh object literal. And a
confirmation has to pause a handler mid-way — `find_and_replace` asks only
after its commit re-scan, so the question can carry the note count — without
each handler learning the SDK's re-entry protocol.

## Decision

1. **The call scope travels on deps.** `registerTool` builds, for every call,
   `{ ...bootDeps, signal, reportProgress? }`, with `reportProgress` defined
   only when the request carried a progress token. `CallScope`
   (`src/cli-adapter/_dispatch.ts`) is the type of those two fields, and
   `InvokeCliDeps`, `InvokeBoundedCliDeps`, `DispatchDeps` and every tool's
   `ExecuteDeps` extend it. Handlers pass their deps **whole** to `invokeCli`,
   `detectIfClosed` and `evalInVault`, which pick the fields they use. A
   tool's boot-time `RegisterDeps` is `BootDeps<ExecuteDeps>` — the same type
   without the call scope — so `create*Tool` cannot be given a `signal` every
   call would overwrite.
2. **Confirmation is the handler's third argument**, a `Confirmation` with two
   steps (`src/tools/_shared.ts`, built by `requestConfirmation` in
   `src/tools/_confirm.ts`):
   - `requireConfirmable(message)` reads whether the client declared form
     elicitation and throws `VALIDATION_ERROR` /
     `CONFIRMATION_UNAVAILABLE` if not. It does no I/O, so a handler can call
     it before anything spawns.
   - `confirm(message)` returns when the human accepted with the box ticked.
     With no answer yet it throws an internal `ConfirmationRequested`
     carrying the `input_required` elicitation, which `registerTool` returns
     to the SDK; the SDK re-enters the handler with the answer. Any other
     answer throws `VALIDATION_ERROR` / `CONFIRMATION_DECLINED` with
     `details.action`.
   Handlers do nothing irreversible before `confirm` returns, so the
   re-entry is safe. A call from outside an MCP request gets
   `NON_INTERACTIVE_CALL`, whose `requireConfirmable` always refuses.
3. **No new top-level error code.** Both refusals are `VALIDATION_ERROR`
   sub-codes; a cancelled call rejects with the signal's own reason, and the
   SDK sends no response for it.

## Alternatives rejected

- **Add `signal` and `reportProgress` to every copied deps literal** — what
  PR #92 first shipped (the "T085 audit" of 31 files). Review blocker 1 showed
  that every future call site would have to remember both fields, and one
  that forgot would lose cancellation silently, with no type error, because
  both are optional. Passing deps whole (the existing `detectIfClosed` /
  `evalInVault` precedent) removed the literals, including the private
  `adapterDeps` copies in `_active-file.ts`, `read_property` and
  `set_property`.
- **A `ToolCall` third argument carrying `signal` and `reportProgress` as
  well** — also first shipped. No handler read them there; the values also went
  onto deps through an `as TDeps` cast. Review cut the duplicate channel: the
  handler now gets only `Confirmation`, and `ToolCall = CallScope &
  Confirmation` survives only as the entry type of `RegisteredTool.handler`.
  The per-call deps are typed `TDeps & CallScope`, so the cast states the real
  contract.
- **`confirm()` returning `{ proceed } | { result }`** — the T077 task
  wording. Every gated handler would have had to widen its return type to
  include the `input_required` result, breaking the typed-result contract
  (ADR-042) for `delete` and `find_and_replace`. Throwing keeps each
  handler's output type intact; the deviation is recorded in `tasks.md` and
  was put to the owner in the PR #92 body.
- **`canConfirm()` plus a separately imported `confirmationUnavailable(msg)`
  throw** — first shipped as three steps per handler. Review folded them into
  the one `requireConfirmable(message)` call.
- **Let the SDK refuse a client without elicitation** — it raises `-32021` on
  the 2026 era and a free-text `isError` from its legacy shim on the 2025 era,
  neither of them the project's envelope, and only after the handler has run
  far enough to ask (research R12). Checking first is what lets
  `find_and_replace` refuse before vault resolution spawns Obsidian.
- **Roll back a cancelled multi-note commit** — overruled in spec
  clarification Q1. The partial outcome goes to the `commitCancelled` log
  event instead.
- **A second queue for cancellable work** — would break single-flight
  (FR-053).

## Consequences

- A new `invokeCli` call site honours cancellation and progress as long as it
  passes the handler's deps. A handler that builds a narrower object for
  `invokeCli` brings the old failure back; nothing but review catches it.
- `invokeCli` receives more keys than it uses (for example `vaultRegistry`
  or `fs`); it forwards only its own fields to `dispatchCli`.
- On the 2025 era, `clientCanConfirm` reads the `initialize` capabilities
  through `server.server.getClientCapabilities()`, which SDK 2.4.0 marks
  deprecated in favour of the per-request envelope that 2025-era requests do
  not carry. It sits behind the one justified
  `@typescript-eslint/no-deprecated` disable in `src`, which conflicts with
  the 068 plan's PR-3 acceptance line ("no SDK `no-deprecated` disable
  left"); PR #92 put it to the owner. If a later SDK removes the accessor,
  2025-era confirmation breaks there first, and `_confirm.test.ts`'s SDK round
  trip on that era fails.
- A confirmed `find_and_replace` commit runs its read-only scan twice (once to
  ask, once on re-entry); the existing drift check still guards the writes.
