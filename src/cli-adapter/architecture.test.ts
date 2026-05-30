// Original — no upstream. FR-012 / ADR-029 D8 structural guardrail. Converts the
// "no tool can bypass the single-spawn cold-start retry" invariant from a header comment
// (which never fails CI) into a failing build. Two invariants:
//   (i)  node:child_process VALUE imports of spawn/spawnSync/exec/execFile live ONLY in the
//        sanctioned spawn sites — src/cli-adapter/_dispatch.ts (the CLI spawn site) and
//        src/app-launcher/app-launcher.ts (the BI-060 GUI-app launch site; type-only imports
//        are exempt — they carry no runtime spawn capability);
//   (ii) dispatchCli is imported by ONLY the two facades (cli-adapter.ts, invoke-bounded-cli.ts).
// Either bypass would let a future tool reach the CLI without inheriting the retry. BI-060 admits
// app-launcher.ts as a SECOND spawn site whose purpose is starting the Obsidian *application* (the
// `obsidian://` URI opener), NOT running a CLI command — so a narrower assertion below holds it to
// that role: it must NOT import resolveBinary and must NOT reach the obsidian CLI. The scan runs
// against the real src/** tree AND against synthetic samples (so the detector itself is proven to
// fire — "fails when a violating import is introduced" without mutating the tree).
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SPAWN_VALUE_NAMES = ["spawn", "spawnSync", "exec", "execFile"];

// The sanctioned spawn sites. _dispatch.ts spawns the obsidian CLI; app-launcher.ts spawns the
// per-OS `obsidian://` URI opener (BI-060, the second sanctioned spawn site). Any OTHER production
// file with a spawn value-import is a bypass and fails invariant (i).
const SPAWN_ALLOWLIST = new Set(["_dispatch.ts", "app-launcher.ts"]);

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

/**
 * Extract every `import … from "…"` statement as a whole statement, tolerant of prettier-style
 * multi-line wrapping (the clause may span newlines). The anchor `^[ \t]*import` (multiline flag)
 * keeps comments out — a `// import …` / ` * import …` line never begins with `import` — while the
 * newline-spanning clause closes the gap a per-physical-line scan left open: prettier wraps long
 * import lists across lines BY DEFAULT, so a line-based detector silently misses exactly the future
 * drift this guardrail exists to catch. Side-effect imports (`import "x"`, no `from`) bind nothing
 * and so cannot satisfy either detector. `clause` is the text between `import` and `from`;
 * `specifier` is the module path (unquoted).
 */
function extractImports(content: string): { clause: string; specifier: string }[] {
  const out: { clause: string; specifier: string }[] = [];
  const re = /^[ \t]*import\b([\s\S]*?)from\s*["']([^"']+)["']/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    out.push({ clause: match[1]!.trim(), specifier: match[2]! });
  }
  return out;
}

/** True iff `content` has a VALUE import of a spawn-family symbol from node:child_process. */
function hasChildProcessSpawnValueImport(content: string): boolean {
  for (const { clause, specifier } of extractImports(content)) {
    if (specifier !== "node:child_process") continue;
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

/** True iff `content` imports anything from a `binary-resolver` module (e.g. `resolveBinary`). */
function importsBinaryResolver(content: string): boolean {
  for (const { specifier } of extractImports(content)) {
    if (/binary-resolver(?:\.js)?$/.test(specifier)) return true;
  }
  return false;
}

/** True iff `content` imports the `dispatchCli` value binding from a `_dispatch` module. */
function importsDispatchCli(content: string): boolean {
  for (const { clause, specifier } of extractImports(content)) {
    if (!/_dispatch(?:\.js)?$/.test(specifier)) continue;
    const brace = clause.match(/\{([\s\S]*)\}/);
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

  it("(i) node:child_process spawn VALUE-imports live ONLY in the sanctioned spawn sites", () => {
    const offenders = files
      .filter((f) => !SPAWN_ALLOWLIST.has(f.base))
      .filter((f) => hasChildProcessSpawnValueImport(f.content))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("(i) _dispatch.ts is in fact a spawn-import site (the CLI spawn site)", () => {
    const dispatch = files.find((f) => f.base === "_dispatch.ts");
    expect(dispatch).toBeDefined();
    expect(hasChildProcessSpawnValueImport(dispatch!.content)).toBe(true);
  });

  // BI-060: app-launcher.ts is the SECOND sanctioned spawn site (the GUI-app launch via the
  // obsidian:// URI opener). It must in fact spawn, but it must NOT reach the obsidian CLI — the
  // narrower no-bypass assertion that preserves the ADR-029 D8 intent ("nothing reaches the CLI
  // without inheriting the retry") while admitting a distinct, app-launch-only spawn site.
  it("(i) app-launcher.ts is the second sanctioned spawn site (the obsidian:// URI opener)", () => {
    const launcher = files.find((f) => f.base === "app-launcher.ts");
    expect(launcher).toBeDefined();
    expect(hasChildProcessSpawnValueImport(launcher!.content)).toBe(true);
  });

  it("(i) app-launcher.ts does NOT import resolveBinary / the binary-resolver (no CLI bypass)", () => {
    const launcher = files.find((f) => f.base === "app-launcher.ts");
    expect(launcher).toBeDefined();
    expect(importsBinaryResolver(launcher!.content)).toBe(false);
  });

  it("(i) app-launcher.ts does NOT import dispatchCli (it is invoked by _dispatch, not the reverse)", () => {
    const launcher = files.find((f) => f.base === "app-launcher.ts");
    expect(launcher).toBeDefined();
    expect(importsDispatchCli(launcher!.content)).toBe(false);
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

  it("detects a binary-resolver import (synthetic — app-launcher no-CLI-bypass guard)", () => {
    expect(importsBinaryResolver('import { resolveBinary } from "../binary-resolver/binary-resolver.js";')).toBe(true);
    expect(importsBinaryResolver('import { resolveBinary, type ResolutionAttempt } from "../binary-resolver/binary-resolver.js";')).toBe(true);
    expect(importsBinaryResolver('import { spawn } from "node:child_process";')).toBe(false);
  });

  // F1 hardening: prettier wraps long import lists across lines BY DEFAULT, so a bypass would
  // most plausibly arrive multi-line. The detector MUST see a statement whose bindings span
  // newlines — a per-physical-line scan missed these, and the single-line self-tests above could
  // never surface that gap.
  it("detects prettier-wrapped multi-line bypass imports (synthetic)", () => {
    expect(
      hasChildProcessSpawnValueImport(
        ["import {", "  spawn,", "  type ChildProcess,", '} from "node:child_process";'].join("\n"),
      ),
    ).toBe(true);
    expect(
      importsDispatchCli(
        ["import {", "  dispatchCli,", "  type DispatchInput,", '} from "./_dispatch.js";'].join("\n"),
      ),
    ).toBe(true);
  });

  it("does NOT flag a wrapped type-only child_process import (synthetic)", () => {
    expect(
      hasChildProcessSpawnValueImport(
        ["import type {", "  SpawnOptions,", "  ChildProcess,", '} from "node:child_process";'].join("\n"),
      ),
    ).toBe(false);
  });

  it("does NOT treat `import` inside a comment as a real import (synthetic)", () => {
    expect(hasChildProcessSpawnValueImport('// import { spawn } from "node:child_process";')).toBe(false);
    expect(importsDispatchCli(' * import { dispatchCli } from "./_dispatch.js";')).toBe(false);
  });
});
