# Quickstart: Omit Derived Labels

**Feature**: [spec.md](spec.md) | **Rule**: [contracts/display-label.md](contracts/display-label.md) | **Rows**: [data-model.md](data-model.md)

## Automated gate

```sh
npm run typecheck
npm run lint
npx vitest run src/tools/links
npx vitest run src/tools/_register.test.ts   # fingerprint baseline
npm test                                     # full suite, Linux and Windows CI
```

Expected:

- The new template-execution test passes for all 27 data-model rows.
- `index.test.ts` finds the new rule sentence in the description and no `" > "`-shape caveat.
- The baseline test passes after `npm run baseline:write`, and `git diff src/tools/_register-baseline.json` shows only `links.descriptionFingerprint` moving.

## Manual scenarios (live vault)

Follow `.memory/test-execution-instructions.md` first. Seed `Sandbox/<run-id>/Src.md` and `Sandbox/<run-id>/Tgt.md` (with `# Head` and a `^blk` block), then call `links` with `{ "target_mode": "specific", "vault": "TestVault-Obsidian-CLI-MCP", "path": "Sandbox/<run-id>/Src.md" }`.

| Story | Put in `Src.md` | Expect |
|---|---|---|
| US1 | `[[Tgt#Head]]`, `[[Tgt#^blk]]`, frontmatter `related: "[[Tgt#Head]]"` | three entries, no `displayText` |
| US2 | `![[Tgt#Head]]`, `![[Tgt#^blk]]`, `![[paper.pdf#page=3]]` | three `embed` entries, no `displayText` |
| US3 | `[[Tgt#Head\|Custom Display]]`, `[[Tgt#^blk\|Other Label]]`, `[[Tgt\|Alias]]`, `[[Tgt#Head\|Tgt > Head]]` | labels `Custom Display`, `Other Label`, `Alias`, `Tgt > Head` |
| US4 | `[[Tgt]]`, `![[img.png]]`, `![[img.png\|300]]`, `[See](Tgt.md)` | no label, no label, `300`, `See` |
| FR-004a | `[[Tgt\|]]`, `[[Tgt#Head\| ]]` | no `displayText` |
| US5 | read `docs/tools/links.md` and the `links` tool description | one rule, no CAVEAT, no regex workaround, no "embeds omit" claim |

Then call again with `"total": true` and check that `count` equals the number of entries above. Remove the `Sandbox/<run-id>/` folder afterwards.
