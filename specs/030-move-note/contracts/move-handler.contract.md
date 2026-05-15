# Contract: `move` Tool Handler Invariants

**Branch**: `030-move-note` | **Date**: 2026-05-15 | **Spec**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)

This contract defines the handler-layer invariants for `move`: the dependency shape, the single-spawn invariant, the `resolveTo` helper contract, the `parseMoveResponse` helper (locked at T0 per R14), the failure propagation chain, and the test-seam pattern. Input validation is covered separately in [move-input.contract.md](./move-input.contract.md).

## Deps shape

```typescript
export interface MoveDeps {
  readonly logger: Logger;
  readonly queue: Queue;
  // Adapter pass-through for tests:
  readonly spawnFn?: (cmd: string, args: string[]) => ChildProcess;
  readonly env?: NodeJS.ProcessEnv;
  // (any future cli-adapter deps)
}
```

`createMoveTool({ logger, queue, ...deps })` is the factory exported from `index.ts`. `src/server.ts` passes the same `logger` instance to all tool registrations and the same `queue` instance to all CLI-invoking tools — single shared queue serialises all CLI invocations across all surfaces.

## Single-spawn invariant (R11)

Every `move` request fires **exactly ONE** `invokeCli` call. The handler tests assert `spawnFn.callCount === 1` in every test case via a shared `beforeEach` resetter and post-call assertion. Two-spawn architectures (pre-resolve source extension wrapper-side before computing `resolveTo`) were rejected at R6 for the `file=` and active modes; the wrapper accepts reduced source-`.md`-guard applicability in those modes rather than breaking the invariant.

## `invokeCli` call shape

```typescript
const result = await deps.queue.run(() =>
  invokeCli({
    command: "move",
    target_mode: input.target_mode,
    vault: input.target_mode === "specific" ? input.vault : undefined,
    parameters: deriveParameters(input),
    flags: [],  // move has no boolean flags
  }, deps)
);
```

`deriveParameters(input)` is a file-local function in `handler.ts` (~10 LOC) that emits a `Record<string, string>` per the per-mode argv-mapping table:

```typescript
function deriveParameters(input: MoveInput): Record<string, string> {
  const params: Record<string, string> = {};
  // Locator (specific mode only; active mode omits all locators)
  if (input.target_mode === "specific") {
    if (input.path !== undefined) {
      params.path = input.path;
    } else if (input.file !== undefined) {
      params.file = input.file;
    }
  }
  // Destination (both modes; resolveTo applies in specific + `path=` mode only)
  if (input.target_mode === "specific" && input.path !== undefined) {
    params.to = resolveTo(input.to, input.path);
  } else {
    params.to = input.to;  // file= and active modes forward verbatim
  }
  return params;
}
```

**Vault hoisting**: `vault` is passed as the TOP-LEVEL `invokeCli` field (per 011-write-note PSR-3 precedent), NOT inside `parameters`. The cli-adapter handles vault-token assembly and the active-mode locator-stripping defensive layer.

## Argv shape table (per per-mode argv-mapping in data-model.md)

| `target_mode` | Input | Argv emitted by adapter |
|----------------|--------|--------------------------|
| `specific` + `path=` | `{target_mode: "specific", vault: "V", path: "Inbox/Note.md", to: "Archive/"}` | `obsidian vault=V move path=Inbox/Note.md to=Archive/Note.md` |
| `specific` + `path=` (full-path-target with `.md` append) | `{target_mode: "specific", vault: "V", path: "Inbox/Note.md", to: "Archive/Renamed"}` | `obsidian vault=V move path=Inbox/Note.md to=Archive/Renamed.md` |
| `specific` + `path=` (non-`.md` source, full-path-target) | `{target_mode: "specific", vault: "V", path: "Boards/Plan.canvas", to: "Archive/Renamed"}` | `obsidian vault=V move path=Boards/Plan.canvas to=Archive/Renamed` (no append per source-`.md` guard) |
| `specific` + `file=` | `{target_mode: "specific", vault: "V", file: "Note", to: "Archive/"}` | `obsidian vault=V move file=Note to=Archive/` (verbatim; CLI handles) |
| `active` | `{target_mode: "active", to: "Archive/"}` | `obsidian move to=Archive/` (no `vault=`, no locator) |

## `resolveTo` helper contract

```typescript
function resolveTo(to: string, fromPath: string): string {
  // Branch 1: folder-target — preserve source basename
  if (to.endsWith("/")) {
    return to + basename(fromPath);
  }
  // Branch 2: full-path-target — source-`.md`-guarded `.md` append
  const filenamePortion = to.includes("/") ? to.slice(to.lastIndexOf("/") + 1) : to;
  if (fromPath.endsWith(".md") && !filenamePortion.endsWith(".md")) {
    return to + ".md";
  }
  return to;
}

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}
```

Both helpers are file-local in `handler.ts` (no exports), ~12 LOC combined. Both `endsWith` predicates are literal byte-equality, case-sensitive — mirrors the 020-fix-write-gaps R2 lock.

**Worked examples** (locked at /speckit-clarify Q1 + Q2, session 2026-05-15):

| `to` | `fromPath` | Output | Branch / why |
|------|------------|--------|--------------|
| `"Archive/"` | `"Inbox/Note.md"` | `"Archive/Note.md"` | Folder-target; basename preserved |
| `"Archive/2026/"` | `"Inbox/Tax-2026.md"` | `"Archive/2026/Tax-2026.md"` | Folder-target; nested subfolder |
| `"Archive/Renamed.md"` | `"Inbox/Note.md"` | `"Archive/Renamed.md"` | Full-path verbatim |
| `"Archive/Renamed"` | `"Inbox/Note.md"` | `"Archive/Renamed.md"` | Full-path + append (source-`.md` AND filename non-`.md`) |
| `"Archive/Doc.v1.draft"` | `"Inbox/Note.md"` | `"Archive/Doc.v1.draft.md"` | Full-path + append; internal periods preserved |
| `"Archive/Renamed.MD"` | `"Inbox/Note.md"` | `"Archive/Renamed.MD.md"` | Case-sensitive non-match → append |
| `"Archive/Plan.canvas"` | `"Inbox/Note.md"` | `"Archive/Plan.canvas.md"` | `.canvas` not in allowlist → append (cross-type intent NOT honoured by default) |
| `"Archive/Renamed"` | `"Boards/Plan.canvas"` | `"Archive/Renamed"` | **Source-`.md` guard suppression**: source is non-`.md` → append rule short-circuits; `to=` forwarded verbatim |
| `"Archive/Renamed.md"` | `"Boards/Plan.canvas"` | `"Archive/Renamed.md"` | Verbatim (caller-explicit `.md`; cross-type intent honoured on non-`.md` source) |
| `"Archive"` | `"Welcome.md"` | `"Archive.md"` | Surprise case: strict trailing-`/` discriminator treats as full-path; append fires |

**Wrapper-side applicability**: `resolveTo` is called only when `input.target_mode === "specific" && input.path !== undefined`. In `file=` and active modes the wrapper forwards `to=` verbatim and accepts the CLI's native handling per T0 case xiii. The source-`.md` guard's protection fully binds only in specific + `path=` mode; the spec documents this explicitly in `docs/tools/move.md` per FR-014.

## `parseMoveResponse` helper (locked at T0 per R14)

```typescript
function parseMoveResponse(stdout: string, input: MoveInput, resolvedTo: string): MoveOutput {
  // Anticipated shape per existing 011/012/021 precedent — confirm at T0:
  // Single-line: "Moved: <fromPath> → <toPath>\n"
  // OR two-line: "<fromPath>\n<toPath>\n"
  // OR empty + exit 0: fall back to deriving from input + resolvedTo
  // OR unknown shape: throw UpstreamError(CLI_REPORTED_ERROR) with stdout in details
  // The actual regex / parse rule binds at T0 of /speckit-implement.
  throw new Error("parseMoveResponse: locked at T0 — see FR-019 case (i)-(ii) for the CLI's verbatim wording");
}
```

The helper has **three possible response shapes** the wrapper supports:

1. **Single-line** `Moved: <fromPath> → <toPath>` — anticipated default per existing CLI conventions (cf. 011-write-note's `Created:` shape).
2. **Two-line** — fallback shape; one path per line.
3. **Empty stdout + exit 0** — handler derives `fromPath` from `input.path` (or CLI-resolved `file=` value via `parseFromPath(stdout)` capture) and `toPath` from the `resolvedTo` argv-token value.

**Unrecognised shape**: handler throws `UpstreamError({ code: "CLI_REPORTED_ERROR", details: { stage: "parse", stdout, message: "Move succeeded but the response shape was not recognised" } })`. This guards against silent passthrough of CLI changes — the contract is that future CLI versions can change wording, but the wrapper must surface the change as an error rather than synthesise a `MoveOutput` from possibly-wrong values.

The actual regex / parse rule is finalised at the T0 task per FR-019 case (i)-(ii). The handler's response-parsing code lives between the `invokeCli` return and the `MoveOutput` shape; future CLI version drift surfaces as test failures rather than silent regressions.

## Failure propagation chain

```text
Caller invokes `move(input)` →
  registerTool catches ZodError → asToolError({code: VALIDATION_ERROR, details: {issues}})
                                ↓ (validated input)
  executeMove(parsed, deps) →
    deps.queue.run(() => invokeCli({command: "move", target_mode, vault, parameters, flags}, deps)) →
      cli-adapter:
        spawn fails ENOENT → throws UpstreamError({code: CLI_BINARY_NOT_FOUND, details: {platform, attempts, PATH}})
        spawn succeeds, exits non-zero → throws UpstreamError({code: CLI_NON_ZERO_EXIT, details: {exitCode, stderr}})
        spawn succeeds, exits 0, stdout matches "Error: " prefix → throws UpstreamError({code: CLI_REPORTED_ERROR, details: {message}})
          • source-not-found per F3 → CLI_REPORTED_ERROR with verbatim "Error: File \"<path>\" not found."
          • destination-collision per T0 case (vi) → CLI_REPORTED_ERROR with verbatim CLI wording
          • active-mode no-focused-note per T0 case (ix) → CLI_REPORTED_ERROR with verbatim "Error: No active file." (capital-N; the bridge classifier targets lowercase only — inherited mismatch per R9)
        spawn succeeds, exits 0, stdout matches "Vault not found." per 011-R5 → throws UpstreamError({code: CLI_REPORTED_ERROR, details: {message: "Vault not found."}})
        spawn succeeds, exits 0, recognised success shape → returns stdout to caller
                                ↓ (stdout)
      parseMoveResponse(stdout, input, resolvedTo) →
        recognised shape → return {moved: true, fromPath, toPath}
        unrecognised shape → throws UpstreamError({code: CLI_REPORTED_ERROR, details: {stage: "parse", stdout}})
                                ↓
  registerTool catches UpstreamError → asToolError({code, message, details})
  registerTool re-throws any other exception (no asToolError wrapping)
                                ↓
  MCP response sent to caller
```

**Note on the inherited classifier mismatch (R9)**: the bridge's dispatch-layer classifier targets lowercase `Error: no active file`; the CLI's `move` subcommand emits capital-N `Error: No active file.`. The capital-N reply does NOT classify as `ERR_NO_ACTIVE_FILE`; it falls through to `CLI_REPORTED_ERROR` with `details.message` carrying the verbatim line. SC-014 is the load-bearing test assertion for this case — the handler must propagate `CLI_REPORTED_ERROR`, NOT synthesise `ERR_NO_ACTIVE_FILE`.

## Test seam pattern

Tests inject the stub adapter via `deps.spawnFn`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { createMoveTool } from "./index.js";

describe("move handler", () => {
  it("happy path: specific + path + folder-target", async () => {
    const spawnFn = vi.fn().mockReturnValue(mockChildProcess({
      stdout: "Moved: Inbox/Note.md → Archive/Note.md\n",
      exitCode: 0,
    }));
    const tool = createMoveTool({
      logger: noopLogger,
      queue: new Queue(),
      spawnFn,
    });
    const result = await tool.handler({
      target_mode: "specific",
      vault: "MyVault",
      path: "Inbox/Note.md",
      to: "Archive/",
    });
    expect(result).toEqual({
      content: [{ type: "text", text: JSON.stringify({
        moved: true,
        fromPath: "Inbox/Note.md",
        toPath: "Archive/Note.md",
      }) }]
    });
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(spawnFn).toHaveBeenCalledWith("obsidian", expect.arrayContaining([
      "vault=MyVault", "move", "path=Inbox/Note.md", "to=Archive/Note.md",
    ]));
  });
});
```

The stub `spawnFn` is the test seam. Real `child_process.spawn` is never invoked in CI. The single-spawn invariant is enforced via the `.toHaveBeenCalledTimes(1)` assertion in every handler test.

## Anti-injection structural property

The cli-adapter assembles argv as a `child_process.spawn` array (no shell). No character in `vault` / `file` / `path` / `to` can break out into a shell command — this is a structural property of `spawn(cmd, args[])` with no `{shell: true}` flag. Path-traversal on `to` (the only remaining security concern for untrusted input) is gated by SC-012 + T0 case (x).

## Idempotence and ordering

`move` is NOT idempotent — calling twice with the same input either succeeds the first time and fails the second (destination collision or source-not-found, depending on what state the second call observes), or fails both times if the first encounters an error. The single in-flight CLI queue (FR-008) serialises concurrent calls; deterministic ordering means the first acquirer wins. Same-folder move with the same destination (Story 8 — rename equivalence with `fromPath === toPath`) is handled by the CLI per its native rules, not by the wrapper.

## Cross-tool invariants preserved

| Invariant | Mechanism |
|-----------|-----------|
| 008-refactor surface frozen | The handler routes through `invokeCli` only; the adapter's surface is unchanged. |
| 011-R5 unknown-vault inspection clause inherited | F2 confirmed the response signature matches; no code change to the adapter. |
| 017-cross-platform-support binary resolver inherited | The handler does not interact with binary resolution. |
| Post-022 registry baseline rolled forward | `npm run baseline:write` lands in the same commit per R13 / FR-013a. |
| Existing typed tools unchanged | SC-009 — `git diff` shows zero substantive diff in `src/tools/<other-tool>/`. |
