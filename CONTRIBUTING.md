# Contributing

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
