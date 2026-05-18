# Input Contract — find_and_replace

**Branch**: `038-find-replace`
**Schema source of truth**: `src/tools/find_and_replace/schema.ts` — `findAndReplaceInputSchema` (per Constitution Principle III).

This file documents the input contract as the caller sees it via the MCP `inputSchema`. Field shapes mirror the Zod schema; validation failures surface as documented in [errors.md](errors.md).

## Shape

```json
{
  "pattern": "string (1..1000 UTF-16 code units)",
  "replacement": "string (0..1000 UTF-16 code units)",
  "mode": "literal | regex",
  "case_insensitive": "boolean",
  "subfolder": "string (vault-relative path, optional)",
  "include_code_blocks": "boolean",
  "include_html_comments": "boolean",
  "commit": "boolean",
  "vault": "string (vault display name, optional)"
}
```

Strict object: unknown fields are rejected with `VALIDATION_ERROR`.

## Fields

### `pattern` (required, string)

The find predicate. Interpretation depends on `mode`.

- **`literal` mode**: exact substring match (no metacharacter interpretation). `foo.bar` matches the four-character sequence `foo.bar`, not `fooXbar`.
- **`regex` mode**: ECMAScript regular expression. Backslash escapes, character classes, capture groups, anchors, lookarounds all per Node's built-in `RegExp` (parity with BI-037 FR-001).

**Length**: 1 to 1000 UTF-16 code units inclusive (FR-022).

**Regex syntax validation** (regex mode only): the schema-level `superRefine` runs `new RegExp(pattern, flags)` in try/catch; a thrown `SyntaxError` surfaces as a Zod issue at path `["pattern"]` with the `SyntaxError.message` as the issue message.

**Defaults**: none. Field is mandatory; absent or empty string is a hard error.

### `replacement` (required, string)

The text that replaces each non-skipped match.

- **`literal` mode**: inserted verbatim. No metacharacter interpretation.
- **`regex` mode**: ECMAScript replacement-string semantics. `$1`–`$9` interpolate the corresponding capture group; `$&` interpolates the whole match; `$$` is a literal `$`. Named-group syntax `$<name>` is permitted (ES2018+).

**Length**: 0 to 1000 UTF-16 code units inclusive (FR-022). Empty replacement is valid and signals deletion.

**Defaults**: none. Field is mandatory; over-cap is a hard error.

### `mode` (optional, enum)

The pattern interpretation.

**Values**: `"literal"` | `"regex"`.

**Default**: `"literal"` per spec Assumption — the safer choice when the caller omits the field (forgotten `regex` would otherwise be a substring match against `foo.bar` interpretable as `fooXbar` if the field were defaulted to `regex`).

### `case_insensitive` (optional, boolean)

Case-sensitivity control. Applies uniformly to `literal` and `regex` modes.

**Values**: `true` | `false`.

**Default**: `false` — case-sensitive matching by default (parity with BI-037 FR-007).

In `regex` mode `true` is equivalent to compiling the pattern with the `i` flag.

### `subfolder` (optional, string)

Vault-relative subfolder to restrict the scan to.

**Value**: a vault-relative path with `/` separators. Trailing slash optional. Empty string is equivalent to absent (whole-vault scope).

**Default**: absent — whole-vault scope.

**Path-safety validation** (Layer 1, FR-009): the schema runs `isStructurallySafePath(subfolder)` and rejects:
- Leading `/` or `\` (absolute paths).
- Drive-letter prefix `[A-Za-z]:`.
- `..` segments.
- Control characters in the `[0x00..0x1f]` or `[0x7f]` ranges.

Failures surface as `VALIDATION_ERROR` + `details.code: "INVALID_SUBFOLDER"` + `details.reason: "path-traversal"`.

The runtime canonical-path check (Layer 2, FR-009) runs in the handler after path resolution — see [errors.md](errors.md).

### `include_code_blocks` (optional, boolean)

Opt-in to including occurrences inside paired fenced code blocks (`` ``` `` / `~~~`).

**Default**: `false` — fenced code blocks are skipped by default (FR-006). Indented code blocks (4-space or tab indent without surrounding fence) are NOT skipped regardless of this opt-in — they are always treated as prose.

### `include_html_comments` (optional, boolean)

Opt-in to including occurrences inside HTML comments (`<!-- … -->`).

**Default**: `false` — HTML comments are skipped by default (FR-007).

Independent of `include_code_blocks`: opting into one does not change the default of the other.

### `commit` (optional, boolean)

The preview-then-commit discriminator.

**Default**: `false` — preview mode (FR-003). No note on disk is modified; the response carries the `mode: "preview"` branch (see [output.md](output.md)).

When `true`, the operation applies the rewrite on disk and the response carries the `mode: "commit"` branch.

**Safety invariant**: omitting the field is identical to passing `false` per FR-003 — an accidental call without explicit commit cannot mutate the vault.

### `vault` (optional, string)

The vault display name to target.

**Default**: absent — focused-vault default (vault-wide cohort default per FR-013, parity with `find_by_property`, `properties`, `search`, `context_search`, `pattern_search`).

When present, the operation resolves the display name via the ADR-009 lazy vault registry. Failures:
- Unknown display name → `CLI_REPORTED_ERROR` + `details.code: "VAULT_NOT_FOUND"` + `details.reason: "unknown"`.
- Registered but closed → same `details.code` + `details.reason: "not-open"`.

## Worked examples

### Example 1 — ADR rename, preview

```json
{
  "pattern": "ADR-0042",
  "replacement": "ADR-0089",
  "mode": "literal",
  "subfolder": "Decisions"
}
```

Preview-only (commit defaulted to `false`). Whole-`Decisions/`-subtree scope. Literal match. Code blocks and HTML comments skipped by default. Focused vault.

### Example 2 — Regex retarget, commit

```json
{
  "pattern": "\\[\\[#([^\\]]+)\\]\\]",
  "replacement": "[[NewHeading#$1]]",
  "mode": "regex",
  "commit": true,
  "vault": "Research"
}
```

Regex mode with a capture group — retargets every bare-heading wikilink (`[[#Foo]]`) to a specific-note heading link (`[[NewHeading#Foo]]`). Commits to disk. Named vault.

### Example 3 — Symbol rename inside code samples too

```json
{
  "pattern": "OldClassName",
  "replacement": "NewClassName",
  "mode": "literal",
  "include_code_blocks": true,
  "case_insensitive": false,
  "commit": true
}
```

Literal symbol rename across the whole vault, INCLUDING occurrences inside fenced code blocks (HTML comments still skipped). Case-sensitive (explicit, matching the default).

### Example 4 — Pattern that would breach the upper bound

```json
{
  "pattern": "the",
  "replacement": "an"
}
```

Over-broad pattern (matches thousands of occurrences in a typical vault). Both preview and commit return `VALIDATION_ERROR` + the bound-exceeded sub-discriminator. No note modified.
