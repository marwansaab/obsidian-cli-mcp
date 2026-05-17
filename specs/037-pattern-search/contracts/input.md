# Input Contract: pattern_search

**Feature**: 037-pattern-search
**Date**: 2026-05-17
**Source of truth**: `src/tools/pattern_search/schema.ts` — `patternSearchInputSchema`. This document mirrors the zod schema for prose review; if the two diverge, the zod schema wins per Constitution Principle III.

---

## Tool name

`pattern_search` — snake_case, sibling parity with `context_search`, `find_by_property`, `smart_connections_similar`. The Obsidian CLI exposes no native regex subcommand to mirror (T0 verifies), so ADR-010 is N/A; the name is a synthesised concept name.

## Input fields

| Field | Type | Required | Default | Range / Constraints |
|---|---|---|---|---|
| `pattern` | `string` | yes | — | min 1 char, max 1000 chars, parses as a valid ECMAScript regex with the chosen flags (`new RegExp(pattern, flags)` does not throw `SyntaxError`) |
| `folder` | `string` | no | omitted ≡ whole-vault scan | min 1 char when present; leading/trailing `/` stripped wrapper-side; empty post-strip behaves as omitted |
| `limit` | `integer` | no | 1000 | 1..10000 |
| `case_sensitive` | `boolean` | no | `true` | — |
| `vault` | `string` | no | omitted ≡ focused vault | min 1 char when present |

**Strict mode**: the input object is `.strict()`. Unknown keys produce `VALIDATION_ERROR` with `details.issues[].path = ["<unknown-key>"]`.

## Field semantics

### `pattern` (required)

The regex source string. ECMAScript dialect per the clarify-session 2026-05-17 Q1 lock — `new RegExp(pattern, flags)` interprets the source under JavaScript regex semantics. `\d`, `\b`, lookahead, lookbehind, named captures, alternation, and quantifiers all behave as Node's built-in `RegExp` defines them.

Validation:

- **Non-empty**: `min(1)`.
- **Bounded**: `max(1000)` chars (sibling parity with `context_search` FR-008).
- **Whitespace-only**: `superRefine` rejects with `path: ["pattern"], message: "pattern is empty or whitespace-only"`.
- **Syntactic validity**: `superRefine` runs `new RegExp(input.pattern, input.case_sensitive === false ? "i" : "")` inside try/catch. `SyntaxError` produces a Zod issue with `path: ["pattern"], message: <SyntaxError.message>, code: "custom"`.

Examples:

- `BI-\d{4}` — four-digit BI-token, case-sensitive.
- `#\w+` — Obsidian hashtags.
- `\[\[[^\]]+\]\]` — wikilinks.
- `^#{1,6}\s+` — heading lines.

### `folder` (optional)

Vault-relative folder prefix. The search scope is recursive — every `.md` note whose vault-relative path starts with `<folder>/` is eligible.

Normalisation:

- Single leading `/` stripped: `/Projects` → `Projects`.
- Single trailing `/` stripped: `Projects/` → `Projects`.
- Both: `/Projects/` → `Projects`.
- Empty post-strip (input was `/` or `""`): treated as omitted; the search scans the whole vault.

Folder existence is verified by the eval template, which calls `app.vault.adapter.stat(folder)` and emits a `FOLDER_NOT_FOUND` envelope on miss. Wrapper-side handler converts that envelope into `CLI_REPORTED_ERROR` with `details.code = "FOLDER_NOT_FOUND"` per FR-011.

### `limit` (optional)

Result cap. Bounds the `matches` array length.

- Omitted: implicit cap of 1000 entries applies.
- Supplied: that value takes precedence in both directions — `limit: 5` returns ≤ 5 entries; `limit: 5000` returns ≤ 5000 entries.
- Out of range: `limit < 1` or `limit > 10000` produces `VALIDATION_ERROR` with `path: ["limit"]`.

When the underlying match-set exceeds the applied cap, the response includes `truncated: true`. See [output.md](output.md) for the truncation contract.

### `case_sensitive` (optional)

Boolean toggle. **Default: `true` (case-sensitive)** per spec FR-007.

- `true` or omitted: the eval template instantiates `new RegExp(pattern, "")` — case-sensitive.
- `false`: the eval template instantiates `new RegExp(pattern, "i")` — case-insensitive.

This default **flips** from sibling `context_search` (which defaults to case-insensitive). The flip is intentional and traces directly to the user spec. Agents porting predicates between the two tools must pass `case_sensitive: false` explicitly to opt into context_search-style behaviour.

### `vault` (optional)

Vault display name. Routes the underlying `obsidian eval` invocation to the named vault (`obsidian -v <vault> eval ...`).

- Omitted: routes to the focused vault (whichever vault has the focus in the Obsidian app at invocation time).
- Supplied: routes to the named vault.
- Unknown vault name: surfaces as `CLI_REPORTED_ERROR` with `details.message: "Vault not found."` via the cli-adapter's success-path stdout classifier (existing top-level facade, see [src/cli-adapter/cli-adapter.ts](../../../src/cli-adapter/cli-adapter.ts)).
- Closed-but-registered vault: detected by the shared `_eval-vault-closed-detection` module and surfaces as `CLI_REPORTED_ERROR` with `details.code = "VAULT_NOT_FOUND"`, `details.reason = "not-open"` (existing pattern from `paths`, see [src/tools/paths/handler.ts](../../../src/tools/paths/handler.ts)).

## Examples

### Minimal happy path

```json
{ "pattern": "BI-\\d{4}" }
```

→ scans the focused vault, case-sensitive, implicit cap 1000.

### Folder-scoped, case-insensitive

```json
{
  "pattern": "TODO\\b",
  "folder": "Projects",
  "case_sensitive": false
}
```

→ scans `Projects/**/*.md` in the focused vault, case-insensitive.

### Explicit cap

```json
{ "pattern": "#\\w+", "limit": 50 }
```

→ returns up to 50 hashtag matches; `truncated: true` if more exist in the vault.

### Vault-routed

```json
{
  "pattern": "frontmatter-key:",
  "vault": "Personal Notes",
  "limit": 100
}
```

→ scans the `Personal Notes` vault.

## Out-of-contract behaviours (error envelopes)

| Failure | Code | `details` shape |
|---|---|---|
| Pattern is missing, empty, or whitespace-only | `VALIDATION_ERROR` | `issues[].path = ["pattern"]` |
| Pattern is syntactically invalid | `VALIDATION_ERROR` | `issues[].path = ["pattern"]`, `issues[].message = <SyntaxError.message>` |
| `limit` out of `[1, 10000]` | `VALIDATION_ERROR` | `issues[].path = ["limit"]` |
| Unknown key | `VALIDATION_ERROR` | `issues[].path = ["<unknown-key>"]` |
| Folder does not exist in the named vault | `CLI_REPORTED_ERROR` | `details.code = "FOLDER_NOT_FOUND"`, `details.folder = "<folder>"` |
| Vault does not exist | `CLI_REPORTED_ERROR` | `details.message: "Vault not found."` (cli-adapter classifier) |
| Vault registered but not open | `CLI_REPORTED_ERROR` | `details.code = "VAULT_NOT_FOUND"`, `details.reason = "not-open"` |
| CLI stdout malformed JSON | `CLI_REPORTED_ERROR` | `details.stage = "json-parse"` |
| CLI stdout fails envelope wire schema | `CLI_REPORTED_ERROR` | `details.stage = "envelope-parse"` |

See [errors.md](errors.md) for the full failure cohort.
