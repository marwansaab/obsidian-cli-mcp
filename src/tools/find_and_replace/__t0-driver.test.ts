// Original — no upstream. T0 live-FS driver — exercises quickstart.md scenarios against the authorised test vault under Sandbox/038-find-replace-t0/. Writes capture markdown to specs/038-find-replace/t0-capture/. Excluded from the default vitest run via the `T0_LIVE=1` gate so it doesn't fire on every developer machine — only when the operator opts in (T0 gate per CLAUDE.md `## Test Execution`).
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as nodeFsPromises from "node:fs/promises";
import { stat as statAsync, writeFile as writeFileAsync } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { executeFindAndReplace } from "./handler.js";
import { createQueue } from "../../queue.js";
import { createVaultRegistry } from "../../vault-registry/registry.js";
import { silentLogger } from "../_handler-test-fixtures.js";

const T0_ENABLED = process.env.T0_LIVE === "1";

const VAULT_NAME = "TestVault-Obsidian-CLI-MCP";
const VAULT_ROOT = "C:\\Marwan-Saab-ADO\\Marwan at Metcash\\Obsidian\\TestVault-Obsidian-CLI-MCP";
const SANDBOX_REL = "Sandbox/038-find-replace-t0";
const SANDBOX_ABS = resolve(VAULT_ROOT, "Sandbox", "038-find-replace-t0");
const CAPTURE_DIR = resolve(import.meta.dirname, "..", "..", "..", "specs", "038-find-replace", "t0-capture");

function realVaultRegistry() {
  return createVaultRegistry({
    invokeProbe: async () => {
      const r = spawnSync("obsidian", ["vaults", "verbose"], { encoding: "utf8" });
      if (r.status !== 0) throw new Error(`obsidian vaults verbose exited ${r.status}: ${r.stderr}`);
      return r.stdout;
    },
  });
}

interface CaptureRecord {
  scenario: string;
  request: unknown;
  response?: unknown;
  error?: { code: string; message: string; details: unknown };
  invariants: Array<{ description: string; pass: boolean }>;
  pass: boolean;
}

function writeCapture(scenarioNum: number, rec: CaptureRecord): void {
  mkdirSync(CAPTURE_DIR, { recursive: true });
  const status = rec.pass ? "PASS" : "FAIL";
  const lines: string[] = [];
  lines.push(`# T0 Scenario ${scenarioNum} — ${rec.scenario}`);
  lines.push("");
  lines.push(`**Status**: ${status}`);
  lines.push(`**Vault**: ${VAULT_NAME}`);
  lines.push(`**Scratch root**: \`${SANDBOX_REL}/\``);
  lines.push("");
  lines.push("## Request");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(rec.request, null, 2));
  lines.push("```");
  lines.push("");
  if (rec.response !== undefined) {
    lines.push("## Response");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(rec.response, null, 2));
    lines.push("```");
  }
  if (rec.error !== undefined) {
    lines.push("## Error envelope");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(rec.error, null, 2));
    lines.push("```");
  }
  lines.push("");
  lines.push("## Invariants");
  lines.push("");
  for (const inv of rec.invariants) {
    lines.push(`- ${inv.pass ? "[x]" : "[ ]"} ${inv.description}`);
  }
  lines.push("");
  writeFileSync(resolve(CAPTURE_DIR, `scenario-${scenarioNum}.md`), lines.join("\n"), "utf8");
}

function seedFixture(rel: string, content: string): string {
  const abs = resolve(SANDBOX_ABS, rel);
  mkdirSync(resolve(abs, ".."), { recursive: true });
  writeFileSync(abs, content, "utf8");
  return abs;
}

async function getMtimeMs(abs: string): Promise<number> {
  const s = await statAsync(abs);
  return s.mtimeMs;
}

const baseDeps = () => ({
  logger: silentLogger(),
  queue: createQueue(),
  vaultRegistry: realVaultRegistry(),
  env: {},
});

// Each scenario also cleans up after itself unless the test fails (residue
// helps post-mortem). Use a unique-per-run prefix to avoid concurrent collisions
// — `038-find-replace-t0` is the run-id.

(T0_ENABLED ? describe : describe.skip)("T0 live-FS — find_and_replace against TestVault Sandbox/038-find-replace-t0", () => {
  it("Scenario 1 — preview → commit round-trip (ADR rename)", async () => {
    rmSync(SANDBOX_ABS, { recursive: true, force: true });
    const aAbs = seedFixture(
      "Decisions/ADR-0042 - Old Decision.md",
      "Lead: ADR-0042 prior context.\nSecond ref ADR-0042.\nThird ADR-0042 here.",
    );
    const bAbs = seedFixture("Inbox/notes/wiki.md", "[[ADR-0042]] rename target");
    const cAbs = seedFixture("Archive/2024/r.md", "Some ADR-0042 occurrence.");
    const mtimeA0 = await getMtimeMs(aAbs);
    const mtimeB0 = await getMtimeMs(bAbs);
    const mtimeC0 = await getMtimeMs(cAbs);

    const request1 = {
      pattern: "ADR-0042",
      replacement: "ADR-0089",
      mode: "literal" as const,
      vault: VAULT_NAME,
      subfolder: SANDBOX_REL,
      case_insensitive: false,
      include_code_blocks: false,
      include_html_comments: false,
      commit: false,
    };
    const preview = await executeFindAndReplace(request1, baseDeps());
    expect(preview.mode).toBe("preview");
    const mtimeA1 = await getMtimeMs(aAbs);
    const mtimeB1 = await getMtimeMs(bAbs);
    const mtimeC1 = await getMtimeMs(cAbs);

    const inv1 = [
      { description: "preview mode response", pass: preview.mode === "preview" },
      { description: "total_occurrences === 5", pass: preview.mode === "preview" && preview.total_occurrences === 5 },
      { description: "affected_notes.length === 3", pass: preview.mode === "preview" && preview.affected_notes.length === 3 },
      { description: "mtime of A unchanged", pass: mtimeA0 === mtimeA1 },
      { description: "mtime of B unchanged", pass: mtimeB0 === mtimeB1 },
      { description: "mtime of C unchanged", pass: mtimeC0 === mtimeC1 },
    ];

    const request2 = { ...request1, commit: true };
    const commit = await executeFindAndReplace(request2, baseDeps());
    expect(commit.mode).toBe("commit");
    const afterA = readFileSync(aAbs, "utf8");
    const afterB = readFileSync(bAbs, "utf8");
    const afterC = readFileSync(cAbs, "utf8");
    inv1.push(
      { description: "commit mode response", pass: commit.mode === "commit" },
      { description: "partial === false", pass: commit.mode === "commit" && commit.partial === false },
      { description: "total_occurrences_replaced === 5", pass: commit.mode === "commit" && commit.total_occurrences_replaced === 5 },
      { description: "A.md rewritten without ADR-0042", pass: !afterA.includes("ADR-0042") && afterA.includes("ADR-0089") },
      { description: "B.md rewritten", pass: afterB === "[[ADR-0089]] rename target" },
      { description: "C.md rewritten", pass: afterC === "Some ADR-0089 occurrence." },
    );

    const rec: CaptureRecord = {
      scenario: "Preview → commit round-trip (ADR rename)",
      request: request1,
      response: { preview, commit },
      invariants: inv1,
      pass: inv1.every((x) => x.pass),
    };
    writeCapture(1, rec);
    expect(rec.pass).toBe(true);
    rmSync(SANDBOX_ABS, { recursive: true, force: true });
  });

  it("Scenario 2 — code-block + HTML-comment skip defaults", async () => {
    rmSync(SANDBOX_ABS, { recursive: true, force: true });
    const noteAbs = seedFixture(
      "mixed.md",
      [
        "Line 1: OldName in prose",
        "Line 2:",
        "```",
        "Line 4: OldName inside fence",
        "```",
        "Line 6: <!-- Line 6: OldName in comment -->",
      ].join("\n"),
    );
    const request = {
      pattern: "OldName",
      replacement: "NewName",
      mode: "literal" as const,
      vault: VAULT_NAME,
      subfolder: SANDBOX_REL,
      case_insensitive: false,
      include_code_blocks: false,
      include_html_comments: false,
      commit: false,
    };
    const r = await executeFindAndReplace(request, baseDeps());
    const inv = [
      { description: "preview mode", pass: r.mode === "preview" },
      { description: "total_occurrences === 1 (skips fence + comment)", pass: r.mode === "preview" && r.total_occurrences === 1 },
      { description: "single occurrence on line 1 (prose)", pass: r.mode === "preview" && r.affected_notes[0]?.occurrences[0]?.line_number === 1 },
    ];
    const rec: CaptureRecord = {
      scenario: "Code-block + HTML-comment skip defaults",
      request,
      response: r,
      invariants: inv,
      pass: inv.every((x) => x.pass),
    };
    writeCapture(2, rec);
    expect(rec.pass).toBe(true);
    rmSync(noteAbs);
    rmSync(SANDBOX_ABS, { recursive: true, force: true });
  });

  it("Scenario 3 — include_code_blocks opt-in", async () => {
    rmSync(SANDBOX_ABS, { recursive: true, force: true });
    const noteAbs = seedFixture(
      "mixed.md",
      [
        "Line 1: OldName in prose",
        "```",
        "Line 3: OldName inside fence",
        "```",
        "Line 5: <!-- OldName in comment -->",
      ].join("\n"),
    );
    const request = {
      pattern: "OldName",
      replacement: "NewName",
      mode: "literal" as const,
      vault: VAULT_NAME,
      subfolder: SANDBOX_REL,
      case_insensitive: false,
      include_code_blocks: true,
      include_html_comments: false,
      commit: false,
    };
    const r = await executeFindAndReplace(request, baseDeps());
    const inv = [
      { description: "preview mode", pass: r.mode === "preview" },
      { description: "total_occurrences === 2 (prose + fence; comment still skipped)", pass: r.mode === "preview" && r.total_occurrences === 2 },
    ];
    const rec: CaptureRecord = {
      scenario: "include_code_blocks opt-in",
      request,
      response: r,
      invariants: inv,
      pass: inv.every((x) => x.pass),
    };
    writeCapture(3, rec);
    expect(rec.pass).toBe(true);
    rmSync(noteAbs);
    rmSync(SANDBOX_ABS, { recursive: true, force: true });
  });

  it("Scenario 4 — subfolder scope narrows blast radius", async () => {
    rmSync(SANDBOX_ABS, { recursive: true, force: true });
    seedFixture("Decisions/A.md", "Some ADR-0042 here");
    seedFixture("Inbox/B.md", "ADR-0042 also here");
    const request = {
      pattern: "ADR-0042",
      replacement: "ADR-0089",
      mode: "literal" as const,
      vault: VAULT_NAME,
      subfolder: `${SANDBOX_REL}/Decisions`,
      case_insensitive: false,
      include_code_blocks: false,
      include_html_comments: false,
      commit: false,
    };
    const r = await executeFindAndReplace(request, baseDeps());
    const inv = [
      { description: "preview mode", pass: r.mode === "preview" },
      { description: "single affected note under Decisions/", pass: r.mode === "preview" && r.affected_notes.length === 1 },
      { description: "Inbox/B.md not in response", pass: r.mode === "preview" && !r.affected_notes.some((n) => n.path.includes("Inbox")) },
    ];
    const rec: CaptureRecord = {
      scenario: "Subfolder scope narrows blast radius",
      request,
      response: r,
      invariants: inv,
      pass: inv.every((x) => x.pass),
    };
    writeCapture(4, rec);
    expect(rec.pass).toBe(true);
    rmSync(SANDBOX_ABS, { recursive: true, force: true });
  });

  it("Scenario 5 — bound exceeded refusal", async () => {
    rmSync(SANDBOX_ABS, { recursive: true, force: true });
    seedFixture("over.md", "pat ".repeat(15));
    const request = {
      pattern: "pat",
      replacement: "rep",
      mode: "literal" as const,
      vault: VAULT_NAME,
      subfolder: SANDBOX_REL,
      case_insensitive: false,
      include_code_blocks: false,
      include_html_comments: false,
      commit: false,
    };
    const deps = {
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: realVaultRegistry(),
      env: { OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES: "10" },
    };
    // Force the cache to reset for the env variable to take effect.
    const { __resetMaxOccurrencesCacheForTests } = await import("./handler.js");
    __resetMaxOccurrencesCacheForTests();
    let captured: { code: string; message: string; details: unknown } | null = null;
    try {
      await executeFindAndReplace(request, deps);
    } catch (err) {
      captured = {
        code: (err as { code: string }).code,
        message: (err as Error).message,
        details: (err as { details: unknown }).details,
      };
    }
    const inv = [
      { description: "error thrown", pass: captured !== null },
      { description: "code === VALIDATION_ERROR", pass: captured?.code === "VALIDATION_ERROR" },
      { description: "details.code === OCCURRENCE_COUNT_EXCEEDED", pass: (captured?.details as { code: string } | undefined)?.code === "OCCURRENCE_COUNT_EXCEEDED" },
    ];
    const rec: CaptureRecord = {
      scenario: "Bound exceeded refusal",
      request,
      error: captured ?? undefined,
      invariants: inv,
      pass: inv.every((x) => x.pass),
    };
    writeCapture(5, rec);
    expect(rec.pass).toBe(true);
    rmSync(SANDBOX_ABS, { recursive: true, force: true });
    __resetMaxOccurrencesCacheForTests();
  });

  it("Scenario 6 — drift detection refuses stale commit", async () => {
    rmSync(SANDBOX_ABS, { recursive: true, force: true });
    const aAbs = seedFixture("a.md", "pat pat pat");
    const request = {
      pattern: "pat",
      replacement: "X",
      mode: "literal" as const,
      vault: VAULT_NAME,
      subfolder: SANDBOX_REL,
      case_insensitive: false,
      include_code_blocks: false,
      include_html_comments: false,
      commit: true,
    };
    // Inject a between-scans race by overriding readFile so the second invocation
    // returns extra occurrences. We can't realistically race the disk so we shim.
    const realDeps = baseDeps();
    let readCount = 0;
    const shimmedFs = {
      readdir: (p: string, opts: { recursive: true; withFileTypes: true }) =>
        nodeFsPromises.readdir(p, opts),
      readFile: async (p: string, enc: "utf8") => {
        readCount++;
        if (readCount > 1) return "pat pat pat pat"; // extra pat appears on second scan
        return nodeFsPromises.readFile(p, enc);
      },
      writeFile: async (p: string, c: string) => {
        await writeFileAsync(p, c);
      },
      rename: async (from: string, to: string) =>
        nodeFsPromises.rename(from, to),
      unlink: async (p: string) => nodeFsPromises.unlink(p),
      realpath: async (p: string) => nodeFsPromises.realpath(p),
    };
    let captured: { code: string; message: string; details: unknown } | null = null;
    try {
      await executeFindAndReplace(request, { ...realDeps, fs: shimmedFs as never });
    } catch (err) {
      captured = {
        code: (err as { code: string }).code,
        message: (err as Error).message,
        details: (err as { details: unknown }).details,
      };
    }
    const inv = [
      { description: "error thrown", pass: captured !== null },
      { description: "details.code === OCCURRENCE_COUNT_DRIFT", pass: (captured?.details as { code: string } | undefined)?.code === "OCCURRENCE_COUNT_DRIFT" },
      { description: "preview_count === 3", pass: (captured?.details as { preview_count: number } | undefined)?.preview_count === 3 },
      { description: "commit_count === 4", pass: (captured?.details as { commit_count: number } | undefined)?.commit_count === 4 },
    ];
    const rec: CaptureRecord = {
      scenario: "Drift detection refuses stale commit",
      request,
      error: captured ?? undefined,
      invariants: inv,
      pass: inv.every((x) => x.pass),
    };
    writeCapture(6, rec);
    expect(rec.pass).toBe(true);
    // a.md may have been left untouched (drift refusal fires before write)
    expect(readFileSync(aAbs, "utf8")).toBe("pat pat pat");
    rmSync(SANDBOX_ABS, { recursive: true, force: true });
  });
});
