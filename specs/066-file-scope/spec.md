# Feature Specification: File Scope

**Feature Branch**: `066-file-scope`
**Created**: 2026-06-30
**Status**: Draft
**Input**: User description: "Add File Scope — the find-and-replace tool gains a single-note scope. A caller can confine a find-and-replace operation to exactly one note — either by naming the note, or by targeting whichever note is currently open in the editor. Every other note in the vault, in any folder, is left untouched. The single-note scope is mutually exclusive with the existing folder scope and with the vault-wide default."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Confine find-and-replace to a single named note (Priority: P1)

A caller makes a surgical edit by naming exactly one note as the scope of a find-and-replace operation. The caller names the note the same way the other note-level tools accept a note — by its vault-relative path, or by its plain note name. When the operation runs (preview or commit), matches and replacements occur only in that note; every other note in the vault, in any folder, is neither inspected nor changed. The affected-notes set carries at most one entry: none when the pattern matched nothing in the named note, or just the named note when at least one match was found.

**Why this priority**: This is the safety-critical core of the feature. Today a caller who wants to change one note must craft a pattern that happens to be globally unique across the whole vault (or the named folder) — a brittle prerequisite that routinely fails for boilerplate text shared by many notes, and one mis-scoped call can rewrite every matching note at once. On a vault without version control that corruption is unrecoverable. A structural single-note limit removes the brittle prerequisite entirely: the scope, not the pattern, guarantees the blast radius. With only this story shipped, the feature already delivers a strictly safer surgical-edit capability than the vault-wide default it sits beside.

**Independent Test**: Stand up a vault with a shared pattern present in several notes across multiple folders. Issue the operation scoped to one named note (by name, then again by vault-relative path) as a preview, and verify the response references only that note and reports its per-note occurrence count. Re-issue as a commit and verify only the named note changed on disk while every other note is byte-for-byte and mtime unchanged. Separately, issue the operation scoped to a named note where the pattern does not appear, and verify a successful empty result (zero affected notes), not an error.

**Acceptance Scenarios**:

1. **Given** a vault where the pattern appears in several notes across folders, **When** the caller scopes the operation to one existing named note and runs a preview, **Then** the response references only that note and no other note is inspected or modified.
2. **Given** the same vault, **When** the caller scopes to the named note and runs a commit, **Then** only the named note is updated on disk and every other note is byte-for-byte and mtime unchanged.
3. **Given** the operation succeeds against a single named note, **When** it returns, **Then** the affected-notes set contains at most one entry — none when the pattern matched nothing in the named note, the named note when at least one match was found.
4. **Given** the caller names the target note by its vault-relative path, **When** the call is made, **Then** the tool accepts it the same way the other note-level tools accept a path.
5. **Given** the caller names the target note by its plain note name, **When** the call is made, **Then** the tool resolves it the same way the other note-level tools resolve a name.
6. **Given** the caller names the target note using a bracketed link form (`[[Note]]`), **When** the call is made, **Then** the tool rejects it with the same clear error the other note-level tools give for that form, and nothing is read or changed.

---

### User Story 2 - Confine find-and-replace to the currently-open note (Priority: P2)

A caller editing the note they currently have open in front of them runs find-and-replace against just that note, without typing its path. The operation resolves whichever note is open, confines matches and replacements to it, and the response reports that note's location. When no note is open, the caller gets a clear error telling them to open a note or name one explicitly, and nothing is read or changed.

**Why this priority**: This closes a long-standing gap — the other note-level operations can already act on the open note, but find-and-replace cannot, despite being one of the operations a caller most often wants to run against the note in front of them. Quick interactive edits stay seamless: the caller does not have to re-type a path they can already see in the editor. P2 because P1 already delivers the safety-critical single-note limit for callers willing to name the note; the open-note target is the ergonomic completion of that limit, building on the same single-note machinery.

**Independent Test**: With the single-note scope (P1) in place, open a known note in the editor and issue the operation targeting the open note (without naming a path). Verify matches and replacements occur only in the open note and the response reports that note's location. Close all notes (no active file) and issue the same call; verify the caller receives the clear no-active-note error and that no note was read or changed.

**Acceptance Scenarios**:

1. **Given** a note is currently open in the editor, **When** the caller targets the open note (without naming a path) and runs find-and-replace, **Then** matches and replacements occur only in the open note and the response reports that note's location.
2. **Given** no note is currently open, **When** the caller targets the open note, **Then** the caller gets a clear error telling them to open a note or name one explicitly, and nothing is read or changed.

---

### User Story 3 - Reject conflicting and unresolvable scopes before any read (Priority: P3)

A caller who supplies more than one scope, or who names a note that does not exist, gets a clear typed error before any note is inspected or changed. Supplying the single-note scope together with the folder scope is rejected as mutually exclusive. Targeting the open note together with a named note or a folder is rejected with an error naming the conflicting input. Naming a note that does not exist is rejected with an error naming the missing note.

**Why this priority**: These guard rails turn ambiguous or impossible requests into early, legible failures instead of silent mis-scoping. They protect the safety contract of the first two stories — a caller who mistakenly supplies two scopes learns immediately rather than having one scope silently win. P3 because P1 and P2 each deliver value on their own; the guard rails harden the combined surface and prevent the mutually-exclusive scopes from being interpreted in a way the caller did not intend.

**Independent Test**: With P1 and P2 in place, issue the operation with both a single-note scope and a folder scope and verify a typed error states the two are mutually exclusive with nothing read or changed. Issue the operation with the open-note target plus a named note, and again with the open-note target plus a folder, and verify a typed error names the conflicting input with nothing read. Issue the operation naming a note that does not exist and verify a typed error names the missing note with nothing changed.

**Acceptance Scenarios**:

1. **Given** the caller supplies both the single-note scope and the folder scope, **When** the call is made, **Then** the caller gets a clear typed error that the two scopes are mutually exclusive, and nothing is read or changed.
2. **Given** the caller targets the open note and also supplies a named note, **When** the call is made, **Then** the caller gets a clear typed error naming the conflicting input, and nothing is read.
3. **Given** the caller targets the open note and also supplies a folder scope, **When** the call is made, **Then** the caller gets a clear typed error naming the conflicting input, and nothing is read.
4. **Given** the caller names a note that does not exist, **When** the call is made, **Then** the caller gets a clear typed error naming the missing note, and nothing is changed.

---

### Edge Cases

- **Single-note scope, pattern matches nothing in the target**: the response is a successful empty result with zero affected notes, not an error — parity with the existing "matched nothing" behaviour, narrowed to the one note.
- **Single-note scope, preview confirms the blast radius**: when previewing under a single-note scope, the preview affects at most one note, giving the caller early confirmation the scope is correct before commit.
- **Named target resolves to a non-`.md` file** (e.g. a `.canvas`, `.base`, attachment): the existing `.md`-only eligibility filter still applies — the target is not eligible and the operation surfaces a typed error rather than scanning or rewriting a non-note file.
- **Named target lies under a `.`-prefixed directory** (e.g. `.obsidian/…`): the existing hidden-directory skip still applies — the target is not eligible; the `.`-prefixed-directory rule overrides the extension match.
- **Open-note target while a non-`.md` file is focused** (e.g. a PDF or canvas is the active file): the eligibility filter applies to the resolved open file — a non-`.md` active file surfaces a typed error rather than being scanned.
- **Named target by path that escapes the vault** (`../`, leading `/`/`\`, drive-letter prefix, control characters, or an in-vault symlink resolving outside): the existing two-layer path-safety posture carries over unchanged — structurally-unsafe input is rejected at the input-validation boundary; a canonical-level escape surfaces the existing path-escape error and emits the security event.
- **Single-note scope plus the `vault` field naming an unknown or registered-but-closed vault**: the existing vault-resolution errors carry over unchanged — the note is resolved within the named (or focused) vault, and an unknown/closed vault surfaces the existing vault-not-found discriminators.
- **Single-note scope plus the safe-upper-bound guard**: the configured occurrence ceiling still applies — if the single target note alone contains more occurrences than the bound, the operation refuses for both preview and commit, with no note modified.
- **Single-note scope under commit with mid-commit occurrence-count drift**: the existing two-scan drift detection still applies, scoped to the one note — when the note's occurrence count changes between the two scans of the commit, the commit refuses and no note is modified.
- **Bracketed-link form supplied as the named target** (`[[My Note]]`): rejected at the input-validation boundary with the same wikilink-bracket error the note-level cohort gives; the caller is told to supply the bare note name.
- **Open-note target supplied together with an explicit vault**: the open note determines the vault, so an explicit vault alongside the open-note target is a conflicting input and is rejected (parity with the note-level cohort's active mode, which forbids an explicit vault).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The operation MUST accept an optional single-note scope that identifies exactly one target note. When supplied, matches and replacements MUST occur only in that note; every other note in the vault, in any folder, MUST be neither inspected nor modified. The single-note scope is purely additive — it adds a new scoping dimension alongside the existing vault-wide default and folder (subfolder) scope from BI-038.
- **FR-002**: The single-note scope MUST address the target note the same way the note-level cohort (`append_note`, `write_note`, `prepend`, `patch_block`, `patch_heading`) addresses a note: by its vault-relative path (parity with the cohort's `path` locator) OR by its plain note name (parity with the cohort's `file` locator). Both forms MUST be subject to the same structural path-safety check the cohort applies.
- **FR-003**: The single-note scope MUST reject the bracketed wikilink form (a value containing `[[` or `]]`) with the same clear error the note-level cohort gives for that form (the cohort's wikilink-bracket rejection message), surfaced at the input-validation boundary before any note is read. No note MUST be modified when this error is raised.
- **FR-004**: The operation MUST accept an open-note target that confines the operation to whichever note is currently open in the editor, without the caller naming a path. Resolution of the open note MUST reuse the note-level cohort's focused-file resolution. When the operation succeeds against the open note, the response MUST report that note's location.
- **FR-005**: When the open-note target is supplied and no note is currently open, the operation MUST surface a clear typed error telling the caller to open a note or name one explicitly, and MUST NOT read or change any note. This error MUST reuse the note-level cohort's existing no-active-file top-level error code (`ERR_NO_ACTIVE_FILE`) — no new top-level error code is introduced.
- **FR-006**: The single-note scope and the folder (subfolder) scope MUST be mutually exclusive. When the caller supplies both, the operation MUST surface a clear typed error that the two scopes are mutually exclusive, MUST surface it before any note is read, and MUST NOT read or change any note.
- **FR-007**: The open-note target MUST be mutually exclusive with naming a note AND with the folder scope AND with an explicit vault. When the caller supplies the open-note target together with any of a named note, a folder scope, or an explicit vault, the operation MUST surface a clear typed error naming the conflicting input, MUST surface it before any note is read, and MUST NOT read or change any note.
- **FR-008**: When the caller names a note (by path or by name) that does not exist in the resolved vault, the operation MUST surface a clear typed error naming the missing note, MUST NOT silently return an empty result, and MUST NOT change any note. This error MUST reuse an existing top-level error code (Constitution Principle IV).
- **FR-009**: When the operation succeeds against a single-note scope (named or open-note), the affected-notes set MUST contain at most one entry — zero entries when the pattern matched nothing in the target note, exactly one entry (the target note) when at least one match was found.
- **FR-010**: The single-note scope MUST honour the existing preview/commit contract unchanged: a preview MUST list at most the one target note with its proposed changes and MUST modify nothing on disk; a commit MUST apply the replacement to at most the one target note. A preview under a single-note scope MUST affect at most one note, giving the caller early confirmation the scope is correct.
- **FR-011**: All existing find-and-replace matching semantics and safety guards MUST apply unchanged within the single-note scope — pattern mode (`literal`/`regex`), case-sensitivity control, fenced-code-block and HTML-comment skip-by-default with their independent opt-ins, zero-width-match skipping, single-line match scoping, the safe-upper-bound guard, the two-scan commit-time drift detection, per-note atomic write, and byte-for-byte preservation of unmatched content. The single-note scope narrows WHICH notes are examined; it MUST NOT change HOW matches are found, counted, or written.
- **FR-012**: The single-note scope MUST honour the existing eligibility filters: the target note MUST resolve to a `.md` file (case-insensitive on the extension) that does not traverse any `.`-prefixed directory. A named or open-note target that resolves to a non-`.md` file, or to a file under a `.`-prefixed directory, MUST be surfaced as a typed error (or, equivalently, treated as no eligible note) and MUST NOT be scanned or rewritten.
- **FR-013**: The existing two-layer path-safety posture (structural rejection at the input-validation boundary plus a runtime canonical-path check against the resolved vault root) MUST apply to the named-note path target. A structurally-unsafe target MUST be rejected at the input-validation boundary; a canonical-level escape MUST surface the existing path-escape top-level error and emit the existing security event. No new top-level error code is introduced.
- **FR-014**: When neither the single-note scope nor the open-note target is supplied, the operation MUST preserve the existing vault-wide-or-folder behaviour from BI-038 exactly — no existing call changes meaning. Backward compatibility for unscoped calls is a hard requirement; this feature is strictly additive.
- **FR-015**: Vault selection under the single-note scope MUST follow the existing find-and-replace contract: when the caller names a note, the existing optional `vault` field selects the vault (absent ⇒ focused-vault default; present ⇒ resolved via the existing vault registry, with the existing unknown/closed-vault discriminators); when the caller targets the open note, the open note determines the vault and an explicit vault MUST be rejected per FR-007.
- **FR-016**: Every new error state this feature introduces (open-note-with-no-note-open, single-note/folder conflict, open-note/named-or-folder/vault conflict, missing named note, bracketed-link rejection, ineligible target) MUST reuse an existing top-level error code, discriminated where needed by a stable sub-code the caller can branch on without parsing human-readable prose. No new top-level error code is introduced — the project's zero-new-top-level-codes streak (Constitution Principle IV) MUST be preserved.

### Key Entities

- **Single-note scope**: The new optional request dimension that confines the operation to exactly one note. Realised in one of two forms — a **named target** (by vault-relative path or by plain note name) or an **open-note target** (whichever note is currently open). Mutually exclusive with the folder scope and with the vault-wide default, and (for the open-note form) with an explicit vault.
- **Target note**: The single eligible `.md` note the operation is confined to under a single-note scope. Either resolved from the caller's named target or from the currently-open note.
- **Open-note target**: The form of the single-note scope that resolves to whichever note is currently open in the editor, reusing the note-level cohort's focused-file resolution; surfaces the no-active-note error when no note is open.
- **Affected-notes set** *(constrained by this feature)*: Under a single-note scope this set is bounded to at most one entry — the existing preview/commit response shape is unchanged, but its cardinality is structurally capped at one.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Under a single-note scope (named or open-note), 100% of preview and commit invocations leave every note other than the target byte-for-byte and mtime unchanged — verifiable by snapshotting all non-target notes before and after the call.
- **SC-002**: Under a single-note scope, the affected-notes set never exceeds one entry across all invocations — zero when the pattern matched nothing in the target, one when it did.
- **SC-003**: Targeting the open note with a note open succeeds and reports that note's location 100% of the time; targeting the open note with no note open returns the no-active-note typed error 100% of the time, with nothing read or changed.
- **SC-004**: Every conflicting or unresolvable scope — single-note plus folder, open-note plus named note, open-note plus folder, open-note plus explicit vault, and the missing-named-note case — is rejected before any note is read, surfaced as a distinct typed-error discriminator, and 0% of these rejections modify any note.
- **SC-005**: 100% of existing unscoped calls (vault-wide and folder-scoped) behave byte-identically to their pre-feature behaviour — no existing call changes meaning.
- **SC-006**: A note named by plain name and a note named by vault-relative path resolve identically to the way the note-level cohort resolves those forms; the bracketed-link form is rejected with the cohort's wikilink-bracket message 100% of the time.
- **SC-007**: No new top-level error code is introduced by this feature — every new error state reuses an existing top-level code discriminated by a stable sub-code (Constitution Principle IV streak preserved).

## Assumptions

- **Note-addressing parity** *(reasonable default — feature demands the scope "feel native rather than bolted on")*: The single-note scope reuses the note-level cohort's addressing vocabulary — a vault-relative path locator (parity with the cohort's `path`), a plain-note-name locator (parity with the cohort's `file`, including `[[`/`]]` bracket rejection), and an open-note target (parity with the cohort's active mode). The exact input-field plumbing — whether the scope is expressed by adopting the cohort's `target_mode` primitive, by dedicated locator fields layered alongside the existing `subfolder` and `vault` fields, or another shape — is a planning decision; the spec fixes the behaviour, not the field names.
- **Open-note resolution** *(reasonable default)*: The open-note target resolves the focused note through the same focused-file `obsidian eval` resolution the note-level file cohort already uses (`resolveActiveFocusedFile` / `FOCUSED_FILE_TEMPLATE`), and the no-note-open case surfaces the cohort-uniform `ERR_NO_ACTIVE_FILE` error. This reuses existing infrastructure rather than introducing a new resolution path.
- **Vault selection under the named-note scope** *(reasonable default)*: Naming a note keeps find-and-replace's existing optional-`vault` semantics — absent ⇒ focused-vault default, present ⇒ resolved via the existing vault registry. The note-level cohort's "specific mode requires `vault`" rule is a target-mode artifact and is NOT inherited; find-and-replace retains its focused-vault default so that an unscoped-vault single-note call resolves the note within the focused vault. The open-note target forbids an explicit vault (the open note determines the vault).
- **Matching semantics and safety guards carry over unchanged**: The single-note scope is a pre-filter on the set of notes examined. Every downstream behaviour from BI-038 — region skip/opt-in, case handling, regex/literal mode, zero-width skip, line scoping, the safe-upper-bound guard, two-scan drift detection, atomic per-note write, byte-for-byte preservation — is unchanged by this feature.
- **Error-code discipline** *(locked-direction; precise triples deferred to clarify)*: No new top-level error code is introduced. The no-note-open case reuses `ERR_NO_ACTIVE_FILE`; the bracketed-link rejection reuses the cohort's standard validation channel; path-escape reuses the existing path-escape code; vault-not-found reuses the existing vault-not-found discriminators. The precise `(top-level code, details.code, details.reason)` triples for the new scope-conflict and missing-note states are locked during the `/speckit-clarify` session, parity with how BI-038 locked its error triples.
- **ADR-003 scope tension** *(flagged for the plan phase)*: BI-038 FR-013 deliberately excluded `target_mode` / the `@active` sentinel from find-and-replace, citing ADR-003's statement that target-mode discipline "explicitly does not reach inherently-vault-wide surfaces." This feature reintroduces a file-targeted dimension (a named single note and an open-note target) into that vault-wide surface. Reconciling the open-note target with ADR-003's stated scope is a deliberate architectural decision for `/speckit-plan` — it likely warrants a new ADR or an ADR-003 amendment rather than a silent override. The feature requirement itself (open-note targeting) is not in question; only the mechanism by which it is reconciled with the existing target-mode discipline.

## Dependencies

- **BI-038 `find_and_replace`**: the existing tool whose preview/commit contract, folder/vault-wide scoping, region skip/opt-in, safe-upper-bound guard, two-scan drift detection, atomic write, and path-safety posture this feature extends. The feature is additive to that surface.
- **Note-level addressing infrastructure**: the shared active/specific locator resolution (`_active-file.ts` — `resolveActiveFocusedFile`, `FOCUSED_FILE_TEMPLATE`, `ERR_NO_ACTIVE_FILE`), the target-mode schema and its path-safety, and the cohort's wikilink-bracket rejection — reused so the single-note scope addresses notes identically to the rest of the note-level surface.

## Out of Scope

- **A match-count cap** that rejects a call when the match count would exceed a stated maximum — a complementary but distinct safeguard. The single-note scope is a structural limit; a cap is a defensive assertion. (The existing safe-upper-bound guard from BI-038 still applies within the single-note scope; this clause excludes a NEW per-call cap.)
- **A match-count assertion** that rejects a call when the actual match count differs from a number the caller asserts up front — complementary, but it addresses pattern-uniqueness rather than note-uniqueness.
- **Making preview the enforced safety gate** before any commit — a separate behaviour-change concern, untouched here.
- **Changing the default behaviour when no scope is supplied** — vault-wide stays the default; this feature is purely additive.
- **Multi-note scoping** (a list of notes) — single-note is the safety-critical, most common shape.
- **Wildcard or glob single-note targets** — the folder scope already covers glob-shaped selection; the single-note target is one concrete note.
- **Retiring the current vault-wide / folder behaviour** — backward compatibility is preserved; this feature adds the single-note dimension alongside it.
