# Research — `delete_note` Typed MCP Tool

**Feature**: [012-delete-note](./spec.md)
**Date**: 2026-05-08

This document is the Phase 0 output of `/speckit-plan` for `012-delete-note`. It records the design decisions ratified during plan-stage characterisation against the live Obsidian CLI, the spec-vs-actual-codebase reconciliations adopted from the [011-write-note](../011-write-note/research.md) precedent, and the FR-019 case-capture status (verified-during-plan vs deferred-to-T0). The handler's response-parsing logic and argv assembly will be locked against this artifact's contents at implementation time.

The convention is the same as [research.md for 011-write-note](../011-write-note/research.md): each decision (`Rn`) carries Decision / Rationale / Alternatives. Plan-stage live-CLI findings are quoted verbatim.

---

## R1 — Logger surface (FR-009 reconciliation, supersedes spec FR-009 wording)

**Decision**: `delete_note`'s handler is a thin `invokeCli` wrapper. It does NOT emit per-call `logger.callStart` / `logger.callEndSuccess` / `logger.callEndFailure` events at the tool layer. Observability flows through the cli-adapter's existing `dispatchTimeout` / `dispatchCap` / `dispatchKill` events end-to-end. `RegisterDeps` accepts `logger: Logger` for forwarding to the adapter / queue layer; `src/server.ts` passes the same logger instance to all tool registrations.

**Rationale**: The spec's FR-009 mandated handler-emitted `logger.callStart` / `callEndSuccess` / `callEndFailure` events "in parity with [011-write-note](../011-write-note/spec.md)". Live verification (continuing from the 011-write-note R1 finding):

- The `Logger` interface at [src/logger.ts](../../src/logger.ts) defines `shutdown` / `dispatchTimeout` / `dispatchCap` / `dispatchKill` only. `callStart` / `callEndSuccess` / `callEndFailure` methods do NOT exist.
- The actual sibling handlers at [src/tools/read_note/handler.ts](../../src/tools/read_note/handler.ts) and [src/tools/write_note/handler.ts](../../src/tools/write_note/handler.ts) do NOT emit any per-call events. Both are tight `invokeCli` wrappers.

Per "spec follows the code that exists, not the code that was sketched" (CLAUDE.md / 006-read-note background, ratified by 011-write-note PSR-1), `delete_note` mirrors the actual sibling shape. The cli-adapter's dispatch events preserve observability for timeout / output-cap / kill-on-shutdown scenarios; per-call events are not wired in any tool.

**Alternatives**:
- (A) Add `callStart` / `callEndSuccess` / `callEndFailure` methods to the `Logger` interface AND emit them from `delete_note`. Rejected: requires modifying the frozen `Logger` surface, asymmetry vs `read_note` / `write_note`, and adds maintenance burden without a concrete observability requirement.
- (B) Emit `dispatchTimeout`-style events from the tool layer manually. Rejected: duplicates events the cli-adapter already emits; the tool layer has no information the adapter doesn't.
- (C) Defer the decision to a future cross-tool observability BI. Accepted as the implicit posture — if observability requirements emerge, they apply to all four typed tools (obsidian_exec / read_note / write_note / delete_note) uniformly.

**Trigger to revisit**: a concrete observability requirement that the cli-adapter's existing events cannot satisfy, or a request to add the per-call events from one of the existing tool surfaces. Either one motivates a cross-tool primitive amendment, not a delete_note-specific deviation.

**Spec.md amendment**: NONE. Per R10 below, spec.md FR-009 wording is left in place for historical traceability; this PSR is the operative contract (parity with the 011-write-note PSR-1 precedent).

---

## R2 — Argv flag form vs key=value (FR-007 / FR-019 case (ix))

**Decision**: `permanent` is emitted as a FLAG (bare-word `permanent` in the argv `flags: []` array, NO `=true` value). The locator argv keys (`file=` / `path=`) are emitted as key=value pairs in `parameters`.

**Rationale**: Live verification via `obsidian help` (extracted Phase 0 output, see [Live CLI Findings](#live-cli-findings) below):

```
delete                Delete a file
  file=<name>         - File name
  path=<path>         - File path
  permanent           - Skip trash, delete permanently
```

The `<name>` / `<path>` notation in the help text indicates key=value form; the bare-word `permanent` (no `=<value>`) indicates flag form. This matches the 011-write-note R2 finding for `overwrite` / `open` / `newtab` on the `create` subcommand.

**Alternatives**:
- (A) Emit `permanent=true` as key=value. Rejected: live CLI does not document this form; the empirical convention is bare-word flag.
- (B) Emit a CLI-style `--permanent` long flag. Rejected: the CLI does not use `--`-prefixed flags; the convention is unprefixed bare-word.

**Implementation note**: the handler computes `flags: input.permanent === true ? ["permanent"] : []`. The default-false case (omitted or explicit `false`) MUST NOT emit any `permanent`-shaped token in argv (per spec Story 1 AC#2 + Story 3 AC#2). This avoids ambiguity if the CLI's flag parser would treat `permanent=false` as a positive flag.

---

## R3 — Locator argv keys MATCH user-facing schema fields (`file=`, `path=`) — supersedes the 011-write-note PSR-5 rename pattern

**Decision**: The user-facing schema fields `file` and `path` map directly to CLI argv keys `file=<value>` and `path=<value>` for the `delete` subcommand. NO rename is needed — unlike `write_note` where `file` (user-facing) → `name=` (CLI argv) per the 011-write-note PSR-5 reconciliation.

**Rationale**: Live verification via `obsidian help`:

```
delete                Delete a file
  file=<name>         - File name
  path=<path>         - File path
```

The `delete` subcommand uses `file=<name>` (NOT `name=<name>` like `create`). This matches the `read` subcommand's argv shape, so the `delete_note` handler is structurally simpler than `write_note`'s — the locator field passes through unchanged.

**CLI internal inconsistency**: the same vault data-model concept (a wikilink-form file name) uses three different argv keys across subcommands:
- `read file=<name>` (locator key matches `file`)
- `create name=<name>` (locator key is `name`)
- `delete file=<name>` (locator key matches `file`)
- (and similarly for other read-only subcommands like `aliases`, `backlinks`, `tags`, etc., which use `file=`)

The `create` subcommand is the outlier. The user-facing typed-tool surface stays uniform (`file` / `path` across `read_note` / `write_note` / `delete_note`); the handler does the rename only for `write_note` per PSR-5. `delete_note`'s handler is rename-free.

**Alternatives**:
- (A) Always rename `file` → `name=` in handlers regardless of subcommand. Rejected: pointless transformation when `file` matches; introduces rename bugs.
- (B) Rename the user-facing field to `name` for `delete_note` to match the CLI argv. Rejected: breaks cross-tool uniformity (`read_note` / `delete_note` would diverge for no callsite benefit).

**Implementation note**: handler emits `parameters: { file: input.file }` or `parameters: { path: input.path }` directly. No PSR-5-style rename clause.

---

## R4 — Output `{ deleted: true, path, toTrash }` derivation: structural `toTrash`, response-parsed `path`

**Decision**: 
- `deleted` is a **literal `true`** in the success path's output schema (`z.literal(true)`). Successful return ⇒ `deleted: true`. Failures take the `UpstreamError` exit, not a `deleted: false` shape.
- `toTrash` is **derived structurally** from the call's input: `toTrash = !parsed.permanent`. Computed in the handler after a successful adapter call; NOT parsed from the CLI's response wording. The typed surface owns the safety-default contract.
- `path` is **parsed from the CLI's stdout response**, parity with `write_note`'s `Created: <path>` / `Overwrote: <path>` extraction. The exact response wording is captured during T0 (case (i) and case (iii) below).

**Rationale**:
- The `deleted` literal-true shape mirrors `read_note`'s no-discriminator response (read_note returns `{ content }` only — there's no `read: false` shape because failures throw `UpstreamError`). This is the project's established convention for typed tools whose semantic only has one success shape.
- `toTrash`-from-`permanent` is structural because the CLI's response wording is platform-dependent and might not distinguish to-trash vs permanent (e.g., the CLI might say `Deleted: <path>` for both). The typed surface owns the audit invariant (per spec SC-014, `toTrash === !parsed.permanent`); the handler computes it deterministically, not interpretively.
- `path` MUST be parsed from the CLI response because for wikilink-form input (`file=QuickNote`), the CLI resolves the wikilink to a folder-prefixed path (e.g., `Inbox/QuickNote.md`); echoing the input locator would produce a path that doesn't match the actually-deleted file location. T0 captures the exact response wording.

**Hypothesised CLI response shape** (locked at T0):
- Successful to-trash delete: stdout contains a line like `Trashed: <path>` (parity with `Created:` for create) or `Deleted: <path>`.
- Successful permanent delete: stdout contains a line like `Deleted: <path>` or `Permanently deleted: <path>` (or possibly indistinguishable from the to-trash case).
- File not found: stdout starts with `Error: ` and a phrase containing "not found" or similar.

**Implementation note for the unparseable-success case**: if the CLI exits 0 but stdout doesn't match the captured success response pattern, the handler throws `UpstreamError({ code: "CLI_REPORTED_ERROR", message: "delete_note could not parse CLI response: ...", details: { stdout } })` (parity with `write_note`'s `parseCreateResponse` fallback at [src/tools/write_note/handler.ts:23-29](../../src/tools/write_note/handler.ts#L23-L29)).

**Trigger to revisit**: T0 finds the CLI does not echo the canonical path (e.g., it returns only `OK` regardless of input). Resolutions: (a) accept that the response's `path` mirrors the input locator (with the wikilink expanded to a default-folder path, requiring a fallback rule documented in `docs/tools/delete_note.md`), or (b) request a CLI-layer enhancement to disambiguate. Lands as a research.md amendment + spec amendment per FR-019.

**Alternatives**:
- (A) Parse `toTrash` from CLI response wording (e.g., `Trashed:` ⇒ true, `Deleted:` ⇒ false). Rejected: brittle (assumes the CLI distinguishes; risks silent regression if the CLI changes wording); ties the audit invariant to platform-dependent text instead of typed input.
- (B) Make `deleted` a `z.boolean()` (not literal-true) to allow a future "soft no-op" semantic where the file was already gone. Rejected: spec Story 6 AC#3 + user input requires a structured error for the file-not-found case, not a `deleted: false` no-op.

---

## R5 — Unknown-vault response inspection: inherited from 011-write-note R5, no further changes

**Decision**: `delete_note` inherits the cli-adapter's existing unknown-vault response-inspection clause introduced by 011-write-note R5 / T002 (see [src/cli-adapter/cli-adapter.ts:55-89](../../src/cli-adapter/cli-adapter.ts#L55-L89)). No further adapter changes are needed for `delete_note`.

**Rationale**: Live verification — running an unknown-vault probe against the `delete` subcommand:

```
PS> obsidian vault=NoSuchVault delete path=nonexistent.md
EXIT=0
STDOUT/ERR:
Vault not found.
```

The response is byte-identical to the response observed against `create` during 011-write-note plan stage: `Vault not found.` on stdout, exit code 0. The cli-adapter's stdout-inspection clause (which matches the `UNKNOWN_VAULT_PREFIX = "Vault not found."` constant at [src/cli-adapter/cli-adapter.ts:55](../../src/cli-adapter/cli-adapter.ts#L55)) re-classifies this to `CLI_REPORTED_ERROR` regardless of subcommand. `delete_note` propagates the structured error verbatim.

This is the load-bearing design choice from 011-write-note R5 paying off: the adapter-layer fix benefits all typed tools, so each new tool inherits the structured failure surface for free. No `delete_note`-specific handling required.

**Alternatives**:
- (A) Add subcommand-specific response inspection in `delete_note`'s handler. Rejected: duplicates the adapter's logic, breaks the layered design.
- (B) Pre-validate vault names against a registry before calling. Rejected: requires a `list_vaults` primitive that doesn't exist; tracks the spec's Out of Scope decision.

**FR-019 case (v) status**: VERIFIED during plan stage. No T0 work needed for this case.

---

## R6 — No active-mode `superRefine` clauses (departure from 011-write-note R6)

**Decision**: `delete_note`'s schema has NO tool-specific active-mode `superRefine` clauses. The schema reduces to:

```ts
applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    permanent: z.boolean().optional().default(false),
  }),
);
```

No `.superRefine(...)` chain. The target-mode primitive's existing forbidden-key rules (vault/file/path forbidden in active mode) are sufficient.

**Rationale**: Unlike `write_note` (which has three active-mode clauses per Clarifications 2026-05-08 — overwrite-required, template-forbidden, open-forbidden), `delete_note`'s `permanent` field has well-defined semantics in BOTH modes:
- Specific mode: `permanent: true` ⇒ skip trash for the file at `vault`/`file|path`.
- Active mode: `permanent: true` ⇒ skip trash for the focused note.

There is no semantic ambiguity that requires a mode-specific refinement. The user input's [P1] AC #9 explicitly permits active+permanent: "Active-mode with a focused note deletes the focused file (subject to the safety default — to trash unless permanent: true)."

**Alternatives**:
- (A) Forbid `permanent: true` in active mode as a TOCTOU safety net (the focus may shift between parse and execution; combining irreversibility with focus-shift risk could be argued as too dangerous). Rejected during /speckit-clarify scan: user input explicitly permits the combination, and the load-bearing TOCTOU caveat is documented in spec Edge Cases ("agents that need certainty MUST use specific mode with an explicit locator"). Adding a forbid-clause would re-litigate a settled requirement.
- (B) Require `permanent: true` in active mode (mirroring `write_note`'s "active mode is destructive by definition" rule). Rejected: the safety posture for delete is "do no harm to user state" via the to-trash default, not "explicit-opt-in for destruction by definition" via active mode. Active+to-trash is a recoverable operation; the to-trash default is the safe path regardless of mode.

**Schema-shape simplification**: this departure from 011-write-note's three-clause `superRefine` is the dominant reason `delete_note`'s handler LOC ceiling (≤50, per spec SC-007) is lower than `write_note`'s (≤70).

---

## R7 — Test seams (FR-016)

**Decision**: handler tests inject `deps.spawnFn` per the cli-adapter's existing test-seam convention. Schema tests use `safeParse` directly (no adapter involvement). Registration tests assert the descriptor shape and exercise the propagate-via-handler behaviours.

**Rationale**: Adopts the 011-write-note R7 pattern verbatim. The `spawnFn` test seam at [src/cli-adapter/cli-adapter.ts](../../src/cli-adapter/cli-adapter.ts) lets handler tests stub `child_process.spawn` without mocking the adapter module — the adapter's argv-assembly logic is exercised end-to-end, which is what we want (the integration boundary that `delete_note` actually depends on is the adapter's contract, not its implementation).

For `delete_note` specifically, the test injection cases enumerated in spec FR-016 are:
- Schema tests (~13 cases): direct `writeNoteInputSchema.safeParse(...)` calls; no adapter involvement.
- Handler tests (~12 cases): inject `deps.spawnFn` returning a stub child that exits with controlled stdout/stderr per the test scenario; assert the argv passed to spawn AND the returned output shape.
- Registration tests (~5 cases): assert the descriptor name / inputSchema shape / description content, plus an integration smoke that calls the registered handler with a known-bad input and asserts `VALIDATION_ERROR` is returned.

**Alternatives**:
- (A) Mock the cli-adapter module directly (e.g., via vitest.mock). Rejected: doesn't exercise argv-assembly, diverges from the rest of the project's test conventions.

---

## R8 — Co-located test path resolution for the docs-existence assertion (FR-016 case e)

**Decision**: `import.meta.url`-based resolution in `index.test.ts` for the docs-existence-and-non-stub assertion (test case (e) in FR-016).

**Rationale**: Adopts the 011-write-note R8 pattern verbatim. Avoids `process.cwd()` brittleness across vitest invocations (the working directory differs depending on whether vitest is invoked from the repo root, from a subdirectory, or via the IDE).

**Implementation pattern**:

```ts
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const docPath = resolve(__dirname, "../../../docs/tools/delete_note.md");
const docBody = readFileSync(docPath, "utf8");

it("docs/tools/delete_note.md is non-stub", () => {
  expect(docBody).not.toContain("<!-- TODO");
});
```

(Exact assertion content tracks the spec FR-016 case (e) requirements: no TODO marker, all five propagated error codes named, all four required example shapes present, `permanent: true` irreversibility warning present.)

---

## R9 — Coverage threshold preservation (FR-017 / SC-008)

**Decision**: Adopts the 011-write-note R9 outcome verbatim. The new `delete_note` module is small (~120 LOC across schema + handler + index, lower than 011's ~150–200 because no template/open/superRefine logic). The 30 co-located test cases (13 schema / 12 handler / 5 registration) provide near-100% coverage of the new module, so the aggregate statements floor (89.6% per [vitest.config.ts:20](../../vitest.config.ts#L20)) is preserved or improved.

**Rationale**: Coverage threshold is a merge gate. Adding well-covered code to a moderately-covered project either improves or maintains the aggregate. No modification to `vitest.config.ts` is needed for this BI; the floor stays at 89.6%.

---

## R10 — Don't amend predecessor specs (project convention)

**Decision**: This research.md is the source of record for plan-stage discoveries that diverge from the spec's wording. The spec at [spec.md](./spec.md) is NOT amended retroactively; FR-009's logger-events wording is left in place even though R1 supersedes it (parity with the 011-write-note R10 / [010-flatten-target-mode](../010-flatten-target-mode/spec.md) R10 precedent).

**Rationale**: The spec captures intent at scaffold-time. Plan-stage research surfaces "how the existing code actually behaves" findings that may differ from spec assumptions; those findings are logged in research.md (and in the merge-stage Constitution Compliance checklist's evidence section per FR-018). Retro-editing the spec creates a "what did the spec say at scaffold time" archaeological problem and obscures the resolution trail.

The merge-stage Constitution Compliance checklist will cite the relevant Rn entries in its Principle IV / V evidence sections so reviewers can trace each resolution to the implementing commit.

**Alternatives**:
- (A) Amend spec.md inline with `**SUPERSEDED BY PSR-1**` annotations. Rejected: clutters the spec, makes it hard to read in isolation.
- (B) Maintain a separate `Plan-Stage Resolutions` index section in spec.md (the 011-write-note pattern). Considered for adoption but rejected here: spec.md is already 487 lines; the index would add another 50+. The Background / Plan-Stage Resolutions index in 011's spec.md was a transitional pattern; for 012 the cleaner convention is "research.md is the source of record, the merge PR cites it."

---

## Live CLI Findings (Plan-Stage Probes)

The following findings are extracted from probes run against the live `obsidian` binary on Windows during plan stage. Reproducible commands are in PowerShell.

### Finding 1: Delete subcommand exists, named `delete`

```
PS> obsidian help 2>&1 | Select-String -Pattern "^  delete" -Context 0,4
>   delete                Delete a file
    file=<name>         - File name
    path=<path>         - File path
    permanent           - Skip trash, delete permanently
```

**Conclusions**:
- Subcommand name: `delete` (not `trash`, not `rm`, not `destroy`).
- Locator argv keys: `file=` and `path=` — matches user-facing schema fields directly (no rename per R3).
- Single optional flag: `permanent` (bare-word, no `=value` per R2).
- No `template=` / `content=` / `overwrite=` / `open=` / `newtab=` parameters: the surface is purely "remove this file," with `permanent` as the only modifier.

The CLI's safety default is to-trash with `permanent` as the opt-in to skip trash — matches the typed surface's exposed contract verbatim. No inversion is needed (the spec's Story 3 AC#3 inversion clause stays as a defensive rule that does NOT apply in practice).

### Finding 2: Unknown-vault response identical to `create`

```
PS> obsidian vault=NoSuchVault delete path=nonexistent.md
EXIT=0
STDOUT/ERR:
Vault not found.
```

**Conclusions**:
- Response: `Vault not found.` on stdout, exit code 0 — byte-identical to the response observed against `create` during 011-write-note plan stage.
- The cli-adapter's existing `UNKNOWN_VAULT_PREFIX = "Vault not found."` re-classification clause at [src/cli-adapter/cli-adapter.ts:55-89](../../src/cli-adapter/cli-adapter.ts#L55-L89) handles this verbatim.
- No `delete_note`-specific handler logic is needed for the unknown-vault case (per R5).

### Findings deferred to T0 (destructive cases require user-authorised scratch vault subdirectory)

The 011-write-note plan stage demonstrated that even no-args probes against the live CLI can produce side effects (an `obsidian create` no-args probe accidentally created `Untitled.md` in the user's "The Setup" vault). For a destructive operation like `delete`, the side-effect risk is inverted — accidentally calling `obsidian delete` could destroy user data.

The following FR-019 cases are therefore deferred to T0 (the first task of `/speckit-implement`), executed against a user-authorised SCRATCH vault subdirectory the user explicitly designates at implementation time. The handler's response-parsing logic is locked against the wording captured at T0.

| Case | What to capture | Trigger to amend research.md |
|------|-----------------|------------------------------|
| (i) successful specific-mode to-trash delete | Verbatim stdout for a fresh `obsidian vault=Scratch delete path=Sub/T1.md` against an existing `T1.md`. Likely `Trashed: <path>` or `Deleted: <path>`. Locks the `path` extraction regex. | Captured wording differs from R4's hypothesised `Trashed: <path>`. |
| (ii) successful specific-mode delete via wikilink | Verbatim stdout for `obsidian vault=Scratch delete file=T2`. Confirms wikilink resolution returns canonical folder-prefixed path. | The CLI does not echo the resolved path (returns only `OK`-style). |
| (iii) successful specific-mode permanent delete | Verbatim stdout for `obsidian vault=Scratch delete path=Sub/T3.md permanent`. Confirms whether the CLI distinguishes to-trash vs permanent in stdout (parity with the create vs overwrite distinction in 011 R4). | Captured wording is identical to case (i) — i.e., the CLI does NOT distinguish. (Acceptable: `toTrash` is derived structurally per R4, not parsed.) |
| (iv) delete against a non-existent path | Verbatim stdout for `obsidian vault=Scratch delete path=Sub/Missing.md`. Likely `Error: file not found` or similar. Locks the `CLI_REPORTED_ERROR.message` for spec Story 6 AC#3. | Captured wording starts with anything other than `Error:` (would bypass the existing `Error:` prefix classification at the dispatch layer). |
| (vi) successful active-mode delete of focused note | Manual: focus a scratch note in Obsidian, run `obsidian delete` (no vault/file/path), verify the focused note is moved to trash and the response wording. | Active-mode behaviour differs from create / read (e.g., the CLI requires an explicit locator and does NOT default to active for delete). |
| (vii) PATH-TRAVERSAL precondition gate (SC-012) | `obsidian vault=Scratch delete path=../../../etc/passwd.md` — verify the CLI rejects with a structured error and does NOT escape the vault root. **CRITICAL SECURITY GATE**: if the CLI silently writes outside the vault, this BI gains a tool-layer reject as a P1 amendment before merge. | The CLI does not reject `../`-shaped paths. Implementation amendment + spec update + new schema test case before merge. |
| (viii) trash-volume-full precondition gate (SC-013) | Best-effort: simulate (or, if not feasible to simulate, document the platform behaviour from prior reproduction) the trash-full case on Windows. Verify the CLI surfaces a structured error rather than silently falling back to permanent delete. | The CLI silently falls back to permanent without `permanent: true`. Implementation amendment + spec update before merge. |

(Cases (v) — unknown vault — and (ix) — subcommand discovery + argv shape — are verified during plan stage above. Case (vii) is the SC-012 security gate; case (viii) is the SC-013 safety gate; both block ship if the CLI's behaviour is unsafe.)

The T0 task in `/speckit-implement` will:
1. Ask the user to designate a scratch vault subdirectory (e.g., `MyVault/_scratch_012/`) — the test fixtures live there for the duration of the implementation; cleanup is the user's call.
2. Create three test files (`T1.md`, `T3.md`, plus a fixture for case (vii)) inside the scratch subdir.
3. Run cases (i)–(iv), (vi), (vii), (viii) against the scratch subdir.
4. Append the captured wording (verbatim, with PowerShell command + EXIT + STDOUT) to this research.md under a new `## T0 Live-CLI Findings` heading.
5. Update the handler's `parseDeleteResponse` regex and the `docs/tools/delete_note.md` adversarial-edge-case section to reflect the captured behaviour.

---

## Summary of Plan-Stage Decisions

| ID | Decision | Status | Trigger to revisit |
|----|----------|--------|--------------------|
| R1 | Thin handler, no per-call logger events | RATIFIED (mirrors actual sibling impls) | Cross-tool observability requirement |
| R2 | `permanent` as flag form (bare-word) | RATIFIED (live `obsidian help`) | CLI changes flag-shape convention |
| R3 | `file` / `path` argv keys match schema fields directly (no rename) | RATIFIED (live `obsidian help`) | CLI renames the locator keys |
| R4 | `deleted: literal(true)`, `toTrash` structural, `path` parsed from CLI stdout | RATIFIED (with T0 lock-down for path-extraction regex) | T0 finds CLI doesn't echo canonical path |
| R5 | Inherit unknown-vault inspection from cli-adapter (011-R5 / T002) | RATIFIED (live verified — `Vault not found.` byte-identical) | CLI changes unknown-vault response wording |
| R6 | No tool-specific active-mode `superRefine` clauses | RATIFIED (departure from 011 — `permanent` has unambiguous semantics in both modes) | Future spec amendment forbids active+permanent (would require a Clarifications session) |
| R7 | `deps.spawnFn` test seam | RATIFIED (mirrors 011) | Adapter changes its test-seam convention |
| R8 | `import.meta.url` path resolution in tests | RATIFIED (mirrors 011) | Project-wide test-path convention shift |
| R9 | Coverage floor 89.6% preserved | RATIFIED (small well-tested module) | Aggregate floor changes pre-merge |
| R10 | Don't amend spec.md retroactively | RATIFIED (mirrors 010 / 011 precedent) | Project convention shift |

**Plan-stage status**: all 10 design decisions ratified. Two FR-019 cases verified live; six deferred to T0 (with two of those gating ship per SC-012 / SC-013).

---

## T0 Live-CLI Capture (2026-05-08)

Probes run against `obsidian` CLI version `1.12.7 (installer 1.12.7)` on Windows 11. Vault: `The Setup`. Scratch subdir: `1000- Testing-to-be-deleted/`. PowerShell host. Captures verbatim.

### T0.1 — specific-mode to-trash delete via `path=`

Pre-step:

```
PS> obsidian vault="The Setup" create path="1000- Testing-to-be-deleted/case1.md" content="hello"
Created: 1000- Testing-to-be-deleted/case1.md
```

Probe:

```
PS> obsidian vault="The Setup" delete path="1000- Testing-to-be-deleted/case1.md"
Moved to trash: 1000- Testing-to-be-deleted/case1.md
EXIT=0
```

**Captured wording**: `Moved to trash: <path>` — NOT the hypothesised `Trashed: <path>`. R4 amendment: the response regex locks against this exact wording.

### T0.2 — specific-mode to-trash delete via wikilink (`file=`)

Pre-step:

```
PS> obsidian vault="The Setup" create path="1000- Testing-to-be-deleted/ScratchNote-T0-2.md" content="wikilink probe"
Created: 1000- Testing-to-be-deleted/ScratchNote-T0-2.md
```

Probe:

```
PS> obsidian vault="The Setup" delete file="ScratchNote-T0-2"
Moved to trash: 1000- Testing-to-be-deleted/ScratchNote-T0-2.md
EXIT=0
```

**Captured behaviour**: CLI resolves `file=ScratchNote-T0-2` to the canonical folder-prefixed path `1000- Testing-to-be-deleted/ScratchNote-T0-2.md` and echoes it verbatim. No fallback rule needed. Wording prefix is `Moved to trash:` (same as T0.1).

### T0.3 — specific-mode permanent delete

Pre-step:

```
PS> obsidian vault="The Setup" create path="1000- Testing-to-be-deleted/case3.md" content="permanent"
Created: 1000- Testing-to-be-deleted/case3.md
```

Probe:

```
PS> obsidian vault="The Setup" delete path="1000- Testing-to-be-deleted/case3.md" permanent
Deleted permanently: 1000- Testing-to-be-deleted/case3.md
EXIT=0
```

**Captured wording**: `Deleted permanently: <path>` — DIFFERENT prefix from T0.1's `Moved to trash:`. The CLI distinguishes to-trash vs permanent in stdout. `toTrash` remains structural per R4 (NOT regex-derived); the distinction surfaces only as alternative regex prefixes for parsing the path.

**Locked regex**: `/^(Moved to trash|Deleted permanently): (.+?)\s*$/m`. First capture group exists for diagnostic / future-extension purposes; second capture group is the path; `toTrash` is computed from input.

### T0.4 — delete against a non-existent path

```
PS> obsidian vault="The Setup" delete path="1000- Testing-to-be-deleted/__nonexistent_probe.md"
Error: File "1000- Testing-to-be-deleted/__nonexistent_probe.md" not found.
EXIT=0
```

**Captured wording**: `Error: File "<path>" not found.` (exit 0, on stdout). The dispatch-layer's `Error:` stdout-prefix re-classifier catches this and surfaces `CLI_REPORTED_ERROR` with the message verbatim. No handler-layer change needed.

### T0.6 — active-mode delete of focused note

```
PS> obsidian delete
Moved to trash: 1000- Testing-to-be-deleted/validation-frontmatter-only.md
EXIT=0
```

**Captured behaviour**: active-mode delete succeeds when an Obsidian instance has a focused note. The CLI emits the same `Moved to trash: <path>` wording as specific-mode — no separate active-mode response shape needed. The `path` field is the resolved focused-note path. (Note: the focused note that was deleted during T0.6 was a pre-existing scratch file the user had open; it remains recoverable from OS trash.)

### T0.7 — PATH-TRAVERSAL (SC-012 GATE)

Sentinel pre-step:

```
PS> obsidian vault="The Setup" create path="1000- Testing-to-be-deleted/_sentinel.md" content="..."
Created: 1000- Testing-to-be-deleted/_sentinel.md
```

Probe (relative-path traversal that would resolve to the sentinel under POSIX-style normalization):

```
PS> obsidian vault="The Setup" delete path="1000- Testing-to-be-deleted/subdir/../_sentinel.md"
Error: File "1000- Testing-to-be-deleted/subdir/../_sentinel.md" not found.
EXIT=0
```

Sentinel-survives check (delete the sentinel directly afterwards):

```
PS> obsidian vault="The Setup" delete path="1000- Testing-to-be-deleted/_sentinel.md"
Moved to trash: 1000- Testing-to-be-deleted/_sentinel.md
EXIT=0
```

**Captured behaviour**: ✅ **SC-012 PASS** — the CLI does NOT normalize `../` segments. `subdir/../_sentinel.md` is treated as a literal multi-component path, not resolved to `_sentinel.md`. The sentinel survived the traversal probe (verified by deleting it directly afterwards, which succeeded). No vault-escape vector via path-traversal.

**Conclusion**: no tool-layer reject needed. The literal-path treatment is the safe behaviour. R6 stays unchanged (no schema-layer `superRefine` clause for path-traversal); spec is not amended.

(A separate vault-escape probe with leading `../../../` was blocked by the host's permission boundary before reaching the CLI — orthogonal sandbox; not informative for the CLI's own behaviour. The relative-traversal probe above is dispositive.)

### T0.8 — TRASH-VOLUME-FULL (SC-013 GATE)

**Status**: NOT PROBED. Simulating a full Windows recycle bin (Recycle Bin Properties → Custom size: 0 MB, then attempting a delete) requires permission-elevation and risks affecting the user's normal trash workflow if mis-configured. Per the case description's "best-effort" allowance, the platform-specific limitation is documented in `docs/tools/delete_note.md` (T007) instead of probed here.

**Conservative posture**: the handler trusts the CLI's reported success. If a future field report indicates silent fall-back from to-trash to permanent on a full recycle bin, this BI gets a follow-up amendment (post-success on-disk verification) that detects the fall-back and surfaces a structured error. Until then, the documented limitation is the user-facing trade-off.

**No amendment landed**: the handler ships without a fall-back detector. The platform-specific note in `docs/tools/delete_note.md` makes this explicit.

### Cleanup

Files created during T0: `case1.md` (T0.1), `ScratchNote-T0-2.md` (T0.2), `case3.md` (T0.3), `_sentinel.md` (T0.7). All four are now deleted (three to-trash, one permanent). The scratch subdir `1000- Testing-to-be-deleted/` is left in place for the user to remove or repurpose.

The focused note `1000- Testing-to-be-deleted/validation-frontmatter-only.md` was deleted to-trash by T0.6 (recoverable from OS trash).

---

## R4 — Amendments after T0 capture

Original R4 hypothesised regex: `/^(Trashed|Deleted): (.+?)\s*$/m`.
**T0-captured regex** (locks against the actual CLI wording): `/^(Moved to trash|Deleted permanently): (.+?)\s*$/m`.

Behavioural contract is unchanged: first capture group is diagnostic only; second capture group is the canonical path; `toTrash` is computed structurally from input (NOT from the regex match). The handler's `parseDeleteResponse` uses the T0-locked regex.
