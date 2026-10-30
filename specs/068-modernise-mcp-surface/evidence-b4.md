# Evidence: B4 `vaults` and the per-vault open marker (T061)

**Task**: T061 (PR-5, User Story 11) · **Feeds**: research R9, data-model §6, FR-036
**Probe date**: 2026-10-30 · **Host**: Windows 11, `Obsidian.com` resolved from `PATH`
(`C:\Users\sirzi\AppData\Local\Programs\Obsidian\Obsidian.com`, the same binary bare
`obsidian` resolves to and that the production binary resolver spawns).

## Invocation

```powershell
$bin = (Get-Command obsidian).Source
Start-Process -FilePath $bin -ArgumentList "vaults verbose" `
  -RedirectStandardOutput vv.out -RedirectStandardError vv.err -NoNewWindow -Wait -PassThru
Start-Process -FilePath $bin -ArgumentList "help vaults" `
  -RedirectStandardOutput hv.out -RedirectStandardError hv.err -NoNewWindow -Wait -PassThru
Start-Process -FilePath $bin -ArgumentList "vaults" `
  -RedirectStandardOutput v.out -RedirectStandardError v.err -NoNewWindow -Wait -PassThru
```

None of these commands takes `vault=` or touches a vault's files, so no `Sandbox/` fixture
was created and there is nothing to clean up.

## `obsidian help vaults`

- Exit code: `0`
- stderr: empty (0 bytes)
- stdout (133 bytes), verbatim:

```text
  vaults                List known vaults
    total               - Return vault count
    verbose             - Include vault paths
```

## `obsidian vaults verbose`

- Exit code: `0`
- stderr: empty (0 bytes)
- stdout (569 bytes): 7 lines, each `<display name>\t<absolute path>`, then a trailing
  newline. Nothing else is printed: no header, no third column, no marker.

Only the authorised test vault's row is reproduced verbatim. The other six rows are the
owner's personal vaults; their names and paths are replaced with placeholders so they do
not enter the repository. The column layout is unchanged.

```text
<vault-1>	<path-1>
TestVault-Obsidian-CLI-MCP	C:\Marwan-Saab-ADO\My-Setup\My-Setup\TestVault-Obsidian-CLI-MCP
<vault-3>	<path-3>
<vault-4>	<path-4>
<vault-5>	<path-5>
<vault-6>	<path-6>
<vault-7>	<path-7>
```

## `obsidian vaults`

- Exit code: `0`
- stderr: empty (0 bytes)
- stdout (136 bytes): the same 7 display names, one per line, in the same order, with no
  marker (placeholders as above apart from `TestVault-Obsidian-CLI-MCP`).

## Decision: `open` is always `null` in 0.9.0

The CLI exposes no per-vault open marker. `help vaults` lists only the `total` and
`verbose` flags, and neither the plain nor the verbose listing distinguishes the vaults
Obsidian has open from the ones it merely knows about. Per research R9, `vaults` therefore
returns `open: null` for every entry. Reading Obsidian's private `obsidian.json` stays
rejected (undocumented, platform-specific, outside the CLI contract).
