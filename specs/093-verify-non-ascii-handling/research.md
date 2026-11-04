# Research: Verify Non-ASCII Handling

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-04

This research is read-only. I read the code at HEAD `b42e96a`, the 034 records, `scripts/probe-stdio.ts`, the build, test and lint configuration, and `.memory/test-execution-instructions.md`. No vault or CLI was touched at plan time; the first live run happens at implement time (quickstart §4).

## Findings

### F1 — How the five tools pass caller text into Obsidian

| Capability | Tool | Route for the caller's text | Failure shape a check can see |
|---|---|---|---|
| Headings | `outline` | `resolveFileTarget`, then the CLI's own `outline` subcommand with `path=` on the argv (`src/tools/outline/handler.ts`). **Not** the eval payload route. | Garbled path: file-not-found from the dispatch classifier. Garbled heading text: a mismatch in `headings[].text`. |
| Links | `links` | `composeEvalCode` base64 payload → `app.vault.getFiles().find(x=>x.path===a.path)` (`links/_template.ts`). | Garbled path: `FILE_NOT_FOUND` with `detail: "path: <decoded path>"`. Target comes back as `e.link`, the link text as written. |
| Folder listing | `paths` | Payload → `app.vault.adapter.stat(start)` (`paths/_template.ts`). | Missing folder: `CLI_REPORTED_ERROR`, `details: {stage: "envelope-error", code: "FOLDER_NOT_FOUND", folder}`. |
| Pattern search | `pattern_search` | Payload → `new RegExp(a.pattern)` and the folder prefix filter (`pattern_search/_template.ts`). | Garbled pattern: zero matches, which is a success. This is the silent case the checks exist for. |
| Similar notes | `smart_connections_similar` | Payload → plugin check **first**, then `getAbstractFileByPath(a.path)` (`smart_connections_similar/_template.ts`). | Plugin missing: `SMART_CONNECTIONS_NOT_INSTALLED`. Missing path: `FILE_NOT_FOUND` with `detail: "path: <decoded path>"`. Not indexed: `SOURCE_NOT_INDEXED`. |

The spec's assumption about `outline` is borne out: it uses the argv route that spec 034's audit classed as unaffected. It stays in scope (spec Assumptions). Its check is identical either way.

### F2 — What spec 034 proved, and how

Spec 034 fixed the shared decode (`B64_PAYLOAD_DECODE_EXPR` in `src/tools/_shared.ts`) and added in-process `BI-034:` rows to each cohort handler's tests. Those rows assert the payload the handler builds, against a stubbed spawn, so they never show Obsidian decoding it. Its live probes were these (034 quickstart):

- Probe 4 ran `paths` on `Sandbox/unicode/cafés`, with no not-found case.
- Probe 5 ran `links` from an **ASCII** source path (`links-from.md`).
- Smart Connections was skipped.

`pattern_search` (spec 037) came after 034. None of the five capabilities has a live non-ASCII proof of the full acceptance set in spec 093.

### F3 — The precedent for a live, hand-run script

`scripts/probe-stdio.ts` (`npm run probe:stdio`) launches `node dist/index.js` through `StdioClientTransport` from `@modelcontextprotocol/client`, calls tools with `client.callTool`, prints JSON and exits non-zero on failure. Node runs `scripts/*.ts` directly by type stripping (Node 24.20 locally; the scripts already rely on this). Scripts import each other with `.ts` specifiers (`./_vitest-dump.ts`).

### F4 — Where testable logic can live

- `tsconfig.json` typechecks only `src/**/*.ts`; `eslint.config.js` lints `src/**/*.ts`; `vitest.config.ts` runs `src/**/*.test.ts`. A module under `scripts/` is therefore neither typechecked nor unit-tested.
- `_description-audit.ts` needed the `runVitestDump` indirection only because it imports `../server.js` through the project's `.js`-on-`.ts` specifiers, which Node cannot resolve.
- A `src/` module with **no relative imports** (bare package imports such as `zod` are fine, and type-only imports are erased) can be imported directly by a script with a `.ts` specifier.
- Refactor-decisions item 30: test-support modules are excluded from `tsconfig.build.json` by name. Its coverage exclude list in `vitest.config.ts` covers only fixtures, stubs and schema utils; a module with its own unit tests stays in the coverage denominator.

### F5 — Vault rules (`.memory/test-execution-instructions.md`, GL-003)

- `TestVault-Obsidian-CLI-MCP` is the only vault for writes. Fixtures go under `Sandbox/`, are cleaned up, and `Welcome.md` and the vault root are never touched.
- The vault is plugin-free, so Smart Connections cannot be exercised there.
- Owner ruling 2026-11-04 (spec C-001, C-002): similar-notes runs are read-only against `My-Setup-Vault`.
- Probes drive `Obsidian.com`, which is what the built server already spawns, and always pass `vault=` explicitly.

### F6 — Obsidian sees direct file writes late

Obsidian's file watcher picks up a file created on disk after a short delay. Its `metadataCache` (used by `links` and by the CLI's `outline`) parses it later still. A check that runs right after seeding can see an empty or missing result that is only lag.

## Decisions

### D1 — One committed script, `npm run check:non-ascii`

- **Decision**: `scripts/check-non-ascii.ts`, run as `npm run check:non-ascii -- <args>`. It connects to the built server (`dist/index.js`) over real stdio with the SDK v2 client, exactly as `probe-stdio.ts` does (2025-era handshake), and calls the five published tools as an agent would.
- **Rationale**: spec C-002 (owner ruling, Option A). The built server over stdio is the whole path a release ships, including the CLI spawn on Windows where the original defect lived.
- **Alternatives**: an in-process `connectInMemoryClient` server is rejected, because it would not exercise `dist/` or the shipped entry point. A vitest suite behind an environment flag was rejected by C-002.

### D2 — Logic in one pure module under `src/`, a thin script

- **Decision**: `src/tools/_non-ascii-checks.ts` holds everything that decides an outcome or shapes the report: the fixture set, the scenario table, the per-scenario classifiers, the retry policy constants and the report renderer. It has **no relative imports**, only `zod`, so the script imports it as `../src/tools/_non-ascii-checks.ts`. Because Node strips types rather than compiling them, the module is limited to erasable syntax; `tsc` does not enforce this (`tsconfig.json` has no `erasableSyntaxOnly`), so the script's real run (quickstart §2) is the check. It is unit-tested by `src/tools/_non-ascii-checks.test.ts` and excluded from `tsconfig.build.json` by name (item 30). The script holds only the I/O: argument parsing, connecting, file seeding and cleanup, `callTool`, printing and the exit status.
- **Rationale**: a wrong classification (a garbled lookup reported as `blocked`, an empty result reported as pass) is the failure this item cannot afford, so the classifiers need tests that run in CI. Code under `scripts/` gets no typecheck, lint or tests (F4). Keeping the module free of relative imports avoids the `runVitestDump` indirection.
- **Alternatives**: everything in the script, as `probe-stdio.ts` does, is rejected because its classifiers would be untested. Widening `vitest.config.ts`, `tsconfig.json` and eslint to `scripts/` is rejected because it is a project-wide config change for one script.

### D3 — Seed fixtures by direct file writes inside a per-run Sandbox folder

- **Decision**: the script resolves the test vault's folder from the `vaults` tool, takes the `realpath` of `<root>/Sandbox` (which must already exist), and writes the fixture files with `node:fs` (UTF-8, NFC literals) under `Sandbox/non-ascii-check-<timestamp>-<4 hex>/`. It refuses any write path whose `realpath`'d nearest existing ancestor is not inside that `Sandbox` folder. Cleanup is a `finally` that removes the run folder recursively, then confirms it is gone.
- **Rationale**: direct writes make the fixture bytes exactly the authored ones and independent of every Obsidian route under test. They leave no `.trash` residue and need no elicitation. The containment check mirrors Security Defaults even though the script is not a product write path.
- **Alternatives**: `write_note` plus `delete` is rejected, because a permanent delete needs elicitation, a non-permanent one leaves `.trash` entries, and `write_note`'s own metadata refresh is one more route in the way.

### D4 — Bounded retry until pass, and a gate on the negative-scope check

- **Decision**: each test-vault scenario is retried every 500 ms until it passes, with a 30-second deadline. On the deadline it is `FAIL` with the last observed result. A seeding-readiness precondition comes first: the `read` tool must return the ASCII-named outside note's exact content within the same deadline, or every test-vault scenario is `BLOCKED` with "fixtures not visible to Obsidian". The readiness probe deliberately uses a path with no non-ASCII character, so a fault in `read`'s own non-ASCII handling (a route outside this item) cannot turn a real failure into `BLOCKED`; remaining indexing lag for the non-ASCII fixtures is absorbed by each scenario's own retry. The folder-limited search (P2) is judged only after the vault-wide search (P1) has seen the outside note's match; otherwise P2 is `BLOCKED` with that reason.
- **Rationale**: F6. A garbled input never turns into a pass by waiting, so retrying until pass cannot hide the defect. Without the gate, P2 would pass merely because the outside note was not indexed yet.
- **Alternatives**: one fixed sleep is rejected (it is both slow and flaky). Polling each tool's own result as the readiness signal is rejected, because a garbled lookup would look like "not ready yet".

### D5 — `blocked` from a precondition proven independently of the route under test

- **Decision**: the similar-notes success check (S1) proves its preconditions without using the route under test:
  - the staged path was given, and contains a non-ASCII character;
  - the semantic vault is listed by `vaults`;
  - `fs.stat` on `<semantic root>/<staged path>` finds a file.

  Only then does it call `smart_connections_similar`, and it classifies the result as follows:
  - `SMART_CONNECTIONS_NOT_INSTALLED` / `_NOT_READY` / `SOURCE_NOT_INDEXED` → `BLOCKED`.
  - `FILE_NOT_FOUND` → `FAIL`, because the file is on disk and the tool could not find it, which is the garbling signature.
  - Success with ≥ 1 match and none equal to the staged path → `PASS`.
  - Anything else → `FAIL`.
- **Rationale**: FR-018 says a missing note is `blocked`, but "the tool says file not found" is also exactly what a garbled path looks like. Proving the note exists on disk first is what tells the two apart.
- **Alternatives**: trusting the tool's `FILE_NOT_FOUND` as "note missing" is rejected, because it would report the defect as `blocked`. Using `read` to prove existence is rejected for S1: `fs.stat` is read-only and involves no Obsidian route at all.

### D6 — The similar-notes not-found check needs no staging

- **Decision**: S2 sends `_non-ascii-check/存在しない ノート café — <8 hex>.md`, after `fs.stat` shows it is absent. Classification:
  - `FILE_NOT_FOUND` whose `details.detail` is exactly `path: <sent path>` → `PASS`;
  - plugin missing or not ready → `BLOCKED`;
  - anything else, including a `FILE_NOT_FOUND` showing a different path → `FAIL`.
- **Rationale**: spec FR-019 and SC-007.

### D7 — Report format and exit status

- **Decision**:
  - Plain UTF-8 text on stdout: a header, one block per scenario, a cleanup line and a summary line (contract §R). Values are printed with `JSON.stringify`, which leaves non-ASCII characters unescaped, so the evidence shows the characters themselves.
  - Exit status: `0` when no scenario failed and cleanup succeeded; `1` when any scenario failed or cleanup left residue; `2` for a usage error or when the server could not be started.
  - Diagnostics, including the server's own stderr, go to stderr.
- **Rationale**: spec FR-010 to FR-012 and FR-021. The output is pasted into the BI-0087 test-case pages as evidence.

### D8 — No vault default inside the script

- **Decision**: `--test-vault` and `--semantic-vault` are required. `--staged-note` is optional; when it is absent, S1 is `BLOCKED` with "no staged note path given". The quickstart names `TestVault-Obsidian-CLI-MCP` and `My-Setup-Vault` as the values to pass. The script refuses to run when both vault names are the same.
- **Rationale**: spec FR-016 and FR-020, and the owner's "set at run time, not hard-coded". The same-name refusal keeps the script from ever seeding fixtures in the semantic vault (FR-017).

### D9 — Exact comparison

- **Decision**: every comparison is `===` on strings, or element-wise `===` on lists. No normalisation, case-folding or trimming, beyond the tool's own published shape (for example, `outline`'s `text` field).
- **Rationale**: spec FR-014 and the normalisation edge case.

### D10 — Not part of CI

- **Decision**: the script needs a running Obsidian and is run by hand before a release. CI runs only the module's unit tests (they are in `src/**/*.test.ts`).
- **Rationale**: spec Assumptions, "Release under test".

## Follow-ups (not this item)

- The known gap on the same payload route: `backlinks`, `open_file`, `views_base`, `create_base` (spec C-003, BI-0087 Out of scope).
- Every scenario that fails at the implement-time run becomes its own item (spec FR-015, SC-005).
