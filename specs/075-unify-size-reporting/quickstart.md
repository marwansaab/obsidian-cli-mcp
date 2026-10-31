# Quickstart: Unify Size Reporting

**Feature**: [spec.md](spec.md) | **Contract**: [contracts/bytes-written-contract.md](contracts/bytes-written-contract.md)

## §1 Automated gate

```powershell
npm run typecheck
npm run lint
npm test
```

Expected: all green on Windows and Linux CI. The handler tests cover every row of contract §3 for the tool it names, the write_note `stat`-failure case (contract §5), and the uniform "reported figure equals size after minus size before" check on all five writers (research D6).

## §2 Baseline check

```powershell
npm run baseline:write
git diff src/tools/_register-baseline.json
```

Expected: `outputSchemaFingerprint` changes for `append_note`, `patch_block`, `patch_heading`, `prepend` and `write_note`, and for nothing else. No other fingerprint changes on any tool (contract §6).

## §3 Live end-to-end check (optional, recommended)

Read [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) first:

- use the `TestVault-Obsidian-CLI-MCP` vault only;
- put fixtures under `Sandbox/` only, with a per-run unique name;
- never touch `Welcome.md`;
- clean up afterwards.

Build with `npm run build`, then drive the built server through an MCP client against that vault. For each step, record the file's size on disk before and after (`(Get-Item <path>).Length`) and compare `after − before` with the reported `bytes_written`:

1. `write_note` creates `Sandbox/075-<run>.md` with three lines of text. Expect `bytes_written` to equal the file's size and `created: true`.
2. `append_note` adds a line. Expect a positive delta that includes any separator.
3. `prepend` adds a line. Expect a positive delta.
4. `patch_heading`, using a note seeded with `# A` / `## B` and a body: `append`, then `replace` with same-size text, then `replace` with `""`. Expect a positive value, then 0, then a negative value.
5. `patch_block` on a `^blk` paragraph: replace it with longer, same-size and shorter text. Expect positive, 0 and negative.
6. `write_note` with `overwrite: true` replaces the note with shorter content. Expect a negative delta and `created: false`.

Expected: every reported figure equals the measured `after − before`. Then delete the fixtures and confirm `Sandbox/` is back to its prior state.
