# Quickstart — Flatten `targetModeSchema` Verification

**Feature**: `010-flatten-target-mode`
**Audience**: Implementers running `/speckit-implement`, reviewers verifying merge readiness, and the release author cutting `0.2.2`.

This document maps each Success Criterion (SC-001..SC-013) to a concrete verification scenario. Scenarios labelled **CI** are automated and gate merge via `npm run typecheck` + `npm run lint` + `vitest run --coverage`. Scenarios labelled **Manual** are run once per release against real MCP clients and a real Obsidian vault, with results recorded in the `0.2.2` release notes (per FR-012 / SC-001..SC-003).

---

## S-1 — `read_note` flat-object publication (CI; SC-005)

**Goal**: Verify `read_note`'s published `inputSchema` is the flat object descriptor at [data-model.md §4](data-model.md#§4--zodtojsonschema-emit-shape-the-published-inputschema), with no `oneOf` / `allOf` / `anyOf`.

**Steps**:
1. Run `vitest run src/tools/_register.test.ts`.
2. Verify the `tool read_note satisfies its invariant` case passes (Layer 1 of the drift detector — see [contracts/drift-detector.contract.md §3](contracts/drift-detector.contract.md#§3--layer-1-registry-walk)).
3. Verify the `tool read_note wire-side satisfies its invariant` case passes (Layer 2 — SDK round-trip).

**Pass criterion**: Both cases pass with the post-010 invariants:
- `inputSchema.type === "object"`
- `Object.keys(inputSchema.properties)` is the set `["target_mode", "vault", "file", "path"]` (exact match)
- `inputSchema.required` is `["target_mode"]`
- `inputSchema.additionalProperties === false`
- No `oneOf`, no `allOf`, no `anyOf` keys.

**Fail behaviour**: A regression that re-introduces the wrap branch (e.g., a future change to `_shared.ts`) or that re-encodes `targetModeSchema` as a discriminated union (e.g., a future revert of `target-mode.ts`) fails at this case with a per-cell `expect` mismatch naming the offending key.

---

## S-2 — `obsidian_exec` byte-stable shape (CI; SC-006)

**Goal**: Verify `obsidian_exec`'s published shape is unchanged from `0.2.0` / `0.2.1`.

**Steps**:
1. Run `vitest run src/tools/_register.test.ts`.
2. Verify the `tool obsidian_exec satisfies its invariant` case passes (both layers).

**Pass criterion**:
- `properties_equals_set === ["command", "vault", "parameters", "flags", "copy", "timeoutMs"]`
- `required_equals === ["command"]`
- `additionalProperties === false`

**Fail behaviour**: A regression that accidentally widens `obsidian_exec`'s shape (e.g., routes a flat-`z.object` through the wrap-branch widening — impossible post-010 since the wrap branch is gone, but the assertion remains as defence in depth) fails this case.

---

## S-3 — 31 existing target-mode test cases preserved (CI; SC-004)

**Goal**: Verify the 31 cases in [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts) continue to assert the same rules after the flatten. Six cases migrate to call `targetModeSchema` directly with the matching `target_mode` literal; rule-semantics assertions preserved verbatim (FR-003).

**Steps**:
1. Run `vitest run src/target-mode/target-mode.test.ts`.
2. Verify all 33 cases pass (31 pre-010 + 2 new per [data-model.md §6](data-model.md#§6--test-case-migration-map-fr-003--fr-017--r6) N1+N2).

**Pass criterion**: Zero failures. The migrated cases produce the same `path` / `code` / `message` per-issue triples as their pre-010 originals (verified by character-equivalent message text).

---

## S-4 — Strict-mode boundary case (CI; FR-002 / R4)

**Goal**: Verify the post-010 schema rejects unknown top-level keys with `code: "unrecognized_keys"` (the strict-mode carve-out at FR-002).

**Steps**:
1. Run `vitest run src/target-mode/target-mode.test.ts -t "unrecognized_keys"`.
2. Verify the new case (data-model.md §6 N1) passes:
   ```ts
   const r = targetModeSchema.safeParse({ target_mode: "active", random: "x" });
   expect(r.success).toBe(false);
   expect(r.error!.issues).toHaveLength(1);
   expect(r.error!.issues[0].code).toBe("unrecognized_keys");
   expect((r.error!.issues[0] as any).keys).toEqual(["random"]);
   expect(r.error!.issues[0].path).toEqual([]);
   ```

**Pass criterion**: The case passes with the assertions above. The issue path is `[]` (root-level), the `keys` array names the offending key, and the issue code matches zod's `unrecognized_keys`.

---

## S-5 — Helper preserves `.strict()` through `.extend()` (CI; R2)

**Goal**: Verify `applyTargetModeRefinement(targetModeBaseSchema.extend({ note_text: z.string() }))` preserves `.strict()` semantics — research R2's empirical finding.

**Steps**:
1. Run `vitest run src/target-mode/target-mode.test.ts -t "extend preserves strict"` (or wherever the post-010 test is named).
2. Verify the new case (data-model.md §6 N2 — happy path) plus an additional boundary case asserting that an unknown key on the extended schema is rejected.

**Pass criterion**: The extended schema accepts `{ target_mode: "specific", vault: "V", file: "F", note_text: "x" }` and rejects `{ target_mode: "active", note_text: "x", typo_field: "y" }` with `code: "unrecognized_keys"`.

---

## S-6 — `_shared.ts` shrinkage and `oneOf` absence (CI; SC-007)

**Goal**: Verify [src/tools/_shared.ts](../../src/tools/_shared.ts) shrinks to ≤ 100 lines and contains zero matches for `oneOf`.

**Steps**:
1. `wc -l src/tools/_shared.ts` — should report ≤ 100 (target: ~75).
2. `grep -n oneOf src/tools/_shared.ts` — should report zero matches.

**Pass criterion**: Both checks pass. The wrap-branch synthesis is gone; `toMcpInputSchema` is a one-line delegate (or absent if `_register.ts` inlines the call).

---

## S-7 — `_register.test.ts` consolidation (CI; SC-008)

**Goal**: Verify [src/tools/_register.test.ts](../../src/tools/_register.test.ts) shrinks by ≥ 150 lines from feature 009's 473 (target: ~270 LOC).

**Steps**:
1. `wc -l src/tools/_register.test.ts` — should report ≤ 320 (target: ~270).
2. Verify Pattern (b) fixture is gone: `grep -n "Pattern (b)\|fresh discriminated union" src/tools/_register.test.ts` should return zero matches.
3. Verify Pattern (a) fixture uses `.extend()`: `grep -n "targetModeBaseSchema.extend" src/tools/_register.test.ts` should match exactly the synthetic_pattern_a fixture.

**Pass criterion**: All three checks pass.

---

## S-8 — Aggregate test suite + coverage (CI; SC-009)

**Goal**: Verify the full test suite passes and aggregate statements coverage is preserved or raised.

**Steps**:
1. Run `vitest run --coverage`.
2. Verify zero test failures.
3. Verify the aggregate statements coverage equals or exceeds the threshold pinned in [vitest.config.ts](../../vitest.config.ts) (`84.3` pre-feature; potentially ratcheted upward per R9).
4. Verify statement coverage on `src/tools/_shared.ts` is `100%` (the file is small enough post-feature that complete coverage is trivial).

**Pass criterion**: All four checks pass.

---

## S-9 — Type-check clean (CI; Constitution Technical Standards)

**Goal**: Verify `tsc --noEmit` passes with strict mode.

**Steps**:
1. Run `npm run typecheck`.

**Pass criterion**: Zero errors. Notable assertions: `TargetMode` is the flat type at [data-model.md §3](data-model.md#§3--zinfertypeof-targetmodeschema-typescript-shape); the six deleted exports cause `tsc` errors anywhere they are still imported (acts as a dead-code finder during implementation).

---

## S-10 — Lint clean (CI; Constitution Technical Standards)

**Goal**: Verify `eslint` passes with zero warnings.

**Steps**:
1. Run `npm run lint`.

**Pass criterion**: Zero errors and zero warnings.

---

## S-11 — Cowork (strict-naive client) end-to-end (Manual; SC-001 / SC-002)

**Goal**: Verify `read_note` is callable end-to-end from Cowork (or any equivalent strict-naive MCP client) in both modes against a real Obsidian vault.

**Steps** (manual; once per release):
1. Build the package: `npm run build`.
2. Install locally: `npm install -g .` (or use `npm link`).
3. Configure Cowork to use `obsidian-cli-mcp` as an MCP server (per Cowork's MCP setup docs).
4. Open Cowork. Inspect `read_note` in the tool list. Verify the published `inputSchema` is the flat-object descriptor (no `oneOf`).
5. Invoke `read_note({ target_mode: "specific", vault: "<your-vault>", path: "<path-to-some-note>" })`. Verify it returns `{ content: <note-body> }`.
6. Activate a note in Obsidian (open it in the editor; make it the focused note).
7. Invoke `read_note({ target_mode: "active" })`. Verify it returns `{ content: <active-note-body> }`.

**Pass criterion**: Both invocations succeed. No `VALIDATION_ERROR` from the runtime; no client-side argument stripping; no fallback to `obsidian_exec({ command: "read", ... })`.

**Record**: The two passing invocations and their input/output payloads in the `0.2.2` release notes (per FR-012).

---

## S-12 — Claude Desktop / MCP Inspector (strict-rich client) end-to-end (Manual; SC-003)

**Goal**: Verify `read_note` is callable end-to-end from Claude Desktop or MCP Inspector (strict-rich, MCP SDK-shape consumer) in both modes.

**Steps** (manual; once per release):
1. Same `npm run build` + install steps as S-11.
2. Configure Claude Desktop's `claude_desktop_config.json` (or MCP Inspector's connection target) to point at the local build.
3. Restart Claude Desktop. Verify `read_note` appears in the tool list with no validation errors during MCP handshake.
4. (Optional but recommended) Open MCP Inspector at https://github.com/modelcontextprotocol/inspector; connect to the local build; verify the `tools/list` response shows `read_note`'s `inputSchema` as a flat object — no `oneOf`, no nested wrapping.
5. Invoke `read_note` in both modes (same as S-11 steps 5+7).

**Pass criterion**: Both invocations succeed. The MCP handshake completes without errors. The visible `inputSchema` in the inspector is the post-010 flat shape.

**Record**: As in S-11.

---

## S-13 — Deliberate-revert detector check (Manual; SC-012; once per release)

**Goal**: Verify the drift detector would fail under a deliberate revert. Performed once before merge as a sanity check that the detector observes what it claims to observe (the same exercise feature 009 ran for its T009 task).

**Steps** (manual; performed by the implementer, NOT in CI):
1. On a scratch branch, revert `src/target-mode/target-mode.ts` to its `0.2.1` content (the discriminated-union encoding).
2. Run `vitest run src/tools/_register.test.ts -t "read_note"` and `vitest run src/tools/_shared.test.ts`.
3. Observe the drift-detector cases fail with messages naming `read_note` and the offending invariant cell (e.g., `Tool 'read_note' inputSchema.properties keys (exact set): expected ["target_mode","vault","file","path"], got [...]`).
4. Discard the scratch branch (`git checkout -- src/target-mode/target-mode.ts` or `git switch <feature-branch>`).

**Pass criterion**: The detector fails with a message that points the developer at the source of the regression (which file regressed). The failure message MUST name `read_note` (not generic) and MUST name the offending cell (not just "tool failed invariant").

**Record**: The detector's failure message verbatim in the implementer's PR description (or in a comment on the post-merge `0.2.2` release notes), per the SC-012 / SC-005 / SC-006 narrative.

---

## SC-to-scenario mapping

| SC | Scenario(s) |
|---|---|
| SC-001 | S-11 (Cowork specific mode) |
| SC-002 | S-11 (Cowork active mode) |
| SC-003 | S-12 (Claude Desktop / MCP Inspector both modes) |
| SC-004 | S-3 (31 → 33 cases pass) |
| SC-005 | S-1 (read_note flat-object publication; both layers) |
| SC-006 | S-2 (obsidian_exec byte-stable) |
| SC-007 | S-6 (_shared.ts ≤ 100 lines, no oneOf) |
| SC-008 | S-7 (_register.test.ts ≤ ~270 LOC, Pattern (b) gone) |
| SC-009 | S-8 (vitest run --coverage; threshold preserved or raised) |
| SC-010 | (out-of-CI) implementer adds the `0.2.2` CHANGELOG entry per R8 |
| SC-011 | (out-of-CI) implementer amends ADR-003 in place per R7 |
| SC-012 | S-13 (deliberate-revert sanity check) |
| SC-013 | (out-of-CI) `git diff <baseline>..HEAD -- src/errors.ts .decisions/` shows zero new error codes and only modifications (no new ADRs added) |

---

## Run order

For the implementer working through `/speckit-implement`:

1. **CI scenarios in any order** during development: S-1, S-2, S-3, S-4, S-5, S-6, S-7, S-8, S-9, S-10. Re-run after each commit until all green.
2. **Pre-merge sanity check**: S-13 (deliberate-revert detector check) — once, on a scratch branch.
3. **Pre-release manual ladder**: S-11 (Cowork) + S-12 (Claude Desktop / Inspector) — once per release, against a real vault. Record results in `0.2.2` release notes.

If any CI scenario fails during development, the implementation is not done. If S-11 or S-12 fails at release time, ROLL BACK the release; the publication-pipeline regression must be diagnosed before re-cutting `0.2.2`.
