# Quickstart: validating `tags`

**Feature**: [spec.md](./spec.md) | **Contracts**: [contracts/](./contracts/) | **Data model**: [data-model.md](./data-model.md)

This is a validation guide: what to run and what to expect. Shapes and rules live in the contracts. Implementation lives in tasks.

## Prerequisites

- `npm ci` has been run, on Node ≥ 22.11.
- For the live scenarios (L-*), first read `.memory/test-execution-instructions.md`. Use `TestVault-Obsidian-CLI-MCP` only, with fixtures under `Sandbox/068-*` and clean-up afterwards. On this host, `obsidian vaults verbose` currently reports the vault at `C:\Marwan-Saab-ADO\My-Setup\My-Setup\TestVault-Obsidian-CLI-MCP` (research, Environment note).

## Gate commands (all must pass)

```bash
npm run lint
npm run typecheck
npm run build
npx vitest run src/tools/tags          # new co-located suites
npx vitest run                          # full suite + statements floor (vitest.config.ts)
npx vitest run src/tools/tags          # second run, unchanged → SC-002 / AC 15
```

After registration, roll the registry baseline forward once and re-run the baseline test:

```bash
npm run baseline:write
npx vitest run src/tools/_register-baseline.test.ts
```

## Offline scenarios (stubbed spawn, CI)

| ID | Scenario | Expected | Covers |
|---|---|---|---|
| Q-1 | vault-wide, default options | entries with integer counts; `total` = length | AC 1, FR-006 |
| Q-2 | `file` scope; then `path` scope with the same stub reply | identical output; argv carries `file=` / `path=` | AC 2, AC 3 |
| Q-3 | `activeOnly: true` in active mode | argv has the `active` flag and no `vault=` | AC 4 |
| Q-4 | `active` mode + `file` | argv still carries `file=` (no locator strip) | R3, ADR-038 |
| Q-5 | ordering, default vs `sortByCount` | `Aardvark, aardvark, Banana`; count-desc with comparator ties | AC 5 |
| Q-6 | `includeCounts: false` | no entry has a `count` key | AC 6 |
| Q-7 | `No tags found.` reply | `{ total: 0, tags: [] }` | AC 7 |
| Q-8 | invalid inputs (scope pairs, vault rules, unknown key, unsafe path) | `VALIDATION_ERROR` naming the field; spawn recorder count 0 | AC 9–12, FR-012 |
| Q-9 | `Error: No active file…` reply | `ERR_NO_ACTIVE_FILE`; the message points to `file` / `path` | AC 13 |
| Q-10 | `Vault not found.` reply | `CLI_REPORTED_ERROR`, never an empty list | FR-015 |
| Q-11 | `Error: File "X" not found.` reply | `CLI_REPORTED_ERROR` | FR-016 |
| Q-12 | `help({ tool_name: "tags" })` | full document with four worked examples; catalogue lists `tags` | AC 14 |

## Live scenarios (T0, test vault)

Seed `Sandbox/068-t0/` with fixtures equivalent to research F-series:

- `Alpha`: frontmatter `[fm-only, Project, shared]`; inline `#shared` ×3, `#project`, `#parent/child`, `#café`, `#日本語`, an inline-code tag, a fenced-code `#fencedonly`.
- `Beta`: frontmatter `["#hashfm", shared]`; inline `#Aardvark #aardvark #Banana #parent #shared`.
- `Gamma`: `#solo/leaf #deep/a/b`.
- `Empty`: no tags.

Drive the built server (`node dist/index.js`) from an MCP client, or call `obsidian` directly for raw replies.

| ID | Call | Expected |
|---|---|---|
| L-1 | `{ target_mode:"specific", vault:"TestVault-Obsidian-CLI-MCP" }` | includes `shared` (6), `Project` (2, merged), `solo` (1, implied), `café`, `日本語`; excludes `fencedonly` and `inlinecode` |
| L-2 | `path:"Sandbox/068-t0/Beta.md"` | `Aardvark`, `aardvark`, `Banana`, `hashfm`, `parent`, `shared`(2), in that order |
| L-3 | `path:"Sandbox/068-t0/Gamma.md"` | `deep/a/b` and `solo/leaf` only (no ancestors) |
| L-4 | `path:"Sandbox/068-t0/Empty.md"` | `{ total: 0, tags: [] }` |
| L-5 | `path:"Sandbox/068-t0/Missing.md"` | `CLI_REPORTED_ERROR` |
| L-6 | `vault:"NoSuchVault-068"` | `CLI_REPORTED_ERROR`, `Vault not found.` |
| L-7 | open `Beta` in Obsidian, then `{ target_mode:"active", activeOnly:true }` | same as L-2 |
| L-8 | close all tabs, then repeat L-7 | `ERR_NO_ACTIVE_FILE` |
| L-9 | specific `activeOnly` against a second, unfocused open vault (if available) | that vault's focused note, or `ERR_NO_ACTIVE_FILE`. Record the result in the doc. If it can't be reproduced, the doc says "not verified live" |
| L-10 | generate 2,000 unique tags in `Sandbox/068-t0/bulk.md`; vault-wide call | success; measure the average reply bytes per tag and document the derived ceiling (10 MiB ÷ bytes per tag), labelled as derived (SC-006) |

Clean-up: remove `Sandbox/068-t0/`. Confirm that `Sandbox/` is empty and `Welcome.md` is present.
