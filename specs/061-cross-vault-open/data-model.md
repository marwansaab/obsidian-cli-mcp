# Data Model: Open Cross-Vault Files

Types, schemas, and control flow for the **native-CLI-wrapper** reimplementation of `open_file` (revised 2026-06-01 after the T0 native-command probe — research "T0 FINDINGS"). All in `src/tools/open_file/`. The Zod schema is the single source of truth (Principle III).

---

## 1. Input schema — UNCHANGED (`openFileInputSchema`)

No change from BI-057 (FR-006a / Principle III — locator acceptance independent of runtime focus):

```text
{
  vault:   string (1..1000)              // required — the REQUESTED vault; passed as native `vault=<name>`
  path?:   safePathField                 // vault-relative; → native `path=`; exactly-one-of with file
  file?:   safeFileField                 // bare name; rejects [[ ]]; → native `file=`; exactly-one-of with path
  new_tab: boolean = false               // → native `newtab` flag when true; drives placement (§4)
}  // .strict(); superRefine enforces exactly-one-of path|file
```

**Semantic change only**: `vault` is the vault to switch focus to and open in (not "must already be focused"). Shape/messages byte-stable.

---

## 2. Output schema — `openFileOutputSchema` (+ `placement`)

```text
{
  opened:    string                      // resolved vault-relative path, parsed from native `Opened: <path>` stdout
  vault:     string                      // the requested vault (echoed) — FR-019, US1-AC2
  new_tab:   boolean                     // echo of the honored opt-in
  placement: "new_tab_created" | "existing_tab_reused" | "active_tab_used"   // NEW — FR-008..FR-011
}  // .strict()
```

`placement` = `z.enum(["new_tab_created","existing_tab_reused","active_tab_used"])`.

**Removed**: the eval-envelope schema (`openEvalResponseSchema`, `OPEN_FILE_EVAL_ERROR_CODES`, `VAULT_NOT_FOCUSED`) — there is no eval.

---

## 3. Native invocation

`open_file` issues, via `invokeCli` (→ `dispatchCli`):

```text
invokeCli({
  command: "open",
  vault: input.vault,                    // top-level → dispatchInput.vault → argv `vault=<name>` (specific mode)
  parameters: input.path ? { path: input.path } : { file: input.file },
  flags: input.new_tab ? ["newtab"] : [],
  target_mode: "specific",
})
```

Resulting argv (per `assembleArgv`): `[binary, vault=<name>, open, path=<x>|file=<x>, (newtab?)]`. The native command switches focus to `<name>` and opens — confirmed cross-vault at T0 (B1 does not apply to `open`/`tab:open`).

**Success stdout**: `Opened: <resolved vault-relative path>` (exit 0) → parse the path after `Opened: ` → `opened`.

`tab:open` is the always-new-tab sibling; `open … newtab` is equivalent and keeps a single command. (Plan/T0 may swap to `tab:open` for the new_tab path if OQ-A shows a placement-reporting advantage; default `open`+`newtab`.)

---

## 4. Placement derivation (D2)

The native command reports only `Opened: <path>` (no placement). Derive:

| `new_tab` | target already open in requested vault | `placement` | how known |
|-----------|----------------------------------------|-------------|-----------|
| `true`    | (any)                                  | `new_tab_created` | deterministic — `newtab`/`tab:open` always creates a tab (T0) |
| `false`   | yes                                    | `existing_tab_reused` | `open` reuses, no duplicate (T0) |
| `false`   | no                                     | `active_tab_used` | `open` uses the active tab (T0) |

`new_tab=true` needs **no** extra call. `new_tab=false` needs a target-vault "already open?" check — primary: a `tabs ids` snapshot of `vault=<requested>` before vs after the open (or a single pre-check). Exact mechanism (cross-vault `tabs vault=`, leaf identification) pinned at OQ-A; the closed-set contract (exactly one value) is held regardless.

---

## 5. Error mapping (thrown `UpstreamError`) — reuse only, via native strings

| # | Native CLI surface (T0) | `code` | `details` | Stage |
|---|--------------------------|--------|-----------|-------|
| 1 | `Vault not found.` (exit 0) | `CLI_REPORTED_ERROR` | `code:"VAULT_NOT_FOUND"`, `reason:"unknown"`, `vault` | pre-resolved via `resolveVaultRootOrRemap` (clean typed shape); native string is the backstop (`invokeCli` `UNKNOWN_VAULT_PREFIX` re-classifies) — **sole hard vault error** |
| 2 | `Error: File "<x>" not found.` (exit 0) | `CLI_REPORTED_ERROR` | `code:"FILE_NOT_FOUND"`, `path`, `vault` | dispatch priority (c) → handler maps |
| 3 | app-down (inherited) | `CLI_NON_ZERO_EXIT` | `reason:"obsidian-not-running"` | `dispatchCli` (ADR-030); reused |
| 4 | input invalid | `VALIDATION_ERROR` | field paths | Zod boundary — retained |

**Removed**: `VAULT_NOT_FOCUSED`, `INTERNAL_ERROR` (malformed eval) — no eval. **`UNSUPPORTED_FILE_TYPE`**: pending OQ-B — if native `open` gives no distinct unrenderable-type signal, this case is dropped (native viewer handles every recognised type; FR-020 holds). **No new top-level code; no new `details.reason`.** `reason:"not-open"` retires from emission (ADR-015 additive-only).

**Cold-start disjointness (T0)**: file-not-found is `Error: File …` and unknown-vault is `Vault not found.` — neither matches `COLD_START_PATTERN` (`Error: Command "…" not found.`), so neither is mis-retried; a genuine warming-vault cold-start (`Error: Command "open" not found.`) *is* retried (ADR-029, inherited).

---

## 6. Handler control flow

```
executeOpenFile(input):
  expectedBase = resolveVaultRootOrRemap(registry, input.vault)   # unknown → throw #1 (typed), pre-call
  # placement pre-check only when new_tab is false (D2):
  alreadyOpen = (input.new_tab) ? null : isOpenInVault(input.vault, locator)   # OQ-A mechanism
  out = invokeCli({command:"open", vault: input.vault,
                   parameters: locatorParams, flags: input.new_tab?["newtab"]:[],
                   target_mode:"specific"})                        # inherits app-down + cold-start recovery
        → on `Error: File … not found.` (CLI_REPORTED_ERROR) → throw #2
        → on app-down (inherited) → #3
  opened = parseOpened(out.stdout)                                 # after "Opened: "
  placement = input.new_tab ? "new_tab_created"
            : alreadyOpen ? "existing_tab_reused"
            : "active_tab_used"
  return { opened, vault: input.vault, new_tab: input.new_tab, placement }
```

- **No eval, no focus-switch poll, no `launchObsidian` import** — the native `open` does the switch; recovery is inside `dispatchCli`.
- **Single-flight** via the existing `queue.run` in `invokeCli`.
- The `isOpenInVault` pre-check (OQ-A) is the only added round-trip, and only for `new_tab=false`.

---

## 7. Dependencies — `ExecuteDeps` (unchanged shape)

```text
ExecuteDeps {
  logger:        Logger              # injected (not constructed here)
  queue:         Queue               # injected
  vaultRegistry: VaultRegistry       # injected — unknown-vault pre-resolve
  spawnFn?:      SpawnLike           # test seam (→ dispatchCli)
  env?:          ProcessEnv
}  // NO launchFn — recovery inherited in dispatchCli
```

---

## 8. State / lifecycle summary

| Vault state at request | Path to success | Recovery owner |
|------------------------|-----------------|----------------|
| Requested = focused | native `open` opens (switch is a no-op) | none |
| Requested open-but-unfocused | native `open vault=X` switches focus + opens | **native command** |
| Requested closed, app running | native `open vault=X` brings up + focuses + opens (cold-start retry if warming) | native + **inherited** ADR-029 |
| App down | native `open` → app-down → dispatch launches `obsidian://open?vault=X` + polls → opens | **inherited** ADR-030 |
| App down + opt-out / launch never ready | `obsidian-not-running` (#3) | inherited bound |
| Unknown vault | pre-resolve throw (#1) | n/a |
| File absent (correct vault) | native `Error: File … not found.` → `FILE_NOT_FOUND` (#2) | n/a |
