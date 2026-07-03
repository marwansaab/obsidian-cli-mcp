# Quickstart: Verifying the Tech Stack Upgrade

**Feature**: `067-upgrade-tech-stack` | Increment gates in execution order.
All commands from repo root, PowerShell or bash. The reliable Windows coverage
invocation is used throughout (known `coverage/.tmp` race on cold runs):

```bash
mkdir -p coverage/.tmp && npx vitest run --coverage --pool=forks --no-file-parallelism
```

## US1 — Dependency baseline

```bash
npm audit                    # BEFORE: 8 vulns (5 moderate, 3 high)
npm update && npm audit fix
npm audit                    # AFTER: found 0 vulnerabilities  ← SC-001
git diff package.json        # audit fix itself changed NO direct deps (FR-001)
npm run lint && npm run typecheck && npm run build
# suite:
mkdir -p coverage/.tmp && npx vitest run --coverage --pool=forks --no-file-parallelism
npm ls prettier              # 3.8.5 — NOT 3.9.x (FR-003)
```

## US2 — TypeScript 6.0

```bash
npm ls typescript            # 6.0.3 (range ~6.0.3)
npm run typecheck            # clean — requires "types": ["node"] in tsconfig.json
npm run build                # dist/ layout unchanged (bin entry, .d.ts present)
npx tsc --noEmit 2>&1 | grep -i deprecat   # empty — zero deprecation warnings (FR-005)
```

## US3 — ESLint 10

```bash
npm ls eslint eslint-plugin-import-x eslint-plugin-n   # 10.6.0 / 4.17.1 / 18.2.1
npm ls eslint-plugin-import @typescript-eslint/eslint-plugin  # (empty) — removed
npm run lint                 # zero new violations (SC-007)
# rule-coverage probe (US3 acceptance 2): temporarily reorder two imports in any src file
#   → expect an import-x/order diagnostic; revert.
node --version               # dev machines: >= 22.13 (documented dev-only floor)
```

## US4 — zod 4 (the big one)

```bash
npm ls zod @modelcontextprotocol/sdk    # 4.4.3 / 1.29.0
npm ls zod-to-json-schema               # (empty) — removed (FR-008)
npm run typecheck && npm run build
# THE gate — fingerprint baseline, UNREGENERATED (FR-009/SC-003):
git diff --exit-code src/tools/_register-baseline.json   # no changes
npx vitest run src/tools/_register-baseline.test.ts      # green
# full suite incl. customIssueParams machine-code assertions (SC-004):
mkdir -p coverage/.tmp && npx vitest run --coverage --pool=forks --no-file-parallelism
# SC-009 deprecation gate active and clean:
npm run lint                 # no-deprecated + no-restricted-syntax/imports enabled, zero hits
grep -rn "zod-to-json-schema\|ZodTypeAny\|ZodIssueCode\|passthrough()" src/ # empty
grep -rn "required_error\|invalid_type_error" src/       # empty (M1 migrated)
```

Wire-level spot check (optional, in-process — no vault needed):
`npx vitest run src/tools/_register.test.ts` exercises tools/list + CallTool through
the SDK InMemoryTransport; descriptor and envelope assertions are the client's view.

## US5 — CI runtime

```bash
git grep -n "actions/checkout@v7\|actions/setup-node@v6" .github/workflows/ci.yml
git grep -n "node-version" .github/workflows/ci.yml      # matrix [22, 24]
# open the PR (pull_request trigger — a bare branch push does NOT run CI)
#   → both lanes green, zero runner-runtime deprecation warnings (SC-005)
```

## Feature-complete checklist (SC roll-up)

- [ ] SC-001 audit: 0 vulnerabilities
- [ ] SC-002 suite green at every increment boundary
- [ ] SC-003 baseline fingerprints pass, file unregenerated
- [ ] SC-004 custom messages + machine codes verbatim
- [ ] SC-005 CI green on both lanes, no runtime deprecation warnings
- [ ] SC-006 typescript ~6.0.3 / eslint ^10.6.0 / zod ^4.4.3; prettier deliberately 3.8.5
- [ ] SC-007 lint zero new violations
- [ ] SC-008 tools/list identical (baseline test = proxy; optional live client diff)
- [ ] SC-009 deprecation scan 0 (permanent lint gate active)
