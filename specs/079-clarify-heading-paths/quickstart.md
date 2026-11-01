# Quickstart: validate the heading-path documentation

**Feature**: [spec.md](spec.md) | **Contract**: [contracts/heading-path-wording-contract.md](contracts/heading-path-wording-contract.md)

## §1 Automated gate

```bash
npm run typecheck
npm run lint
npm test
```

Expected: all pass. The new assertions in `src/tools/read_heading/index.test.ts`, `src/tools/patch_heading/index.test.ts` and `src/tools/patch_heading/heading-walk.test.ts` cover contract §1–§3 and data-model invariants I1–I4. The existing schema and handler tests pass unchanged, which confirms I5 (runtime text unchanged).

## §2 Baseline check

```bash
npm run baseline:write
git diff src/tools/_register-baseline.json
```

Expected: only the `descriptionFingerprint` and `schemaFingerprint` of `read_heading` and `patch_heading` change (contract §5). Commit the regenerated baseline in the same change.

## §3 Live check (test vault)

Read `.memory/test-execution-instructions.md` first. Use only `TestVault-Obsidian-CLI-MCP`, write fixtures under `Sandbox/` with a unique name, and clean up afterwards. Build with `npm run build`, then drive the built server through an MCP client.

Seed `Sandbox/079-<run-id>-paths.md`:

```markdown
# Project
## Tasks
### Today
Ship it.
# Other
### Orphan
Skipped level.
```

and `Sandbox/079-<run-id>-noh1.md`:

```markdown
## Section
### Sub
No level-1 heading.
```

| # | Call | Expected |
|---|---|---|
| 1 | `read_heading` `heading: "Project::Tasks::Today"` on `-paths.md` | `{ "content": "Ship it.\n" }` |
| 2 | `read_heading` `heading: "Tasks::Today"` on `-paths.md` | `CLI_REPORTED_ERROR`, `details.code: "HEADING_NOT_FOUND"` |
| 3 | `read_heading` `heading: "Other::Orphan"` on `-paths.md` | `HEADING_NOT_FOUND` (skipped level) |
| 4 | `read_heading` `heading: "Section::Sub"` on `-noh1.md` | `HEADING_NOT_FOUND` (no level-1 heading) |
| 5 | `patch_heading` `heading_path: "Tasks#Today"`, `mode: "append"` on `-paths.md` | `HEADING_NOT_FOUND`; file unchanged |
| 6 | `patch_heading` `heading_path: "Project#Tasks#Today"`, `mode: "append"`, `content: "Done.\n"` on `-paths.md` | success; `Done.` lands under `### Today` |
| 7 | `help` `tool_name: "read_heading"` and `help` `tool_name: "patch_heading"` | pages show the *Heading-path rule* section, the unreachable list and the new failing-path example |
| 8 | `tools/list` | both descriptions contain the contract §2 text; neither contains "top-level headings are out of scope" |

Cases 1–4 confirm that the `read_heading` rule the documentation states matches Obsidian's live behaviour (research F1); `read_heading` has no unit-level pin. Report cases attempted, passing and failing, and quote any failure output verbatim. Delete both fixtures afterwards.
