# Quickstart: Classify Malformed Base

**Feature**: [spec.md](spec.md) | **Contract**: [contracts/views_base-malformed-contract.md](contracts/views_base-malformed-contract.md)

## §1 Automated gate

```powershell
npm run typecheck
npm run lint
npx vitest run src/tools/views_base src/tools/query_base src/tools/_base-malformed.test.ts
npx vitest run
```

Expected:

- contract cases M1–M16 pass;
- `_base-malformed.test.ts` passes;
- every existing `query_base` test passes unchanged;
- the full suite is green on Linux and Windows CI.

## §2 Published-surface gate

The `views_base` description changes deliberately (research D5):

```powershell
npm run baseline:write
git diff src/tools/_register-baseline.json
```

Expected: only `views_base`'s `descriptionFingerprint` changes. Every other tool's fingerprints, and every `views_base` schema, title, annotations and output-schema fingerprint, are unchanged.

## §3 T0 live probes (before code is written)

Read `.memory/test-execution-instructions.md` first:

- vault `TestVault-Obsidian-CLI-MCP`, fixtures under `Sandbox/` only;
- drive `Obsidian.com`, never `Obsidian.exe`;
- capture stdout and stderr separately (`Start-Process … -RedirectStandardOutput/-RedirectStandardError`);
- clean up afterwards.

**Fixtures** (unique per run):

- `Sandbox/t0-081-<ts>-broken.base`: YAML with an unclosed flow sequence, for example `views:\n  - type: table\n    name: [a, b\n`.
- `Sandbox/t0-081-<ts>-ok.base`: one valid table view, as a control.

| Probe | Steps | Capture |
|-------|-------|---------|
| P1 | Run the focus eval for the broken fixture, equivalent to `views_base` named mode. | Does focusing succeed (`ok: true`)? Any complaint at this step? |
| P2 | With the broken fixture focused, run `obsidian base:views`. | Exit code, stdout and stderr verbatim. Which channel carries the complaint, and does `INVALID_YAML_PATTERN` match it? |
| P3 | Focus the broken fixture in Obsidian, then run open-mode `base:views` with no prior focus eval. | As P2. Is the output also a not-a-base report? |
| P4 | With the control fixture focused, run `base:views`. | The clean `<name>\t<type>` lines, confirming no regression. |

Record the verbatim output in `contracts/t0-probe-findings.md`.

**Gate**:

- **A complaint `INVALID_YAML_PATTERN` does not match**: record the verbatim phrase in the findings, then stop and escalate to the owner. The pattern is shared with `query_base` and is never widened during implementation (research D7).
- **No complaint at all** in P2 or P3: stop and escalate to the owner (research D7).

## §4 Live end-to-end (after implementation)

1. Build with `npm run build`, and run the server against the test vault.
2. Call `views_base` with `{ base_path: "Sandbox/t0-081-<ts>-broken.base", vault: "TestVault-Obsidian-CLI-MCP" }`. Expect `isError: true` with `code: "CLI_REPORTED_ERROR"`, `details.code: "BASE_MALFORMED"`, `details.reason: "invalid-yaml"`, `details.base_path` set, a plain headline, and a bounded `details.message`.
3. Focus the broken fixture, then call `views_base` with `{}`. Expect the same `details.code` and `details.reason`, with no `base_path`.
4. Call `views_base` on the control fixture. Expect `{ views, count }` unchanged.
5. Call `query_base` on the broken fixture with any `view_name`. Expect `BASE_MALFORMED` / `invalid-yaml` (SC-005).
6. Delete both fixtures. Leave `Sandbox/` empty and `Welcome.md` untouched.
