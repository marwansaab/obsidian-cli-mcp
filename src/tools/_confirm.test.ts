// Original — no upstream. Tests for the confirmation helper (068 R12, T078): each branch of the capability check and the answer reading, for both eras, plus a real round trip through the SDK on each era (the 2026 client fulfilling input_required itself, the 2025 legacy shim sending elicitation/create).
import { Client, InMemoryTransport, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler, McpServer, type ServerContext } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { clientCanConfirm, ConfirmationRequested, confirmFromResponse, NON_INTERACTIVE_CALL, requestConfirmation } from "./_confirm.js";
import { textOf } from "./_mcp-client-fixtures.js";
import { registerTool } from "./_register.js";
import { READ_ONLY_HINTS, type RegisteredTool } from "./_shared.js";
import { UpstreamError } from "../errors.js";

import type { ElicitResult } from "@modelcontextprotocol/client";

const CAPS_KEY = "io.modelcontextprotocol/clientCapabilities";

/** A 2026-era request context: the client's capabilities ride on the per-request envelope. */
function modernCtx(capabilities: Record<string, unknown> | undefined, inputResponses?: Record<string, unknown>): ServerContext {
  const envelope = capabilities === undefined ? {} : { [CAPS_KEY]: capabilities };
  return { mcpReq: { envelope, inputResponses } } as unknown as ServerContext;
}

/** A 2025-era request context (no envelope) and its server, whose capabilities came from `initialize`. */
function legacy(capabilities: Record<string, unknown> | undefined): { server: McpServer; ctx: ServerContext } {
  const server = { server: { getClientCapabilities: () => capabilities } } as unknown as McpServer;
  return { server, ctx: { mcpReq: {} } as unknown as ServerContext };
}

const unusedServer = { server: { getClientCapabilities: () => undefined } } as unknown as McpServer;

describe("clientCanConfirm — step 1", () => {
  it.each([
    ["bare elicitation: {}", { elicitation: {} }, true],
    ["form elicitation", { elicitation: { form: {} } }, true],
    ["form and URL", { elicitation: { form: {}, url: {} } }, true],
    ["URL-only elicitation", { elicitation: { url: {} } }, false],
    ["no elicitation", { sampling: {} }, false],
    ["no capabilities on the envelope", undefined, false],
  ])("2026 era (envelope): %s → %s", (_label, caps, expected) => {
    expect(clientCanConfirm(unusedServer, modernCtx(caps))).toBe(expected);
  });

  it.each([
    ["bare elicitation: {}", { elicitation: {} }, true],
    ["URL-only elicitation", { elicitation: { url: {} } }, false],
    ["no elicitation", {}, false],
    ["not initialized", undefined, false],
  ])("2025 era (initialize): %s → %s", (_label, caps, expected) => {
    const { server, ctx } = legacy(caps);
    expect(clientCanConfirm(server, ctx)).toBe(expected);
  });
});

describe("confirmFromResponse — step 2", () => {
  it("no answer yet → throws ConfirmationRequested carrying a one-boolean form elicitation", () => {
    let thrown: unknown;
    try {
      confirmFromResponse(undefined, "delete", "Permanently delete X?");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ConfirmationRequested);
    const request = (thrown as ConfirmationRequested).result.inputRequests?.["confirm"] as {
      method: string;
      params: { message: string; requestedSchema: { properties: Record<string, { type: string }> } };
    };
    expect(request.method).toBe("elicitation/create");
    expect(request.params.message).toBe("Permanently delete X?");
    expect(request.params.requestedSchema.properties["confirm"]?.type).toBe("boolean");
  });

  it("accept with confirm: true → returns", () => {
    const responses = { confirm: { action: "accept", content: { confirm: true } } };
    expect(() => confirmFromResponse(responses, "delete", "?")).not.toThrow();
  });

  it.each([
    ["decline", { action: "decline" }, "decline"],
    ["cancel", { action: "cancel" }, "cancel"],
    ["accept with confirm: false", { action: "accept", content: { confirm: false } }, "accept"],
    ["accept with no content", { action: "accept" }, "accept"],
    ["a response of another kind", { roots: [] }, "cancel"],
  ])("%s → CONFIRMATION_DECLINED with details.action %s", (_label, answer, action) => {
    let thrown: unknown;
    try {
      confirmFromResponse({ confirm: answer }, "find_and_replace", "?");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(UpstreamError);
    expect((thrown as UpstreamError).code).toBe("VALIDATION_ERROR");
    expect((thrown as UpstreamError).details).toEqual({ code: "CONFIRMATION_DECLINED", action });
    expect((thrown as UpstreamError).message).toBe("find_and_replace: confirmation was declined; nothing was changed.");
  });
});

/** The UpstreamError `run` throws (fails the test when it throws nothing). */
function thrownBy(run: () => void): UpstreamError {
  try {
    run();
  } catch (err) {
    expect(err).toBeInstanceOf(UpstreamError);
    return err as UpstreamError;
  }
  throw new Error("expected a throw");
}

describe("requestConfirmation and NON_INTERACTIVE_CALL", () => {
  it("requireConfirmable refuses with CONFIRMATION_UNAVAILABLE and the given message when the client cannot confirm", () => {
    const err = thrownBy(() => requestConfirmation(unusedServer, modernCtx({ sampling: {} }), "x").requireConfirmable("x: cannot ask."));
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details).toEqual({ code: "CONFIRMATION_UNAVAILABLE" });
    expect(err.message).toBe("x: cannot ask.");
  });

  it("requireConfirmable returns when the client can confirm, and confirm reads the request's answer", () => {
    const ctx = modernCtx({ elicitation: {} }, { confirm: { action: "decline" } });
    const confirmation = requestConfirmation(unusedServer, ctx, "delete");
    expect(() => confirmation.requireConfirmable("?")).not.toThrow();
    const err = thrownBy(() => confirmation.confirm("?"));
    expect(err.details).toEqual({ code: "CONFIRMATION_DECLINED", action: "decline" });
    expect(err.message).toBe("delete: confirmation was declined; nothing was changed.");
  });

  it("a non-interactive call refuses with CONFIRMATION_UNAVAILABLE, and confirm without the check is an internal error", () => {
    const refusal = thrownBy(() => NON_INTERACTIVE_CALL.requireConfirmable("x: cannot ask."));
    expect(refusal.details).toEqual({ code: "CONFIRMATION_UNAVAILABLE" });
    expect(refusal.message).toBe("x: cannot ask.");
    const misuse = thrownBy(() => NON_INTERACTIVE_CALL.confirm("?"));
    expect(misuse.code).toBe("INTERNAL_ERROR");
    expect(misuse.message).toMatch(/call requireConfirmable\(\) first/);
  });
});

// A confirmation-gated tool through the real SDK: the same handler serves both eras.
function gatedTool(): RegisteredTool {
  return registerTool({
    name: "gated",
    title: "Gated",
    description: "Confirms, then succeeds.",
    annotations: READ_ONLY_HINTS,
    schema: z.strictObject({}),
    handler: async (_input, _deps, confirmation) => {
      confirmation.requireConfirmable("gated: cannot ask.");
      confirmation.confirm("Go ahead?");
      return { done: true };
    },
  });
}

function buildServer(): McpServer {
  const server = new McpServer({ name: "confirm-test", version: "0.0.0" }, { capabilities: { tools: { listChanged: false } } });
  gatedTool().register(server);
  return server;
}

type Answer = ElicitResult | null;

/** A client that declares form elicitation (unless `answer` is null) and answers every prompt with `answer`. */
function makeClient(answer: Answer, modern: boolean, asked: string[]): Client {
  const client = new Client(
    { name: "confirm-test", version: "0.0.0" },
    {
      capabilities: answer === null ? {} : { elicitation: { form: {} } },
      ...(modern && { versionNegotiation: { mode: "auto" as const } }),
    },
  );
  if (answer !== null) {
    client.setRequestHandler("elicitation/create", async (request) => {
      asked.push((request.params as { message: string }).message);
      return answer;
    });
  }
  return client;
}

async function callGated(era: "2025" | "2026", answer: Answer): Promise<{ result: unknown; asked: string[] }> {
  const asked: string[] = [];
  const client = makeClient(answer, era === "2026", asked);
  if (era === "2025") {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await buildServer().connect(serverTransport);
    await client.connect(clientTransport);
  } else {
    const handler = createMcpHandler(() => buildServer());
    await client.connect(
      new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
        fetch: (url, init) => handler.fetch(new Request(url, init)),
      }),
    );
  }
  try {
    return { result: await client.callTool({ name: "gated", arguments: {} }), asked };
  } finally {
    await client.close();
  }
}

describe.each(["2025", "2026"] as const)("confirmation round trip through the SDK — %s era", (era) => {
  it("accept with confirm: true → the handler runs to success after one prompt", async () => {
    const { result, asked } = await callGated(era, { action: "accept", content: { confirm: true } });
    expect((result as { isError?: boolean }).isError).toBeFalsy();
    expect(JSON.parse(textOf(result))).toEqual({ done: true });
    expect(asked).toEqual(["Go ahead?"]);
  });

  it("decline → the CONFIRMATION_DECLINED envelope", async () => {
    const { result } = await callGated(era, { action: "decline" });
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(JSON.parse(textOf(result))).toMatchObject({
      code: "VALIDATION_ERROR",
      details: { code: "CONFIRMATION_DECLINED", action: "decline" },
    });
  });

  it("a client with no elicitation capability → the project's CONFIRMATION_UNAVAILABLE envelope, not the SDK's error", async () => {
    const { result, asked } = await callGated(era, null);
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(JSON.parse(textOf(result))).toEqual({
      code: "VALIDATION_ERROR",
      message: "gated: cannot ask.",
      details: { code: "CONFIRMATION_UNAVAILABLE" },
    });
    expect(asked).toEqual([]);
  });
});
