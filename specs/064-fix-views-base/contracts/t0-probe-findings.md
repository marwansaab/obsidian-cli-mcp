# T0 Forcing-Gate Probe Findings: Fix Views Base (BI-064)

**Feature**: 064-fix-views-base | **Date**: 2026-06-29 | **Plan**: [../plan.md](../plan.md) | **Probe plan**: [t0-probe-plan.md](t0-probe-plan.md)

Live-CLI evidence captured during `/speckit-implement`. Drove `Obsidian.com` (bare `obsidian` resolves to the `.COM` console shim) against the running Obsidian instance (vault **"The Setup"**, Obsidian `1.12.7`), per [.memory/test-execution-instructions.md](../../../.memory/test-execution-instructions.md). stdout/stderr captured separately via `Start-Process -RedirectStandardOutput/-RedirectStandardError`.

## Environment note (decisive for the arm)

At probe time only one vault was open: **"The Setup"**. Registered-but-closed vaults (incl. `TestVault-Obsidian-CLI-MCP`) were **not** reachable by the raw CLI: `eval vault=TestVault… code=…` and `open vault=TestVault… path=…` and `bases vault=TestVault…` all ran against the **focused** vault and **ignored `vault=`**. This is the raw-CLI surface; production reaches a closed vault only through `dispatchCli`'s ADR-029/030 cold-launch recovery (proven cohort-wide for `open_file`/BI-0134, ADR-031). Consequently P1/P3 were captured against a real `.base` **in the open vault** (read-only), which is sufficient to settle the label shape and the focus-then-active handoff; the cross-vault routing is inherited, not re-derived here.

## P1 — Real `base:views` active-mode output format (REQUIRED) — CAPTURED

Focused `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog.base` (4 `table` views with multi-word + hyphenated names) via the proven eval-open mechanism, then ran `obsidian base:views` (active). Exact stdout (tabs shown as `⇥`):

```
Obsidian CLI MCP - Backlog⇥table
Obsidian CLI MCP - Backlog by Tier⇥table
Obsidian CLI MCP - Shipped by Tier⇥table
Obsidian CLI MCP - Open Bugs⇥table
```

**Finding**: the emitted format is `<view name>\t<view type>` — the injected label is a **TAB delimiter + a lowercase view-type token**, one view per line, trailing newline. The current handler only `trim()`s each line, so it returns `"Obsidian CLI MCP - Backlog\ttable"` verbatim — the US1 defect, confirmed live (the returned string is not the name `query_base` accepts).

**Delimiter correction to D5**: D5 assumed a *space* delimiter and therefore mandated token-anchored stripping to avoid over-trimming names that contain spaces. The real delimiter is a **TAB**, which view names cannot contain — so the name/type split is unambiguous and internal spaces, hyphens, and punctuation in the name are preserved for free (they sit before the tab). `stripTypeLabel` removes the trailing `\t<type>` and is *additionally* anchored to the known type-token set (below) per the spec's "never blind-trim a trailing token" intent.

**Closed view-type token set** (live, authoritative — read from the Bases internal plugin registry `app.internalPlugins.plugins.bases.instance.registrations`):

```
["table", "cards", "list"]
```

These are the only registered Bases view types in Obsidian 1.12.7. `stripTypeLabel` anchors to this set: it strips the trailing tab-delimited token only when that token ∈ {`table`, `cards`, `list`}.

**Round-trip (SC-001/003)**: stripping `"Obsidian CLI MCP - Backlog\ttable"` → `"Obsidian CLI MCP - Backlog"`, which is exactly the `name:` declared in the `.base` YAML and the value `query_base view_name=` accepts. Spaces and the `-` punctuation survive intact.

## P2 — Re-test `base:views path=` / `vault=` — FAIL (R-003 holds)

Ran, with a different vault focused than the named target, and the named `.base` not focused:

- `base:views vault=TestVault-Obsidian-CLI-MCP path=Sandbox/BI-064/Tasks.base` → `Error: Active file is not a base file: …BI-0127…md` (the **focused** vault's active file).
- `base:views path=Sandbox/BI-064/Tasks.base` (no vault) → same focused-file error.
- `bases vault=TestVault-Obsidian-CLI-MCP` → listed the **focused** vault's bases, not TestVault's.

**Finding**: `base:views` **ignores both `path=` and `vault=`** and always reads the active file of the focused vault. R-003 ("`base:views` is active-mode-only") is **confirmed**, not a `.exe` misobservation — captured against `.com`. ⇒ the single-call `path=` arm is **not viable**; ship US2 via **focus-then-active**.

## P3 — Focus-then-active reliability — RELIABLE

Opened the target `.base` via an `app.workspace.openLinkText` eval (the proven open mechanism), then — in a **separate** `obsidian` process — ran active `base:views`:

- The eval returned `{"ok":true,"opened":"…Backlog.base","active":"…Backlog.base"}` — the just-opened `.base` is the active file.
- The immediately-following `base:views` returned that base's four views (above). A second `base:views` returned identically — **stable, no race** across the cross-process handoff to the persistent Obsidian instance.
- Opening a non-existent `.base` (`getAbstractFileByPath` → null) returned `{"ok":false,"code":"FILE_NOT_FOUND"}` — a clean, distinct missing-base signal that the handler remaps to `BASE_NOT_FOUND/named-missing` (not leaked).

**Finding**: focus-then-active is **RELIABLE** for the in-vault case (the common US2 path: an agent names a base in the open vault without focusing it). ⇒ no eval-fallback (P4) needed. Cross-vault routing rides the inherited `dispatchCli`/ADR-031 cold-launch already proven for `open_file`.

## P4 — In-eval enumeration fallback — NOT RUN

P3 is reliable, so the fallback is unnecessary. (Noted: a specific base's view list is not exposed by the `registrations` registry, which lists view *types*, not a base's *views*; enumerating a named base's views in-eval would approach the BI-041 client-side-`.base`-read line and require a new ADR. Avoided.)

## P-edge — Empty-views — NOT CAPTURED LIVE

The empty-views quirk (D10) is documented as a known edge, reported as the mechanism reports it; not normalised. No code path depends on a live capture. Left as-is.

## Decision (T007)

**Resolved arm: native focus-first** (P2 FAIL ⇒ not `path=`; P3 RELIABLE ⇒ not eval-fallback).

- **`stripTypeLabel`**: split each line on the trailing **TAB**; strip the trailing token only when it ∈ {`table`, `cards`, `list`}; preserve all name-internal characters. Applied in **both** modes.
- **Named branch**: `base_path` present → (optional `vault` → `resolveVaultRootOrRemap` for typed `VAULT_NOT_FOUND/unknown`) → frozen focus eval (`composeEvalCode`, `openLinkText`, `target_mode:"specific"+vault=` when `vault` given else `"active"`) → active `base:views` → strip. A focus-eval `FILE_NOT_FOUND` remaps to `BASE_NOT_FOUND/named-missing`.
- **Open branch**: `base_path` absent → active `base:views` (unchanged) → strip; no-base-open → `BASE_NOT_FOUND/reason:"not-open"`.
- **Error roster** unchanged from the contract; zero new top-level codes; `BASE_NOT_FOUND.details.reason ∈ {named-missing, not-open}` (ADR-015 additive).
