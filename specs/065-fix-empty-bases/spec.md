# Feature Specification: Fix Empty Bases

**Feature Branch**: `065-fix-empty-bases`  
**Created**: 2026-06-30  
**Status**: Draft  
**Input**: User description: "Fix Empty Bases — when an agent lists the Bases in a vault that contains no `.base` files, the listing returns an empty result (an empty list with a count of zero) instead of a single fake entry built from the underlying tool's 'No base files found in vault' message."

## Clarifications

### Session 2026-06-30

- Q: Empty-signal recognition strategy — positive `.base` filter, negative message-match, or hybrid? → A: **Positive filter.** On a successful (clean-exit) listing, keep only stdout lines ending in `.base` (matched case-insensitively); drop every other line (the informational empty-result message, blank lines, whitespace-only lines). Chosen for FR-002 wording-independence and Constitution Principle IV: membership is decided by the positive `.base` cue rather than by matching upstream copy, so it survives any future re-wording of the empty-result message with no code change, introduces no new error code, and leaves genuine failures to the existing upstream-failure path (evaluated before the clean-exit filter runs). Negative message-match re-couples to upstream wording and regresses FR-002 on re-word; a hybrid defensive cross-check adds branches with no acceptance-criterion payoff and risks the cross-check itself throwing on a benign re-word. The chosen rule matches the architecture's existing handler-side response-inspection idiom — inspect clean-exit stdout positively; let the CLI-failure path own errors.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Empty vault returns an honest empty result (Priority: P1)

An agent lists the Bases in a vault that contains zero `.base` files. The listing returns an empty list with a count of zero — no fake entry, no informational message masquerading as a Base name.

**Why this priority**: This is the defect. Today the listing reports one "Base" whose name is actually the underlying tool's informational message ("No base files found in vault"). Every downstream Bases operation rejects that fake name, and the count of one lies about the vault. Restoring the honest empty result is the whole point of the feature and the single most valuable slice — it makes the listing usable as a cheap "does this vault have any Bases?" probe.

**Independent Test**: Drive the listing against a vault with no `.base` files (real or simulated empty-result signal from the underlying tool) and confirm the result is an empty list with a count of zero. Fully testable on its own; delivers the core value with no dependency on the other stories.

**Acceptance Scenarios**:

1. **Given** a vault containing zero `.base` files, **When** an agent lists the Bases, **Then** the result is an empty list with a count of zero — no fake entry and no informational message in the list.
2. **Given** the underlying tool emits its empty-result message (the current "No base files found in vault" wording, or any future re-wording of that same empty signal), **When** the listing is produced, **Then** the empty-result signal is recognised and reported as an empty result rather than treated as a Base name.

---

### User Story 2 - Populated vault listing is unchanged (Priority: P1)

An agent lists the Bases in a vault that contains one or more `.base` files. The result is the same sorted list of Base names returned today, with the correct count — the fix introduces no regression on the normal path.

**Why this priority**: The fix is worthless if it breaks the populated path. Preserving today's behaviour for any non-empty vault is a co-equal correctness requirement; an empty-result fix that silently drops or reorders real Bases would be a worse defect than the one being fixed. Priority P1 because it must ship inseparably from Story 1.

**Independent Test**: Drive the listing against a vault with a known set of `.base` files and confirm the returned names and count match today's output exactly (same membership, same sort order). Testable independently of Story 1.

**Acceptance Scenarios**:

1. **Given** a vault containing one or more `.base` files, **When** an agent lists the Bases, **Then** the result is the same sorted list of Base names returned today, with a count equal to the number of `.base` files.
2. **Given** a vault whose single `.base` file would, before the fix, have produced a count of one, **When** an agent lists the Bases, **Then** that one real Base is still listed with a count of one — the fix never mistakes a real single Base for the empty signal.

---

### User Story 3 - Genuine failures stay distinguishable from empty (Priority: P2)

An agent hits a real failure — the vault cannot be found, or the listing cannot be produced. The agent receives a clear failure that is plainly distinct from the empty-vault result, consistent with how the listing reports its other failures.

**Why this priority**: The empty-vault result and a genuine failure must never collapse into the same observable outcome, or the "count is zero" branch becomes unsafe (an agent would skip a vault that actually errored). Priority P2 because the listing already surfaces failures distinctly today; this story guards that the empty-result fix does not erode that distinction by swallowing a real error into an empty list.

**Independent Test**: Drive the listing into a real failure (unreachable vault, or an upstream error from the underlying tool) and confirm the agent receives a failure signal that is observably different from `{ empty list, count zero }`. Testable independently.

**Acceptance Scenarios**:

1. **Given** the vault cannot be found, **When** an agent lists the Bases, **Then** the agent receives a failure that is plainly distinct from the empty result and carries the same kind of error signal the listing already uses for that condition.
2. **Given** the underlying tool reports a genuine error while producing the listing, **When** an agent lists the Bases, **Then** the failure surfaces as an error — never as an empty list with a count of zero.

---

### Edge Cases

- **Future re-wording of the empty signal**: the underlying tool changes its "No base files found in vault" wording. The listing must still recognise the empty signal and report an empty result rather than regressing to one fake entry built from the new wording.
- **Single real Base**: a vault with exactly one `.base` file must still report a count of one. The empty-signal recognition must not be so broad that it mistakes a legitimate single Base for the informational message.
- **Informational line mixed with real paths**: if the underlying tool were ever to emit the informational message alongside one or more real `.base` paths, the real paths must be listed and counted; the informational line must not appear as a Base. (Today the message appears only in isolation; the listing must not depend on that staying true.)
- **Whitespace-only or blank output**: output that carries no real `.base` paths (blank, whitespace-only, or only the informational signal) must collapse to an empty list with a count of zero, never a fake entry.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When the vault contains zero `.base` files, the Bases listing MUST return an empty list with a count of zero.
- **FR-002**: On a successful (clean-exit) listing, the system MUST treat only lines that denote a real Base — lines ending in the `.base` extension, matched case-insensitively — as Base names, and MUST drop every other line, including the underlying tool's empty-result message (current "No base files found in vault" wording or any future re-wording), blank lines, and whitespace-only lines. Because membership is decided by the positive `.base` cue rather than by matching the message text, the empty-result signal is reported as "no Bases" independent of its wording.
- **FR-003**: The count returned by the listing MUST equal the number of real Base names in the list, and MUST never be inflated by a passed-through informational message.
- **FR-004**: When the vault contains one or more `.base` files, the listing MUST return the same membership and sort order it returns today, with the correct count — no regression on the populated path.
- **FR-005**: The empty-signal recognition MUST NOT misclassify a legitimate single real Base as the empty signal; a vault with exactly one `.base` file MUST report a count of one.
- **FR-006**: A genuine failure (vault not found, or the listing cannot be produced) MUST surface as a failure that is plainly distinct from the empty-vault result, consistent with how the listing reports its other failures today; a real failure MUST NEVER be reported as an empty list with a count of zero. The positive `.base` filter (FR-002) applies only to successful clean-exit output; genuine failures are detected and surfaced through the existing upstream-failure path **before** the line filter runs, so a failure can never be silently reduced to an empty list, and no new top-level error code is introduced.
- **FR-007**: The fix MUST be confined to the empty-vault listing path; it MUST NOT change other Bases-related capabilities, the names-only shape of each listed entry, or how the listing treats a named-vault argument.

### Key Entities *(include if feature involves data)*

- **Bases listing result**: the observable output of listing the Bases in a vault. Two attributes: the list of Base names (sorted, names-only) and a count. The count must always equal the length of the list. The empty result is `{ empty list, count zero }`; this entity must be cleanly distinguishable from a failure signal.
- **Empty-result signal**: the informational output the underlying tool emits when a vault has no `.base` files (currently the text "No base files found in vault"). It is not a Base and not a failure — it is the signal that the correct answer is an empty list. It is recognised structurally, by the absence of any `.base` line on a clean exit, **not** by matching its text.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Listing the Bases of a vault with zero `.base` files returns a count of zero in 100% of cases — never a count of one built from the informational message.
- **SC-002**: An agent can decide "this vault has zero Bases" purely from the returned count, with zero false positives (no real-Bases vault reports zero) and zero false negatives (no empty vault reports non-zero).
- **SC-003**: For every vault with one or more `.base` files, the returned names and count are identical to the pre-fix output — measured as zero membership differences and zero ordering differences across the regression set.
- **SC-004**: Genuine failures remain 100% distinguishable from the empty result — no failure condition is ever observed as `{ empty list, count zero }`.

## Assumptions

- The underlying tool emits a single, recognisable informational message when a vault has no `.base` files, and emits one Base path per line (no informational text intermixed) when the vault has Bases. The fix relies on the empty signal being distinguishable from a real `.base` path.
- A real Base name carries the `.base` extension; the informational empty-result message does not. The listing decides Base membership by this positive `.base` cue alone (a clean-exit line is a Base iff it ends in `.base`, case-insensitive) — it does **not** match the message text. This makes empty-signal recognition independent of the message's wording (FR-002) and avoids re-coupling to upstream copy. (Clarified 2026-06-30 — positive `.base` filter chosen over message-pattern matching; see Clarifications.)
- The documented contract already promises that an empty vault returns an empty list rather than an error; this feature makes the implementation honour that promise, so it is a defect fix rather than a contract change.
- Failure reporting (vault-not-found and upstream-error conditions) already exists and is unchanged by this feature; Story 3 guards that the empty-result fix does not erode the existing failure distinction.
- The named-vault argument's handling is a separate, shared concern and is explicitly out of scope; this feature does not alter it.

## Out of Scope

- Any change to other Bases-related capabilities; only the empty-vault listing path is in scope.
- Adding richer per-Base detail (created/modified times, size, view count) — the listing stays names-only.
- Changing how the listing treats a named-vault argument — that is a separate, shared concern.
