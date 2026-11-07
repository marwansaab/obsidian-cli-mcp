// Original — no upstream. The CHANGELOG.md and version steps of the release workflows (ADR-081 clauses 5 and 6).
//
//   node scripts/release.ts cut <x.y.z> <YYYY-MM-DD>  rename `## [Unreleased]` to `## [x.y.z] - date` under a fresh
//                                                     empty `## [Unreleased]`, and point the link references at it
//   node scripts/release.ts check                     fail unless package.json's version is greater than npm's
//                                                     `latest` and CHANGELOG.md has a dated section for it that
//                                                     names a BI of every merged pull request needing an entry
//   node scripts/release.ts notes <x.y.z>             print that version's CHANGELOG.md section (the Release notes)
//   node scripts/release.ts entry <pr-number>         fail unless the pull request adds a CHANGELOG.md line naming
//                                                     one of its BIs, when it needs an entry (see needsEntry)
//
// `check` and `entry` read pull requests through the `gh` CLI (gh's login on a PC, GH_TOKEN in Actions). `check`
// compares BASE_REF (default `main`) with HEAD_SHA (default the checked-out commit) to find the release's pull
// requests.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const CHANGELOG = join(ROOT, "CHANGELOG.md");
const VERSION = /^\d+\.\d+\.\d+$/;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function readVersion(arg: string | undefined): string {
  if (arg === undefined || !VERSION.test(arg))
    fail(`expected a version x.y.z, got ${JSON.stringify(arg)}`);
  return arg;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sectionHeading(version: string): RegExp {
  return new RegExp(`^## \\[${escape(version)}\\] - \\d{4}-\\d{2}-\\d{2}\\r?$`, "m");
}

function compare(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i]! - pb[i]!;
  return 0;
}

function cut(version: string, date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    fail(`expected a date YYYY-MM-DD, got ${JSON.stringify(date)}`);
  const text = readFileSync(CHANGELOG, "utf8");
  if (sectionHeading(version).test(text)) fail(`CHANGELOG.md already has a section for ${version}`);
  if (!/^## \[Unreleased\]\r?$/m.test(text)) fail("CHANGELOG.md has no `## [Unreleased]` heading");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const base = "https://github.com/marwansaab/obsidian-cli-mcp";
  const next = text
    .replace(/^## \[Unreleased\](?=\r?$)/m, `## [Unreleased]${eol}${eol}## [${version}] - ${date}`)
    .replace(
      /^\[Unreleased\]: [^\r\n]*/m,
      `[Unreleased]: ${base}/compare/v${version}...HEAD${eol}[${version}]: ${base}/releases/tag/v${version}`,
    );
  writeFileSync(CHANGELOG, next);
}

function notes(version: string): string {
  const text = readFileSync(CHANGELOG, "utf8");
  const heading = sectionHeading(version).exec(text);
  if (heading === null) fail(`CHANGELOG.md has no dated section for ${version}`);
  const start = heading.index + heading[0].length;
  const rest = text.slice(start);
  const end = rest.search(/^## \[|^\[[^\]]+\]: /m);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

// === Changelog entries per pull request (the guard against a merged fix with no entry) ===

const NO_CHANGELOG_LABEL = "no-changelog";

type PullRequest = {
  number: number;
  headRef: string;
  body: string;
  labels: string[];
  files: Array<{ filename: string; patch?: string }>;
};

function gh(args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

function repository(): string {
  return (
    process.env.GITHUB_REPOSITORY ??
    gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]).trim()
  );
}

function fetchPullRequest(repo: string, number: number): PullRequest {
  const pr = JSON.parse(gh(["api", `repos/${repo}/pulls/${number}`])) as {
    head: { ref: string };
    body: string | null;
    labels: Array<{ name: string }>;
  };
  // --paginate prints one JSON array per page; --jq flattens them to one file per line.
  const files = gh([
    "api",
    "--paginate",
    `repos/${repo}/pulls/${number}/files?per_page=100`,
    "--jq",
    ".[] | {filename, patch} | tojson",
  ])
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as { filename: string; patch: string | null })
    .map(({ filename, patch }) => (patch === null ? { filename } : { filename, patch }));
  return {
    number,
    headRef: pr.head.ref,
    body: pr.body ?? "",
    labels: pr.labels.map((l) => l.name),
    files,
  };
}

/** The BI ids a pull request names: `bi-NNNN` in its branch, `BI-NNNN` in its body. */
function biIds(pr: PullRequest): string[] {
  const ids = new Set<string>();
  for (const m of `${pr.headRef}\n${pr.body}`.matchAll(/\bbi-(\d{4})\b/gi)) ids.add(`BI-${m[1]}`);
  return [...ids].sort();
}

/**
 * A pull request needs a changelog entry when it changes `src/**` or comes from a `fix/bi-*` or `feat/*` branch,
 * unless it carries the `no-changelog` label or is the release workflow's back-merge from `main`.
 */
function needsEntry(pr: PullRequest): boolean {
  if (pr.labels.includes(NO_CHANGELOG_LABEL) || pr.headRef === "main") return false;
  return (
    /^(fix\/bi-|feat\/)/i.test(pr.headRef) || pr.files.some((f) => f.filename.startsWith("src/"))
  );
}

function namesOneOf(text: string, ids: string[]): boolean {
  const upper = text.toUpperCase();
  return ids.some((id) => upper.includes(id));
}

/** Why the pull request fails the entry check, or null when it passes. */
function entryProblem(pr: PullRequest): string | null {
  if (!needsEntry(pr)) return null;
  const ids = biIds(pr);
  if (ids.length === 0)
    return `#${pr.number} needs a CHANGELOG.md entry but names no BI-NNNN in its branch or body`;
  const changelog = pr.files.find((f) => f.filename === "CHANGELOG.md");
  if (changelog === undefined)
    return `#${pr.number} changes no CHANGELOG.md; add an entry naming ${ids.join(" or ")} under [Unreleased], or label it ${NO_CHANGELOG_LABEL}`;
  if (changelog.patch === undefined)
    return `#${pr.number}: GitHub sent no diff for CHANGELOG.md, so its entry cannot be checked`;
  const added = changelog.patch
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"));
  if (!added.some((line) => namesOneOf(line, ids)))
    return `#${pr.number}'s CHANGELOG.md change adds no line naming ${ids.join(" or ")}`;
  return null;
}

function entry(arg: string | undefined): void {
  if (arg === undefined || !/^\d+$/.test(arg))
    fail(`expected a pull request number, got ${JSON.stringify(arg)}`);
  const pr = fetchPullRequest(repository(), Number(arg));
  const problem = entryProblem(pr);
  if (problem !== null) fail(problem);
  console.log(
    needsEntry(pr)
      ? `#${pr.number} adds a CHANGELOG.md entry naming ${biIds(pr).join(" or ")}`
      : `#${pr.number} needs no CHANGELOG.md entry`,
  );
}

/** The pull requests merged between `base` and `head`, by number, read from GitHub's merge-commit subjects. */
function mergedPullRequests(repo: string, base: string, head: string): number[] {
  const subjects = gh([
    "api",
    "--paginate",
    `repos/${repo}/compare/${base}...${head}?per_page=100`,
    "--jq",
    '.commits[].commit.message | split("\\n")[0]',
  ]);
  const numbers = new Set<number>();
  for (const m of subjects.matchAll(/^Merge pull request #(\d+) from /gm))
    numbers.add(Number(m[1]));
  return [...numbers].sort((x, y) => x - y);
}

/** Every merged pull request that needs an entry and whose BIs the version's section does not name. */
function missingEntries(version: string): string[] {
  const repo = repository();
  const base = process.env.BASE_REF ?? "main";
  const head =
    process.env.HEAD_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const section = notes(version);
  const missing: string[] = [];
  for (const number of mergedPullRequests(repo, base, head)) {
    const pr = fetchPullRequest(repo, number);
    if (!needsEntry(pr)) continue;
    const ids = biIds(pr);
    if (ids.length === 0) missing.push(`#${number} (names no BI-NNNN)`);
    else if (!namesOneOf(section, ids)) missing.push(`#${number} (${ids.join(", ")})`);
  }
  return missing;
}

async function check(): Promise<void> {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    name: string;
    version: string;
  };
  const version = readVersion(pkg.version);
  const missing = missingEntries(version);
  if (missing.length > 0)
    fail(`CHANGELOG.md's section for ${version} names no BI of: ${missing.join("; ")}`);
  const response = await fetch(`https://registry.npmjs.org/-/package/${pkg.name}/dist-tags`);
  if (!response.ok) fail(`npm registry answered ${response.status} for ${pkg.name}'s dist-tags`);
  const latest = ((await response.json()) as { latest?: string }).latest;
  if (latest === undefined) fail(`npm has no latest tag for ${pkg.name}`);
  if (compare(version, latest) <= 0)
    fail(`package.json version ${version} is not greater than npm latest ${latest}`);
  if (notes(version) === "") fail(`CHANGELOG.md's section for ${version} is empty`);
  console.log(
    `version ${version} > npm latest ${latest}; CHANGELOG.md has its section, naming every merged pull request's BI`,
  );
}

const [command, a, b] = process.argv.slice(2);
if (command === "cut") cut(readVersion(a), b ?? "");
else if (command === "notes") console.log(notes(readVersion(a)));
else if (command === "check") await check();
else if (command === "entry") entry(a);
else
  fail(
    "usage: node scripts/release.ts cut <x.y.z> <YYYY-MM-DD> | check | notes <x.y.z> | entry <pr-number>",
  );
