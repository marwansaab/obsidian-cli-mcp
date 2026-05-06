<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
[specs/008-refactor/plan.md](specs/008-refactor/plan.md)

Active feature: **008-refactor** (Two architectural deepenings shipped
together because they touch overlapping seams — the register / publish
/ dispatch chain — per ADR-006 and ADR-007 (both filed 2026-05-07 in
`.decisions/`).

**Part 1 — `registerTool` factory.** A new
[src/tools/_register.ts](src/tools/_register.ts) introduces
`registerTool(spec)` that owns the full publication pipeline:
`toMcpInputSchema` envelope → `stripSchemaDescriptions` → `ZodError` →
`VALIDATION_ERROR` marshalling → `UpstreamError` → structured-error
envelope → response-format dispatch (`"json"` default; `"raw"` for
help). A companion `assertToolDocsExist(tools[])` aggregator walks
every registered tool's `docs/tools/{name}.md` file at server boot,
collects every miss, and raises a single error listing all of them
(per Clarifications 2026-05-07 Q4 / FR-005 — fail-fast on first miss
is forbidden). Each tool collapses to `schema.ts` (zod only — no
`*InputJsonSchema` export) + `handler.ts` + `index.ts` (a thin
`registerTool({...})` call replacing today's `tool.ts`).

**Part 2 — `dispatchCli` primitive.** A new private
[src/cli-adapter/_dispatch.ts](src/cli-adapter/_dispatch.ts) owns
spawn-and-collect, argv assembly (using the documented
`[binary, vault=..., command, kvs..., flags..., --copy]` order from
`obsidian_exec.md:27`), the four-priority error classification
(non-zero exit > `Error: no active file` > `Error:` prefix >
success), the in-flight child registry, and always-on bounds. Two
thin facades sit on top: `invokeCli(input)` (typed-tool surface,
fixed 10 s / 10 MiB per `TYPED_TOOL_TIMEOUT_MS` /
`TYPED_TOOL_OUTPUT_CAP_BYTES`; no override knob), and
`invokeBoundedCli(input, overrides)` (escape-hatch surface, default
30 s / 10 MiB, `timeoutMs` overridable up to a 120 s ceiling —
silently clamped per Clarifications 2026-05-07 Q1 / FR-011, no
`VALIDATION_ERROR`, no warning). The active-child slot moves from
[src/tools/obsidian_exec/handler.ts:31](src/tools/obsidian_exec/handler.ts#L31)
to `_dispatch.ts`, the exported function renames `killActiveChild` →
`killInFlightChildren` (FR-016), and
[src/server.ts:9](src/server.ts#L9) re-points to import it from the
cli-adapter layer (FR-017, fixing the Principle-I downward-flow
violation as a side effect).

**Cross-cutting** — Failure-only stderr logging discipline per
Clarifications 2026-05-07 Q3 / FR-018a. The dispatch primitive emits
ONE stderr JSON line each for `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`,
and SIGINT/SIGTERM-driven kill; ZERO log lines on success path or on
`CLI_NON_ZERO_EXIT` / `ERR_NO_ACTIVE_FILE` / `CLI_REPORTED_ERROR` /
`CLI_BINARY_NOT_FOUND` (those flow through the response envelope
only). Today's `obsidian_exec`-only `call.start` / `call.end*`
lifecycle logging is REMOVED as a deliberate operator-observable
signal change (research R3). Atomic registry insertion per
Clarifications 2026-05-07 Q5 / FR-015a — after `spawn()` returns,
`_dispatch.ts` inserts the child into the registry SYNCHRONOUSLY,
before any `await` or microtask boundary.

**Compatibility / release** — MCP wire surface unchanged for the
three currently registered tools (FR-019); the `obsidian_exec`
reachable error code set expands to include `ERR_NO_ACTIVE_FILE` per
FR-021, called out in CHANGELOG.md and added to
`docs/tools/obsidian_exec.md`'s error roster. `obsidianExecSchema`'s
existing `.max(120000)` zod constraint stays at the MCP surface
(research R2 — silent clamp is defense-in-depth, unreachable from
MCP today). Version bumps `0.1.7 → 0.2.0` (minor — research R9)).
See also:
- [spec.md](specs/008-refactor/spec.md) — feature spec + 6 clarifications across 2 sessions (Q1: 120s clamp; Q2: ERR_NO_ACTIVE_FILE wire-shift; Q3: failure-only stderr logging; Q4: doc-file aggregation; Q5: atomic registry insertion; Q6: SC-008 vs FR-021 reconciliation)
- [research.md](specs/008-refactor/research.md) — Phase 0 decisions (R1 dispatch module location; R2 clamp-vs-zod-max; R3 logger lifecycle event removal; R4 locator-strip placement; R5 --copy routing; R6 queue wrapping for both facades; R7 registry data shape; R8 agent context; R9 version bump 0.2.0; R10 targetModeJsonSchema removal; R11 docs/tools/obsidian_exec.md addition; R12 CHANGELOG introduction)
- [data-model.md](specs/008-refactor/data-model.md) — type-level shapes (ToolSpec, RegisteredTool, DispatchInput, DispatchOutput, InvokeCliInput, InvokeBoundedCliInput/Overrides, in-flight registry, modified Logger interface) + test-coverage map
- [contracts/register-tool.contract.md](specs/008-refactor/contracts/register-tool.contract.md) — `registerTool` + `assertToolDocsExist` interface contract
- [contracts/dispatch-cli.contract.md](specs/008-refactor/contracts/dispatch-cli.contract.md) — `dispatchCli` interface contract — argv, classification, bounds, registry, log emissions
- [contracts/invoke-cli.contract.md](specs/008-refactor/contracts/invoke-cli.contract.md) — `invokeCli` typed-tool facade (fixed 10 s / 10 MiB; queue-wrapped)
- [contracts/invoke-bounded-cli.contract.md](specs/008-refactor/contracts/invoke-bounded-cli.contract.md) — `invokeBoundedCli` escape-hatch facade (default 30 s / 10 MiB; `timeoutMs` overridable, silently clamped at 120 s)
- [quickstart.md](specs/008-refactor/quickstart.md) — twelve verification scenarios mapped to SC-001..SC-011 + the doc-aggregation drill

Predecessor features:
- **007-fix-list-tools-schema**: [spec.md](specs/007-fix-list-tools-schema/spec.md), [plan.md](specs/007-fix-list-tools-schema/plan.md) — added the `toMcpInputSchema` envelope helper at `src/tools/_shared.ts`. THIS feature graduates the helper from "polite suggestion" (only `target-mode.ts` pipes through it) to "the only path from zod to published JSON Schema" via `registerTool`. The companion `targetModeJsonSchema` band-aid added in 007 is REMOVED here as redundant (per research R10).
- **006-read-note**: [spec.md](specs/006-read-note/spec.md), [plan.md](specs/006-read-note/plan.md) — the BI-003 typed tool. THIS feature collapses its `tool.ts` boilerplate into a thin `index.ts` calling `registerTool`; runtime contract preserved.
- **005-help-tool**: [spec.md](specs/005-help-tool/spec.md), [plan.md](specs/005-help-tool/plan.md) — registry-consistency block in `src/server.test.ts` (three invariants); preserved as defense-in-depth (FR-007). The schema-stripping utility at `src/help/strip-schema.ts` is now applied INSIDE `registerTool` (the per-tool factories no longer call it directly).
- **004-target-mode-schema**: [spec.md](specs/004-target-mode-schema/spec.md), [plan.md](specs/004-target-mode-schema/plan.md) — the `targetModeSchema` primitive. THIS feature drops the `targetModeJsonSchema` companion (R10) and re-points `read_note/schema.ts` to re-export only the zod schema.
- **003-cli-adapter**, **002-detect-cli-errors**, **001-add-cli-bridge**: foundational. THIS feature consolidates their split work — `cli-adapter.ts`'s four-priority classification + `obsidian_exec/handler.ts`'s timeout/cap/active-child slot — into the unified `dispatchCli` primitive.

References:
- [.specify/memory/constitution.md](.specify/memory/constitution.md) — Principles I–V bind every decision. Principle I (downward flow) is restored by FR-017 (server imports `killInFlightChildren` from cli-adapter, not from tool internals). Principle III (single source of truth) is enforced by `registerTool` consuming the zod schema directly via `spec.schema`.
- [.decisions/ADR-006 - Centralized Tool Registration.md](.decisions/) — the registration deepening this feature lands.
- [.decisions/ADR-007 - Centralized CLI Bounds with Selective Override.md](.decisions/) — the dispatch deepening this feature lands.
- [.decisions/ADR-004 - Centralized Obsidian CLI Adapter.md](.decisions/) — the centralization mandate ADR-007 fully realizes.
- [.architecture/Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md) — the architecture this deepening serves.
<!-- SPECKIT END -->

## Architecture & Decision References

Two reference folders document the project's design rationale. Consult them **before** proposing or making design decisions, and cite the relevant ADR/architecture section when justifying choices:

- [.architecture/](.architecture/) — high-level architecture notes describing the system's structure, module boundaries, and design principles. Start with [Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md).
- [.decisions/](.decisions/) — Architecture Decision Records (ADRs). [Decision Log.md](.decisions/Decision%20Log.md) is the index; each ADR-NNN file contains the full decision text.

When a design choice conflicts with an existing ADR, surface the conflict to the user rather than silently overriding it — superseding an ADR is a deliberate act that should produce a new ADR, not an undocumented drift.
