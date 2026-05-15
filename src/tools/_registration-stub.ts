// Original — no upstream. Shared test fixture for the typed-tool registration cohort:
// returns a SpawnLike that constructs a one-shot EventEmitter-backed child whose
// stdout / stderr / pid / kill / exit lifecycle satisfies the cli-adapter's dispatch
// contract. Consumed by 16 src/tools/<name>/index.test.ts files (BI-031).
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

import { type SpawnLike } from "../cli-adapter/_dispatch.js";

export interface RegistrationStubOpts {
  stdout?: string;
  exitCode?: number;
}

export function makeRegistrationStubSpawn(opts: RegistrationStubOpts = {}): SpawnLike {
  return (binary, _argv, _options: SpawnOptions) => {
    void binary;
    const child = new EventEmitter() as EventEmitter & {
      stdout: Readable;
      stderr: Readable;
      kill: (signal?: NodeJS.Signals) => boolean;
      pid?: number;
    };
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.pid = 7;
    child.kill = () => true;
    setImmediate(() => {
      if (opts.stdout) child.stdout.push(Buffer.from(opts.stdout, "utf8"));
      child.stdout.push(null);
      child.stderr.push(null);
      setImmediate(() => child.emit("exit", opts.exitCode ?? 0, null));
    });
    return child as unknown as ReturnType<SpawnLike>;
  };
}
