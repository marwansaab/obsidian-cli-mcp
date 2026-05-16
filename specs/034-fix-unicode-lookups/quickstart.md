# Quickstart: Fix Unicode Lookups — manual T0 live-CLI probes

**Branch**: `034-fix-unicode-lookups` | **Date**: 2026-05-17 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

This file is the **manual verification script** for the live-CLI side of this BI. Unit tests with mocked `invokeCli` cover the deterministic decoder-fix behaviour; this script exercises the real `obsidian` binary against the real test vault to confirm the in-process unit tests' assumptions about V8 eval context and Obsidian-CLI argv encoding hold on Windows.

**Gate**: read [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) before running any probe. The authorised test vault is `C:\Marwan-Saab-ADO\Marwan at Metcash\Obsidian\TestVault-Obsidian-CLI-MCP`. Stage all new fixtures under `Sandbox/unicode/` with a unique-per-run prefix and clean them up after the run.

## Prerequisites

- `obsidian.exe` at `C:\Program Files\Obsidian\obsidian.exe` (verify with `obsidian --version`).
- Test vault path readable.
- Existing fixtures at `…\TestVault-Obsidian-CLI-MCP\Fixtures\BI-038\`:
  - `tc-108-roundtrip-5kb.md` (em-dash in H1).
  - `tc-mojibake-fbp.md` (frontmatter `unicode_marker: "café — naïve"`).
- New fixtures (staged at task T0-prep — see `tasks.md`):
  - `Sandbox/unicode/non-ascii-key.md` — frontmatter property with non-ASCII KEY (e.g. `café_key: value`).
  - `Sandbox/unicode/non-ascii-folder/note.md` — a note inside a folder whose name is non-ASCII.
  - `Sandbox/unicode/non-ascii-tag.md` — a note carrying a non-ASCII tag.
  - `Sandbox/unicode/non-ascii-link.md` + `Sandbox/unicode/café-target.md` — a note containing a wikilink whose target name is non-ASCII.

## Probes

Each probe runs in three stages: **A** (verbatim CLI invocation to confirm wire shape), **B** (Node-side via the built `dist/index.js` to confirm the MCP layer wraps it correctly), and **C** (ASCII-regression probe against the same tool to confirm the fix doesn't break the existing happy path). The C-stage uses a pure-ASCII fixture or the same fixture with an ASCII identifier.

Run after `npm run build` succeeds.

### Probe 1: `read_heading` against em-dash H1

**A — direct CLI** (verifies what stdout looks like):

```powershell
obsidian eval --vault "TestVault-Obsidian-CLI-MCP" --code "(()=>{const a={active:false,path:'Fixtures/BI-038/tc-108-roundtrip-5kb.md',segments:['TC-108 Round Trip Fixture — 5 KB']};const fc=app.metadataCache.fileCache[a.path];const mc=app.metadataCache.metadataCache[fc.hash];return JSON.stringify({headings:(mc.headings||[]).map(h=>h.heading)});})()"
```

Expected: stdout contains the heading `"TC-108 Round Trip Fixture — 5 KB"` with the em-dash intact (this isolates the metadataCache UTF-8 round-trip from the decode bug).

**B — MCP via dist** (the actual fix's end-to-end behaviour):

Invoke the `read_heading` tool with input:
```json
{ "target_mode": "specific", "vault": "TestVault-Obsidian-CLI-MCP", "path": "Fixtures/BI-038/tc-108-roundtrip-5kb.md", "heading": "TC-108 Round Trip Fixture — 5 KB" }
```

Expected (post-fix): response body starts with whatever follows the heading line in the fixture.
Expected (pre-fix, for comparison): error envelope `code: "CLI_REPORTED_ERROR"` with detail mentioning `HEADING_NOT_FOUND`.

**C — ASCII regression**: invoke `read_heading` with `heading: "TC-108"` against any fixture that has an ASCII-only heading containing `TC-108` literally. Expected: success, body returned. If this fails, the fix broke ASCII — STOP and investigate.

### Probe 2: `find_by_property` against non-ASCII frontmatter value

**A — direct CLI**: skipped (the eval template is the unit-of-test, not a sub-probe).

**B — MCP via dist**:

Input:
```json
{ "target_mode": "specific", "vault": "TestVault-Obsidian-CLI-MCP", "property": "unicode_marker", "value": "café — naïve" }
```

Expected (post-fix): `{ count: 1, paths: ["Fixtures/BI-038/tc-mojibake-fbp.md"] }`.
Expected (pre-fix): `{ count: 0, paths: [] }`.

**C — ASCII regression**: invoke `find_by_property` with `property: "type"`, `value: "fixture"` (an ASCII value present in tc-108-roundtrip-5kb.md's frontmatter). Expected: `count >= 1`, the tc-108 path present.

### Probe 3: `read_property` against non-ASCII property NAME

**Predicted outcome per research.md §2**: `read_property` is unaffected by the atob defect. The probe verifies the prediction. If it fails, escalate per research.md §2.3.

**Pre-stage**: write `Sandbox/unicode/non-ascii-key.md`:
```markdown
---
café_key: value-here
title: non-ASCII key probe
---

# Body
```

**B — MCP via dist**:

Input:
```json
{ "target_mode": "specific", "vault": "TestVault-Obsidian-CLI-MCP", "path": "Sandbox/unicode/non-ascii-key.md", "name": "café_key" }
```

Expected (predicted): `{ value: "value-here", type: "text" }`.
Failure mode to investigate: `{ value: null, type: "unknown" }` would mean read_property DOES exhibit a Unicode defect via a path other than atob. Per research.md §2.3, halt and investigate.

**C — ASCII regression**: invoke `read_property` against `name: "title"` on the same fixture. Expected: `{ value: "non-ASCII key probe", type: "text" }`.

### Probe 4: `paths` against non-ASCII folder input

**Pre-stage**: ensure `Sandbox/unicode/cafés/inner-note.md` exists.

**B — MCP via dist**:

Input:
```json
{ "target_mode": "specific", "vault": "TestVault-Obsidian-CLI-MCP", "folder": "Sandbox/unicode/cafés", "depth": 1 }
```

Expected (post-fix): the response includes `Sandbox/unicode/cafés/inner-note.md` (or equivalent depending on `paths`' output shape).
Expected (pre-fix): empty or wrong result depending on what mojibake `a.folder` resolves to.

**C — ASCII regression**: same call with `folder: "Sandbox"`. Expected: non-empty result.

### Probe 5: `links` (list_links) against non-ASCII link target

**Pre-stage**: write two files:
- `Sandbox/unicode/café-target.md` (empty body).
- `Sandbox/unicode/links-from.md` with body `[[café-target]]`.

**B — MCP via dist**:

Input:
```json
{ "target_mode": "specific", "vault": "TestVault-Obsidian-CLI-MCP", "path": "Sandbox/unicode/links-from.md" }
```

Expected (post-fix): the response's links list contains an entry resolving to `café-target.md`.

**C — ASCII regression**: invoke against a file with only ASCII wikilinks. Expected: non-empty result.

### Probe 6: `tag` (list_tagged_files) against non-ASCII tag

**Pre-stage**: write `Sandbox/unicode/tagged.md` with frontmatter `tags: [café-tag]`.

**B — MCP via dist**:

Input:
```json
{ "target_mode": "specific", "vault": "TestVault-Obsidian-CLI-MCP", "query": "café-tag" }
```

Expected (post-fix): the response includes `Sandbox/unicode/tagged.md`.

**C — ASCII regression**: invoke with an ASCII tag known to exist in the vault. Expected: non-empty result.

### Probe 7: `smart_connections_*` — SKIPPED at T0

Per [research.md §7.2](research.md), the test vault is intentionally plugin-free; installing Smart Connections to run a live probe violates the vault's invariant. The decoder fix is verified at the unit-test level (mocked `invokeCli`); the live-CLI probe adds nothing. If a Smart Connections-equipped vault becomes available in a future BI, retroactively add a probe to that BI's quickstart.

## Cleanup

After all probes complete, remove any fixtures created under `Sandbox/unicode/` so the Sandbox area returns to its pre-run state (per `.memory/test-execution-instructions.md`). Do NOT delete the pre-existing `Fixtures/BI-038/` fixtures — those are shipped under spec branch `016-reliable-writer` and persist across sessions.

## Reporting

Record per-probe pass/fail in the BI's `tasks.md` T0 row. If any probe fails unexpectedly:

- If a B-stage probe fails post-fix: the fix is incomplete or applied incorrectly. Investigate before merging.
- If a C-stage ASCII regression fails: STOP. The fix broke an existing happy path. Revert and re-investigate the decode expression.
- If Probe 3 (read_property) fails post-fix: read_property has a non-atob Unicode defect path. Expand BI scope per research.md §2.3.
