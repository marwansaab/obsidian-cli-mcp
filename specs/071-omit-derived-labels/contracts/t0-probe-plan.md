# T0 probe plan: Omit Derived Labels

**Feature**: [../spec.md](../spec.md) | **Evidence so far**: [t0-cache-shapes.json](t0-cache-shapes.json) (plan-time, 2026-10-31)

Every probe follows `.memory/test-execution-instructions.md`: vault `TestVault-Obsidian-CLI-MCP`, fixtures under `Sandbox/` with a per-run name, `Obsidian.com` (bare `obsidian`) only, `vault=` passed explicitly, fixtures removed afterwards, and `Welcome.md` left untouched. All probes are read-only apart from seeding and removing their own fixture.

## G0 — plan-time cache dump (done)

The cache entries for 27 source shapes were recorded in [t0-cache-shapes.json](t0-cache-shapes.json) and summarised in [../research.md](../research.md) (T0 evidence, F1–F4). This probe drove D1 and Clarifications Q3/Q4.

## G1 — alias trimming (implement-time, before coding)

**Question**: Does Obsidian trim leading and trailing spaces off a non-blank alias (`[[Tgt#Head|  Padded  ]]`)?

**Probe**: Dump `original` and `displayText` for that shape, plus the same shape on a plain link (`[[Tgt|  Padded  ]]`).

**Effect**: None on the rule (D1 emits the cache value). Whatever comes back, record the trimmed or untrimmed result in `research.md` and in the help-page row, so that "carries that alias" is stated exactly. **Fallback**: none needed.

## G2 — end-to-end through the built tool (implement-time, after coding)

**Probe**: `npm run build`, then call `links` through `dist/index.js` (or the MCP inspector) on a fixture holding the data-model rows 1–27. Use one note with those rows in the body and in frontmatter (`related: "[[Tgt#Head]]"`, a list property with an aliased fragment link).

**Pass**: Every row's emitted `displayText` matches [../data-model.md](../data-model.md); `count` with `total: true` equals the default-mode entry count; `target`/`line`/`kind` match a pre-change run on the same fixture (capture that before switching to the new build).

**Fallback**: If any row differs because a cache shape differs from G0 (for example an Obsidian update), stop, record the new shape, and re-run `/speckit-clarify` for the affected row before shipping.

## G3 — frontmatter list property with an alias (implement-time)

**Question**: Does a frontmatter list item `- "[[Tgt#Head|Fm Alias]]"` keep `|` in `original` and give `displayText: "Fm Alias"`?

**Effect**: Confirms D2 for aliased frontmatter links (G0 covered only the unaliased case). **Fallback**: If `original` lacks `|` for aliased frontmatter links, D1 would drop a real alias. In that case, fall back to the old rule for frontmatter entries that already pass `displayText !== link`, record the deviation, and raise it with the owner.
