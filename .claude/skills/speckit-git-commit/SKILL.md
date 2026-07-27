---
name: speckit-git-commit
description: Commit-on-invocation flow — invocation IS consent; draft a conventional message and commit directly. User reviews in git graph and asks for amend if needed.
compatibility: Requires spec-kit project structure with .specify/ directory and a CONTRIBUTING.md describing the project's commit-message convention
metadata:
  author: marwansaab (forked from github-spec-kit)
  source: rewritten 2026-05-04 to commit-on-invocation form (no draft files, no approval handshake)
---

# /speckit-git-commit (commit-on-invocation)

When the user invokes `/speckit-git-commit`, treat it as **full consent**.
The user has already reviewed the diff in VS Code's source control panel
before invoking this command. Do not draft to files. Do not ask for
approval. Do not echo diffs or message bodies into chat. Commit directly,
report the resulting SHAs in a single chat line, and stop. The user
reviews the message in their git graph; if they want to revise, they say
"amend the last commit / commit X" and you respond with `git commit --amend`
(or `git rebase -i` for older commits — but only on local-only branches;
warn first if the target commit has been pushed).

This skill **does not** call
`.specify/extensions/git/scripts/{bash,powershell}/auto-commit.{sh,ps1}` —
those scripts produce template-only single-line messages that don't
satisfy the project's commit-message convention. Use the `git` CLI
directly so staging is selective and messages follow `CONTRIBUTING.md`.

## Steps

1. **Inspect state silently.** `git status --short` to see uncommitted
   state. If working tree is clean, report `Working tree clean, nothing
   to commit.` in one line and stop. Do NOT echo `git status`,
   `git diff`, or `git diff --stat` output to chat — the user reads
   diffs in VS Code's SCM panel.

2. **Read active feature** from `.specify/feature.json` and extract the
   basename of `feature_directory` (e.g.
   `specs/002-detect-cli-errors` → `002-detect-cli-errors`). This is
   the `{feature}` placeholder value.

3. **Group changed files into logical commits** per CONTRIBUTING.md's
   scope-honesty principle. Do NOT bundle unrelated concerns. Common cuts:
   - Spec content (`specs/NNN/**`) is its own commit.
   - Tooling/config (`.specify/extensions/**`, `.claude/skills/**`,
     `vitest.config.ts`, `tsconfig*.json`, `package.json`) — one commit
     per logical change.
   - Source + tests (`src/**`) for one feature land together.
   - Docs (`README.md`, `CONTRIBUTING.md`, `*.md` outside `specs/`) are
     usually their own commits.
   Default to one commit only when everything genuinely belongs together.
   You decide the boundaries; the user's invocation is consent for the
   boundaries you choose. If the user later sees the result in the graph
   and disagrees, they'll tell you to re-shape (which is fine — local
   branch, reversible).

4. **For each commit, draft and commit directly:**
   - **Pick the type+scope** per CONTRIBUTING.md based on the changed
     files. Examples: new `specs/NNN/spec.md` → `feat(NNN): scaffold
     specification`; new `specs/NNN/plan.md` → `docs(NNN): generate
     implementation plan`; `.specify/extensions/**` change →
     `chore(git-extension)` or `feat(git-extension)`;
     `.claude/skills/**` change → `chore(claude-skills)`; `src/**` +
     tests for an FR → `feat(NNN)` with task IDs in the subject's
     parenthetical or body.
   - **Look up a subject seed** in
     `.specify/extensions/git/git-config.yml` `auto_commit.<event>.message`
     when an event keyword fits the diff. Substitute `{feature}`.
     Otherwise draft the subject directly per CONTRIBUTING.md.
   - **Draft the body** per CONTRIBUTING.md: WHY paragraph, itemised
     detail with SHOUTY-CAPS prefixes when grouping, FR-NNN / SC-NNN /
     TNNN / RNN / PR #NN / short-SHA references in native form,
     explicit deferrals and gates, quality-gate results when code
     changed, and the
     `Co-Authored-By: Claude <model> <noreply@anthropic.com>` trailer.
   - **Bodies are mandatory** for `feat`, spec, and analyzer-remediation
     commits. Tiny one-line `fix`/`chore` may skip the body but keep
     the `type(scope): subject` form.
   - **Commit:**
     ```
     git add <file1> <file2> ...
     git commit -m "$(cat <<'EOF'
     <subject>

     <body>

     Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
     EOF
     )"
     ```
     Use heredoc for multi-line bodies. Never `git add .` — selective
     staging keeps scope honesty enforceable.

5. **Report results in one chat line.** Format:
   - Single commit: `Committed: <sha> <subject>. Tree clean.`
   - Multi-commit: `Committed: <sha1> <subject1> | <sha2> <subject2>. Tree clean.`
   - If anything failed (hook rejection, merge conflict, etc.):
     surface the error briefly and the recovery path.

   The subject line(s) appear in chat — one short line per commit, no
   bodies, no diffs. The user reads the body in their git graph.

6. **If the user asks to amend afterwards** (e.g. "amend the last
   commit's body to mention X", "rewrite the subject of commit <sha>"):
   - For the most recent commit: `git commit --amend -m "$(...)"`
     with the revised message.
   - For older commits on a local-only branch: `git rebase -i <base>`
     and reword (or use `git commit --fixup` then autosquash). Verify
     the branch is unpushed first via `git rev-parse --abbrev-ref
     --symbolic-full-name '@{u}'`.
   - If the branch IS pushed: warn before force-pushing. A force-push
     on a shared branch needs explicit user confirmation.

## What this skill explicitly does NOT do

- Does NOT echo `git diff` / `git status` / message bodies to chat.
  The user reads diffs in VS Code's SCM panel and the resulting commit
  message in their git graph.
- Does NOT pause for approval. The slash-command invocation IS the
  approval. Asking again is friction the user has explicitly rejected.
- Does NOT write drafts to `.git/COMMIT_EDITMSG` or
  `.git/SPECKIT_DRAFT_<N>.txt`. Commit directly via `git commit -m`.
- Does NOT run `auto-commit.{sh,ps1}`. Those scripts remain in the repo
  as a fallback executor; nobody calls them in the normal flow.
- Does NOT auto-fire on `before_*` / `after_*` Spec Kit hook prompts.
  Hooks marked `optional: true` in `.specify/extensions.yml` surface
  a prompt only; the actual commit happens only when the user types
  `/speckit-git-commit`.
- Does NOT use `git add .`. Selective staging only.

## Graceful degradation

- If git is not available or the directory is not a repo: warn and stop.
- If `.specify/feature.json` is missing or unparseable: substitute
  `{feature}` with `unknown` in subjects and note the absence in the
  body of the affected commit so the user sees it in the graph.
- If there are no uncommitted changes: report `Working tree clean,
  nothing to commit.` and stop.
- If `git commit` is rejected (pre-commit hook, sign-off requirement,
  etc.): surface the error and the underlying cause. Do not bypass
  hooks (`--no-verify`) without explicit user instruction.
