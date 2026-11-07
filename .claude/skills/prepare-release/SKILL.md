---
name: prepare-release
description: Prepare, ship and close out an npm release of obsidian-cli-mcp under ADR-081. It cuts release/x.y.z (or hotfix/x.y.z), opens the pull request into main, hands UAT and the merge to the owner, watches the Release workflow and npm, and checks the back-merge pull request's CI. Use whenever the owner asks to prepare, cut, ship or publish a release or a hotfix, or to "release x.y.z".
metadata:
  author: marwansaab
  source: written 2026-11-08 from the 0.9.1 release (PRs #160 to #163), the first under ADR-081.
user-invocable: true
disable-model-invocation: false
---

# /prepare-release

This skill is the agent's checklist for one release. The human-facing description of the same flow is `CONTRIBUTING.md` § *Branches and releases*, and `.docs-as-code/tech-stack.md` explains why each workflow is built the way it is. Read both before the first release in a session; do not copy them into chat.

**Rules that hold throughout:**

- The agent never merges anything, whether into `main`, `develop` or a release branch. The owner merges, always with a merge commit (ADR-081 clauses 4 and 9).
- The agent never pushes to `main`, `develop`, `release/*` or `hotfix/*`. Fixes travel by pull request.
- UAT is the owner's. The agent may prepare the local build, but it does not declare UAT passed.
- Stop and ask the owner when a step fails in a way this file does not cover.

## 1. Decide the version

1. Run `git fetch origin`, then read `CHANGELOG.md`'s `[Unreleased]` section on `origin/develop` (for a hotfix, read `origin/main`).
2. Propose the version to the owner, with one line of reasoning per category. Before 1.0, a MINOR bump marks a breaking change, a PATCH bump carries only fixes, and an added tool is MINOR. Confirm the version and the kind (`release` or `hotfix`) before cutting. Refuse to cut from an empty `[Unreleased]`: say so and stop.
3. Check that npm's `latest` (`curl -s https://registry.npmjs.org/-/package/@marwansaab/obsidian-cli-mcp/dist-tags`) is below the proposed version and that no `release/*` branch is still open (`git ls-remote --heads origin 'release/*'`).

## 2. Cut the branch

1. Start the cut:
   ```
   gh workflow run release-cut.yml --ref develop -f version=<x.y.z> -f kind=<release|hotfix>
   ```
2. Watch the run with `gh run watch <id> --exit-status`. A run started by anyone but the repository owner fails by design.
3. Check the result. `git log --oneline -2 origin/<kind>/<x.y.z>` shows one commit, `chore(release): bump to <x.y.z>`, on top of the base. Its diff touches only `package.json`, `package-lock.json` and `CHANGELOG.md`, and the section heading reads `[<x.y.z>] - YYYY-MM-DD` (UTC) under an empty `[Unreleased]`.

## 3. Open the pull request into `main`

1. Open the pull request `gh pr create --base main --head <kind>/<x.y.z>` with a body that holds:
   - the template line naming every `BI-NNNN` in the section;
   - the section's entries, one line each;
   - a *Before merging: UAT* list: run `git switch <kind>/<x.y.z>`, then `npm ci` and `npm run build`, register the build as `obsidian-cli-mcp-local`, run the test-case sweep against the test vault, run the `CONTRIBUTING.md` release checks, and add an owner-input regression when the release changes what clients see;
   - the attribution line.
   PR #160 is the model.
2. Wait for the checks. Six are required: the four `Lint / Typecheck / Test / Build (…)` jobs, *Source branch* and *Version and changelog*. Report `gh pr checks <n>` and `mergeStateStatus` (it should read `CLEAN`).
3. Hand over. Tell the owner that UAT and the merge are theirs. A fix found in UAT goes in as a work branch cut from the release branch, with its pull request into it and its entry in the `[<x.y.z>]` section. It is carried back to `develop` through a branch cut from the release branch, never by a pull request straight from `release/<x.y.z>` (delete-on-merge would remove the release branch).

## 4. Watch the publication

When the owner says the pull request is merged:

1. Find the Release run for the merge commit: `gh run list --workflow release.yml --branch main`, matched on `headSha`. Watch it.
2. **If *Publish to npm* failed**, read `gh run view <id> --log-failed`:
   - `E403 … OIDC permission denied for this action`: the npm trusted-publisher entry is wrong. On the package's npm settings page, it must name `marwansaab/obsidian-cli-mcp`, `release.yml` and the environment `npm`, with **Allow npm publish** ticked. The owner fixes it on npmjs.com.
   - In every case: no tag and no Release exist yet. After the cause is fixed, run `gh run rerun <id> --failed`, never a full re-run.
3. **If a later step of the release job failed**, run `gh run rerun <id> --failed`. Each step skips what an earlier attempt already did.
4. **Check npm.** Poll the dist-tags URL from step 1.3 about every 30 seconds, for up to 10 minutes, in the background. npm shows the version as *Validating* while its automated review runs, and `latest` moves only when the review ends (a few minutes for 0.9.1). If it is still not `latest` after that, ask the owner what the package page on npmjs.com shows.
5. **Check the tag and the Release.** Run `git ls-remote --tags origin v<x.y.z>` and `gh release view v<x.y.z>`. The notes must be the version's changelog section.

## 5. Back-merge checks

The Release workflow opens `chore(release): merge v<x.y.z> back into develop`, a pull request from `main` into `develop`. As of PR #162, its required checks are expected to come from CI's push run on the merge commit. 0.9.1 predates that change, so the first release after PR #162 is the first to prove it. Until a release has proved it, report the outcome to the owner explicitly.

1. Find the pull request: `gh pr list --base develop --head main`.
2. Find the push run: `gh run list --workflow ci.yml --branch main --event push`, matched on the merge commit's SHA. Wait for it to finish.
3. Read `gh pr checks <n>` and `gh pr view <n> --json mergeStateStatus`.
4. Decide:
   - **The four CI checks are listed and green, and the state is `CLEAN`.** The push-run fix works. Tell the owner the pull request is ready to merge with a merge commit. A *workflow awaiting approval* notice on it is expected and the owner can ignore it: that is the `pull_request` run the workflow token's pull request starts, and it is not needed. Then remove the "expected" hedge from `CONTRIBUTING.md` step 5 and `.docs-as-code/tech-stack.md` in a small pull request into `develop` that cites this release, and update this section to say it is proven.
   - **The CI checks are missing, or the state is `BLOCKED` although the push run passed.** The fix does not work. Ask the owner to click **Approve and run workflows** on the pull request; the agent cannot approve runs (the permission check refuses it). When those checks pass, the owner merges. Then report it as a defect: record which runs exist on the SHA (`gh api repos/marwansaab/obsidian-cli-mcp/commits/<sha>/check-suites`) and what the PR's `statusCheckRollup` lists, and propose a fix in its own pull request.
   - **This is a hotfix cut from a `main` that predates PR #162** (its `ci.yml` has no `main` under `push`). Expect the second case, and use the same approval fallback.
5. If CI fails on the pull request itself, stop and report it. Do not merge around it.

## 6. Close out

1. After the owner merges the back-merge pull request, run `git switch develop` and `git pull --ff-only`.
2. If any other `release/*` branch is open (normally none is), say that the release needs merging into it too.
3. Report in a few lines:
   - the version;
   - the npm `latest`;
   - the tag and the Release link;
   - the pull request numbers;
   - the BIs the release carries, for the vault's `status: shipped` and `npm_version_shipped` (ADR-081 clause 8; a My-Setup session sets them, not this repository);
   - anything that needed the owner's hand.
