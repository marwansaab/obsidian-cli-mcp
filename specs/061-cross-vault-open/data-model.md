# Data Model: Open Cross-Vault Files

Types, schemas, and handler flow for the **single vault-targeted eval** design (ADR-031; B1 false). All in `src/tools/open_file/`. The Zod schema is the single source of truth (Principle III). (No focus-switch state machine, no `launchFn` — recovery is inherited in `dispatchCli`.)

---

## 1. Input schema — UNCHANGED (`openFileInputSchema`)

No change from BI-057 (FR-006a / Principle III — locator acceptance independent of runtime focus):

```text
{
  vault:   string (1..1000)              // required — the REQUESTED vault; passed as the eval's vault= (specific mode)
  path?:   safePathField                 // vault-relative; structural path-safety; exactly-one-of with file
  file?:   safeFileField                 // bare name; rejects [[ ]]; exactly-one-of with path
  new_tab: boolean = false               // opt-in; drives placement (§5)
}  // .strict(); superRefine enforces exactly-one-of path|file
```

**Semantic change only**: `vault` is the vault to open in; the eval is routed there (B1 false). Shape/messages byte-stable.

---

## 2. Output schema — `openFileOutputSchema` (+ `placement`)

```text
{
  opened:    string                      // resolved vault-relative path, regardless of locator shape
  vault:     string                      // the vault the file was opened in (requested) — FR-019, US1-AC2
  new_tab:   boolean                     // echo of the honored opt-in
  placement: "new_tab_created" | "existing_tab_reused" | "active_tab_used"   // NEW — FR-008..FR-011 / BI-0129
}  // .strict()
```

`placement` = `z.enum(["new_tab_created","existing_tab_reused","active_tab_used"])`.

---

## 3. Eval envelope — `openEvalResponseSchema` (discriminated on `ok`)

```text
ok:true  → { ok:true, opened:string, new_tab:boolean, placement: PlacementEnum }
ok:false → { ok:false, code: "FILE_NOT_FOUND" | "UNSUPPORTED_FILE_TYPE", detail?: string }
```

- `placement` on the `ok:true` arm (derived in-eval, §5).
- **`VAULT_NOT_FOCUSED` is removed** — there is no focused-vault guard (the eval runs in the requested vault, B1 false).
- `FILE_NOT_FOUND` / `UNSUPPORTED_FILE_TYPE` arms retained.

---

## 4. Error triples (thrown `UpstreamError`) — reuse only

| # | Condition | `code` | `details.code` / `.reason` | Stage |
|---|-----------|--------|-----------------------------|-------|
| 1 | Unknown/unregistered vault | `CLI_REPORTED_ERROR` | `code:"VAULT_NOT_FOUND"`, `reason:"unknown"` | pre-eval (`resolveVaultRootOrRemap`) — **sole hard vault error** |
| 2 | File absent in requested vault | `CLI_REPORTED_ERROR` | `code:"FILE_NOT_FOUND"` | eval (runs in requested vault) |
| 3 | No registered view for type | `CLI_REPORTED_ERROR` | `code:"UNSUPPORTED_FILE_TYPE"`, `extension` | eval (retained) |
| 4 | App down, unrecoverable (launch suppressed/fails) | `CLI_NON_ZERO_EXIT` | `reason:"obsidian-not-running"` | **inherited** from `dispatchCli` (ADR-030); reused |
| 5 | Input validation | `VALIDATION_ERROR` | (field paths) | boundary (Zod) — retained |
| 6 | Malformed eval envelope | `INTERNAL_ERROR` | `stage` | decode — retained |

**Removed**: the BI-057 `VAULT_NOT_FOCUSED` → `VAULT_NOT_FOUND/reason:"not-open"` mapping. `reason:"not-open"` stays in the ADR-015 enum (additive-only) with no emitter in this tool. **No new top-level code; no new reason.** The app-down (#4) and cold-start recovery are inherited via `dispatchCli` with no `open_file` code (the eval carries `vault=requested`, so the recovery is vault-correct).

---

## 5. Eval template (`JS_TEMPLATE`) — behavioural changes

The frozen IIFE changes (exact string pinned at implement-T0; tests assert the recorded code):

1. **Guard removed**: no `basePath !== expectedBase` check, no `VAULT_NOT_FOCUSED`. The eval runs in the requested vault (routed by `vault=`), so the payload no longer needs `expectedBase`.
2. **Locator resolved in the routed vault** (FR-006a): `getFiles().find` for `path`; `getFirstLinkpathDest` for `file` — in the requested vault (where the eval runs). A miss → `{ok:false, code:"FILE_NOT_FOUND"}`.
3. **Type check** (retained): `viewRegistry.isExtensionRegistered(ext)` → `{ok:false, code:"UNSUPPORTED_FILE_TYPE", detail:ext}` for a no-viewer type.
4. **Explicit placement open** (the open is branched, NOT a single `openLinkText(new_tab)` — `openLinkText(…,false)` replaces the active leaf and does NOT focus-existing, T0-confirmed):
   ```
   existing = <workspace leaf whose view.file.path === f.path>   # iterateAllLeaves — ALL view types, not markdown-only
   if (new_tab)            { open f in a NEW leaf;            placement = "new_tab_created" }
   else if (existing)      { setActiveLeaf(existing,{focus}); placement = "existing_tab_reused" }  # no duplicate
   else                    { openLinkText(f.path,'',false);  placement = "active_tab_used" }        # active leaf
   return {ok:true, opened:f.path, new_tab, placement}
   ```
   This fixes BI-057's latent reuse bug (it called `openLinkText(…,false)` and replaced the active leaf instead of focusing the existing tab). The open also **switches Obsidian's focus to the requested vault** as a side effect (probe-confirmed).

---

## 6. Handler control flow — single vault-targeted eval (no focus-switch)

```
executeOpenFile(input):
  resolveVaultRootOrRemap(registry, input.vault)                 # unknown vault → throw #1 (typed), pre-eval
  result = invokeCli({ command:"eval", vault: input.vault,       # specific mode → dispatchInput.vault=requested
                       parameters:{ code }, target_mode:"specific" })
        # routes the eval to the requested vault (B1 false). Inherits, vault-correctly:
        #   - closed vault → ADR-029 cold-start retry (attempt-1 COLD_START_PATTERN → attempt-2 in the vault)
        #   - app down     → ADR-030 launch of obsidian://open?vault=requested, then retry in the vault
        #   - app down + opt-out / launch fails → throw #4 (obsidian-not-running), inherited
  envelope = decodeEvalEnvelope(result)                          # INTERNAL_ERROR on malformed (#6)
  switch envelope:
    ok:true               → return { opened, vault: input.vault, new_tab, placement }
    FILE_NOT_FOUND        → throw #2
    UNSUPPORTED_FILE_TYPE → throw #3
```

**Notes**:
- **No focus-switch loop, no verify-poll, no `launchFn`, no `VAULT_NOT_FOCUSED` handling.** The routed eval does the whole open in the requested vault, including the focus switch.
- **Single-flight** via the existing `queue.run` in `invokeCli`.
- `resolveVaultRootOrRemap` is kept solely for the typed unknown-vault error (its returned base path is no longer needed by the eval — no guard).
- Recovery (cold-start, app-down) is entirely inherited from `dispatchCli`; `open_file` adds no recovery code.

---

## 7. Dependencies — `ExecuteDeps` (unchanged shape; no `launchFn`)

```text
ExecuteDeps {
  logger:        Logger              # injected (not constructed here)
  queue:         Queue               # injected
  vaultRegistry: VaultRegistry       # injected — unknown-vault pre-resolve
  spawnFn?:      SpawnLike           # test seam (→ dispatchCli)
  env?:          ProcessEnv
}  // NO launchFn — recovery inherited in dispatchCli; open_file imports no spawn site / launcher
```

---

## 8. State / lifecycle summary

| Vault state at request | Path to success | Recovery owner |
|------------------------|-----------------|----------------|
| Requested = focused | `vault=X eval` runs in X → opens (focus already X) | none (same as BI-057) |
| Requested open-but-unfocused | `vault=X eval` routes to X's window → opens + switches focus to X | the routed eval (B1 false) |
| Requested closed, app running | `vault=X eval` cold-launches X (attempt-1 `COLD_START_PATTERN`) → ADR-029 retry runs in X → opens + focus X | **inherited** ADR-029 |
| App down | `vault=X eval` → app-not-running → ADR-030 launches `obsidian://open?vault=X` → retry runs in X → opens + focus X | **inherited** ADR-030 (vault-targeted) |
| App down + opt-out / launch never ready | `obsidian-not-running` (#4) | inherited bound |
| Unknown vault | pre-eval throw (#1) | n/a |
| File absent (requested vault) | eval `FILE_NOT_FOUND` (#2) | n/a |
