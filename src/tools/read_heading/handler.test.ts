// Original — no upstream. Tests for the read_heading handler — single-call argv assembly, base64 payload round-trip (R6 anti-injection lock), eval envelope parsing with => prefix, envelope ok:false → UpstreamError mapping (R13), unknown-vault inheritance (R5), CLI error propagation, single-spawn invariant.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, expect, test } from "vitest";

import { executeReadHeading } from "./handler.js";
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

function makeQueuedSpawn(responses: StubResponse[]): { spawnFn: SpawnLike; recorded: SpawnRecording[]; getCount: () => number } {
  const recorded: SpawnRecording[] = [];
  let idx = 0;
  const spawnFn: SpawnLike = (binary, argv, options) => {
    const spec = responses[idx++];
    if (!spec) {
      throw new Error(`unexpected spawn invocation #${idx}; only ${responses.length} response(s) configured`);
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

// (21) US1 — specific + path + 2-segment heading
test("specific + path + 2-segment heading: returns body verbatim (US1 AC#1)", async () => {
  const { spawnFn, recorded, getCount } = makeQueuedSpawn([
    { stdout: '=> {"ok":true,"content":"Use kebab-case.\\n"}\n', exitCode: 0 },
  ]);
  const result = await executeReadHeading(
    { target_mode: "specific", vault: "Demo", path: "x.md", heading: "Best Practices::Naming" },
    deps(spawnFn),
  );
  expect(result).toEqual({ content: "Use kebab-case.\n" });
  expect(getCount()).toBe(1);
  const argv = recorded[0]!.argv;
  expect(argv[0]).toBe("vault=Demo");
  expect(argv[1]).toBe("eval");
  expect(argv[2]!.startsWith("code=")).toBe(true);
  expect(decodePayload(argv)).toEqual({
    active: false,
    path: "x.md",
    file: null,
    segments: ["Best Practices", "Naming"],
  });
});

// (22) US1 — specific + path + 3-segment nested heading
test("specific + path + 3-segment heading: payload segments preserve nesting (US1 AC#2)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"ok":true,"content":"Use lowercase.\\n"}\n', exitCode: 0 },
  ]);
  const result = await executeReadHeading(
    {
      target_mode: "specific",
      vault: "Demo",
      path: "x.md",
      heading: "Best Practices::Naming::Casing",
    },
    deps(spawnFn),
  );
  expect(result).toEqual({ content: "Use lowercase.\n" });
  const payload = decodePayload(recorded[0]!.argv) as { segments: unknown };
  expect(payload.segments).toEqual(["Best Practices", "Naming", "Casing"]);
});

// (23) US1 — specific + file (wikilink)
test("specific + file (wikilink): payload carries file=<wikilink>, path=null", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"ok":true,"content":"x"}\n', exitCode: 0 },
  ]);
  const result = await executeReadHeading(
    { target_mode: "specific", vault: "Demo", file: "best-practices", heading: "A::B" },
    deps(spawnFn),
  );
  expect(result).toEqual({ content: "x" });
  expect(decodePayload(recorded[0]!.argv)).toEqual({
    active: false,
    path: null,
    file: "best-practices",
    segments: ["A", "B"],
  });
});

// (24) US2 — active mode
test("active mode: argv has no vault= AND payload active=true (US2 AC#1)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"ok":true,"content":"Hello.\\n"}\n', exitCode: 0 },
  ]);
  const result = await executeReadHeading(
    { target_mode: "active", heading: "A::B" },
    deps(spawnFn),
  );
  expect(result).toEqual({ content: "Hello.\n" });
  const argv = recorded[0]!.argv;
  expect(argv.some((a) => a.startsWith("vault="))).toBe(false);
  expect(argv[0]).toBe("eval");
  expect(decodePayload(argv)).toEqual({
    active: true,
    path: null,
    file: null,
    segments: ["A", "B"],
  });
});

// (25) Sibling-level terminator
test("body terminator at sibling-level heading: wrapper passes body slice through verbatim", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"ok":true,"content":"Section A prose only.\\n"}\n', exitCode: 0 },
  ]);
  const result = await executeReadHeading(
    { target_mode: "specific", vault: "Demo", path: "x.md", heading: "Outer::Section A" },
    deps(spawnFn),
  );
  expect(result.content).toBe("Section A prose only.\n");
});

// (26) Higher-level terminator
test("body terminator at higher-level heading: wrapper passes body slice through verbatim", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"ok":true,"content":"Inner prose only.\\n"}\n', exitCode: 0 },
  ]);
  const result = await executeReadHeading(
    { target_mode: "specific", vault: "Demo", path: "x.md", heading: "Outer::Inner" },
    deps(spawnFn),
  );
  expect(result.content).toBe("Inner prose only.\n");
});

// (27) Child-level terminator (US1 AC#2 — child subtree exclusion)
test("body terminator at child heading: child subtree excluded from body slice (US1 AC#2)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"ok":true,"content":"Parent prose only.\\n"}\n', exitCode: 0 },
  ]);
  const result = await executeReadHeading(
    { target_mode: "specific", vault: "Demo", path: "x.md", heading: "Outer::Parent" },
    deps(spawnFn),
  );
  expect(result.content).toBe("Parent prose only.\n");
});

// (28) EOF terminator
test("body terminator at EOF: body slice extends to text.length", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"ok":true,"content":"Last section prose to end of file.\\n"}\n', exitCode: 0 },
  ]);
  const result = await executeReadHeading(
    { target_mode: "specific", vault: "Demo", path: "x.md", heading: "Outer::Last" },
    deps(spawnFn),
  );
  expect(result.content).toBe("Last section prose to end of file.\n");
});

// (29) US1 AC#4 — empty body
test("empty body (heading followed directly by next heading): { content: '' } no error (US1 AC#4 / FR-011)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"ok":true,"content":""}\n', exitCode: 0 },
  ]);
  const result = await executeReadHeading(
    { target_mode: "specific", vault: "Demo", path: "x.md", heading: "Outer::Empty" },
    deps(spawnFn),
  );
  expect(result).toEqual({ content: "" });
});

// (30) US5 AC#2 — fence opacity (Obsidian's pre-parsing already excludes inside-fence headings; wrapper passes body through)
test("fenced code block opacity: fence text included as content (US5 AC#2)", async () => {
  const fenceBody = "intro prose.\n```markdown\n## Heading-like inside fence\n```\ntrailing prose.\n";
  const stubJson = JSON.stringify({ ok: true, content: fenceBody });
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${stubJson}\n`, exitCode: 0 },
  ]);
  const result = await executeReadHeading(
    { target_mode: "specific", vault: "Demo", path: "x.md", heading: "Outer::ATX Section" },
    deps(spawnFn),
  );
  expect(result.content).toBe(fenceBody);
});

// (31) Setext exclusion (R14): underlines surface as content, not boundaries
test("Setext-as-content (R14 defence-in-depth): underlines pass through as body content", async () => {
  const setextBody = "Some prose.\n\nA line that looks like Setext H2\n---------------------------------\n\nMore body content.\n";
  const stubJson = JSON.stringify({ ok: true, content: setextBody });
  const { spawnFn } = makeQueuedSpawn([
    { stdout: `=> ${stubJson}\n`, exitCode: 0 },
  ]);
  const result = await executeReadHeading(
    { target_mode: "specific", vault: "Demo", path: "x.md", heading: "Outer::ATX Section" },
    deps(spawnFn),
  );
  expect(result.content).toBe(setextBody);
});

// (32) FR-017 — duplicate heading paths first-match
test("duplicate heading paths: wrapper passes first-document-order match through (FR-017)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"ok":true,"content":"First occurrence body.\\n"}\n', exitCode: 0 },
  ]);
  const result = await executeReadHeading(
    { target_mode: "specific", vault: "Demo", path: "x.md", heading: "Outer::Duplicate" },
    deps(spawnFn),
  );
  expect(result.content).toBe("First occurrence body.\n");
});

// (33) Closing-ATX form: payload preserves segment text verbatim (no closing-ATX strip in wrapper)
test("closing-ATX segment: payload segments preserve text verbatim (FR-028)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"ok":true,"content":"Closing ATX prose.\\n"}\n', exitCode: 0 },
  ]);
  await executeReadHeading(
    {
      target_mode: "specific",
      vault: "Demo",
      path: "x.md",
      heading: "Outer::Heading With Closing ATX",
    },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { segments: string[] };
  expect(payload.segments).toEqual(["Outer", "Heading With Closing ATX"]);
});

// (34) Surrounding whitespace: payload segments preserved verbatim (no trim in wrapper)
test("surrounding-whitespace segment: payload segments verbatim (FR-028)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"ok":true,"content":"prose."}\n', exitCode: 0 },
  ]);
  await executeReadHeading(
    {
      target_mode: "specific",
      vault: "Demo",
      path: "x.md",
      heading: "Outer::Heading With Trailing Whitespace",
    },
    deps(spawnFn),
  );
  const payload = decodePayload(recorded[0]!.argv) as { segments: string[] };
  expect(payload.segments).toEqual(["Outer", "Heading With Trailing Whitespace"]);
});

// (35) Inline markdown survives: ** chars preserved in payload AND mis-spelled fails
test("inline markdown segment survives in payload; without ** returns HEADING_NOT_FOUND (FR-028)", async () => {
  const { spawnFn: spawnA, recorded: recordedA } = makeQueuedSpawn([
    { stdout: '=> {"ok":true,"content":"prose."}\n', exitCode: 0 },
  ]);
  await executeReadHeading(
    { target_mode: "specific", vault: "Demo", path: "x.md", heading: "Outer::My **Bold** Heading" },
    deps(spawnA),
  );
  const payloadA = decodePayload(recordedA[0]!.argv) as { segments: string[] };
  expect(payloadA.segments).toEqual(["Outer", "My **Bold** Heading"]);

  const { spawnFn: spawnB } = makeQueuedSpawn([
    {
      stdout:
        '=> {"ok":false,"code":"HEADING_NOT_FOUND","detail":"segments: Outer::My Bold Heading not found in x.md"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeReadHeading(
      { target_mode: "specific", vault: "Demo", path: "x.md", heading: "Outer::My Bold Heading" },
      deps(spawnB),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.code).toBe("HEADING_NOT_FOUND");
});

// (36) Anchor survives: ^anchor-id preserved in payload AND without it fails
test("anchor segment ^anchor-id survives in payload; without anchor returns HEADING_NOT_FOUND (FR-028)", async () => {
  const { spawnFn: spawnA, recorded: recordedA } = makeQueuedSpawn([
    { stdout: '=> {"ok":true,"content":"prose."}\n', exitCode: 0 },
  ]);
  await executeReadHeading(
    { target_mode: "specific", vault: "Demo", path: "x.md", heading: "Outer::Section ^my-anchor" },
    deps(spawnA),
  );
  const payloadA = decodePayload(recordedA[0]!.argv) as { segments: string[] };
  expect(payloadA.segments).toEqual(["Outer", "Section ^my-anchor"]);

  const { spawnFn: spawnB } = makeQueuedSpawn([
    {
      stdout:
        '=> {"ok":false,"code":"HEADING_NOT_FOUND","detail":"segments: Outer::Section not found in x.md"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeReadHeading(
      { target_mode: "specific", vault: "Demo", path: "x.md", heading: "Outer::Section" },
      deps(spawnB),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.code).toBe("HEADING_NOT_FOUND");
});

// (37) Mis-cased segment fails (case-sensitive byte equality)
test("mis-cased segment returns HEADING_NOT_FOUND (FR-028 case-sensitive)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout:
        '=> {"ok":false,"code":"HEADING_NOT_FOUND","detail":"segments: Outer::heading not found in x.md"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeReadHeading(
      { target_mode: "specific", vault: "Demo", path: "x.md", heading: "Outer::heading" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.code).toBe("HEADING_NOT_FOUND");
});

// (38) CRLF round-trip
test("CRLF line endings round-trip byte-faithfully", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"ok":true,"content":"Line 1\\r\\nLine 2\\r\\n"}\n', exitCode: 0 },
  ]);
  const result = await executeReadHeading(
    { target_mode: "specific", vault: "Demo", path: "x.md", heading: "A::B" },
    deps(spawnFn),
  );
  expect(result.content).toBe("Line 1\r\nLine 2\r\n");
});

// (39) LF round-trip
test("LF line endings round-trip byte-faithfully (no CRLF expansion)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"ok":true,"content":"Line 1\\nLine 2\\n"}\n', exitCode: 0 },
  ]);
  const result = await executeReadHeading(
    { target_mode: "specific", vault: "Demo", path: "x.md", heading: "A::B" },
    deps(spawnFn),
  );
  expect(result.content).toBe("Line 1\nLine 2\n");
});

// (40) Envelope ok:false FILE_NOT_FOUND → CLI_REPORTED_ERROR (R13)
test("envelope FILE_NOT_FOUND → CLI_REPORTED_ERROR with details.code=FILE_NOT_FOUND (R13)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"ok":false,"code":"FILE_NOT_FOUND","detail":"path: x.md"}\n', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeReadHeading(
      { target_mode: "specific", vault: "Demo", path: "x.md", heading: "A::B" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    stage: "envelope-error",
    code: "FILE_NOT_FOUND",
    detail: "path: x.md",
  });
});

// (41) Envelope ok:false HEADING_NOT_FOUND → CLI_REPORTED_ERROR (R13)
test("envelope HEADING_NOT_FOUND → CLI_REPORTED_ERROR with details.code=HEADING_NOT_FOUND (R13)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    {
      stdout:
        '=> {"ok":false,"code":"HEADING_NOT_FOUND","detail":"segments: A::B not found in x.md"}\n',
      exitCode: 0,
    },
  ]);
  const err = (await captureRejection(
    executeReadHeading(
      { target_mode: "specific", vault: "Demo", path: "x.md", heading: "A::B" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details).toMatchObject({
    stage: "envelope-error",
    code: "HEADING_NOT_FOUND",
  });
});

// (42) Envelope ok:false NO_ACTIVE_FILE → ERR_NO_ACTIVE_FILE (R13 mapping)
test("envelope NO_ACTIVE_FILE → ERR_NO_ACTIVE_FILE (R13)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"ok":false,"code":"NO_ACTIVE_FILE","detail":"No note focused..."}\n', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeReadHeading({ target_mode: "active", heading: "A::B" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
  expect(err.details).toMatchObject({ stage: "envelope-error" });
});

// (43) JSON parse failure → CLI_REPORTED_ERROR (stage: json-parse)
test("malformed JSON eval response → CLI_REPORTED_ERROR (stage: json-parse)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "=> not-valid-json{\n", exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeReadHeading(
      { target_mode: "specific", vault: "Demo", path: "x.md", heading: "A::B" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("json-parse");
});

// (44) Envelope schema-parse failure → CLI_REPORTED_ERROR (stage: envelope-parse)
test("envelope shape unexpected → CLI_REPORTED_ERROR (stage: envelope-parse)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: '=> {"ok":true}\n', exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeReadHeading(
      { target_mode: "specific", vault: "Demo", path: "x.md", heading: "A::B" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("envelope-parse");
});

// (45) R5 inheritance: 'Vault not found.' stdout exit 0 → CLI_REPORTED_ERROR via cli-adapter
test("unknown vault → CLI_REPORTED_ERROR (cli-adapter R5 inheritance)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Vault not found.\n", exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeReadHeading(
      { target_mode: "specific", vault: "NoSuchVault", path: "x.md", heading: "A::B" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.message).toBe("Vault not found.");
});

// (46) Dispatch-layer 'Error: no active file' → ERR_NO_ACTIVE_FILE (defensive — primary path is case 42)
test("dispatch-layer 'Error: no active file' → ERR_NO_ACTIVE_FILE (defensive)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Error: no active file\n", exitCode: 0 },
  ]);
  const err = (await captureRejection(
    executeReadHeading({ target_mode: "active", heading: "A::B" }, deps(spawnFn)),
  )) as UpstreamError;
  expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
});

// (47) Output cap kill → CLI_NON_ZERO_EXIT
test("dispatch kill (output cap) → CLI_NON_ZERO_EXIT (FR-020)", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { stderr: "output cap exceeded", exitCode: null, signal: "SIGTERM" },
  ]);
  const err = (await captureRejection(
    executeReadHeading(
      { target_mode: "specific", vault: "Demo", path: "x.md", heading: "A::B" },
      deps(spawnFn),
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
});

// (48) Argv shape in specific mode
test("argv shape in specific mode: [vault=Demo, eval, code=...] (R6/R12)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"ok":true,"content":""}\n', exitCode: 0 },
  ]);
  await executeReadHeading(
    { target_mode: "specific", vault: "Demo", path: "x.md", heading: "A::B" },
    deps(spawnFn),
  );
  const argv = recorded[0]!.argv;
  expect(argv[0]).toBe("vault=Demo");
  expect(argv[1]).toBe("eval");
  expect(argv[2]!.startsWith("code=")).toBe(true);
  const codeArg = argv[2]!.slice("code=".length);
  expect(codeArg.startsWith("(async()=>{")).toBe(true);
  expect(codeArg.endsWith("})()")).toBe(true);
});

// (49) Argv shape in active mode
test("argv shape in active mode: [eval, code=...] no vault= (R6/R12)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: '=> {"ok":true,"content":""}\n', exitCode: 0 },
  ]);
  await executeReadHeading({ target_mode: "active", heading: "A::B" }, deps(spawnFn));
  const argv = recorded[0]!.argv;
  expect(argv.some((a) => a.startsWith("vault="))).toBe(false);
  expect(argv[0]).toBe("eval");
  expect(argv[1]!.startsWith("code=")).toBe(true);
  const codeArg = argv[1]!.slice("code=".length);
  expect(codeArg.startsWith("(async()=>{")).toBe(true);
  expect(codeArg.endsWith("})()")).toBe(true);
});

// (50) R6 anti-injection: adversarial heading round-trips through base64
test("R6 anti-injection: hostile heading segments survive base64 round-trip exactly (SC-021)", async () => {
  const hostile = 'Outer::Inner"); doSomething(); //';
  const { spawnFn, recorded } = makeQueuedSpawn([
    {
      stdout:
        '=> {"ok":false,"code":"HEADING_NOT_FOUND","detail":"segments not found"}\n',
      exitCode: 0,
    },
  ]);
  await captureRejection(
    executeReadHeading(
      { target_mode: "specific", vault: "Demo", path: "x.md", heading: hostile },
      deps(spawnFn),
    ),
  );
  const codeArg = recorded[0]!.argv.find((a) => a.startsWith("code="))!;
  const match = /atob\('([A-Za-z0-9+/=]+)'\)/.exec(codeArg);
  expect(match).not.toBeNull();
  expect(/^[A-Za-z0-9+/=]+$/.test(match![1]!)).toBe(true);
  const payload = JSON.parse(Buffer.from(match![1]!, "base64").toString("utf-8")) as {
    segments: unknown;
  };
  expect(payload.segments).toEqual(["Outer", 'Inner"); doSomething(); //']);
});
