# Feature Specification: Verify Cross-Vault Routing

**Feature Branch**: `062-verify-cross-vault-routing`
**Created**: 2026-06-02
**Status**: Draft
**Input**: User description: "Verify Cross-Vault Routing — across the eval-based read and query tools, each tool reliably operates on the vault the caller names — whether or not that vault is the focused one — and its documentation and error behaviour accurately reflect its real cross-vault capability, confirmed for each tool individually."

<!--
  Context. ADR-031 (shipped in open_file / spec branch 061-cross-vault-open) falsified upstream
  limitation B1 — "obsidian eval ignores vault= and always runs against the focused vault" — for
  open_file via a forcing-gate probe (target vault unfocused, distinct basePath). ADR-031
  deliberately did NOT extrapolate that result to the rest of the eval-composition cohort; it
  deferred the cohort-wide re-characterisation, "with per-tool forcing-gate verification rather
  than extrapolation from this single probe", to BI-0134 - Re-verify Eval Cohort Cross-Vault
  Routing. This feature IS that BI-0134 work, scoped to the eval-based READ and QUERY tools.

  The doc drift this feature corrects lives in the cohort's "Multi-vault basename ambiguity"
  sections, which carry the line "Recommendation: open the target vault in Obsidian before
  invoking <tool>." That recommendation conflates two distinct things: (a) a genuine
  same-display-name collision limit, and (b) the now-falsified blanket assumption that a tool
  cannot route to an unfocused vault at all. tag.md even states "vault= ... routes correctly for
  eval (verified live)" while still telling callers to focus the vault first.
-->

## Clarifications

### Session 2026-06-02

- Q: When a cohort tool is asked to read/query a **closed-but-registered** vault (not just open-but-unfocused), what end-state must this feature deliver? → A: **Open-but-unfocused only.** The positive cross-vault target is an open-but-unfocused vault (matching the acceptance criteria). Closed-vault behaviour is left exactly as each tool does today — the four tools with closed-vault detection (`paths`, `pattern_search`, `smart_connections_query`, `smart_connections_similar`) keep emitting `CLI_REPORTED_ERROR` / `VAULT_NOT_FOUND` / `reason:"not-open"`; the five without it (`backlinks`, `links`, `read_heading`, `find_by_property`, `tag`) are unchanged — and is documented accurately. `open_file`-style recovery parity (bringing a closed vault up to a success) is explicitly **not** built here; it is a separate item.
- Q: How far may this feature go in handler code when a tool genuinely cannot route to a named open-but-unfocused vault (or lacks any reachability signal)? → A: **Wire an existing sibling signal only; zero new vocabulary.** In-feature handler code is limited to wiring a structured signal the cohort *already emits* into a tool that merely lacks the wiring. Hard caps — each deferred to a dedicated BI (per BI-0134's own "Out of scope"), never done in-feature: (1) **zero new top-level `UpstreamError.code`** (Constitution Principle IV streak); (2) **no new additive `details.reason`** (ADR-015) — minting a reason is "real code work"; (3) **no net-new routing/passthrough** (making a tool honour `vault=` where it currently does not). Reconciliation: User Story 3's "genuine limitation signals clearly" criterion is satisfiable in-feature **only** by reusing an already-emitted sibling signal; if a tool would need net-new detection to produce that signal, its criterion is marked **deferred-to-dedicated-BI, not failed**. Because ADR-031 falsified B1, the genuine-limitation set is expected to be **empty or near-empty** for eval-composed specific-mode paths — so by outcome the feature stays documentation-only for most/all tools, touching code only where an existing signal is merely unwired.

## User Scenarios & Testing *(mandatory)*

<!--
  These stories cover a VERIFICATION-AND-CORRECTION feature, not a net-new capability build.
  The enabling routing behaviour largely already exists (B1 is false for open_file); the
  deliverable is per-tool confirmation, documentation that matches reality, and a clear
  structured signal wherever a genuine limitation remains. Each story is independently testable
  against a real two-vault Obsidian setup with the target vault unfocused.
-->

### User Story 1 - Read/query the vault I name, even when it is not focused (Priority: P1)

An automation author calls an eval-based read or query tool in specific mode, naming vault B, while a different vault A holds Obsidian's focus. The author wants the result to reflect B's content — not A's — so that they do not have to ask a human to switch vaults first before every cross-vault read or query.

**Why this priority**: This is the core value the feature exists to deliver and confirm. The whole reason these tools are currently distrusted for automation is the open question of whether naming a vault actually routes there when it is unfocused. Establishing — per tool, on real evidence — that a named-but-unfocused vault is read correctly is the minimum viable slice: it removes the human pre-switch dependency for every cross-vault read/query the cohort supports.

**Independent Test**: With two registered vaults open in Obsidian and vault B *not* focused (vault A focused), call a cohort tool in specific mode naming vault B against content that exists in B. Verify the result is computed from B's content, not A's — and that no one manually switched to B first.

**Acceptance Scenarios**:

1. **Given** a registered vault B that is open but not focused, and a different focused vault A, **When** I call a cohort tool in specific mode naming vault B, **Then** the result reflects B's content, not A's.
2. **Given** vault B holds an item absent from A, **When** I query for that item naming vault B, **Then** it is found.
3. **Given** an item that exists in both A and B but differs between them, **When** I read it naming vault B, **Then** the value returned is B's, never A's.

---

### User Story 2 - Trust each tool's documentation about cross-vault use (Priority: P2)

An automation author reads a tool's documentation to decide whether it can be relied on against a non-focused vault, without trial and error. The author wants the documentation to state accurately whether the tool works cross-vault, and — where a real limitation remains — to name that real limitation instead of the previous blanket "focus the target vault first" caveat.

**Why this priority**: The feature's stated harm is that callers cannot trust which tools work cross-vault and the documentation may steer them wrong. Once US1 establishes the truth per tool, the documentation must be brought into line with it, otherwise the trust problem persists. It is P2 only because it depends on US1's per-tool findings to know what to write; in practice it ships with US1.

**Independent Test**: For a tool confirmed in US1 to operate on a non-focused vault, read its documentation and verify it no longer instructs the caller to focus/open the target vault first as a cross-vault precondition. For a tool with a confirmed genuine limitation, verify the documentation states that specific limitation rather than the blanket caveat.

**Acceptance Scenarios**:

1. **Given** a tool confirmed to operate on a non-focused vault, **When** its documentation is read, **Then** it does not instruct the caller to focus the vault first.
2. **Given** a tool with a genuine, confirmed limitation, **When** its documentation is read, **Then** it states that real limitation rather than the previous blanket "focus first" caveat.
3. **Given** a tool whose only remaining constraint is a same-display-name collision, **When** its documentation is read, **Then** that collision is described as the actual constraint, distinct from any (now-removed) focus precondition.

---

### User Story 3 - A genuine limitation signals clearly, never silently wrong (Priority: P2)

An automation author calls a tool that genuinely cannot operate on the named non-focused vault. The author wants a clear, structured signal that identifies the unreachable vault, so that they never silently receive a result drawn from the focused vault instead.

**Why this priority**: A cross-vault surface that callers are told to trust must never quietly answer from the wrong vault. Wherever verification (US1) finds a tool that genuinely cannot reach a named non-focused vault, the tool must fail loud and identify the vault rather than fall back to the focused one. It is P2 because it applies only to tools that verification shows have a real limitation; for tools that route correctly it does not arise, but where it does it is what makes the surface safe to automate. Per the 2026-06-02 clarification, the signal is delivered in-feature **only** by reusing a structured signal the cohort already emits; if a tool would need net-new detection to produce it, that tool's signal obligation is recorded as **deferred to a dedicated BI** (not failed), and its documentation states the confirmed limitation.

**Independent Test**: For a tool that verification shows cannot reach a named non-focused vault, call it naming such a vault and verify it returns a structured error identifying that vault — programmatically distinguishable from a success and from an unknown-vault error — and that it never returns content computed from the focused vault.

**Acceptance Scenarios**:

1. **Given** a tool that cannot operate on a non-focused vault, **When** it is called naming such a vault, **Then** it returns a structured error identifying the unreachable vault, rather than silently answering from the focused one.
2. **Given** the same call, **When** the error returns, **Then** it is programmatically distinguishable from a success and from the unknown/unregistered-vault error.
3. **Given** any cohort tool and any named-but-unfocused vault, **When** the call cannot be served from that vault, **Then** no result computed from a different (e.g. focused) vault is ever returned in place of an error.
4. **Given** a confirmed limitation whose structured signal would require net-new detection (no existing sibling signal to reuse), **When** this feature completes, **Then** that tool's signal obligation is recorded as deferred to a dedicated BI rather than marked failed, and its documentation states the confirmed limitation — while the no-silent-wrong-vault guarantee (AC3) still holds.

---

### User Story 4 - Per-tool evidence, focused-only modes left alone (Priority: P3)

A maintainer wants every published cross-vault claim to rest on that specific tool's own evidence — gathered with the target vault unfocused — rather than being inferred from another tool. The maintainer also wants any tool whose only mode is to act on whatever is focused (no vault named) left exactly as it is, since operating on the focused vault is the correct, documented behaviour there.

**Why this priority**: The whole feature is a correction of a previously over-broad assumption; repeating that mistake — generalising one tool's result to the cohort — would reintroduce the very drift it exists to fix. Confirming each claim on its own tool's evidence is what makes the published contract trustworthy. It is P3 because it is a discipline applied across US1–US3 rather than a separately demonstrable end-user capability, but it is the guarantee that the corrected contract reflects reality.

**Independent Test**: For each published cross-vault claim, confirm there is evidence captured against that specific tool with the target vault unfocused — not a citation of a different tool's result. Separately, for a tool whose only mode operates on the focused vault with no vault argument, confirm its behaviour and documentation are unchanged by this feature.

**Acceptance Scenarios**:

1. **Given** any cross-vault capability claimed for a tool, **When** that claim is published, **Then** it has been confirmed against that specific tool with the target vault unfocused — not inferred from a different tool.
2. **Given** a tool whose only mode is to act on whatever is focused (no vault named), **When** it is called, **Then** operating on the focused vault is the correct, documented behaviour and is left unchanged.
3. **Given** a tool that offers both a focused mode and a vault-named mode, **When** the feature completes, **Then** only the vault-named (cross-vault) path's contract is re-characterised; the focused mode's behaviour is untouched.

---

### Edge Cases

- **Tool with both a focused mode and a vault-named mode** (e.g. an `active`/`specific` discriminator): the focused mode is left unchanged (US4-AC3); only the vault-named path is verified and re-documented.
- **Tool with no explicit mode but an optional vault argument** (vault-scoped query tools): naming the vault is the cross-vault path to verify; omitting the vault keeps the existing focused-default behaviour unchanged.
- **Two registered vaults share the same display name** (basename collision): this is a genuine residual limitation — `vault=` cannot distinguish them. The documentation must describe this real collision limit (US2-AC3), and where it leaves a call unable to target the intended vault unambiguously, the structured-signal guarantee (US3) applies rather than a silent wrong-vault answer.
- **Named vault is open in a separate OS window** rather than the same window: an open-but-unfocused vault includes this case; whether each tool routes there reliably is part of that tool's own per-tool confirmation (US4-AC1).
- **Named vault is closed but registered**: out of this feature's positive scope (2026-06-02 clarification). Each tool's existing closed-vault behaviour is retained and documented unchanged — the four tools with closed-vault detection (`paths`, `pattern_search`, `smart_connections_query`, `smart_connections_similar`) keep emitting `VAULT_NOT_FOUND`/`reason:"not-open"`; the five without it (`backlinks`, `links`, `read_heading`, `find_by_property`, `tag`) are untouched. `open_file`-style recovery to a success is a separate item. In no case is a silent answer from the focused vault acceptable.
- **Named vault is unknown/unregistered**: the existing unknown-vault error behaviour is retained unchanged; this feature does not alter how an unregistered vault name is reported.
- **A tool for which B1 still holds** (verification finds it genuinely answers from the focused vault despite a vault argument): it must surface the structured signal (US3), and its documentation must state this real limitation (US2-AC2) — it must not be left with the misleading blanket caveat, nor silently route wrong.
- **A tool already routing correctly cross-vault**: its only required change is documentation — removing the false "focus first" precondition (US2-AC1); no behavioural change is made.

## Requirements *(mandatory)*

### Functional Requirements

#### Cross-vault routing behaviour and confirmation

- **FR-001**: For each tool in the eval-based read/query cohort, when it is called in its vault-named mode naming a registered vault B that is open but not focused while a different vault A is focused, the result MUST be computed from vault B's content, not vault A's.
- **FR-002**: When vault B holds an item absent from vault A, a read or query naming vault B MUST surface that item; and when an item exists in both vaults but differs, a read naming vault B MUST return B's value, never A's.
- **FR-003**: Every cross-vault capability the feature publishes for a tool MUST be confirmed against that specific tool with the target vault unfocused — never inferred or extrapolated from a different tool's result.
- **FR-004**: A tool (or tool mode) whose only behaviour is to act on whatever vault is focused, with no vault named, MUST continue to operate on the focused vault unchanged; this feature MUST introduce no behavioural change to focused-only modes.
- **FR-005**: For a tool that offers both a focused mode and a vault-named mode, the feature MUST re-characterise only the vault-named (cross-vault) path; the focused mode's behaviour MUST remain untouched.

#### Documentation accuracy

- **FR-006**: For each tool confirmed to operate on a non-focused vault, its documentation MUST NOT instruct the caller to focus, open, or switch to the target vault first as a precondition for cross-vault routing.
- **FR-007**: For each tool with a genuine, confirmed limitation, the documentation MUST state that specific real limitation in place of the previous blanket "focus the target vault first" caveat.
- **FR-008**: Where FR-007 replaces a blanket caveat with a real limitation, the documentation MUST additionally keep that genuine residual limitation (e.g. a same-display-name collision) presented as a *distinct, narrowly-scoped* constraint — never conflated with, nor implying the return of, the now-falsified blanket "focus first" routing caveat — so a caller can tell what actually constrains cross-vault use and what does not. (FR-007 governs the removal/replacement; FR-008 governs that the retained limitation is not re-entangled with the false one.)
- **FR-009**: After this feature, each cohort tool's published contract MUST resolve to exactly one of three confirmed states, with no tool left carrying the unverified blanket caveat: (a) **cross-vault routing confirmed** — false caveat removed; (b) **genuine limitation confirmed, signal in place** — real limitation stated and a structured signal surfaced by reusing a signal the cohort already emits; or (c) **genuine limitation confirmed, signal deferred** — real limitation stated, but producing its structured signal would require net-new detection, so the signal obligation is recorded as deferred to a dedicated BI (not failed).

#### Structured signal for a genuine limitation

- **FR-010**: A tool that genuinely cannot operate on a named non-focused vault MUST return a structured, typed error that identifies the unreachable vault, rather than silently returning a result computed from the focused vault. The signal is surfaced in-feature **only** by reusing a structured signal the cohort already emits (FR-013); where producing it would require net-new detection, the signal obligation is deferred to a dedicated BI (FR-009c, FR-014) — but even then the tool MUST NOT silently return a focused-vault result (FR-012 still holds; the limitation is documented).
- **FR-011**: The structured signal MUST be programmatically distinguishable from a success and from the unknown/unregistered-vault error.
- **FR-012**: In no case may a cross-vault read or query naming vault B return content computed from a different vault (e.g. the focused vault A) in place of an error — no silent no-op, no fabricated success, no silent wrong-vault answer.

#### Scope and constitutional constraints

- **FR-013**: Any structured signal surfaced in-feature MUST reuse a signal the cohort already emits — **zero new top-level `UpstreamError.code`** (Constitution Principle IV) and **zero new `details.reason`** (ADR-015 additive-only). Both minting a new `details.reason` and adding net-new routing/passthrough are "real code work" deferred to a dedicated BI (FR-014), never done in this feature. A genuinely distinct state that no existing signal covers is raised as its own item, not minted here.
- **FR-014**: This feature's in-feature changes MUST be limited to (a) correcting documentation and (b) wiring a structured signal the cohort already emits into a tool that merely lacks it. The following are "real code work" and MUST each be captured as its own dedicated BI (per BI-0134's own out-of-scope), never delivered here: (i) net-new routing/passthrough — making a tool honour `vault=` where it currently does not; (ii) net-new detection required to produce a reachability signal; (iii) minting any new top-level error code or new `details.reason`.
- **FR-015**: This feature MUST NOT change, suppress, or special-case any individual Obsidian plugin.
- **FR-016**: The open-file tool MUST be excluded from this feature's cohort; its cross-vault behaviour is delivered and verified separately (061 / ADR-031).

### Key Entities

- **Eval-based read/query cohort**: The set of read and query tools whose work is routed through Obsidian's `eval` mechanism (as opposed to the CLI-native subcommand tools and the write/mutation tools). The working set identified is `backlinks`, `links`, `read_heading`, `find_by_property`, `tag`, `paths`, `pattern_search`, `smart_connections_query`, and `smart_connections_similar`; `open_file` is excluded. Exact membership is confirmed at planning.
- **Named (requested) vault**: The vault the caller names in a tool's vault-named mode. It may be the focused vault, an open-but-unfocused vault, or a closed-but-registered vault. The result must reflect this vault, not whichever vault happens to be focused.
- **Focused vault**: The vault Obsidian currently has in foreground. It is the correct target only for focused-only modes (no vault named); for a vault-named call it must never silently substitute for the named vault.
- **Per-tool cross-vault claim**: A published statement that a given tool does (or does not) operate on a non-focused named vault. Each claim must be backed by evidence gathered against that specific tool with the target vault unfocused.
- **Legacy "focus-first" caveat**: The existing blanket recommendation to open/focus the target vault before invoking a tool. Where routing is confirmed working, it is removed; where a real limitation remains, it is replaced by an accurate statement of that limitation.
- **Genuine residual limitation**: A real constraint that survives verification (candidate: a same-display-name collision that `vault=` cannot disambiguate), as opposed to the falsified blanket caveat.
- **Structured cross-vault signal**: A typed error that identifies the unreachable named vault, returned wherever a tool genuinely cannot serve a call from that vault — distinct from success and from the unknown-vault error. In-feature it is only ever a signal the cohort already emits (reused, not newly minted); where producing it would need net-new detection, the obligation is deferred to a dedicated BI rather than built here.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of cohort tools have their cross-vault behaviour confirmed individually, with the target vault unfocused, on that tool's own evidence — 0% inferred from another tool.
- **SC-002**: For every cohort tool confirmed cross-vault-capable, a vault-named call against an open-but-unfocused vault B returns B's content in 100% of cases and the focused vault A's content in 0% of cases.
- **SC-003**: 0 cohort tools retain a "focus the target vault first" instruction as a cross-vault precondition where routing is confirmed working.
- **SC-004**: 100% of genuine residual limitations are stated accurately in the relevant tool's documentation, with 0 blanket caveats left standing in place of a real, named limitation.
- **SC-005**: For any tool confirmed unable to reach a named non-focused vault, a silent wrong-vault answer is returned in 0% of calls; a structured error identifying that vault is returned in 100% of such calls where an existing sibling signal can be reused, and where producing it would need net-new detection, the tool's signal obligation is recorded as deferred to a dedicated BI — 0 tools left silently wrong, 0 marked failed for a deferred signal.
- **SC-006**: Focused-only (no-vault) modes behave identically before and after the feature — 0 behavioural changes.
- **SC-007**: 0 new top-level error codes and 0 new error sub-reasons are introduced, and 0 Obsidian plugins are changed or special-cased.

## Assumptions

- **This feature is BI-0134 (cohort re-verification deferred by ADR-031)**: ADR-031 falsified upstream limitation B1 for `open_file` and explicitly deferred the cohort-wide re-characterisation to BI-0134 "with per-tool forcing-gate verification rather than extrapolation from this single probe." This feature is that work, scoped to the eval-based read and query tools.
- **Cohort = eval-routed read/query tools only**: The cohort is the read and query tools whose execution is routed through Obsidian's `eval` mechanism. The CLI-native subcommand read/query tools (e.g. `read`, `outline`, `files`, `search`, `context_search`, `read_property`, `bases`, `query_base`, `properties`, `create_base`) use a different execution path (the CLI resolves `vault=` natively) and are NOT in this cohort; if any of them also needs cross-vault re-characterisation, that is a separate item. The write/mutation tools are likewise out of scope (this feature is read/query only). Exact cohort membership is confirmed at planning against the handlers.
- **"Confirmed" means a per-tool live forcing-gate probe with the target vault unfocused**: Per the project's test convention, in-repo automated coverage is unit-level; the cross-vault confirmation evidence is gathered by per-tool live probes (target vault unfocused, distinct content in A vs B) at the planning/implementation step, against the authorised test vault per `.memory/test-execution-instructions.md`. The probe methodology — mode-by-mode procedure, fixtures, the focused-vs-unfocused setup — belongs to planning, not this spec.
- **The legacy caveat to correct is the cohort's "open the target vault first" recommendation**: That recommendation currently lives in the cohort docs' "Multi-vault basename ambiguity" sections and conflates two distinct things — a genuine same-display-name collision and the now-falsified blanket assumption that a tool cannot route to an unfocused vault. The doc-accuracy stories separate the two: keep the real collision limit, drop the false routing precondition.
- **Known residual-limitation candidate is same-display-name collision**: The most likely genuine limitation to survive verification is that two registered vaults sharing the same display name are indistinguishable by `vault=`. Verification confirms, per tool, whether that (and not focus) is the real constraint; the spec does not pre-judge the verdict for any tool.
- **Error vocabulary is additive-only (Constitution Principle IV / ADR-015)**: Any structured signal reuses an existing `(code, details.code, details.reason)` triple. No new top-level code and no new sub-reason are minted; the project's zero-new-codes streak is preserved.
- **Focused-only modes are deliberately untouched**: Where a tool's only mode operates on whatever vault is focused (no vault argument), that behaviour is correct and documented, and this feature changes neither its behaviour nor its documentation beyond what cross-vault accuracy requires elsewhere in the same document.
- **Closed-but-registered vault is out of positive scope (2026-06-02 clarification)**: The positive cross-vault target is an open-but-unfocused vault. Each tool's existing closed-vault behaviour is retained and documented unchanged; `open_file`-style recovery to a success is a separate item.
- **In-feature ceiling — wire-existing-signal-only, docs-first (2026-06-02 clarification)**: The feature verifies and documents; the only handler code it adds is wiring a structured signal the cohort already emits into a tool that lacks it. Net-new routing/passthrough, net-new detection, and any new error code or `details.reason` are each a dedicated BI (FR-014), not part of this feature. Because ADR-031 falsified B1, the genuine-limitation set is expected to be empty or near-empty for eval-composed specific-mode paths, so the feature is expected to be documentation-only for most or all cohort tools, touching code only where an existing signal is merely unwired.

## Dependencies

- **ADR-031 — Cross-Vault Open via Vault-Targeted Focus** (Decided; shipped in `open_file` / spec branch `061-cross-vault-open`): the source of the B1-false finding for `open_file` and the explicit deferral of the cohort-wide re-characterisation to BI-0134. This feature does not re-open `open_file`; it generalises the question to the read/query cohort with per-tool evidence.
- **The eval-based read/query cohort and their documentation**: the `src/tools/**` handlers and `docs/tools/*.md` pages for the cohort tools are the subjects of verification and correction. The "Multi-vault basename ambiguity" sections are the specific documentation surface the doc-accuracy stories correct.
- **The cohort's existing structured vault-error machinery**: the project's existing typed vault errors (e.g. the unknown/unregistered-vault error, and the registered-but-not-open detection used by some cohort tools) are the vocabulary any structured cross-vault signal reuses (FR-010, FR-013).
- **ADR-015 — Sub-Discriminators via `details.reason`** (Decided) and **Constitution Principle IV**: the additive-only closed-enum rule that constrains any structured signal to existing codes/reasons.
- **Upstream limitation B1** (`.architecture/Obsidian CLI - Upstream Issues and Limitations.md`): the assertion ("eval ignores `vault=`, runs against the focused vault") that this feature re-tests per tool — false for `open_file`, to be confirmed or refuted for each cohort tool individually.

## Out of Scope

- The open-file tool — its cross-vault behaviour is already delivered and verified separately (061 / ADR-031).
- Any net-new tool behaviour beyond correcting documentation and wiring a structured signal the cohort already emits. Specifically deferred, each to its own dedicated BI: net-new routing/passthrough (making a tool honour `vault=` where it currently does not), net-new detection to produce a reachability signal, and recovering a closed-but-registered vault to a success (`open_file`-style) for the cohort.
- Changing, suppressing, or special-casing individual Obsidian plugins.
- The CLI-native (non-eval) read/query tools and the write/mutation tools — re-characterising their cross-vault behaviour, if needed, is a separate item.
- The mechanics of how each tool is probed (test methodology, the mode-by-mode procedure, fixtures, focused-vs-unfocused setup) — that belongs to planning, not this spec.
- Minting any new error code or new error sub-reason; the structured signal reuses existing vocabulary (a genuinely uncovered state is escalated as a separate item).
