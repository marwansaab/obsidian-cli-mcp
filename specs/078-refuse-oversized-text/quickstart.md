# Quickstart: Refuse Oversized Text on Add-to-Top

**Feature**: [spec.md](spec.md) | **Contract**: [contracts/prepend-size-limit-contract.md](contracts/prepend-size-limit-contract.md)

## §1 Automated gate

```powershell
npm run typecheck
npm run lint
npm test
```

Expected: all green on Windows and Linux CI.

- `src/tools/prepend/index.byte-cap.test.ts` (new) drives the registered tool handler through contract §3 B1–B16:
  - B1–B4, B11–B13, B16: `details` is exactly `{ code: "CONTENT_TOO_LARGE", reason: "bytes", contentBytes, maxBytes: 3072 }`, the message is exact, there is no `issues` array, and neither the registry stub nor the spawn spy is reached;
  - B5–B6: the character-limit error is byte-identical to today (no `reason`);
  - B7–B10, B14, B15: validation passes and the handler is reached (the registry-stub marker of `handler.test.ts:507`).
- `schema.test.ts`: the emoji-at-cap test is rewritten to expect the size-limit refusal (research F4). It is the only existing test whose expectation changes. New byte-boundary cases cover the `custom` issue and its `params.subReason`.
- `index.test.ts`: the description and the `content` description contain `MAX_CONTENT_BYTES` and "bytes".
- Every other prepend test (`handler.test.ts`, `handler.bi047.test.ts`, `handler.empty-body.test.ts`, `handler.not-found.test.ts`, `handler.file-type.test.ts`) passes unchanged (spec SC-004).

## §2 Baseline check

```powershell
npm run baseline:write
git diff src/tools/_register-baseline.json
```

Expected: only prepend's `descriptionFingerprint` and `schemaFingerprint` change (contract §5). Commit the regenerated baseline in the same change.

## §3 Live end-to-end check

Read [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) first: use `TestVault-Obsidian-CLI-MCP` only, put fixtures under `Sandbox/078-<run>/`, never touch `Welcome.md`, and clean up afterwards. Open `TestVault-Obsidian-CLI-MCP` in Obsidian, and confirm it with `obsidian eval code="app.vault.getName()"` before seeding (spec 077 quickstart §3).

Build with `npm run build`, then drive the built server through an MCP client:

1. Seed `Sandbox/078-<run>/target.md` with `"abc\n"` and record its bytes.
2. `prepend` 1,500 × `中` to it. Expect the size-limit error with `contentBytes: 4500`, `maxBytes: 3072` (contract B1), returned in under one second. Check that Obsidian shows no crash dialog, that `obsidian eval code="app.vault.getName()"` still answers, and that the note's bytes are unchanged (spec SC-001, SC-002, SC-003, SC-006).
3. `prepend` 1,024 × `中` (3,072 bytes) to it. Expect success with `bytes_written: 3073`, no dialog, and the note starting with the 1,024 characters followed by `"\n"` and then `"abc\n"` (spec FR-013, contract B8).
4. `prepend` 3,072 × `a` to it. Expect success, as today (contract B7).
5. `prepend` 3,000 × `a` + 24 × `中` (mixed script, 3,072 bytes) to it. Expect success with `bytes_written: 3073` and no dialog (spec US2 scenario 1, contract B14).
6. `prepend` 3,073 × `a`. Expect the unchanged character-limit error (contract B5).
7. Delete the run folder.

Report each step's result, quoting the failures verbatim.
