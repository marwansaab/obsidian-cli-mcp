# Quickstart — Verification Scenarios

**Feature**: [012-delete-note](./spec.md)
**Date**: 2026-05-08

15 verification scenarios mapped 1:1 to SC-001..SC-015. S-1..S-10 run in CI as part of the test suite (or via static greps before merge); S-11/S-12 are manual end-to-end runs against MCP clients (Claude Desktop, MCP Inspector, Cowork); S-13 is the deliberate-revert sanity check; S-14 is the audit-trail invariant verification; S-15 is the documentation cross-reference check.

---

## S-1 — All 28 acceptance scenarios pass on first run (SC-001)

**Goal**: 100% of the User Story 1–8 acceptance scenarios pass after `/speckit-implement`.

**Run**:
```sh
npm run test
```

**Expected**: vitest reports 0 failures across the new `src/tools/delete_note/{schema,handler,index}.test.ts` files. The acceptance-scenario distribution matches the spec: Story 1 (2) + Story 2 (2) + Story 3 (3) + Story 4 (4) + Story 5 (7) + Story 6 (4) + Story 7 (4) + Story 8 (2) = 28 scenarios.

**Lock**: each AC is encoded as at least one test case in the per-FR-016 test set; the AC ID is cited in the test description (e.g., `test("Story 4 AC#3 — active mode with vault fails VALIDATION_ERROR", …)`).

---

## S-2 — `tools/list` shape (SC-002)

**Goal**: `delete_note` is registered alongside `obsidian_exec`, `help`, `read_note`, `write_note`. The descriptor's `inputSchema` is the post-010 flat shape; `description` mentions `help("delete_note")` AND surfaces the irreversibility warning for `permanent: true`.

**Run** (via the post-010 consolidated drift detector — runs as part of `npm run test`):
```sh
npx vitest run src/tools/_register.test.ts
```

Or via MCP Inspector against the running server:
```sh
npx @modelcontextprotocol/inspector node dist/index.js
# In the inspector UI, switch to the Tools tab. Confirm delete_note appears
# alongside the other four tools. Click its row to view its inputSchema.
```

**Expected** (drift detector): `it.each` table fires for `delete_note`; all per-tool invariants pass (`name === "delete_note"`, `additionalProperties === false`, all 5 properties present at top-level, no `description` keys, no `oneOf`, top-level `description` contains `"help"` and `"delete_note"`).

**Expected** (MCP Inspector): visual confirmation of the 5 properties + `additionalProperties: false`. Inspect the top-level `description` and confirm it contains a phrase about "trash" / "recoverable" / "irreversible" (the safety-default disclosure per Story 7 AC#3).

---

## S-3 — Handler thinness (SC-003 / SC-007)

**Goal**: the handler has no direct `child_process.spawn` invocations and no raw stdout regex-matching for `Error:` prefixes; total file LOC ≤ 50.

**Run**:
```sh
grep -nE "child_process\.spawn|spawn\(|Error:" src/tools/delete_note/handler.ts
wc -l src/tools/delete_note/handler.ts
```

**Expected**:
- `grep` returns no matches (the only path to the CLI is via `invokeCli`).
- `wc -l` returns ≤ 50.

If the LOC ceiling is approached or exceeded, factor non-essential logic out (e.g., the response-parsing helper into a sibling module, OR the response-inspection logic into the cli-adapter — though for delete_note R5 inheritance from 011 already covers the unknown-vault case).

---

## S-4 — No hand-rolled types (SC-004)

**Goal**: the schema module has zero hand-written `interface DeleteNote…` or `type DeleteNote… = { … }` declarations that redefine the input or output shape.

**Run**:
```sh
grep -nE "^(interface|type)\s+DeleteNote.*=" src/tools/delete_note/schema.ts
```

**Expected**: zero matches. The only typed surface is `z.infer<typeof deleteNoteInputSchema>` and `z.infer<typeof deleteNoteOutputSchema>`.

(Type aliases `DeleteNoteInput = z.infer<typeof deleteNoteInputSchema>` are permitted — they are inferences, not redefinitions.)

---

## S-5 — No `.describe()` calls (SC-005)

**Goal**: parameter documentation lives in `docs/tools/delete_note.md`, not in the schema.

**Run**:
```sh
grep -nE "\.describe\(" src/tools/delete_note/schema.ts
```

**Expected**: zero matches.

---

## S-6 — Populated docs (SC-006)

**Goal**: `docs/tools/delete_note.md` exists, has no TODO/stub markers, names all 5 propagated error codes, includes all 4 required example shapes, AND contains the explicit irreversibility warning for `permanent: true`.

**Run**:
```sh
grep -c "<!-- TODO" docs/tools/delete_note.md
grep -cE "VALIDATION_ERROR|CLI_BINARY_NOT_FOUND|CLI_NON_ZERO_EXIT|CLI_REPORTED_ERROR|ERR_NO_ACTIVE_FILE" docs/tools/delete_note.md
grep -cE "target_mode.*specific.*path|target_mode.*specific.*file|target_mode.*specific.*permanent|non-existent" docs/tools/delete_note.md
grep -ciE "irreversibl|cannot be undone|unrecoverable" docs/tools/delete_note.md
```

**Expected**:
- `<!-- TODO` count: 0
- Error-code count: ≥ 5 (one match per code, possibly more)
- Example-shape count: ≥ 4 (one match per shape — to-trash + path, to-trash + file, permanent + path, failure recovery from non-existent)
- Irreversibility-warning count: ≥ 1 (the `permanent: true` warning per FR-014)

The co-located registration test at `src/tools/delete_note/index.test.ts` per FR-016 case (e) automates the first three assertions in CI; the irreversibility-warning assertion is added there too.

---

## S-7 — Post-010 drift detector covers delete_note (SC-010)

**Goal**: the consolidated drift detector at `src/tools/_register.test.ts` automatically covers `delete_note` via its `it.each` registry walk; no test-file modifications required.

**Run**:
```sh
npx vitest run src/tools/_register.test.ts
git diff src/tools/_register.test.ts
```

**Expected**:
- vitest passes; the `it.each` row for `delete_note` runs and asserts the per-tool invariants.
- `git diff` is empty for `_register.test.ts` (no edits made by this BI).

---

## S-8 — Coverage threshold preserved (SC-008)

**Goal**: aggregate statements coverage remains ≥ 89.6% (the floor at [vitest.config.ts:20](../../vitest.config.ts#L20)).

**Run**:
```sh
npm run test
# Inspect the coverage summary at the bottom of the vitest output.
```

**Expected**: aggregate statements coverage ≥ 89.6%. The new `delete_note` module's 30 co-located tests cover near-100% of its statements; the aggregate either stays flat or ratchets up.

If coverage drops, identify untested branches via `coverage/lcov-report/index.html` and add the missing tests before merge.

---

## S-9 — Sibling tools unchanged (SC-009)

**Goal**: this BI adds `delete_note` without perturbing existing tools.

**Run**:
```sh
git diff main..HEAD -- src/tools/obsidian_exec/ src/tools/read_note/ src/tools/write_note/
```

**Expected**: zero substantive lines changed in any of the three sibling modules. The only acceptable diff is a registration-list reorder in `src/server.ts` (not a content change in any tool's module).

---

## S-10 — Path-traversal precondition gate (SC-012)

**Goal**: the live CLI rejects `../`-shaped vault-relative paths for the `delete` subcommand. If it does NOT, this BI is amended pre-ship to add a tool-layer reject.

**Run** (T0.7 from [research.md](./research.md), executed against a user-authorised scratch vault subdirectory):
```sh
# Pre-step: create a fixture file outside the scratch subdir to "target" via traversal.
# (E.g., place a sentinel file at <vault-root>/_sentinel.md so the test can verify it survives.)

# The actual probe:
obsidian vault="<scratch-vault>" delete path="_scratch_012/../_sentinel.md" 2>&1
```

**Expected**: the CLI MUST reject the input (either non-zero exit with stderr explaining, or exit 0 with `Error:` on stdout naming the path-traversal as the cause). The `_sentinel.md` file MUST still exist after the call. The on-disk filesystem MUST NOT have any file outside the vault root touched.

**If the test passes**: SC-012 is satisfied; no schema-layer reject needed; document the CLI's rejection wording in `docs/tools/delete_note.md` per FR-014.

**If the test fails**: SC-012 is NOT satisfied; the BI is amended pre-ship to add a schema-layer `superRefine` clause that rejects `path` values containing `../` or `..\\` segments, plus a co-located schema test case. The merge gate does not clear without this verification. **Silent vault-escape on a destructive operation is a critical security defect.**

---

## S-11 — End-to-end against Claude Desktop (manual, SC-002 + SC-006 + SC-013 client-class verification)

**Goal**: confirm `delete_note` works end-to-end through a strict-rich MCP client (Claude Desktop or MCP Inspector). Includes a deliberate trash-volume-full probe (SC-013) if the platform supports it.

**Run**:
1. Build: `npm run build`.
2. Configure Claude Desktop's `claude_desktop_config.json` to load `obsidian-cli-mcp` from this branch's `dist/` (or use `npx -y` against a published prerelease tag).
3. Start a Claude Desktop conversation. Confirm `delete_note` appears in the available tools list.
4. **Setup** — use `write_note` (already shipped) to create three test files in a scratch folder:
   - `_speckit-012-manual/trash-test.md`
   - `_speckit-012-manual/permanent-test.md`
   - `_speckit-012-manual/wikilink-test.md`
5. Issue: `delete_note({ target_mode: "specific", vault: "The Setup", path: "_speckit-012-manual/trash-test.md" })`. Expect `{ deleted: true, path: "_speckit-012-manual/trash-test.md", toTrash: true }`. Verify the file is gone from the vault and present in the OS trash.
6. Issue: `delete_note({ target_mode: "specific", vault: "The Setup", file: "wikilink-test" })`. Expect `{ deleted: true, path: "<canonical resolved path>", toTrash: true }`.
7. Issue: `delete_note({ target_mode: "specific", vault: "The Setup", path: "_speckit-012-manual/permanent-test.md", permanent: true })`. Expect `{ deleted: true, path: "_speckit-012-manual/permanent-test.md", toTrash: false }`. Verify the file is gone from BOTH the vault AND the OS trash.
8. Re-issue step 5 (the file is already gone): expect `CLI_REPORTED_ERROR` with a message naming "not found" or similar. The on-disk state is unchanged (the file stays gone — no resurrection).
9. Issue `delete_note({ target_mode: "active" })` against a focused note. Expect `{ deleted: true, path: "<focused note path>", toTrash: true }`.
10. Issue `delete_note({ target_mode: "specific", vault: "The Setup", path: "_speckit-012-manual/x.md", pancakes: "yes" })`. Expect `VALIDATION_ERROR` naming `pancakes` (post-010 strict-mode `unrecognized_keys`) — observable because Claude Desktop forwards unknown keys to the bridge.
11. Issue `delete_note({ target_mode: "active", vault: "The Setup" })`. Expect `VALIDATION_ERROR` naming `vault` AND `active mode` per Story 4 AC#3.
12. **(Optional, SC-013 trash-volume-full probe)** if the test environment supports it: temporarily fill the user's recycle bin (or set the recycle bin's max size to 0 on Windows for the test volume). Issue `delete_note({ target_mode: "specific", vault: "The Setup", path: "_speckit-012-manual/large-fixture.md" })` against a moderately-sized fixture. Expect EITHER (a) a structured `CLI_NON_ZERO_EXIT` or `CLI_REPORTED_ERROR` (the safe outcome), OR (b) a successful return with `toTrash: true` despite the file being permanently deleted in reality. **If (b)** — the CLI silently fell back to permanent — SC-013 is violated and this BI is amended pre-ship per the spec's gate.
13. **Cleanup** — restore any test environment changes from step 12.

**Expected**: each step matches the prediction. If any step diverges (especially step 12), capture the actual response and update the spec or implementation accordingly.

---

## S-12 — End-to-end against Cowork (manual, strict-naive client-class verification)

**Goal**: confirm `delete_note` works end-to-end through a strict-naive MCP client (Cowork — strips unknown keys client-side per the published `additionalProperties: false`, so the bridge-side rejection is non-observable from the client).

**Run**: same as S-11 steps 1–9 (against Cowork's MCP integration setup), plus:
14. **Step 10 from S-11 is non-observable here**: Cowork strips `pancakes: "yes"` client-side per the published schema; the bridge sees a clean call. Expected behaviour: the call SUCCEEDS with `{ deleted: true, … }` (or `CLI_REPORTED_ERROR` if `_speckit-012-manual/x.md` doesn't exist on disk). Document this as the strict-naive client class's behaviour.

**Expected**: steps 1–9 match S-11. Step 10 (the unknown-key case) succeeds because the unknown key is stripped client-side. Both behaviours are CORRECT per the dual-pathway distinction in spec.md's Edge Cases ("Strict-rich vs strict-naive client-class observability of unknown-key rejection").

---

## S-13 — Deliberate-revert sanity check (SC-009 / SC-010)

**Goal**: confirm that removing `delete_note` from the registration list (in `src/server.ts`) cleanly reverts to a 4-tool registry, demonstrating that the BI is structurally additive and does NOT perturb the existing surface.

**Run** (locally, on a scratch revert branch):
```sh
git checkout -b 012-revert-sanity
# Edit src/server.ts: remove the createDeleteNoteTool import and the array entry.
# Edit src/tools/_register.test.ts: nothing — drift detector auto-adjusts.
# Edit docs/tools/index.md: revert the delete_note entry.
npm run test
git diff main..HEAD
git checkout 012-delete-note && git branch -D 012-revert-sanity
```

**Expected**:
- `npm run test` passes (the consolidated drift detector's `it.each` no longer fires for `delete_note`).
- `git diff main..HEAD` shows ONLY the deletions of delete_note's source files + docs + the registration line + the docs/index.md entry. No upstream code paths changed.

If the revert produces failures in `obsidian_exec` / `read_note` / `write_note` / drift-detector tests, that's a structural drift defect; this BI is amended pre-ship to remove the coupling.

---

## S-14 — Audit-trail invariant (SC-014)

**Goal**: `toTrash === !parsedInput.permanent` holds across all four success-path combinations.

**Run**:
```sh
npx vitest run -t "audit invariant" src/tools/delete_note/handler.test.ts
```

**Expected**: the parameterised test enumerated under spec Story 8 fires for all four combinations:
- `{ permanent: undefined }` → `toTrash: true`
- `{ permanent: false }` → `toTrash: true`
- `{ permanent: true }` → `toTrash: false`
- (active-mode equivalents for the same three permanent values)

All assertions pass. The test name pattern is `audit invariant: <combination> → toTrash: <bool>`.

This is the structural property operators rely on when filtering logs by `toTrash === false` to surface every irreversible deletion. A failure here is a Constitution Principle IV-adjacent regression (the wrapper's audit-trail contract is broken); fix before merge.

---

## S-15 — `obsidian_exec` remains the documented escape hatch (SC-015)

**Goal**: `docs/tools/obsidian_exec.md` is updated to point agents at `delete_note` for delete operations and to clarify when `obsidian_exec` is the right fallback.

**Run** (manual inspection):
```sh
grep -nE "delete_note|delete subcommand|trash" docs/tools/obsidian_exec.md
```

**Expected**: at least one paragraph in `obsidian_exec.md` names `delete_note` as the typed surface for delete operations. The `newtab` flag is named (in the existing 011-write-note documentation) as the residual `obsidian_exec`-only use case for create; for delete, `obsidian_exec` is no longer the right tool — the typed surface covers all of `delete`'s argv shape.

---

## SC-011 — research.md captures all 9 FR-019 cases

This SC is satisfied when:
1. [research.md](./research.md) exists with the FR-019 case-capture status table.
2. All 9 cases (i)–(ix) have a verified status (either "verified during plan" with the captured wording, or "captured during T0" with the wording appended at the start of `/speckit-implement`).
3. The handler's response-parsing logic (per [contracts/delete-note-handler.contract.md](./contracts/delete-note-handler.contract.md)) is locked against the captured wording with a citation in the source code.

**Run** (manual inspection):
```sh
grep -nA 1 "FR-019" specs/012-delete-note/research.md
grep -nE "T0\.[1-9]" src/tools/delete_note/handler.ts
```

**Expected**:
- research.md contains the 9-row table with one row per case (cases (v) and (ix) verified during plan stage; cases (i)–(iv), (vi), (vii), (viii) captured during T0).
- handler.ts cites at least the cases its response-parsing logic depends on (T0.1, T0.3 at minimum for R4).

---

## CI scenarios (S-1, S-2, S-7, S-8, S-9, S-14) summary

S-1, S-2, S-7, S-8, S-9, S-14 run automatically as part of `npm run test` in CI. S-3, S-4, S-5, S-6 are static greps that can be added to a pre-merge script or run manually before pushing. S-10 is a one-off live-CLI verification that runs once during T0 and is documented in `research.md`.

S-11, S-12 are manual end-to-end runs the author performs once before opening the PR; the results are summarised in the PR description.

S-13 is an optional sanity check that verifies structural cleanliness; not required for ship but recommended.

S-15 is a documentation cross-reference check that runs as a manual inspection before merge.

The full quickstart is run end-to-end before merge per the project's existing convention (matching the [011-write-note/quickstart.md](../011-write-note/quickstart.md) S-1..S-13 pattern, extended for delete_note's two additional SCs around the audit invariant and trash-fallback gate).
