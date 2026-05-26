# Contract: prepend tool input

**BI**: 047-fix-prepend-reliability
**Date**: 2026-05-27
**Source of truth**: `src/tools/prepend/schema.ts` (`prependInputSchema`)
**Status**: Published contract. No schema change in this BI — the contract documents the contract surface that exists today and pins the cap-unit reconciliation per [research.md](../research.md) R3.

## Shape

The `prepend` tool accepts a discriminated input shape governed by `target_mode`. The published schema is the single source of truth (Principle III).

```text
target_mode: "specific" | "active"

If target_mode === "specific":
  vault: string                      (required, non-empty)
  file: string  | path: string       (required, exactly one)
  content: string                    (required; 1 ≤ length ≤ MAX_CONTENT_LENGTH)
  inline: boolean                    (optional, default false)

If target_mode === "active":
  vault, file, path: (forbidden — refinement rejects)
  content: string                    (required; 1 ≤ length ≤ MAX_CONTENT_LENGTH)
  inline: boolean                    (optional, default false)
```

Refinements per `applyTargetModeRefinement` (in `src/target-mode/target-mode.ts`) enforce the locator-shape rules at the schema boundary; an invalid combination is rejected with `VALIDATION_ERROR` before any wrapper logic runs.

## Cap unit reconciliation (FR-008 + R3)

`MAX_CONTENT_LENGTH = 24576` (single source of truth: `src/tools/prepend/schema.ts:16`). The cap is enforced by Zod's `.max()` on a `z.string()`, which checks `string.length`. JavaScript's `string.length` is the **UTF-16 code-unit count** — a non-BMP Unicode character (e.g., an emoji like 🚀 U+1F680) counts as 2 UTF-16 code units, not 1.

The spec's user-facing wording uses "character count" for an LLM-agent-natural surface; the contract publishes the precise unit as UTF-16 code units. The two units coincide for ASCII-dominant content; they diverge for content that includes characters above U+FFFF.

**Practical implication for callers**: a payload of 12288 emoji characters (each U+1F680, 2 UTF-16 code units) is at the cap boundary; the schema rejects the 12289th emoji. A payload of 24576 ASCII characters is also at the cap boundary; the schema rejects the 24577th ASCII character. Both rejections fire as `VALIDATION_ERROR` with `details.code: CONTENT_TOO_LARGE` (Zod `too_big`).

**Argv-byte expansion under UTF-8** (per R3 in [research.md](../research.md)): a 24576-UTF-16-code-unit payload of fully-BMP non-ASCII content (e.g., CJK content where each character is 1 UTF-16 code unit but 3 UTF-8 bytes) expands to up to 73728 UTF-8 argv bytes. The Windows `CreateProcess` command-line maximum is approximately 32767 UTF-16 code units / ASCII bytes; non-ASCII payloads near the cap may exceed the host-process command-line limit. The wrapper's host-process stability invariant (FR-004 + FR-009) is the safety net for byte-expanded non-ASCII payloads — the wrapper MUST NOT permit a host-process crash dialog regardless of payload byte expansion.

## Validation failure shapes (Principle III + ADR-015)

| Failure | Top-level code | Sub-state |
|---------|----------------|-----------|
| `content` empty | `VALIDATION_ERROR` | `details.code: CONTENT_EMPTY` (Zod `too_small`) |
| `content` over-cap | `VALIDATION_ERROR` | `details.code: CONTENT_TOO_LARGE` (Zod `too_big`) |
| `file` contains `[[` or `]]` | `VALIDATION_ERROR` | Zod `custom` issue, message: `wikilink-form locator MUST NOT contain ...` |
| `file` or `path` fails structural-path-safety | `VALIDATION_ERROR` | Zod `custom` issue, message: `STRUCTURALLY_UNSAFE_PATH_MESSAGE` |
| target-mode refinement violation | `VALIDATION_ERROR` | Refinement-specific message |

Each validation failure fires at the SDK boundary before any wrapper logic runs — the over-cap rejection (FR-002, ≤ 1 s, no spawn) is structurally guaranteed by Zod's eager `.max()` check.

## Compatibility

This BI introduces NO breaking change to the input contract. The schema is byte-stable with v0.7.4. Callers that respect the published `inputSchema` continue to work without modification.
