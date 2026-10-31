---
name: speckit-docs-as-code
description: Document the system as built — invocation IS consent. With a PR number, reads the reviewed PR, writes the .docs-as-code/ pages and corrects the shipped docs it made wrong, commits them onto the PR's own branch and pushes so the documentation merges with the code. With no argument, baselines the whole repository (or, once a baseline exists, audits it for drift) and commits on the current branch.
compatibility: Requires an authenticated `gh` CLI for PR mode, .specify/memory/constitution.md for the principles the pages must not restate, and CONTRIBUTING.md for the commit-message convention
metadata:
  author: marwansaab
  source: ported 2026-10-24 from Slipwright-Dependencies' speckit-docs-as-code. Adapted for this repository — PR mode targets main under the protect-main ruleset; no-argument mode does the baseline and drift audit that the original deliberately left out; new ADRs continue the project-wide ADR-NNN series in a tracked tree because .decisions/ is gitignored; docs/tools/** is shipped package content asserted by tests; commit messages follow CONTRIBUTING.md.
user-invocable: true
disable-model-invocation: true
---

# /speckit-docs-as-code (document the system on invocation)

```
/speckit-docs-as-code 83     # PR mode — document a reviewed PR, push into it
/speckit-docs-as-code        # repository mode — baseline, or drift audit
```

Treat the invocation as **full consent** to read, write documentation, commit,
push where the mode calls for it, and report. Do not pause
for approval of the pages. Report in one line and stop.

## Where this sits in the workflow

```
/speckit-implement → /speckit-git-commit → open PR → /code-review + fixes → /speckit-docs-as-code <n> → merge
```

The skill runs **after** code review has finished and every review fix has
landed, and **before** the merge. It is the last commit on the PR.

**Why the PR, and not the branch.** A branch's commit messages say what each
author meant at the time. The pull request — after review has run over it and
the fixes have landed — says what the change *is*, including the corrections
review forced and the caveats it surfaced. That is the better source for a
document somebody will trust six months from now.

**Documentation is not a follow-up.** Docs-as-Code means the Markdown that
describes a change is reviewed in the same pull request as the change. A PR
whose code moved and whose documentation did not is not "Done".

**Why a tracked tree at all.** This repository's ADRs and architecture notes
(`.decisions/`, `.architecture/`) and the code index (`.codegraph/`) are
gitignored. They are the maintainer's working notes, they may not exist on a
given machine, and nothing in them reaches a reader of the GitHub repository.
`.docs-as-code/` is the part that ships with the code.

## Step 0 — Resolve the mode

1. **Parse the argument.** `83`, `#83`, or a full PR URL → **PR mode**. No
   argument → **repository mode**. Anything else → stop with
   `Unrecognised argument '<arg>'. Invoke as /speckit-docs-as-code <n> or with no argument.`

2. **Working tree.** `git status --short`. PR mode checks out another branch
   and repository mode commits on this one, so uncommitted work would be
   dragged across or mixed into the docs commit. If the tree is dirty, report
   it and stop so the user can run `/speckit-git-commit` or stash. Do not
   stash on their behalf.

3. **Remember the current branch** (`git rev-parse --abbrev-ref HEAD`). PR mode
   returns to it in Step 8.

4. **Repository mode only:** if `.docs-as-code/` does not exist, this is a
   **baseline** run; otherwise it is an **audit** run. Go to
   [Repository mode](#repository-mode). Steps 1–8 below are PR mode.

## Step 1 — Resolve the PR

1. **`gh` is authenticated.** `gh auth status`. If not, stop and say so —
   reading the PR is the whole input to PR mode and there is no local
   substitute for it.

2. **Read the PR's state:**

   ```
   gh pr view <n> --json number,title,url,state,isDraft,mergeable,baseRefName,headRefName,headRepositoryOwner,body,reviewDecision,files,commits
   ```

   State is **reported, not enforced**. The user invoked this deliberately.
   Lead the final report with the state and carry on:

   | `state` / `reviewDecision` | What it means here |
   | -------------------------- | ------------------ |
   | `OPEN` (any review decision) | The intended case. `required_approving_review_count` is `0` on `main`, so an empty decision is normal here. Proceed. |
   | `OPEN` + `CHANGES_REQUESTED` | Proceed, and say in the report that review fixes may still be outstanding — re-run once they land. |
   | `OPEN` + `isDraft` | Proceed. Note it. |
   | `MERGED` or `CLOSED` | The PR will not take another commit. See **Graceful degradation**. |

3. **Baseline present?** If `.docs-as-code/` does not exist on the PR's base
   branch, PR mode does not invent a partial tree. Stop with
   `No .docs-as-code/ baseline yet. Run /speckit-docs-as-code with no argument first, merge it, then re-run with <n>.`
   A first page that describes only one PR's worth of system reads as a
   survey and is worse than no page.

## Step 2 — Read the PR as review left it

This is the input. Read all four, in this order:

```
gh pr view <n> --json body,title                              # the description, post-review
gh pr view <n> --comments                                     # discussion and reviewer caveats
gh pr diff <n>                                                # what it actually does
gh pr view <n> --json commits --jq '.commits[].messageBody'   # the WHY per commit
```

- **The PR body** carries the author's synthesis *and* whatever review made
  them correct, including its Constitution Compliance table. Where the body
  contradicts an earlier commit message, the body wins — it is the later
  statement.
- **Review comments** are where the deferrals and the known-rough edges live.
  A caveat a reviewer raised and the author accepted belongs in the
  documentation.
- **The diff** is the ground truth. The body says what was intended; the diff
  says what shipped. Where they differ, document the diff and say so in the
  report.
- **Commit bodies** carry rationale the diff cannot show — T0 live-CLI
  findings, spike outcomes, holds on dependency versions.

If the PR belongs to a BI, also read `specs/<NNN>-<name>/spec.md` and
`plan.md` for the identifiers (FR-NNN, SC-NNN, TNNN, RNN) the pages will cite.
Read them; do not copy them.

Read the **full diff**, not the file list. Do not echo any of it into chat.

## Step 3 — Check out the PR's branch

```
gh pr checkout <n>
git pull --ff-only
```

`gh pr checkout` handles the fork case and sets tracking correctly. The docs
commit belongs on this branch and nowhere else — that is what puts it in this
PR.

If `git pull --ff-only` fails because the branch was force-pushed, say so and
stop: the PR you read is not the PR on the remote, and writing documentation
from a stale read is the one failure this skill must not commit.

For a stacked PR (a BI split into several PRs, e.g. `067-us1-…` → `067-us2-…`),
the base is another feature branch, not `main`. Document only what this PR's
diff adds; the earlier PRs carry their own pages.

## Step 4 — Write the documentation

Two scopes: the tracked living description in `.docs-as-code/`, and the
documents that already exist and that this PR may have made wrong.

### `.docs-as-code/` — the living description of the system

```
.docs-as-code/
  README.md                      index — what is here and how it is maintained
  architecture.md                spines, module layers, pipelines, error model, DI
  tech-stack.md                  what the server is built from, and what each piece constrains
  capabilities/<cohort>.md       one page per tool cohort, how it is built
  decisions/ADR-NNN-<slug>.md    decisions with consequences
```

**Every run extends; no run rewrites.** The baseline describes the solution as
it stood on one day; every PR run keeps it true. A page that gets
wholesale-replaced loses the record of what it used to say.

**Capabilities are cohorts, not tools.** The per-tool contract — inputs,
outputs, error roster, worked examples — already lives in
`docs/tools/<tool>.md`, ships in the npm package, and is served at runtime by
the `help` tool. A capability page must not restate it. It describes one
cohort as built — the groups README's Tool inventory already uses (read,
search and discovery, mutate, list and inventory, Obsidian Bases,
plugin-backed, escape hatch and meta) — and covers what the per-tool pages
cannot: which pipeline the cohort's tools use (native CLI wrap, `obsidian eval`
template, fs-direct), what they share (`src/tools/_*.ts` helpers, target-mode
handling, caps), how they classify failure through `UpstreamError`, and what is
known incomplete. Each tool in the cohort is a link to its `docs/tools/` page.

Map the PR onto pages:

| What the PR touches | Page to create or update |
| ------------------- | ------------------------ |
| A new or changed typed tool under `src/tools/<name>/` | `capabilities/<cohort>.md`, plus the `docs/tools/` checks below |
| A new tool pipeline, shared helper, or eval-template pattern | `architecture.md` **and** the capability page |
| `server.ts`, `_register.ts`, `cli-adapter/`, `queue.ts`, `logger.ts`, `errors.ts` (the boot, runtime and error spines and the kernel nodes) | `architecture.md` |
| A new `details.code` or `details.reason` sub-state | `architecture.md`'s error-model section and the capability page |
| A choice with lasting consequences, or one that closed off an alternative | `decisions/ADR-NNN-<slug>.md` |
| A decision review argued the author *out of* | `decisions/ADR-NNN-<slug>.md` — the rejected path and why it was rejected is the valuable half |
| A dependency added, removed, or bumped across a major; a version hold | `tech-stack.md` |
| tsconfig, eslint, prettier, vitest or coverage threshold, CI matrix, Node floor | `tech-stack.md` |
| A stack choice that beat a named alternative | `tech-stack.md` for the *what*, an ADR for *why it beat the alternative* |
| A constitution amendment | Nothing here — the constitution is its own record. Update any page that cited the old wording |
| A pure internal refactor with no user-visible and no stack effect | Often nothing — say so in the report rather than inventing a page |

### ADRs — one series, two homes

ADR numbers are **project-wide**. ADR-001 to ADR-032 (and later) live in the
gitignored `.decisions/`, and the constitution, specs and PR bodies cite them
by number. A new ADR written by this skill **continues that series**; it never
starts a parallel one.

- **Next number** = 1 + the highest `ADR-NNN` found in `.decisions/` (if
  present on this machine), in `.docs-as-code/decisions/`, and in
  `git grep -ohE "ADR-[0-9]{3}"` across tracked files. Take the maximum of all
  three; a number seen anywhere is taken.
- **Cite existing ADRs by ID and title in plain text** — "ADR-014
  (Plugin-Backed Typed Tools Runtime-Dependency Pattern)" — never as a link
  into `.decisions/`. That path is gitignored, so the link would be broken
  for every reader of the repository.
- **Numbers are never reused**, including for superseded records. A decision
  that is overtaken gets `Status: Superseded by ADR-NNN` and a forward link.
  It is never edited into agreement with the new one.
- **Superseding an ADR that lives in `.decisions/`** is a deliberate act
  (CLAUDE.md). Write the new ADR only when the PR itself made that call,
  give it `Supersedes: ADR-NNN (<title>)`, and say in the report that
  `.decisions/Decision Log.md` needs the matching entry. This skill does not
  edit `.decisions/`.
- **Where an ADR's choice now governs the constitution's compliance
  checklist** (as ADR-010, ADR-013, ADR-014, ADR-015 do), say so in the
  report. Adding a checklist row is a constitution amendment, not this
  skill's job.

**No orphans.** Every page is linked from `.docs-as-code/README.md`.

**Cite the PR.** Every page this skill creates or materially changes names the
PR it came from — `PR #<n>` inline, in the sentence it justifies, not as a
footer.

### `tech-stack.md` — what the server is built from

One page, grouped by role: language and runtime, MCP transport, validation,
the Obsidian CLI and the plugins it reaches, testing and coverage, lint and
format, CI, packaging and publishing. For each entry, three things and no more:

| Column | What goes in it |
| ------ | --------------- |
| What | The name, and the version **only where the version is load-bearing** — a major the code is written against, a floor, a deliberate hold. Not a copy of `package.json`. |
| Why it is here | The job it does in this server, in one clause. |
| What it constrains | What its presence forces or forbids — the part a reader cannot get from the dependency list. |

That third column is why the page exists. The constitution already *mandates*
much of the stack (Technical Standards & Stack Constraints); this page records
what the code actually does with it and links to the constitution for the rule
rather than restating it. **A page that only restates `package.json` should be
deleted.**

Two boundaries to hold:

- **Against `README.md` and `CONTRIBUTING.md`** — they tell a person how to
  install, configure and develop. This page says what the server is made of
  and what that costs.
- **Against `decisions/`** — this page records the choice as it stands; an ADR
  records the argument and the alternative it closed off.

### Shipped and existing documents — correct what the PR made wrong

A stale document is worse than a missing one because it is trusted.

| The change affects | Update |
| ------------------ | ------ |
| A tool's inputs, outputs, errors, caps or behaviour | `docs/tools/<tool>.md` |
| A tool added, renamed or re-described | `docs/tools/index.md` **and** README's Tool inventory |
| Install, client configuration, auto-launch, multi-vault behaviour, plugin dependencies | `README.md` |
| Dev environment, Node floor for the toolchain, commit convention | `CONTRIBUTING.md` |
| Anything user-visible | `CHANGELOG.md` — **flag only**, see below |

`docs/tools/**` is **package content**, not prose on the side: it ships in the
npm tarball (`package.json` `files`), the `help` tool serves it at runtime, and
co-located `index.test.ts` files and `src/server.test.ts` assert on it. Correct
it where the diff makes it wrong; do not restyle or restructure it. If a
`docs/tools/` page is still a stub (`documentation pending — owned by a future
BI`), leave it — writing it is that BI's job, not a docs pass.

**CHANGELOG.md is flagged, never written.** Entries are cut at release time by
the version-bump commit. If the PR is user-visible and the CHANGELOG has no
entry for it, say so in the report's second line.

Correct the others in place. Where a document said something that turned out
to be wrong, **say that it was wrong and why** rather than quietly deleting
it — the next reader is less likely to repeat the mistake.

### Writing rules

- **Markdown only.** No HTML blocks, no images where a diagram would do.
- **Mermaid where structure beats sentences** — the spines (`flowchart`), a
  request through `invokeCli` and the queue (`sequenceDiagram`), a multi-state
  error code (`stateDiagram-v2`). A diagram that restates a two-item bullet
  list is noise. Fence with ` ```mermaid `.
- **Document what is built.** Not what is planned, not what the spec hoped
  for. Where something is deliberately incomplete, name it and say why.
- **Reference identifiers natively**: `BI-NNN`, `FR-NNN`, `SC-NNN`, `TNNN`,
  `RNN`, `ADR-NNN`, `PR #NN`, short SHAs, `src/path.ts:LINE`.
- **Cite structure by role, not by count** (CLAUDE.md): "among the
  most-depended-on symbols", "the boot-time DI factory". Never embed caller
  counts, index statistics or test counts in a page — they drift.
- **Do not restate the constitution or the specs.** Link to
  `.specify/memory/constitution.md` and `specs/*/` instead. A copy drifts.
- **Never rewrite history.** This skill does not edit `specs/`,
  `.specify/memory/`, `.decisions/`, `.architecture/` or `.memory/`.
- **Do not touch product code.** `src/**`, tests, `scripts/` and configuration
  are out of scope. If writing the documentation reveals a bug or a wrong name,
  report it — a code change smuggled in under a docs commit is a change nobody
  reviewed.

## Step 5 — Verify, then commit onto the PR's branch

If any `docs/tools/**` file changed, run `npm test` before committing — the
tests assert on those files. If it fails, the doc edit is wrong; fix the doc,
not the test. Do not run Prettier over the Markdown: the repository's existing
`.md` files are not Prettier-clean, `format:check` is not a CI gate, and
reformatting a whole file buries the real edit in noise.

Commit the doc changes as their own commit, following
[CONTRIBUTING.md](../../../CONTRIBUTING.md) and
[speckit-git-commit](../speckit-git-commit/SKILL.md): `docs(<scope>): <lowercase
imperative>`, where `<scope>` is the BI's spec ID when the PR belongs to one
(`docs(068): …`) and `docs-as-code` otherwise. Stage selectively; never
`git add .`. Write the message to a file in the session scratchpad and pass
`git commit -F <path>`.

The subject says what is now documented, not that documentation happened:

```
docs(068): document the bases cohort and the eval-template caps
```

not `docs: add docs`. The body leads with the WHY, names the PR
(`Documents PR #83 ...`), says which reviewer point a page now carries where
review changed the picture, and ends with the `Co-Authored-By` trailer for
the session's model.

If the PR genuinely warranted no documentation change, **make no commit** and
say so in the report. That is a conclusion reached after Step 4, not a
shortcut around it — and a toolchain change is not on that list unless
`tech-stack.md`'s third column would be unchanged.

## Step 6 — Push into the same PR

```
git push
```

Pushes to `main`-bound PRs are governed by the `protect-main` ruleset
(`gh api repos/{owner}/{repo}/rulesets`). As configured on 2026-10-24:
`dismiss_stale_reviews_on_push` and `required_review_thread_resolution` are
off and `required_approving_review_count` is `0`, so this push does not
dismiss an approval or add a merge blocker. CI (`.github/workflows/ci.yml`,
lint / typecheck / test / build on Node 22 and 24) re-runs on the new tip.
Re-read the ruleset if the report needs to rely on any of that — the
configuration can change and this paragraph will not.

Never force-push. If the push is rejected because the remote moved,
`git pull --rebase`, confirm the diff you documented is still the diff on the
branch, and push again. If a ruleset rejected it, report it and stop — the
commit is safe locally.

## Step 7 — Point the PR at the documentation

Append (or extend, if it exists) a `## Documentation` section in the PR body,
one line per page with a one-clause reason:

```markdown
## Documentation

- `.docs-as-code/capabilities/bases.md` — updated: `views_base` now shares
  the eval-template path with `query_base`.
- `.docs-as-code/decisions/ADR-033-<slug>.md` — new, records why … and what
  that closed off.
- `docs/tools/views_base.md` — corrected: the error roster now includes …
```

Place it **above** the trailing `🤖 Generated with …` line if there is one.
Write the full new body to a file in the session scratchpad and pass
`gh pr edit <n> --body-file <path>` — quoting a multi-line Markdown body
inline through PowerShell or Bash is where this step goes wrong.

Do not rewrite the rest of the body, including the Constitution Compliance
table. It survived review; this skill adds a section and leaves everything
else as the reviewers left it.

## Step 8 — Return, report

1. **Return.** `git switch <original branch from Step 0.3>`. If that was the
   PR's own branch, stay put and say nothing.

2. **Report in one chat line:**

   ```
   PR #<n> (<state>, <head> -> <base>): docs committed <sha> and pushed. Pages: <list>. CI re-running.
   ```

   Add a second line only for something the user must act on:

   - the PR body and the diff disagreed, and the pages follow the diff;
   - a user-visible change has no CHANGELOG entry;
   - a new ADR supersedes one in `.decisions/`, which needs its log entry;
   - review raised a caveat no page could carry, and why;
   - nothing warranted documentation, and the reasoning;
   - a test, a ruleset or a force-push stopped the run.

## Repository mode

No PR number. The input is the repository as it stands on the current branch,
not a PR. It commits on the current branch and **does not push or open a
PR** — the user decides how the commit travels (its own PR, or riding with the
branch it was run on).

If the current branch is `main`, stop with
`On main — cut a branch first (e.g. docs/baseline-<date>), then re-run.`
The `protect-main` ruleset requires a pull request for every change to
`main`, and a docs baseline is reviewed like any other change.

### Baseline (no `.docs-as-code/` yet)

Survey the whole solution, then write the tree once:

1. **Read the rules and the intent.** `.specify/memory/constitution.md`, the
   current plan named in `CLAUDE.md`, `CONTRIBUTING.md`, `README.md`,
   `CHANGELOG.md`, and `docs/tools/index.md`. If `.decisions/` and
   `.architecture/` exist on this machine, read them as the record of intent
   — but the pages describe what the code does, and where intent and code
   disagree, the code wins and the gap goes in the report.
2. **Read the structure.** Use CodeGraph (`codegraph_explore`) for the spines
   and kernel nodes named in CLAUDE.md's *Validated architectural facts*, the
   tool pipelines, and the error model. Confirm against the source before
   writing anything down.
3. **Read the history that explains the shape.** `git log --merges` on
   `main`, and the bodies of the PRs that introduced each pipeline and each
   cohort (`gh pr view <n>`). Cite them inline.
4. **Write**: `README.md`, `architecture.md`, `tech-stack.md`, one
   `capabilities/<cohort>.md` per README Tool-inventory group, and
   `decisions/` **only** for decisions that are visible in the tracked history
   (spec Clarifications, PR bodies, commit bodies) and not already an ADR in
   the series. A baseline is not the place to re-record ADR-001 to ADR-032;
   cite them.
5. **Link the tree in.** Add one line for `.docs-as-code/` to `README.md` so
   the tree is discoverable from the repository's front page. (`CLAUDE.md`
   already describes it under *Pull Request Lifecycle and Docs-as-Code*; do
   not add it inside the `SPECKIT START`/`END` block, which `/speckit-plan`
   regenerates.)
6. **Commit** as `docs(docs-as-code): baseline the living documentation from
   the system as built`, body naming the commit SHA of `main` the survey
   described.

### Audit (`.docs-as-code/` exists)

Find drift between the pages and the code since the baseline, and extend:

1. Find the last commit that touched `.docs-as-code/`
   (`git log -1 --format=%H -- .docs-as-code`) and list the merged PRs since
   (`git log --merges <sha>..HEAD`).
2. For each, run Steps 2 and 4 against `gh pr diff <n>` — as if it had been
   documented at the time — skipping PRs whose change the pages already carry.
3. Then check every page against the current code for claims that are no
   longer true, regardless of which PR made them false.
4. Commit as `docs(docs-as-code): document <what> since <short-sha>`, body
   listing the PRs caught up and any claims corrected.

Repository mode runs Step 5's verification and reports:

```
<Baseline|Audit> on <branch>: docs committed <sha>, not pushed. Pages: <list>.
```

## What this skill does NOT do

- Does NOT review the code or run the merge gates. That happened before this
  skill was invoked. It documents; it does not re-litigate.
- Does NOT change product code, tests, `scripts/` or configuration. Only
  `.docs-as-code/`, `docs/tools/**`, `README.md` and `CONTRIBUTING.md`.
- Does NOT write `CHANGELOG.md`. It flags missing entries.
- Does NOT edit `specs/`, `.specify/memory/`, `.decisions/`, `.architecture/`
  or `.memory/`.
- Does NOT rewrite the PR body outside its `## Documentation` section.
- Does NOT echo diffs, `git status`, review comments, or page contents into
  chat.
- Does NOT pause for approval of the pages. The invocation IS the approval.
- Does NOT merge, approve, re-request review, or enable auto-merge.
- Does NOT push or open a PR in repository mode.
- Does NOT commit the user's uncommitted work, stash it, or force-push.
- Does NOT use `git add .` or `--no-verify`.

## Graceful degradation

- **PR already `MERGED` or `CLOSED`** — the branch will not take another
  commit through the PR. Do Steps 2 and 4 against `gh pr diff <n>` (which
  still works after merge), then cut `docs/pr-<n>-<slug>` from the PR's
  **base** branch, commit there, push, and open a second PR into that base
  titled `docs: document <what> from PR #<n>`. Say clearly in the report that
  the documentation is landing separately and why.
- **`gh` missing or unauthenticated in PR mode** — stop. Repository mode still
  works for the baseline; an audit without `gh` falls back to commit bodies
  and says so.
- **PR number does not exist, or is in another repository** — report what `gh`
  said and stop.
- **Branch was force-pushed since the read** — stop, as in Step 3.
- **`.docs-as-code/` missing in PR mode** — stop, as in Step 1.3.
- **`.decisions/` missing on this machine** — carry on. Number ADRs from the
  tracked sources and say so in the report.
- **PR touches only `specs/`, `.specify/`, or `.claude/`** — usually nothing
  to document; those trees are records, rules and tooling, not the system.
  Report that conclusion rather than manufacturing a page.
- **PR touches only `package.json`, `package-lock.json`, `tsconfig*.json`,
  `eslint.config.js`, `vitest.config.ts` or `.github/workflows/`** — not an
  excuse to skip. Check `tech-stack.md` first. A bump within a major with
  nothing the third column would change is a legitimate no-op; a new
  dependency, a removed one, a major bump, a new hold or a moved coverage
  threshold is not.
- **`npm test` fails after a `docs/tools/` edit** — the edit broke an
  assertion. Fix the doc; if the assertion itself is wrong, report it and
  leave the doc unchanged rather than editing a test.
- **Fork PR with no push access to the head branch** — the push in Step 6 will
  be rejected. Fall back to the `docs/pr-<n>-<slug>` branch described above.
