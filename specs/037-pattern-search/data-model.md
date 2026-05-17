# Data Model: Pattern Search

**Feature**: 037-pattern-search
**Date**: 2026-05-17
**Status**: Phase 1 complete

This document derives the entity shapes from the spec FRs. The shapes are documented in TypeScript-like notation; the runtime source of truth is the zod schema in `src/tools/pattern_search/schema.ts` (Principle III).

---

## PatternSearchInput

The boundary input the agent passes to the tool. Validated at the MCP-tool boundary via `patternSearchInputSchema.parse(args)`; invalid input emits `VALIDATION_ERROR` before any business logic runs.

```ts
interface PatternSearchInput {
  // The regex pattern source. ECMAScript dialect (Node RegExp).
  // Validated for syntactic correctness via new RegExp(pattern, flags)
  // in a zod superRefine block — invalid patterns surface as
  // VALIDATION_ERROR with details.issues[].path = ["pattern"].
  pattern: string;          // min 1, max 1000 chars (sibling parity with context_search FR-008)

  // Optional vault-relative folder prefix. Recursive (matches every
  // .md note whose path starts with `<folder>/`). Leading/trailing
  // "/" stripped wrapper-side via stripBoundarySlashes (R5).
  // Empty post-strip → omitted from the eval payload (whole-vault scan).
  folder?: string;          // min 1 when present

  // Result cap. Implicit 1000 when omitted. Range 1..10000 (R3).
  // Explicit caller value takes precedence in both directions.
  limit?: number;           // integer, min 1, max 10000

  // Case-sensitivity control. Default true (case-sensitive) per
  // spec FR-007 and clarify Q1 derivation. case_sensitive: false
  // → eval template instantiates RegExp with the "i" flag.
  case_sensitive?: boolean; // optional; omitted ≡ true

  // Vault selector. Optional; routes to the focused vault when omitted.
  // Wraps the cli-adapter's vault-routing facade.
  vault?: string;           // min 1 when present
}
```

**Validation rules** (all enforced by the zod schema):

- `pattern` is required, non-empty, ≤ 1000 chars, and parses as a valid ECMAScript regex with the chosen flags. The `superRefine` block runs `new RegExp(pattern, flags)` and emits a Zod issue with `path: ["pattern"]` on `SyntaxError`. → FR-001, FR-010.
- `folder`, when present, is a non-empty string. → FR-006.
- `limit`, when present, is an integer in `[1, 10000]`. → FR-008 + R3.
- `case_sensitive`, when present, is a boolean. → FR-007.
- `vault`, when present, is a non-empty string.
- The object is `.strict()` — unknown keys are rejected (sibling parity with every typed tool in this surface).

**Mapping to FRs**:

| Field | FR(s) |
|---|---|
| `pattern` | FR-001, FR-010, FR-016 |
| `folder` | FR-006, FR-011 |
| `limit` | FR-008 |
| `case_sensitive` | FR-007 |
| `vault` | FR-014 (single-vault-per-invocation) |

---

## PatternSearchMatch

A single occurrence of the pattern on a single line of a single note. One entry per non-empty match per line (FR-003).

```ts
interface PatternSearchMatch {
  // Vault-relative .md path. Sort key 1 (asc UTF-16 code-unit).
  path: string;             // non-empty

  // 1-based line number within the note. Sort key 2 (asc numeric).
  line: number;             // integer, ≥ 1

  // 0-based start offset of the match within the (pre-clip) line.
  // Sort key 3 (asc numeric) — guarantees deterministic order when
  // multiple matches occur on the same line.
  offset: number;           // integer, ≥ 0

  // The substring that matched the pattern. NEVER capped — emitted
  // verbatim from the regex engine. May exceed 500 chars when the
  // matched substring is long; the surrounding line is still clipped
  // at 500 (see `text` below) but `match` stays intact.
  match: string;            // possibly empty? NO — zero-length matches are skipped (FR-016)

  // The full line containing the match, capped at 500 UTF-16 code
  // units with a trailing `…` (U+2026) marker when the original
  // line is longer (Q2 / R10 / BI-033 FR-024 parity). Any single
  // trailing `\r` (CRLF input from Windows-authored vaults) is
  // stripped BEFORE the 500-cap is measured.
  text: string;             // ≤ 501 chars (500 + the `…` marker)
}
```

**Invariants**:

- `match.length >= 1` (FR-016 — zero-length skipped at the template).
- `offset + match.length <= original-line.length` (offset is anchored to the pre-clip line, not the clipped `text` field).
- When `match.length > 500`, `text` is the 500-char prefix + `…` and the match substring is not visible inside `text`. The agent acts on `match` directly.

**Mapping to FRs**:

| Field | FR(s) |
|---|---|
| `path` | FR-004 |
| `line` | FR-004 (1-based) |
| `offset` | FR-003 (per-occurrence ordering) |
| `match` | FR-005, FR-016 |
| `text` | FR-005 (cap + `…` marker) |

---

## PatternSearchOutput

The response envelope returned to the caller. Validated at the response boundary via `patternSearchOutputSchema.parse(...)`.

```ts
interface PatternSearchOutput {
  // Equals matches.length (zod refine enforces this — sibling parity
  // with context_search). Lets agents read a single field for the
  // result-count question without iterating the array.
  count: number;            // integer, ≥ 0

  // Ordered list of matches. Sort key: (path asc UTF-16, line asc,
  // offset asc) — R2. Truncated to ≤ applied-cap entries.
  matches: PatternSearchMatch[];

  // Present only when truncation fired. Absent ≡ false. Discriminant
  // for SC-003 (complete vs truncated, 100% determinism).
  truncated?: true;         // z.literal(true).optional()
}
```

**Invariants**:

- `count === matches.length` (zod `.refine()`).
- `matches.length <= applied-cap`, where applied-cap = `input.limit ?? 1000` (R3).
- `matches` is sorted by `(path, line, offset)` ascending. Stable across calls with the same input and stable vault state (SC-003).
- `truncated` is present iff the underlying match-set could have produced more entries than the applied cap. Absent ≡ list is complete.

**Mapping to FRs**:

| Field | FR(s) |
|---|---|
| `count` | FR-002 |
| `matches` | FR-002, FR-003, FR-004, FR-005 |
| `truncated` | FR-008, SC-003 |

---

## WireEnvelope (in-process)

The shape the eval template emits to stdout. Wrapper-side `handler.ts` parses, validates, and post-processes this envelope before producing `PatternSearchOutput`. This entity is **not** part of the published MCP contract — it is the internal handover between the template and the handler.

```ts
type WireEnvelope =
  | { ok: true; count: number; matches: WireMatch[]; truncated?: true }
  | { ok: false; code: "FOLDER_NOT_FOUND"; folder: string };

interface WireMatch {
  path: string;
  line: number;
  offset: number;
  match: string;
  text: string;   // already capped at 500 + `…` in-template (R10)
}
```

**Wrapper-side post-processing**:

1. Parse stdout as JSON (`JSON.parse`); failure → `CLI_REPORTED_ERROR` with `details.stage = "json-parse"`.
2. Parse against `wireEnvelopeSchema` (zod safeParse); failure → `CLI_REPORTED_ERROR` with `details.stage = "envelope-parse"`.
3. Discriminate on `ok`. `ok: false` → throw `CLI_REPORTED_ERROR` with `details.code = "FOLDER_NOT_FOUND"`, `details.folder = <folder>`.
4. On `ok: true`: defensively filter `matches` to entries whose `path.toLowerCase().endsWith(".md")` (R6 defence-in-depth), sort by `(path, line, offset)` ascending (R2), validate against `patternSearchOutputSchema`, return.

**No further capping**. The template owns the 500-cap and the limit-cap; the handler trusts the template's count and the `truncated` flag.

---

## Why no separate "PatternSearchScope" entity

The spec's Key Entities lists "search scope" (vault + optional folder). At the data-model level this collapses into two fields of `PatternSearchInput` (`vault`, `folder`) — there is no value in promoting it to a distinct shape because nothing in the codebase consumes scope independently of input. Sibling tools (`context_search`, `search`, `paths`) follow the same flat-input convention. Promoting "scope" would add ceremony without separation.

The "search predicate" entity similarly collapses into `pattern` + `case_sensitive`. The template instantiates the `RegExp` in-runtime — the predicate has no wrapper-side independent existence.
