# Contract: `vault=` cohort empirical reconciliation

**Story**: User Story 3 (FR-007 – FR-011)
**Surface**: per-tool `docs/tools/<name>.md` + (if applicable) `specs/<NNN>-<name>/spec.md` + `src/tools/<name>/schema.ts` `.describe()` strings
**Probe protocol**: `research.md` Task 3

## Cohort enumeration

| Tool | Surface phrase as of 2026-05-21 | Code path | Probe required |
|---|---|---|---|
| `outline` | "silently honoured-as-noop" (`docs/tools/outline.md:260`) | native CLI | Yes |
| `properties` | "silently honoured-as-noop" (`docs/tools/properties.md:36, 304`) | native CLI | Yes |
| `files` | "silently honoured-as-noop" (per BI-019, cross-ref in `backlinks.md:330`) | native CLI | Yes |
| `read_heading` | "functionally ignored by eval" (`docs/tools/read_heading.md:34, 129`) | eval-composed | Yes |
| `set_property` | "functionally ignored by eval" (`docs/tools/set_property.md:179, 458`) | eval-composed | Yes |
| `find_by_property` | (F1 — eval-composed, no canonical phrase yet) | eval-composed | Yes |
| `backlinks` | (F1 — eval-composed; correctly emits VAULT_NOT_FOUND per `backlinks.md:330`) | eval-composed | Anchor only |
| `read_property` | (F1 — eval-composed) | eval-composed | Yes |
| `tag` | (F1 — eval-composed) | eval-composed | Yes |

## Per-tool probe records

Each probe produces one record persisted to `vault-probe-evidence.md` (created during `/speckit-implement`). Record schema:

```text
Tool:               <name>
Probe date:         2026-05-21 (or actual probe date)
Binary version:     <`obsidian --version` output>
Focused vault:      <vault display name>
Unfocused vault:    <vault display name>
Unregistered name:  __nonexistent_vault_42__
Fixture path:       <vault-relative path, present ONLY in unfocused vault>
A response:         <verbatim wire bytes — focused vault invocation>
B response:         <verbatim wire bytes — unfocused vault invocation>
C response:         <verbatim wire bytes — unregistered vault invocation>
Classification:     parameter-honoured | silent-noop-confirmed | classification-deferred
```

## Reconciliation rule (per tool)

- **Branch A — `Classification: parameter-honoured`** (FR-009): retire every "silently honoured-as-noop" / "functionally ignored" phrasing in the help-doc + the feature spec (if present); replace with the empirical surface. Canonical replacement text:

  > The Obsidian CLI's `vault=` parameter is honoured by upstream. Invocations against an unregistered vault name surface as a structured `<top-level code>(<details.code>)` error (see error roster below).

- **Branch B — `Classification: silent-noop-confirmed`** (FR-010): preserve the existing phrasing; append the empirical anchor immediately after each occurrence. Canonical anchor text:

  > (Empirical anchor: probe captured 2026-05-21 against obsidian-cli v<X.Y.Z>; re-verify on next audit cycle.)

- **Classification: `classification-deferred`**: re-probe with a different fixture (one guaranteed present in the focused vault) until A and B return non-error responses. If repeated deferrals occur, surface as a follow-up finding outside this BI's scope (per Out-of-Scope).

## Cohort-wide consistency post-BI

After this BI ships, every tool listed above MUST satisfy exactly one of:
1. No "silently honoured-as-noop" / "functionally ignored" phrasing surviving in any of (help-doc, feature spec, schema `.describe()`); AND error roster names the structured-error envelope produced on unregistered vault names. (Branch A.)
2. Existing phrasing preserved AND immediately followed by an empirical anchor `(Empirical anchor: ..., obsidian-cli v...)`. (Branch B.)

Mixed states (phrasing retained without anchor, or phrasing retired without an empirical replacement) are audit findings.
