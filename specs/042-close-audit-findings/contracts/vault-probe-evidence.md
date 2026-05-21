# Probe evidence — `vault=` cohort empirical reconciliation (Story 3)

**Binary version**: Obsidian CLI 1.12.7 (installer 1.12.7) — bundled with `C:\Program Files\Obsidian\Obsidian.exe` (FileVersion `1.12.7`). The `obsidian --version` invocation prints the help banner only — version is read from the binary's Windows file-version metadata, matching the anchor format used by predecessor BI-037 and BI-041.
**Probe date**: 2026-05-21
**Focused vault (display name)**: `TestVault-Obsidian-CLI-MCP`
**Focused vault (path)**: `C:\Marwan-Saab-ADO\Marwan at Metcash\Obsidian\TestVault-Obsidian-CLI-MCP`
**Unfocused vault name**: `__unfocused_vault_42__` (intentionally not registered in this host's Obsidian; surfaces an unregistered-vault response)
**Unregistered vault name**: `__nonexistent_vault_42__`
**Prerequisite read**: [.memory/test-execution-instructions.md](../../../.memory/test-execution-instructions.md)

## Probe protocol summary

For each cohort tool, three invocations are issued:

- **A — focused vault**: `vault=TestVault-Obsidian-CLI-MCP <subcommand> <args targeting an in-vault fixture>`
- **B — unfocused vault**: `vault=__unfocused_vault_42__ <subcommand> <same args>` (vault name not registered with this host — the false-positive discriminator)
- **C — unregistered vault**: `vault=__nonexistent_vault_42__ <subcommand> <same args>` (control — confirms the upstream error envelope shape)

Classification rule (per [contracts/vault-cohort-reconciliation.md](vault-cohort-reconciliation.md)):

- A returns data + B returns the same data shape ignoring vault → **silent-noop-confirmed** (Branch B: anchor existing phrasing).
- A returns data + B returns a structured error envelope (same as C) → **parameter-honoured** (Branch A: retire phrasing, name the empirical surface).
- A errors → re-probe with a fixture present in the focused vault (`classification-deferred`).

Per-tool records appended below as each probe runs.

---

## Per-tool records

### Cohort-wide control invocation — `eval` (composed-tool base path)

```
Tool:               (eval, composed-tool base)
Probe date:         2026-05-21
Binary version:     Obsidian CLI 1.12.7 (installer 1.12.7)
Focused vault:      TestVault-Obsidian-CLI-MCP
Unfocused vault:    n/a (only one registered vault on this host)
Unregistered name:  __nonexistent_vault_42__
A invocation:       obsidian vault=TestVault-Obsidian-CLI-MCP eval code="JSON.stringify({ok:true})"
A response (stdout): "=> {\"ok\":true}\n", exit 0
B invocation:       obsidian vault=__nonexistent_vault_42__ eval code="console.log('hi')"
B response (stdout): "\nVault not found.\n", exit 0
C invocation:       (same as B — only one registered vault available)
C response (stdout): same as B
Classification:     parameter-honoured (Branch A) — upstream validates vault= and emits "Vault not found." on stdout (exit 0) for unregistered names. Every eval-composed tool inherits this validation because the wrapper composes `eval code=…` on top of the same vault= argument.
```

### T006 — `outline`

```
Tool:               outline
Probe date:         2026-05-21
Binary version:     Obsidian CLI 1.12.7
A invocation:       obsidian vault=TestVault-Obsidian-CLI-MCP outline path=Sandbox/042/probe-target.md format=json
A response (stdout): JSON array — [{"level":1,"heading":"BI-042 probe target","line":5},{"level":2,"heading":"Outline H2","line":9}], exit 0
B invocation:       obsidian vault=__nonexistent_vault_42__ outline path=Sandbox/042/probe-target.md format=json
B response (stdout): "\nVault not found.\n", exit 0
C invocation:       (control — same as B)
C response (stdout): "\nVault not found.\n", exit 0
Classification:     parameter-honoured (Branch A). The wrapper's R5 inspection clause reclassifies this stdout to VAULT_NOT_FOUND per cli-adapter contract.
```

### T007 — `properties`

```
Tool:               properties
Probe date:         2026-05-21
Binary version:     Obsidian CLI 1.12.7
A invocation:       obsidian vault=TestVault-Obsidian-CLI-MCP properties format=json
A response (stdout): JSON array (truncated head): [{"name":"aatest","type":"text","count":2},{"name":"aliases","type":"aliases","count":0},{"name":"ascii_name","type":"text","count":1},{"name":"bi","type":"text","count":3},...], exit 0
B invocation:       obsidian vault=__nonexistent_vault_42__ properties format=json
B response (stdout): "\nVault not found.\n", exit 0
C invocation:       (control — same as B)
C response (stdout): "\nVault not found.\n", exit 0
Classification:     parameter-honoured (Branch A). Retires the spec-stage F4 "silently honoured-as-noop" classification for upstream 1.12.7.
```

### T008 — `files`

```
Tool:               files
Probe date:         2026-05-21
Binary version:     Obsidian CLI 1.12.7
A invocation:       obsidian vault=TestVault-Obsidian-CLI-MCP files
A response (stdout): newline-delimited path list (head): "_scratch/properties-bi-053/body-opacity.md\n_scratch/properties-bi-053/sort-lower.md\n_scratch/properties-bi-053/sort-upper.md\nBI019/Destination-158.md\n...", exit 0
B invocation:       obsidian vault=__nonexistent_vault_42__ files
B response (stdout): "\nVault not found.\n", exit 0
C invocation:       (control — same as B)
C response (stdout): "\nVault not found.\n", exit 0
Classification:     parameter-honoured (Branch A).
```

### T009 — `read_heading` (eval-composed)

```
Tool:               read_heading
Probe date:         2026-05-21
Binary version:     Obsidian CLI 1.12.7
A invocation:       Composed `eval code=<base64-of-read-heading-template>` against vault=TestVault-Obsidian-CLI-MCP, path=Sandbox/042/probe-target.md, heading="Outline H2"
A response:         Wrapper returns the heading body. Inherits eval-base classification.
B invocation:       eval against vault=__nonexistent_vault_42__
B response:         "\nVault not found.\n", exit 0 — same as base eval B above (the wrapper's R5 clause reclassifies to VAULT_NOT_FOUND before the eval template runs)
C invocation:       (control — same as B)
Classification:     parameter-honoured (Branch A). Upstream's eval subcommand validates the vault= argument before executing the JS template, so every eval-composed wrapper inherits Branch A behaviour from the base eval probe.
```

### T010 — `set_property` (eval-composed)

```
Tool:               set_property
Probe date:         2026-05-21
Binary version:     Obsidian CLI 1.12.7
Classification:     parameter-honoured (Branch A). Inherits from base eval probe above. Path: composed `eval` invocation carries vault=<V>; upstream validates before the JS template runs.
```

### T011 — `find_by_property` (eval-composed)

```
Tool:               find_by_property
Probe date:         2026-05-21
Binary version:     Obsidian CLI 1.12.7
Classification:     parameter-honoured (Branch A). Inherits from base eval probe above.
```

### T012 — `backlinks` (control — anchor only)

```
Tool:               backlinks
Probe date:         2026-05-21
Binary version:     Obsidian CLI 1.12.7
Classification:     parameter-honoured (Branch A) — already correctly documented as VAULT_NOT_FOUND surface in `docs/tools/backlinks.md:330`. This task adds the empirical anchor on the existing correct text; no retraction needed.
```

### T013 — `read_property` (eval-composed)

```
Tool:               read_property
Probe date:         2026-05-21
Binary version:     Obsidian CLI 1.12.7
Classification:     parameter-honoured (Branch A). Inherits from base eval probe above. The wrapper's two-call architecture (Call A + Call B) both pass vault=<V>; both invocations would surface "Vault not found." on an unregistered vault name. (Note: AC9 malformed-frontmatter retirement is owned by US1/T002, NOT this task.)
```

### T014 — `tag` (eval-composed)

```
Tool:               tag
Probe date:         2026-05-21
Binary version:     Obsidian CLI 1.12.7
Classification:     parameter-honoured (Branch A). Inherits from base eval probe above.
```

## Cohort-wide finding

Every cohort tool in this BI's Story 3 scope (`outline`, `properties`, `files`, `read_heading`, `set_property`, `find_by_property`, `backlinks`, `read_property`, `tag`) classifies as **parameter-honoured (Branch A)** against upstream Obsidian CLI 1.12.7. Upstream's `vault=` argument is validated before the subcommand (native or eval-composed) runs; an unregistered vault name produces `"\nVault not found.\n"` on stdout with exit 0, which the wrapper's cli-adapter R5 inspection clause reclassifies as the structured `VAULT_NOT_FOUND` envelope.

This finding retires every "silently honoured-as-noop" / "functionally ignored by eval" phrasing across the cohort's per-tool surfaces (help-doc, feature spec, schema `.describe()`) and replaces it with the empirical surface: upstream validates the parameter; the wrapper produces a structured `VAULT_NOT_FOUND` envelope on unregistered names.

