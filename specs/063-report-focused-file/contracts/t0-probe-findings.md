# Implement-T0 Probe Findings: cross-vault active-file UI-state + field shape

Recorded at `/speckit-implement` time for BI-063 (`get_active_file`). Probe plan: [t0-probe-plan.md](t0-probe-plan.md). Gated by `.memory/test-execution-instructions.md` (drive `Obsidian.com`).

## Environment check (non-destructive)

- `obsidian` resolves to `C:\Program Files\Obsidian\Obsidian.com` (the production-resolved console shim — correct per the gate instructions; `.com` precedes `.exe` in PATHEXT). **CLI binary is reachable.**
- `Obsidian.com version` subcommand exists (the shim parsed an unknown `--version` and suggested `version`).

## P1 — Cross-vault active file is UI state (LOAD-BEARING) — **PENDING USER EXECUTION**

**Status**: not run autonomously. P1 requires **two registered vaults A and B both open, A focused, B with a distinct active file** — an interactive multi-window focus configuration that cannot be set up from a headless assistant session. This is the only probe whose failure changes the design (per the probe plan), so it must be observed in the user's live environment before the FR-011 / SC-006 cross-vault guarantee is treated as empirically verified for active-file UI state.

**Strong prior (why the code ships pending this)**: B1-false (`eval` honours `vault=`) is verified cohort-wide for routing under BI-0134 (`@marwansaab/obsidian-cli-mcp@0.8.6`) and governed by ADR-031. `getActiveFile()` reads the app instance the eval runs in, so the expected outcome is that `vault=B` returns B's active file. The handler is **unit-test-locked** to the open-but-unfocused expectation (`handler.test.ts`: specific-mode argv carries `vault=B` + `target_mode:"specific"`; success → B's `{ active }`).

**Contingency (unchanged from the plan)**: if P1 shows specific-mode returns the *focused* window's active file rather than the named vault's, STOP and surface to the user — the cross-vault guarantee degrades and the spec/plan must be revised (constrain specific mode to the focused vault, or document the limitation). The eval template and all other design elements are unaffected by the outcome.

**Exact argv to run** (the handler builds these; spawn as an argv array, no shell — the production cli-adapter resolves `.com` via the binary-resolver):

```
vault=B   eval   code=(()=>{const f=app.workspace.getActiveFile();return JSON.stringify(f?{ok:true,active:{path:f.path,name:f.name,basename:f.basename,extension:f.extension}}:{ok:true,active:null});})()
```

Expect `=> {"ok":true,"active":{"path":"B-note.md",...}}` (B's active file, not A's).

## P2 — Field shape characterisation — **PENDING (characterisation, strong prior)**

Requires making specific files active (`note.md`, `note.draft.md`, an extension-less file, a non-ASCII name) — interactive UI manipulation. Not run autonomously. The field-derivation (`name = basename + extension`; multi-dot; no-extension `extension:""`; non-ASCII raw) is byte-locked in unit tests through the mocked envelope (`handler.test.ts` field-shape cases) and asserted to pass through verbatim (the handler does not re-parse — the substrate is the source of truth).

## P3 — No-active-file success — **PENDING (characterisation, strong prior)**

Requires reaching an empty workspace / non-file view (interactive). Not run autonomously. Unit-locked: `handler.test.ts` asserts `{ ok:true, active:null }` → `{ active: null }` SUCCESS (not `isError`, not a throw), distinguishable from a present file via `active === null`.

## P4 — Eval IIFE form — **PARTIAL: template JS validity locked; live form confirmation PENDING**

The sync-IIFE template is a byte-stable constant asserted by `_template.test.ts` and is valid JS (it executes inside the 2736 passing unit tests via the mocked envelope path). Two ad-hoc live-invocation attempts hit **probe-harness argument-quoting artifacts**, not tool behaviour — recorded verbatim so a future run does not mistake them for findings:

- PowerShell `Start-Process … -ArgumentList @("eval","code=<tmpl>")` → `stdout: "Error: Unexpected end of input"`, `exit 0`. Cause: `Start-Process` re-quoted the `{`/`(`/`=>` in the `code=` arg, truncating the JS body. Harness artifact.
- Node `spawn(BIN, argv, { shell:false })` → `spawn error: ENOENT`. Cause: `.com` is not resolved by Node's `shell:false` path the way the production binary-resolver resolves it. Harness artifact (the MCP server spawns through the cli-adapter's resolver, which has its own live coverage).
- `shell:true` would re-introduce mangling because cmd.exe interprets the `>` in `=>` as a redirection operator.

The faithful live confirmation of the `=> ` echo strip is the user-run gate (run the exact argv above through the same argv-spawn the server uses). If the live `eval` requires the async form, switch `_template.ts` to `(async()=>{...})()` and update the recorded-argv tests — the design is otherwise unaffected.

## Summary

| Probe | Load-bearing | Status |
|-------|--------------|--------|
| P1 cross-vault UI state | **yes** | PENDING USER EXECUTION (needs two-vault interactive setup) |
| P2 field shape | no | PENDING (unit-locked; strong prior) |
| P3 no-active success | no | PENDING (unit-locked; strong prior) |
| P4 IIFE form | no | Template JS validity locked; live `=> ` strip PENDING |

The automated implementation is complete and green (lint, typecheck, build, 2736 unit tests, coverage, structural verification). The cross-vault guarantee ships on the strong B1-false prior, unit-test-locked to the open-but-unfocused expectation, **pending** the P1 forcing-gate in the user's live multi-vault environment.
