// Original — no upstream. Tests for the move handler — argv assembly per /speckit-clarify Q1+Q2 (resolveTo: trailing-`/` discriminator + source-`.md`-guarded `.md` append), parseMoveResponse against anticipated single-line shape, single-spawn invariant (R11), UpstreamError propagation across the four cli-adapter codes + capital-N CLI_REPORTED_ERROR (R9 inherited classifier mismatch), same-folder-move rename equivalence (Story 8).
import { afterEach, beforeEach, expect, test } from "vitest";

import { executeMove } from "./handler.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import { makeStubSpawn, silentLogger, captureRejection } from "../_handler-test-fixtures.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// =========================================================================
// US1 — Specific-mode + folder-target `to` (5 cases)
// =========================================================================

// Case 1 — Story 1 AC#1: folder-target preserves source basename
test("specific+path+folder-target `to: 'Archive/'` → argv to=Archive/Tax-2026.md; response carries canonical from/to (Story 1 AC#1)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Moved: Inbox/Tax-2026.md → Archive/Tax-2026.md\n",
    exitCode: 0,
  });
  const result = await executeMove(
    { target_mode: "specific", vault: "MyVault", path: "Inbox/Tax-2026.md", to: "Archive/" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({
    moved: true,
    fromPath: "Inbox/Tax-2026.md",
    toPath: "Archive/Tax-2026.md",
  });
  expect(recorded[0]!.argv).toEqual([
    "vault=MyVault",
    "move",
    "path=Inbox/Tax-2026.md",
    "to=Archive/Tax-2026.md",
  ]);
});

// Case 2 — Story 1 AC#2: nested subfolder folder-target
test("specific+path+folder-target nested `to: 'Archive/2026/'` → argv to=Archive/2026/Tax-2026.md (Story 1 AC#2)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Moved: Inbox/Tax-2026.md → Archive/2026/Tax-2026.md\n",
    exitCode: 0,
  });
  await executeMove(
    { target_mode: "specific", vault: "V", path: "Inbox/Tax-2026.md", to: "Archive/2026/" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded[0]!.argv).toContain("to=Archive/2026/Tax-2026.md");
});

// Case 3 — Story 1 AC#3: folder-target preserves internal-periods source basename
test("folder-target preserves internal-periods source basename: path=Drafts/Doc.v1.draft.md → to=Archive/Doc.v1.draft.md (Story 1 AC#3)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Moved: Drafts/Doc.v1.draft.md → Archive/Doc.v1.draft.md\n",
    exitCode: 0,
  });
  await executeMove(
    { target_mode: "specific", vault: "V", path: "Drafts/Doc.v1.draft.md", to: "Archive/" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded[0]!.argv).toContain("to=Archive/Doc.v1.draft.md");
});

// Case 4 — R11 single-spawn invariant
test("R11 single-spawn invariant: specific+path → spawnFn.callCount === 1", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Moved: Inbox/N.md → Archive/N.md\n",
    exitCode: 0,
  });
  await executeMove(
    { target_mode: "specific", vault: "V", path: "Inbox/N.md", to: "Archive/" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded).toHaveLength(1);
});

// Case 5 — Vault hoist: vault=V is a discrete top-level token (011 PSR-3)
test("specific+path: argv has 'vault=V' as discrete token at position 0 (PSR-3 vault hoist)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Moved: P.md → Archive/P.md\n",
    exitCode: 0,
  });
  await executeMove(
    { target_mode: "specific", vault: "V", path: "P.md", to: "Archive/" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded[0]!.argv[0]).toBe("vault=V");
  expect(recorded[0]!.argv[1]).toBe("move");
});

// =========================================================================
// US2 — Specific-mode + full-path-target with source-`.md` guard (6 cases)
// =========================================================================

// Case 6 — Story 2 AC#1: full-path with explicit `.md` forwarded verbatim
test("full-path with explicit `.md`: `to: 'Archive/Renamed.md'` → argv to=Archive/Renamed.md (Story 2 AC#1)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Moved: Inbox/Tax-2026.md → Archive/Renamed.md\n",
    exitCode: 0,
  });
  const result = await executeMove(
    {
      target_mode: "specific",
      vault: "V",
      path: "Inbox/Tax-2026.md",
      to: "Archive/Renamed.md",
    },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded[0]!.argv).toContain("to=Archive/Renamed.md");
  expect(result.fromPath).toBe("Inbox/Tax-2026.md");
  expect(result.toPath).toBe("Archive/Renamed.md");
});

// Case 7 — Story 2 AC#2: full-path with `.md` append on `.md` source
test("full-path append on `.md` source: `to: 'Archive/Renamed'` → argv to=Archive/Renamed.md (Story 2 AC#2)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Moved: Inbox/Tax-2026.md → Archive/Renamed.md\n",
    exitCode: 0,
  });
  await executeMove(
    { target_mode: "specific", vault: "V", path: "Inbox/Tax-2026.md", to: "Archive/Renamed" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded[0]!.argv).toContain("to=Archive/Renamed.md");
});

// Case 8 — internal-periods filename portion preserved + append
test("full-path append preserves internal periods: `to: 'Archive/Doc.v1.draft'` → argv to=Archive/Doc.v1.draft.md", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Moved: Inbox/N.md → Archive/Doc.v1.draft.md\n",
    exitCode: 0,
  });
  await executeMove(
    { target_mode: "specific", vault: "V", path: "Inbox/N.md", to: "Archive/Doc.v1.draft" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded[0]!.argv).toContain("to=Archive/Doc.v1.draft.md");
});

// Case 9 — case-sensitive `.MD` ≠ `.md` → append
test("case-sensitive `.MD` ≠ `.md`: `to: 'Archive/Renamed.MD'` → argv to=Archive/Renamed.MD.md", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Moved: Inbox/N.md → Archive/Renamed.MD.md\n",
    exitCode: 0,
  });
  await executeMove(
    { target_mode: "specific", vault: "V", path: "Inbox/N.md", to: "Archive/Renamed.MD" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded[0]!.argv).toContain("to=Archive/Renamed.MD.md");
});

// Case 10 — SC-013 LOAD-BEARING: source-`.md` guard suppression on non-`.md` source
test("SC-013 source-`.md`-guard suppression on non-`.md` source: path=Boards/Plan.canvas, to=Archive/Renamed → argv to=Archive/Renamed (no append; prevents silent .canvas→.md conversion)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Moved: Boards/Plan.canvas → Archive/Renamed\n",
    exitCode: 0,
  });
  await executeMove(
    {
      target_mode: "specific",
      vault: "V",
      path: "Boards/Plan.canvas",
      to: "Archive/Renamed",
    },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded[0]!.argv).toContain("to=Archive/Renamed");
  expect(recorded[0]!.argv.some((t) => t === "to=Archive/Renamed.md")).toBe(false);
});

// Case 11 — caller-explicit `.md` preserved on non-`.md` source
test("caller-explicit `.md` preserved on non-`.md` source: path=Boards/Plan.canvas, to=Archive/Renamed.md → argv to=Archive/Renamed.md (verbatim)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Moved: Boards/Plan.canvas → Archive/Renamed.md\n",
    exitCode: 0,
  });
  await executeMove(
    {
      target_mode: "specific",
      vault: "V",
      path: "Boards/Plan.canvas",
      to: "Archive/Renamed.md",
    },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded[0]!.argv).toContain("to=Archive/Renamed.md");
});

// =========================================================================
// US2 — Specific-mode + wikilink locator (`file=`) (2 cases)
// =========================================================================

// Case 12 — Story 2 AC#4: file= locator + folder-target `to` forwarded verbatim
test("specific+file+folder-target: file=Tax-2026, to=Archive/ → argv has file=, to=Archive/ verbatim (no wrapper-side resolveTo) (Story 2 AC#4)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Moved: Inbox/Tax-2026.md → Archive/Tax-2026.md\n",
    exitCode: 0,
  });
  const result = await executeMove(
    { target_mode: "specific", vault: "V", file: "Tax-2026", to: "Archive/" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded[0]!.argv).toContain("file=Tax-2026");
  expect(recorded[0]!.argv).toContain("to=Archive/");
  expect(recorded[0]!.argv.some((t) => t.startsWith("path="))).toBe(false);
  expect(result.fromPath).toBe("Inbox/Tax-2026.md");
  expect(result.toPath).toBe("Archive/Tax-2026.md");
});

// Case 13 — UTF-8 byte-perfect forwarding (file= mode)
test("UTF-8 byte-perfect forwarding: file=笔记, to=Archive/ → argv tokens exact UTF-8 bytes", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Moved: 笔记.md → Archive/笔记.md\n",
    exitCode: 0,
  });
  await executeMove(
    { target_mode: "specific", vault: "V", file: "笔记", to: "Archive/" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded[0]!.argv).toContain("file=笔记");
  expect(recorded[0]!.argv).toContain("to=Archive/");
});

// =========================================================================
// US5 — Active mode + capital-N classifier mismatch (2 cases)
// =========================================================================

// Case 14 — Story 5 AC#1: active mode → argv has no locator tokens
test("active+to → argv has 'move', 'to=Archive/', NO vault/file/path tokens (Story 5 AC#1)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Moved: Inbox/focused.md → Archive/focused.md\n",
    exitCode: 0,
  });
  const result = await executeMove(
    { target_mode: "active", to: "Archive/" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({
    moved: true,
    fromPath: "Inbox/focused.md",
    toPath: "Archive/focused.md",
  });
  expect(recorded[0]!.argv).toContain("move");
  expect(recorded[0]!.argv).toContain("to=Archive/");
  expect(recorded[0]!.argv.some((t) => t.startsWith("vault="))).toBe(false);
  expect(recorded[0]!.argv.some((t) => t.startsWith("file="))).toBe(false);
  expect(recorded[0]!.argv.some((t) => t.startsWith("path="))).toBe(false);
});

// Case 15 — SC-014 LOAD-BEARING: capital-N typed-error classifier behaviour
// (BI-041 FR-001 widening). The native `move` subcommand emits capital-N
// `Error: No active file.` on no-focused-note. The bridge's dispatch-layer
// classifier is case-insensitive (BI-041) — the call surfaces as the typed
// ERR_NO_ACTIVE_FILE sub-discriminator with the documented recovery message,
// no longer the bare CLI_REPORTED_ERROR. Documents observable behaviour;
// regression-guards the BI-041 widening for the `move` cohort tool which shares
// the dispatch classifier. (R9 / spec Background / BI-041 FR-001 / FR-002)
test("active mode no-focused-note → ERR_NO_ACTIVE_FILE typed surface (SC-014 / R9 inherited / BI-041 FR-001)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Error: No active file.\n",
    exitCode: 0,
  });
  const err = (await captureRejection(
    executeMove(
      { target_mode: "active", to: "Archive/" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
  expect(err.message).toBe(
    'No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: "specific" and an explicit vault/file.',
  );
  expect(err.details.message).toBe("Error: No active file.");
  expect(recorded).toHaveLength(1);
});

// =========================================================================
// US3 — Source-not-found and destination-collision structured errors (2 cases)
// =========================================================================

// Case 16 — Story 3 AC#1: source-not-found → CLI_REPORTED_ERROR verbatim
test("source-not-found → CLI_REPORTED_ERROR with verbatim 'Error: File \"<path>\" not found.' (Story 3 AC#1 / F3)", async () => {
  const { spawnFn } = makeStubSpawn({
    stdout: 'Error: File "Sandbox/Missing.md" not found.\n',
    exitCode: 0,
  });
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "V", path: "Sandbox/Missing.md", to: "Archive/" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.message).toBe('Error: File "Sandbox/Missing.md" not found.');
});

// Case 17 — Story 3 AC#2: destination-collision → CLI_REPORTED_ERROR verbatim
test("destination-collision → CLI_REPORTED_ERROR with verbatim 'Error: Destination file already exists!' (Story 3 AC#2)", async () => {
  const { spawnFn } = makeStubSpawn({
    stdout: "Error: Destination file already exists!\n",
    exitCode: 0,
  });
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "V", path: "Sandbox/a.md", to: "Sandbox/b.md" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.message).toBe("Error: Destination file already exists!");
});

// =========================================================================
// US6 — CLI failure propagation across the four adapter codes + parse failure + non-UpstreamError (6 cases)
// =========================================================================

// Case 18 — Story 6 AC#1: ENOENT spawn → CLI_BINARY_NOT_FOUND
test("ENOENT on spawn → CLI_BINARY_NOT_FOUND (Story 6 AC#1)", async () => {
  const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  const { spawnFn } = makeStubSpawn({ errorOnSpawn: enoent });
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "V", path: "P.md", to: "Archive/" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
});

// Case 19 — Story 6 AC#2: non-zero exit + stderr → CLI_NON_ZERO_EXIT
test("non-zero exit + stderr → CLI_NON_ZERO_EXIT (Story 6 AC#2)", async () => {
  const { spawnFn } = makeStubSpawn({ stderr: "permission denied", exitCode: 1 });
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "V", path: "P.md", to: "Archive/" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
  expect(err.details.exitCode).toBe(1);
  expect(err.details.stderr).toBe("permission denied");
});

// Case 20 — Story 6 AC#3: exit-0 'Error:' prefix → CLI_REPORTED_ERROR
test("exit-0 stdout 'Error: <msg>' → CLI_REPORTED_ERROR (Story 6 AC#3)", async () => {
  const { spawnFn } = makeStubSpawn({
    stdout: "Error: something went wrong\n",
    exitCode: 0,
  });
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "V", path: "P.md", to: "Archive/" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.message).toBe("Error: something went wrong");
});

// Case 21 — 011-R5 inherited: unknown-vault response → CLI_REPORTED_ERROR
test("unknown-vault stdout 'Vault not found.' → CLI_REPORTED_ERROR (011-R5 inherited / F2)", async () => {
  const { spawnFn } = makeStubSpawn({
    stdout: "Vault not found.\n",
    exitCode: 0,
  });
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "DoesNotExist", path: "P.md", to: "Archive/" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.message).toBe("Vault not found.");
});

// Case 22 — Story 6 AC#4: non-UpstreamError re-thrown verbatim
test("non-UpstreamError exception is re-thrown verbatim, NO asToolError wrapping (Story 6 AC#4)", async () => {
  const synthetic = new TypeError("boom");
  const { spawnFn } = makeStubSpawn({ errorOnSpawn: synthetic });
  const rejection = await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "V", path: "P.md", to: "Archive/" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  );
  expect(rejection).toBe(synthetic);
  expect(rejection).not.toBeInstanceOf(UpstreamError);
});

// Case 23 — parseMoveResponse failure: unparseable stdout → CLI_REPORTED_ERROR
test("parseMoveResponse failure: unparseable stdout 'OK\\n' → CLI_REPORTED_ERROR with details.stage='parse'", async () => {
  const { spawnFn } = makeStubSpawn({
    stdout: "OK\n",
    exitCode: 0,
  });
  const err = (await captureRejection(
    executeMove(
      { target_mode: "specific", vault: "V", path: "P.md", to: "Archive/" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.stage).toBe("parse");
  expect(err.details.stdout).toBe("OK\n");
});

// =========================================================================
// US8 — Same-folder move = rename equivalence (1 case)
// =========================================================================

// Case 24 — Story 8 AC#1: same-folder move → dirname(fromPath) === dirname(toPath)
test("same-folder move: response carries renamed-equivalence marker (dirname(fromPath) === dirname(toPath)) (Story 8 AC#1)", async () => {
  const { spawnFn } = makeStubSpawn({
    stdout: "Moved: Inbox/Old.md → Inbox/New.md\n",
    exitCode: 0,
  });
  const result = await executeMove(
    { target_mode: "specific", vault: "V", path: "Inbox/Old.md", to: "Inbox/New.md" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({
    moved: true,
    fromPath: "Inbox/Old.md",
    toPath: "Inbox/New.md",
  });
  const dirname = (p: string): string => {
    const i = p.lastIndexOf("/");
    return i === -1 ? "" : p.slice(0, i);
  };
  expect(dirname(result.fromPath)).toBe(dirname(result.toPath));
});

// =========================================================================
// parseMoveResponse — empty-stdout fallback (1 case)
// =========================================================================

// Case 25 — parseMoveResponse L38-40 empty-stdout synthesis: empty stdout + exit 0
// is classified success (dispatch priority d). When the native `move` subcommand
// returns no confirmation line, parseMoveResponse synthesizes the canonical
// from/to from the resolved input: fromPath=input.path, toPath=resolvedTo
// (resolveTo folder-target preserves source basename → Archive/Tax-2026.md).
// No "Moved:" line, no two-line shape — the empty+specific+path branch.
test("empty stdout + exit 0 (specific+path) → parseMoveResponse synthesizes fromPath=input.path, toPath=resolvedTo (L38-40)", async () => {
  const { spawnFn } = makeStubSpawn({ stdout: "", exitCode: 0 });
  const result = await executeMove(
    { target_mode: "specific", vault: "V", path: "Inbox/Tax-2026.md", to: "Archive/" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({
    moved: true,
    fromPath: "Inbox/Tax-2026.md",
    toPath: "Archive/Tax-2026.md",
  });
});
