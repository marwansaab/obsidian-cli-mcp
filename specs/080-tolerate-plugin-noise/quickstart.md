# Quickstart: Tolerate plugin noise

**Feature**: [spec.md](spec.md) | **Contract**: [contracts/eval-answer-contract.md](contracts/eval-answer-contract.md)

## §1 Automated gate

```powershell
npm run typecheck
npm run lint
npm test
```

Expected: all green on Windows and Linux CI.

- `src/cli-adapter/_eval-answer.test.ts` (new): wrapping (A1), answer-line recognition (A2, A3, A5; `\r\n`; leading whitespace; U+2028 inside a JSON body does not split the line), and error-line scanning (C2, C3).
- `src/cli-adapter/_dispatch.test.ts`: contract D1–D6. Every existing case passes unchanged (head-anchored behaviour for non-eval commands).
- `src/cli-adapter/cli-adapter.test.ts`:
  - eval code is wrapped and `answer` is returned;
  - non-eval code is not wrapped;
  - C5 (`Vault not found.` skipped when an answer exists; unchanged otherwise);
  - two calls mint different tags.
- `src/tools/_eval-parse.test.ts` (new): `parseEvalAnswer` (absent, invalid, valid) and `stdoutDetails` E1–E5.
- `src/tools/_plugin-noise.test.ts` (new): contract N1–N13 for every eval-composed tool, through its registered handler.
- Existing tests: their fixtures pass unchanged through the tag-aware shared stubs (research D4). The expected rewrites are:
  - `_active-file.test.ts` (the parse tests and the bare-JSON fallback);
  - `_note-io.test.ts` (recordingSpawn tagging; the noisy case still logs `unexpected-output`, because its noise sits on the answer line);
  - the exact-`code=` assertions (research F6), which unwrap via `unwrapEvalCode`.
- `npm run baseline:write` then `git diff src/tools/_register-baseline.json`: **no** change (contract §5). Descriptions and schemas are untouched.

## §2 Live check (T0 probes, then end-to-end)

Read [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) first:

- use `TestVault-Obsidian-CLI-MCP` only;
- drive `Obsidian.com` (bare `obsidian`), never `Obsidian.exe`;
- capture stdout and stderr separately;
- put any fixtures under `Sandbox/080-<run>/`, never touch `Welcome.md`, and clean up afterwards.

The vault has no plugins, so noise is produced with `console.log` inside our own eval code (research F7).

**T0 probes (before writing code; research D6):**

1. **P1**: `obsidian vault=TestVault-Obsidian-CLI-MCP eval code="(async()=>'<<ocm-probe>>'+(await ((async()=>JSON.stringify({a:1}))())))()"`. Expect a single stdout line `=> <<ocm-probe>>{"a":1}`. If the value prints quoted, stop and escalate (research D6).
2. **P2**: `obsidian vault=TestVault-Obsidian-CLI-MCP eval code="(async()=>{console.log('noise-line');return '<<ocm-probe>>'+JSON.stringify({a:1});})()"`. Expect `noise-line` on a line before `=> <<ocm-probe>>{"a":1}`. Record whether it lands on stdout or stderr.
3. **P3**: with the test vault closed but registered, run the P1 command once. Record attempt 1's stdout (the cold-start signature) and confirm that an immediate second run answers.
4. **P4**: measure the wrapped `FOCUSED_FILE_TEMPLATE` `code=` element. Expect ≤ 250 characters.

Record the outputs verbatim in `specs/080-tolerate-plugin-noise/contracts/t0-probe-findings.md`.

**End-to-end (after implementation; `npm run build`, then an MCP client against the built server):**

1. With the test vault open, call `get_active_file`, `paths` (`folder: "Sandbox"`), `links` on a seeded `Sandbox/080-<run>/a.md`, and `read_heading` on the same note. Expect the same results as on `main` (no-noise regression; spec FR-010).
2. Close the test vault and call `open_file` on `Sandbox/080-<run>/a.md`. Expect success, through the single cold-start retry if needed (spec Story 2).
3. Delete the run folder.

Report each step's result, quoting failures verbatim.
