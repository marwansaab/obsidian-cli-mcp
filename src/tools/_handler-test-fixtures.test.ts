// Original — no upstream. Tests for the shared handler-test fixtures (BI-058
// F-A/F-B). These fixtures live in a non-test .ts (counted by coverage), so this
// suite exercises every branch: queue consumption + overflow, errorOnSpawn,
// chunked stdout, hold, pid default + override, exit code/signal, getCount,
// silentLogger, and captureRejection.
import { type ChildProcess } from "node:child_process";
import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import {
  answerLine,
  answerTagFromArgv,
  captureRejection,
  makeQueuedSpawn,
  makeStubSpawn,
  setTaggedStdoutTransform,
  silentLogger,
  unwrapEvalCode,
} from "./_handler-test-fixtures.js";
import { wrapEvalCode } from "../cli-adapter/_eval-answer.js";

type StubChild = ChildProcess & {
  stdout: Readable;
  stderr: Readable;
  pid?: number;
  kill: (signal?: NodeJS.Signals) => boolean;
};

function readToString(stream: Readable): Promise<string> {
  return new Promise((resolveOuter, rejectOuter) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    stream.on("end", () => resolveOuter(Buffer.concat(chunks).toString("utf8")));
    stream.on("error", rejectOuter);
  });
}

function awaitExit(child: ChildProcess): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolveOuter) => {
    child.on("exit", (code: number | null, signal: NodeJS.Signals | null) =>
      resolveOuter({ code, signal }),
    );
  });
}

describe("answer-tag awareness (spec 080)", () => {
  const TAG = "ocm-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const wrappedArgv = ["vault=V", "eval", `code=${wrapEvalCode("app.vault.getName()", TAG)}`];

  it("an unwrapped argv leaves stdout untouched", async () => {
    const { spawnFn } = makeQueuedSpawn([{ stdout: "=> 1\nplain\n" }]);
    const child = spawnFn("obsidian", ["eval", "code=app.vault.getName()"], {}) as StubChild;
    expect(await readToString(child.stdout)).toBe("=> 1\nplain\n");
  });

  it("a wrapped argv tags every => line of string stdout", async () => {
    const { spawnFn } = makeStubSpawn({ stdout: "noise\n=> 1\n=> 2\n" });
    const child = spawnFn("obsidian", wrappedArgv, {}) as StubChild;
    expect(await readToString(child.stdout)).toBe(`noise\n=> <<${TAG}>>1\n=> <<${TAG}>>2\n`);
  });

  it("function-form stdout receives the tag and is emitted verbatim", async () => {
    const { spawnFn } = makeQueuedSpawn([
      { stdout: ({ answerTag }) => `=> 0\n${answerLine(answerTag ?? "none", "1")}\n` },
      { stdout: ({ answerTag }) => `tag=${answerTag ?? "none"}` },
    ]);
    const c1 = spawnFn("obsidian", wrappedArgv, {}) as StubChild;
    expect(await readToString(c1.stdout)).toBe(`=> 0\n=> <<${TAG}>>1\n`);
    const c2 = spawnFn("obsidian", ["read"], {}) as StubChild;
    expect(await readToString(c2.stdout)).toBe("tag=none");
  });

  it("the tagged-stdout transform rewrites wrapped string stdout only, until cleared", async () => {
    setTaggedStdoutTransform((stdout, tag) => `noise ${tag}\n${stdout}`);
    try {
      const { spawnFn } = makeStubSpawn({ stdout: "=> 1\n" });
      const wrapped = spawnFn("obsidian", wrappedArgv, {}) as StubChild;
      expect(await readToString(wrapped.stdout)).toBe(`noise ${TAG}\n=> <<${TAG}>>1\n`);
      const plain = spawnFn("obsidian", ["read"], {}) as StubChild;
      expect(await readToString(plain.stdout)).toBe("=> 1\n");
    } finally {
      setTaggedStdoutTransform(undefined);
    }
    const { spawnFn } = makeStubSpawn({ stdout: "=> 1\n" });
    const after = spawnFn("obsidian", wrappedArgv, {}) as StubChild;
    expect(await readToString(after.stdout)).toBe(`=> <<${TAG}>>1\n`);
  });

  it("answerTagFromArgv reads the tag, or undefined when the code is not wrapped", () => {
    expect(answerTagFromArgv(wrappedArgv)).toBe(TAG);
    expect(answerTagFromArgv(["eval", "code=app.vault.getName()"])).toBeUndefined();
    expect(answerTagFromArgv(["read"])).toBeUndefined();
  });

  it("unwrapEvalCode round-trips wrapEvalCode, with or without the code= prefix", () => {
    const code = "(async()=>{return JSON.stringify({a:1});})()";
    expect(unwrapEvalCode(`code=${wrapEvalCode(code, TAG)}`)).toBe(code);
    expect(unwrapEvalCode(wrapEvalCode(code, TAG))).toBe(code);
    expect(unwrapEvalCode("code=app.vault.getName()")).toBe("code=app.vault.getName()");
  });
});

describe("makeQueuedSpawn", () => {
  it("consumes responses in order, records binary/argv/options, defaults exit 0, counts spawns", async () => {
    const { spawnFn, recorded, getCount } = makeQueuedSpawn([
      { stdout: "first" },
      { stdout: "second" },
    ]);

    const c1 = spawnFn("obsidian", ["a", "b"], { cwd: "/x" }) as StubChild;
    const [out1, exit1] = await Promise.all([readToString(c1.stdout), awaitExit(c1)]);
    expect(out1).toBe("first");
    expect(exit1).toEqual({ code: 0, signal: null });

    const c2 = spawnFn("obsidian", ["c"], {}) as StubChild;
    const out2 = await readToString(c2.stdout);
    expect(out2).toBe("second");

    expect(recorded).toEqual([
      { binary: "obsidian", argv: ["a", "b"], options: { cwd: "/x" } },
      { binary: "obsidian", argv: ["c"], options: {} },
    ]);
    expect(getCount()).toBe(2);
  });

  it("propagates explicit exitCode + signal + stderr", async () => {
    const { spawnFn } = makeQueuedSpawn([
      { stderr: "boom", exitCode: 3, signal: "SIGTERM" },
    ]);
    const child = spawnFn("obsidian", [], {}) as StubChild;
    const [err, exit] = await Promise.all([readToString(child.stderr), awaitExit(child)]);
    expect(err).toBe("boom");
    expect(exit).toEqual({ code: 3, signal: "SIGTERM" });
  });

  it("throws synchronously when errorOnSpawn is set", () => {
    const boom = new Error("spawn failed");
    const { spawnFn } = makeQueuedSpawn([{ errorOnSpawn: boom }]);
    expect(() => spawnFn("obsidian", [], {})).toThrow("spawn failed");
  });

  it("throws once the queue is exhausted", () => {
    const { spawnFn } = makeQueuedSpawn([{ stdout: "only" }]);
    spawnFn("obsidian", [], {});
    expect(() => spawnFn("obsidian", [], {})).toThrow(/unexpected spawn invocation #2; only 1 response/);
  });

  it("defaults pid to 4242 and honours a pid override", () => {
    const dflt = makeQueuedSpawn([{ stdout: "" }]).spawnFn("obsidian", [], {}) as StubChild;
    expect(dflt.pid).toBe(4242);
    const overridden = makeQueuedSpawn([{ stdout: "" }], { pid: 9090 }).spawnFn("obsidian", [], {}) as StubChild;
    expect(overridden.pid).toBe(9090);
  });

  it("kill() emits exit with the given signal", async () => {
    const { spawnFn } = makeQueuedSpawn([{ stdout: "", exitCode: null, signal: null }]);
    const child = spawnFn("obsidian", [], {}) as StubChild;
    const exitP = awaitExit(child);
    expect(child.kill("SIGKILL")).toBe(true);
    const exit = await exitP;
    expect(exit.signal).toBe("SIGKILL");
  });
});

describe("makeStubSpawn", () => {
  it("answers every spawn with the same spec (single-spec semantics)", async () => {
    const { spawnFn, recorded } = makeStubSpawn({ stdout: "same", exitCode: 0 });
    const c1 = spawnFn("obsidian", ["1"], {}) as StubChild;
    const c2 = spawnFn("obsidian", ["2"], {}) as StubChild;
    const [o1, o2] = await Promise.all([readToString(c1.stdout), readToString(c2.stdout)]);
    expect(o1).toBe("same");
    expect(o2).toBe("same");
    expect(recorded).toHaveLength(2);
    expect(recorded[0]!.argv).toEqual(["1"]);
    expect(recorded[1]!.argv).toEqual(["2"]);
  });

  it("emits chunkedStdout chunks in order (ignoring stdout)", async () => {
    const { spawnFn } = makeStubSpawn({
      chunkedStdout: [Buffer.from("foo"), Buffer.from("bar")],
      stdout: "ignored",
    });
    const child = spawnFn("obsidian", [], {}) as StubChild;
    const out = await readToString(child.stdout);
    expect(out).toBe("foobar");
  });

  it("hold: true never auto-exits — exit fires only after kill()", async () => {
    const { spawnFn } = makeStubSpawn({ stdout: "held", hold: true });
    const child = spawnFn("obsidian", [], {}) as StubChild;
    let exited = false;
    child.on("exit", () => {
      exited = true;
    });
    // Drain stdout and let several macrotasks elapse; a non-held stub would have exited.
    await readToString(child.stdout);
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));
    expect(exited).toBe(false);
    child.kill();
    await new Promise<void>((r) => setImmediate(r));
    expect(exited).toBe(true);
  });

  it("throws synchronously when errorOnSpawn is set", () => {
    const { spawnFn } = makeStubSpawn({ errorOnSpawn: new Error("nope") });
    expect(() => spawnFn("obsidian", [], {})).toThrow("nope");
  });

  it("defaults pid to 4242 and honours a pid override", () => {
    const dflt = makeStubSpawn({ stdout: "" }).spawnFn("obsidian", [], {}) as StubChild;
    expect(dflt.pid).toBe(4242);
    const overridden = makeStubSpawn({ stdout: "" }, { pid: 7 }).spawnFn("obsidian", [], {}) as StubChild;
    expect(overridden.pid).toBe(7);
  });
});

describe("silentLogger", () => {
  it("returns a Logger whose methods swallow output without throwing", () => {
    const logger = silentLogger();
    expect(() => {
      logger.pathEscapeAttempt({ vault: null, attemptedPath: "../x.md" });
      logger.shutdown({ reason: "transport_closed", inFlightKilled: false, queuedDropped: 0 });
    }).not.toThrow();
  });
});

describe("captureRejection", () => {
  it("returns the rejection value of a rejecting promise", async () => {
    const boom = new Error("rejected");
    const captured = await captureRejection(Promise.reject(boom));
    expect(captured).toBe(boom);
  });

  it("resolves to a sentinel Error if the promise unexpectedly resolves", async () => {
    const captured = await captureRejection(Promise.resolve("ok"));
    expect(captured).toBeInstanceOf(Error);
    expect((captured as Error).message).toBe("expected rejection but promise resolved");
  });
});
