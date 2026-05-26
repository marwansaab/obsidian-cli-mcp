# Prepend Active-Mode — Direct-CLI Diagnostic (BI-0017)

## Test environment

- **Obsidian CLI**: `obsidian --version` reports `Obsidian CLI` (1.12.7-equivalent on this host).
- **Binary entry points on Windows**: `C:\Program Files\Obsidian\Obsidian.com` (console-mode stub, the wrapper's PATH-resolved entry) and `C:\Program Files\Obsidian\obsidian.exe` (GUI binary). The wrapper's `binary-resolver` returns the bare name `"obsidian"`, which Windows PATH resolves to `Obsidian.com`. The two binaries behave differently when given an unregistered vault value (see Probe 5b vs Run A).
- **OS**: Windows 11 Pro 10.0.26200; PowerShell host; Node 22.x.
- **Vault**: `TestVault-Obsidian-CLI-MCP` at `C:\Marwan-Saab-ADO\Marwan at Metcash\Obsidian\TestVault-Obsidian-CLI-MCP`.
- **Fixture**: `Sandbox/BI-0017/cli-active-probes/tc-active-target.md` — 46 bytes, content `---\nstatus: draft\n---\n# Active Probe\nBody line` (LF endings).
- **Spawn shape**: `child_process.spawn(bin, argv, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })` — byte-for-byte matches `src/cli-adapter/_dispatch.ts:104`.
- **Focus**: BI-0017 fixture was the active tab with the cursor in the editor during the re-run pass; an earlier pass ran while the user was focused on a different vault — those results are noted separately below and were superseded.

## Probe 1 — Eval focused-file resolution (raw code, no base64)

The original brief specified `code=<base64>` but the wrapper's `FOCUSED_FILE_TEMPLATE` in `src/tools/prepend/handler.ts:39-40` passes the eval code **raw** (no base64). The CLI's `eval` subcommand does not auto-decode base64 — the base64 variant returns `Error: Unexpected end of input`. The raw-code variant is the wrapper's actual shape and the one this report uses.

argv:

```
["eval", "code=(async()=>{const f=app.workspace.getActiveFile();return JSON.stringify({path:f?.path??null,base:app.vault.adapter.basePath});})()"]
```

Result (BI-0017 fixture focused):

```
exit=0, wallMs=77
stdout: => {"path":"Sandbox/BI-0017/cli-active-probes/tc-active-target.md","base":"C:\\Marwan-Saab-ADO\\Marwan at Metcash\\Obsidian\\TestVault-Obsidian-CLI-MCP"}
```

- Returned `path` = `Sandbox/BI-0017/cli-active-probes/tc-active-target.md` — **matches expected fixture path** ✓
- Returned `base` = `C:\Marwan-Saab-ADO\Marwan at Metcash\Obsidian\TestVault-Obsidian-CLI-MCP` — the absolute FS path of the focused vault, byte-identical to the path returned by `obsidian vaults verbose` for the `TestVault-Obsidian-CLI-MCP` entry. Reverse-lookup against a primed cache would match.

## Probes 2-5 — Direct-CLI active-mode shapes (Obsidian.com, BI-0017 fixture focused)

| # | argv | stdout | stderr | exit | wall (ms) | Observable |
|---|------|--------|--------|-----:|----------:|------------|
| 2 | `["prepend", "content=Probe 2 — implicit active\n"]` | `Prepended to: Sandbox/BI-0017/cli-active-probes/tc-active-target.md` | `` | 0 | 77 | OK — upstream supports implicit vault + implicit path active mode |
| 3 | `["prepend", "path=Sandbox/.../tc-active-target.md", "content=Probe 3 — path only\n"]` | `Prepended to: Sandbox/BI-0017/cli-active-probes/tc-active-target.md` | `` | 0 | 77 | OK — upstream resolves path against foreground vault when no vault given |
| 4 | `["vault=TestVault-Obsidian-CLI-MCP", "prepend", "content=Probe 4 — vault only\n"]` | `Prepended to: Sandbox/BI-0017/cli-active-probes/tc-active-target.md` | `` | 0 | 73 | OK — upstream supports vault + implicit path (uses that vault's focused file) |
| 5 | `["vault=TestVault-Obsidian-CLI-MCP", "prepend", "path=Sandbox/.../tc-active-target.md", "content=Probe 5 — vault and path\n"]` | `Prepended to: Sandbox/BI-0017/cli-active-probes/tc-active-target.md` | `` | 0 | 77 | OK — positive control (specific-mode shape) |

**All four direct-CLI shapes succeed against the focused BI-0017 fixture.** No direct-CLI argv shape reproduces the user's `Vault not found.` failure mode when run against `Obsidian.com` with the fixture focused.

### Hypothesis-reproducer probes (vault=<absolute-FS-path>)

| Probe | Binary | argv | stdout | stderr | exit | Observable |
|-------|--------|------|--------|--------|-----:|------------|
| 5b | `obsidian.exe` (GUI) | `[vault=C:\…\TestVault…, prepend, path=…, content=…]` | `` | `` | 4294967295 | Silent crash (~20 ms, no output) — GUI binary refuses |
| 5b' | `Obsidian.com` (console stub) | same argv as 5b | `Vault not found.\n` | `` | 0 | **Exact match to user's reported failure mode** |
| X1 | `Obsidian.com` | `[vault=DefinitelyNotARegisteredVault, prepend, path=…, content=…]` | `Vault not found.\n` | `` | 0 | Match — confirms any unregistered vault value triggers this message |
| X2 | `Obsidian.com` | `[vault=, prepend, path=…, content=…]` | `Vault not found.\n` | `` | 0 | Match — even empty vault value triggers this message |
| X3 | `Obsidian.com` | `[vault=TestVault-Obsidian-CLI-MCP, prepend, path=Sandbox/BI-0017/no-such-file.md, content=…]` | `Error: File "…" not found.\n` | `` | 0 | Different message — confirms `Vault not found.` is vault-only, not generic |

The reported failure (`exit=0, stdout="Vault not found.\n", stderr=""`) **only reproduces when `vault=<value-not-in-registry>` is passed to `Obsidian.com`.** Absolute FS paths are one such value.

## Probe 6 — Wrapper's emitted argv

Captured via the existing `spawnFn` dependency-injection seam on `executePrepend` (no source modification). Wrapper was given a real `vaultRegistry` (backed by real `obsidian vaults verbose`), real queue, real logger, and a spying `spawnFn` that delegated to `node:child_process.spawn`. Same focused fixture (`Sandbox/BI-0017/cli-active-probes/tc-active-target.md`).

### Run A — registry cache NOT primed

Argv emitted for the prepend call (after the eval call's vault-name probe):

```
[
  'vault=C:\\Marwan-Saab-ADO\\Marwan at Metcash\\Obsidian\\TestVault-Obsidian-CLI-MCP',
  'prepend',
  'path=Sandbox/BI-0017/cli-active-probes/tc-active-target.md',
  'content=Probe 6 — active w/o prime\n'
]
```

Wrapper result: `UpstreamError { code: "CLI_REPORTED_ERROR", details: { stdout: "Vault not found.\n", stderr: "", exitCode: 0, message: "Vault not found.", stage: "prepend-cli" } }` — **byte-identical to the user's TC-00446 report**.

### Run B — registry cache primed via `resolveVaultPath("TestVault-Obsidian-CLI-MCP")` before the call

Argv emitted for the prepend call:

```
[
  'vault=TestVault-Obsidian-CLI-MCP',
  'prepend',
  'path=Sandbox/BI-0017/cli-active-probes/tc-active-target.md',
  'content=Probe 6 — active w/ prime\n'
]
```

Wrapper result: success, `{ path: "Sandbox/BI-0017/cli-active-probes/tc-active-target.md", vault: "TestVault-Obsidian-CLI-MCP", bytes_written: 29, inline: false }`.

### Argv diff

| Run | vault token | Matches direct-CLI probe |
|-----|-------------|--------------------------|
| Run A (cache cold) | `vault=C:\Marwan-Saab-ADO\Marwan at Metcash\Obsidian\TestVault-Obsidian-CLI-MCP` | Probe 5b' (Obsidian.com) — produces `Vault not found.` |
| Run B (cache primed) | `vault=TestVault-Obsidian-CLI-MCP` | Probe 5 — positive control, succeeds |

The wrapper emits **the absolute filesystem path of the vault** in the `vault=` argv token whenever its registry cache has not been primed by a prior specific-mode call during the MCP server lifetime.

## Diagnosis

**The bug lives in the cli-mcp wrapper, not upstream `obsidian prepend`.** Specifically:

- `src/tools/prepend/handler.ts:209-221` (the active-mode branch of `resolveLocator`) calls `deps.vaultRegistry.resolveVaultDisplayName(parsed.base)` to translate the focused vault's absolute basePath back to its registered display name.
- `src/vault-registry/registry.ts:78-84` (`resolveVaultDisplayName`) is **synchronous and non-priming**: if the in-memory cache is null (because no prior specific-mode call has caused a `resolveVaultPath` call during this MCP server lifetime), it returns `null` immediately without issuing the `obsidian vaults verbose` probe.
- The handler's fallback at `handler.ts:220` reads `vaultDisplayName: reverseLookup ?? parsed.base` — when reverseLookup is `null`, `vaultDisplayName` becomes `parsed.base` (the absolute FS path).
- The handler then calls `invokeCli` with `target_mode: "specific"` and `vault: input.vault ?? vaultDisplayName` (`handler.ts:289-301`). For active mode, `input.vault` is `undefined`, so `vault = parsed.base` — the absolute FS path goes into the argv as `vault=<abs-FS-path>`.
- `Obsidian.com` (the PATH-resolved binary entry) treats any unregistered string in `vault=…`, including an absolute FS path, as an unknown vault and returns `exit 0` with stdout `"Vault not found.\n"`.
- `src/cli-adapter/cli-adapter.ts:88-97` (`invokeCli`'s success-path stdout inspector) re-classifies that to `CLI_REPORTED_ERROR { stdout, exitCode: 0, message: "Vault not found." }`.
- `src/tools/prepend/handler.ts:117-138` (`classifyUpstreamFailure`) doesn't match the unknown-vault haystack against any of its `NOTE_NOT_FOUND_PATTERNS` / `EDITOR_CONFLICT_PATTERNS`, so it falls through and re-raises with `stage: "prepend-cli"` — producing the user's reported envelope exactly.

**Why sibling active-mode `read` doesn't hit this bug:** `src/tools/read/handler.ts:24-40` never calls `eval`, never does a reverse-lookup, and never tries to convert active mode to specific mode. It passes `vault: undefined` + `target_mode: "active"` straight through to `invokeCli`, which propagates `vault: undefined` to `dispatchCli`. `assembleArgv` (`_dispatch.ts:62-70`) omits the `vault=` prefix entirely when `vault` is `undefined`, so the upstream CLI uses the foreground app's focused-file context implicitly (the shape Probe 2 confirmed works). No registry-cache state is required.

The architectural divergence introduced by BI-045's `executePrepend` active-mode path — eval to get the basePath, reverse-lookup to a registered display name, then build a *specific-mode* upstream call — is the surface that fails when the cache is cold.

## Recommended fix

**Primary recommendation — auto-prime in the registry**: change `resolveVaultDisplayName` in `src/vault-registry/registry.ts:78-84` to be async and prime the cache on demand:

```ts
async resolveVaultDisplayName(basePath: string): Promise<string | null> {
  const known = cache ?? (await probe());
  for (const [name, path] of known) {
    if (path === basePath) return name;
  }
  return null;
},
```

Update the interface at `registry.ts:9-23` to reflect the async signature, and audit consumers (`src/tools/prepend/handler.ts:209-216` and any other `resolveVaultDisplayName` callsite — e.g. `patch_heading` per the comment at registry.ts:14) to `await` the call. This makes active-mode tools that depend on the reverse-lookup work in cold MCP-server sessions without requiring a prior specific-mode call.

**Defensive secondary fix in the prepend handler**: at `src/tools/prepend/handler.ts:209-221`, when `reverseLookup` is null **fail loudly** instead of falling through to `parsed.base`. The fallback `?? parsed.base` is the surface that smuggled an absolute FS path into the `vault=` argv. Even after the registry auto-primes, throwing a typed error for a genuinely unknown basePath (e.g., the focused vault is one Obsidian opened without registering through the CLI) is more honest than passing a string the upstream CLI will report as `Vault not found.`:

```ts
if (reverseLookup === null) {
  throw new UpstreamError({
    code: "VALIDATION_ERROR",
    cause: null,
    details: { stage: "vault-reverse-lookup", basePath: parsed.base, knownVaults: /* from registry */ },
    message: `Active-mode prepend: the focused file's vault (basePath ${parsed.base}) is not registered with the Obsidian CLI. Register the vault, or call prepend with target_mode=specific + vault + file/path.`,
  });
}
```

**Architectural alternative (larger change)**: align `prepend`'s active-mode path with the `read` pattern — pass `target_mode: "active"` to `invokeCli` with no vault and no path, letting the upstream CLI resolve the focused file itself (Probe 2 confirmed this works). Prepend still needs the absolute path from the eval for the post-call `stat` byte-count delta and the Layer 2 canonical-path check, so this is not a one-line change — the handler would keep the eval but stop translating its result into a specific-mode upstream call. This would also remove the reverse-lookup dependency entirely for active mode. Worth considering for a follow-up cohort cleanup beyond BI-0017's immediate scope, since the same pattern likely lives in `append_note`, `patch_heading`, and `set_property`.

## Open questions / follow-ups

- **Was the original TC-00446 run conducted with TestVault as the foreground vault?** Run A confirms the wrapper produces the reported failure mode regardless of which specific note inside TestVault is focused, as long as the focused vault's display name isn't yet in the registry cache. The bug reproduces deterministically when the cache is cold; once primed, prepend active-mode works.
- **Does sibling active-mode `append_note` (which the user has reported working) construct a different argv shape?** Worth a cohort-parity check — if `append_note` also calls `resolveVaultDisplayName` but the user's session always happened to have the cache primed when calling it, the bug is latent there too. Comparing argv via the same `spawnFn` capture across `prepend` vs `append_note` vs `patch_heading` vs `set_property` is the next diagnostic step. If they all use the same pattern, the registry-level fix above is the right place to land it.
- **`obsidian.exe` (GUI binary) silently crashes on `vault=<abs-FS-path>` while `Obsidian.com` returns `Vault not found.` stdout.** The wrapper's `binary-resolver` correctly resolves to `Obsidian.com` on Windows, but if a future host has only `obsidian.exe` on PATH, the wrapper would surface a `CLI_NON_ZERO_EXIT` (4294967295) instead of `CLI_REPORTED_ERROR ("Vault not found.")` for the same cache-cold path. Not a defect for this BI but worth a constitution / binary-resolver note.
- **Does the failure depend on the focused note having frontmatter?** The fixture had frontmatter (`---\nstatus: draft\n---`). Probe 2 worked against this fixture, so frontmatter is not in the failure path. Run A repro is independent of the file content — the upstream `prepend` call never even reaches the file because the vault lookup fails first.
