// Original — no upstream. Tests for the shared registration stub fixture (BI-031).
import { type ChildProcess } from "node:child_process";
import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { makeRegistrationStubSpawn } from "./_registration-stub.js";

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

function awaitExit(child: ChildProcess): Promise<number> {
  return new Promise((resolveOuter) => {
    child.on("exit", (code: number | null) => resolveOuter(code ?? 0));
  });
}

describe("makeRegistrationStubSpawn", () => {
  it("case 1: default invocation produces an exit-0 child with empty streams", async () => {
    const spawnFn = makeRegistrationStubSpawn();
    const child = spawnFn("obsidian", [], {}) as StubChild;

    const [stdout, stderr, exitCode] = await Promise.all([
      readToString(child.stdout),
      readToString(child.stderr),
      awaitExit(child),
    ]);

    expect(stdout).toBe("");
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
  });

  it("case 2: opts.stdout is encoded as UTF-8 and pushed before the null sentinel", async () => {
    const payload = "héllo 🌊";
    const spawnFn = makeRegistrationStubSpawn({ stdout: payload });
    const child = spawnFn("obsidian", [], {}) as StubChild;

    const [stdout, exitCode] = await Promise.all([
      readToString(child.stdout),
      awaitExit(child),
    ]);

    expect(stdout).toBe(payload);
    expect(Buffer.from(stdout, "utf8")).toEqual(Buffer.from(payload, "utf8"));
    expect(exitCode).toBe(0);
  });

  it("case 3: opts.exitCode propagates to the exit event", async () => {
    const spawnFn = makeRegistrationStubSpawn({ exitCode: 2 });
    const child = spawnFn("obsidian", [], {}) as StubChild;

    const exitCode = await awaitExit(child);
    expect(exitCode).toBe(2);
  });

  it("case 4: both opts together exercise the full pipeline", async () => {
    const spawnFn = makeRegistrationStubSpawn({ stdout: "x", exitCode: 1 });
    const child = spawnFn("obsidian", [], {}) as StubChild;

    const [stdout, exitCode] = await Promise.all([
      readToString(child.stdout),
      awaitExit(child),
    ]);

    expect(stdout).toBe("x");
    expect(exitCode).toBe(1);
  });

  it("case 5: returned child satisfies the SpawnLike shape contract", () => {
    const spawnFn = makeRegistrationStubSpawn();
    const child = spawnFn("obsidian", [], {}) as StubChild;

    expect(child.stdout).toBeInstanceOf(Readable);
    expect(child.stderr).toBeInstanceOf(Readable);
    expect(child.pid).toBe(7);
    expect(typeof child.kill).toBe("function");
    expect(child.kill()).toBe(true);
    expect(child.kill("SIGTERM")).toBe(true);
  });

  it("case 6: setImmediate lifecycle order — stdout payload, stdout null, stderr null, exit", async () => {
    const events: string[] = [];
    const spawnFn = makeRegistrationStubSpawn({ stdout: "payload" });
    const child = spawnFn("obsidian", [], {}) as StubChild;

    child.stdout.on("data", () => events.push("stdout-data"));
    child.stdout.on("end", () => events.push("stdout-end"));
    child.stderr.on("end", () => events.push("stderr-end"));
    child.stderr.resume();

    await new Promise<void>((resolveOuter) => {
      child.on("exit", () => {
        events.push("exit");
        resolveOuter();
      });
    });

    const stdoutDataIdx = events.indexOf("stdout-data");
    const stdoutEndIdx = events.indexOf("stdout-end");
    const stderrEndIdx = events.indexOf("stderr-end");
    const exitIdx = events.indexOf("exit");

    expect(stdoutDataIdx).toBeGreaterThanOrEqual(0);
    expect(stdoutEndIdx).toBeGreaterThan(stdoutDataIdx);
    expect(stderrEndIdx).toBeGreaterThan(stdoutEndIdx);
    expect(exitIdx).toBeGreaterThan(stderrEndIdx);
  });

  it("case 7: default exitCode is 0 when opts.exitCode is omitted", async () => {
    const spawnFn = makeRegistrationStubSpawn({ stdout: "ignored" });
    const child = spawnFn("obsidian", [], {}) as StubChild;

    const exitCode = await awaitExit(child);
    expect(exitCode).toBe(0);
  });
});
