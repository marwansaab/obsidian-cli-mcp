# Research: Enable cross-vault Bases

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-02

## Plan-time live probes (T0)

These probes followed `.memory/test-execution-instructions.md`. They drove `Obsidian.com` (`C:\Users\sirzi\AppData\Local\Programs\Obsidian\Obsidian.com`) directly, captured stdout and stderr separately, and wrote only to the authorised `TestVault-Obsidian-CLI-MCP`. Reads against `My-Setup-Vault` were non-destructive. `My-Setup-Vault` was in front for every routed call unless noted. Every fixture went under `Sandbox/P083-probe/` and was removed afterwards. Two items landed at the vault root, as Obsidian's default new-note location (P6); both were removed at once. `Welcome.md` is intact.

### P1: `bases` honours `vault=`, with no focus change when the vault is open

| Call | stdout (verbatim) | Front vault after |
|------|-------------------|-------------------|
| `bases` | My-Setup-Vault's 5 Bases (`000-Meta/Bases/Type ID Index.base` …) | My-Setup-Vault |
| `vault=TestVault-Obsidian-CLI-MCP bases` (both vaults open) | TestVault's 6 Bases (`Fixtures/BI-0048/Items.base` … `_validation-056/sample.base`) | My-Setup-Vault (unchanged) |
| `vault=No-Such-Vault bases` | `Vault not found.` (exit 0) | n/a |

The current description says the CLI ignores `vault` for `bases`. That is false: the subcommand routes on `vault=` exactly as `base:query` does.

### P2: a closed vault comes to the front when it is cold-opened

The very first routed call (`vault=TestVault-Obsidian-CLI-MCP bases`) returned TestVault's Bases and left TestVault in front. Repeating the call after My-Setup-Vault was back in front did not move focus (P1). The test vault was evidently closed before the first call, so the CLI's cold launch opened it and raised it. This is the closed-vault behaviour already covered by `closedVaultNote` and ADR-029 / ADR-031. It is not a focus side effect of the subcommand.

### P3: `base:views` honours `vault=`, with no focus change

| Call | stdout (verbatim) | Front vault after |
|------|-------------------|-------------------|
| `base:views` (no file active in My-Setup-Vault) | `Error: No active file.` | My-Setup-Vault |
| `vault=TestVault-… base:views` (TestVault's active file a note) | `Error: Active file is not a base file: Sandbox/Serial-focus.md` | My-Setup-Vault |
| `vault=TestVault-… base:views` (TestVault showing `Fixtures/BI-0065/sample.base`) | `All\ttable` | My-Setup-Vault (unchanged) |
| `vault=No-Such-Vault base:views` | `Vault not found.` | n/a |

Open-Base mode reads the named vault's own active file. The existing open-mode failure phrasings (`No active file`, `Active file is not a base file`) carry over unchanged.

### P4: `base:create` honours `vault=`; focus-free in 4 of 5 calls

| Call | stdout (verbatim) | Front vault after |
|------|-------------------|-------------------|
| `vault=TestVault-… base:create path=Sandbox/P083-probe/P083.base name=Item1` | `Created: Item1.md` | My-Setup-Vault |
| same vault, `path=Sandbox/P083-probe/Filtered.base name=Item2` | `Created: Sandbox/P083-probe/Items/Item2.md` | **TestVault** (not reproduced) |
| same, `Filtered.base name=Item3` | `Created: Sandbox/P083-probe/Items/Item3.md` | My-Setup-Vault |
| same, `P083.base name=Item4` | `Created: Item4.md` | My-Setup-Vault |
| same, `Filtered2.base name=Item5` | `Error: ENOENT: …\Sandbox\P083-probe\Items2\Item5.md` | My-Setup-Vault |
| `vault=TestVault-… base:create path=Sandbox/P083-probe/Missing.base name=X` | `Error: Base file not found: Sandbox/P083-probe/Missing.base` | My-Setup-Vault |
| `vault=No-Such-Vault base:create …` | `Vault not found.` | n/a |

Every item was created in TestVault and none in the front vault. The single focus switch (Item2) happened right after a `.base` file and a folder were written outside Obsidian, and a direct attempt to reproduce it failed.

### P5: the unknown-vault answer is untyped at the adapter

All three subcommands answer an unregistered vault with `Vault not found.` (exit 0). `runTyped` (`src/cli-adapter/cli-adapter.ts:152-161`) reclassifies that as a generic `CLI_REPORTED_ERROR` with no `details.code`. Only a registry pre-check (`resolveVaultRootOrRemap`, `src/tools/_active-file.ts:292`) produces the typed `VAULT_NOT_FOUND` / `unknown` that FR-008 requires, which is how named-mode `views_base` and `query_base` already do it.

### P6: Obsidian, not the wrapper, picks the item folder

- With a top-level `file.inFolder("Sandbox/P083-probe/Items")` filter on the Base, the item goes into that folder. `Created:` then reports the vault-relative path (`Sandbox/P083-probe/Items/Item2.md`).
- With no folder filter, the item goes to the vault's new-note location. In TestVault this is the root (`newFileLocation: "root"`, `getNewFileParent(...)` → `/`). `Created:` then reports `Item1.md`, which is also the vault-relative path.
- In both cases, `Created:` carries the item's vault-relative path. The existing `create_base` response builds the path as `<baseDir>/<baseName>/<created>` (`src/tools/create_base/handler.ts:91-95`). That is wrong for both shapes observed here (`Sandbox/P083-probe/P083/Item1.md` against a real `Item1.md`). This bug predates this feature and is recorded as a follow-up.

### P7: folder segments in `name` are joined into the item path

`name=sub/ItemX` targeted `…\Sandbox\P083-probe\Items\sub\ItemX.md` and failed with ENOENT because `sub` did not exist. A caller-supplied `name` can therefore steer the item into a subfolder of whatever folder Obsidian picked.

### P8: a missing filter folder gives a raw ENOENT

`Error: ENOENT: no such file or directory, open '<absolute path>'` comes back on stdout with exit 0. The dispatch layer's `Error:` rule already surfaces it as a generic `CLI_REPORTED_ERROR`. This predates the feature and is not changed here.

### P9: no public Bases API reports the item folder before creation

The internal `bases` plugin instance exposes only `createAndEmbedBase`, `createAndOpenBase`, `createNewBasesFile` and the view-registration methods. Nothing returns the folder a new item will be created in. The folder is known for certain only from the `Created:` line, after the item exists.

## Code findings (CodeGraph, HEAD `684adf5`)

- **F1**: `executeBases` (`src/tools/bases/handler.ts:17`) calls `invokeCli({command:"bases", target_mode:"active"})` and never reads `input.vault`. `bases/ExecuteDeps` has no `vaultRegistry`.
- **F2**: `executeViewsBase` (`src/tools/views_base/handler.ts:182`) runs `resolveVaultRootOrRemap` only in named mode, then both modes call `listFocusedViews`, which spawns `base:views` in `target_mode:"active"` (`:158`). The header claim "T0 P2: `base:views` ignores path=/vault=" is out of date (P3).
- **F3**: `executeCreateBase` (`src/tools/create_base/handler.ts:29`) calls `invokeCli({command:"base:create", target_mode:"specific"})` with no `vault`. `invokeCli` then puts no `vault=` on the argv (`cli-adapter.ts:98`), so the front vault is used. `create_base/ExecuteDeps` has no `vaultRegistry` and no `fs` seam.
- **F4**: `server.ts` builds `createBasesTool({ logger, queue })` and `createCreateBaseTool({ logger, queue })` without `vaultRegistry` (`src/server.ts:113,115`). `createViewsBaseTool` and `createQueryBaseTool` already receive it. `_typed-result-fixtures.ts:131,141,146` build the two tools with `cli(...)` only.
- **F5**: the shared helpers already exist in `src/tools/_active-file.ts`: `resolveVaultRootOrRemap` (`:292`, the typed `VAULT_NOT_FOUND`/`unknown` remap), `assertCanonicalPath` (`:325`, which logs `pathEscapeAttempt` and throws `PATH_ESCAPES_VAULT` with details `{vault, attemptedPath, resolvedPath}`) and `decodeEvalEnvelope` (`:66`). Fixed eval templates are base64-wrapped through `composeEvalCode` (`src/tools/_shared.ts:26`). `.memory/refactor-decisions.md` says to use these and never re-roll them.
- **F6**: `closedVaultNote(command)` (`src/tools/_shared.ts:41`) is the shared closed-vault paragraph. `query_base` carries `closedVaultNote("base:query")`.
- **F7**: the dependencies are only `@modelcontextprotocol/server` and `zod`; there is no YAML parser. Obsidian's eval context does provide `parseYaml` and `app.fileManager.getNewFileParent`.

## Decisions

### D1: route through the subcommands' own `vault=`

**Decision**: when `vault` is supplied, each operation passes it as `invokeCli`'s top-level `vault` with `target_mode: "specific"`: `bases`, `base:views` and `base:create`. When `vault` is omitted, the call is byte-identical to today: `bases` and `base:views` in `active` mode, `base:create` in `specific` mode with no `vault`.
**Rationale**: P1, P3 and P4 prove all three subcommands route on `vault=`, as `base:query` does. This is the smallest change, and closed-vault recovery is inherited through `dispatchCli` (ADR-029 / ADR-030), as Clarifications Q3 requires.
**Alternatives**: an eval-based route inside the named vault was rejected as unnecessary: the native route works and needs no new template for `bases` or `base:views`.

### D2: typed unknown-vault pre-check before any spawn

**Decision**: when `vault` is supplied, all three handlers first call `resolveVaultRootOrRemap(deps.vaultRegistry, input.vault, TOOL_NAME)`. An unregistered name throws `CLI_REPORTED_ERROR` / `VAULT_NOT_FOUND` / `unknown` with zero spawns. `bases` and `create_base` gain a required `vaultRegistry: VaultRegistry` on `ExecuteDeps`, and `server.ts` passes the registry it already builds.
**Rationale**: P5 shows that, without the pre-check, `Vault not found.` reaches the caller as an untyped `CLI_REPORTED_ERROR`, which fails FR-008. This is the same pattern as named-mode `views_base` and `find_and_replace`. The registry re-probes on a miss, so a vault added after start-up works (spec Edge Cases).
**Alternatives**: classifying the `Vault not found.` text inside each handler was rejected. The adapter already reclassifies that text generically, and a registry check is authoritative and costs no spawn. Making `vaultRegistry` optional to spare test edits was rejected: the dependency is required on every sibling, and an optional one would hide a wiring bug. The test edits are listed in plan.md.

### D3: `views_base` passes `vault` to `base:views` in both modes

**Decision**: `listFocusedViews(deps, basePath, vault)` spawns `base:views` with `target_mode:"specific"` and `vault` when one is named, and `active` otherwise. Open mode with a vault calls `resolveVaultRootOrRemap` first (D2). Named mode keeps its focus step unchanged, and its listing spawn now also carries `vault=`.
**Rationale**: the listing then reads the named vault's active file explicitly instead of relying on the focus step having raised that vault. The named-mode result, errors and focus step are unchanged (FR-013), and only the second spawn's argv gains `vault=`.
**Alternatives**: routing open mode only, with `vault` passed only when `base_path` is absent, was rejected. It keeps an extra branch for no behavioural gain and leaves named mode depending on an implicit focus hand-off.

### D4: attribute the existing not-found errors to the named vault

**Decision**: the not-found errors carry the vault only when one is named. With no vault, details and messages are byte-identical.
- Open-mode `views_base` `BASE_NOT_FOUND` / `not-open` gains `details.vault` and a message naming the vault.
- `create_base` `BASE_NOT_FOUND` gains `details.vault` next to the existing `details.path`, plus a message naming the vault.

No new code or `details.reason` (ADR-015).
**Rationale**: FR-005 and FR-006 require the vault to be identifiable, and FR-011 requires the default path to stay unchanged.
**Note**: a named vault with no file open at all answers `Error: No active file.`. That surfaces as the same generic `CLI_REPORTED_ERROR` the default path gives for the same state today, not as `not-open`. The named path mirrors the default path rather than inventing a new mapping, and FR-006's "no Base open" is the `Active file is not a base file` state (P3).

### D5: `create_base` named-vault pipeline (Clarifications Q1 + Q4)

With `vault` supplied, the stages run in this order, and each stage stops the call:

1. `resolveVaultRootOrRemap` gives the vault root, or `VAULT_NOT_FOUND`. No spawn.
2. `assertCanonicalPath(root, base_path)`: an escape gives `PATH_ESCAPES_VAULT`. No spawn.
3. `invokeEval` of a new frozen template `ITEM_FOLDER_TEMPLATE` (`create_base/_template.ts`, payload `{path}`) in the named vault, decoded by `decodeEvalEnvelope` with `malformedCode: "CLI_REPORTED_ERROR"`. The envelope is either `{ok:true, folder}` or `{ok:false, code:"BASE_NOT_FOUND"}`. The `ok:false` arm becomes the D4 `BASE_NOT_FOUND`, and `base:create` is never called.
4. Item folder = `posix.join(folder, posix.dirname(name))`, then `assertCanonicalPath(root, itemFolder || ".", { attemptedPathLabel: itemFolder })`. An escape gives `PATH_ESCAPES_VAULT`, and nothing is created.
5. `base:create` with `vault`. The existing not-found classification runs, with D4 attribution.
6. **Backstop**: the `Created:` value (the item's vault-relative path, P6) is checked with `assertCanonicalPath(root, created)`. On an escape, the handler re-throws `PATH_ESCAPES_VAULT` with details `{vault, attemptedPath, resolvedPath, createdPath}` and a message saying the item was created at that path and was not deleted. The `pathEscapeAttempt` log still fires.
7. The success response is built exactly as today; the response-path bug is out of scope.

**Folder derivation in the template**:
- Read the `.base` with `app.vault.cachedRead` and parse it with `parseYaml`.
- Take the top-level `filters`, which is either a string or an object whose `and` holds a list of strings.
- If exactly one direct entry matches `file.inFolder("<f>")` (single or double quotes), the folder is `<f>`.
- Otherwise the folder is `app.fileManager.getNewFileParent(<base path>).path`, normalised: `/` becomes `""`.
- A YAML parse failure takes the new-note branch. The backstop covers anything the mirror gets wrong.

**Rationale**: the owner's Q4 ruling, with P6, P7 and P9 as evidence. An eval is the only way to ask Obsidian for its new-note parent, and `parseYaml` avoids a new dependency (F7). Typed tools may use fixed eval templates with base64 payloads (constitution Security Defaults: escape hatches).
**Alternatives**: parsing the YAML in the wrapper was rejected because it needs a new dependency and still cannot know the new-note setting. A pre-check of `base_path` only was rejected by the owner's ruling.

### D6: `fs` seam for `create_base`

**Decision**: `create_base/ExecuteDeps` gains `fs?: { realpath: (p: string) => Promise<string> }`, defaulting to `node:fs/promises` `realpath`. This mirrors `query_base`'s `ExecuteFs` seam, so the symlink-escape tests drive `assertCanonicalPath` through `linkRealpath` (`src/path-safety/_realpath-fixtures.ts`).

### D7: focus behaviour (FR-004 / FR-004a)

**Decision**: `bases` and `base:views` are classified as focus-free (P1, P3, repeated). `base:create` is classified as focus-free on the strength of P4 (4 of 5 calls, with one switch that did not reproduce). The implement-phase T0 re-probes `base:create` three more times with the front vault checked after each call. If any switch reproduces, the `create_base` description and help reference document the side effect and point callers to `get_active_file` (FR-004); otherwise no side effect is documented. Unit tests cannot observe focus, so FR-004a's "front vault unchanged" assertion lives in the quickstart live check.

### D8: published surface

**Decision**:
- **Descriptions**: each of the three descriptions drops its "ignored / no-op / parity / inherited limitation" sentence, states that `vault` targets the named vault (the front vault when omitted), lists `VAULT_NOT_FOUND`, and appends `closedVaultNote("<subcommand>")`. `create_base` also lists `PATH_ESCAPES_VAULT` (named vault only).
- **`vault` parameter descriptions**: reworded to match (ADR-040).
- **Help references**: `docs/tools/bases.md`, `views_base.md` and `create_base.md` lose their "Vault routing limitation" sections and the "ignored" example, and gain routed-vault wording, error rows and examples.
- **Baseline**: `_register-baseline.json` is regenerated with `npm run baseline:write`. Exactly the description and input-schema fingerprints of `bases`, `views_base` and `create_base` move (MCP Tool Surface Standards: a deliberate-change gate).

### D9: tests (Principle II)

Every contract row in [contracts/bases-cross-vault-contract.md](contracts/bases-cross-vault-contract.md) maps to a co-located test in the same change. Per `.memory/refactor-decisions.md` item 16, `create_base/handler.test.ts` migrates from its bespoke `makeSpawn` to the shared `makeQueuedSpawn` while it is being edited. That retires the last bespoke spawn stub.

## Follow-ups (out of scope)

- The `create_base` response `path` is built as `<baseDir>/<baseName>/<created>`, which is wrong for both observed shapes. `Created:` already carries the vault-relative path (P6).
- `create_base` write containment when no vault is named (Clarifications Q1).
- A missing filter folder surfaces as a raw `ENOENT` generic error (P8).
- Folder segments in `name` (P7) are not rejected at validation. The named-vault folder check (D5 stage 4) contains them, but the default path does not.
