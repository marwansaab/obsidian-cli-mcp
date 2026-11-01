# Data Model: Classify Malformed Base

**Feature**: [spec.md](spec.md) | **Contract**: [contracts/views_base-malformed-contract.md](contracts/views_base-malformed-contract.md)

No stored data. These entities describe the values one `views_base` call handles.

## Entities

### Upstream report

What `base:views` produced, read from one of two places:

- **Failure path**: the rejected `UpstreamError`'s `details.stderr` and `details.stdout`.
- **Clean-exit path**: the resolved stderr plus the stdout lines that are not view lines.

The trimmed parts are joined by `"\n"`, stderr first. The report is never published whole.

### YAML complaint

An upstream report that `INVALID_YAML_PATTERN` matches. The constant is shared by `views_base` and `query_base` in `src/tools/_base-malformed.ts`.

### View line

A stdout line whose trailing tab-delimited token is in `KNOWN_VIEW_TYPES` (`table`, `cards`, `list`). It is excluded from the clean-exit scan text, so a view name never triggers recognition.

### Malformed-Base failure

An `UpstreamError`:

| Field | Value |
|-------|-------|
| `code` | `"CLI_REPORTED_ERROR"` |
| `details.code` | `"BASE_MALFORMED"` |
| `details.reason` | `"invalid-yaml"` \| `"unknown"` (closed; never absent) |
| `details.base_path` | the supplied path (named mode only) |
| `details.message` | the bounded report (≤ 1,000 chars whole; otherwise head 500 + `"\n[… cut …]\n"` + tail 500) |
| `details.messageLength` | the report's full length |
| `message` | plain malformed-Base headline; no report text |
| `cause` | dispatch error or `null`; not serialised |

## Invariants

| ID | Invariant | Spec |
|----|-----------|------|
| V1 | A YAML complaint in either mode yields `BASE_MALFORMED` / `invalid-yaml`. | FR-001, FR-002 |
| V2 | A YAML complaint takes precedence over a not-a-base report. | Edge cases |
| V3 | `details.reason` ∈ {`invalid-yaml`, `unknown`} on every `BASE_MALFORMED`. | FR-014 |
| V4 | The headline `message` holds no report text. | FR-005, SC-004 |
| V5 | `details.message` is at most 500 + 11 + 500 characters. | FR-006, SC-007 |
| V6 | No view line, "no views defined" wording, or absent-views case yields `BASE_MALFORMED`. | FR-012, FR-015 |
| V7 | An unrecognised failure is rethrown as the same error object. | FR-009 |
| V8 | No new top-level code, `details.code` or `stage`. | FR-008 |

## State flow (one call)

```text
[named] vault check → focus eval ─ok:false→ BASE_NOT_FOUND/named-missing
                                 └ok:true─┐
[open] ───────────────────────────────────┴→ base:views
   ├ rejects (CLI_REPORTED_ERROR | CLI_NON_ZERO_EXIT)
   │    ├ YAML complaint            → BASE_MALFORMED/invalid-yaml
   │    ├ not-a-base (REPORTED only) → named: BASE_MALFORMED/unknown · open: BASE_NOT_FOUND/not-open
   │    └ else                       → rethrow unchanged
   └ resolves
        ├ YAML complaint (non-view lines + stderr) → BASE_MALFORMED/invalid-yaml
        ├ not-a-base                → as above
        └ else                      → { views, count }
```
