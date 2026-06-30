<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
[specs/066-file-scope/plan.md](specs/066-file-scope/plan.md)

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

**Cost awareness**. `/graphify explain`, `query`, and `path` are AST-only and near-zero token cost — invoke them liberally during clarify, plan, tasks, and analyze. `/graphify --update` refreshes semantic nodes via LLM extraction and has real token cost — batch it at phase boundaries (typically once post-implement), never per-edit.

**Scope carve-outs**. The per-phase rules below assume a BI whose diff scope includes `src/**` or `*.test.ts`. For docs-only BIs (diff scope confined to documentation, specs, decisions, architecture notes, and similar prose surfaces — i.e., no `src/**` or `*.test.ts` files change), the clarify and plan rules still apply (the graph informs decisions about which existing symbols the docs describe), the tasks rule is N/A, the pre-implement analyze rule is N/A, and the post-implement structural-verification rule degrades to the orphan-check only on new spec-artifact files. Note the N/A explicitly in the relevant artifact (plan.md `### Graphify structural check` section, tasks.md Notes section, or the analyze artifact) so a reader sees the scope decision was made deliberately, not silently skipped.

**Kernel nodes**. Rules below cite "the kernel nodes" without enumerating them inline; the single source of truth for that list is the `### Validated architectural facts the graph encodes` section below. Cite by name and role, not by degree count — degree counts drift as the codebase grows.

- **`/speckit-clarify`**: before asking each clarification question, check the question text for any of these structural triggers:
  - names an existing tool, handler, schema, error class, or any of the kernel nodes;
  - names a cohort of more than one tool (e.g. "the search tools", "all handlers that ...");
  - names an existing convention governed by an ADR (consult [.decisions/Decision Log.md](.decisions/Decision%20Log.md) for the live ADR set — do not hard-code ADR numbers in this rule, since the set grows);
  - names a cross-module pattern (DI, error propagation via `UpstreamError`, attribution headers, plugin-lifecycle stage ordering, sub-discriminator routing, etc.).

  If any trigger fires, run `/graphify explain <named-symbol>`, `/graphify query "..."`, or `/graphify path A B` BEFORE writing the question's options table. Cite at least one structural fact from the graph in the question's Context paragraph or in an option rationale. "Ground the answer" means: surface a graph fact, not just rely on prior code-reading. If no trigger fires (the question concerns prose / scope / methodology / wording only), skip the graph query and note the skip in the question framing if helpful.

- **`/speckit-plan`**: before submitting the plan for approval, identify the affected communities via graph queries and the kernel-node touch surface via direct lookup. Document the findings in the plan's `### Graphify structural check` section (create one if the plan template doesn't yet include it). If the plan touches any of the kernel nodes, name them explicitly and call out the high-blast-radius surface — kernel-node touches warrant Constitution Compliance reviewer attention even when no principle is technically violated. If the plan touches none of the kernel nodes, say so explicitly — the explicit no-touch claim is what the post-implement structural-verification step verifies against.

- **`/speckit-tasks`**: when the task list crosses two or more source modules, run `/graphify path <symbol-A> <symbol-B>` for each pair of symbols a task pair both touches. The path query surfaces transitive dependencies the prose plan may not have spelled out; add an explicit task-dependency note if a structural path exists that the task graph doesn't already reflect. For docs-only or single-source-file BIs, this rule is N/A — note the N/A in `tasks.md` Notes.

- **`/speckit-analyze` (pre-implement, cross-artifact consistency)**: the analyze pass is read-only against the spec / plan / tasks / research / data-model / quickstart prose. Graph queries during this pass are OPTIONAL and serve one purpose: verify that the plan's named symbols, communities, and kernel-node-touch claims still hold at HEAD (the graph may have shifted since the plan-time queries if other BIs landed in the interim). Run `/graphify explain <symbol>` for each kernel-node the plan explicitly claims to avoid touching, and for any god-node the plan names by role. For docs-only BIs, this rule is N/A — note the N/A in the analyze artifact.

- **Post-implement structural verification** (after `/speckit-implement` lands code, before marking the BI complete): run `/graphify --update` to refresh semantic nodes, then verify:
  1. No new top-level error codes were introduced (Constitution Principle IV) — there should be no new error-class nodes outside the `src/errors.ts` community.
  2. No production handler imports the boot-time DI factories directly — those factories (named in the `### Validated architectural facts` section below) must remain confined to `server.ts` per the project's DI discipline.
  3. New symbols land in expected communities — surprise community placement is a smell worth investigating before shipping.
  4. New production code is structurally connected, not orphaned (test files are expected to be weakly connected; production files are not).

  For docs-only BIs (no `src/**` change shipped), checks 1–3 are trivially satisfied; check 4 reduces to confirming any new spec-artifact files (mirror files, evidence files under `specs/<BI>/contracts/`) land in a fresh BI-specific community and are not orphaned. Note the trivial-satisfaction status in the post-implement artifact rather than skipping the check entirely.

Document any structural deviations in the BI's analyze artifact (or the post-implement artifact, depending on which phase surfaces them) with rationale. The graph is the structural truth-check on whether the plan's intent matches the implementation's reality.

### Validated architectural facts the graph encodes

The following facts have been verified empirically via graph traces and are stable across BIs. Treat them as load-bearing invariants when reasoning about new BIs:

- **Three spines, not one**: boot spine (`index.ts → server.ts → tools/_register.ts → createXTool() × N`), runtime spine (`handler.ts → invokeCli → spawn/Logger/Queue`), error spine (`handler.ts → UpstreamError`). `server.ts` owns the boot spine only and is absent from runtime and error spines.
- **`server.ts` is the sole production file that constructs both `createLogger()` and `createQueue()`**. Every other production file receives them as injected deps via `RegisterDeps` / `ExecuteDeps`. Handlers must not reach back into the composition root at runtime.
- **`UpstreamError` is a pure value type** — imported widely, called nowhere. Every handler classifies its failures through one of the codes enumerated in `src/errors.ts` (the exact count drifts as the surface grows; the constitutional zero-new-codes streak per Principle IV is what matters, not the count itself). The streak shows up structurally as a star with `UpstreamError` at the centre.
- **The kernel nodes (single source of truth for "the kernel nodes" cited elsewhere in this document)**: `createLogger()` and `createQueue()` are the boot-time DI factories constructed in `server.ts` and injected into every handler; `UpstreamError` is the error-spine value type every handler classifies through; `createServer()` is the boot-spine entry point. These hold the highest centrality scores in the graph across builds and are the high-blast-radius set referenced by the `/speckit-plan` and post-implement rules above. Treat changes to this list as architectural events worth attention.

**Do not cite specific degree counts, community IDs, or absolute node counts in CLAUDE.md, plan artifacts, ADRs, or BI artifacts.** Those numbers drift as the codebase grows. Cite relative position ("among the top god-nodes by degree", "in the runtime-spine community alongside the other handlers") and structural role ("the boot-time DI factory", "the error-spine value type") instead. Run `/graphify explain <node-name>` at plan-time to get the current degree if a one-off plan-time decision needs it; do not embed that number into a durable artifact.

### Graph hygiene notes

Two known caveats when reading graph numbers:

1. **Dedup imperfection on re-exported types**: TypeScript classes that are re-exported across module boundaries produce multiple separate nodes in the graph (typically one AST node, one semantic node, sometimes one external-marker node). Centrality scores split across them. Mentally add the degrees together for top-level types when comparing across builds.
2. **AST noise floor is substantial**: a large fraction of weakly-connected nodes are tokenisation artifacts (local variables, destructured fields, generic type params), not genuine documentation gaps. Test files are weakly-connected by design — they construct one-use fixtures. Treat unexpectedly weak connectivity on a *production* file as a signal worth investigating; weak connectivity on a test file or a tokenisation artifact is the noise floor and not a defect to fix.

When citing graph signals in plans, ADRs, or BI artifacts, prefer relative claims ("X is among the top god-nodes", "Y bridges multiple communities", "Z is the sole bridge between communities A and B") over absolute counts. Absolute counts are dedup-sensitive and drift as the codebase grows; relative claims survive both.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- **Query-first.** For SPECIFIC structural questions, query `graph.json` directly via `/graphify explain X`, `/graphify query "..."`, or `/graphify path A B`. These return scoped answers (~1-3 KB each) and are the PRIMARY interface to the graph. Prefer them over grep for cross-module questions like "what depends on X" or "how does A relate to B" — they traverse EXTRACTED + INFERRED edges instead of scanning files.
- **Read `graphify-out/GRAPH_REPORT.md` ONLY for cold-start orientation** when you don't yet know which node to query. Skip it whenever the relevant symbols are already known from the user prompt, the spec, the conversation, or the open files. The report is a ~25k-token summary — wrong default for a focused question.
- IF `graphify-out/wiki/index.md` EXISTS, navigate it instead of reading raw files.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
