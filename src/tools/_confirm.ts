// Original — no upstream. Confirmation before irreversible actions (068 R12, FR-047–FR-050, B3 ruling): the two-step helper behind a handler's `call.canConfirm()` (does the client declare form elicitation? no I/O) and `call.confirm(message)` (ask through an input_required elicitation, then read the human's answer on re-entry). Refusals are VALIDATION_ERROR with details.code CONFIRMATION_UNAVAILABLE or CONFIRMATION_DECLINED (ADR-015; no new top-level code).
import {
  CLIENT_CAPABILITIES_META_KEY,
  inputRequired,
  inputResponse,
  type ClientCapabilities,
  type InputRequiredResult,
  type McpServer,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { z } from "zod";

import { UpstreamError } from "../errors.js";

import type { ToolCall } from "./_shared.js";

/** The `inputRequests` key of the confirmation form, and the form itself: one boolean. */
const CONFIRM_KEY = "confirm";
const CONFIRM_FORM = z.object({
  confirm: z.boolean().describe("Tick to go ahead. Leave unticked, decline or cancel to change nothing."),
});

/**
 * Thrown by `confirm` when the human has not answered yet. It carries the `input_required`
 * result that asks them; `registerTool` returns it to the SDK, which fulfils it (the client on
 * the 2026 era, the SDK's legacy shim on the 2025 era) and re-enters the handler with the answer.
 * Handlers do nothing irreversible before `confirm` returns, so the re-entry is safe.
 */
export class ConfirmationRequested extends Error {
  constructor(readonly result: InputRequiredResult) {
    super("confirmation requested");
    this.name = "ConfirmationRequested";
  }
}

/**
 * Step 1 (R12): whether the client on this request can answer a form elicitation. A 2026-era
 * request carries its capabilities on the per-request envelope; a 2025-era connection declared
 * them at `initialize`. A bare `elicitation: {}` counts as form support (the SDK's own rule); a
 * URL-only declaration does not.
 */
export function clientCanConfirm(server: McpServer, ctx: ServerContext): boolean {
  const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined;
  const capabilities =
    envelope !== undefined
      ? (envelope[CLIENT_CAPABILITIES_META_KEY] as ClientCapabilities | undefined)
      : // The SDK deprecates this accessor in favour of the per-request envelope, which a 2025-era
        // request does not have; for that era its own note says this initialize-scoped value is the
        // source, and the SDK's legacy shim gates on the same value (068 R12).
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- no per-request alternative exists on the 2025 era
        server.server.getClientCapabilities();
  const elicitation = capabilities?.elicitation;
  return elicitation !== undefined && (elicitation.form !== undefined || elicitation.url === undefined);
}

/**
 * Step 2 (R12). With no answer on the request yet, throws `ConfirmationRequested` carrying the
 * one-boolean form. With an answer: `accept` with `confirm: true` returns; anything else throws
 * CONFIRMATION_DECLINED with the action the human took.
 */
export function confirmFromResponse(ctx: ServerContext, toolName: string, message: string): void {
  const answer = inputResponse(ctx.mcpReq.inputResponses, CONFIRM_KEY);
  if (answer.kind === "missing") {
    throw new ConfirmationRequested(
      inputRequired({
        inputRequests: { [CONFIRM_KEY]: inputRequired.elicit({ message, requestedSchema: CONFIRM_FORM }) },
      }),
    );
  }
  if (answer.kind === "elicit" && answer.action === "accept" && answer.content?.[CONFIRM_KEY] === true) return;
  throw new UpstreamError({
    code: "VALIDATION_ERROR",
    cause: null,
    details: { code: "CONFIRMATION_DECLINED", action: answer.kind === "elicit" ? answer.action : "cancel" },
    message: `${toolName}: confirmation was declined; nothing was changed.`,
  });
}

/**
 * The context of a call that does not come from an MCP request (a direct `RegisteredTool.handler`
 * or `execute*` call): no signal, no progress, and no way to confirm, so a confirmation-gated
 * action refuses with CONFIRMATION_UNAVAILABLE.
 */
export const NON_INTERACTIVE_CALL: ToolCall = {
  canConfirm: () => false,
  confirm: () => {
    throw new Error("confirm() called on a call that cannot confirm; check canConfirm() first");
  },
};

/** The refusal a handler raises when step 1 says the client cannot confirm; `message` names the safe route. */
export function confirmationUnavailable(message: string): UpstreamError {
  return new UpstreamError({
    code: "VALIDATION_ERROR",
    cause: null,
    details: { code: "CONFIRMATION_UNAVAILABLE" },
    message,
  });
}
