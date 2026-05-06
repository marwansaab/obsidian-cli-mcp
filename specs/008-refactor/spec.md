# Feature Specification: Centralized Tool Registration and CLI Dispatch Bounds

**Feature Branch**: `008-refactor`
**Created**: 2026-05-07
**Status**: Draft
**Input**: User description: a two-part architectural deepening per ADR-006 and ADR-007 (both filed 2026-05-07 in `.decisions/`). Part 1 introduces a single `registerTool(spec)` factory that owns the entire typed-tool publication pipeline (envelope → strip → ZodError/UpstreamError marshalling → response-format dispatch → eager doc-file assertion). Part 2 introduces a single private `dispatchCli` primitive owning spawn-and-collect, argv assembly, the four-priority error classification, and the in-flight child registry; two thin facades (`invokeCli` for typed tools with fixed 10 s / 10 MiB bounds, `invokeBoundedCli` for the `obsidian_exec` escape hatch with caller-overridable bounds up to 120 s / 10 MiB) sit on top.

## Background *(non-normative — context only)*

This feature lands two architectural deepenings together. Both were validated through a structured grilling against ADR-006 and ADR-007.

**Part 1 — Tool registration scattering.** Every typed MCP tool walks a five-step publication ritual by hand: render zod → JSON Schema, apply the `toMcpInputSchema` envelope helper (added in feature 007), strip descriptions for progressive disclosure (ADR-005), marshal `ZodError` into `VALIDATION_ERROR`, marshal `UpstreamError` into the structured-error envelope, JSON-stringify the success payload. This pipeline is duplicated byte-for-byte across each tool's `tool.ts` (~63 lines per tool — see [src/tools/read_note/tool.ts](../../src/tools/read_note/tool.ts) and [src/tools/obsidian_exec/tool.ts](../../src/tools/obsidian_exec/tool.ts)). Any single step skipped silently breaks the contract — feature 007 surfaced exactly this when `read_note`'s published descriptor missed the envelope step. The `toMcpInputSchema` helper added there was a fix, but only [src/target-mode/target-mode.ts:108](../../src/target-mode/target-mode.ts#L108) actually pipes through it; every other tool bets that its discriminated unions don't surface at the top level. A future tool that adds one *will* fail in production until someone notices.

**Part 2 — CLI dispatch split with drift.** Two modules spawn the Obsidian binary. [src/cli-adapter/cli-adapter.ts](../../src/cli-adapter/cli-adapter.ts) (used by typed tools) has the four-priority error classification but **no timeout** and **no output cap**. [src/tools/obsidian_exec/handler.ts](../../src/tools/obsidian_exec/handler.ts) has timeout + cap + active-child slot for SIGINT, but it re-implements spawn-and-collect and **misses** the `Error: no active file` specialization the adapter has. The two implementations have already drifted — and typed tools currently route through cli-adapter's *unbounded* path, meaning a misbehaving Obsidian binary can hang a `read_note` call indefinitely or OOM the host. The bounds protecting `obsidian_exec` do not protect typed tools.

Both deepenings touch overlapping seams (the register / publish / dispatch chain), so they ship together rather than as two PRs that both rewrite the same areas.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Adding a new typed tool is a six-line registration plus its actual content (Priority: P1)

A developer (or AI coding assistant) is asked to add a new typed tool — e.g., a hypothetical `write_note` or `search_vault`. They write the tool's zod schema in `schema.ts`, the actual handler in `handler.ts`, and a thin `index.ts` that calls `registerTool({ name, description, schema, handler, deps })`. They do not write boilerplate for envelope wrapping, description stripping, ZodError marshalling, UpstreamError marshalling, or JSON-stringify wrapping. They do not import or call `zodToJsonSchema`, `toMcpInputSchema`, or `stripSchemaDescriptions` in their tool's module. Adding the tool to the server is a single new entry in [src/server.ts](../../src/server.ts)'s tool array.

**Why this priority**: This is the dominant ergonomic motivation. The architecture has 20+ planned typed tools (per [.architecture/Obsidian CLI MCP - Architecture.md](../../.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md)); each one written today carries 63 lines of boilerplate that obscures the actual content. Multiplied across the backlog, this is the difference between "the tool's intent is visible at a glance" and "the tool's intent is buried in a four-file template with subtle drift potential." It also closes the recurrence vector for feature 007's bug — there is no longer a path around the envelope helper.

**Independent Test**: Add a new dummy typed tool through the new pipeline, and confirm that (a) its `schema.ts` contains only a zod export, (b) its `index.ts` is no longer than ~10 lines, (c) it appears correctly in `tools/list` with `inputSchema.type === "object"` and stripped descriptions, (d) calling it with valid input succeeds, (e) calling it with invalid input returns `VALIDATION_ERROR`, (f) failing in its handler returns the structured `UpstreamError` envelope. None of these properties require any per-tool wiring beyond the `registerTool` call.

**Acceptance Scenarios**:

1. **Given** the deepened pipeline is in place, **When** a developer adds a new typed tool by writing `schema.ts` (zod-only), `handler.ts`, and `index.ts` (a `registerTool` call), **Then** no per-tool code outside `index.ts` touches the publication pipeline.
2. **Given** the deepened pipeline is in place, **When** the new tool is registered in `server.ts` and the server starts, **Then** its descriptor appears in `tools/list` with `inputSchema.type === "object"` and no `description` keys at any depth.
3. **Given** the deepened pipeline is in place, **When** a developer omits the `docs/tools/{name}.md` file for the new tool, **Then** server boot fails loudly at registration time with a clear error naming the missing file (NOT a silent omission from the help index at runtime).
4. **Given** the deepened pipeline is in place, **When** a developer's handler throws a `ZodError` or an `UpstreamError`, **Then** the response is structured according to the existing `asToolError` shape with no per-tool try/catch boilerplate.

---

### User Story 2 — Typed tools cannot hang or OOM the host on a misbehaving binary (Priority: P1)

A user invokes any typed tool (today: `read_note`; tomorrow: any future typed tool) against an Obsidian instance that misbehaves in one of two ways: (a) the underlying CLI subcommand hangs indefinitely (e.g., a corrupted vault entry, a plugin deadlock), (b) the underlying CLI subcommand emits an unbounded amount of stdout (e.g., a search command that misinterprets its arguments and dumps the entire vault). In both cases, the tool returns an `UpstreamError` (`CLI_TIMEOUT` or `CLI_OUTPUT_TOO_LARGE`) within a known time bound, the host process remains responsive, and no system memory is exhausted.

**Why this priority**: Equal priority to Story 1 because this closes a latent hole that grows with every typed tool added to the registry. The hole exists today: `read_note` has neither a timeout nor an output cap; a hung binary will hang the call until the MCP client gives up — or worse, until the host runs out of memory. Future `write_note`, `search_vault`, etc. inherit the same hole. Closing it once at the dispatch primitive is the only sustainable fix.

**Independent Test**: With a synthetic spawn that never exits, call a typed tool and verify the call rejects with `CLI_TIMEOUT` within ~10.5 seconds (10 s timeout + scheduling slack). With a synthetic spawn that emits 11 MiB of stdout in tight chunks, verify the call rejects with `CLI_OUTPUT_TOO_LARGE` and the captured partial does not exceed 10 MiB. The host process remains responsive throughout both tests.

**Acceptance Scenarios**:

1. **Given** a typed-tool call routed through `invokeCli`, **When** the spawned child does not exit within 10 seconds, **Then** the call rejects with `UpstreamError` code `CLI_TIMEOUT`, with `details` including the `timeoutMs` that fired and the partial captured output.
2. **Given** a typed-tool call routed through `invokeCli`, **When** the spawned child emits more than 10 MiB to stdout, **Then** the call rejects with `UpstreamError` code `CLI_OUTPUT_TOO_LARGE`, the child is killed with SIGTERM (then SIGKILL after 2 s), and the partial output captured does not exceed the cap.
3. **Given** an `obsidian_exec` call (escape-hatch surface), **When** the agent passes `timeoutMs: 90000`, **Then** the call honors the 90 s timeout (subject to the 120 s ceiling), unchanged from today's behaviour.
4. **Given** any CLI call, **When** its argv is assembled, **Then** the order matches the documented contract `[binary, vault=..., command, kvs..., flags..., --copy]` regardless of which public facade was used.

---

### User Story 3 — SIGINT during any in-flight CLI dispatch cleanly terminates the child (Priority: P2)

A user (or a process supervisor) sends SIGINT or SIGTERM to the running MCP server while a typed-tool call is in flight. The server initiates shutdown: the in-flight child process receives SIGTERM, is given 2 seconds to exit gracefully, and is then killed with SIGKILL if it has not exited. The shutdown completes without orphaning the child process.

**Why this priority**: Below Stories 1 and 2 because the bug is invisible to a working user during normal operation — it only manifests during shutdown, and only as a leaked child process. But this is a deliberate behaviour change called out in ADR-007: today, typed-tool children leak on shutdown (the active-child slot is `obsidian_exec`-only); the deepening covers every CLI dispatch. The footgun grows with every write tool added — a SIGINT during a mid-flight `write_note` without a kill is the kind of bug that produces "my vault is corrupted" issues nobody can reproduce. Closing it now is cheap; closing it later requires recovering corrupted vaults.

**Independent Test**: Start a typed-tool call against a synthetic spawn that takes 5 seconds to exit. Mid-flight, invoke the server's shutdown trigger. Verify the child receives SIGTERM, then SIGKILL after 2 s if still alive. Verify the shutdown handler reports `inFlightKilled: true`. After shutdown, verify no orphan process remains.

**Acceptance Scenarios**:

1. **Given** a typed-tool call is mid-flight, **When** the server receives SIGINT, **Then** the in-flight child receives SIGTERM (then SIGKILL after a 2 s grace) and the shutdown handler reports `inFlightKilled: true`.
2. **Given** an `obsidian_exec` call is mid-flight, **When** the server receives SIGTERM, **Then** the in-flight child receives SIGTERM (then SIGKILL after a 2 s grace), unchanged from today's behaviour.
3. **Given** no CLI call is mid-flight, **When** the server receives SIGINT, **Then** the shutdown handler reports `inFlightKilled: false` (no child to kill) and exits cleanly.
4. **Given** the shutdown handler is invoked twice in rapid succession, **Then** only the first invocation initiates shutdown (idempotency is preserved from today's behaviour).

---

### User Story 4 — Future drift is structurally prevented (Priority: P3)

The codebase establishes guardrails that prevent a future tool author from re-introducing the regressions this feature closes. Specifically: (a) the `toMcpInputSchema` envelope helper is the only path from a zod schema to a published JSON Schema for typed tools; (b) the registry-consistency tests in [src/server.test.ts](../../src/server.test.ts) continue to assert the contract properties of all published descriptors as defense-in-depth; (c) typed tools cannot route around the bounds discipline because the unbounded path no longer exists. A developer who tries to publish a typed tool through a hand-rolled JSON Schema, or to spawn the binary outside the dispatch primitive, has to deliberately work around the architecture rather than accidentally bypass it.

**Why this priority**: Lower than P1/P2 because the immediate value is in the change itself, not in preventing future regressions. But the project's pattern (per feature 007's FR-006) is to treat structural regressions as bugs that escape if they are not enforced at a seam. This story makes that enforcement explicit.

**Independent Test**: For (a), grep `src/tools/` and `src/server.ts` for direct calls to `zodToJsonSchema`, `stripSchemaDescriptions`, or `toMcpInputSchema` — none should appear outside the registration entry point and its tests. For (b), run the registry-consistency block in `src/server.test.ts` and confirm all three invariants pass. For (c), grep `src/` for `child_process.spawn` invocations against the Obsidian binary — they should appear only inside the dispatch primitive's home.

**Acceptance Scenarios**:

1. **Given** the test suite is run on the post-feature codebase, **When** the registry-consistency block executes, **Then** all three invariants assert and pass for the current registered set: (a) no two registered tools share a name, (b) every registered tool has a corresponding `docs/tools/{name}.md` file, (c) every registered tool's `inputSchema.type === "object"`.
2. **Given** a code search across the post-feature codebase, **When** the searcher looks for `zodToJsonSchema`, `stripSchemaDescriptions`, or direct `toMcpInputSchema` invocations outside `_register.ts`, `_shared.ts`, and their test files, **Then** zero results are returned.
3. **Given** a code search across the post-feature codebase, **When** the searcher looks for `child_process.spawn` invocations against the Obsidian binary outside the dispatch primitive's home, **Then** zero results are returned.

---

### Edge Cases

- **The help tool's response shape is structurally different from typed tools.** Help returns Markdown content blocks that should land un-stringified in the MCP response. The `responseFormat: "raw"` flag on the registration record is the visible declarative split — the help tool opts out of the JSON-stringify wrapping. Typed tools default to `responseFormat: "json"`. The asymmetry is one declarative line, not a separate factory.
- **A future typed tool legitimately needs a longer timeout than 10 s.** Two paths per ADR-007's Pattern X: (a) bump the global `TYPED_TOOL_TIMEOUT_MS` constant if all typed tools should share a higher default; (b) call `invokeBoundedCli` directly with the tool's own values, subject to the obsidian_exec ceilings. There is no override knob on `invokeCli` — that would collapse the type-of-call signal.
- **The eager doc-file assertion on a server with a missing help doc.** The help tool itself requires `docs/tools/help.md`; if that file is missing, the server fails to boot. This is correct behaviour — a server with a broken help tool is broken, and failing loud at boot is preferable to discovering it on first `help()` call.
- **In-flight registry sized for the FIFO single-flight queue.** [src/queue.ts](../../src/queue.ts) guarantees at most one CLI child in flight at any moment; the registry is implemented as a single cell. The exported function name is plural (`killInFlightChildren`) so that if the queue invariant ever changes, the registry can upgrade to a `Set` without requiring a rename.
- **argv-ordering side fix.** [cli-adapter.ts:141](../../src/cli-adapter/cli-adapter.ts#L141) today produces `[command, vault=..., kvs..., flags...]` (vault after command). [docs/tools/obsidian_exec.md:27](../../docs/tools/obsidian_exec.md#L27) documents `[vault=..., command, kvs..., flags..., --copy]` (vault before command) as canonical. The unified dispatch primitive adopts the documented order. If the Obsidian binary accepts both orderings, the change is invisible at runtime; if it does not, this fix unblocks a latent typed-tool bug. Either way, one path now wins.
- **Principle-I downward-flow violation at server.ts:9.** Today [src/server.ts:9](../../src/server.ts#L9) imports `killActiveChild` from `src/tools/obsidian_exec/handler.ts` (server importing tool internals — an inversion of the documented import direction). After the move, server.ts imports `killInFlightChildren` from the cli-adapter layer. The violation is fixed as a side effect.
- **`targetModeJsonSchema` companion at target-mode.ts:108.** This export was added in feature 007 as a band-aid. With `registerTool` always applying `toMcpInputSchema`, the companion is no longer required by typed-tool code paths. Plan-stage decides whether to remove it or retain it as a re-export for theoretical external consumers; either way is an internal-cleanup decision that does not affect this spec's contract.

## Requirements *(mandatory)*

### Functional Requirements

**Tool registration pipeline (Part 1)**

- **FR-001**: The repository MUST expose a single tool-registration entry point that accepts a declarative tool spec (a record carrying `name`, `description`, zod `schema`, optional `deps`, optional `responseFormat` flag, and a `handler` function) and returns a registered-tool unit suitable for aggregation in the server's `tools/list` response and `CallToolRequest` dispatcher.
- **FR-002**: The single tool-registration entry point MUST own (and be the only path that performs) the steps required to publish a tool's input schema: render the zod schema to a JSON Schema, wrap any non-object top-level output into a valid MCP `inputSchema` (per FR-002a of feature 007), and strip every `description` key at every depth (per ADR-005's progressive-disclosure contract). No tool module outside the registration entry point may render its own JSON Schema or apply description-stripping by hand.
- **FR-003**: The single tool-registration entry point MUST own ZodError and UpstreamError marshalling: a `ZodError` raised during input parsing surfaces as `VALIDATION_ERROR` with the same `issues` shape as today's per-tool implementations; an `UpstreamError` raised by the handler surfaces with its `code`, `message`, and `details` preserved.
- **FR-004**: The single tool-registration entry point MUST support two response formats. The default (`"json"`) wraps the handler's return value in `{ content: [{ type: "text", text: JSON.stringify(result) }] }`. The `"raw"` format passes a pre-built `ToolCallResult` (an object satisfying the MCP `CallToolResult` shape) through unchanged. The `help` tool MUST use `"raw"`; all other typed tools MUST use the default.
- **FR-005**: The single tool-registration entry point MUST eagerly assert the existence of a `docs/tools/{name}.md` file at registration time. A missing file MUST cause server boot to fail with a clear error naming the missing file. Lazy detection at help-tool runtime is not acceptable.
- **FR-006**: After this feature lands, every typed tool's `index.ts` (replacing today's `tool.ts`) MUST be a thin call to the registration entry point — at most one import block plus one call expression, no try/catch, no manual JSON-stringify. Each tool's `schema.ts` MUST export only the zod schema (no `zodToJsonSchema` invocation, no `*InputJsonSchema` export). Each tool's `handler.ts` MUST be unchanged in shape.
- **FR-007**: The three registry-consistency invariants in `src/server.test.ts` MUST remain in place after this feature: (a) no two registered tools share a name, (b) every registered tool has a corresponding `docs/tools/{name}.md` file, (c) every registered tool's `inputSchema.type === "object"`. They are kept as defense-in-depth — they describe contract properties of published descriptors, not internals of the registration entry point.

**CLI dispatch primitive (Part 2)**

- **FR-008**: The repository MUST expose a single private CLI-dispatch primitive that owns spawn-and-collect, argv assembly, the four-priority error classification (non-zero exit > `Error: no active file` > `Error:` prefix > success), and the in-flight child registry. No module outside this primitive's home may invoke `child_process.spawn` for the Obsidian binary.
- **FR-009**: The CLI-dispatch primitive MUST always apply timeout and output-cap bounds. There is no unbounded path. The bounds are part of every spawn lifecycle.
- **FR-010**: A public typed-tool surface — `invokeCli(input)` — MUST exist and apply fixed internal bounds (10 s timeout; 10 MiB output cap). The bounds are NOT part of `invokeCli`'s public interface; callers cannot override them. `read_note` and every future typed tool MUST route through this surface unless that tool explicitly justifies different bounds (per the override path in FR-013).
- **FR-011**: A public escape-hatch surface — `invokeBoundedCli(input, overrides)` — MUST exist and apply default bounds (30 s timeout, 10 MiB output cap) overridable by the caller's `overrides` argument. Timeout overrides MUST be subject to a hard ceiling of 120 s. Output-cap is not overridable today (matches today's behaviour). `obsidian_exec` MUST route through this surface; the agent-facing `timeoutMs` field on `obsidian_exec`'s MCP schema flows through to the `overrides` argument unchanged.
- **FR-012**: The argv assembly inside the dispatch primitive MUST produce the documented order: `[binary, vault=..., command, kvs..., flags..., --copy]` (vault before command) per `docs/tools/obsidian_exec.md:27`. Both public facades inherit this order.
- **FR-013**: A future typed tool that legitimately needs different bounds than the typed-tool defaults MUST either (a) raise the global `TYPED_TOOL_TIMEOUT_MS` constant for all typed tools, OR (b) route through `invokeBoundedCli` directly with its own values within the obsidian_exec ceilings. There MUST NOT be a per-call override mechanism on `invokeCli` itself.
- **FR-014**: The dispatch primitive's four-priority error classification MUST apply uniformly. A CLI invocation that exits 0 with `Error: no active file` at the start of stdout MUST surface as `ERR_NO_ACTIVE_FILE` (the specialization missing from today's `obsidian_exec` path). All other in-band `Error:` surfaces MUST surface as `CLI_REPORTED_ERROR`. A non-zero exit MUST surface as `CLI_NON_ZERO_EXIT`. A timeout MUST surface as `CLI_TIMEOUT`. An output-cap overflow MUST surface as `CLI_OUTPUT_TOO_LARGE`. A spawn ENOENT MUST surface as `CLI_BINARY_NOT_FOUND`. No new error codes are introduced.

**In-flight child registry (deliberate behaviour change)**

- **FR-015**: The dispatch primitive MUST maintain an in-flight child registry — the home of the active-child slot that today lives at [src/tools/obsidian_exec/handler.ts:31](../../src/tools/obsidian_exec/handler.ts#L31). The registry MUST be tracked on every CLI dispatch (typed-tool and escape-hatch alike), not only on `obsidian_exec` calls.
- **FR-016**: The exported "kill in-flight" function MUST be named `killInFlightChildren` (renaming today's `killActiveChild`) so the name does not lie if the registry's data structure ever needs to grow. Today's implementation MAY be a single cell — `src/queue.ts`'s FIFO single-flight queue guarantees at most one CLI child in flight at any moment, and both `invokeCli` and `invokeBoundedCli` callers route through it.
- **FR-017**: `src/server.ts` MUST import `killInFlightChildren` from the cli-adapter layer (the dispatch primitive's home), NOT from any tool module. This restores the Principle-I downward-flow direction (server → adapter, never server → tool internals).
- **FR-018**: `triggerShutdown` semantics MUST be unchanged: kill, do not wait. Graceful-drain on shutdown is out of scope for this feature.

**Compatibility and release**

- **FR-019**: The MCP wire-level surface MUST be unchanged for the three currently registered tools. Every tool's published `name`, `description`, and `inputSchema` shape (including the `toMcpInputSchema` envelope shape from feature 007) MUST match the pre-fix output exactly. Clients that successfully called any tool against 0.1.7 MUST continue to work without change.
- **FR-020**: The fix MUST be released as a new published version of the package — a minor or patch increment over 0.1.7. The version-bump direction (patch vs minor) is a release-discipline decision deferred to the plan; the only constraint here is that a release lands.
- **FR-021**: No new error codes are introduced. The `obsidian_exec` error roster gains no new members; the `read_note` error roster's `ERR_NO_ACTIVE_FILE` (already present per feature 003's contract) becomes reachable through `obsidian_exec` only as a side effect of the unified classification path.

### Key Entities

- **Tool spec**: The declarative record passed to the registration entry point. Carries `name` (string), `description` (string), zod `schema`, optional per-tool `deps`, optional `responseFormat` flag (`"json"` | `"raw"`, default `"json"`), and a `handler` function. Replaces the per-tool `register*Tool` factory pattern as the unit of registration.
- **Registration entry point (`registerTool`)**: The single function that accepts a tool spec and returns a registered-tool unit. The home of the publication pipeline (envelope → strip → ZodError/UpstreamError marshalling → response-format dispatch → eager doc-file assertion).
- **CLI dispatch primitive (`dispatchCli`)**: The single private spawn-and-collect function shared by both public facades. The home of argv assembly, the four-priority error classification, the in-flight child registry, and the always-on bounds enforcement.
- **Typed-tool surface (`invokeCli`)**: The public CLI-dispatch facade for typed tools. Internal-bounds-only; bounds are not part of the public interface.
- **Escape-hatch surface (`invokeBoundedCli`)**: The public CLI-dispatch facade for `obsidian_exec`. Default bounds; caller may override `timeoutMs` up to a 120 s ceiling.
- **In-flight child registry (`killInFlightChildren`)**: The shared registry tracking every in-flight Obsidian-CLI child. Replaces today's `obsidian_exec`-only active-child slot. Sized for the FIFO single-flight queue's at-most-one invariant; named plural so the data structure can grow without renaming.
- **Typed-tool bounds**: The fixed constants `TYPED_TOOL_TIMEOUT_MS = 10_000` and `TYPED_TOOL_OUTPUT_CAP_BYTES = 10 * 1024 * 1024`. Apply to every typed-tool call routed through `invokeCli`.
- **Escape-hatch bounds**: The defaults `OBSIDIAN_EXEC_DEFAULT_TIMEOUT_MS = 30_000` and `OBSIDIAN_EXEC_OUTPUT_CAP_BYTES = 10 * 1024 * 1024`, plus the ceiling `OBSIDIAN_EXEC_MAX_TIMEOUT_MS = 120_000`. Apply to every `obsidian_exec` call routed through `invokeBoundedCli`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new typed tool added through the deepened pipeline requires **no more than 10 lines of registration code** in its `index.ts` (the file replacing today's `tool.ts`), and its `schema.ts` exports only a zod schema (no `zodToJsonSchema` call, no `*InputJsonSchema` export). *(Measured by: a developer adds a hypothetical typed tool through the new pipeline as part of the implementation work; the resulting `index.ts` and `schema.ts` are inspected.)*
- **SC-002**: Across the three currently registered tools, the post-feature codebase has **zero direct calls** to `zodToJsonSchema`, `stripSchemaDescriptions`, or `toMcpInputSchema` outside the registration entry point and its tests. *(Measured by: a code search across `src/tools/` and `src/server.ts` after the feature lands.)*
- **SC-003**: A typed-tool call against a synthetic spawn that never exits returns `CLI_TIMEOUT` within **10.5 seconds** (the 10 s typed-tool timeout plus reasonable scheduling slack). *(Measured by: an automated test that asserts the rejection time falls within the bound.)*
- **SC-004**: A typed-tool call against a synthetic spawn that emits 11 MiB of stdout returns `CLI_OUTPUT_TOO_LARGE`, the captured partial output does not exceed the 10 MiB cap, and the host process's resident memory growth during the call stays under **20 MiB**. *(Measured by: an automated test that asserts the rejection code, the cap, and a process-memory observation before and after.)*
- **SC-005**: A SIGINT received during an in-flight typed-tool call results in the child receiving SIGTERM, then SIGKILL after 2 seconds if still alive, and the shutdown handler reports `inFlightKilled: true`. **Zero orphan processes** remain after shutdown. *(Measured by: an automated test using a synthetic spawn plus a process-listing observation.)*
- **SC-006**: The `tools/list` response from a freshly started server validates with **zero errors** against the MCP `Tool` definition for all three currently registered tools, with their published `inputSchema` shapes byte-equivalent to today's output (modulo whitespace / property order). *(Measured by: the test added in feature 007's FR-006 plus a snapshot comparison.)*
- **SC-007**: The full pre-existing test suite passes with **no regressions**. *(Measured by: comparing the pass/fail summary on this feature's branch tip against `main` — every previously-passing test continues to pass.)*
- **SC-008**: No new error codes appear in the runtime or in the documentation. The error roster is unchanged. *(Measured by: a diff of `src/errors.ts` and `docs/tools/*.md` against `main` shows no new code identifiers.)*
- **SC-009**: The Principle-I downward-flow violation at `src/server.ts:9` (server importing tool internals) is eliminated; the import points to the cli-adapter layer. *(Measured by: a grep of `src/server.ts` for imports from `src/tools/*` shows none for kill-in-flight functionality after the feature lands.)*
- **SC-010**: A new published version of the package is released within a release cadence consistent with the prior cadence of the project. *(Measured by: a tagged release in npm and GitHub.)*

## Assumptions

- The decision to deepen tool registration AND CLI dispatch bounds together (rather than as two separate features) is deliberate — both touch overlapping seams (the register / publish / dispatch chain), and shipping them together avoids two PRs that both rewrite the same areas.
- The 10 s vs 30 s asymmetry between typed-tool and `obsidian_exec` defaults is a load-bearing architectural signal, not an arbitrary number. Future maintainers should not "fix it for symmetry" without consulting ADR-007. The rationale lives in ADR-007.
- The Obsidian Integrated CLI binary either accepts both `[command, vault=...]` and `[vault=..., command]` argv orderings (in which case the side-fix is invisible at runtime) or it accepts only one (in which case the side-fix unblocks a latent typed-tool bug). Either outcome is acceptable for this feature; verification against the actual binary is plan-stage work.
- The `targetModeJsonSchema` companion at `src/target-mode/target-mode.ts:108` (added in feature 007 as a band-aid) becomes redundant once `registerTool` always applies `toMcpInputSchema`. Whether to remove it or retain it as a re-export is a plan-stage cleanup decision, not a spec-level contract.
- Implementation tactics — file moves, module names, the exact shape of the deps-injection contract, the ordering of the work in `tasks.md` — are deferred to `/speckit-plan`. This spec states the *what* (a single registration entry point owns the publication pipeline; a single dispatch primitive owns CLI bounds and child tracking; typed-tool defaults are 10 s / 10 MiB; the escape-hatch surface preserves the agent-tunable timeout) without locking in the *how*.
- The project's release pipeline (npm publish, version bump in `package.json`, CHANGELOG) is unchanged from the cadence used for 0.1.6 → 0.1.7. The version-bump direction (patch vs minor) is the only release-discipline decision in scope, and it is deferred to plan.
- ADR-006 (Centralized Tool Registration) and ADR-007 (Centralized CLI Bounds with Selective Override) — both filed 2026-05-07 in `.decisions/` — are the canonical decision artefacts for this feature. The spec is downstream of those ADRs; if the ADRs change, the spec changes.
- The FIFO single-flight queue at `src/queue.ts` is the load-bearing invariant that makes a single-cell in-flight registry safe today. Restructuring the queue (per-tool queues, parallel CLI dispatch) is explicitly out of scope; the plural-friendly registry name anticipates that future change without committing to it.
