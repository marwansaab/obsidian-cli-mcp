# Contract: `obsidian_exec` reports an unknown vault

**Spec**: [../spec.md](../spec.md) · **Data model**: [../data-model.md](../data-model.md) · **Research**: [../research.md](../research.md)

## §P — Published surface

- **P1**: the `obsidian_exec` description changes to the text in §H1. Its title, annotations (`PASSTHROUGH_HINTS`), input schema and parameter descriptions are unchanged. `obsidian_exec` stays untyped (no `outputSchema`).
- **P2**: `src/tools/_register-baseline.json` is regenerated with `npm run baseline:write`. The diff touches the `obsidian_exec` entry's `description` only. Any other moved byte stops the change.
- **P3**: no new error code and no new `details.code` / `details.reason` value. `src/errors.ts` is unchanged.
- **P4**: no other tool's description, schema or behaviour changes.

## §E — Error contract

- **E-1 (new failure)**: a call whose `vault` is set, which dispatch resolves as success, and whose `stdout.trim()` is exactly `Vault not found.`, fails with the error in [data-model E4](../data-model.md#e4--the-vault-not-found-error-new-construction-site-existing-code):
  - `code: "CLI_REPORTED_ERROR"`, `message: "Vault not found."`, `cause: null`;
  - `details: { argv, command, stdout, stderr, exitCode: 0, message: "Vault not found." }`, in that key order. `argv`, `stdout` and `stderr` are dispatch's own values, unmodified.
- **E-2 (unchanged successes)**: every other successful dispatch result is returned byte-identical to today: no `vault`, any stdout other than the bare sentence after trimming, and an eval with a `=> ` line.
- **E-3 (unchanged failures)**: every failure dispatch raises (`CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR` for `Error:`, `ERR_NO_ACTIVE_FILE`, `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`, `CLI_BINARY_NOT_FOUND`, a cancellation's abort reason), and the handler's `COMMAND_BLOCKED`, keeps its code, message, details and precedence.
- **E-4 (parity)**: for the same stdout, E-1's `code`, `message` and `details.message` equal those of the error `invokeCli` throws (the dedicated tools' facade).

## §T — Test rows

Stubs come from `src/tools/_handler-test-fixtures.ts` (`makeQueuedSpawn`, `makeStubSpawn`, `silentLogger`) and `createQueue`, as the existing suites use them. "Fails" means rejects with E-1, asserted with `toEqual` on `code`, `message`, `cause` and the whole `details` object. "Succeeds" means it resolves with `{ stdout, stderr, exitCode: 0, argv }` equal to the stub's values. The unknown vault is `vault: "NoSuchVault"`.

### `src/tools/obsidian_exec/handler.unknown-vault.test.ts` (NEW), driving `executeObsidianExec`

| Row | Input | Stub (stdout / exit) | Expected |
|---|---|---|---|
| U1 | `{ command: "files", vault: "NoSuchVault" }` | `"Vault not found.\n"` / 0 | **Fails**. `details.argv` is `[<bin>, "vault=NoSuchVault", "files"]`. The spawn count is 1. |
| U2 | `{ command: "files", vault: "NoSuchVault" }` | `"\r\n  Vault not found.\r\n\n"` / 0 | **Fails**. `details.stdout` is the untrimmed stub text. |
| U3 | `{ command: "files", vault: "NoSuchVault" }` | `"Vault not found."` (no line break) / 0 | **Fails** |
| U4 (`it.each`) | `command` ∈ `read` (with `parameters: { path: "a.md" }`), `search`, `version`, `help`, `vaults`, `tags`, `notacommand`; `vault: "NoSuchVault"` | `"Vault not found.\n"` / 0 | **Fails** for each, with `details.command` = the command (research F1) |
| U5 | `{ command: "eval", parameters: { code: "1+1" }, vault: "NoSuchVault" }`, `allowEval: true` | `"Vault not found.\n"` / 0 | **Fails** (the eval has no `=> ` line) |
| U6 | `{ command: "read", parameters: { path: "a.md" }, vault: "Known" }` | `"Vault not found.\nmore text\n"` / 0 | **Succeeds**, stdout verbatim |
| U7 | `{ command: "search", parameters: { query: "x" }, vault: "Known" }` | `"Result: Vault not found. here\n"` / 0 | **Succeeds** |
| U8 | `{ command: "read", parameters: { path: "a.md" }, vault: "Known" }` | `"first line\nVault not found.\n"` / 0 | **Succeeds** |
| U9 (`it.each`) | `{ command: "files", vault: "Known" }` | `"vault not found.\n"`, `"Vault not found\n"` / 0 | **Succeeds** for each |
| U10 | `{ command: "files" }` (no `vault`) | `"Vault not found.\n"` / 0 | **Succeeds** (V1) |
| U11 | `{ command: "files", parameters: { vault: "NoSuchVault" } }` (no top-level `vault`) | `"Vault not found.\n"` / 0 | **Succeeds** (research F2) |
| U12 | `{ command: "eval", parameters: { code: "1+1" }, vault: "Known" }`, `allowEval: true` | `"Vault not found.\n=> 2\n"` / 0 | **Succeeds** (FR-005, research F6) |
| U13 | `{ command: "files", vault: "NoSuchVault" }` | stdout `"Vault not found.\n"`, stderr `"warn\n"` / 0 | **Fails**, with `details.stderr` = `"warn\n"` |
| U14a | `{ command: "files", vault: "NoSuchVault" }` | `"Vault not found.\n"` / exit 1 | `CLI_NON_ZERO_EXIT`, unchanged (E-3) |
| U14b | `{ command: "files", vault: "NoSuchVault" }` | `"Error: something\n"` / 0 | `CLI_REPORTED_ERROR` with `details.message` = `"Error: something"` and the default top-level message, unchanged (E-3) |
| U14c | `{ command: "eval", vault: "NoSuchVault" }`, `allowEval` absent | `makeQueuedSpawn([])` | `VALIDATION_ERROR` / `COMMAND_BLOCKED`. The spawn count (overflow-counted) is 0. |

**No retry and no launch (FR-007)**: U1 asserts a spawn count of 1 (`makeQueuedSpawn([...]).getCount()`). The no-launch assertion lives in B1, because `obsidian_exec`'s `ExecuteDeps` has no `launchFn` seam and the facade's deps do.

### `src/cli-adapter/invoke-bounded-cli.test.ts` (new `describe`, appended)

| Row | Call | Expected |
|---|---|---|
| B1 | `invokeBoundedCli({ command: "files", vault: "NoSuchVault" }, {}, deps)`, stub `"Vault not found.\n"` / 0, with a recording `launchFn` in `deps` | Rejects with E-1 (`toEqual` on `code`, `message`, `details`). Spawned once, and `launchFn` never called (FR-007). |
| B2 | the same stub answers `invokeCli({ target_mode: "specific", command: "files", vault: "NoSuchVault", parameters: {}, flags: [] }, deps)` and B1's call | `code`, `message` and `details.message` are equal across the two errors (E-4, SC-002) |

### `src/tools/obsidian_exec/index.test.ts` (new `it`, appended)

| Row | Call | Expected |
|---|---|---|
| R1 | registered tool, `handler({ command: "files", vault: "NoSuchVault" })`, stub `"Vault not found.\n"` / 0 | `isError: true`. The parsed text envelope has `code: "CLI_REPORTED_ERROR"`, `message: "Vault not found."` and `details.message: "Vault not found."`. |

## §X — Existing-test edits

**None** (research F8). Every existing suite must pass unchanged. Appending new `describe`/`it` blocks (and the T003 header phrase) to `invoke-bounded-cli.test.ts` and `obsidian_exec/index.test.ts` is not an edit; no existing assertion, title or stub changes. If any existing assertion fails during implement, stop and raise it for owner review (refactor-decisions item 5). Do not edit that test.

## §H — Published and help text

- **H1** (`OBSIDIAN_EXEC_DESCRIPTION`, `src/tools/obsidian_exec/index.ts`). The exact new value:

  ```text
  Invoke any Obsidian Integrated CLI subcommand. Returns stdout, stderr, exitCode, and the exact argv invoked. Failures (non-zero exit, in-band Error: prefix, unknown vault, missing binary, timeout, output > 10 MiB) surface as structured errors with stable codes.
  ```

- **H2** (`docs/tools/obsidian_exec.md`, Errors table). Insert a new row directly after the `CLI_REPORTED_ERROR` row:

  ```markdown
  | `CLI_REPORTED_ERROR` (unknown vault) | `vault` is set, the child exited with code 0, and stdout, with surrounding whitespace trimmed, is exactly `Vault not found.`, the Obsidian CLI's answer for every command when it does not know the vault. `message` and `details.message` are `Vault not found.`, the same as the typed tools return. Output that only contains the sentence, or starts with it and goes on, is returned as a normal success; a call without `vault` is never failed this way. | Check the vault name with the `vaults` tool and retry. `details.argv` shows the `vault=` token that was sent. |
  ```

- **H3** (`docs/tools/obsidian_exec.md`, the existing `CLI_REPORTED_ERROR` row). Replace the outdated example `(e.g., "Error: vault not found")` with `(e.g., "Error: File \"x.md\" not found.")`; the rest of the row is unchanged.
- **H4** (`docs/tools/obsidian_exec.md`, the "Freeform escape hatch" note). Replace `The error-roster classifier still maps non-zero exits and `Error:`-prefixed in-band failures to `UpstreamError` codes` with `The error-roster classifier still maps non-zero exits, `Error:`-prefixed in-band failures and the CLI's unknown-vault answer to `UpstreamError` codes`.

## §C — CHANGELOG

Under `## [Unreleased]`, after the line `Spec 090-classify-missing-destination.`, add a blank line and:

```markdown
Spec 091-report-unknown-vault (BI-0173).
```

Under `### Fixed`, as the first bullet:

```markdown
- **`obsidian_exec` reports an unknown vault as an error** (spec 091). A call whose `vault` the Obsidian CLI does not know now fails with `CLI_REPORTED_ERROR` and the message `Vault not found.`, the same code and message the typed tools return, instead of succeeding with that line as its `stdout`. Only output that is exactly that sentence counts, so a note or search result that contains it is still returned normally, and a call without `vault` is unchanged. The typed tools are unchanged.
```

## §L — Live column (quickstart §3)

| Row | Call through the built server | Expected |
|---|---|---|
| L1 | `obsidian_exec` `{ command: "files", vault: "NoSuchVault-091" }` | `isError`, with `CLI_REPORTED_ERROR` and `message` / `details.message` = `Vault not found.` |
| L2 | `files` (typed) `{ vault: "NoSuchVault-091" }` | `CLI_REPORTED_ERROR` with the same `message` and `details.message` as L1 |
| L3 | `obsidian_exec` `{ command: "version", vault: "NoSuchVault-091" }` | same as L1 |
| L4 | `obsidian_exec` `{ command: "files", vault: "TestVault-Obsidian-CLI-MCP", parameters: { folder: "Sandbox" } }` | success, with the Sandbox listing |
| L5 | `obsidian_exec` `{ command: "read", vault: "TestVault-Obsidian-CLI-MCP", parameters: { path: "Sandbox/091-probe/first-line.md" } }`, where the fixture's content is `Vault not found.\nSecond line.\n` | success, `stdout` = the fixture's text |
| L6 | `obsidian_exec` `{ command: "version" }` (no `vault`) | success, unchanged |
