# Quickstart: validate section and block placement on mixed line endings

Run from the repository root, in PowerShell. Rows are defined in [contracts/placement-contract.md](contracts/placement-contract.md).

## 1. Automated gate

```powershell
npx vitest run src/tools/_note-lines.test.ts src/tools/patch_heading src/tools/patch_block
npm run typecheck; npm run lint
npm test
```

Expected:

- the new rows pass: N1–N9, H1–H12, B1–B6, U1, U2 and S5;
- the existing `handler.test.ts`, `handler.bytes-written.test.ts`, `index.test.ts`, `schema.test.ts`, `heading-walk.test.ts` and `block-scan.test.ts` of both tools pass unedited (U3);
- `body-edit.test.ts` and `block-edit.test.ts` pass with only their `detectLineEnding` blocks removed (research D2). Under the owner's conditional approval, they pass unedited if a caller of `detectLineEnding` remains in `src/` (the fallback, tasks T007 and T013).

**Red check (proves the tests catch the bug)**:

1. Temporarily restore the old split in one handler: `const lines = trimmedForSplit.split(lineEnding === "crlf" ? /\r\n/ : "\n")`, with the file-wide `detectLineEnding`.
2. H1–H5 (or B1–B2) must fail. With the placement check in place, they fail as `UNSAFE_PLACEMENT` refusals, not as wrong writes.
3. Comment out the check as well: H1–H5 must then fail on wrong bytes.
4. Undo every change.

## 2. Surface gate

```powershell
npm run baseline:write
git diff src/tools/_register-baseline.json
npx vitest run src/tools/_register.test.ts
```

Expected (S1): among the fingerprints, exactly two lines change: the `descriptionFingerprint` of `patch_heading` and of `patch_block`. These record `UNSAFE_PLACEMENT` joining each description's typed-error enumeration. Any other moved line (title, annotations, input or output schema) is a defect. `_register.test.ts` passes after the regeneration.

Also check `git diff --stat`:

- `src/errors.ts` is unchanged (S4);
- `docs/tools/patch_heading.md` and `docs/tools/patch_block.md` changed (S2, S3).

## 3. Optional live check (T0 style)

Read `.memory/test-execution-instructions.md` first. Use only `TestVault-Obsidian-CLI-MCP`, write only under `Sandbox/`, and clean up afterwards. Use the built server (`npm run build`) through an MCP client, or the `obsidian-cli-mcp-local` server if it points at this checkout.

1. **Seed**: create `Sandbox/086-mixed-<timestamp>.md` with CRLF line endings throughout. Give it a frontmatter (`status: draft`), and `# Top` / `## First` / `## Middle` / `## Last` headings with distinct bodies. Add a paragraph ending ` ^p086` under `## First`.
2. **Mix**: call `set_property` on it (`status` → `review`). Confirm on disk (`Format-Hex` or `[IO.File]::ReadAllBytes`) that the frontmatter lines now end in LF and the body lines still end in CRLF. If the note is still uniform, record that the mix was not reproduced this way, and seed the mix directly.
3. **Copy**: save the note's bytes.
4. **Heading edit**: call `patch_heading` with `heading_path: "Top#Last"`, `mode: "replace"` and `content: "replaced"`. Then:
   - the bytes up to the end of the `## Last` line equal the copy;
   - `replaced` follows it, ending in CRLF;
   - `read_heading` `Top#Last` returns `replaced`.
5. **Block edit**: call `patch_block` with `block_id: "p086"` and `content: "new para"`. Only that paragraph line changes, and it keeps ` ^p086`.
6. **Clean up**: delete the fixture, and leave `Sandbox/` as you found it.

**Before the fix** (optional, on `main`): step 4 writes `replaced` lines below `## Last`'s position (or at the end of the note), and the old body stays.

Record the outcome (run / not run, and the result) in `post-implement.md`.
