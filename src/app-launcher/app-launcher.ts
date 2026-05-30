// Original — no upstream. launchObsidian — the second sanctioned spawn site (extends the ADR-029
// D8 allowlist; recommended ADR-030). Starts the Obsidian *application* (not the CLI) by handing the
// `obsidian://open?vault=<URL-encoded vault>` URI to the platform's default-URI opener:
//   win32  → cmd /c start "" "<uri>"          (registered protocol handler via the shell `start` verb)
//   darwin → open "<uri>"
//   linux / other POSIX → xdg-open "<uri>"
// The opener is spawned detached, stdio "ignore", unref'd — fire-and-forget. It resolves once the
// opener has spawned and does NOT wait for readiness (the dispatch layer observes readiness by
// re-running the original CLI command). It deliberately does NOT resolve the obsidian CLI binary
// (no resolveBinary import) and never spawns the `obsidian` CLI — its sole job is launching the GUI app
// (architecture.test.ts asserts both invariants).
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";

/**
 * Local SpawnLike — intentionally NOT imported from `_dispatch.ts`. `_dispatch` imports this module
 * (`_dispatch → app-launcher`); importing back would create a cycle (Principle I — one-directional).
 */
export type SpawnLike = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

export interface LaunchInput {
  /** When present → `obsidian://open?vault=<encodeURIComponent(vault)>`; absent → bare `obsidian://` app-open. */
  vault?: string;
}

export interface LaunchDeps {
  /** Test seam — defaults to `process.platform`. Selects the per-OS opener. */
  platform?: NodeJS.Platform;
  /** Test seam — defaults to `node:child_process` spawn. */
  spawnFn?: SpawnLike;
}

function buildObsidianUri(vault: string | undefined): string {
  return vault !== undefined ? `obsidian://open?vault=${encodeURIComponent(vault)}` : "obsidian://";
}

function selectOpener(platform: NodeJS.Platform, uri: string): { command: string; args: string[] } {
  if (platform === "win32") {
    // `start` is a cmd.exe builtin, not an executable; the empty "" is the (ignored) window-title
    // argument so a quoted URI is never mistaken for the title.
    return { command: "cmd", args: ["/c", "start", "", uri] };
  }
  if (platform === "darwin") {
    return { command: "open", args: [uri] };
  }
  // linux and any other POSIX desktop
  return { command: "xdg-open", args: [uri] };
}

/**
 * Fire-and-forget launch of the Obsidian application via the `obsidian://` URI. Resolves once the
 * opener process has spawned (`spawn` event); rejects if the opener cannot be started — a synchronous
 * spawn throw, or an async `error` event such as `ENOENT` when the opener binary is missing. The
 * rejection is surfaced to the orchestrator, which treats it as "could not launch" and lets the
 * readiness bound govern the eventual distinct error.
 */
export function launchObsidian(input: LaunchInput, deps: LaunchDeps = {}): Promise<void> {
  const platform = deps.platform ?? process.platform;
  const spawnFn = deps.spawnFn ?? nodeSpawn;
  const uri = buildObsidianUri(input.vault);
  const { command, args } = selectOpener(platform, uri);

  return new Promise<void>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawnFn(command, args, {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        shell: false,
      });
    } catch (err) {
      reject(err);
      return;
    }
    let settled = false;
    child.once("error", (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
    child.once("spawn", () => {
      if (settled) return;
      settled = true;
      child.unref();
      resolve();
    });
  });
}
