// Original — no upstream. Tests for the shared handler-test fixtures (BI-058
// F-A/F-B). These fixtures live in a non-test .ts (counted by coverage), so this
// suite exercises every branch: queue consumption + overflow, errorOnSpawn,
// chunked stdout, hold, pid default + override, exit code/signal, getCount,
// silentLogger, and captureRejection.
import { type ChildProcess } from "node:child_process";
import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import {
  captureRejection,
  makeQueuedSpawn,
  makeStubSpawn,
  silentLogger,
} from "./_handler-test-fixtures.js";

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
