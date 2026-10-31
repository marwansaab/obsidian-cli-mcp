# Quickstart: Fix Empty-Note Insertion

**Feature**: [spec.md](spec.md) | **Contract**: [contracts/prepend-empty-body-contract.md](contracts/prepend-empty-body-contract.md)

## §1 Automated gate

```powershell
npm run typecheck
npm run lint
npm test
```

Expected: all green on Windows and Linux CI.

- `src/tools/prepend/empty-body.test.ts` covers the predicate: empty note, properties-only note (LF, CRLF, no line break after the closing `---`), notes with a body, the ambiguous inputs (contract E10, E12), content ending with a line break, multi-byte content, and a note changed by another writer.
- `src/tools/prepend/handler.empty-body.test.ts` covers every contract §3 row against mocked `invokeCli` and fake fs: the note written, `bytes_written`, the metadata-cache refresh, and that nothing is written when the predicate is false. It also covers the three §4 failures: `writeAtomic` fails or an empty note's read-back fails (`details.reason: "extra-trailing-newline"`); a non-empty note's read-back fails (`syscall: "open"`, no reason); and the pre-call read fails (`syscall: "open"`, no reason, Obsidian not called), and the mirror check against `append_note` (spec FR-005).
- The existing `handler.test.ts`, `handler.bi047.test.ts`, `handler.file-type.test.ts` and `_surface.test.ts` pass unchanged (spec SC-004).

## §2 Baseline check

```powershell
npm run baseline:write
git diff --exit-code src/tools/_register-baseline.json
```

Expected: no diff. No published schema or description moves (contract §5).

## §3 Live end-to-end check

Read [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) first: `TestVault-Obsidian-CLI-MCP` only, fixtures under `Sandbox/076-<run>/`, never touch `Welcome.md`, and clean up afterwards.

Seed and read fixtures through `obsidian eval` (`app.vault.create(path, text)`, `JSON.stringify(await app.vault.adapter.read(path))`), not by writing the vault folder from the shell. This avoids host path handling, and Obsidian knows each file as soon as the call returns (research F9).

Build with `npm run build`, then drive the built server through an MCP client against that vault:

1. Seed four empty notes `e1.md` … `e4.md`, one properties-only note `fm.md` (`"---\nkey: v\n---\n"`), and one note `abc.md` (`"abc"`).
2. `prepend` `"first"` to `e1.md`. Expect the note to read back as exactly `"first"` and `bytes_written: 5` (contract E1).
3. `append_note` `"first"` to `e2.md`. Expect `e2.md` to equal `e1.md` byte for byte, with the same `bytes_written` (spec FR-005).
4. `prepend` `"first\n"` to `e3.md`. Expect `"first\n"` and `bytes_written: 6` (E3).
5. `prepend` `"first"` with `inline: true` to `e4.md`. Expect `"first"` and `bytes_written: 5` (E2).
6. `prepend` `"Lead"` to `fm.md`. Expect `"---\nkey: v\n---\nLead"` and `bytes_written: 4` (E5).
7. `prepend` `"def"` to `abc.md`. Expect `"def\nabc"` and `bytes_written: 4`, unchanged from today (E9).
8. Run the `docs/tools/prepend.md` empty-note worked example (`""` + `"def"`) and compare with what the page states (spec SC-005).
9. Remove `Sandbox/076-<run>/` with `app.vault.adapter.rmdir(path, true)` and confirm it is gone.

Report each step's result and any residue per the test-execution instructions.
