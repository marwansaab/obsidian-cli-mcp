# Quickstart — Outline Verification Scenarios

This file enumerates verification scenarios mapped 1:1 to the success criteria in [spec.md](./spec.md). Q-1 through Q-19 are CI-runnable (vitest unit tests with mocked `spawnFn`); Q-20 through Q-23 are manual against MCP Inspector / Claude Desktop with `TestVault-Obsidian-CLI-MCP` opened in Obsidian.

## CI-runnable scenarios (mocked spawnFn)

| Scenario | Maps to | Test file | Description |
|---|---|---|---|
| Q-1 | SC-001 | `handler.test.ts` | Multi-level fixture in specific+path mode → returns full headings array with correct `level`/`text`/`line` for each entry |
| Q-2 | SC-002 | `handler.test.ts` | Zero-heading file (`No headings found.` upstream) in default mode → `{ count: 0, headings: [] }` |
| Q-3 | SC-003 | `handler.test.ts` | Skip-level fixture → output preserves source levels (e.g. 1 then 3) |
| Q-4 | SC-004 | `handler.test.ts` | File-not-found upstream response → `CLI_REPORTED_ERROR` (dispatch-layer auto-classified) |
| Q-5 | SC-005 | `handler.test.ts` | Unknown-vault: documented limitation that the call runs against the focused vault. Test verifies the wrapper does NOT add an unknown-vault response-inspection clause (regression test that vault=NonExistent does not produce `CLI_REPORTED_ERROR` from the wrapper itself — the focused-vault outline returns successfully) |
| Q-6 | SC-006 | `handler.test.ts` | Fixture with fenced-block-containing-`#`-line → upstream excludes it; output reflects the upstream array unchanged |
| Q-7 | SC-007 | `handler.test.ts` | Active mode happy → handler omits vault/file/path; output reflects upstream array. Active mode no-focus → `ERR_NO_ACTIVE_FILE` (dispatch-layer auto-classified per R13) |
| Q-8 | SC-008 | `schema.test.ts` | All seven validation rejection cases (US3 scenarios 1–7) pass at schema layer; spawnFn never invoked |
| Q-9 | SC-009 | `handler.test.ts` | Path-traversal `path: "../escape.md"` → upstream returns file-not-found; dispatch-layer auto-classified to `CLI_REPORTED_ERROR` |
| Q-10 | SC-010 | `handler.test.ts` | Count-only mode against multi-heading file → `{ count: N, headings: [] }`. Count-only mode against zero-heading file → `{ count: 0, headings: [] }`. Count-only mode + file-not-found → `CLI_REPORTED_ERROR` (does NOT short-circuit) |
| Q-11 | SC-011 | `handler.test.ts` | Heading text byte-faithful: `**bold**` survives, `^anchor-id` survives, `Edge::Case` substring survives, closing-ATX `## Title ##` upstream-pre-stripped to `Title` |
| Q-12 | SC-012 | `handler.test.ts` (token-cost regression) | Outline payload size << full-file payload size (assertion via fixture-based payload byte comparison); outline-then-targeted-read pattern documented in `docs/tools/outline.md` |
| Q-13 | SC-013 | `_register-baseline.test.ts` | After regenerating the baseline via `npm run baseline:write`, every other tool's fingerprint is unchanged; only the new `outline` entry is added |
| Q-14 | SC-014 | `index.test.ts` | `docs/tools/outline.md` exists with non-stub content (≥4 worked examples + error roster + input/output contracts × 2 modes) |
| Q-15 | SC-015 | All test files | Total test count ≥ 25 across schema/handler/registration suites — actual count is 52 (18 schema / 29 handler / 5 registration; post-/speckit-analyze U1 remediation 2026-05-13) |
| Q-16 | SC-016 | `errors.ts` | Greppable: zero new error codes added by this BI; failure paths flow through `VALIDATION_ERROR` / `CLI_REPORTED_ERROR` / `ERR_NO_ACTIVE_FILE` / `CLI_NON_ZERO_EXIT` / `CLI_BINARY_NOT_FOUND` only |
| Q-17 | SC-017 | `research.md` | All 16 enumerated FR-023 characterisation cases are documented; F1–F16 findings persisted live |
| Q-18 | SC-018 | `handler.test.ts` (argv assertion + base64 sanity) | Argv inspection confirms `vault` / `file` / `path` are passed as separate process arguments; no shell, no eval, no string interpolation |
| Q-19 | SC-019 | `handler.test.ts` (CRLF/LF parity) | CRLF-saved fixture upstream JSON returns identical output to LF-saved fixture upstream JSON (because upstream returns the same line numbers regardless of terminator style); locked via fixture pair |

## Manual scenarios (live CLI against TestVault-Obsidian-CLI-MCP)

| Scenario | Maps to | Run instructions | Description |
|---|---|---|---|
| Q-20 | SC-020 | T0 of `/speckit-implement` | Author a fixture file with thousands of synthetic headings in `Sandbox/`. Invoke `obsidian outline path=Sandbox/huge.md vault=TestVault-Obsidian-CLI-MCP format=json` and confirm either (a) the response returns successfully under the 10 MiB cli-adapter cap, or (b) the response surfaces as `CLI_NON_ZERO_EXIT` (output-cap kill). Either outcome is contract-conformant; document which one fires for the chosen fixture size |
| Q-21 | SC-021 | T0 of `/speckit-implement` | Seed `Sandbox/probe.canvas`, `Sandbox/probe.pdf`, and `Sandbox/probe.png` (any image). Invoke `obsidian outline path=Sandbox/probe.<ext> vault=TestVault-Obsidian-CLI-MCP format=json` for each. Confirm each returns `Error: File is not a markdown file.` exit 0 (the dispatch-layer auto-classifier maps to `CLI_REPORTED_ERROR`). Clean up fixtures |
| Q-22 | F10 / R11 / amended FR-013 | T0 of `/speckit-implement` | Author a fixture in `Sandbox/` containing both ATX and Setext (`====` H1 underline AND `----` H2 underline) headings. Invoke `obsidian outline path=Sandbox/setext.md vault=TestVault-Obsidian-CLI-MCP format=json` and confirm Setext entries appear in upstream output (defer-to-upstream contract). Lock the wrapper test against the actual upstream behaviour |
| Q-23 | R13 | T0 of `/speckit-implement` | With Obsidian open but no note focused, invoke `obsidian outline format=json` (active mode, no vault). Document the upstream error string and its dispatch-layer classification. If the string is `Error: no active file`, confirm it maps to `ERR_NO_ACTIVE_FILE`. If it differs, lock the actual mapping in the handler test suite |

## End-to-end smoke (after `/speckit-implement` completes)

Run from MCP Inspector or Claude Desktop with the freshly-built server:

1. Call `tools/list` → confirm `outline` appears in the list with the documented input schema.
2. Call `outline({ target_mode: "active" })` against a focused note with multiple headings → confirm response shape `{ count, headings }`.
3. Call `outline({ target_mode: "specific", vault: "TestVault-Obsidian-CLI-MCP", path: "Welcome.md" })` → confirm `{ count: 0, headings: [] }`.
4. Call `outline({ target_mode: "active", total: true })` → confirm `{ count: N, headings: [] }`.
5. Call `outline({ target_mode: "active", file: "anything" })` → confirm validation error (active mode + locator forbidden).
6. Call `help({ tool_name: "outline" })` → confirm the published doc renders with worked examples and error roster.
