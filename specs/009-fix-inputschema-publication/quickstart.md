# Quickstart: Verifying the published-`inputSchema` fix

**Feature**: 009-fix-inputschema-publication
**Status**: Twelve verification scenarios mapped 1:1 to SC-001..SC-010 (plus three drift-detector / round-trip checks).

This document is the implementer's verification checklist. Each scenario maps to a specific success criterion; the entire checklist must pass before `0.2.1` is released. Scenarios are grouped by where they run (CI / manual / one-time-implementer-check).

---

## Scenarios that run in CI

### S-1 (FR-006 / SC-003) — `read_note` published `inputSchema` exposes target-mode keys

```bash
npx vitest run src/tools/_register.test.ts -t "tool read_note satisfies its invariant"
```

**Pass criteria**: assertions on `read_note`'s descriptor pass — `inputSchema.type === "object"`, `inputSchema.properties` includes `target_mode`, `vault`, `file`, `path`, `inputSchema.required` includes `target_mode`, `inputSchema.additionalProperties === true`.

**Fail signature** (when reverted to today's `_shared.ts`): `AssertionError: Tool 'read_note' inputSchema.properties keys → Expected [] to contain ["target_mode", "vault", "file", "path"]`. The error message names the missing property (per drift-detector contract Group 1).

---

### S-2 (FR-007 / SC-004) — `obsidian_exec` published `inputSchema` unchanged

```bash
npx vitest run src/tools/_register.test.ts -t "tool obsidian_exec satisfies its invariant"
```

**Pass criteria**: `obsidian_exec`'s descriptor matches the byte-stable shape — `properties` keys equals `{ command, vault, parameters, flags, copy, timeoutMs }`, `required === ["command"]`, `additionalProperties === false`. The widening MUST NOT have fired on the no-op branch.

**Fail signature** (if widening accidentally widens flat-`z.object`): `AssertionError: Tool 'obsidian_exec' inputSchema.additionalProperties → Expected true to be false`.

---

### S-3 (FR-008) — Same invariants pass through full SDK round-trip

```bash
npx vitest run src/tools/_register.test.ts -t "wire-side satisfies its invariant"
```

**Pass criteria**: `client.listTools()` (after `InMemoryTransport` round-trip) returns descriptors that satisfy the same invariants as Group 1. The MCP SDK preserves the envelope verbatim through wire serialization.

---

### S-4 (FR-003 / SC-009) — Pattern (a) consumer inherits the fix

```bash
npx vitest run src/tools/_register.test.ts -t "Pattern \\(a\\)"
```

**Pass criteria**: a synthetic tool whose schema is `targetModeSchema.and(z.object({ note_text: z.string() }))`, when registered through `registerTool`, publishes a descriptor whose `properties` contains all five keys (`target_mode`, `vault`, `file`, `path`, `note_text`) and whose `required` contains both `target_mode` and `note_text`.

---

### S-5 (FR-003) — Pattern (b) consumer inherits the fix

```bash
npx vitest run src/tools/_register.test.ts -t "Pattern \\(b\\)"
```

**Pass criteria**: a synthetic tool whose schema is a fresh discriminated union over write-note-shape bases (each branch has `note_text`) with a union-level `superRefine` publishes a descriptor whose `properties` contains all five keys.

---

### S-6 (R12) — `_shared.ts` wrap-branch widening unit cases

```bash
npx vitest run src/tools/_shared.test.ts
```

**Pass criteria**: all 11 cases pass (7 existing + 4 new).

The 4 new cases:

1. **Simple union** — bare `z.discriminatedUnion(...)` produces a wrap envelope with top-level `properties` containing every branch key, `oneOf` carrying both branches, `required: ["target_mode"]`.
2. **ZodEffects union** — `targetModeSchema` (the real primitive) produces the same shape.
3. **Pattern (a) intersection** — `targetModeSchema.and(z.object({ note_text: z.string() }))` produces a wrap envelope with `properties` including `note_text` and `required: ["note_text", "target_mode"]` (or order-equivalent).
4. **No-op branch unchanged** — `z.object({ command: z.string() }).strict()` produces byte-identical output to today's helper (regression guard for `obsidian_exec`-shape).

---

### S-7 (FR-004 / SC-005) — `targetModeSchema` runtime cases unchanged

```bash
npx vitest run src/target-mode/target-mode.test.ts
```

**Pass criteria**: all 31 existing cases pass without modification. The fix MUST NOT touch `target-mode.ts` or its test file.

---

### S-8 (SC-005) — Full project test suite + coverage threshold

```bash
npx vitest run --coverage
```

**Pass criteria**:

- Every test file passes.
- `vitest.config.ts`'s `test.coverage.thresholds.statements` is met or exceeded (the merge floor — single source of truth per Constitution §1.1.0).
- No coverage regressions vs. the pre-fix baseline. (The new test cases ADD coverage on `_shared.ts`'s wrap branch and on `_register.ts`'s descriptor path.)

---

### S-9 (Constitution Gate 1) — Lint clean

```bash
npm run lint
```

**Pass criteria**: zero warnings. The new code in `_shared.ts` and `_register.test.ts` follows project ESLint flat-config rules — no `any` in public signatures, no unused imports, no `import` cycles, no upward imports from `target-mode/` to `tools/` (Principle I).

---

### S-10 (Constitution Gate 2) — Typecheck clean

```bash
npm run typecheck
```

**Pass criteria**: `tsc --noEmit` exits 0. The new helper subroutines (`unionTopLevelProperties`, `intersectionTopLevelRequired`) have explicit parameter and return types; `JsonSchemaObject` references resolve correctly.

---

## Scenarios that run manually before release

### S-11 (FR-002 / SC-001) — `read_note` works in Cowork (strict-naive client)

**Steps** (live wire test):

1. Build: `npm run build && npm pack` → produces `marwansaab-obsidian-cli-mcp-0.2.1.tgz`.
2. Install the tarball as the local MCP server target in Cowork's client config.
3. From Cowork, request `tools/list`. Inspect `read_note`'s `inputSchema` — it MUST have a non-empty `properties` map at top level (Cowork's strict-naive validator preserves it).
4. Invoke `read_note({ target_mode: "specific", vault: "<vault>", path: "<note-path>" })` against a real Obsidian vault.
5. Invoke `read_note({ target_mode: "active" })` with the user's currently-focused note in the vault.

**Pass criteria**:

- Step 3: Cowork's view of `read_note`'s `inputSchema` shows `properties` with at least the four target-mode keys (or whatever Cowork preserves of them after its internal MCP `Tool` validation).
- Steps 4 and 5: each call returns `{ content: <note-body> }`; neither returns `VALIDATION_ERROR` or any other error.
- **Argument-stripping is NOT disabled in Cowork**. Disabling it is NOT a permitted workaround.

**Recording**: paste the wire-side `inputSchema` Cowork shows + a one-line confirmation that both invocations succeeded into the `0.2.1` release notes.

---

### S-12 (FR-002 / SC-002) — `read_note` works in Claude Desktop (strict-rich, MCP SDK client) — regression check

**Steps**:

1. Same install path as S-11.
2. Configure Claude Desktop to use the local server.
3. Repeat the two invocations (specific + active modes).

**Pass criteria**: both calls succeed (Claude Desktop is the negative-regression check — the fix MUST NOT break strict-rich clients that already worked correctly under `0.2.0`'s pure `oneOf` envelope).

**Recording**: pass/fail in the `0.2.1` release notes.

---

## One-time implementer check (NOT in CI per SC-010)

### S-13 (SC-010) — Drift detector fails when widening is reverted

**Steps**:

1. Confirm S-1 passes on the fixed source.
2. `git stash` (or comment out) the new widening logic in `src/tools/_shared.ts` — reverting the wrap branch to today's emit (the helper goes back to producing `{ type: "object", additionalProperties: true, oneOf: [...], $schema }` without the new `properties` and `required` top-level keys).
3. Re-run `npx vitest run src/tools/_register.test.ts -t "tool read_note"`.
4. Confirm the test FAILS with a message naming the missing property (`target_mode` or one of the four).
5. `git stash pop` to restore the widening.
6. Re-run the test; confirm it passes again.

**Pass criteria**: the detector observes the pre-fix shape (empty `properties`, no top-level `required`) and reports the gap. This proves the test would catch a future regression that re-introduces the bug.

**Recording**: a one-line confirmation in the PR description: `S-13 verified manually — detector fails when widening is reverted (commit-time check)`.

---

## Summary table

| Scenario | Layer | Where it runs | Spec ID |
|---|---|---|---|
| S-1 | unit (registry) | CI | FR-006, SC-003 |
| S-2 | unit (registry) | CI | FR-007, SC-004 |
| S-3 | integration (SDK round-trip) | CI | FR-008 |
| S-4 | unit (synthetic Pattern (a)) | CI | FR-003, SC-009 |
| S-5 | unit (synthetic Pattern (b)) | CI | FR-003 |
| S-6 | unit (helper kinds A–E) | CI | R12 |
| S-7 | unit (target-mode runtime) | CI | FR-004, SC-005 |
| S-8 | full suite + coverage | CI | SC-005 |
| S-9 | lint | CI | Gate 1 |
| S-10 | typecheck | CI | Gate 2 |
| S-11 | live wire (Cowork) | manual, before release | FR-002, SC-001 |
| S-12 | live wire (Claude Desktop) | manual, before release | FR-002, SC-002 (regression) |
| S-13 | revert-and-retry | one-time, by implementer | SC-010 |

All thirteen MUST pass before `0.2.1` is published.
