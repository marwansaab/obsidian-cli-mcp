# Data Model: Open Cross-Vault Files

Types, schemas, and the focus-switch state machine. All in `src/tools/open_file/`. The Zod schema is the single source of truth (Principle III); downstream types are `z.infer`.

---

## 1. Input schema — UNCHANGED (`openFileInputSchema`)

No change from BI-057 (FR-006a / Principle III — locator acceptance must not depend on runtime focus):

```text
{
  vault:   string (1..1000)              // required — the REQUESTED vault (may be focused, open-unfocused, or closed)
  path?:   safePathField                 // vault-relative; structural path-safety; exactly-one-of with file
  file?:   safeFileField                 // bare name; rejects [[ ]]; exactly-one-of with path
  new_tab: boolean = false               // opt-in; drives placement (§3)
}  // .strict(); superRefine enforces exactly-one-of path|file
```

**Semantic change only**: `vault` no longer means "must be the focused vault." It now means "the vault to switch focus to and open in." The schema shape, validation messages, and `exactly-one-of` logic are byte-stable.

---

## 2. Output schema — `openFileOutputSchema` (+ `placement`)

```text
{
  opened:    string                      // resolved vault-relative path (canonical), regardless of locator shape
  vault:     string                      // the vault the file was opened in (the requested vault) — FR-019, US1-AC2
  new_tab:   boolean                     // echo of the honored opt-in
  placement: "new_tab_created"           // NEW — FR-008..FR-011; exactly one value
           | "existing_tab_reused"
           | "active_tab_used"
}  // .strict()
```

`placement` is a closed Zod enum: `z.enum(["new_tab_created", "existing_tab_reused", "active_tab_used"])`. No pane/leaf ids or split geometry (FR-012/FR-023).

---

## 3. Eval envelope — `openEvalResponseSchema` (discriminated on `ok`)

```text
ok:true  → { ok:true, opened:string, new_tab:boolean, placement: PlacementEnum }   // + placement (NEW)
ok:false → { ok:false, code: "VAULT_NOT_FOCUSED" | "FILE_NOT_FOUND" | "UNSUPPORTED_FILE_TYPE", detail?: string }
```

- `placement` added to the `ok:true` arm (derived in-eval, §5).
- `VAULT_NOT_FOCUSED` stays in the `ok:false` enum but its **handler meaning changes** from "throw `VAULT_NOT_FOUND/not-open`" to "**fire focus-switch + re-poll**" (§4, §6). It is never surfaced to the caller as an error.
- `FILE_NOT_FOUND` / `UNSUPPORTED_FILE_TYPE` arms unchanged.

---

## 4. Error triples (thrown `UpstreamError`) — reuse only

| # | Condition | `code` | `details.code` / `.reason` | Stage |
|---|-----------|--------|-----------------------------|-------|
| 1 | Unknown/unregistered vault | `CLI_REPORTED_ERROR` | `code:"VAULT_NOT_FOUND"`, `reason:"unknown"` | pre-eval (`resolveVaultRootOrRemap`) — **sole hard vault error** |
| 2 | File absent in requested vault | `CLI_REPORTED_ERROR` | `code:"FILE_NOT_FOUND"` | post-switch eval |
| 3 | No registered view for type | `CLI_REPORTED_ERROR` | `code:"UNSUPPORTED_FILE_TYPE"`, `extension` | post-switch eval (retained) |
| 4 | Focus-switch/launch unrecoverable (bound exhausted, or app-down + `OBSIDIAN_AUTO_LAUNCH` opt-out) | `CLI_NON_ZERO_EXIT` | `reason:"obsidian-not-running"` | handler (reused from ADR-030; app-down arm inherited from `dispatchCli`) |
| 5 | Input validation | `VALIDATION_ERROR` | (field paths) | boundary (Zod) — retained |
| 6 | Malformed eval envelope | `INTERNAL_ERROR` | `stage` | decode — retained |

**Removed from the thrown surface**: the BI-057 `VAULT_NOT_FOUND/reason:"not-open"` mapping (case `VAULT_NOT_FOCUSED` in `mapEvalError`). `reason:"not-open"` is **not** deleted from the ADR-015 enum (additive-only) — it simply has no emitter in this tool. **No new top-level code; no new reason.**

---

## 5. Eval template (`JS_TEMPLATE`) — behavioural changes

The frozen IIFE changes in three places (exact string pinned at T0; tests assert the recorded code):

1. **Guard → switch-signal**: `if (norm(basePath) !== norm(expectedBase)) return {ok:false, code:"VAULT_NOT_FOCUSED"}` — same comparison, same envelope code, but now a *retry trigger* not a terminal error.
2. **Locator in the verified-focused target vault** (FR-006a): resolution (`getFiles().find` for `path`; `getFirstLinkpathDest` for `file`) runs only after the guard passes, i.e. in the target vault. (Structurally unchanged code; its correctness now depends on the guard-passed ordering.)
3. **Placement derivation** (D2), before `openLinkText`:
   ```
   alreadyOpen = <any workspace leaf whose view file path === f.path>
   placement   = new_tab ? "new_tab_created"
                : alreadyOpen ? "existing_tab_reused"
                : "active_tab_used"
   await app.workspace.openLinkText(f.path, '', new_tab)
   return {ok:true, opened:f.path, new_tab, placement}
   ```

Type-check (`viewRegistry.isExtensionRegistered`) stays between resolution and open (UNSUPPORTED_FILE_TYPE).

---

## 6. Handler control flow — focus-switch state machine

```
executeOpenFile(input):
  expectedBase = resolveVaultRootOrRemap(registry, input.vault)   # unknown → throw (triple #1), pre-eval
  result = runOpenEval(expectedBase, input)                       # invokeCli eval; inherits dispatch app-down + cold-start recovery
  envelope = decodeEvalEnvelope(result)                           # INTERNAL_ERROR on malformed (triple #6)

  switch envelope:
    ok:true                       → return {opened, vault: input.vault, new_tab, placement}
    FILE_NOT_FOUND                → throw triple #2
    UNSUPPORTED_FILE_TYPE         → throw triple #3
    VAULT_NOT_FOCUSED             → focus-switch loop ↓

  # ---- focus-switch loop (cross-vault) — only reached when the app ran the eval (app is UP) ----
  deadline = now + OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS
  launchFn({ vault: input.vault })                                # obsidian://open?vault=requested (open/bring-up + focus)
  loop while now < deadline:
    sleep(LAUNCH_POLL_INTERVAL_MS)
    envelope = decodeEvalEnvelope(runOpenEval(expectedBase, input))
    switch envelope:
      ok:true                     → return {opened, vault, new_tab, placement}   # switch landed
      FILE_NOT_FOUND              → throw triple #2                              # landed; file genuinely absent
      UNSUPPORTED_FILE_TYPE       → throw triple #3
      VAULT_NOT_FOCUSED           → continue                                     # not landed yet
  throw triple #4 (obsidian-not-running, "could not focus requested vault within bound")
```

**Notes**:
- The **app-down** arm never enters this loop: a down app makes `runOpenEval` *throw* the app-not-running error, which `dispatchCli` recovers (launch + poll) or surfaces as `obsidian-not-running` (triple #4) — both *before* an envelope reaches the handler. So `launchFn` here only ever focuses an already-running app (never launches a down one → opt-out stays enforced upstream).
- **Single-flight**: each `runOpenEval` is wrapped by `invokeCli` in `queue.run`, so concurrent opens serialize through the existing queue (no new concurrency primitive).
- **Bound**: at most `OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS / LAUNCH_POLL_INTERVAL_MS` re-evals; guaranteed termination (FR-005, SC-009).

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
| Requested closed, app running | eval#1 `VAULT_NOT_FOCUSED` → focus-switch (brings up + focuses) + verify-poll → open | **handler** (new) |
| App down | eval#1 throws app-not-running → dispatch launch + poll → (then guard matches or focus-switch) → open | **dispatch** (inherited, ADR-030) |
| App down + opt-out, or launch never ready | `obsidian-not-running` (triple #4) | dispatch/handler bound |
| Unknown vault | pre-eval throw (triple #1) | n/a |
| File absent (correct vault) | post-switch `FILE_NOT_FOUND` (triple #2) | n/a |
