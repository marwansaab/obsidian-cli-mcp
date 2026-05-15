# Phase 0 Research — Move Note Typed MCP Tool

**Branch**: `030-move-note` | **Date**: 2026-05-15 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This document captures the design decisions ratified at Phase 0 of `/speckit-plan` plus the five live-CLI findings (F1..F5b) verified at plan stage and the roster of FR-019 characterisation cases deferred to T0 of `/speckit-implement`.

## Design decisions

### R1 — Logger surface: thin handler, no per-call events

**Decision**: `move`'s handler does NOT emit per-call `logger.callStart` / `logger.callEnd*` events at the tool layer. Observability flows through the cli-adapter's existing `dispatchTimeout` / `dispatchCap` / `dispatchKill` events end-to-end.

**Rationale**: matches the actual implementation of every typed tool from 011-write-note onward (per the 011-write-note PSR-1 / R1 reconciliation). The earlier specs (006-read-note's FR-014 etc.) named per-call logger events as a Phase-0 expectation; in practice every sibling implementation collapsed those to the cli-adapter layer because the handler is too thin to add meaningful per-call observability above what the adapter already emits. The siblings `delete`, `rename`, `set_property`, `files`, etc. all follow this pattern; `move` follows.

`RegisterDeps` still accepts `logger: Logger` for forwarding to the adapter / queue layer per the existing convention; `src/server.ts` passes the same logger instance to all tool registrations.

### R2 — CLI subcommand selection: `move` (native)

**Decision**: `move` wraps the Obsidian CLI's native `move` subcommand. NOT `eval`, NOT `obsidian_exec`.

**Rationale**: **Verified live at plan stage via `obsidian help` output (F1)**. The Obsidian CLI exposes `move` as a first-class subcommand with the exact argv shape:

```text
move                  Move or rename a file
  file=<name>         - File name
  path=<path>         - File path
  to=<path>           - Destination folder or path (required)
```

This is the exact shape the spec assumes, with parameter names matching the user-facing schema field names verbatim (`vault=`, `file=`, `path=`, `to=`). No PSR-5-style locator argv-key rename (cf. 011-write-note's `file=` → `name=` rename). The user-facing `to` field maps to the CLI argv `to=` token directly.

The CLI's own description ("Move or rename a file") confirms the spec's framing: a single subcommand handles both relocation and rename, with the trailing-`/` shape of `to=` being the wire-level discriminator (folder vs full-path). The 021-rename narrative's note that `move_note` is the future-BI wrap for the CLI's `move` subcommand is now realised.

**Alternatives considered**:
- `eval` subcommand (parity with 014/015/025–029's eval-composition pattern). Rejected: `move` exists as a native subcommand; using `eval` would add a load-bearing JS template + base64 anti-injection layer for no functional gain, and would conflict with the "thin wrapper" handler-thinness ceiling per R1.
- `obsidian_exec` (delegate to the freeform escape hatch). Rejected: the entire point of a typed wrap is to retire the freeform escape hatch for moves; the typed surface inherits per-mode validation, structured errors, the link-rewriting docs caveat, and the `to`-shape transform rule that `obsidian_exec` cannot provide.

### R3 — Per-mode call architecture: ONE invokeCli call per request

**Decision**: Every `move` request fires exactly ONE `invokeCli` call to the cli-adapter, regardless of `target_mode` or input locator shape. No two-call branches (no pre-resolve-then-move, no two-phase commit).

**Argv mapping**:
- **Specific + path**: `vault=<v> move path=<p> to=<resolvedTo>` (where `resolvedTo = resolveTo(parsed.to, parsed.path)` per R6).
- **Specific + file**: `vault=<v> move file=<f> to=<resolvedTo>`. The source-`.md` guard (R6) cannot be evaluated wrapper-side because the wikilink-form locator `file=<f>` is resolved by the CLI, NOT the wrapper. In `file=` mode, the wrapper applies the folder-target branch verbatim (`to.endsWith("/")` → append source basename — BUT source basename is also CLI-resolved; the wrapper instead forwards `to=` verbatim and accepts the CLI's response `toPath` as canonical). Detail in R6.
- **Active**: `move to=<resolvedTo>` (no `vault=`, no `file=`, no `path=`). Same `file=` caveat — the wrapper forwards `to=` verbatim because the source is CLI-resolved.

The CLI's "most commands default to the active file when file/path is omitted" rule (per `obsidian help`'s top-level notes) covers the active-mode case without any handler-side logic — the handler simply omits the locator parameters and the CLI applies the active-file default.

**Rationale**: parity with the existing typed tools (011/012/013/015/018/019/021 all fire single-spawn requests). Two-call architectures (pre-resolve source via a separate spawn → then move) introduce TOCTOU surface area and complicate the queue's serialization invariant. Cost of the wrapper-side limitation: in `file=` and active modes the source-`.md` guard's protection only fully binds in specific + `path=` mode where the wrapper knows the source's on-disk extension at handler entry. In `file=` and active modes, the wrapper forwards `to=` verbatim and accepts whatever the CLI's `move` subcommand natively does (T0 case xiii captures this behaviour).

### R4 — Target-mode mapping: STANDARD

**Decision**: `move`'s schema reuses `applyTargetModeRefinement` + `targetModeBaseSchema` from [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) verbatim — the same primitive that 011/012/013/015/018/021 use. NO folder-scoped variant (`applyTargetModeRefinementForFolderScoped` from 019 is for folder-scoped tools; `move` is file-scoped — it operates on a single named file or the focused file).

**Rationale**: `move` is a file-scoped operation, so it inherits the standard target-mode primitive's contract end-to-end: `vault` required in specific, exactly-one-of `file`/`path` in specific, `vault`/`file`/`path` forbidden in active, `additionalProperties: false` strict-mode. No tool-specific superRefine clauses are added beyond the `to` field's own `.min(1)` (per R8).

**Alternatives considered**:
- Add an active-mode-specific superRefine clause restricting `to`. Rejected: `to` has identical semantics in both modes; mode-specific narrowing would be inventing rules without justification.
- Use a discriminated union of two zod schemas (one per mode). Rejected: per the 010-flatten-target-mode encoding decision, flat schemas with superRefine are the project's canonical shape.

### R5 — Unknown-vault response inspection: inherited from cli-adapter (011-R5); F2 verifies match

**Decision**: `move` does NOT add any unknown-vault handling. The cli-adapter's 011-R5 response-inspection clause (added during 011-write-note's plan stage) re-classifies the CLI's `Vault not found.` response to `CLI_REPORTED_ERROR` with the verbatim message preserved in `details.message`. `move` inherits this verbatim.

**Verification at plan stage (F2)**: live probe `obsidian vault=NoSuchVaultDoesNotExist move path=Nonexistent.md to=Archive/` against the local CLI produced:

```text
Vault not found.
exit code: 0
```

Byte-identical to the 011-write-note R5 signature and to every other native-subcommand typed tool. The cli-adapter's existing inspection clause fires unchanged.

**Rationale**: the unknown-vault edge case is identical across every typed write surface that takes a `vault=` argv token. The wrapper does NOT duplicate the classifier at the tool layer; error classification lives at one layer (the adapter), not duplicated across tools.

### R6 — `to`-shape transform: trailing-`/` discriminator + source-`.md`-guarded `.md` append (per /speckit-clarify Q1 + Q2, locked 2026-05-15)

**Decision**: file-local helper in `handler.ts`:

```typescript
function resolveTo(to: string, fromPath: string): string {
  // Branch 1: folder-target (trailing `/`)
  if (to.endsWith("/")) {
    return to + basename(fromPath);
  }
  // Branch 2: full-path-target with source-`.md`-guarded append
  const filenamePortion = to.includes("/") ? to.slice(to.lastIndexOf("/") + 1) : to;
  if (fromPath.endsWith(".md") && !filenamePortion.endsWith(".md")) {
    return to + ".md";
  }
  return to;
}
```

Both `endsWith` predicates are literal byte-equality, case-sensitive — mirrors the 020-fix-write-gaps R2 lock and the 021-rename Q1 lock for `name`. The source-`.md` guard (the `fromPath.endsWith(".md") && …` clause) is the /speckit-clarify Q1 departure from rename's unconditional append: non-`.md` sources bypass the rule entirely.

**Wrapper-side applicability by mode**:
- **Specific + `path=`**: full applicability. `fromPath` is the validated input `parsed.path`; the wrapper computes `resolveTo` and forwards.
- **Specific + `file=`**: source resolution is CLI-owned (wikilink → on-disk path). The wrapper cannot reliably compute `fromPath` without a pre-resolve spawn (forbidden per R3 single-spawn invariant). Instead the wrapper forwards `to=` verbatim to the CLI and accepts the CLI's response `toPath` as canonical. T0 case xiii captures the CLI's native `to=` handling on `file=` mode.
- **Active**: same as `file=` — source is CLI-resolved. Wrapper forwards `to=` verbatim.

This means the source-`.md` guard's wrapper-side protection only fully binds in specific + `path=` mode. In `file=` and active modes the CLI's native behaviour is the trust boundary; T0 case xiii determines whether the CLI auto-appends `.md` to `to=` on `.md`-source moves or whether it accepts the destination verbatim.

**Worked examples** (specific + `path=` mode; source-`.md` guard fully applies):

| Source `path` | Input `to` | `resolveTo` output | Branch / why |
|---------------|-----------|---------------------|---------|
| `Inbox/Note.md` | `Archive/` | `Archive/Note.md` | Folder-target; basename preserved |
| `Inbox/Note.md` | `Archive/Renamed.md` | `Archive/Renamed.md` | Full-path verbatim (filename already `.md`) |
| `Inbox/Note.md` | `Archive/Renamed` | `Archive/Renamed.md` | Full-path; append fires (source-`.md` AND filename non-`.md`) |
| `Inbox/Note.md` | `Archive/Doc.v1.draft` | `Archive/Doc.v1.draft.md` | Full-path; append fires; internal periods preserved |
| `Inbox/Note.md` | `Archive/Renamed.MD` | `Archive/Renamed.MD.md` | Full-path; case-sensitive non-match → append |
| `Inbox/Note.md` | `Archive/Plan.canvas` | `Archive/Plan.canvas.md` | Full-path; `.canvas` ≠ `.md` → append (cross-type intent NOT honoured by default; route through `obsidian_exec move` for literal `.canvas` destination) |
| `Boards/Plan.canvas` | `Archive/` | `Archive/Plan.canvas` | Folder-target; basename preserved verbatim (no extension transform) |
| `Boards/Plan.canvas` | `Archive/Renamed` | `Archive/Renamed` | Full-path; source-`.md` guard suppresses append (`fromPath.endsWith(".md") === false`) — CLI handles |
| `Boards/Plan.canvas` | `Archive/Renamed.md` | `Archive/Renamed.md` | Full-path verbatim (caller-explicit `.md`; cross-type intent honoured) |
| `Inbox/日記.md` | `Archive/` | `Archive/日記.md` | Folder-target; UTF-8 bytes forwarded verbatim |

**Rationale**: the /speckit-clarify Q1 lock (session 2026-05-15, this BI) chose the source-`.md`-guarded form over rename's unconditional append. Rationale captured in the Clarifications session: preserves the rename-Q1 ergonomic default for the common `.md → .md` case while preventing the silent `.canvas → .md` conversion footgun. The strict trailing-`/` discriminator (Q2 lock) is anti-magic — predictable, deterministic, no heuristics; callers MUST include trailing `/` for folder shape.

### R7 — Strict trailing-`/` discriminator (per /speckit-clarify Q2, locked 2026-05-15)

**Decision**: the `to`-shape discriminator is **strict** trailing `/`. `to.endsWith("/")` → folder-target; otherwise → full-path-target. No heuristic disambiguation (no "trailing segment lacks extension → folder"); no validation-layer reject for ambiguous shapes (no "missing trailing `/` AND missing extension → fail"); no source-location probe (no two-spawn disambiguation).

**Consequence for the surprise case `to: "Archive"`** (no trailing `/`, no extension):

| Source extension | `resolveTo` output | Caller-visible result |
|-------------------|---------------------|------------------------|
| `.md` | `Archive.md` at vault root | The append rule fires; caller gets a root-level `Archive.md` |
| `.canvas` (or other non-`.md`) | `Archive` at vault root | Source-`.md` guard suppresses append; caller gets an extensionless root-level file (CLI's natural handling) |

Neither matches the caller-intent ("move into the `Archive` folder"). The documentation MUST surface this prominently (per FR-014 enhanced post-Q2) with the explicit "ALWAYS include trailing `/` for folder-target" guidance and both source-extension worked examples.

**Rationale**: predictable, deterministic, no heuristics, no extra CLI roundtrips, no schema-layer validation overhead. Mirrors the project's anti-magic posture (020-fix-write-gaps R2 byte-equality lock; 021-rename Q2 schema-layer folder-separator reject — both lean toward "make the contract crisp and document it" rather than "infer caller intent"). The one-byte ergonomic burden on the caller buys zero ambiguity.

**Alternatives considered** (per /speckit-clarify Q2 options):
- **Heuristic folder-target** (B): if trailing segment lacks `.<ext>`, treat as folder. Rejected: introduces a wrapper-side filename-shape heuristic that makes extensionless files (rare in Obsidian but valid) indistinguishable from folder names. Brittle vs the strict discriminator.
- **Validation-layer reject for ambiguous `to`** (C): schema requires `to` to end in `/` OR contain `.<ext>` in its filename. Rejected: too restrictive; rejects legitimate extensionless-filename moves (`to: "Archive/binary-data"`).
- **Source-location probe** (D): probe source location at handler time and disambiguate. Rejected: requires a second spawn per call; violates the R3 single-spawn invariant.

### R8 — `to` field schema: `.min(1)` only; no `.regex()` or trailing-`/` shape validation

**Decision**: `to: z.string().min(1)` — that's it. No regex constraining shape; no rejection of `..`/`\`/reserved characters at the zod boundary. The single hard reject is empty-string `to`.

**Rationale**:
- **Path-traversal**: deferred to plan-stage research per FR-019 case (x) and SC-012 precondition. F5 confirms the CLI guards SOURCE traversal (`Error: File "../../etc/passwd" not found.` — the CLI treats `..` as literal segments that resolve to a non-existent vault file, not as a path-traversal escape). Whether the CLI guards DESTINATION (`to=`) traversal is gated on T0 case x (destructive probe with bait-file staging per `.memory/test-execution-instructions.md`). If T0 surfaces silent vault-escape on `to=` traversal, the spec is amended pre-ship to add a validation-boundary reject (the SC-012 precondition path).
- **Backslash (`\`) in `to`**: forwarded verbatim per FR-003 / R10. T0 case xii captures CLI behaviour on each platform.
- **Reserved characters / Windows device names**: CLI / OS is the trust boundary. Documented in `docs/tools/move.md` per FR-014.
- **Trailing-`/` discriminator**: handled in the `resolveTo` helper (R6), not at the schema layer. Both shapes (folder-target `Archive/`, full-path-target `Archive/Note.md`) pass schema validation; the helper branches at handler time. Validation-layer reject would conflate "structurally invalid input" with "ambiguous shape" — the latter is a strict-discriminator concern, not a validation concern.

**Alternatives considered**:
- Add `.regex(/^[^\\]+$/)` to reject backslash at schema layer. Rejected: deferred to T0 per /speckit-clarify Q1 / Q2 not addressing this case; the spec already commits to FR-019 case (xii) + SC-012-pattern precondition if needed.
- Add `.regex(...)` to reject `..` segments at schema layer. Rejected: deferred to SC-012 precondition per spec / FR-019 case (x). Adding a defensive validation when the CLI may already reject is premature optimisation; T0's empirical findings drive the decision.
- Add a `.refine()` that rejects ambiguous shapes (no trailing `/` AND no `.<ext>`). Rejected per R7's strict-discriminator decision.

### R9 — Active-mode no-focused-note classifier behaviour: inherited `CLI_REPORTED_ERROR` (per user input + TC-049 + TC-171 precedents)

**Decision**: `move`'s active-mode no-focused-note case surfaces as `CLI_REPORTED_ERROR` with `details.message` carrying the verbatim CLI line (`Error: No active file.` — capital-N expected per the user input). NOT `ERR_NO_ACTIVE_FILE`.

**Rationale**: the bridge's dispatch-layer classifier targets lowercase `Error: no active file` (per [003-cli-adapter](../003-cli-adapter/spec.md)); the native CLI's `move` / `rename` / `delete` subcommands emit capital-N `Error: No active file.`. The capital-N reply does NOT classify as `ERR_NO_ACTIVE_FILE`; it falls through to `CLI_REPORTED_ERROR`. Empirically confirmed across `delete` (TC-049) and `rename` (TC-171); the user input names `move` as the third member of this cohort and tracks the broader inconsistency under [[BI-0027 - Audit Tool Descriptions]] dimension C.2. **Bridge-classifier change is out of scope for this BI** (project-wide concern; cross-cutting BI). This BI's job is to record the actual observable behaviour and ensure the help-doc / error-roster claims match.

**T0 verification**: case (ix) of FR-019 verifies the capital-N wording empirically against the live `move` subcommand. Relying on the `delete` / `rename` evidence alone is insufficient because different code paths could in principle produce different wording; the empirical confirmation per FR-019 is the SC-014 load-bearing assertion.

### R10 — Backslash-in-`to` forwarded verbatim, T0 captures behaviour (per FR-003 / FR-019 case xii)

**Decision**: the typed surface forwards `to` verbatim to the CLI without normalisation (`\` → `/`) or rejection. T0 case xii captures CLI behaviour on each platform.

**Rationale**: vault-relative paths in Obsidian are POSIX-style (forward slash); whether the CLI auto-normalises Windows-style backslashes is platform- and CLI-implementation-dependent. Plan-stage live probe of backslash-`to` requires a real source file (destructive); deferred to T0 per the `.memory/test-execution-instructions.md` protocol. If T0 surfaces silent vault-escape or platform-dependent corruption from `\`-containing `to` values, the spec is amended pre-ship to add a validation-boundary reject (same SC-012-pattern precondition as path-traversal).

### R11 — Single-spawn invariant

**Decision**: every `move` request fires exactly ONE `invokeCli` call (matches 011/012/013/015/018/019/021 precedent). Handler tests assert `spawnFn.callCount === 1`.

**Rationale**: parity with sibling typed tools. Two-spawn architectures (pre-resolve source extension wrapper-side before computing `resolveTo`) were rejected at R6 for the `file=` and active modes. The wrapper's source-`.md` guard accepts reduced applicability in those modes rather than breaking the single-spawn invariant.

### R12 — Plan-stage spec amendments: NONE

**Decision**: no spec amendments required at Phase 0. The two /speckit-clarify decisions (Q1 source-`.md`-guarded append rule, Q2 strict trailing-`/` discriminator) were locked at spec-stage session 2026-05-15 and are already integrated in spec.md.

**Rationale**: the five live-CLI findings (F1–F5b) ratify the spec's assumptions:
- F1 confirms the `move` subcommand exists with the exact `file=` / `path=` / `to=` argv shape FR-007 assumes.
- F2 confirms unknown-vault response matches 011-R5 signature byte-identical.
- F3 confirms source-not-found wording carries the `Error:` prefix the dispatch-layer classifier catches.
- F4 confirms missing-`to=` is structurally unreachable from the typed surface (schema rejects).
- F5 + F5b confirm the CLI handles traversal-shaped SOURCE locators with structured `Error: File "..." not found.` rather than silent escape — the spec's SC-012 precondition for SOURCE traversal is satisfied at plan stage. (`to=` traversal still requires T0 case x because the source-not-found path short-circuits before `to=` validation.)

No new clarifications surfaced; no FR rewrites needed.

### R13 — Post-022 registry-stability baseline roll-forward (per FR-013a)

**Decision**: the post-022 baseline at `src/tools/_register-baseline.json` MUST be rolled forward in the same commit that registers `move`, via `npm run baseline:write` (per [022-rename-typed-tools](../022-rename-typed-tools/spec.md) FR-018). The roll-forward adds a new entry `{ name: "move", descriptionFingerprint: "<sha256>", schemaFingerprint: "<sha256>" }` to the baseline's `tools` array; the existing entries for the other registered tools remain byte-identical (per SC-009 — `move` adds rather than perturbs).

**Rationale**: without the roll-forward, the durable registry-stability test at `src/tools/_register.test.ts` fails. The roll-forward IS the integration point that bridges the 022 stability machinery with the new typed surface; lifting it to a separate commit would leave one in two states either fails: pre-roll-forward (baseline missing `move` → test fails; tool present) OR post-roll-forward without the tool's registration code (baseline has `move` → test fails; live registry doesn't match). Same commit.

### R14 — Response-parsing locked at T0 (parity with 021-rename R8)

**Decision**: the CLI's verbatim success/failure wording for `move` is captured during T0 of `/speckit-implement` per FR-019 (NOT live during plan to keep this BI scope-honest; only the load-bearing argv shape + cheap-and-safe error wordings are verified at plan stage). The handler's `parseMoveResponse(stdout)` helper is locked against the T0 wording.

**Anticipated shapes** (per existing 011/012/021 precedent — capture at T0 to confirm):
- Single-line `Moved: <fromPath> → <toPath>` (most likely per CLI's consistent verb-led success wording across `create`/`delete`/`rename`).
- Two-line shape (one path per line).
- JSON-shaped response (unlikely; the existing typed tools have plain-text success responses).
- Empty stdout + exit 0 (matching the create/append precedent). If this shape is observed, the wrapper derives `fromPath` from the validated input + the `resolveTo` output and reports both deterministically.

The actual wording binds at T0; this BI's handler regex / parse rule is finalised at the T0 task.

## Plan-stage live-CLI findings

### F1 — `move` subcommand exists with `file=` / `path=` / `to=` argv shape

Probe: `obsidian help` (read-only).

Verbatim output excerpt:

```text
move                  Move or rename a file
  file=<name>         - File name
  path=<path>         - File path
  to=<path>           - Destination folder or path (required)
```

The subcommand description ("Move or rename a file") confirms the spec's framing: a single CLI subcommand handles both relocation and rename. The `to=` field's "(required)" annotation confirms the spec's FR-003 mandatory-`to` schema-side rule is consistent with the CLI's own contract. The user-facing schema field names (`file`, `path`, `to`) map to the CLI argv keys directly — no PSR-5-style rename needed (cf. 011-write-note's `file=` → `name=` mapping).

### F2 — Unknown vault response: `Vault not found.` + exit 0 (matches 011-R5 signature)

Probe: `obsidian vault=NoSuchVaultDoesNotExist move path=Nonexistent.md to=Archive/` (non-destructive — unknown vault refuses upfront).

Verbatim output:

```text
Vault not found.
exit code: 0
```

Byte-identical to the 011-write-note R5 signature (`Vault not found.\n`, exit 0). The cli-adapter's existing response-inspection clause classifies this as `CLI_REPORTED_ERROR` with `details.message: "Vault not found."` — no `move`-specific handling needed.

### F3 — Source-not-found response: `Error: File "<path>" not found.` + exit 0

Probe: `obsidian vault=TestVault-Obsidian-CLI-MCP move path=Sandbox/DefinitelyNotThere.md to=Sandbox/SomewhereElse.md` (non-destructive — source doesn't exist).

Verbatim output:

```text
Error: File "Sandbox/DefinitelyNotThere.md" not found.
exit code: 0
```

The `Error:` prefix (lowercase-`f`) is exactly what the dispatch-layer classifier catches per [003-cli-adapter](../003-cli-adapter/spec.md)'s four-priority chain: in-band `Error:` on stdout + exit 0 → `CLI_REPORTED_ERROR` with `details.message` carrying the verbatim line. The path-quoting (`"Sandbox/DefinitelyNotThere.md"`) is the CLI's idiomatic format. The handler's response-parsing logic per R14 captures this wording verbatim during T0 finalisation.

### F4 — Missing-`to=` error wording (structurally unreachable from wrapper)

Probe: `obsidian vault=TestVault-Obsidian-CLI-MCP move` (no required args).

Verbatim output:

```text
Error: Missing required parameter: to=<path>
Usage: move [file=<name>] [path=<path>] to=<path>
exit code: 0
```

This wording is **unreachable from the typed surface** because the schema's `to: z.string().min(1)` rejects empty/missing `to` at the zod parse boundary as `VALIDATION_ERROR` before any CLI call is made. F4 captures the wording defensively for the documentation appendix (FR-014) and for the case where someone bypasses the typed surface via `obsidian_exec move` directly.

### F5 — Path-traversal-shaped SOURCE locator: `Error: File "<path>" not found.` (CLI does NOT silently escape)

Probe: `obsidian vault=TestVault-Obsidian-CLI-MCP move path=../../etc/passwd to=Sandbox/x.md` (non-destructive — source doesn't exist; safe even if CLI did try to escape).

Verbatim output:

```text
Error: File "../../etc/passwd" not found.
exit code: 0
```

The CLI treats `..` segments as **literal path components**, not as a traversal escape. It resolves the source vault-relatively, fails to find a file named `../../etc/passwd` inside the vault, and reports source-not-found. **The SOURCE-traversal precondition for SC-012 is satisfied at plan stage**: the CLI does NOT silently move a vault-external file in via the `path=` source locator. `to=` traversal (case x of FR-019) still requires T0 verification because the source-not-found path short-circuits before `to=` validation (per F5b).

### F5b — Source-resolution short-circuits before `to=` validation

Probe: `obsidian vault=TestVault-Obsidian-CLI-MCP move path=Sandbox/DefinitelyNotThere.md to=../../escaped/x.md` (non-destructive — both source missing AND `to=` traversal-shaped).

Verbatim output:

```text
Error: File "Sandbox/DefinitelyNotThere.md" not found.
exit code: 0
```

The CLI evaluates the source first; on source-not-found it reports that error and never gets to `to=` validation. This means **the CLI's `to=` traversal-handling behaviour cannot be probed without a real (existing) source**, which is a destructive probe. Deferred to T0 case x with proper bait-file staging per `.memory/test-execution-instructions.md`.

## FR-019 deferred-T0 case roster

The following thirteen cases (matching FR-019's (i)–(xiii) enumeration) are deferred to T0 of `/speckit-implement` and will be bundled into a `T0xx` task at `/speckit-tasks` time. Five are partially or fully verified at plan stage (F1–F5b); eight are gated on real-vault probes against `TestVault-Obsidian-CLI-MCP\Sandbox\` per the destructive-probe protocol.

| FR-019 case | Status at plan | T0 verification needed |
|-------------|----------------|-------------------------|
| (i) successful specific + `path=` + folder-target | DEFERRED | Real move (seed source in Sandbox, move to Sandbox/<sub>/), capture success stdout wording for `parseMoveResponse` lock per R14, assert post-state on disk + .trash/ absence |
| (ii) successful specific + `path=` + full-path-target | DEFERRED | Real move-and-rename (seed source, move to Sandbox/Renamed.md), capture success wording, assert post-state |
| (iii) successful specific + `file=` (wikilink locator) | DEFERRED | Real move via `file=<basename>`, verify the CLI's source-resolution path produces the expected `fromPath` in the response |
| (iv) successful same-folder move (rename equivalence per Story 8) | DEFERRED | Real move where `dirname(toPath) === dirname(fromPath)`; assert CLI accepts and produces the rename-equivalent output |
| (v) source-not-found (non-existent `path=`) | **PARTIALLY VERIFIED (F3)** | T0 confirms the wording survives across CLI version drift; same wording binds the dispatch-layer classifier |
| (vi) destination-exists (collision) | DEFERRED | Real move where destination file exists; capture verbatim collision error wording for `parseMoveResponse` reject branch; assert source file is unmodified (no partial-state) |
| (vii) unknown vault display name | **VERIFIED (F2)** | None at T0 (F2 already byte-identical to 011-R5 signature) |
| (viii) successful active-mode move of focused note | DEFERRED | Real move with a focused note (host coordination); capture argv shape sent (no `vault=`/`file=`/`path=` tokens) and the canonical from/to paths in response |
| (ix) active-mode no-focused-note (verify capital-N `Error: No active file.` and confirm `CLI_REPORTED_ERROR` classifier mismatch per R9) | DEFERRED | Real probe with no focused note; assert verbatim capital-N wording AND classifier produces `CLI_REPORTED_ERROR` (not `ERR_NO_ACTIVE_FILE`); SC-014 load-bearing assertion |
| (x) path-traversal-shaped `to=` (security; SC-012 gating) | **SOURCE PARTIALLY VERIFIED (F5/F5b)** | T0 stages a bait file outside the vault root (per `.memory/test-execution-instructions.md`) and probes `to=../../bait/x.md` against an existing Sandbox source. If CLI silently escapes → spec amendment pre-ship per SC-012 |
| (xi) missing destination folder (`to: "NonExistentFolder/"`) | DEFERRED | Real move where `to=` folder doesn't exist; capture observable behaviour (auto-create vs fail); document in `docs/tools/move.md` per FR-014 |
| (xii) backslash-in-`to` (`to: "Archive\\Renamed.md"`) | DEFERRED | Real probe on Windows host (this BI's primary platform); capture CLI's behaviour (verbatim-character interpretation vs path-separator normalisation) |
| (xiii) confirms move-subcommand argv shape + locator argv-key + destination argv-key | **VERIFIED (F1)** | None at T0; F1's `obsidian help` capture is the ground truth |

**Plan-stage status**: 14 design decisions ratified (R1–R14). 5 live-CLI findings captured at plan stage (F1, F2, F3, F4, F5/F5b). 13 FR-019 cases enumerated, of which 4 are verified or partially verified at plan stage (F1 → xiii; F2 → vii; F3 → v; F5/F5b → x partial); 9 remain deferred to T0 of `/speckit-implement`. T0 bundling per the existing 021/029 precedent — a single `T001 [LIVE]` task that runs the destructive probes in sequence with seed → probe → assert → cleanup discipline.
