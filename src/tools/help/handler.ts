// Original — no upstream. help tool handler: directory check, path resolution, traversal defense, file read (FR-008..FR-011, P4 + L1a guard).
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { UpstreamError } from "../../errors.js";

import type { HelpInput } from "./schema.js";

/**
 * Resolved absolute path of the bundled `docs/tools/` directory. Anchored to
 * `import.meta.url` per FR-009 — the tool works regardless of the MCP server
 * process's current working directory.
 *
 * At runtime under tsx/vitest the source files are loaded directly, so
 * `import.meta.url` points at `<repo>/src/tools/help/handler.ts` and the
 * relative `../../../docs/tools` resolves to `<repo>/docs/tools`. Under the
 * compiled `dist/` layout it points at `<package>/dist/tools/help/handler.js`
 * and the same relative resolves to `<package>/docs/tools` because npm pack
 * places `dist/` and `docs/` as siblings under the package root.
 */
export const DOCS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs", "tools");

export type HelpResult = { content: Array<{ type: "text"; text: string }> };

/**
 * Per-help-call dependencies. Defaults bind to the real bundled docs directory.
 * Tests inject `docsDir` to point at a fixture directory or to simulate the
 * directory-missing case (Q4 → HELP_DOCS_MISSING).
 */
export interface HelpDeps {
  docsDir?: string;
}

export async function executeHelp(input: HelpInput, deps: HelpDeps = {}): Promise<HelpResult> {
  const docsDir = deps.docsDir ?? DOCS_DIR;

  // (a) Directory existence check (FR-008 fourth bullet, Clarification Q4 → HELP_DOCS_MISSING).
  try {
    await access(docsDir);
  } catch (cause) {
    const ioCode = (cause as NodeJS.ErrnoException | undefined)?.code;
    throw new UpstreamError({
      code: "HELP_DOCS_MISSING",
      cause,
      details: { resolvedDocsDir: docsDir, ...(ioCode ? { ioCode } : {}) },
      message: `docs/tools/ directory missing or unreadable at ${docsDir}`,
    });
  }

  // (b) Empty input → return index.md.
  const name = input.tool_name;
  if (name === undefined) {
    const text = await readFile(join(docsDir, "index.md"), "utf8");
    return { content: [{ type: "text", text }] };
  }

  // (c) Reserved-name guard (remediation L1a, Edge Case help({ tool_name: "index" })).
  // index.md is the listing page reached via the no-argument call; calling with
  // tool_name === "index" would erroneously return its content without this guard.
  if (name === "index") throw await notFound(name, docsDir);

  // (d) Path-traversal defense (FR-010, plan-stage P4): NUL bytes, then resolve+relative checks.
  if (name.includes("\0")) throw await notFound(name, docsDir);
  const candidate = resolve(docsDir, `${name}.md`);
  const rel = relative(docsDir, candidate);
  if (rel === "" || rel.startsWith("..") || rel.includes(sep)) {
    throw await notFound(name, docsDir);
  }

  // (e) File read.
  try {
    const text = await readFile(candidate, "utf8");
    return { content: [{ type: "text", text }] };
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") throw await notFound(name, docsDir);
    throw cause; // unexpected I/O error — let it bubble (Principle IV non-recovery path).
  }
}

async function notFound(requestedName: string, docsDir: string): Promise<UpstreamError> {
  let entries: string[];
  try {
    entries = await readdir(docsDir);
  } catch {
    entries = [];
  }
  const availableTools = entries
    .filter((f) => f.endsWith(".md") && f !== "index.md")
    .map((f) => f.slice(0, -".md".length))
    .sort();
  return new UpstreamError({
    code: "HELP_TOOL_NOT_FOUND",
    cause: null,
    details: { requestedName, availableTools },
    message: `No documentation file for the requested tool. Available tools: ${availableTools.join(", ")}.`,
  });
}
