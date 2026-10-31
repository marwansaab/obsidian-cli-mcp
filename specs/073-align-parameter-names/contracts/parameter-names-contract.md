# Contract: Published Parameter Names (Transition Release)

**Feature**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

This is the agent-facing contract of the three changed tools during the transition. Every other tool's input and result contract is unchanged; the fingerprint baseline enforces that.

## 1. Published input keys

The old keys are published with `"deprecated": true` and a description that starts `Deprecated: use`.

**FR-008 shared wording.** Each new key's description opens with its siblings' wording of the shared concept, verbatim. After that it adds only what differs for this tool: its default, or an input rule the MCP Tool Surface Standards require to be visible (a combination rule, or "not checked by the CLI").

| Concept | Sibling source (verbatim) | Shared opening every new key uses |
|---|---|---|
| Property | `read_property.name`: `Frontmatter property name to read, matched exactly (e.g. "status").` | `Frontmatter property name to <action>, matched exactly (e.g. "status").` (the action is the tool's verb: read, match) |
| Case handling | `search` / `context_search` / `pattern_search` `case_sensitive`: `Match case exactly when true` | `Match case exactly when true.` |
| Folder scope | `context_search` / `pattern_search` `folder`: `Vault-relative folder to search under, recursively (e.g. "Projects"). Default: the whole vault.` | the same sentence, verbatim |
| `.base` location | `query_base.base_path`: `BASE_PATH_DESCRIPTION` | `BASE_PATH_DESCRIPTION`, verbatim |
| View | `query_base.view_name`: `Exact, case-sensitive name of the view to run (as listed by views_base), 1..1000 chars.` | `Exact, case-sensitive name of the view to <action> (as listed by views_base).` (no length range: `create_base` sets no maximum, and adding one would change validation, FR-009) |

### `find_by_property`

| Key | Status | `required` | Description (published) |
|---|---|---|---|
| `vault` | unchanged | no | unchanged |
| `name` | **new** | no¹ | `Frontmatter property name to match, matched exactly (e.g. "status"). Required (or the deprecated property).` |
| `property` | deprecated | no | `Deprecated: use name (accepted until the next major release).` |
| `value` | unchanged | yes | unchanged |
| `folder` | unchanged | no | unchanged |
| `array_match` | **new** | no | `For list properties: true matches when the list contains value; false requires an exact, ordered array match. Default true.` |
| `arrayMatch` | deprecated | no | `Deprecated: use array_match (accepted until the next major release).` |
| `case_sensitive` | **new** | no | `Match case exactly when true. Default true.` |
| `caseSensitive` | deprecated | no | `Deprecated: use case_sensitive (accepted until the next major release).` |

Published `required`: `["value"]`.

### `find_and_replace`

| Key | Status | Description (published) |
|---|---|---|
| `case_sensitive` | **new** | `Match case exactly when true. Default true.` |
| `case_insensitive` | deprecated | `Deprecated: use case_sensitive with the opposite value (case_insensitive: true equals case_sensitive: false); accepted until the next major release.` |
| `folder` | **new** | `Vault-relative folder to search under, recursively (e.g. "Projects"). Default: the whole vault. Not combinable with file, path or active_note.` |
| `subfolder` | deprecated | `Deprecated: use folder (accepted until the next major release).` |
| all other keys | unchanged (wording that named `subfolder` now says `folder`) | |

Published `required`: `["pattern", "replacement"]` (unchanged).

### `create_base`

| Key | Status | `required` | Description (published) |
|---|---|---|---|
| `base_path` | **new** | no¹ | `BASE_PATH_DESCRIPTION` (shared with `query_base`, verbatim) followed by ` Required (or the deprecated path).` |
| `path` | deprecated | no | `Deprecated: use base_path (accepted until the next major release).` |
| `name` | unchanged | yes | unchanged |
| `content` | unchanged | no | unchanged |
| `view_name` | **new** | no | `Exact, case-sensitive name of the view to create the item in (as listed by views_base). Not checked by the CLI; omit for the default.` |
| `view` | deprecated | no | `Deprecated: use view_name (accepted until the next major release).` |
| `vault` | unchanged | no | unchanged |

Published `required`: `["name"]`.

¹ Required as a concept, enforced at parse time (`"<new> is required"`). It is left out of `required` during the transition so that old-name calls validate. The removal follow-up restores it.

## 2. Outcomes

| # | Call | Outcome |
|---|---|---|
| O1 | New names only | Today's result, unchanged; no `deprecated_parameters`. |
| O2 | Old names only | Same result as the equivalent new-name call, plus `deprecated_parameters` listing each old name used. |
| O3 | `find_and_replace` with `case_insensitive: true` | Same as `case_sensitive: false`. The notice entry carries the polarity `note`. |
| O4 | Old and new name for one concept | `VALIDATION_ERROR`. The issue at `[old]` names both. Nothing is spawned, read or written. |
| O5 | Neither name for `name` / `base_path` | `VALIDATION_ERROR`, `"<new> is required"`. |
| O6 | Old name with an invalid value | Same error code and sub-code as the new name. The issue `path`, the message and `params.field` name the new parameter. |
| O7 | `find_and_replace` `subfolder` + `file`/`path`/`active_note` | `SCOPE_CONFLICT` with the same reason as for `folder` (`note+folder` / `active+folder`); the message says `folder`. |

## 3. Result field

```jsonc
// find_by_property, old names
{ "count": 1, "paths": ["x.md"],
  "deprecated_parameters": [ { "parameter": "property", "replacement": "name" } ] }

// find_and_replace preview, case_insensitive + subfolder
{ "mode": "preview", "affected_notes": [], "total_occurrences": 0,
  "deprecated_parameters": [
    { "parameter": "case_insensitive", "replacement": "case_sensitive",
      "note": "case_insensitive: true equals case_sensitive: false (opposite polarity)." },
    { "parameter": "subfolder", "replacement": "folder" } ] }
```

## 4. Stable machine-readable surface

The following do not change:

- error codes and `details.code` / `details.reason` values (`INVALID_SUBFOLDER`, `SCOPE_CONFLICT` reasons, `INVALID_BASE_PATH`, `BASE_NOT_FOUND`, `INVALID_NAME`, `CONTENT_TOO_LARGE`);
- the `subfolder` key inside the `INVALID_SUBFOLDER` / `not-found` details;
- the `path` key inside `BASE_NOT_FOUND` details;
- every existing result field;
- the CLI arguments the tools send.

The one deliberate machine-readable move is `params.field` (and the issue path) on `create_base`'s INVALID_BASE_PATH issues: `"path"` becomes `"base_path"`.

## 5. Baseline expectation

`npm run baseline:write` moves exactly these fingerprints:

| Tool | Fingerprints that move |
|---|---|
| `find_by_property` | `descriptionFingerprint`, `schemaFingerprint`, `outputSchemaFingerprint` |
| `find_and_replace` | `descriptionFingerprint`, `schemaFingerprint`, `outputSchemaFingerprint` |
| `create_base` | `descriptionFingerprint`, `schemaFingerprint`, `outputSchemaFingerprint` |

No other tool and no `title` or `annotations` fingerprint moves.
