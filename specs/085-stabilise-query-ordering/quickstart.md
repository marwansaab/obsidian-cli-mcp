# Quickstart: validate stable query ordering

Run from the repository root, in PowerShell.

## 1. Automated gate

```powershell
npx vitest run src/tools/smart_connections_query src/tools/smart_connections_similar
npm run typecheck; npm run lint
npm test
```

Expected:
- the new `_template.test.ts` rows pass: T1–T9 for `smart_connections_query`, T10–T15 for `smart_connections_similar`;
- each tool's existing `handler.test.ts`, `index.test.ts` and `schema.test.ts` pass unedited, apart from the new S1/S2 and S4/S5 cases.

**Red check (proves the tests catch the bug)**:
1. Temporarily put `filter:{limit:a.limit}` back in `smart_connections_query/_template.ts`, and `find_connections({limit:a.limit})` back in `smart_connections_similar/_template.ts`.
2. These rows must fail: T1, T2, T4 and T5 for `smart_connections_query`; T10, T11, T12 and T13 for `smart_connections_similar`.
3. Undo both changes afterwards.

## 2. Surface gate

```powershell
npm run baseline:write
git diff src/tools/_register-baseline.json
```

Expected (contract S3):
- Among the fingerprints, exactly two lines change: the `descriptionFingerprint` of `smart_connections_query` and of `smart_connections_similar`.
- The envelope metadata `generatedFromBranch` (and `generatedAt` on a new date) also changes. This is expected.
- If any other fingerprint moves, stop: a schema or another tool changed by accident.

## 3. Optional live check (read-only)

`TestVault-Obsidian-CLI-MCP` has no plugins (see `.memory/test-execution-instructions.md`), so it cannot run Smart Connections. If a vault with Smart Connections installed and indexed is open, run these read-only calls through the built server (`npm run build`, then an MCP client) against it:

1. Call `smart_connections_query` with `{ "query": "<any phrase>", "vault": "<that vault>", "limit": 1 }`.
2. Make the same call with `"limit": 2`, `"limit": 20` and `"limit": 100`.
3. Check that each shorter result list is exactly the start of each longer one: the same `path`, `headingPath` and `score`, in the same order.
4. Repeat steps 1–3 with `smart_connections_similar`, using `{ "target_mode": "specific", "vault": "<that vault>", "path": "<an indexed note>.md", "limit": … }`.
5. Note whether every call returned within the timeout (SC-005).

These calls write nothing. If no such vault is available, skip this step and record SC-005 as unverified in `post-implement.md`, citing the fallback evidence in spec SC-005. Section 1 is the proof of record for everything else.
