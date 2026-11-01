// Original — no upstream. Shared test fixture for the typed-tool registration cohort:
// returns a SpawnLike that constructs a one-shot EventEmitter-backed child whose
// stdout / stderr / pid / kill / exit lifecycle satisfies the cli-adapter's dispatch
// contract. Consumed by 16 src/tools/<name>/index.test.ts files (BI-031). Spec 080: answer-tag
// aware through _handler-test-fixtures.ts's renderStubStdout — on a wrapped eval, string stdout's
// `=> ` lines are tagged with the call's tag, and function-form stdout receives the tag verbatim.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

import { renderStubStdout, type StubStdout } from "./_handler-test-fixtures.js";
import { type SpawnLike } from "../cli-adapter/_dispatch.js";

export interface RegistrationStubOpts {
  stdout?: StubStdout;
  exitCode?: number;
}

export function makeRegistrationStubSpawn(opts: RegistrationStubOpts = {}): SpawnLike {
  return (binary, argv, _options: SpawnOptions) => {
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
    const stdout = renderStubStdout(opts.stdout, argv);
    setImmediate(() => {
      if (stdout) child.stdout.push(Buffer.from(stdout, "utf8"));
      child.stdout.push(null);
      child.stderr.push(null);
      setImmediate(() => child.emit("exit", opts.exitCode ?? 0, null));
    });
    return child as unknown as ReturnType<SpawnLike>;
  };
}
