# Phase 0 Research — Write Note Typed MCP Tool

**Feature**: [011-write-note](./spec.md)
**Date**: 2026-05-08
**Status**: Final (10 decisions ratified; 6 of 8 FR-019 live-CLI cases deferred to implementation T0 against a scratch vault subdirectory the user explicitly authorises)

This document records the design decisions ratified during plan-stage research, the live-CLI characterisation completed against the user's "The Setup" vault during plan, and the residual cases that need T0 verification before any handler-layer response-parsing logic locks against assumed wording.

---

## R1 — Logger surface (FR-009 reconciliation)

**Decision**: `write_note`'s handler does NOT emit `logger.callStart` / `logger.callEndSuccess` / `logger.callEndFailure` events. The handler is a thin `invokeCli` wrapper, mirroring the actual `read_note` shape exactly.

**Rationale**: The spec's FR-009 mandated handler-emitted call-lifecycle events "in parity with `read_note`" (per [006-read-note](../006-read-note/spec.md) FR-017). Live verification at plan-stage:

- The `Logger` interface at [src/logger.ts:43-48](../../src/logger.ts#L43-L48) defines exactly four methods: `shutdown`, `dispatchTimeout`, `dispatchCap`, `dispatchKill`. There is no `callStart`, `callEndSuccess`, or `callEndFailure`.
- The actual `read_note` handler at [src/tools/read_note/handler.ts](../../src/tools/read_note/handler.ts) does NOT emit per-call events; it just calls `invokeCli(input, deps)` and returns the result. The logger is passed into `invokeCli` via `deps.logger`, which routes it to the dispatch layer for the four existing event types.

Per the project rule "spec follows the code that exists, not the code that was sketched" (CLAUDE.md / 006-read-note background, applied uniformly), `write_note` matches the actual sibling implementation, not the sibling spec's aspirational description. The cli-adapter's `_dispatch.ts` already emits `dispatchTimeout` / `dispatchCap` / `dispatchKill` events when those conditions fire; that observability is preserved end-to-end for `write_note` calls automatically (the queue + dispatch are inside `invokeCli`).

**Alternatives considered**:
- (a) **Implement R1 as the spec says** — extend `Logger` with three new event methods and emit them from the `write_note` handler. Rejected: introduces a logging surface this BI scope does NOT govern; the FR-009 wording in the spec was based on an incorrect read of the existing `read_note` implementation. A future BI MAY add per-call logger events as a cross-cutting observability enhancement (touching Logger + read_note + write_note + obsidian_exec uniformly); landing it inside `write_note` creates per-tool drift.
- (b) **Add per-call events to write_note ONLY** — same drift problem as (a), worse because asymmetry between read_note and write_note is harder to remove later.
- (c) **Match read_note's actual shape** (chosen). Symmetry preserved; observability via `dispatch*` events preserved; spec's FR-009 documented as superseded by this research note.

**Spec amendment**: spec.md FR-009 wording is left in place for historical traceability (matches the [010-flatten-target-mode](../010-flatten-target-mode/spec.md) R10 "don't amend predecessor specs" rule). This research note IS the amendment of record. The PR's Constitution Compliance checklist may cite this in its Principle IV evidence (observability path documented and intentionally re-scoped).

---

## R2 — Argv flag form vs key=value (FR-007 / FR-019 cases (i)–(iii))

**Decision**: `overwrite`, `open`, `newtab` are emitted as **flag form** (no `=true` value) in `flags: []`. `name`, `path`, `content`, `template` are emitted as **key=value** form in `parameters: {}`.

**Rationale**: live verification via `obsidian help create`:

```
create                Create a new file
    name=<name>         - File name
    path=<path>         - File path
    content=<text>      - Initial content
    template=<name>     - Template to use
    overwrite           - Overwrite if file exists      ← flag form
    open                - Open file after creating     ← flag form
    newtab              - Open in new tab              ← flag form (out of scope)
```

The CLI's help convention is `key=<value>` for parameter-bearing tokens and bare-word for flags. This matches the cli-adapter's existing argv-assembly contract (per `dispatchCli`): `parameters` becomes `key=value` tokens, `flags` becomes bare-word tokens.

**Plan-stage decision (resolved)**: spec FR-007's "key=value vs flag form" deferral is now closed. The handler emits:
- `parsed.overwrite === true` → `flags: [..., "overwrite"]`
- `parsed.open === true` → `flags: [..., "open"]`
- `parsed.overwrite === false` → token NOT emitted (default-false-omit per Story 3 AC#3)
- `parsed.open === false` → token NOT emitted

For active mode (post-Clarifications 2026-05-08): `parsed.overwrite` is guaranteed `true` after parse, so the flag is unconditionally emitted; `parsed.open` and `parsed.template` are guaranteed `undefined`, so neither token is ever emitted.

**Alternatives considered**:
- Use `parameters: { overwrite: "true" }` form — works (the cli-adapter would assemble `overwrite=true`), but the CLI's help signals flag form. Use the form the CLI documents.

---

## R3 — User-facing field `file` → CLI argv `name=<value>` (handler-layer rename)

**Decision**: the schema's user-facing field stays `file` (parity with `read_note`'s surface). The handler maps `parsed.file` → CLI argv token `name=<value>` at argv-assembly time for the `create` subcommand.

**Rationale**: the `create` subcommand uses `name=<name>` for the wikilink-form locator (per `obsidian help create`); the `read` subcommand uses `file=<name>` for the same conceptual locator. The CLI is inconsistent here, but the typed-tool surface should NOT propagate that inconsistency to MCP clients — agents should see a uniform `file=` field across `read_note` and `write_note`. The handler does the rename.

```ts
// Specific-mode argv assembly inside executeWriteNote(...):
const parameters: Record<string, string | boolean> = {
  ...(input.file !== undefined ? { name: input.file } : {}),  // ← rename file → name
  ...(input.path !== undefined ? { path: input.path } : {}),
  content: input.content,
  ...(input.template !== undefined ? { template: input.template } : {}),
};
const flags: string[] = [];
if (input.overwrite === true) flags.push("overwrite");
if (input.open === true) flags.push("open");
```

**Alternatives considered**:
- (a) **Rename the schema field to `name`** — matches the CLI's create-subcommand argv directly. Rejected: breaks parity with `read_note`'s `file` field, which is the published convention agents have already learned from BI-003.
- (b) **Accept BOTH `file` AND `name` in the schema** — agent flexibility, but adds confusion (two ways to spell the same thing) and complicates the XOR-with-path rule.

---

## R4 — `created: true` vs `created: false` derivation from CLI response

**Decision (provisional)**: the CLI emits `Created: <path>` on stdout for fresh creations. The handler's response-parsing logic matches against the literal prefix `"Created: "` to set `created: true`; absence of that prefix (e.g., the still-to-be-verified overwrite-success wording) sets `created: false`. The reported `path` value is captured from the matched line.

**Provisional rationale**: live probe captured during plan-stage:

```
$ obsidian create
[empty line]
Created: Untitled.md
```

The CLI returned `Created: Untitled.md\n` after a no-args invocation (which created `Untitled.md` in the active vault as a side effect — cleaned up immediately via `obsidian delete path=Untitled.md`). Wording is deterministic enough to lock against.

**Residual T0 verification** (FR-019 cases, deferred to implementation against a scratch vault subdir):
- (T0.1) Create-fresh at a specific path: `obsidian vault=The\ Setup create path=_speckit-011/case1.md content="x"` → expected `Created: _speckit-011/case1.md` or substantively equivalent. Lock the parser's expected substring.
- (T0.2) Create via wikilink: `obsidian vault=The\ Setup create name=ScratchNote content="x"` → expected `Created: <CLI-resolved canonical path>`. Capture the canonical-path resolution rules.
- (T0.3) Overwrite an existing file: re-run T0.1 with `overwrite` flag added. Capture the wording — likely `Updated: <path>`, `Overwrote: <path>`, or `Created: <path>` (in which case create vs overwrite is indistinguishable from CLI output and R4 needs amendment).

**Amendment trigger**: if T0.3 reveals the CLI does NOT distinguish create from overwrite in stdout, R4 amends pre-merge to one of:
- (a) **Pre-call existence check**: a second CLI invocation (`obsidian vault=… file path=…`) before `create` to determine pre-existence; second call increases latency + adds TOCTOU surface. Last-resort.
- (b) **Stat-the-filesystem-after-the-call**: ask the CLI for the file's metadata after create; relies on a `file` subcommand that reports modification timestamps.
- (c) **Always report `created: true`** with a documented caveat that the field is best-effort. Worst option; degrades the contract.

The plan ships R4(a) (current CLI signal) as the default; T0.3 verifies. If the signal is reliable, no further work. If not, R4 amends and either (a)/(b) ships in a follow-up commit on this branch before merge.

---

## R5 — Unknown-vault response signature (Edge Cases)

**Decision (provisional)**: the cli-adapter gains a response-inspection clause that re-classifies a 0-exit-code stdout `"Vault not found."` (verbatim) into `CLI_REPORTED_ERROR` with a specific recovery message.

**Rationale**: live probe captured during plan-stage:

```
$ obsidian vault=NoSuchVault create path=test.md content=x
[empty line]
Vault not found.
```

Wording is structured enough for adapter-layer response-inspection. Adding the inspection logic to the cli-adapter (NOT to `write_note`) means all typed tools (`read_note`, `write_note`, future ones) inherit the re-classification automatically.

**Plan-stage decision (Edge Cases ambiguity resolved)**: response-inspection wins over pre-validation. No `list_vaults` primitive shipped here; if response-inspection later proves brittle (e.g., the CLI's wording drifts across versions), `list_vaults` ships as a follow-up BI and pre-validation moves there.

**Implementation footprint**: a small addition to the cli-adapter's success-response path that scans `stdout.trimStart()` for the literal `"Vault not found."` prefix and re-throws `UpstreamError({ code: "CLI_REPORTED_ERROR", message: "...", details: { ... } })` instead of returning the success envelope. Co-located adapter test verifies the re-classification.

**Residual T0 verification**: (T0.4) confirm exit code is `0` for the unknown-vault response (vs `1`). If it's `1`, the existing `CLI_NON_ZERO_EXIT` path covers it without inspection — R5 collapses to a no-op.

---

## R6 — Schema active-mode `superRefine` packaging

**Decision**: the three new active-mode clauses (overwrite-required, template-forbidden, open-forbidden per Clarifications 2026-05-08 Q1, Q3) bundle into a single chained `.superRefine(...)` callback at the `write_note` schema level. Each violation surfaces as its own `details.issues[]` entry.

**Rationale**: zod's `.superRefine` callback accepts multiple `ctx.addIssue(...)` calls per invocation, and each call becomes its own `details.issues[]` entry on parse failure. Bundling is cleaner than three chained `.superRefine` calls (each `.superRefine` is a pass over the input; one pass covers all three checks).

```ts
export const writeNoteInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    content: z.string(),
    template: z.string().optional(),
    overwrite: z.boolean().optional().default(false),
    open: z.boolean().optional().default(false),
  })
).superRefine((input, ctx) => {
  if (input.target_mode !== "active") return;
  if (input.overwrite !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["overwrite"],
      message: "overwrite must be true in active mode (active mode is destructive by definition; explicit-opt-in posture binds uniformly)",
    });
  }
  if (input.template !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["template"],
      message: "template is not allowed in active mode",
    });
  }
  if (input.open !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["open"],
      message: "open is not allowed in active mode",
    });
  }
});
```

**Note**: the `open` field has `.default(false)`; an absent `open` key parses to `false`, not `undefined`. The forbidden-key check needs to distinguish "key absent" (acceptable) from "key explicitly set to either true or false" (rejected). Since `.default(false)` collapses both states post-parse, the check must run **before** the default applies — which means inspecting the raw input, not the parsed output. The actual implementation uses `Object.hasOwn(rawInput, "open")` inside the `superRefine` (or, alternatively, removes the `.default(false)` and uses a handler-layer fallback — but per FR-005 the default belongs in the schema). Plan-stage decision: schema declares `open: z.boolean().optional().default(false)`; the active-mode `superRefine` checks `Object.hasOwn(input, "open")` against the raw input prior to parse; the parse output for active-mode-validated inputs is guaranteed `parsed.open === undefined` (the default is masked by the rejection that prevents the parse from completing).

**Plan-stage caveat**: zod's `.superRefine` receives the post-parse output, NOT the raw input. The "key absent vs key present-with-false" distinction at the `superRefine` layer requires the `superRefine` to run on the pre-default schema (i.e., `targetModeBaseSchema.extend({ open: z.boolean().optional() })` — without `.default(false)`), and the default is moved into the handler. Tradeoff:
- (a) Schema-level default with handler-side raw-input inspection (complex; couples handler to raw-input shape).
- (b) Handler-side default for `open` ONLY (single-use exception to FR-005's "default in schema" rule); schema's `open` is plain `.optional()` so `parsed.open === undefined` distinguishes "absent" from "explicitly false". Forbidden-in-active check is then `parsed.open !== undefined`.

**Decision**: option (b). Consequence: FR-003's `open: z.boolean().optional().default(false)` becomes `open: z.boolean().optional()`; handler reads `parsed.open ?? false`. This is a narrow, bounded exception; the `overwrite` field keeps its `.default(false)` because the active-mode rule is "must be exactly true" (the default-false collapses naturally — `false === true` fails the check). The data-model.md captures this asymmetry explicitly.

---

## R7 — Test seams (FR-016)

**Decision**: handler tests inject `deps.spawnFn` via the cli-adapter's existing test-seam convention. Schema tests use `safeParse` directly (no adapter involvement). Registration tests assert the descriptor shape and the propagate-via-handler behaviours via the in-memory `RegisteredTool.handler` (no `InMemoryTransport` round-trip — the consolidated drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) handles SDK round-trip defence-in-depth for every registered tool).

**Rationale**: matches `read_note`'s and `obsidian_exec`'s test patterns exactly. `spawnFn` injection at the adapter call lets us simulate every `UpstreamError` code class without a real binary; `safeParse` lets us verify schema-layer rejections without the handler running; the in-memory `handler(args)` invocation lets us verify end-to-end VALIDATION_ERROR and UpstreamError propagation without an SDK envelope.

---

## R8 — Co-located test path resolution for the docs-existence assertion

**Decision**: `src/tools/write_note/index.test.ts`'s docs-existence assertion (FR-016 case e) uses `import.meta.url`-based path resolution to locate `docs/tools/write_note.md`, NOT `process.cwd()`.

**Rationale**: matches the help-tool's path-resolution precedent. `process.cwd()` is brittle across vitest invocations from different directories; `import.meta.url` is anchored to the source file location and produces a deterministic path relative to the repo root.

```ts
const docsPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/tools/write_note.md");
```

The docs-existence assertion AND the non-stub-marker assertion (per FR-016 case e) both use this anchor.

---

## R9 — Coverage threshold preservation (FR-017 / SC-008)

**Decision**: the new `write_note` module is small (~150–200 LOC across `schema.ts` / `handler.ts` / `index.ts`). The 32 co-located test cases (15 schema + 12 handler + 5 registration per FR-016) cover near-100% of the new module's statements. The aggregate statements floor at [vitest.config.ts:20](../../vitest.config.ts#L20) (currently **89.6%**) is preserved or improved.

**Implementation gate**: the test command `npm run test` MUST emit aggregate coverage ≥ 89.6%. If the addition causes the aggregate to drop (e.g., the new untested branches in the cli-adapter for R5's response-inspection are not test-covered), the implementation amends pre-merge to add the missing tests. The threshold is the merge gate; the floor is not lowered to accommodate untested code (per Constitution v1.2.0 §Development Workflow #5 — "ratcheted via a one-line visible edit").

---

## R10 — Don't amend predecessor specs

**Decision**: this research document is the source of record for any deviation from spec.md. spec.md, contracts/, and predecessor specs (006-read-note, 010-flatten-target-mode, etc.) are NOT edited as part of this BI.

**Rationale**: matches the [010-flatten-target-mode](../010-flatten-target-mode/spec.md) R10 precedent ("don't amend historical specs"). The spec captures intent at a point in time; research captures plan-stage discoveries. Implementation aligns with research; the spec is read alongside research, not edited to match it. R1 in particular (logger surface deviation) is recorded here, NOT in spec.md FR-009.

---

## FR-019 case-capture status

| # | Case | Status | Source / Notes |
|---|---|---|---|
| (i) | Successful specific-mode create at a new path | **Provisional R4**; T0.1 verifies | `obsidian create` no-args probe returned `Created: Untitled.md` — wording captured. T0 verifies path-locator variant preserves the `Created: <path>` shape. |
| (ii) | Successful specific-mode create via wikilink | **Provisional R4**; T0.2 verifies | T0 verifies the `name=` (wikilink) variant returns `Created: <canonical resolved path>`; captures the canonical-path resolution rule. |
| (iii) | Successful specific-mode overwrite (`created: false`) | **R4 residual**; T0.3 verifies | T0 verifies the wording for overwrite — likely `Updated: <path>` or similar. If indistinguishable from create, R4 amends per the trigger above. |
| (iv) | Overwrite=false against existing path | DEFERRED to T0.5 | Wording is the spec's Story 3 source-of-truth; handler maps it to `CLI_REPORTED_ERROR.message` verbatim. |
| (v) | Unknown vault display name | **R5 ratified**; T0.4 verifies exit code | Probe returned `Vault not found.` on stdout; exit code (0 vs 1) determines whether R5's adapter-layer inspection is needed or whether `CLI_NON_ZERO_EXIT` already covers it. |
| (vi) | Non-existent template name | DEFERRED to T0.6 | T0 verifies wording; handler propagates whichever code the adapter classifies (likely `CLI_REPORTED_ERROR` if exit-0, `CLI_NON_ZERO_EXIT` if exit-1). |
| (vii) | Path-traversal-shaped path (`../../etc/passwd`) | DEFERRED to T0.7 — **gates SC-012** | T0 verifies the CLI rejects `../`-shaped paths. If it does NOT, this BI is amended pre-ship to add a tool-layer reject (one schema test case + one schema-superRefine clause). Silent vault-escape is a security defect; the merge gate does not clear without verification. |
| (viii) | Successful active-mode rewrite | DEFERRED to T0.8 | T0 verifies the focused-note path is returned in stdout for the active-mode path. If active-mode `obsidian create` doesn't return the focused path, R4's parsing logic needs an active-mode-specific branch; documented amendment trigger here. |

**T0 protocol** (runs at the start of `/speckit-implement`, before any code is written):

1. User explicitly authorises a scratch subdirectory in their vault (e.g., `_speckit-011-write-note-research/`). The plan does NOT presume authorisation; the user grants it explicitly when implementation begins.
2. The author runs each T0.* probe, captures stdout / stderr / exit code in `research.md` (this document, appended) under a new "T0 Live-CLI Capture (yyyy-mm-dd)" section.
3. The author updates R4 / R5 / handler logic / schema clauses if any T0 result differs from the provisional decisions above.
4. After capture, the scratch subdirectory is deleted via `obsidian delete path=_speckit-011-write-note-research/...`. No residual vault pollution.

The eight T0 cases collectively satisfy SC-011 (research.md captures all eight live-CLI cases) and SC-012 (path-traversal precondition gate verified).

---

## T0 Live-CLI Capture (2026-05-08)

Captured at the start of `/speckit-implement` against the user's "The Setup" vault using the user-authorised scratch subdir `_speckit-011-write-note-research/`. Each case lists the verbatim command, stdout, and exit code. Findings that differ from the provisional decisions are flagged.

### T0.1 — Specific-mode create at new path (verifies R4 / case (i))

```text
$ obsidian vault="The Setup" create path="_speckit-011-write-note-research/case1.md" content="hello"
Created: _speckit-011-write-note-research/case1.md
EXIT_CODE=0
```

**R4 lock**: success-fresh-creation prefix is exactly `Created: <path>`. No amendment to provisional R4.

### T0.2 — Specific-mode create via wikilink (verifies case (ii))

```text
$ obsidian vault="The Setup" create name="ScratchNote-T0-2" content="hello"
Created: ScratchNote-T0-2.md
EXIT_CODE=0
```

**Canonical-path resolution rule**: wikilink-form (`name=`) lands at the **vault root** by default (no folder prefix added). The CLI auto-appends `.md`. Output `path` is verbatim what the CLI reports — agents using the wikilink form should expect a vault-root location unless their vault has Obsidian's "default location for new notes" configured otherwise.

### T0.3 — Specific-mode overwrite (verifies R4 / case (iii))

```text
$ obsidian vault="The Setup" create path="_speckit-011-write-note-research/case1.md" content="rewritten" overwrite
Overwrote: _speckit-011-write-note-research/case1.md
EXIT_CODE=0
```

**R4 residual fully resolved**: overwrite-success prefix is `Overwrote: <path>` — DISTINGUISHABLE from `Created:`. The handler's `parseCreateResponse` matches `^(Created|Overwrote):\s+(.+?)\s*$` and maps `Created` → `created: true`, `Overwrote` → `created: false`. **No R4 amendment needed.** R4's "alternatives" branches (pre-call existence check, post-call file-stat, always-true caveat) are NOT triggered.

### T0.4 — Unknown vault (verifies R5 / case (v))

```text
$ obsidian vault="NoSuchVault" create path="x.md" content="x"
Vault not found.
EXIT_CODE=0
```

**R5 ratified**: exit code is `0`, NOT `1`. The cli-adapter's existing `CLI_NON_ZERO_EXIT` classification does NOT cover this case. **T002 lives** — the cli-adapter gains a stdout-prefix inspection clause that re-classifies stdout `Vault not found.` (verbatim) as `CLI_REPORTED_ERROR`.

### T0.5 — Overwrite=false against existing path (verifies case (iv)) — **SPEC DEVIATION**

```text
$ obsidian vault="The Setup" create path="_speckit-011-write-note-research/case1.md" content="should fail"
Created: _speckit-011-write-note-research/case1 1.md
EXIT_CODE=0
```

**Spec-deviation finding**: the CLI does NOT reject overwrite=false-on-existing. Instead, it **silently auto-renames** the new file by appending ` 1` (Obsidian's duplicate-rename convention) and reports the auto-renamed path as a fresh `Created:`. Story 3's stated semantic ("the CLI rejects when overwrite=false against an existing path, propagating CLI_REPORTED_ERROR") does NOT match CLI behaviour.

**Reconciliation per "spec follows the code that exists"**: `write_note` accepts the CLI's silent-auto-rename behaviour. The handler returns `{ created: true, path: "<auto-renamed path>" }` — the caller observes that the returned `path` differs from the input `path` and infers the collision. Documented in [docs/tools/write_note.md](../../docs/tools/write_note.md) per FR-014.

**Handler test impact**: T004 case (d) reframes — instead of asserting `UpstreamError({ code: "CLI_REPORTED_ERROR" })` for the no-overwrite-on-existing scenario, the test asserts `{ created: true, path: "<input path with ' 1' suffix>" }` AND argv does NOT contain `"overwrite"` token. The CLI_REPORTED_ERROR propagation is still tested via case (h) for synthesised `Error:` stdout.

**Story 3 acceptance-criteria reading**: AC#1 ("the CLI rejects with `CLI_REPORTED_ERROR`") and AC#2 ("the rejection message is propagated verbatim") are reframed under R10 ("don't amend predecessor specs") — research.md is the source of record. The behaviour-preservation criterion (AC#3 — overwrite-default-false does NOT emit the `overwrite` flag in argv) IS preserved verbatim and remains the primary assertion for case (d).

### T0.6 — Non-existent template (verifies case (vi))

```text
$ obsidian vault="The Setup" create path="_speckit-011-write-note-research/case6.md" content="x" template="DefinitelyNotATemplate"
Error: No template folder configured.
EXIT_CODE=0
```

**Classification**: stdout-prefixed `Error:` + exit-0 matches the cli-adapter's existing `CLI_REPORTED_ERROR` classification (per [src/cli-adapter/cli-adapter.ts](../../src/cli-adapter/cli-adapter.ts) — `Error:` prefix on stdout-success-path). No new code path needed; handler propagates verbatim. The user's vault has no template folder configured at all, so this case conflates "no folder" and "non-existent template name" — both surface as the same code/wording. Documented in `docs/tools/write_note.md`.

### T0.7 — Path-traversal — SC-012 GATE (verifies case (vii))

```text
$ obsidian vault="The Setup" create path="_speckit-011-write-note-research/../../etc/passwd_test.md" content="x"
TypeError: Cannot read properties of null (reading 'getParentPrefix')
EXIT_CODE=0
```

**On-disk verification**: `find "<vault parent>" -name passwd_test.md` returns NO results — the CLI did NOT write the file outside the vault. **SC-012 strict reading PASSES**: the spec's gate ("the on-disk filesystem MUST NOT have a new `passwd_test.md` outside the vault root") is satisfied.

**CLI-defect side-effect**: the CLI created an empty parent directory (`<vault-parent>/etc/`) outside the vault root before throwing the TypeError. No content leaked, but the empty-dir creation is a minor CLI defect. **No tool-layer reject added** — per the spec's strict trigger ("if the CLI accepts the input AND writes outside the vault"), the trigger does not fire because no file content was written.

**Defense-in-depth note**: a future BI MAY add a schema-`superRefine` clause that rejects `path` values containing `../` or `..\\` segments to prevent triggering the CLI's TypeError defect at all. Out of scope for this BI; SC-012 is verified as-is.

**Test-fixture impact**: T004 has no path-traversal test case (the spec did not require one within this BI's scope; SC-012 is a precondition gate verified by this T0 capture, not a test invariant).

### T0.8 — Active-mode "rewrite" (verifies case (viii)) — **SPEC SEMANTIC DEVIATION**

```text
$ obsidian create content="active T0.8" overwrite
Created: Untitled.md
EXIT_CODE=0
```

**Verifies**: with a focused note open in Obsidian (focused: `1000- Testing-to-be-deleted/validation-codeblock-only.md`, confirmed via `obsidian file` → `path	1000- Testing-to-be-deleted/validation-codeblock-only.md`), the CLI's `create` subcommand with no `name`/`path` does NOT rewrite the focused note. It creates a fresh `Untitled.md` at vault root, ignoring focus entirely. The `overwrite` flag is honoured against `Untitled.md` (no prior file → fresh creation; the flag is a no-op when no collision exists).

**Spec-deviation finding**: Story 5's stated semantic ("active mode rewrites the focused note's content") does NOT match CLI behaviour. The CLI's `create` subcommand has NO active-note-rewrite primitive.

**User-clarified semantic re-frame (2026-05-08, during T0)**: "active mode at the schema level is more relevant in the context of the active vault and folder (of the open note) — and not the open note itself". Active mode for `write_note` therefore wraps `obsidian create content=<X> overwrite` (no vault, no name, no path) and accepts the CLI's behaviour: create a new file with CLI default-naming (`Untitled.md` or auto-incremented sibling) in the active vault context.

**Reconciliation**:
- Schema: NO change. Active-mode `superRefine` clauses (overwrite=true required, template forbidden, open forbidden per Clarifications 2026-05-08 Q1, Q3) remain valid — they bound the surface conservatively, and the user-reframed semantic does not relax them.
- Handler: NO change. Argv assembly is unchanged (`["create", "content=<X>", "overwrite"]`).
- Output: `{ created: true, path: "Untitled.md" }` (or `"Untitled <n>.md"` per CLI auto-rename if a prior `Untitled.md` already exists). The `created` field is `true` because the CLI emits `Created:`, NOT `Overwrote:` — there is no pre-existing target the active-mode call writes over.
- Tests: T004 case (e) reframes — fixture stdout is `Created: Untitled.md`, expected output is `{ created: true, path: "Untitled.md" }`, argv assertion unchanged.
- Docs: `docs/tools/write_note.md` clarifies the active-mode semantic in user-facing language: "active mode = create a new file in the active vault context using CLI default naming. Does NOT rewrite the focused note's content."

This is a tightening of the implementation surface to match what the CLI can actually do — consistent with R1 (logger surface) and R10 (don't amend predecessor specs). The Clarifications 2026-05-08 active-mode constraints (overwrite-required, template-forbidden, open-forbidden) remain enforced at the schema layer.

### T0 cleanup status (2026-05-08)

Within authorised scratch dir (`_speckit-011-write-note-research/`):
- `case1.md` (T0.1, T0.3) — DELETED via `obsidian delete path=_speckit-011-write-note-research/case1.md permanent`
- `case1 1.md` (T0.5 collision rename) — DELETED via `obsidian delete path="_speckit-011-write-note-research/case1 1.md" permanent`
- `case6.md` (T0.6 was a template-error before write — file never created)
- The directory itself is left in place (empty); user may delete manually

Outside authorised scratch dir (require user manual cleanup — sandbox correctly denied auto-delete):
- `ScratchNote-T0-2.md` at vault root (T0.2 wikilink — landed outside scratch dir because the wikilink form lands at vault root by default)
- `Untitled.md` at vault root (T0.8 active-mode probe)
- Empty `<vault-parent>/etc/` directory (T0.7 CLI-defect side-effect — outside vault entirely)

### Summary of T0-driven implementation deltas

| Provisional decision | T0 finding | Implementation impact |
|---|---|---|
| R4: `Created: <path>` for fresh, ??? for overwrite | T0.3: `Overwrote: <path>` for overwrite | `parseCreateResponse` matches `^(Created|Overwrote):\s+(.+?)\s*$`; no R4 amendment needed |
| R5: adapter clause IF exit-0 + `Vault not found.` | T0.4 confirmed exit-0 | T002 IS needed (adapter-layer response-inspection clause) |
| Story 3: CLI rejects overwrite=false-on-existing | T0.5: CLI auto-renames silently | T004 case (d) reframed: assert success-with-renamed-path, NOT CLI_REPORTED_ERROR. Documented in write_note.md as silent-auto-rename behaviour |
| Story 5: active mode rewrites focused note | T0.8: CLI ignores focus, creates `Untitled.md` | Schema/handler unchanged. T004 case (e) fixture: `Created: Untitled.md` → `{ created: true, path: "Untitled.md" }`. write_note.md documents the user-reframed semantic |
| SC-012: CLI must reject `../` paths | T0.7: TypeError + empty parent dir created, NO file written | Strict reading: PASSES. Document the empty-dir CLI defect in PR description; no tool-layer reject added |

**SC-011** (research.md captures all 8 live-CLI cases): satisfied by this section.
**SC-012** (path-traversal precondition gate verified): satisfied — no file content written outside vault.
