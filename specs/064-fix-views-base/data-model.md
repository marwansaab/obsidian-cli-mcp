# Data Model: Fix Views Base

**Feature**: 064-fix-views-base | **Date**: 2026-06-29 | **Plan**: [plan.md](plan.md)

Entities, schema deltas, handler control flow, and the typed-error roster. Source of truth for the implementation; the zod schema is the single source of truth for shape + runtime parse + downstream types (Principle III).

## Entities

- **View name** — the agent-facing identifier of one view inside a Base. The value the listing returns and the value `query_base`'s `view_name` accepts are the **same string**. Carries no type label, no trailing delimiter, no trailing whitespace; internal spaces/punctuation are part of the name and are preserved verbatim.
- **Base locator (`base_path`)** — a vault-relative path ending in `.base`, the identifier `bases` emits and `query_base`/`create_base` accept. Optional: present → name a specific Base; absent → the Base focused in Obsidian.
- **Vault identifier (`vault`)** — optional vault display name. With `base_path`, routes the focus to that vault (cross-vault). Without `base_path`, retains the inherited open-Base behaviour (the active `base:views` does not honour it).
- **Views listing result** — `{ views: string[], count }` (`count === views.length`), OR a distinguishable typed failure describing why the listing could not be produced.

## Input schema delta — `src/tools/views_base/schema.ts`

Current input: `{ vault?: string (min 1) }` (strict). **Add** an optional `base_path` validated like `query_base.base_path`:

```
viewsBaseInputSchema = z.object({
  base_path: z.string().optional(),     // vault-relative .base path; omitted ⇒ open-Base active mode
  vault: z.string().min(1).optional(),  // unchanged; routes the focus eval cross-vault when base_path present
}).strict()
  .superRefine((v, ctx) => {
    if (typeof v.base_path === "string") {
      // INVALID_BASE_PATH sub-issues — byte-parity with query_base:
      //   empty (length 0)            → reason "empty"          params {code:"INVALID_BASE_PATH", reason, field:"base_path", value_length}
      //   length > 1000               → reason "too-long"
      //   !isStructurallySafePath     → reason "path-traversal"
      //   !/\.base$/i.test(base_path) → reason "wrong-extension"
    }
  });
```

- `base_path` is **optional** (the key difference from `query_base`, where it is required) — omission selects open-Base mode.
- Output schema **unchanged**: `{ views: string[], count: int ≥ 0 }`, strict, refined `count === views.length`.
- `toMcpInputSchema` now emits `properties` keys `["vault", "base_path"]` (order per object declaration) — `schema.test.ts` updated accordingly.

## Handler control flow — `src/tools/views_base/handler.ts`

Branch on `base_path`. The mechanism for the named branch is selected at implement-time by the T0 probe (see [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md)); the control flow and error roster below are arm-independent.

```
executeViewsBase(input, deps):
  ── Stage 0 (named branch only) — locator already shape-validated by the schema ──
  if input.base_path is present:
     ── Stage A: address the named Base ──
     ARM "native path=" (if T0 P2 passes):
        cliResult = invokeCli(base:views, parameters:{path:base_path}, vault:input.vault,
                              target_mode: input.vault ? "specific" : "specific")
        → upstream resolves the named Base directly
     ARM "native focus-first" (default; if P2 fails):
        if input.vault present:
           resolveVaultRootOrRemap(vaultRegistry, vault)   // VAULT_NOT_FOUND/unknown on bad name
        focus the .base via the proven open mechanism (composeEvalCode + frozen focus template,
           target_mode "specific"+vault= when vault present, else "active"); a missing named .base
           surfaces FILE_NOT_FOUND from the focus step (⇒ "named Base not found")
        cliResult = invokeCli(base:views, parameters:{}, target_mode:"active")  // reads the just-focused Base
  else:
     ── open-Base mode (unchanged) ──
     cliResult = invokeCli(base:views, parameters:{}, target_mode:"active")

  ── Stage B: classify failures (combined stdout\nstderr), zero new top-level codes ──
  - no base_path + "Active file is not a base file" / nothing focused → CLI_REPORTED_ERROR/BASE_NOT_FOUND reason:"not-open"     (no Base open)
  - named + base missing (focus FILE_NOT_FOUND remapped, or path= report) → CLI_REPORTED_ERROR/BASE_NOT_FOUND reason:"named-missing" (named not found)
  - named + .base unusable                                           → CLI_REPORTED_ERROR/BASE_MALFORMED   (if upstream reports)
  - bad vault                                                        → CLI_REPORTED_ERROR/VAULT_NOT_FOUND/unknown
  (named-path failures NEVER fall back to the open Base — FR-009)

  ── Stage C: US1 label-strip (both modes) ──
  views = cliResult.stdout.split("\n").map(trim).filter(nonEmpty).map(stripTypeLabel)
      // stripTypeLabel removes ONLY the injected trailing type label (+ its delimiter),
      // anchored to the known Bases view-type token set (T0 P1); internal/trailing
      // punctuation that is part of the name is preserved (FR-003).

  ── Stage D: output parse (defence-in-depth) ──
  return viewsBaseOutputSchema.parse({ views, count: views.length })
```

### `details.reason` discriminator on `BASE_NOT_FOUND` (ADR-015)

`BASE_NOT_FOUND` carries `details.reason ∈ { "named-missing", "not-open" }` to keep the two base-not-found states distinguishable under one `(CLI_REPORTED_ERROR, BASE_NOT_FOUND)` pair (SC-004). This is locked, not conditional: both arms converge on it — the focus-first arm **remaps** its upstream `FILE_NOT_FOUND` to `BASE_NOT_FOUND/named-missing` (cohort consistency with `query_base`, which reports a missing `.base` as `BASE_NOT_FOUND`), and the `path=` arm classifies upstream's missing-base report to the same shape. Additive-only; zero new top-level codes; existing `BASE_NOT_FOUND` consumers keying on `details.code` (including `query_base`/`create_base`, which emit no `reason`) are unaffected.

## Typed-error roster

| Cause (spec) | Top-level `code` | `details` | Mode |
|---|---|---|---|
| Malformed locator (empty / too-long / traversal / not `.base`) — FR-012 | `VALIDATION_ERROR` | zod issues; `params.code: "INVALID_BASE_PATH"`, `params.reason` | named |
| Named Base not found — FR-007 | `CLI_REPORTED_ERROR` | `code: "BASE_NOT_FOUND", reason: "named-missing"` (focus arm's `FILE_NOT_FOUND` remapped) | named |
| No Base open — FR-006 | `CLI_REPORTED_ERROR` | `code: "BASE_NOT_FOUND", reason: "not-open"` | open |
| Named target is malformed — FR-008 | `CLI_REPORTED_ERROR` | `code: "BASE_MALFORMED"` | named |
| Unknown vault name — FR-007/D7 | `CLI_REPORTED_ERROR` | `code: "VAULT_NOT_FOUND", reason: "unknown", vault` | named |
| Other upstream CLI failure | `CLI_REPORTED_ERROR` / inherited `CLI_*` | adapter-provided | both |
| Malformed input (unknown key, etc.) | `VALIDATION_ERROR` | zod issues | both |

All named-path failure causes are mutually distinguishable (distinct `details.code`, or `details.reason` where conditional), and none is ever resolved by silently substituting the open Base (FR-009 / SC-006).

## Traceability

| Spec | Design element |
|---|---|
| FR-001/002 / SC-001 | Stage C label-strip → query-acceptance-equivalent names |
| FR-003 / SC-003 | `stripTypeLabel` anchored to known type tokens (punctuation preserved) |
| FR-004 / SC-002 | optional `base_path` + named branch (focus-first / `path=`) |
| FR-005/006 / SC-005 | open-Base branch unchanged (no `base_path` ⇒ active `base:views`) |
| FR-007 | `BASE_NOT_FOUND/named-missing` ≠ `BASE_NOT_FOUND/not-open` (one code, `details.reason` discriminator) |
| FR-008 | `INVALID_BASE_PATH` (validation) / `BASE_MALFORMED` (runtime) |
| FR-009 / SC-006 | named-path failures never substitute the open Base |
| FR-010 / SC-004 | distinct `details.code` (+ conditional `reason`); reuses cohort failure convention |
| FR-011 | output `{views, count}` unchanged; read-only (focus is the only side effect, named path) |
| FR-012 | `base_path` validation mirrors `query_base` |
