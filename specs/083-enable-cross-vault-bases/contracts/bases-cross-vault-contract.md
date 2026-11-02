# Contract: cross-vault Bases (`bases`, `views_base`, `create_base`)

**Spec**: [../spec.md](../spec.md) | **Research**: [../research.md](../research.md)

Rows are the test contract (Principle II). "Spawns" counts CLI child processes: `invokeCli` / `invokeEval` calls as recorded by `makeQueuedSpawn`. `B` is a registered vault that is not in front, `X` is an unregistered name, and `root(B)` is B's folder from the vault registry.

## §1 `bases`

| Row | Input | Spawns (argv shape) | Result |
|-----|-------|---------------------|--------|
| B1 | `{}` | 1: `bases` (no `vault=`) | Today's result, byte-identical (FR-011) |
| B2 | `{vault:"B"}` | 1: `vault=B bases` | `{bases, count}` from B's stdout, filtered and sorted as today |
| B3 | `{vault:"X"}` | 0 | `CLI_REPORTED_ERROR`, `details:{code:"VAULT_NOT_FOUND", reason:"unknown", vault:"X"}` |
| B4 | `{vault:"B"}`, B has no Bases | 1 | `{bases:[], count:0}`, never the front vault's list (the empty-result contract itself is out of scope) |

## §2 `views_base`

| Row | Input | Spawns | Result |
|-----|-------|--------|--------|
| V1 | `{}` | 1: `base:views` (active) | Today's result and errors, byte-identical |
| V2 | `{vault:"B"}` | 1: `vault=B base:views` | B's open-Base views |
| V3 | `{vault:"B"}`, B's active file is not a base | 1 | `BASE_NOT_FOUND`, `reason:"not-open"`, `details.vault:"B"`, message names B |
| V4 | `{vault:"B"}`, B's open Base has invalid YAML | 1 | `BASE_MALFORMED` / `invalid-yaml`, as in open mode today |
| V5 | `{vault:"X"}` | 0 | `VAULT_NOT_FOUND` / `unknown` (not `BASE_NOT_FOUND`) |
| V6 | `{base_path, vault:"B"}` | 2: focus eval `vault=B eval …`, then `vault=B base:views` | Named-Base views; errors as today (FR-013) |
| V7 | `{base_path}` | 2: focus eval (no vault), `base:views` (active) | Unchanged |
| V8 | `{}`, active file not a base | 1 | `BASE_NOT_FOUND` / `not-open`, details exactly `{code, reason}`, no `vault` key (FR-011) |
| V9 | `{vault:"B"}`, no file active in B (`Error: No active file.`) | 1 | The same `CLI_REPORTED_ERROR` (with `details.stdout` starting `Error: No active file.`) that `{}` gets for that state; not `BASE_NOT_FOUND` (FR-006, second sentence) |

## §3 `create_base`

The `B` rows use a registry that resolves B to `root(B)` and an `fs.realpath` seam. P = `base_path`, N = `name`.

| Row | Setup | Spawns | Result |
|-----|-------|--------|--------|
| C1 | no `vault` | 1: `base:create path=P name=N` (no `vault=`) | Today's result and errors, byte-identical. No eval, no realpath |
| C2 | `vault:"B"`, folder envelope `{ok:true, folder:"Tasks"}`, `Created: Tasks/N.md` | 2: `vault=B eval …ITEM_FOLDER…`, `vault=B base:create …` | `{path, name}` built exactly as today |
| C3 | `vault:"X"` | 0 | `VAULT_NOT_FOUND` / `unknown`; no item |
| C4 | `vault:"B"`, P passes through a link out of `root(B)` | 0 | `PATH_ESCAPES_VAULT` `{vault:"B", attemptedPath:P, resolvedPath}` + `pathEscapeAttempt` log; no item |
| C5 | `vault:"B"`, envelope `{ok:false, code:"BASE_NOT_FOUND"}` | 1 (eval only) | `BASE_NOT_FOUND`, `details:{code, path:P, vault:"B"}`; `base:create` never spawned |
| C6 | `vault:"B"`, derived folder (folder + dirname(N)) links outside | 1 (eval only) | `PATH_ESCAPES_VAULT`, `attemptedPath` = derived folder; no item |
| C7 | `vault:"B"`, N = `sub/Item`, folder `""` | 2 | Folder check covers `sub` (contained). Item created |
| C8 | `vault:"B"`, CLI answers `Error: Base file not found: P` | 2 | `BASE_NOT_FOUND` `{code, path:P, vault:"B"}` |
| C9 | `vault:"B"`, folder check passes but `Created: <path>` resolves outside | 2 | `PATH_ESCAPES_VAULT` `{vault:"B", attemptedPath:<path>, resolvedPath, createdPath:<path>}`; message says the item was created and not deleted; no unlink attempted |
| C10 | `vault:"B"`, eval answer not JSON or wrong shape | 1 | `CLI_REPORTED_ERROR` `stage:"json-parse"` / `"envelope-parse"` (shared decoder) |
| C11 | `vault:"B"`, deprecated `path` / `view` aliases | 2 | Folded as today; `deprecated_parameters` reported |
| C12 | `vault:"B"`, `base_path` whose folders do not exist yet | ≥1 (the eval runs) | The containment check resolves the nearest existing ancestor, with no plain-text fallback; the call proceeds (spec Edge Cases) |

## §4 `ITEM_FOLDER_TEMPLATE` (frozen, `create_base/_template.ts`)

| Row | `.base` content (in the named vault) | Envelope |
|-----|--------------------------------------|----------|
| T1 | missing, or a folder at P | `{ok:false, code:"BASE_NOT_FOUND"}` |
| T2 | `filters: 'file.inFolder("A")'` | `{ok:true, folder:"A"}` |
| T3 | `filters: {and: ['file.inFolder("A")', 'x > 1']}` | `{ok:true, folder:"A"}` |
| T4 | two `file.inFolder` entries, an `or` group, or no filters | `{ok:true, folder:<getNewFileParent(P).path, "/"→"">}` |
| T5 | unparseable YAML | as T4 |

The template's JavaScript is not executable in-process. Unit tests pin its bytes (`_template.test.ts`, as for `FOCUS_BASE_TEMPLATE`) and the handler's handling of each envelope arm. T1–T5 are verified live in the implement-phase T0 against the test vault.

## §5 Published surface

| Surface | `bases` | `views_base` | `create_base` |
|---------|---------|--------------|---------------|
| Description: `vault` targets the named vault (front vault when omitted) | ✓ | ✓ (both modes) | ✓ |
| Description: no "ignored / no-op / parity / inherited" for `vault` | ✓ | ✓ | ✓ |
| Description: `closedVaultNote(<cmd>)` | `"bases"` | `"base:views"` | `"base:create"` |
| Error list: `VAULT_NOT_FOUND` | ✓ | already | ✓ |
| Error list: `PATH_ESCAPES_VAULT` (named vault only) | — | — | ✓ |
| `vault` parameter description reworded | ✓ | ✓ | ✓ |
| `docs/tools/<tool>.md` routing section and examples | ✓ | ✓ | ✓ |
| Baseline fingerprints that move | description + input | description + input | description + input |
