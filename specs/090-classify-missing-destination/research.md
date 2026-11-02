# Research: Classify Missing Destination

**Feature**: [spec.md](spec.md) | **Date**: 2026-11-02 | **HEAD**: `76f5926`

## T0 method

The live probes drove `Obsidian.com` directly (`C:\Users\sirzi\AppData\Local\Programs\Obsidian\Obsidian.com`, the binary the production resolver spawns), with `vault=TestVault-Obsidian-CLI-MCP` passed explicitly. stdout and stderr were captured separately through `Start-Process -RedirectStandardOutput/-RedirectStandardError`, per `.memory/test-execution-instructions.md`.

Fixtures lived under `Sandbox/090-probe/`: `Note.md`, `Other.md` and an empty folder `Exists/`. Afterwards the folder was removed, and `Sandbox/` was back to its 13 pre-run entries. `Welcome.md` was untouched and no `.trash/` was created.

| Probe | `move` arguments | stdout (verbatim, exit 0, stderr empty in every row) |
|-------|------------------|-------------------------------------------------------|
| P1 | `path=Sandbox/090-probe/Note.md to=Sandbox/090-probe/Missing/` | `Error: ENOENT: no such file or directory, rename 'C:\Marwan-Saab-ADO\My-Setup\My-Setup\TestVault-Obsidian-CLI-MCP\Sandbox\090-probe\Note.md' -> 'C:\Marwan-Saab-ADO\My-Setup\My-Setup\TestVault-Obsidian-CLI-MCP\Sandbox\090-probe\Missing\Note.md'` |
| P2 | `path=… to=Sandbox/090-probe/Missing/Renamed.md` | The same shape, with destination `…\Missing\Renamed.md`. |
| P3 | `path=… to=Sandbox/090-probe/A/B/C/` | The same shape, with destination `…\A\B\C\Note.md`. |
| P4 | `path=Sandbox/090-probe/Nope.md to=Sandbox/090-probe/Missing/` | `Error: File "Sandbox/090-probe/Nope.md" not found.` |
| P5 | `path=… to=Sandbox/090-probe/Other.md/` (a file used as a folder) | `Error: Destination file already exists!` |
| P6 | `file=Note to=Sandbox/090-probe/Missing/Note.md` | The ENOENT shape. The CLI resolved `Note` to `BI021\note.md`. |
| P7 | `path=… to=Sandbox/090-probe/Missing/Renamed` (no extension, sent straight to the CLI) | The ENOENT shape, with destination `…\Missing\Renamed\Note.md`. The CLI reads an extensionless `to` as a folder. |

After every probe, `Note.md` was still in `Sandbox/090-probe/`, unchanged, and no folder had been created.

## Findings

- **F1. The failure exists, and it leaks both absolute paths.** A missing destination folder comes back from the CLI as one stdout line on exit 0: `Error: ENOENT: no such file or directory, rename '<abs source>' -> '<abs destination>'` (P1–P3, P6, P7). The dispatch layer's priority (c) turns that line into `CLI_REPORTED_ERROR`, with the line in `details.message` and the raw text in `details.stdout` (`src/cli-adapter/_dispatch.ts:628-640`). `move` passes it through untouched (`src/tools/move/handler.ts:66`). So today the agent receives the operator's absolute vault folder twice, in two fields, with no `details.code`.
- **F2. Nothing moves and nothing is created.** In every ENOENT probe the source stayed in place and no folder appeared. FR-003 already holds upstream; the feature only reports the failure.
- **F3. The source is checked first.** With a missing source and a missing folder together (P4), the CLI reports the source with its own vault-relative message. This matches the spec's assumption and FR-007.
- **F4. A file used as a folder is a different failure.** P5 gives `Error: Destination file already exists!`, so it is not ENOENT and is not classified as a missing folder (spec Edge Cases).
- **F5. The line follows Node's error format.** It is Node's `uvException` text, `<CODE>: <libuv description>, <syscall> '<path>' -> '<dest>'`. Obsidian is an Electron (Node) app, and libuv's description for ENOENT is `no such file or directory` on every platform. On macOS and Linux the line therefore has the same shape, with POSIX paths. That is the basis for FR-010. Only Windows could be probed live, so the unit rows use both path forms.
- **F6. The handler always knows the full destination.** `resolveTo` (`move/handler.ts:30`) returns the full vault-relative destination (`resolvedTo`) for every locator. The folder form is sent unexpanded only for `file` and active calls (`forwardedTo`, refactor-decisions item 32(d)), and the CLI then keeps the same basename. An extensionless `to` is turned into `<to>.<ext>` before forwarding, so the P7 folder reading never reaches the CLI through the tool. The missing folder is therefore the part of `resolvedTo` before its last `/`, for all three locators.
- **F7. A missing-folder report carries no information that needs the vault root.** The folder comes from `resolvedTo`, which is vault-relative. Building the `FOLDER_NOT_FOUND` failure needs no vault lookup.
- **F8. Other failures that pass through can carry the root.** The CLI-text-carrying codes `CLI_REPORTED_ERROR`, `CLI_NON_ZERO_EXIT` (`details.stdout` / `stderr`), `CLI_TIMEOUT` (`partialStdout` / `partialStderr`) and `CLI_OUTPUT_TOO_LARGE` (`partial`) all embed raw CLI output (`_dispatch.ts:536-588`). Any Node fs error Obsidian reports during a move, such as EPERM or EBUSY on a locked file, or EXDEV, has F5's shape and so carries the absolute paths. `argv` carries the binary's path and the vault-relative arguments only. Active mode sends no `vault=` (item 32(b)), and specific mode sends the display name.
- **F9. `move` has no vault root in specific mode.** `resolveFileTarget` returns `vaultRoot` only in active mode (`_file-target.ts:37`), and `move`'s `ExecuteDeps` has no `vaultRegistry` (`move/handler.ts:14`; `server.ts:123` builds the tool from `{ logger, queue }`). `read` faced the same gap in spec 074. It added `vaultRegistry` to its deps and calls `resolveVaultPath` after the CLI call, "so an unknown vault still fails at the CLI" (`read/handler.ts:55-57`).
- **F10. The registry and the CLI know the same vaults.** `createVaultRegistry` is built from `obsidian vaults verbose` (`vault-registry/registry.ts`). It caches after its first probe, and a cache hit spawns nothing. For a name it does not know, `resolveVaultPath` throws `VALIDATION_ERROR` (`registry.ts:94-101`). If the CLI has acted on a vault, the registry knows it. If the registry does not know the vault, the CLI answered `Vault not found.` and touched no vault folder.
- **F11. The existing sub-code fits.** `FOLDER_NOT_FOUND` with `details.folder` is already published under `CLI_REPORTED_ERROR` by `pattern_search` (`pattern_search/handler.ts:84`) and `paths` (`paths/handler.ts:45-49`, eval envelope `paths/schema.ts:50`). This is Clarification Q2.
- **F12. No tool creates an empty folder.** There is no folder-creation tool and no CLI `mkdir` subcommand (`obsidian help` lists `folder`, `folders` and `create` only). `write_note` creates missing parent folders when it writes a note (`write_note/handler.ts:129`, `mkdir … { recursive: true }`). So today an agent can create the folder by writing a note into it.
- **F13. Existing tests construct `move`'s deps without a registry.** `move/handler.test.ts` builds them in a `deps()` helper and 25 inline `{ logger, queue, spawnFn, env }` literals. `move/index.test.ts` has 4 `createMoveTool({...})` literals. `_typed-result-fixtures.ts:210` and `_plugin-noise.test.ts:230` build `move` from `cli(...)`. No existing test sends an ENOENT rename line to `move`, and none asserts a vault root in a failure.

## Decisions

### D1 — Classify after the CLI fails; no pre-check

`executeMove` wraps the CLI call and the response parse in one `try`. A failure is classified only after the CLI has reported it. There is no pre-flight existence check of the destination folder.

- **Rationale**: FR-012 and SC-006 say successful moves keep exactly today's calls and results. A pre-check would add a call to every move, could disagree with the CLI if the folder changed between the check and the move, and would block a move that a future Obsidian might complete by creating the folder (spec Edge Cases, "Upstream behaviour change").
- **Alternatives rejected**:
  - A pre-flight `fs.stat` or `obsidian folder path=<folder>` check, for the reasons above.
  - Confirming the classification with a stat after the failure. It costs an fs seam and a test fixture for one race, and that race is accepted under D2.

### D2 — Recognise a missing folder by the CLI's ENOENT rename line

A `CLI_REPORTED_ERROR` whose `details.message` matches `^Error: ENOENT: [^,]*, rename '` is a missing destination folder. It becomes `FOLDER_NOT_FOUND`, provided the destination's folder (D3) is not the vault root.

- **Rationale**:
  - F1 and F5 show the line is the CLI's report for this case, in the same form on every platform.
  - F3 shows the CLI rejects a missing source with its own line before it attempts the rename, so an ENOENT on rename points at the destination.
  - The vault root always exists, so a root-level destination that gets ENOENT is reported as a generic failure (D4) and never as a missing folder.
- **Accepted residual**: the source note may be deleted in the moment between Obsidian's own check and the rename. That ENOENT is then reported as a missing folder. The agent's retry reports the missing source, so nothing is lost.
- **Alternatives rejected**:
  - Matching any `ENOENT` text. That is too broad: for example, a note body.
  - Parsing the absolute destination out of the line and comparing it with the vault root plus `resolvedTo`. More code, no gain over F3.

### D3 — The reported folder is the folder part of `resolvedTo`

`details.folder` is `resolvedTo` with backslashes turned into `/`, cut at its last `/`. For `Archive/2026/Old.md` and for `Archive/2026/` + `Note.md` it is `Archive/2026`. Nested missing folders (`A/B/C/`) report `A/B/C`, the folder the agent asked to move into (spec Edge Cases). Letter case is kept as the agent wrote it.

- **Rationale**: F6 and F7. This is the same value for every locator and every file type, and it needs no vault lookup.

### D4 — Rewrite the vault root out of every other failure (Clarification Q3)

Every other `UpstreamError` from the move step (the CLI call or the response parse) has every occurrence of the vault's absolute folder replaced before it is rethrown:

- across `message` and every string inside `details`, including strings in arrays (`argv`) and nested records;
- matched with either separator in each position, with letter case ignored;
- `<root><separator>` becomes the empty string, which leaves the vault-relative tail, and a bare `<root>` becomes `.`.

The code, the `cause` and all other wording are kept. When nothing was replaced, the original error object is rethrown unchanged, so the failures that carry no path stay byte-identical (FR-007): source not found, destination exists, unknown vault and parse drift.

Exceptions:

- **`CLI_BINARY_NOT_FOUND`**: passed through untouched. No CLI ran, and its search paths and `PATH` are installation diagnostics (Clarification Q1).
- **Cancellation**: the abort reason is not an `UpstreamError` and is rethrown untouched, with no vault lookup.

- **Rationale**: FR-005 and Clarification Q3. Ignoring case on every platform satisfies "on Windows letter case is ignored". On a case-sensitive file system it can only over-scrub a path that differs from the vault root in case alone, which still never exposes the root. This keeps one code path instead of a platform switch.
- **Alternative rejected**: withholding the raw text (Q3 option B), by owner ruling.

### D5 — The vault root: focused-file eval in active mode, registry after the failure in specific mode (amended at analyze, U1)

- **Active mode**: `target.vaultRoot`, already returned by `resolveFileTarget`.
- **Specific mode**: `deps.vaultRegistry.resolveVaultPath(target.vault)`, called only on the D4 path, after the CLI has failed. This is `read`'s spec 074 pattern (F9), and it leaves the success path and the missing-folder path free of extra calls.
- **If the lookup reports the vault as not registered** (the registry's own `VALIDATION_ERROR`, `registry.ts:94-101`): the original move failure is rethrown untouched. By F10, a vault the registry does not know is one the CLI did not act on (`Vault not found.`), so its text holds no vault folder to rewrite. This keeps the unknown-vault failure byte-identical (FR-007, spec Edge Cases "Unknown vault").
- **If the lookup fails for any other reason** (for example, the cache is cold and the `vaults` probe times out, or Obsidian is down): the root cannot be known, so the raw CLI text cannot be cleaned. FR-005 admits no residual (owner ruling at analyze, U1), so the move failure is **withheld** rather than passed through. Its `code` is kept. Its raw `stdout`, `stderr` and `message` are dropped, and in their place is a message naming the vault-relative source and destination and both failures' codes. `details` is `{ source, destination }`, and the lookup failure is attached as `cause`. This reports both failures (Principle IV) and masks neither: the lookup error is never thrown in the move failure's place. Data-model E4c gives the exact shape.
- **Alternatives rejected**:
  - Deriving the root by stripping `resolvedTo` from the absolute path in the ENOENT line. That works only for path-shaped Node errors, and it infers what the registry knows for certain.
  - Asking Obsidian for `app.vault.adapter.basePath` with an extra eval. That is a second CLI call on every failure.
  - Looking the root up before the move. That changes the unknown-vault failure, and on first use it adds a probe to the success path.

### D6 — `move` receives the vault registry

`ExecuteDeps` gains a required `vaultRegistry: VaultRegistry`, and `server.ts` passes the registry it already builds (`createMoveTool({ logger, queue, vaultRegistry })`). This is the same one-argument change spec 074 made for `read`.

- **Consequence**: every existing test that builds `move`'s deps must add the field (F13). Refactor-decisions item 5 requires the exact edits to be listed and approved before any test is touched. The list is in [contracts/missing-destination-contract.md](contracts/missing-destination-contract.md) §X, and the owner approved it on 2026-11-02 (option A). The edits only add a field: no assertion, expected value or spawn queue changes.
- **Alternative rejected**: an optional `vaultRegistry?`. Production always passes one, and an optional dependency would need a branch for "no registry" that can only exist in tests.

### D7 — The `FOLDER_NOT_FOUND` failure

```text
code:    CLI_REPORTED_ERROR
cause:   null
details: { code: "FOLDER_NOT_FOUND", folder: "<vault-relative folder>" }
message: move: the destination folder "<folder>" does not exist in the vault. Nothing was moved. Create the folder (writing a note into it with write_note creates it), then retry the move.
```

- There is no `details.reason`, because there is only one sub-state (Clarification Q2, ADR-015).
- `cause` is `null` because the CLI's error carries the absolute paths. Principle IV keeps a cause only "where safe", and the same rule is followed by `pattern_search`'s `FOLDER_NOT_FOUND` (`cause: null`).
- The recovery hint names the one route that exists today (F12).

### D8 — Published description, help page and CHANGELOG

- **Description**: `MOVE_DESCRIPTION` gains one sentence naming the failure and the recovery (FR-011), so the published fingerprint moves on purpose and the baseline is regenerated in the same PR (Tool Surface Standards, "Schema dialect").
- **Help page**: `docs/tools/move.md` gains an Errors row and a behavioural note, and states that no `move` failure carries the vault's absolute folder. The Branch 2 text that says the CLI "fail[s] with `ENOENT`" is reworded to name the new failure.
- **CHANGELOG**: an `[Unreleased]` spec line and a Fixed entry.
- **Exact text**: contract §H and §C.

### D9 — Tests

- **New suite**: `src/tools/move/handler.missing-destination.test.ts`, co-located, rows M1–M20 (contract §T). It drives `executeMove`, the public surface (refactor-decisions item 3).
- **Registered-tool row**: `move/index.test.ts` gains one new `it`, the wire check of the `isError` payload (R1). No existing assertion changes.
- **Fixtures**: the existing spawn stubs and `stubVaultRegistry`, with no new fixture module.

## Plan-time spec alignment

- The spec's SC-003 says recovery takes "exactly two further calls (create the folder, repeat the move)". F12 shows that, today, creating the folder means writing a note into it with `write_note` (a call that also creates a note) or using `obsidian_exec`. The two-call count still holds, and the failure's message names the route (D7). A tool that creates an empty folder is a follow-up and is not in scope (spec Out of Scope: "Creating missing destination folders automatically" stays out; manual creation is the agent's step).

## Analyze-time alignment (owner approved F1, U1 and C1, 2026-11-02)

- **F1**: tasks T009's M13 expected "the default message". Today's unknown-vault error carries `message: "Vault not found."` (`runTyped`, `cli-adapter.ts:154-159`), and M13 now asserts that. M13 asserts current behaviour and changes none.
- **U1**: D5 used to rethrow the original error on any lookup failure, which would leak the root when a cold-cache probe fails. Now only the registry's not-registered `VALIDATION_ERROR` passes the original through. Any other lookup failure gives the withheld failure (data-model E4c), with the lookup failure as `cause`. The new row M18 covers this.
- **C1**: the new row M19 covers the spec's "Separators and case" edge case for a full-path backslash destination (`Archive\2026\Old.md` reports `Archive/2026`). The edge case is kept as written.
- **LOW findings, settled by the existing artifacts** (no owner decision needed):
  - **I1**: the spec's last Assumption now says the no-folder-creation behaviour was confirmed live on Windows only, and is inferred for macOS and Linux from F5 and M7.
  - **I2**: the tasks' structural note now lists `resolveVaultPath`'s injected-dep consumers, in place of the index's "callers only in `_active-file.ts`".
  - **C2**: the new row M20 covers the parse-stage rewrite (data-model E4b "Unparseable success").
  - **C3**: M15's Covers column now names the file-as-folder edge case, because P5 gives the same line.
  - **A1**: the plan's SC-001 mapping names M1 (Windows) and M7 (POSIX) under CI on Linux and Windows. macOS has no CI lane, and that gap is stated rather than hidden.

## Follow-ups (out of scope)

- **A folder-creation capability** (F12).
- **Resolution-stage failures** (`resolveFileTarget`: the TSV resolver and the focused-file eval) come from shared `_active-file.ts` code that every file-path tool uses. Their observed forms carry no absolute path: `Error: File "<name>" not found.`, `ERR_NO_ACTIVE_FILE`, `Vault not found.`. A malformed focused-file eval answer could in principle echo the JSON-escaped vault root. Scrubbing those is a cross-tool change.
- **`rename` passes through the same Node fs error text** for its own failures. Rename failures are out of scope for this spec.
