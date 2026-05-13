# Quickstart — `links` Typed MCP Tool

**Feature**: [025-list-links](./spec.md)
**Date**: 2026-05-13

This document is the Phase 1 verification scenarios artefact for `links`. Each scenario (Q-1..Q-24) maps to one or more Success Criteria (SC-001..SC-024) in [spec.md](./spec.md). Scenarios Q-1..Q-18 are executed by handler / schema / registration tests in CI (no real `obsidian` binary required). Scenarios Q-19..Q-24 are executed manually against `TestVault-Obsidian-CLI-MCP` during T0 of `/speckit-implement` (real CLI; require fresh fixtures or focused-vault state changes).

---

## CI scenarios (Q-1..Q-18)

### Q-1 — Specific-mode by path: mixed-link inventory

**SC-001, SC-002, SC-008, SC-009a, SC-016**

Construct a stub `getFileCache` fixture mirroring the live probe at F2: `links[]` carries `[[Roadmap]]` on line 4, `[[Glossary|Terms]]` on line 5, `[Note](Other-Note.md)` on line 9; `embeds[]` carries `![[diagrams/system.png]]` on line 6 and `![alt](image.png)` on line 8; `frontmatterLinks[]` carries `{key: 'related', link: 'Other-Note', original: '[[Other-Note]]', displayText: 'Other-Note'}`. Invoke `executeLinks({target_mode:'specific', vault:'Demo', path:'Projects/brief.md'}, {invokeCli: stub})`. Stub returns success envelope based on fixture.

**Assertions**:
- Response: `count: 6`, `links.length: 6`.
- Order: frontmatter entry first (synthetic line 1), then Roadmap (line 4), Glossary (line 5), system.png (line 6), image.png (line 8), Other-Note.md (line 9).
- Per-entry `target` values byte-faithful: `Other-Note`, `Roadmap`, `Glossary`, `diagrams/system.png`, `image.png`, `Other-Note.md`.
- Kinds: frontmatter wikilink, body wikilink, body wikilink, embed, embed, markdown.
- `displayText` present only on entries with aliases: Glossary → `"Terms"`, image.png → `"alt"`, Other-Note.md → `"Note"`. Other entries omit `displayText`.

### Q-2 — Specific-mode by basename equivalence

**SC-002**

Same fixture as Q-1. Invoke with `{target_mode:'specific', vault:'Demo', file:'brief'}`. Stub's `getFirstLinkpathDest('brief', '')` returns the same file as Q-1's `path`. Assert structurally-equivalent response (same `count`, same per-entry values, same order).

### Q-3 — Empty `.md` file returns empty inventory

**SC-005, SC-015**

Stub `getFileCache` returns `{}` (no `links` / `embeds` / `frontmatterLinks` keys). Invoke with `total:false`. Assert `count:0, links:[]`, no error.

### Q-4 — Active mode happy path

**SC-003**

Stub `app.workspace.getActiveFile()` returns the same fixture file as Q-1's `path` resolves to; `getFileCache` returns the Q-1 fixture. Invoke with `{target_mode:'active'}`. Assert response identical to Q-1 (active-mode resolves the focused file, then the rest of the eval JS executes identically).

### Q-5 — Active mode + no focused file

**SC-004**

Stub `app.workspace.getActiveFile()` returns `null`. Invoke with `{target_mode:'active'}`. Stub returns the eval envelope `{ok:false, code:'NO_ACTIVE_FILE', detail:'No note focused; ...'}`. Assert `executeLinks` throws `UpstreamError` with `code: 'ERR_NO_ACTIVE_FILE'` (or `CLI_REPORTED_ERROR` per T0 lock — both satisfy FR-013).

### Q-6 — Per-occurrence semantic: same target, different lines

**SC-006**

Stub fixture: `links[]` has two entries both with `link: 'Other'`, `original: '[[Other]]'`, on lines 4 and 12 (0-based 3 and 11). Invoke. Assert response has TWO entries, both `target: 'Other'`, `line: 4` and `line: 12`, in source order.

### Q-7 — Per-occurrence semantic: same target, same line, intra-line tiebreak

**SC-007, SC-016**

Stub fixture: `links[]` has two entries both with `link: 'Apple'`, `original: '[[Apple]]'`, same line (line 5, 0-based 4), `col` values 5 and 30. Invoke. Assert response has TWO entries, both `target: 'Apple'`, both `line: 5`, with the col=5 entry preceding the col=30 entry (left-to-right intra-line tiebreak per Q5 / FR-008 internal `_col` sort).

### Q-8 — `target` carries heading/block fragment embedded

**SC-008**

Stub fixture: `links[]` has entries with `link: 'Target#Heading'` (original `[[Target#Heading]]`) and `link: 'Target#^block-id'` (original `[[Target#^block-id]]`). Invoke. Assert per-entry `target` values are `Target#Heading` and `Target#^block-id` respectively — fragment EMBEDDED, NO separate `fragment` field.

### Q-9 — Body-content opacity (defer-to-upstream)

**SC-009**

Stub's metadataCache returns only links from a fixture whose body source contains `[[Other]]` both as a real link (line 4) AND as a verbatim wikilink-syntax example inside a triple-backtick fence (line 7). Obsidian's metadataCache (which the stub mimics) excludes the fenced occurrence — so the cache `links[]` has exactly one entry. Invoke. Assert response has one entry, line 4.

### Q-10 — Frontmatter-link inclusion with synthetic line=1

**SC-009a**

Stub fixture: `frontmatterLinks[]` has two entries (e.g. `related: "[[A]]"` and `project: "[[B]]"`); `links[]` has one body entry on line 8. Invoke. Assert response has 3 entries — two frontmatter entries first with `line: 1`, then the body entry with `line: 8`. Frontmatter entries' `kind` is `wikilink`.

### Q-11 — Unresolved `path` locator → structured error

**SC-010**

Invoke with `{target_mode:'specific', vault:'Demo', path:'DoesNotExist.md'}`. Stub returns envelope `{ok:false, code:'FILE_NOT_FOUND', detail:'path: DoesNotExist.md'}`. Assert `executeLinks` throws `UpstreamError` with `code: 'CLI_REPORTED_ERROR'`, `details: {stage:'envelope-error', code:'FILE_NOT_FOUND', detail:'path: DoesNotExist.md'}`.

### Q-12 — Unresolved `file` (basename) → structured error

**SC-010**

Invoke with `{target_mode:'specific', vault:'Demo', file:'DoesNotExist'}`. Stub returns envelope `{ok:false, code:'FILE_NOT_FOUND', detail:'wikilink: DoesNotExist'}`. Same UpstreamError shape as Q-11 but with `wikilink: DoesNotExist` detail.

### Q-13 — Unknown vault → cli-adapter 011-R5 inspection → structured error

**SC-011**

Invoke with `{target_mode:'specific', vault:'Unknown', path:'whatever.md'}`. Stub returns stdout `Vault not found.` (plain text, exit 0). The cli-adapter's 011-R5 inspection clause fires (verified inherited from existing cli-adapter tests). Assert `executeLinks` throws `UpstreamError` with `code: 'CLI_REPORTED_ERROR'` (and the adapter sets `details.code: 'VAULT_NOT_FOUND'` per its convention).

### Q-14 — Non-`.md` target → NOT_MARKDOWN envelope → structured error

**SC-012**

Invoke with `{target_mode:'specific', vault:'Demo', path:'Sandbox/probe.canvas'}`. Stub returns envelope `{ok:false, code:'NOT_MARKDOWN', detail:'path: Sandbox/probe.canvas extension: canvas'}`. Assert `executeLinks` throws `UpstreamError` with `details.code: 'NOT_MARKDOWN'`.

### Q-15 — Validation failures × 7 (US3 scenarios 1–7)

**SC-013**

Iterate the seven US3 scenarios (missing-vault-specific / missing-locator-specific / both-locators-specific / unknown-key / non-boolean `total` / path-traversal `path` / unknown `target_mode`). For each, invoke with the malformed input and a dispatcher spy. Assert `registerTool`'s wrapper raises `VALIDATION_ERROR` AND that the dispatcher spy was NEVER called.

### Q-16 — Cross-mode invariant (FR-005a / R11)

**SC-015**

Invoke same fixture (Q-1 stub) with `total: false`, capture `count`. Re-invoke same fixture with `total: true`, capture `count`. Assert `count_false === count_true` AND `total:true.links === []`.

### Q-17 — Base64 payload round-trip + frozen template + single spawn

**SC-013, SC-023**

For Q-1's invocation, decode the `code=…` argv parameter's base64 region: `atob` the captured payload string. JSON.parse it. Assert the decoded payload equals `{active: false, path: 'Projects/brief.md', file: null, total: false}` bit-for-bit. Assert the `code` string starts with the frozen prefix `(()=>{\nconst a=JSON.parse(atob('` and ends with the frozen suffix `'))...;return JSON.stringify(...);})()`. Assert `stubSpawn` was called exactly once.

### Q-18 — Eval response malformed → `CLI_REPORTED_ERROR(stage: 'json-parse')` and envelope-parse failure → `CLI_REPORTED_ERROR(stage: 'envelope-parse')`

**SC-013**

Two test cases:
1. Stub returns stdout `=> not valid json` (non-JSON). Assert `executeLinks` throws `UpstreamError` with `code: 'CLI_REPORTED_ERROR'`, `details.stage: 'json-parse'`.
2. Stub returns stdout `=> {"ok":true,"count":5,"links":[],"surprise":"extra"}` (unknown key). Assert `executeLinks` throws `UpstreamError` with `details.stage: 'envelope-parse'`.

---

## Manual T0 scenarios (Q-19..Q-24)

Execute against `TestVault-Obsidian-CLI-MCP` per the [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) protocol. Seed fixtures under `Sandbox/`; clean up post-probe.

### Q-19 — End-to-end specific mode by path

**SC-001**

Seed `Sandbox/t0-mixed.md` with five outgoing links (wikilink / aliased wikilink / wiki embed / markdown embed / internal markdown link) and one body-only bare URL. Run `executeLinks({target_mode:'specific', vault:'TestVault-Obsidian-CLI-MCP', path:'Sandbox/t0-mixed.md'}, realDeps)`. Assert response carries 5 entries (not 6 — bare URL omitted), per-entry shape matches the fixture. Clean up the fixture.

### Q-20 — End-to-end active mode happy path

**SC-003**

Seed `Sandbox/t0-active.md` with two outgoing links. Open it in Obsidian (focused). Run `executeLinks({target_mode:'active'}, realDeps)`. Assert response covers the focused file's links. Close the file; clean up the fixture.

### Q-21 — End-to-end active mode + no focused file

**SC-004**

Close all panes in Obsidian (or switch to a non-note view). Run `executeLinks({target_mode:'active'}, realDeps)`. Assert response is a structured no-active-file error (`ERR_NO_ACTIVE_FILE` or `CLI_REPORTED_ERROR(NO_ACTIVE_FILE)` per R13 / T0 lock).

### Q-22 — End-to-end unknown vault

**SC-011**

Run `executeLinks({target_mode:'specific', vault:'NonExistent-Vault-Name', path:'whatever.md'}, realDeps)`. Assert response is `CLI_REPORTED_ERROR(VAULT_NOT_FOUND)` per the 011-R5 inspection clause (F7).

### Q-23 — End-to-end non-`.md` target

**SC-012**

Seed `Sandbox/t0-probe.canvas` (`{"nodes":[],"edges":[]}`). Run `executeLinks({target_mode:'specific', vault:'TestVault-Obsidian-CLI-MCP', path:'Sandbox/t0-probe.canvas'}, realDeps)`. Assert response is `CLI_REPORTED_ERROR(NOT_MARKDOWN)`. Clean up the fixture.

### Q-24 — End-to-end very-large-link-list cap-boundary

**SC-024**

Seed `Sandbox/t0-large.md` with enough outgoing links that the rendered eval response would exceed 10 MiB. Run the call. Assert response is `CLI_NON_ZERO_EXIT` (output-cap kill), NOT a silent truncation. Clean up the fixture.

---

## Mapping table (Q → SC)

| Q-N | SCs covered |
|---|---|
| Q-1 | SC-001, SC-002, SC-008, SC-009a, SC-016 |
| Q-2 | SC-002 |
| Q-3 | SC-005, SC-015 |
| Q-4 | SC-003 |
| Q-5 | SC-004 |
| Q-6 | SC-006 |
| Q-7 | SC-007, SC-016 |
| Q-8 | SC-008 |
| Q-9 | SC-009 |
| Q-10 | SC-009a |
| Q-11 | SC-010 |
| Q-12 | SC-010 |
| Q-13 | SC-011 |
| Q-14 | SC-012 |
| Q-15 | SC-013 |
| Q-16 | SC-015 |
| Q-17 | SC-013, SC-023 |
| Q-18 | SC-013 |
| Q-19 | SC-001 (end-to-end) |
| Q-20 | SC-003 (end-to-end) |
| Q-21 | SC-004 (end-to-end) |
| Q-22 | SC-011 (end-to-end) |
| Q-23 | SC-012 (end-to-end) |
| Q-24 | SC-024 |

SC-014 (path-traversal rejection) is covered by Q-15's path-traversal scenario.
SC-017 (token-saving observability) is covered by a handler test that records response payload size and compares against a published threshold.
SC-018 (no public-surface drift on existing tools) is covered by the FR-018 baseline drift detector.
SC-019 (documentation completeness) is covered by `docs/tools/links.md` plus a registration test asserting the doc structure.
SC-020 (≥20 regression tests) is covered by the 51-test inventory in [data-model.md](./data-model.md) (18 schema / 28 handler / 5 registration).
SC-021 (zero new error codes) is verified by `grep` over `src/errors.ts` plus inspection of every `UpstreamError` construction in this BI's source.
SC-022 (18 live-CLI cases documented) is verified by [research.md](./research.md) F1..F14 plus the T0 deferrals enumerated in research § Cases deferred to T0.
SC-023 (data-passing structural verification) is covered by Q-17.
