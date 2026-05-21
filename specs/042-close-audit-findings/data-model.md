# Data Model: Close Audit Findings

**Branch**: `042-close-audit-findings` | **Date**: 2026-05-21 | **Plan**: [plan.md](plan.md)

This BI introduces no new persisted data. The "model" is the wire-shape contract of one runtime change (Story 4) plus the audit-time entity scope (probe records, cohort enumeration, pass-criteria roster) referenced by the documentation reconciliations. Implementation anchors point at existing code paths.

## Touched entities

### 1. `(VALIDATION_ERROR, INVALID_SUBFOLDER)` sub-discriminator pair — runtime change

**Implementation anchors**:
- Schema-layer (path-traversal-shape rejection): [src/tools/find_and_replace/schema.ts:42-51](../../src/tools/find_and_replace/schema.ts#L42-L51) — emits Zod custom issue with `params: { subCode: "INVALID_SUBFOLDER", subReason: "path-traversal" }`.
- Registration-layer (Zod-issue → envelope mapping): [src/tools/find_and_replace/index.ts:82-89](../../src/tools/find_and_replace/index.ts#L82-L89) — maps the `subReason` into `details.reason: "path-traversal"`.
- Handler-layer (ENOENT rejection): [src/tools/find_and_replace/handler.ts:512-523](../../src/tools/find_and_replace/handler.ts#L512-L523) — currently constructs `details: { code: "INVALID_SUBFOLDER", subfolder, vault }` with **no `reason` field**.

**Wire-shape contract — before (current)**:
```jsonc
// Path-traversal-shape rejection (schema layer)
{
  "code": "VALIDATION_ERROR",
  "details": { "code": "INVALID_SUBFOLDER", "reason": "path-traversal", "subfolder": "...", "vault": "..." },
  "message": "find_and_replace: ..."
}

// Missing-subfolder ENOENT rejection (handler layer)
{
  "code": "VALIDATION_ERROR",
  "details": { "code": "INVALID_SUBFOLDER", "subfolder": "...", "vault": "..." },
  "message": "find_and_replace: subfolder \"...\" does not exist in vault"
}
```

**Wire-shape contract — after (Story 4 ship)**:
```jsonc
// Path-traversal-shape rejection — UNCHANGED
{
  "code": "VALIDATION_ERROR",
  "details": { "code": "INVALID_SUBFOLDER", "reason": "path-traversal", "subfolder": "...", "vault": "..." }
}

// Missing-subfolder ENOENT rejection — reason field added
{
  "code": "VALIDATION_ERROR",
  "details": { "code": "INVALID_SUBFOLDER", "reason": "not-found", "subfolder": "...", "vault": "..." },
  "message": "find_and_replace: subfolder \"...\" does not exist in vault"
}
```

**Diff scope**:
- One-line edit at `handler.ts:516-521` (the `details:` object literal).
- One-line edit at `handler.ts` for `mapFsError` is NOT required (the FS read/write path uses `reason: "read" | "write"` already and is in scope of a different `(top-level, details.code)` pair: `FS_WRITE_FAILED`).
- Existing test at `handler.test.ts:720-733` ("ENOENT on subfolder realpath → VALIDATION_ERROR/INVALID_SUBFOLDER (no path-traversal reason)") MUST be updated: rename the assertion to assert `details.reason === "not-found"`, not absence; rename the test description to match.
- New symmetry test added asserting both rejection branches expose the same `details.reason` field shape (present, string-typed, narrowable to the closed union `"path-traversal" | "not-found"`).
- `src/tools/find_and_replace/index.ts:1` header-comment `details.reason` enumeration extended from `empty / too-long / regex-syntax / path-traversal` to `empty / too-long / regex-syntax / path-traversal / not-found`.

**Sub-discriminator union** (ADR-015 closed set on this pair):
```text
details.reason ∈ { "path-traversal", "not-found" }
```

No other branch in `find_and_replace` constructs an `(VALIDATION_ERROR, INVALID_SUBFOLDER)` rejection envelope; the two-element union is exhaustive after Story 4.

### 2. Documentation surface (help-doc + feature spec + schema `.describe()` triples)

Three paired artefacts per touched tool, all of which MUST agree after Story 1 / Story 2 / Story 3 / Story 4 / Story 5 / Story 6 / Story 7 ship:

| Surface | Path | Story scope |
|---|---|---|
| Help-doc | `docs/tools/<name>.md` | Stories 1–7 (per applicable cohort) |
| Feature spec | `specs/<NNN>-<name>/spec.md` | Stories 1, 2 (predecessor retirements); Story 4 (find_and_replace) |
| Schema `.describe()` | `src/tools/<name>/schema.ts` | Stories 5, 6 (where the field-level constraint or truncated-flag is declared) |

Reconciliation invariant: every empirical-behaviour claim in any of the three surfaces is reproducible against the live wrapper. The audit-pass criteria in `research.md` Task 8 enforce this.

### 3. Cohort enumeration (per-story scope)

**Story 1 cohort**: `read_property` only. Touched: `specs/013-read-property/spec.md` (AC9 retirement).

**Story 2 cohort**: `properties` only. Touched: `specs/024-list-properties/spec.md` (dedup-FR retirement).

**Story 3 cohort** (per `research.md` Task 3): `outline`, `properties`, `files`, `read_heading`, `set_property` (established), plus `find_by_property`, `backlinks`, `read_property`, `tag` (F1-inferred). Touched: per-tool `docs/tools/<name>.md` and `src/tools/<name>/schema.ts` `.describe()` strings, based on per-tool probe outcome (FR-009 retract / FR-010 anchor).

**Story 4 cohort**: `find_and_replace` only. Touched: `src/tools/find_and_replace/{handler,handler.test,index,index.test}.ts`, `docs/tools/find_and_replace.md`.

**Story 5 cohort**: `search`, `context_search`, `pattern_search`, `find_and_replace`, `find_by_property`, `backlinks`, `query_base`, `tag` (FR-016). Touched: per-tool `docs/tools/<name>.md` error-roster section.

**Story 6 cohort**: `search`, `context_search`, `backlinks` (FR-019). Touched: per-tool `docs/tools/<name>.md` output-contract section.

**Story 7 cohort**: `backlinks` only. Touched: `docs/tools/backlinks.md` (new "Cross-folder reach" subsection).

**Story 8 scope**: all cohort tools above; produces `specs/042-close-audit-findings/audit-pass-record.md` (artefact created during `/speckit-implement`).

### 4. Probe records (Story 3 — vault= cohort empirical anchor)

Per-tool record shape, persisted to `contracts/vault-probe-evidence.md` during `/speckit-implement`:

```text
Tool: <name>
Probe date: <ISO date>
Binary version: <obsidian-cli version string from `obsidian --version`>
Focused vault: <name>
Unfocused vault: <name>
Fixture (focused-vault-only): <vault-relative path>
A — focused vault response (verbatim, JSON or text):
  <wire bytes>
B — unfocused vault response (verbatim):
  <wire bytes>
C — unregistered vault response (verbatim):
  <wire bytes>
Classification: parameter-honoured | silent-noop-confirmed | classification-deferred
```

The record's `Classification` field drives FR-009 vs FR-010 reconciliation per tool.

### 5. Audit pass-criteria checklist (Story 8 — verification protocol)

Per `research.md` Task 8, the five pass-criteria per tool:
1. No rogue codes.
2. No documented-but-never-produced codes.
3. No produced-but-never-documented codes.
4. No doc-vs-empirical-behaviour drift.
5. No asymmetric sub-discriminator labelling on any envelope that carries one.

Recorded per-tool in `specs/042-close-audit-findings/audit-pass-record.md` after all other stories land.

## Cross-cutting invariants preserved by this BI

- **Principle IV — Zero new top-level error codes**: the `(VALIDATION_ERROR, INVALID_SUBFOLDER)` pair pre-exists; the BI adds a new sub-state via `details.reason` per ADR-015 only. The 15-tool zero-new-codes streak (as recorded in BI-041 plan §Constraints) extends to 13-tool (this BI does not add a tool, so the count is unchanged at 15) zero-new-codes streak.
- **Principle III — Schema as single source of truth**: no schema input-shape change. `find_and_replace/schema.ts` is unchanged for Story 4 (the schema-layer path-traversal branch already produces the canonical envelope; the runtime change is in the handler layer where the validation rejection is not schema-emittable).
- **ADR-015 — Sub-discriminators via `details.reason`**: the new sub-state `"not-found"` is the second member of the `(VALIDATION_ERROR, INVALID_SUBFOLDER)` closed union and uses the canonical field per the ADR.
- **Cohort docs-IS-the-contract invariant**: every empirical claim across the 13 touched tools' help-doc + spec + schema `.describe()` surfaces matches the live wrapper after this BI ships (SC-001).
