# Feature Specification: Fix Write Gaps

**Feature Branch**: `020-fix-write-gaps`
**Created**: 2026-05-12
**Status**: Draft
**Input**: User description: "Fix two contract regressions in the `write_note` operation introduced by the recent reliability overhaul (016-reliable-writer): (1) short-form-name targets now land at the vault root without the standard markdown extension, breaking Obsidian's note recognition and wikilink resolution; (2) existing-file collision rejections no longer carry the precise filesystem-level diagnostic indicator that distinguishes a collision from other write-failure conditions, breaking caller branching logic. Both gaps were caught during acceptance testing of the overhaul; both must be closed without changing the operation's top-level error code roster or input contract."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Short-form-name writes produce a properly-named markdown file (Priority: P1)

An agent creating a fresh note identifies the target by its short-form name only — a single segment, with neither a folder prefix nor a file extension. The operation places the resulting file at the vault root with the standard markdown extension appended, and the success response reports the resolved location (the segment plus the extension). The file is then recognised by Obsidian as a markdown note and is reachable from other notes via wikilink to the segment.

**Why this priority**: P1 because this is a regression against a previously-shipped contract — the predecessor surface created vault-root markdown notes from short-form names, downstream automation depends on the resulting files being recognised by Obsidian, and the regression silently produces extension-less files that the Obsidian file explorer hides and wikilinks cannot resolve to. Without this fix, every agent using short-form-name creates ships broken output. Recovery is not feasible caller-side without each caller writing its own normalisation glue.

**Independent Test**: invoke the operation against a real Obsidian vault with `file` set to a short-form name (e.g. `"Acceptance Probe"`) and fresh content. Verify (a) the response reports a `path` equal to `Acceptance Probe.md`; (b) a file with that exact vault-relative path exists on disk and contains the supplied content byte-for-byte; (c) Obsidian's metadata cache, after the operation's natural cache-freshness handling, recognises the file as a markdown note (i.e. it appears in `app.vault.getMarkdownFiles()`); (d) a wikilink `[[Acceptance Probe]]` from another note in the same vault resolves to the newly-created file.

**Acceptance Scenarios**:

1. **Given** a vault with no file at the target name, **when** the operation is called with `file: "Acceptance Probe"` and a fresh content payload, **then** the response is `{ created: true, path: "Acceptance Probe.md" }` and a file at `<vault-root>/Acceptance Probe.md` contains the supplied content byte-for-byte.
2. **Given** the same successful write, **when** the vault is inspected through Obsidian, **then** the new file is recognised as a markdown note (appears in the file explorer, listed in `app.vault.getMarkdownFiles()`).
3. **Given** the same successful write and an existing note containing a wikilink `[[Acceptance Probe]]`, **when** the link is resolved by Obsidian's metadata cache, **then** the link resolves to `<vault-root>/Acceptance Probe.md`.
4. **Given** an explicit vault-relative path with the standard markdown extension already present (e.g. `path: "Subfolder/Note.md"`), **when** the operation is called, **then** the response reports `path` verbatim as supplied — no double-extension, no behavioural change to the path-based identifier form.
5. **Given** a short-form name containing characters Obsidian accepts in note names but that look extension-like (e.g. `file: "version_1.2.3"` — periods inside the segment), **when** the operation is called, **then** the response reports `path: "version_1.2.3.md"` (the standard markdown extension is appended to the segment in its entirety; internal periods are part of the note name, not extension boundaries).

---

### User Story 2 — Existing-file collision rejections carry the precise diagnostic indicator (Priority: P1)

An agent attempts to write to a target whose location is already occupied by a file, with collision protection enabled (the default). The operation refuses to overwrite. The rejection response carries both the existing top-level structured error code AND a precise filesystem-level diagnostic indicator that distinguishes an existing-file collision from other filesystem-level write failures (out-of-space, permission denied, read-only, missing-parent, and so on). The diagnostic indicator follows the same naming convention used by the operation's other filesystem-level failure responses, so a caller's branching logic can read one shape regardless of the underlying failure cause.

**Why this priority**: P1 because callers that already branch on the underlying filesystem-level condition (e.g. retry-with-rename on collision, surface-to-user on permission denial, abort-batch on out-of-space) cannot distinguish these cases without the precise diagnostic. The top-level error code alone groups collisions under a single bucket but does not connect the rejection back to the same shape callers read for other filesystem-level errors. The regression breaks existing automation that switched on the diagnostic. Recovery is not feasible caller-side because the underlying filesystem condition is not preserved in any other field of the response.

**Independent Test**: write a fresh note at path P. Issue a second call to path P with collision protection enabled (default). Inspect the rejection response: the top-level structured error code is the existing collision code, AND a nested diagnostic field carries the precise indicator for an existing-file collision (the same field name and value-vocabulary used for other filesystem-level failures from the same operation — out-of-space, permission-denied, read-only). Verify that the existing file's content is unchanged after the rejection. Then issue a third call to path P with collision protection explicitly disabled; verify the write succeeds and the file's content is replaced.

**Acceptance Scenarios**:

1. **Given** a file already exists at the target location, **when** the operation is called with collision protection enabled (the default), **then** the rejection response carries the existing top-level structured error code for collisions AND a nested diagnostic field whose value is the precise filesystem-level indicator for an existing-file collision (the standard POSIX errno name for the condition).
2. **Given** the same rejection, **when** a caller inspects the nested diagnostic field, **then** the field's name and value-vocabulary follow the same convention used by the operation's other filesystem-level failure responses (e.g. the response shape for out-of-space, permission-denied, read-only) — a single nested-field shape that callers can branch on regardless of the underlying failure cause.
3. **Given** the same rejection, **when** the on-disk file is inspected, **then** its content is byte-for-byte the same as before the rejected call — no overwrite, no auto-renamed sibling produced anywhere in the vault.
4. **Given** a file already exists at the target location, **when** the operation is called with collision protection explicitly disabled, **then** the operation succeeds, the file's content is replaced with the new content, and the response carries the standard success envelope (no rejection, no diagnostic field).

---

### Edge Cases

- **Short-form name that, after appending the standard extension, collides with an existing file at the vault root**: the operation behaves identically to an explicit path collision — collision protection enabled rejects with the structured error code plus the precise diagnostic indicator per Story 2; collision protection disabled overwrites. The short-form-name path resolution (Story 1) happens before collision detection (Story 2); both fixes compose without special-case interaction.
- **Short-form name with the standard markdown extension already present** (e.g. `file: "Notes.md"`): governed by the existing input contract, which is unchanged by this feature. This spec does not introduce new schema rules around extension presence in `file`; whether the existing schema accepts, rejects, or normalises this shape is preserved verbatim from the prior surface. Documented as an assumption.
- **Short-form name with a folder separator** (e.g. `file: "Folder/Note"`): governed by the existing input contract, which is unchanged. The short-form-name fix in Story 1 applies only when the existing schema accepts the input as a short-form identifier; if the existing schema routes the input through the path-based identifier form instead, the path-based behaviour (verbatim, no extension appended) applies, not Story 1's behaviour.
- **Active-mode writes**: the active mode resolves the focused file's full vault-relative path through the operation's internal active-file resolution. Active mode does not produce a "short-form name" input shape, so Story 1's resolution rule does not apply. Story 2's precise-diagnostic rule applies uniformly across modes — an active-mode write to a focused file is not a fresh-target write and does not encounter the collision path; Story 2 affects only specific-mode writes against an already-occupied target.
- **Existing-file collision against an empty existing file**: same rejection shape as collision against a populated file — content size of the existing file is irrelevant to the diagnostic. Empty existing content is preserved unchanged.
- **Other filesystem-level errors during a short-form-name write** (out-of-space, permission-denied, read-only, missing-parent that the operation's auto-create cannot resolve): surface through the existing filesystem-level error code with the existing precise diagnostic indicator. The Story 1 path-resolution rule applies before the write is attempted; resolution itself does not introduce new filesystem-level errors.
- **Path-based identifier without the standard markdown extension** (e.g. `path: "Subfolder/Note"`): governed by the existing input contract, which is unchanged. This feature does not silently append the extension on path-based inputs; Story 1's appending rule is scoped to the short-form-name input shape.

## Requirements *(mandatory)*

### Functional Requirements

#### Short-form-name target resolution

- **FR-001**: When the operation is called with a short-form-name input (a single segment with neither folder prefix nor file extension), the operation MUST resolve the target's vault-relative path to `<segment>.md` (the segment followed by the standard markdown extension `.md`).
- **FR-002**: When a short-form-name input has resolved to its vault-relative path per FR-001, the on-disk write MUST land at `<vault-root>/<segment>.md` — that is, at the vault root, with the resolved name.
- **FR-003**: After a successful short-form-name write, the response's `path` field MUST report the resolved vault-relative path (e.g. `"Acceptance Probe.md"` for `file: "Acceptance Probe"`), not the original short-form identifier.
- **FR-004**: When the operation is called with a path-based identifier already including the standard markdown extension (e.g. `path: "Subfolder/Note.md"`), the operation MUST treat the path verbatim — no extension appending, no double-extension, no normalisation. The response's `path` field MUST report the path verbatim as supplied.
- **FR-005**: The resulting file's recognition by Obsidian as a markdown note (i.e. its inclusion in `app.vault.getMarkdownFiles()`, its appearance in the file explorer, its reachability via wikilinks to the segment) MUST follow from FR-001's appending rule and the operation's existing post-write cache-freshness handling. No new cache-invalidation work is introduced.

#### Precise diagnostic indicator on existing-file collision

- **FR-006**: When the operation is called against a target whose location is already occupied by a file and collision protection is enabled (the default), the rejection response MUST carry the existing top-level structured error code for collisions unchanged. This feature does not introduce, rename, or retire any top-level error code.
- **FR-007**: When the same rejection is returned, the response MUST additionally carry a precise filesystem-level diagnostic indicator — the standard POSIX errno name for an existing-file collision (`"EEXIST"`) — placed in the same nested-field shape used by the operation's other filesystem-level failure responses.
- **FR-008**: The nested-field shape carrying the diagnostic indicator in FR-007 MUST be identical (same field name, same value-vocabulary convention) to the shape used by the operation's other filesystem-level failure responses — i.e. the shape carrying `"ENOSPC"`, `"EACCES"`, `"EROFS"`, `"ENOENT"` for out-of-space, permission-denied, read-only, missing-vault-root respectively. Callers MUST be able to read a single nested-field shape regardless of the underlying filesystem-level failure cause.
- **FR-009**: When a collision is rejected per FR-006/FR-007, the existing file's content on disk MUST remain byte-for-byte unchanged, and no auto-renamed sibling file MUST be created at any location in the vault.
- **FR-010**: When the operation is called against an already-occupied target with collision protection explicitly disabled, the operation MUST succeed and replace the existing file's content — the precise-diagnostic rule does not apply to this case, and the response MUST carry the standard success envelope.

#### Cross-cutting non-impact

- **FR-011**: This feature MUST NOT change the operation's top-level error code roster — no new codes added, no existing codes renamed or retired. Collision rejections continue to use the existing collision code; filesystem-level failures continue to use the existing filesystem-failure code.
- **FR-012**: This feature MUST NOT change the operation's input contract — no new parameters, no removed parameters, no changed parameter types, no changed per-mode rules. The short-form-name resolution in FR-001 is a response-shaping and on-disk-target-shaping change, not an input-shape change.
- **FR-013**: This feature MUST NOT change the operation's success response shape — `{ created: boolean, path: string }`. FR-003's change to the `path` field is a value-shaping change for short-form-name inputs only, not a structural shape change.
- **FR-014**: This feature MUST NOT change the public input contract, output shape, or error roster of any other operation in the bridge surface (`read_note`, `read_property`, `read_heading`, `find_by_property`, `delete_note`, `obsidian_exec`, `help`, `write_property`, `list_files`).
- **FR-015**: This feature MUST NOT restore the predecessor's silent-auto-rename behaviour on collision. The collision rejection remains the contract; only the diagnostic shape on the rejection is enriched.
- **FR-016**: This feature MUST NOT restore the retired `template` parameter or any other parameter retired by the 016 overhaul. Migration paths documented under the 016 surface remain in effect.
- **FR-017**: This feature MUST NOT introduce architectural changes to the operation's underlying write mechanism — the temp-file-then-rename atomic write, the path-safety canonical-root check, the lazy vault-registry probe, and the post-write cache-freshness handling are all preserved unchanged.

#### Documentation and discoverability

- **FR-018**: The progressive-disclosure help for the operation MUST be updated to reflect both fixes — explicitly documenting (a) the short-form-name → `<segment>.md` resolution rule, with a worked example, and (b) the precise filesystem-level diagnostic indicator on collision rejection, with the field name and value vocabulary aligned with the existing filesystem-failure shape.

### Key Entities *(include if feature involves data)*

- **Short-form name**: a single-segment identifier supplied by the caller as the operation's `file` parameter, containing neither a folder separator nor a file extension. The unit of input that this feature resolves to `<segment>.md` at the vault root.
- **Resolved location**: the vault-relative path produced by the operation's target-resolution step — for short-form-name inputs, `<segment>.md`; for path-based inputs, the path verbatim. Reported in the success response's `path` field.
- **Precise filesystem-level diagnostic indicator**: the standard POSIX errno name (e.g. `"EEXIST"` for existing-file collision, `"ENOSPC"` for out-of-space, `"EACCES"` for permission-denied, `"EROFS"` for read-only) carried in the nested-field shape of the operation's failure responses. The unit of diagnostic information that callers branch on.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of operation invocations supplied with a short-form-name input produce a file at `<vault-root>/<segment>.md` and a response whose `path` field equals `<segment>.md`. Measured by post-write filesystem inspection and response-payload assertion.
- **SC-002**: 100% of files produced by short-form-name invocations are recognised by Obsidian as markdown notes — they appear in `app.vault.getMarkdownFiles()` after the operation's natural cache-freshness handling and are reachable from another note via wikilink to the segment. Measured by Obsidian-side assertion against the post-write vault state.
- **SC-003**: 100% of operation invocations supplied with a path-based identifier already including the standard markdown extension report `path` verbatim in the response with no double-extension. Measured by response-payload assertion against the input.
- **SC-004**: 100% of collision rejections (the operation called against an already-occupied target with collision protection enabled) carry both the existing top-level structured collision error code AND a nested diagnostic field whose value is the standard POSIX errno name for an existing-file collision (`"EEXIST"`). Measured by response-payload assertion.
- **SC-005**: 100% of collision rejections preserve the existing file's content byte-for-byte and produce no auto-renamed sibling file anywhere in the vault. Measured by post-rejection filesystem inspection.
- **SC-006**: 100% of operation invocations against an already-occupied target with collision protection explicitly disabled succeed and replace the file's content; none of those invocations carry a diagnostic field for an existing-file collision in the response. Measured by response-payload assertion and post-write filesystem inspection.
- **SC-007**: The nested-field shape carrying the diagnostic indicator for an existing-file collision is identical (same field name, same value-vocabulary convention) to the nested-field shape carrying the diagnostic indicator for at least one other filesystem-level failure response from the same operation (out-of-space, permission-denied, read-only, missing-vault-root). Verifiable by inspection of the operation's failure-response schema.
- **SC-008**: 0% of operation invocations covered by this feature produce changes to the top-level error code roster (no new codes added, no existing codes renamed, no existing codes retired). Verifiable by inspection of the operation's published error roster before and after the change.
- **SC-009**: 0% of operation invocations covered by this feature produce changes to the operation's input contract (parameter set, types, per-mode rules). Verifiable by inspection of the operation's published input schema before and after the change.
- **SC-010**: The public input contract, output shape, and error roster of every other operation in the bridge surface (`read_note`, `read_property`, `read_heading`, `find_by_property`, `delete_note`, `obsidian_exec`, `help`, `write_property`, `list_files`) are unchanged by this feature. Verifiable by published-surface inspection.
- **SC-011**: The progressive-disclosure help for the operation reflects both fixes — the short-form-name → `<segment>.md` resolution rule with a worked example, and the precise filesystem-level diagnostic indicator on collision rejection with the field name and value vocabulary aligned with the existing filesystem-failure shape. Verifiable by help-payload inspection against a checklist.

## Assumptions

- **The existing input contract continues to govern the shape of `file` and `path` inputs unchanged.** This feature does not introduce new schema rules around extension presence in `file` (e.g. `file: "Notes.md"`) or folder-separator presence in `file` (e.g. `file: "Folder/Note"`). Whichever shape the existing schema accepts and routes through the short-form-name path versus the path-based path is preserved verbatim. The Story 1 resolution rule applies only on inputs the existing schema routes through the short-form-name path.
- **The standard markdown extension is `.md`** — Obsidian's documented and configured default for note files. Vaults with non-default note-extension configuration are out of scope for this feature; behaviour under such configurations is governed by whatever resolution the existing operation already performs and is not addressed here.
- **The operation's other filesystem-level failure responses already carry a precise diagnostic indicator in a nested-field shape.** This is the existing surface property the collision diagnostic aligns with. Verified at 016-reliable-writer's `FS_WRITE_FAILED` edge cases (`details.errno: "ENOSPC"`, `"EACCES"`, `"EROFS"`, `"ENOENT"`); the field name and value vocabulary used there is the convention the collision rejection now joins.
- **The standard POSIX errno name for an existing-file collision is `"EEXIST"`** — the value Node's `fs.writeFile` raises with the `wx` flag when the target already exists. Cross-platform behaviour matches; Windows surfaces the same errno through Node's `fs` layer.
- **Recognition of a markdown note by Obsidian** is the natural consequence of the file having the `.md` extension at a vault-relative path Obsidian indexes. No additional Obsidian-side configuration is required for the operation's output to be recognised; the operation's existing post-write cache-freshness handling is sufficient to make the file visible to `app.vault.getMarkdownFiles()` and to wikilink resolution.
- **Acceptance testing of the 016-reliable-writer overhaul caught both gaps before this feature was authored.** The two gaps are scoped to contract details the predecessor surface upheld and the overhaul inadvertently broke; both fixes are narrow corrections, not new functionality.
- **No connector-client carve-out work is in scope.** Behaviour against connector clients that flatten line endings or otherwise mutate payload bytes in transit is tracked separately under the strict-rich-client carve-out work and not affected by this feature.
- **No symlink, network-mount, or read-only-filesystem behaviour change.** Whatever falls out naturally from the operation's underlying write mechanism (preserved unchanged by FR-017) continues to apply; this feature does not introduce new handling for these conditions.
