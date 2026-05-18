# Quickstart — find_and_replace

**Branch**: `038-find-replace`
**Authorised test vault**: see [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md). All scenarios below run against the scratch subdirectory under that vault — never against unrelated vault content.

These six scenarios characterise the user-facing surface against a real vault. Each maps to one or more SCs and runs at `/speckit-implement` time after the unit test cohort is green.

---

## Scenario 1 — Preview → confirm → commit for an ADR rename

**Maps to**: SC-001, SC-002, FR-003, FR-004, FR-005, FR-015.

**Setup**: Three scratch notes containing `ADR-0042`:
- `Decisions/ADR-0042 - Old Decision.md` (3 occurrences)
- `Inbox/notes/wiki-refs.md` (1 occurrence)
- `Archive/2024/rationale.md` (1 occurrence)

Record mtimes of all three notes before invocation.

**Step 1 — Preview**:

```json
{
  "pattern": "ADR-0042",
  "replacement": "ADR-0089",
  "mode": "literal"
}
```

**Expected**:
- Response `mode: "preview"`, `total_occurrences: 5`, `affected_notes.length: 3`.
- Notes appear in ascending path order: `Archive/...`, `Decisions/...`, `Inbox/...`.
- Each `Occurrence` carries `line_number`, `full_line`, `matched_substring: "ADR-0042"`, `replacement_substring: "ADR-0089"`.
- All three mtimes unchanged.

**Step 2 — Commit** (re-issue identical request with `commit: true`):

```json
{
  "pattern": "ADR-0042",
  "replacement": "ADR-0089",
  "mode": "literal",
  "commit": true
}
```

**Expected**:
- Response `mode: "commit"`, `total_occurrences_replaced: 5`, `changed_notes.length: 3`, `partial: false`.
- Each on-disk note now contains `ADR-0089` at every preview-promised position; `ADR-0042` no longer appears.
- All three mtimes updated.
- Byte-for-byte preservation of unmatched content (FR-015) — verify by reading each note before/after and diffing every byte outside the replaced positions.

---

## Scenario 2 — Skip defaults respected for embedded code

**Maps to**: SC-003, FR-006, FR-007.

**Setup**: A scratch note `Inbox/mixed-content.md` containing:
- One occurrence of `OldName` in prose (line 2).
- One occurrence of `OldName` inside a fenced code block (line 5–7).
- One occurrence of `OldName` inside an HTML comment (line 10).

**Step**: Preview with default opt-ins.

```json
{ "pattern": "OldName", "replacement": "NewName" }
```

**Expected**:
- Response `mode: "preview"`, `total_occurrences: 1`.
- The single occurrence is the prose one on line 2.
- The fenced-code-block and HTML-comment occurrences are NOT in the response — even though they exist in the note's text.

---

## Scenario 3 — Opt-in include_code_blocks for a deliberate symbol rename

**Maps to**: SC-004, FR-006.

**Setup**: Reuse Scenario 2's `Inbox/mixed-content.md`. Reset to its three-occurrence state.

**Step**: Preview with `include_code_blocks: true`.

```json
{ "pattern": "OldName", "replacement": "NewName", "include_code_blocks": true }
```

**Expected**:
- Response `mode: "preview"`, `total_occurrences: 2`.
- The prose occurrence (line 2) AND the fenced-code-block occurrence (line 5/6/7 — wherever `OldName` actually appears inside the fence) both surface.
- The HTML-comment occurrence (line 10) is still NOT in the response — `include_html_comments` defaults to false and the two opt-ins are independent.

---

## Scenario 4 — Subfolder scope narrows the blast radius

**Maps to**: SC-005, FR-008.

**Setup**: Reuse Scenario 1's three notes. Verify `ADR-0042` exists in all three.

**Step**: Preview restricted to the `Decisions/` subtree.

```json
{
  "pattern": "ADR-0042",
  "replacement": "ADR-0089",
  "subfolder": "Decisions"
}
```

**Expected**:
- Response `mode: "preview"`, `total_occurrences: 3`.
- `affected_notes.length: 1`, the single entry is `Decisions/ADR-0042 - Old Decision.md`.
- `Inbox/notes/wiki-refs.md` and `Archive/2024/rationale.md` are absent from the response even though they contain the pattern.

---

## Scenario 5 — Bound-exceeded refusal for a too-broad pattern

**Maps to**: SC-008, FR-011.

**Setup**: Set `OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES=10` in the server environment before launching. Seed scratch notes that together contain 15 occurrences of `the`.

**Step 1 — Preview**:

```json
{ "pattern": "the", "replacement": "an" }
```

**Expected**:
- Response is an `UpstreamError` envelope:
  - `code: "VALIDATION_ERROR"`
  - `details.code: "OCCURRENCE_COUNT_EXCEEDED"`
  - `details.bound: 10`
  - `details.count: 15`
  - `details.env_var: "OBSIDIAN_FIND_REPLACE_MAX_OCCURRENCES"`
- All scratch notes' mtimes unchanged.

**Step 2 — Commit** (same request + `commit: true`):

**Expected**: identical error envelope. No notes written.

---

## Scenario 6 — Drift detection refuses a stale commit

**Maps to**: FR-012, SC-006 (OCCURRENCE_COUNT_DRIFT discriminator).

**Setup**: Same as Scenario 1, ADR-0042 in 5 places across 3 notes.

**Step 1 — Preview** (as Scenario 1 step 1): confirm `total_occurrences: 5`.

**Step 2 — Out-of-band edit**: between the preview and the commit, manually edit `Inbox/notes/wiki-refs.md` to add ONE more occurrence of `ADR-0042`. (Simulates a concurrent agent or a manual paste.)

**Step 3 — Commit** (same request as preview + `commit: true`):

**Expected**:
- Response is an `UpstreamError` envelope:
  - `code: "VALIDATION_ERROR"`
  - `details.code: "OCCURRENCE_COUNT_DRIFT"`
  - `details.preview_count: 5`
  - `details.commit_count: 6`
- No note is rewritten — the drift refusal fires before any write.

**Recovery**: re-issue preview (now sees 6), confirm, re-issue commit. Second commit attempt succeeds.

---

## Capture format

Each scenario's outcome captures to `specs/038-find-replace/t0-capture/scenario-N.md` with:
1. The exact request payload sent.
2. The exact response payload received (or error envelope).
3. The pre/post mtime + content invariants verified.
4. Pass / Fail with rationale.

T0 captures are committed alongside the implementation per the project T0 convention.
