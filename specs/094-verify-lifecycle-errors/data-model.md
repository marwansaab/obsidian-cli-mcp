# Data Model: Verify Lifecycle Errors

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

This item adds no runtime data. The entities below are test-time values: the simulated state a check sets up, and the outcome it expects. Exact expected values are in [contracts/lifecycle-checks-contract.md](contracts/lifecycle-checks-contract.md).

## E1 — Simulated file

A file as the template sees it: `{ path: string, extension: string }`.

| Kind | Example `path` | `extension` |
|---|---|---|
| note | `Src.md`, `Notes/Src.md` | `md` |
| canvas | `Board.canvas` | `canvas` |
| base | `Tasks.base` | `base` |
| attachment | `Images/photo.png`, `Docs/paper.pdf` | `png`, `pdf` |

## E2 — Simulated vault and plugin (`simulatedApp(state)`)

The minimal `app` object `JS_TEMPLATE` reads (research D3).

| Field of `state` | Values | Becomes |
|---|---|---|
| `files` | list of E1 | `vault.getAbstractFileByPath(p)` finds by exact path, and `metadataCache.getFirstLinkpathDest(name, "")` finds by basename without `.md`. Both return null for anything else. |
| `active` | an E1 or `null` | `workspace.getActiveFile()` |
| `plugin` | `absent` · `no-env` · `no-sources` · `no-items` · `items-null` · `ready` | `absent`: no `"smart-connections"` key. `no-env`: plugin with no `env`. `no-sources`: `env: {}`. `no-items`: `env.smart_sources: {}`. `items-null`: `items: null`. `ready`: `items` is the index (E3). |
| `index` | E3 | used only when `plugin` is `ready` |

`vault.getName()` always returns `"Demo"`. The `vault` argument the checks pass is also `"Demo"`, so the not-installed detail is predictable.

The four not-ready values cover every branch of the template's readiness guard (`!env || !env.smart_sources || typeof items !== 'object' || items === null`).

## E3 — Simulated index

A plain object from a note path to an entry, mutable between calls in one check.

| Entry state | Shape | Template outcome |
|---|---|---|
| absent | no key for the path | not indexed |
| not searchable | `{}` (no `find_connections`) | not indexed |
| indexed | `{ find_connections: async ({limit}) => candidates.slice(0, limit) }` | results |

`candidates` are `{ item: { key }, score }`, the same shape the ordering suite uses.

## E4 — Lifecycle state

One documented condition, mapped to one outcome.

| State | Outcome code | `details.code` |
|---|---|---|
| plugin not installed | `CLI_REPORTED_ERROR` | `SMART_CONNECTIONS_NOT_INSTALLED` |
| target missing (specific) | `CLI_REPORTED_ERROR` | `FILE_NOT_FOUND` |
| no note focused (active) | `ERR_NO_ACTIVE_FILE` | (none) |
| target not a note | `CLI_REPORTED_ERROR` | `NOT_MARKDOWN` |
| plugin not ready | `CLI_REPORTED_ERROR` | `SMART_CONNECTIONS_NOT_READY` (+ `reason: "api-missing"`) |
| source not indexed | `CLI_REPORTED_ERROR` | `SOURCE_NOT_INDEXED` |
| ready and indexed | success `{count, matches}` | n/a |

**Precedence (state transitions)**: the template checks the states in the order above, top to bottom. A call in several states gets the outcome of the first one. In active mode, the no-focused-note row replaces the target-missing row.

## E5 — Outcome as received

What a check reads from `tool.handler(args)`:

- **Failure**: `isError === true`, no `structuredContent`, and `JSON.parse(content[0].text)` equal to `{ code, message, details }`.
- **Success**: no `isError`, and `structuredContent` deep-equal to `JSON.parse(content[0].text)` and to the expected `{ count, matches }`.

## E6 — Exercise record (`exercise.md`)

One row per scratch edit from contract §M: edit id, what was changed, the check or checks that failed, and the observed outcome. All nine rows must show at least one failing check (SC-003).
