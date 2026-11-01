// Original — no upstream. Shared test fixture for the typed-tool registration cohort:
// returns a SpawnLike that constructs a one-shot EventEmitter-backed child whose
// stdout / stderr / pid / kill / exit lifecycle satisfies the cli-adapter's dispatch
// contract. Consumed by 16 src/tools/<name>/index.test.ts files (BI-031). Spec 080: answer-tag
// aware like _handler-test-fixtures.ts — on a wrapped eval, string stdout's `=> ` lines are tagged
// with the call's tag, and function-form stdout receives the tag and is emitted verbatim.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

import { type SpawnLike } from "../cli-adapter/_dispatch.js";

export interface RegistrationStubOpts {
  stdout?: string | ((ctx: { answerTag?: string }) => string);
  exitCode?: number;
}

// Mirrors wrapEvalCode in src/cli-adapter/_eval-answer.ts (kept local; see _handler-test-fixtures.ts).
const WRAPPED_CODE_HEAD = "code=(async()=>'<<";
const WRAPPED_CODE_TAG_END = ">>'+(await (";

function answerTag(argv: string[]): string | undefined {
  const arg = argv.find((a) => a.startsWith(`${WRAPPED_CODE_HEAD}ocm-`));
  const end = arg?.indexOf(WRAPPED_CODE_TAG_END) ?? -1;
  return arg === undefined || end < 0 ? undefined : arg.slice(WRAPPED_CODE_HEAD.length, end);
}

function renderStdout(stdout: RegistrationStubOpts["stdout"], argv: string[]): string | undefined {
  if (stdout === undefined) return undefined;
  const tag = answerTag(argv);
  if (typeof stdout === "function") return stdout({ answerTag: tag });
  if (tag === undefined) return stdout;
  return stdout
    .split("\n")
    .map((line) => (line.startsWith("=> ") ? `=> <<${tag}>>${line.slice(3)}` : line))
    .join("\n");
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
    const stdout = renderStdout(opts.stdout, argv);
    setImmediate(() => {
      if (stdout) child.stdout.push(Buffer.from(stdout, "utf8"));
      child.stdout.push(null);
      child.stderr.push(null);
      setImmediate(() => child.emit("exit", opts.exitCode ?? 0, null));
    });
    return child as unknown as ReturnType<SpawnLike>;
  };
}
