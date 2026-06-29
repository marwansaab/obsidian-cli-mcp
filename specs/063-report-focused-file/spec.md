# Feature Specification: Report Focused File

**Feature Branch**: `063-report-focused-file`
**Created**: 2026-06-29
**Status**: Draft
**Input**: User description: "Report focused file — the agent can find out which file the user currently has focused in the Obsidian editor and get that file's path, name, base name, and extension back, so it can act on whatever the user is looking at. Exposing the focused file lets the agent confirm what's focused before changing it — and decide whether to act on it or instead target a different file by name — reducing the risk of changing the wrong file. Out of scope: pane / split-layout / leaf information; cursor position or focused heading within the file; changing which file is focused; reporting focus for views that aren't files."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read the focused file's details (Priority: P1)

An automation agent wants to act on whatever file the user is currently looking at. It asks for the focused file and receives that file's vault-relative path, its name, its base name, and its extension, each describing the focused note correctly. The agent now knows exactly which file is in front of the user without the user having to name it.

**Why this priority**: This is the whole point of the feature and the minimum viable slice. Without a way to read the focused file, the agent's existing "active" / focus-based operations act blindly on whatever Obsidian happens to have open, with no way to see that state first. A read that returns the four file-identity fields already delivers the core value, before the nothing-focused, confirm-before-acting, and vault-targeting refinements layer on.

**Independent Test**: With a note focused in the editor, request the focused file. Verify the response carries the focused note's vault-relative path, name, base name, and extension, and that each field describes that note. Confirm the field-derivation rules hold across the boundary cases (single extension, multi-dot name, no extension, non-ASCII characters).

**Acceptance Scenarios**:

1. **Given** a note is focused in the editor, **When** the agent requests the focused file, **Then** it receives that file's path, name, base name, and extension, each describing the focused note correctly.
2. **Given** a focused file that has an extension, **When** the agent reads the result, **Then** the name equals the base name followed by the extension (e.g. name "note.md", base name "note", extension "md").
3. **Given** a focused file whose name contains several dots (e.g. "note.draft.md"), **When** the agent reads the result, **Then** the extension is the final segment ("md") and the base name is everything before it ("note.draft").
4. **Given** a focused file with no extension, **When** the agent reads the result, **Then** the extension is empty and the name equals the base name.
5. **Given** a focused file whose path or name contains non-ASCII characters, **When** the agent reads the result, **Then** those characters are returned faithfully.

---

### User Story 2 - Distinguish "nothing focused" from a focused file, without an error (Priority: P1)

An automation agent that runs when the workspace is empty, or when every pane has been closed, asks for the focused file and receives a clear "no focused file" answer rather than a failure. The agent can branch cleanly on the absence of focus instead of having to catch and interpret an error.

**Why this priority**: "Nothing focused" is a common, ordinary state of the workspace, not an exceptional one — an empty workspace, all panes closed, or a non-file view in front. A read tool that errored on this state would force every caller to wrap the call in failure handling just to discover the unremarkable fact that no file is open. Distinguishing presence from absence as two ordinary success outcomes is co-essential with US1; the two together form the minimal honest contract of the surface.

**Independent Test**: With no file focused (close all panes / start from an empty workspace), request the focused file. Verify the response is a clear, typed "no focused file" result — a success indicating absence — and not an error, and that a caller can tell it apart from a focused-file result programmatically without parsing prose.

**Acceptance Scenarios**:

1. **Given** no file is focused (empty workspace or all panes closed), **When** the agent requests the focused file, **Then** it receives a clear "no focused file" result rather than an error.
2. **Given** a "no focused file" result, **When** the caller inspects it, **Then** it is programmatically distinguishable from a focused-file result (a presence indicator / empty payload), so the caller can branch without parsing text.
3. **Given** a non-file view is in front (a plugin panel or other non-file workspace view), **When** the agent requests the focused file, **Then** it receives the same "no focused file" result, because no *file* is focused — the non-file view is not reported.

---

### User Story 3 - Confirm focus before acting, with a documented timing limitation (Priority: P2)

An automation agent that is about to run an operation against the focused file first reads which file is focused, then targets that same file by its returned path so it does not accidentally change the wrong file. The agent understands that the focus answer describes the moment of the lookup, not the moment of the follow-up action.

**Why this priority**: P1 gives the read; P2 makes the read *useful as a safety check*. The feature's core motivation — "confirm what's focused before changing it … reducing the risk of changing the wrong file" — depends on two properties: (a) the returned path is a usable locator the agent can hand to a follow-up operation, and (b) the agent knows the answer is a point-in-time snapshot that may go stale. Without the documented timing limitation, an agent could read focus, the user could switch files, and the agent could then act on a file the user is no longer looking at while believing it confirmed the target. It is P2 rather than P1 because the raw read is demonstrable without the round-trip framing, but in practice it ships alongside US1.

**Independent Test**: With a note focused, read the focused file, then run a follow-up operation that targets the returned path; verify it operates on the intended file. Separately, read the focused file, change focus, then act on the previously returned path; verify the outcome reflects that the focus answer described the moment of the lookup, and that the tool's documentation states this timing limitation.

**Acceptance Scenarios**:

1. **Given** a note is focused, **When** the agent reads the focused file and then targets that same file by its returned path, **Then** it operates on the intended file.
2. **Given** the focused file changes after the agent reads it, **When** the agent later acts on the previously focused file, **Then** the result reflects that the focus answer describes the moment of the lookup, not the moment of the follow-up action.
3. **Given** the tool's documentation, **When** a caller reads it, **Then** the point-in-time / snapshot nature of the focus answer is documented, so callers know to re-confirm rather than treat the answer as a lock.

---

### User Story 4 - Target a named vault, with typed errors for unaddressable vaults (Priority: P2)

A user has several Obsidian windows open across different vaults. An automation agent requests the focused file for a named vault so it reads focus from the right window. When the named vault does not exist, the agent receives a clear error rather than a misleading empty result.

**Why this priority**: P1/P2 above answer "what is focused" for the vault the agent is already pointed at. US4 adds explicit vault addressing for the multi-window case and the typed-error contract that keeps a wrong or unknown vault name from masquerading as "nothing focused". It is P2 because the single-vault read is demonstrable on its own, but the safety value — never letting an unaddressable vault look like an empty workspace — makes it more than a nice-to-have. The underlying substrate routes every focus read to Obsidian's currently focused vault regardless of the requested name (upstream limitation B1), so naming a vault that is registered but not the focused one cannot be honoured by reading some other window; it must fail loudly rather than return the focused vault's file mislabeled as the requested vault's.

**Independent Test**: With one vault focused, request the focused file naming that focused vault and verify it returns that vault's focused file. Request the focused file for a vault name that is not registered with Obsidian and verify a typed error (not an empty/no-focused result). Request the focused file for a vault that is registered but is not the currently focused vault and verify a typed error distinguishable from the unregistered case.

**Acceptance Scenarios**:

1. **Given** multiple Obsidian windows are open across different vaults and the named vault is the currently focused one, **When** the agent requests the focused file for that named vault, **Then** the result reflects that vault's focused file.
2. **Given** a vault name that does not exist (is not registered with Obsidian), **When** the agent requests the focused file for it, **Then** the agent receives a clear typed error rather than a misleading empty result.
3. **Given** a vault that is registered but is not the currently focused vault, **When** the agent requests the focused file for it, **Then** the agent receives a typed error indicating the vault must be the focused vault first, programmatically distinguishable from the unregistered-vault error of scenario 2, and no focused-file data from the wrong vault is returned.
4. **Given** no vault is named, **When** the agent requests the focused file, **Then** the result reflects the currently focused vault's focused file (the named-vault input is optional).

---

### Edge Cases

- **Nothing focused (empty workspace, all panes closed)**: per FR-005, the read returns a typed "no focused file" success result — a deliberate absence answer — not an error and not a fabricated file. Distinguishable from a focused-file result per FR-006.
- **A non-file view is in front (plugin panel, graph view, or other non-file workspace view)**: per FR-005 / FR-018, this maps to the "no focused file" result, because no *file* is focused; the non-file view itself is not reported (out of scope).
- **Focused file has an extension**: per FR-002, name = base name + extension; e.g. name "note.md" → base name "note", extension "md".
- **Focused file name contains several dots ("note.draft.md")**: per FR-002, the extension is the final dot-delimited segment ("md") and the base name is everything before that final dot ("note.draft").
- **Focused file has no extension (no dot in the name)**: per FR-003, the extension is empty and the name equals the base name.
- **Focused file path or name contains non-ASCII characters**: per FR-004, the characters are returned faithfully as the workspace reports them, with no lossy transformation (cf. the project's Unicode-faithful-lookup discipline).
- **Focus changes between the read and a later action**: per FR-008, the answer describes focus at the moment of the lookup; the point-in-time / snapshot nature is documented so callers re-confirm rather than treat the answer as a lock. The tool provides no focus-pinning or locking.
- **Named vault is not registered with Obsidian**: per FR-010, surfaces as a typed vault-unknown error (`CLI_REPORTED_ERROR` + `details.code: "VAULT_NOT_FOUND"` + `details.reason: "unknown"`), not a "no focused file" result.
- **Named vault is registered but not the currently focused vault**: per FR-011, surfaces as a typed vault-not-focused error (`CLI_REPORTED_ERROR` + `details.code: "VAULT_NOT_FOUND"` + `details.reason: "not-open"`, the `"not-open"` reason reused with the broadened "not the focused vault" semantic, documented), distinguishable from the unregistered case, because the substrate can only read the focused vault (B1).
- **Obsidian is not running**: the read cannot be performed; the failure surfaces through the existing CLI-bridge failure path (the cohort's binary-not-found / CLI-reported / cold-start handling), not a silent "no focused file". The tool does not launch Obsidian.
- **Unknown extra input field**: per FR-012, rejected at the input-validation boundary with a typed error naming the offending field (strict-mode schema, cohort parity). Nothing is reported.

## Requirements *(mandatory)*

### Functional Requirements

#### Focused-file reporting and field derivation

- **FR-001**: When a file is focused in the active Obsidian workspace, System MUST report that file's vault-relative path, its name, its base name, and its extension, each describing the focused file.
- **FR-002**: System MUST derive the reported fields so that the name equals the base name followed by the extension. The extension is the final dot-delimited segment of the name, and the base name is everything before that final dot; for a name containing several dots (e.g. "note.draft.md"), the extension is the last segment ("md") and the base name is the remainder ("note.draft").
- **FR-003**: When the focused file's name has no extension (contains no dot, or the substrate reports an empty extension), System MUST report an empty extension and a name equal to the base name.
- **FR-004**: System MUST return path and name characters faithfully, including non-ASCII characters, with no lossy transformation — the reported values match what the workspace reports for the focused file (consistent with the project's Unicode-faithful-lookup discipline).

#### Nothing-focused contract

- **FR-005**: When no file is focused — an empty workspace, all panes closed, or a non-file view in front — System MUST return a typed "no focused file" result: a successful response that indicates the absence of a focused file. System MUST NOT raise an error and MUST NOT fabricate a file for the nothing-focused state.
- **FR-006**: The "no focused file" result MUST be programmatically distinguishable from a focused-file result (for example via a presence indicator or an empty payload), so a caller can branch on presence-vs-absence without parsing prose.

#### Confirm-before-acting and timing

- **FR-007**: The reported path MUST be usable directly as a locator to target the same file in a subsequent operation (cohort parity — the path is the resolved vault-relative path the read/write tools accept), so an agent can confirm focus and then act on the confirmed file.
- **FR-008**: System MUST document, in the tool's help, that the focus answer describes the moment of the lookup and may be stale by the time a follow-up action runs (point-in-time snapshot — the project's active-mode timing/TOCTOU concern applied uniformly). System MUST NOT imply that reading focus pins, locks, or reserves the file.

#### Vault addressing and routing

- **FR-009**: System MUST accept an optional vault identifier naming the vault whose focused file to read. When omitted, System MUST report the focused file of the currently focused Obsidian vault.
- **FR-010**: When a vault is named and it is not registered with Obsidian, System MUST fail with `code: "CLI_REPORTED_ERROR"` + `details.code: "VAULT_NOT_FOUND"` + `details.reason: "unknown"` — a clear typed error, never a "no focused file" result and never focused-file data from another vault.
- **FR-011**: When a vault is named and registered but is not the currently focused Obsidian vault, System MUST fail with `code: "CLI_REPORTED_ERROR"` + `details.code: "VAULT_NOT_FOUND"` + `details.reason: "not-open"`, programmatically distinguishable (via `details.reason`) from the unregistered case (FR-010), and MUST NOT return the focused vault's file mislabeled as the requested vault's. The `"not-open"` reason carries the broadened "not the focused vault" semantic (closed OR open in a background window but not focused), documented in the tool's help. This guard is required because the substrate routes every focus read to Obsidian's currently focused vault regardless of the requested vault name (upstream limitation B1). No new top-level error code and no new `details.reason` value are introduced (Constitution Principle IV streak preserved; the `details.reason` enum stays `unknown | not-open`, cohort parity with the open-file precedent).
- **FR-011a**: System MUST order the vault failure classifiers `VAULT_NOT_FOUND(unknown)` → `VAULT_NOT_FOUND(not-open)` (per ADR-014), so a request naming an unregistered vault never reports a misleading not-focused result and vice versa.

#### Input validation and response shape

- **FR-012**: System MUST reject unknown extra input fields at the input-validation boundary with a typed validation error naming the offending field (strict-mode schema; cohort parity with the existing typed tools). Nothing is reported.
- **FR-013**: System MUST return the focused file's data only and MUST NOT echo the input vault identifier back in the response. This is a pure-read surface; the read-vs-write echo convention reserves locator echo for mutating tools (the reported path/name/base name/extension are the *queried result*, not an echo of caller input).
- **FR-014**: System MUST introduce no new top-level error code; every failure reuses an existing top-level code with `details` sub-discrimination (per ADR-015). The Obsidian-not-running condition surfaces through the existing CLI-bridge failure path (the cold-start / closed-Obsidian cohort behaviour), not a silent "no focused file".

#### Out of scope at the contract boundary

- **FR-015**: System MUST NOT report pane, split-layout, or leaf information (which pane holds the file, or how the workspace is split). The result describes the focused file only.
- **FR-016**: System MUST NOT report cursor position, selection, or the focused heading or block within the file. The result targets the file as a whole.
- **FR-017**: System MUST NOT change which file is focused. The feature reports focus only; it never moves it.
- **FR-018**: System MUST NOT report focus for views that are not files (e.g. focused plugin panels or non-file workspace views); such a state maps to the "no focused file" result of FR-005.

### Key Entities

- **Focused file**: The file Obsidian currently treats as active in the focused vault. Described by four identity fields — vault-relative path, name, base name, extension — derived per FR-002 / FR-003. The subject of the read.
- **Focus result**: The successful response. Either carries the focused file's four fields, or indicates "no focused file" (FR-005); the two states are programmatically distinguishable (FR-006). Returns queried data only, with no echo of the input vault (FR-013).
- **File-name parts**: The relationship name = base name + extension (FR-002), with the extension being the final dot-delimited segment and the base name the remainder; an extension-less name yields an empty extension and name = base name (FR-003).
- **Vault identifier**: An optional input naming the vault whose focus to read (FR-009). Must be the currently focused vault for the read to land; an unregistered name yields the vault-unknown error (FR-010) and a registered-but-not-focused name yields the vault-not-focused error (FR-011). Reading focus never switches vaults (FR-017).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An automation can determine the currently focused file — its path, name, base name, and extension — in a single call, without the user naming the file.
- **SC-002**: For every focused file, the relationship name = base name + extension holds in 100% of cases, including names with several dots and names with no extension.
- **SC-003**: Non-ASCII characters in the focused file's path and name round-trip faithfully (no lossy transformation) in 100% of cases.
- **SC-004**: When nothing is focused, the caller receives a distinguishable "no focused file" result — never an error and never a fabricated file — in 100% of empty-workspace / non-file-view states, and can branch on it without parsing text.
- **SC-005**: The reported path can be used directly as the locator for a follow-up operation and targets the same file (when focus is unchanged between the read and the action) in 100% of cases.
- **SC-006**: Every vault-addressing failure (vault unregistered; vault registered but not focused) surfaces as a typed, programmatically distinguishable error — never a misleading "no focused file" result and never focused-file data from the wrong vault.
- **SC-007**: The tool's documentation states the point-in-time / snapshot limitation of the focus answer, so callers know to re-confirm before acting on a stale result.

## Assumptions

- **Eval-composed read, no native subcommand (tool name plan-refinable, e.g. `get_focused_file`)**: The upstream Obsidian Integrated CLI exposes no native "focused file" subcommand; reading focus is performed by a small, bug-safe `eval` against Obsidian's workspace (the active-file accessor, which already exposes a file's path, name, base name, and extension as distinct fields — the four FR-001 fields map directly with no re-parsing needed). The argv carries only the optional vault name, far below the IPC ceiling (ADR-009), so the read is bug-safe. ADR-010 (mirror the upstream subcommand name) is N/A because there is no upstream subcommand to mirror — this tool joins the eval-composed cohort alongside `open_file` rather than the CLI-wrapper cohort. The plan phase confirms the exact eval template and the final tool name against the authorised test vault per `.memory/test-execution-instructions.md`.
- **Focused-vault routing — read counterpart of the open-file guard (B1)**: The eval substrate ignores the `vault=` parameter and always executes against Obsidian's currently focused vault (`.architecture/Obsidian CLI - Upstream Issues and Limitations.md`, B1). The contract is therefore "the requested vault, when named, must be the currently focused vault" (FR-011), reusing the `open_file` (spec 057) active focused-vault guard pattern verbatim: resolve the named vault's base path via the registry (`resolveVaultPath`, ADR-009) and compare it against the focused vault's base path; a mismatch is the FR-011 error (`VAULT_NOT_FOUND` / `not-open`, broadened semantic), an unregistered name is the FR-010 error (`VAULT_NOT_FOUND` / `unknown`), classifier-ordered per FR-011a / ADR-014.
- **Vault is optional, default = focused vault (informed guess, plan/clarify-refinable)**: Unlike `open_file` (which requires a vault because it acts on a specific file), this read defaults to the currently focused vault when no vault is named (FR-009), because the natural question "what is focused right now?" should not require the caller to already know the focused vault. When a vault *is* named, the focused-vault guard (FR-011) applies. The plan/clarify phase may revisit whether the vault input should be required for cohort parity; the optional default is recorded so the choice is deliberate.
- **Nothing-focused is a success state, not an error (settled from the user story)**: Per the explicit user requirement, the empty-workspace / all-panes-closed / non-file-view states return a typed "no focused file" success result (FR-005), distinguishable from a focused-file result (FR-006), so callers branch cleanly instead of handling a failure.
- **Non-file views map to "no focused file" (informed guess)**: When a non-file workspace view is in front (plugin panel, graph view, etc.), the active-file accessor reports no file, so the tool returns the "no focused file" result (FR-005 / FR-018) rather than describing the view. Reporting non-file views is explicitly out of scope.
- **File-name part derivation follows the substrate's accessor semantics**: The base name / extension split (FR-002 / FR-003) follows Obsidian's own file-identity fields (the active-file accessor exposes name, base name, and extension directly), so the multi-dot and no-extension rules match Obsidian's behaviour rather than a re-implemented parser. Leading-dot / dotfile naming (e.g. a name that begins with a dot) follows the same substrate semantics; the plan phase characterises any such boundary against the authorised test vault.
- **Pure-read echo convention (no input echo)**: This is a read-only surface, so the response returns the focused file's queried data only and does not echo the input vault identifier (FR-013), consistent with the project convention that pure-read tools return data only while mutating tools echo the locator for write-verification.
- **Timing / TOCTOU is documented, not enforced**: The focus answer is a point-in-time snapshot (FR-008); the tool documents this and provides no locking or focus-pinning. This applies the project's active-mode timing/TOCTOU concern uniformly to the new surface rather than retrofitting a per-tool guarantee.
- **Error vocabulary — zero new top-level codes (Constitution Principle IV)**: Every failure reuses an existing top-level code with `details` sub-discrimination per ADR-015 — `VAULT_NOT_FOUND` (`unknown` / `not-open`) for vault addressing (FR-010 / FR-011), a validation error for unknown fields (FR-012), and the existing CLI-bridge failure path for Obsidian-not-running (FR-014). No new error code or `details.reason` value is introduced.
- **Obsidian must be running**: The read requires a running Obsidian with the target vault focused; the tool does not launch Obsidian or change the focused vault. With Obsidian not running, the failure surfaces through the existing CLI-bridge failure path (the cold-start / closed-Obsidian cohort), not a silent "no focused file".
- **Out-of-scope boundaries are contract obligations, not deferred work**: Pane / split / leaf information (FR-015), cursor / heading / block position (FR-016), changing focus (FR-017), and non-file-view reporting (FR-018) are out of scope by the user's explicit statement and are enforced as negative requirements, not future increments.
