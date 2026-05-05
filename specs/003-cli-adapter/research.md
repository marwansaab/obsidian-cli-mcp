# Research: CLI Adapter

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-05

## Status

No `NEEDS CLARIFICATION` items remain after [spec.md](./spec.md)'s three clarifications (one `/speckit-clarify` session on 2026-05-05). This document records the empirical decisions, project-internal precedents, and plan-stage resolutions that Phase 1 design depends on.

## Decisions inherited from spec.md clarifications

| ID | Decision | Source |
|----|----------|--------|
| Q1 | Adapter signature is `invokeCli(input: { command, parameters, flags, target_mode }, deps?: { spawnFn?, env? })` — two-arg shape mirroring [executeObsidianExec at handler.ts:51](../../src/tools/obsidian_exec/handler.ts#L51). Tests inject `deps.spawnFn`. | spec.md Clarifications, FR-002, Key Entities |
| Q2 | New stable error code is `ERR_NO_ACTIVE_FILE`, matching the deliberate naming in [ADR-004](../../.decisions/ADR-004%20-%20Centralized%20Obsidian%20CLI%20Adapter.md) and the [Architecture document](../../.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md). The `ERR_*` prefix is intentionally distinct from the `CLI_*` family — it marks this code as a recoverable user-action signal (open a note, or switch to `target_mode: "specific"`), not a CLI-process failure. An initial /speckit-clarify Q2 answer renamed to `CLI_NO_ACTIVE_FILE` for cosmetic prefix uniformity but was reversed during /speckit-plan when the ADR-004 conflict surfaced. | spec.md Clarifications, FR-008(b), FR-012, FR-013, FR-016, Key Entities, Assumptions |
| Q3 | Signal-only termination (`code === null`, `signal !== null`) sets `details.exitCode = -1` (sentinel) and `details.signal = signalName`, mirroring the precedent at [handler.ts:238](../../src/tools/obsidian_exec/handler.ts#L238) (`const exitCode = code ?? -1`). | spec.md Clarifications, FR-008(a), FR-016(j), Edge Cases |

## Plan-stage decisions resolved during this Phase 0

The spec deliberately deferred three decisions to plan stage (FR-001 export name, FR-008(b) recovery-message wording, FR-017 coverage-floor numeric value). All three are resolved here:

| ID | Decision | Rationale |
|----|----------|-----------|
| P1 (FR-001) | Export name is `invokeCli`. | Imperative verb-noun matches existing project naming (`executeObsidianExec`, `killActiveChild`). `Cli` is the established acronym in identifiers (per `OBSIDIAN_EXEC_*` prefix). No collision risk — no other adapter or service in the repo carries this verb. |
| P2 (FR-008(b)) | `UpstreamError.message` for `ERR_NO_ACTIVE_FILE` is `"No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: \"specific\" and an explicit vault/file."` | Matches the spec's "or substantively equivalent" parenthetical: both recovery paths (open file vs. switch to specific mode) are named, and the exact `target_mode` string and its allowed value are spelled out so an LLM consumer can construct the recovery call without re-parsing. |
| P3 (FR-017) | Coverage-floor numeric value MUST not regress below the v0.1.1 floor (84.3% statements, pinned in [vitest.config.ts](../../vitest.config.ts) by feature 002). | The new module + its ten tests are net-additive; pre-implementation projection is the actual statements coverage moves *up* by ~0.3–0.5pp once the new code path is exercised. The merge-gate floor stays at 84.3% and ratchets via a separate visible edit per the constitution's single-source-of-truth rule (v1.1.0 §Development Workflow #5). |

## v0.1.x baselines reaffirmed

These constraints carry through unchanged from 001/002 and are *not* re-litigated by this feature:

- **`UpstreamError` is the single boundary-error type** ([src/errors.ts:10](../../src/errors.ts#L10), Constitution Principle IV). The adapter's four reachable rejection codes (`CLI_NON_ZERO_EXIT`, `ERR_NO_ACTIVE_FILE`, `CLI_REPORTED_ERROR`, `CLI_BINARY_NOT_FOUND`) are all members of the existing `UpstreamError.code` enumeration; no new error class is introduced. The adapter re-exports `UpstreamError` per FR-011 so that consumers have one import path.
- **MCP serialization drops `cause`** (canonical contract at [001 contract:117-143](../001-add-cli-bridge/contracts/errors.contract.md#L117-L143)). For `ERR_NO_ACTIVE_FILE`, `cause` is `null` (FR-008(b)); the relevant context — the trimmed first line of stdout — is mirrored into `details.message`. Same pattern as `CLI_REPORTED_ERROR` from feature 002.
- **Binary path resolution**: `(deps.env ?? process.env).OBSIDIAN_BIN ?? "obsidian"` per the [handler.ts:60-61](../../src/tools/obsidian_exec/handler.ts#L60-L61) precedent. FR-006 in the spec lists `process.env.OBSIDIAN_BIN ?? "obsidian"` as a shorthand; the deps-aware form is the implementation contract per Q1's "mirror executeObsidianExec." Implementation MUST fold `deps.env` into the resolution chain.
- **Spawn-time `ENOENT` mapping**: matches [handler.ts:82-91](../../src/tools/obsidian_exec/handler.ts#L82-L91) and [handler.ts:155-163](../../src/tools/obsidian_exec/handler.ts#L155-L163) — `UpstreamError` with `code: "CLI_BINARY_NOT_FOUND"`, `cause: <native error>`, `details: { binaryAttempted, PATH }`. Other native spawn errors propagate as-is per FR-010.
- **Vitest + `@vitest/coverage-v8`** is the test framework (per constitution v1.1.0). The `*.test.ts` file at `src/cli-adapter/cli-adapter.test.ts` runs alongside the existing test set with no config changes.
- **CRLF absorption**: `stdout.split('\n', 1)[0].trim()` is the project-canonical first-line algorithm (FR-009 references spec 002's FR-003 verbatim). The trim absorbs trailing `\r` from Windows CRLF without a regex.

## Module structure

The new module lives at `src/cli-adapter/` — a new directory under `src/` parallel to `src/tools/`. The directory contains exactly two files:

```text
src/cli-adapter/
├── cli-adapter.ts         # invokeCli + types + UpstreamError re-export
└── cli-adapter.test.ts    # ten co-located vitest cases (FR-016 a-j)
```

The directory deliberately does NOT include a `schema.ts` (no zod boundary — Principle III is satisfied at the calling tool's surface) or a `tool.ts` / `command.ts` (no MCP/CLI registration — FR-015). This is intentional: the adapter is a shared primitive, not a per-surface module, so the project's `{schema, command, handler}` triplet does not apply. Future typed-tool BIs (e.g., `src/tools/read_note/`) follow the triplet convention and import the adapter from this module.

## Detection-site analysis

The four-priority classification (FR-008) lands inside the `child.on("close", ...)` callback. The exact structure (pseudocode):

```ts
child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const stderr = Buffer.concat(stderrChunks).toString("utf8");
  const exitCode = code ?? -1;  // Q3 sentinel for signal-only termination

  // Priority (a): non-zero exit
  if (code !== 0) {
    reject(new UpstreamError({
      code: "CLI_NON_ZERO_EXIT",
      cause: { exitCode, signal },
      details: { command, stdout, stderr, exitCode, signal },
    }));
    return;
  }

  const trimmedHead = stdout.trimStart();

  // Priority (b): exit-0 with "Error: no active file" prefix
  if (trimmedHead.startsWith("Error: no active file")) {
    reject(new UpstreamError({
      code: "ERR_NO_ACTIVE_FILE",
      cause: null,
      details: {
        command,
        stdout,
        stderr,
        exitCode: 0,
        message: stdout.split("\n", 1)[0]!.trim(),
      },
      message: 'No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: "specific" and an explicit vault/file.',
    }));
    return;
  }

  // Priority (c): exit-0 with any other "Error:" prefix
  if (trimmedHead.startsWith("Error:")) {
    reject(new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: {
        command,
        stdout,
        stderr,
        exitCode: 0,
        message: stdout.split("\n", 1)[0]!.trim(),
      },
    }));
    return;
  }

  // Priority (d): success
  resolve({ stdout, stderr });
});
```

The non-null assertion on `split("\n", 1)[0]!` is safe — `String.prototype.split` always returns at least one element. Priority (b) MUST be tested before priority (c) so that `Error: no active file` (a strict prefix of `Error:`) takes precedence; this is FR-008's strict order requirement and the FR-016(h) boundary-discrimination test enforces it.

The argv assembly happens before `spawn` is called:

```ts
const stripped = target_mode === "active"
  ? omit(parameters, ["vault", "file", "path"])
  : parameters;
const { vault, ...rest } = stripped;
const vaultToken = vault !== undefined ? [`vault=${String(vault)}`] : [];
const restTokens = Object.entries(rest)
  .filter(([, v]) => v !== undefined)
  .map(([k, v]) => `${k}=${String(v)}`);
const argv = [command, ...vaultToken, ...restTokens, ...flags];
```

The vault-hoisting is unconditional (when present): the `{ vault, ...rest }` destructure pulls vault out regardless of insertion order in the input record (FR-005 invariant; AC #4 of Story 1).

## Logger.ErrorCode union — NOT extended this feature

A noteworthy contrast with feature 002: feature 002 extended [src/logger.ts](../../src/logger.ts)'s `ErrorCode` union to include `"CLI_REPORTED_ERROR"` because the bridge handler's `Logger.callEndFailure` path emitted that code. Feature 003 does **not** make a parallel extension for `ERR_NO_ACTIVE_FILE`. Reason: per spec Assumptions ("The adapter has no internal logger"), the adapter never invokes any logger. The `ERR_NO_ACTIVE_FILE` code is constructed by the adapter and propagated to the calling typed-tool handler, which then decides whether and how to log it (each typed tool owns its own per-call correlation context). Until a typed-tool BI lands that wires `ERR_NO_ACTIVE_FILE` through `Logger.callEndFailure`, the union stays at its current five members. When such a BI lands, extending the union is a one-line change in that BI's plan.

## Alternatives considered (and rejected)

| Alternative | Why rejected |
|-------------|--------------|
| Refactor `executeObsidianExec` to use the new adapter | Out of scope per spec. The existing handler has its own timeout, output cap, queue, and logger — semantics that do not match the adapter's narrow scope. Refactoring would be a regression risk for no functional gain. If a future BI decides the overlap is harmful, it lands as a separate change. |
| Module-level `vi.mock("node:child_process")` instead of `deps.spawnFn` | Q1-rejected. The DI-via-deps pattern at [handler.ts:24-29](../../src/tools/obsidian_exec/handler.ts#L24-L29) is the project's established convention; module-level mocks risk cross-test leakage under parallel test runs and break the precedent. |
| Single options-object signature `invokeCli({ command, ..., spawnFn? })` | Q1-rejected. Conflates the adapter's input shape (FR-002's "exactly four fields") with the test seam (deps); harder to reason about which fields are caller-supplied vs. test-injected. The two-arg form keeps these orthogonal. |
| Rename to `CLI_NO_ACTIVE_FILE` for cosmetic prefix uniformity | Considered and initially adopted in /speckit-clarify Q2 (2026-05-05), then reversed during /speckit-plan. The `ERR_*` prefix in [ADR-004](../../.decisions/ADR-004%20-%20Centralized%20Obsidian%20CLI%20Adapter.md) is deliberate — it marks this code as a recoverable user-action signal, semantically distinct from the `CLI_*` family which represents CLI-process failures with no in-conversation recovery. Renaming for cosmetic uniformity would erase the deliberate semantic split. |
| Throw native `Error` (not `UpstreamError`) for unrecognised native spawn errors | Constitution Principle IV-rejected — at face. The actual decision per FR-010 is more nuanced: non-`ENOENT` native errors are *propagated as-is* (not wrapped) because wrapping unknown errors would mask information the caller needs. The principle's documented exception path covers this; it's not a violation. |
| Per-call internal logger | Out of scope per spec Assumptions. Logging is the calling tool's concern (it owns the call-id and queue-depth context). Centralising log emission in the adapter would either drop that context or duplicate per-call lines. |
| `details.exitCode` defaults to Node's native `null` for signal-only termination | Q3-rejected. Forces every consumer to `?? -1` themselves; breaks parity with the existing `obsidian_exec` handler (which returns `-1`). The sentinel keeps the project's two CLI-spawning paths classification-equivalent. |
| Splitting the canonical errors contract into `specs/003-cli-adapter/contracts/errors.contract.md` | Rejected by the 002 Q5 precedent. The canonical contract stays at `specs/001-add-cli-bridge/contracts/errors.contract.md`; this feature's `contracts/errors.contract-patch.md` documents only the diff. Promoting the contract to a project-level location is a deferred PFI per 002's research.md. |
| Extending `Logger.ErrorCode` to include `ERR_NO_ACTIVE_FILE` proactively | Out of scope. The adapter has no logger (spec Assumptions). The first typed-tool BI that wires `ERR_NO_ACTIVE_FILE` through `callEndFailure` is the right place to extend the union. |

## ADR alignment

[ADR-004](../../.decisions/ADR-004%20-%20Centralized%20Obsidian%20CLI%20Adapter.md) and the [Architecture document](../../.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md) both name this code `ERR_NO_ACTIVE_FILE`; this feature respects that naming. The `ERR_*` prefix is deliberate per ADR-004 — it marks this code as semantically distinct from the `CLI_*` family: `ERR_NO_ACTIVE_FILE` is a *recoverable user-action signal* (the LLM/user can correct the situation in-conversation by either opening a note in Obsidian's editor or switching the call to `target_mode: "specific"` with an explicit vault/file), whereas `CLI_NON_ZERO_EXIT`, `CLI_BINARY_NOT_FOUND`, `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`, and `CLI_REPORTED_ERROR` are all CLI-process failures with no in-conversation recovery (the caller has to fix something out-of-band: install the binary, increase the timeout, fix the input that broke the CLI). The prefix split conveys that distinction. An interim /speckit-clarify Q2 answer (2026-05-05) renamed for cosmetic prefix uniformity but was reversed during /speckit-plan once the deliberate semantic split was reaffirmed. No ADR is amended; no Architecture amendment; no new ADR is authored.

## Open questions

None. The Phase 1 design proceeds against a fully-clarified spec and three resolved plan-stage decisions.
