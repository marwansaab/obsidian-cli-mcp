# Quickstart Verification: List Tagged Files

**Branch**: `028-list-tagged-files`
**Date**: 2026-05-15

Verification scenarios Q-1..Q-26 mapped to SC-001..SC-013 (the spec's 13 measurable outcomes) plus new SCs introduced by plan-stage amendments. Bulk runs in CI via co-located vitest unit tests; manual T0 scenarios run against `TestVault-Obsidian-CLI-MCP` during `/speckit-implement`.

## CI scenarios (Q-1..Q-21)

These run via co-located unit tests with `invokeCli` mocked.

### Q-1 (SC-001) — Single-call retrieval against mocked stdout
**Setup**: Handler with `invokeCli` mock returning a default-mode envelope with 3 paths.  
**Action**: `handler({ tag: "alpha" })`  
**Assert**: result is `{ count: 3, paths: [...] }`; exactly one `invokeCli` call.

### Q-2 (SC-002) — Hierarchical parent-tag subsumption via JS template
**Setup**: Mock stdout from a JS template walk against a synthetic in-memory cache where files carry `foo`, `foo/bar`, `foo/bar/baz`. Build the expected envelope shape from the JS template's logic, not from a live probe.  
**Action**: `handler({ tag: "foo" })`  
**Assert**: returned paths array contains all 3 file paths.

(Note: this is a HANDLER-LAYER test that verifies the wrapper correctly parses the envelope. The actual subsumption logic is in the JS template — verified via Q-22 T0 against a real vault.)

### Q-3 (SC-003) — Leaf-tag precision
**Setup**: Same fixture as Q-2.  
**Action**: `handler({ tag: "foo/bar" })`  
**Assert**: returned paths array contains `foo/bar` and `foo/bar/baz` files; the parent-only `foo` file is excluded.

(JS-template-layer logic; Q-23 T0 confirms live.)

### Q-4 (SC-004) — Zero-match returns count=0 with no error
**Setup**: Mock stdout `=> {"ok":true,"mode":"default","count":0,"paths":[]}`.  
**Action**: `handler({ tag: "nonexistent" })`  
**Assert**: returns `{ count: 0, paths: [] }`; no error.

### Q-5 (SC-005) — Deterministic byte-asc ordering
**Setup**: Mock stdout from a JS template that has already sorted the array.  
**Action**: Two calls with identical input.  
**Assert**: byte-identical responses.

### Q-6 (SC-006) — Count-only mode returns bare integer
**Setup**: Mock stdout `=> {"ok":true,"mode":"count-only","total":5}`.  
**Action**: `handler({ tag: "alpha", total: true })`  
**Assert**: returns `5`; no `paths` field surfaced.

### Q-7 (SC-007) — Fenced code-block exclusion deferred to upstream
**Setup**: The JS template walks `app.metadataCache.metadataCache[hash].tags`, which Obsidian populates AFTER excluding fenced-code-block tags.  
**Action**: T0 against live vault confirms (Q-24).  
**Assert (handler-layer)**: any envelope shape passes through faithfully; structural test.

### Q-8 (SC-008) — Tag-input form equivalence
**Setup**: Three handler calls with inputs `"alpha"`, `"#alpha"`, `"  #alpha  "`.  
**Action**: For each, decode the base64 payload from the `invokeCli` args.  
**Assert**: all three payloads carry `{ query: "alpha", total: false }`.

### Q-9 (SC-009) — Wrapper-side ASCII lower-fold (amendment 1)
**Setup**: Three handler calls with inputs `"Alpha"`, `"ALPHA"`, `"AlPhA"`.  
**Action**: Decode each base64 payload.  
**Assert**: ALL THREE encode the EXACT input case in the payload (`Alpha`, `ALPHA`, `AlPhA`). The lower-folding happens INSIDE the JS template at runtime — the payload itself preserves the input case. Q-25 T0 confirms case-insensitive match against live vault.

### Q-10 (SC-010) — Dedup invariant for multi-source tags
**Setup**: Mock stdout where a single path appears once in the array (the JS template's per-path `Set` already de-dupes).  
**Action**: `handler({ tag: "dup" })`  
**Assert**: each path appears at most once. Q-26 T0 confirms live.

### Q-11 (SC-011) — Validation error before any spawn
**Setup**: invokeCli spy.  
**Action 11a**: `handler({ tag: "" })` → throws ZodError.  
**Action 11b**: `handler({ tag: "   " })` → throws ZodError.  
**Action 11c**: `handler({ tag: "foo//bar" })` → throws ZodError.  
**Action 11d**: `handler({ tag: "a".repeat(201) })` → throws ZodError (post-strip).  
**Action 11e**: `handler({ tag: "foo", unknownKey: 1 })` → throws ZodError (strict).  
**Assert**: spy never called for any of 11a-11e.

### Q-12 (SC-012) — Unknown vault routes to structured error
**Setup**: invokeCli mock returns `{ stdout: "Vault not found.", stderr: "", exitCode: 0 }`.  
**Action**: handler call.  
**Assert**: cli-adapter's 011-R5 inspection classifies as `CLI_REPORTED_ERROR(VAULT_NOT_FOUND, reason: "unknown")` — verified in cli-adapter test seam, not in tag-handler tests directly.

### Q-13 (SC-013) — Segment-boundary precision
**Setup**: Mock stdout from a JS template walk against a synthetic cache where the only matching tag is `foobar` (not `foo` and not `foo/<anything>`).  
**Action**: `handler({ tag: "foo" })`  
**Assert**: returned `paths` is `[]`; the JS template's `isMatch` correctly excludes the `foobar` non-match.

### Q-14 — Single-spawn invariant
**Setup**: invokeCli spy.  
**Action**: Successful handler call (any input).  
**Assert**: `spy.calls.length === 1`.

### Q-15 — Stage-0 closed-vault detection
**Setup**: invokeCli mock returns `{ stdout: "", stderr: "", exitCode: 0 }` (empty stdout exit 0 — closed-vault signature).  
**Action**: handler call.  
**Assert**: throws `CLI_REPORTED_ERROR(VAULT_NOT_FOUND, reason: "not-open")`.

### Q-16 — Stage-2 json-parse failure
**Setup**: invokeCli mock returns `{ stdout: "=> not-json", stderr: "", exitCode: 0 }`.  
**Action**: handler call.  
**Assert**: throws `CLI_REPORTED_ERROR(stage: "json-parse")`.

### Q-17 — Stage-3 envelope-parse failure
**Setup**: invokeCli mock returns `{ stdout: "=> {\"ok\":true,\"bogus\":1}", stderr: "", exitCode: 0 }`.  
**Action**: handler call.  
**Assert**: throws `CLI_REPORTED_ERROR(stage: "envelope-parse")`.

### Q-18 — Stage-4 envelope-error branch
**Setup**: invokeCli mock returns `{ stdout: "=> {\"ok\":false,\"code\":\"CACHE_NOT_READY\"}", stderr: "", exitCode: 0 }`.  
**Action**: handler call.  
**Assert**: throws `CLI_REPORTED_ERROR(stage: "envelope-error", code: "CACHE_NOT_READY")`.

### Q-19 — Anti-injection structural lock (adversarial input)
**Setup**: invokeCli spy.  
**Action**: `handler({ tag: "\"); evil(); (" })`.  
**Assert**: the rendered `code` parameter byte-stably equals the frozen template with only the base64 payload region substituted; no shell-style injection escape characters surface in raw form.

### Q-20 — Vault flow-through
**Setup**: invokeCli spy.  
**Action 20a**: `handler({ tag: "alpha" })` — assert `invokeCli` args lack `vault` key.  
**Action 20b**: `handler({ tag: "alpha", vault: "X" })` — assert `invokeCli` args carry `vault: "X"` verbatim.

### Q-21 — Cross-mode count invariant
**Setup**: invokeCli mock — paired calls. First call: `mode: "default"` envelope with 3 paths. Second call: `mode: "count-only"` envelope with `total: 3`.  
**Action**: `handler({ tag: "alpha", total: false })` then `handler({ tag: "alpha", total: true })`.  
**Assert**: first result `paths.length === 3`; second result `=== 3`. Same count across modes.

## T0 MANUAL scenarios (Q-22..Q-26)

Run against `TestVault-Obsidian-CLI-MCP` after seeding fixtures per data-model.md "Test fixture seeding plan". Clean up `Sandbox/BI-028/*` after the run.

### Q-22 — Hierarchical subsumption live
**Setup**: Seed `Sandbox/BI-028/hierarchical.md` with `tags: [project/alpha, project/alpha/v1, project/beta]`.  
**Action**: Run the built MCP server and call the `tag` tool with `{ tag: "project" }`.  
**Assert**: `paths` includes `Sandbox/BI-028/hierarchical.md`.

### Q-23 — Leaf precision live
**Setup**: Add a sibling `Sandbox/BI-028/parent-only.md` with `tags: [project]`.  
**Action**: Call with `{ tag: "project/alpha" }`.  
**Assert**: `paths` includes `hierarchical.md` but NOT `parent-only.md`.

### Q-24 — Fenced code-block exclusion live
**Setup**: Seed `Sandbox/BI-028/code-block-only.md` with a fenced code block containing `#projectcode` and no other tag references.  
**Action**: Call with `{ tag: "projectcode" }`.  
**Assert**: `count === 0`, `paths === []`. Verifies upstream tag-cache's code-block exclusion (FR-005 / SC-007).

### Q-25 — Case-variant match live (amendment 1)
**Setup**: Seed `Sandbox/BI-028/case-variant.md` with `tags: [CaseTest]`.  
**Action**: Call with `{ tag: "casetest" }` and `{ tag: "CASETEST" }` and `{ tag: "CaseTest" }`.  
**Assert**: ALL THREE return the same path (`Sandbox/BI-028/case-variant.md`). Verifies wrapper-side ASCII lower-fold (FR-008 / SC-009).

### Q-26 — Multi-source dedup live (SC-010)
**Setup**: Seed `Sandbox/BI-028/dup-sources.md` with body `#dup #dup` AND frontmatter `tags: [dup]`.  
**Action**: Call with `{ tag: "dup" }`.  
**Assert**: `count === 1`, `paths.length === 1` — the path appears exactly once even though three sources match.

## Inspection / structural cases (Q-27..Q-30)

Non-runtime verification.

### Q-27 — ADR-010 naming check
**Action**: Confirm registered tool name is `tag` (matches upstream `obsidian tag` subcommand name).  
**Assert**: pass.

### Q-28 — Registry-stability baseline roll-forward
**Action**: After tool registration, run `npm run baseline:write`; commit the updated `_register-baseline.json`.  
**Assert**: baseline fingerprint test passes; new `tag` entry added.

### Q-29 — Original-no-upstream attribution
**Action**: Grep `src/tools/tag/*.ts` for the header.  
**Assert**: all three new source files carry `// Original — no upstream.` headers.

### Q-30 — Documentation
**Action**: `docs/tools/tag.md` exists with the documented tool shape, inherited limitations (especially the five-item list from research.md), and the failure-mode roster.  
**Assert**: server registry-consistency test asserts the file exists.

## Mapping to spec SCs

| SC | Q-N coverage |
|----|--------------|
| SC-001 | Q-1 |
| SC-002 | Q-2, Q-22 |
| SC-003 | Q-3, Q-23 |
| SC-004 | Q-4 |
| SC-005 | Q-5 |
| SC-006 | Q-6 |
| SC-007 | Q-7, Q-24 |
| SC-008 | Q-8 |
| SC-009 | Q-9, Q-25 |
| SC-010 | Q-10, Q-26 |
| SC-011 | Q-11 |
| SC-012 | Q-12 |
| SC-013 | Q-13 |
| (FR-019..21 — plan amendments) | Q-14..Q-21, Q-27 |
