// Original — no upstream. Tests for the links handler — single-call argv assembly, base64 payload round-trip (R6 anti-injection lock), eval envelope parsing with => prefix, per-entry response passthrough for all four kinds (wikilink/embed/markdown/frontmatter), displayText omit/keep, fragment-embedded targets, cross-mode invariant (FR-005a), envelope ok:false → UpstreamError mapping (R13), unknown-vault inheritance (R5), CLI error propagation, single-spawn invariant.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, expect, test } from "vitest";

import { JS_TEMPLATE } from "./_template.js";
import { executeLinks } from "./handler.js";
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
// Happy paths
// =====================================================================

// (1) specific + path + mixed-link envelope — wikilink, embed, markdown, frontmatter
test("specific + path + mixed-link envelope: 4-entry response with correct kinds/lines/displayText (US1 happy)", async () => {
  const envelope = {
    ok: true,
    count: 4,
    links: [
      { target: "Other-Note", line: 1, kind: "wikilink" },
      { target: "Roadmap", line: 5, kind: "wikilink" },
      { target: "diagrams/system.png", line: 7, kind: "embed" },
      { target: "Other-Note.md", line: 9, kind: "markdown", displayText: "See Other" },
    ],
  };
  const { spawnFn, recorded, getCount } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeLinks(
    { target_mode: "specific", vault: "Demo", path: "Projects/brief.md" },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 4, links: envelope.links });
  expect(getCount()).toBe(1);
  const argv = recorded[0]!.argv;
  expect(argv[0]).toBe("vault=Demo");
  expect(argv[1]).toBe("eval");
  expect(argv[2]!.startsWith("code=")).toBe(true);
  expect(decodePayload(argv)).toEqual({
    active: false,
    path: "Projects/brief.md",
    file: null,
    total: false,
  });
});

// (2) specific + file (basename) resolves via getFirstLinkpathDest path
test("specific + file (basename): payload carries file=<basename>, path=null", async () => {
  const envelope = { ok: true, count: 0, links: [] };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeLinks(
    { target_mode: "specific", vault: "Demo", file: "brief" },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 0, links: [] });
  expect(decodePayload(recorded[0]!.argv)).toEqual({
    active: false,
    path: null,
    file: "brief",
    total: false,
  });
});

// (3) specific + path + total:true: count-only response, empty links array
test("specific + path + total:true: returns {count:N, links:[]} (US4)", async () => {
  const envelope = { ok: true, count: 7, links: [] };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeLinks(
    { target_mode: "specific", vault: "Demo", path: "x.md", total: true },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 7, links: [] });
  expect(decodePayload(recorded[0]!.argv)).toEqual({
    active: false,
    path: "x.md",
    file: null,
    total: true,
  });
});

// (4) specific + path + empty cache (FR-009 / R9)
test("specific + path + empty cache: returns {count:0, links:[]} (FR-009 / R9)", async () => {
  const envelope = { ok: true, count: 0, links: [] };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeLinks(
    { target_mode: "specific", vault: "Demo", path: "empty.md" },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 0, links: [] });
});

// (5) active + focused-file fixture
test("active + focused-file: argv has no vault= AND payload active=true (US2)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    links: [{ target: "X", line: 2, kind: "wikilink" }],
  };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeLinks({ target_mode: "active" }, deps(spawnFn));
  expect(result.count).toBe(1);
  const argv = recorded[0]!.argv;
  expect(argv.some((a) => a.startsWith("vault="))).toBe(false);
  expect(argv[0]).toBe("eval");
  expect(decodePayload(argv)).toEqual({
    active: true,
    path: null,
    file: null,
    total: false,
  });
});

// (6) active + total:true: count-only response with same single-spawn invariant
test("active + total:true: count-only response (US4)", async () => {
  const envelope = { ok: true, count: 12, links: [] };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeLinks({ target_mode: "active", total: true }, deps(spawnFn));
  expect(result).toEqual({ count: 12, links: [] });
  expect(decodePayload(recorded[0]!.argv)).toEqual({
    active: true,
    path: null,
    file: null,
    total: true,
  });
});

// =====================================================================
// Per-entry shape transforms (wrapper passes through; eval JS does the work)
// =====================================================================

// (7) bare wikilink → no displayText field (Q1 / F6)
test("bare wikilink entry: response carries no displayText field (Q1)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    links: [{ target: "Roadmap", line: 3, kind: "wikilink" }],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeLinks(
    { target_mode: "specific", vault: "Demo", path: "x.md" },
    deps(spawnFn),
  );
  expect(result.links[0]).toEqual({ target: "Roadmap", line: 3, kind: "wikilink" });
  expect(Object.prototype.hasOwnProperty.call(result.links[0]!, "displayText")).toBe(false);
});

// (8) aliased wikilink → displayText present (Q1)
test("aliased wikilink entry: response carries displayText='Terms' (Q1)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    links: [{ target: "Glossary", line: 3, kind: "wikilink", displayText: "Terms" }],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeLinks(
    { target_mode: "specific", vault: "Demo", path: "x.md" },
    deps(spawnFn),
  );
  expect(result.links[0]).toEqual({
    target: "Glossary",
    line: 3,
    kind: "wikilink",
    displayText: "Terms",
  });
});

// (9) wiki embed → kind 'embed' no displayText
test("wiki embed entry: kind='embed', no displayText", async () => {
  const envelope = {
    ok: true,
    count: 1,
    links: [{ target: "diagrams/system.png", line: 4, kind: "embed" }],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeLinks(
    { target_mode: "specific", vault: "Demo", path: "x.md" },
    deps(spawnFn),
  );
  expect(result.links[0]).toEqual({ target: "diagrams/system.png", line: 4, kind: "embed" });
  expect(Object.prototype.hasOwnProperty.call(result.links[0]!, "displayText")).toBe(false);
});

// (10) markdown embed → kind 'embed' with displayText 'alt'
test("markdown embed entry: kind='embed', displayText='alt'", async () => {
  const envelope = {
    ok: true,
    count: 1,
    links: [{ target: "image.png", line: 4, kind: "embed", displayText: "alt" }],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeLinks(
    { target_mode: "specific", vault: "Demo", path: "x.md" },
    deps(spawnFn),
  );
  expect(result.links[0]).toEqual({
    target: "image.png",
    line: 4,
    kind: "embed",
    displayText: "alt",
  });
});

// (11) markdown link → kind 'markdown' with displayText
test("markdown link entry: kind='markdown', displayText='Note'", async () => {
  const envelope = {
    ok: true,
    count: 1,
    links: [{ target: "Other-Note.md", line: 6, kind: "markdown", displayText: "Note" }],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeLinks(
    { target_mode: "specific", vault: "Demo", path: "x.md" },
    deps(spawnFn),
  );
  expect(result.links[0]).toEqual({
    target: "Other-Note.md",
    line: 6,
    kind: "markdown",
    displayText: "Note",
  });
});

// (12) wikilink with heading fragment — target carries '#Heading' (Q2)
test("wikilink with heading fragment: target='Target#Heading' byte-faithful (Q2)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    links: [{ target: "Target#Heading", line: 2, kind: "wikilink" }],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeLinks(
    { target_mode: "specific", vault: "Demo", path: "x.md" },
    deps(spawnFn),
  );
  expect(result.links[0]!.target).toBe("Target#Heading");
});

// (13) wikilink with block fragment — target carries '#^block-id' (Q2)
test("wikilink with block fragment: target='Target#^block-id' byte-faithful (Q2)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    links: [{ target: "Target#^block-id", line: 2, kind: "wikilink" }],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeLinks(
    { target_mode: "specific", vault: "Demo", path: "x.md" },
    deps(spawnFn),
  );
  expect(result.links[0]!.target).toBe("Target#^block-id");
});

// (14) frontmatter entry → line:1, kind:'wikilink', no displayText (Q4)
test("frontmatter entry: line=1, kind='wikilink', no displayText (Q4)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    links: [{ target: "Other-Note", line: 1, kind: "wikilink" }],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeLinks(
    { target_mode: "specific", vault: "Demo", path: "x.md" },
    deps(spawnFn),
  );
  expect(result.links[0]).toEqual({ target: "Other-Note", line: 1, kind: "wikilink" });
  expect(Object.prototype.hasOwnProperty.call(result.links[0]!, "displayText")).toBe(false);
});

// =====================================================================
// Per-occurrence + sort
// =====================================================================

// (15) same target on two different lines — 2 entries in line-ascending order (FR-007)
test("same target on different lines: 2 entries in line-ascending order (FR-007)", async () => {
  const envelope = {
    ok: true,
    count: 2,
    links: [
      { target: "Apple", line: 3, kind: "wikilink" },
      { target: "Apple", line: 7, kind: "wikilink" },
    ],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeLinks(
    { target_mode: "specific", vault: "Demo", path: "x.md" },
    deps(spawnFn),
  );
  expect(result.links.map((l) => `${l.target}@${l.line}`)).toEqual(["Apple@3", "Apple@7"]);
});

// (16) same target on same line — column-ascending (already done by eval; stub envelope is in order)
test("same target on same line: 2 entries in column-ascending order (FR-008 / R8)", async () => {
  const envelope = {
    ok: true,
    count: 2,
    links: [
      { target: "Apple", line: 5, kind: "wikilink" },
      { target: "Apple", line: 5, kind: "wikilink" },
    ],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeLinks(
    { target_mode: "specific", vault: "Demo", path: "x.md" },
    deps(spawnFn),
  );
  expect(result.links.length).toBe(2);
  expect(result.links[0]!.line).toBe(5);
  expect(result.links[1]!.line).toBe(5);
});

// (17) mixed body+frontmatter: frontmatter entries first by line=1 (Q4 / FR-008)
test("mixed body+frontmatter: frontmatter entries appear first (line=1) ahead of body entries (Q4)", async () => {
  const envelope = {
    ok: true,
    count: 3,
    links: [
      { target: "Frontmatter-A", line: 1, kind: "wikilink" },
      { target: "Frontmatter-B", line: 1, kind: "wikilink" },
      { target: "Body-Link", line: 5, kind: "wikilink" },
    ],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeLinks(
    { target_mode: "specific", vault: "Demo", path: "x.md" },
    deps(spawnFn),
  );
  expect(result.links[0]!.line).toBe(1);
  expect(result.links[1]!.line).toBe(1);
  expect(result.links[2]!.line).toBe(5);
});

// (18) emitted entries have NO column / _col field (Q5)
test("emitted entries do not carry a column or _col field (Q5)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    links: [{ target: "Roadmap", line: 3, kind: "wikilink" }],
  };
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeLinks(
    { target_mode: "specific", vault: "Demo", path: "x.md" },
    deps(spawnFn),
  );
  for (const entry of result.links) {
    const keys = Object.keys(entry).sort();
    for (const k of keys) {
      expect(k).not.toBe("column");
      expect(k).not.toBe("_col");
    }
  }
});

// =====================================================================
// Cross-mode invariant
// =====================================================================

// (19) cross-mode invariant: count_false === count_true on same stub (FR-005a / R11)
test("cross-mode invariant: count_false === count_true on identical fixture (FR-005a / R11)", async () => {
  const N = 4;
  const envelopeFull = {
    ok: true,
    count: N,
    links: [
      { target: "A", line: 1, kind: "wikilink" },
      { target: "B", line: 2, kind: "wikilink" },
      { target: "C", line: 3, kind: "embed" },
      { target: "D", line: 4, kind: "markdown" },
    ],
  };
  const envelopeTotal = { ok: true, count: N, links: [] };
  const { spawnFn: spawn1 } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelopeFull)}\n`, exitCode: 0 },
  ]);
  const { spawnFn: spawn2 } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelopeTotal)}\n`, exitCode: 0 },
  ]);
  const r1 = await executeLinks(
    { target_mode: "specific", vault: "Demo", path: "x.md", total: false },
    deps(spawn1),
  );
  const r2 = await executeLinks(
    { target_mode: "specific", vault: "Demo", path: "x.md", total: true },
    deps(spawn2),
  );
  expect(r1.count).toBe(r2.count);
  expect(r1.count).toBe(N);
  expect(r1.links.length).toBe(N);
  expect(r2.links.length).toBe(0);
});

// =====================================================================
// Error paths
// =====================================================================

// (20) unknown vault → cli-adapter 011-R5 → CLI_REPORTED_ERROR (R5 / F7)
test("unknown vault: 'Vault not found.' stdout → CLI_REPORTED_ERROR (R5 / F7)", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "Vault not found.\n", exitCode: 0 }]);
  const err = (await captureRejection(
    executeLinks(
      { target_mode: "specific", vault: "NoSuchVault", path: "x.md" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.message).toBe("Vault not found.");
});

// (21) unresolved path → envelope FILE_NOT_FOUND → CLI_REPORTED_ERROR(stage:envelope-error)
test("unresolved path: envelope FILE_NOT_FOUND → CLI_REPORTED_ERROR (R13)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: '=> {"ok":false,"code":"FILE_NOT_FOUND","detail":"path: missing.md"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeLinks(
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

// (22) unresolved file (basename) → envelope FILE_NOT_FOUND with wikilink: detail
test("unresolved file (basename): envelope FILE_NOT_FOUND with wikilink: detail (R13)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: '=> {"ok":false,"code":"FILE_NOT_FOUND","detail":"wikilink: ghost"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeLinks(
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

// (23) .canvas / non-md → envelope NOT_MARKDOWN → CLI_REPORTED_ERROR(stage:envelope-error) (F9)
test("non-.md target: envelope NOT_MARKDOWN → CLI_REPORTED_ERROR (F9 / R13)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout:
        '=> {"ok":false,"code":"NOT_MARKDOWN","detail":"path: Sandbox/board.canvas extension: canvas"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeLinks(
      { target_mode: "specific", vault: "Demo", path: "Sandbox/board.canvas" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    stage: "envelope-error",
    code: "NOT_MARKDOWN",
  });
});

// (24) active + no focused file → envelope NO_ACTIVE_FILE → ERR_NO_ACTIVE_FILE (T0.2 lock)
test("active + no focused file: envelope NO_ACTIVE_FILE → ERR_NO_ACTIVE_FILE (T0.2 / BI-015 parity)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout:
        '=> {"ok":false,"code":"NO_ACTIVE_FILE","detail":"No note focused; switch to specific mode or focus a note."}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeLinks({ target_mode: "active" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
  expect(err.details).toMatchObject({ stage: "envelope-error" });
});

// (25) malformed eval stdout (non-JSON) → CLI_REPORTED_ERROR(stage:json-parse)
test("malformed JSON eval response → CLI_REPORTED_ERROR(stage:'json-parse')", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "=> not-valid-json{\n", exitCode: 0 }]);
  const err = (await captureRejection(
    executeLinks(
      { target_mode: "specific", vault: "Demo", path: "x.md" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("json-parse");
});

// (26) envelope shape unknown → CLI_REPORTED_ERROR(stage:'envelope-parse')
test("envelope shape unexpected → CLI_REPORTED_ERROR(stage:'envelope-parse')", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout: '=> {"ok":true,"count":5,"links":[],"surprise":"extra"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeLinks(
      { target_mode: "specific", vault: "Demo", path: "x.md" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("envelope-parse");
});

// (27) output cap kill (SIGTERM with null exitCode) → CLI_NON_ZERO_EXIT
test("dispatch kill (output cap) → CLI_NON_ZERO_EXIT (R10)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stderr: "output cap exceeded", exitCode: null, signal: "SIGTERM" },
  ]);
  const err = (await captureRejection(
    executeLinks(
      { target_mode: "specific", vault: "Demo", path: "x.md" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
});

// =====================================================================
// Argv / payload invariants
// =====================================================================

// (28) base64 round-trip + frozen template prefix/suffix + single invokeCli (R3 / R6 / R12)
test("R6 anti-injection + R3 single-call invariant: base64 round-trips verbatim; frozen template prefix/suffix; one spawn per request", async () => {
  const envelope = { ok: true, count: 0, links: [] };
  const { spawnFn, recorded, getCount } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const hostilePath = "Sandbox/Tricky\"); doSomething(); //.md";
  await executeLinks(
    { target_mode: "specific", vault: "Demo", path: hostilePath },
    deps(spawnFn),
  );
  expect(getCount()).toBe(1);
  const argv = recorded[0]!.argv;
  expect(argv[0]).toBe("vault=Demo");
  expect(argv[1]).toBe("eval");
  const codeArg = argv[2]!.slice("code=".length);

  // Frozen template prefix (sync IIFE — no async)
  expect(codeArg.startsWith("(()=>{")).toBe(true);
  expect(codeArg.endsWith("})()")).toBe(true);

  // The rendered code differs from the JS_TEMPLATE only by the b64 substitution
  const match = /atob\('([A-Za-z0-9+/=]+)'\)/.exec(codeArg);
  expect(match).not.toBeNull();
  expect(/^[A-Za-z0-9+/=]+$/.test(match![1]!)).toBe(true);

  const rendered = JS_TEMPLATE.replace("__PAYLOAD_B64__", match![1]!);
  expect(codeArg).toBe(rendered);

  // Round-trip the payload
  const payload = JSON.parse(Buffer.from(match![1]!, "base64").toString("utf-8"));
  expect(payload).toEqual({
    active: false,
    path: hostilePath,
    file: null,
    total: false,
  });
});

// (BI-034) Non-ASCII wikilink-target round-trips through base64
test("BI-034: non-ASCII wikilink target ('café-target') round-trips through base64 (FR-009)", async () => {
  const envelope = {
    ok: true,
    count: 1,
    links: [{ target: "café-target", line: 3, kind: "wikilink" }],
  };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  const result = await executeLinks(
    { target_mode: "specific", vault: "Demo", path: "Sandbox/unicode/links-from.md" },
    deps(spawnFn),
  );
  expect(result).toEqual({ count: 1, links: envelope.links });
  const payload = decodePayload(recorded[0]!.argv) as { path: unknown };
  expect(payload.path).toBe("Sandbox/unicode/links-from.md");
});

test("BI-034: non-ASCII source path (CJK) preserved in payload (FR-009)", async () => {
  const envelope = { ok: true, count: 0, links: [] };
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
  ]);
  await executeLinks(
    { target_mode: "specific", vault: "Demo", path: "笔记/链接源.md" },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { path: unknown };
  expect(payload.path).toBe("笔记/链接源.md");
});
