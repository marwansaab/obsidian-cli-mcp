// Original — no upstream. smart_connections_similar handler — single invokeCli wrapper around the eval subcommand with the frozen JS template + base64 JSON payload (R6 anti-injection); R2/R3 single-call architecture branched at envelope-emission on a.total; stage-0 closed-but-registered-vault detection (R5a / FR-017a) issues a SECOND invokeCli to the `vaults` subcommand on the empty-stdout + exit-0 + specific-mode signature, distinguishing "vault registered but not currently open" (transparent-open side effect; CLI_REPORTED_ERROR with details.reason='not-open') from a genuinely anomalous empty-stdout response; two-stage parse step (JSON.parse → smartConnectionsSimilarEvalResponseSchema.safeParse) with structured CLI_REPORTED_ERROR on json-parse / envelope-parse failure; envelope ok:false → UpstreamError mapping per R13 (NO_ACTIVE_FILE → ERR_NO_ACTIVE_FILE for BI-015 / BI-025 parity per T0.1 lock; FILE_NOT_FOUND / NOT_MARKDOWN / SMART_CONNECTIONS_NOT_INSTALLED / SMART_CONNECTIONS_NOT_READY / SOURCE_NOT_INDEXED → CLI_REPORTED_ERROR with details.stage='envelope-error').
import { JS_TEMPLATE } from "./_template.js";
import {
  smartConnectionsSimilarEvalResponseSchema,
  type SmartConnectionsSimilarEvalErrorCode,
  type SmartConnectionsSimilarInput,
  type SmartConnectionsSimilarOutput,
} from "./schema.js";
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export async function executeSmartConnectionsSimilar(
  input: SmartConnectionsSimilarInput,
  deps: ExecuteDeps,
): Promise<SmartConnectionsSimilarOutput> {
  const payloadJson = JSON.stringify({
    active: input.target_mode === "active",
    path: input.target_mode === "specific" ? (input.path ?? null) : null,
    file: input.target_mode === "specific" ? (input.file ?? null) : null,
    limit: input.limit,
    total: input.total === true,
  });
  const payloadB64 = Buffer.from(payloadJson, "utf-8").toString("base64");
  const code = JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64);

  const result = await invokeCli(
    {
      command: "eval",
      vault: input.target_mode === "specific" ? input.vault : undefined,
      parameters: { code },
      flags: [],
      target_mode: input.target_mode,
    },
    { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
  );

  // === Stage 0 — closed-but-registered-vault detection (R5a / FR-017a / SC-011a) ===
  // Per F7 / F8 (live probe 2026-05-15): the CLI emits empty stdout + exit 0 for the FIRST
  // eval call against a closed registered vault AND transparently OPENS the vault as a
  // side effect. The cli-adapter's 011-R5 inspection clause does NOT fire (no "Vault not
  // found." string in empty output) and the dispatch-layer's `Error:` prefix classifier
  // does NOT fire either. The wrapper distinguishes "registered but not open" from the
  // genuinely-anomalous empty-stdout case by issuing a SECOND invokeCli to the `vaults`
  // subcommand to confirm vault registration. The second call is narrow — fires ONLY on
  // this signature — and is invisible to handler tests whose stubs use the queued-spawn
  // pattern.
  if (
    input.target_mode === "specific" &&
    typeof input.vault === "string" &&
    result.stdout.trim().length === 0
  ) {
    const vaultName = input.vault;
    const vaultsResult = await invokeCli(
      {
        command: "vaults",
        parameters: {},
        flags: ["verbose"],
        target_mode: "specific",
      },
      { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
    );
    if (isVaultRegistered(vaultsResult.stdout, vaultName)) {
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
    // Vault is not registered AND not open AND no "Vault not found." string was emitted.
    // Fall through to stage 1 (json-parse) — empty stdout will surface as a structured
    // json-parse failure. This is the truly-anomalous case and should be rare.
  }

  // === Stage 1 — strip the `=> ` prefix that eval prepends to its return value ===
  let stdout = result.stdout.trimStart();
  if (stdout.startsWith("=> ")) stdout = stdout.slice(3);

  // === Stage 2 — JSON.parse ===
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stdout);
  } catch (err) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: err,
      details: { stage: "json-parse", stdout: result.stdout.slice(0, 500) },
      message: `smart_connections_similar: eval response is not JSON: ${result.stdout.slice(0, 200)}`,
    });
  }

  // === Stage 3 — envelope safeParse ===
  const validated = smartConnectionsSimilarEvalResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: validated.error,
      details: { stage: "envelope-parse", stdout: result.stdout.slice(0, 500) },
      message: "smart_connections_similar: eval response shape unexpected",
    });
  }

  // === Stage 4 — discriminate on `ok` ===
  if (validated.data.ok === true) {
    return { count: validated.data.count, matches: validated.data.matches };
  }

  throw mapEnvelopeError(validated.data.code, validated.data.detail);
}

// Parse the `obsidian vaults verbose` stdout to check whether `vaultName` is a known
// registered vault. The output format is `<name>\t<absolute path>\n` per line, optionally
// prefixed by a UTF-8 BOM. Replicated structurally from src/vault-registry/registry.ts.
function isVaultRegistered(stdout: string, vaultName: string): boolean {
  const BOM = "﻿";
  const body = stdout.startsWith(BOM) ? stdout.slice(1) : stdout;
  for (const rawLine of body.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.length === 0) continue;
    const tabIdx = line.indexOf("\t");
    if (tabIdx < 0) continue;
    const name = line.slice(0, tabIdx);
    if (name === vaultName) return true;
  }
  return false;
}

function mapEnvelopeError(
  code: SmartConnectionsSimilarEvalErrorCode,
  detail: string,
): UpstreamError {
  switch (code) {
    case "NO_ACTIVE_FILE":
      // T0.1 lock: align with BI-015 read_heading / BI-025 links precedent — envelope
      // NO_ACTIVE_FILE → ERR_NO_ACTIVE_FILE (not CLI_REPORTED_ERROR).
      return new UpstreamError({
        code: "ERR_NO_ACTIVE_FILE",
        cause: null,
        details: { stage: "envelope-error", detail },
        message: "smart_connections_similar: no note focused; switch to specific mode or focus a note.",
      });
    case "FILE_NOT_FOUND":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "envelope-error", code, detail },
        message: `smart_connections_similar: file not found (${detail})`,
      });
    case "NOT_MARKDOWN":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "envelope-error", code, detail },
        message: `smart_connections_similar: target is not a Markdown note (${detail})`,
      });
    case "SMART_CONNECTIONS_NOT_INSTALLED":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "envelope-error", code, detail },
        message: `smart_connections_similar: Smart Connections plugin is not installed in the vault (${detail})`,
      });
    case "SMART_CONNECTIONS_NOT_READY":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "envelope-error", code, detail },
        message: `smart_connections_similar: Smart Connections plugin is loaded but its similarity API is not ready (${detail})`,
      });
    case "SOURCE_NOT_INDEXED":
      return new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "envelope-error", code, detail },
        message: `smart_connections_similar: source note has no embedding yet (${detail})`,
      });
  }
}
