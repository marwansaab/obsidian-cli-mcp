// Original — no upstream. tag handler — single invokeCli wrapper around the eval subcommand with the frozen JS template + base64 JSON payload (R6 / FR-020 anti-injection); R2/R3 single-call architecture branched at envelope-emission on `wantTotal`; stage-0 closed-but-registered-vault detection via the shared `_eval-vault-closed-detection` module (BI-028 is the third consumer after BI-026 origin / BI-027 lift); stage-1 extraction uses the BI-026 trimStart+startsWith pattern (the template is quiet — no plugin-side console preamble); stages 2-5 multi-stage parse (JSON.parse → envelope safeParse → discriminate on ok → per-mode output validation) with structured CLI_REPORTED_ERROR propagation; ZERO new top-level error codes + ZERO new details.code values (preserves fourteen-tool zero-new-codes streak).
import { JS_TEMPLATE } from "./_template.js";
import {
  tagCountOnlyOutputSchema,
  tagDefaultOutputSchema,
  tagEvalEnvelopeSchema,
  type TagCountOnlyOutput,
  type TagDefaultOutput,
  type TagInput,
} from "./schema.js";
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { detectIfClosed } from "../_eval-vault-closed-detection/index.js";
import { composeEvalCode } from "../_shared.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export async function executeTag(
  input: TagInput,
  deps: ExecuteDeps,
): Promise<TagDefaultOutput | TagCountOnlyOutput> {
  const code = composeEvalCode(JS_TEMPLATE, {
    query: input.tag,
    total: input.total === true,
  });

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

  // === Stage 0 — closed-but-registered-vault detection (shared module) ===
  // Empty stdout + exit 0 + a vault= argument is the signature of an eval call
  // against a registered-but-closed vault; the CLI transparently opens the
  // vault as a side effect. Delegate to the shared
  // `_eval-vault-closed-detection` module, which issues a second invokeCli to
  // `vaults verbose` and parses the registry. Third consumer after BI-026
  // (origin) / BI-027 (lift to shared module).
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
  }

  // === Stage 1 — extract JSON via "=> " prefix (BI-026 pattern, no LAST-`=> ` rescan) ===
  const trimmed = result.stdout.trimStart();
  const jsonText = trimmed.startsWith("=> ") ? trimmed.slice(3) : trimmed;

  // === Stage 2 — JSON.parse ===
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch (err) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: err,
      details: { stage: "json-parse", stdout: result.stdout.slice(0, 500) },
      message: `tag: eval response is not JSON: ${result.stdout.slice(0, 200)}`,
    });
  }

  // === Stage 3 — envelope safeParse ===
  const validated = tagEvalEnvelopeSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: validated.error,
      details: { stage: "envelope-parse", stdout: result.stdout.slice(0, 500) },
      message: "tag: eval response shape unexpected",
    });
  }
  const envelope = validated.data;

  // === Stage 4 — discriminate on ok ===
  if (!envelope.ok) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: { stage: "envelope-error", code: envelope.code, detail: envelope.detail },
      message: `tag: eval envelope reported ${envelope.code}${envelope.detail ? ` (${envelope.detail})` : ""}`,
    });
  }

  // === Stage 5 — per-mode output validation + return ===
  if (envelope.mode === "count-only") {
    return tagCountOnlyOutputSchema.parse(envelope.total);
  }
  return tagDefaultOutputSchema.parse({
    count: envelope.count,
    paths: envelope.paths,
  });
}
