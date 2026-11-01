# Data Model: Refuse Oversized Text on Add-to-Top

**Feature**: [spec.md](spec.md) | **Contract**: [contracts/prepend-size-limit-contract.md](contracts/prepend-size-limit-contract.md)

No persisted data changes. The entities are the two limits on `prepend`'s `content` input and the error each produces.

## Entities

### Character limit (unchanged)

- **Constant**: `MAX_CONTENT_LENGTH = 3072` (`src/tools/prepend/schema.ts`).
- **Measure**: `content.length` (UTF-16 code units).
- **Check**: `z.string().max(MAX_CONTENT_LENGTH)` → Zod `too_big` issue on `content`.
- **Error**: `VALIDATION_ERROR` / `details.code: CONTENT_TOO_LARGE`, no `reason`; `details.contentLength`, `details.maxLength`.

### Size limit (new)

- **Constant**: `MAX_CONTENT_BYTES = 3072` (`src/tools/prepend/schema.ts`), the published constant (spec Out of Scope: no run-time detection).
- **Measure**: `Buffer.byteLength(content, "utf8")`, the UTF-8 size the Obsidian CLI fault depends on (research F2: BI-0123). A lone surrogate counts as 3 bytes (U+FFFD).
- **Check**: `.refine(...)` on `content` → Zod `custom` issue on `content` with `params: { subReason: "bytes" }`.
- **Error**: `VALIDATION_ERROR` / `details.code: CONTENT_TOO_LARGE` / `details.reason: "bytes"`; `details.contentBytes`, `details.maxBytes`.

## Validation rules and invariants

- **R1 (inclusive limits)**: content with `length ≤ MAX_CONTENT_LENGTH` and `byteLength ≤ MAX_CONTENT_BYTES` passes validation; the handler behaves exactly as before (FR-006).
- **R2 (precedence)**: when both limits are broken, the error is the character-limit error, chosen because a `too_big` issue is present, whatever order Zod lists the issues in (FR-005).
- **R3 (before anything)**: either refusal is returned by `registerTool`'s input-validation step. `executePrepend` does not run, so there is no target resolution, filesystem access or Obsidian call (FR-002).
- **R4 (single source)**: the enforced limit, the error's `maxBytes`, the message, the `content` description and `PREPEND_DESCRIPTION` all read `MAX_CONTENT_BYTES`. The docs state the same number (FR-008).
- **R5 (closed reason set)**: under `(VALIDATION_ERROR, CONTENT_TOO_LARGE)`, `details.reason` is either absent (character limit) or `"bytes"` (size limit) (ADR-015).

## State transitions

None. A refused call changes nothing. An accepted call follows the existing prepend flow.
