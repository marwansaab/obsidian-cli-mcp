<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
[specs/046-reconcile-truncation-docs/plan.md](specs/046-reconcile-truncation-docs/plan.md)

References:
- [.specify/memory/constitution.md](.specify/memory/constitution.md) — Five non-negotiable principles every change must satisfy. Principle I (Modular Code Organization: per-surface modules with one-directional imports, `{schema, tool, handler}.ts` layout, no upward or cyclic deps); Principle II (Public Surface Test Coverage: every MCP tool ships with happy-path + failure-or-boundary tests co-located as `*.test.ts` in the same change that adds/renames/modifies it); Principle III (Boundary Input Validation with Zod: schemas are the single source of truth for published shape, runtime parse, and downstream types via `z.infer`; no hand-rolled types or `typeof`/`instanceof` chains at boundaries); Principle IV (Explicit Upstream Error Propagation: failures surface through `UpstreamError` with stable `code` / `cause` / `details`; no silent fallbacks, empty results, or plain `throw new Error` at boundary surfaces); Principle V (Attribution & Layered Composition: every source file carries either an upstream-attribution header with SPDX + version or an `Original — no upstream` header). Each PR's Constitution Compliance checklist marks Y / N / N/A per principle plus ADR-010 / ADR-013 / ADR-014 / ADR-015; any `N` requires a Complexity Tracking entry in the plan.
<!-- SPECKIT END -->

## Test Execution

Before invoking any test that touches the filesystem or the `obsidian` CLI binary, read [.memory/test-execution-instructions.md](.memory/test-execution-instructions.md). It names the authorised test vault, the scratch subdirectory, the destructive-probe protocol, and the cleanup expectations. The `.memory/` folder is gitignored — those instructions are for the assistant, not the project, so do not move them into a checked-in location and do not edit them on the user's behalf without being asked.

This gate applies to every test category that produces real CLI invocations: T0 live-CLI probes during `/speckit-implement`, FR-019 characterisation cases, manual quickstart scenarios, and any ad-hoc validation of a tool call's behaviour against a real vault. It does not apply to in-process unit tests that mock `invokeCli`.

## Communication Style

**Default mode**: caveman full — implicitly active for every response in this project. The user has set this as the project-wide default; you do NOT need to invoke `/caveman full` per response, and you do NOT need to mention that caveman mode is active.

**What "full" means** (per the caveman skill at `~/.claude/skills/caveman/SKILL.md`):
- Drop articles (a/an/the), filler ("just", "really", "basically", "actually", "simply"), pleasantries ("Sure!", "Of course", "Happy to help"), and hedging.
- Fragments OK. Short synonyms (big not extensive, fix not "implement a solution for").
- Pattern: `[thing] [action] [reason]. [next step].`
- Technical terms exact. Code blocks unchanged. Errors quoted exact. Function names, API names, error strings: never abbreviate.

**Auto-clarity carve-outs** (drop the full-mode terseness when):
- Security warnings or destructive-action confirmations.
- Irreversible action confirmations.
- Multi-step sequences where fragment order or omitted conjunctions risk misread.
- Compression itself creates technical ambiguity.
- The user asks for a clarification or repeats a question.
Resume full mode after the clear part is done.

**Override**: the user can switch level mid-conversation with `/caveman lite|ultra|wenyan-lite|wenyan-full|wenyan-ultra` or revert entirely with `stop caveman` / `normal mode`. Honour the override for the rest of the session.

**Writing artifacts (CLAUDE.md, spec.md, plan.md, research.md, source files, commit messages, PR descriptions)**: write in normal prose — these are durable artifacts read out-of-conversation. Caveman full applies to chat responses only.

## Architecture & Decision References

Three reference sources document the project's design rationale. Consult them **before** proposing or making design decisions, and cite the relevant ADR/architecture/graph evidence when justifying choices:

- [.architecture/](.architecture/) — high-level architecture notes describing the system's structure, module boundaries, and design principles. Start with [Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md).
- [.decisions/](.decisions/) — Architecture Decision Records (ADRs). [Decision Log.md](.decisions/Decision%20Log.md) is the index; each ADR-NNN file contains the full decision text.
- [graphify-out/](graphify-out/) — structural knowledge graph of the codebase. The architecture and ADRs describe **intent**; the graph describes **structural reality** as it exists on disk. Use the graph to verify that intent and reality agree.

When a design choice conflicts with an existing ADR, surface the conflict to the user rather than silently overriding it — superseding an ADR is a deliberate act that should produce a new ADR, not an undocumented drift.

When the graph contradicts the architecture or an ADR (e.g., a god-node where the ADR says there should be a seam, or a community where the architecture says there should be a layer), surface the contradiction. Either the graph reveals drift the ADRs haven't caught up to, or a recent change violated a written invariant. Both outcomes are actionable.

## Knowledge Graph (graphify-out/)

The project maintains a structural knowledge graph at `graphify-out/`, built by the `graphify` skill. The graph is rebuilt automatically on every commit via a `post-commit` git hook (AST-only, no LLM cost). Semantic nodes (extracted from prose: ADRs, specs, CLAUDE.md, constitution) refresh only on explicit `/graphify --update`.

**Outputs**:
- `graphify-out/GRAPH_REPORT.md` — human-readable audit: god nodes, surprising connections, suggested questions, community summaries.
- `graphify-out/graph.json` — queryable graph data.
- `graphify-out/graph.html` — interactive visualisation (open in browser).

**Trigger**: `/graphify` (per the skill at `~/.claude/skills/graphify/SKILL.md`). The `--platform windows` install flag affects internal shell invocation only; the user-facing trigger is the same cross-platform name. Subcommands:
- `/graphify query "..."` — natural-language structural questions ("what depends on X", "what classifies through Y").
- `/graphify path A B` — shortest path between two named symbols.
- `/graphify explain X` — full neighbourhood of a node.
- `/graphify --update` — refresh semantic nodes after prose/spec changes (costs tokens; batch at phase boundaries, not after every edit).

### When to consult the graph autonomously

For SPECIFIC structural questions, query `graph.json` directly via the named subcommands. They return precisely-scoped answers (~1-3 KB each) and are the PRIMARY interface to the graph:

- "What depends on / imports / consumes X?" → `/graphify query "what depends on X"`.
- "How does A relate to B structurally?" → `/graphify path A B`.
- "What is the neighbourhood of X?" → `/graphify explain X`.

**Do NOT read `graphify-out/GRAPH_REPORT.md` as a default first step.** It is a ~25k-token human-readable summary intended for COLD-START ORIENTATION ONLY — useful when you don't yet know which node to query (e.g. unfamiliar codebase, broad "what's in here" survey). For any session where the relevant symbols are already named in the user's prompt, the spec, the open files, or the conversation, skip the report entirely and go straight to the subcommands. Reading the report when you already know what to query is a token-expensive detour that produces no information the queries don't.

Grep remains correct for textual/lexical questions ("where is the string 'foo' used?"); the graph is for structural questions.

### Graph consultation during Spec Kit phases

Spec Kit phases run on intent (the spec) and structure (the codebase). The graph is the bridge.

- **`/speckit-clarify`**: when a clarification question concerns an existing pattern, cohort, or cross-cutting concern, ground the answer with `/graphify explain` or `/graphify query`. The Business Analyst / Solution Architect role becomes accurate (not just plausible) when graph-grounded.
- **`/speckit-plan`**: before submitting a plan for approval, identify the affected communities and god-nodes via graph queries. Document them in the plan's research/decisions section. If the plan touches any of the four kernel nodes (`createLogger`, `createQueue`, `UpstreamError`, `createServer`), say so explicitly — these are high-blast-radius areas.
- **`/speckit-analyze`**: after implementation but before marking the BI Complete, run `/graphify --update` to refresh semantic nodes, then verify:
  1. No new top-level error codes were introduced (Constitution Principle IV) — there should be no new error-class nodes outside the errors.ts community.
  2. No production handler imports the boot-time factories directly (`createLogger`, `createQueue`) — these should remain confined to `server.ts` per the project's DI discipline.
  3. New symbols land in expected communities — surprise community placement is a smell worth investigating before shipping.
  4. New production code is structurally connected, not orphaned (test files are expected to be weakly connected; production files are not).

Document any structural deviations in the BI's analyze artifact with rationale. The graph is the structural truth-check on whether the plan's intent matches the implementation's reality.

### Validated architectural facts the graph encodes

The following facts have been verified empirically via graph traces and are stable across BIs. Treat them as load-bearing invariants when reasoning about new BIs:

- **Three spines, not one**: boot spine (`index.ts → server.ts → tools/_register.ts → createXTool() × N`), runtime spine (`handler.ts → invokeCli → spawn/Logger/Queue`), error spine (`handler.ts → UpstreamError`). `server.ts` owns the boot spine only and is absent from runtime and error spines.
- **`server.ts` is the sole production file that constructs both `createLogger()` and `createQueue()`**. Every other production file receives them as injected deps via `RegisterDeps` / `ExecuteDeps`. Handlers must not reach back into the composition root at runtime.
- **`UpstreamError` is a pure value type** — imported by ~33 files, called by zero. Every handler classifies its failures through one of its six codes. The fifteen-tool zero-new-codes streak (Principle IV) shows up structurally as a star with `UpstreamError` at the centre.
- **The four god-nodes by degree** (raw, before dedup): `createLogger()` (~80), `createQueue()` (~57), `UpstreamError` (~47), `createServer()` (~30+). These have stayed stable across builds; treat changes to this list as architectural events worth attention.

### Graph hygiene notes

Two known caveats when reading graph numbers:

1. **Dedup imperfection on re-exported types**: TypeScript classes that are re-exported across module boundaries produce 2–3 separate nodes in the graph (one AST, one semantic, sometimes one external-marker). Centrality scores split across them. Mentally add the degrees together for top-level types when comparing across builds.
2. **AST noise floor ~50–60%**: a large fraction of weakly-connected nodes are tokenisation artifacts (local variables, destructured fields, generic type params), not genuine documentation gaps. Test files run 80–90% weakly-connected by design — they construct one-use fixtures.

When citing graph numbers in plans, ADRs, or BI artifacts, prefer relative claims ("X is among the top god-nodes", "Y bridges N communities") over absolute counts when the absolute count is dedup-sensitive.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- **Query-first.** For SPECIFIC structural questions, query `graph.json` directly via `/graphify explain X`, `/graphify query "..."`, or `/graphify path A B`. These return scoped answers (~1-3 KB each) and are the PRIMARY interface to the graph. Prefer them over grep for cross-module questions like "what depends on X" or "how does A relate to B" — they traverse EXTRACTED + INFERRED edges instead of scanning files.
- **Read `graphify-out/GRAPH_REPORT.md` ONLY for cold-start orientation** when you don't yet know which node to query. Skip it whenever the relevant symbols are already known from the user prompt, the spec, the conversation, or the open files. The report is a ~25k-token summary — wrong default for a focused question.
- IF `graphify-out/wiki/index.md` EXISTS, navigate it instead of reading raw files.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
