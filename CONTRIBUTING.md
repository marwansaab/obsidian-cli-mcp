# Contributing

## Development environment

- **Node.js ≥ 22.13** is required to run the dev toolchain: `eslint` 10
  declares engines `^20.19.0 || ^22.13.0 || >=24`, so `npm run lint` fails
  on earlier 22.x patch lines.
- This is a **dev-only** floor. The published runtime floor is unchanged:
  `engines.node >= 22.11` in package.json is what end users need to run the
  server (see README § Install). Raising the published floor is a
  constitution-amendment trigger and is deliberately not pulled here.

## Release checks

Some behaviour can only be shown against a running Obsidian, so it is checked
by hand before a release rather than in CI.

### Non-ASCII handling (`npm run check:non-ascii`)

Proves against real vaults that `outline`, `links`, `paths`,
`pattern_search` and `smart_connections_similar` handle non-ASCII note names,
folder names and text exactly as written (spec
[093](specs/093-verify-non-ascii-handling/spec.md)). It drives the built
server over stdio, so build first:

```sh
npm run build
npm run --silent check:non-ascii -- --test-vault TestVault-Obsidian-CLI-MCP --semantic-vault My-Setup-Vault [--staged-note "<path>"] > run-<date>.txt
```

- **Two vaults, both open in Obsidian.** `--test-vault` is the only vault the
  check writes to: it seeds fixtures under a fresh
  `Sandbox/non-ascii-check-<timestamp>-<hex>/` folder (the vault must already
  have `Sandbox/`) and removes that folder before it reports.
  `--semantic-vault` must have Smart Connections loaded and indexed, and is
  only read. The script has no default for either name and refuses to run
  when they are the same.
- **`--staged-note`** is the path of an indexed note with a non-ASCII path in
  the semantic vault. Without it, the similar-notes success scenario (S1)
  reports `BLOCKED` and the others still run.
- **The report** is UTF-8 text on stdout, one `PASS`, `FAIL` or `BLOCKED`
  block per scenario, then a cleanup line and a summary line. The exit status
  is `0` with no `FAIL`, `1` for any `FAIL` or for a run folder left behind,
  and `2` for a usage error or a server that would not start (no report).
- **Capture the report byte for byte.** It is evidence that the characters
  arrived intact, so the redirect must not re-encode it. Run the command
  from Git Bash, as above. Windows PowerShell 5.1's `>` re-encodes a native
  command's output and garbles exactly the characters the report shows
  (PR #144).

The check verifies; it does not fix. Each `FAIL` becomes its own work item.
`backlinks`, `open_file`, `views_base` and `create_base` use the same payload
route and are not covered yet.

## Commit-message convention

Every commit in this project follows the convention below. It is a superset
of [Conventional Commits](https://www.conventionalcommits.org/) — the
`type(scope): description` subject is the same; the body conventions
layered on top are project-specific.

### Subject line (≤72 chars, no trailing period)

```
<type>(<scope>): <description>
```

- **`type`** — one of: `feat`, `fix`, `chore`, `docs`, `ci`, `refactor`,
  `test`, `perf`.
- **`scope`** — the spec/feature ID when one exists (e.g. `013`,
  `specs/009`); otherwise a component name (e.g. `git-extension`,
  `release`, `readme`, `ci`).
- **`description`** — lowercase, imperative present tense ("add",
  "implement", "bump", "clarify", "remediate", "pivot to", "mark",
  "scaffold", "revert", "enable"). Sentence fragment, no period. May end
  with a parenthetical clarifier like `(round 4)`,
  `(consistency + coverage)`, or a task-ID list like `(T001, T003, T006)`.

Examples:

- `feat(013): implement find_and_replace MCP tool with three-layer composition`
- `docs(013): clarify enumeration and count semantics for find_and_replace (round 3)`
- `chore(release): bump to 0.5.0 — spec 008 list_tags`

### Body (blank line after subject, wrap ~72 cols)

Lead with the **WHY** and **WHAT**, not the HOW (the diff shows the how).

1. One-paragraph summary of what this commit does and why it exists
   (link to the user clarification, spike outcome, analyzer finding, or
   upstream dependency that prompted it).
2. Itemised detail using bullets. Group related items under a SHOUTY-CAPS
   prefix when categorising — e.g. `LAYER 1 — …`,
   `T002 spike outcome (YYYY-MM-DD): NEGATIVE.`, `MINOR bump:` /
   `PATCH bump:`, `F1 (HIGH) — …` (analyzer finding ID + severity),
   `I2 (MEDIUM) — …` (consistency-issue ID + severity).
3. Reference identifiers wherever they apply, in their native form, no
   decoration: `FR-NNN` (functional requirement), `SC-NNN` (success
   criterion), `TNNN` (task ID, e.g. `T009a`), `RNN` (research item, e.g.
   `R12`), `Q1` (clarification question), `file/path.ts:LINE` (when
   pointing at code), `PR #NN`, `commit shortsha`. Don't gloss IDs as
   "the requirement" — name them.
4. Be honest about tradeoffs, deferrals, and negative outcomes. If a
   spike failed, say "NEGATIVE" and explain. If something is gated on
   another piece of work, name the gate. If a task is deferred, say so
   explicitly.
5. Close with quality-gate results when the commit changes code:
   `Quality gates: lint clean, typecheck clean, build clean, 572/572
   tests pass (was 422 baseline, +150 new, 0 regressions).` Include
   coverage % when the project tracks a coverage floor.
6. For semver bumps, state the bump category and the rationale in one
   sentence: `MINOR bump: adds the X public tool. Backward compatible —
   no existing tool surface changes.` `PATCH bump (0.5.0 → 0.5.1) is the
   honest signal: this PR ships internal preparation but no user-visible
   capability.`

Bodies are **mandatory** for `feat`, spec, and analyzer-remediation
commits. They are optional for tiny one-line `fix`/`chore` commits, but
even those keep the `type(scope): subject` form.

### Trailers (blank line before, one per line, no wrap)

For AI-assisted commits, append:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Substitute the actual model name + version of the assistant session
that drafted the message.

### Tone

Direct, technical, no marketing language, no emoji. Prefer concrete
nouns ("the dispatcher's `getRestService` throw path") over abstractions
("the error handling"). Be willing to write things like "the templated
commit messages are too generic to be useful" when reverting something.
Write so a maintainer reading `git log` six months later can reconstruct
the WHY without opening the PR.
