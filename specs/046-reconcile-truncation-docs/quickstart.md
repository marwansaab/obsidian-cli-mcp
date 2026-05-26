# Quickstart — Reconcile Truncation Docs (BI-046)

**Feature**: 046-reconcile-truncation-docs
**Audience**: implementer running `/speckit-implement`; also a future reader who wants to re-verify the corrected docs against their own vault.

## What this BI ships

Two text corrections in `docs/tools/search.md` and `docs/tools/context_search.md`, one new mirror file under `specs/046-reconcile-truncation-docs/contracts/`, one single-line insertion in the BI-042 evidence file. No runtime code touched. No tests added.

## Pre-flight (read first)

1. Read [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md) — names the authorised test vault, the scratch subdirectory, and the destructive-probe protocol. The FR-012 probe gate produces real CLI invocations against a real vault and falls under this gate.
2. Verify the wrapper is on `v0.7.1` (the anchor pin per spec Q3 and FR-012). Run `npm run --silent version` from repo root or read `package.json` `version`. If the working copy is NOT `v0.7.1`, STOP — either bump the working copy to `v0.7.1` or rewrite the FR-012 anchor in `spec.md` Q4 + `research.md` Decision 3 + `data-model.md` Entity 2a's `version_triple.wrapper` constraint, then re-run `/speckit-plan`.
3. Confirm `[[TC-00306]]` (search) and `[[TC-00328]]` (context_search) exist as canonical TC pages in the user's external test tracker. The mirror file back-links to both per FR-007.

## Step-by-step walkthrough (implementer / `/speckit-implement`)

### Step 1 — Run the FR-012 dual-mode empirical probe

Per [research.md](research.md) Decision 3, run four probes against the BI-0011 fixture corpus with `limit: 2`:

| # | Probe | Tool invocation | Records to |
|---|---|---|---|
| P1 | search default mode | `{ "name": "search", "arguments": { "query": "<BI-0011 query>", "folder": "<BI-0011 folder>", "limit": 2 } }` | `[[TC-00306]]` (extend with v0.7.1 default-mode row) |
| P2 | search line mode | `{ "name": "search", "arguments": { "query": "<BI-0011 query>", "folder": "<BI-0011 folder>", "limit": 2, "context_lines": true } }` | `[[TC-00306]]` (extend with v0.7.1 line-mode row OR new TC) |
| P3 | context_search | `{ "name": "context_search", "arguments": { "query": "<BI-0011 query>", "folder": "<BI-0011 folder>", "limit": 2 } }` | `[[TC-00328]]` |
| P4 | backlinks parity | `{ "name": "backlinks", "arguments": { "target_mode": "specific", "vault": "<BI-0011 vault>", "path": "<BI-0011 target>", "limit": 2 } }` | local-only — confirms the cohort-divergence sentence (FR-013) is still accurate at v0.7.1 |

For each probe, capture:
- The observed visible subset (the response's `paths[]` / `matches[]` / `backlinks[]` in response order).
- The engine pre-sort response, IF observable (re-run with `limit` ≥ full result set to see the un-sliced engine order).
- The full sorted result set (re-run with `limit` ≥ full result set, then sort by `path asc, line asc` for search/context_search; `source` UTF-16 asc for backlinks).
- The version triple per [data-model.md](data-model.md) Entity 2a.

### Step 2 — Lock the `search.md` doc structure per FR-012 outcome

- If P1 and P2 produce matching findings → `search.md` truncation section is a single block with explicit "applies to both default and line mode" sentence.
- If P1 and P2 diverge → `search.md` truncation section splits into per-mode subsections, each with its own inline anchor (Entity 1 per [data-model.md](data-model.md)) and its own pointer into the mirror file.

Validate P3 against the assumed `context_search` divergence; validate P4 against the FR-008 + FR-013 assumption that `backlinks` still slices leading-of-sorted-set. If P3 or P4 contradict the assumption, STOP and escalate per [research.md](research.md) Decision 3 outcome table.

### Step 3 — Populate the mirror file

Create `specs/046-reconcile-truncation-docs/contracts/truncation-direction-evidence.md` per [data-model.md](data-model.md) Entity 2 (header + per-probe rows + per-tool summary). Mirror discipline: every field MUST appear on the corresponding TC page; do not introduce facts in the mirror that aren't TC-sourced.

### Step 4 — Correct `docs/tools/search.md`

Replace the `### Truncation slice direction (BI-042 reconciliation)` section per FR-001..FR-003, FR-011, FR-013:

- Drop the "FIRST `<cap>` entries of the sorted result set / leading subset" claim.
- Drop the "uniform across the cohort" sentence.
- Drop the BI-042 evidence-link citation (FR-011 / Q2 mechanics).
- Write the per-tool description: engine pre-sort response → leading slice within that pre-sort → wrapper output-sort applied to the slice. Name the engine's natural sort order. Name the slice direction within the pre-sort.
- Add the inline anchor (Entity 1 per data-model.md).
- Add the cohort-divergence sentence (Entity 4 per data-model.md) — names `backlinks` by name, NO forward-pointer to runtime BI.
- Rename the section heading: drop "(BI-042 reconciliation)" suffix, replace with "(BI-046 reconciliation)" or equivalent.

### Step 5 — Correct `docs/tools/context_search.md`

Mirror Step 4 for `context_search.md` per FR-004..FR-006, FR-011, FR-013. Per-tool prose; no cross-doc "see search.md" shortcut.

### Step 6 — Insert the BI-042 forward-pointer

Insert one line at the top of `specs/042-close-audit-findings/contracts/truncation-direction-evidence.md` per FR-011 / Entity 3:

```markdown
> **Superseded by BI-046 for `search` and `context_search`** — current truth at [contracts/truncation-direction-evidence.md](../../046-reconcile-truncation-docs/contracts/truncation-direction-evidence.md). The `backlinks` row below remains current.
```

Exact prose to be finalized at implement time; the structural commitment is one line, top of file (after the H1), with the `backlinks`-row-still-current caveat per data-model Entity 3 validation rule.

### Step 7 — Verify `docs/tools/backlinks.md` is byte-identical

Per FR-008, run `git diff docs/tools/backlinks.md` → expect zero output. If the file shows any change (including whitespace normalisation by an editor), revert it. The cohort-uniformity sentence inside `backlinks.md` is deliberately left in place per the spec's explicit out-of-scope decision.

### Step 8 — Cross-entity invariant checks

Per [data-model.md](data-model.md) "Cross-entity invariants" section:
- Mirror-pointer reciprocity (Entity 1 ↔ Entity 2): each inline anchor's `mirror_pointer` resolves to the mirror file.
- Forward-pointer reciprocity (Entity 3 ↔ Entity 2): the BI-042 forward-pointer and the BI-046 mirror file `superseded_artifact` field name each other.
- TC back-link liveness: `[[TC-00306]]` and `[[TC-00328]]` exist as TC pages and contain the same data the mirror file records.
- Version-triple consistency: `package.json` version === `v0.7.1` === mirror file `version_triple.wrapper`.

## Re-verification (future reader / cloner without vault access)

A reader who wants to verify the corrected docs against the current shipped version:

1. Clone the wrapper repo.
2. Read the inline anchor in `docs/tools/search.md` / `docs/tools/context_search.md` — get the capture date and observed visible subset.
3. Follow the `mirror_pointer` to `specs/046-reconcile-truncation-docs/contracts/truncation-direction-evidence.md` — get the version triple, the full sorted result set, the TC back-links.
4. **If the reader has vault access**: follow `[[TC-00306]]` / `[[TC-00328]]` to the canonical TC pages for the full execution log. The TC pages are the source of truth.
5. **If the reader does NOT have vault access**: the mirror file is the offline reproducibility surface. Run the probes per Step 1 above against your own vault (the BI-0011 fixture is described on the TC pages; cloners without vault access may need to construct a near-equivalent fixture and report the differences in their own observation).

## Quality gates (per Constitution + `.specify/extensions.yml`)

| Gate | Status for this BI |
|------|-------------------|
| `npm run lint` | passes — no code touched |
| `npm run typecheck` | passes — no code touched |
| `npm run build` | passes — no code touched |
| Vitest suite | passes — no test additions, no code touched |
| Coverage threshold | unaffected — no code touched |
| Constitution Compliance checklist | all N/A (docs-only PR per constitution prose at `:440-446`) |
| `/speckit-analyze` (post-implement) | run before BI marks complete; check no new error-code nodes via `/graphify --update` per `CLAUDE.md` discipline; verify the mirror file lands in a new BI-046 community and is not orphaned |

## Done criteria (the 5 SCs from spec.md)

- **SC-001**: 0 truncation-section claims about the visible subset in `search.md` and `context_search.md` are empirically false on `v0.7.1`.
- **SC-002**: Re-running the probes per Step 1 reproduces the inline-anchor-described behaviour.
- **SC-003**: `git diff docs/tools/backlinks.md` is empty.
- **SC-004**: Diff scope is bounded to the four paths in `plan.md` "Touched paths" — zero runtime / src / test files.
- **SC-005**: An agent following the corrected truncation section picks a correct narrowing strategy on the first attempt (validated against the inline anchor's stated visible subset shape).
