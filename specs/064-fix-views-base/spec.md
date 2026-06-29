# Feature Specification: Fix Views Base

**Feature Branch**: `064-fix-views-base`  
**Created**: 2026-06-29  
**Status**: Draft  
**Input**: User description: "Fix the views listing for a Base so it returns clean view names, and let an agent list the views of any Base in the vault by naming that Base — not only the Base currently open in Obsidian."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Clean view names that match a view query (Priority: P1)

An agent lists the views of a Base and immediately uses one of the returned names to query that view. Today every returned name carries an extra type label stuck on the end, so the name the listing hands back is not the name the query accepts — the agent has to clean it up first, and every successful listing produces names that nothing else accepts.

**Why this priority**: This defect affects *every* successful listing, including the one that already works (the open Base). Without it, the listing's output is unusable as input to the very operation it exists to feed. Fixing the name shape restores the listing's core purpose independently of any other change.

**Independent Test**: List the views of a Base, then pass each returned name verbatim into a query of that same Base. Every name is accepted with no cleanup step. Can be verified entirely against a Base that is open in Obsidian, with no dependence on the naming feature (Story 2).

**Acceptance Scenarios**:

1. **Given** a successful views listing, **When** the agent reads the result, **Then** every entry is a plain view name — no trailing type label, no extra delimiter, no trailing whitespace — matching exactly the name a view query accepts.
2. **Given** a Base whose view names contain spaces or punctuation, **When** the agent reads the result, **Then** those names are preserved exactly — only the injected type label is removed, never legitimate internal spaces or punctuation.
3. **Given** a returned view name, **When** the agent passes it verbatim as the view to query of the same Base, **Then** the query accepts the name without the agent transforming it.

---

### User Story 2 - List the views of a named Base (Priority: P2)

An agent that discovered a Base by name (for example, from the vault's Bases enumeration) wants to list that Base's views by naming it, without first asking a human to open that Base in Obsidian. An agent that already has the target Base open wants the existing no-argument behaviour to keep working unchanged.

**Why this priority**: This removes the human-in-the-loop dependency that blocks autonomous Base discovery → listing → query chains. It is additive: it extends reach beyond the open Base without removing the open-Base path. It depends on Story 1 only in that the names it returns must also be clean.

**Independent Test**: With Base A open in Obsidian, name a *different* Base B and request its views; the result describes B's views, not A's. Separately, with a Base open and no Base named, request views and confirm the result still describes the open Base.

**Acceptance Scenarios**:

1. **Given** an agent names an existing Base, **When** the listing returns, **Then** it describes the views of THAT Base, regardless of which Base was open in Obsidian before the call.
2. **Given** an agent names no Base and a Base is open in Obsidian, **When** the listing returns, **Then** it describes the open Base — unchanged from today.
3. **Given** an agent names a Base using the identifier the Bases enumeration returns, **When** the listing returns, **Then** it accepts that identifier without the agent transforming it.

---

### User Story 3 - Failure causes stay distinguishable (Priority: P3)

An agent that names a Base which does not exist, or names something that exists but is not a Base, wants a clear failure that tells it which — so it is never handed a crash, and is never silently given the views of whatever Base happened to be open.

**Why this priority**: The new naming surface (Story 2) introduces new ways to fail. Without distinguishable failures, an agent cannot tell "you named a Base that isn't there" from "nothing was open" from "that thing isn't a Base" — and the worst outcome (silently listing the open Base when the named one was wrong) must be impossible.

**Independent Test**: Name a Base that does not exist and confirm the failure is reported as "named Base not found", distinct from the "no Base open" failure. Name a target that exists but is not a Base and confirm the failure identifies the type mismatch. Confirm none of these silently fall back to listing the open Base.

**Acceptance Scenarios**:

1. **Given** an agent names a Base that does not exist, **When** the listing returns, **Then** the result is a clear failure that distinguishes "named Base not found" from "no Base open".
2. **Given** an agent names something that exists but is not a Base, **When** the listing returns, **Then** the result is a clear failure that identifies the type mismatch.
3. **Given** an agent names no Base and no Base is open, **When** the listing returns, **Then** the result is the existing "no Base open" failure — unchanged from today.
4. **Given** any of the failure paths above, **When** the failure surfaces, **Then** it is reported consistently with how the listing reports its other failures, and the different failure causes remain distinguishable from one another.

---

### Edge Cases

- **View name resembling a type label**: A Base whose view name legitimately ends with text that looks like the injected type label (or contains the delimiter the label uses) must not be over-trimmed. Only the injected type label is removed; legitimate trailing or internal text is preserved.
- **Named Base + Base open simultaneously**: When the agent names a Base *and* a different Base is open in Obsidian, the named Base always wins; the open Base is never substituted.
- **Wrong shape of named identifier**: A named identifier that is structurally invalid (e.g. not a Base locator at all) fails as an input-validation error, consistently with how the sibling Base operations reject malformed locators — distinct from "named Base not found".
- **Empty views quirk (known, not fixed here)**: Obsidian materialises a single default view for a Base that declares no views; the listing reports whatever the platform reports. This is documented as a known edge and is explicitly out of scope for this change.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The views listing MUST return each view as a plain view name with no trailing type label, no extra delimiter, and no trailing whitespace.
- **FR-002**: Each returned view name MUST be accepted verbatim as the view identifier by a query of the same Base — the agent MUST NOT have to transform the name before querying.
- **FR-003**: The listing MUST preserve legitimate internal and trailing spaces and punctuation that are part of a view's actual name; only the injected type label (and the delimiter that attaches it) is removed.
- **FR-004**: An agent MUST be able to name a target Base; when a Base is named, the listing MUST describe the views of THAT Base regardless of which Base is currently open in Obsidian.
- **FR-005**: When no Base is named and a Base is open in Obsidian, the listing MUST describe the open Base, unchanged from current behaviour.
- **FR-006**: When no Base is named and no Base is open, the listing MUST fail with the existing "no Base open" outcome, unchanged from current behaviour.
- **FR-007**: When a named Base does not exist, the listing MUST fail with a result that distinguishes "named Base not found" from "no Base open".
- **FR-008**: When the named target exists but is not a Base, the listing MUST fail with a result that identifies the type mismatch, distinct from both "named Base not found" and "no Base open".
- **FR-009**: A failure MUST never be resolved by silently substituting the open Base for a named Base that could not be used.
- **FR-010**: All failure paths MUST be reported consistently with how the listing reports its other failures, and the distinct failure causes MUST remain programmatically distinguishable from one another.
- **FR-011**: The listing MUST remain names-only (no per-view type, filter, or row-count detail added) and read-only (it MUST NOT mutate vault contents).

### Key Entities *(include if feature involves data)*

- **View name**: The agent-facing identifier of a single view inside a Base. The name the listing returns and the name a view query accepts are the same string. Carries no type label.
- **Base**: A Bases file in the vault. Named by the same identifier the vault's Bases enumeration returns (its vault-relative locator) — the identifier the view query and item-creation operations already accept.
- **Views listing result**: An ordered, names-only collection of view names for one Base, plus a count, OR a distinguishable failure describing why the listing could not be produced.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of view names returned by a successful listing are accepted unchanged by a subsequent query of that view on the same Base — zero names require a cleanup step.
- **SC-002**: An agent can list any Base's views using only the identifier obtained from the vault's Bases enumeration, with zero manual "open the Base in Obsidian" steps.
- **SC-003**: For a Base whose view names contain spaces or punctuation, the returned names are character-for-character identical to the names as defined in the Base, except for removal of the injected type label.
- **SC-004**: Each distinct failure cause — "named Base not found", "no Base open", and "named target is not a Base" — is reported with a signal an agent can branch on without parsing prose, and no two causes share the same signal.
- **SC-005**: When no Base is named, the listing produces results identical to those produced before this change (no regression in the open-Base path).
- **SC-006**: No failure path results in the open Base's views being returned when a different Base was named (zero silent substitutions).

## Assumptions

- **Naming a Base means supplying its vault-relative locator** — the same identifier the vault's Bases enumeration returns and the view query / item-creation operations already accept. The feature does not introduce a separate "resolve a bare base name to a file" search layer; that would be a new Base operation and is out of scope. (Cohort-consistent default chosen because the Bases enumeration emits locators, not bare names, and chaining enumeration → listing → query with one unchanged identifier is the intended workflow.)
- **The named Base parameter is optional.** Omitting it preserves today's open-Base behaviour; supplying it targets the named Base. The two are mutually consistent — naming is purely additive.
- **A structurally malformed named locator is rejected as input validation**, consistently with how the sibling Base operations already reject malformed locators, and is distinct from "named Base not found".
- **Failure reporting reuses the cohort's existing structured-failure convention** so that the new causes are distinguishable from one another and consistent with the listing's current failure surface, rather than introducing a parallel failure mechanism.
- **The existing optional vault selector retains its current cohort behaviour**; this change does not alter how a vault is selected.
- **The empty-views platform quirk is left as-is** — when a Base declares no views, the platform's materialised default view is reported as the platform reports it; this change neither fixes nor masks that behaviour.
