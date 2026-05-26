# Feature Specification: Fix Prepend Reliability

**Feature Branch**: `047-fix-prepend-reliability`
**Created**: 2026-05-26
**Status**: Draft
**Input**: User description: "Fix Prepend Reliability — the `prepend` tool (shipped in @marwansaab/obsidian-cli-mcp v0.7.4) reliably succeeds for any content payload up to its documented size cap, instead of the current three-way deterministic failure mode (silent no-op with a misleading success envelope, wrapper timeout after 10 seconds, or Obsidian host-process crash with a modal dialog the user must dismiss manually) that fires whenever the content payload exceeds approximately 10 KB through the wrapper."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reliable success within the documented cap (Priority: P1)

An agent calls `prepend` with a content payload anywhere from 1 byte up to the published schema cap (24576 characters) against a target note in a registered vault. The call returns a structured success envelope carrying the bytes-written delta, and the file's on-disk byte count exactly matches the pre-state plus the content plus the wrapper-inserted separator. No silent no-op masquerades as a success. No 10-second wrapper timeout fires. No Obsidian host-process crash modal appears.

**Why this priority**: This is the primary defect the bug surfaces. Today the tool fails dramatically below the published cap with one of three observable shapes — including a silent no-op that returns a misleading success envelope (the worst failure mode for an agent, because the agent has no way to learn the write did not happen). Restoring the documented success contract is the minimum viable fix; without it the published cap is misleading and the tool is unsafe for any caller that trusts the success envelope.

**Independent Test**: Drive a sequence of 50 prepend calls (each against a different target note, each with a content payload of approximately 10 KB) against a registered test vault. Verify each call returns a structured success envelope, verify each target note's post-state byte count matches the expected value, and verify no timeouts and no host-process crashes occur anywhere in the sequence. Delivers value standalone: with this story alone, callers can trust prepend's documented contract for realistic-sized content.

**Acceptance Scenarios**:

1. **Given** a target note exists in a registered vault AND a content payload of N characters where 1 ≤ N ≤ 24576, **When** an agent calls `prepend` with that vault, path, and content, **Then** within 10 seconds the agent receives a structured success envelope reporting a positive bytes-written delta AND the file's on-disk byte count equals the pre-state byte count plus the content byte length plus the wrapper-inserted separator length.
2. **Given** 50 different target notes in a registered vault, **When** an agent calls `prepend` against each note in turn with a content payload of approximately 10 KB per call, **Then** every call returns a structured success envelope AND every target note's post-state is byte-correct AND zero silent no-ops, zero wrapper timeouts, and zero host-process crashes occur anywhere in the sequence.
3. **Given** the same target note is focused in the Obsidian editor, **When** an agent calls `prepend` twice in rapid succession (less than 100 milliseconds apart) with content payloads of approximately 10 KB each, **Then** both calls resolve to either a clean success-or-structured-failure pair with last-write-wins applying to successes AND the on-disk state matches the published last-write-wins contract AND neither call produces a silent no-op.

---

### User Story 2 - Structured failure surfacing — no silent no-ops (Priority: P2)

When the wrapper detects a failure of any kind — substrate timeout, vault not found, missing target file, path traversal, oversized content, locator validation, host-process spawn failure, host-process abnormal exit, or any other condition that prevents the write from completing — the response is a structured error envelope carrying a recognisable failure-mode discriminator. The response is never a success envelope reporting zero bytes written when no bytes were written to disk.

**Why this priority**: This story preserves data integrity even when other fixes are incomplete. An agent that receives a structured error envelope can branch its remediation; an agent that receives a misleading success envelope cannot. The silent-no-op shape is the worst failure mode the bug surfaces because it produces silent data loss without any signal the caller can detect short of inspecting the file system. Once this story holds, agents can reason correctly about failures even if the underlying success path remains partially broken.

**Independent Test**: Inject failures at each wrapper boundary the spec enumerates (oversized content, vault-not-found, missing target file, locator validation failure, host-process timeout, host-process abnormal exit). For each injected failure, assert the response is a structured error envelope with a recognisable failure-mode discriminator AND assert the response is never a success envelope reporting zero bytes written when no bytes were actually written. Delivers value standalone: callers gain a reliable signal channel for failures without depending on the success path being repaired.

**Acceptance Scenarios**:

1. **Given** any failure the wrapper detects (per the enumerated list above), **When** the failure occurs, **Then** the response is a structured error envelope carrying a recognisable failure-mode discriminator that names the failure mode.
2. **Given** any prepend call attempt, **When** the call completes with no bytes written to disk, **Then** the response MUST NOT be a success envelope reporting zero bytes written — that response shape is forbidden as a failure-masking anti-pattern.

---

### User Story 3 - Host-process stability (Priority: P3)

The Obsidian desktop application's main process remains responsive whenever an agent calls `prepend` through the wrapper, regardless of payload size. No modal crash dialog appears that requires manual dismissal by the user. Subsequent `prepend` calls do not exhibit degraded latency from a recent-crash recovery window.

**Why this priority**: Host-process crashes interrupt the user's editing workflow. The modal dialog requires manual dismissal — a foreground action that yanks the user out of whatever they were doing in Obsidian. The structured-failure story above makes the wrapper response correct; this story protects the user's editing session from the side-effects of wrapper bugs. Even an agent call that legitimately fails must not crash the host process.

**Independent Test**: Drive prepend calls against the wrapper across every payload-size bucket (well under the cap, at the cap, exactly at the cap, above the cap), observe Obsidian's main process throughout, and assert no modal crash dialog appears AND assert subsequent prepend calls complete in the normal latency window with no recent-crash recovery overhead. Delivers value standalone: the user's editing session is protected even when the prepend success path is still being repaired.

**Acceptance Scenarios**:

1. **Given** any prepend call attempt against any payload size (well under the cap, at the cap boundary, exactly at the cap, or above the cap), **When** the call completes regardless of outcome, **Then** Obsidian's main process remains responsive AND no modal crash dialog appears that requires user dismissal.
2. **Given** a prepend call has just completed, **When** the next prepend call begins within the normal latency window, **Then** the next call's wall-clock latency falls within the normal envelope with no recent-crash recovery overhead.

---

### User Story 4 - Over-cap rejection at the schema boundary (Priority: P4)

When an agent calls `prepend` with content exceeding the documented cap (24577 characters or larger), the wrapper rejects the call with a structured validation error before any host process is spawned. The error names the cap value and the actual content size. No file is modified on disk. No Obsidian dialog appears.

**Why this priority**: This is a defense-in-depth boundary — once the host-process stability story (P3) holds, the over-cap rejection is no longer load-bearing for crash prevention, but it remains the right shape for boundary validation. Rejecting at the schema boundary is faster (sub-second), cheaper (no spawn), and produces a more informative error than letting the host process attempt the write. The existing schema cap should keep firing; this story confirms the boundary remains correct as the underlying behaviour is repaired.

**Independent Test**: Call `prepend` with a content payload of 24577 characters and observe that within 1 second the agent receives a structured validation error naming the cap value and the actual content size, no file is modified on disk, and no Obsidian dialog appears. Delivers value standalone: callers receive a precise rejection signal at the schema boundary regardless of the deeper fix's progress.

**Acceptance Scenarios**:

1. **Given** content exceeding the documented cap (a payload of 24577 characters or larger), **When** an agent calls `prepend` with that content, **Then** within 1 second the agent receives a structured validation error naming the cap value and the actual content size AND no file is modified on disk AND no Obsidian dialog appears.

---

### Edge Cases

- **Cap boundary (exactly 24576 characters)**: must succeed per User Story 1; must not fall through into the over-cap rejection path. The boundary character — accepted, not rejected.
- **Cap boundary (exactly 24577 characters)**: must be rejected per User Story 4; the first character above the cap is the rejection threshold.
- **Empty content (zero characters)**: governed by the existing schema rule (the spec does not extend that rule); whatever the current schema rejects or accepts at zero characters remains unchanged.
- **Non-ASCII content where character count ≠ byte count**: the cap is documented in characters, not bytes. The wrapper must measure against the documented unit consistently — if a payload is below the cap in characters but expands to more than the cap in bytes when encoded, the in-cap success path still applies. The post-state byte count assertion in User Story 1 must account for the encoded byte length, not the character count.
- **Concurrent calls against the same target note**: User Story 1 acceptance scenario 3 specifies last-write-wins for successes and clean structured failures otherwise; neither call may produce a silent no-op.
- **Host process not running at call time**: structured failure with a recognisable discriminator per User Story 2; no silent no-op.
- **Host process becomes unresponsive mid-call**: structured failure (substrate timeout discriminator) per User Story 2; no silent no-op, no wrapper hang beyond the published timeout window.
- **Path traversal in target path**: structured failure with locator-validation discriminator per User Story 2; no spawn, no host-process risk.
- **Vault not found in registry**: structured failure with vault-not-found discriminator per User Story 2; no silent no-op.
- **Missing target file in a valid vault**: structured failure with file-not-found discriminator per User Story 2; no silent no-op.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The wrapper MUST return a structured success envelope (carrying a positive bytes-written delta and a post-state byte count) for every prepend call whose content payload size is between 1 character and the documented cap (24576 characters), inclusive, against a registered vault and an existing target note.
- **FR-002**: The wrapper MUST return a structured validation error within 1 second when the content payload exceeds the documented cap (a payload of 24577 characters or larger), and that rejection MUST occur before any host process is spawned. The error MUST name the cap value and the actual content size.
- **FR-003**: The wrapper MUST NOT return a success envelope reporting zero bytes written when no bytes were actually written to disk. That response shape is forbidden as a failure-masking anti-pattern.
- **FR-004**: The wrapper MUST NOT cause an Obsidian host-process crash modal dialog to appear for any prepend call attempt, regardless of payload size (well under the cap, at the cap, exactly at the cap, or above the cap).
- **FR-005**: Every failure mode the wrapper detects MUST surface as a structured error envelope carrying a recognisable failure-mode discriminator. The enumerated failure modes include: substrate timeout, vault not found, missing target file, path traversal, oversized content, locator validation, host-process spawn failure, and host-process abnormal exit.
- **FR-006**: The wrapper MUST complete each prepend call (success or structured failure) within the published timeout window. Calls MUST NOT block the tool-call slot beyond that window.
- **FR-007**: Successful prepend calls MUST produce a post-state byte count that equals the pre-state byte count plus the content's encoded byte length plus the wrapper-inserted separator's encoded byte length, per the existing default-separator rule.
- **FR-008**: The fix MUST preserve the published schema cap at 24576 characters. The cap MUST NOT be lowered as part of this change.
- **FR-009**: Subsequent prepend calls MUST NOT exhibit degraded wall-clock latency caused by a recent-crash recovery window. The wall-clock latency of any prepend call MUST fall within the normal latency envelope established for healthy calls.
- **FR-010**: Concurrent prepend calls against the same target note MUST resolve to a clean success-or-structured-failure pair with last-write-wins semantics for successes, per the published last-write-wins contract. Neither call may produce a silent no-op.

### Key Entities

- **Prepend call input**: A triple of (vault locator, target note path, content payload). Validated against the published schema at the wrapper boundary; rejected before spawn if outside published bounds.
- **Success envelope**: A structured response carrying a positive bytes-written delta and a post-state byte count. The only legal shape for a call that actually wrote bytes to disk.
- **Structured error envelope**: A response carrying a recognisable failure-mode discriminator (per the existing `UpstreamError` code surface). The only legal shape for a call that did not write bytes to disk, regardless of the underlying cause.
- **Failure-mode discriminator**: A stable code value naming the wrapper-detected failure class (substrate timeout, vault not found, missing target file, path traversal, oversized content, locator validation, host-process spawn failure, host-process abnormal exit). Used by callers to branch their remediation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of prepend calls with content payloads between 1 character and 24576 characters (inclusive) against a registered vault and an existing target note complete with a structured success envelope and a byte-correct post-state within the published timeout window.
- **SC-002**: A regression run of 50 consecutive prepend calls against 50 different target notes in a registered vault, each with a content payload of approximately 10 KB, completes with 0 silent no-ops, 0 wrapper timeouts, and 0 Obsidian host-process crash dialogs across the full sequence.
- **SC-003**: 100% of over-cap prepend calls (content payloads of 24577 characters or larger) return a structured validation error naming the cap and the actual size within 1 second, with 0 files modified on disk and 0 Obsidian dialogs appearing.
- **SC-004**: 0 Obsidian host-process crash dialogs appear across the regression test surface that covers every payload-size bucket (well under the cap, at the cap boundary, exactly at the cap, above the cap).
- **SC-005**: 0 wrapper responses across the regression test surface return a success envelope reporting zero bytes written when no bytes were actually written to disk.
- **SC-006**: The published schema cap remains at 24576 characters after the fix lands. The cap value before and after the fix is byte-identical at the published surface.
- **SC-007**: Wall-clock latency of any prepend call that follows a prior prepend call falls within the normal latency envelope, with no recent-crash recovery overhead observable in the sequence.

## Assumptions

- The documented schema cap (24576 characters) remains the published contract. The fix preserves the cap value at its current setting; lowering the cap is explicitly out of scope.
- The current CLI-wrap architecture for prepend remains unchanged. Repathing the prepend tool from CLI-wrap to filesystem-direct is a separate, larger architectural change tracked elsewhere.
- The upstream Obsidian CLI's prepend subcommand is unchanged. Direct-CLI bisect established that the upstream handles content up to at least 60008 argv bytes cleanly against the same host; the wrapper-side bug is downstream of the upstream behaviour.
- The wrapper-inserted separator policy (newline or configured equivalent) is preserved. The fix does not change separator semantics.
- The existing `UpstreamError` code surface (per Constitution Principle IV) is the failure-mode discriminator channel. No new top-level error codes are introduced; failures map onto existing codes, consistent with the project's no-new-error-codes streak.
- Active-mode prepend failures (the deterministic "Vault not found" failure when no caller-supplied locator is present) are tracked under a separate bug. If the wrapper-side root cause turns out to be shared between the large-content surface and the active-mode surface (cross-evidence collected during the original investigation suggests this is likely), the active-mode fix may land in the same change set — but this spec's acceptance criteria do not include active-mode behaviour as a hard requirement.
- The over-cap rejection path's empirical regression test already exists and is independently runnable. This fix does not need to author that test.
- Diagnostic instrumentation used during the investigation is temporary and does not ship with the production wrapper, unless a specific instrumentation surface earns its keep as a permanent observability addition.
- Other typed tools in the cli-wrap cohort that may exhibit related failure modes are scoped via separate per-tool BIs surfaced by future investigations; this spec is scoped to `prepend` specifically.
