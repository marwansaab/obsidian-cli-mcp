# T0 probe findings: `base:views` on a malformed `.base`

**Feature**: [../spec.md](../spec.md) | **Quickstart**: [../quickstart.md](../quickstart.md) §3 | **Tasks**: T001, T002

**Run**: 2026-11-01, run id `20261101181418`. Vault `TestVault-Obsidian-CLI-MCP`, fixtures under `Sandbox/` only. Binary: bare `obsidian`, resolving to `Obsidian.com` (`C:\Users\sirzi\AppData\Local\Programs\Obsidian\Obsidian.com`). Each probe ran through `Start-Process … -RedirectStandardOutput/-RedirectStandardError`, so stdout and stderr were captured separately. Argv order follows the adapter: `[binary, vault=…, command, kvs…]`; `base:views` ran with no `vault=`, as the handler's active-mode call does.

## Fixtures

- `Sandbox/t0-081-20261101181418-broken.base`:

  ```yaml
  views:
    - type: table
      name: [a, b
  ```

- `Sandbox/t0-081-20261101181418-ok.base`:

  ```yaml
  views:
    - type: table
      name: Control table
  ```

## Results

### P1: named-mode focus eval on the broken fixture

`obsidian vault=TestVault-Obsidian-CLI-MCP eval "code=(async()=>{…openLinkText(f.path,'',false)…})()"` (the `FOCUS_BASE_TEMPLATE` body with the path inlined).

- Exit code: `0`
- stdout:

  ```text
  => {"ok":true,"opened":"Sandbox/t0-081-20261101181418-broken.base"}
  ```

- stderr: empty

Focusing succeeds; the focus step raises no complaint, so a broken Base is not reported as missing.

### P2: `base:views` with the broken fixture focused

`obsidian base:views`

- Exit code: `0`
- stdout (verbatim; line breaks are `\n`, no `\r`):

  ```text
  Error: Flow sequence in block collection must be sufficiently indented and end with a ] at line 4, column 1:

      name: [a, b

  ^
  ```

- stderr: empty
- `INVALID_YAML_PATTERN` (the literal at `src/tools/query_base/handler.ts:126`): **match** (`flow sequence`, `block collection`, `sufficiently indented`).

The complaint arrives on stdout with an `Error:` prefix and exit 0, so the dispatch layer rejects it as `CLI_REPORTED_ERROR` carrying `details.stdout`: the failure path of contract R2.

### P3: open-mode `base:views`, broken fixture focused in Obsidian, no prior focus eval

The broken fixture was focused in the Obsidian window through a plain `openLinkText` eval (the only unattended way to change focus), the probe waited two seconds, then ran `base:views` on its own, with no focus eval in the same call sequence.

- Focus step: exit `0`, stdout `=> focused`, stderr empty.
- `obsidian base:views`: exit `0`
- stdout (verbatim):

  ```text
  Error: Flow sequence in block collection must be sufficiently indented and end with a ] at line 4, column 1:

      name: [a, b

  ^
  ```

- stderr: empty
- `INVALID_YAML_PATTERN`: **match**.

Open mode reports the same parser complaint. It does **not** report `Active file is not a base file`, and it does not materialise a default view.

### P4: `base:views` on the control fixture

Focus eval: exit `0`, stdout `=> {"ok":true,"opened":"Sandbox/t0-081-20261101181418-ok.base"}`, stderr empty.

`obsidian base:views`:

- Exit code: `0`
- stdout: `Control table\ttable` followed by a newline (the TAB-delimited `<name>\t<type>` line)
- stderr: empty

No regression in the clean listing.

## Cleanup

Both fixtures were deleted. `Sandbox/` is back to its pre-run contents (it already held earlier work, which was left untouched: `BI-0008`, `BI-0016`, `BI-0165`, `BI-0168`, `BV`, `TC-00005`, `TC-00030`, `TC-00033`, `TC-00034`, `TN`, `pr3-check-2026-10-30.md`, `Serial-focus.md`, `TC-00038-focus.md`). `Welcome.md` is present and untouched. No `.trash/` residue.

## T002 gate outcome

**PASS: implementation proceeds to Phase 2.**

- A complaint surfaces in both P2 and P3, so the "no complaint at all" stop does not apply.
- The shared pattern matches the complaint verbatim, so the pattern is moved byte-identically and not widened.
- The channel is stdout with an `Error:` prefix on exit 0, which the dispatch layer turns into `CLI_REPORTED_ERROR` (contract R2). This is a channel the contract covers. Contract test M1 already models this exact shape.

## T020: live end-to-end check (quickstart §4)

**Run**: 2026-11-01, run id `20261101181923`, after `npm run build`. Fresh fixtures with the same content as above (`Sandbox/t0-081-20261101181923-broken.base`, `Sandbox/t0-081-20261101181923-ok.base`). A throwaway MCP client (the `scripts/probe-stdio.ts` pattern: `StdioClientTransport` over `node dist/index.js`, 2025-era handshake) called the tools; each result below is `content[0].text` verbatim.

### Step 2: named broken

`views_base` `{ "base_path": "Sandbox/t0-081-20261101181923-broken.base", "vault": "TestVault-Obsidian-CLI-MCP" }` → `isError: true`

```json
{"code":"CLI_REPORTED_ERROR","message":"views_base: base file at \"Sandbox/t0-081-20261101181923-broken.base\" is malformed: its YAML cannot be parsed","details":{"code":"BASE_MALFORMED","reason":"invalid-yaml","base_path":"Sandbox/t0-081-20261101181923-broken.base","message":"Error: Flow sequence in block collection must be sufficiently indented and end with a ] at line 4, column 1:\n\n    name: [a, b\n\n^","messageLength":128}}
```

### Step 3: open broken

Step 2 left the broken fixture focused. `views_base` `{}` → `isError: true`

```json
{"code":"CLI_REPORTED_ERROR","message":"views_base: the open base file is malformed: its YAML cannot be parsed","details":{"code":"BASE_MALFORMED","reason":"invalid-yaml","message":"Error: Flow sequence in block collection must be sufficiently indented and end with a ] at line 4, column 1:\n\n    name: [a, b\n\n^","messageLength":128}}
```

### Step 4: named control

`views_base` `{ "base_path": "Sandbox/t0-081-20261101181923-ok.base", "vault": "TestVault-Obsidian-CLI-MCP" }` → `isError: false`

```json
{"views":["Control table"],"count":1}
```

### Step 5: `query_base` on the broken fixture (SC-005)

`query_base` `{ "base_path": "Sandbox/t0-081-20261101181923-broken.base", "view_name": "a", "vault": "TestVault-Obsidian-CLI-MCP" }` → `isError: true`

```json
{"code":"CLI_REPORTED_ERROR","message":"query_base: base file is structurally unusable","details":{"code":"BASE_MALFORMED","reason":"invalid-yaml","base_path":"Sandbox/t0-081-20261101181923-broken.base","message":"Error: Flow sequence in block collection must be sufficiently indented and end with a ] at line 4, column 1:\n\n    name: [a, b\n\n^"}}
```

Both tools classify the same broken file as `BASE_MALFORMED` / `invalid-yaml`. `query_base`'s shape and headline are as before this change.

### Step 6: cleanup

Both fixtures and the throwaway client script were deleted. `Sandbox/` holds exactly its pre-run contents (listed under Cleanup above), and `Welcome.md` is present and untouched.

**Result**: all four live checks pass.
