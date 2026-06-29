# Feature Specification: Report Active File

**Feature Branch**: `063-report-focused-file`
**Created**: 2026-06-29
**Status**: Draft
**Input**: User description: "Report focused file — the agent can find out which file the user currently has focused in the Obsidian editor and get that file's path, name, base name, and extension back, so it can act on whatever the user is looking at. Confirming what is active before changing it lets the agent decide whether to act on it or target a different file by name, reducing the risk of changing the wrong file. Out of scope: pane / split-layout / leaf information; cursor position or focused heading within the file; changing which file is active; reporting non-file views."

> **Terminology**: this spec reports **the active file** — the note Obsidian currently has focused. "Active" is the term of record (it matches `target_mode: "active"` per ADR-003, Obsidian's `getActiveFile()`, and the cohort's "active note" vocabulary). The user-facing request used "focused"; the two refer to the same thing, and "active" is used exclusively after this first gloss.

## Clarifications

### Session 2026-06-29

- Q: How should the tool address the vault — `target_mode` (active/specific), `vault` required (open_file style), or an optional `vault`? → A: **`target_mode: "active" | "specific"`.** Active mode takes no `vault` and no locator and reports the active vault's active file; specific mode requires `vault` (no locator) and reports the named vault's active file. `get_active_file` is the strongest active-file concept on the surface, so it implements the ADR-003 `target_mode` union — it is the *inverse* of the no-active-file category that ARCH-014 reserves the optional-`vault?` idiom for (value→file lookups, vault-wide queries). The "omit `vault` → focused vault" default (option C) is rejected: it is exactly the implicit-vault default ADR-003 was created to forbid ("exposing implicit state to an LLM risks silent errors on unintended files"). The earlier (2026-05-08) "no `target_mode` discriminator / same treatment as `find_by_property`" framing is stale — it predates the B1 falsification that makes a specific cross-vault active-file read implementable — and is dropped.
- Q: What happens when a named (`specific`-mode) vault is registered but not currently open in any window, or Obsidian is down? → A: **Inherit `dispatchCli` behaviour; test-lock the cross-vault guarantee to OPEN-but-unfocused only.** `get_active_file` routes `invokeCli → dispatchCli`, so it inherits the dispatch-chokepoint recovery every eval-cohort tool gets with zero per-tool code: ADR-029 cold-start retry and ADR-030 app-down launch (on by default; `OBSIDIAN_AUTO_LAUNCH` opt-out → typed `obsidian-not-running` error). No `open_file`-style per-tool cold-launch recovery is built (rejected option B "never launch" needs per-tool suppression of a global default; rejected full open_file parity over-promises a heavy side effect for a read). Documented caveat: when an app-down launch fires, the relaunched vault's active file may differ (null / last-open) from the pre-down state — the answer reflects post-launch focus, not what was focused before Obsidian went down.
- Q: How are non-ASCII characters in the active file's path/name returned? → A: **Pass through raw** — return the substrate strings unchanged, no NFC/NFD normalization (no normalization code exists anywhere in `src`; "faithful" means exactly what Obsidian reports, even an on-disk NFD name).
- Q: Tool name / canonical term — "active file" or "focused file"? → A: **`get_active_file` / "active file".** One canonical term matching `target_mode: "active"`, `getActiveFile()`, and cohort vocabulary; "focused" is not introduced as a synonym (one plain-language gloss at first use is permitted, then "active" exclusively).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read the active file's details (Priority: P1)

An automation agent wants to act on whatever file the user is currently looking at. In active mode (no vault named) it asks for the active file and receives that file's vault-relative path, its name, its base name, and its extension, each describing the active note correctly. The agent now knows exactly which file is in front of the user without the user having to name it.

**Why this priority**: This is the whole point of the feature and the minimum viable slice. Without a way to read the active file, the agent's existing active-mode operations act on implicit state the agent cannot see first (the very risk ADR-003 names — "exposing implicit state to an LLM risks silent errors on unintended files"). A read that returns the four file-identity fields already delivers the core value, before the nothing-active, confirm-before-acting, and named-vault refinements layer on.

**Independent Test**: With a note active in the editor of the focused vault, request the active file in active mode. Verify the response carries that note's vault-relative path, name, base name, and extension, and that each field describes that note. Confirm the field-derivation rules hold across the boundary cases (single extension, multi-dot name, no extension, non-ASCII characters).

**Acceptance Scenarios**:

1. **Given** a note is active in the editor, **When** the agent requests the active file in active mode, **Then** it receives that file's path, name, base name, and extension, each describing the active note correctly.
2. **Given** an active file that has an extension, **When** the agent reads the result, **Then** the name equals the base name followed by the extension (e.g. name "note.md", base name "note", extension "md").
3. **Given** an active file whose name contains several dots (e.g. "note.draft.md"), **When** the agent reads the result, **Then** the extension is the final segment ("md") and the base name is everything before it ("note.draft").
4. **Given** an active file with no extension, **When** the agent reads the result, **Then** the extension is empty and the name equals the base name.
5. **Given** an active file whose path or name contains non-ASCII characters, **When** the agent reads the result, **Then** those characters are returned faithfully (raw, no normalization).

---

### User Story 2 - Distinguish "no active file" from an active file, without an error (Priority: P1)

An automation agent that runs when the workspace is empty, or when every pane has been closed, or when a non-file view is in front, asks for the active file and receives a clear "no active file" answer rather than a failure. The agent can branch cleanly on the absence of an active file instead of catching and interpreting an error.

**Why this priority**: "No active file" is a common, ordinary state of the workspace, not an exceptional one. A read tool that errored on this state would force every caller to wrap the call in failure handling just to discover the unremarkable fact that no file is open. Distinguishing presence from absence as two ordinary success outcomes is co-essential with US1; the two together form the minimal honest contract of the surface.

**Independent Test**: With no file active (close all panes / start from an empty workspace), request the active file. Verify the response is a clear, typed "no active file" result — a success indicating absence — and not an error, and that a caller can tell it apart from an active-file result programmatically without parsing prose. Repeat with a non-file view in front and verify the same result.

**Acceptance Scenarios**:

1. **Given** no file is active (empty workspace or all panes closed), **When** the agent requests the active file, **Then** it receives a clear "no active file" result rather than an error.
2. **Given** a "no active file" result, **When** the caller inspects it, **Then** it is programmatically distinguishable from an active-file result (a presence indicator / empty payload), so the caller can branch without parsing text.
3. **Given** a non-file view is in front (a plugin panel or other non-file workspace view), **When** the agent requests the active file, **Then** it receives the same "no active file" result, because no *file* is active — the non-file view is not reported.

---

### User Story 3 - Confirm before acting, with a documented timing limitation (Priority: P2)

An automation agent that is about to run an operation against the active file first reads which file is active, then targets that same file by its returned path so it does not accidentally change the wrong file. The agent understands that the answer describes the moment of the lookup, not the moment of the follow-up action.

**Why this priority**: P1 gives the read; P2 makes the read *useful as a safety check*. The feature's core motivation — confirm what is active before changing it, to reduce the risk of changing the wrong file — depends on two properties: (a) the returned path is a usable locator the agent can hand to a follow-up operation, and (b) the agent knows the answer is a point-in-time snapshot that may go stale. This tool is the discovery remedy for the implicit-active-state risk ADR-003 names: an agent reads the active file *explicitly* before invoking an active-mode write. Without the documented timing limitation, an agent could read the active file, the user could switch files, and the agent could then act on a file the user is no longer looking at while believing it confirmed the target.

**Independent Test**: With a note active, read the active file, then run a follow-up operation that targets the returned path; verify it operates on the intended file. Separately, read the active file, change which file is active, then act on the previously returned path; verify the outcome reflects that the answer described the moment of the lookup, and that the tool's documentation states this timing limitation.

**Acceptance Scenarios**:

1. **Given** a note is active, **When** the agent reads the active file and then targets that same file by its returned path, **Then** it operates on the intended file.
2. **Given** the active file changes after the agent reads it, **When** the agent later acts on the previously active file, **Then** the result reflects that the answer described the moment of the lookup, not the moment of the follow-up action.
3. **Given** the tool's documentation, **When** a caller reads it, **Then** the point-in-time / snapshot nature of the answer is documented, so callers know to re-confirm rather than treat the answer as a lock.

---

### User Story 4 - Target a named vault, cross-vault, with a typed error for an unknown vault (Priority: P2)

A user has several Obsidian windows open across different vaults. In specific mode, an automation agent requests the active file for a named vault so it reads from the right vault — even when that vault is open but not the currently focused window. When the named vault is not registered with Obsidian, the agent receives a clear typed error rather than a misleading empty result.

**Why this priority**: P1/P2 above answer "what is active" for the currently focused vault (active mode). US4 adds explicit cross-vault addressing for the multi-window case and the typed-error contract that keeps an unknown vault name from masquerading as "no active file". The eval honours `vault=` (upstream limitation B1 was falsified — ADR-031, verified cohort-wide under BI-0134 / 0.8.6), so a specific-mode read routes to the named vault's active file even when that vault is not focused; there is no focused-vault guard and no `not-open` error. It is P2 because the active-mode read is demonstrable on its own, but the safety value — never letting an unregistered vault look like an empty workspace — makes it more than a nice-to-have.

**Independent Test**: With two registered vaults open and vault B *not* focused (vault A focused), request the active file in specific mode naming vault B; verify the result reflects B's active file, not A's, with no manual switch to B first. Request the active file in specific mode for a vault name that is not registered with Obsidian and verify a typed `VAULT_NOT_FOUND` error (not an empty/no-active result).

**Acceptance Scenarios**:

1. **Given** a registered vault B that is open but not focused, and a different focused vault A, **When** the agent requests the active file in specific mode naming vault B, **Then** the result reflects B's active file, not A's.
2. **Given** a vault name that is not registered with Obsidian, **When** the agent requests the active file for it in specific mode, **Then** the agent receives a typed `VAULT_NOT_FOUND` error rather than a misleading empty result.
3. **Given** the active-mode request (no vault named), **When** the agent requests the active file, **Then** the result reflects the currently focused vault's active file — no `vault` is accepted in active mode.

---

### Edge Cases

- **No active file (empty workspace, all panes closed)**: per FR-005, the read returns a typed "no active file" success result — a deliberate absence answer — not an error and not a fabricated file. Distinguishable from an active-file result per FR-006.
- **A non-file view is in front (plugin panel, graph view, or other non-file workspace view)**: per FR-005 / FR-020, this maps to the "no active file" result, because no *file* is active; the non-file view itself is not reported (out of scope).
- **Active file has an extension**: per FR-002, name = base name + extension; e.g. name "note.md" → base name "note", extension "md".
- **Active file name contains several dots ("note.draft.md")**: per FR-002, the extension is the final dot-delimited segment ("md") and the base name is everything before that final dot ("note.draft").
- **Active file has no extension (no dot in the name)**: per FR-003, the extension is empty and the name equals the base name.
- **Active file path or name contains non-ASCII characters**: per FR-004, the characters are returned raw, exactly as the workspace reports them, with no NFC/NFD normalization.
- **Active file changes between the read and a later action**: per FR-008, the answer describes the active file at the moment of the lookup; the point-in-time / snapshot nature is documented so callers re-confirm rather than treat the answer as a lock. The tool provides no locking or pinning.
- **Specific mode, named vault is open but not focused**: per FR-011, the read routes cross-vault and reports that vault's active file (B1 false; cohort-wide verified). No focused-vault guard, no `not-open` error.
- **Specific mode, named vault is not registered with Obsidian**: per FR-010, surfaces as a typed `CLI_REPORTED_ERROR` + `details.code: "VAULT_NOT_FOUND"` + `details.reason: "unknown"` — the sole hard vault error — not a "no active file" result.
- **Specific mode, named vault is registered but closed (no open window), or Obsidian is down**: per FR-012, behaviour is whatever the inherited `dispatchCli` recovery produces — ADR-029 cold-start retry / ADR-030 app-down launch (on by default; `OBSIDIAN_AUTO_LAUNCH` opt-out → typed `obsidian-not-running` error). No per-tool cold-launch recovery is built; the cross-vault guarantee (FR-011) is test-locked to open-but-unfocused only. Per FR-013, if an app-down launch fires, the relaunched vault's active file may differ (null / last-open) from the pre-down state.
- **Unknown extra input field, or a locator (`file` / `path`) supplied, or `vault` supplied in active mode, or `vault` omitted in specific mode**: per FR-014, rejected at the input-validation boundary with a typed error. Nothing is reported.

## Requirements *(mandatory)*

### Functional Requirements

#### Active-file reporting and field derivation

- **FR-001**: When a file is active in the targeted vault, System MUST report that file's vault-relative path, its name, its base name, and its extension, each describing the active file.
- **FR-002**: System MUST derive the reported fields so that the name equals the base name followed by the extension. The extension is the final dot-delimited segment of the name, and the base name is everything before that final dot; for a name containing several dots (e.g. "note.draft.md"), the extension is the last segment ("md") and the base name is the remainder ("note.draft").
- **FR-003**: When the active file's name has no extension (contains no dot, or the substrate reports an empty extension), System MUST report an empty extension and a name equal to the base name.
- **FR-004**: System MUST return path and name characters raw — exactly as the workspace reports them, including non-ASCII characters, with no NFC/NFD normalization or other lossy transformation.

#### Nothing-active contract

- **FR-005**: When no file is active — an empty workspace, all panes closed, or a non-file view in front — System MUST return a typed "no active file" result: a successful response that indicates the absence of an active file. System MUST NOT raise an error and MUST NOT fabricate a file for the nothing-active state.
- **FR-006**: The "no active file" result MUST be programmatically distinguishable from an active-file result (for example via a presence indicator or an empty payload), so a caller can branch on presence-vs-absence without parsing prose.

#### Confirm-before-acting and timing

- **FR-007**: The reported path MUST be usable directly as a locator to target the same file in a subsequent operation (cohort parity — the path is the resolved vault-relative path the read/write tools accept), so an agent can confirm the active file and then act on the confirmed file.
- **FR-008**: System MUST document, in the tool's help, that the answer describes the active file at the moment of the lookup and may be stale by the time a follow-up action runs (a point-in-time snapshot — the project's active-mode timing/TOCTOU concern). System MUST NOT imply that reading the active file pins, locks, or reserves it. The tool is the discovery remedy for the implicit-active-state risk ADR-003 names: agents call it to make the active target explicit before invoking active-mode operations.

#### Vault addressing — target_mode (active | specific)

- **FR-009**: System MUST expose a `target_mode` discriminated union with exactly two modes (per ADR-003): `"active"` and `"specific"`. In `"active"` mode, System MUST NOT accept a `vault` argument and MUST report the active file of the currently focused vault. In `"specific"` mode, System MUST require a `vault` argument and report the active file of the named vault. The tool accepts no `file` / `path` locator in either mode — the active file is the implicit target; `file`/`path` are rejected in both modes. (They appear in the published input schema as always-rejected fields, per the folder-scoped target-mode cohort convention shared with `files`/`paths`; this is a published-but-rejected shape, not an accepted locator.) System MUST NOT provide an "omit `vault` → use the focused vault" implicit default (ADR-003: implicit vault state must not be exposed to the caller as a silent default).
- **FR-010**: In `"specific"` mode, when the named vault is not registered with Obsidian, System MUST fail with `code: "CLI_REPORTED_ERROR"` + `details.code: "VAULT_NOT_FOUND"` + `details.reason: "unknown"` — the sole hard vault error — never a "no active file" result and never active-file data from another vault.
- **FR-011**: In `"specific"` mode, when the named vault is registered and open but not the currently focused vault, System MUST route the read cross-vault and report that vault's active file. System MUST NOT apply a focused-vault guard and MUST NOT emit `details.reason: "not-open"` (B1 is false — the eval honours `vault=` — per ADR-031, verified cohort-wide under BI-0134; `not-open` is retired from emission, not repurposed, per ADR-015 additive-only).

#### Recovery for closed / not-running targets

- **FR-012**: In `"specific"` mode, when the named vault is registered but closed (no open window), or when Obsidian is not running, System MUST surface the behaviour inherited from `dispatchCli` — ADR-029 cold-start retry and ADR-030 app-down launch (on by default, with the `OBSIDIAN_AUTO_LAUNCH` opt-out surfacing a typed `obsidian-not-running` error). System MUST NOT add per-tool cold-launch recovery. The cross-vault guarantee of FR-011 is verified (test-locked) for open-but-unfocused vaults only.
- **FR-013**: System MUST document that when an app-down launch fires (FR-012), the relaunched vault's active file may differ (null, or the last-open file) from the state before Obsidian went down — the answer reflects post-launch focus, not the pre-down state.

#### Input validation and response shape

- **FR-014**: System MUST reject, at the input-validation boundary with a typed validation error: any unknown extra field; any `file` or `path` locator in either mode; a `vault` argument in `"active"` mode; and a missing `vault` argument in `"specific"` mode (strict-mode schema; target-mode refinement, cohort parity). Nothing is reported on any validation failure.
- **FR-015**: System MUST return the active file's data only and MUST NOT echo the input `vault` (or `target_mode`) back in the response. This is a pure-read surface; the read-vs-write echo convention reserves locator echo for mutating tools. The reported path/name/base name/extension are the *queried result*, not an echo of caller input. The result is file-only — no vault, pane, split, or leaf information.
- **FR-016**: System MUST introduce no new top-level error code; every failure reuses an existing top-level code with `details` sub-discrimination (per ADR-015): `VAULT_NOT_FOUND` / `unknown` for an unregistered vault (FR-010), `CLI_NON_ZERO_EXIT` / `obsidian-not-running` for an unrecoverable app-down (FR-012), and a validation error for input failures (FR-014).

#### Out of scope at the contract boundary

- **FR-017**: System MUST NOT report pane, split-layout, or leaf information (which pane holds the file, or how the workspace is split). The result describes the active file only.
- **FR-018**: System MUST NOT report cursor position, selection, or the active heading or block within the file. The result targets the file as a whole.
- **FR-019**: System MUST NOT change which file is active. The feature reports the active file only; it never moves focus (any focus change in FR-012's app-down launch is an inherited recovery side effect, not a feature affordance).
- **FR-020**: System MUST NOT report a non-file view (e.g. a focused plugin panel or non-file workspace view) as the active file; such a state maps to the "no active file" result of FR-005.

### Key Entities

- **Active file**: The file Obsidian currently treats as active in the targeted vault. Described by four identity fields — vault-relative path, name, base name (`basename`), extension — derived per FR-002 / FR-003. The subject of the read.
- **Active-file result**: The successful response. Either carries the active file's four fields, or indicates "no active file" (FR-005); the two states are programmatically distinguishable (FR-006). Returns queried data only, file-only, with no echo of input (FR-015).
- **File-name parts**: The relationship name = base name + extension (FR-002), with the extension being the final dot-delimited segment and the base name the remainder; an extension-less name yields an empty extension and name = base name (FR-003).
- **Target mode**: The `"active" | "specific"` discriminator (FR-009). `"active"` reads the focused vault's active file (no `vault`); `"specific"` reads a named vault's active file (`vault` required), routing cross-vault (FR-011). No `file` / `path` locator in either mode.
- **Vault identifier**: The `vault` argument, required in `"specific"` mode and forbidden in `"active"` mode (FR-009). An unregistered name yields the `VAULT_NOT_FOUND` / `unknown` error (FR-010). Reading the active file never changes which file or vault is active (FR-019).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An automation can determine the active file — its path, name, base name, and extension — in a single active-mode call, without the user naming the file.
- **SC-002**: For every active file, the relationship name = base name + extension holds in 100% of cases, including names with several dots and names with no extension.
- **SC-003**: Non-ASCII characters in the active file's path and name round-trip raw (no normalization) in 100% of cases.
- **SC-004**: When nothing is active, the caller receives a distinguishable "no active file" result — never an error and never a fabricated file — in 100% of empty-workspace / non-file-view states, and can branch on it without parsing text.
- **SC-005**: The reported path can be used directly as the locator for a follow-up operation and targets the same file (when the active file is unchanged between the read and the action) in 100% of cases.
- **SC-006**: In specific mode, a read naming an open-but-unfocused vault returns that vault's active file (not the focused vault's) in 100% of cases; a read naming an unregistered vault surfaces a typed `VAULT_NOT_FOUND` error — never a misleading "no active file" result — in 100% of cases.
- **SC-007**: The tool's documentation states the point-in-time / snapshot limitation of the answer (and the post-launch-focus caveat for the app-down recovery path), so callers know to re-confirm before acting on a stale result.

## Assumptions

- **Eval-composed read, tool name `get_active_file` (settled — Clarifications 2026-06-29)**: The upstream Obsidian Integrated CLI exposes no native "active file" subcommand; reading the active file is performed by a small, bug-safe `eval` against Obsidian's active-file accessor (`getActiveFile()`), which already exposes a file's path, name, base name, and extension as distinct fields — the four FR-001 fields map directly with no re-parsing needed. The argv carries only the optional `vault` (specific mode), far below the IPC ceiling (ADR-009), so the read is bug-safe. ADR-010 (mirror the upstream subcommand name) is N/A because there is no upstream subcommand to mirror — this tool joins the eval-composition cohort. The plan phase confirms the exact eval template against the authorised test vault per `.memory/test-execution-instructions.md`.
- **`target_mode` (active | specific), not the optional-`vault?` idiom (settled — Clarifications 2026-06-29, Q1)**: `get_active_file` is the strongest active-file concept on the surface, so per ADR-003 it implements the `target_mode` discriminated union, not the optional-`vault?` idiom ARCH-014 reserves for inherently-vault-wide, no-active-file tools (value→file lookups, vault-wide queries). The tool carries no `file` / `path` locator in either mode — the active file is the implicit target — so the input schema reuses the shared folder-scoped target-mode refinement (`applyTargetModeRefinementForFolderScoped`), which forbids `file`/`path` in both modes (the same pattern `files`/`paths` use). Consequently `file`/`path` appear in the published input schema as always-rejected fields — cohort-standard, not an accepted locator. The "omit `vault` → focused vault" default (option C) is rejected as the implicit-vault default ADR-003 forbids. The stale 2026-05-08 BI framing ("no `target_mode` discriminator / same treatment as `find_by_property`") predates the B1 falsification and is dropped.
- **Cross-vault routing — B1 false (settled by ADR-031, verified cohort-wide BI-0134 / 0.8.6)**: The `eval` subcommand honours `vault=`, so a specific-mode read routes to the named vault and reports its active file even when that vault is open but not focused (FR-011). There is no focused-vault guard and no `not-open` emission. **Plan-phase probe (directive from Q1)**: B1 falsification covers `vault=` routing generally, but the active file is *UI state*, not yet probed for this specific surface — the plan phase MUST confirm empirically (forcing-gate T0 probe, per `.memory/test-execution-instructions.md`) that a vault-targeted `eval` returns the *named* vault's active file rather than the focused window's active file in a live multi-window setup. The FR-011 / SC-006 guarantee depends on this.
- **Closed / app-down recovery — inherited, not per-tool (settled — Clarifications 2026-06-29, Q2)**: `get_active_file` routes `invokeCli → dispatchCli`, so ADR-029 (cold-start retry) and ADR-030 (app-down launch, on by default, `OBSIDIAN_AUTO_LAUNCH` opt-out) apply with zero per-tool code (FR-012). No `open_file`-style per-tool cold-launch recovery is built; the cross-vault guarantee (FR-011) is test-locked to open-but-unfocused vaults only. When an app-down launch fires, the relaunched vault's active file may differ (null / last-open) from the pre-down state, so the answer reflects post-launch focus (FR-013).
- **Unicode pass-through, raw (settled — Clarifications 2026-06-29, Q3)**: Path and name characters are returned exactly as the substrate reports them, with no NFC/NFD normalization (FR-004) — consistent with the cohort, in which no normalization code exists anywhere in `src`.
- **Nothing-active is a success state, not an error (settled from the user story)**: The empty-workspace / all-panes-closed / non-file-view states return a typed "no active file" success result (FR-005), distinguishable from an active-file result (FR-006), so callers branch cleanly instead of handling a failure.
- **Non-file views map to "no active file" (informed guess)**: When a non-file workspace view is in front, the active-file accessor reports no file, so the tool returns the "no active file" result (FR-005 / FR-020) rather than describing the view. Reporting non-file views is explicitly out of scope.
- **File-name part derivation follows the substrate's accessor semantics**: The base name / extension split (FR-002 / FR-003) follows Obsidian's own file-identity fields (the active-file accessor exposes name, base name, and extension directly), so the multi-dot and no-extension rules match Obsidian's behaviour rather than a re-implemented parser. Leading-dot / dotfile naming follows the same substrate semantics; the plan phase characterises any such boundary against the authorised test vault.
- **Pure-read echo convention (no input echo)**: This is a read-only surface, so the response returns the active file's queried data only and does not echo `vault` / `target_mode` (FR-015), consistent with the project convention that pure-read tools return data only while mutating tools echo the locator for write-verification.
- **Timing / TOCTOU is documented, not enforced (settled from the user story)**: The answer is a point-in-time snapshot (FR-008); the tool documents this (and the post-launch-focus caveat, FR-013) and provides no locking or pinning. This applies the project's active-mode timing/TOCTOU concern uniformly to the new surface.
- **Error vocabulary — zero new top-level codes (Constitution Principle IV)**: Every failure reuses an existing top-level code with `details` sub-discrimination per ADR-015 — `VAULT_NOT_FOUND` / `unknown` (FR-010), `CLI_NON_ZERO_EXIT` / `obsidian-not-running` (FR-012), and validation errors (FR-014). No new error code or `details.reason` value is introduced.
- **Out-of-scope boundaries are contract obligations, not deferred work**: Pane / split / leaf information (FR-017), cursor / heading / block position (FR-018), changing the active file (FR-019), and non-file-view reporting (FR-020) are out of scope by the user's explicit statement and are enforced as negative requirements, not future increments.
