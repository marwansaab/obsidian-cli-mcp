# Data model: Enable cross-vault Bases

No input field, output field or error code is added (FR-012, Principle IV). The only changes are which vault each call routes to, two additive `details` keys, and one internal eval envelope.

## E1: vault target (input, unchanged shape)

- `vault?: string` (min 1) on `bases`, `views_base` and `create_base`. Its schema is unchanged; only its description moves (D8).
- **Resolution**: present → `resolveVaultRootOrRemap` gives `root(vault)`, or `VAULT_NOT_FOUND`; absent → the front vault (today's path).

## E2: item-folder envelope (internal, `create_base` named path only)

The decoded answer of `ITEM_FOLDER_TEMPLATE`. Its Zod schema `itemFolderEvalResponseSchema` lives in `create_base/schema.ts`, next to the published schemas; like `views_base`'s `focusBaseEvalResponseSchema`, it is internal and does not affect the fingerprint.

```text
{ ok: true,  folder: string }           // vault-relative, "" = vault root
{ ok: false, code: "BASE_NOT_FOUND" }   // no file at base_path in the named vault
```

**Derived item folder** = `posix.join(folder, posix.dirname(name))`. `dirname` of a bare name is `.`, so the join yields `folder`, and an empty result means the vault root.

## E3: error `details` (existing codes, additive keys only)

| Error | Today | Named vault (this feature) |
|-------|-------|----------------------------|
| `VAULT_NOT_FOUND` | `{code, reason:"unknown", vault}` | Same shape, now also on `bases`, open-mode `views_base` and `create_base` |
| `views_base` `BASE_NOT_FOUND` / `not-open` | `{code, reason}` | `{code, reason, vault}` |
| `create_base` `BASE_NOT_FOUND` | `{code, path}` | `{code, path, vault}` |
| `PATH_ESCAPES_VAULT` (pre-create) | `{vault, attemptedPath, resolvedPath}` | Same (`assertCanonicalPath`) |
| `PATH_ESCAPES_VAULT` (backstop) | — | `{vault, attemptedPath, resolvedPath, createdPath}` |

With `vault` omitted, every `details` object and message is byte-identical to today (FR-011).

## Invariants

- **V1**: an unregistered `vault` spawns nothing and yields `VAULT_NOT_FOUND`, on all three operations.
- **V2**: with `vault` omitted, the argv, results, `details` and messages equal today's on all three operations.
- **V3**: with `vault` supplied, every spawn the handler makes carries `vault=<name>`.
- **V4**: `create_base` with `vault` never spawns `base:create` unless the vault resolved, both pre-create containment checks passed, and the folder envelope was `ok:true`.
- **V5**: the backstop never deletes or modifies the created item. It only reports.
- **V6**: no new top-level code and no new `details.reason`.
