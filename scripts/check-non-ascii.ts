// Original — no upstream. npm run check:non-ascii (spec 093): drives the built server over stdio against a test vault and a read-only semantic vault and prints one PASS / FAIL / BLOCKED block per non-ASCII scenario. Run npm run build first.
//
//   npm run check:non-ascii -- --test-vault TestVault-Obsidian-CLI-MCP --semantic-vault My-Setup-Vault
//   npm run check:non-ascii -- --test-vault TestVault-Obsidian-CLI-MCP --semantic-vault My-Setup-Vault --staged-note "Notes/Café.md"
//
// Every outcome rule lives in src/tools/_non-ascii-checks.ts, which is unit-tested; this file holds the I/O only:
// arguments, the stdio client, fixture seeding and cleanup under the test vault's Sandbox/, the readiness wait, the
// calls, the report and the exit status (0 no failure, 1 a failure or cleanup residue, 2 no run; contract §C).
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { z } from "zod";

import {
  buildFixtures,
  DEADLINE_MS,
  exitStatus,
  fixturesVisibleIn,
  missingNotePath,
  parseToolResult,
  renderReport,
  RETRY_INTERVAL_MS,
  retryUntil,
  runChecks,
  runFolderName,
  SCENARIOS,
  USAGE,
  validateArgs,
  vaultFacts,
} from "../src/tools/_non-ascii-checks.ts";
import type {
  CallTool,
  CheckContext,
  CleanupResult,
  Fixtures,
  Outcome,
  RetryOptions,
  RunArgs,
  ToolResult,
} from "../src/tools/_non-ascii-checks.ts";

const REPO_ROOT = resolve(import.meta.dirname, "..");

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));
const two = (n: number): string => String(n).padStart(2, "0");
const errnoOf = (err: unknown): unknown => (err as NodeJS.ErrnoException | undefined)?.code;

/** A fixture write whose nearest existing ancestor resolves outside Sandbox/ (contract §W 2). */
class ContainmentError extends Error {}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== "" && rel.split(sep)[0] !== ".." && !isAbsolute(rel);
}

/** Refuse `target` unless the realpath of its nearest existing ancestor is inside `sandbox`. */
async function assertInside(sandbox: string, target: string): Promise<void> {
  for (let probe = target; ; probe = dirname(probe)) {
    try {
      const real = await realpath(probe);
      if (real !== sandbox && !isInside(sandbox, real))
        throw new ContainmentError(`refused write outside Sandbox/: ${target}`);
      return;
    } catch (err) {
      if (err instanceof ContainmentError || errnoOf(err) !== "ENOENT") throw err;
      if (dirname(probe) === probe)
        throw new ContainmentError(`no existing ancestor for ${target}`);
    }
  }
}

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (s) => s.isFile(),
    () => false,
  );
}

/** Absent only on ENOENT; any other stat failure counts as present, which BLOCKs S2 rather than risk a false PASS. */
async function isAbsent(path: string): Promise<boolean> {
  return stat(path).then(
    () => false,
    (err: unknown) => errnoOf(err) === "ENOENT",
  );
}

async function header(client: Client, args: RunArgs, at: Date) {
  const pkg = z
    .object({ version: z.string() })
    .loose()
    .parse(JSON.parse(await readFile(join(REPO_ROOT, "package.json"), "utf8")));
  let sha = "unknown";
  try {
    sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    // Not a git checkout; the header says so.
  }
  return {
    date: `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}`,
    version: pkg.version,
    sha,
    serverVersion: client.getServerVersion()?.version ?? "unknown",
    args,
  };
}

async function run(client: Client, args: RunArgs): Promise<number> {
  const started = new Date();
  const call: CallTool = (name, toolArgs) => client.callTool({ name, arguments: toolArgs });
  const opts: RetryOptions = {
    intervalMs: RETRY_INTERVAL_MS,
    deadlineMs: DEADLINE_MS,
    sleep: (ms) => sleep(ms),
    now: () => Date.now(),
  };

  // Step 1: resolve both vaults' folders from the published `vaults` tool.
  const vaultsResult: ToolResult = await call("vaults", {}).then(
    parseToolResult,
    (err: unknown) => ({
      kind: "error",
      payload: { code: "CALL_FAILED", message: message(err), details: {} },
    }),
  );
  const facts = vaultFacts(vaultsResult, args);
  const fixtures: Fixtures = buildFixtures(runFolderName(started, randomBytes(2).toString("hex")));
  const missingNote = missingNotePath(randomBytes(4).toString("hex"));
  const ctx: CheckContext = {
    testVaultListed: facts.testVaultListed,
    semanticVaultListed: facts.semanticVaultListed,
    ...(facts.vaultsError !== undefined && { vaultsError: facts.vaultsError }),
    ...(facts.semanticRoot !== undefined && { semanticRoot: facts.semanticRoot }),
    fixturesVisible: false,
    outsideSeenByP1: false,
    stagedNoteOnDisk: false,
    missingNoteAbsent: false,
  };

  let runDir: string | undefined;
  let outcomes: Outcome[];
  let cleanup: CleanupResult = { kind: "none" };
  try {
    if (facts.testRoot !== undefined) {
      // Steps 2–3: seed the fixtures under the test vault's existing Sandbox/ (contract §W 1–2), then wait until
      // Obsidian serves the all-ASCII outside note (research D4).
      let sandbox: string;
      try {
        sandbox = await realpath(join(facts.testRoot, "Sandbox"));
        if (!(await stat(sandbox)).isDirectory()) throw new Error("not a folder");
      } catch (err) {
        process.stderr.write(
          `check-non-ascii: no Sandbox/ folder in test vault ${args.testVault} (${message(err)})\n`,
        );
        return 2;
      }
      // Vault-relative fixture paths start with "Sandbox/"; map the rest under the Sandbox realpath.
      const abs = (rel: string): string => join(sandbox, ...rel.split("/").slice(1));
      const runAbs = abs(fixtures.runFolder);
      await assertInside(sandbox, runAbs);
      await mkdir(runAbs);
      runDir = runAbs; // set only once this run created the folder, so cleanup never removes anything else
      await assertInside(sandbox, abs(fixtures.folder));
      await mkdir(abs(fixtures.folder));
      for (const file of fixtures.files) {
        const target = abs(file.path);
        await assertInside(sandbox, target);
        await writeFile(target, file.content, { encoding: "utf8", flag: "wx" });
      }
      ctx.fixturesVisible = await retryUntil(
        async () => {
          try {
            const read = await call("read", {
              target_mode: "specific",
              vault: args.testVault,
              path: fixtures.outside,
            });
            return fixturesVisibleIn(parseToolResult(read), fixtures);
          } catch (err) {
            process.stderr.write(`check-non-ascii: readiness read failed: ${message(err)}\n`);
            return false;
          }
        },
        (visible) => visible,
        opts,
      );
    }

    // Semantic vault: READ-ONLY (contract §W 4, FR-017). The two stat calls below and the S1 / S2
    // smart_connections_similar calls are the only operations that touch it. Nothing here opens a path under it for
    // writing, and no write, rename, move or delete tool is ever called with its name.
    if (facts.semanticRoot !== undefined) {
      const root = facts.semanticRoot;
      if (args.stagedNote !== undefined)
        ctx.stagedNoteOnDisk = await isFile(join(root, ...args.stagedNote.split("/")));
      ctx.missingNoteAbsent = await isAbsent(join(root, ...missingNote.split("/")));
    }

    // Steps 4–5.
    outcomes = await runChecks(SCENARIOS, { args, fixtures, missingNote }, ctx, call, opts);
  } catch (err) {
    if (!(err instanceof ContainmentError)) throw err;
    process.stderr.write(`check-non-ascii: ${err.message}\n`);
    return 2;
  } finally {
    // Step 6: remove this run's folder, then confirm it is gone (contract §W 3).
    if (runDir !== undefined) {
      const dir = runDir;
      await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
        (err: unknown) => {
          process.stderr.write(`check-non-ascii: cleanup failed: ${message(err)}\n`);
        },
      );
      cleanup = (await isAbsent(dir))
        ? { kind: "removed", path: fixtures.runFolder }
        : { kind: "residue", path: fixtures.runFolder };
      if (cleanup.kind === "residue") process.stderr.write(`check-non-ascii: RESIDUE ${dir}\n`);
    }
  }

  // Step 7.
  process.stdout.write(renderReport(await header(client, args, started), outcomes, cleanup));
  return exitStatus(outcomes, cleanup);
}

async function main(): Promise<number> {
  let values: Parameters<typeof validateArgs>[0];
  try {
    values = parseArgs({
      options: {
        "test-vault": { type: "string" },
        "semantic-vault": { type: "string" },
        "staged-note": { type: "string" },
      },
    }).values;
  } catch (err) {
    process.stderr.write(`check-non-ascii: ${message(err)}\n${USAGE}\n`);
    return 2;
  }
  const args = validateArgs(values);
  if ("usageError" in args) {
    process.stderr.write(`check-non-ascii: ${args.usageError}\n${USAGE}\n`);
    return 2;
  }

  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(REPO_ROOT, "dist", "index.js")],
    env,
    stderr: "inherit",
  });
  // 2025-era handshake and no elicitation capability, as probe-stdio.ts --era legacy --no-elicitation.
  const client = new Client(
    { name: "obsidian-cli-mcp-check-non-ascii", version: "0.0.0" },
    { versionNegotiation: { mode: "legacy" }, capabilities: {} },
  );
  try {
    await client.connect(transport);
  } catch (err) {
    process.stderr.write(
      `check-non-ascii: could not start the server (run npm run build first): ${message(err)}\n`,
    );
    return 2;
  }
  try {
    return await run(client, args);
  } finally {
    await client.close();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    process.stderr.write(
      `check-non-ascii failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
    );
    process.exitCode = 1;
  },
);
