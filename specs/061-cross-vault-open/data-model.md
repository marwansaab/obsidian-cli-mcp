# Data Model: Open Cross-Vault Files

Types, schemas, and the focus-switch state machine for the **eval-composed reactive focus-switch** design (ADR-031). All in `src/tools/open_file/`. The Zod schema is the single source of truth (Principle III). (The native `open`/`tab:open` route is OQ-1 — research D8 — not modelled here.)

---

## 1. Input schema — UNCHANGED (`openFileInputSchema`)

No change from BI-057 (FR-006a / Principle III — locator acceptance independent of runtime focus):

```text
{
  vault:   string (1..1000)              // required — the REQUESTED vault (focused, open-unfocused, or closed)
  path?:   safePathField                 // vault-relative; structural path-safety; exactly-one-of with file
  file?:   safeFileField                 // bare name; rejects [[ ]]; exactly-one-of with path
  new_tab: boolean = false               // opt-in; drives placement (§3)
}  // .strict(); superRefine enforces exactly-one-of path|file
```

**Semantic change only**: `vault` is the vault to switch focus to and open in (not "must already be focused"). Shape/messages byte-stable.

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
ok:true  → { ok:true, opened:string, new_tab:boolean, placement: PlacementEnum }   // + placement (NEW)
ok:false → { ok:false, code: "VAULT_NOT_FOCUSED" | "FILE_NOT_FOUND" | "UNSUPPORTED_FILE_TYPE", detail?: string }
```

- `placement` added to the `ok:true` arm (derived in-eval, §5).
- `VAULT_NOT_FOCUSED` stays in the `ok:false` enum but its **handler meaning changes** from "throw `VAULT_NOT_FOUND/not-open`" to "**fire focus-switch + re-poll**" (§4, §6). Never surfaced to the caller as an error.
- `FILE_NOT_FOUND` / `UNSUPPORTED_FILE_TYPE` arms unchanged.

---

## 4. Error triples (thrown `UpstreamError`) — reuse only

| # | Condition | `code` | `details.code` / `.reason` | Stage |
|---|-----------|--------|-----------------------------|-------|
| 1 | Unknown/unregistered vault | `CLI_REPORTED_ERROR` | `code:"VAULT_NOT_FOUND"`, `reason:"unknown"` | pre-eval (`resolveVaultRootOrRemap`) — **sole hard vault error** |
| 2 | File absent in requested vault | `CLI_REPORTED_ERROR` | `code:"FILE_NOT_FOUND"` | post-switch eval |
| 3 | No registered view for type | `CLI_REPORTED_ERROR` | `code:"UNSUPPORTED_FILE_TYPE"`, `extension` | post-switch eval (retained) |
| 4 | Focus-switch/launch unrecoverable (bound exhausted, or app-down + `OBSIDIAN_AUTO_LAUNCH` opt-out) | `CLI_NON_ZERO_EXIT` | `reason:"obsidian-not-running"` | handler (reused, ADR-030; app-down arm inherited) |
| 5 | Input validation | `VALIDATION_ERROR` | (field paths) | boundary (Zod) — retained |
| 6 | Malformed eval envelope | `INTERNAL_ERROR` | `stage` | decode — retained |

**Removed from the thrown surface**: the BI-057 `VAULT_NOT_FOCUSED` → `VAULT_NOT_FOUND/reason:"not-open"` mapping. `reason:"not-open"` stays in the ADR-015 enum (additive-only) with no emitter in this tool. **No new top-level code; no new reason.**

---

## 5. Eval template (`JS_TEMPLATE`) — behavioural changes

Three changes (exact string pinned at T0; tests assert the recorded code):

1. **Guard → switch-signal**: `if (norm(basePath) !== norm(expectedBase)) return {ok:false, code:"VAULT_NOT_FOCUSED"}` — same comparison/code, now a retry trigger not a terminal error.
2. **Locator in the verified-focused target vault** (FR-006a): resolution (`getFiles().find` for `path`; `getFirstLinkpathDest` for `file`) runs only after the guard passes (target vault).
3. **Explicit placement open** (D2; T0-confirmed — `openLinkText(…,false)` replaces the active leaf and does NOT focus-existing, so the open is branched, not a single `openLinkText(new_tab)`):
   ```
   existing = <workspace leaf whose view file path === f.path>   # getLeavesOfType, full path
   if (new_tab)            { open f in a NEW leaf;            placement = "new_tab_created" }
   else if (existing)      { setActiveLeaf(existing,{focus}); placement = "existing_tab_reused" }  # no duplicate
   else                    { openLinkText(f.path,'',false);  placement = "active_tab_used" }        # active leaf
   return {ok:true, opened:f.path, new_tab, placement}
   ```
   This also fixes BI-057's latent reuse bug (it called `openLinkText(…,false)` and replaced the active leaf instead of focusing the existing tab).

Type-check (`viewRegistry.isExtensionRegistered`) stays between resolution and open (UNSUPPORTED_FILE_TYPE).

---

## 6. Handler control flow — focus-switch state machine

```
executeOpenFile(input):
  expectedBase = resolveVaultRootOrRemap(registry, input.vault)   # unknown → throw #1, pre-eval
  result = runOpenEval(expectedBase, input)                       # invokeCli eval; inherits dispatch app-down + cold-start
  envelope = decodeEvalEnvelope(result)                           # INTERNAL_ERROR on malformed (#6)

  switch envelope:
    ok:true               → return {opened, vault: input.vault, new_tab, placement}
    FILE_NOT_FOUND        → throw #2
    UNSUPPORTED_FILE_TYPE → throw #3
    VAULT_NOT_FOCUSED     → focus-switch loop ↓

  # ---- focus-switch loop (cross-vault) — reached only when the app ran the eval (app is UP) ----
  deadline = now + OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS
  launchFn({ vault: input.vault })                                # obsidian://open?vault=requested (open/bring-up + focus)
  loop while now < deadline:
    sleep(LAUNCH_POLL_INTERVAL_MS)
    envelope = decodeEvalEnvelope(runOpenEval(expectedBase, input))
    switch envelope:
      ok:true               → return {opened, vault, new_tab, placement}   # switch landed
      FILE_NOT_FOUND        → throw #2                                     # landed; file genuinely absent
      UNSUPPORTED_FILE_TYPE → throw #3
      VAULT_NOT_FOCUSED     → continue                                     # not landed yet
  throw #4 (obsidian-not-running, "could not focus requested vault within bound")
```

**Notes**:
- The **app-down** arm never enters this loop: a down app makes `runOpenEval` *throw* the app-not-running error, recovered by `dispatchCli` (ADR-030) or surfaced as `obsidian-not-running` (#4) — both before an envelope reaches the handler. So `launchFn` here only ever focuses an already-running app (opt-out enforced upstream).
- **Single-flight** via the existing `queue.run` in `invokeCli`.
- **Bound**: ≤ `OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS / LAUNCH_POLL_INTERVAL_MS` re-evals; guaranteed termination (FR-005, SC-009).

---

## 7. Dependencies — `ExecuteDeps` (+ `launchFn`)

```text
ExecuteDeps {
  logger:        Logger              # existing (injected; not constructed here)
  queue:         Queue               # existing
  vaultRegistry: VaultRegistry       # existing
  spawnFn?:      SpawnLike           # existing test seam
  env?:          ProcessEnv          # existing
  launchFn?:     LaunchFn            # NEW — focus-switch seam; default launchObsidian (app-launcher)
}
```

`launchFn` defaults to `launchObsidian` in the `open_file` module (not the composition root) → `createServer` untouched. `LaunchFn = typeof launchObsidian`.

---

## 8. State / lifecycle summary

| Vault state at request | Path to success | Recovery owner |
|------------------------|-----------------|----------------|
| Requested = focused | eval#1 guard matches → open | none (same as BI-057) |
| Requested open-but-unfocused | eval#1 `VAULT_NOT_FOCUSED` → focus-switch + verify-poll → open | **handler** (new) |
| Requested closed, app running | eval#1 `VAULT_NOT_FOCUSED` → focus-switch (brings up + focuses) + verify-poll → open | handler (new) + inherited ADR-029 |
| App down | eval#1 throws app-not-running → dispatch launch + poll → (guard matches or focus-switch) → open | **dispatch** (inherited, ADR-030) |
| App down + opt-out / launch never ready | `obsidian-not-running` (#4) | inherited bound |
| Unknown vault | pre-eval throw (#1) | n/a |
| File absent (correct vault) | post-switch `FILE_NOT_FOUND` (#2) | n/a |
