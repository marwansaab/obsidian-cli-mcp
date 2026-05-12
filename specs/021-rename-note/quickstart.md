# Quickstart — Rename Note Verification Scenarios

**Branch**: `021-rename-note` | **Date**: 2026-05-12 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This document maps each Success Criterion (SC-001..SC-016) from the spec to a verification scenario. Most scenarios are vitest-based and run via `npm run test`; some are manual probes against the authorised TestVault (`TestVault-Obsidian-CLI-MCP`) per `.memory/test-execution-instructions.md`. The T0 / live-CLI scenarios run at the start of `/speckit-implement` to lock the response-parsing wording and verify the FR-019 deferred case roster.

## Vitest scenarios (S-1..S-N)

All scenarios assume the standard project test environment: vitest run with `@vitest/coverage-v8`, co-located `*.test.ts` files, and the stub `spawnFn` injection pattern.

### S-1 — Specific-mode rename via path locator (Story 1 / SC-001 / SC-013)

**Setup**: stub `spawnFn` returns success stdout matching the T0-locked `RESPONSE_RE` (e.g., `"Renamed: Inbox/Typo.md → Inbox/Fixed.md\n"`).

**Action**: invoke `executeRenameNote({ target_mode: "specific", vault: "MyVault", path: "Inbox/Typo.md", name: "Fixed" }, deps)`.

**Expectations**:
- `spawnFn` called exactly once.
- Argv contains `vault=MyVault`, `rename`, `path=Inbox/Typo.md`, `name=Fixed.md` (in some order per the adapter's argv-assembly contract).
- Argv does NOT contain `file=...`.
- Return value: `{ renamed: true, fromPath: "Inbox/Typo.md", toPath: "Inbox/Fixed.md" }`.

**Maps to**: SC-001 (acceptance scenario coverage), SC-013 (extension-handling rule).

### S-2 — `.md` suffix forwarded verbatim (Story 1 AC#2 / SC-013)

**Setup**: same.

**Action**: invoke with `name: "Fixed.md"` instead of `"Fixed"`.

**Expectations**: argv `name` token is exactly `"Fixed.md"` (no double-append). Return value unchanged.

### S-3 — Case-sensitive allowlist match (Story 3 AC#2 / SC-013)

**Setup**: same.

**Action**: invoke with `name: "Renamed.MD"`.

**Expectations**: argv `name` token is exactly `"Renamed.MD.md"` (case-sensitive `.MD` ≠ `.md` → append). Return value reflects the CLI's response for the appended-name target.

### S-4 — Internal periods preservation (Story 3 AC#1 / SC-013)

**Setup**: same.

**Action**: invoke with `name: "Doc.v1.draft"`.

**Expectations**: argv `name` token is exactly `"Doc.v1.draft.md"`. Internal periods preserved; `.draft` is NOT treated as an extension.

### S-5 — Cross-extension scope-narrowing (Story 3 AC#3 / SC-013)

**Setup**: same.

**Action**: invoke with `name: "Sketch.canvas"` against a `.md` source.

**Expectations**: argv `name` token is exactly `"Sketch.canvas.md"`. The `.canvas` is NOT in the allowlist; cross-extension renames are out of scope per /speckit-clarify Q1.

### S-6 — Specific-mode rename via file locator (Story 2 / SC-001)

**Setup**: stub `spawnFn` returns success stdout naming the CLI-canonical resolved paths.

**Action**: invoke with `file: "QuickNote"` instead of `path`.

**Expectations**: argv contains `file=QuickNote`, `name=Quick Note.md`; does NOT contain `path=...`. Return value reflects the CLI-resolved canonical paths.

### S-7 — Active-mode rename (Story 5 / SC-001)

**Setup**: stub `spawnFn` returns success stdout for an active-file rename.

**Action**: invoke `executeRenameNote({ target_mode: "active", name: "Today" }, deps)`.

**Expectations**:
- Argv does NOT contain `vault=`, `file=`, or `path=` tokens.
- Argv contains `rename`, `name=Today.md`.
- Return value: `{ renamed: true, fromPath: "<focused>", toPath: "<focused folder>/Today.md" }`.

### S-8 — UTF-8 multi-byte forwarding (Story 2 AC#2)

**Action**: invoke with `file: "笔记"`, `name: "日記"`.

**Expectations**: argv tokens contain exact byte sequences `笔记` and `日記.md`. No transcoding, no normalisation.

### S-9 — Schema rejection: no locator in specific mode (Story 6 AC#1 / SC-001)

**Action**: invoke the registered handler (via `registerTool` round-trip) with `{ target_mode: "specific", vault: "V", name: "X" }`.

**Expectations**: response is `{ isError: true, content: [{ type: "text", text: "..." }] }` with the structured `VALIDATION_ERROR` payload; `details.issues` includes the "exactly one of" message. The stub `spawnFn` is asserted NEVER called.

### S-10 — Schema rejection: both locators (Story 6 AC#2)

**Action**: `{ target_mode: "specific", vault: "V", file: "F", path: "F.md", name: "X" }`.

**Expectations**: `VALIDATION_ERROR`; both `["file"]` and `["path"]` in `details.issues[].path`. Spawn never called.

### S-11 — Schema rejection: vault missing (Story 6 AC#3)

**Action**: `{ target_mode: "specific", path: "P.md", name: "X" }`.

**Expectations**: `VALIDATION_ERROR`; `["vault"]` in `details.issues[].path`. Spawn never called.

### S-12 — Schema rejection: forbidden key in active mode (Story 6 AC#4)

**Action**: `{ target_mode: "active", vault: "V", name: "X" }` (and separately `file: "F"`, `path: "P.md"`).

**Expectations**: `VALIDATION_ERROR` for each forbidden-key case; the appropriate field-path in `details.issues[].path`.

### S-13 — Schema rejection: unknown top-level key (Story 6 AC#5)

**Action**: `{ target_mode: "specific", vault: "V", path: "P.md", name: "X", pancakes: "yes" }`.

**Expectations**: `VALIDATION_ERROR`; `code: "unrecognized_keys"` in the issue; `pancakes` named in the message.

### S-14 — Schema rejection: empty name (Story 6 AC#6 / SC-014)

**Action**: `{ target_mode: "specific", vault: "V", path: "P.md", name: "" }`.

**Expectations**: `VALIDATION_ERROR`; `code: "too_small"` (zod's standard `.min(1)` shape); `["name"]` in `details.issues[].path`.

### S-15 — Schema rejection: name absent (Story 6 AC#7a)

**Action**: `{ target_mode: "specific", vault: "V", path: "P.md" }`.

**Expectations**: `VALIDATION_ERROR`; `code: "invalid_type"`; `["name"]` in path.

### S-16 — Schema rejection: name non-string (Story 6 AC#7b)

**Action**: `{ target_mode: "specific", vault: "V", path: "P.md", name: 42 }`.

**Expectations**: `VALIDATION_ERROR`; `code: "invalid_type"`; `["name"]` in path; message names "Expected string, received number".

### S-17 — Schema rejection: name with forward slash (Story 6 AC#8 / SC-014)

**Action**: `{ target_mode: "specific", vault: "V", path: "P.md", name: "Sub/X" }`.

**Expectations**: `VALIDATION_ERROR`; `["name"]` in path; message contains the rule (`"name must not contain folder separators"`) and the `move_note` recovery hint.

### S-18 — Schema rejection: name with backslash (Story 6 AC#8 / SC-014)

**Action**: `{ target_mode: "specific", vault: "V", path: "P.md", name: "Sub\\X" }`.

**Expectations**: same as S-17.

### S-19 — Adapter raises CLI_BINARY_NOT_FOUND (Story 7 AC#1)

**Setup**: stub `spawnFn` raises `ENOENT`.

**Action**: invoke any valid input.

**Expectations**: response is `{ isError: true, ... }` with `code: "CLI_BINARY_NOT_FOUND"` and the structured `details` per 017-cross-platform-support.

### S-20 — Adapter raises CLI_NON_ZERO_EXIT (Story 7 AC#2)

**Setup**: stub `spawnFn` returns exit code 1 with stderr `"permission denied"`.

**Action**: invoke any valid input.

**Expectations**: `code: "CLI_NON_ZERO_EXIT"`, `details.exitCode: 1`, `details.stderr` verbatim.

### S-21 — Adapter raises CLI_REPORTED_ERROR for source not found (Story 4 AC#1 / Story 7 AC#3)

**Setup**: stub `spawnFn` exits 0 with stdout `"Error: file not found at Inbox/Missing.md\n"`.

**Action**: invoke with `path: "Inbox/Missing.md"`, `name: "X"`.

**Expectations**: `code: "CLI_REPORTED_ERROR"`; `details.message` carries the verbatim CLI line.

### S-22 — Adapter raises CLI_REPORTED_ERROR for destination collision (Story 4 AC#2)

**Setup**: stub `spawnFn` exits 0 with stdout matching the CLI's destination-exists wording (T0-captured).

**Action**: invoke any valid input where the destination is expected to collide.

**Expectations**: `code: "CLI_REPORTED_ERROR"`; `details.message` identifies the collision.

### S-23 — Adapter raises ERR_NO_ACTIVE_FILE in active mode (Story 5 AC#3)

**Setup**: stub `spawnFn` simulates the no-active-file CLI response.

**Action**: invoke `{ target_mode: "active", name: "X" }`.

**Expectations**: `code: "ERR_NO_ACTIVE_FILE"`; recovery-hint message intact per the cli-adapter's standard.

### S-24 — Adapter raises unknown-vault CLI_REPORTED_ERROR (Edge Cases / 011-R5 inherited)

**Setup**: stub `spawnFn` returns the 011-R5 unknown-vault response (e.g., stdout `"Vault not found.\n"`).

**Action**: invoke `{ target_mode: "specific", vault: "DoesNotExist", path: "P.md", name: "X" }`.

**Expectations**: `code: "CLI_REPORTED_ERROR"`; `details.message` matches the verbatim CLI line.

### S-25 — Adapter raises non-UpstreamError exception (Story 7 AC#4)

**Setup**: stub `spawnFn` throws a generic `Error` (not an `UpstreamError`).

**Action**: invoke any valid input.

**Expectations**: the generic error propagates verbatim; the handler does NOT wrap it as a tool error.

### S-26 — Same-name no-op invariant (Story 9 AC#1)

**Setup**: stub `spawnFn` returns success stdout with identical fromPath and toPath.

**Action**: invoke `{ target_mode: "specific", vault: "V", path: "Inbox/Note.md", name: "Note" }`.

**Expectations**: return value `{ renamed: true, fromPath: "Inbox/Note.md", toPath: "Inbox/Note.md" }`; `fromPath === toPath` by string equality; no error.

### S-27 — Single-spawn invariant (R9)

**Action**: across S-1, S-6, S-7 (the happy-path scenarios), assert `spawnFn.mock.callCount === 1`.

### S-28 — Registration: descriptor shape (Story 8 AC#1)

**Action**: `createRenameNoteTool({ logger, queue })` and inspect the returned `RegisteredTool`.

**Expectations**: `descriptor.name === "rename_note"`; `descriptor.inputSchema` has the post-010 flat shape with all five properties typed inline, `additionalProperties: false`, no `oneOf`; zero `description` keys at any depth.

### S-29 — Registration: top-level description (Story 8 AC#3)

**Action**: inspect `descriptor.description`.

**Expectations**: non-empty; contains `"help"` case-insensitive; references `rename_note` by name; surfaces the link-rewriting caveat.

### S-30 — Registration: docs/tools/rename_note.md exists and is non-stub (Story 8 AC#4 / SC-006)

**Action**: read `docs/tools/rename_note.md` from `import.meta.url` resolved path.

**Expectations**: file exists; does NOT contain `<!-- TODO -->` or similar stub marker; positively contains all five propagated error codes (`VALIDATION_ERROR`, `CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`); contains the four worked example shapes; contains the Scope section; contains the link-rewriting caveat.

### S-31 — Registration: zod parse-error propagation through registerTool (Story 8 AC#4)

**Action**: invoke the registered handler with malformed input (e.g., the S-9 fixture).

**Expectations**: registerTool catches the `ZodError` and surfaces it as `VALIDATION_ERROR` with `details.issues` populated.

### S-32 — Drift detector covers rename_note (SC-010)

**Action**: run the existing consolidated drift detector at `src/tools/_register.test.ts`.

**Expectations**: passes for `rename_note` automatically — flat `additionalProperties: false` object with all five properties typed inline, no `oneOf` envelope.

### S-33 — Aggregate coverage threshold preserved (SC-008)

**Action**: run `vitest run --coverage`.

**Expectations**: aggregate statements coverage is ≥ 91.3% (current floor at [vitest.config.ts:20](../../vitest.config.ts#L20)).

## Manual T0 scenarios (M-1..M-N)

These scenarios run at the start of `/speckit-implement` against the authorised TestVault per `.memory/test-execution-instructions.md`. Each maps to one of the FR-019 deferred T0 cases in research.md. Verbatim CLI stdout/stderr is captured into research.md as a Phase-1.5 amendment block before T0 marks complete.

### M-1 — Specific-mode rename happy path (FR-019 case (i))

**Setup**: seed `Sandbox/T0-rename-001-source.md` with a unique-per-run name.

**Probe**: `obsidian vault=TestVault-Obsidian-CLI-MCP rename path=Sandbox/T0-rename-001-source.md name=T0-rename-001-renamed.md`

**Capture**: verbatim stdout / stderr / exit code.

**Cleanup**: remove the renamed file.

**Locks**: `RESPONSE_RE` regex pattern in `handler.ts`.

### M-2 — Specific-mode rename via wikilink (FR-019 case (ii))

**Setup**: seed `Sandbox/T0-rename-002-source.md`.

**Probe**: `obsidian vault=TestVault-Obsidian-CLI-MCP rename file=T0-rename-002-source name=T0-rename-002-renamed.md`

**Capture**: same. Verify canonical paths echo in the response.

### M-3 — Specific-mode rename with `.md` already in name (FR-019 case (iii))

**Setup**: seed `Sandbox/T0-rename-003-source.md`.

**Probe**: `obsidian vault=TestVault-Obsidian-CLI-MCP rename path=Sandbox/T0-rename-003-source.md name=T0-rename-003-renamed.md`

**Capture**: same. Verify no double-`.md` in the response.

### M-4 — Same-name rename (FR-019 case (iv) / Story 9)

**Setup**: seed `Sandbox/T0-rename-004.md`.

**Probe**: `obsidian vault=TestVault-Obsidian-CLI-MCP rename path=Sandbox/T0-rename-004.md name=T0-rename-004.md`

**Capture**: same. Determine: success / error / silent no-op. Document in `docs/tools/rename_note.md`.

### M-5 — Source not found (FR-019 case (v))

**Probe**: `obsidian vault=TestVault-Obsidian-CLI-MCP rename path=Sandbox/T0-DOES-NOT-EXIST.md name=Anything.md`

**Capture**: verbatim error wording, exit code, classification (CLI_NON_ZERO_EXIT vs CLI_REPORTED_ERROR per the cli-adapter).

### M-6 — Destination collision (FR-019 case (vi))

**Setup**: seed BOTH `Sandbox/T0-rename-006a.md` AND `Sandbox/T0-rename-006b.md`.

**Probe**: `obsidian vault=TestVault-Obsidian-CLI-MCP rename path=Sandbox/T0-rename-006a.md name=T0-rename-006b.md`

**Capture**: verbatim error wording.

### M-7 — Unknown vault (FR-019 case (vii))

**Probe**: `obsidian vault=DoesNotExist rename path=anything.md name=anything-renamed.md`

**Capture**: verify match with 011-R5 signature (`Vault not found.`). If differs, log as a follow-up adapter change.

### M-8 — Active-mode rename of focused note (FR-019 case (viii))

**Setup**: open `Sandbox/T0-rename-008.md` in Obsidian (focused note).

**Probe**: `obsidian rename name=T0-rename-008-renamed.md`

**Capture**: verbatim response; focused-file path echo.

### M-9 — Path-traversal (FR-019 case (ix), SC-012 gate)

**Setup**: place a bait file in `…\Obsidian\bait\sensitive.md` (sibling to the vault root, per `.memory/test-execution-instructions.md`).

**Probe**: `obsidian vault=TestVault-Obsidian-CLI-MCP rename path=../../bait/sensitive.md name=stolen.md`

**Capture**: verify CLI rejects. If NOT, **the BI is amended pre-ship** to add a tool-layer reject (and a new schema test case) before the merge gate clears.

### M-10 — Case-only rename on Windows NTFS-default (FR-019 case (x))

**Setup**: seed `Sandbox/T0-Rename-010.md` (capital R).

**Probe**: `obsidian vault=TestVault-Obsidian-CLI-MCP rename path=Sandbox/T0-Rename-010.md name=t0-rename-010.md`

**Capture**: observed behaviour (no-op vs rename); document in `docs/tools/rename_note.md`.

### M-11 — Confirm fromPath / toPath extraction (FR-019 case (xi))

This is a consolidation step. After M-1, M-2, M-3, M-8 complete, lock the `RESPONSE_RE` regex pattern in `handler.ts` and update `data-model.md`'s response-parser anticipated-shapes section with the verified shape.

## Reporting

After T0 of /speckit-implement completes, the research.md amendment block documents:

- Verbatim CLI stdout/stderr for each M-1..M-11.
- The locked `RESPONSE_RE` regex pattern.
- Any deviation from the anticipated shapes that triggers a spec / handler amendment.
- Confirmation that the 011-R5 inherited unknown-vault signature still matches (or, if not, a follow-up issue against the cli-adapter).

Once T0 is complete and all amendments are integrated, T010+ (implementation tasks) proceeds.
