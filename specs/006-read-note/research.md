# Phase 0 Research — Read Note Typed MCP Tool

**Branch**: `006-read-note` | **Date**: 2026-05-06 | **Plan**: [plan.md](./plan.md)

## Purpose

Resolve the plan-stage decisions deferred from [spec.md](./spec.md) so that Phase 1 (data-model, contracts, quickstart) and Phase 2 (tasks) can run without unresolved design questions. Each section names one decision, the chosen resolution, the rationale, and the alternatives that were considered and rejected. The decisions are referenced from [plan.md](./plan.md) by their P1..P8 labels.

The spec's three Clarifications 2026-05-06 (Q1 queue sharing, Q2 logger dep, Q3 empty-string deferral) are NOT re-litigated here — they are settled in [spec.md](./spec.md#clarifications) and encoded as FR-016, FR-017, and an updated Edge Case respectively. This document covers only the seven plan-stage deferrals that the spec explicitly left to plan time, plus one additional decision that surfaced during plan drafting (P1's resolution of the FR-002 / primitive-export tension).

---

## P1 — Schema composition tactic (FR-002)

### Decision

`src/tools/read_note/schema.ts` re-exports `targetModeSchema` from `src/target-mode/target-mode.ts` as `readNoteInputSchema`:

```typescript
// Original — no upstream. read_note input schema: re-export of the target-mode primitive (BI-029) — read_note adds zero tool-specific fields, so the primitive IS the schema.
import { targetModeSchema, type TargetMode } from "../../target-mode/target-mode.js";
import { zodToJsonSchema } from "zod-to-json-schema";

export const readNoteInputSchema = targetModeSchema;
export type ReadNoteInput = TargetMode;
export const readNoteInputJsonSchema = zodToJsonSchema(readNoteInputSchema, {
  $refStrategy: "none",
}) as Record<string, unknown>;
```

### Rationale

The spec's FR-002 mandates Composition Pattern (b) per [BI-029 FR-005](../004-target-mode-schema/spec.md): "call `.extend({...})` on each per-branch BASE schema export, wrap each result with the corresponding refinement helper, then re-build a `z.discriminatedUnion("target_mode", […])`." This shape is **structurally infeasible** as written. The primitive at [src/target-mode/target-mode.ts:78-83](../../src/target-mode/target-mode.ts#L78-L83) explicitly documents:

> z.discriminatedUnion requires ZodObject branches — it reads .shape[discriminator] during construction, which ZodEffects lacks. Apply the per-branch refinements via a union-level superRefine dispatcher rather than per-branch wrapping. Pattern (b) consumers must follow the same idiom: extend the BASE schemas, build a discriminated union over the extended bases, then dispatch to the per-branch refinement bodies via union-level superRefine.

The primitive's exported helpers (`applyTargetModeSpecificRefinement`, `applyTargetModeActiveRefinement`) wrap a `ZodObject` and return a `ZodEffects` — and `z.discriminatedUnion` rejects `ZodEffects` branches at construction time. Literal Pattern (b) therefore cannot be implemented by an external consumer using only the currently-exported surface.

The constitutionally-correct workaround documented in the primitive's comment is the **union-level superRefine idiom**: extend bases (still ZodObject), build the union over the extended bases, then apply a union-level `superRefine` that dispatches to the per-branch refinement BODIES (`refineSpecificBranch` / `refineActiveBranch`). However, **those bodies are private to the primitive module** — not exported. A consumer applying the workaround would have to either (a) duplicate the refinement-body source (violates Constitution Principle III's single-source-of-truth rule) or (b) import private symbols (won't typecheck under TypeScript strict mode and is structurally a violation of module boundary discipline).

Read_note adds **zero tool-specific fields** beyond what the primitive provides. With zero extra fields, the output of any literal Pattern (b) implementation would be **structurally identical to the primitive itself**: the `.extend({})` calls are no-ops, the rebuilt union is identical to `targetModeSchema`, the union-level superRefine dispatches to the same private bodies that `targetModeSchema`'s own union-level superRefine already dispatches to. The two schemas would parse the same inputs, produce the same errors, and infer the same types. Re-export delivers the same observable behaviour with zero structural divergence — and it preserves the single-source-of-truth invariant.

The "tool has its own typed handle" requirement from the spec's FR-005 ("MUST export the inferred TypeScript type via `z.infer<typeof readNoteInputSchema>`") is satisfied by the local export. Downstream code uses `import type { ReadNoteInput } from "./schema.js"`; the type is locally named even though it aliases to `TargetMode`.

### Alternatives considered

1. **Literal Pattern (b) with `.extend({})` no-ops + duplicated refinement bodies**. Rejected: violates Principle III (single source of truth) — the refinement bodies would exist in two places, drift becomes possible, and the spec's FR-002 precisely mandates that the primitive's contract be inherited not re-stated.

2. **Amend BI-029 to export `refineSpecificBranch` and `refineActiveBranch`, then use them in a hand-wired Pattern (b) dispatcher**. Rejected for THIS BI: amending a foundation feature's exports inside a downstream BI's plan inverts the dependency direction. This is a YAGNI/scope concern more than a correctness concern — the amendment is small (~3 lines: `export { refineSpecificBranch, refineActiveBranch }`) but doesn't gain anything for read_note specifically (the resulting schema is structurally identical to re-export). **However** — this is documented as P8: a future typed-tool BI that DOES add tool-specific fields will need this amendment, and the amendment lands in that BI's plan, not here.

3. **Pattern (a) `targetModeSchema.and(z.object({}))`**. Rejected as the spec already rejected it: "structurally noisier and provides no additional value" (FR-002 reasonable-default note). The output is also a `ZodIntersection` rather than a `ZodDiscriminatedUnion`, which mildly degrades the JSON Schema output (`anyOf`/`allOf` flattening behaviour shifts).

4. **A new helper function `readNoteSchema()` in the primitive that takes an extension object and returns a refined union**. Rejected: forward-looking design without a concrete consumer. P8's "primitive amendment lands when the first consumer needs it" applies here too. For read_note's zero-field case, a parameterized helper adds no value.

### Documented FR-002 deviation

A reviewer reading the spec's FR-002 literally will see "MUST compose [...] using Composition Pattern (b)" and the implementation re-exports. **This plan is the authority for that resolution.** The deviation is a structural-equivalence resolution, not a contract change: the parsed shape, the failure modes, and the inferred type are all identical to a literal Pattern (b) implementation. Constitution Principle III — single source of truth — is the binding rule, and it is satisfied. If a future amendment to the spec or the constitution decides to require literal Pattern (b) regardless of structural equivalence, the resolution shifts: the BI-029 amendment from alternative #2 lands and read_note adopts the hand-wired form.

---

## P2 — Top-level description wording (FR-009)

### Decision

The pinned string for `READ_NOTE_DESCRIPTION` (the `descriptor.description` field exposed in `tools/list`):

```
Read a note from an Obsidian vault. Returns the note's raw UTF-8 text as { content: <stdout> }. Specific mode: vault + exactly one of file (wikilink) or path (vault-relative). Active mode: no locator — reads the focused note. Call help({ tool_name: "read_note" }) for full parameter docs and the error-code roster.
```

### Rationale

Five constraints bind this string:

1. **Verb-led** per FR-009 + BI-030 ADR-005 caveman-description requirement: "Read" is the first word.
2. **States the input shape** so an agent can construct a valid call without round-tripping through `help`: both branches are named ("Specific mode: ...", "Active mode: ...") with their respective field requirements ("vault + exactly one of file or path"; "no locator").
3. **States the output** so an agent knows what to expect back: "raw UTF-8 text as { content: <stdout> }".
4. **References `help({ tool_name: "read_note" })`** verbatim per Story 6 AC#2 + BI-030 FR-015. The literal substring `"help"` is present (case-insensitive), and the tool's name `"read_note"` is included so the Story 6 AC#2 grep test passes.
5. **Token budget**: ~270 chars — comparable to obsidian_exec's post-BI-030 description (~340 chars at [src/tools/obsidian_exec/tool.ts:15-16](../../src/tools/obsidian_exec/tool.ts#L15-L16)). ADR-005's directional ~70% reduction target is comfortably met (a verbose alternative naming all five propagated error codes would be ~500 chars).

### Alternatives considered

1. **Shorter: `"Read a note. Call help(\"read_note\") for docs."`**. Rejected: too lossy. An agent without prior context cannot construct a valid call without knowing about target_mode's two branches; forcing a `help` round-trip on every first-time call defeats the point of having any description at all.

2. **Longer (mention all error codes inline)**. Rejected: duplicates content that lives in `docs/tools/read_note.md`. ADR-005's progressive-disclosure principle places error rosters in the doc, not in the descriptor.

3. **Mention the two locator forms inline** (e.g., "file (wikilink) e.g., 'Recipe', or path (vault-relative) e.g., 'Templates/Recipe.md'"). Rejected: the parenthetical examples grow the description by ~100 chars and the agent gets the same information from `docs/tools/read_note.md` Examples section.

4. **Match obsidian_exec's wording cadence exactly** (sentence-fragment failure-mode list at the end). Rejected: read_note's failure modes are simpler (no timeouts at the typed-tool layer beyond the adapter's, no output cap inside read_note); replicating obsidian_exec's "Failures (..., ..., ...) surface as ..." sentence would imply read_note has its own failure surface to enumerate, which it doesn't.

---

## P3 — Server.ts registration order (FR-010)

### Decision

Alphabetical by tool name in [src/server.ts](../../src/server.ts):

```typescript
const tools: RegisteredTool[] = [
  registerHelpTool(),
  registerObsidianExecTool({ logger, queue }),
  registerReadNoteTool({ logger, queue }),
];
```

### Rationale

The current order at [src/server.ts:49-52](../../src/server.ts#L49-L52) is `obsidian_exec` then `help` (registration-of-introduction). Reordering to alphabetical at this BI's registration edit makes future additions trivial — `read_heading` slots between `read_note` and `search_vault` automatically; `write_note` lands at the end. Deterministic ordering also makes the registry-consistency block at `src/server.test.ts` produce stable iteration order across runs (helpful when test failures need to be reproduced).

### Alternatives considered

1. **Registration-of-introduction order** (`obsidian_exec`, `help`, `read_note`). Equally valid per FR-010. Rejected because alphabetical scales better as the typed-tool series grows. The reorder is a one-line cosmetic change inside this BI's `src/server.ts` edit.

2. **Group by category** (e.g., meta tools first: `help`; then untyped: `obsidian_exec`; then typed: `read_note`). Rejected: invents a categorisation that's not present in the spec or architecture and that would need maintenance as new tool kinds appear.

---

## P4 — Log-event payload extras beyond the FR-017 minimum (FR-017)

### Decision

The three FR-017 events carry the named minimum fields plus one ergonomic extra on `callStart`:

| Event | Payload |
|-------|---------|
| `logger.callStart` | `{ callId, command: "read", vault: parsed.target_mode === "specific" ? parsed.vault : null, queueDepth, locator }` |
| `logger.callEndSuccess` | `{ callId, durationMs, stdoutBytes }` |
| `logger.callEndFailure` | `{ callId, errorCode, durationMs }` |

`callId` is generated via `randomUUID()` from `node:crypto` at the top of `executeReadNote` (mirroring [obsidian_exec handler.ts:64](../../src/tools/obsidian_exec/handler.ts#L64)). `queueDepth` is `Math.max(0, deps.queue.depth() - 1)` (mirroring [obsidian_exec handler.ts:69](../../src/tools/obsidian_exec/handler.ts#L69) — `-1` because the current call is itself in the queue). `locator` is `"file"` / `"path"` / `"active"` derived from the parsed input. `stdoutBytes` is `Buffer.byteLength(content, "utf8")` — counts bytes, not UTF-16 code units, matching obsidian_exec's `stdoutBytes` semantics at [obsidian_exec handler.ts:234](../../src/tools/obsidian_exec/handler.ts#L234).

### Rationale

The FR-017 minimum (callId, command, vault, queueDepth on start; durationMs + stdoutBytes on success; errorCode + durationMs on failure) is what the clarification pinned. The single addition — `locator` on `callStart` — is justified as a debugging affordance: when an operator reads the log stream and sees a slow read, knowing whether it was a wikilink lookup (`file=`) or a path lookup (`path=`) or an active-mode read informs the next debugging step (e.g., "all path-mode reads are slow → check vault disk contention" vs "all file-mode reads are slow → check Obsidian's wikilink resolution"). Adding `locator` costs one string allocation per call and three characters of log payload. Other fields considered and rejected:

### Alternatives considered

1. **Add `argv` to `callStart`** (parity with obsidian_exec's `argv` field). Rejected: the cli-adapter assembles argv internally and the read_note handler never sees it. Emitting an empty or dummy `argv` would mislead an operator reading the log into thinking they have the actual subprocess invocation; emitting a constructed-but-pre-adapter shape (`["read", "vault=..."`, ...]`) would couple this handler to the adapter's argv-assembly contract, defeating the purpose of routing through `invokeCli`.

2. **Add `stderrBytes` to `callEndSuccess`** (parity with obsidian_exec's success-event payload). Rejected: the cli-adapter discards stderr on the success path for read calls — there's no `stderrBytes` to report from the read_note handler's vantage. (If a future amendment exposes stderr through a new adapter return field, this can be revisited.)

3. **Add `exitCode` and `signal` to `callEndFailure`** (parity with obsidian_exec's `CLI_NON_ZERO_EXIT` event payload). Rejected: those fields are nested inside `UpstreamError.details` and surfacing them at the event-payload level requires switching on the error code (`CLI_NON_ZERO_EXIT` carries `exitCode` and `signal`; `CLI_REPORTED_ERROR` carries `message`; `CLI_BINARY_NOT_FOUND` carries `binaryAttempted` and `PATH`; etc.). Switching on the code at the log-event layer creates parallel logic to the adapter's classification — a maintenance hazard. The plain `errorCode + durationMs` payload is what the operator needs to triage; the structured `details` are available in the `asToolError` MCP response for deeper debugging.

4. **Emit a single combined `callEnd` event with a union-typed payload** (one event for both success and failure). Rejected: the existing `Logger` interface at [src/logger.ts](../../src/logger.ts) exposes three distinct methods (`callStart`, `callEndSuccess`, `callEndFailure`); changing to a single method would require a logger-level amendment that other consumers depend on. Out of scope.

---

## P5 — `docs/tools/read_note.md` body structure (FR-011)

### Decision

The Markdown body follows the section ordering used by `obsidian_exec.md` (the post-BI-030 non-stub doc) for cross-tool consistency. Section list (precise prose to be written at implementation time):

1. **Overview** — one-paragraph summary opening with "Read a note's raw text from an Obsidian vault" and naming the two target modes.
2. **Input Schema** — input fields enumerated by branch:
   - **Specific** mode: `target_mode: "specific"` (literal), `vault` (string, min 1, required), exactly one of `file` (string, wikilink) or `path` (string, vault-relative path).
   - **Active** mode: `target_mode: "active"` (literal), no other keys permitted.
   - Cross-link to [target-mode primitive spec](../../specs/004-target-mode-schema/spec.md) for the discriminator's full contract.
3. **Output** — JSON object `{ content: string }` — UTF-8 raw text, verbatim from CLI stdout, no transformation, no trimming, no normalization.
4. **Errors** — table of propagated codes:
   | Code | When it surfaces |
   |---|---|
   | `VALIDATION_ERROR` | Zod schema rejected the input (missing/forbidden field, both file+path, etc.). |
   | `CLI_NON_ZERO_EXIT` | Adapter classified a non-zero exit code (e.g., locator does not resolve). |
   | `CLI_REPORTED_ERROR` | CLI exited 0 but stdout starts with `Error:` prefix. |
   | `ERR_NO_ACTIVE_FILE` | Active mode + no focused note. |
   | `CLI_BINARY_NOT_FOUND` | The Obsidian CLI binary is not on PATH. |
   - Cross-link to [errors contract](../../specs/001-add-cli-bridge/contracts/errors.contract.md).
5. **Examples** — three code blocks, one per branch:
   - `read_note({ target_mode: "specific", vault: "MyVault", file: "Recipe" })` → `{ content: "# Recipe\n\nIngredients...\n" }`
   - `read_note({ target_mode: "specific", vault: "MyVault", path: "Templates/Recipe.md" })` → `{ content: "<template body>" }`
   - `read_note({ target_mode: "active" })` → `{ content: "<active note body>" }` or `ERR_NO_ACTIVE_FILE` if no focused note.
6. **References** — bullet list with links to [the cli-adapter spec](../../specs/003-cli-adapter/spec.md), [target-mode primitive spec](../../specs/004-target-mode-schema/spec.md), and [help tool spec](../../specs/005-help-tool/spec.md).

No `// Original — no upstream.` header (Markdown is exempt per BI-030 FR-019). No `<!-- TODO(BI-003): … -->` stub marker.

### Rationale

The section list mirrors `obsidian_exec.md`'s structure so the `help` tool returns consistent shapes across tools — an agent that has just learned `obsidian_exec`'s doc layout can apply the same parsing strategy to `read_note`'s doc without further training. The Errors table form (rather than a bulleted list) matches the table-form precedent in `obsidian_exec.md`. The cross-references at the end thread the spec hierarchy (cli-adapter → target-mode → help-tool) so a downstream reader can audit the contract trail.

### Alternatives considered

1. **Skip the References section**. Rejected: an agent (or human) reading just `read_note.md` should be able to find the upstream contracts without grepping the repo. The cross-references are cheap (3 bullet lines) and high-value.

2. **Combine Input Schema and Examples into a single "Usage" section**. Rejected: structural-vs-illustrative content has different reading purposes — the schema is reference, the examples are tutorial.

3. **Add a "Notes" or "Caveats" section listing the empty-string footgun, the binary-content edge case, etc.**. Rejected: that material lives in the spec's Edge Cases. The doc is for users of the tool; the spec is for implementers.

---

## P6 — Test-injection pattern (FR-013)

### Decision

Tests inject the stub adapter via `deps.spawnFn` per the cli-adapter's existing test-seam convention (per [BI-028 FR-002](../003-cli-adapter/spec.md)). The `RegisterDeps` shape passed to `registerReadNoteTool` exposes `spawnFn?: SpawnLike` and `env?: NodeJS.ProcessEnv` as optional pass-through fields (typed via the cli-adapter's exported `SpawnLike` type, mirroring obsidian_exec's `ExecuteDeps` at [src/tools/obsidian_exec/handler.ts:27-28](../../src/tools/obsidian_exec/handler.ts#L27-L28)).

For each test category:

- **Schema tests** (`schema.test.ts`): No `deps` needed. Import `readNoteInputSchema` directly and call `.safeParse(input)`. Assertions inspect the `success` flag and `error.issues` array.
- **Handler tests** (`handler.test.ts`): Construct minimal deps in each test body:
  ```typescript
  const stubLogger: Logger = { callStart: vi.fn(), callEndSuccess: vi.fn(), callEndFailure: vi.fn(), shutdown: vi.fn() };
  const queue = createQueue();
  const stubSpawn: SpawnLike = (binary, args, options) => { /* stub child */ };
  const result = await executeReadNote(parsed, { logger: stubLogger, queue, spawnFn: stubSpawn });
  ```
  Assertions check the result shape (`{ content }`), the propagated error code (on failure paths), and the captured logger calls.
- **Tool-registration tests** (`tool.test.ts`): The same minimal deps shape is passed to `registerReadNoteTool`; the returned `RegisteredTool.handler(args)` is invoked with raw input objects to exercise the descriptor + the wired-up validation.

**No mock of the `cli-adapter` module itself** — tests exercise the real adapter with a stub `spawnFn`, matching the existing `obsidian_exec` test pattern at [src/tools/obsidian_exec/handler.test.ts](../../src/tools/obsidian_exec/handler.test.ts).

### Rationale

The cli-adapter's contract from BI-028 designates `spawnFn` as the canonical test seam — see the adapter's `invokeCli` deps signature. Using `vi.mock` to stub the adapter module would bypass the very seam BI-028 designed for testing, hide bugs in the read_note → adapter integration, and create a parallel "test-only" path through the codebase that drifts from the production path. The deeper-seam convention is correct and consistent across the project.

### Alternatives considered

1. **Mock `invokeCli` directly via `vi.mock("../../cli-adapter/cli-adapter")`**. Rejected: bypasses the canonical test seam and uncouples read_note's tests from the adapter's contract. Future adapter refactors that change `invokeCli`'s argv-assembly behaviour would not surface as test failures in read_note's tests, even though they could break the integration.

2. **Construct a fully-mocked `ExecuteDeps` with a synthetic `spawnFn` that returns a JSON-serializable result directly (no child-process events)**. This is possible — `SpawnLike` returns a `ChildProcess`-shaped object — but every existing test in the repo (obsidian_exec/handler.test.ts, cli-adapter.test.ts) uses an `EventEmitter`-based stub that emits real child-process events. Rejected: deviating from the established stub pattern would create a fork in test conventions and force readers to learn two patterns.

3. **Use a real test fixture binary instead of stubbing**. Rejected: integration-with-real-binary tests are slow and platform-dependent; they belong in a separate test tier (manual / pre-release smoke), not in vitest unit tests.

---

## P7 — TODO-marker absence test mechanism (FR-013 (e))

### Decision

The TODO-marker absence assertion lives in `src/tools/read_note/tool.test.ts` (NOT in the registry-consistency block at `src/server.test.ts`):

```typescript
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

it("docs/tools/read_note.md has no stub TODO marker (FR-011)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const docPath = resolve(here, "../../../docs/tools/read_note.md");
  const body = readFileSync(docPath, "utf8");
  expect(body).not.toContain("<!-- TODO(BI-003)");
});
```

Path resolution from `import.meta.url` (NOT `process.cwd()`) mirrors the help tool's path-resolution pattern at [src/tools/help/handler.ts](../../src/tools/help/handler.ts).

### Rationale

Three reasons for placement:

1. The registry-consistency block at `src/server.test.ts` is generic across all tools (file existence + schema strip). Adding read_note-specific content checks there couples it to per-tool BI scope and creates churn every time a new BI lands its doc.
2. Co-locating with the read_note module's other registration tests keeps the failure mode discoverable: a contributor running `vitest src/tools/read_note/` sees the failure immediately.
3. The check is a documentation-content check, structurally distinct from the schema-strip check the registry-consistency block performs.

`process.cwd()` is rejected per the help-tool precedent — it couples test pass/fail to the runner's invocation directory, which differs between local `vitest` runs (project root) and CI configurations.

### Alternatives considered

1. **Add to the registry-consistency block as a generic "no doc file contains TODO marker" assertion**. Rejected: would couple this BI's tests to all other tools' stub-removal status; spurious failures when (e.g.) BI-005 lands `write_note` while BI-003 is on a feature branch.

2. **Add as an integration test that calls `help({ tool_name: "read_note" })` and asserts the response body doesn't contain the marker**. Rejected: integration through the MCP boundary is heavier than necessary for a single-content assertion; a direct file read is simpler and faster.

3. **Skip the test entirely and rely on the FR-011 reviewer to catch a stub-leftover at PR review**. Rejected: process safeguards plus automated tests is the project's baseline; FR-013 (e) explicitly mandates the test.

---

## P8 — Future typed-tool BIs and the BI-029 amendment (Reasonable default)

### Decision

This BI does NOT amend BI-029 / `src/target-mode/target-mode.ts`. The amendment that exposes `refineSpecificBranch` / `refineActiveBranch` as named exports (or alternatively a public union-level dispatcher helper) lands in the FIRST typed-tool BI that adds tool-specific fields beyond the primitive's shape — likely BI-004 `read_heading` (which adds a `heading: string` field).

### Rationale

Read_note's zero-extra-fields case is solved by P1's re-export. Amending the primitive in this BI to enable future composers would be:

- **YAGNI**: no consumer of the amendment exists yet; the design space for future typed tools is partially settled (`read_heading` exists in the architecture, but `search_vault` may have completely different shape needs).
- **Inverted dependency**: amending a foundation feature (BI-029) inside a downstream feature's plan (this BI) puts amendment authority in the wrong place. The amendment SHOULD land alongside its first concrete consumer so the consumer's shape requirements drive the amendment's shape.
- **Premature**: the amendment's exact shape (just-export-bodies vs. parameterized dispatcher helper vs. extension factory) depends on what consumers need. With one consumer (`read_heading`), the simplest form will do; with three or more, parameterization may pay off.

### Alternatives considered

1. **Prophylactically amend BI-029 in this BI**. Rejected for the three reasons above.

2. **Document the amendment as a follow-up in the architecture document**. The architecture document already names the typed-tool BIs and their order; a one-line note "BI-004 plan must amend BI-029 to expose refinement bodies" can be added when this BI's PR lands, but the amendment itself is not part of THIS BI's scope.

---

## Summary table

| Decision | Resolution | Driving force |
|----------|------------|---------------|
| P1 | Re-export `targetModeSchema` | FR-002 vs. ZodEffects-in-discriminatedUnion infeasibility; structural equivalence for zero-extra-fields case |
| P2 | Pinned 270-char description | Verb-led + both branches + output shape + `help` reference + token budget |
| P3 | Alphabetical registration order | Determinism + future-tool growth |
| P4 | FR-017 minimum + `locator` extra on callStart | Operator triage affordance; UTF-8 byte semantics for `stdoutBytes` |
| P5 | `obsidian_exec.md`-mirrored section ordering | Cross-tool doc consistency; progressive disclosure |
| P6 | `deps.spawnFn` injection through real adapter | BI-028's canonical test seam |
| P7 | TODO-marker check in `tool.test.ts` via `import.meta.url` | Discoverability + scope locality |
| P8 | No primitive amendment in this BI | YAGNI; amendment lands with first consumer |

All eight decisions are encoded in [plan.md](./plan.md) and inform Phase 1's data-model + contracts + quickstart artifacts.
