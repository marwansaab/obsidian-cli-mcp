// Original — no upstream. read handler: thin transformer routing parsed input through invokeCli (BI-028) — argv assembly, queue, bounds owned by the typed-tool facade. Spec 070: resolves the target first and rejects file types other than notes, canvases and bases (UNSUPPORTED_FILE_TYPE) before the read; `file` mode forwards the original `file=`, active mode the resolved `path=` in specific mode.
import { invokeCli, type ResolveBinaryFn, type SpawnLike, type CallScope } from "../../cli-adapter/cli-adapter.js";
import { assertSupportedFileType, categoryOf, extensionOf, type FileCategory } from "../../file-type/file-type.js";
import { forwardedLocator, resolveFileTarget } from "../_file-target.js";

import type { ReadNoteInput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";
import type { VaultRegistry } from "../../vault-registry/registry.js";

export interface ExecuteDeps extends CallScope {
  logger: Logger;
  queue: Queue;
  vaultRegistry: VaultRegistry;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
  /** Test seam — passes through to invokeCli → dispatchCli. */
  resolveBinary?: ResolveBinaryFn;
}

export interface ReadNoteOutput {
  content: string;
}

/** The file types `read` handles (spec 070 Clarifications Q3); attachments are shown with open_file. */
export const READ_SUPPORTED = ["note", "canvas", "base"] as const satisfies readonly FileCategory[];

export async function executeReadNote(input: ReadNoteInput, deps: ExecuteDeps): Promise<ReadNoteOutput> {
  const target = await resolveFileTarget(input, deps, "read");
  assertSupportedFileType({
    relPath: target.relPath,
    supported: READ_SUPPORTED,
    toolName: "read",
    ...(categoryOf(extensionOf(target.relPath)) === "attachment" ? { alternative: "open_file" } : {}),
  });
  // vault flows through invokeCli as a top-level field — symmetric with invokeBoundedCli — rather than being smuggled inside `parameters`.
  const { vault, parameters } = forwardedLocator(input, target);
  const { stdout } = await invokeCli(
    { command: "read", vault, parameters, flags: [], target_mode: "specific" },
    deps,
  );
  return { content: stdout };
}
