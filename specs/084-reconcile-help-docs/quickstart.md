# Quickstart: Validate Reconcile Help Documentation

**Feature**: [spec.md](spec.md) | **Contract**: [contracts/help-reconciliation-contract.md](contracts/help-reconciliation-contract.md)

Run from the repository root in PowerShell. §1 and §2 need no Obsidian. §3 touches the real CLI: read [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) first and use only `TestVault-Obsidian-CLI-MCP`.

## §1 Automated gate

```powershell
npm run typecheck; if ($?) { npm run lint }; if ($?) { npm test }
```

Expected:
- `src/tools/help/docs-sync.test.ts` passes: the self-tests H3–H5, and the real check H1–H2 with empty drift lists.
- `help/handler.test.ts` H6 passes for `list_notes` and `search_vault`.
- `rename/schema.test.ts` and `rename/index.test.ts` pin `move` (N1).
- `create_base/index.test.ts` C1–C10 pass. The existing empty-`base_path` assertion (`details.issues`) passes unchanged.
- `context_search/handler.test.ts` H7 and the new `context_search/index.test.ts` case pin the missing-folder error (contract S1a, S1b).
- No other test file changes beyond the new `docs-sync.test.ts` and those listed in [plan.md](plan.md) → Test-edit scope.

Negative check of the guard (local only, never committed): copy any page to `docs/tools/zzz_phantom.md` and re-run `npx vitest run src/tools/help/docs-sync.test.ts`. It must fail and name `zzz_phantom`. Delete the copy.

## §2 Published-surface gate

```powershell
npx vitest run src/tools/_register.test.ts
```

Expected: the FR-018 fingerprint test passes **without** `npm run baseline:write` (contract §6). If it fails, a description or schema moved: stop and find out why.

Example re-validation (contract X1–X2): re-run the example probe (tasks T002) against the edited pages. It covers both call blocks (`{ "name", "arguments" }`) and bare-argument blocks (attributed to the page's own tool), and skips `<…>` templates. Every validated block without a failing label must parse. The failing-labelled blocks are `context_search` Ex. 6, `search` Ex. 7, `properties` Ex. 5, `pattern_search` Ex. 4, `read_heading` Ex. 4, `vaults` Ex. 3, `views_base` Ex. 7, `rename` (vi) and `write_note` (iv)'s legacy form. Each must show the error its input actually returns.

## §3 Live checks (T0, test vault only)

Confirm that `TestVault-Obsidian-CLI-MCP` is the vault open in Obsidian (test-execution instructions, steps 1–4). These calls only read, or are refused at validation.

| ID | Call | Expected |
|---|---|---|
| L1 | `help` with no arguments | index lists exactly the 35 tools from `tools/list`; no `list_notes` / `search_vault` |
| L2 | `help { tool_name: "search_vault" }` | `isError`, `HELP_TOOL_NOT_FOUND`, `availableTools` without either phantom |
| L3 | `context_search { vault: "TestVault-Obsidian-CLI-MCP", query: "anything", folder: "DoesNotExist-084" }` | `CLI_REPORTED_ERROR`, `message: "CLI bridge upstream error: CLI_REPORTED_ERROR"`, `details.command: "folder"`, `details.message: "Error: Folder \"DoesNotExist-084\" not found."`, matching `context_search.md` Example 4 field for field |
| L4 | `create_base { vault: "TestVault-Obsidian-CLI-MCP", base_path: "Sandbox/x.md", name: "x" }` | refused before any spawn: `details.code: "INVALID_BASE_PATH"`, `details.reason: "wrong-extension"`, `details.field: "base_path"`; nothing created |
| L5 | `rename { target_mode: "specific", vault: "TestVault-Obsidian-CLI-MCP", path: "Sandbox/none.md", name: "a/b" }` | `VALIDATION_ERROR` whose issue message names `move`; nothing renamed |

The server must be rebuilt (`npm run build`) and restarted before §3, so that the running `obsidian-cli-mcp` serves the edited `docs/tools/`.
