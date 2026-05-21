# Probe evidence — `backlinks` cross-folder reach (Story 7)

**Probe date**: 2026-05-21
**Binary version**: Obsidian CLI 1.12.7 (matches T001 anchor)
**Vault**: `TestVault-Obsidian-CLI-MCP`
**Contract**: [contracts/backlinks-cross-folder-caveat.md](backlinks-cross-folder-caveat.md)

## Fixture

```text
Sandbox/042-cf/notes/bi042-xfolder-target.md          (target; basename "bi042-xfolder-target" is vault-unique)
Sandbox/042-cf/notes/local/source-a.md                (source — same parent folder as target)
Sandbox/042-cf/other/source-b.md                      (source — different folder from target)
```

Both sources carry `[[bi042-xfolder-target]]` (bare-basename wikilink, no folder prefix).

## Probe payload

The probe ran via `obsidian vault=TestVault-Obsidian-CLI-MCP eval code=<JS-payload>` against the wrapper-mirror eval template logic (`app.metadataCache.getBacklinksForFile(file)` + `.keys()`).

## Wire response

```jsonc
{
  "target": "Sandbox/042-cf/notes/bi042-xfolder-target.md",
  "backlinkKeyCount": 2,
  "backlinkKeys": [
    "Sandbox/042-cf/notes/local/source-a.md",
    "Sandbox/042-cf/other/source-b.md"
  ],
  "source_a_resolved": { "Sandbox/042-cf/notes/bi042-xfolder-target.md": 1 },
  "source_b_resolved": { "Sandbox/042-cf/notes/bi042-xfolder-target.md": 1 }
}
```

## Finding

Both cross-folder sources appear in the backlinks list — the wrapper does NOT folder-scope the source set. Obsidian's underlying wikilink resolver is vault-scoped, not folder-scoped, when the target basename is unique vault-wide.

## Adjacent finding — basename collision (case-insensitive resolver)

An earlier iteration of the probe used basename `target`, which was not unique vault-wide (the existing `Fixtures/BI-0015/Target.md` collided with the fixture's `Sandbox/042-cf/notes/target.md` after Obsidian's case-insensitive folding). Obsidian's resolver picked a single canonical destination (`Fixtures/BI-0015/Target.md`) for the bare-basename wikilink, and the fixture's `Sandbox/042-cf/notes/target.md` received zero backlinks. The cross-folder reach behaviour is **gated on basename uniqueness vault-wide** (case-insensitive). Sources whose wikilink basename resolves to a different canonical destination do NOT appear in the target's backlinks list.

This adjacent finding is documented inline in the caveat text so agents do not misinterpret a zero-backlink response as a cross-folder reach limitation when basename collisions are the actual cause.

## Cleanup

Fixtures under `Sandbox/042-cf/` should be deleted after Story 7 ships and the audit-pass-record artefact records the closure. Per the test-execution memory, leaving Sandbox empty after a probe run is the project default.
