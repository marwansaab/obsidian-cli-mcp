# Quickstart: Close Audit Findings

**Branch**: `042-close-audit-findings` | **Date**: 2026-05-21

This quickstart walks an agent through verifying each user story's reconciliation against the live wrapper after `/speckit-implement` ships. Probes run against the authorised test vault per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md).

## Story 1 — Verify `read_property` malformed-frontmatter spec/help-doc agreement

1. Open `specs/013-read-property/spec.md` and locate User Story 1 → Acceptance Scenarios → scenario 9.
2. Confirm AC9 reads `{ value: null, type: "unknown" }` (no structured-error claim).
3. Open `docs/tools/read_property.md` and confirm the malformed-frontmatter description carries the same observable surface.
4. (Optional empirical anchor.) Against a fixture note with malformed YAML frontmatter (broken delimiters, stray colons), invoke `read_property` with `property=<any>`. Assert the response matches `{ value: null, type: "unknown" }`.

## Story 2 — Verify `properties` case-insensitive collapse contract

1. Open `specs/024-list-properties/spec.md` and confirm no functional requirement promises case-sensitive dedup. Confirm the byte-order tiebreak is either removed or labelled structurally unobservable.
2. Open `docs/tools/properties.md` and confirm the case-insensitive collapse rule is described without retraction or hedging.
3. (Optional empirical anchor.) Against a fixture vault with two notes whose frontmatter declares `AaTest: 1` and `aatest: 2` respectively, invoke `properties`. Assert a single merged entry exists with `noteCount: 2`.

## Story 3 — Verify `vault=` cohort per-tool reconciliation

For each tool in `contracts/vault-cohort-reconciliation.md` cohort:

1. Open the per-tool record in `contracts/vault-probe-evidence.md` and read the `Classification`.
2. Open the corresponding `docs/tools/<name>.md`.
3. If `Classification: parameter-honoured` (Branch A): confirm NO "silently honoured-as-noop" / "functionally ignored" phrasing survives. Confirm the empirical surface text describes parameter honouring and structured-error on unregistered vaults.
4. If `Classification: silent-noop-confirmed` (Branch B): confirm the existing phrasing is preserved AND immediately followed by `(Empirical anchor: <date>, obsidian-cli v<X.Y.Z>; re-verify on next audit cycle.)`.
5. If any tool's doc carries the phrasing without an anchor, OR the empirical surface without the empirical-anchor breadcrumb (depending on the classification), that is an audit failure for Story 8.

## Story 4 — Verify `find_and_replace` symmetric sub-discriminator

1. Trigger the path-traversal-shape rejection:
   ```jsonc
   { "pattern": "x", "replacement": "y", "subfolder": "../escape" }
   ```
   Assert response:
   ```jsonc
   {
     "code": "VALIDATION_ERROR",
     "details": { "code": "INVALID_SUBFOLDER", "reason": "path-traversal", ... }
   }
   ```
2. Trigger the missing-subfolder ENOENT rejection:
   ```jsonc
   { "pattern": "x", "replacement": "y", "subfolder": "does/not/exist" }
   ```
   Assert response (this is the change):
   ```jsonc
   {
     "code": "VALIDATION_ERROR",
     "details": { "code": "INVALID_SUBFOLDER", "reason": "not-found", ... }
   }
   ```
3. Confirm pattern-matching on `details.reason` discriminates the two branches without conditional present/absent handling.
4. Open `docs/tools/find_and_replace.md` and confirm the error-roster row for `INVALID_SUBFOLDER` names both sub-discriminator values (`"path-traversal"`, `"not-found"`).

## Story 5 — Verify dual validation envelope acknowledgement (per cohort tool)

For each tool in `contracts/dual-validation-envelope-roster.md` cohort:

1. Open `docs/tools/<name>.md` and locate the error-roster section.
2. Confirm the roster names both envelopes side by side, with the validation rule that produces each envelope identified.
3. Probe the wrapped envelope: invoke via a Cowork-class MCP client (e.g. the running `claude-code` MCP client) with an input that violates one of the field-level constraints. Assert the wrapped envelope shape matches the documented `VALIDATION_ERROR(<details.code>)`.
4. Probe the MCP transport envelope: invoke via a strict-rich client (e.g. MCP Inspector) with the same input. Assert the `-32602 Invalid Params` envelope with the zod-issue body matches the documented MCP transport envelope.
5. Confirm `contracts/dual-envelope-evidence.md` carries the per-tool probe record.

## Story 6 — Verify truncation slice direction documented

For each tool in `contracts/truncation-direction-roster.md` cohort:

1. Open `docs/tools/<name>.md` and locate the output-contract section.
2. Confirm the slice direction is named explicitly ("leading subset" or "trailing subset").
3. Confirm the divergence call-out fires for any cohort member whose direction differs from sibling members (or is absent if the cohort is uniform).
4. (Optional empirical verification.) Run the cap-exceeding probe per tool and verify the returned subset matches the documented direction against the sorted set.

## Story 7 — Verify `backlinks` cross-folder reach caveat

1. Open `docs/tools/backlinks.md` and confirm the "Cross-folder reach" subsection exists with the canonical text per `contracts/backlinks-cross-folder-caveat.md`.
2. (Optional empirical anchor.) Against a fixture vault with `notes/target.md`, `notes/local/source-a.md` containing `[[target]]`, and `other/source-b.md` containing `[[target]]`, invoke `backlinks` against `target`. Assert both sources appear in the response.

## Story 8 — Maintainer audit re-run

1. Open `specs/042-close-audit-findings/audit-pass-record.md` (created during `/speckit-implement`).
2. Confirm each tool in the cohort has a row marking the five pass criteria from `research.md` Task 8 as clear:
   - No rogue codes
   - No documented-but-never-produced codes
   - No produced-but-never-documented codes
   - No doc-vs-empirical-behaviour drift
   - No asymmetric sub-discriminator labelling
3. If any row carries a residual finding, surface it as a follow-up issue. Per Out of Scope, residual findings outside the cohort scope are not blockers for this BI.

## Test execution gate (Constitution Principle II)

Before each empirical probe that touches the filesystem or invokes the `obsidian` CLI binary:
- Read [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md).
- Run probes against the authorised test vault scratch subdirectory.
- Apply cleanup expectations after each probe.
- Per the project test-scope memory, unit-test regression coverage stays in-process (mock-only); the probes above are characterisation captures, not unit tests.
