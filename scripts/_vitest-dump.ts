// Original — no upstream. Runs a generated vitest file that dumps JSON to a scratch path, then cleans up; shared by the baseline writer and the description audit because Node cannot resolve the project's .js-on-.ts imports directly.

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Writes src/tools/<testFileName> from makeSource(dumpPath), runs it with vitest, and returns the
// text the generated test wrote to dumpPath. The temporary test and the scratch directory are
// always removed. vitest's console output goes to this process's stderr, so a caller's stdout
// stays free for its own result.
export async function runVitestDump(
  testFileName: string,
  makeSource: (dumpPath: string) => string,
): Promise<string> {
  const scratch = mkdtempSync(join(tmpdir(), "vitest-dump-"));
  const dumpPath = join(scratch, "dump.json");
  const dumperPath = resolve(import.meta.dirname, "..", "src", "tools", testFileName);
  writeFileSync(dumperPath, makeSource(dumpPath), { encoding: "utf8" });
  try {
    await new Promise<void>((resolveP, rejectP) => {
      const child = spawn(
        "npx",
        ["vitest", "run", "--no-coverage", dumperPath],
        { stdio: ["inherit", process.stderr, "inherit"], shell: true },
      );
      child.on("exit", (code) => {
        if (code === 0) resolveP();
        else rejectP(new Error(`vitest exited ${code}`));
      });
      child.on("error", rejectP);
    });
    return readFileSync(dumpPath, "utf8");
  } finally {
    rmSync(dumperPath, { force: true });
    rmSync(scratch, { recursive: true, force: true });
  }
}
