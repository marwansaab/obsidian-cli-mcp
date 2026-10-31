<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
[specs/072-align-closed-vault-reporting/plan.md](specs/072-align-closed-vault-reporting/plan.md)

References:
- [.specify/memory/constitution.md](.specify/memory/constitution.md) — Five non-negotiable principles every change must satisfy. Principle I (Modular Code Organization: per-surface modules with one-directional imports, `{schema, tool, handler}.ts` layout, no upward or cyclic deps); Principle II (Public Surface Test Coverage: every MCP tool ships with happy-path + failure-or-boundary tests co-located as `*.test.ts` in the same change that adds/renames/modifies it); Principle III (Boundary Input Validation with Zod: schemas are the single source of truth for published shape, runtime parse, and downstream types via `z.infer`; no hand-rolled types or `typeof`/`instanceof` chains at boundaries); Principle IV (Explicit Upstream Error Propagation: failures surface through `UpstreamError` with stable `code` / `cause` / `details`; no silent fallbacks, empty results, or plain `throw new Error` at boundary surfaces; tool failures return as `isError: true` results; long-running calls honour cancellation and report progress when given a token); Principle V (Attribution & Layered Composition: every source file carries either an upstream-attribution header with SPDX + version or an `Original — no upstream` header). Technical Standards also fix the MCP stack (SDK v2 `@modelcontextprotocol/server` only, `McpServer.registerTool`, dual-era `serveStdio`, no Roots / Sampling / Logging capabilities), the MCP Tool Surface Standards (title, explicit four-hint annotations, every parameter described, visible input rules, server instructions, `outputSchema` + `structuredContent` with identical text, SDK-emitted schema dialect with the fingerprint baseline as a deliberate-change gate), and the Security Defaults (escape-hatch commands off by default, read-only mode with allow/deny lists, elicitation for irreversible operations, `realpath` containment of write paths). CI runs on Linux and Windows. Each PR's Constitution Compliance checklist marks Y / N / N/A per principle plus ADR-010 / ADR-013 / ADR-014 / ADR-015, MCP Tool Surface Standards and Security Defaults; any `N` requires a Complexity Tracking entry in the plan. v1.6.0 rules bind each area from the merge of its 0.8.20 work item (constitution Governance → Adoption of v1.6.0).
<!-- SPECKIT END -->

## Test Execution

Before invoking any test that touches the filesystem or the `obsidian` CLI binary, read [.memory/test-execution-instructions.md](.memory/test-execution-instructions.md). It names the authorised test vault, the scratch subdirectory, the destructive-probe protocol, and the cleanup expectations. The `.memory/` folder is gitignored — those instructions are for the assistant, not the project, so do not move them into a checked-in location and do not edit them on the user's behalf without being asked.

This gate applies to every test category that produces real CLI invocations: T0 live-CLI probes during `/speckit-implement`, FR-019 characterisation cases, manual quickstart scenarios, and any ad-hoc validation of a tool call's behaviour against a real vault. It does not apply to in-process unit tests that mock `invokeCli`.

## Pull Request Lifecycle and Docs-as-Code

Every PR ends with a documentation pass, after review and before merge:

```
/speckit-implement → /speckit-git-commit → open PR → /code-review + fixes → /speckit-docs-as-code <n> → merge
```

[`/speckit-docs-as-code <n>`](.claude/skills/speckit-docs-as-code/SKILL.md) reads the PR as review left it, updates `.docs-as-code/` (the tracked, living description of the system as built), corrects any `docs/tools/**`, `README.md` or `CONTRIBUTING.md` text the change made wrong, and pushes that commit onto the PR's own branch so the docs merge with the code. A PR whose code moved and whose documentation did not is not done. Run with no argument, the skill baselines the whole repository once, and audits the baseline for drift after that.

`.docs-as-code/` is the shipped counterpart to the gitignored `.decisions/` and `.architecture/`: ADR numbers are one project-wide series across both, and pages cite gitignored ADRs by ID and title, never by link.

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

Three reference sources document the project's design rationale. Consult them **before** proposing or making design decisions, and cite the relevant ADR, architecture note or code-index evidence when justifying choices:

- [.architecture/](.architecture/) — high-level architecture notes describing the system's structure, module boundaries, and design principles. Start with [Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md).
- [.decisions/](.decisions/) — Architecture Decision Records (ADRs). [Decision Log.md](.decisions/Decision%20Log.md) is the index; each ADR-NNN file contains the full decision text.
- `.codegraph/` — the CodeGraph index of the code (see *Code index* below). The architecture and ADRs describe **intent**; the index describes **structural reality** as it exists on disk. Use it to verify that intent and reality agree.

When a design choice conflicts with an existing ADR, surface the conflict to the user rather than silently overriding it — superseding an ADR is a deliberate act that should produce a new ADR, not an undocumented drift.

When the code index contradicts the architecture or an ADR (e.g., a handler that calls a boot-time factory where the ADR says it is injected, or an import that runs upward where the architecture says the layers are one-directional), surface the contradiction. Either the index reveals drift the ADRs haven't caught up to, or a recent change violated a written invariant. Both outcomes are actionable.

## Code index

CodeGraph indexes the code from the repository root, `C:\Github\obsidian-cli-mcp`, into `.codegraph/`. The index is git-ignored and derived; it rebuilds from the sources. [codegraph.json](codegraph.json) keeps `specs/` and `.specify/` out of it, and `dist/`, `coverage/` and `node_modules/` are skipped by default. The MCP server keeps the index in step as files are saved; run `codegraph sync` if a result looks stale, and `codegraph init` once on a machine that has no `.codegraph/` yet.

Call `codegraph_explore` with `projectPath` set to the repository root (or any folder inside it); without the MCP tool, `codegraph explore "<symbols or question>"` prints the same. A query that names the symbols or files (`"JS_TEMPLATE links _template.ts displayText"`) finds them more reliably than a plain-English question.

### When to use which

- **Code questions** — where something is defined, what calls or depends on it, the blast radius of a change: `codegraph_explore` before grep or reading files. It indexes code only, never notes or `.md` files.
- **Questions about notes in My-Setup-Vault** — where something is written, what a decision or ADR said: `smart_connections_query`, or `smart_connections_similar` from a known note, through `obsidian-cli-mcp` with `vault: "My-Setup-Vault"`. The results are leads, never evidence.
- **Exact facts** — statuses, ids, links, frontmatter: the vault's own structure, through `query_base`, `backlinks`, `links` and `read_property`. The note is the authority.
- **On `SMART_CONNECTIONS_NOT_READY`,** fall back to the vault's structure and say so.

Grep remains correct for textual questions ("where is the string 'foo' used?", text inside `.md` files); CodeGraph is for structural ones.

### Code index during Spec Kit phases

Spec Kit phases run on intent (the spec) and structure (the codebase). The code index is the bridge.

**Scope carve-outs**. The per-phase rules below assume a BI whose diff scope includes `src/**` or `*.test.ts`. For docs-only BIs (diff scope confined to documentation, specs, decisions, architecture notes, and similar prose surfaces — i.e., no `src/**` or `*.test.ts` files change), the clarify and plan rules still apply (the index informs decisions about which existing symbols the docs describe), and the tasks, pre-implement analyze and post-implement structural-verification rules are N/A — CodeGraph indexes no spec artifacts or other `.md` files, so there is nothing structural to verify. Note the N/A explicitly in the relevant artifact (plan.md `### CodeGraph structural check` section, tasks.md Notes section, the analyze artifact, or the post-implement artifact) so a reader sees the scope decision was made deliberately, not silently skipped.

**Kernel nodes**. Rules below cite "the kernel nodes" without enumerating them inline; the single source of truth for that list is the `### Validated architectural facts` section below. Cite by name and role, not by caller count — counts drift as the codebase grows.

- **`/speckit-clarify`**: before asking each clarification question, check the question text for any of these structural triggers:
  - names an existing tool, handler, schema, error class, or any of the kernel nodes;
  - names a cohort of more than one tool (e.g. "the search tools", "all handlers that ...");
  - names an existing convention governed by an ADR (consult [.decisions/Decision Log.md](.decisions/Decision%20Log.md) for the live ADR set — do not hard-code ADR numbers in this rule, since the set grows);
  - names a cross-module pattern (DI, error propagation via `UpstreamError`, attribution headers, plugin-lifecycle stage ordering, sub-discriminator routing, etc.).

  If any trigger fires, run `codegraph_explore` on the named symbols (for a relationship, name both in one query) BEFORE writing the question's options table. Cite at least one structural fact from the index — a definition site, a caller, a call path — in the question's Context paragraph or in an option rationale. "Ground the answer" means: surface an index fact, not just rely on prior code-reading. If no trigger fires (the question concerns prose / scope / methodology / wording only), skip the query and note the skip in the question framing if helpful.

- **`/speckit-plan`**: before submitting the plan for approval, run `codegraph_explore` on the symbols the plan changes to identify the affected modules and their blast radius (callers, dependents, tests), and on the kernel nodes to establish the kernel-node touch surface. Document the findings in the plan's `### CodeGraph structural check` section (create one if the plan template doesn't yet include it). If the plan touches any of the kernel nodes, name them explicitly and call out the high-blast-radius surface — kernel-node touches warrant Constitution Compliance reviewer attention even when no principle is technically violated. If the plan touches none of the kernel nodes, say so explicitly — the explicit no-touch claim is what the post-implement structural-verification step verifies against.

- **`/speckit-tasks`**: when the task list crosses two or more source modules, run `codegraph_explore "<symbol-A> <symbol-B>"` for each pair of symbols a task pair both touches. The call paths it returns surface transitive dependencies the prose plan may not have spelled out; add an explicit task-dependency note if a structural path exists that the task graph doesn't already reflect. For docs-only or single-source-file BIs, this rule is N/A — note the N/A in `tasks.md` Notes.

- **`/speckit-analyze` (pre-implement, cross-artifact consistency)**: the analyze pass is read-only against the spec / plan / tasks / research / data-model / quickstart prose. Index queries during this pass are OPTIONAL and serve one purpose: verify that the plan's named symbols, affected modules, and kernel-node-touch claims still hold at HEAD (the code may have moved since the plan-time queries if other BIs landed in the interim). Run `codegraph_explore` on each kernel node the plan explicitly claims to avoid touching, and on any other high-blast-radius symbol the plan names by role. For docs-only BIs, this rule is N/A — note the N/A in the analyze artifact.

- **Post-implement structural verification** (after `/speckit-implement` lands code, before marking the BI complete): with the index in step (`codegraph sync` if in doubt), run `codegraph_explore` on the new and changed symbols, then verify:
  1. No new top-level error codes were introduced (Constitution Principle IV) — no new error class outside `src/errors.ts`, and every new failure classifies through `UpstreamError`.
  2. No production handler imports the boot-time DI factories directly — those factories (named in the `### Validated architectural facts` section below) must remain confined to `server.ts` per the project's DI discipline.
  3. New symbols sit in the expected module and their imports run one-directionally (Constitution Principle I) — a surprise caller or an upward import is a smell worth investigating before shipping.
  4. New production code is reachable, not orphaned: each new production symbol has a caller outside its own tests (test files are expected to have few dependents; production files are not).

Document any structural deviations in the BI's analyze artifact (or the post-implement artifact, depending on which phase surfaces them) with rationale. The code index is the structural truth-check on whether the plan's intent matches the implementation's reality.

### Validated architectural facts

The following facts have been verified empirically by tracing the code and are stable across BIs. Treat them as load-bearing invariants when reasoning about new BIs:

- **Three spines, not one**: boot spine (`index.ts → server.ts → tools/_register.ts → createXTool() × N`), runtime spine (`handler.ts → invokeCli → spawn/Logger/Queue`), error spine (`handler.ts → UpstreamError`). `server.ts` owns the boot spine only and is absent from runtime and error spines.
- **`server.ts` is the sole production file that constructs both `createLogger()` and `createQueue()`**. Every other production file receives them as injected deps via `RegisterDeps` / `ExecuteDeps`. Handlers must not reach back into the composition root at runtime.
- **`UpstreamError` is a pure value type** — imported widely, called nowhere. Every handler classifies its failures through one of the codes enumerated in `src/errors.ts` (the exact count drifts as the surface grows; the constitutional zero-new-codes streak per Principle IV is what matters, not the count itself).
- **The kernel nodes (single source of truth for "the kernel nodes" cited elsewhere in this document)**: `createLogger()` and `createQueue()` are the boot-time DI factories constructed in `server.ts` and injected into every handler; `UpstreamError` is the error-spine value type every handler classifies through; `createServer()` is the boot-spine entry point. These have the widest blast radius in the codebase and are the high-blast-radius set referenced by the `/speckit-plan` and post-implement rules above. Treat changes to this list as architectural events worth attention.

**Do not cite specific caller counts, file counts, or index statistics in CLAUDE.md, plan artifacts, ADRs, or BI artifacts.** Those numbers drift as the codebase grows. Cite relative position ("among the most-depended-on symbols", "alongside the other handlers in the runtime spine") and structural role ("the boot-time DI factory", "the error-spine value type") instead. Run `codegraph_explore` at plan-time to get the current blast radius if a one-off plan-time decision needs it; do not embed that number into a durable artifact.
