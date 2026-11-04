# `bases`

Enumerate all Obsidian Bases (`.base`) files in the vault and return their vault-relative paths as a sorted list. Member of the Bases-family cohort (siblings: `query_base`, `views_base`, `create_base`).

## When to use this tool

| You want to | Reach for |
|---|---|
| Discover all `.base` files in the vault | `bases` |
| Enumerate views inside a known `.base` file | `views_base` |
| Query rows from a named view | `query_base` |
| Create a new item in a `.base` file | `create_base` |

## Input

| Field   | Type   | Required | Notes |
|---------|--------|----------|-------|
| `vault` | string | no       | Vault display name (min length 1). Lists that vault's Bases. Omit to list the vault in front. |

## Output

```json
{
  "bases": [
    "000-Meta/Bases/Type ID Index.base",
    "220-Planning/Backlog (Base).base",
    "Vault Health Check.base"
  ],
  "count": 3
}
```

- `bases` — vault-relative paths to `.base` files, sorted lexicographically (path-ascending).
- `count` — number of `.base` files found; always equals `bases.length`.
- Empty vault returns `{ "bases": [], "count": 0 }`.
- No truncation — all paths returned unconditionally.

## Vault routing

- **`vault` named**: the tool lists that vault's Bases, whether the vault is in front, open behind another vault, or closed. The vault in front stays in front.
- **`vault` omitted**: the tool lists the Bases of the vault in front.
- **Closed vault**: a registered vault that is not open is opened automatically and the call returns its normal result (the first call takes longer). If it cannot be brought up, the call fails with `CLI_REPORTED_ERROR` whose `details.stdout` starts `Error: Command "bases" not found.`: open the vault in Obsidian, then call again.
- **Unregistered name**: the call fails with `VAULT_NOT_FOUND` before the CLI runs, so another vault's Bases are never returned in its place.

## Errors — Error roster

| Top-level `code`     | When | Recovery |
|----------------------|------|----------|
| `CLI_REPORTED_ERROR` | Upstream CLI failure | Retry; check that Obsidian is running. |
| `CLI_REPORTED_ERROR` with `details.code: "VAULT_NOT_FOUND"`, `details.reason: "unknown"` | The `vault` display name is not registered with Obsidian | Check the name with `vaults`. A vault added after the server started is found without a restart. |
| `VALIDATION_ERROR`   | Malformed input (e.g. unknown keys in strict mode) | Fix input shape. |
| `UPSTREAM_TIMEOUT`   | Subprocess exceeded 10 s | Retry; investigate vault size. |

## Examples — Worked examples

### Example 1 — Happy path

```json
{
  "name": "bases",
  "arguments": {}
}
```

Response:

```json
{
  "bases": [
    "000-Meta/Bases/Type ID Index.base",
    "220-Planning/Backlog (Base).base",
    "Vault Health Check.base"
  ],
  "count": 3
}
```

### Example 2 — Empty vault

```json
{
  "name": "bases",
  "arguments": {}
}
```

```json
{ "bases": [], "count": 0 }
```

### Example 3 — A named vault

```json
{
  "name": "bases",
  "arguments": { "vault": "Work" }
}
```

Lists the Bases of the `Work` vault, even when another vault is in front:

```json
{ "bases": ["Planning/Roadmap.base", "Projects/Tasks.base"], "count": 2 }
```
