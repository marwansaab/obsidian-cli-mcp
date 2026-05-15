# Feature Specification: Fix Tree Tool Surface

**Feature Branch**: `032-fix-tree-surface`
**Created**: 2026-05-15
**Status**: Draft
**Input**: User description: "Fix tree tool — the registered description, published input schema, and tool name are corrected to eliminate four agent-visible defects identified in v0.5.7: a misleading name that implies hierarchical output when the tool returns a flat path list, an over-long description that violates the project's progressive-disclosure contract, internal development artefacts embedded in the caller-facing string, and input schema fields that are permanently forbidden at runtime."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Description is concise and free of internal artefacts (Priority: P1)

An LLM agent connects to the server and lists its tools. The agent renders the response in whatever display surface its MCP client provides. Today the `tree` tool's registered description is a ~2 600-character block that opens with the output-shape one-liner, then spends most of its bulk on internal project artefacts — FR-NNN codes, BI-NNN references, ordinal phrases like "fifteenth typed-tool wrap", spec-branch findings, and the name of a shared internal module (`_eval-vault-closed-detection`). Several MCP clients truncate before the agent reaches the parameter docs or the failure roster. The bulk of the bytes consume token budget without aiding the agent's tool-use decision. With this feature shipped, the registered description is short enough to render in full across all common MCP clients, opens with a sentence that states the flat-output shape, names the parameters and a brief modal summary, and ends with a pointer instructing callers to invoke `help` for the full documentation. The artefact bulk lives in `docs/tools/<name>.md` and behind `help`, where it belongs per the project's progressive-disclosure convention (ADR-005).

**Why this priority**: The registered description loads on every `tools/list` call. Every agent in every session pays the cost. The bulk inflates token use, risks display truncation that hides the parameter docs the agent actually needs, and bleeds internal project vocabulary into the caller-facing surface. The fix is a one-time edit to one string in one source file.

**Independent Test**: After the change, run a `tools/list` call against the server and inspect the description for the renamed-replacement-of-`tree` tool. Confirm: (a) the description starts with a sentence naming the flat path-list output shape; (b) no token in the description matches `/\bFR-\d+\b/`, `/\bBI-\d+\b/`, `/\bADR-\d+\b/`, `/\b(fifteenth|sixteenth|seventeenth) typed-tool wrap\b/`, or `_eval-vault-closed-detection`; (c) the description ends with a literal `help` pointer; (d) the character count is below the agreed cap. No interaction with the file system or the vault is required.

**Acceptance Scenarios**:

1. **Given** the server is running and a client connects, **When** the client requests `tools/list`, **Then** the renamed-replacement-of-`tree` tool's `description` field opens with a sentence that names the output shape `{ count, paths: string[] }` and characterises `paths` as a flat list before any other detail.
2. **Given** the registered description string, **When** scanned for the patterns `\bFR-\d+\b`, `\bBI-\d+\b`, `\bADR-\d+\b`, `\b(twelfth|thirteenth|fourteenth|fifteenth|sixteenth) typed-tool wrap\b`, and the literal substring `_eval-vault-closed-detection`, **Then** zero matches are found.
3. **Given** the registered description string, **When** its character length is measured, **Then** the length is at most the cap pinned by FR-011.
4. **Given** the registered description string, **When** read end-to-end, **Then** the final clause is a literal `help` pointer of the form `Call help({ tool_name: "<name>" }) for full documentation` (precise wording locked at plan stage to match the convention sibling tools already use).

---

### User Story 2 — Schema only exposes runtime-valid fields (Priority: P1)

An LLM agent encounters the renamed-replacement-of-`tree` tool and constructs a call by reading the published `inputSchema` JSON Schema directly. The schema currently advertises top-level properties `target_mode`, `vault`, `file`, `path`, `folder`, `depth`, `ext`, `total`. The agent picks valid values for `target_mode`, `vault`, and `path` — perfectly reasonable choices for a tool that operates on a folder, given that `path` looks like a folder path. The call returns `VALIDATION_ERROR: path is not allowed for folder-scoped tools`. The agent is confused: the schema said `path` was acceptable. Today this confusion happens because the schema was constructed by reusing the file-scoped `targetModeBaseSchema` (which carries `file` and `path`) and then adding a runtime refinement that rejects `file` and `path` for folder-scoped tools. The JSON Schema emitter does not see the runtime refinement, so `file` and `path` leak into the published schema. With this feature shipped, the published inputSchema lists only the fields that are actually valid at runtime — no `file`, no `path`. The runtime refinement either becomes redundant (the schema layer alone enforces the constraint) or is preserved as a defence-in-depth layer; either way the agent-visible schema and the runtime behaviour agree.

**Why this priority**: The schema is the contract. An agent that constructs a call using only schema-exposed fields is operating in good faith; a `VALIDATION_ERROR` for an unknown field in that case is a contract violation, not user error. This is the most agent-blocking of the three defects: the description is annoying but parseable; the misleading name can be overridden by the description; the schema-contract mismatch produces an error the agent cannot diagnose without out-of-band knowledge.

**Independent Test**: After the change, fetch the renamed-replacement-of-`tree` tool's `inputSchema` from `tools/list`. Enumerate the top-level properties under `properties`. Confirm `file` and `path` are absent. Construct a call using only the fields that ARE in the schema with valid values (for example `{ target_mode: "specific", vault: "X", folder: "Y/" }`) and confirm the call does not fail with `VALIDATION_ERROR` citing an unknown field. No interaction with the file system or a real CLI is required if the schema-validation layer is exercised in isolation.

**Acceptance Scenarios**:

1. **Given** a `tools/list` response, **When** the renamed-replacement-of-`tree` tool's `inputSchema.properties` keys are enumerated, **Then** `file` and `path` are NOT present.
2. **Given** an input `{ target_mode: "specific", vault: "X", folder: "Y" }`, **When** validated against the published schema, **Then** the input passes (no validation error is raised) — assuming the runtime ALSO accepts this shape, which it does in v0.5.7.
3. **Given** an input that mentions `file: "Z"` or `path: "Z"` at the top level, **When** validated against the published schema, **Then** validation fails with a `VALIDATION_ERROR` whose message cites an unknown / unexpected property, NOT a "not allowed for folder-scoped tools" runtime-refinement message.
4. **Given** the target_mode-specific rules that exist in v0.5.7 (vault required in specific mode; vault forbidden in active mode), **When** an input violates one of those rules, **Then** validation continues to fail with the existing message (this story does NOT widen or narrow target_mode enforcement).

---

### User Story 3 — Tool name does not suggest hierarchical output (Priority: P2)

An LLM agent that has not yet read the description sees the tool name `tree` in the listing. The agent's prior on the word "tree" — drawn from shell `tree`, file-system tree views, AST trees, and most other software contexts — is hierarchical / nested output. The agent forms an expectation that the tool will return a nested structure (perhaps a JSON object with `children` arrays). The agent then reads the description (or fails to, if the client truncates) and either revises the expectation correctly, partially, or not at all. With this feature shipped, the tool is registered under a name that does not evoke a hierarchical mental model — a name like `paths` (which mirrors the output field), `find` (which evokes shell-find recursion without nesting), or `walk` (which evokes traversal without a tree-of-objects implication). The agent's first-glance reading matches reality.

**Why this priority**: This is lower than the schema and description fixes because the description (once corrected by Story 1) carries the load: a name that is misleading on its own but accompanied by an opening sentence stating "Flat path list of files and folders…" produces a brief moment of confusion but no incorrect behaviour. The fix is still valuable — the name is the first thing the agent reads and the only thing that survives across log lines, error messages, and code reviews — but it is dominated in impact by the schema and description fixes.

**Independent Test**: After the change, fetch the `tools/list` response and read the tool's `name` field. Confirm the new name does not contain the substring `tree` and does not contain other words that strongly suggest hierarchical output (such as `hierarchy`, `nested`, `subtree`, `branches`). Confirm that the existing `tree`-named entry is no longer present in the listing. No interaction with the file system or a real CLI is required.

**Acceptance Scenarios**:

1. **Given** the post-change `tools/list` response, **When** the tool registry is enumerated, **Then** no tool's `name` is `tree`.
2. **Given** the post-change `tools/list` response, **When** the tool registry is enumerated, **Then** exactly one tool exposes the runtime behaviour previously offered by `tree` (the renamed replacement).
3. **Given** the new name, **When** read in isolation by a reader unfamiliar with the project, **Then** the name does not evoke a hierarchical / nested output shape (a qualitative criterion verified at spec / clarify stage by the team, not by automated test).
4. **Given** the rename is a breaking change, **When** the change ships, **Then** the release follows the project's single-release breaking-rename pattern (no deprecation alias, single MINOR-version bump on a pre-v1.0 codebase) established by feature `022-rename-typed-tools`.

---

### Edge Cases

- **Sibling folder-scoped tool with the same schema defect**: The `files` tool (introduced by BI-019, renamed in BI-022) shares the same schema construction pattern — it consumes `targetModeBaseSchema` and applies `applyTargetModeRefinementForFolderScoped`, which means its published `inputSchema` ALSO exposes `file` and `path` despite the runtime rejecting them. This defect is real but is OUT OF SCOPE for this feature per the user's explicit scope statement (tree-tool surface only). A future BI may extend the fix to `files`; see [out-of-scope](#out-of-scope-surfaces-explicitly-excluded).
- **Schema-layer change vs refinement-layer change**: The schema-fix surface has two reasonable implementations. The first is to construct a new folder-scoped base schema that omits `file` / `path` from its shape — the published JSON Schema then lacks them by construction, and the runtime refinement loses its `file`/`path` clauses (they become structurally impossible). The second is to keep `targetModeBaseSchema` as-is, extract a `targetModeFolderScopedBaseSchema` that omits the two fields, and consume it only in folder-scoped tools — the file-scoped surface is untouched. Either implementation satisfies the acceptance criteria; the choice is a plan-stage decision that is informed by the impact on `applyTargetModeRefinementForFolderScoped` and on the `files` tool that ALSO consumes it.
- **Cross-tool implication of changing `applyTargetModeRefinementForFolderScoped`**: If the chosen implementation removes the `file`/`path` clauses from the refinement function (because the schema layer now handles the exclusion), and IF the `files` tool keeps its current schema (which DOES expose `file` / `path`), then the `files` tool would lose its runtime rejection of those fields without gaining a schema-layer rejection. The plan stage MUST address this hazard explicitly — either by keeping the refinement clauses (defence-in-depth, both tools safe), or by updating BOTH tools' schemas in lockstep, or by scoping this BI tightly to the `tree`-replacement schema only and accepting that the refinement function is now load-bearing for `files` only.
- **Help-tool `tree` → new-name pointer**: The `help` tool's tool-name argument lookup MUST resolve the new name. If the help tool's name-resolution table is generated from the live registry, this is automatic. If it carries any hand-coded `tree`-keyed entry (for example, in static doc text), that entry MUST be updated.
- **`docs/tools/tree.md` filename**: The docs file MUST move to match the new tool name. The registry-consistency test at `src/server.test.ts` enforces that every registered tool has a matching `docs/tools/<name>.md`; the existence of the old file at the old name would not satisfy this test for the new tool.
- **`_register-baseline.json` registry-stability baseline**: The BI-022 baseline machinery fingerprints every tool's description and schema. Renaming a tool, rewriting its description, and removing schema properties are all baseline-changing events. The baseline MUST be rolled forward in the same commit that registers the renamed tool with its new surface. Without the roll-forward, `src/tools/_register-baseline.test.ts` fails.
- **Architecture-doc reference**: The canonical architecture document at `.architecture/Obsidian CLI MCP - Architecture.md` references `tree` as the fifteenth typed-tool wrap and as the consumer that codified the `_eval-vault-closed-detection` shared module. The doc is rolled forward at the next architecture-impacting BI per the project's snapshot convention; whether THIS BI rolls it forward or defers to a future doc-pass is a plan-stage decision (recommend: roll-forward in same commit to preserve doc-truth alignment).
- **`help`-pointer wording**: Sibling tools that already carry a help-pointer convention establish the wording template. The plan stage extracts the exact wording so the new description matches the established surface.

## Requirements *(mandatory)*

### Functional Requirements

**Schema correctness**:

- **FR-001**: The renamed-replacement-of-`tree` tool's published `inputSchema.properties` MUST NOT include `file` or `path` at the top level.
- **FR-002**: A call constructed from valid values for ONLY the fields present in the published `inputSchema` MUST NOT fail with a `VALIDATION_ERROR` citing an unknown, unexpected, or "not allowed for folder-scoped tools" field. This is the schema-runtime-agreement invariant.
- **FR-003**: The schema MUST continue to enforce the v0.5.7 target_mode rules: `vault` required when `target_mode === "specific"`; `vault` forbidden when `target_mode === "active"`. The migration from refinement-layer-only to schema-layer (or hybrid) enforcement of the `file`/`path` exclusion MUST NOT alter the target_mode rules.
- **FR-004**: The schema MUST continue to accept the v0.5.7 folder-scoped fields with their existing shapes and constraints: `folder` (optional string, min 1 char); `depth` (optional positive integer); `ext` (optional string, min 1 char); `total` (optional boolean).

**Description quality**:

- **FR-005**: The registered description MUST NOT contain any token matching `\bFR-\d+\b`, `\bBI-\d+\b`, `\bADR-\d+\b`, `\bSC-\d+\b`, `\bTC-\d+\b`, `\b[FQR]-\d+[a-z]?\b`, or `\bUS-\d+\b`. Spec-branch identifier prose is for spec readers, not tool callers.
- **FR-006**: The registered description MUST NOT contain ordinal phrases of the form `\b(first|second|third|...|fifteenth|sixteenth|seventeenth) typed-tool wrap\b` or equivalent phrasings describing the tool's position in the project's BI cohort.
- **FR-007**: The registered description MUST NOT contain the literal substrings `_eval-vault-closed-detection`, `targetModeBaseSchema`, `applyTargetModeRefinementForFolderScoped`, or any other identifier that names an internal source-tree module, function, type, or test seam.
- **FR-008**: The registered description MUST open with a sentence that names the output shape `{ count, paths: string[] }` and characterises `paths` as a flat list of file-and-folder path strings. "Flat" or a synonym ("non-nested", "single-level list", "array of path strings, not a tree") MUST appear in this opening sentence.
- **FR-009**: The registered description MUST mention the trailing-slash file-vs-folder discriminator as a callable-relevant fact (folder entries end with `/`; file entries do not), but MUST NOT cite the spec-branch identifier of that decision.
- **FR-010**: The registered description MUST end with a pointer of the form `Call help({ tool_name: "<name>" }) for full documentation` (or whatever wording sibling tools' descriptions already use as the help-pointer convention; precise wording locked at plan stage).
- **FR-011**: The registered description MUST be at most 1 024 characters in length, measured as the UTF-16 length of the JavaScript string literal. The cap is the smallest commonly-cited MCP-client display threshold; sub-thresholds (256, 512) are stretch goals but are not gating.
- **FR-012**: The description MUST name the parameters (`target_mode`, optional `vault` / `folder` / `depth` / `ext` / `total`) and a one-clause-each summary sufficient to construct a typical call without invoking `help`. The summary MUST NOT include the per-parameter implementation details (boundary edge cases, normalisation rules, deprecation history, etc.) that currently bloat the v0.5.7 description.

**Name correctness**:

- **FR-013**: The renamed-replacement-of-`tree` tool MUST be registered under a name that, read in isolation, does not suggest hierarchical, nested, or recursive-tree-of-objects output. The name MUST NOT be `tree` and MUST NOT contain the substrings `tree`, `hierarchy`, `nested`, `subtree`, `branches`, `nodes`, or `children`. The specific replacement name is locked at plan stage; reasonable candidates include `paths`, `find`, and `walk`.
- **FR-014**: The rename MUST follow the project's single-release breaking-rename pattern established by feature `022-rename-typed-tools`: no deprecation alias for the old name; the rename ships in a single release commit; the version bump is at MINOR granularity given the pre-v1.0 codebase.
- **FR-015**: The renamed tool's source directory under `src/tools/`, its factory function name, its `<TOOL>_TOOL_NAME` and `<TOOL>_DESCRIPTION` exported constants, its co-located test files, and the `docs/tools/<name>.md` documentation file MUST move in lockstep with the registered tool name, preserving git-blame history via `git mv` per the BI-022 lockstep convention.

**Stability**:

- **FR-016**: The tool's runtime behaviour, output shape, error codes, traversal logic, and per-mode argv assembly MUST remain byte-stable from v0.5.7. This BI corrects the description and schema SURFACE only. The handler module and the eval template MUST NOT be edited except for symbol-rename mechanics (factory function name, constant names) flowing from FR-015.
- **FR-017**: The registry-stability baseline at `src/tools/_register-baseline.json` MUST be rolled forward in the same commit that registers the renamed-replacement tool with its new description and new schema. Without the roll-forward, the durable test at `src/tools/_register-baseline.test.ts` fails. The roll-forward is a regenerate-and-commit operation, not a hand edit.
- **FR-018**: The full `npm test` run on the post-change codebase MUST pass with zero net new failures. Existing tests that hard-code the literal name `tree` or hard-code substrings from the v0.5.7 description MUST be updated as part of this BI; tests that exercise runtime behaviour or output shape SHOULD pass without edit.

**Documentation surface**:

- **FR-019**: `docs/tools/<new-name>.md` MUST exist (moved from `docs/tools/tree.md` via `git mv`) and MUST be updated so the file's heading, the prose-mentioned tool name, and any other in-file references match the new name. The bulk of the file's content (parameter docs, examples, inherited-limitations list, failure roster) is preserved verbatim — this BI does not rewrite the full docs.
- **FR-020**: The architecture document `.architecture/Obsidian CLI MCP - Architecture.md` MAY be rolled forward in this BI's commit to update the `tree`-named references to the new name. Whether the roll-forward happens in THIS BI or is deferred to a future architecture-touching BI is a plan-stage decision; the spec does not require it but recommends it.
- **FR-021**: The `README.md` and `CHANGELOG.md` updates announcing the rename and the description fix are OUT OF SCOPE for this BI per the user's explicit scope statement and are deferred to the follow-up release-prep pass.

### Out-of-Scope Surfaces (explicitly excluded)

- The sibling `files` tool's schema (BI-019, post-022 rename). The `files` tool consumes the same `targetModeBaseSchema` + `applyTargetModeRefinementForFolderScoped` pattern and therefore exposes the same `file` / `path` schema defect. Fixing `files` is OUT OF SCOPE; the plan stage MUST ensure the chosen schema-fix implementation for the tree-replacement does NOT silently regress `files` (see [edge cases](#edge-cases)).
- Tests covering the corrected surface. The user explicitly defers test additions to the next session. Existing tests that fail due to literal-name or literal-description-substring drift MUST be updated as part of this BI; brand-new tests that assert FR-001 / FR-005 / FR-013 etc. are NOT written here.
- The README and CHANGELOG passes (FR-021).
- Runtime-behaviour changes: output shape, error code roster, traversal logic, depth / ext / total semantics, per-mode argv assembly. The user's scope statement is explicit. This BI is description and schema surface ONLY.
- Re-organising the project's progressive-disclosure ADR (ADR-005). The fix is a worked example of ADR-005's intent, not an amendment to ADR-005. If post-implement reflection surfaces that ADR-005 needs sharper teeth (a per-tool description length cap, a forbidden-token allowlist, a doc-test gate), that amendment is a separate BI.
- Adding a new ADR or amending the Constitution. The change is mechanical surface correction; no new project-wide rule is established.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The character length of the registered description for the renamed-replacement-of-`tree` tool is at most 1 024 (FR-011). Measured by reading `<NEW_TOOL>_DESCRIPTION` from the post-change registration module and counting the UTF-16 length of the literal.
- **SC-002**: Zero matches when the registered description is grepped against the regex set `(\bFR-\d+\b)|(\bBI-\d+\b)|(\bADR-\d+\b)|(\bSC-\d+\b)|(\bTC-\d+\b)|(\b[FQR]-\d+[a-z]?\b)|(\bUS-\d+\b)|(\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth) typed-tool wrap\b)`.
- **SC-003**: Zero literal-substring matches when the registered description is searched for `_eval-vault-closed-detection`, `targetModeBaseSchema`, or `applyTargetModeRefinementForFolderScoped`.
- **SC-004**: The first 80 characters of the registered description, read in isolation, name the output shape and characterise the output as flat — verified by reading the leading clause and confirming both `paths` and a flat-output synonym appear.
- **SC-005**: The renamed-replacement-of-`tree` tool's published `inputSchema.properties` keys are exactly the set `{target_mode, vault, folder, depth, ext, total}` (six keys; no `file`; no `path`).
- **SC-006**: A schema-validation pass over the input `{ target_mode: "specific", vault: "X", folder: "Y" }` succeeds; the same pass over `{ target_mode: "specific", vault: "X", path: "Y/" }` fails with an unknown-property error rather than a runtime-refinement error.
- **SC-007**: No tool with `name === "tree"` is present in the post-change `tools/list` response; exactly one tool with the new name and the v0.5.7-tree runtime behaviour IS present.
- **SC-008**: `npm test` exit code is `0` on the post-change codebase. Pre-existing tests that pin the literal name `tree` or pin literal-substring content from the v0.5.7 description are updated; no new tests are added by this BI.
- **SC-009**: `npm run baseline:write` produces a baseline that matches the registered surface (the durable test at `src/tools/_register-baseline.test.ts` passes after the roll-forward), and the baseline JSON file shows entries renamed from `tree` to the new name with regenerated description and schema fingerprints.
- **SC-010**: The `docs/tools/<new-name>.md` file exists, its top-level heading matches the new name, and the file's git history is traceable to `docs/tools/tree.md` via a `git mv` operation (verified by `git log --follow`).
- **SC-011**: The sibling `files` tool's published `inputSchema` is byte-identical (or its fingerprint in `_register-baseline.json` is byte-identical) before and after this BI's changes. Confirms the schema-fix implementation did not leak to the out-of-scope sibling.

## Assumptions

- The replacement tool name is selected at plan / clarify stage. The spec does not pre-commit to `paths`, `find`, or any other specific candidate; FR-013's negative constraint ("no `tree`, no `hierarchy`, etc.") plus the qualitative US-3 acceptance criterion 3 ("does not evoke a hierarchical mental model") is the contract. The reasonable default proposed in the user-input description's framing is `paths` (mirrors the output field), with runners-up `find` (evokes shell-find) and `walk` (evokes traversal).
- The 1 024-character description cap (FR-011) is conservative. Some MCP clients tolerate much longer descriptions; some truncate earlier. 1 024 is a commonly-cited threshold that produces no truncation in the clients the project is known to support (Claude Desktop, MCP Inspector, the VSCode MCP extension). A tighter cap (512 or 256) is a stretch goal — a description that fits in 256 characters is preferable per ADR-005's progressive-disclosure intent, but is not gating for this BI.
- The schema-fix implementation choice (new folder-scoped base schema vs hybrid schema+refinement vs surgical schema-only) is deferred to plan stage. The spec's contract is the OBSERVABLE outcome — published schema lacks `file`/`path`, runtime continues to reject all out-of-scope inputs, the sibling `files` tool is not regressed.
- The rename mechanic follows BI-022's lockstep convention verbatim: `git mv` of the source directory, factory-function rename, constant rename, docs-file rename, baseline roll-forward, single release commit. No new conventions are introduced.
- The `help`-pointer wording follows whatever sibling tools' descriptions already use (extracted at plan stage). No new convention for this pointer is invented here.
- The `_register-baseline.json` machinery established by BI-022 is consumed without change. This BI is the eleventh consumer of the roll-forward protocol.
- No new error codes, no new ADRs, no Constitution amendment. The change is surface-corrective; the structural patterns it touches are all pre-existing.
- The package version bump (currently `0.5.8`) lands as `0.5.9` MINOR-or-PATCH per the project's pre-v1.0 release discipline. Whether MINOR (per BI-022's breaking-rename precedent) or PATCH (per the surface-only framing) is a plan-stage decision; the user-input description does not pre-commit. The recommended choice is MINOR, mirroring BI-022, because the rename IS a breaking surface change for any caller that has hard-coded the name `tree`.
