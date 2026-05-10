# Contract: `src/vault-registry/`

**Feature**: `016-reliable-writer`
**Surface**: `createVaultRegistry(deps).resolveVaultPath(name)` at `src/vault-registry/registry.ts`
**Plan reference**: [plan.md](../plan.md) | **Data model**: [data-model.md](../data-model.md)

This module is **internal** (not an MCP tool). It supports the new `write_note` per ADR-009 / FR-012. A future `list_vaults` MCP tool may consume the same probe data — this contract is written to be reusable by such a tool without rework.

## Public surface

```ts
export interface VaultRegistryDeps {
  /**
   * Bug-safe wrapper that runs `obsidian vaults verbose` and returns its
   * stdout. The wrapper MUST surface failures as UpstreamError instances
   * (CLI_BINARY_NOT_FOUND if the binary is missing, CLI_REPORTED_ERROR if
   * Obsidian is not running, CLI_TIMEOUT if it hangs, etc.).
   */
  invokeProbe: () => Promise<string>;
}

export interface VaultRegistry {
  /**
   * Resolve a caller-supplied vault name to its canonical absolute filesystem
   * path. Lazily populates the cache on the first call; cached for the
   * MCP-server-process lifetime once successful.
   *
   * @throws UpstreamError(VALIDATION_ERROR) if the probe succeeded but the
   *         requested vault name is not in the resulting registry. Caller
   *         hint: vault was added to Obsidian after MCP started — restart MCP.
   * @throws UpstreamError(CLI_BINARY_NOT_FOUND | CLI_REPORTED_ERROR | ...) if
   *         the underlying probe failed. Caller hint: open Obsidian and
   *         retry; the cache stays unset so the next call retries the probe.
   */
  resolveVaultPath(vaultName: string): Promise<string>;
}

export function createVaultRegistry(deps: VaultRegistryDeps): VaultRegistry;
```

## State machine

```text
     ┌──────────────────────────────┐
     │ EMPTY (cache === null)        │ ← initial state; persists until first
     │                              │   successful probe
     └─────┬─────────────────────┬──┘
           │                     │
   resolveVaultPath()    resolveVaultPath()
   succeeds in probe     fails in probe
           │                     │
           ▼                     ▼
   ┌────────────────┐    ┌──────────────────────────────┐
   │ POPULATED      │    │ EMPTY (cache stays null)     │ ← propagates probe
   │ (cache: Map<>) │    │                              │   error to caller; next
   │                │    │                              │   call retries probe
   └────────────────┘    └──────────────────────────────┘
           │
   subsequent calls
   hit cache (no
   second probe)
```

## Probe response parser (FR-012, F2)

`obsidian vaults verbose` returns one row per registered vault, tab-separated:

```text
TestVault-Obsidian-CLI-MCP\tC:\Marwan-Saab-ADO\Marwan at Metcash\Obsidian\TestVault-Obsidian-CLI-MCP\n
The Setup\tC:\Marwan-Saab-ADO\Marwan at Metcash\Obsidian\The Setup\n
```

Parser rules:

- Split stdout on `\n` (newline)
- For each non-empty row: split on the FIRST `\t` only (vault paths may contain spaces and tabs are not valid in Obsidian vault names)
- Trim trailing `\r` from each row (Windows line ending tolerance)
- Strip BOM from start of stdout if present
- Skip rows with empty name or empty path silently (defensive)
- Skip rows without any `\t` silently (malformed)
- Build a `ReadonlyMap<string, string>` (name → absolute path)
- Return the map

## Error mapping

| Failure source | Resulting UpstreamError code | When |
|---|---|---|
| Probe wrapper throws `CLI_BINARY_NOT_FOUND` | `CLI_BINARY_NOT_FOUND` | Propagated as-is. Cache unset. |
| Probe wrapper throws `CLI_REPORTED_ERROR` (Obsidian not running, vault list call failed) | `CLI_REPORTED_ERROR` | Propagated as-is. Cache unset. |
| Probe wrapper throws `CLI_TIMEOUT` | `CLI_TIMEOUT` | Propagated as-is. Cache unset. (Probe is normally ~150 ms; timeout is rare.) |
| Probe succeeded but `vaultName` not in resulting map | `VALIDATION_ERROR` | New error this module raises. Details: `{ requestedVault, knownVaults }` |

## Concurrency

If two `resolveVaultPath` calls race against the empty cache, both should NOT trigger separate probes. Implementation pattern:

```ts
let inFlightProbe: Promise<CachedRegistry> | null = null;

async function resolveVaultPath(vaultName: string): Promise<string> {
  if (cache !== null) {
    const path = cache.get(vaultName);
    if (path !== undefined) return path;
    throw new UpstreamError({ code: "VALIDATION_ERROR", ... });
  }

  // Cache empty: deduplicate concurrent first-calls onto one probe
  if (inFlightProbe === null) {
    inFlightProbe = (async () => {
      try {
        const stdout = await deps.invokeProbe();
        const parsed = parseVaultsVerboseOutput(stdout);
        cache = parsed;
        return parsed;
      } finally {
        inFlightProbe = null;
      }
    })();
  }

  let resolved: CachedRegistry;
  try {
    resolved = await inFlightProbe;
  } catch (e) {
    // Probe failure: cache stays null; next call retries
    throw e;
  }
  const path = resolved.get(vaultName);
  if (path === undefined) {
    throw new UpstreamError({ code: "VALIDATION_ERROR", ... });
  }
  return path;
}
```

## Test seam

`VaultRegistryDeps.invokeProbe` is fully injectable. Tests pass a mocked async function returning a string. The factory has no other external dependencies — no `fs`, no `process`, no `child_process` reach into `registry.ts`.

## Future-compat note

A future `list_vaults` MCP tool can consume this module by:

```ts
const registry = createVaultRegistry({ invokeProbe: ... });
// list_vaults handler:
const allVaults = await registry.listKnownVaults();  // NEW method to add when list_vaults lands
```

For V1 of `write_note`, only `resolveVaultPath` is needed; `listKnownVaults` is deferred. The `cache` internal `Map` already carries the data; adding a public list method is a one-line addition when the consumer arrives.
