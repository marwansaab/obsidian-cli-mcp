# Quickstart: validating Modernise MCP Surface (0.9.0)

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Contracts**: [contracts/](contracts/)

This is a validation and run guide, not an implementation guide. Every PR runs §1. The
other sections apply to the PR named in their heading.

> **Live-vault gate.** Read `.memory/test-execution-instructions.md` before §2, §3.3,
> §4 and §8. Probes write only under the authorised test vault's `Sandbox/` directory,
> drive `Obsidian.com` (never `Obsidian.exe`), pass `vault=` explicitly, and clean up
> afterwards. The gate file is the only source for the vault path and the bait-folder
> location.

## 1. Every PR: local and CI gates

```powershell
npm ci
npm run lint          # zero warnings
npm run typecheck     # tsc --noEmit
npm test              # vitest run --coverage, statements >= 96
npm run build
```

CI must be green on `ubuntu-latest` and `windows-latest`, each on Node 22 and 24 (PR 1
onward). If Windows coverage fails with ENOENT under `coverage/.tmp`, see research R14.

**Surface gate** (PR 3 onward): `npm test` fails if the published tool list differs from
`src/tools/_register-baseline.json`. To change the surface on purpose:

```powershell
npm run baseline:write
git diff src/tools/_register-baseline.json   # review every changed entry
```

**Prove the gate works** (PR 3, once): edit one tool's description, run `npm test`, and
expect the baseline test to fail. Then revert.

## 2. PR 1: A1 metadata refresh (live, T0)

Run the steps in order, against the authorised test vault (`<TV>` below):

1. Seed `Sandbox/a1-<runid>.md` with no frontmatter.
2. **Before the fix** (on `main`): call `write_note` (specific mode, `vault=<TV>`) to add
   frontmatter `a1probe: <runid>`. In the very next call, `find_by_property` with
   `a1probe = <runid>` returns **no match**. This is the defect evidence; record the
   output verbatim.
3. **After the fix**: repeat step 2. The note IS returned.
4. Repeat step 3 with `append_note` (append a line containing an inline tag or property
   the search can see), `patch_heading`, and a `find_and_replace` commit scoped with
   `path:`. Each is visible to the following search.
5. Multi-vault: with a second vault focused in Obsidian, write to `<TV>`. The refresh
   targets `<TV>`, not the focused vault: the next search in `<TV>` sees the change.
6. `write_note` with `open: true` opens `Sandbox/a1-<runid>.md` in `<TV>`.
7. Clean up `Sandbox/`.

Unit evidence: the `_note-io` tests assert a relative forward-slash path in the template,
`vault=<TV>` in the argv, and the `metadataRefreshFailed` event on a failing eval.

## 3. PR 1: A5 containment

Run automatically in `vitest` on both OSes, using temp directories:
- a symlink (a junction on Windows) inside the vault pointing outside, with an existing
  child and with a not-yet-existing child;
- a mixed-case vault root argument (Windows);
- `..` segments;
- a sibling `vault2` next to `vault`.

Expected: `PATH_ESCAPES_VAULT`, one `pathEscapeAttempt` event, and nothing created outside
the vault. An ordinary new-folder write inside the vault succeeds.

Optional live check: stage the bait folder next to the vault, as the gate file
describes, and repeat the not-yet-existing-child case through `write_note`.

## 4. PR 2: passthrough gate

Default environment:

```jsonc
// obsidian_exec
{ "command": "eval", "parameters": { "code": "1+1" } }
// → isError, {"code":"VALIDATION_ERROR","details":{"code":"COMMAND_BLOCKED","command":"eval"}}, no process spawned
```

Repeat for `devtools`, `dev:cdp`, `restart` and each plugin install/enable/disable
command pinned in R4. `{ "command": "search", "parameters": { "query": "eval" } }` is
**not** blocked.

With `OBSIDIAN_MCP_ALLOW_EVAL=1`: `eval code=1+1` runs and returns `2` (live, test vault
only). Typed tools (`backlinks`, `links`, `open_file`, `read_heading`, …) keep passing
their existing tests unchanged.

## 5. PR 3: both protocol eras over real stdio

```powershell
npm run build
node scripts/probe-stdio.ts --era legacy   # initialize handshake
node scripts/probe-stdio.ts --era modern   # server/discover handshake
```

Each run prints the negotiated protocol version, `serverInfo`, the presence of
`instructions` (PR 4 onward) and the tool count. Expected count: 34 in PR 3 and PR 4,
35 from PR 5. Both runs must succeed.

**Claude Code** (manual): register the built server, then call `read` and `write_note`
in specific mode against `Sandbox/` in the test vault. Both succeed. A failing call (for
example `read` on a missing note) returns the same `{code, message, details}` text as
before.

## 6. PR 4: what the model sees

- `probe-stdio` prints `instructions`. Check: under 2,000 characters; the first 512
  characters end on a sentence; the text mentions `find_and_replace` preview, display
  names and `help`, and does not yet name the `vaults` tool (it arrives in PR 5).
- `tools/list`: every tool has `title` and four boolean hints; every input property has
  a `description`; no description contains `Call help(`.
- In Claude Code, two read-only calls in one turn run in parallel with no "may modify
  data" prompt.

## 7. PR 5: vaults and typed results

- `vaults` returns `{count, vaults:[{name, path, open}]}`. `open` is `null` unless
  R9's T0 found a CLI marker.
- Open a new vault in Obsidian after the server started, then call `read` with that
  vault's name. It succeeds without a restart. An unknown name gives the existing
  unknown-vault error and does not mention restarting.
- A `files` call returns `structuredContent`, and the text block parses to the same JSON.
  `read` and `help` return text only.

## 8. PR 6: owner controls, confirmation, cancel, progress

Start-up configurations (`tools/list` count via `probe-stdio`):

| Env | Expect |
|---|---|
| `OBSIDIAN_MCP_READ_ONLY=1` | only the 22 read-only tools; instructions name no write tool |
| `OBSIDIAN_MCP_TOOLS=read,search` | 2 tools |
| `OBSIDIAN_MCP_TOOLS=read,search` + `OBSIDIAN_MCP_DISABLE=search` | 1 tool |
| `OBSIDIAN_MCP_TOOLS=read,nope` + `OBSIDIAN_MCP_DISABLE=zap` | the server exits; one stderr line naming `nope` and `zap` |

Confirmation (Claude Code supports form elicitation):
- `delete` with `permanent: true` on `Sandbox/b3-<runid>.md`. A prompt appears.
  Decline → `CONFIRMATION_DECLINED`, file present. Accept → file gone (not in `.trash`).
- `find_and_replace` commit with no `file`/`path`/`active_note`. A prompt appears with
  the note count. Decline → nothing changed.
- `delete` without `permanent` → no prompt, file in `.trash`.
- No elicitation: `probe-stdio --no-elicitation` sends the same two calls. Each returns
  `CONFIRMATION_UNAVAILABLE`, and the files are untouched.

Cancel and progress are covered by unit tests: cancel-queued spawns nothing;
cancel-running kills the child and the next task runs; cancel-mid-commit leaves the
first note changed, the rest unchanged, and logs `commitCancelled`; progress arrives only
with a token. Live check (optional): with Obsidian closed and auto-launch on, call `read`
from a client that sends a `progressToken`. Progress ticks arrive until Obsidian is ready.

Release: `package.json` version is `0.9.0`. Then run `/graphify --update` and the
post-implement structural check (plan → Graphify structural check).
