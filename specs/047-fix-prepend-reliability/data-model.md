# Data Model: Fix Prepend Reliability

**BI**: 047-fix-prepend-reliability
**Date**: 2026-05-27
**Status**: Phase 1 design output. Sources: [spec.md](spec.md), [research.md](research.md), `src/tools/prepend/schema.ts`, `src/errors.ts`.

The data model documents the entities the spec's Key Entities section names, expanded with concrete field types drawn from the existing Zod schemas and the `UpstreamError` class definition. No new entity is introduced — the BI's fix surface uses existing entities with one new sub-discriminator under an existing code (per R5 in [research.md](research.md)).

---

## Entity: Prepend call input

Boundary-validated input shape published as the MCP tool's `inputSchema` via the SDK. Single source of truth: `src/tools/prepend/schema.ts:44-57` (the `prependInputSchema`).

| Field | Type | Constraint | Notes |
|-------|------|------------|-------|
| `target_mode` | `"specific" \| "active"` | Required; refined per `applyTargetModeRefinement` | Specific-mode requires `vault` + (`file` or `path`); active-mode forbids `vault`/`file`/`path`. |
| `vault` | `string` (optional) | Non-empty when present | Vault display name as registered with the Obsidian CLI; reverse-lookup-resolvable to a vault base path via `VaultRegistry.resolveVaultPath`. |
| `file` | `string` (optional) | `safeFileField` — non-empty + structural-path-safety + wikilink-bracket rejection | Wikilink-form locator (bare note name); resolved through pre-flight `obsidian file` TSV resolver call. |
| `path` | `string` (optional) | `safePathField` — non-empty + structural-path-safety | Vault-relative path; fed verbatim to Layer 2 canonical-path check. |
| `content` | `string` | `.min(1).max(MAX_CONTENT_LENGTH)`; `MAX_CONTENT_LENGTH = 24576` | Counted in UTF-16 code units (per Zod's `.max()` on a `z.string()` → `string.length`). Per R3 in [research.md](research.md), this is reconciled with the spec's "character count" wording; non-BMP characters count as 2 UTF-16 code units. |
| `inline` | `boolean` | `.optional().default(false)` | Opt-in for the inline-no-separator path; when false (default), the wrapper-inserted separator rule applies per [contracts/prepend-output.contract.md](contracts/prepend-output.contract.md). |

**Validation failure shapes** (Principle III + ADR-015):

| Sub-state | Top-level code | Trigger |
|-----------|----------------|---------|
| `CONTENT_EMPTY` | `VALIDATION_ERROR` | `content.length === 0` → Zod `too_small`. |
| `CONTENT_TOO_LARGE` | `VALIDATION_ERROR` | `content.length > 24576` → Zod `too_big` → over-cap rejection per FR-002 (≤ 1 s, no spawn). |
| (Zod custom) | `VALIDATION_ERROR` | `file` contains `[[` or `]]` → wikilink-bracket rejection. |
| (Zod custom) | `VALIDATION_ERROR` | `file` or `path` fails `isStructurallySafePath` → structural-path-safety violation. |
| (refinement) | `VALIDATION_ERROR` | target-mode refinement violation (e.g., specific-mode missing locator). |

---

## Entity: Prepend success envelope

Boundary-validated output shape published as the MCP tool's success response. Single source of truth: `src/tools/prepend/schema.ts:59-66` (the `prependOutputSchema`).

| Field | Type | Constraint | Notes |
|-------|------|------------|-------|
| `path` | `string` | (no further constraint) | Vault-relative path to the target note. Echoed for write-verification per the project's write-tool echo convention (per the user's memory `feedback_no_locator_echo_in_read_responses` — read tools omit locator echo, write tools include it). |
| `vault` | `string` | (no further constraint) | Vault display name (specific-mode `input.vault`; active-mode reverse-lookup result or `parsed.base` fallback per the handler's current behaviour). |
| `bytes_written` | `number` (integer) | `.int().min(1)` | **Structural enforcement of FR-003.** A `bytes_written: 0` envelope is schema-invalid at the SDK boundary; the R1 fix's post-stat byte-delta guard raises a typed `UpstreamError` (`FS_WRITE_FAILED.details.reason: "post-stat-byte-delta-zero"`) before any output envelope is constructed. See [contracts/prepend-output.contract.md](contracts/prepend-output.contract.md). |
| `inline` | `boolean` | (no further constraint) | Echoes the `inline` input field; verifies which separator policy applied. |

**Byte-count formula** (per R4 in [research.md](research.md)):

```text
postCallSize = preCallSize + utf8ByteLength(content) + separatorByteLength
bytes_written = postCallSize - preCallSize

where separatorByteLength = {
  1 byte (LF, 0x0A) on POSIX hosts,
  2 bytes (CRLF, 0x0D 0x0A) on Windows hosts when the file uses CRLF line endings,
  0 bytes when input.inline === true (inline-no-separator opt-in)
}
```

The `bytes_written` field carries the FULL delta (content + separator); callers do NOT subtract the separator client-side.

---

## Entity: Structured error envelope

Boundary-validated error shape carrying a recognisable failure-mode discriminator. Single source of truth: `src/errors.ts:3-23` (the `UpstreamError` class).

| Field | Type | Constraint | Notes |
|-------|------|------------|-------|
| `code` | `string` | One of the existing top-level codes per R5 (no new codes per Principle IV + FR-005) | The stable failure-mode discriminator the caller branches on. |
| `cause` | `unknown` | The originally-thrown value, when available | Preserves the chain of custody per Principle IV. |
| `details` | `Record<string, unknown>` | Structured per-failure-mode payload; may include `details.code` and `details.reason` per ADR-015 | The fine-grained sub-discriminator surface. |
| `message` | `string` (optional) | Human-readable summary; defaults to `"CLI bridge upstream error: <code>"` when omitted | Surfaced to the LLM agent through the SDK's error-response shape. |

**Sub-discriminator surface** (per R5 in [research.md](research.md)):

The full failure-mode mapping table lives in [contracts/prepend-error.contract.md](contracts/prepend-error.contract.md). The data-model artifact records only that the sub-discriminator surface is two-tiered: `details.code` (e.g., `NOTE_NOT_FOUND`, `EXTERNAL_EDITOR_CONFLICT`, `CONTENT_EMPTY`, `CONTENT_TOO_LARGE`) names a stable failure class; `details.reason` (e.g., `"file-locked"`, `"post-stat-byte-delta-zero"`) names a finer-grained cause within that class.

---

## Entity: Failure-mode discriminator (top-level code + sub-discriminator)

The composite discriminator the caller uses to branch its remediation. Composed of two fields drawn from the structured error envelope:

```text
discriminator = (UpstreamError.code, UpstreamError.details.code, UpstreamError.details.reason)
```

Example values:

- `("VALIDATION_ERROR", "CONTENT_TOO_LARGE", undefined)` — over-cap rejection at the schema boundary (FR-002, ≤ 1 s, no spawn).
- `("CLI_TIMEOUT", undefined, undefined)` — substrate timeout at 10 s.
- `("CLI_REPORTED_ERROR", "NOTE_NOT_FOUND", undefined)` — target note missing in the resolved vault.
- `("CLI_REPORTED_ERROR", "EXTERNAL_EDITOR_CONFLICT", "file-locked")` — editor holding the target file open.
- `("FS_WRITE_FAILED", undefined, "post-stat-byte-delta-zero")` — **NEW** silent-no-op discriminator introduced by this BI (per R5 + R1).

The full mapping (12 rows in the spec's FR-005 enumeration plus the new silent-no-op row) lives in [contracts/prepend-error.contract.md](contracts/prepend-error.contract.md).

---

## State transitions

The prepend operation is stateless from the caller's perspective — each call is independent, with no per-call session state. The file system is the only persistent state surface; the spec's US1 AC3 (concurrent calls against the same target note) is governed by the existing wrapper queue (per the kernel-node `createQueue()` invariant in [plan.md](plan.md) `## Graphify structural check`) which enforces last-write-wins serialisation across the cohort.

No state machine is introduced by this BI.
