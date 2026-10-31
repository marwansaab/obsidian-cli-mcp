# Quickstart: Return Exact Content

**Feature**: [spec.md](spec.md) | **Contract**: [contracts/read-exact-content-contract.md](contracts/read-exact-content-contract.md)

## §1 Automated gate

```powershell
npm run typecheck
npm run lint
npm test
```

Expected: all green on Windows and Linux CI. The `read` handler tests cover every row of contract §2, the three locator modes, the unknown-vault ordering and the `FS_WRITE_FAILED` path (research D7).

## §2 Baseline check

```powershell
npm run baseline:write
git diff --stat src/tools/_register-baseline.json
git diff src/tools/_register-baseline.json
```

Expected: one changed entry, `read`'s description fingerprint (contract §5).

## §3 Live end-to-end check (optional, recommended)

Read [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) first:

- use the `TestVault-Obsidian-CLI-MCP` vault only;
- put fixtures under `Sandbox/` only;
- clean up afterwards;
- leave `Welcome.md` untouched.

1. `npm run build`.
2. Seed `Sandbox/t074/` with the byte fixtures of contract §2. Write them as raw bytes, for example with `[IO.File]::WriteAllBytes`.
3. Through an MCP client connected to `dist/index.js`, call `read` with `target_mode: "specific"`, `vault: "TestVault-Obsidian-CLI-MCP"` and `path: "Sandbox/t074/<name>.md"` for each fixture. Compare `content` with the "after" column, character for character.
4. Repeat one fixture (`nolf`) with `file: "nolf"`, and one with `target_mode: "active"` after opening it in Obsidian.
5. Round trip with every writer (User Story 4, FR-007, SC-003; research D7). After each write, `read` the note at once and compare `content`, character for character, with the note's bytes on disk (`[IO.File]::ReadAllBytes`, decoded as UTF-8, with any byte-order mark kept). The steps run in order on one note, `Sandbox/t074/rt.md`:
   1. `write_note` with `content: "first"` (no trailing line break). Expected: `"first"`.
   2. `append_note` with `content: "second"`.
   3. `prepend` with `content: "zero"`.
   4. `write_note` with `content: "# H\n\nbody ^blk\n\n## S\n\ntext"`, so there are a heading and a block to patch, and no trailing line break. Then `patch_heading` on `H::S` (replace), and `patch_block` on `blk` (replace).
   5. `set_property` with `name: "status"`, `value: "done"`.
   6. `find_and_replace` scoped to `path: "Sandbox/t074/rt.md"`, replacing `text` with `TEXT`, with `commit: true`.

   Each step: the read equals the disk content. At least one step leaves the note without a trailing line break. If it does not, run `write_note` with `content: "x"` and read again.
6. Remove `Sandbox/t074/`.

## §4 Story checks

| Story | Check |
|---|---|
| US1 | `nolf` → `"first"` (5 characters). |
| US2 | `lf` → `"first\n"`; `crlf` unchanged; `lflf` keeps both line feeds. |
| US3 | `empty` → `""`, and the read succeeds. |
| US4 | Every writer's round trip in §3 step 5 compares equal. |
| US5 | `docs/tools/read.md` has no added-line-break caveat and no "no BOM strip" claim, and `READ_DESCRIPTION` says "exact". |
