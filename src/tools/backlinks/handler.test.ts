// Original — no upstream. backlinks handler tests — single-call argv assembly, base64 payload round-trip (R12 anti-injection lock), eval envelope parsing with => prefix, per-source response passthrough for default / with_counts / total modes, cap-and-truncated cases, .md-source filter, code-block exclusion, self-reference inclusion, alias / frontmatter attribution, NOT_MARKDOWN target rejection, FILE_NOT_FOUND envelopes, ERR_NO_ACTIVE_FILE mapping (BI-025 parity), unknown-vault inheritance (R5), CLI output-cap-kill propagation, deterministic order, structural anti-injection lock.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, expect, test } from "vitest";

import { JS_TEMPLATE } from "./_template.js";
import { executeBacklinks } from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createLogger, type Logger } from "../../logger.js";
import { createQueue } from "../../queue.js";

interface StubResponse {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  errorOnSpawn?: unknown;
}

interface SpawnRecording {
  binary: string;
  argv: string[];
  options: SpawnOptions;
}

function makeQueuedSpawn(responses: StubResponse[]): {
  spawnFn: SpawnLike;
  recorded: SpawnRecording[];
  getCount: () => number;
} {
  const recorded: SpawnRecording[] = [];
  let idx = 0;
  const spawnFn: SpawnLike = (binary, argv, options) => {
    const spec = responses[idx++];
    if (!spec) {
      throw new Error(
        `unexpected spawn invocation #${idx}; only ${responses.length} response(s) configured`,
      );
    }
    if (spec.errorOnSpawn) {
      throw spec.errorOnSpawn;
    }
    recorded.push({ binary, argv: [...argv], options });
    const child = new EventEmitter() as EventEmitter & {
      stdout: Readable;
      stderr: Readable;
      kill: (signal?: NodeJS.Signals) => boolean;
      pid?: number;
    };
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.pid = 4242;
    child.kill = (signal?: NodeJS.Signals) => {
      setImmediate(() => child.emit("exit", null, signal ?? "SIGTERM"));
      return true;
    };
    setImmediate(() => {
      if (spec.stdout) child.stdout.push(Buffer.from(spec.stdout, "utf8"));
      child.stdout.push(null);
      if (spec.stderr) child.stderr.push(Buffer.from(spec.stderr, "utf8"));
      child.stderr.push(null);
      setImmediate(() => {
        const closeCode = "exitCode" in spec ? (spec.exitCode ?? null) : 0;
        const closeSignal = "signal" in spec ? (spec.signal ?? null) : null;
        child.emit("exit", closeCode, closeSignal);
      });
    });
    return child as unknown as ReturnType<SpawnLike>;
  };
  return { spawnFn, recorded, getCount: () => idx };
}

function silentLogger(): Logger {
  return createLogger({ stream: new Writable({ write(_c, _e, cb) { cb(); } }) });
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("expected rejection but promise resolved");
  } catch (e) {
    return e;
  }
}

function deps(spawnFn: SpawnLike) {
  return { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} };
}

function decodePayload(argv: string[]): unknown {
  const codeArg = argv.find((a) => a.startsWith("code="));
  if (!codeArg) throw new Error("argv missing code= parameter");
  const match = /atob\('([A-Za-z0-9+/=]+)'\)/.exec(codeArg);
  if (!match) throw new Error("argv code= does not contain base64 atob(...) payload");
  return JSON.parse(Buffer.from(match[1]!, "base64").toString("utf-8"));
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// =====================================================================
// US1 happy paths
// =====================================================================

// (1) default mode, 3 source notes
test("specific + path + 3 sources: returns {count:3, backlinks:[3 entries]} (US1 happy)", async () => {
  const envelope = {
    ok: true,
    count: 3,
    backlinks: [
      { source: "Notes/Alpha.md" },
      { source: "Notes/Beta.md" },
      { source: "Projects/Gamma.md" },
    ],
  };
  const { spawnFn, recorded, getCount } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeBacklinks(
    { target_mode: "specific", vault: "Demo", path: "Projects/brief.md" },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 3, backlinks: envelope.backlinks });
  expect(getCount()).toBe(1);
  const argv = recorded[0]!.argv;
  expect(argv[0]).toBe("vault=Demo");
  expect(argv[1]).toBe("eval");
  expect(argv[2]!.startsWith("code=")).toBe(true);
  expect(decodePayload(argv)).toEqual({
    active: false,
    path: "Projects/brief.md",
    file: null,
    with_counts: false,
    total: false,
    limit: null,
  });
});

// (2) with_counts:true — each entry carries count
test("with_counts:true: each entry carries positive count (US4)", async () => {
  const envelope = {
    ok: true,
    count: 3,
    backlinks: [
      { source: "Notes/Alpha.md", count: 1 },
      { source: "Notes/Beta.md", count: 5 },
      { source: "Projects/Gamma.md", count: 2 },
    ],
  };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeBacklinks(
    { target_mode: "specific", vault: "Demo", path: "x.md", with_counts: true },
    deps(spawnFn),
  );
  expect(result.count).toBe(3);
  expect(result.backlinks.every((b) => typeof b.count === "number" && b.count > 0)).toBe(true);
  expect(decodePayload(recorded[0]!.argv)).toEqual({
    active: false,
    path: "x.md",
    file: null,
    with_counts: true,
    total: false,
    limit: null,
  });
});

// (3) total:true happy — count-only response
test("total:true: returns {count:3, backlinks:[]} (US5)", async () => {
  const envelope = { ok: true, count: 3, backlinks: [] };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeBacklinks(
    { target_mode: "specific", vault: "Demo", path: "x.md", total: true },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 3, backlinks: [] });
  expect(decodePayload(recorded[0]!.argv)).toEqual({
    active: false,
    path: "x.md",
    file: null,
    with_counts: false,
    total: true,
    limit: null,
  });
});

// (4) active happy — argv has no vault=
test("active mode happy: argv has no vault= AND payload active=true (US2)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    backlinks: [{ source: "Notes/Beta.md" }],
  };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeBacklinks({ target_mode: "active" }, deps(spawnFn));
  expect(result.count).toBe(1);
  const argv = recorded[0]!.argv;
  expect(argv.some((a) => a.startsWith("vault="))).toBe(false);
  expect(argv[0]).toBe("eval");
  expect(decodePayload(argv)).toEqual({
    active: true,
    path: null,
    file: null,
    with_counts: false,
    total: false,
    limit: null,
  });
});

// (5) by-basename equivalent to by-path
test("specific + file (basename): payload carries file=<basename>, path=null", async () => {
  const envelope = { ok: true, count: 0, backlinks: [] };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeBacklinks(
    { target_mode: "specific", vault: "Demo", file: "brief" },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 0, backlinks: [] });
  expect(decodePayload(recorded[0]!.argv)).toEqual({
    active: false,
    path: null,
    file: "brief",
    with_counts: false,
    total: false,
    limit: null,
  });
});

// (6) zero backlinks
test("zero backlinks default: returns {count:0, backlinks:[]} (FR-009)", async () => {
  const envelope = { ok: true, count: 0, backlinks: [] };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeBacklinks(
    { target_mode: "specific", vault: "Demo", path: "isolate.md" },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 0, backlinks: [] });
});

// (7) zero backlinks + with_counts (no error)
test("zero backlinks with_counts:true: returns {count:0, backlinks:[]} (no error)", async () => {
  const envelope = { ok: true, count: 0, backlinks: [] };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeBacklinks(
    { target_mode: "specific", vault: "Demo", path: "isolate.md", with_counts: true },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 0, backlinks: [] });
});

// (8) zero backlinks + total (no error)
test("zero backlinks total:true: returns {count:0, backlinks:[]} (no error)", async () => {
  const envelope = { ok: true, count: 0, backlinks: [] };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeBacklinks(
    { target_mode: "specific", vault: "Demo", path: "isolate.md", total: true },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 0, backlinks: [] });
});

// =====================================================================
// US4 per-source counts
// =====================================================================

// (9) same source N references across N lines → ONE entry with count:N
test("same source N references across N lines: ONE entry with count:N (FR-007)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    backlinks: [{ source: "Notes/Beta.md", count: 4 }],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeBacklinks(
    { target_mode: "specific", vault: "Demo", path: "x.md", with_counts: true },
    deps(spawnFn),
  );
  expect(result.backlinks.length).toBe(1);
  expect(result.backlinks[0]!.count).toBe(4);
});

// (10) same source 2 references on SAME line → ONE entry with count:2
test("same source 2 refs on same line: ONE entry with count:2 (FR-007 / US4-3)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    backlinks: [{ source: "Notes/Beta.md", count: 2 }],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeBacklinks(
    { target_mode: "specific", vault: "Demo", path: "x.md", with_counts: true },
    deps(spawnFn),
  );
  expect(result.backlinks).toEqual([{ source: "Notes/Beta.md", count: 2 }]);
});

// (11) aliased wikilink only → entry carries count:1
test("aliased wikilink only: entry carries count:1 — alias text NEVER in response (FR-015)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    backlinks: [{ source: "Notes/Beta.md", count: 1 }],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeBacklinks(
    { target_mode: "specific", vault: "Demo", path: "Target.md", with_counts: true },
    deps(spawnFn),
  );
  expect(result.backlinks).toEqual([{ source: "Notes/Beta.md", count: 1 }]);
  for (const entry of result.backlinks) {
    expect(Object.keys(entry)).not.toContain("alias");
    expect(Object.keys(entry)).not.toContain("displayText");
  }
});

// (12) frontmatter-only reference → source appears with count:1
test("frontmatter-only reference: source appears with count:1 (FR-016)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    backlinks: [{ source: "Notes/FrontmatterOnly.md", count: 1 }],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeBacklinks(
    { target_mode: "specific", vault: "Demo", path: "Target.md", with_counts: true },
    deps(spawnFn),
  );
  expect(result.backlinks).toEqual([{ source: "Notes/FrontmatterOnly.md", count: 1 }]);
});

// (13) mixed body + frontmatter from one source → ONE entry with count summing both
test("mixed body + frontmatter from one source: ONE entry with count summing both (FR-007 / FR-016)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    backlinks: [{ source: "Notes/Mixed.md", count: 2 }],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeBacklinks(
    { target_mode: "specific", vault: "Demo", path: "Target.md", with_counts: true },
    deps(spawnFn),
  );
  expect(result.backlinks).toEqual([{ source: "Notes/Mixed.md", count: 2 }]);
});

// =====================================================================
// US1 corpus + structural
// =====================================================================

// (14) code-block-only reference EXCLUDED — eval envelope omits the source
test("code-block-only reference excluded: source absent from response (FR-014)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    backlinks: [{ source: "Notes/RealLink.md" }],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeBacklinks(
    { target_mode: "specific", vault: "Demo", path: "Target.md" },
    deps(spawnFn),
  );
  expect(result.backlinks.map((b) => b.source)).toEqual(["Notes/RealLink.md"]);
  expect(result.backlinks.map((b) => b.source)).not.toContain("Notes/CodeOnly.md");
});

// (15) self-reference inclusion
test("self-reference: target's own path included in source list (FR-013)", async () => {
  const envelope = {
    ok: true,
    count: 2,
    backlinks: [{ source: "Notes/Other.md" }, { source: "Target.md" }],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeBacklinks(
    { target_mode: "specific", vault: "Demo", path: "Target.md" },
    deps(spawnFn),
  );
  expect(result.backlinks.map((b) => b.source)).toContain("Target.md");
});

// (16) `.canvas` source EXCLUDED under default mode
test(".canvas source excluded under default mode (FR-020a / Q2)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    backlinks: [{ source: "Notes/MarkdownSource.md" }],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeBacklinks(
    { target_mode: "specific", vault: "Demo", path: "Target.md" },
    deps(spawnFn),
  );
  expect(result.backlinks.map((b) => b.source)).toEqual(["Notes/MarkdownSource.md"]);
  expect(result.backlinks.every((b) => b.source.toLowerCase().endsWith(".md"))).toBe(true);
});

// (17) mixed `.md` + `.canvas` sources — only `.md` in response
test("mixed .md + .canvas sources: only .md entries in response (FR-020a)", async () => {
  const envelope = {
    ok: true,
    count: 5,
    backlinks: [
      { source: "Notes/A.md" },
      { source: "Notes/B.md" },
      { source: "Notes/C.md" },
      { source: "Notes/D.md" },
      { source: "Notes/E.md" },
    ],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeBacklinks(
    { target_mode: "specific", vault: "Demo", path: "Target.md" },
    deps(spawnFn),
  );
  expect(result.backlinks.length).toBe(5);
  expect(result.backlinks.every((b) => b.source.toLowerCase().endsWith(".md"))).toBe(true);
});

// (18) target locator pointing at `.pdf` → NOT_MARKDOWN
test("target locator .pdf: envelope NOT_MARKDOWN → CLI_REPORTED_ERROR (FR-020)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout:
        '=> {"ok":false,"code":"NOT_MARKDOWN","detail":"path: Notes/Manual.pdf extension: pdf"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeBacklinks(
      { target_mode: "specific", vault: "Demo", path: "Notes/Manual.pdf" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    stage: "envelope-error",
    code: "NOT_MARKDOWN",
  });
});

// (19) target locator pointing at `.canvas` → NOT_MARKDOWN
test("target locator .canvas: envelope NOT_MARKDOWN → CLI_REPORTED_ERROR (FR-020)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout:
        '=> {"ok":false,"code":"NOT_MARKDOWN","detail":"path: Sandbox/board.canvas extension: canvas"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeBacklinks(
      { target_mode: "specific", vault: "Demo", path: "Sandbox/board.canvas" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({ stage: "envelope-error", code: "NOT_MARKDOWN" });
});

// =====================================================================
// US1 error paths
// =====================================================================

// (20) unresolved path → FILE_NOT_FOUND
test("unresolved path: envelope FILE_NOT_FOUND → CLI_REPORTED_ERROR (FR-017)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: '=> {"ok":false,"code":"FILE_NOT_FOUND","detail":"path: missing.md"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeBacklinks(
      { target_mode: "specific", vault: "Demo", path: "missing.md" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    stage: "envelope-error",
    code: "FILE_NOT_FOUND",
    detail: "path: missing.md",
  });
});

// (21) unresolved file basename → FILE_NOT_FOUND wikilink:
test("unresolved file (basename): envelope FILE_NOT_FOUND with wikilink: detail (FR-017)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: '=> {"ok":false,"code":"FILE_NOT_FOUND","detail":"wikilink: ghost"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeBacklinks(
      { target_mode: "specific", vault: "Demo", file: "ghost" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    stage: "envelope-error",
    code: "FILE_NOT_FOUND",
    detail: "wikilink: ghost",
  });
});

// (22) active + no focused → ERR_NO_ACTIVE_FILE
test("active + no focused file: envelope NO_ACTIVE_FILE → ERR_NO_ACTIVE_FILE (BI-025 parity)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout:
        '=> {"ok":false,"code":"NO_ACTIVE_FILE","detail":"No note focused; switch to specific mode or focus a note."}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeBacklinks({ target_mode: "active" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
  expect(err.details).toMatchObject({ stage: "envelope-error" });
});

// (23) unknown vault → cli-adapter 011-R5 → CLI_REPORTED_ERROR
test("unknown vault: 'Vault not found.' stdout → CLI_REPORTED_ERROR (R5)", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "Vault not found.\n", exitCode: 0 }]);
  const err = (await captureRejection(
    executeBacklinks(
      { target_mode: "specific", vault: "NoSuchVault", path: "x.md" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.message).toBe("Vault not found.");
});

// (24) stdout non-JSON → json-parse
test("malformed JSON eval response → CLI_REPORTED_ERROR(stage:'json-parse')", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "=> not-valid-json{\n", exitCode: 0 }]);
  const err = (await captureRejection(
    executeBacklinks(
      { target_mode: "specific", vault: "Demo", path: "x.md" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("json-parse");
});

// (25) envelope shape unknown → envelope-parse
test("envelope shape unexpected → CLI_REPORTED_ERROR(stage:'envelope-parse')", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: '=> {"ok":true,"count":5,"backlinks":[],"surprise":"extra"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeBacklinks(
      { target_mode: "specific", vault: "Demo", path: "x.md" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("envelope-parse");
});

// =====================================================================
// US5 cap + truncated + total-bypass
// =====================================================================

// (26) cap-and-truncate default cap: 1000 entries + truncated:true
test("cap-and-truncate default cap: 1000 entries + truncated:true (FR-010)", async () => {
  const entries = Array.from({ length: 1000 }, (_, i) => ({
    source: `Notes/Source${String(i).padStart(4, "0")}.md`,
  }));
  const envelope = { ok: true, count: 1000, backlinks: entries, truncated: true };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeBacklinks(
    { target_mode: "specific", vault: "Demo", path: "Popular.md" },
    deps(spawnFn),
  );
  expect(result.count).toBe(1000);
  expect(result.backlinks.length).toBe(1000);
  expect(result.truncated).toBe(true);
});

// (27) cap-and-truncate explicit limit:50
test("cap-and-truncate limit:50: 50 entries + truncated:true; payload limit decoded as 50", async () => {
  const entries = Array.from({ length: 50 }, (_, i) => ({ source: `Notes/${i}.md` }));
  const envelope = { ok: true, count: 50, backlinks: entries, truncated: true };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeBacklinks(
    { target_mode: "specific", vault: "Demo", path: "Popular.md", limit: 50 },
    deps(spawnFn),
  );
  expect(result.count).toBe(50);
  expect(result.backlinks.length).toBe(50);
  expect(result.truncated).toBe(true);
  const payload = decodePayload(recorded[0]!.argv) as { limit: unknown };
  expect(payload.limit).toBe(50);
});

// (28) cap-bypass under total:true — full pre-cap count, NO truncated
test("cap-bypass under total:true: count:1500, backlinks:[], NO truncated (Q1 / FR-005a)", async () => {
  const envelope = { ok: true, count: 1500, backlinks: [] };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeBacklinks(
    { target_mode: "specific", vault: "Demo", path: "Popular.md", total: true },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 1500, backlinks: [] });
  expect(Object.prototype.hasOwnProperty.call(result, "truncated")).toBe(false);
});

// (29) output-cap kill → CLI_NON_ZERO_EXIT
test("dispatch kill (output cap) → CLI_NON_ZERO_EXIT (FR-024)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stderr: "output cap exceeded", exitCode: null, signal: "SIGTERM" },
  ]);
  const err = (await captureRejection(
    executeBacklinks(
      { target_mode: "specific", vault: "Demo", path: "x.md" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
});

// =====================================================================
// Deterministic + invariants
// =====================================================================

// (30) byte-identical repeated call + key-set invariant
test("byte-identical repeated call AND key-set invariant (FR-008 / SC-018 / FR-025)", async () => {
  const envelope = {
    ok: true,
    count: 2,
    backlinks: [{ source: "Notes/A.md" }, { source: "Notes/B.md" }],
  };
  const { spawnFn: spawn1 } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const { spawnFn: spawn2 } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const r1 = await executeBacklinks(
    { target_mode: "specific", vault: "Demo", path: "x.md" },
    deps(spawn1),
  );
  const r2 = await executeBacklinks(
    { target_mode: "specific", vault: "Demo", path: "x.md" },
    deps(spawn2),
  );
  expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  expect(Object.keys(r1).sort()).toEqual(["backlinks", "count"]);
});

// Key-set invariant under truncated
test("response keys when truncated: exactly [backlinks, count, truncated]", async () => {
  const envelope = {
    ok: true,
    count: 1,
    backlinks: [{ source: "a.md" }],
    truncated: true,
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeBacklinks(
    { target_mode: "specific", vault: "Demo", path: "x.md" },
    deps(spawnFn),
  );
  expect(Object.keys(result).sort()).toEqual(["backlinks", "count", "truncated"]);
});

// =====================================================================
// US3 runtime safety-net: path-traversal rejection at eval (envelope FILE_NOT_FOUND)
// =====================================================================

// Path-traversal runtime rejection (US3-8 / FR-022 / SC-015) — spawnFn IS called once
test("path-traversal '../../etc/passwd' → eval envelope FILE_NOT_FOUND; spawn called exactly once", async () => {
  const { spawnFn, getCount } = makeQueuedSpawn([
    {
      stdout: '=> {"ok":false,"code":"FILE_NOT_FOUND","detail":"path: ../../etc/passwd"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeBacklinks(
      { target_mode: "specific", vault: "Demo", path: "../../etc/passwd" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(getCount()).toBe(1);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    stage: "envelope-error",
    code: "FILE_NOT_FOUND",
  });
});

// =====================================================================
// Structural anti-injection (R12 / SC-027 / FR-022)
// =====================================================================

test("R12 anti-injection: base64 round-trips verbatim; frozen template prefix/suffix; one spawn per request", async () => {
  const envelope = { ok: true, count: 0, backlinks: [] };
  const { spawnFn, recorded, getCount } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const hostilePath = "Sandbox/Tricky\"); doSomething(); //.md";
  await executeBacklinks(
    { target_mode: "specific", vault: "Demo", path: hostilePath },
    deps(spawnFn),
  );
  expect(getCount()).toBe(1);
  const argv = recorded[0]!.argv;
  expect(argv[0]).toBe("vault=Demo");
  expect(argv[1]).toBe("eval");
  const codeArg = argv[2]!.slice("code=".length);
  expect(codeArg.startsWith("(()=>{")).toBe(true);
  expect(codeArg.endsWith("})()")).toBe(true);
  const match = /atob\('([A-Za-z0-9+/=]+)'\)/.exec(codeArg);
  expect(match).not.toBeNull();
  const rendered = JS_TEMPLATE.replace("__PAYLOAD_B64__", match![1]!);
  expect(codeArg).toBe(rendered);
  const payload = JSON.parse(Buffer.from(match![1]!, "base64").toString("utf-8"));
  expect(payload).toEqual({
    active: false,
    path: hostilePath,
    file: null,
    with_counts: false,
    total: false,
    limit: null,
  });
  // No hostile substring in argv outside the code= base64 position
  for (const a of argv) {
    if (a.startsWith("code=")) continue;
    expect(a.includes(hostilePath)).toBe(false);
  }
});

// Non-ASCII path round-trips through base64 (BI-034 invariant)
test("BI-034: non-ASCII source path (CJK) preserved in payload", async () => {
  const envelope = { ok: true, count: 0, backlinks: [] };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  await executeBacklinks(
    { target_mode: "specific", vault: "Demo", path: "笔记/链接目标.md" },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { path: unknown };
  expect(payload.path).toBe("笔记/链接目标.md");
});
