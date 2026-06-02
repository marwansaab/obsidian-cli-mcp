# Quickstart: Verify Cross-Vault Routing

How to execute and validate this feature. It is verification + documentation reconciliation — there is no new tool to call. "Done" means: every eval-composed read/query tool's specific-mode path has its own forcing-gate evidence, and every doc reflects that evidence.

## Prerequisites

- Read `.memory/test-execution-instructions.md` first (authorised vault, scratch dir, destructive-probe protocol).
- **Drive `Obsidian.com`** (production-resolved console shim), never the GUI `Obsidian.exe` (detached stdio → false-clean empty exit 0).
- Two vaults registered and open: **A** = the focused/"other" vault (e.g. `The Setup`); **B** = `TestVault-Obsidian-CLI-MCP`, open but **not** focused.
- **Clean git working tree** before any doc edit (`git status` clean). Rollback path: `git restore .`.

## 1. Confirm the at-risk set (Step 0 — already done, re-confirm if handlers changed)

```bash
# Each at-risk tool issues command: "eval"; native-wrappers issue a native subcommand.
rg 'command:' src/tools/*/handler.ts
```
Expect the nine eval read/query tools (backlinks, links, read_heading, find_by_property, tag, paths, pattern_search, smart_connections_query, smart_connections_similar) to show `command: "eval"`; read/read_property/outline/search/context_search/bases/files/properties/views_base to show native subcommands. See research.md D1.

## 2. Per-tool forcing-gate probe (the core loop)

For each of the nine at-risk tools, on its **specific/`vault=` path only**:

1. Stage a B-only discriminator in `TestVault-Obsidian-CLI-MCP/Sandbox/` (per-tool item from [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md)).
2. Focus vault A; confirm B is open but not focused.
3. Call the tool with `vault=B` targeting the discriminator.
4. **PASS** = the result reflects **B's** content **and focus stays on A** (a `vault=B` read routes into B but does not move focus — do NOT treat unchanged focus as failure).
5. **FAIL (hard stop)** = the result reflects A (the B-only item is missing / A's value returned) — a silent wrong-vault read. Record; this tool is `LIMITATION_*`.
6. Record the run (tool, focused vault, target vault, discriminator, call, returned-from, verdict) in `contracts/t0-probe-findings.md`.

**Do NOT probe active mode as a limitation** — for tools with `target_mode: "active"`, the focused-vault active path is correct by design and stays (research.md D3).

## 3. Apply the doc correction (gated on the tool's own probe)

Per [contracts/doc-correction-contract.md](contracts/doc-correction-contract.md):

- **Group 1** (`read_heading`, `tag`, `paths`, `backlinks`, `links`) — on `ROUTING_CONFIRMED`, remove the *"open the target vault in Obsidian before invoking `<tool>`"* precondition; keep the same-display-name collision as the real, scoped limitation.
- **Group 2** (`find_by_property`, `pattern_search`, `smart_connections_query`, `smart_connections_similar`) — confirm the already-accurate framing; tighten only if any wording implies the named-`vault` path needs focus.
- **Native-wrappers** — grep for any focus-first line; correct without eval/B1 framing (`views_base`'s focused-`.base` requirement is correct and stays).

## 4. Update the shared register

In `.architecture/Obsidian CLI - Upstream Issues and Limitations.md`, update B1's affected-features list (B1 removed per `ROUTING_CONFIRMED` tool; native-wrappers recorded as never-a-victim) and mitigation status once the sweep completes.

## 5. Validate (acceptance mapping)

| Check | Maps to |
|-------|---------|
| Each of the nine at-risk tools returns B's content under `vault=B` with A focused | US1 / SC-002 / FR-001, FR-002 |
| Every Group-1 doc no longer says "focus the target vault first" | US2 / SC-003 / FR-006 |
| Every genuine residual limitation (same-name collision) stated accurately, distinct from the removed precondition | US2 / SC-004 / FR-007, FR-008 |
| No probe returned A silently; any genuine limitation has a signal (reused) or a recorded deferral | US3 / SC-005 / FR-010, FR-012 |
| Each correction cites that tool's own probe row | US4 / SC-001 / FR-003 |
| Active-mode/focused-only behaviour and docs unchanged | US4 / SC-006 / FR-004 |
| `git diff` shows zero new error codes / reasons; if any handler touched, only an existing signal wired + its co-located test | FR-013 / SC-007 / Principle II, IV |

## 6. Quality gates (only if a handler was touched)

If the expected docs-only outcome holds, the standard gates are not exercised by code. If a `LIMITATION_SIGNALLED` verdict wired an existing signal into a handler:

```bash
npm run lint && npm run typecheck && npm run build
# coverage-safe Windows run (see project memory):
mkdir -p coverage/.tmp && npx vitest run --coverage --pool=forks --no-file-parallelism
```

## Restore

Restore vault A's focus after the probes. Do not close or reconfigure any vault. Clean up `Sandbox/` fixtures; tab residue in the test vault is harmless and closeable.
