// Original — no upstream. Centralised CLI invocation primitive: argv assembly, active-mode target-locator strip, four-priority error classification.
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";

import { UpstreamError } from "../errors.js";

export type TargetMode = "specific" | "active";

export interface InvokeCliInput {
  command: string;
  parameters: Record<string, string | number | boolean | undefined>;
  flags: string[];
  target_mode: TargetMode;
}

export type SpawnLike = (binary: string, args: string[], options: SpawnOptions) => ChildProcess;

export interface InvokeCliDeps {
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export interface InvokeCliSuccess {
  stdout: string;
  stderr: string;
}

export { UpstreamError };

export function invokeCli(input: InvokeCliInput, deps?: InvokeCliDeps): Promise<InvokeCliSuccess> {
  const env = deps?.env ?? process.env;
  const binary = env.OBSIDIAN_BIN ?? "obsidian";
  const spawnFn = deps?.spawnFn ?? nodeSpawn;
  const stripped = input.target_mode === "active" ? stripTargetLocators(input.parameters) : input.parameters;
  const argv = assembleArgv(input.command, stripped, input.flags);

  return new Promise<InvokeCliSuccess>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawnFn(binary, argv, {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (err: unknown) {
      const errnoCode = (err as NodeJS.ErrnoException).code;
      if (errnoCode === "ENOENT") {
        reject(
          new UpstreamError({
            code: "CLI_BINARY_NOT_FOUND",
            cause: err,
            details: { binaryAttempted: binary, PATH: env.PATH },
          }),
        );
        return;
      }
      reject(err);
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      const exitCode = code ?? -1;

      // Priority (a): non-zero exit (or signal-only termination via code === null → exitCode -1 sentinel).
      if (code !== 0) {
        reject(
          new UpstreamError({
            code: "CLI_NON_ZERO_EXIT",
            cause: { exitCode, signal },
            details: { command: input.command, stdout, stderr, exitCode, signal },
          }),
        );
        return;
      }

      const trimmedHead = stdout.trimStart();

      // Priority (b): ERR_NO_ACTIVE_FILE — exit 0 with stdout starting with the full literal prefix.
      // MUST be checked before priority (c) so the longer prefix wins.
      if (trimmedHead.startsWith("Error: no active file")) {
        const message = stdout.split("\n", 1)[0]!.trim();
        reject(
          new UpstreamError({
            code: "ERR_NO_ACTIVE_FILE",
            cause: null,
            details: { command: input.command, stdout, stderr, exitCode: 0, message },
            message:
              'No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: "specific" and an explicit vault/file.',
          }),
        );
        return;
      }

      // Priority (c): CLI_REPORTED_ERROR — exit 0 with stdout starting with `Error:` (any other suffix).
      if (trimmedHead.startsWith("Error:")) {
        const message = stdout.split("\n", 1)[0]!.trim();
        reject(
          new UpstreamError({
            code: "CLI_REPORTED_ERROR",
            cause: null,
            details: { command: input.command, stdout, stderr, exitCode: 0, message },
          }),
        );
        return;
      }

      // Priority (d): success.
      resolve({ stdout, stderr });
    });
  });
}

const TARGET_LOCATOR_KEYS = new Set(["vault", "file", "path"]);

function stripTargetLocators(
  parameters: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean | undefined> {
  const stripped: Record<string, string | number | boolean | undefined> = {};
  for (const [k, v] of Object.entries(parameters)) {
    if (!TARGET_LOCATOR_KEYS.has(k)) stripped[k] = v;
  }
  return stripped;
}

function assembleArgv(
  command: string,
  parameters: Record<string, string | number | boolean | undefined>,
  flags: string[],
): string[] {
  const { vault, ...rest } = parameters;
  const vaultPrefix = vault !== undefined ? [`vault=${String(vault)}`] : [];
  const remainingKvParams = Object.entries(rest)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${String(v)}`);
  return [command, ...vaultPrefix, ...remainingKvParams, ...flags];
}
