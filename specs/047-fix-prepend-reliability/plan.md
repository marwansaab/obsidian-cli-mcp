# Implementation Plan: Fix Prepend Reliability

**Branch**: `047-fix-prepend-reliability` | **Date**: 2026-05-27 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/047-fix-prepend-reliability/spec.md`

## Summary

The `prepend` tool (shipped in v0.7.4 via BI-045) reliably fires one of three failure shapes — silent no-op masquerading as success, 10-second wrapper timeout, or Obsidian host-process crash with a modal dialog — whenever a content payload approaches or exceeds approximately 10 KB through the wrapper, despite the published schema cap being 24576 UTF-16 code units. A direct-CLI bisect against `obsidian prepend` on the same Windows host (per the BI-0017 active-mode investigation; raw evidence kept local-only under `.scratch/` per the project's local-only-investigation convention) ruled out the upstream Obsidian CLI's `prepend` subcommand as the source — upstream cleanly handles 60008-byte argv elements against the same host. The bug therefore lives downstream of caller input and upstream of the host process, somewhere inside the wrapper layer that spans `src/tools/prepend/handler.ts` (output construction + classifier), `src/cli-adapter/cli-adapter.ts` (`invokeCli` boundary), and `src/cli-adapter/_dispatch.ts` (spawn substrate + stdout/stderr capture + timeout enforcement).

The fix repairs the in-cap success contract (User Story 1), surfaces every failure mode as a structured `UpstreamError` envelope drawn from the existing code surface with no new top-level codes (User Story 2, FR-005), eliminates the Obsidian host-process crash dialog across every payload-size bucket (User Story 3), and preserves the schema-boundary rejection for over-cap payloads (User Story 4). The output-schema invariant `bytes_written: z.number().int().min(1)` (per `src/tools/prepend/schema.ts:63`) is the structural enforcement point for the broadened FR-003 anti-pattern — the plan verifies it actually fires on the regression cohort and amends the handler's output construction to raise a structured error rather than emitting an envelope that would fail output-schema validation downstream.

The technical approach localises the wrapper-side root cause empirically (Phase 0 R1), confirms whether the BI-0017 active-mode root cause is shared (Phase 0 R2), reconciles the spec's "character count" wording with the schema's actual UTF-16 code-unit unit (Phase 0 R3), and pins the regression cohort recipe (Phase 0 R5) before the implementation phase begins.

## Technical Context

**Language/Version**: TypeScript strict mode, `tsc --noEmit` clean (per Constitution Technical Standards). `tsconfig.json` is `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `"target": "ES2024"`.
**Primary Dependencies**: `@modelcontextprotocol/sdk` (sole MCP transport, registered via the SDK's `Server` API), `zod` (boundary input validation per Principle III), `node:child_process` (spawn substrate for the CLI adapter — current shape: `child_process.spawn(bin, argv, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })` per `src/cli-adapter/_dispatch.ts:104`).
**Storage**: N/A — the wrapper neither reads nor writes the target note's bytes; it stats the target path (pre- and post-call) for the byte-count delta and otherwise delegates the byte-level write to the upstream Obsidian CLI's `prepend` subcommand.
**Testing**: `vitest run` with `@vitest/coverage-v8`, `*.test.ts` co-located with their source module (per Principle II). The merge-gating test command is `vitest run`. Test scope is unit-only per the user's project convention; manual/integration TC-XXX cases live in the user's external tracker (see `MEMORY.md` user-memory `feedback_test_scope`).
**Target Platform**: Cross-platform (Windows + Linux + macOS); BI-017 established the cross-platform support invariant. Windows is the empirically reproduced failure host (Windows 11 Pro 10.0.26200, PowerShell, Node 22.x — observed during the BI-0017 active-mode investigation, raw evidence kept local-only); fixes must verify against Windows behaviour even when developed on a sibling platform.
**Project Type**: Library / CLI — an MCP server published as `@marwansaab/obsidian-cli-mcp` to npm. Single-project layout per the constitution-template default.
**Performance Goals**: In-cap prepend call against a primed registry cache MUST complete at p95 wall-clock ≤ 500 ms (FR-009, SC-007). Healthy-baseline reference: direct-CLI probes of `obsidian prepend` on the same Windows host recorded 73-77 ms wall-clock per call (observed during the prior BI-0017 active-mode investigation; raw evidence kept local-only); the 500 ms p95 ceiling gives ≥ 6× headroom for system noise without admitting recent-crash recovery latency.
**Constraints**: Schema cap MUST remain at 24576 UTF-16 code units (`MAX_CONTENT_LENGTH` in `src/tools/prepend/schema.ts:16`) — FR-008 forbids lowering it. Wrapper response MUST complete within the published 10-second window (FR-006). No new top-level `UpstreamError` codes (FR-005, Principle IV) — the wrapper-detected failure modes map onto the existing code surface (`CLI_TIMEOUT`, `CLI_REPORTED_ERROR`, `CLI_NON_ZERO_EXIT`, `CLI_BINARY_NOT_FOUND`, `VALIDATION_ERROR`, `NOTE_NOT_FOUND`, `PATH_ESCAPES_VAULT`, `EXTERNAL_EDITOR_CONFLICT`, `FS_WRITE_FAILED`, `ERR_NO_ACTIVE_FILE`, `CLI_OUTPUT_TOO_LARGE`).
**Scale/Scope**: SC-002 regression cohort is 50 consecutive prepend calls against 50 different target notes, each with a content payload of exactly 10240 ASCII characters (10 KiB). The regression validates against zero silent no-ops, zero wrapper timeouts, and zero Obsidian host-process crash dialogs across the full sequence.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Y / N / N/A | Evidence |
|------|-------------|----------|
| Principle I (Modular Code Organization) | Y | The fix is scoped to the existing `prepend` per-surface module (`src/tools/prepend/{schema, tool, handler}.ts`) plus, conditionally on Phase 0 R1 outcome, `src/cli-adapter/{cli-adapter, _dispatch}.ts`. Import direction stays one-way (tool → cli-adapter → node:child_process); no upward edges introduced. The handler module does not grow beyond a single clear responsibility — the new output-construction guard is at most ~10 LOC at the existing success-path return site. |
| Principle II (Public Surface Test Coverage) | Y | The `prepend` tool's public surface is being modified (output-construction semantics broaden FR-003's prohibition; failure-mode discriminator surface widens per FR-005); test additions in `src/tools/prepend/handler.test.ts` co-locate with the source per Principle II. The 50-call regression cohort lands as a unit-only test pattern (parameterised fixture cohort), not an integration probe — per the user's stated test scope. Happy-path + failure-or-boundary coverage holds for every enumerated failure mode (substrate timeout, vault not found, missing target file, path traversal, oversized content, locator validation, host-process spawn failure, host-process abnormal exit). |
| Principle III (Boundary Input Validation with Zod) | Y | The input schema (`src/tools/prepend/schema.ts:44-57`) remains the single source of truth for the published shape and the runtime parse (per FR-008, schema cap preserved at 24576 UTF-16 code units). The output schema (`src/tools/prepend/schema.ts:59-66`) already requires `bytes_written: z.number().int().min(1)` — the plan leverages this invariant to enforce FR-003 structurally (an envelope reporting zero bytes is schema-invalid at the boundary and the SDK would reject it). The Phase 0 R3 reconciliation between "character count" (spec wording) and "UTF-16 code units" (schema unit) is a documentation alignment, not a schema change. |
| Principle IV (Explicit Upstream Error Propagation) | Y | FR-005 explicitly maps every enumerated failure mode onto the existing `UpstreamError` code surface — no new top-level codes. The handler's `classifyUpstreamFailure` (`src/tools/prepend/handler.ts:116-165`) already classifies stdout/stderr signals through `NOTE_NOT_FOUND` and `EXTERNAL_EDITOR_CONFLICT` sub-states; the broadened FR-003 enforcement raises a typed `UpstreamError` (rather than emitting an output-schema-invalid success envelope) when the byte-count delta is zero against a primed pre-call stat. The project's zero-new-top-level-codes streak is preserved. |
| Principle V (Attribution & Layered Composition) | Y | Both `src/tools/prepend/handler.ts:1` and `src/tools/prepend/schema.ts:1` carry the `// Original — no upstream.` attribution header (per Principle V's original-contribution form). The fix preserves the headers verbatim; no new module is introduced (the diff is scoped to existing files), so no new attribution surface is added. |
| ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand) | N/A | The fix renames no tool and adds no tool; the existing `prepend` tool already mirrors the upstream `obsidian prepend` subcommand name per ADR-010. |
| ADR-013 (Plugin-Namespace Tool Naming Convention) | N/A | `prepend` is a native-CLI-wrapper, not a plugin-API wrapper. Per the constitution's parenthetical example: "a PR that adds a native-CLI-wrapper typed tool is N/A on ADR-013". |
| ADR-014 (Plugin-Backed Typed Tools Runtime-Dependency Pattern) | N/A | `prepend` has no plugin runtime dependency; ADR-014's three plugin-lifecycle states (`<PLUGIN>_NOT_INSTALLED` / `<PLUGIN>_NOT_READY` / `SOURCE_NOT_INDEXED`) are not applicable. |
| ADR-015 (Sub-Discriminators via details.reason for Multi-State Error Codes) | N/A (pending Phase 0 R5 confirmation) | The plan's current assumption is that no new sub-discriminators land under existing `(top-level-code, details.code)` pairs; the handler's existing sub-state surface (`NOTE_NOT_FOUND`, `EXTERNAL_EDITOR_CONFLICT`, plus the schema's `CONTENT_EMPTY` / `CONTENT_TOO_LARGE` per BI-045's R6) is preserved unchanged. Phase 0 R5 will confirm — if a Phase 0 outcome surfaces a new multi-state need (e.g., distinguishing "host-process spawn failure: ENOENT vs EACCES vs ENOSPC" inside one top-level code), the gate flips to Y with the new sub-state cited here. |

**Result**: Gate PASSES. No `N` entries; no Complexity Tracking entry required at plan-time. ADR-015 is N/A pending Phase 0 R5 — if the research outcome surfaces a multi-state need, the post-design Constitution Check (end of Phase 1) updates the gate row.

## Project Structure

### Documentation (this feature)

```text
specs/047-fix-prepend-reliability/
├── plan.md                      # This file (/speckit-plan command output)
├── research.md                  # Phase 0 output (/speckit-plan command)
├── data-model.md                # Phase 1 output (/speckit-plan command)
├── quickstart.md                # Phase 1 output (/speckit-plan command)
├── contracts/
│   ├── prepend-input.contract.md       # Input shape + cap unit reconciliation
│   ├── prepend-output.contract.md      # Output success envelope shape + bytes_written invariant
│   └── prepend-error.contract.md       # Failure-mode discriminator code-mapping per FR-005
├── checklists/
│   └── requirements.md          # Spec-quality checklist (already exists, post-clarify pass-2)
├── spec.md                      # Feature specification (already exists)
└── tasks.md                     # Phase 2 output (/speckit-tasks command — NOT created by /speckit-plan)
```

### Source Code (repository root)

The diff is scoped to the existing per-surface module for `prepend` and (conditionally on Phase 0 R1 outcome) the CLI adapter substrate. No new top-level directories are introduced; no module split or merge is performed.

```text
src/
├── tools/
│   └── prepend/
│       ├── schema.ts            # Touched: docstring + cap-unit reconciliation (UTF-16 code units, not characters); the existing `MAX_CONTENT_LENGTH = 24576` constant is preserved byte-stable. The output-schema invariant `bytes_written: z.number().int().min(1)` is preserved byte-stable.
│       ├── tool.ts              # Untouched: tool registration shape stays as-is; the description string interpolates MAX_CONTENT_LENGTH unchanged.
│       ├── handler.ts           # Touched: (a) the success-path return at lines 306-314 grows a guard that raises a typed UpstreamError when `bytesWritten <= 0` against a primed `preCallSize`, broadening FR-003 enforcement structurally; (b) `classifyUpstreamFailure` may grow a new pattern arm or sub-state if Phase 0 R5 surfaces one (currently N/A); (c) conditionally on Phase 0 R1 outcome, additional defensive checks for the spawn substrate's reported timeout / abnormal-exit envelopes; (d) the active-mode reverse-lookup fallback may be amended depending on whether BI-0017's root cause is confirmed shared (Phase 0 R2).
│       └── handler.test.ts      # Touched: new co-located tests for the 50-call regression cohort, the broadened FR-003 prohibition, the over-cap rejection latency assertion (≤ 1 s), and every enumerated failure-mode discriminator mapping per FR-005.
├── cli-adapter/
│   ├── cli-adapter.ts           # Conditionally touched (Phase 0 R1): the `invokeCli` boundary's stdout/stderr inspector (`src/cli-adapter/cli-adapter.ts:88-97`, today the `Vault not found` re-classification site) is the leading candidate for the wrapper-side failure layer. If Phase 0 R1 localises here, the inspector grows defensive handling for the silent-no-op shape (exit 0 + empty stdout + post-state byte count unchanged).
│   ├── cli-adapter.test.ts      # Conditionally touched (paired with the above per Principle II).
│   ├── _dispatch.ts             # Conditionally touched (Phase 0 R1): the spawn substrate is the second candidate for the wrapper-side failure layer; specifically, the timeout enforcement at `_dispatch.ts:238` (`CLI_TIMEOUT`) and the stdout-size cap at `_dispatch.ts:264` (`CLI_OUTPUT_TOO_LARGE`) are the surfaces most likely to interact with the ~10 KB content threshold.
│   └── _dispatch.test.ts        # Conditionally touched (paired with the above).
├── errors.ts                    # Untouched. UpstreamError class definition unchanged; the fix consumes the existing code surface per FR-005, no new top-level codes (Principle IV).
└── vault-registry/
    └── registry.ts              # Conditionally touched (Phase 0 R2): if the BI-0017 active-mode root cause is confirmed shared, the recommended fix from the prior BI-0017 investigation (`resolveVaultDisplayName` becomes async and primes on cache miss) lands in the same change set per the spec's Out of Scope clause that permits this.
```

**Structure Decision**: Single-project layout (constitution template's Option 1 default). No new directories. The diff is scoped to the existing per-surface module for `prepend` (always touched) plus, conditionally on Phase 0 outcomes, the CLI adapter substrate (R1) and the vault registry (R2). The conditional surfaces are gated on Phase 0 research outcomes and resolved before Phase 2 (`/speckit-tasks`).

## Graphify structural check

Performed per the CLAUDE.md `/speckit-plan` graph-consultation rule against the post-046 graph at HEAD as of plan-time. The kernel-node touch claims and community assignments cited below are relative (top-god-node membership, runtime-spine community membership) rather than absolute counts, so they remain valid across post-commit graph rebuilds; degree numbers below are plan-time snapshots, not durable contract surfaces.

**Affected communities**:
- The `prepend` tool's community (handler + schema + tool + co-located tests). This is the primary diff surface and is the community the BI introduces no new nodes into — the diff is intra-module growth, not cross-community.
- Conditionally on Phase 0 R1 outcome: the CLI-adapter community (`cli-adapter.ts` + `_dispatch.ts` + co-located tests). If the wrapper-side root cause localises here, the diff crosses into the runtime-spine community alongside `invokeCli`.
- Conditionally on Phase 0 R2 outcome: the vault-registry community (`registry.ts` + co-located tests). If the BI-0017 active-mode fix lands in the same change set, the diff crosses into this community as well; otherwise this community is untouched.

**Kernel-node touch surface** (single source of truth: CLAUDE.md `### Validated architectural facts the graph encodes`):
- **`UpstreamError`** — touched as a **consumer only**, not as a definition. The class itself (`src/errors.ts:10-23`) is byte-stable; only new `UpstreamError` instances are constructed at the prepend handler's success-guard site (and conditionally at the CLI-adapter inspector). Out-degree of 114 confirms `UpstreamError` is among the top god-nodes by degree; the diff adds at most ~3 new inbound edges to this node (one new construction site at the success-guard, plus 1-2 conditional sites pending Phase 0 R1). No new top-level error codes are introduced per FR-005 / Principle IV.
- **`createLogger()`** — NOT touched. Boot-time DI factory remains confined to `server.ts` per the boot-spine invariant. The handler continues to receive `Logger` via injected `ExecuteDeps`.
- **`createQueue()`** — NOT touched. Boot-time DI factory remains confined to `server.ts`. The handler continues to receive `Queue` via injected `ExecuteDeps`. The serialization seam (responsible for last-write-wins per US1 AC3) is the existing queue — the fix does not introduce a parallel serialization seam.
- **`createServer()`** — NOT touched. Boot-spine entry point is unchanged.

**High-blast-radius surface assessment**: Touching `UpstreamError` as a consumer-only edge addition is a low-blast-radius operation — it cannot violate Principle IV (which polices code creation, not consumption growth) and it cannot break the constitutional zero-new-codes streak. Reviewer attention is warranted on the post-implement structural verification step (per the CLAUDE.md rule): confirm no new error-class nodes land outside the `src/errors.ts` community.

**Explicit no-touch claim** (for the post-implement structural-verification check): the production handler MUST NOT import the boot-time DI factories (`createLogger()`, `createQueue()`) directly. Those factories stay confined to `server.ts` per the project's DI discipline. Any direct import of either factory from outside `src/server.ts` in the diff is a violation.

## Phase 0: Outline & Research

**Output**: `research.md` (separate file in this directory).

**Research questions**:

- **R1 — Wrapper-side failure-layer localisation**. The spec is symptom-anchored (three observable failure shapes that fire ≥ ~10 KB through the wrapper); the plan must be layer-anchored. Candidate layers, in order of decreasing likelihood per the BI-0017 cross-evidence:
  - (a) The `_dispatch.ts` spawn substrate's stdout-size cap (`CLI_OUTPUT_TOO_LARGE` at `_dispatch.ts:264`) — does ~10 KB content trigger any cap, given the upstream's typical stdout shape (`Prepended to: <path>\n`)?
  - (b) The `_dispatch.ts` timeout enforcement (`CLI_TIMEOUT` at `_dispatch.ts:238`) — does the wrapper's 10 s window collide with the upstream's spawn-then-IPC latency for non-trivial argv elements on Windows specifically?
  - (c) The `cli-adapter.ts` stdout-inspector at lines 88-97 — does it re-classify a legitimate success envelope as `CLI_REPORTED_ERROR` based on an unfortunate substring match?
  - (d) The handler's pre/post stat pair around the `invokeCli` call (`handler.ts:282-307`) — does the post-call stat run before the upstream's filesystem write has been flushed, producing a `bytesWritten` of 0 even when the write succeeded?
  - (e) Some interaction between Obsidian's foreground-process state and the upstream CLI's IPC channel that the wrapper does not currently insulate from — the host-process crash dialog is the strongest symptom for this candidate.
  - Research approach: dependency-injection probe (the pattern proven in BI-0017's Probe 6) with a spying `spawnFn` that captures emitted argv + child stdout/stderr/exit, plus an empirical bisect by content size (1 KB / 5 KB / 9 KB / 10 KB / 12 KB / 16 KB / 24 KB) against the authorised test vault per `.memory/test-execution-instructions.md`. The bisect is run direct-CLI (positive control) AND wrapper (failure reproducer) to establish the wrapper-CLI delta empirically.

- **R2 — BI-0017 active-mode shared-root-cause confirmation**. The spec permits the BI-0017 active-mode fix to land in the same change set if the root cause is shared. The prior BI-0017 investigation (raw evidence kept local-only) diagnosed the active-mode failure as a `vault-registry` issue: the synchronous-non-priming `resolveVaultDisplayName` returns null on a cold cache, and the handler at `src/tools/prepend/handler.ts:209-221` falls through to `parsed.base` (the focused vault's absolute filesystem path), which the upstream `Obsidian.com` binary then rejects as an unknown vault. Research approach: run the R1 wrapper probe with active-mode input shape and compare the emitted argv against R1's specific-mode probe. If the failure surface differs (active-mode emits an absolute-FS-path `vault=` token whereas specific-mode does not), the root causes are distinct and the active-mode fix is OUT of scope for this BI. If the failure surface is identical (both emit something that triggers the same downstream layer's failure), the root causes are shared and the active-mode fix is IN scope.

- **R3 — Cap unit reconciliation: UTF-16 code units vs character count vs UTF-8 argv bytes**. The spec's user-facing wording uses "character count" (the natural unit for an LLM-agent contract); the schema (`MAX_CONTENT_LENGTH = 24576`) is enforced against `string.length` which is the UTF-16 code-unit count (a surrogate-pair character takes 2 code units). The BI-045 framing in `schema.ts:14-15` cites the Windows `CreateProcess` command-line maximum (~32 767 chars) as the headroom anchor; that maximum is measured in UTF-16 code units in the Win32 API, not bytes. Under UTF-8 argv encoding on POSIX, the same 24576 code units may expand up to 3× for BMP content (or 4 bytes per surrogate pair). Research approach: characterise the wrapper's argv encoding path through `node:child_process.spawn` on Windows + POSIX, document whether non-ASCII payloads near the cap expand to argv-byte sizes that approach the host-process command-line limit, and reconcile the spec's wording with the schema's unit in `prepend-input.contract.md`.

- **R4 — Default-separator byte-length specification**. The wrapper-inserted separator (per BI-045's default-separator rule, FR-006 in that BI) is the difference between `bytesWritten` and `contentByteLength` in the success envelope's byte-count delta. The spec's US1 AC1 asserts that the post-state byte count equals the pre-state plus the content byte length plus the separator length. Research approach: empirically capture the separator byte length via direct-CLI probes (1-byte content → measure delta; the delta minus 1 byte is the separator). The result lands in `data-model.md` under the success envelope's byte-count formula.

- **R5 — Failure-mode discriminator code-mapping verification**. Clarification Q1 auto-resolved the new failure modes (host-process spawn failure, abnormal exit) onto existing `UpstreamError` codes. The plan must verify each mapping against the actual code surface in `src/errors.ts` and the call sites enumerated in the Grep results above. Research approach: trace each enumerated failure mode (FR-005's list) through to the existing code-construction site it lands on; document the mapping in `prepend-error.contract.md` with file:line citations. If any failure mode has no corresponding existing code, surface the gap — but resist adding a new top-level code per Principle IV. The preferred response to a gap is a new `details.reason` sub-discriminator under an existing top-level code per ADR-015, which flips the ADR-015 Constitution Check row to Y with the new sub-state cited.

Each research item produces a Decision / Rationale / Alternatives entry in `research.md`. No NEEDS CLARIFICATION markers remain after Phase 0 — the five clarifications from `/speckit-clarify` and the five research items above together cover every open design decision.

## Phase 1: Design & Contracts

**Prerequisites**: `research.md` complete (R1-R5 each resolved).

**Outputs**:

1. **`data-model.md`** — entity definitions for the success envelope, the structured error envelope, the failure-mode discriminator code surface, and the byte-count formula (incorporating R4's separator byte-length). The entities are already named in the spec's Key Entities section; the data-model artifact expands them with concrete field types drawn from `src/tools/prepend/schema.ts` (input + output) and `src/errors.ts` (`UpstreamError` shape).

2. **`contracts/prepend-input.contract.md`** — the published input contract for the `prepend` tool. Documents the schema unit (UTF-16 code units, not characters — per R3), the cap value (24576), the locator shapes (specific-mode `vault + (file | path)` vs active-mode `target_mode: "active"`), and the validation failure shapes (`VALIDATION_ERROR` with details.code `CONTENT_EMPTY` or `CONTENT_TOO_LARGE` for content; structural path safety for file/path).

3. **`contracts/prepend-output.contract.md`** — the published output contract for the `prepend` tool's success envelope. Documents the four output fields (`path: string`, `vault: string`, `bytes_written: number ≥ 1`, `inline: boolean`), the structural enforcement of FR-003 via the `bytes_written ≥ 1` invariant in the output schema, and the byte-count formula (pre-state size + content byte length + separator byte length = post-state size).

4. **`contracts/prepend-error.contract.md`** — the published error contract for the `prepend` tool. Documents the failure-mode discriminator code-mapping per FR-005 / R5, citing each existing `UpstreamError` code with file:line references. Surfaces ADR-015 sub-discriminator usage (`details.code`, `details.reason`) where applicable. Confirms zero new top-level codes per Principle IV.

5. **`quickstart.md`** — how to (a) reproduce the bug locally against the authorised test vault, (b) run the regression cohort (50 calls × 10240 ASCII chars), (c) validate the over-cap rejection latency assertion (≤ 1 s for 24577-char payload), (d) verify host-process stability across the payload-size buckets (well-under-cap, at-cap-boundary, exactly-at-cap, above-cap). Quickstart commands target Windows (the empirically reproduced failure host) but also note POSIX-equivalent invocations for cross-platform verification.

6. **Agent context update** — update the plan reference in `CLAUDE.md` between the `<!-- SPECKIT START -->` and `<!-- SPECKIT END -->` markers to point to `specs/047-fix-prepend-reliability/plan.md`.

**Constitution re-check (post-design)**: After Phase 1 lands the four contracts + data-model + quickstart artifacts, re-run the Constitution Check table above. The expected result is that all gates remain at their plan-time values; the only row that may move is ADR-015 if R5 surfaces a new sub-discriminator need (from N/A to Y). The re-check happens at the bottom of `research.md` and produces a one-line "Constitution post-design re-check: <pass | flip-detected>" verdict.

## Complexity Tracking

No Constitution Check violations at plan-time. No Complexity Tracking entries required.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | (none) | (none) |
