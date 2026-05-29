// Original — no upstream. FR-012 / ADR-029 D8 structural guardrail. Converts the
// "no tool can bypass the single-spawn cold-start retry" invariant from a header comment
// (which never fails CI) into a failing build. Two invariants:
//   (i)  node:child_process VALUE imports of spawn/spawnSync/exec/execFile live ONLY in
//        src/cli-adapter/_dispatch.ts (type-only imports are exempt — they carry no runtime
//        spawn capability);
//   (ii) dispatchCli is imported by ONLY the two facades (cli-adapter.ts, invoke-bounded-cli.ts).
// Either bypass would let a future tool reach the CLI without inheriting the retry. The scan
// runs against the real src/** tree AND against synthetic samples (so the detector itself is
// proven to fire — "fails when a violating import is introduced" without mutating the tree).
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SPAWN_VALUE_NAMES = ["spawn", "spawnSync", "exec", "execFile"];

interface SourceFile {
  /** Path relative to src/, POSIX-normalised. */
  rel: string;
  base: string;
  content: string;
}

const SRC_DIR = fileURLToPath(new URL("../", import.meta.url)); // src/cli-adapter/ -> src/

function collectProductionFiles(dir: string, baseDir: string = dir): SourceFile[] {
  const out: SourceFile[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectProductionFiles(full, baseDir));
      continue;
    }
    if (!entry.name.endsWith(".ts")) continue;
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".d.ts")) continue; // tests are exempt
    out.push({
      rel: full.slice(baseDir.length + 1).split("\\").join("/"),
      base: basename(entry.name),
      content: readFileSync(full, "utf8"),
    });
  }
  return out;
}

/** True iff `content` has a VALUE import of a spawn-family symbol from node:child_process. */
function hasChildProcessSpawnValueImport(content: string): boolean {
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("import")) continue;
    if (!/from\s+["']node:child_process["']/.test(line)) continue;
    const clause = line.slice("import".length, line.lastIndexOf("from")).trim();
    if (clause.startsWith("type ")) continue; // `import type {...}` — type-only statement
    const brace = clause.match(/\{([\s\S]*)\}/);
    if (!brace) return true; // `import * as cp` / default — namespace value import exposes spawn
    for (const binding of brace[1]!.split(",").map((b) => b.trim()).filter(Boolean)) {
      if (binding.startsWith("type ")) continue; // `{ type SpawnOptions }` — type-only binding
      const name = binding.split(/\s+as\s+/)[0]!.trim();
      if (SPAWN_VALUE_NAMES.includes(name)) return true;
    }
  }
  return false;
}

/** True iff `content` imports the `dispatchCli` value binding from a `_dispatch` module. */
function importsDispatchCli(content: string): boolean {
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("import")) continue;
    if (!/from\s+["'][^"']*_dispatch(?:\.js)?["']/.test(line)) continue;
    const brace = line.match(/\{([\s\S]*?)\}/);
    if (!brace) continue;
    for (const binding of brace[1]!.split(",").map((b) => b.trim()).filter(Boolean)) {
      const name = binding.replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim();
      if (name === "dispatchCli") return true;
    }
  }
  return false;
}

describe("architecture guardrail (FR-012 / ADR-029 D8)", () => {
  const files = collectProductionFiles(SRC_DIR);

  it("scans a non-trivial set of production files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("(i) node:child_process spawn VALUE-imports live ONLY in _dispatch.ts", () => {
    const offenders = files
      .filter((f) => f.base !== "_dispatch.ts")
      .filter((f) => hasChildProcessSpawnValueImport(f.content))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("(i) _dispatch.ts is in fact the single spawn-import site", () => {
    const dispatch = files.find((f) => f.base === "_dispatch.ts");
    expect(dispatch).toBeDefined();
    expect(hasChildProcessSpawnValueImport(dispatch!.content)).toBe(true);
  });

  it("(ii) dispatchCli is imported ONLY by the two facades", () => {
    const allowed = new Set(["cli-adapter.ts", "invoke-bounded-cli.ts"]);
    const offenders = files
      .filter((f) => f.base !== "_dispatch.ts") // _dispatch.ts defines it, does not import it
      .filter((f) => importsDispatchCli(f.content))
      .map((f) => f.rel)
      .filter((rel) => !allowed.has(basename(rel)));
    expect(offenders).toEqual([]);
  });

  // Detector self-tests — prove the scan FAILS the build when a bypass is introduced,
  // without actually mutating the tree (T027 "fails when a violating import is introduced").
  it("detects a spawn value-import bypass (synthetic)", () => {
    expect(hasChildProcessSpawnValueImport('import { spawn } from "node:child_process";')).toBe(true);
    expect(hasChildProcessSpawnValueImport('import { spawn as s } from "node:child_process";')).toBe(true);
    expect(hasChildProcessSpawnValueImport('import * as cp from "node:child_process";')).toBe(true);
    expect(hasChildProcessSpawnValueImport('import { execFile, type SpawnOptions } from "node:child_process";')).toBe(true);
  });

  it("does NOT flag type-only child_process imports (synthetic)", () => {
    expect(hasChildProcessSpawnValueImport('import type { SpawnOptions } from "node:child_process";')).toBe(false);
    expect(hasChildProcessSpawnValueImport('import { type SpawnOptions, type ChildProcess } from "node:child_process";')).toBe(false);
  });

  it("detects a dispatchCli caller bypass (synthetic)", () => {
    expect(importsDispatchCli('import { dispatchCli } from "./_dispatch.js";')).toBe(true);
    expect(importsDispatchCli('import { dispatchCli, type DispatchInput } from "../cli-adapter/_dispatch.js";')).toBe(true);
    expect(importsDispatchCli('import { assembleArgv } from "./_dispatch.js";')).toBe(false);
  });
});
