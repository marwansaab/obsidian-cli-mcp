# Quickstart: validate the active-file messaging fix

**Feature**: [spec.md](spec.md) | **Contract**: [contracts/get_active_file-messaging-contract.md](contracts/get_active_file-messaging-contract.md)

## Prerequisites

- Dependencies installed (`npm ci`).
- Run vitest through PowerShell, not the Bash tool: the Bash sandbox blocks vitest's worker processes.

## §1 Automated gate

```powershell
npx vitest run src/target-mode src/tools/get_active_file src/tools/files src/tools/paths
npm run typecheck; npm run lint; npx vitest run
```

**Expected**:

- Contract rows A1–A9 and U1–U5 pass in `target-mode.test.ts`, `get_active_file/schema.test.ts` and `files/schema.test.ts`. `paths`' existing tests pass with no edits.
- Rows F1–F3 pass in `get_active_file/index.test.ts`.
- The full suite is green.

## §2 Baseline gate

```powershell
npm run baseline:write
git diff --stat src/tools/_register-baseline.json
git diff src/tools/_register-baseline.json
```

**Expected**: exactly one changed line, `get_active_file`'s `descriptionFingerprint`. If any `schemaFingerprint` moved, or any other tool moved, the change is not scoped as planned. Stop and investigate.

## §3 Optional live check (no vault access)

Validation fails before any `obsidian` call, so this check reads and writes nothing. It still follows `.memory/test-execution-instructions.md` for the server process itself.

1. Run `npm run build`, then start the built server through an MCP client.
2. Call `get_active_file` with `{ "target_mode": "active", "path": "x.md" }`.
3. **Expected**: `isError: true`, `code: "VALIDATION_ERROR"`, and `details.issues[0].message` is `path is not allowed: the active file is the implicit target, so no note may be named`.
4. Call `help({ tool_name: "get_active_file" })`. **Expected**: the `name` row states `basename + "." + extension`, or just `basename` when `extension` is `""`.
