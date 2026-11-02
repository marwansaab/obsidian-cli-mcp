# Quickstart: validating cross-vault Bases

## 1. Automated gate (PowerShell; vitest is blocked under the Bash sandbox)

```powershell
npm run lint; if ($?) { npm run typecheck }; if ($?) { npm run build }; if ($?) { npm test }
```

Expected: everything is green, and the statements coverage floor in `vitest.config.ts` holds. The rows in [contracts/bases-cross-vault-contract.md](contracts/bases-cross-vault-contract.md) §1–§5 each have a passing test.

## 2. Baseline gate

```powershell
npm run baseline:write; git diff --stat src/tools/_register-baseline.json
```

Expected: only the `bases`, `views_base` and `create_base` entries change (description and input fingerprints). No other tool's entry moves.

## 3. Live check (T0; read `.memory/test-execution-instructions.md` first)

Prerequisites:
- `TestVault-Obsidian-CLI-MCP` is open but **not** in front, with another vault in front.
- Fixtures under `Sandbox/P083-<run-id>/`: a plain `.base`, and a `.base` with `filters: {and: ['file.inFolder("Sandbox/P083-<run-id>/Items")']}` plus that `Items` folder.
- Capture the front vault with `Obsidian.com eval "code=app.vault.getName()"` before and after each call.

Run each step through the built server (`dist/index.js`) over an MCP client, or through the per-tool `handler` against real deps.

| Step | Call | Expect |
|------|------|--------|
| L1 | `bases {vault:"TestVault-Obsidian-CLI-MCP"}` | The test vault's Bases; front vault unchanged |
| L2 | `views_base {vault:"TestVault-…"}` with a fixture `.base` open in the test vault | Its views; front vault unchanged |
| L3 | `views_base {vault:"TestVault-…"}` with a note active in the test vault | `BASE_NOT_FOUND` / `not-open` with `details.vault` |
| L4 | `create_base {vault:"TestVault-…", base_path:<filtered>, name:"L4"}` | Item at `Sandbox/P083-<run-id>/Items/L4.md` in the test vault; nothing in the front vault. Front vault unchanged; repeat 3× (D7) |
| L5 | `create_base {vault:"TestVault-…", base_path:"Sandbox/P083-<run-id>/Missing.base", name:"x"}` | `BASE_NOT_FOUND` with `details.vault`; no item anywhere |
| L6 | each tool with `vault:"No-Such-Vault"` | `VAULT_NOT_FOUND` / `unknown` |
| L7 | `ITEM_FOLDER_TEMPLATE` rows T1–T5 (eval directly with `vault=TestVault-…`) | Envelopes as in contract §4 |
| L8 | Close the test vault's window (another vault stays open and in front), then `bases {vault:"TestVault-…"}` | The test vault's Bases; the call takes longer the first time (FR-004b, SC-006; research P2) |

**The plain `.base` with no folder filter puts items at the vault root (research P6).** Do not use it for `create_base` live calls unless you delete the root item immediately: the test vault forbids root writes. Afterwards, clean up `Sandbox/P083-<run-id>/` and confirm `Welcome.md` is intact.

If L4's front-vault check ever shows a switch, follow D7: document the side effect rather than asserting it away.
