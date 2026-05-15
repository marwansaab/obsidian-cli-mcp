// Original — no upstream. tree handler — single invokeCli wrapper around the eval subcommand with the frozen JS template + base64 JSON payload (R6 / FR-020 anti-injection); R2/R3 single-call architecture branched at envelope-emission on `payload.total` (in-template); stage-0 closed-but-registered-vault detection via the shared `_eval-vault-closed-detection` module (BI-029 is the fourth consumer after BI-026 origin / BI-027 lift / BI-028 third-consumer); stage-1 extraction uses the BI-026 trimStart+startsWith pattern; stages 2-5 multi-stage parse (JSON.parse → envelope safeParse → discriminate on ok → output validation) with structured CLI_REPORTED_ERROR propagation; introduces TWO new details.code values (FOLDER_NOT_FOUND, NOT_A_FOLDER) under existing CLI_REPORTED_ERROR top-level code per ADR-015 sub-discriminator pattern (zero new top-level codes — twelve-tool streak preserved).
import { JS_TEMPLATE } from "./_template.js";
import { treeEvalEnvelopeSchema, treeOutputSchema, type TreeInput, type TreeOutput } from "./schema.js";
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

export async function executeTree(
  input: TreeInput,
  deps: ExecuteDeps,
): Promise<TreeOutput> {
  // === Stage 1 — assemble payload + render template ===
  const payloadJson = JSON.stringify({
    folder: input.folder ?? null,
    depth: input.depth ?? null,
    ext: input.ext ?? null,
    total: input.total === true,
  });
  const payloadB64 = Buffer.from(payloadJson, "utf-8").toString("base64");
  const code = JS_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64);

  // === Stage 2 — single invokeCli call (subcommand=eval) ===
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

  // === Stage 3 — closed-but-registered-vault detection (shared module) ===
  // Empty stdout + exit 0 + a vault= argument is the signature of an eval call
  // against a registered-but-closed vault; the CLI transparently opens the
  // vault as a side effect. Delegate to the shared
  // `_eval-vault-closed-detection` module, which issues a second invokeCli to
  // `vaults verbose` and parses the registry. Fourth consumer after BI-026
  // (origin) / BI-027 (lift) / BI-028 (third).
  if (input.target_mode === "specific" && typeof input.vault === "string" && result.stdout.trim().length === 0) {
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
  }

  // === Stage 4 — extract JSON via "=> " prefix (BI-026 pattern) ===
  const trimmed = result.stdout.trimStart();
  const jsonText = trimmed.startsWith("=> ") ? trimmed.slice(3) : trimmed;

  // === Stage 5 — JSON.parse ===
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch (err) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: err,
      details: { stage: "json-parse", stdout: result.stdout.slice(0, 500) },
      message: `tree: eval response is not JSON: ${result.stdout.slice(0, 200)}`,
    });
  }

  // === Stage 6 — envelope safeParse ===
  const validated = treeEvalEnvelopeSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: validated.error,
      details: { stage: "envelope-parse", stdout: result.stdout.slice(0, 500) },
      message: "tree: eval response shape unexpected",
    });
  }
  const envelope = validated.data;

  // === Stage 7 — discriminate on ok ===
  if (envelope.ok === false) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: {
        stage: "envelope-error",
        code: envelope.code,
        folder: envelope.folder,
      },
      message: `tree: ${envelope.code} for folder "${envelope.folder}"`,
    });
  }

  // === Stage 8 — output schema validation at the return boundary ===
  return treeOutputSchema.parse({ count: envelope.count, paths: envelope.paths });
}
