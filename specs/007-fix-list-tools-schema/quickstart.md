# Quickstart: Verify the `tools/list` Schema Fix

**Feature**: 007-fix-list-tools-schema
**Audience**: implementer (during `/speckit-implement`) and reviewer (during PR review)
**Time budget**: ~15 minutes after the fix is in place.

This file walks through every verification step needed to confirm the fix lands correctly and the regression is closed. Each scenario maps to one or more FRs / SCs from [spec.md](spec.md).

---

## Pre-flight

Before running any scenario, ensure:

```powershell
npm install
npm run typecheck    # Constitution gate #2
npm run lint         # Constitution gate #1
npm run build        # Constitution gate #3
```

All three MUST pass with zero warnings before any scenario below is meaningful.

---

## Scenario 1 — Helper produces well-formed envelopes (FR-002, P2, P3, P4)

```powershell
npx vitest run src/tools/_shared.test.ts
```

**Expected**: All co-located helper tests pass. Specifically:

- `toMcpInputSchema` returns a `z.object({...})` schema verbatim (no-op path).
- `toMcpInputSchema` wraps a discriminated-union zod into `{ type: "object", additionalProperties: true, oneOf: [...] }`.
- Top-level `anyOf` is rewritten to `oneOf`.
- `$schema` is preserved.
- The raw `zodToJsonSchema` output is not mutated.

**Why it matters**: this is the unit-level guarantee that the helper is correct in isolation. If this scenario fails, every downstream scenario will fail too.

---

## Scenario 2 — `targetModeJsonSchema` companion export shape (FR-002, FR-002a, SC-001)

```powershell
npx vitest run src/target-mode/target-mode.test.ts
```

**Expected**: The new assertions for `targetModeJsonSchema` pass:

- `targetModeJsonSchema.type === "object"`.
- `targetModeJsonSchema.oneOf` has length 2.
- Branch 0 declares `target_mode` const `"specific"` and requires `vault`.
- Branch 1 declares `target_mode` const `"active"`.
- The runtime `targetModeSchema` is unchanged (existing tests still pass — no regression).

**Why it matters**: This is the propagation guarantee. Future BIs that consume the primitive inherit the fix automatically.

---

## Scenario 3 — `read_note`'s published descriptor is now valid (FR-001, FR-002, AC#2 of Story 1)

```powershell
npx vitest run src/server.test.ts -t "registry consistency"
```

**Expected**: All three invariants in the `registry consistency` block pass:

- (a) every registered tool has a `docs/tools/<name>.md` file (existing — unchanged).
- (b) every registered tool's stripped `inputSchema` is description-free (existing — unchanged).
- (c) **every registered tool's `inputSchema.type === "object"` at the top level (NEW — should pass for all three currently registered tools: `help`, `obsidian_exec`, `read_note`).**

**Why it matters**: This is the regression test that catches the user's original bug. If invariant (c) fails for `read_note`, the fix did not propagate. If it fails for any other tool, a different regression has been introduced.

---

## Scenario 4 — `read_note` runtime semantics unchanged (FR-003, AC#1, AC#3, AC#4 of Story 2)

```powershell
npx vitest run src/tools/read_note/
```

**Expected**: All existing `read_note` tests pass without modification:

- `schema.test.ts`: parser accepts both branches; rejects XOR violations and forbidden-keys-in-active.
- `handler.test.ts`: handler routes through `invokeCli`, queues correctly, emits log events.
- `tool.test.ts`: registration descriptor + handler envelope.

**Why it matters**: Confirms FR-003 / FR-004 / FR-005 — the fix touches only the *published* schema; the runtime contract is frozen.

---

## Scenario 5 — Full test suite, full coverage (Constitution Gates #4, #5)

```powershell
npm test
```

**Expected**:

- Every test in the repo passes (zero failing assertions).
- Aggregate **statements** coverage in the V8 reporter meets the threshold in `vitest.config.ts`. The threshold MUST NOT be lowered as part of this fix (Constitution gate #5 — ratchet upward only).

**Why it matters**: Constitution gate #4 (test suite passes) + gate #5 (coverage threshold passes) — both must pass before merge.

---

## Scenario 6 — End-to-end: server boots and `tools/list` is loadable by a real client (SC-002)

This scenario is **manual** and is the user-visible acceptance check. Run the built server against a compliant MCP client:

```powershell
npm run build
node dist/index.js
# In another terminal, point an MCP client (MCP Inspector or Claude Desktop / Claude Code) at the running server.
# Issue tools/list. Confirm the response has all 3 tools and no validation error.
```

**Expected**:

- The client connects without complaint.
- `tools/list` returns three tools: `help`, `obsidian_exec`, `read_note`.
- Each tool's `inputSchema` field, as displayed by the client, has `"type": "object"` at the top level.
- The `read_note` tool's `inputSchema.oneOf` is rendered as two distinct invocation shapes in the client's UI (where the client supports that — e.g., MCP Inspector's schema preview).

**Why it matters**: This is the SC-002 verification — confirming the fix works against real clients, not just against the in-process registry test.

---

## Scenario 7 — Smoke-call each tool branch (FR-005, AC#1, AC#2 of Story 2)

After Scenario 6, in the same connected client:

1. Invoke `read_note` with `{ "target_mode": "specific", "vault": "MyVault", "file": "Note" }` against a real Obsidian vault. **Expected**: returns `{ content: <stdout> }` text envelope (success path).
2. Invoke `read_note` with `{ "target_mode": "active" }`. **Expected**: returns the active note's content.
3. Invoke `read_note` with `{ "target_mode": "specific", "vault": "MyVault", "file": "Note", "path": "Note.md" }` (XOR violation). **Expected**: `isError: true`, `code: "VALIDATION_ERROR"` — same error semantics as before.
4. Invoke `read_note` with `{ "target_mode": "active", "vault": "MyVault" }` (forbidden key in active). **Expected**: `isError: true`, `code: "VALIDATION_ERROR"` — same error semantics as before.

**Why it matters**: Confirms FR-005 (wire-level shapes unchanged) and AC#1–AC#4 of Story 2.

---

## Scenario 8 — Deliberate-malformation drill (SC-004)

This scenario is performed **once** during implementation to confirm the new invariant (c) actually catches the regression it is meant to catch. **Skip in normal CI.**

1. In a temporary local commit, modify [src/tools/_shared.ts](../../src/tools/_shared.ts) so `toMcpInputSchema` strips the `type: "object"` field from its output before returning (sabotage the fix).
2. Run `npx vitest run src/server.test.ts -t "registry consistency"`.
3. **Expected**: invariant (c) FAILS with a message naming `read_note` (and possibly `help`/`obsidian_exec` if the helper now sabotages all paths).
4. Revert the temporary commit before merging.

**Why it matters**: Confirms SC-004 — the guardrail genuinely blocks the regression, rather than passing for the wrong reasons.

---

## Scenario 9 — Version bump verification (FR-007)

```powershell
node -e "console.log(require('./package.json').version)"
```

**Expected**: prints `0.1.7` (or the next-greater patch version, if subsequent fixes have been added).

**Why it matters**: FR-007 — the fix is released as a patch increment so users can resolve the breakage by upgrading.

---

## Sign-off checklist

The fix is ready for merge when ALL of the following hold:

- [ ] Scenario 1 (helper unit tests) passes.
- [ ] Scenario 2 (`targetModeJsonSchema`) passes.
- [ ] Scenario 3 (registry-consistency Invariant (c)) passes for all three tools.
- [ ] Scenario 4 (`read_note` runtime regression) passes.
- [ ] Scenario 5 (full suite + coverage) passes.
- [ ] Scenario 6 (manual e2e against a real MCP client) succeeds.
- [ ] Scenario 7 (smoke-call each branch) matches expected outcomes.
- [ ] Scenario 8 (deliberate-malformation drill) was performed once; the test correctly failed and was then reverted.
- [ ] Scenario 9 (version bump) shows the patch increment.
- [ ] Constitution Compliance checklist (PR description) shows Y for all five principles.
