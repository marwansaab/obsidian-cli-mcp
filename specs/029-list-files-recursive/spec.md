# Feature Specification: List Files Recursive — Typed Subtree Enumeration

**Feature Branch**: `029-list-files-recursive`
**Created**: 2026-05-15
**Status**: Draft
**Input**: User description: "List files recursively — a single typed tool call returns a flat list of all files and folders within a vault — or a nominated sub-folder — recursing through the entire subtree in one invocation. Replaces the chained per-folder calls that agents otherwise make against the existing non-recursive `files` tool. Same flat path-list shape. Optional depth cap; optional extension filter."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Specific-mode whole-vault recursive listing (Priority: P1)

An agent needs to map the full contents of a known vault in one call — for example "what does this vault hold?", "give me an inventory of every note and folder", "build a tree of the whole vault before I plan a batch operation." The agent calls the recursive listing tool with `target_mode: "specific"`, the vault display name, and no `folder` (the vault root is implied). The tool returns `{ count, paths }` where `paths` is the flat list of every file AND folder under the vault root, recursing through the entire subtree, and `count === paths.length`. Today the only single-call path is `obsidian_exec` returning plain text the agent must line-parse; the chained typed-call alternative is the existing non-recursive `files` tool walked manually per sub-folder, which produces measurable latency on vaults with tens of folders. This typed surface replaces both patterns with one invocation.

**Why this priority**: This is the dominant use case the feature is intended to satisfy. Whole-vault inventory is a common precondition for batch operations, agent-driven planning, and mapping work. Without specific-mode root listing the feature offers nothing over the existing non-recursive tool plus manual recursion; this story alone justifies the feature.

**Independent Test**: Author a fixture vault with a known subtree (a vault root containing some loose files, one or two nested folders each with their own files and sub-folders). Call the recursive listing tool with `target_mode: "specific"` and the vault display name, no `folder`. Assert the response shape is `{ count: <n>, paths: [...] }`. Assert `count === paths.length`. Assert every file in the fixture and every folder in the fixture appears in `paths`. Assert two consecutive calls return the same `paths` array in the same order. The story is fully testable in isolation; nothing in P2/P3 is required for it to deliver value.

**Acceptance Scenarios**:

1. **Given** vault `Demo` has the subtree `README.md`, `Inbox/a.md`, `Inbox/b.md`, `Inbox/Sub/c.md`, `Archive/old.md`, **When** the agent calls the recursive listing tool with `target_mode: "specific"`, `vault: "Demo"`, and no `folder`, **Then** the response `paths` contains every file path AND every folder path (`Inbox`, `Inbox/Sub`, `Archive` included as folder entries; `README.md`, `Inbox/a.md`, `Inbox/b.md`, `Inbox/Sub/c.md`, `Archive/old.md` included as file entries). `count === paths.length`.
2. **Given** vault `Demo` has an empty subtree (the vault root contains no user-visible files or folders), **When** the agent calls the recursive listing tool with `target_mode: "specific"`, `vault: "Demo"`, **Then** the response is `{ count: 0, paths: [] }`. The call succeeds (does NOT surface a structured error).
3. **Given** vault `Demo` exists and contains a non-empty subtree, **When** the agent issues two consecutive calls with identical inputs, **Then** the response's `paths` is byte-identical across the two calls AND sorted lexically ascending on the UTF-8-encoded vault-relative path string.
4. **Given** a vault display name that does not match any registered Obsidian vault, **When** the agent calls the recursive listing tool, **Then** the call fails with a structured error (the same reclassified-CLI-response shape the existing typed tools already use for unknown vaults — never a silent empty-listing).

---

### User Story 2 — Specific-mode sub-folder subtree listing (Priority: P1)

An agent needs to enumerate every file and folder under a named sub-folder of a known vault, recursing through the subtree but stopping at the sub-folder's boundary — for example "give me everything under `Projects/AcmeCorp/`", "what's in `Archive/2025/`?", "list every note and folder inside the `Inbox/` subtree." The agent calls the recursive listing tool with `target_mode: "specific"`, the vault display name, and a `folder` field naming the sub-folder. The response is the flat list of every file and folder beneath that sub-folder, recursing through the subtree.

**Why this priority**: Scoping a recursive listing to a sub-folder is the second dominant use case — agents typically know which area of the vault they care about and want to avoid traversing the rest. Independently testable from US1: a fixture with multiple top-level folders verifies that the response excludes everything outside the named sub-folder.

**Independent Test**: Reuse the US1 fixture vault. Call the tool with `folder: "Inbox"` and assert the response excludes the root-level `README.md` and the `Archive/` subtree, AND includes every file and folder beneath `Inbox/`.

**Acceptance Scenarios**:

1. **Given** vault `Demo` from US1 scenario 1, **When** the agent calls the tool with `folder: "Inbox"`, **Then** the response `paths` contains `Inbox/a.md`, `Inbox/b.md`, `Inbox/Sub`, `Inbox/Sub/c.md` AND does NOT contain `README.md`, `Archive`, or `Archive/old.md`. The starting folder `Inbox` itself does NOT appear in `paths` — entries are descendants only.
2. **Given** vault `Demo` has folder `Empty/` which exists but contains no entries, **When** the agent calls the tool with `folder: "Empty"`, **Then** the response is `{ count: 0, paths: [] }` — success, not error.
3. **Given** vault `Demo` has no folder at vault-relative path `Missing/`, **When** the agent calls the tool with `folder: "Missing"`, **Then** the call fails with a structured `CLI_REPORTED_ERROR` whose `details.code` identifies the missing folder. This is a DEPARTURE from the non-recursive `files` tool's behaviour (which conflates missing-folder with empty-folder into the empty-listing shape) — the recursive tool surfaces the missing-folder case explicitly.
4. **Given** vault `Demo` has a file at vault-relative path `notes/x.md` (a FILE, not a folder), **When** the agent calls the tool with `folder: "notes/x.md"`, **Then** the call fails with a structured `CLI_REPORTED_ERROR` whose `details.code` identifies that the path does not resolve to a folder. Same surface shape as the missing-folder case but with a distinguishing `details.code`.
5. **Given** a `folder` input with a trailing slash (`folder: "Inbox/"`) versus without (`folder: "Inbox"`), **When** the agent calls the tool once with each form against the same vault, **Then** both calls return the same `{ count, paths }` response. The wrapper normalises trailing-slash input.

---

### User Story 3 — Depth-limited traversal (Priority: P1)

An agent needs a partial overview of a large vault without paying the cost of walking every leaf. The agent calls the tool with an optional `depth` field — an integer that caps how deep the traversal descends from the starting folder. `depth: 1` returns only the immediate children of the starting folder; `depth: 2` adds their children; `depth: N` returns paths at depths 1 through N from the starting folder.

**Why this priority**: Depth-limited traversal is the recursive tool's safety valve against unbounded payloads and the agent's tool for "give me a summary before I commit to a full walk." Independently testable from US1/US2: a fixture with a known multi-level subtree verifies that `depth: 1` yields only the immediate children and `depth: N` yields exactly the entries at depths 1..N.

**Acceptance Scenarios**:

1. **Given** vault `Demo` from US1 scenario 1, **When** the agent calls the tool with no `folder` (vault root implied) and `depth: 1`, **Then** the response `paths` contains only the immediate children of the vault root: `README.md`, `Inbox`, `Archive`. The deeper entries `Inbox/a.md`, `Inbox/b.md`, `Inbox/Sub`, `Inbox/Sub/c.md`, `Archive/old.md` MUST NOT appear.
2. **Given** the same fixture, **When** the agent calls the tool with `folder: "Inbox"` and `depth: 1`, **Then** the response `paths` contains only the immediate children of `Inbox/`: `Inbox/a.md`, `Inbox/b.md`, `Inbox/Sub`. The deeper entry `Inbox/Sub/c.md` MUST NOT appear. The starting folder `Inbox` itself does NOT appear.
3. **Given** the same fixture, **When** the agent calls the tool with no `folder` and `depth: 2`, **Then** the response `paths` contains entries at depths 1 and 2 from the vault root — `README.md`, `Inbox`, `Archive`, `Inbox/a.md`, `Inbox/b.md`, `Inbox/Sub`, `Archive/old.md`. The depth-3 entry `Inbox/Sub/c.md` MUST NOT appear.
4. **Given** the same fixture, **When** the agent calls the tool with no `folder` and no `depth`, **Then** the response carries the full recursive subtree (parity with US1 scenario 1).
5. **Given** an invalid `depth` value (zero, negative, non-integer, non-number), **When** the agent calls the tool, **Then** the call fails validation; no underlying CLI call is made.

---

### User Story 4 — Extension filter on the recursive subtree (Priority: P1)

An agent needs a restricted recursive listing — for example "every `.md` note in the vault", "every `.png` attachment under `Assets/`" — without folder entries cluttering the response. The agent calls the tool with the optional `ext` field. When `ext` is set, the response contains ONLY files matching the extension, recursing through the subtree; folder entries do NOT appear when `ext` is set. When `ext` is omitted, the response carries both files AND folders (parity with US1).

**Why this priority**: Extension filtering is the third common scope-reducer and is the natural composition with recursive enumeration ("every markdown file in the vault"). The folders-excluded-when-ext-set rule is a wrapper-side decision because filtering folders by extension is nonsensical; the spec locks it explicitly so callers do not need to post-filter folder entries themselves.

**Acceptance Scenarios**:

1. **Given** vault `Demo` from US1 scenario 1, **When** the agent calls the tool with no `folder` and `ext: "md"`, **Then** the response `paths` contains `README.md`, `Inbox/a.md`, `Inbox/b.md`, `Inbox/Sub/c.md`, `Archive/old.md` AND does NOT contain any folder entry (no `Inbox`, no `Inbox/Sub`, no `Archive`).
2. **Given** the same fixture extended with an attachment `Assets/cover.png`, **When** the agent calls the tool with `folder: "Assets"` and `ext: "png"`, **Then** the response `paths` contains only `Assets/cover.png`.
3. **Given** an `ext` value naming an extension with no matching files in the subtree (e.g. `ext: "qqq"`), **When** the agent calls the tool, **Then** the response is `{ count: 0, paths: [] }` — success, not error.
4. **Given** an `ext` input with a leading dot (`ext: ".md"`) versus without (`ext: "md"`), **When** the agent calls the tool once with each form against the same vault, **Then** both calls return the same response. The wrapper normalises before passing through.

---

### User Story 5 — Active-mode listing against the focused vault (Priority: P1)

An agent operating in a session where Obsidian has a specific vault focused needs the recursive listing without naming a vault display name. The agent calls the tool with `target_mode: "active"` and optionally `folder` / `depth` / `ext` / `total`. The tool resolves the focused vault at execution time and returns the same `{ count, paths }` shape as specific mode.

**Why this priority**: Active mode is the standard target-mode discriminator across every typed tool in the project that supports it; omitting it would create an inconsistency in the typed surface. Pairs equally with US1 — together they cover the full target-mode discriminator contract for the recursive listing surface.

**Independent Test**: Run Obsidian with a known vault focused. Call the tool with `target_mode: "active"`. Assert the response carries the focused vault's full subtree.

**Acceptance Scenarios**:

1. **Given** Obsidian has vault `Demo` focused with the US1 subtree, **When** the agent calls the tool with `target_mode: "active"` and no `folder`, **Then** the response is the same `{ count, paths }` shape that the equivalent specific-mode call returns.
2. **Given** active mode and no Obsidian instance is reachable (no focused vault), **When** the agent calls the tool, **Then** the call fails with a structured error.

---

### User Story 6 — Count-only mode (Priority: P2)

An agent needs to know how many entries the recursive listing would produce without paying the cost of transferring the full path list — for example to gate a follow-up batch operation, populate a counter, or short-circuit a "process all" loop. The agent calls the tool with `total: true`. The tool returns `{ count, paths: [] }` — the count is the same number that would have been produced without the flag, and `paths` is the literal empty array preserved for shape consistency.

**Why this priority**: Count-only mode is the explicit token-economy advantage when the agent does not need the path list — a vault with thousands of entries forces a substantial payload otherwise; `total: true` reduces the response to a single integer. Independently testable because the count-only path can be exercised with the same fixtures as US1–US4 plus a single boolean flag.

**Acceptance Scenarios**:

1. **Given** vault `Demo` from US1 scenario 1, **When** the agent calls the tool with `total: true` and no `folder`, **Then** the response is `{ count: <full-subtree-count>, paths: [] }`.
2. **Given** the same fixture, **When** the agent calls the tool once with `total: false` (or omitted) and once with `total: true`, **Then** the `count` value matches across both responses (parity with US1 scenario 1).
3. **Given** the same fixture, **When** the agent calls the tool with `total: true` AND `ext: "md"`, **Then** the response `count` reflects the filtered set (markdown files only, folders excluded) and `paths` is `[]`.
4. **Given** the same fixture, **When** the agent calls the tool with `total: true` AND `depth: 1` AND no `folder`, **Then** the response `count` reflects the immediate children only.

---

### User Story 7 — Validation rejects malformed inputs before the CLI is invoked (Priority: P1)

An agent (or misbehaving caller) submits an input shape that violates the tool's contract. The tool MUST reject the call at the validation boundary, before any underlying CLI invocation occurs, and MUST surface a structured validation error that names the offending field. No CLI call may be dispatched by an invalid input.

**Why this priority**: Validation is the safety contract for every typed tool in this project and a constitutional requirement (zod-as-source-of-truth). Although the recursive listing surface is read-only, the principle holds: a malformed input that reaches the CLI risks spurious work, misleading errors, or undocumented behaviour. Independently testable because every validation case can be exercised with a mock/spy on the CLI dispatcher to assert the dispatcher was never called.

**Independent Test**: For each invalid input shape, call the tool with a CLI dispatcher spy. Assert the call rejects with a structured validation error AND the dispatcher was never invoked. No real CLI or vault required.

**Acceptance Scenarios**:

1. **Given** `target_mode: "specific"` with no `vault`, **When** the agent calls the tool, **Then** the call fails validation; no CLI call is made.
2. **Given** `target_mode: "active"` with `vault` set, **When** the agent calls the tool, **Then** the call fails validation; no CLI call is made.
3. **Given** any mode with a `file` key (the file-scoped locator that does not apply to this folder-scoped tool), **When** the agent calls the tool, **Then** the call fails validation; no CLI call is made.
4. **Given** any mode with a `path` key (the other file-scoped locator), **When** the agent calls the tool, **Then** the call fails validation; no CLI call is made.
5. **Given** any input with an unknown top-level key, **When** the call is forwarded by an MCP client that does NOT strip unknown keys, **Then** the server-side validation fails; no CLI call is made.
6. **Given** `target_mode` is a value outside `"specific" | "active"`, **When** the agent calls the tool, **Then** the call fails validation; no CLI call is made.
7. **Given** `total` is a non-boolean shape (e.g. `"true"`, `1`, `null`), **When** the agent calls the tool, **Then** the call fails validation; no CLI call is made.
8. **Given** `folder` or `ext` is a non-string shape, **When** the agent calls the tool, **Then** the call fails validation; no CLI call is made.
9. **Given** `depth` is a non-integer, zero, negative, or non-number value (e.g. `1.5`, `0`, `-1`, `"2"`, `null`), **When** the agent calls the tool, **Then** the call fails validation; no CLI call is made.

---

### User Story 8 — Documentation surface for the typed tool (Priority: P2)

An operator or agent inspects the project's progressive-disclosure help facility to understand how the recursive listing tool works. The tool's documentation MUST cover the per-field input contract, the output shape (both branches of the `total` flag), the recursion semantics (including the depth-cap and the "starting folder excluded" rule), the folders-vs-files behaviour with and without `ext`, the failure-mode roster, and at least four worked examples.

**Why this priority**: The help facility is the primary discovery surface for tool consumers (mirrored from every other typed tool). The tool is callable without docs but un-discoverable without them. Should-pass for ship; not required for the listing code path itself to function. Independently testable by loading the help facility output and asserting structural completeness.

**Acceptance Scenarios**:

1. **Given** the help facility, **When** an operator queries the recursive listing tool, **Then** the response carries the full per-field input contract (target_mode, vault, folder, depth, ext, total), both output-shape branches, the recursion-semantics block (depth bounding, starting-folder-excluded, folders-excluded-when-ext-set), the failure-mode roster (validation / unknown-vault / missing-folder / not-a-folder / no-active-file / output-cap), and at least four worked examples covering at minimum: whole-vault recursive listing, sub-folder subtree listing with `ext`, depth-limited overview, count-only mode.

---

### User Story 9 — Pathological-size traversals surface a structured error rather than truncating (Priority: P3)

An agent calls the recursive listing tool against a vault or sub-folder whose subtree contains tens of thousands of entries. The serialised response payload approaches or exceeds the typed-tool output cap. The tool MUST surface a structured "output too large" error rather than silently truncating the `paths` array. Callers facing this case can fall back to count-only mode (`total: true`, payload is a single integer) plus a depth cap or scoped sub-folder queries.

**Why this priority**: Recursive listings dramatically widen the payload envelope versus the non-recursive `files` tool — a single call can now traverse the entire vault. Silent truncation would corrupt downstream traversal logic in a way that is invisible until it produces wrong results. The depth cap (US3) is the natural mitigation, but pathological cases beyond `depth: 1` are still possible. Independently testable by generating a synthetic large subtree and asserting the response is a structured error.

**Acceptance Scenarios**:

1. **Given** vault `Demo` has a subtree containing enough entries that the serialised `paths` array would exceed the typed-tool output cap, **When** the agent calls the tool with no `total` and no `depth`, **Then** the call fails with a structured "output too large" error AND no truncated `paths` array is returned.
2. **Given** the same fixture, **When** the agent calls the tool with `total: true`, **Then** the call succeeds with `{ count: <full count>, paths: [] }`.
3. **Given** the same fixture, **When** the agent calls the tool with `depth: 1`, **Then** the call succeeds (the depth cap brings the payload back under the output cap for a wide-and-shallow fixture; deep-and-narrow fixtures may still exceed the cap and surface the structured error).

---

### Edge Cases

The implementation MUST handle, document, or explicitly defer each of the following observable shapes.

**CONCURRENCY**

- Files and folders MAY be added or removed in the target subtree between the validation step and the listing's execution. The response reflects whatever was on disk at execution time. The wrapper does NOT introduce file-locking or coordination; the contract is a point-in-time snapshot, not a transaction.
- Active-mode TOCTOU: the focused vault MAY change between submission and execution. The response reflects whichever vault was focused at execution time. The response carries NO `vault` echo — the caller has no in-band signal of which vault produced the listing. Documented limitation inherited from the existing typed-read tools' no-locator-echo pattern; callers needing strict vault routing use specific mode.

**CONTENT — file and folder names**

- A subtree containing entries with emoji, non-ASCII characters, leading/trailing whitespace, or other unusual code points in their names. The wrapper returns whatever the underlying enumeration produces — no wrapper-side name normalisation. Observed behaviour MUST be characterised during the live-CLI characterisation pass and documented as the contracted shape.
- Dotfiles and dot-directories (e.g. `.obsidian/`, `.obsidian/app.json`, `.gitkeep`, `.hidden.md`, `notes/.draft.md`) MUST be filtered wrapper-side per FR-027 — any path whose vault-relative representation contains a segment beginning with `.` is dropped from `paths`. The rule is uniform across every result path; it is NOT special-cased for the caller's `folder` input. Direct consequence: a call where `folder` is itself a dot-directory (e.g. `folder: ".obsidian"`) returns `{ count: 0, paths: [] }` because every result path's first segment is the dot-prefixed folder name. Callers needing visibility into Obsidian's internal dot-directories use `obsidian_exec`. Inherited from the non-recursive `files` tool's FR-028 with the same rule extended to recursive depth.

**CONTENT — folder path normalisation**

- A `folder` input with a trailing slash (`Inbox/`) versus without (`Inbox`) MUST yield the same response. If the underlying CLI does not natively treat them as equivalent, the handler normalises before passing through.
- Case sensitivity on `folder` is platform-dependent — Windows and macOS-default filesystems resolve case-insensitively; Linux filesystems resolve case-sensitively. The wrapper does NOT normalise case; it passes `folder` through verbatim. Documented in the published tool documentation.

**CONTENT — missing vs empty vs file-named-folder**

- This tool DEPARTS from the non-recursive `files` tool's conflation rule (FR-010). A folder that exists but is empty returns `{ count: 0, paths: [] }` (success). A folder that does NOT exist surfaces a structured `CLI_REPORTED_ERROR` with `details.code` identifying the missing folder. A `folder` value that names a path inside the vault resolving to a FILE rather than a folder surfaces a structured `CLI_REPORTED_ERROR` with a distinguishing `details.code`. The three cases are observably distinct at the response surface — by explicit user direction in the feature description ("a structured error is returned identifying the missing folder").

**CONTENT — extension filter**

- An `ext` filter with a leading dot (`.md`) versus without (`md`) MUST yield the same response. The handler normalises before passing through.
- When `ext` is set, folder entries MUST be excluded from `paths` (per FR-007). When `ext` is omitted, folder entries appear in `paths` alongside file entries (per FR-007).
- An `ext` filter with an unrecognised or impossible value (e.g. `ext: "qqq"`) returns `{ count: 0, paths: [] }` — success, not error. Indistinguishable from "the subtree has no files with that extension".

**CONTENT — depth bounding**

- Depth is measured from the starting folder: the starting folder is depth 0 and is NEVER included in `paths` (paths are descendants only). The immediate children of the starting folder are depth 1. `depth: 1` returns only depth-1 entries; `depth: N` returns depth-1..N entries. When `depth` is omitted, traversal is unbounded.
- A valid `depth` value is a positive integer (`depth >= 1`). Zero, negative, non-integer, or non-number values fail validation per FR-006 / US7 scenario 9.
- A `depth` greater than the actual maximum depth of the subtree is silently accepted — the response is identical to an omitted `depth` for that subtree. The wrapper does NOT report "depth exceeds subtree height"; the contract is "at MOST `depth` levels deep", not "exactly `depth` levels deep".

**LIMITS**

- Output-cap behaviour: a subtree containing more entries than the typed-tool output cap can carry MUST surface a structured "output too large" error rather than silently truncating. Callers fall back to `total: true` plus a `depth` cap or scoped sub-folder queries. Locked into US9.
- Recursion is unbounded by default — the depth cap is opt-in. Vaults with deep nested structures CAN produce large payloads; the output cap is the structural safety net.

**UNDERLYING CLI — unknown vault**

- An unknown vault display name MAY produce a CLI response that the existing bridge classifier does not natively treat as an error (the same shape covered for prior typed tools via 011-R5 inheritance). The implementation MUST handle this case explicitly: the response MUST be reclassified to a structured `CLI_REPORTED_ERROR`, not silently returned as a successful empty listing.

**CLIENT-CLASS — unknown-key validation**

- The server-side validation behaviour for "unknown top-level keys" (US7 scenario 5) is directly observable only from MCP clients that forward unknown keys to the server. Strict-naive clients strip unknown keys client-side per the published JSON Schema's `additionalProperties: false`, in which case the server never sees the offending key. Both pathways MUST be documented; the test case MUST exercise the server-side path explicitly.

**SECURITY — path traversal on `folder`**

- The `folder` field is caller-supplied. Path-traversal attempts (e.g. `folder: "../../etc"`, `folder: "../OtherVault"`) MUST either be rejected at the validation boundary or verified to be rejected by the underlying CLI's vault-confinement check. The wrapper MUST NOT return a listing of files outside the named vault's root — silent vault-escape is a security defect. Observed behaviour MUST be characterised during the live-CLI characterisation pass.

**SECURITY — injection vector for inputs**

- The `folder`, `ext`, and `depth` inputs are caller-supplied. They MUST be passed to the underlying CLI in a manner structurally immune to shell-metacharacter and command-injection attacks. Whether the implementation routes through a native typed CLI subcommand (passing inputs as discrete argv parameters) or through an `eval` subcommand (passing inputs via a base64-encoded JSON payload consumed by a frozen JS template, parity with the eval-driven cohort), the chosen route MUST close the injection vector structurally — no per-field sanitisation of user input alone is acceptable as the primary defence. The choice of route is a planning-phase decision driven by whether the underlying CLI exposes a native recursive listing subcommand; both routes have established precedent in this project.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose a typed MCP tool that lists every file AND folder within a vault — or a nominated sub-folder — recursing through the entire subtree in a single invocation. The tool's user-facing name is a planning-phase decision per ADR-010 (single-word-verbatim-from-upstream where an upstream subcommand exists; otherwise a single-word original name).
- **FR-002**: The tool MUST accept a `target_mode` discriminator with the values `"specific"` and `"active"`, mirroring the discriminator contract used by every other folder-scoped or file-scoped typed tool that supports both modes (parity with the non-recursive `files` tool).
- **FR-003**: In `target_mode: "specific"`, the tool MUST require a `vault` display name. In `target_mode: "active"`, the tool MUST forbid the `vault` key. Presence of `vault` in active mode MUST produce a validation failure.
- **FR-004**: The tool MUST NOT accept the file-scoped locator fields `file` or `path` in any mode. Presence of either field MUST produce a validation failure. (Rationale: this tool is folder-scoped — the file-scoped locator fields do not apply.)
- **FR-005**: The tool MUST accept an optional `folder` field (a string) naming the vault-relative sub-folder whose subtree is enumerated. When `folder` is omitted, the tool MUST traverse the vault root's full subtree.
- **FR-006**: The tool MUST accept an optional `depth` field (a positive integer, minimum `1`). When `depth` is set, the traversal descends at most `depth` levels below the starting folder (depth 0 is the starting folder itself and is never returned; depth 1 is the starting folder's immediate children). When `depth` is omitted, the traversal is unbounded. The tool MUST reject `depth` values that are zero, negative, non-integer, or non-numeric.
- **FR-007**: The tool MUST accept an optional `ext` field (a string) that, when set, filters the response to FILES matching the extension AND EXCLUDES FOLDER ENTRIES from `paths`. When `ext` is omitted, the response carries BOTH files AND folder entries. The leading-dot form (`.md`) and bare form (`md`) MUST be accepted as equivalent (the handler normalises before passing through).
- **FR-008**: The tool MUST accept an optional `total` field (a boolean, default `false`). When `total: true`, the response carries the count AND an empty `paths` array. When `total: false` (or omitted), the response carries both the count and the populated `paths` array.
- **FR-009**: The tool's input schema MUST forbid unknown top-level keys (`additionalProperties: false`).
- **FR-010**: The tool MUST return an output object with two fields: `count` (a non-negative integer) and `paths` (an array of vault-relative path strings). On the `total: true` branch, `paths` MUST be the literal empty array `[]`. On the `total: false` branch, `count` MUST equal `paths.length`.
- **FR-011**: Listing a folder that does NOT exist MUST surface a structured `CLI_REPORTED_ERROR` whose `details.code` identifies the missing folder. Listing a `folder` value that resolves to a FILE (not a folder) MUST also surface a structured `CLI_REPORTED_ERROR` with a distinguishing `details.code`. Listing a folder that exists but is empty MUST return `{ count: 0, paths: [] }` (success). This MUST NOT inherit the non-recursive `files` tool's three-way conflation (FR-010 in 019-list-files); the recursive tool surfaces missing-folder and not-a-folder cases distinctly.
- **FR-012**: The starting folder MUST NOT appear in `paths`. The response carries descendants of the starting folder only — when `folder` is set, the entry for `folder` itself does not appear; when `folder` is omitted, the vault root (represented as the empty path or otherwise) does not appear.
- **FR-013**: The response's `paths` ordering MUST be stable across consecutive calls with identical inputs. Stability is realised through a wrapper-imposed lexical sort: `paths` MUST be sorted lexically ascending on the UTF-8-encoded vault-relative path string before serialising the response. The sort is byte-compare on the UTF-8 encoding, not locale-aware or Unicode-collation. The sort applies AFTER all other filtering (depth cap, extension filter, dotfile filter, folder-vs-file inclusion rule).
- **FR-014**: A `folder` input with a trailing slash and the same input without a trailing slash MUST yield the same response. If the underlying CLI does not natively treat them as equivalent, the handler MUST normalise before passing through.
- **FR-015**: All validation failures MUST occur strictly before any underlying CLI invocation. Tests MUST be able to assert a CLI dispatcher spy was never called for invalid inputs.
- **FR-016**: The `folder`, `ext`, and `depth` inputs MUST be passed to the underlying CLI in a manner structurally immune to shell-metacharacter and command-injection attacks. The implementation MUST close the injection vector structurally — either via argv-array passing to a native subcommand or via base64-encoded JSON payload consumed by a frozen JS template (the established eval-cohort pattern). The choice of route is a planning-phase decision.
- **FR-017**: Path-traversal attempts on the `folder` field MUST either be rejected at the validation boundary or verified to be rejected by the underlying CLI's vault-confinement check. The wrapper MUST NOT return a listing of paths outside the named vault's root.
- **FR-018**: The tool MUST surface a structured error when the named vault does not match any registered Obsidian vault. If the underlying CLI returns a non-error-shaped response for unknown vaults, the implementation MUST reclassify that response to `CLI_REPORTED_ERROR` (parity with 011-R5 inheritance across the prior typed tools).
- **FR-019**: The tool MUST surface a structured error in `target_mode: "active"` when no Obsidian instance is reachable (no focused vault).
- **FR-020**: When the serialised response payload would exceed the typed-tool output cap, the tool MUST surface a structured "output too large" error rather than silently truncating the `paths` array. The cap value is inherited from the existing CLI-adapter cap (no new cap is introduced).
- **FR-021**: Errors MUST flow through the project's existing structured error codes — no new top-level error codes MUST be introduced by this feature. Validation failures surface as `VALIDATION_ERROR`; CLI-layer failures surface through the existing CLI-failure codes; output-cap failures surface through the existing cap-exceeded code. The missing-folder and not-a-folder cases (FR-011) surface as `CLI_REPORTED_ERROR` with distinguishing `details.code` values — no new top-level codes. The eleven-tool-and-counting zero-new-top-level-codes streak (preserved through BI-026 onwards) is preserved by this feature.
- **FR-022**: The tool MUST be registered through the project's existing typed-tool registration factory. The progressive-disclosure help facility's documentation file for the tool MUST be authored with the per-field input contract, both output-shape branches, the depth-bounding semantics, the folders-vs-files rule, the failure-mode roster, and at least four worked examples covering at minimum: whole-vault recursive listing, sub-folder subtree listing with `ext`, depth-limited overview, count-only mode.
- **FR-023**: Each acceptance criterion across US1–US9 MUST be locked by at least one regression test that survives subsequent re-runs unchanged. The test count MUST be sufficient to cover schema validation, handler behaviour, and registration consistency — totalling no fewer than 40 tests.
- **FR-024**: The feature MUST run a live-CLI characterisation pass before ship that documents observable CLI behaviour for each of the following cases. Findings MUST be persisted in the feature's research artefact.
  - Listing a vault root with a small handful of files and folders (one case per: all files at root, files plus one nested folder, multi-level nesting, empty vault).
  - Listing a sub-folder with a known subtree (one case per: small flat sub-folder, deep narrow sub-folder, wide shallow sub-folder).
  - Listing with `depth: 1`, `depth: 2`, `depth: 3` against a fixture deep enough to make each cap observable.
  - Listing with `depth` larger than the actual subtree height — confirms the silent-acceptance contract.
  - Listing with `ext` filter (one case per: filter matches some files, filter matches no files, filter is `"md"` vs `".md"`).
  - Listing with no `ext` (folder entries appear in `paths`) vs with `ext` set (folder entries excluded) against the same fixture — confirms FR-007.
  - Listing a folder that does NOT exist — confirms the structured `CLI_REPORTED_ERROR` path with the missing-folder `details.code`.
  - Listing a `folder` value that resolves to a FILE — confirms the structured `CLI_REPORTED_ERROR` path with the not-a-folder `details.code`.
  - Listing an EMPTY folder that exists — confirms the success-with-empty-paths shape.
  - Listing with `total: true` (one case per: populated subtree, empty subtree, with `ext` filter, with `depth` cap).
  - Listing twice in succession — confirms the wrapper-imposed lexical sort (FR-013) is applied and byte-identical across the two calls.
  - Listing a subtree containing files with emoji, non-ASCII characters, leading/trailing whitespace.
  - Listing a subtree containing dotfiles and dot-directories — confirms the wrapper-side dotfile filter (FR-027) drops every dot-prefixed entry from `paths`.
  - Listing with a trailing slash on `folder` versus without — confirms whether the underlying CLI treats them as equivalent.
  - Listing with an unknown vault display name — confirms the unknown-vault reclassification path.
  - Listing with active mode and no focused vault — confirms the structured-error path.
  - Path-traversal on `folder` (e.g. `folder: "../../etc"`) — confirms whether the rejection layer is the wrapper or the underlying CLI.
  - Listing a synthetically large subtree whose `paths` array exceeds the output cap — confirms the structured "output too large" error path AND that `total: true` succeeds on the same fixture AND that `depth: 1` succeeds for a wide-shallow variant.
- **FR-025**: The feature MUST NOT change the public surface of any existing typed tool. The only permitted edit to existing source is the addition of the new recursive listing tool to the registration list and the registry-baseline JSON. Existing tools (including the non-recursive `files` tool) MUST remain byte-stable.
- **FR-026**: All new source files introduced by this feature MUST carry the project's "Original — no upstream." attribution header per the project Constitution's originality principle, except for any portion that wraps a native upstream CLI subcommand verbatim — that portion MAY carry the "Upstream-derived" attribution per the Constitution.
- **FR-027**: The wrapper MUST filter out from `paths` any path whose vault-relative representation contains a segment beginning with `.` (one or more — `.gitignore`, `.obsidian/app.json`, `notes/.hidden.md` all match). The rule is uniform across every result path, NOT special-cased for the caller's `folder` input. Direct consequence: a call where `folder` is itself a dot-directory returns `{ count: 0, paths: [] }`. The `count` reflects the filtered set in both `total: false` and `total: true` modes — the filter applies BEFORE the count is computed, so `total: true` does NOT bypass it. Inherited from the non-recursive `files` tool's FR-028 with the same rule extended to recursive depth.

### Key Entities

- **Recursive listing request**: A folder-subtree enumeration request. Carries a `target_mode` discriminator (`"specific"` or `"active"`), an optional `folder` (vault-relative sub-folder; omitted means vault root), an optional `depth` (positive integer cap on traversal depth; omitted means unbounded), an optional `ext` (extension filter on files; folders excluded when set), and an optional `total` boolean (default `false`). In specific mode the request carries a `vault` display name; in active mode the request operates on the focused vault. The request MUST NOT carry the file-scoped locator fields `file` or `path`.
- **Recursive listing response**: An object with two fields: `count` (a non-negative integer) and `paths` (an array of vault-relative path strings). On the `total: false` branch, `count === paths.length`. On the `total: true` branch, `paths === []` and `count` carries the full entry count after all filtering. The response is the only success-path return value; any failure surfaces as a structured error, never as a partial `paths` array.
- **Depth bound**: A positive integer that caps the traversal depth measured from the starting folder. Depth 0 is the starting folder itself (never included in `paths`); depth 1 is the immediate children; depth N is N levels below. When `depth` is omitted the traversal is unbounded. Values that are zero, negative, non-integer, or non-numeric fail validation. A `depth` greater than the actual subtree height is silently accepted (the response is identical to an omitted `depth` for that subtree).
- **Extension filter**: A string whose normalised form is matched against file extensions. Leading-dot (`.md`) and bare (`md`) forms are equivalent (handler normalises). When set, folder entries are excluded from `paths`; when omitted, folder entries appear alongside files. An `ext` matching no files in the subtree returns the empty-listing shape `{ count: 0, paths: [] }` (success).
- **Ordering convention**: Wrapper-imposed lexical ascending sort on the UTF-8-encoded vault-relative path strings (per FR-013). The wrapper does NOT depend on the underlying CLI's enumeration order — whatever the CLI returns is re-sorted before the response is serialised. The contract is platform-independent (byte-compare, not locale-aware) and immune to CLI version drift.
- **Failure-mode roster**: Six entry types — `VALIDATION_ERROR` (invalid input shape), `CLI_REPORTED_ERROR` with `details.code` identifying unknown vault, `CLI_REPORTED_ERROR` with `details.code` identifying missing folder, `CLI_REPORTED_ERROR` with `details.code` identifying not-a-folder, `ERR_NO_ACTIVE_FILE`-or-equivalent (active mode, no focused vault), and the output-cap-exceeded error inherited from the CLI adapter. Zero new top-level error codes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Listing a vault root with no `folder` returns a response where `count === paths.length` and every element of `paths` is a vault-relative path string in 100% of test runs. Both file and folder entries appear in `paths` when `ext` is omitted.
- **SC-002**: Listing a named sub-folder returns only paths beneath that sub-folder (not the starting folder itself, not entries outside the sub-folder's subtree) in 100% of test runs.
- **SC-003**: Listing with `depth: 1` returns only the immediate children of the starting folder in 100% of test runs. Listing with `depth: N` returns only paths at depths 1..N from the starting folder. Listing with no `depth` returns the full recursive subtree.
- **SC-004**: Listing with an `ext` filter returns only files matching the extension AND excludes folder entries from `paths` in 100% of test runs. Listing without an `ext` filter includes folder entries in `paths` alongside files.
- **SC-005**: Listing a folder that does NOT exist produces a structured `CLI_REPORTED_ERROR` whose `details.code` identifies the missing folder, in 100% of test runs. Listing a `folder` value resolving to a FILE produces a structured `CLI_REPORTED_ERROR` with a distinguishing `details.code`. Listing an empty folder returns `{ count: 0, paths: [] }` (success) — the three cases are observably distinct at the response surface.
- **SC-006**: Listing with `total: true` returns a response where `paths === []` AND `count` equals what would have been returned without the flag, in 100% of test runs. The flag composes with `ext` filtering and with `depth` capping.
- **SC-007**: The response's `paths` array is sorted lexically ascending on the UTF-8-encoded vault-relative path string per FR-013 in 100% of test runs. Two consecutive calls with identical inputs return byte-identical `paths` arrays.
- **SC-008**: Every invalid input shape rejected at the validation boundary (US7 scenarios 1–9) produces a structured `VALIDATION_ERROR` AND zero underlying CLI invocations across 100% of test runs.
- **SC-009**: A `folder` input with a trailing slash and the same input without a trailing slash yield the same response in 100% of test runs.
- **SC-010**: Listing with an unknown vault display name produces a structured error AND no silent empty-listing in 100% of test runs.
- **SC-011**: Listing in active mode with no focused vault produces a structured error in 100% of test runs.
- **SC-012**: A path-traversal attempt on the `folder` field does NOT return a listing of paths outside the named vault's root in 100% of test runs. Whichever layer performs the rejection, the response surface is a structured error.
- **SC-013**: A subtree whose serialised `paths` array would exceed the typed-tool output cap produces a structured "output too large" error AND no truncated `paths` array in 100% of test runs. The same fixture queried with `total: true` succeeds with the full count.
- **SC-014**: Every byte of the public output of the existing typed tools is unchanged by this feature, except for the help facility growing one new entry and the registry baseline growing one new tool fingerprint.
- **SC-015**: The published documentation for the recursive listing tool covers the full per-field input contract, both output-shape branches, the depth-bounding semantics, the folders-vs-files rule, the failure-mode roster, and at least four worked examples covering at least four distinct scenarios.
- **SC-016**: Every acceptance criterion across US1–US9 is locked by at least one regression test, totalling no fewer than 40 tests across schema, handler, and registration suites.
- **SC-017**: Zero new top-level error codes are introduced by this feature; every failure flows through existing structured error codes. The missing-folder and not-a-folder cases (FR-011) are distinguished via `details.code` on the existing `CLI_REPORTED_ERROR` top-level code (ADR-015 sub-discriminator pattern).
- **SC-018**: The live-CLI characterisation pass (FR-024) documents observable behaviour for every enumerated case, persisted in the feature's research artefact and surfaceable from the published documentation.
- **SC-019**: An agent enumerating a vault subtree can do so in a single typed tool call returning a structured flat path array, replacing what previously required either `obsidian_exec` plus client-side line parsing OR chained per-folder calls against the non-recursive `files` tool. The latency saving on a vault with N folders is proportional to N (no per-folder round-trip).
- **SC-020**: The `folder`, `ext`, and `depth` inputs cannot reach a shell-evaluated context. The injection vector is closed structurally by the planning-phase routing decision (argv-array passing to a native subcommand OR base64-encoded JSON payload to a frozen JS template), verifiable by inspection of the dispatcher call shape.
- **SC-021**: For a fixture subtree containing both visible files and dot-prefixed files, the `paths` array contains only the visible entries AND zero dot-prefixed entries, in 100% of test runs. The `count` reflects the filtered set on both `total: false` and `total: true` branches. Inherited from the non-recursive `files` tool's SC-022 with the rule extended to recursive depth.

## Assumptions

- The user input was exhaustive for the user-supplied surface (four user stories across two implied priority bands, an explicit out-of-scope list, and clear behaviour for missing-folder and depth bounding). No `/speckit-clarify` invocation is gated on this feature description — the spec authors target-mode discriminator parity with the existing non-recursive `files` tool, the count-only `total` flag for project-wide consistency, and the wrapper-imposed lexical sort and dotfile filter inherited from the non-recursive tool's clarifications session. If the planning phase surfaces unforeseen design forks, those will be resolved via `/speckit-clarify` then.
- The user input explicitly DEPARTS from the non-recursive `files` tool's missing-folder conflation rule (which returns `{ count: 0, paths: [] }` for missing, empty, and folder-names-a-file). The recursive tool surfaces the missing-folder and not-a-folder cases as structured errors per direct user direction ("a structured error is returned identifying the missing folder"). The departure is locked into FR-011 and is observable in tests via SC-005.
- The user input explicitly INCLUDES folder entries in the response (alongside files) when no extension filter is set ("returns a flat list of all files and folders within a vault"). When an extension filter is set, folder entries are EXCLUDED — this is a wrapper-side decision because filtering folders by extension is nonsensical. The folders-vs-files rule is locked into FR-007 and is observable in tests via SC-004.
- The underlying Obsidian CLI's surface for recursive listing is a planning-phase concern. The CLI exposes both a native typed enumeration subcommand AND the `eval` subcommand that walks `app.vault.adapter` directly. The planning phase will determine whether the native subcommand satisfies the spec's requirements (depth bound, folder-vs-file inclusion, recursive traversal in a single call) or whether the eval-cohort pattern is required. Either route closes the security envelope per FR-016 and surfaces missing-folder / not-a-folder errors per FR-011.
- The bridge classifier's existing inheritance for unknown-vault response inspection (introduced in feature 011 and inherited unchanged across the typed-tool cohort) is applicable to this feature. If the planning-phase route differs (e.g. `eval`-driven), the same closed-vault-detection module already adopted by the eval cohort (BI-026 inline, BI-027 lifted to shared, BI-028 third consumer) is applicable to this feature as a fourth consumer.
- The existing CLI-adapter output cap is the cap this feature inherits. No new cap is introduced. The recursive nature of this listing makes the cap more reachable than for the non-recursive tool — the depth bound (FR-006) is the natural mitigation, and the count-only `total` flag (FR-008) is the unconditional safety valve.
- The post-010 flat-extension idiom for `target_mode` schemas and the post-011 module-layout convention (`index.ts` factory + co-located tests) are the conventions this feature consumes. The folder-scoped surface inherits the same target-mode discriminator adaptation already established by the non-recursive `files` tool (forbid `file` and `path` locator fields in both modes; accept `folder` instead). No precedent feature's spec or plan is amended.
- The project's standard target-mode discriminator semantics defined in ADR-003 apply with a folder-scoped adaptation: the recursive listing tool operates on a vault sub-folder's subtree (specific-mode) or the focused vault's sub-folder subtree (active-mode), parity with the non-recursive `files` tool. The ADR is NOT amended.
- The release impact is purely additive: no existing tool's public surface changes; no top-level error codes are added; no ADRs are amended. The version bump policy (patch — typed-surface addition) is a planning-phase decision but the additive shape is a constraint set by this spec.
- The tool's user-facing name is a planning-phase decision per ADR-010. If the underlying CLI exposes a native recursive listing subcommand whose name is a single word (e.g. `tree`, `walk`, `find`), that name takes precedence per the single-word-verbatim-from-upstream rule. If no native subcommand exists or the underlying surface is composed via `eval`, the name is an original single-word choice. Working name in this spec: "the recursive listing tool" — substituted at plan stage.
- Out of scope for this feature, recorded here so the planning phase does not silently absorb them: nested tree output shape (the response is a flat path list — hierarchical tree shape is a potential future enrichment); per-node metadata (size, modification time, creation time — separate per-file and per-folder info primitives cover this; this tool returns paths only); frontmatter-based filtering (combining recursive listing with property criteria is a composition with the existing `find_by_property` primitive — not bundled here); dotfile and hidden-file inclusion (v1 omits hidden entries per FR-027, consistent with the existing non-recursive listing tool); cross-vault traversal (vault-scoped only — no cross-vault composition); symlink behaviour (whatever the underlying CLI does, documented but not normalised by the wrapper); permission-denied entries (whatever the underlying CLI does, documented but not normalised by the wrapper).
