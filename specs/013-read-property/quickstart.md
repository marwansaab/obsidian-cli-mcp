# Quickstart — Verification Scenarios

**Feature**: [013-read-property](./spec.md)
**Date**: 2026-05-09

15 verification scenarios mapped 1:1 to SC-001..SC-015. S-1..S-11 run in CI as part of the test suite (or via static greps before merge); S-12/S-13 are manual end-to-end runs against MCP clients (Claude Desktop, MCP Inspector); S-14 is the deliberate-revert sanity check; S-15 is the documentation cross-reference check.

---

## S-1 — All US1–US5 acceptance scenarios pass on first run (SC-001..SC-007)

**Goal**: 100% of the User Story 1–5 acceptance scenarios pass after `/speckit-implement`.

**Run**:
```sh
npm run test
```

**Expected**: vitest reports 0 failures across the new `src/tools/read_property/{schema,handler,index}.test.ts` files. The acceptance-scenario distribution matches the spec: Story 1 (11 ACs) + Story 2 (3) + Story 3 (9) + Story 4 (1) + Story 5 (1) = 25 scenarios. Each AC is encoded as at least one test case in the per-FR-023 test set; the AC ID is cited in the test description (e.g., `test("Story 1 AC#5 — date property → type 'date'", …)`).

---

## S-2 — `tools/list` shape (SC-008 + SC-009)

**Goal**: `read_property` is registered alongside `delete_note`, `help`, `obsidian_exec`, `read_note`, `write_note`. The descriptor's `inputSchema` is the post-010 flat shape; `description` mentions `help("read_property")` AND surfaces the `{value, type}` output shape.

**Run** (via the post-010 consolidated drift detector — runs as part of `npm run test`):
```sh
npx vitest run src/tools/_register.test.ts
```

Or via MCP Inspector against the running server:
```sh
npx @modelcontextprotocol/inspector node dist/index.js
# In the inspector UI, switch to the Tools tab. Confirm read_property appears
# alongside the other five tools. Click its row to view its inputSchema.
```

**Expected** (drift detector): `it.each` table fires for `read_property`; all per-tool invariants pass (`name === "read_property"`, `additionalProperties === false`, all 5 properties present at top-level, no `description` keys, no `oneOf`, top-level `description` contains `"help"` and `"read_property"`).

**Expected** (MCP Inspector): visual confirmation of the 5 properties + `additionalProperties: false`. Inspect the top-level `description` and confirm it discloses the `{value, type}` output shape and the no-error-on-absent-property semantic.

---

## S-3 — Handler thinness (SC-008)

**Goal**: the handler has no direct `child_process.spawn` invocations, no `JSON.stringify` calls (output goes through `registerTool`'s envelope), and total file LOC ≤ 80.

**Run**:
```sh
grep -nE "child_process\.spawn|spawn\(" src/tools/read_property/handler.ts
wc -l src/tools/read_property/handler.ts
```

**Expected**:
- `grep` returns no matches (the only path to the CLI is via `invokeCli`).
- `wc -l` returns ≤ 80.

If the LOC ceiling is approached or exceeded, factor non-essential logic out (e.g., the response-parsing helpers into a sibling `_parse.ts` module).

---

## S-4 — No hand-rolled types (SC-008, Constitution III)

**Goal**: the schema module has zero hand-written `interface ReadProperty…` or `type ReadProperty… = { … }` declarations that redefine the input or output shape.

**Run**:
```sh
grep -nE "^(interface|type)\s+ReadProperty.*=" src/tools/read_property/schema.ts
```

**Expected**: zero matches. The only typed surface is `z.infer<typeof readPropertyInputSchema>` and `z.infer<typeof readPropertyOutputSchema>`.

(Type aliases `ReadPropertyInput = z.infer<typeof readPropertyInputSchema>` are permitted — they are inferences, not redefinitions.)

---

## S-5 — No `.describe()` calls (Constitution V / ADR-005)

**Goal**: parameter documentation lives in `docs/tools/read_property.md`, not in the schema.

**Run**:
```sh
grep -nE "\.describe\(" src/tools/read_property/schema.ts
```

**Expected**: zero matches.

---

## S-6 — Populated docs (SC-010)

**Goal**: `docs/tools/read_property.md` exists, has no TODO/stub markers, names all 5 propagated error codes, includes at least 4 worked examples covering ≥4 distinct YAML types, AND documents the active-mode multi-vault limitation per R4.

**Run**:
```sh
test -f docs/tools/read_property.md
grep -c "<!-- TODO" docs/tools/read_property.md
grep -cE "VALIDATION_ERROR|CLI_BINARY_NOT_FOUND|CLI_NON_ZERO_EXIT|CLI_REPORTED_ERROR|ERR_NO_ACTIVE_FILE" docs/tools/read_property.md
grep -cE "^### " docs/tools/read_property.md  # heading count for example sections
```

**Expected**:
- File exists.
- Zero TODO markers.
- All five error codes mentioned.
- At least 4 example headings (one per worked example).

---

## S-7 — Two-call architecture verified at handler-test layer (R3 / SC-011)

**Goal**: every successful happy-path test asserts that exactly two CLI spawn invocations occurred (Call A + Call B), with the expected argv on each. Short-circuit cases (absent property, no-frontmatter) assert exactly ONE spawn invocation.

**Run**:
```sh
npx vitest run src/tools/read_property/handler.test.ts
```

**Expected**: the handler tests' `expect(argvCalls.length).toBe(2)` assertions pass for happy-path cases; `expect(argvCalls.length).toBe(1)` passes for short-circuit cases.

---

## S-8 — Type-label translation table is exhaustive (R6 / SC-005)

**Goal**: every Obsidian label in the live-CLI characterisation translates to a deterministic spec-enum label per the R6 table.

**Run** (handler test #16 — `test("type translation: multitext → list, aliases → list, tags → list, unknown → unknown", ...)`):
```sh
npx vitest run src/tools/read_property/handler.test.ts -t "type translation"
```

**Expected**: the parameterised test fires once per translation rule; all assertions pass.

---

## S-9 — `name` field never forwarded to CLI (R2 / FR-018, FR-019)

**Goal**: the handler's spawn argv NEVER contains `name=<input.name>`. The wrapper extracts the property by name client-side.

**Run** (handler test for any happy-path scenario):
```sh
npx vitest run src/tools/read_property/handler.test.ts -t "happy path"
```

**Expected**: every test's argv assertion confirms NO `name=` argv parameter on either Call A or Call B. The argv on both calls is exclusively `vault=<v>` (specific) / nothing (active), the subcommand `properties`, the locator (Call A specific) or nothing, and `format=json`.

---

## S-10 — Coverage threshold preserved (R10)

**Goal**: the aggregate statements coverage threshold at [vitest.config.ts:20](../../vitest.config.ts#L20) is preserved or improved by this BI's additions.

**Run**:
```sh
npm run test -- --coverage
```

**Expected**: the aggregate statements line in the coverage table is ≥ 89.6% (the current floor). The new `src/tools/read_property/` module's per-file statements coverage is ~100% (well-tested module).

If coverage drops, missing-test-case suspects: an unhandled error path, a `??` fallback branch, the type-translation default case.

---

## S-11 — Sibling tools unchanged (SC-009)

**Goal**: `src/tools/{obsidian_exec,help,read_note,write_note,delete_note}/**`, `docs/tools/{obsidian_exec,help,read_note,write_note,delete_note}.md`, and the cli-adapter / target-mode / errors / logger / queue modules have ZERO substantive diff.

**Run**:
```sh
git diff --stat main..HEAD -- src/tools/obsidian_exec/ src/tools/help/ src/tools/read_note/ src/tools/write_note/ src/tools/delete_note/ src/cli-adapter/ src/target-mode/ src/errors.ts src/logger.ts src/queue.ts
git diff main..HEAD -- src/server.ts | grep -c "^+\|^-"
```

**Expected**:
- The first command's output is empty (no substantive diff in any sibling tool's module or any frozen primitive).
- The second command's count is ≤ 4 (a small additive diff in `src/server.ts`: one `import { createReadPropertyTool }` line + one `createReadPropertyTool({ logger, queue })` entry in the tools array).

---

## S-12 — Manual MCP Inspector run (SC-014 — token saving)

**Goal**: invoke `read_property` against a real vault via MCP Inspector and confirm the response is ≤ ~200 characters of structured JSON, replacing what previously required a full-file read.

**Run**:
1. Start the server: `npm run build && node dist/index.js`.
2. Launch MCP Inspector: `npx @modelcontextprotocol/inspector node dist/index.js`.
3. In the Inspector UI's Tools tab, click `read_property`.
4. Fill the form: `target_mode: "specific"`, `vault: "<your vault>"`, `path: "<a note with frontmatter>"`, `name: "<a property>"`. Submit.

**Expected**:
- The response is a structured JSON object with two keys: `value` and `type`.
- The total response text is ≤ ~200 characters.
- The `type` field matches the property's actual type in Obsidian's UI Properties panel.

Compare to the same operation via `read_note` (which returns the full file content): `read_property`'s response is dramatically smaller for the same logical query (fetching one frontmatter field).

---

## S-13 — Manual Claude Desktop run (SC-014, integration)

**Goal**: a Claude Desktop instance using `obsidian-cli-mcp` as a tool can discover and invoke `read_property` end-to-end, getting the expected `{value, type}` response.

**Run**:
1. Add `obsidian-cli-mcp` to Claude Desktop's MCP config (or restart Claude Desktop if already configured).
2. Start a conversation. Prompt: "Read the `status` property from `my-vault`'s `notes/x.md`."
3. Confirm Claude Desktop calls `read_property` (visible in the tool-call indicator) and parses the structured response correctly into its own answer.

**Expected**: end-to-end success. The agent's reasoning loop benefits from the small structured response over the larger full-file alternative.

---

## S-14 — Deliberate-revert sanity check (defence-in-depth)

**Goal**: temporarily revert ONE line of the new code and confirm the test suite catches it as a failure (not a silent pass). This validates that the new tests actually exercise the new code paths, rather than passing trivially.

**Run**:
```sh
# Pick one critical line — e.g., the "active" flag emission in Call A:
sed -i 's/flags: input.target_mode === "active" ? \["active"\] : \[\]/flags: []/' src/tools/read_property/handler.ts

npx vitest run src/tools/read_property/

# Restore:
git checkout src/tools/read_property/handler.ts
```

**Expected** (during the reverted state): at least 1 test fails. The active-mode happy-path test (handler test #12) should fail because the argv assertion no longer matches.

If NO tests fail when a critical line is reverted, that line is uncovered; add a test before merge.

---

## S-15 — Documentation cross-reference check (SC-013, SC-015)

**Goal**: every claim in `docs/tools/read_property.md` is traceable to a spec FR or research artefact entry. No orphan claims.

**Run**: manual checklist against the markdown — for each section / claim, confirm a hyperlink (or inline citation) to:
- `specs/013-read-property/spec.md` (FRs and SCs)
- `specs/013-read-property/research.md` (Rn entries)
- `specs/013-read-property/data-model.md` (schemas)

**Expected**: all claims sourced. The R4 multi-vault active-mode limitation is documented with an explicit "Known limitation" callout citing the research artefact. The two-call architecture is mentioned (with a hand-wave at the latency cost) so callers understand the performance posture.

---

## Cross-references

- [spec.md](./spec.md) — Success Criteria SC-001..SC-015 mapped 1:1 to S-1..S-15
- [research.md](./research.md) — R1..R12 design decisions
- [data-model.md](./data-model.md) — schema and invariants
- [contracts/](./contracts/) — input + handler contracts
- [012-delete-note/quickstart.md](../012-delete-note/quickstart.md) — sibling artifact this one mirrors
