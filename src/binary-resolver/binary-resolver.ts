// Original — no upstream. Three-tier binary resolver per FR-001..FR-020 (017-cross-platform-support).
import { constants as fsConstants } from "node:fs";
import { posix as posixPath } from "node:path";

import { UpstreamError } from "../errors.js";

export interface BinaryResolverDeps {
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  homedir: () => string;
  access: (path: string, mode: number) => Promise<void>;
}

export interface BinaryResolverResult {
  path: string;
  attempts: ResolutionAttempt[];
}

export interface ResolutionAttempt {
  source: "OBSIDIAN_BIN" | "platform-default" | "PATH";
  path: string;
  outcome: "resolved" | "not-found" | "found-but-not-executable" | "pending";
}

function classifyAccessFailure(err: unknown): "not-found" | "found-but-not-executable" {
  return (err as NodeJS.ErrnoException)?.code === "ENOENT" ? "not-found" : "found-but-not-executable";
}

function computePlatformDefault(platform: NodeJS.Platform, homedir: () => string): string | null {
  // Per FR-002 / R11 / F4: darwin and linux have a documented install path; win32 and any
  // other platform skip the platform-default attempt entirely (FR-005 byte-for-byte).
  if (platform === "darwin") return "/usr/local/bin/obsidian";
  if (platform === "linux") return posixPath.join(homedir(), ".local/bin/obsidian");
  return null;
}

export async function resolveBinary(deps: BinaryResolverDeps): Promise<BinaryResolverResult> {
  const attempts: ResolutionAttempt[] = [];
  const overridePath = deps.env.OBSIDIAN_BIN;

  if (typeof overridePath === "string" && overridePath.length > 0) {
    try {
      await deps.access(overridePath, fsConstants.X_OK);
      attempts.push({ source: "OBSIDIAN_BIN", path: overridePath, outcome: "resolved" });
      return { path: overridePath, attempts };
    } catch (err) {
      // FR-008 / FR-020: no fall-through on override failure.
      attempts.push({ source: "OBSIDIAN_BIN", path: overridePath, outcome: classifyAccessFailure(err) });
      throw new UpstreamError({
        code: "CLI_BINARY_NOT_FOUND",
        cause: err,
        details: { platform: deps.platform, attempts, PATH: deps.env.PATH },
      });
    }
  }

  const platformDefaultPath = computePlatformDefault(deps.platform, deps.homedir);
  if (platformDefaultPath !== null) {
    try {
      // R9 / FR-007: fs.access(X_OK) follows symlinks transparently — no fs.realpath needed.
      await deps.access(platformDefaultPath, fsConstants.X_OK);
      attempts.push({ source: "platform-default", path: platformDefaultPath, outcome: "resolved" });
      return { path: platformDefaultPath, attempts };
    } catch (err) {
      attempts.push({ source: "platform-default", path: platformDefaultPath, outcome: classifyAccessFailure(err) });
      // Fall through to PATH branch.
    }
  }

  // Q1: PATH lookup is deferred to OS spawn — the dispatch layer settles the trailing
  // pending attempt to "resolved" or "not-found" once the spawn outcome is known.
  attempts.push({ source: "PATH", path: "obsidian", outcome: "pending" });
  return { path: "obsidian", attempts };
}
