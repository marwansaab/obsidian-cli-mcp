# Contract: `npm run check:non-ascii`

**Feature**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md) | **Research**: [../research.md](../research.md)

This is the only new interface. No published tool, schema, instruction, error code or fingerprint changes (spec FR-015, SC-006). `src/tools/_register-baseline.json` stays byte-identical.

## §C — Command

```text
npm run build
npm run check:non-ascii -- --test-vault <name> --semantic-vault <name> [--staged-note <vault-relative path>]
```

- `package.json` gains `"check:non-ascii": "node scripts/check-non-ascii.ts"`.
- The script launches `node dist/index.js` over stdio, with the 2025-era handshake and no elicitation capability, the way `probe-stdio.ts` does. The server's stderr is inherited.
- Arguments are described in data-model E1. No vault name is fixed in the script (FR-016, FR-020).

Exit status (research D7):

| Status | When |
|---|---|
| `0` | No scenario failed and cleanup left nothing behind (`BLOCKED` scenarios allowed) |
| `1` | At least one scenario failed, or cleanup left residue |
| `2` | Usage error, both vault names equal, `Sandbox/` missing in the test vault, or the server could not be started. No report is printed: without arguments or a server there is no scenario to report on, which is the exception spec SC-002 allows. |

## §S — Scenarios

All calls use `target_mode: "specific"` where the tool takes it, and always name the vault. `F` refers to the data-model E2 fixtures, `T` is the test vault and `V` the semantic vault.

| Id | Spec | Tool | Arguments | PASS when | FAIL when | BLOCKED when |
|---|---|---|---|---|---|---|
| H1 | US1 s1, FR-001 | `outline` | `{vault:T, path:F.source}` | `headings` mapped to `(level, text)` equals the E2 list exactly: same length, order and characters | any other result, including an error | `testVaultListed` is false, or `fixturesVisible` is false |
| L1 | US2 s1, FR-002 | `links` | `{vault:T, path:F.source}` | some `links[i].target === "Résumé 東京"` | any other result, including `FILE_NOT_FOUND` | `testVaultListed` is false, or `fixturesVisible` is false |
| F1 | US3 s1, FR-003 | `paths` | `{vault:T, folder:F.folder}` | `paths` equals `[F.source]` exactly | any other result | `testVaultListed` is false, or `fixturesVisible` is false |
| F2 | US3 s2, FR-004 | `paths` | `{vault:T, folder:F.missingFolder}` | `isError`, `code === "CLI_REPORTED_ERROR"`, `details.code === "FOLDER_NOT_FOUND"` and `details.folder === F.missingFolder` | a success (including an empty list), or an error with a different code or folder text | `testVaultListed` is false, or `fixturesVisible` is false |
| P1 | US4 s1, FR-005 | `pattern_search` | `{vault:T, pattern:"café\\d+", limit:10000}` | `matches` contains the E2 source match exactly (`path`, `line`, `match`, `text`) | any other result | `testVaultListed` is false, or `fixturesVisible` is false |
| P2 | US4 s2, FR-006 | `pattern_search` | `{vault:T, pattern:"café\\d+", folder:F.folder, limit:10000}` | `matches` contains the source match, and every `matches[i].path` starts with `F.folder + "/"` | the outside match is present, a path is outside the folder, or the source match is missing | `testVaultListed` is false, `fixturesVisible` is false, or `outsideSeenByP1` is false |
| S1 | US5 s1 + s3, FR-007, FR-018 | `smart_connections_similar` | `{vault:V, path:stagedNote, limit:20}` | success with `count ≥ 1` and no `matches[i].path === stagedNote` | the source note is among the matches, `count === 0`, `FILE_NOT_FOUND` (the file is on disk), or any other error | in this order: no `--staged-note`; no character above U+007F in it; V not listed; `fs.stat` finds no file at `<V root>/<stagedNote>`; `details.code` is `SMART_CONNECTIONS_NOT_INSTALLED`, `SMART_CONNECTIONS_NOT_READY` or `SOURCE_NOT_INDEXED` |
| S2 | US5 s2, FR-008, FR-019 | `smart_connections_similar` | `{vault:V, path:missingNote, limit:1}` | `isError`, `code === "CLI_REPORTED_ERROR"`, `details.code === "FILE_NOT_FOUND"` and `details.detail === "path: " + missingNote` | a success, or any other error or detail text | V not listed; `fs.stat` finds a file at the path; `details.code` is `SMART_CONNECTIONS_NOT_INSTALLED` or `SMART_CONNECTIONS_NOT_READY` |

Order of work in one run:

1. Connect, then call `vaults`. Resolve T's and V's folders (`path` field). If `vaults` fails, or T is not listed, skip steps 2–4 (no write): the test-vault scenarios are `BLOCKED` with "test vault <T> not listed by vaults" (or "vaults call failed: <message>"), and steps 5–7 still run.
2. Seed the E2 fixtures in T (§W).
3. Wait for `fixturesVisible`: `read {target_mode:"specific", vault:T, path:F.outside}` returns `content` equal to the seeded outside text, polled every 500 ms for up to 30 s. The probe path is all-ASCII on purpose (research D4).
4. Run H1, L1, F1, F2, P1 and P2 in that order. Each is retried every 500 ms until it passes, up to 30 s, and its last result is reported (D4).
5. Run S1 and S2 once each.
6. Clean up (§W), even after an exception.
7. Print the report (§R) and exit.

One scenario's exception is caught and becomes its own `FAIL` (data-model E7). It does not stop steps 4 to 7.

## §W — Write safety

1. The run folder is `<realpath(T root)>/Sandbox/non-ascii-check-<YYYYMMDD-HHMMSS>-<4 hex>`. `Sandbox/` must already exist; the script never creates it, and never writes at the vault root.
2. Before each write, the realpath of the target's nearest existing ancestor must be inside `realpath(<T root>/Sandbox)`. If it is not, the script aborts the run (exit 2) before writing.
3. Cleanup is `fs.rm(runFolder, {recursive: true})` in a `finally`, followed by an `fs.stat` that must report the folder absent. If it does not, the report prints `RESIDUE <path>` and the exit status is 1.
4. **V is read-only**: the only operations against V are `vaults`, `fs.stat` on two paths, and `smart_connections_similar`. No write, rename, move or delete tool is ever called with `vault: V`, and no file under V's folder is opened for writing (FR-017).
5. When T and V are the same name, the script exits 2 before any write (D8).

## §R — Report

```text
non-ascii check — <YYYY-MM-DD HH:MM> — obsidian-cli-mcp <package version> (<git sha>), server <serverInfo.version>
test vault: <T> · semantic vault: <V> · staged note: <stagedNote or "(none)">

PASS    H1 headings (outline)
          input:    {"vault":"…","path":"…/日本語フォルダ/Café 日記.md"}
FAIL    P1 pattern search (pattern_search)
          input:    {"vault":"…","pattern":"café\\d+","limit":10000}
          expected: matches include {"path":"…","line":3,"match":"café42","text":"Order café42 arrived."}
          actual:   {"count":0,"matches":[]}
BLOCKED S1 similar notes (smart_connections_similar)
          input:    {"vault":"My-Setup-Vault","path":"…","limit":20}
          precondition: staged note not indexed by Smart Connections (SOURCE_NOT_INDEXED)
…
cleanup: removed Sandbox/non-ascii-check-20261104-153000-a1b2
summary: 6 pass · 1 fail · 1 blocked
```

- One block per §S row, in table order. The status word is padded to 7 characters.
- Values are `JSON.stringify` output with no escaping of non-ASCII characters (D7). `actual` is the full tool result payload: the error payload when `isError` is true, otherwise the success payload.
- The `precondition` text names the first unmet condition from the §S "BLOCKED when" column.
- The report is UTF-8 on stdout. Nothing else is written to stdout.

## §T — Unit tests (`src/tools/_non-ascii-checks.test.ts`)

Each row runs the module's pure functions on hand-built tool results. None of them spawns anything.

| Row | Asserts |
|---|---|
| T-FX1 | The E2 fixture strings are NFC (`s === s.normalize("NFC")`), each path's name segments contain a character above U+007F, and the headings include a non-BMP character and U+2014 |
| T-FX2 | The source file text puts `café42` on line 3 and the link on line 7, consistent with the E2 expectations |
| T-H | H1: an exact list → PASS; a heading whose text differs only in normalisation form (NFD) → FAIL; an extra or missing heading → FAIL; a level mismatch → FAIL |
| T-L | L1: the target present → PASS; a `FILE_NOT_FOUND` error → FAIL; the target missing → FAIL |
| T-F1 | F1: exactly `[source]` → PASS; `[]` → FAIL; an extra path → FAIL |
| T-F2 | F2: the matching `FOLDER_NOT_FOUND` → PASS; an empty success → FAIL; `FOLDER_NOT_FOUND` with a garbled `folder` → FAIL |
| T-P | P1: the source match present → PASS; zero matches → FAIL; a `text` mismatch → FAIL. P2: inside-only → PASS; outside included → FAIL; `outsideSeenByP1` false → BLOCKED |
| T-S1 | Each BLOCKED precondition in §S order, with the precondition text; `FILE_NOT_FOUND` once the file is on disk → FAIL; the source among the matches → FAIL; `count 0` → FAIL; a clean success → PASS |
| T-S2 | The exact `path: <sent>` → PASS; a different detail → FAIL; `SMART_CONNECTIONS_NOT_INSTALLED` → BLOCKED; a success → FAIL |
| T-SHAPE | A result matching neither success nor error shape → FAIL with `unexpected result shape`, for every scenario |
| T-R | The report: blocks in table order; FAIL blocks carry input, expected and actual; BLOCKED blocks carry the precondition; non-ASCII characters are printed unescaped; summary counts; the RESIDUE line |
| T-RETRY | The retry helper: a check that passes on its third attempt → PASS after two sleeps; a check that never passes → the last attempt's FAIL once the 30 s deadline passes (simulated clock); a check that throws → FAIL whose `actual` is the error text, and the next scenario still runs (FR-010) |
| T-EXIT | The exit status: 0 for all PASS/BLOCKED with clean cleanup; 1 for one FAIL; 1 for residue |
| T-ARGS | The argument rules: missing required flags, equal vault names → usage error |

## §X — Existing files touched

| File | Change |
|---|---|
| `package.json` | `check:non-ascii` script |
| `tsconfig.build.json` | exclude `src/tools/_non-ascii-checks.ts` (item 30) |
| `CONTRIBUTING.md` | a short "Release checks" entry naming the command and the two vaults (through the docs-as-code pass) |

No production module, test, schema or baseline file changes.
