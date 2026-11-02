# Quickstart: validate note-name resolution in the editors

**Contract**: [contracts/note-name-contract.md](contracts/note-name-contract.md) | **Data model**: [data-model.md](data-model.md)

## 1. Automated gate

From the repository root, in PowerShell:

```powershell
npm run typecheck
npm run lint
npx vitest run src/tools/patch_heading src/tools/patch_block src/tools/_active-file src/tools/append_note src/tools/prepend src/tools/_surface.test.ts src/tools/_register.test.ts src/tools/_plugin-noise.test.ts
npm test
```

Expected: everything passes.

- In both new suites (`handler.note-name.test.ts`), rows N1–N9 pass.
- Every existing suite passes with no test file edited (contract §T, "Existing tests").

**Red check**: before the handler switch, write the two suites and run them against the unchanged handlers. N1–N5 and N9 must fail in both suites. The unchanged handlers make no `file` call, so the read goes to `<vault>/<name>` instead of the resolved path, and the queued responses do not line up with the spawns. N6, N7 and N8 may pass before the switch. They are regression rows.

## 2. Surface gate

```powershell
npx vitest run src/tools/_register.test.ts
git diff --exit-code main -- src/tools/_register-baseline.json src/tools/patch_heading/index.ts src/tools/patch_block/index.ts src/tools/patch_heading/schema.ts src/tools/patch_block/schema.ts src/errors.ts src/target-mode/target-mode.ts
```

Expected:

- The fingerprint test passes without `npm run baseline:write`.
- The diff prints nothing (contract P1–P3).

## 3. Required live check (research D6)

Read `.memory/test-execution-instructions.md` first.

1. `npm run build`.
2. Note the entry count of `Sandbox/`.
3. Seed these two notes:
   - `Sandbox/089-live/x/y/Live089.md`: `# Live089`, `## Tasks`, `- one`, and a paragraph ending ` ^live089`.
   - `Sandbox/089-live/z/Live089Dup.md`, plus a second `Live089Dup.md` under `Sandbox/089-live/x/`.
4. Through the built server (`node dist/index.js` over stdio, or the `obsidian-cli-mcp-local` connection, rebuilt), call these with `vault: "TestVault-Obsidian-CLI-MCP"` and the `file` locators shown:

   | Check | Call |
   |---|---|
   | L1 | `read` with `file: "Live089"` |
   | L2 | `patch_heading` with `file: "Live089"`, `heading_path: "Live089#Tasks"`, `mode: "append"`, `content: "- two\n"` |
   | L3 | `patch_block` with `file: "Live089"`, `block_id: "live089"`, `content: "replaced"` |
   | L4 | both editors with `file: "Live089Missing"` |
   | L5 | `read`, then both editors, with `file: "Live089Dup"` |

5. Compare each result with contract §L. After L2–L4, confirm with `Get-ChildItem -Recurse` that no new file appeared outside `089-live/`, and none inside it.
6. Remove `Sandbox/089-live/` and confirm the `Sandbox/` entry count matches step 2 and that `Welcome.md` is untouched.
7. Record cases attempted, passed and failed, with verbatim CLI output, in `post-implement.md`.
