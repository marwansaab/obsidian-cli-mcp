# Implement-T0 Probe Plan: cross-vault active-file UI-state + field shape

Run at `/speckit-implement` time, **before** finalising the cross-vault test-locks. Gated by `.memory/test-execution-instructions.md` (authorised test vault, scratch subdir, cleanup). **Drive `Obsidian.com`** (the production-resolved console shim), never the GUI `Obsidian.exe` (detached stdio → false-clean empty exit 0). Record results in `contracts/t0-probe-findings.md` (created at implement time).

## P1 — Cross-vault active file is UI state (D9, the load-bearing probe)

**Question**: does a `target_mode:"specific"` eval against an **unfocused** named vault return *that vault's* `getActiveFile()`, or the *focused window's*?

**Forcing gate**: two registered vaults A and B, both open, **A focused**, B has a *distinct* active file from A (e.g. A active = `A-note.md`, B active = `B-note.md`). Vaults chosen so the active files are unambiguously different.

**Steps**:
1. Confirm A is focused and B is open-but-unfocused.
2. Run the `get_active_file` eval routed `vault=B, target_mode:"specific"` (the exact argv the handler builds).
3. **Expect**: `active.path` = B's active file (`B-note.md`), **not** A's.
4. Run it routed `vault=A, target_mode:"specific"` → expect A's active file.
5. Run `target_mode:"active"` (no vault) → expect the focused vault's (A's) active file.

**Pass** ⇒ FR-011 / SC-006 cross-vault guarantee holds; lock the open-but-unfocused test. **Fail** (B routes to A's active file) ⇒ specific-mode cross-vault active-file is **not** supported by the substrate; STOP and surface to the user — revise the spec/plan (e.g. constrain specific mode to the focused vault with a documented limitation, or degrade to a typed signal). Do not ship the cross-vault guarantee unverified.

## P2 — Field shape characterisation (FR-002/003/004)

Against the authorised vault, make each file active in turn and run `get_active_file` (active mode), asserting the four fields:

| Case | Fixture | Expect |
|------|---------|--------|
| Single extension | `note.md` | `name:"note.md"`, `basename:"note"`, `extension:"md"` |
| Multi-dot | `note.draft.md` | `basename:"note.draft"`, `extension:"md"` |
| No extension | a file with no dot in the name | `extension:""`, `name === basename` |
| Non-ASCII | a note whose name/path has non-ASCII chars (e.g. `日本語.md`, `café/note.md`) | bytes returned raw, round-trip-equal to the on-disk name |
| Leading dot (best-effort) | `.gitignore`-style name if Obsidian surfaces it as a file | record Obsidian's `basename`/`extension` split verbatim (characterise, don't assert a re-parser) |

## P3 — No-active-file success (FR-005)

1. Close all panes / reach an empty workspace (or focus a non-file view).
2. Run `get_active_file` (active mode).
3. **Expect**: success `{ active: null }` — **not** an error, **not** `ERR_NO_ACTIVE_FILE`.

## P4 — Eval IIFE form

Confirm the chosen sync-IIFE template (`(()=>{...})()`) is accepted by the live `eval` subcommand and the `"=> "` echo strips cleanly via `parseEvalStdout`. If the live CLI requires the async form, switch to `(async()=>{...})()` and update the recorded-argv tests.

## Notes

- P1 is the only probe whose failure changes the design; P2–P4 are characterisation/confirmation with strong priors.
- All in-process unit tests mock `invokeCli` and need **no** live CLI — this probe plan applies only to the live-CLI verification gate.
