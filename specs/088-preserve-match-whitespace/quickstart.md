# Quickstart: validate untrimmed match text

**Contract**: [contracts/match-whitespace-contract.md](contracts/match-whitespace-contract.md) | **Data model**: [data-model.md](data-model.md)

## 1. Automated gate

From the repository root, in PowerShell:

```powershell
npm run typecheck
npm run lint
npx vitest run src/tools/context_search src/tools/search src/tools/_surface.test.ts src/tools/_register.test.ts src/tools/_plugin-noise.test.ts
npm test
```

Expected: all green.

- Rows T1–T9, R1–R16, L9–L10 and H20–H35 pass.
- The edited existing tests pass, with only the approved edits applied (contract §E).
- Search's suites pass unedited (P3).

**Red check** (before the fix is complete): with the read-back skipped, H20, H21, H23, H25, H26 and H27 must fail, because they get the trimmed text. With the trim-equality check removed, H32 and R7 must fail.

## 2. Surface gate

```powershell
npx vitest run src/tools/_register.test.ts
git diff --exit-code main -- src/tools/_register-baseline.json src/tools/context_search/index.ts src/tools/search/handler.ts
git diff main -- src/tools/context_search/schema.ts
```

Expected:
- The fingerprint test passes without `npm run baseline:write`.
- The first diff prints nothing (P1–P3).
- The second diff shows only added lines for the read-back answer schema, its type and the header comment. The input and output schemas keep the bytes they have at HEAD `03594f1`. `schema.ts` stays out of the exit-code diff, because T010 changes it on purpose.

## 3. Required live check (research D8)

Read `.memory/test-execution-instructions.md` first.

1. `npm run build`.
2. Create the fixtures listed in the contract's live column under `Sandbox/088-live-<stamp>/` through Obsidian, with `app.vault.create` in an `eval`. Wait until `search:context` lists them.
3. Call the built server's `context_search` over stdio, with `vault: "TestVault-Obsidian-CLI-MCP"` and `folder` set to the fixture folder, for the query `zqx`. Do the 300-note case separately, with `limit: 300`.
4. Compare every `text` with the live column, and check `count` and `truncated`. Record the wall time of each `context_search` call, from request to response, and the number of read-back evals the server spawned. Then run one more timed call with `limit: 1000` over the 300-note folder plus the other fixtures. These numbers feed the help page's Latency note; they are measurements, not a pass/fail gate.
5. Remove the fixture folder, confirm `Sandbox/` is back to its pre-run entries and `Welcome.md` is present, and record the results verbatim in `post-implement.md`.
