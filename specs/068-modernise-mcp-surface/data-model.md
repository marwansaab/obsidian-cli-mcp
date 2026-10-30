# Data Model: Modernise MCP Surface (0.9.0)

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

This release adds no persistent storage. The "entities" below are in-process values and
the published wire shapes that clients see. Each lists its owner module, fields,
validation rules, and the FRs it serves. Wire contracts are in [contracts/](contracts/).

---

## 1. Server access configuration (PR 2, PR 6)

Parsed once at boot in `createServer()` from the environment. Pure value; injected into
the tools that need it (no handler reads `process.env` at call time).

| Field | Source env var | Type | Default | Parse rule |
|---|---|---|---|---|
| `allowEval` | `OBSIDIAN_MCP_ALLOW_EVAL` | boolean | `false` | truthy set `1 / true / yes / on`, case-insensitive, trimmed — the same parser as `OBSIDIAN_AUTO_LAUNCH` (reused, not copied) |
| `readOnly` | `OBSIDIAN_MCP_READ_ONLY` | boolean | `false` | same truthy parser |
| `allow` | `OBSIDIAN_MCP_TOOLS` | `string[] \| undefined` | undefined (= all tools) | split on `,`, trim each, drop empty entries; an empty or whitespace-only value is treated as unset |
| `deny` | `OBSIDIAN_MCP_DISABLE` | `string[]` | `[]` | same split rule |

**Validation** (FR-045): every name in `allow` ∪ `deny` MUST be a registered tool name.
All unknown names are collected and reported in ONE boot-time error (aggregated like
`assertToolDocsExist`). The server does not start.

**Derived: offered tool set** (FR-043, FR-044, edge cases):

```text
offered = allTools
        ∩ (allow ?? allTools)          # allow list first
        − deny                         # deny list after
        ∩ (readOnly ? {t | t.annotations.readOnlyHint} : allTools)   # read-only on top
```

An empty `offered` set is valid: the server starts and offers no tools.

---

## 2. Tool classification (PR 4)

One record per tool, held next to the tool's registration (single source of truth for
the published `annotations`, and the input the read-only filter reads).

| Field | Type | Rule |
|---|---|---|
| `title` | string | human-readable, non-empty (FR-019) |
| `readOnlyHint` | boolean | explicit (FR-020) |
| `destructiveHint` | boolean | explicit |
| `idempotentHint` | boolean | explicit |
| `openWorldHint` | boolean | explicit |

Values per tool: spec FR-024 table, pinned by a test (FR-023). `vaults` is in the
read-only row. A test walks the published list and fails on any missing field.

---

## 3. Published tool descriptor (PR 3, PR 4, PR 5)

What `tools/list` (2025 era) / `server/discover` (2026 era) returns per tool. Produced
by the SDK from the `registerTool` config; the project never hand-writes it.

| Field | Source | Notes |
|---|---|---|
| `name` | tool module | unchanged; FR-057 (only `vaults` added) |
| `title` | §2 | new in PR 4 |
| `description` | tool module | PR 4 removes the cross-cutting rules and the "call help first" text (FR-028, FR-032) |
| `inputSchema` | tool's zod input schema, converted by the SDK | PR 3: SDK-native dialect, no parity normaliser (FR-033). PR 4: descriptions kept, no stripping (FR-029); every property described (FR-030); target-mode rules in descriptions (FR-031) |
| `annotations` | §2 | PR 4 |
| `outputSchema` | tool's zod output schema | PR 5; only for tools returning a JSON object (FR-039); absent for text tools (FR-041) |

**Tool-surface record** (FR-034): `src/tools/_register-baseline.json`, a per-tool
fingerprint of the canonical descriptor JSON. Regenerated deliberately in PR 3 (dialect),
PR 4 (titles/annotations/descriptions), PR 5 (outputSchema + `vaults`). The gate
test fails on any mismatch.

---

## 4. Tool result (PR 5)

| Case | `content` | `structuredContent` | `isError` |
|---|---|---|---|
| Success, tool has `outputSchema` | one text block = `JSON.stringify(result)` | `result` (same object) | absent |
| Success, text tool (`read`, `help`, …) | one text block (as today) | absent | absent |
| Failure (any tool) | one text block = `{code, message, details}` (as today) | absent | `true` |

Invariant (FR-042): for every tool with an `outputSchema`, `JSON.parse(content[0].text)`
deep-equals `structuredContent`, and `structuredContent` validates against the
published `outputSchema`.

**Which tools publish an `outputSchema`** (survey at HEAD; research R6):
- **Publish**: the 31 tools that already export a zod output schema, except `tag`, plus
  `vaults`.
- **Union-of-objects results** (`search`, `find_and_replace`) are published as an
  object-root schema wrapping the variants (`{type:"object", anyOf|oneOf:[…]}`), identical
  in both eras (FR-039, no era exceptions).
- **Excluded, because their result is not a structured object (outside FR-039)**:
  - `help`: raw Markdown;
  - `read`: returns `{content}` wrapping note text; FR-041 treats it as a text tool, and
    its text block stays byte-identical;
  - `obsidian_exec`: no zod output schema; free-form CLI output;
  - `tag`: its count-only form returns a bare integer. This is stated in the PR-5 body
    for owner review.

---

## 5. Orientation text (PR 4)

Built once at boot from the offered tool set (§1). Not stored.

| Part | Content | Rule |
|---|---|---|
| `opening` | purpose in task terms; platforms | fixed across configurations; ≤ 512 chars; ends on a full sentence; names no hideable tool (FR-026) |
| `routing[]` | lines `task → tool`, each tagged with the tool names it mentions | a line is included only if every tool it names is offered (FR-026a) |
| `rules[]` | cross-cutting rules, each tagged with the tool names it mentions (or none) | same inclusion rule |

**Assembly**: `opening + "\n\n" + included routing + "\n\n" + included rules`.
**Bounds**: full (unfiltered) text < 2,000 chars (FR-027, SC-007). Read-only text names
no tool whose `readOnlyHint` is false (FR-026a).

---

## 6. Vault registry and vault entry (PR 5)

`src/vault-registry/registry.ts` (existing). Name → path cache from
`obsidian vaults verbose`.

**Vault entry** (returned by `vaults`):

| Field | Type | Rule |
|---|---|---|
| `name` | string | Obsidian display name |
| `path` | string | absolute path as reported by Obsidian |
| `open` | `boolean \| null` | `null` unless openness is determined cheaply (research R9); never guessed |

`vaults` output: `{ count: number, vaults: VaultEntry[] }`; `count === vaults.length`.
Duplicate display names are returned as separate entries.

**State transitions (registry cache)**:

```text
empty ──first lookup──▶ loaded
loaded ──lookup hit──▶ loaded
loaded ──lookup miss──▶ re-probe once ──hit──▶ loaded (refreshed)
                                     └─miss─▶ loaded (refreshed) + "unknown vault" error (no restart advice)
vaults ──always──▶ fresh probe ──▶ loaded (refreshed)
```

---

## 7. Passthrough blocked-command set (PR 2)

Fixed denylist (clarification Q3). Matched against `obsidian_exec`'s `command` field
only, after trim + lower-case; never against `parameters` values. The input schema refuses
any `command` containing `=` (plain `VALIDATION_ERROR` on the `command` path, before the
gate and regardless of `allowEval`), so `command` is always the token the CLI runs. Without
it, a `command` of `vault=X` would make the CLI run the next token (research R4, T0 result;
owner ruling on the PR #88 review).

| Rule | Matches |
|---|---|
| exact | `eval`, `devtools`, `restart` |
| prefix | `dev:` (every `dev:*` command) |
| exact (plugin lifecycle) | `plugin:install`, `plugin:enable`, `plugin:disable` (pinned from the live CLI, research R4 T0 result) |

Not blocked: `command` (palette execution), `plugin:reload` — accepted residual risk
(spec Assumptions).

Refusal → `UpstreamError` with top-level `VALIDATION_ERROR`,
`details.code: "COMMAND_BLOCKED"`, `details.command: <as given>`. Raised before any
spawn. Bypassed entirely when `allowEval` is true.

---

## 8. Confirmation request (PR 6)

| Field | Value |
|---|---|
| trigger | `delete` with `permanent: true`; `find_and_replace` with `commit: true` and no single-note scope (no `file` / `path` / `active_note`; a `subfolder` scope still triggers) |
| message | names the action, the vault, and the target (note path, or scope + note count) |
| schema | one boolean `confirm` field (form elicitation) |
| outcomes | `accept` + `confirm: true` → proceed; `accept` + `confirm: false`, `decline`, `cancel` → refuse |

**Refusal shapes** (zero new top-level codes, ADR-015 sub-codes):

| Situation | Top-level | `details.code` |
|---|---|---|
| human declined or cancelled | `VALIDATION_ERROR` | `CONFIRMATION_DECLINED` |
| client cannot elicit | `VALIDATION_ERROR` | `CONFIRMATION_UNAVAILABLE` (message gives the out-of-band route: trash delete, or one note at a time) |

**Two steps** (research R12; B3 ruling: refuse before any change):

1. **Capability check** (`confirmation.requireConfirmable(message)`): at handler entry,
   right after input validation, and **before vault resolution** (which can spawn
   Obsidian). If the client cannot elicit, it throws `CONFIRMATION_UNAVAILABLE` carrying
   `message`; nothing is spawned and nothing is written.
2. **Human prompt** (`confirmation.confirm(message)`):
   - `delete`: straight after step 1, before `invokeCli`;
   - `find_and_replace`: only after the commit's re-scan (so the message carries the
     scope and note count) and before the first `writeAtomic`.

---

## 9. Queued call (PR 6)

Existing single-flight FIFO (`createQueue()`), extended with cancellation.

| Field | Type | Notes |
|---|---|---|
| `task` | `() => Promise<T>` | unchanged |
| `signal` | `AbortSignal \| undefined` | the request's cancellation signal from the SDK handler context |

**States**:

```text
queued ──abort──▶ removed (never started; promise rejects with an abort reason)
queued ──dequeued──▶ running
running ──abort──▶ child: SIGTERM → (grace period) → SIGKILL; task settles; queue advances
running ──settles──▶ done; queue advances
done ──abort──▶ ignored
```

`find_and_replace` commit: each note write is its own queued task; on abort the loop
stops between notes (clarification Q1). The in-flight write completes; committed and
skipped locators go to the new `commitCancelled` logger event
([errors contract](contracts/errors.contract.md)).

---

## 10. Progress report (PR 6)

Sent only when the request carries a `progressToken` (FR-054).

| Source | `progress` | `total` | `message` |
|---|---|---|---|
| auto-launch readiness loop | elapsed poll count | max poll count for the 30 s budget | "waiting for Obsidian to start" |
| `find_and_replace` commit | notes written so far | notes to write | the note's vault-relative path |

---

## 11. Metadata refresh request (PR 1)

| Field | Rule |
|---|---|
| `vault` | the vault as the caller named it (`input.vault`), passed as `vault=` on the eval; absent in active mode, where the refresh runs in the open vault |
| `relPath` | vault-relative, forward-slash path of the written note |

Best-effort: failure → new `metadataRefreshFailed` logger event `{vault, relPath,
reason, detail}`, where `reason` is one of `cli-error`, `note-not-found`,
`unexpected-output` and `detail` carries the error code and message, or the first 200
characters of the eval output; the write result is unchanged (FR-004). Callers today: `write_note`,
`append_note`, `patch_heading`, `patch_block`; PR 1 adds `find_and_replace` commit (once
per changed note, after its write). The `write_note open: true` template gets the same
vault-relative path and `vault=`.

---

## 12. Containment check (PR 1)

Input: canonical vault root (realpath'd once), candidate absolute write path.

```text
p = candidate
missing = []
while not exists(p): missing.unshift(basename(p)); p = dirname(p)
real = realpath(p) + join(missing)
inside = real === root || real.startsWith(root + sep)   # win32 case handling: research R5
```

Today (`src/path-safety/canonical.ts:43-48`) only the immediate parent is realpath'd, and
it falls back to the lexical parent on ENOENT. The comparison already uses `root + sep`
(the prefix-collision case passes today; PR 1 pins it with a test). There is no case
folding today.

Outside → `PATH_ESCAPES_VAULT` (existing code) + existing `pathEscapeAttempt` log event;
nothing created.
