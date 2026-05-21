# Research: Close Audit Findings

**Branch**: `042-close-audit-findings` | **Date**: 2026-05-21 | **Plan**: [plan.md](plan.md)

## Method note

This BI is a closing-pass reconciliation. Six of the eight stories produce documentation-only edits anchored on existing code state plus empirical probes against the authorised test vault per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md). One story (Story 4) is a runtime change: a single `details.reason` value addition on an existing `(VALIDATION_ERROR, INVALID_SUBFOLDER)` pair via the ADR-015 sub-discriminator pattern. Story 8 is a maintainer-run verification — no in-repo artefact.

Probe protocol applies per `.memory/`: all T0 probes here are read-side, non-mutating, against the authorised test vault scratch subdirectory. No destructive-probe rituals required; standard cleanup.

---

## Task 1 — `read_property` malformed-frontmatter spec/help-doc reconciliation target shape

**Decision**: `specs/013-read-property/spec.md` acceptance scenario 9 (US1 line 35) — currently reads "Given a note whose frontmatter block is malformed (for example missing the closing `---` fence), When the agent reads any property, Then the call fails with a structured error." — is rewritten to match the live wire shape captured by BI-041's T0 probe T005: `{ value: null, type: "unknown" }`, no error. The rendered help-doc at `docs/tools/read_property.md` already reflects the empty-value+unknown shape after BI-041; the deliverable here is the feature-spec retirement only, with a one-line cross-reference to the BI-041 Complexity Tracking entry that authorised the shape under Principle IV's intentional-best-effort-continue clause.

**Rationale**:
- BI-041's plan.md (Complexity Tracking entry, line 180) captured the live shape: `{ value: null, type: "unknown" }`. The wrapper short-circuits at `src/tools/read_property/handler.ts:56-58` when the upstream emits the conflated sentinel `"No frontmatter found.\n"` for both malformed and absent-frontmatter inputs.
- BI-041 landed the help-doc surface (`docs/tools/read_property.md`) but did NOT touch the predecessor feature spec at `specs/013-read-property/spec.md`. The spec is the surviving source of the contradictory "structured error" claim. Retiring it closes the loop.
- The cross-reference to BI-041 preserves the auditability of the Principle IV decision — a future reader can trace why the wrapper does not surface a typed error for the malformed case.

**Alternatives considered**:
- *Runtime fix to emit a typed UpstreamError for malformed YAML* — REJECTED, identical reasoning to BI-041 Out-of-Scope: this BI is documentation reconciliation + one labelling change; broadening to a runtime fix breaks the closing-pass discipline (SC-005).
- *Add a clarifying note to AC9 instead of rewriting it* — REJECTED: a note next to a contradictory statement preserves the very ambiguity the user-story claims to eliminate. Replace, do not annotate.

**Empirical anchor**: BI-041 T0 probe T005 (recorded in `specs/041-reconcile-cohort-doc-drift/plan.md:180`). No new probe required — the BI-041 evidence is current as of 2026-05-21.

---

## Task 2 — `properties` dedup contract retirement target shape

**Decision**: `specs/024-list-properties/spec.md` is edited to:
1. Remove any functional requirement that promises case-sensitive dedup of property names.
2. Name the upstream's case-insensitive collapse rule as the authoritative dedup contract.
3. Either delete the byte-order tiebreak rule, or label it explicitly as structurally unobservable with rationale that upstream collapses the inputs the tiebreak was designed to disambiguate.

The help-doc at `docs/tools/properties.md` already describes the case-insensitive collapse after BI-041; the schema `.describe()` text in `src/tools/properties/schema.ts` is also aligned. The deliverable here is feature-spec retirement only.

**Rationale**:
- BI-041 plan §Phase-1 (`docs/tools/properties.md` touched, `src/tools/properties/schema.ts` `.describe()` updated) landed the doc surface. The spec at `specs/024-list-properties/spec.md` was not part of that BI's touched-file set.
- The byte-tiebreak is dead code at the contract layer because upstream collapses the only inputs that would surface a tiebreak choice; the runtime wrapper carries no tiebreak logic of its own.
- Empirical anchor (probe): fixture vault with two notes carrying `AaTest: 1` and `aatest: 2`; invoking `properties` returns a single entry with `noteCount: 2`. Already verified during BI-041 (Quickstart step verified case-variant collapse).

**Alternatives considered**:
- *Retain the case-sensitive contract and document the upstream collapse as a known-deviation* — REJECTED at BI-041 plan time and reaffirmed here: the published contract IS the wrapper's contract; carrying an aspirational contract diverged from the live behaviour is exactly the drift this BI closes.
- *Delete `specs/024-list-properties` outright (since the help-doc is the authoritative artefact)* — REJECTED: the spec file is the audit's reference for the typed-tool surface and is grepped by the Spec Kit workflow. It must be kept and reconciled.

**Empirical anchor**: BI-041 quickstart properties case-variant probe (carried forward; see `specs/041-reconcile-cohort-doc-drift/quickstart.md` "Verify properties case-insensitive collapse"). No new probe required.

---

## Task 3 — `vault=` cohort empirical enumeration + per-tool reconciliation

**Decision**: The cohort enumeration for FR-007 is settled by **walking the live `docs/tools/*.md` corpus for tools that carry either of the two "vault= is honoured-as-noop / functionally ignored" phrasings**. Empirical anchor confirms each tool's claim. Per-tool reconciliation follows the FR-009 / FR-010 branch logic.

**Cohort enumeration as of 2026-05-21** (results of `grep -i "vault.*honour\|vault.*honor\|vault.*no-op\|vault.*noop\|vault.*ignored" docs/tools/`):

| Tool | Current framing | Code path | Reconciliation expectation |
|---|---|---|---|
| `outline` | "silently honoured-as-noop" (docs:260) | native CLI subcommand | T0 probe required |
| `properties` | "silently honoured-as-noop" (docs:36, 304) | native CLI subcommand | T0 probe required |
| `files` | "silently honoured-as-noop" (per BI-019 + cross-reference in `backlinks.md:330`) | native CLI subcommand | T0 probe required |
| `read_heading` | "functionally ignored by eval" (docs:34, 129) | eval-composed | T0 probe required |
| `set_property` | "functionally ignored by eval" (docs:179, 458) | eval-composed | T0 probe required |

Plus the **four tools added by F1 finding**. The F1 finding itself is referenced opaquely in the feature spec (the spec author's framing acknowledges this); it is not a checked-in artefact. The four tools are enumerated by extending the same grep to docs whose error-roster or active-mode section claims the vault parameter is unused/silent without using the canonical phrases captured above. As of the cohort walk completed during this Phase 0, the F1 additions are inferable from the eval-composed tool surface (per the wrapper's eval-template convention where vault= is never substituted into the template):

| F1-added tool | Code path | Reconciliation expectation |
|---|---|---|
| `find_by_property` | eval-composed | T0 probe required |
| `backlinks` | eval-composed BUT with 011-R5 unknown-vault reclassification (per docs:330) | already empirically reconciled — anchor with date+version |
| `read_property` | eval-composed | T0 probe required |
| `tag` | eval-composed | T0 probe required |

NOTE: `backlinks` is in the F1 set as a control — its docs already correctly state that the eval path DOES surface `VAULT_NOT_FOUND` via the response-inspection clause (so the "silently honoured-as-noop" framing was never applied to backlinks). The reconciliation here is to add an empirical-anchor date+version to that existing correct statement so the audit re-run has a re-verification target per FR-010.

**Per-tool reconciliation branches** (FR-009 / FR-010):
- **Branch A — parameter empirically honoured** (focused vs unfocused responses differ): retire every "silently honoured-as-noop" / "functionally ignored" phrasing in the tool's help-doc AND in any predecessor feature spec; replace with the empirical surface ("the parameter is honoured by upstream; unknown vault names surface as a structured error" or analogous wording for the eval-composed path).
- **Branch B — parameter empirically silent-noop confirmed** (focused vs unfocused responses identical valid responses, NOT identical errors): preserve the framing; append an empirical-anchor note `(empirical anchor: 2026-05-21, obsidian-cli v<X.Y.Z>)` immediately after each occurrence so the next audit cycle has a re-verification target.

**Probe protocol** (FR-008 / FR-011, the false-positive discriminator):
For each cohort tool, the T0 probe runs three invocations:
1. **A** — invoke with `vault=<focused vault name>` (or no vault for active-mode tools) against a fixture present in the focused vault.
2. **B** — invoke with `vault=<an unfocused vault name registered in the binary's vault registry>` against the same fixture name, where the fixture is present ONLY in the unfocused vault.
3. **C** — invoke with `vault=<NONEXISTENT_VAULT_NAME>` (unregistered display name) against the same fixture name.

Classification:
- If A and B return different non-error payloads → **Branch A confirmed** (parameter honoured; the binary actually picked up the unfocused vault's content).
- If A and B return identical non-error payloads AND the payloads are valid (not the empty/error shape) → **Branch B confirmed** (parameter ignored; the binary served the focused vault's content regardless).
- If A and B return identical error responses (any shape) → **classification deferred** — the binary errored on both; the probe must use a fixture that exists in the focused vault before classifying.
- C is the control: if C surfaces a structured `VAULT_NOT_FOUND`-class error (or analogous for eval path), the tool is on the eval surface with the 011-R5 reclassification; the framing is "honoured + structured error on unknown vault." If C surfaces the same payload as A, the tool is on the silently-honoured-noop path.

**Rationale**:
- The grep-walk + F1 inference is the minimum-blast-radius cohort enumeration that does not require an out-of-repo artefact. It is reproducible.
- The three-invocation probe (A vs B vs C) is the exact discriminator the spec's Edge Case "identical response for the wrong reason" demands. C provides the unknown-vault structural-error baseline that distinguishes the eval-reclassification path from the silent-noop path.
- Anchoring with date+version on Branch B preserves the framing while making the next audit cycle's re-verification a one-line lookup, not a re-derivation.

**Alternatives considered**:
- *Ask the user to enumerate the F1 cohort directly* — REJECTED: the user's spec assumption section explicitly defers the enumeration to spec-author/research walk (this BI's research artefact is the right place).
- *Treat all eval-composed tools as "silently honoured-as-noop"* — REJECTED: `backlinks` is the existence proof that the eval surface can also produce the response-inspection reclassification; the probe is the only way to discriminate.
- *Use a single fixture present in both vaults and check whether the response differs* — REJECTED: this collapses the false-positive case (the binary might error on both vaults for an unrelated reason and produce identical error payloads). The B-vs-C control is necessary.

**Empirical anchor**: T0 probes per cohort tool, run during `/speckit-implement` Phase 2. Probe records persisted to `contracts/vault-probe-evidence.md` (FR-008).

---

## Task 4 — `find_and_replace` symmetric sub-discriminator runtime change target

**Decision**: Add `reason: "not-found"` to the `details` payload of the existing ENOENT-on-subfolder rejection branch at `src/tools/find_and_replace/handler.ts:512-523`, so the envelope becomes `details: { code: "INVALID_SUBFOLDER", reason: "not-found", subfolder, vault }`. This makes the envelope shape symmetric with the existing path-traversal-shape rejection branch at `src/tools/find_and_replace/index.ts:82-89` which sets `details: { code: "INVALID_SUBFOLDER", reason: "path-traversal", subfolder, vault }` (after Zod-issue mapping). The runtime change is a single-line `details` payload edit; no parent error code change, no schema change, no new top-level error code.

**Rationale**:
- The existing path-traversal-shape branch is the ADR-015-canonical sub-discriminator pattern: `(top-level VALIDATION_ERROR, details.code INVALID_SUBFOLDER, details.reason "path-traversal")`. The schema's `superRefine` at `src/tools/find_and_replace/schema.ts:48` sets `params: { subCode: "INVALID_SUBFOLDER", subReason: "path-traversal" }`; the registration code at `index.ts:82-89` maps these to the `details` payload.
- The ENOENT branch at `handler.ts:512-523` constructs the same `(top-level, details.code)` pair but omits `details.reason` entirely. The existing test at `handler.test.ts:720` explicitly asserts the absence: `it("ENOENT on subfolder realpath → VALIDATION_ERROR/INVALID_SUBFOLDER (no path-traversal reason)", …)`. This is the audit finding the spec closes.
- The chosen sub-discriminator value `"not-found"` is short, agent-recognisable, and contrasts cleanly with `"path-traversal"`: one means "subfolder shape is unsafe", the other means "subfolder shape is safe but the resolved path does not exist on disk." The naming matches the project's existing `details.reason` convention (single-token-or-short-hyphenated phrase per `index.ts:1` comment listing reasons `empty / too-long / regex-syntax / path-traversal`).
- Per ADR-015 § "When to add a new sub-state": adding a new `details.reason` value to an existing `(top-level-code, details.code)` pair is the canonical path for finer-grained agent-actionable signal. The Constitution Compliance row for ADR-015 is **Y** (this BI introduces a new sub-state to an existing pair).
- Per ADR-015 § "No new top-level codes": preserved. The zero-new-top-level-codes streak (per BI-041 plan §Constraints) is preserved by construction — `VALIDATION_ERROR` and `INVALID_SUBFOLDER` are pre-existing.

**Alternatives considered**:
- *Use `"missing"` instead of `"not-found"`* — REJECTED on tie-break: both are correct; `"not-found"` aligns more directly with the existing test fixture's `ENOENT` errno semantics and with the error message text at `handler.ts:521` (`subfolder "${subfolder}" does not exist in vault`). `"missing"` is acceptable as a synonym but adds one token; `"not-found"` is the chosen short form.
- *Use `"enoent"` directly* — REJECTED: that exposes a Node.js-implementation-detail at the wire boundary. The wrapper's other `details.reason` values are semantic (`"path-traversal"`, `"empty"`, etc.), not platform-coded.
- *Introduce a new `(top-level-code, details.code)` pair like `(VALIDATION_ERROR, MISSING_SUBFOLDER)` instead of adding a sub-state* — REJECTED: violates the principle of minimum surface change; the path-traversal-shape and missing-subfolder branches both fail the same input field (`subfolder`) with the same agent recovery pattern (correct the path); the sub-discriminator is the right axis of distinction, not a new parent code. ADR-015's whole point is to avoid this pattern.
- *Update the existing test to assert the new shape and add no new test* — Partial REJECTION: the existing test MUST update (it currently asserts absence of `reason`). Additionally, a NEW symmetry-assertion test is added asserting that BOTH `handler.test.ts` (ENOENT branch) and `index.test.ts` (path-traversal branch) produce envelopes with the same `details.reason` field shape (present, string-typed). The symmetry test discharges FR-013 (Constitution Principle II).

**Empirical anchor**: Existing unit tests at `src/tools/find_and_replace/handler.test.ts:720-733` and `src/tools/find_and_replace/index.test.ts:134-148` are the regression coverage. The change updates handler.test.ts:720 (assertion flip) and adds the symmetry test. No live-CLI probe required — the rejection branches are wrapper-side validation paths, not CLI-dispatch paths.

---

## Task 5 — Dual validation envelope acknowledgement cohort enumeration

**Decision**: The cohort of typed tools whose schema includes a field-level numeric or length constraint that can reject at the boundary is enumerated by walking each tool's `schema.ts` for any of `z.string().min(`, `z.string().max(`, `z.number().min(`, `z.number().max(`, `z.array(…).max(`, or `z.number().int().nonnegative(`/`positive(`/etc., AND verifying the constraint rejects at the input layer (not solely on output validation). The cohort per the spec FR-016 enumeration includes:

- `search` — `query.min(1).max(N)` plus folder length constraints
- `context_search` — same family as `search`
- `pattern_search` — pattern length constraint
- `find_and_replace` — pattern/replacement length constraints (PATTERN_MAX=1000, REPLACEMENT_MAX=1000 per schema.ts:6-7); subfolder shape constraint
- `find_by_property` — value-array length constraint
- `backlinks` — folder-path length constraint
- `query_base` — base_path length constraint
- `tag` — tag-name length constraint

**Two validation envelope shapes** the cohort can produce:
1. **Wrapped envelope** (`UpstreamError` with `code: "VALIDATION_ERROR"`, structured `details`) — produced when the rejecting validation is reached by the wrapper's own zod parse inside the registered handler. The shape carries `details.code` / `details.reason` per ADR-015 where applicable.
2. **MCP transport error envelope** (JSON-RPC `-32602` Invalid Params, with the rich zod-issue body) — produced when an MCP client that forwards the raw `inputSchema` rejection path (e.g., MCP Inspector, strict-rich pathway) surfaces the validation before the wrapper-side handler runs.

The roster format per tool MUST name both side-by-side with the validation rule that produces each envelope. The format is adapted from BI-041 Task 4's Cowork-vs-strict-rich pathway flag:

> **Wrapped envelope**: `VALIDATION_ERROR(<rule name>)` — produced when … (e.g., the wrapped handler sees the input post-validation, surfacing the structured details payload).
>
> **MCP transport envelope**: JSON-RPC `-32602 Invalid Params` carrying the rich zod-issue body — produced when … (e.g., the strict-rich client class surfaces the validation before the wrapper-side handler runs).

**Rationale**:
- The two envelope shapes are real and reproducible by switching between Cowork-class and strict-rich-class MCP clients against the same input. BI-041's Cowork carve-out evidence (Task 4) is the prior anchor for this asymmetry.
- The roster-format ask in FR-015 is symmetric with the BI-041 strict-rich-pathway-only carve-out flag; agents reading either roster style get the same pattern-match key.
- Per FR-017 (no documented-but-never-produced shape; no produced-but-never-documented shape), each per-tool roster must be probed against both envelope-producing rules before ship. Probe protocol: invoke each tool with an input that violates the field-level constraint via both a Cowork-class client (e.g., the running `claude-code` MCP client) and a strict-rich client (e.g., MCP Inspector); record both envelope shapes; cross-check against the roster.

**Alternatives considered**:
- *Document only the wrapped envelope and treat the MCP transport envelope as caller-class plumbing out of scope* — REJECTED: the agent writing recovery code does not know which envelope it will see until it sees one. The spec's Story 5 explicitly closes this gap.
- *Standardise the divergence into a single wrapped envelope across both paths* — REJECTED at spec time per Out-of-Scope (the wrapped envelope would lose the rich zod-issue body the MCP transport envelope carries).

**Empirical anchor**: per-tool probes against both client classes, persisted to `contracts/dual-envelope-evidence.md` (one section per tool).

---

## Task 6 — Truncation slice direction documentation cohort + cross-tool divergence call-out

**Decision**: The slice direction for each cohort tool is identified by code-read against the handler. As of 2026-05-21:

- **`search`** — LEADING subset. `src/tools/search/handler.ts:125` (per the recon grep): `const trimmed = flatExceedsCap ? flat.slice(0, appliedCap) : flat;` — `.slice(0, appliedCap)` is the **first N** of the sorted set.
- **`context_search`** — LEADING subset. `src/tools/context_search/handler.ts:147`: same `flat.slice(0, appliedCap)` pattern.
- **`backlinks`** — direction is determined by upstream `eval` (handler passthrough, see `src/tools/backlinks/handler.ts:77`). T0 probe required against a vault with > `appliedCap` backlink sources to capture the actual direction.

The doc-edit deliverable per tool is a single sentence in the output-contract section:

> When `truncated: true`, the response carries the FIRST `appliedCap` entries of the sorted result set (the leading subset). Sibling tools `<other>` use the trailing subset — agents pinning page-direction expectations across tools must check per tool.

The cross-tool divergence call-out fires when at least one cohort member differs. Per the spec assumption, the divergence is the user-stated premise; if the T0 probe shows backlinks ALSO uses leading subset, the divergence call-out is dropped and the doc text reduces to the slice-direction statement alone.

**Rationale**:
- `search` and `context_search` both use `flat.slice(0, appliedCap)` — leading subset confirmed by code read.
- `backlinks` defers to upstream — direction is opaque without an empirical probe.
- The cross-tool call-out is symmetric to the BI-041 Cowork carve-out flag and the Story 5 dual-envelope flag — it gives an agent the necessary cross-tool warning in line, not buried in a separate divergence doc.

**Alternatives considered**:
- *Standardise the slice direction across the cohort* — REJECTED at spec time per Out-of-Scope (the runtime standardisation ships separately on its own spec branch).
- *Add a numeric example to each tool's doc showing the slice* — DEFERRED: the contracts/ artefact carries the wire-shape example; the in-doc text is a one-sentence guarantee.

**Empirical anchor**: T0 probe against backlinks with > `appliedCap` cross-folder sources, persisted to `contracts/truncation-direction-evidence.md`.

---

## Task 7 — `backlinks` cross-folder reach caveat target text

**Decision**: The `backlinks` help-doc (`docs/tools/backlinks.md`) and any per-tool feature page gain a new subsection titled "Cross-folder reach" or equivalent that states:

> The `backlinks` tool returns every cross-folder source that references the target via a bare-basename wikilink (`[[<basename>]]`), not only sources in the same folder as the target. This is because the wrapper defers to Obsidian's underlying wikilink resolution mechanism, which is vault-scoped, not folder-scoped, when the basename is unique vault-wide. Agents writing folder-scoped recovery logic against the returned source list must filter the result themselves; the wrapper does not folder-scope the source set.

The doc text is placed in the output-contract section near the existing `truncated` and `source` field descriptions. No runtime change.

**Rationale**:
- Confirmed by reading `src/tools/backlinks/handler.ts` and the schema — the wrapper does not filter the source set; upstream's wikilink resolver determines the source set scope.
- The silent-miss failure mode (folder-scoped recovery code passes incorrect data through) is the worst failure mode for an agent because no error fires. An explicit caveat in the help-doc is the only mitigation that does not require a runtime change (which is out of scope per the spec).
- The fragment-bearing-wikilink `displayText` concern (referenced in the spec's Out of Scope) is explicitly tracked separately and is NOT bundled here.

**Alternatives considered**:
- *Add a runtime folder-scope-filter option to the input schema* — REJECTED at spec time (Out-of-Scope: no schema-level changes to existing typed tools).
- *Add the caveat to the schema `.describe()` text only, not the help-doc* — REJECTED: the agent reading the help-doc first is the dominant case; the schema `.describe()` is downstream of `inputSchema` and is not the primary reading order for an LLM agent. Both surfaces get the caveat for parity (the help-doc IS the contract surface per the wrapper invariant).

**Empirical anchor**: T0 probe against a target note whose filename basename is unique vault-wide, with cross-folder sources referencing it via the bare-basename syntax; assert the returned source list includes every cross-folder source. Persisted to `contracts/backlinks-cross-folder-evidence.md`.

---

## Task 8 — Audit umbrella location + Story 8 verification protocol

**Decision**: The "cohort audit umbrella" referenced throughout the spec (Story 8, FR-022, SC-002) is a maintainer-run conceptual audit — there is no checked-in audit artefact in the repo (verified by `grep -i "BI-0027\|audit umbrella\|cohort audit"` against the entire repo; the only matches are inside spec / plan / quickstart / changelog prose). FR-022's verification is a manual maintainer audit performed against the cohort's pass criteria (no rogue codes, no documented-but-never-produced codes, no produced-but-never-documented codes, no doc-vs-empirical-behaviour drift, no asymmetric sub-discriminator labelling on any envelope that carries one) after this BI ships.

**Story 8 verification protocol**:
1. After `/speckit-implement` lands the reconciliation, run the cohort walk: for each tool in scope (named cohort: `read_property`, `properties`, `outline`, `find_by_property`, `read_heading`, `files`, `search`, `context_search`, `pattern_search`, `find_and_replace`, `backlinks`, `query_base`, `tag`), compute the pass-criteria checklist:
   - No rogue codes: `grep` per-tool `handler.ts` for `UpstreamError` instantiations; cross-check against the tool's documented error roster.
   - No documented-but-never-produced codes: walk the roster, attempt a probe per code, confirm production.
   - No produced-but-never-documented codes: enumerate the unique `code` values from `handler.ts` instantiations; confirm presence in the roster.
   - No doc-vs-empirical-behaviour drift: spot-check the empirical claims that this BI touches against the live wrapper.
   - No asymmetric sub-discriminator labelling: walk every `(top-level, details.code)` pair the tool surfaces; confirm `details.reason` is present iff ADR-015 applies (multi-state code).
2. Record the audit pass result in `specs/042-close-audit-findings/audit-pass-record.md` (created during `/speckit-implement`).
3. The audit pass clears when every tool in scope produces zero findings on the five criteria above.

**Rationale**:
- The audit umbrella has been referenced across BI-030, BI-041, and this BI but has never had a single checked-in artefact. The maintainer treats the cohort pass criteria as conventions inherited from the Spec Kit + Constitution stack.
- Codifying the verification protocol in this research artefact gives the audit a reproducible body that future BIs can re-run without re-deriving the criteria.
- The audit-pass-record artefact (per-BI, in `specs/<NNN>/`) keeps the audit history reviewable across BIs without a top-level audit ledger that would itself need governance.

**Alternatives considered**:
- *Codify the audit as an ADR* — DEFERRED: the audit is a process, not a structural decision. An ADR would freeze the criteria; the process is meant to evolve as the cohort grows. Out-of-Scope rules out audit-framework changes here.
- *Maintain a single top-level `AUDIT.md` ledger* — DEFERRED: the per-BI audit-pass-record approach distributes the documentation effort across BIs and avoids a god-doc that bit-rots.

**Empirical anchor**: Story 8 audit-pass-record produced after all other stories land. The audit acceptance is binary: empty findings ledger OR a follow-up issue per residual finding.

---

## Phase 0 exit

All eight tasks have Decision / Rationale / Alternatives. No new `[NEEDS CLARIFICATION]` items emerged — the spec's deliberate referential deferrals (Story 3 F1 cohort, audit umbrella location) are resolved by the cohort walk + verification-protocol codification here. Phase 1 proceeds with the design artefacts: `data-model.md`, `contracts/*`, `quickstart.md`, and the CLAUDE.md plan-reference update.
