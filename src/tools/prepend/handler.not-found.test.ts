// Original — no upstream. Spec 077 — prepend's missing-note failure: the pre-call stat check and Obsidian's confirmed "File not found" line both report NOTE_NOT_FOUND, with the same shape as append_note.
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  deps,
  errnoError,
  fakeFs,
  fakeRegistry,
  FILE_TSV_OK,
  PREPEND_OK,
  VAULT_ROOT,
} from "./_handler-fixtures.js";
import { executePrepend } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import {
  captureRejection,
  coldStartResponse,
  focusedFileResponse,
  makeQueuedSpawn,
  silentLogger,
} from "../_handler-test-fixtures.js";
import { executeAppendNote, type ExecuteFs as AppendNoteFs } from "../append_note/handler.js";

import type { FakeFsHandle } from "./_handler-fixtures.js";
import type { PrependInput } from "./schema.js";
import type { StubResponse } from "../_handler-test-fixtures.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

const VAULT = "TestVault";
const MISSING = "Sandbox/missing.md";

/** A note that is not on disk: the pre-call stat throws `thrown`. */
function missingNoteFs(thrown: Error = errnoError("ENOENT")): FakeFsHandle {
  return fakeFs({
    over: {
      stat: async () => {
        throw thrown;
      },
    },
  });
}

/** Run prepend in specific mode against `fs`, answering spawns with `responses`. */
function runPrepend(opts: {
  input?: Partial<PrependInput>;
  fs: FakeFsHandle;
  responses: StubResponse[];
}) {
  const queued = makeQueuedSpawn(opts.responses);
  const input: PrependInput = {
    target_mode: "specific",
    vault: VAULT,
    path: MISSING,
    content: "x",
    inline: false,
    ...opts.input,
  };
  const promise = executePrepend(
    input,
    deps({
      spawnFn: queued.spawnFn,
      vaultRegistry: fakeRegistry({ [VAULT]: VAULT_ROOT }),
      fs: opts.fs,
    }),
  );
  return { queued, promise };
}

/** The documented missing-note failure (FR-002 – FR-004), with no raw command output in the message (FR-003). */
function expectNoteNotFound(err: unknown, path: string, vault: string | null): UpstreamError {
  expect(err).toBeInstanceOf(UpstreamError);
  const e = err as UpstreamError;
  expect(e.code).toBe("CLI_REPORTED_ERROR");
  expect(e.details).toEqual({ code: "NOTE_NOT_FOUND", path, vault });
  expect(e.message).toBe(`Note "${path}" not found in vault.`);
  expect(e.message).not.toContain("prepend-cli");
  expect(e.message).not.toContain("Error: File");
  return e;
}

describe("pre-call check (spec 077 FR-001a)", () => {
  test.each([
    ["E1: default mode", MISSING, false],
    ["E2: inline mode", MISSING, true],
    ["E3: missing folder", "Sandbox/nofolder/missing.md", false],
  ])(
    "%s — NOTE_NOT_FOUND, Obsidian not called, nothing read or written",
    async (_label, path, inline) => {
      const thrown = errnoError("ENOENT");
      const fs = missingNoteFs(thrown);
      const { queued, promise } = runPrepend({
        input: { path, inline },
        fs,
        responses: [PREPEND_OK],
      });
      const err = expectNoteNotFound(await captureRejection(promise), path, VAULT);
      expect(err.cause).toBe(thrown);
      expect(queued.recorded.length).toBe(0);
      expect(fs.readCalls).toEqual([]);
      expect(fs.writes).toEqual([]);
    },
  );

  test("E11: active mode, focused note gone — focused path and resolved vault name, only the eval spawned", async () => {
    const fs = missingNoteFs();
    const queued = makeQueuedSpawn([focusedFileResponse("gone.md", VAULT_ROOT), PREPEND_OK]);
    const promise = executePrepend(
      { target_mode: "active", content: "x", inline: false },
      deps({ spawnFn: queued.spawnFn, vaultRegistry: fakeRegistry({ Knowledge: VAULT_ROOT }), fs }),
    );
    expectNoteNotFound(await captureRejection(promise), "gone.md", "Knowledge");
    expect(queued.recorded.length).toBe(1);
    expect(fs.writes).toEqual([]);
  });

  test("file-addressed note that resolves but is missing — resolved path echoed, only the resolver spawned", async () => {
    const fs = missingNoteFs();
    const { queued, promise } = runPrepend({
      input: { path: undefined, file: "ghost" },
      fs,
      responses: [FILE_TSV_OK("Sandbox/ghost.md"), PREPEND_OK],
    });
    expectNoteNotFound(await captureRejection(promise), "Sandbox/ghost.md", VAULT);
    expect(queued.recorded.length).toBe(1);
    expect(fs.writes).toEqual([]);
  });
});

describe("Obsidian's report (spec 077 FR-001b, FR-009)", () => {
  // The T0-confirmed wording (research F2): stdout, exit 0. These cases fail if the pattern
  // stops matching it.
  test.each([
    ["E4: case mismatch", "notes/plan.md", false, "\n"],
    ["E5: removed in between, inline", "Sandbox/gone.md", true, "\n"],
    ["CRLF-terminated line", "notes/plan.md", false, "\r\n"],
  ])("%s — NOTE_NOT_FOUND with the dispatch error as cause", async (_label, path, inline, eol) => {
    const line = `Error: File "${path}" not found.${eol}`;
    const fs = fakeFs({ sizes: [3, 3] });
    const { promise } = runPrepend({
      input: { path, inline },
      fs,
      responses: [{ stdout: line, exitCode: 0 }],
    });
    const err = expectNoteNotFound(await captureRejection(promise), path, VAULT);
    expect(err.cause).toBeInstanceOf(UpstreamError);
    expect((err.cause as UpstreamError).details).toMatchObject({ stdout: line });
    expect(fs.writes).toEqual([]);
  });
});

describe("parity with append_note (spec 077 FR-004)", () => {
  test.each([MISSING, "Sandbox/nofolder/missing.md"])(
    "%s: same code, details and message",
    async (path) => {
      const fs = missingNoteFs();
      const prependErr = await captureRejection(
        runPrepend({ input: { path }, fs, responses: [PREPEND_OK] }).promise,
      );

      const appendFs: AppendNoteFs = {
        realpath: async (p: string) => {
          if (p === VAULT_ROOT) return VAULT_ROOT;
          throw errnoError("ENOENT");
        },
        readFile: async () => {
          throw errnoError("ENOENT");
        },
        writeFile: async () => {},
        rename: async () => {},
        unlink: async () => {},
      };
      const appendErr = await captureRejection(
        executeAppendNote(
          { target_mode: "specific", vault: VAULT, path, content: "x", inline: false },
          {
            logger: silentLogger(),
            queue: createQueue(),
            vaultRegistry: fakeRegistry({ [VAULT]: VAULT_ROOT }),
            spawnFn: makeQueuedSpawn([]).spawnFn,
            env: {},
            fs: appendFs,
          },
        ),
      );

      expect(prependErr).toBeInstanceOf(UpstreamError);
      expect(appendErr).toBeInstanceOf(UpstreamError);
      const p = prependErr as UpstreamError;
      const a = appendErr as UpstreamError;
      expect(p.code).toBe(a.code);
      expect(p.details).toEqual(a.details);
      expect(p.message).toBe(a.message);
    },
  );
});

describe("other failures unchanged (spec 077 FR-007)", () => {
  test.each([
    ["folder not found", 'Error: Folder "Sandbox/x" not found.\n'],
    ["vault not found", "Vault not found.\n"],
  ])("%s — generic prepend-cli failure, no NOTE_NOT_FOUND", async (_label, stdout) => {
    const fs = fakeFs({ sizes: [3, 3] });
    const { promise } = runPrepend({ fs, responses: [{ stdout, exitCode: 0 }] });
    const err = (await captureRejection(promise)) as UpstreamError;
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    const details = err.details as Record<string, unknown>;
    expect(details.stage).toBe("prepend-cli");
    expect(details.code).toBeUndefined();
    expect(details.stdout).toBe(stdout);
  });

  test("cold start on both attempts — not NOTE_NOT_FOUND", async () => {
    const fs = fakeFs({ sizes: [3, 3] });
    const { promise } = runPrepend({
      fs,
      responses: [coldStartResponse("prepend"), coldStartResponse("prepend")],
    });
    const err = (await captureRejection(promise)) as UpstreamError;
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err.details as Record<string, unknown>).code).not.toBe("NOTE_NOT_FOUND");
  });
});
