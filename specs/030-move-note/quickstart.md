# Quickstart — `move` Tool Verification Scenarios

**Branch**: `030-move-note` | **Date**: 2026-05-15 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This document maps the 28 acceptance scenarios across User Stories 1–8 (per SC-001) to verification commands (CI-runnable or manual T0). Verification scenarios Q-1..Q-N below mirror SC-001..SC-016 1:1; manual T0 scenarios M-1..M-N cover live-CLI characterisation gaps deferred from plan stage per FR-019.

## CI scenarios (vitest)

These run on every PR and merge. Each is a co-located test in `src/tools/move/{schema,handler,index}.test.ts`. The stub `spawnFn` is injected via `deps`; no real `obsidian` binary executions.

### Q-1 → SC-001: All 28 acceptance scenarios pass on first run

```bash
npm run test -- src/tools/move/
```

Asserts: 28 acceptance scenarios across User Stories 1–8 (per SC-001 count) all pass. The acceptance-scenario count totals: Story 1 (3) + Story 2 (4) + Story 3 (2) + Story 4 (7) + Story 5 (3) + Story 6 (4) + Story 7 (4) + Story 8 (1) = 28.

### Q-2 → SC-002: `tools/list` exposes `move` with stripped flat schema + help-aware description

```bash
npm run test -- src/tools/move/index.test.ts
```

Asserts: `createMoveTool()` returns a `RegisteredTool` whose:
- `descriptor.name === "move"`
- `descriptor.inputSchema` has zero `description` keys at any depth
- `descriptor.inputSchema` has top-level `additionalProperties: false`
- `descriptor.inputSchema` has all five properties (`target_mode`, `vault`, `file`, `path`, `to`) typed inline (no `oneOf`)
- `descriptor.description` is non-empty, contains `"help"` (case-insensitive), references `"move"` by name, AND surfaces the link-rewriting caveat

### Q-3 → SC-003: handler has zero `child_process.spawn` calls and zero `Error:`-regex matchers

```bash
grep -E 'child_process|spawn\(|/Error:/' src/tools/move/handler.ts
```

Expected output: empty. The handler routes through `invokeCli` only; the adapter owns `child_process.spawn` and `Error:`-prefix classification.

### Q-4 → SC-004: schema module has zero hand-written `interface` / `type` declarations

```bash
grep -E '^(interface|type) Move' src/tools/move/schema.ts
```

Expected output: empty. The only typed surface is `z.infer<typeof moveInputSchema>` and `z.infer<typeof moveOutputSchema>`.

### Q-5 → SC-005: schema module has zero `.describe()` calls

```bash
grep -E '\.describe\(' src/tools/move/schema.ts
```

Expected output: empty. Per FR-004, parameter documentation lives in `docs/tools/move.md`.

### Q-6 → SC-006: `help({ tool_name: "move" })` returns populated body with all required content

Asserted by `src/tools/move/index.test.ts` case (e): `docs/tools/move.md` does NOT contain a TODO/stub marker AND positively contains:
- All four propagated error codes (`VALIDATION_ERROR`, `CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`)
- The explicit note that active-mode no-focused-note surfaces as `CLI_REPORTED_ERROR` (not `ERR_NO_ACTIVE_FILE`) with the verbatim `Error: No active file.` wording AND the `[[BI-0027 - Audit Tool Descriptions]] dimension C.2` attribution
- All four required example shapes per FR-014 (folder-target; full-path-target with rename; destination-collision failure; auto-link-update caveat)
- The link-rewriting caveat
- The `to`-shape rules section with the trailing-`/` discriminator surprise-case worked examples per FR-014 enhanced post-Q2
- The `.md` append rule with source-`.md`-guard explanation per /speckit-clarify Q1
- The "ALWAYS include trailing `/` for folder-target" guidance prominently

### Q-7 → SC-007: handler module ≤ 70 LOC

```bash
wc -l src/tools/move/handler.ts
```

Expected: `≤ 70`. Slightly higher than `rename`'s ≤ 60 LOC ceiling because `move` has the two-branch `to`-shape transform (folder-target vs full-path-target) which is structurally richer than `rename`'s single-branch `.md` append.

### Q-8 → SC-008: aggregate statements coverage stays at-or-above floor

```bash
npm run test:coverage
```

Asserts: `vitest.config.ts` statements floor (currently 91.3%) stays met. The new ~57 cases provide near-100% coverage of the new module; the aggregate either stays flat or ratchets up.

### Q-9 → SC-009: existing typed tools unchanged

```bash
git diff main -- src/tools/delete/ src/tools/files/ src/tools/find_by_property/ src/tools/help/ src/tools/links/ src/tools/obsidian_exec/ src/tools/outline/ src/tools/properties/ src/tools/read/ src/tools/read_heading/ src/tools/read_property/ src/tools/rename/ src/tools/set_property/ src/tools/smart_connections_query/ src/tools/smart_connections_similar/ src/tools/tag/ src/tools/tree/ src/tools/write_note/
```

Expected: empty diff (no substantive changes to existing tools' source directories). The only acceptable diff is a registration-list reorder in `src/server.ts`. The post-022 baseline at `src/tools/_register-baseline.json` gains the `move` entry; existing tools' fingerprints remain byte-identical.

### Q-10 → SC-010: drift detector at `_register.test.ts` passes for `move`

```bash
npm run test -- src/tools/_register.test.ts
```

Asserts: the `it.each` registry walk covers `move`; the per-tool invariants from the drift detector's table apply (flat `additionalProperties: false` object with all five properties typed inline; no `oneOf` envelope).

### Q-11 → SC-013: `to`-shape transform invariant holds across handler tests

Asserted by `src/tools/move/handler.test.ts` cases (b)–(f2): the truth table from FR-003 evaluates deterministically. The load-bearing assertion is case (f2) — source-`.md` guard suppression on non-`.md` source — which prevents silent cross-type conversion regressions.

### Q-12 → SC-014: active-mode no-focused-note classifier behaviour holds

Asserted by `src/tools/move/handler.test.ts` case (l): when stub adapter throws `CLI_REPORTED_ERROR` with `details.message: "Error: No active file.\n"` (capital-N), handler propagates `CLI_REPORTED_ERROR` (NOT `ERR_NO_ACTIVE_FILE`). The inherited classifier mismatch is documented in the error roster (verified by Q-6) AND structurally enforced by this handler test.

### Q-13 → SC-009 (baseline check): post-022 baseline contains exactly one new `move` entry

```bash
npm run test -- src/tools/_register-baseline.test.ts
```

Asserts: the durable test consumes the regenerated baseline JSON (per R13 / FR-013a). The roll-forward landed in the same commit via `npm run baseline:write`.

### Q-14 → SC-002 (drift): `docs/tools/index.md` lists `move`

```bash
grep -E '^\s*[-*]\s*\[move\]' docs/tools/index.md
```

Expected: one matching line entry. Per FR-015.

### Q-15 → Story 1 AC#1: folder-target preserves source basename

Asserted by `handler.test.ts` case (a). Input: `{target_mode: "specific", vault: "MyVault", path: "Inbox/Tax-2026.md", to: "Archive/2026/"}`. Stub adapter returns success. Output: `{moved: true, fromPath: "Inbox/Tax-2026.md", toPath: "Archive/2026/Tax-2026.md"}`. Argv contains `to=Archive/2026/Tax-2026.md`.

### Q-16 → Story 1 AC#3: folder-target preserves internal-periods source basename

Asserted by `handler.test.ts` case (c). Input: `{path: "Drafts/Doc.v1.draft.md", to: "Archive/"}`. Output: `{toPath: "Archive/Doc.v1.draft.md"}`. The folder-target branch does NOT apply the `.md` append rule and does NOT re-derive the filename.

### Q-17 → Story 2 AC#1: full-path-target with explicit `.md` forwarded verbatim

Asserted by `handler.test.ts` case (d). Input: `{path: "Inbox/Tax-2026.md", to: "Archive/2026-Tax-Return.md"}`. Output: `{toPath: "Archive/2026-Tax-Return.md"}`.

### Q-18 → Story 2 AC#2: full-path-target `.md` append on `.md` source

Asserted by `handler.test.ts` case (e). Input: `{path: "Inbox/Tax-2026.md", to: "Archive/2026-Tax-Return"}`. Output: `{toPath: "Archive/2026-Tax-Return.md"}`.

### Q-19 → Story 2 AC#3: **source-`.md` guard suppression on non-`.md` source** (load-bearing per SC-013)

Asserted by `handler.test.ts` case (f2 = case 8 in numbered list). Input: `{path: "Boards/Plan.canvas", to: "Archive/Renamed"}`. Output: `{toPath: "Archive/Renamed"}` (verbatim — no `.md` appended).

### Q-20 → Story 4 ACs: schema layer rejects 7 malformed-input classes

Asserted by `schema.test.ts` cases 7–22 (per data-model.md test inventory).

### Q-21 → Story 6 ACs: CLI failures flow through `UpstreamError`

Asserted by `handler.test.ts` cases (i)–(m). All four propagated codes covered: `CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, and re-throw-non-`UpstreamError` propagation.

### Q-22 → Story 8 AC#1: same-folder move = rename equivalence

Asserted by `handler.test.ts` case (n / case 19). Stub returns `Inbox/Old.md → Inbox/New.md`; assertion: `dirname(fromPath) === dirname(toPath)`.

## Manual T0 scenarios (live-CLI probes)

These run during T0 of `/speckit-implement` against `TestVault-Obsidian-CLI-MCP` per `.memory/test-execution-instructions.md`. They are bundled into a single `T001 [LIVE]` task at /speckit-tasks time. Each requires real `obsidian` binary invocation; results capture verbatim CLI wording for the handler's `parseMoveResponse` regex lock (R14) and for the documentation appendix per FR-014.

### M-1 → FR-019 case (i): successful specific + `path=` + folder-target

1. Seed `Sandbox/Move-Src-<run-id>.md` with a known body (e.g., "# Move source — <timestamp>").
2. Run `obsidian vault=TestVault-Obsidian-CLI-MCP move path=Sandbox/Move-Src-<run-id>.md to=Sandbox/MovedTo/`.
3. Capture verbatim stdout (anticipated: `Moved: Sandbox/Move-Src-<run-id>.md → Sandbox/MovedTo/Move-Src-<run-id>.md` or similar).
4. Verify post-state: file present at `Sandbox/MovedTo/Move-Src-<run-id>.md`; absent at `Sandbox/Move-Src-<run-id>.md`; `.trash/` empty.
5. Lock `parseMoveResponse` regex against the captured stdout.
6. Clean up the moved file.

### M-2 → FR-019 case (ii): successful specific + `path=` + full-path-target

Same as M-1 but with `to=Sandbox/Renamed-<run-id>.md`. Verifies move-and-rename in one operation.

### M-3 → FR-019 case (iii): successful specific + `file=` (wikilink locator)

Same as M-1 but invoke with `file=Move-Src-<run-id>` (basename only). Verifies the CLI's source-resolution path produces the expected `fromPath` in the response (the wrapper's `parseMoveResponse` extracts the canonical resolved path).

### M-4 → FR-019 case (iv): successful same-folder move (rename equivalence per Story 8)

Move `Sandbox/Src-<run-id>.md` → `Sandbox/Renamed-<run-id>.md`. Both paths share `Sandbox/` as the parent. Verify `dirname(fromPath) === dirname(toPath)` holds in the response.

### M-5 → FR-019 case (v): source-not-found error wording (already partially verified at F3)

Run `obsidian vault=TestVault-Obsidian-CLI-MCP move path=Sandbox/DefinitelyMissing.md to=Sandbox/X.md`. T0 confirms the F3-captured wording survives across CLI version drift.

### M-6 → FR-019 case (vi): destination-exists collision

1. Seed `Sandbox/Src-<run-id>.md` AND `Sandbox/Collision-<run-id>.md`.
2. Run `obsidian vault=TestVault-Obsidian-CLI-MCP move path=Sandbox/Src-<run-id>.md to=Sandbox/Collision-<run-id>.md`.
3. Capture verbatim stderr / stdout. Assert: error wording identifies the collision; source `Sandbox/Src-<run-id>.md` is **unmodified** (no partial-state — exists at original location); destination `Sandbox/Collision-<run-id>.md` is unmodified.
4. Lock the destination-collision error wording into `parseMoveResponse`'s reject branch.
5. Clean up both files.

### M-7 → FR-019 case (vii): unknown vault (already verified at F2)

Re-confirm `Vault not found.` + exit 0 wording with a fresh `obsidian help`-vintage CLI. F2 baseline is current.

### M-8 → FR-019 case (viii): successful active-mode move of focused note

1. Open `Sandbox/Active-Src-<run-id>.md` in the focused vault.
2. Run `obsidian move to=Sandbox/Active-Moved/` (no vault=, file=, or path=).
3. Capture verbatim stdout. Verify post-state.
4. Confirm the wrapper's argv shape (no locator tokens, only `move to=...`).
5. Clean up the moved file.

### M-9 → FR-019 case (ix): active-mode no-focused-note (SC-014 load-bearing)

1. Ensure NO note is focused in the vault (close all open files, or run with the vault closed if the CLI tolerates that — depends on CLI's behaviour; capture in T0).
2. Run `obsidian move to=Sandbox/X.md`.
3. **Capture verbatim wording**. Anticipated: `Error: No active file.\n` (capital-N per the user-input attribution and TC-049 / TC-171 precedents).
4. Confirm the bridge's dispatch-layer classifier does NOT re-classify to `ERR_NO_ACTIVE_FILE` (lowercase-only matcher) — the call surfaces as `CLI_REPORTED_ERROR`.
5. **Update SC-014 documentation** if the capital-N wording is confirmed; if it diverges (lowercase observed), the spec is amended pre-ship to record the new wording AND switch the error roster from `CLI_REPORTED_ERROR` to `ERR_NO_ACTIVE_FILE`.

### M-10 → FR-019 case (x): path-traversal-shaped `to=` (SC-012 gate; **destructive — bait file required**)

Per `.memory/test-execution-instructions.md` path-traversal protocol:

1. **Stage a bait file** outside the vault: `C:\Marwan-Saab-ADO\Marwan at Metcash\Obsidian\bait\bait-<run-id>.txt` with trivial content.
2. Capture the bait's pre-state.
3. Seed `Sandbox/PT-Src-<run-id>.md` inside the vault.
4. Run `obsidian vault=TestVault-Obsidian-CLI-MCP move path=Sandbox/PT-Src-<run-id>.md to=../../bait/escaped-<run-id>.md`.
5. **Assertion**: the CLI rejects with a structured error AND `Sandbox/PT-Src-<run-id>.md` is unmodified AND the bait directory is unchanged. If CLI rejects → SC-012 PASS; spec ships without tool-layer reject. If CLI silently escapes (file appears at `bait/escaped-<run-id>.md`) → **SC-012 FAIL → spec amendment pre-ship to add validation-boundary reject; new schema test added**.
6. Clean up: source file removal; bait dir cleanup.

### M-11 → FR-019 case (xi): missing destination folder (`to: "NonExistentFolder/"`)

1. Seed `Sandbox/MD-Src-<run-id>.md`.
2. Run `obsidian vault=TestVault-Obsidian-CLI-MCP move path=Sandbox/MD-Src-<run-id>.md to=NonExistentFolder-<run-id>/`.
3. Capture verbatim output. Document observed behaviour: (a) folder auto-created by CLI, or (b) structured error.
4. Document the behaviour in `docs/tools/move.md` per FR-014.
5. Clean up the moved file AND the (possibly auto-created) destination folder.

### M-12 → FR-019 case (xii): backslash-in-`to` on Windows host

1. Seed `Sandbox/BS-Src-<run-id>.md`.
2. Run `obsidian vault=TestVault-Obsidian-CLI-MCP move path=Sandbox/BS-Src-<run-id>.md to=Sandbox\Backslash-Renamed-<run-id>.md` (Windows-style backslash separator).
3. Capture verbatim output AND the resulting file location.
4. Document observed behaviour: (a) backslash treated as path separator (file appears at `Sandbox/Backslash-Renamed-<run-id>.md`), or (b) backslash treated as literal character (file appears with literal backslash in name — likely an OS-level filename violation on Windows), or (c) structured error.
5. If silent vault-escape is observed → spec amendment pre-ship to add validation-boundary reject (same SC-012 pattern as M-10).
6. Document in `docs/tools/move.md`.
7. Clean up.

### M-13 → FR-019 case (xiii): subcommand argv shape (verified at F1)

Re-confirm `obsidian help` output for `move` is unchanged at T0. F1 baseline is current.

## Reporting protocol (per `.memory/test-execution-instructions.md`)

For each M-* scenario:
1. **Cases attempted**: list of M-IDs run.
2. **Cases passing**: list of M-IDs that matched spec expectations.
3. **Cases failing**: list of M-IDs that diverged from spec, with the **exact CLI stdout/stderr quoted verbatim** (no paraphrasing).
4. **Vault residue**: any files left in the vault that could not be auto-cleaned (should be empty; if not, name the residue + reason).
5. **Wording captures**: for cases that locked CLI wording (M-1 success shape, M-6 destination-collision, M-9 no-focused-note, M-11 missing-folder), the captured strings are added to `parseMoveResponse`'s regex / parse rule in `handler.ts` AND mirrored verbatim in `docs/tools/move.md`'s error roster per FR-014.

## Out-of-CI residues to clean up

- All `Sandbox/Move-Src-<run-id>.md`, `Sandbox/MovedTo/`, `Sandbox/Renamed-<run-id>.md`, `Sandbox/Src-<run-id>.md`, `Sandbox/Collision-<run-id>.md`, `Sandbox/Active-Src-<run-id>.md`, `Sandbox/Active-Moved/`, `Sandbox/PT-Src-<run-id>.md`, `Sandbox/MD-Src-<run-id>.md`, `Sandbox/BS-Src-<run-id>.md` — clean after each respective M-*.
- The bait file at `…\Obsidian\bait\` from M-10 — clean after M-10 unless the CLI escaped (in which case STOP and report per `.memory/test-execution-instructions.md` protocol).
- Auto-created `NonExistentFolder-<run-id>/` from M-11 if observable.

Leave `Sandbox/` empty after the full T0 sweep.
