# Research: Add Context Search

**Branch**: `035-context-search`
**Date**: 2026-05-17
**Phase**: 0 (Outline & Research)

Phase 0 decisions (R1..R14) plus plan-stage live-CLI probes (F1..F4) against the authorised `TestVault-Obsidian-CLI-MCP`. The probes drove ONE plan-stage spec correction (the spec Assumption naming `search_context` is superseded by the strict ADR-010 reversal `context_search`).

## Phase 0 Decisions

### R1 — Architecture: NATIVE wrapper over `obsidian search:context`

The new tool invokes `obsidian search:context --format json` directly via `invokeCli`. Same architecture as BI-033's `search` tool's line-mode branch — `obsidian search:context` is a first-class native subcommand with `query=`, `path=`, `limit=`, `case` flags and JSON output (BI-033 R1 / F1 — already verified).

This BI does NOT introduce a new architecture; it carves a single CLI invocation out of `search`'s modal branch into a dedicated tool. The wrapper logic is structurally parallel to `search`'s `useLines === true` branch (BI-033 handler.ts:103-133) with one architectural addition (FR-013 folder-existence check) and one behavioural addition (FR-012 CRLF strip).

**Rationale**: Reuses the proven BI-033 pipeline (zero-match sentinel detection, staged JSON parse, wire-schema validation, post-flatten cap, sort, output-schema boundary validation, `truncated` flag). Avoids re-deriving any plumbing.

**Alternatives considered**: Adding context-search as a second BI-019-style modal flag on an existing tool — rejected per the BI's spec User Story 2 framing (two distinct tools side-by-side with help-doc guidance). `eval`-based file walk — rejected; native subcommand exists and is contract-tested.

### R2 — Tool name: `context_search` (NOT `search_context`)

Per ADR-010 strict reading: composite `namespace:action` upstream subcommand → tool name equals the **reversal**, lowercase and underscore-joined: `<action>_<namespace>`. Upstream is `obsidian search:context` — namespace `search`, action `context`. Reversal: `context_search`. Parallels the project's existing composite-subcommand wrappers:

- `obsidian property:read` → tool `read_property`
- `obsidian property:set` → tool `set_property`
- `obsidian search:context` → tool **`context_search`** (this BI)

**Spec correction**: the spec's Assumption "The new registered tool name is `search_context`" is superseded by this research's ADR-strict choice. The plan-stage convention (matching BI-033's plan-stage FR-016 amendment) records the correction inline rather than re-running `/speckit-clarify` for a name. The spec's Assumption is amended at plan-finalisation time to point to `context_search` and reference this R2.

**Rationale**: ADR-010 is binding (Constitution v1.5.0 Compliance checklist row). The reversal rule produces one answer per CLI shape — no judgement call. The fact that "context search" reads slightly differently from "search context" in English is irrelevant; the rule's purpose is to mirror upstream verbatim, and the reversal rule fires the same way for every composite subcommand.

**Alternatives considered**: `search_context` (the spec's Assumption) — rejected per ADR-010 strict reversal. `searchcontext` (no separator) — rejected; the project's snake_case convention is uniform. `context-search` (kebab) — rejected; MCP tool names use underscores per registered convention (verified across all 21 existing typed tools). Source module accordingly is expected at `src/tools/context_search/` with factory function `createContextSearchTool`.

### R3 — Existing `search.context_lines` flag: HELP TEXT update only

Per spec Clarification 2026-05-17 Q1=B: the existing `search` tool's `context_lines` flag remains functional; its help text is updated to mark the flag `deprecated — prefer the dedicated context-search tool` and to add a one-sentence cross-pointer to `context_search`. **No code-behaviour change to `search`** — input schema, output schemas, handler, and the `context_lines` branch's response generation are all left untouched.

**What changes in `search`**:
- `src/tools/search/index.ts` `SEARCH_DESCRIPTION` constant: extend with a deprecation line referencing `context_search`.
- `src/tools/help/` content for the `search` tool: add the deprecation marker on the `context_lines` parameter row + the cross-pointer paragraph.

**What does NOT change in `search`**:
- `src/tools/search/schema.ts` — unchanged.
- `src/tools/search/handler.ts` — unchanged.
- `src/tools/search/handler.test.ts`, `schema.test.ts`, `index.test.ts` — unchanged.
- The shipped contract for `search` with `context_lines=true` continues to work identically.

**Rationale**: spec Clarification Q1=B locked the non-breaking deprecation trajectory. Full removal of the flag is a future BI after a usage window.

### R4 — Existence check for FR-013: post-empty probe via `obsidian folder`

When `folder` is supplied and `search:context` returns the zero-match sentinel (`"No matches found."`), the handler invokes `obsidian folder path=<normalised-folder> vault=<vault>` as a follow-up existence probe. The outcomes:

- **Folder exists, no matches** (`obsidian folder` returns folder info on stdout with no `Error:` prefix): return the empty envelope `{count: 0, matches: []}` — no error.
- **Folder missing** (`obsidian folder` returns `Error: Folder "<X>" not found.` on stdout, exit 0): the dispatch-layer classifier in `_dispatch.ts:308-318` (priority (c)) catches the `Error:` prefix and emits `UpstreamError(CLI_REPORTED_ERROR, details: { argv, command: "folder", stdout, stderr, exitCode: 0, message: 'Error: Folder "<X>" not found.' })`. The handler propagates this verbatim — **no new top-level code, no new `details.code` value, no wrapper-side classification**.

**Cost analysis**:
- Happy path (matches found): **1 CLI call**. No regression vs `search`.
- Empty + no `folder` param: **1 CLI call**. Zero-match envelope returned; no existence check fires.
- Empty + valid `folder` (folder exists, no matches): **2 CLI calls**. The extra call confirms existence and the empty envelope is returned.
- Empty + invalid `folder` (folder missing): **2 CLI calls**. The second call surfaces the structured `CLI_REPORTED_ERROR` envelope.

**Rationale**: post-empty is cheaper on the happy path than pre-flight (which always pays 2 calls when `folder` is supplied). The inherited dispatch classifier handles the `Error:` sentinel for free — no wrapper-side parsing of the folder-probe stdout is needed. The "no new details.code" outcome preserves both Constitution Principle IV (zero new top-level codes) and ADR-015 N/A status (no new `(top-level-code, details.code)` pair introduced).

**Live-probe F3** confirmed the upstream sentinel format: `Error: Folder "NonExistentFolder" not found.` (exit 0, stdout) for a missing folder; `Error: Missing required parameter: path` (exit 0, stdout) when `path` is omitted. Both are caught by `_dispatch.ts:308-318`'s `startsWith("Error:")` priority-(c) classifier.

**Alternatives considered**:
- **Pre-flight existence check** (always probe `folder` first when supplied) — rejected; pays the 2-call cost on every folder-scoped call even when matches exist. Estimated 4-10× the happy-path cost on a folder-scoped vault grep.
- **Wrapper-side path enumeration** via `vault-registry` or filesystem walk — rejected; the cli-adapter is the single seam (ADR-004), and the native `obsidian folder` subcommand is the canonical existence-check primitive.
- **Parse `search:context`'s zero-match stdout to infer folder-missing vs no-matches** — rejected; both paths emit the same `"No matches found."` sentinel per BI-033 R4. Inferring is impossible without a second call.

### R5 — CRLF strip in line text (FR-012, Clarification Q3=B)

The wrapper strips a single trailing `\r` from each matching line's `text` field before measuring the 500-character cap. Implementation:

```ts
const stripCr = (s: string): string => s.endsWith("\r") ? s.slice(0, -1) : s;
const capLine = (text: string): string => {
  const stripped = stripCr(text);
  return stripped.length <= TEXT_CAP ? stripped : stripped.slice(0, TEXT_CAP) + ELLIPSIS;
};
```

The strip fires unconditionally on any trailing-position `\r`, regardless of whether it was followed by `\n` in the source file. Embedded mid-line `\r` characters are NOT stripped. All other whitespace (leading indentation, tabs, intentional trailing spaces for Markdown hard-break) is preserved verbatim.

**Divergence from BI-033 `search`**: BI-033's line-mode handler does NOT strip `\r`. The new `context_search` tool DOES. This is a deliberate behavioural divergence per Clarification Q3 — the new tool delivers a cleaner cross-platform contract. The existing `search.context_lines=true` path keeps its current verbatim behaviour (per Q1=B no code change to `search`).

**Rationale**: eliminates Windows / macOS / Linux snapshot-test drift; gives agents a consistent line-text contract regardless of vault authoring platform. Strip-before-cap means the 500-character cap is measured on user-visible content, not on the invisible `\r`.

**Test coverage**: at least one handler test asserting CRLF-input → stripped output, one asserting LF-input → verbatim, one asserting trailing-spaces-preserved-with-CRLF, one asserting embedded-`\r`-not-stripped, and one boundary case at exactly-500-chars-post-strip with and without trailing `\r`.

### R6 — Folder normalisation: parity with `search`

Reuse BI-033's `stripBoundarySlashes` helper unchanged: strip a single leading `/` AND a single trailing `/` (FR-004 + FR-005, segment-boundary protection inherited from upstream `path=` flag). Empty post-strip omits the `path` parameter from the CLI invocation (no folder filter).

**Rationale**: behaviour parity with `search` for the folder normalisation step is required by FR-004 and the spec's Edge Cases. Re-using the helper avoids duplication; importing it from `../search/handler.js` is the cleanest seam (no separate shared module needed at v1 — if a third tool ever needs the same helper, lift to `src/tools/_shared.ts`).

**Module dependency direction**: `context_search/handler.ts` → `search/handler.ts` (importing `stripBoundarySlashes`). Per Constitution Principle I (one-directional imports), `search/handler.ts` does NOT import from `context_search/`. This direction is acceptable because `search/handler.ts` is the older, established surface and `context_search` is the new dependent. Future symmetric lift to `_shared.ts` may be appropriate when a third consumer appears.

**Alternative**: inline-duplicate the helper in `context_search/handler.ts`. Rejected; copy-paste invites drift. The four-line helper is small but its semantic (FR-004 normalisation) is precise enough that two copies would eventually diverge.

### R7 — Recursive subtree-prefix folder semantics (FR-003, Clarification Q2=A)

Folder scoping is inherited from upstream's `path=` flag, which BI-033 R5 / F3 confirmed is segment-boundary-protected. Per spec Clarification Q2=A: the new tool's `folder=Projects` matches every `.md` file under the `Projects/` subtree at any depth.

**Live-probe F4** (against `TestVault-Obsidian-CLI-MCP`, plan-stage) deferred — the existing BI-033 evidence (R5 / F3) covers the segment-boundary case; the recursion case is presumed-recursive per the upstream's "`path=<folder>` — Limit to folder" help text and the natural reading of "prefix" in the CLI documentation. If implementation-stage probing reveals direct-children-only behaviour at the upstream layer, the spec's Q2 clarification becomes a wrapper-side enforcement task; this is documented as a deferred risk in the Complexity Tracking section if it materialises.

**Rationale**: deferring the recursion-confirmation probe to implementation stage trades a small risk (a possible plan-stage spec amendment if the probe surprises) against avoiding redundant live-CLI churn before any code exists. The risk magnitude is low — upstream's `path=` flag is documented as a folder filter, and BI-033's F3 segment-boundary probe is consistent with recursive prefix-match interpretation.

### R8 — Wire-shape parity with BI-033 `search:context`

The `obsidian search:context --format json` wire shape is `[{file: string, matches: [{line: int, text: string}]}]` per BI-033's R9 / handler.ts:74-79 (`searchContextWireFileSchema`). The new tool re-uses this wire shape verbatim — import the schema from `../search/schema.js` rather than re-defining:

```ts
import { searchContextWireSchema, type SearchContextWireFile } from "../search/schema.js";
```

**Rationale**: the wire shape is upstream's responsibility — it's the same upstream subcommand. Re-defining the schema would invite drift between two paths that parse the same upstream output. Module direction is `context_search/handler.ts` → `search/schema.ts` (same direction as R6's helper import). Acceptable per Principle I.

**Output schema, however, is DIFFERENT**: `context_search`'s output is the line-mode shape `{count, matches: [{path, line, text}], truncated?}` — identical to `search`'s line-mode output schema (`searchLineOutputSchema`). The new tool exports its own output schema (`contextSearchOutputSchema`) that may equal `searchLineOutputSchema` byte-for-byte initially. **Option**: re-export `searchLineOutputSchema` as `contextSearchOutputSchema` from `context_search/schema.ts` to keep one source of truth, OR define a fresh copy in `context_search/schema.ts` to keep the new tool fully self-contained for future divergence.

**Decision**: define a **fresh copy** in `context_search/schema.ts`. The two shapes are isomorphic today but the new tool may evolve independently (e.g. FR-012's strip-`\r` doesn't change the output shape but a future BI might add a `before`/`after` context-line array, which `search`'s line-mode would NOT inherit). Self-contained schemas keep the tools' surfaces decoupled at the spec-typing level. The shape duplication is 8 lines; the decoupling benefit is worth it.

### R9 — Truncation strategy: parity with BI-033 line-mode (conservative)

Re-use BI-033's R3 line-mode truncation strategy unchanged:

- Pass `limit = appliedCap` to the upstream `search:context` (file-count cap, not line-count).
- After flatten, compute `truncated = cliFileCapFired || flatExceedsCap`, where `cliFileCapFired = (mdOnly.length === appliedCap)` and `flatExceedsCap = (flat.length > appliedCap)`.
- Trim `flat` to `appliedCap` entries if `flatExceedsCap`.

**Rationale**: same upstream subcommand, same file-vs-line unit mismatch (BI-033 R3 trade-off). Identical behaviour matches the spec's FR-010 / FR-011 parity guarantee. The conservative `truncated: true` when the file cap fires (even if the flat count is under cap) preserves the spec's "caller can re-query with wider `limit` or narrower `folder`" recourse.

**Documented limitation** (inherited from BI-033 line-mode): in pathological vaults with many files each matching once on a single line, the `cliFileCapFired` branch may fire `truncated: true` when the flat array is exactly at cap and the underlying flat-result set was actually at cap. Caller's recourse: raise `limit` (up to 10000) or narrow `folder`. False-positive `truncated: true` is preferred to silent loss.

### R10 — `.md`-only corpus filter: defensive parity with BI-033

Re-use BI-033's R6 wrapper-side `.md` filter unchanged: `wire.filter((f) => f.file.toLowerCase().endsWith(".md"))`. BI-033 F6 confirmed upstream's `search:context` natively restricts to `.md` files; the wrapper filter is currently a no-op against the shipped CLI but is retained as defence-in-depth against a future upstream version that broadens indexing (FR-017 lock).

**Test coverage**: one handler test asserts the filter rejects a synthetic non-`.md` wire row (e.g. `{file: "Sandbox/foo.canvas", matches: [...]}`), parity with BI-033's characterisation test.

### R11 — Determinism: sort by `(path, line)` ascending (parity with BI-033)

Re-use BI-033's R11 sort verbatim:

```ts
const sorted = [...trimmed].sort((a, b) =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line,
);
```

UTF-16 code-unit ascending on `path`, then numeric ascending on `line`. Same FR-018 lock, same SC-007 byte-identical-response guarantee.

### R12 — Test seam: single seam at `invokeCli`, two-call paths covered

Handler tests mock `invokeCli`. Assertions verify the same eight contract points as BI-033 R12 (subcommand routing, parameter assembly, format, vault flow-through), plus four new points specific to BI-035:

1. When the first `invokeCli` returns the zero-match sentinel AND `input.folder` is undefined, NO second `invokeCli` call is made (cost-correctness gate).
2. When the first `invokeCli` returns the zero-match sentinel AND `input.folder` is supplied AND the second `invokeCli` (folder probe) succeeds, the handler returns the empty envelope (`{count: 0, matches: []}`) — no error.
3. When the first `invokeCli` returns the zero-match sentinel AND `input.folder` is supplied AND the second `invokeCli` throws `UpstreamError(CLI_REPORTED_ERROR)` with `details.message` starting `Error: Folder "..."`, the handler re-throws verbatim (no wrapping, no re-classification).
4. When `input.folder` is undefined, the wire path is identical to the single-call path (no probe at all).

CRLF-strip-specific test coverage per R5. Wire-shape-parsing test coverage parallels BI-033's `wire-parse` and `json-parse` staged-failure cases.

### R13 — Logger surface: thin handler, no per-call tool-layer logging

Parity with BI-033 R14: handler does NOT emit `logger.callStart` / `callEndSuccess` / `callEndFailure`. The cli-adapter's `dispatchTimeout` / `dispatchCap` / `dispatchKill` events preserve observability for both CLI invocations.

### R14 — Help-tool integration: new entry + `search` deprecation marker

Two help-surface touches per FR-020:

**(a) New `context_search` help entry** under `src/tools/help/` content: full input contract, output shape, error roster, ≥4 worked examples (minimal happy-path, folder-scoped, capped+truncated, CRLF-source vault). Adds a "Prefer this over `search` when: you need per-match line context in one call without a follow-up `read`." guidance line.

**(b) `search` help entry update**: mark the `context_lines` parameter as `deprecated — prefer the dedicated context_search tool`. Add a one-sentence cross-pointer: "For per-line context, prefer `context_search` (added in BI-035); `context_lines=true` is retained for backward compatibility but will be removed in a future BI."

**Module touches**: `src/tools/help/` content data structure (likely a registry of per-tool help blocks). No code-behaviour change to `search`'s handler / schema (per R3).

## Plan-stage live-CLI probe findings

### F1 — Baseline `obsidian search:context` shape

Per BI-033 F1 / R1: `obsidian search:context --format json` is a first-class subcommand returning `[{file, matches: [{line, text}]}]`. Re-confirmed by reading `obsidian help` output 2026-05-17 (full subcommand catalogue in `obsidian --version` output captured in this BI's PowerShell probe):

```
search:context        Search with matching line context
  query=<text>        - Search query (required)
  path=<folder>       - Limit to folder
  limit=<n>           - Max files
  case                - Case sensitive
  format=text|json    - Output format (default: text)
```

No surprise; identical to BI-033's characterisation.

### F2 — Zero-match sentinel: same as BI-033

`obsidian search:context query=<unmatched-token> ... format=json` emits stdout `"\nNo matches found.\n"` (non-JSON), exit 0. Wrapper translates via `stdout.trim() === "No matches found."` check (R4 stage-0). Identical to BI-033 R4.

### F3 — `obsidian folder path=<nonexistent>` produces structured `Error:` stdout

Live-probe 2026-05-17: `obsidian folder path=NonExistentFolder vault=TestVault-Obsidian-CLI-MCP` returned stdout `Error: Folder "NonExistentFolder" not found.` with exit code 0. The dispatch-layer classifier in `_dispatch.ts:308-318` (priority (c)) catches the `Error:` prefix and emits `UpstreamError(CLI_REPORTED_ERROR, details: { argv, command: "folder", stdout, stderr, exitCode: 0, message: 'Error: Folder "NonExistentFolder" not found.' })`. The wrapper does NOT need any additional classification step — the inherited classifier handles FR-013's contract.

A second probe (`obsidian folder path="" ...`) returned `Error: Missing required parameter: path` (exit 0). Also caught by the same classifier. The wrapper guards against this by omitting the `path` parameter when the post-strip folder is empty (R6 inherited behaviour).

### F4 — `obsidian search:context` invocation hygiene

Shell-level invocations (PowerShell `& obsidian.exe ...`) of `obsidian search:context` returned empty stdout with exit code `-1` on 2026-05-17 (the binary appears to detach to GUI mode in non-MCP shell contexts on Windows). The project's `invokeCli` via `child_process.spawn` works correctly (verified by BI-033's shipped handler) — this is a shell-probe limitation, not a CLI bug. All implementation-stage validation will route through `invokeCli` rather than direct shell, in line with the `.memory/test-execution-instructions.md` guidance that the project's adapter is the authoritative invocation path.

## Open items deferred to implementation stage

- **Folder recursion live-probe (F4-followup)**: confirm `obsidian search:context path=<folder>` recurses to descendants (Clarification Q2=A presumes-recursive). Test seam: seed `Sandbox/bi035-rec/foo.md`, `Sandbox/bi035-rec/sub/bar.md` both containing a unique keyword; assert both surface in a single `path=Sandbox/bi035-rec` call. If upstream is direct-children-only, wrapper-side recursion enumeration would be required (out of scope at v1 per spec; would trigger a re-plan).
- **CRLF-source vault probe**: seed a Windows-CRLF-authored `.md` file in `Sandbox/` and confirm `obsidian search:context format=json` emits the `text` field with the trailing `\r` (which the wrapper then strips per R5). If the upstream already normalises, the strip is a no-op; either way the wrapper's contract is honoured.
- **Long-line probe**: seed a 600-char line in `Sandbox/` and confirm the 500-char cap fires with the `…` (U+2026) marker — parity test, low risk.

These probes do not block plan approval; they are the standard T0 live-CLI characterisation runs that fire at `/speckit-implement` per the `.memory/test-execution-instructions.md` gate.

## Constitution Compliance pre-evaluation

| Gate | Status | Notes |
|------|--------|-------|
| Principle I (Modular Code Organization) | Y | New `src/tools/context_search/` module with `{schema, index, handler}.ts` + co-located tests. Imports flow one-directionally: `context_search/handler.ts → search/schema.ts` (wire shape reuse, R8) and `context_search/handler.ts → search/handler.ts` (helper reuse, R6). No upward or cyclic dependencies. |
| Principle II (Public Surface Test Coverage) | Y | New typed-tool surface ships with happy-path + failure-or-boundary tests co-located as `*.test.ts` in the same change. Test inventory listed in R12. |
| Principle III (Boundary Input Validation with Zod) | Y | Strict zod input schema, parity with `searchInputSchema` minus the `context_lines` field. Type derived via `z.infer`. |
| Principle IV (Explicit Upstream Error Propagation) | Y | Zero new top-level error codes. FR-013 folder-not-found path inherits `CLI_REPORTED_ERROR` from the dispatch classifier (F3). FR-014 vault-not-found path inherits `CLI_REPORTED_ERROR(message: "Vault not found.")` from `cli-adapter.ts:87-97`. Wire-parse / json-parse failures emit `CLI_REPORTED_ERROR(details.stage: ...)` parity with BI-033. The zero-new-codes streak extends to the eighteenth tool. |
| Principle V (Attribution & Layered Composition) | Y | New source files carry `Original — no upstream.` headers (parity with BI-033). README's Attributions section unchanged. |
| ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand) | Y | `context_search` is the strict reversal of `obsidian search:context` per R2. Parallels `read_property` / `set_property` precedent. |
| ADR-013 (Plugin-Namespace Tool Naming Convention) | N/A | Native-CLI wrapper; no plugin involvement. |
| ADR-014 (Plugin-Backed Typed Tools Runtime-Dependency Pattern) | N/A | Native-CLI wrapper; no plugin runtime-dependency states. |
| ADR-015 (Sub-Discriminators via details.reason for Multi-State Error Codes) | N/A | No new `(top-level-code, details.code)` pair introduced. The folder-not-found path reuses `CLI_REPORTED_ERROR` with no `details.code` field at all (the dispatch classifier emits `details.message` carrying the upstream verbatim string); the vault-not-found path reuses the cli-adapter's inherited classifier. No sub-state-discrimination is needed. |

All gates pass. No Complexity Tracking entries needed.

## Kernel-node touches (graph-grounding per CLAUDE.md `/speckit-plan` rule)

The plan touches three kernel nodes per the validated facts in CLAUDE.md:

- **`UpstreamError`** — every error path in the new handler constructs or propagates `UpstreamError`. Parity with BI-033's handler.ts. Star-pattern intact; no new top-level codes added.
- **`invokeCli`** — the new handler calls `invokeCli` once (happy path) or twice (folder-not-found probe path). Standard runtime spine.
- **`createServer` (via `_register.ts`)** — the new tool registers through `_register.ts` (which `server.ts` invokes at boot). Standard boot spine extension; the only kernel-spine touch is the addition of one more `register{ToolName}Tool` call.

The plan does NOT touch `createLogger` or `createQueue` directly (those remain confined to `server.ts` per the project's DI discipline; the new handler receives `Logger` and `Queue` as injected `ExecuteDeps`).

## Spec amendments arising from this research

Two spec-level corrections trigger when the plan is finalised (will be folded into `spec.md` immediately after plan approval, before `/speckit-tasks`):

1. **Tool name**: spec Assumption "The new registered tool name is `search_context`" superseded by R2 `context_search`. Add a Clarification bullet under `### Session 2026-05-17` recording the plan-stage correction; restate the Assumption.
2. **Folder-existence-check mechanism**: spec Assumption "The folder-existence check... is a `/speckit-plan` decision" resolved by R4. Restate the Assumption to record the post-empty-probe strategy.
