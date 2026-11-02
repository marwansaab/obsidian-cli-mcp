# Feature Specification: Enable cross-vault Bases

**Feature Branch**: `083-enable-cross-vault-bases`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Enable Cross-Vault Bases — when a caller names a vault on a Bases-family operation, the operation acts on that named vault instead of silently acting on whichever vault is in front. Covers the three operations that currently ignore the vault name: enumerating a vault's Bases, listing the views of the Base currently open in a vault, and creating an item in a Base."

## Context

The Bases family has four operations: `bases` (enumerate a vault's `.base` files), `views_base` (list a Base's views), `query_base` (run a view and return its rows) and `create_base` (add an item to a Base). Every one of them accepts an optional `vault` display name.

Only some of them honour it today:

- `query_base` routes to the named vault, and fails with a distinct vault-not-found error when the name is not registered.
- `views_base` in **named-Base mode** (a `base_path` is given) also routes to the named vault and reports an unregistered name the same way.
- `bases` accepts `vault` and discards it: it always lists the Bases of the vault in front.
- `views_base` in **open-Base mode** (no `base_path`) accepts `vault` and discards it: it always lists the views of the Base open in the vault in front.
- `create_base` accepts `vault` and discards it: the item is always created in the Base of the vault in front.

The published descriptions and help references of these three call the parameter "accepted for parity but ignored", "an inherited no-op" or "an inherited CLI limitation". The result is a misleading parameter. A caller who names a vault that is open but not in front silently gets, or writes to, the front vault. A caller who mistypes a vault name gets the front vault's data with no sign that anything went wrong. And the family behaves inconsistently: the same parameter routes on two operations and is ignored on the other three.

## Clarifications

### Session 2026-11-02

- Q: When `create_base` is given a vault name, should it first check that the `.base` path really sits inside that vault's folder, resolving symlinks and junctions, before it creates the item? → A: Option A. Run the check only when a vault is named. Resolve the named vault's folder from the registered vault list, then run the realpath containment check on `base_path` and on the folder where the item will be created, before anything is created. A path that escapes the vault fails with the existing `PATH_ESCAPES_VAULT` error and nothing is created. With no vault named, behaviour stays exactly as today (FR-011). The same gap on the default path is a follow-up outside this spec. No new top-level error code. This matches what `query_base` and `prepend` already do (ADR-009 §2). Recorded under BI-0139 Clarifications (2026-11-02).
- Q: If live probes show that the only way to make `bases`, open-Base `views_base` or `create_base` act on a vault that is not in front is to bring that vault's window to the front, should the operation be allowed to do that? → A: Option A. Prefer a route that leaves focus alone. Where probes show an operation has no focus-free route, it may bring the named vault to the front, and it MUST document that side effect in its description and help reference. Named-mode `views_base` (BI-0127) is the precedent. Tool Notes record that the native subcommands honour `vault=` but their focus side effects vary, and advise checking `get_active_file` after any call that can change focus. The stories require only that the call acts on the named vault. Tests assert an unchanged front vault only for routes that probe as focus-free.
- Q: When a caller names a vault that Obsidian knows (it appears in `vaults`) but that is not open right now, what should `bases`, open-Base `views_base` and `create_base` do? → A: Option A, match the siblings. A closed but registered vault is reachable: the CLI cold-launches it on `vault=`, and the ADR-029 dispatch retry (plus the ADR-030 app-down launch) recovers the call, so every tool that routes `vault=` this way inherits that. ADR-031 already treats a closed vault as a success path for `open_file`, and Tool Notes record that `query_base` simply succeeds against a closed vault. No new open-vault probe, error code or `details.reason` is added (ADR-015).
- Q (plan time, after live probes showed Obsidian picks the item's folder and reports it only after creation): how should the containment check handle the item folder? → A: Option C, which refines the first answer. Before creating, realpath-check `base_path` and a derived item folder. The item folder is the Base's single top-level `file.inFolder` folder if there is one, otherwise the vault's new-note folder, plus any folder part of `name`. If either escapes the vault, fail with `PATH_ESCAPES_VAULT` and create nothing. After creating, realpath-check the actual path from the CLI's `Created:` line as a backstop. If the backstop catches an escape, fail with `PATH_ESCAPES_VAULT` with the created path in `details`, and do not delete the item. No new code or `details.reason`. The existing response-path bug (`src/tools/create_base/handler.ts:91-95`) stays a follow-up outside this spec. Principle IV is met because the backstop error reports the item that was written. Recorded as BI-0139 Clarifications Q4.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enumerate the Bases of a named vault (Priority: P1)

An agent working across several open vaults asks `bases` for the Bases of vault B, which is open but not in front. It gets B's `.base` files, in the same sorted shape as today, instead of the front vault's.

**Why this priority**: Enumeration is the entry point to the whole family: an agent lists a vault's Bases before it queries, inspects or writes to any of them. If enumeration silently returns the wrong vault, every later step is built on the wrong data.

**Independent Test**: With two vaults open (A in front, B behind) and different Bases in each, call `bases` with `vault: "B"`. Confirm the result lists exactly B's Bases and none of A's. If the route probed as focus-free, also confirm A is still in front afterwards (FR-004a). Call it again with no `vault` and confirm it lists A's Bases exactly as today.

**Acceptance Scenarios**:

1. **Given** vaults A (in front) and B (open, not in front) each hold different Bases, **When** the caller calls `bases` with `vault: "B"`, **Then** the result lists B's Bases, sorted path-ascending, and contains none of A's.
2. **Given** the same two vaults, **When** the caller calls `bases` with `vault: "A"`, **Then** the result lists A's Bases.
3. **Given** vault B holds no Bases, **When** the caller calls `bases` with `vault: "B"`, **Then** the result reports no Bases for B and does not fall back to A's.

---

### User Story 2 - Create an item in a named vault's Base (Priority: P1)

An agent asks `create_base` to add an item to `Projects/Tasks.base` in vault B, which is open but not in front. The item is created in B's Base, in B, and nothing is written to the front vault.

**Why this priority**: This is the only write operation in the set. Today a vault name on it is silently ignored, so an item meant for one vault is created in another. A misdirected write is harder to notice and to undo than a misdirected read, so it shares the top priority.

**Independent Test**: With two vaults open (A in front, B behind), each holding a Base at the same vault-relative path, call `create_base` with `vault: "B"`. Confirm the new item exists in B, that no new item appears in A, and that the response reports the created item's path and name in the same shape as today.

**Acceptance Scenarios**:

1. **Given** vaults A (in front) and B (open, not in front) both hold `Projects/Tasks.base`, **When** the caller calls `create_base` with `vault: "B"`, `base_path: "Projects/Tasks.base"` and a name, **Then** the item is created in B's Base and no item is created in A.
2. **Given** vault B does not hold the named Base but vault A does, **When** the caller calls `create_base` with `vault: "B"` and that `base_path`, **Then** the call fails with a Base-not-found error that names vault B and the `base_path`, and no item is created in either vault.
3. **Given** the item name already exists in B's Base, **When** the caller creates it in B, **Then** the name is auto-incremented exactly as it is today, using B's existing items.
4. **Given** in vault B, `base_path` (or the folder where the item would be created) passes through a symlink or junction that resolves outside B's folder, **When** the caller calls `create_base` with `vault: "B"`, **Then** the call fails with `PATH_ESCAPES_VAULT` and nothing is created inside or outside B.

---

### User Story 3 - List the views of the Base open in a named vault (Priority: P2)

An agent calls `views_base` without a `base_path` and names vault B, which is open but not in front. It gets the views of the Base currently open in B, not the views of the Base open in the front vault.

**Why this priority**: Named-Base mode already reaches any vault, so an agent that knows the Base's path is not blocked today. Open-Base mode is for "whatever the user has open over there", which matters less often than enumeration and creation.

**Independent Test**: With A in front showing one Base and B behind showing a different Base, call `views_base` with `vault: "B"` and no `base_path`. Confirm the result lists the views of B's open Base. Then make B show no Base and repeat. Confirm the call fails with the existing "no Base open" error, attributed to B, and does not return A's views.

**Acceptance Scenarios**:

1. **Given** vault A (in front) has one Base open and vault B (open, not in front) has a different Base open, **When** the caller calls `views_base` with `vault: "B"` and no `base_path`, **Then** the result lists the views of B's open Base.
2. **Given** vault B's active file is a note, not a Base, while vault A has a Base open, **When** the caller calls `views_base` with `vault: "B"` and no `base_path`, **Then** the call fails with the existing Base-not-found error for "no Base open" (`details.reason: "not-open"`), attributed to vault B, and never returns A's views.
3. **Given** the Base open in vault B is malformed, **When** the caller lists its views by naming B, **Then** the call fails with the existing malformed-Base error, exactly as it does today for the front vault.

---

### User Story 4 - Default path unchanged when no vault is named (Priority: P1)

An agent that never names a vault keeps getting exactly what it gets today from all three operations: the front vault's Bases, the views of the Base open in the front vault, and items created in the front vault's Base.

**Why this priority**: Most existing callers omit `vault`. Any change to the default path is a regression for all of them.

**Independent Test**: Run the existing behaviour checks for `bases`, open-Base `views_base` and `create_base` with no `vault`. Confirm results, response shapes and errors are identical to before the change.

**Acceptance Scenarios**:

1. **Given** no `vault` is supplied, **When** the caller calls `bases`, **Then** it lists the front vault's Bases exactly as today.
2. **Given** no `vault` and no `base_path` are supplied, **When** the caller calls `views_base`, **Then** it lists the views of the Base open in the front vault exactly as today, including the same errors when no Base is open or the open Base is malformed.
3. **Given** no `vault` is supplied, **When** the caller calls `create_base`, **Then** the item is created in the front vault's Base exactly as today, including the same Base-not-found error and the same auto-increment behaviour.

---

### User Story 5 - An unregistered vault name fails distinctly (Priority: P1)

An agent mistypes a vault name, or names a vault that Obsidian does not know, on any of the three operations. It gets a clear vault-not-found failure that names the vault it asked for. It never gets the front vault's Bases or views, and it never gets a Base-not-found error that would point it at the wrong problem.

**Why this priority**: Once the vault name is honoured, a wrong name must not fall back to the front vault. That fallback is the silent misdirection this feature exists to remove. On `create_base` it would also mean writing to a vault the caller did not ask for.

**Independent Test**: Call each of the three operations with `vault: "No-Such-Vault"`. Confirm each fails with the same vault-not-found failure the sibling operations (`query_base`, named-Base `views_base`) already return, naming `No-Such-Vault`, and that `create_base` created nothing in any vault.

**Acceptance Scenarios**:

1. **Given** the name `No-Such-Vault` is not registered, **When** the caller calls `bases` with it, **Then** the call fails with the vault-not-found failure naming `No-Such-Vault`, and no Bases are returned.
2. **Given** the same unregistered name, **When** the caller calls `views_base` with it and no `base_path`, **Then** the call fails with the vault-not-found failure, not a Base-not-found error, and no views are returned.
3. **Given** the same unregistered name, **When** the caller calls `create_base` with it and a `base_path` that exists in the front vault, **Then** the call fails with the vault-not-found failure, not a Base-not-found error, and no item is created in any vault.
4. **Given** an unregistered name, **When** any of the three operations fails, **Then** the failure has the same category, sub-code and reason as the vault-not-found failure `query_base` returns for the same name.

---

### User Story 6 - Documentation states that the vault name is honoured (Priority: P2)

An agent or a human reader checks what `vault` does on `bases`, `views_base` or `create_base`. Every published statement says the named vault is targeted and the front vault is used when it is omitted. None still calls the parameter ignored, a no-op, kept for parity or an inherited limitation.

**Why this priority**: Agents treat the published description as the contract. If it still says "ignored", agents will keep bringing vaults to the front by hand, or will avoid the parameter altogether. Behaviour comes first, so this ranks after the behavioural stories, but the feature is not done until the documentation matches.

**Independent Test**: Read the short tool description, the `vault` parameter description and the help reference for each of the three operations. Confirm each states that the named vault is targeted and that the front vault is used when `vault` is omitted, and that each lists the vault-not-found failure. Search all of them for "ignored", "no-op", "parity" and "inherited" applied to `vault`, and confirm there are no matches.

**Acceptance Scenarios**:

1. **Given** the published description of each of the three operations, **When** a reader checks what `vault` does, **Then** it says the operation acts on the named vault, and on the front vault when `vault` is omitted.
2. **Given** the same descriptions, **When** a reader looks for the parameter being called ignored, a no-op, kept for parity or an inherited limitation, **Then** no such statement remains.
3. **Given** each operation's list of documented failures, **When** a reader checks it, **Then** it includes the vault-not-found failure for an unregistered `vault`.
4. **Given** the help reference's worked examples, **When** an example shows a `vault` value, **Then** it shows that vault being targeted, not ignored.

---

### Edge Cases

- **Naming the vault that is already in front.** The result is identical to omitting `vault`.
- **No file active in vault B at all.** Open-Base `views_base` naming B fails the same way the default path fails for that state today: the CLI's `Error: No active file.` report, surfaced as `CLI_REPORTED_ERROR`. It never returns A's views (FR-006).
- **A Base open in vault B and a different Base open in front vault A.** Open-Base `views_base` naming B reports B's Base only. The two vaults' open Bases are never mixed.
- **A Base at the same path in both vaults.** `create_base` naming B writes only to B's copy. Auto-increment looks only at B's existing items.
- **`create_base` naming B, with the Base present in A but missing in B.** The call fails Base-not-found for B. It does not fall back to A's Base of the same path.
- **A registered vault that is not currently open.** The named vault is still the target, and it is reached the same way `query_base` reaches it: the CLI cold-launches it on `vault=`, and the existing dispatch retry and app-down launch recover the call. The call returns its normal result, and the first call takes longer. For open-Base `views_base`, the result is the views of whatever Base the vault shows once it is up, or the existing "no Base open" error for that vault. If the vault cannot be brought up (for example, its command-line integration is disabled), the call fails with the existing vault-unavailable failure (`CLI_REPORTED_ERROR` whose output starts `Error: Command "<command>" not found.`). That is never an empty result, and the call never acts on the front vault instead.
- **A vault registered after the server started.** It is accepted on the first call that names it, as the sibling operations already accept it.
- **A vault display name that differs from a registered one only by letter case or surrounding spaces.** It is matched the way the sibling operations match names today. No new fuzzy matching is introduced.
- **Duplicate display names in the registry.** Resolved the same way the sibling operations resolve them today.
- **Named-Base `views_base` and `query_base`.** Both already honour `vault`. Their behaviour, errors and documentation stay as they are.
- **A symlinked or junctioned folder inside the named vault that resolves outside it.** `create_base` naming that vault fails with `PATH_ESCAPES_VAULT` before creating anything. When no vault is named, today's behaviour is unchanged; that gap is a follow-up outside this spec.
- **A `base_path` whose folders do not all exist yet.** The containment check resolves the nearest existing folder on the path with realpath. It never falls back to checking the path as plain text.
- **Deprecated `create_base` aliases (`path`, `view`).** These still fold onto `base_path` and `view_name`, combine freely with `vault`, and report their deprecation notice as today.

## Requirements *(mandatory)*

### Functional Requirements

**Vault routing**

- **FR-001**: When `vault` is supplied, `bases` MUST list the `.base` files of the named vault, and only that vault.
- **FR-002**: When `vault` is supplied and `base_path` is omitted, `views_base` MUST list the views of the Base currently open in the named vault, and only that vault.
- **FR-003**: When `vault` is supplied, `create_base` MUST create the item in the named vault's Base at `base_path`, and MUST NOT create or modify anything in any other vault.
- **FR-004**: Each operation MUST act on the named vault whether or not that vault is the one in front. It SHOULD use a route that leaves the front vault unchanged. If live probes show an operation has no focus-free route, it MAY bring the named vault to the front. In that case it MUST document the side effect in its short description and help reference, as named-Base `views_base` already does, and the documentation MUST point callers to `get_active_file` to check focus afterwards.
- **FR-004a**: For each operation whose route probes as focus-free, the acceptance tests MUST assert that the front vault is unchanged after a call naming a vault that is not in front. Operations with a documented focus side effect are not held to that assertion; their tests assert only that the named vault was acted on.

- **FR-004b**: A named vault that is registered but not open MUST be reached through the same `vault=` routing and existing recovery the siblings use (the CLI cold-launch, the ADR-029 dispatch retry and the ADR-030 app-down launch), and the call MUST return its normal result. No open-vault probe, new error code or new `details.reason` may be added. A vault that cannot be brought up MUST fail with the existing vault-unavailable failure. It must never produce an empty result, and the call must never fall back to the front vault.

**Not-found handling in the named vault**

- **FR-005**: When `create_base` names a vault where `base_path` does not exist, it MUST fail with the existing Base-not-found error. The error details MUST identify both the `base_path` (in the existing `details.path` key, unchanged so the default path stays byte-identical) and the named vault, and no item may be created in any vault.
- **FR-006**: When open-Base `views_base` names a vault whose active file is not a Base, it MUST fail with the existing "no Base open" Base-not-found error (`details.reason: "not-open"`), attributed to the named vault. When the named vault has no file active at all, the call MUST fail exactly as the default path fails for that state today, which is the CLI's `Error: No active file.` report surfaced as `CLI_REPORTED_ERROR` (plan research D4, FR-011 parity). In neither case may it return the views of a Base open in any other vault.
- **FR-007**: When the Base open in, or named in, the named vault is malformed, the operation MUST report the same malformed-Base failure it reports today for the front vault.

**Write containment in the named vault**

- **FR-007a**: When `vault` is supplied, `create_base` MUST resolve the named vault's folder from the registered vault list and, before anything is created, check the containment of `base_path` and of the derived item folder. The derived item folder is the Base's single top-level `file.inFolder` folder if it has exactly one, otherwise the vault's new-note folder for that Base, joined with any folder part of `name`. Each path MUST be canonicalised against the vault folder by resolving its nearest existing ancestor with realpath; checking the path as plain text when an ancestor does not exist is not allowed. A path that resolves outside the named vault MUST fail with the existing `PATH_ESCAPES_VAULT` error, and nothing may be created in any location.
- **FR-007b**: When `vault` is omitted, `create_base` MUST NOT gain this check in this feature (FR-011). The default-path containment gap is recorded as a follow-up outside this spec.
- **FR-007c**: When `vault` is supplied and the item has been created, `create_base` MUST realpath-check the item's actual vault-relative path, as reported by the CLI's `Created:` line, against the named vault's folder as a backstop. If it resolves outside the vault, the call MUST fail with `PATH_ESCAPES_VAULT`, and its `details` MUST carry the created path so the caller knows the item exists. The item MUST NOT be deleted. No new error code or `details.reason` is introduced.

**Unregistered vault**

- **FR-008**: When `vault` names a vault that is not registered, each of the three operations MUST fail with the existing vault-not-found failure. The category, sub-code and reason MUST be the same as `query_base` and named-Base `views_base` return today, and the failure MUST name the requested vault.
- **FR-009**: An unregistered `vault` MUST be reported as vault-not-found before any Base lookup. It MUST never surface as a Base-not-found error, as an empty result, or as the front vault's Bases or views.
- **FR-010**: When `vault` is unregistered, `create_base` MUST NOT create an item in any vault. This is the write-side consequence of FR-009, kept as its own statement so a test can check it directly.

**Default path**

- **FR-011**: When `vault` is omitted, each of the three operations MUST behave exactly as it does today: the same target (the front vault), the same results, the same response shape and the same failures.

**Contract stability**

- **FR-012**: The change MUST NOT add, remove or rename any input field, and MUST NOT change any operation's response shape. The `vault` field stays optional on all three operations, with its existing validation (a non-empty string).
- **FR-013**: Named-Base `views_base` and `query_base` MUST keep their current vault behaviour, results, errors and documentation. Named-Base `views_base`'s second CLI call, which lists the views after the focus step, MAY carry `vault=` when a vault is named (plan research D3), provided its results and errors are unchanged.

**Documentation**

- **FR-014**: The short tool description, the `vault` parameter description and the help reference of `bases`, `views_base` and `create_base` MUST each state that `vault` targets the named vault and that the front vault is used when it is omitted. For `views_base`, this applies to both modes. Any operation that ends up with a focus side effect (FR-004) MUST also state it there.
- **FR-014a**: The short description of each of the three operations MUST carry the project's shared closed-vault note for its own CLI subcommand, as `query_base` already does for `base:query`: a closed vault is opened automatically, the first call takes longer, and a vault that cannot be brought up fails with the vault-unavailable failure.
- **FR-015**: After the change, none of those documents may describe `vault` on these operations as ignored, a no-op, kept for parity or forward compatibility, or an inherited limitation.
- **FR-016**: Each of the three operations' documented failure lists MUST include the vault-not-found failure for an unregistered `vault`. The failure list for `create_base` MUST also include `PATH_ESCAPES_VAULT`, stating that it applies when a vault is named.
- **FR-017**: Any worked example in those documents that supplies `vault` MUST show the named vault being targeted.

### Key Entities

- **Named vault**: the vault identified by the caller's `vault` display name. It is resolved against the vaults Obsidian has registered, and can be in front, open behind the front vault, or closed.
- **Front (focused) vault**: the vault Obsidian is currently showing. It is the target whenever `vault` is omitted.
- **Base**: a `.base` file in a vault, identified by its vault-relative path. The same path can exist independently in several vaults.
- **Open Base**: the Base currently shown in a given vault's window, if any. Each open vault has its own.
- **Vault-not-found failure**: the existing typed failure the family already returns for an unregistered vault name. It carries the requested name.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With two vaults open and the named one not in front, all 3 operations act on the named vault in 3 of 3 cases (B's Bases, B's open-Base views, an item created in B), with 0 results drawn from the front vault and 0 items written to it.
- **SC-002**: With `vault` omitted, the 3 operations show 0 behavioural differences from before the change, across results, response shapes and failures.
- **SC-003**: For an unregistered vault name, 3 of 3 operations return the vault-not-found failure, matching `query_base`'s failure for the same name in category, sub-code and reason. 0 of them return front-vault data or a Base-not-found error, and 0 items are created.
- **SC-004**: `create_base` naming a vault that lacks the Base fails Base-not-found with the named vault identified in 100% of cases, and creates 0 items in any vault.
- **SC-004a**: When `create_base` names a vault and its `base_path` or derived item folder escapes that vault through a symlink or junction, 100% of calls fail with `PATH_ESCAPES_VAULT`, and 0 items are created anywhere. When only the post-creation backstop catches the escape, 100% of calls fail with `PATH_ESCAPES_VAULT` and the created path in `details`.
- **SC-005**: For each of the 3 operations, all 3 documentation surfaces (the short description, the `vault` parameter description and the help reference: 9 surfaces in total) state that the named vault is targeted. 0 of the 9 describe `vault` as ignored, a no-op, kept for parity or an inherited limitation.
- **SC-006**: An agent can work with a Base in any registered vault, whether open or closed, through the whole family (enumerate, list views, query, create) without first bringing that vault to the front, in 4 of 4 operations.

## Assumptions

- "Registered vault" means a vault the server's vault list knows by display name, the same source `vaults` lists and `query_base` resolves against. Vault names are Obsidian display names, not folder paths.
- The vault-not-found failure is the existing typed failure the family already uses (`CLI_REPORTED_ERROR` with `details.code: "VAULT_NOT_FOUND"`, `details.reason: "unknown"`). This feature reuses it and introduces no new error code. The containment failure is likewise the existing top-level `PATH_ESCAPES_VAULT` code that the note-writing tools already return.
- The Base-not-found and malformed-Base failures are the existing typed failures each operation already returns. Attributing them to the named vault means adding the vault's identity to what the caller sees. It does not mean a new failure kind.
- Plan-time live probes against the authorised test vault showed that the underlying Obsidian commands (`bases`, `base:views`, `base:create`) do honour a vault name, which contradicts the current documentation (plan research P1, P3, P4). The plan therefore routes through each command's own vault argument (research D1).
- A registered but closed vault is handled the way the sibling operations that already honour `vault` handle it (Clarifications, 2026-11-02; ADR-029, ADR-030, ADR-031). This feature does not define a new closed-vault contract. If the route chosen for an operation does not inherit the cold-launch recovery, the plan must record that and keep the behaviour in FR-004b.
- A route that leaves focus alone is preferred (FR-004). Where live probes find none for an operation, a documented focus side effect is accepted (Clarifications, 2026-11-02). Which operations end up with a side effect is settled by the plan-time probes and recorded in the plan.
- Changing the `vault` parameter descriptions changes the published tool schemas. The schema fingerprint baseline is therefore updated as a deliberate change, per the project's tool-surface standards.
- Updates to the living system description (`.docs-as-code/`) follow in the project's normal documentation pass for the pull request, and are not specified here.

## Out of Scope

- Per-item or per-Base metadata beyond what each operation returns today.
- The empty-Bases result contract (how `bases` reports a vault with no Bases). It is delivered separately; this feature only requires that an empty named vault does not fall back to the front vault.
- `query_base` and named-Base `views_base`, which already honour `vault`.
- Any new input field, targeting mode, or change to response shape.
- Write containment for `create_base` when no vault is named. This existing gap is a follow-up outside this spec (see Clarifications, 2026-11-02).
- The `path` that `create_base` returns today is built by the wrapper as `<baseDir>/<baseName>/<created>`, which does not match where Obsidian puts the item. This existing bug is a follow-up outside this spec (Clarifications, 2026-11-02, plan-time question).
- Fuzzy or case-insensitive matching of vault names beyond what the surface already does.
