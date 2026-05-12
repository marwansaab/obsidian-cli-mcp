# Phase 0 Research — Rename Note Typed MCP Tool

**Branch**: `021-rename-note` | **Date**: 2026-05-12 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This document captures the design decisions ratified at Phase 0 of `/speckit-plan` plus the one live-CLI finding (F1) verified at plan stage and the roster of FR-019 characterisation cases deferred to T0 of `/speckit-implement`.

## Design decisions

### R1 — Logger surface: thin handler, no per-call events

**Decision**: `rename_note`'s handler does NOT emit per-call `logger.callStart` / `logger.callEnd*` events at the tool layer. Observability flows through the cli-adapter's existing `dispatchTimeout` / `dispatchCap` / `dispatchKill` events end-to-end.

**Rationale**: matches the actual implementation of every typed tool from 011-write-note onward (per the 011-write-note PSR-1 / R1 reconciliation). The earlier specs (006-read-note's FR-014 etc.) named per-call logger events as a Phase-0 expectation; in practice every sibling implementation collapsed those to the cli-adapter layer because the handler is too thin to add meaningful per-call observability above what the adapter already emits.

**Alternatives considered**:
- Add `logger.renameStart` / `logger.renameSuccess` / `logger.renameFailure` events at the tool layer. Rejected: introduces new logger event types for no observable benefit; the adapter's `dispatchTimeout` / `dispatchCap` / `dispatchKill` cover the load-bearing observability cases.
- Emit a single `logger.toolCallCompleted` event at the registerTool wrapper layer. Rejected: out of scope for this BI (would be an infrastructure change touching every tool, not a rename_note-specific change).

`RegisterDeps` still accepts `logger: Logger` for forwarding to the adapter / queue layer per the existing convention; `src/server.ts` passes the same logger instance to all tool registrations.

### R2 — CLI subcommand selection: `rename` (native)

**Decision**: `rename_note` wraps the Obsidian CLI's native `rename` subcommand. NOT `eval`, NOT `obsidian_exec`.

**Rationale**: **Verified live at plan stage via `obsidian help` output (F1)**. The Obsidian CLI exposes `rename` as a first-class subcommand with the argv shape:

```text
rename                Rename a file
  file=<name>         - File name
  path=<path>         - File path
  name=<name>         - New file name (required)
```

This is the exact shape the spec assumes, with parameter names matching the user-facing schema field names. The user-facing `name` field maps to the CLI argv `name=` token directly (no PSR-5-style locator argv-key rename per 011-write-note).

The neighbouring `move` subcommand (parameters `file=` / `path=` / `to=<dest>`) exists alongside `rename` — confirming the spec's scoping assumption that rename (in-place name change) and move (folder-relocation) are structurally separate operations the CLI splits along the same axis the typed-tool layer scopes against. The future `move_note` tool referenced in the spec's Out of Scope section maps to `move`.

**Alternatives considered**:
- `eval` subcommand (parity with 014/015's eval-composition pattern). Rejected: `rename` exists as a native subcommand; using `eval` would add a load-bearing JS template + base64 anti-injection layer for no functional gain, and would conflict with the "thin wrapper" handler-thinness ceiling per R1.
- `obsidian_exec` (delegate to the freeform escape hatch). Rejected: the entire point of a typed wrap is to retire the freeform escape hatch for renames; the typed surface inherits per-mode validation, structured errors, the link-rewriting docs caveat, and the extension-handling rule that `obsidian_exec` cannot provide.

### R3 — Per-mode call architecture: ONE invokeCli call per request

**Decision**: Every `rename_note` request fires exactly ONE `invokeCli` call to the cli-adapter, regardless of `target_mode` or input locator shape. No two-call branches (no pre-resolve-then-rename, no two-phase commit).

**Argv mapping**:
- **Specific + path**: `vault=<v> rename path=<p> name=<n_appended>` (where `n_appended = appendMdIfMissing(name)` per R6).
- **Specific + file**: `vault=<v> rename file=<f> name=<n_appended>`.
- **Active**: `rename name=<n_appended>` (no `vault=`, no `file=`, no `path=`).

The CLI's "most commands default to the active file when file/path is omitted" rule (per `obsidian help`'s top-level notes) covers the active-mode case without any handler-side logic — the handler simply omits the locator parameters and the CLI applies the active-file default.

**Rationale**: parity with the existing typed tools (011/012/013/015/018/019 all fire single-spawn requests). Two-call architectures introduce TOCTOU surface area and complicate the queue's serialization invariant.

### R4 — Target-mode mapping: STANDARD

**Decision**: `rename_note`'s schema reuses `applyTargetModeRefinement` + `targetModeBaseSchema` from [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) verbatim — the same primitive that 011/012/013/015/018 use. NO folder-scoped variant (`applyTargetModeRefinementForFolderScoped` from 019 is for folder-scoped tools; `rename_note` is file-scoped).

**Rationale**: `rename_note` is a file-scoped operation (operates on a single named file or the focused file), so it inherits the standard target-mode primitive's contract end-to-end: `vault` required in specific, exactly-one-of `file`/`path` in specific, `vault`/`file`/`path` forbidden in active, `additionalProperties: false` strict-mode. No tool-specific superRefine clauses are added beyond what the `name` field's own `.min(1)` + `.regex(/^[^/\\]+$/)` clauses provide (per R7).

**Alternatives considered**:
- Add an active-mode-specific superRefine clause restricting `name` in active mode. Rejected: `name` has identical semantics in both modes; mode-specific narrowing would be inventing rules without justification.
- Use a discriminated union of two zod schemas (one per mode). Rejected: per the 010-flatten-target-mode encoding decision, flat schemas with superRefine are the project's canonical shape.

### R5 — Unknown-vault response inspection: inherited from cli-adapter (011-R5)

**Decision**: `rename_note` does NOT add any unknown-vault handling. The cli-adapter's 011-R5 response-inspection clause (added during 011-write-note's plan stage) re-classifies the CLI's `Vault not found.` response to `CLI_REPORTED_ERROR` with the verbatim message preserved in `details.message`. `rename_note` inherits this verbatim.

**Rationale**: the unknown-vault edge case is identical across every typed write surface that takes a `vault=` argv token. T0 of /speckit-implement verifies the `rename` subcommand's unknown-vault response signature matches the create / delete subcommands' signature; if it does NOT match (unlikely but possible), the adapter's response-inspection logic is extended in a follow-up change to the adapter — NOT to `rename_note`. This preserves the rule that error classification lives at one layer (the adapter), not duplicated across tools.

### R6 — Extension-handling rule: literal `endsWith(".md")` byte equality (per /speckit-clarify Q1, locked 2026-05-12)

**Decision**: file-local helper in `handler.ts`:

```typescript
function appendMdIfMissing(name: string): string {
  return name.endsWith(".md") ? name : name + ".md";
}
```

The forwarded `name=` argv-token value is `appendMdIfMissing(parsed.name)`. Literal byte-equality, case-sensitive — mirrors the 020-fix-write-gaps R2 lock exactly.

**Worked examples** (locked at /speckit-clarify Q1, session 2026-05-12):

| Input `name` | Forwarded argv-token value | Why |
|--------------|-----------------------------|-----|
| `"Fixed"` | `"Fixed.md"` | No `.md` suffix → append |
| `"Fixed.md"` | `"Fixed.md"` | Verbatim (already `.md`) |
| `"Doc.v1.draft"` | `"Doc.v1.draft.md"` | `.draft` ≠ `.md`; internal periods preserved |
| `"Renamed.MD"` | `"Renamed.MD.md"` | Case-sensitive: `.MD` ≠ `.md` → append |
| `"Sketch.canvas"` | `"Sketch.canvas.md"` | `.canvas` ≠ `.md`; cross-extension renames out of scope per /speckit-clarify Q1 scope narrowing |
| `"image.png"` | `"image.png.md"` | Same as above — non-`.md` filename targets are out of scope; route through `obsidian_exec` |
| `"日記"` | `"日記.md"` | UTF-8 bytes forwarded verbatim plus `.md` |

**Rationale**: the user's /speckit-clarify Q1 answer (session 2026-05-12) explicitly chose this approach over the broader allowlist alternative, citing the 020-R2 precedent. A broader allowlist (`.md`, `.canvas`, `.pdf`, image types) would have invented a vault-filetype taxonomy absent from any ADR. Source-introspection (preserve the source's actual extension) would have forced per-call CLI lookups for `file=` and active modes — inconsistent with the wrapper-side determinism that 020 locked.

**Scope narrowing implication**: cross-extension renames and non-`.md` filename targets route through `obsidian_exec rename file=… name=…` directly. This is documented in the spec's Out of Scope section and in `docs/tools/rename_note.md`'s Scope section.

### R7 — Folder-separator rejection: schema layer, regex on `name` (per /speckit-clarify Q2, locked 2026-05-12)

**Decision**: `name: z.string().min(1).regex(/^[^/\\]+$/)`. The handler never sees `name` values containing `/` or `\` — those fail at the zod parse boundary with `VALIDATION_ERROR` whose `details.issues[].path` includes `"name"` and whose message names the rule with the `move_note` recovery hint.

**Implementation note**: the regex `/^[^/\\]+$/` matches "one or more characters, none of which is `/` or `\`". The `.min(1)` is redundant when the regex is present (the regex requires at least one character), but is included for clarity in the schema source and because zod's `too_small` error code (from `.min(1)`) produces a more actionable error message for the empty-string case than the regex's `invalid_string` code does.

**Alternative phrasing**: a `.refine()` or `.superRefine()` with a custom error message naming the `move_note` recovery hint may be preferable to the bare `.regex(...)` in the final implementation. The structural contract (reject `/` or `\` in `name`) binds; the API call shape (regex vs refine) is a /speckit-tasks decision.

**Rationale**: the user's /speckit-clarify Q2 answer (session 2026-05-12) chose validation-layer reject over CLI-forwarded. Forwarding to the CLI would produce platform-dependent behaviour (POSIX errors with "invalid filename"; Windows might interpret `\` as a folder separator and partially-move into a subfolder, conflating with the future `move_note` surface). Validation-layer reject preserves the in-place-rename scope cleanly and produces an actionable error message at the boundary.

### R8 — Response parsing locked at T0

**Decision**: the CLI's `rename` response wording for both successful renames and failure modes is captured during T0 of `/speckit-implement` per FR-019. The handler's `parseRenameResponse(stdout)` helper is locked against the captured wording.

**Anticipated shapes** (to be verified at T0):
- Single-line success: `Renamed: <fromPath> → <toPath>` or `Renamed: <fromPath> to <toPath>` (parity with 012-delete-note's `Moved to trash: <path>` shape).
- Two-line success: separate lines for source and destination paths.
- Single-line failure: `Error: <message>` on stdout (per the cli-adapter's classification rule for `Error:` prefix → `CLI_REPORTED_ERROR`).

**Parser shape**: a single regex against the trimmed stdout. The regex's capture groups extract `fromPath` and `toPath`; failure to match raises `CLI_REPORTED_ERROR` with `stdout` in `details` (parity with 012-delete-note's `RESPONSE_RE` pattern).

**Rationale**: capturing the verbatim wording live at T0 keeps the handler's response-parsing logic locked against ground truth, so future CLI version drift produces test failures rather than silent regressions. Plan stage deliberately defers this capture to keep the BI scope-honest; only the load-bearing argv shape (the input contract) needs to be verified live at plan stage (which F1 already covers).

### R9 — Single-spawn invariant: ONE invokeCli call per request

**Decision**: every `rename_note` request fires exactly ONE `invokeCli` call. Handler tests assert `spawnFn.callCount === 1` per request.

**Rationale**: matches the 011/012/013/015/019 precedent. Composes cleanly with the existing single-in-flight CLI queue (which serializes calls across all CLI-invoking tools per FR-008). Two-call architectures would introduce TOCTOU between the calls and complicate the queue's serialization invariant.

### R10 — `move_note` is a future BI, NOT a precondition for `rename_note`

**Decision**: the spec references `move_note` (e.g., in the folder-separator-rejection rule's error-message recovery hint) as a future BI but does NOT require it to exist before `rename_note` ships.

**Rationale**: F1 confirmed the CLI exposes both `rename` and `move` as first-class subcommands, so the future `move_note` tool wraps `move` analogously. `rename_note` is shippable independently. The error-message recovery hint ("use move_note to relocate") is forward-looking — until `move_note` ships, callers who hit the folder-separator-rejection error route through `obsidian_exec move file=… to=…` directly.

**Concretely**: `docs/tools/rename_note.md` documents the `obsidian_exec move` fallback explicitly for the interim, and adds a note that a future `move_note` tool will replace that fallback when it ships.

## Plan-stage live-CLI findings

### F1 — `rename` subcommand argv shape (verified 2026-05-12)

**Source**: `obsidian help` output captured at plan stage (host: `C:\Program Files\Obsidian\obsidian.exe`).

**Verbatim help output**:

```text
  rename                Rename a file
    file=<name>         - File name
    path=<path>         - File path
    name=<name>         - New file name (required)
```

**Findings**:
- The `rename` subcommand exists as a first-class native command.
- Accepts three documented parameters: `file=` (wikilink-form source), `path=` (vault-relative-path source), `name=` (new file name; **REQUIRED**).
- No documented flags (no `--force`, `--no-update-links`, `--newtab`, etc. — the link-update behaviour is the vault's responsibility per the spec's [P1] AC #13).
- `vault=` is a top-level option per the global options section of `obsidian help`, available to every subcommand including `rename`.
- The neighbouring `move` subcommand exists with `file=` / `path=` / `to=<dest>` parameters — confirming the spec's scoping assumption that rename and move are structurally separate operations at the CLI layer. `move_note` (future BI) wraps `move`.

**Implications for the handler**:
- The user-facing schema fields (`file`, `path`, `name`) map directly to CLI argv token keys (`file=`, `path=`, `name=`). NO PSR-5-style locator argv-key rename is needed (unlike 011-write-note where `file` → `name` in the argv).
- The handler's argv assembly is straightforward: hoist `vault` to the top-level adapter-call field, place `file`/`path`/`name` in the `parameters` record.

## FR-019 deferred T0 case roster

The following **twelve** FR-019 cases (eleven gating + one adversarial-documentation per /speckit-analyze U2 remediation 2026-05-12) are DEFERRED from plan stage to T0 of `/speckit-implement`. All twelve are bundled into T005 of [tasks.md](./tasks.md) — the T0 live-CLI probe pass. The plan-stage findings (F1 above) cover only what's verifiable from `obsidian help` output without seeding fixtures in the authorised TestVault per `.memory/test-execution-instructions.md`.

| FR-019 case | Description | T0 verification target |
|-------------|-------------|------------------------|
| (i) | Successful specific-mode rename via `path=` with extension preservation | Verbatim CLI response wording for success; lock `parseRenameResponse` regex |
| (ii) | Successful specific-mode rename via `file=` (wikilink locator) | Same as (i); confirm canonical fromPath/toPath echo matches |
| (iii) | Successful specific-mode rename with `.md` already in `name` (verbatim-forwarding case) | Same as (i); confirm no double-`.md` in the CLI's response |
| (iv) | Same-name rename (no-op case per Story 9) | Confirm one of: accept-with-success / reject-with-error / silent-noop |
| (v) | Rename against non-existent source path | Verbatim error wording; confirm cli-adapter classifies as `CLI_NON_ZERO_EXIT` or `CLI_REPORTED_ERROR` |
| (vi) | Rename where destination already exists in same folder | Verbatim error wording; confirm structural-error classification |
| (vii) | Unknown vault display name | Confirm 011-R5 signature match (`Vault not found.` verbatim) — if differs, follow-up adapter change |
| (viii) | Successful active-mode rename of focused note | Verbatim response wording; confirm focused-file path echo |
| (ix) | Path-traversal-shaped `path` (`../../etc/passwd`) | **SC-012 gate**: confirm CLI rejects; if NOT, this BI is amended pre-ship to add a tool-layer reject (see "## SC-012 amendment-shape sketch" below for the concrete amendment if the gate fires) |
| (x) | Case-only rename on Windows NTFS-default (`Note.md` → `note.md`) | Capture observed behaviour for docs/tools/rename_note.md |
| (xi) | CLI's actual response wording for fromPath/toPath extraction | Lock `parseRenameResponse(stdout)` regex against verbatim wording |
| (xii) | External editor open during rename (Obsidian tab keeps file handle live) | Capture observed behaviour: rename succeeds (buffer reopens or stales) vs fails (EBUSY-style). Documentation-only — no unit test (Obsidian file-handle behaviour not simulatable at unit-test layer) |

**T0 protocol**: per `.memory/test-execution-instructions.md`, all T0 probes run against `TestVault-Obsidian-CLI-MCP` with fixtures seeded under `Sandbox/`. Pre-state captured via `Get-ChildItem`; post-state verified; residue cleaned. Verbatim CLI stdout/stderr captured into research.md as a Phase-1.5 amendment block before /speckit-implement marks T0 complete.

### SC-012 amendment-shape sketch (if M-9 fires)

If T005's M-9 probe finds the CLI accepts `path: "../../bait/sensitive.md"` and operates on a file outside the vault root (instead of refusing with a structured error), this BI lands the following amendment **before T024 (lint pass)** clears:

**Schema patch** ([src/tools/rename_note/schema.ts](../../src/tools/rename_note/schema.ts)): the `path` field's existing `safePathField` validator (inherited from the target-mode primitive's optional `string` shape) is tightened with a `.refine()` clause that rejects any value where `path.split(/[\\/]/)` contains a `".."` segment. Sketch:

```typescript
// CONDITIONAL: added only if T005-M9 captures CLI-accepts-traversal behaviour
path: z.string().refine(
  (p) => !p.split(/[\\/]/).includes(".."),
  "path must not contain a '..' segment; rename_note does not allow escaping the vault root",
).optional(),
```

The clause runs at the schema layer (before `applyTargetModeRefinement`); the regex check is byte-equality against the `..` token, not a path-resolve walk (which would couple to the OS-specific path-resolution semantics — out of scope per Constitution III's "boundary validation").

**Schema test patch** ([src/tools/rename_note/schema.test.ts](../../src/tools/rename_note/schema.test.ts)): add 2 NEW test cases to T004:
- `path: "../../etc/passwd.md"` → `VALIDATION_ERROR` with `["path"]` and the new refine message
- `path: "Folder/../../escape.md"` (mid-path traversal) → `VALIDATION_ERROR` (gates the regex covers internal-segment traversal too)

**No handler.ts change** — the schema reject prevents the handler from ever seeing a traversal-shaped path. The `name` field is unaffected (its existing folder-separator-rejection regex already prevents `name: "../X"` etc.).

**Spec amendment** ([spec.md](./spec.md)): the SC-012 entry is amended to record which branch fired ("CLI rejects" → BI ships without tool-layer reject, OR "CLI accepts; tool-layer reject added" → records the schema patch above with a citation to research.md's T0 capture block). The amendment lands as a spec edit before the merge gate clears, with a one-line entry added to spec.md's `## Clarifications` section (`### Session 2026-05-12` block) documenting the M-9 finding and the chosen branch.

**No new error codes**, no new ADRs. The amendment is additive on the schema layer only; existing behaviour (specific-mode rename of a non-traversal path) is unchanged.

**Decision authority**: this sketch is pre-locked at plan stage. /speckit-implement does NOT need to re-litigate the amendment shape at T005-M9 time; if M-9 fires, the sketch above is the contract. If M-9's findings diverge from the sketch (e.g., the CLI rejects some `..` shapes but not others), the divergence is escalated to a fresh /speckit-clarify session BEFORE the amendment lands.

**Bundled task expectation**: /speckit-tasks generates **T001-T0xx live-CLI characterisation pass** as the first task block of /speckit-implement, with one sub-task per case (i)–(xi). Subsequent implementation tasks (T010+) are gated on T0 completion.

## T0 Live-CLI Capture (2026-05-12)

T0 probe pass executed during `/speckit-implement` T005 against
`TestVault-Obsidian-CLI-MCP` Sandbox/ on Windows 11 host (CLI:
`C:\Program Files\Obsidian\obsidian.exe`). Probes M-1, M-2, M-3, M-4,
M-5, M-6, M-7, M-9, M-10 captured; M-8 (active-mode) and M-12
(external-editor open) deferred — both require interactive Obsidian
focus state which cannot be safely set up programmatically. See
"## T0 deferred probes" below.

### F2 — Specific-mode rename success response wording (M-1)

Verbatim stdout: `Renamed: Sandbox/T0-rename-001-source-<ts>.md -> Sandbox/T0-rename-001-renamed-<ts>.md\n`

ASCII arrow `->` (NOT Unicode `→`). Bare paths (not quoted). Single
trailing newline. Exit code 0. The fromPath is the source's canonical
vault-relative path; the toPath is the new canonical destination path.

### F3 — Wikilink locator resolves to canonical path (M-2)

Verbatim stdout: `Renamed: Sandbox/T0-rename-002-source-<ts>.md -> Sandbox/T0-rename-002-renamed-<ts>.md\n`

Identical response shape to F2; `file=` is resolved by the CLI to the
canonical path before emission. The handler's `parseRenameResponse`
regex applies unchanged across both locator forms.

### F4 — `.md` already in name forwarded verbatim (M-3)

Verbatim stdout: `Renamed: Sandbox/T0-rename-003-source-<ts>.md -> Sandbox/T0-rename-003-renamed-<ts>.md\n`

CLI did NOT double-append `.md`. The wrapper's `appendMdIfMissing` is
load-bearing for the BARE-name case; the verbatim-`.md` case passes
through with no transformation.

### F5 — Same-name no-op = accept-with-success (M-4)

Verbatim stdout: `Renamed: Sandbox/T0-rename-004-<ts>.md -> Sandbox/T0-rename-004-<ts>.md\n`

CLI accepts same-name renames with success; fromPath === toPath in
the response. The wrapper propagates the success envelope with
`{ renamed: true, fromPath, toPath }` where the two path fields are
byte-equal — Story 9's audit-trail invariant lands.

### F6 — Source-not-found wording + classification (M-5)

Verbatim stdout: `Error: File "Sandbox/T0-DOES-NOT-EXIST.md" not found.\n`

Exit 0. The adapter's four-priority classification (Error: prefix on
stdout) re-classifies as `CLI_REPORTED_ERROR` with the verbatim
message in `details.message`.

### F7 — Destination-collision wording + classification (M-6)

Verbatim stdout: `Error: Destination file already exists!\n`

Exit 0. Adapter classifies as `CLI_REPORTED_ERROR`. Source file is
untouched (post-state confirmed: both A and B files present after the
probe).

### F8 — Unknown vault matches 011-R5 signature (M-7)

Verbatim stdout: `Vault not found.\n`

Exit 0. Byte-identical to the 011-R5 signature; the cli-adapter's
existing unknown-vault response-inspection clause re-classifies
without modification. No follow-up adapter change needed.

### F10 — Path-traversal CLI behaviour + SC-012 status (M-9)

Verbatim stdout: `Error: File "../../bait/sensitive.md" not found.\n`

Exit 0. The bait file at the sibling-of-vault path was untouched
post-probe. **SC-012 PASSES** — the CLI's relative-path resolution is
clearly scoped to the vault root and refuses to escape. No tool-layer
amendment needed; the BI ships without the SC-012 schema patch. The
SC-012 amendment-shape sketch above is documented for future
reference but not applied.

### F11 — Case-only rename observed behaviour (M-10)

Verbatim stdout: `Renamed: Sandbox/T0-Rename-010-<ts>.md -> Sandbox/t0-rename-010-<ts>.md\n`

Exit 0. Post-state shows the file is now lowercase. On Windows NTFS,
the case-only rename succeeded — the CLI emits the differing-by-case
from/to in the response. The wrapper propagates the response
verbatim; callers see the case change through the structured
`fromPath` / `toPath` fields.

### F12 — Response-parser regex pattern lock

`RESPONSE_RE = /^Renamed: (.+?) -> (.+?)\s*$/m`

Locked at handler.ts. Single-line success shape; the trailing `\s*$`
tolerates the observed trailing newline. The `m` flag makes `^` and
`$` match line boundaries inside the trimmed stdout (defence against
future CLI changes that prepend banner lines).

### F13 — External editor open during rename (M-12, deferred)

Deferred — requires interactive Obsidian state with a specific note
focused in a buffer. Documented as out-of-scope for the unit-test
layer; the documentation-only paragraph in
`docs/tools/rename_note.md`'s adversarial-edge-cases section names the
case without a captured observation.

## T0 deferred probes

- **M-8** (active-mode focused-note rename): deferred. Probing active
  mode would rename whichever note is currently focused across ALL
  Obsidian windows, which is destructive against the user's
  in-progress work. The handler's active-mode argv shape is
  structurally identical to the specific-mode shape minus the
  vault/file/path tokens; the active-mode contract is exercised at
  the unit-test layer via stubbed `spawnFn` (T011) and end-to-end
  manually by the user against a focused note when the BI ships.
- **M-12** (external-editor open during rename): deferred — see F13
  above.

Both deferred probes are documentation-only — they do not lock any
load-bearing handler logic that the unit tests cover. The
`parseRenameResponse` regex pattern (F12) is locked from M-1's
capture which already exercises the response-parsing code path; M-8
would emit the same response shape with a different focused-file
path.

## Phase 0 amendments to spec.md (per R12 — NOT applied retroactively)

**NONE.** The two /speckit-clarify decisions (Q1 extension-handling rule, Q2 folder-separator-rejection rule) were locked at spec-stage session 2026-05-12 and are already integrated in spec.md. Research phase ratifies the chosen approach without additional Phase-0 amendments.

If T0 of /speckit-implement surfaces a CLI behaviour that conflicts with one of the spec's load-bearing assumptions (e.g., the `rename` subcommand silently accepts `../`-shaped paths, triggering SC-012's amendment clause), that amendment lands as a separate /speckit-clarify session or a documented pre-ship spec patch.

## Quality-gate status

All five Constitution principles re-evaluated in the plan's post-design check. All pass. Coverage threshold (91.3% statements floor at [vitest.config.ts:20](../../vitest.config.ts#L20)) inherited; the new ~52 co-located test cases plus the registry walks keep the aggregate at-or-above the floor.

Ready for Phase 1.
