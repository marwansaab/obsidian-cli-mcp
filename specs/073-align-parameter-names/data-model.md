# Data Model: Align Parameter Names

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

There is no stored data. The "data" is the published input and result shape of three tools and the rules that relate their old and new parameter names.

## Parameter rename

One old name and one new name on one tool.

| Tool | Old name | New name | Value mapping | Default (unchanged) | Required |
|---|---|---|---|---|---|
| `find_by_property` | `property` | `name` | identity | — | yes (one of the two) |
| `find_by_property` | `arrayMatch` | `array_match` | identity | `true` | no |
| `find_by_property` | `caseSensitive` | `case_sensitive` | identity | `true` | no |
| `find_and_replace` | `case_insensitive` | `case_sensitive` | **inverted**: `case_sensitive = !case_insensitive` | `true` (case-sensitive) | no |
| `find_and_replace` | `subfolder` | `folder` | identity (an empty string still means the whole vault) | whole vault | no |
| `create_base` | `path` | `base_path` | identity | — | yes (one of the two) |
| `create_base` | `view` | `view_name` | identity | CLI default view | no |

**Validation rules**:

- **R1**: Old and new names for the same concept in one call → `VALIDATION_ERROR`, one issue per pair at `path: [old]`, message ``"`<old>` is deprecated and replaced by `<new>`; supply only `<new>`"``. This applies even when the values agree. Raised before any CLI spawn or filesystem read.
- **R2**: The resolved value is validated by the new name's rules, and issues use the new name (issue `path`, message, `params.field`).
- **R3**: For a required concept, neither name → `"<new> is required"` at `path: [<new>]`.
- **R4**: After parsing, the handler sees the new names only, with defaults applied.

**State (lifecycle)**:

```text
accepted-with-notice ──(next major release; removal follow-up feature)──▶ rejected
```

- This feature ships `accepted-with-notice` only.
- `rejected` is the FR-014 end state, delivered and tested by the follow-up. In that state the old key stays declared but always fails, with an error naming the new parameter.

## Normalised input (what handlers receive)

| Tool | Fields after the transform |
|---|---|
| `find_by_property` | `vault?`, `name`, `value`, `folder?`, `array_match` (boolean), `case_sensitive` (boolean), `deprecated_parameters` |
| `find_and_replace` | `pattern`, `replacement`, `mode`, `case_sensitive` (boolean), `folder?`, `include_code_blocks`, `include_html_comments`, `commit`, `vault?`, `file?`, `path?`, `active_note`, `deprecated_parameters` |
| `create_base` | `base_path`, `name`, `content?`, `view_name?`, `vault?`, `deprecated_parameters` |

`deprecated_parameters` is optional here. It is set only when at least one old name was used, so handler tests that build normalised inputs as literals do not need it.

## Deprecation notice

The result field `deprecated_parameters`. It is present only when the call used at least one old name.

| Field | Type | Meaning |
|---|---|---|
| `parameter` | string | The old name the call used. |
| `replacement` | string | The new name to use instead. |
| `note` | string, optional | Present only for `case_insensitive`: `"case_insensitive: true equals case_sensitive: false (opposite polarity)."` |

- The field is an array with at least one entry, in rename-table order.
- It appears identically in the text JSON and in `structuredContent`.
- It is declared in each tool's output schema (`find_and_replace`: on both the `preview` and the `commit` branch).

## Convention record (ADR-NNN)

| Section | Content |
|---|---|
| Families | Property tools; search and replace tools; Bases tools; note-targeting tools; heading tools |
| Shared concepts → chosen name | property → `name`; case handling → `case_sensitive`; folder scope → `folder`; `.base` location → `base_path`; view → `view_name`; list matching → `array_match`; note targeting → `target_mode` / `vault` / `file` / `path`; count and cap → `total` / `limit`; query text → `query` |
| Renames | the table above, with status `accepted-with-notice` |
| Exceptions | the six of spec FR-017, each with its reason |
| Rule for new tools | reuse the family's name; snake case; rename only with a deprecated alias and a notice |
