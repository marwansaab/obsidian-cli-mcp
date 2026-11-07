# Contributing

## Development environment

- **Node.js ≥ 22.13** is required to run the dev toolchain: `eslint` 10
  declares engines `^20.19.0 || ^22.13.0 || >=24`, so `npm run lint` fails
  on earlier 22.x patch lines.
- This is a **dev-only** floor. The published runtime floor is unchanged:
  `engines.node >= 22.11` in package.json is what end users need to run the
  server (see README § Install). Raising the published floor is a
  constitution-amendment trigger and is deliberately not pulled here.

## Branches and releases

The repository follows ADR-081: `main` is always exactly what npm serves as
`latest`, and `develop` is the default branch.

| Branch | Job | Cut from | Merges into |
| --- | --- | --- | --- |
| `main` | What npm serves as `latest` | — | — |
| `develop` | Integration: every work branch lands here | — | — |
| `release/x.y.z` | The release candidate, held still for UAT | `develop` | `main` |
| `hotfix/x.y.z` | A fix to the live version | `main` | `main` |
| Work branch | One change | `develop`, or `release/x.y.z` for a fix found in UAT | the branch it was cut from |

- **Work branches** keep the names the tools give them: `NNN-<slug>` from
  Spec Kit, `fix/bi-NNNN` from the bug flow, and `docs/<slug>`,
  `chore/<slug>` or `ci/<slug>` by hand. `main`, `develop`, `release/*` and
  `hotfix/*` are reserved.
- **Every pull request** merges with a merge commit (squash and rebase merging
  are off), names its `BI-NNNN` in the branch name or the body, and adds its
  `CHANGELOG.md` entry under `[Unreleased]`, repeating the BI id. Nothing is
  committed directly to `main` or `develop`. Merged head branches are deleted.
- **The changelog entry is checked.** The required *Changelog entry* check
  (`.github/workflows/changelog-entry.yml`, `node scripts/release.ts entry
  <n>`) fails a pull request into `develop` that changes `src/**` or comes
  from a `fix/bi-*` or `feat/*` branch, unless its `CHANGELOG.md` change adds
  a line naming one of its BIs (`bi-NNNN` in the branch, `BI-NNNN` in the
  body). A change with nothing for users to read, such as a test-only change,
  takes the `no-changelog` label instead. The check runs from `develop`'s copy
  of the workflow, so a pull request cannot change it. It exists because PRs
  #156, #157 and #158 merged with no entry and 0.9.1's notes omitted them.
- **Protection is code.** The rulesets live in `.github/rulesets/` and
  `node scripts/rulesets.ts apply` applies them, with the repository settings
  the model needs; it is idempotent. `main`, `develop` and `release/*` need a
  pull request, the four CI jobs green, review threads resolved, no force
  push and a merge commit; `main` and `develop` cannot be deleted; `v*` tags
  cannot be moved or deleted; nothing can be bypassed. The *Rulesets drift*
  workflow compares the live rulesets with the files every day
  (`node scripts/rulesets.ts check` does the same by hand).

### Cutting and shipping a release

1. **Cut.** The owner runs the *Release cut* workflow (Actions → Release cut)
   with the version `x.y.z` and kind `release`. It creates `release/x.y.z`
   from `develop` holding one commit: `package.json` and `package-lock.json`
   at the new version, and `CHANGELOG.md`'s `[Unreleased]` renamed to
   `[x.y.z] - YYYY-MM-DD` (UTC date) under a fresh empty `[Unreleased]`. It
   then runs CI on the new branch.
2. **UAT.** Build `release/x.y.z` locally, register it as
   `obsidian-cli-mcp-local` and validate against the test vault: the
   test-case sweep, the [release checks](#release-checks) below, and an
   owner-input regression when the release changes what clients see. A fix
   found here is a work branch cut from `release/x.y.z` with its pull request
   into it, and its changelog entry goes into the `[x.y.z]` section. Carry
   the fix back to `develop` during UAT so it is not lost, through a branch
   cut from `release/x.y.z` (for example `chore/back-merge-x.y.z`) with its
   pull request into `develop`: a pull request straight from
   `release/x.y.z` would delete the release branch when it merges.
3. **Pull request into `main`.** When UAT passes, the owner opens the pull
   request `release/x.y.z` into `main`. Besides CI it must pass *Source
   branch* (the head is `release/*` or `hotfix/*` of this repository; it runs
   from `main`'s copy of the check) and *Version and changelog* (the version
   is greater than npm's `latest`, and `CHANGELOG.md` has a non-empty section
   for it that names a BI of every pull request merged since `main` that needs
   an entry, by the rule of the *Changelog entry* check). The owner's merge is
   the approval.
4. **Publish.** The merge starts the *Release* workflow
   (`.github/workflows/release.yml`) in the GitHub environment `npm`: it
   tests, builds and runs `npm publish --provenance` through npm trusted
   publishing, with no npm token anywhere. Only if that succeeds does it tag
   the commit `vX.Y.Z` (annotated), create the GitHub Release from the
   version's changelog section, and open the pull request `main` into
   `develop`, which the owner merges. A failed publication leaves no tag and
   no Release: fix it and re-run, or ship a hotfix. When the publication
   succeeded and a later step failed, use *Re-run failed jobs*. npm then
   shows the new version as *Validating* while its automated review runs,
   and `latest` moves only when the review ends, a few minutes for 0.9.1.
5. **Back-merge.** The pull request `main` into `develop` gets its required
   checks from CI's push run on the merge commit, and *Changelog entry* from
   that workflow's push run, which passes without checking anything. Because the workflow token
   opened it, its own `pull_request` CI run waits for approval; that run is
   not needed, but if the pull request shows no CI checks (for example a
   hotfix cut from a `main` that predates the push trigger, PR #162), click
   *Approve and run workflows* on it.

A **hotfix** runs the same way with kind `hotfix`: the workflow cuts
`hotfix/x.y.z` from `main`, the fix lands by pull request into it, and after
publication the close-out pull request carries it back to `develop` (merge it
into any open `release/*` too).

## Release checks

Some behaviour can only be shown against a running Obsidian, so it is checked
by hand on the release branch's own build during UAT rather than in CI.

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
