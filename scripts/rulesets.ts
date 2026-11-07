// Original — no upstream. The repository's branch protection as code (ADR-081 clause 9). `apply` makes the live GitHub
// rulesets match the files in .github/rulesets/ (matched by name: updated in place, created when missing) and sets the
// repository settings the branching model needs: merge commits only, head branches deleted on merge, Actions allowed to
// open pull requests (the release workflow's close-out pull request), and the `npm` environment limited to `main`. It is
// idempotent. `check` is the scheduled drift check: it compares the live rulesets with the files and exits 1 on any
// difference, including a live ruleset with no file. Both talk to GitHub through the `gh` CLI, so they use gh's login on
// a PC and GH_TOKEN in Actions.
//
//   node scripts/rulesets.ts apply
//   node scripts/rulesets.ts check
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Rule = { type: string; parameters?: Record<string, Json> };
type Ruleset = {
  id?: number;
  name: string;
  target: string;
  enforcement: string;
  conditions: Json;
  bypass_actors?: Json[];
  rules: Rule[];
};

const RULESETS_DIR = join(import.meta.dirname, "..", ".github", "rulesets");

function gh(args: string[], input?: unknown): Json {
  const out = execFileSync(
    "gh",
    ["api", ...args, ...(input === undefined ? [] : ["--input", "-"])],
    {
      encoding: "utf8",
      input: input === undefined ? undefined : JSON.stringify(input),
      stdio: ["pipe", "pipe", "inherit"],
    },
  );
  return out.trim() === "" ? null : (JSON.parse(out) as Json);
}

function repository(): string {
  return (
    process.env.GITHUB_REPOSITORY ??
    execFileSync("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
      encoding: "utf8",
    }).trim()
  );
}

function fileRulesets(): Ruleset[] {
  return readdirSync(RULESETS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(RULESETS_DIR, f), "utf8")) as Ruleset);
}

function liveRulesets(repo: string): Ruleset[] {
  const list = gh([`repos/${repo}/rulesets?includes_parents=false&per_page=100`]) as unknown as {
    id: number;
  }[];
  return list.map((r) => gh([`repos/${repo}/rulesets/${r.id}`]) as unknown as Ruleset);
}

// Key-sorted JSON with arrays sorted too: none of the ruleset arrays this repository uses is ordered.
function canonical(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k]!)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// Differences between a ruleset file and its live copy. A rule's parameters are compared key by key for the keys the
// file names, so a parameter GitHub adds with a default later does not read as drift; the files name every parameter
// the model depends on.
function differences(file: Ruleset, live: Ruleset): string[] {
  const found: string[] = [];
  for (const key of ["target", "enforcement", "conditions"] as const) {
    if (canonical(file[key]) !== canonical(live[key])) found.push(`${key} differs`);
  }
  if (live.bypass_actors === undefined) {
    found.push("bypass_actors not readable (the token needs administration read access)");
  } else if (canonical(file.bypass_actors ?? []) !== canonical(live.bypass_actors)) {
    found.push("bypass_actors differ");
  }
  const liveRules = new Map(live.rules.map((r) => [r.type, r]));
  const fileTypes = new Set(file.rules.map((r) => r.type));
  for (const type of liveRules.keys())
    if (!fileTypes.has(type)) found.push(`live rule ${type} is not in the file`);
  for (const rule of file.rules) {
    const liveRule = liveRules.get(rule.type);
    if (liveRule === undefined) {
      found.push(`rule ${rule.type} is missing`);
      continue;
    }
    for (const [param, value] of Object.entries(rule.parameters ?? {})) {
      if (canonical(value) !== canonical(liveRule.parameters?.[param] ?? null)) {
        found.push(`rule ${rule.type}: ${param} differs`);
      }
    }
  }
  return found;
}

function check(repo: string): number {
  const files = fileRulesets();
  const live = new Map(liveRulesets(repo).map((r) => [r.name, r]));
  let drift = 0;
  for (const file of files) {
    const liveRuleset = live.get(file.name);
    live.delete(file.name);
    const found = liveRuleset === undefined ? ["not applied"] : differences(file, liveRuleset);
    for (const line of found) console.log(`DRIFT ${file.name}: ${line}`);
    if (found.length === 0) console.log(`OK    ${file.name}`);
    drift += found.length;
  }
  for (const name of live.keys()) {
    console.log(`DRIFT ${name}: live ruleset has no file in .github/rulesets/`);
    drift += 1;
  }
  return drift === 0 ? 0 : 1;
}

function apply(repo: string): number {
  const live = new Map(liveRulesets(repo).map((r) => [r.name, r]));
  for (const file of fileRulesets()) {
    const existing = live.get(file.name);
    if (existing === undefined) {
      gh(["-X", "POST", `repos/${repo}/rulesets`], file);
      console.log(`created ${file.name}`);
    } else {
      gh(["-X", "PUT", `repos/${repo}/rulesets/${existing.id}`], file);
      console.log(`updated ${file.name}`);
    }
  }

  gh(["-X", "PATCH", `repos/${repo}`], {
    allow_merge_commit: true,
    allow_squash_merge: false,
    allow_rebase_merge: false,
    delete_branch_on_merge: true,
  });
  console.log("set merge commits only and delete-branch-on-merge");

  gh(["-X", "PUT", `repos/${repo}/actions/permissions/workflow`], {
    default_workflow_permissions: "read",
    can_approve_pull_request_reviews: true,
  });
  console.log("allowed GitHub Actions to open pull requests");

  gh(["-X", "PUT", `repos/${repo}/environments/npm`], {
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
  });
  const policies = gh([`repos/${repo}/environments/npm/deployment-branch-policies`]) as unknown as {
    branch_policies: { name: string; type?: string }[];
  };
  if (!policies.branch_policies.some((p) => p.name === "main" && p.type !== "tag")) {
    gh(["-X", "POST", `repos/${repo}/environments/npm/deployment-branch-policies`], {
      name: "main",
      type: "branch",
    });
  }
  console.log("environment npm deploys from main only");
  return 0;
}

const command = process.argv[2];
if (command === "apply") process.exitCode = apply(repository());
else if (command === "check") process.exitCode = check(repository());
else {
  console.error("usage: node scripts/rulesets.ts apply|check");
  process.exitCode = 2;
}
