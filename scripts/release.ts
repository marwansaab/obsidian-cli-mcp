// Original — no upstream. The CHANGELOG.md and version steps of the release workflows (ADR-081 clauses 5 and 6).
//
//   node scripts/release.ts cut <x.y.z> <YYYY-MM-DD>  rename `## [Unreleased]` to `## [x.y.z] - date` under a fresh
//                                                     empty `## [Unreleased]`, and point the link references at it
//   node scripts/release.ts check                     fail unless package.json's version is greater than npm's
//                                                     `latest` and CHANGELOG.md has a dated section for it
//   node scripts/release.ts notes <x.y.z>             print that version's CHANGELOG.md section (the Release notes)
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
  return new RegExp(`^## \\[${escape(version)}\\] - \\d{4}-\\d{2}-\\d{2}$`, "m");
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
  if (!/^## \[Unreleased\]$/m.test(text)) fail("CHANGELOG.md has no `## [Unreleased]` heading");
  const base = "https://github.com/marwansaab/obsidian-cli-mcp";
  const next = text
    .replace(/^## \[Unreleased\]$/m, `## [Unreleased]\n\n## [${version}] - ${date}`)
    .replace(
      /^\[Unreleased\]: .*$/m,
      `[Unreleased]: ${base}/compare/v${version}...HEAD\n[${version}]: ${base}/releases/tag/v${version}`,
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

async function check(): Promise<void> {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    name: string;
    version: string;
  };
  const version = readVersion(pkg.version);
  const response = await fetch(`https://registry.npmjs.org/-/package/${pkg.name}/dist-tags`);
  if (!response.ok) fail(`npm registry answered ${response.status} for ${pkg.name}'s dist-tags`);
  const latest = ((await response.json()) as { latest?: string }).latest;
  if (latest === undefined) fail(`npm has no latest tag for ${pkg.name}`);
  if (compare(version, latest) <= 0)
    fail(`package.json version ${version} is not greater than npm latest ${latest}`);
  if (notes(version) === "") fail(`CHANGELOG.md's section for ${version} is empty`);
  console.log(`version ${version} > npm latest ${latest}; CHANGELOG.md has its section`);
}

const [command, a, b] = process.argv.slice(2);
if (command === "cut") cut(readVersion(a), b ?? "");
else if (command === "notes") console.log(notes(readVersion(a)));
else if (command === "check") await check();
else fail("usage: node scripts/release.ts cut <x.y.z> <YYYY-MM-DD> | check | notes <x.y.z>");
