// Original — no upstream. find_and_replace handler per ADR-009 / US1+US2+US3+US4 — direct-fs scan + write; vault resolution via injected registry OR one bug-safe FOCUSED_VAULT_TEMPLATE eval round-trip when input.vault is absent (parity with write_note's FOCUSED_FILE_TEMPLATE); two-layer path safety on vault root + per-note locator; region-aware line-scoped scan with fence + html-comment skip by default; preview returns deterministic per-occurrence envelope; commit re-scans (drift compare), re-checks the OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES bound, and performs per-note temp+rename writes serialized through the injected Queue; FS read failures surface as FS_WRITE_FAILED + details.reason:"read" with no partial flag; write failures surface as FS_WRITE_FAILED + details.reason:"write" with the partial-commit envelope inlined in details.
import { randomUUID as nodeRandomUUID } from "node:crypto";
import * as nodeFs from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import { scanFencedCodeBlocks, type Region } from "./fence-scan.js";
import { scanHtmlComments } from "./region-scan.js";
import {
  applyReplacement,
  compileFindRegex,
  iterateLineMatches,
} from "./replace.js";
import {
  FULL_LINE_CAP,
  FULL_LINE_ELLIPSIS,
  type FindAndReplaceAffectedNote,
  type FindAndReplaceInput,
  type FindAndReplaceOccurrence,
  type FindAndReplaceOutput,
} from "./schema.js";
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import {
  assertCanonicalPath,
  FOCUSED_VAULT_TEMPLATE,
  parseFocusedVault,
  resolveActiveFocusedFile,
  resolveFileByTsv,
  resolveVaultDisplayName,
  resolveVaultRootOrRemap,
} from "../_active-file.js";
import { writeAtomic } from "../_note-io.js";


import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";
import type { VaultRegistry } from "../../vault-registry/registry.js";
import type { Dirent } from "node:fs";

export interface ExecuteFs {
  readdir: (
    p: string,
    opts: { recursive: true; withFileTypes: true },
  ) => Promise<Dirent[]>;
  readFile: (p: string, encoding: "utf8") => Promise<string>;
  writeFile: (p: string, content: string) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  unlink: (p: string) => Promise<void>;
  realpath: (p: string) => Promise<string>;
}

export interface FocusedVaultResponse {
  /** Active file vault-relative path (unused by find_and_replace, kept for parity). */
  path: string | null;
  /** Absolute filesystem path of the focused vault root. */
  base: string;
}

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  vaultRegistry: VaultRegistry;
  fs?: ExecuteFs;
  randomUUID?: () => string;
  /** When absent, defaults to a wrapped `obsidian eval` against FOCUSED_VAULT_TEMPLATE. */
  invokeEval?: () => Promise<FocusedVaultResponse>;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
  /** Optional warn sink for operational diagnostics (env-var fallback, etc.). Defaults to stderr JSON-line. */
  warn?: (event: string, ctx: Record<string, unknown>) => void;
}

const DEFAULT_FS: ExecuteFs = {
  readdir: (p, opts) => nodeFs.readdir(p, opts) as Promise<Dirent[]>,
  readFile: (p, encoding) => nodeFs.readFile(p, encoding),
  writeFile: (p, content) => nodeFs.writeFile(p, content),
  rename: (from, to) => nodeFs.rename(from, to),
  unlink: (p) => nodeFs.unlink(p),
  realpath: (p) => nodeFs.realpath(p),
};

const DEFAULT_MAX_OCCURRENCES = 500;
const MAX_OCCURRENCES_ENV_VAR = "OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES";

let cachedMaxOccurrences: number | null = null;

/** Test-only reset hook so vitest can exercise the lazy env-var path multiple times. */
export function __resetMaxOccurrencesCacheForTests(): void {
  cachedMaxOccurrences = null;
}

export function getMaxOccurrences(deps: ExecuteDeps): number {
  if (cachedMaxOccurrences !== null) return cachedMaxOccurrences;
  const env = deps.env ?? process.env;
  const raw = env[MAX_OCCURRENCES_ENV_VAR];
  if (raw === undefined || raw === "") {
    cachedMaxOccurrences = DEFAULT_MAX_OCCURRENCES;
    return cachedMaxOccurrences;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || String(parsed) !== raw.trim()) {
    emitWarn(deps, "find_and_replace.bound.fallback", {
      env_var: MAX_OCCURRENCES_ENV_VAR,
      provided: raw,
      fallback: DEFAULT_MAX_OCCURRENCES,
    });
    cachedMaxOccurrences = DEFAULT_MAX_OCCURRENCES;
    return cachedMaxOccurrences;
  }
  cachedMaxOccurrences = parsed;
  return cachedMaxOccurrences;
}

function emitWarn(
  deps: ExecuteDeps,
  event: string,
  ctx: Record<string, unknown>,
): void {
  if (deps.warn) {
    deps.warn(event, ctx);
    return;
  }
  // Default sink: JSON-line to stderr at WARN level for operator visibility.
  process.stderr.write(
    JSON.stringify({
      event,
      level: "warn",
      ts: new Date().toISOString(),
      ...ctx,
    }) + "\n",
  );
}

interface LineSpan {
  lineNumber: number;
  startOffset: number;
  content: string;
  endingBytes: string;
}

interface ScanCounts {
  totalOccurrences: number;
  /** Vault-relative path → per-occurrence list (already region-filtered, zero-width-skipped). */
  perNote: Map<string, FindAndReplaceOccurrence[]>;
  /** Same keys as `perNote`; carries the rewritten note content for the commit-path. */
  rewrittenContent: Map<string, string>;
}

function splitIntoLineSpans(source: string): LineSpan[] {
  const spans: LineSpan[] = [];
  const len = source.length;
  let i = 0;
  let lineNumber = 1;
  while (i < len) {
    const start = i;
    const nl = source.indexOf("\n", i);
    if (nl === -1) {
      // Trailing content with no closing newline — emit final span with empty ending.
      spans.push({
        lineNumber,
        startOffset: start,
        content: source.slice(start),
        endingBytes: "",
      });
      return spans;
    }
    const isCrlf = nl > start && source.charCodeAt(nl - 1) === 13;
    const endingBytes = isCrlf ? "\r\n" : "\n";
    const contentEnd = isCrlf ? nl - 1 : nl;
    spans.push({
      lineNumber,
      startOffset: start,
      content: source.slice(start, contentEnd),
      endingBytes,
    });
    i = nl + 1;
    lineNumber++;
  }
  return spans;
}

function isInsideAnyRegion(offset: number, regions: Region[]): boolean {
  for (const r of regions) {
    if (offset >= r.startOffset && offset < r.endOffset) return true;
  }
  return false;
}

function clipFullLine(content: string): string {
  const stripped = content.endsWith("\r") ? content.slice(0, -1) : content;
  if (stripped.length <= FULL_LINE_CAP) return stripped;
  return stripped.slice(0, FULL_LINE_CAP) + FULL_LINE_ELLIPSIS;
}

async function defaultInvokeEval(
  deps: ExecuteDeps,
): Promise<FocusedVaultResponse> {
  const result = await invokeCli(
    {
      command: "eval",
      parameters: { code: FOCUSED_VAULT_TEMPLATE },
      flags: [],
      target_mode: "active",
    },
    {
      spawnFn: deps.spawnFn,
      env: deps.env,
      logger: deps.logger,
      queue: deps.queue,
    },
  );
  // Shared double-decode + shape-check; find_and_replace keeps the json-parse /
  // envelope-parse stage distinction (and the cause) the helper surfaces.
  const out = parseFocusedVault(result.stdout);
  if (!out.ok) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: out.cause,
      details: { stage: out.stage, stdout: result.stdout.slice(0, 500) },
      message: "find_and_replace: focused-vault eval returned unparseable response",
    });
  }
  return out.parsed;
}

async function resolveVaultRoot(
  input: FindAndReplaceInput,
  deps: ExecuteDeps,
): Promise<string> {
  if (input.vault !== undefined) {
    // The registry surfaces unknown-vault via its own UpstreamError shape; the helper
    // re-throws it with the spec-mandated VAULT_NOT_FOUND/unknown triple per FR-013.
    return resolveVaultRootOrRemap(deps.vaultRegistry, input.vault, "find_and_replace");
  }
  const invokeEval = deps.invokeEval ?? (() => defaultInvokeEval(deps));
  const focused = await invokeEval();
  return focused.base;
}

function hasDotPrefixedSegment(relPath: string): boolean {
  if (relPath.length === 0) return false;
  const segments = relPath.split(/[/\\]/);
  return segments.some((s) => s.startsWith("."));
}

async function listEligibleNotes(
  scanRoot: string,
  vaultRoot: string,
  fs: ExecuteFs,
): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(scanRoot, { recursive: true, withFileTypes: true });
  } catch (err) {
    throw mapFsError(err, "read", null, null);
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".md")) continue;
    const parentPath = (entry as Dirent & { parentPath?: string }).parentPath
      ?? (entry as Dirent & { path?: string }).path
      ?? scanRoot;
    const absParent = resolve(parentPath);
    const relFromScanRoot = relative(scanRoot, absParent);
    if (relFromScanRoot.length > 0 && hasDotPrefixedSegment(relFromScanRoot)) continue;
    const abs = resolve(absParent, entry.name);
    const rel = relative(vaultRoot, abs).split(sep).join("/");
    out.push(rel);
  }
  out.sort();
  return out;
}

function mapFsError(
  err: unknown,
  reason: "read" | "write",
  notePath: string | null,
  vault: string | null,
): UpstreamError {
  const errno = (err as NodeJS.ErrnoException | null)?.code ?? "UNKNOWN";
  const syscall = (err as NodeJS.ErrnoException | null)?.syscall;
  const details: Record<string, unknown> = { reason, errno };
  if (syscall) details.syscall = syscall;
  if (notePath !== null) details.path = notePath;
  if (vault !== null) details.vault = vault;
  return new UpstreamError({
    code: "FS_WRITE_FAILED",
    cause: err,
    details,
    message: `find_and_replace: filesystem ${reason} failed: ${errno}`,
  });
}

interface ScanResult {
  counts: ScanCounts;
}

async function scanNotes(
  vaultRoot: string,
  noteRelPaths: string[],
  input: FindAndReplaceInput,
  fs: ExecuteFs,
  vaultLabel: string | null,
): Promise<ScanResult> {
  const regex = compileFindRegex(input.pattern, input.mode, input.case_insensitive);
  const perNote = new Map<string, FindAndReplaceOccurrence[]>();
  const rewrittenContent = new Map<string, string>();
  let total = 0;
  for (const rel of noteRelPaths) {
    const abs = resolve(vaultRoot, rel.split("/").join(sep));
    let source: string;
    try {
      source = await fs.readFile(abs, "utf8");
    } catch (err) {
      throw mapFsError(err, "read", rel, vaultLabel);
    }
    const skipRegions: Region[] = [];
    if (input.include_code_blocks !== true) {
      skipRegions.push(...scanFencedCodeBlocks(source));
    }
    if (input.include_html_comments !== true) {
      skipRegions.push(...scanHtmlComments(source));
    }
    const spans = splitIntoLineSpans(source);
    const occurrences: FindAndReplaceOccurrence[] = [];
    // Build replacement parts: collect [absoluteIndex, endIndex, replacement] tuples in order.
    const replacements: Array<{ start: number; end: number; insert: string }> = [];
    for (const span of spans) {
      for (const match of iterateLineMatches(span.content, regex, span.startOffset)) {
        if (isInsideAnyRegion(match.index, skipRegions)) continue;
        const replacementText = applyReplacement(
          match.matchedSubstring,
          regex,
          input.replacement,
          input.mode,
        );
        occurrences.push({
          line_number: span.lineNumber,
          full_line: clipFullLine(span.content),
          matched_substring: match.matchedSubstring,
          replacement_substring: replacementText,
        });
        replacements.push({
          start: match.index,
          end: match.endIndex,
          insert: replacementText,
        });
      }
    }
    if (occurrences.length === 0) continue;
    perNote.set(rel, occurrences);
    total += occurrences.length;
    rewrittenContent.set(rel, applyReplacements(source, replacements));
  }
  return { counts: { totalOccurrences: total, perNote, rewrittenContent } };
}

function applyReplacements(
  source: string,
  replacements: Array<{ start: number; end: number; insert: string }>,
): string {
  if (replacements.length === 0) return source;
  // Replacements are emitted in ascending-offset order by scanNotes — verify
  // defensively and stitch the rewritten content together.
  const out: string[] = [];
  let cursor = 0;
  for (const r of replacements) {
    if (r.start < cursor) {
      throw new Error(
        "find_and_replace: internal — overlapping replacements detected",
      );
    }
    out.push(source.slice(cursor, r.start));
    out.push(r.insert);
    cursor = r.end;
  }
  out.push(source.slice(cursor));
  return out.join("");
}

function sortedAffectedNotes(
  counts: ScanCounts,
): FindAndReplaceAffectedNote[] {
  const keys = [...counts.perNote.keys()].sort();
  return keys.map((path) => ({
    path,
    occurrence_count: counts.perNote.get(path)!.length,
    occurrences: counts.perNote.get(path)!,
  }));
}

/**
 * Internal scope-resolution result (066-file-scope). The seam between the
 * front-end scope resolver and the unchanged downstream Stages 4–7.
 * `eligible` is the vault-relative note list to scan: exactly `[relPath]` under
 * a single-note scope, the directory-walk result otherwise. `singleNote` gates
 * the commit re-scan: a single-note scope re-reads the fixed list (no re-walk),
 * a folder/vault-wide scope re-walks (D8).
 */
interface ResolvedScope {
  vaultRoot: string;
  eligible: string[];
  singleNote: boolean;
  /** Commit-time second-scan note-list source (drift re-scan). */
  rescan: () => Promise<string[]>;
}

/** Normalise a vault-relative path to forward-slash form (downstream stages expect it). */
function toVaultRelative(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Eligibility check for an explicitly-targeted single note: `.md` (case-insensitive)
 * AND no `.`-prefixed path segment. An ineligible explicit target is a hard error
 * (never a silent empty result) — VALIDATION_ERROR + INVALID_NOTE/not-eligible (FR-012).
 */
function assertEligible(relPath: string): void {
  const ok = relPath.toLowerCase().endsWith(".md") && !hasDotPrefixedSegment(relPath);
  if (!ok) {
    throw new UpstreamError({
      code: "VALIDATION_ERROR",
      cause: null,
      details: { code: "INVALID_NOTE", reason: "not-eligible", note: relPath },
      message: `find_and_replace: target "${relPath}" is not an eligible markdown note`,
    });
  }
}

/**
 * Existence check for an explicitly-targeted single note. assertCanonicalPath
 * tolerates a non-existent path (lexical fallback), so a dedicated realpath probe
 * distinguishes missing → VALIDATION_ERROR + INVALID_NOTE/not-found (FR-008),
 * parity with the INVALID_SUBFOLDER/not-found shape. Runs before any content read.
 */
async function assertExists(
  vaultRoot: string,
  relPath: string,
  fs: ExecuteFs,
): Promise<void> {
  const abs = resolve(vaultRoot, relPath.split("/").join(sep));
  try {
    await fs.realpath(abs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      throw new UpstreamError({
        code: "VALIDATION_ERROR",
        cause: err,
        details: { code: "INVALID_NOTE", reason: "not-found", note: relPath },
        message: `find_and_replace: note "${relPath}" does not exist in vault`,
      });
    }
    throw err;
  }
}

/**
 * Single-note scope front end (066-file-scope). Three forks each resolve one
 * `{ vaultRoot, relPath }`, then share the canonical-escape guard + eligibility +
 * existence checks before emitting `eligible = [relPath]`:
 * - `active_note` → resolveActiveFocusedFile (throws ERR_NO_ACTIVE_FILE when none open);
 * - `path` → existing vault-root resolve + the given vault-relative path;
 * - `file` → existing vault-root resolve + resolveFileByTsv (shortest-unique-name parity).
 */
async function resolveSingleNoteScope(
  input: FindAndReplaceInput,
  deps: ExecuteDeps,
  fs: ExecuteFs,
  vaultLabel: string | null,
): Promise<ResolvedScope> {
  const guard = { realpath: fs.realpath, logger: deps.logger, vaultLabel };
  let vaultRoot: string;
  let relPath: string;

  if (input.active_note === true) {
    // US2 — the currently-open note.
    const active = await resolveActiveFocusedFile(deps, "find_and_replace");
    vaultRoot = await assertCanonicalPath(active.vaultRoot, ".", guard);
    relPath = toVaultRelative(active.relPath);
  } else {
    // US1 — a named single note (path or file; mutually exclusive per superRefine).
    vaultRoot = await assertCanonicalPath(await resolveVaultRoot(input, deps), ".", guard);
    if (input.path !== undefined) {
      relPath = toVaultRelative(input.path);
    } else {
      // input.file is defined (the dispatch fires only when one locator is set).
      const vaultName = input.vault ?? resolveVaultDisplayName(deps.vaultRegistry, vaultRoot);
      relPath = toVaultRelative(
        await resolveFileByTsv(deps, vaultName, input.file as string, "find_and_replace"),
      );
    }
  }

  // Shared tail — Layer-2 canonical escape guard, then eligibility + existence,
  // all before any content read (FR-006 / FR-008 / FR-012 / FR-013).
  await assertCanonicalPath(vaultRoot, relPath.split("/").join(sep), {
    ...guard,
    attemptedPathLabel: relPath,
  });
  assertEligible(relPath);
  await assertExists(vaultRoot, relPath, fs);

  return {
    vaultRoot,
    eligible: [relPath],
    singleNote: true,
    rescan: () => Promise.resolve([relPath]),
  };
}

/**
 * Front-end scope dispatch. Any of `file` / `path` / `active_note` routes to the
 * single-note resolver; otherwise the unchanged subfolder / vault-wide resolve-and-walk.
 */
async function resolveScope(
  input: FindAndReplaceInput,
  deps: ExecuteDeps,
  fs: ExecuteFs,
  vaultLabel: string | null,
): Promise<ResolvedScope> {
  if (
    input.active_note === true ||
    input.file !== undefined ||
    input.path !== undefined
  ) {
    return resolveSingleNoteScope(input, deps, fs, vaultLabel);
  }

  // === UNCHANGED — vault root resolution + Layer-2 canonical check on vault root ===
  const vaultRootRaw = await resolveVaultRoot(input, deps);
  const vaultRoot = await assertCanonicalPath(vaultRootRaw, ".", {
    realpath: fs.realpath,
    logger: deps.logger,
    vaultLabel,
  });

  // === UNCHANGED — subfolder OR whole-vault scope resolution ===
  let scanRoot = vaultRoot;
  const subfolder = input.subfolder !== undefined && input.subfolder.length > 0
    ? input.subfolder
    : null;
  if (subfolder !== null) {
    const subResolved = await assertCanonicalPath(vaultRoot, subfolder, {
      realpath: fs.realpath,
      logger: deps.logger,
      vaultLabel,
    });
    // Verify the subfolder exists — checkCanonicalPath returns ok with the
    // lexical fallback when the path does not exist; we need to distinguish.
    try {
      await fs.realpath(subResolved);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
        throw new UpstreamError({
          code: "VALIDATION_ERROR",
          cause: err,
          details: {
            code: "INVALID_SUBFOLDER",
            reason: "not-found",
            subfolder,
            vault: vaultLabel,
          },
          message: `find_and_replace: subfolder "${subfolder}" does not exist in vault`,
        });
      }
      throw err;
    }
    scanRoot = subResolved;
  }

  // === UNCHANGED — directory walk ===
  const eligible = await listEligibleNotes(scanRoot, vaultRoot, fs);
  return {
    vaultRoot,
    eligible,
    singleNote: false,
    rescan: () => listEligibleNotes(scanRoot, vaultRoot, fs),
  };
}

export async function executeFindAndReplace(
  input: FindAndReplaceInput,
  deps: ExecuteDeps,
): Promise<FindAndReplaceOutput> {
  const fs = deps.fs ?? DEFAULT_FS;
  const randomUUIDFn = deps.randomUUID ?? nodeRandomUUID;
  const vaultLabel = input.vault ?? null;

  // === Stages 1–3 — scope resolution (single-note OR subfolder / vault-wide) ===
  const scope = await resolveScope(input, deps, fs, vaultLabel);
  const { vaultRoot, eligible } = scope;

  // === Stage 4 — first scan ===
  const firstScan = await scanNotes(
    vaultRoot,
    eligible,
    input,
    fs,
    vaultLabel,
  );

  // === Stage 5 — bound check on first scan ===
  const bound = getMaxOccurrences(deps);
  if (firstScan.counts.totalOccurrences > bound) {
    throw new UpstreamError({
      code: "VALIDATION_ERROR",
      cause: null,
      details: {
        code: "OCCURRENCE_COUNT_EXCEEDED",
        bound,
        count: firstScan.counts.totalOccurrences,
        env_var: MAX_OCCURRENCES_ENV_VAR,
      },
      message: `find_and_replace: occurrence count ${firstScan.counts.totalOccurrences} exceeds configured upper bound of ${bound}`,
    });
  }

  // === Branch on input.commit ===
  if (input.commit !== true) {
    return {
      mode: "preview",
      affected_notes: sortedAffectedNotes(firstScan.counts),
      total_occurrences: firstScan.counts.totalOccurrences,
    };
  }

  // === Stage 6 — commit path: re-scan for drift compare. Folder/vault-wide
  // re-walks the scan root; a single-note scope re-reads the fixed [relPath]
  // (nothing to re-walk) — D8. Both still catch a between-scan content edit.
  const secondEligible = await scope.rescan();
  const secondScan = await scanNotes(
    vaultRoot,
    secondEligible,
    input,
    fs,
    vaultLabel,
  );

  // bound recheck on second scan per FR-012(a)
  if (secondScan.counts.totalOccurrences > bound) {
    throw new UpstreamError({
      code: "VALIDATION_ERROR",
      cause: null,
      details: {
        code: "OCCURRENCE_COUNT_EXCEEDED",
        bound,
        count: secondScan.counts.totalOccurrences,
        env_var: MAX_OCCURRENCES_ENV_VAR,
      },
      message: `find_and_replace: occurrence count ${secondScan.counts.totalOccurrences} exceeds configured upper bound of ${bound}`,
    });
  }

  if (firstScan.counts.totalOccurrences !== secondScan.counts.totalOccurrences) {
    throw new UpstreamError({
      code: "VALIDATION_ERROR",
      cause: null,
      details: {
        code: "OCCURRENCE_COUNT_DRIFT",
        preview_count: firstScan.counts.totalOccurrences,
        commit_count: secondScan.counts.totalOccurrences,
      },
      message: `find_and_replace: vault content changed between preview-time and commit-time scans (count ${firstScan.counts.totalOccurrences} → ${secondScan.counts.totalOccurrences})`,
    });
  }

  // === Stage 7 — per-note writes through the queue ===
  const orderedRelPaths = [...secondScan.counts.perNote.keys()].sort();
  const changedNotes: string[] = [];
  let occurrencesReplaced = 0;
  for (const rel of orderedRelPaths) {
    const absPath = await assertCanonicalPath(vaultRoot, rel.split("/").join(sep), {
      realpath: fs.realpath,
      logger: deps.logger,
      vaultLabel,
      attemptedPathLabel: rel,
    });
    const newContent = secondScan.counts.rewrittenContent.get(rel)!;
    const occurrenceCount = secondScan.counts.perNote.get(rel)!.length;
    try {
      // Per-note atomic write through the injected queue (serialised); the shared
      // writeAtomic substrate computes the tmp path inside the critical section.
      await deps.queue.run(() => writeAtomic(fs, absPath, newContent, randomUUIDFn));
    } catch (err) {
      const fsErr = mapFsError(err, "write", rel, vaultLabel);
      fsErr.details.changed_notes = changedNotes;
      fsErr.details.total_occurrences_replaced = occurrencesReplaced;
      fsErr.details.failing_note_locator = rel;
      fsErr.details.partial = true;
      throw fsErr;
    }
    changedNotes.push(rel);
    occurrencesReplaced += occurrenceCount;
  }

  return {
    mode: "commit",
    changed_notes: changedNotes,
    total_occurrences_replaced: occurrencesReplaced,
    partial: false,
  };
}
