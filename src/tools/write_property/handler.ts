// Original — no upstream. write_property handler: per-mode invokeCli wrapper around the CLI's native property:set subcommand (R2 / F1). Specific+path → 1 spawn; specific+file → 2 spawns (file TSV resolve → property:set); active → 2 spawns (FIXED eval template → property:set with resolved vault+path). Type inference from JS value shape per FR-008 / R10; empty-array branch emits literal "[]" per R10 / F2 / FR-018; cross-type retype delegated to native CLI (FR-033 / F3); type-vs-value contradictions CLI-rejected per F4 / R6.
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";

import type { PropertyWriteTypeLabel, WritePropertyInput, WritePropertyOutput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

// R15 — FIXED eval template; NO user input interpolation. Returns the focused
// file's vault-relative path + the vault display name in a single JSON envelope.
const FOCUSED_FILE_TEMPLATE =
  "(()=>{const f=app.workspace.getActiveFile();return JSON.stringify({path:f?.path??null,vault:app.vault.getName()});})()";

interface FocusedFileResponse {
  path: string | null;
  vault: string;
}

export function inferType(
  value: WritePropertyInput["value"],
  explicit?: PropertyWriteTypeLabel,
): PropertyWriteTypeLabel {
  if (explicit !== undefined) return explicit;
  if (typeof value === "boolean") return "checkbox";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "list";
  return "text";
}

export function serialiseValue(value: WritePropertyInput["value"]): string {
  if (Array.isArray(value)) {
    // FR-018 / R10 / F2 — empty array must emit the literal string "[]"; the CLI
    // recognises this as "write an empty YAML list". The empty-string path
    // (F14) would produce a one-element list with the empty string instead.
    if (value.length === 0) return "[]";
    return value.join(",");
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function parseFileTSV(stdout: string): { path: string } {
  for (const line of stdout.split("\n")) {
    if (line.startsWith("path\t")) {
      return { path: line.slice("path\t".length).trim() };
    }
  }
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: { stage: "file-tsv-parse", stdout: stdout.slice(0, 500) },
    message: "write_property: file subcommand stdout did not contain a path line",
  });
}

function parseEvalResponse(stdout: string): unknown {
  // F3 (015-read-heading) — eval stdout is prefixed with "=> "; the remainder
  // is the JS expression's value as text. Strip and JSON.parse the body.
  const trimmed = stdout.trimStart();
  const body = trimmed.startsWith("=> ") ? trimmed.slice(3) : trimmed;
  return JSON.parse(body);
}

function isFocusedFileResponse(value: unknown): value is FocusedFileResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (typeof v.path === "string" || v.path === null) && typeof v.vault === "string";
}

export async function executeWriteProperty(
  input: WritePropertyInput,
  deps: ExecuteDeps,
): Promise<WritePropertyOutput> {
  const adapterDeps = {
    spawnFn: deps.spawnFn,
    env: deps.env,
    logger: deps.logger,
    queue: deps.queue,
  };

  const resolvedType = inferType(input.value, input.type);
  const serialisedValue = serialiseValue(input.value);

  let writeVault: string;
  let writePath: string;

  if (input.target_mode === "active") {
    const focused = await invokeCli(
      {
        command: "eval",
        parameters: { code: FOCUSED_FILE_TEMPLATE },
        flags: [],
        target_mode: "active",
      },
      adapterDeps,
    );
    let parsed: unknown;
    try {
      parsed = parseEvalResponse(focused.stdout);
    } catch (err) {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: err,
        details: { stage: "json-parse", stdout: focused.stdout.slice(0, 500) },
        message: "write_property: active-mode focused-file eval returned unparseable response",
      });
    }
    if (!isFocusedFileResponse(parsed)) {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "envelope-parse", parsed },
        message: "write_property: active-mode focused-file eval returned unexpected shape",
      });
    }
    if (parsed.path === null) {
      throw new UpstreamError({
        code: "ERR_NO_ACTIVE_FILE",
        cause: null,
        details: {},
        message:
          "No active file in Obsidian. Open a note in the editor, or call write_property with target_mode=specific.",
      });
    }
    writeVault = parsed.vault;
    writePath = parsed.path;
  } else if (input.path !== undefined) {
    writeVault = input.vault!;
    writePath = input.path;
  } else {
    // specific + file (wikilink) — pre-flight TSV resolve to discover canonical path
    const fileInfo = await invokeCli(
      {
        command: "file",
        vault: input.vault!,
        parameters: { file: input.file! },
        flags: [],
        target_mode: "specific",
      },
      adapterDeps,
    );
    writeVault = input.vault!;
    writePath = parseFileTSV(fileInfo.stdout).path;
  }

  await invokeCli(
    {
      command: "property:set",
      vault: writeVault,
      parameters: {
        name: input.name,
        value: serialisedValue,
        type: resolvedType,
        path: writePath,
      },
      flags: [],
      target_mode: "specific",
    },
    adapterDeps,
  );

  return {
    written: true,
    path: writePath,
    name: input.name,
  };
}
