# Quickstart — Verification Scenarios

**Feature**: [011-write-note](./spec.md)
**Date**: 2026-05-08

13 verification scenarios mapped 1:1 to SC-001..SC-013. S-1..S-10 run in CI as part of the test suite; S-11/S-12 are manual end-to-end runs against MCP clients (Claude Desktop, MCP Inspector, Cowork); S-13 is the deliberate-revert sanity check (parity with the [010-flatten-target-mode](../010-flatten-target-mode/spec.md) S-13 pattern).

---

## S-1 — All 33 acceptance scenarios pass on first run (SC-001)

**Goal**: 100% of the User Story 1–9 acceptance scenarios pass after `/speckit-implement`.

**Run**:
```sh
npm run test
```

**Expected**: vitest reports 0 failures across the new `src/tools/write_note/{schema,handler,index}.test.ts` files. The acceptance-scenario distribution matches the spec: Story 1 (3) + Story 2 (2) + Story 3 (3) + Story 4 (2) + Story 5 (3) + Story 6 (10) + Story 7 (4) + Story 8 (4) + Story 9 (2) = 33 scenarios.

**Lock**: each AC is encoded as at least one test case in the per-FR-016 test set; the AC ID is cited in the test description (e.g., `test("Story 6 AC#8 — active mode without overwrite=true fails VALIDATION_ERROR", …)`).

---

## S-2 — `tools/list` shape (SC-002)

**Goal**: `write_note` is registered alongside `obsidian_exec`, `help`, `read_note`. The descriptor's `inputSchema` is the post-010 flat shape; `description` mentions `help("write_note")`.

**Run** (via the post-010 consolidated drift detector — runs as part of `npm run test`):
```sh
npx vitest run src/tools/_register.test.ts
```

Or via MCP Inspector against the running server:
```sh
npx @modelcontextprotocol/inspector node dist/index.js
# In the inspector UI, switch to the Tools tab. Confirm write_note appears
# alongside the other three tools. Click its row to view its inputSchema.
```

**Expected** (drift detector): `it.each` table fires for `write_note`; all per-tool invariants pass (`name === "write_note"`, `additionalProperties === false`, all 8 properties present at top-level, no `description` keys, no `oneOf`, top-level `description` contains `"help"` and `"write_note"`).

**Expected** (MCP Inspector): visual confirmation of the 8 properties + `additionalProperties: false`.

---

## S-3 — Handler thinness (SC-003 / SC-007)

**Goal**: the handler has no direct `child_process.spawn` invocations and no raw stdout regex-matching for `Error:` prefixes; total file LOC ≤ 70.

**Run**:
```sh
grep -nE "child_process\.spawn|spawn\(|Error:" src/tools/write_note/handler.ts
wc -l src/tools/write_note/handler.ts
```

**Expected**:
- `grep` returns no matches (the only path to the CLI is via `invokeCli`).
- `wc -l` returns ≤ 70.

If the LOC ceiling is approached or exceeded, factor non-essential logic out (e.g., the response-parsing helper into a sibling module, OR the response-inspection logic into the cli-adapter per R5).

---

## S-4 — No hand-rolled types (SC-004)

**Goal**: the schema module has zero hand-written `interface WriteNote…` or `type WriteNote… = { … }` declarations that redefine the input or output shape.

**Run**:
```sh
grep -nE "^(interface|type)\s+WriteNote.*=" src/tools/write_note/schema.ts
```

**Expected**: zero matches. The only typed surface is `z.infer<typeof writeNoteInputSchema>` and `z.infer<typeof writeNoteOutputSchema>`.

(Type aliases `WriteNoteInput = z.infer<typeof writeNoteInputSchema>` are permitted — they are inferences, not redefinitions.)

---

## S-5 — No `.describe()` calls (SC-005)

**Goal**: parameter documentation lives in `docs/tools/write_note.md`, not in the schema.

**Run**:
```sh
grep -nE "\.describe\(" src/tools/write_note/schema.ts
```

**Expected**: zero matches.

---

## S-6 — Populated docs (SC-006)

**Goal**: `docs/tools/write_note.md` exists, has no TODO/stub markers, names all 5 propagated error codes, and includes all 4 required example shapes.

**Run**:
```sh
grep -c "<!-- TODO" docs/tools/write_note.md
grep -cE "VALIDATION_ERROR|CLI_BINARY_NOT_FOUND|CLI_NON_ZERO_EXIT|CLI_REPORTED_ERROR|ERR_NO_ACTIVE_FILE" docs/tools/write_note.md
grep -cE "target_mode.*specific.*path|target_mode.*specific.*file|target_mode.*specific.*overwrite|target_mode.*active" docs/tools/write_note.md
```

**Expected**:
- `<!-- TODO` count: 0
- Error-code count: ≥ 5 (one match per code, possibly more)
- Example-shape count: ≥ 4 (one match per shape)

The co-located registration test at `src/tools/write_note/index.test.ts` per FR-016 case (e) automates this assertion in CI.

---

## S-7 — Post-010 drift detector covers write_note (SC-010)

**Goal**: the consolidated drift detector at `src/tools/_register.test.ts` automatically covers `write_note` via its `it.each` registry walk; no test-file modifications required.

**Run**:
```sh
npx vitest run src/tools/_register.test.ts
git diff src/tools/_register.test.ts
```

**Expected**:
- vitest passes; the `it.each` row for `write_note` runs and asserts the per-tool invariants.
- `git diff` is empty for `_register.test.ts` (no edits made by this BI).

---

## S-8 — Coverage threshold preserved (SC-008)

**Goal**: aggregate statements coverage remains ≥ 89.6% (the floor at [vitest.config.ts:20](../../vitest.config.ts#L20)).

**Run**:
```sh
npm run test
# Inspect the coverage summary at the bottom of the vitest output.
```

**Expected**: aggregate statements coverage ≥ 89.6%. The new `write_note` module's 32 co-located tests cover near-100% of its statements; the aggregate either stays flat or ratchets up.

If coverage drops, identify untested branches via `coverage/lcov-report/index.html` and add the missing tests before merge.

---

## S-9 — `obsidian_exec` and `read_note` unchanged (SC-009)

**Goal**: this BI adds `write_note` without perturbing existing tools.

**Run**:
```sh
git diff main..HEAD -- src/tools/obsidian_exec/ src/tools/read_note/
```

**Expected**: zero substantive lines changed in either module. The only acceptable diff is a registration-list reorder in `src/server.ts` (not a content change in either tool's module).

---

## S-10 — Path-traversal precondition gate (SC-012)

**Goal**: the live CLI rejects `../`-shaped vault-relative paths. If it does NOT, this BI is amended pre-ship to add a tool-layer reject.

**Run** (T0.7 from [research.md](./research.md)):
```sh
# Against a scratch subdirectory in the user-authorised vault:
obsidian vault="The Setup" create path="_speckit-011-write-note-research/../../etc/passwd_test.md" content="x" 2>&1
```

**Expected**: the CLI MUST reject the input (either non-zero exit with stderr explaining, or exit 0 with `Error:` on stdout naming the path-traversal as the cause). The on-disk filesystem MUST NOT have a new `passwd_test.md` outside the vault root.

**If the test passes**: SC-012 is satisfied; no schema-layer reject needed; document the CLI's rejection wording in `docs/tools/write_note.md` per FR-014.

**If the test fails**: SC-012 is NOT satisfied; the BI is amended pre-ship to add a schema-layer `superRefine` clause that rejects `path` values containing `../` or `..\\` segments, plus a co-located schema test case. The merge gate does not clear without this verification.

---

## S-11 — End-to-end against Claude Desktop (manual, SC-002 + SC-006 client-class verification)

**Goal**: confirm `write_note` works end-to-end through a strict-rich MCP client (Claude Desktop or MCP Inspector — both consult `additionalProperties` and either forward unknown keys or strip them client-side).

**Run**:
1. Build: `npm run build`.
2. Configure Claude Desktop's `claude_desktop_config.json` to load `obsidian-cli-mcp` from this branch's `dist/` (or use `npx -y` against a published prerelease tag).
3. Start a Claude Desktop conversation. Confirm `write_note` appears in the available tools list.
4. Issue: `write_note({ target_mode: "specific", vault: "The Setup", path: "_speckit-011-manual/test1.md", content: "# Manual S-11\n\nFresh creation.\n" })`. Expect `{ created: true, path: "_speckit-011-manual/test1.md" }`.
5. Re-issue without `overwrite: true`: expect `CLI_REPORTED_ERROR` (or `CLI_NON_ZERO_EXIT`) per Story 3.
6. Re-issue with `overwrite: true`: expect `{ created: false, path: "_speckit-011-manual/test1.md" }`.
7. Issue `write_note({ target_mode: "active", content: "# Manual S-11 active rewrite\n", overwrite: true })` against a focused note. Expect `{ created: false, path: "<focused note path>" }`.
8. Issue `write_note({ target_mode: "active", content: "x" })` (no overwrite). Expect `VALIDATION_ERROR` naming `overwrite` and `active mode` per Story 6 AC#8.
9. Issue `write_note({ target_mode: "specific", vault: "The Setup", path: "_speckit-011-manual/test2.md", content: "x", pancakes: "yes" })`. Expect `VALIDATION_ERROR` naming `pancakes` (post-010 strict-mode `unrecognized_keys`) — observable because Claude Desktop forwards unknown keys to the bridge.
10. Cleanup: `obsidian delete path=_speckit-011-manual/test1.md`, `obsidian delete path=_speckit-011-manual/test2.md`.

**Expected**: each step matches the prediction. If any step diverges, capture the actual response and update the spec or implementation accordingly.

---

## S-12 — End-to-end against Cowork (manual, strict-naive client-class verification)

**Goal**: confirm `write_note` works end-to-end through a strict-naive MCP client (Cowork — strips unknown keys client-side per the published `additionalProperties: false`, so the bridge-side rejection is non-observable from the client).

**Run**: same as S-11 steps 1–7 (against Cowork's MCP integration setup), plus:
8. **Step 9 from S-11 is non-observable here**: Cowork strips `pancakes: "yes"` client-side per the published schema; the bridge sees a clean call. Expected behaviour: the call SUCCEEDS with `{ created: true, … }`. Document this as the strict-naive client class's behaviour.

**Expected**: steps 1–7 match S-11. Step 8 (the unknown-key case) succeeds because the unknown key is stripped client-side. Both behaviours are CORRECT per the dual-pathway distinction in spec.md's Edge Cases ("Strict-rich vs strict-naive client-class observability of unknown-key rejection").

---

## S-13 — Deliberate-revert sanity check (SC-009 / SC-010)

**Goal**: confirm that removing `write_note` from the registration list (in `src/server.ts`) cleanly reverts to a 3-tool registry, demonstrating that the BI is structurally additive and does NOT perturb the existing surface.

**Run** (locally, on a scratch revert branch):
```sh
git checkout -b 011-revert-sanity
# Edit src/server.ts: remove the createWriteNoteTool import and the array entry.
# Edit src/tools/_register.test.ts: nothing — drift detector auto-adjusts.
# Edit docs/tools/index.md: revert the write_note entry.
npm run test
git diff main..HEAD
git checkout 011-write-note && git branch -D 011-revert-sanity
```

**Expected**:
- `npm run test` passes (the consolidated drift detector's `it.each` no longer fires for `write_note`).
- `git diff main..HEAD` shows ONLY the deletions of write_note's source files + docs + the registration line + the docs/index.md entry. No upstream code paths changed.

If the revert produces failures in `obsidian_exec` / `read_note` / drift-detector tests, that's a structural drift defect; this BI is amended pre-ship to remove the coupling.

---

## SC-011 — research.md captures all 8 FR-019 cases

This SC is satisfied when:
1. [research.md](./research.md) exists with the FR-019 case-capture status table.
2. All 8 cases (i)–(viii) have a verified status (either "verified during plan" with the captured wording, or "captured during T0" with the wording appended at the start of `/speckit-implement`).
3. The handler's response-parsing logic (per [contracts/write-note-handler.contract.md](./contracts/write-note-handler.contract.md)) is locked against the captured wording with a citation in the source code.

**Run** (manual inspection):
```sh
grep -A 1 "FR-019" specs/011-write-note/research.md
grep -nE "T0\.[1-8]" src/tools/write_note/handler.ts
```

**Expected**:
- research.md contains the 8-row table with one row per case.
- handler.ts cites at least the cases its response-parsing logic depends on (T0.1, T0.2, T0.3 at minimum for R4).

---

## SC-013 — `obsidian_exec` remains the documented escape hatch

**Goal**: `docs/tools/obsidian_exec.md` is updated to point agents at `write_note` for create/overwrite operations and to clarify when `obsidian_exec` is the right fallback (the `newtab` flag, future subcommands).

**Run** (manual inspection):
```sh
grep -nE "write_note|create|overwrite" docs/tools/obsidian_exec.md
```

**Expected**: at least one paragraph in `obsidian_exec.md` names `write_note` as the typed surface for create/overwrite operations. The `newtab` flag is named as the residual `obsidian_exec`-only use case.

---

## CI scenarios (S-1..S-10) summary

S-1, S-2, S-7, S-8, S-9 run automatically as part of `npm run test` in CI. S-3, S-4, S-5, S-6 are static greps that can be added to a pre-merge script or run manually before pushing. S-10 is a one-off live-CLI verification that runs once during T0 and is documented in `research.md`.

S-11, S-12 are manual end-to-end runs the author performs once before opening the PR; the results are summarised in the PR description.

S-13 is an optional sanity check that verifies structural cleanliness; not required for ship but recommended.

The full quickstart is run end-to-end before merge per the project's existing convention (matching the [010-flatten-target-mode/quickstart.md](../010-flatten-target-mode/quickstart.md) S-1..S-13 pattern).
