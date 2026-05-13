# Quickstart — Properties Verification Scenarios

This file enumerates verification scenarios mapped 1:1 to the success criteria in [spec.md](./spec.md). Q-1 through Q-17 are CI-runnable (vitest unit tests with mocked `spawnFn`); Q-18 through Q-21 are manual against MCP Inspector / Claude Desktop with a fixture vault opened in Obsidian.

## CI-runnable scenarios (mocked spawnFn)

| Scenario | Maps to | Test file | Description |
|---|---|---|---|
| Q-1 | SC-001 | `handler.test.ts` | Multi-property fixture (mocked upstream stdout with 4+ entries) → returns full `properties` list with correct `name`/`noteCount` for each entry |
| Q-2 | SC-002 | `handler.test.ts` | Empty-frontmatter vault (mocked upstream stdout `[]\n`) → `{ count: 0, properties: [] }` no error |
| Q-3 | SC-003 | `handler.test.ts` | Mocked upstream emits entry `{ name: "status", count: 4 }` → wrapper emits single entry `{ name: "status", noteCount: 4 }` (deduplication contract — wrapper preserves the one-entry-per-name upstream guarantee) |
| Q-4 | SC-004 | `handler.test.ts` | Mocked upstream emits `[{name:"Tags",count:1},{name:"tags",count:4}]` → wrapper output preserves both entries (case-sensitive deduplication) AND sorts them adjacent (`Tags, tags` per FR-013) |
| Q-5 | SC-005 | `handler.test.ts` | Mocked upstream excludes body-content YAML-like tokens (the defer-to-upstream contract — wrapper trusts upstream). Test asserts the wrapper does NOT add any filter; whatever upstream emits is what's returned. Live-vault verification at Q-19 |
| Q-6 | SC-006 | `handler.test.ts` | Mocked upstream emits entry for a property whose `count` is 0 → wrapper passes through with `noteCount: 0` (null-valued frontmatter case; upstream's own counter logic determines inclusion) |
| Q-7 | SC-007 | `handler.test.ts` | Mocked upstream emits one entry for `nested` (top-level YAML key) even when frontmatter source has `nested:\n  child: foo` → wrapper passes through (defer-to-upstream for top-level-key counting) |
| Q-8 | SC-008 | `handler.test.ts` | Named-vault call `{ vault: "Demo" }` → argv contains `vault=Demo`; mocked upstream returns array; wrapper output reflects upstream. The actual scoping is per F4 inherited limitation — upstream ignores `vault=` — but the wrapper passes the parameter as data per FR-024 |
| Q-9 | SC-009 | `handler.test.ts` | Unknown-vault: `{ vault: "Unknown" }` does NOT produce a wrapper-imposed error. The call returns the focused vault's inventory (per F4 / R5 inherited limitation). Test verifies the wrapper has no vault-registry pre-check AND no `CLI_REPORTED_ERROR` for the vault name. The documented limitation is asserted in the worked-example doc at `docs/tools/properties.md` |
| Q-10 | SC-010 | `schema.test.ts` | All five validation rejection cases (US3 scenarios 1–5) pass at schema layer; spawnFn never invoked |
| Q-11 | SC-011 | `schema.test.ts` + `handler.test.ts` | Path-traversal `vault: "../escape"` → schema permits (only `.min(1)` enforced); cli-adapter passes as data per F4 (silently honoured-as-noop). No filesystem escape; defence-in-depth via R6 / FR-024. The `vault` field is a registry name, not a filesystem path — `..` chars cannot escape any filesystem boundary |
| Q-12 | SC-012 | `handler.test.ts` | Count-only mode against multi-property fixture (mocked upstream `73\n`) → `{ count: 73, properties: [] }`. Count-only mode against empty-vault (mocked upstream `0\n`) → `{ count: 0, properties: [] }`. Cross-mode invariant: same upstream returns same `count` value under both modes per FR-006a |
| Q-13 | SC-013 | `handler.test.ts` | Sort order verification: mocked upstream emits unsorted `[{Tags,1},{tags,4},{Banana,2},{Aardvark,1},{aardvark,3}]` → wrapper emits sorted `[Aardvark,aardvark,Banana,Tags,tags]`. Case-distinct pairs adjacent; byte-order tiebreak (uppercase before lowercase within each pair) |
| Q-14 | SC-014 | `handler.test.ts` (token-cost regression) | Inventory payload size << full-vault-grep equivalent (assertion via fixture-based payload byte comparison; 5× threshold per the BI-023 U1 precedent). Locks the user's "single tool call replaces the brittle grep" claim |
| Q-15 | SC-015 | `_register-baseline.test.ts` | After regenerating the baseline via `npm run baseline:write`, every other tool's fingerprint is unchanged; only the new `properties` entry is added |
| Q-16 | SC-016 | `index.test.ts` | `docs/tools/properties.md` exists with non-stub content (≥4 worked examples + error roster + input/output contracts × 2 modes + multi-vault inherited limitation note) |
| Q-17 | SC-017 | All test files | Total test count ≥ 20 across schema/handler/registration suites — actual count is 45 (16 schema / 24 handler / 5 registration). SC-018 (zero new error codes) is verified greppable: failure paths flow through `VALIDATION_ERROR` / `CLI_REPORTED_ERROR` / `CLI_NON_ZERO_EXIT` / `CLI_BINARY_NOT_FOUND` only. SC-019 (16 characterisation cases) is verified via `research.md` enumeration. SC-020 (structural data-passing) is verified by argv inspection in `handler.test.ts`. SC-021 (10 MiB cap behaviour) is verified via mocked output-cap response |

## Manual scenarios (live CLI against a focused fixture vault)

| Scenario | Maps to | Run instructions | Description |
|---|---|---|---|
| Q-18 | SC-009 | T0 of `/speckit-implement` | Verify the F4 inherited-limitation contract end-to-end: with TestVault-Obsidian-CLI-MCP focused in Obsidian, invoke `obsidian properties vault=NonExistentVault format=json` and confirm output is byte-identical to `obsidian properties format=json` (upstream silently honours-as-noop). Document the observation in `research.md` if it differs from F4 |
| Q-19 | SC-005 / F12 | T0 of `/speckit-implement` | Seed `Sandbox/probe-body-yaml.md` in TestVault-Obsidian-CLI-MCP with `---\nrealkey: yes\n---\n# Body\n\n````yaml\nfakekey: nope\n````\n\n    indented_fake: nope\n`. Open TestVault as focused. Invoke `obsidian properties format=json` and confirm `realkey` appears in the listing AND `fakekey` / `indented_fake` do NOT. Document the observation; lock the deferred-to-upstream FR-010 contract. Clean up fixture |
| Q-20 | SC-013 / F13 | T0 of `/speckit-implement` | Seed two notes in TestVault Sandbox: one with frontmatter `Tags: [a]` AND `Aardvark: 1`; another with `tags: [b]` AND `aardvark: 2`. Open TestVault as focused. Invoke `obsidian properties format=json`. Confirm upstream emits all four names. Run the wrapper end-to-end and confirm the wrapper's output order is `Aardvark, aardvark, Tags, tags` (case-insensitive primary + byte-order tiebreak per FR-013). Clean up |
| Q-21 | SC-021 | T0 of `/speckit-implement` | If the test vault contains thousands of distinct property names (or one is synthesised), invoke `obsidian properties format=json` and confirm either (a) the response returns successfully under the 10 MiB cli-adapter cap, or (b) the response surfaces as `CLI_NON_ZERO_EXIT` (output-cap kill). Either outcome is contract-conformant; document which one fires for the chosen fixture size |

## End-to-end smoke (after `/speckit-implement` completes)

Run from MCP Inspector or Claude Desktop with the freshly-built server:

1. Call `tools/list` → confirm `properties` appears in the list with the documented input schema (`vault?: string`, `total?: boolean`).
2. Call `properties({})` against a focused vault with frontmatter → confirm response shape `{ count, properties: [{ name, noteCount }, ...] }`.
3. Call `properties({ total: true })` → confirm `{ count: N, properties: [] }`.
4. Call `properties({ vault: "TestVault-Obsidian-CLI-MCP" })` → confirm response covers the focused vault (per F4 inherited limitation).
5. Call `properties({ vault: "" })` → confirm `VALIDATION_ERROR`.
6. Call `properties({ file: "note.md" })` → confirm `VALIDATION_ERROR` (additionalProperties).
7. Call `help({ tool_name: "properties" })` → confirm the published doc renders with worked examples and error roster.
8. Cross-mode invariant: call `properties({})` and `properties({ total: true })` back-to-back; confirm both return the same outer `count` value.
