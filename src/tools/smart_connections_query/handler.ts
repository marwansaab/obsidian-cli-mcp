// Original — no upstream. smart_connections_query handler — single invokeCli wrapper around the eval subcommand with the frozen JS template + base64 JSON payload (R6 anti-injection); R2/R3 single-call architecture branched at envelope-emission on a.total; stage-0 closed-but-registered-vault detection (R5a) issues a SECOND invokeCli to the `vaults` subcommand via the shared `_eval-vault-closed-detection` module on the empty-stdout + exit-0 + specific-mode signature, distinguishing "vault registered but not currently open" (transparent-open side effect; CLI_REPORTED_ERROR with details.reason='not-open') from a genuinely anomalous empty-stdout response; stage-1 extraction uses LAST-`=> ` strategy (R14) because the plugin's lookup API emits plugin-side console.log output BEFORE the `=> ` eval-return marker; two-stage parse (JSON.parse → smartConnectionsQueryEvalResponseSchema.safeParse); envelope ok:false → UpstreamError mapping per R13 — three envelope codes flatten the (code, reason) pair for parse-time discrimination; handler unflattens into CLI_REPORTED_ERROR(details.code='SMART_CONNECTIONS_NOT_READY', details.reason='api-missing'|'embed-failed') per ADR-015.
import { JS_TEMPLATE } from "./_template.js";
import {
  smartConnectionsQueryEvalResponseSchema,
  type SmartConnectionsQueryEvalErrorCode,
  type SmartConnectionsQueryInput,
  type SmartConnectionsQueryOutput,
} from "./schema.js";
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { detectIfClosed } from "../_eval-vault-closed-detection/index.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export async function executeSmartConnectionsQuery(
  input: SmartConnectionsQueryInput,
  deps: ExecuteDeps,
): Promise<SmartConnectionsQueryOutput> {
  const payloadJson = JSON.stringify({
    query: input.query,
    limit: input.limit,
    total: input.total === true,
  });
  const payloadB64 = Buffer.from(payloadJson, "utf-8").toString("base64");
  const code = JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64);

  const result = await invokeCli(
    {
      command: "eval",
      vault: input.vault,
      parameters: { code },
      flags: [],
      target_mode: input.vault ? "specific" : "active",
    },
    { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
  );

  // === Stage 0 — closed-but-registered-vault detection (R5a) ===
  // Empty stdout + exit 0 + a vault= argument is the signature of an eval call
  // against a registered-but-closed vault (the CLI transparently opens the vault
  // as a side effect — verified live 2026-05-15 against The Setup). Delegate to
  // the shared `_eval-vault-closed-detection` module, which issues a second
  // invokeCli to `vaults verbose` and parses the registry.
  if (typeof input.vault === "string" && result.stdout.trim().length === 0) {
    const vaultName = input.vault;
    const isRegistered = await detectIfClosed({ vaultName, deps });
    if (isRegistered) {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: {
          code: "VAULT_NOT_FOUND",
          reason: "not-open",
          stage: "handler-stage-0",
          vault: vaultName,
        },
        message: `Vault "${vaultName}" is registered but not currently open in Obsidian; the CLI has begun opening it — retry after a brief delay.`,
      });
    }
    // Vault is not registered AND not open AND no "Vault not found." string was
    // emitted. Fall through to stage 1 — empty stdout will surface as a
    // structured json-parse failure. Should be rare for this BI: lookup-based
    // eval calls produce plugin-side console output on stdout in normal cases.
  }

  // === Stage 1 — LAST-`=> ` extraction (R14) ===
  // The plugin's lookup API emits plugin-side console.log lines
  // ("Found and returned N smart_blocks.") AND `[warn]` lines on stdout BEFORE
  // the `=> ` eval-return marker. BI-026's trimStart+startsWith strategy does
  // not survive this; we anchor on the LAST `\n=> ` occurrence with fallbacks
  // for the no-preamble and no-marker cases.
  let payload: string;
  const marker = "\n=> ";
  const idx = result.stdout.lastIndexOf(marker);
  if (idx >= 0) {
    payload = result.stdout.slice(idx + marker.length);
  } else if (result.stdout.startsWith("=> ")) {
    payload = result.stdout.slice(3);
  } else {
    payload = result.stdout;
  }

  // === Stage 2 — JSON.parse ===
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(payload);
  } catch (err) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: err,
      details: { stage: "json-parse", stdout: result.stdout.slice(0, 500) },
      message: `smart_connections_query: eval response is not JSON: ${result.stdout.slice(0, 200)}`,
    });
  }

  // === Stage 3 — envelope safeParse ===
  const validated = smartConnectionsQueryEvalResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: validated.error,
      details: { stage: "envelope-parse", stdout: result.stdout.slice(0, 500) },
      message: "smart_connections_query: eval response shape unexpected",
    });
  }

  // === Stage 4 — discriminate on `ok` ===
  if (validated.data.ok === true) {
    return { count: validated.data.count, matches: validated.data.matches };
  }

  throw mapEnvelopeError(validated.data.code, validated.data.detail);
}

function mapEnvelopeError(
  code: SmartConnectionsQueryEvalErrorCode,
  detail: string,
): UpstreamError {
  switch (code) {
    case "SMART_CONNECTIONS_NOT_INSTALLED":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "envelope-error", code, detail },
        message: `smart_connections_query: Smart Connections plugin is not installed in the vault (${detail})`,
      });
    case "SMART_CONNECTIONS_NOT_READY_API_MISSING":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: {
          stage: "envelope-error",
          code: "SMART_CONNECTIONS_NOT_READY",
          reason: "api-missing",
          detail,
        },
        message: `smart_connections_query: Smart Connections plugin is loaded but its lookup API is unavailable (${detail})`,
      });
    case "SMART_CONNECTIONS_NOT_READY_EMBED_FAILED":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: {
          stage: "envelope-error",
          code: "SMART_CONNECTIONS_NOT_READY",
          reason: "embed-failed",
          detail,
        },
        message: `smart_connections_query: lookup returned an error sentinel (${detail})`,
      });
  }
}
