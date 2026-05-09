# Quickstart — `find_by_property` Verification Scenarios

**Feature**: [014-find-by-property](./spec.md)
**Phase**: 1 (Design & Contracts)
**Date**: 2026-05-09

This quickstart maps each Success Criterion (SC-001..SC-018) to a verification scenario (S-1..S-18). S-1..S-15 run in CI via the co-located test suite; S-16..S-18 are manual end-to-end checks against MCP Inspector / Claude Desktop.

Test execution against the real CLI follows [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md). The authorised test vault is `TestVault-Obsidian-CLI-MCP`; fixtures go under `Sandbox/find-probe-014/`.

---

## CI scenarios (S-1..S-15)

Each S-N corresponds to one or more SCs and is locked by at least one test in `src/tools/find_by_property/{schema,handler,index}.test.ts`.

### S-1 — Scalar identifier lookup (SC-001)

**Setup**: fixture vault carries one note with `id: BI-030`.
**Call**: `find_by_property({ vault: "Demo", property: "id", value: "BI-030" })`.
**Assert**: `{ count: 1, paths: ["<that note's vault-relative path>"] }`.
**Test**: `handler.test.ts` case 1 (scalar string happy-path).

### S-2 — No-match (SC-002)

**Setup**: fixture vault carries no note with the queried value.
**Call**: `find_by_property({ vault: "Demo", property: "id", value: "DOES-NOT-EXIST" })`.
**Assert**: `{ count: 0, paths: [] }`. No error.
**Test**: `handler.test.ts` case 5.

### S-3 — Multi-match (SC-003)

**Setup**: three notes share `status: queued`.
**Call**: `find_by_property({ vault: "Demo", property: "status", value: "queued" })`.
**Assert**: `count === paths.length === 3`; every queued note's path appears.
**Test**: `handler.test.ts` case 6.

### S-4 — Folder-scoped narrow (SC-004)

**Setup**: a note with `id: BI-030` lives at `backlog/BI-030.md`; another note exists outside `backlog/`.
**Call**: `find_by_property({ vault: "Demo", property: "id", value: "BI-030", folder: "backlog" })`.
**Assert**: `count === 1`; the returned path starts with `backlog/`.
**Test**: `handler.test.ts` case 7.

### S-5 — Folder-scoped exclude (SC-004)

**Setup**: same fixture as S-4.
**Call**: `find_by_property({ vault: "Demo", property: "id", value: "BI-030", folder: "archive" })`.
**Assert**: `{ count: 0, paths: [] }`.
**Test**: `handler.test.ts` case 8.

### S-6 — Array-contains (default `arrayMatch: true`) (SC-005)

**Setup**: notes with `tags: [alpha, beta]` and `tags: [alpha]`.
**Call**: `find_by_property({ vault: "Demo", property: "tags", value: "alpha" })`.
**Assert**: both notes returned.
**Test**: `handler.test.ts` case 9 (argv-payload assertion plus mocked CLI response).

### S-7 — Array-exact-equality (`arrayMatch: false`) — order-sensitive (SC-005)

**Setup**: note with `tags: [alpha, beta]`.
**Call A**: `find_by_property({ vault: "Demo", property: "tags", value: ["alpha", "beta"], arrayMatch: false })` — matches.
**Call B**: `find_by_property({ vault: "Demo", property: "tags", value: ["beta", "alpha"], arrayMatch: false })` — `{ count: 0, paths: [] }` per the [Q1 clarification](./spec.md#clarifications).
**Test**: `handler.test.ts` case 10 (argv-payload assertion).

### S-8 — Type-faithful number vs string (SC-006)

**Setup**: notes with `count: 7` (number) and `count: "7"` (quoted string).
**Call A**: `find_by_property({ vault: "Demo", property: "count", value: 7 })` — matches the numeric note ONLY.
**Call B**: `find_by_property({ vault: "Demo", property: "count", value: "7" })` — matches the string-quoted note ONLY.
**Test**: `handler.test.ts` cases 2 (number) and 1 (string).

### S-9 — Case-insensitive opt-in (SC-007)

**Setup**: note with `tag: Alpha`.
**Call A**: `find_by_property({ vault: "Demo", property: "tag", value: "alpha" })` — `{ count: 0, paths: [] }` (default `caseSensitive: true`).
**Call B**: `find_by_property({ vault: "Demo", property: "tag", value: "alpha", caseSensitive: false })` — matches.
**Test**: `handler.test.ts` case 11 (argv-payload assertion).

### S-10 — Validation rejects malformed inputs (SC-008)

For each US5 invalid input shape, assert validation rejects AND no CLI call occurs:
- (a) `property: ""`
- (b) `property` omitted
- (c) `value` omitted
- (d) `value: { foo: "bar" }`
- (e) `value: ["x"]` with `arrayMatch: true` (default)
- (f) Unknown top-level key
- (g) `folder: ".."`
- (h) `folder: "../escape"`
- (i) `folder: "/abs"`

**Test**: `schema.test.ts` cases 1, 2, 3, 5, 6, 9, 10, 11, 14 — assert no CLI invocation via `spawnFn` not being called.

### S-11 — Unknown-vault produces structured error (SC-009)

**Setup**: query against an unknown vault display name.
**CLI mock**: stdout `Vault not found.\n`, exit 0.
**Assert**: handler throws `UpstreamError({ code: "CLI_REPORTED_ERROR" })` via the cli-adapter's 011-R5 inspection clause.
**Assert**: response is NOT `{ count: 0, paths: [] }` (the contract anti-conflation).
**Test**: `handler.test.ts` case 14.

### S-12 — Folder traversal escape rejected at schema (SC-010)

**Call** each of: `folder: ".."`, `folder: "../"`, `folder: "../foo"`, `folder: "foo/.."`, `folder: "foo/../bar"`, `folder: "/anything"`, `folder: "\\anything"`.
**Assert**: every call rejects with `VALIDATION_ERROR`; spawnFn never called.
**Test**: `schema.test.ts` cases 10–15.

### S-13 — Existing typed tools' public surface unchanged (SC-011)

**Assert**: `read_note`, `write_note`, `delete_note`, `read_property`, `obsidian_exec`, the help tool — every byte of their schema, output shape, and behaviour is unchanged. Only the help facility / docs index grow by one entry.
**Test**: covered by the post-010 consolidated drift detector at `_register.test.ts`'s `it.each` registry walk + the registry-consistency test at `server.test.ts`.

### S-14 — Documentation surface (SC-012)

**Assert**: `docs/tools/find_by_property.md` exists AND covers per-field input contract + output shape + failure-mode roster + ≥4 worked examples (scalar happy-path, folder-scoped, array-contains, case-insensitive). The current placeholder stub (if any) is replaced.
**Test**: `index.test.ts` case 4 (doc presence + content completeness assertions).

### S-15 — Total test count (SC-013)

**Assert**: the schema, handler, and registration test files together contribute ≥ 30 cases. Target is 45 (18 / 22 / 5).
**Test**: meta-assertion via `vitest --reporter=verbose` count, manually verified at /speckit-implement.

---

## Manual end-to-end scenarios (S-16..S-18)

These run after a build and are NOT part of the automated test suite.

### S-16 — Token-saving observability (SC-016)

**Setup**: an MCP-Inspector or Claude-Desktop session connected to a fresh build of the server.
**Call**: invoke `find_by_property` with a unique-identifier query (`property: "id", value: "BI-030"`) AND the prior workflow it replaces (a 1–5-call guess-the-path-from-convention sequence using `read_note`).
**Compare**: token counts and turn counts. The `find_by_property` call returns ~50–200 bytes of structured response replacing the old workflow's full-file read(s) plus client-side YAML parsing.
**Pass condition**: the `find_by_property` response is observably smaller AND the agent's overall turn count for the lookup is reduced.

### S-17 — Anti-injection structural verification (SC-017)

**Setup**: the build's `find_by_property` handler.
**Inspect**: the source of `handler.ts`. Verify:
1. `JS_TEMPLATE` is a frozen string constant declared at module scope.
2. The only insertion into `JS_TEMPLATE` is the base64 payload via `replace("__PAYLOAD_B64__", payloadB64)`.
3. `payloadB64` is `Buffer.from(JSON.stringify(...)).toString("base64")` — no string concatenation of user inputs.
**Verify**: an attempt to inject JS via `value: "'; alert(1); //"` produces a base64 payload containing only `[A-Za-z0-9+/=]`; the rendered argv contains no JS-source-level injection point.
**Pass condition**: argv inspection at runtime shows the JS template body unchanged across all queries; only the base64 string varies.

### S-18 — In-session output stability (SC-018)

**Setup**: an MCP-Inspector session connected to a fresh build.
**Call**: invoke `find_by_property` twice in a row with identical input AND no intervening vault state change.
**Assert**: both responses' `paths` arrays are equal element-for-element in the same order.
**Pass condition**: byte-identical response payloads.

---

## Coverage map (SC ↔ scenario)

| SC | Scenario | Test file |
|---|---|---|
| SC-001 | S-1 | `handler.test.ts` |
| SC-002 | S-2 | `handler.test.ts` |
| SC-003 | S-3 | `handler.test.ts` |
| SC-004 | S-4, S-5 | `handler.test.ts` |
| SC-005 | S-6, S-7 | `handler.test.ts` |
| SC-006 | S-8 | `handler.test.ts` |
| SC-007 | S-9 | `handler.test.ts` |
| SC-008 | S-10 | `schema.test.ts` |
| SC-009 | S-11 | `handler.test.ts` |
| SC-010 | S-12 | `schema.test.ts` |
| SC-011 | S-13 | `_register.test.ts` (auto), `server.test.ts` (auto) |
| SC-012 | S-14 | `index.test.ts` |
| SC-013 | S-15 | meta-count |
| SC-014 | n/a (handler does not introduce new error codes; covered by code review) | — |
| SC-015 | covered by S-7 + S-10 + S-11 (live CLI characterisation) | research.md |
| SC-016 | S-16 (manual) | — |
| SC-017 | S-17 (manual) | — |
| SC-018 | S-18 (manual) | — |

---

## Test execution gating

Per CLAUDE.md's `## Test Execution` section + [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md): any test category that produces real CLI invocations against the live `obsidian` binary requires the test vault rules to be observed. The CI tests (S-1..S-15) all use `spawnFn` injection and do NOT touch the live CLI; they run unconditionally. Manual scenarios S-16..S-18 run against the live CLI and must follow the test-vault and cleanup protocol.
