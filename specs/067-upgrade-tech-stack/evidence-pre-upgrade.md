# Pre-Upgrade Evidence: Tech Stack Upgrade

**Feature**: `067-upgrade-tech-stack` | **Captured**: 2026-07-04 (T001)
**Purpose**: freeze the pre-upgrade baseline that increment PR bodies cite
(quickstart.md gates compare against this snapshot).

## Environment

- `node --version`: **v22.22.2** (satisfies engines `>=22.11` and the eslint-10
  dev-toolchain floor ≥22.13)
- Package version at capture: `@marwansaab/obsidian-cli-mcp@0.8.10`

## `npm audit` summary — 8 vulnerabilities (5 moderate, 3 high)

All eight report `fix available via npm audit fix`; none require a direct-dependency
change (FR-001 precondition confirmed).

| Vulnerable package | Severity | Advisories | Path note |
|---|---|---|---|
| brace-expansion 5.0.2–5.0.5 | moderate | GHSA-jxxr-4gwj-5jf2 (numeric-range DoS) | transitive |
| fast-uri ≤3.1.1 | high | GHSA-q3j6-qgpj-74h6, GHSA-v39h-62p7-jpjc (path traversal, host confusion) | transitive |
| hono ≤4.12.24 | high | 12 advisories incl. GHSA-qp7p-654g-cw7p, GHSA-hm8q-7f3q-5f36, GHSA-p77w-8qqv-26rm, GHSA-88fw-hqm2-52qc | transitive |
| ip-address ≤10.1.0 | moderate | GHSA-v2v4-37r5-5v8g (XSS in Address6) | transitive |
| express-rate-limit 8.0.1–8.5.0 | moderate | depends on vulnerable ip-address | transitive |
| js-yaml 4.0.0–4.1.1 | moderate | GHSA-h67p-54hq-rp68 (merge-key quadratic DoS) | transitive |
| qs 6.11.1–6.15.1 | moderate | GHSA-q8mj-m7cp-5q26 (stringify DoS) | transitive |
| vite 8.0.0–8.0.15 | high | GHSA-v6wh-96g9-6wx3, GHSA-fx2h-pf6j-xcff (NTLMv2 hash disclosure, fs.deny bypass) | transitive |

## `npm ls --depth=0` (installed resolutions before any pin change)

```text
@marwansaab/obsidian-cli-mcp@0.8.10 C:\Github\obsidian-cli-mcp
+-- @modelcontextprotocol/sdk@1.29.0
+-- @types/node@22.19.17
+-- @typescript-eslint/eslint-plugin@8.59.1
+-- @typescript-eslint/parser@8.59.1
+-- @vitest/coverage-v8@4.1.5
+-- eslint-config-prettier@10.1.8
+-- eslint-plugin-import@2.32.0
+-- eslint-plugin-jsonc@3.1.2
+-- eslint-plugin-n@17.24.0
+-- eslint-plugin-promise@7.3.0
+-- eslint@9.39.4
+-- jsonc-eslint-parser@3.1.0
+-- prettier@3.8.3
+-- typescript-eslint@8.59.1
+-- typescript@5.9.3
+-- vitest@4.1.5
+-- zod-to-json-schema@3.25.2
`-- zod@3.25.76
```

Notable: the installed SDK already resolves to 1.29.0 under the old `^1.0.4` range —
the US4 manifest floor raise records reality rather than changing it. `zod-to-json-schema`
resolves to 3.25.2 (manifest `^3.23.5`).

## Descriptor fingerprint baseline

- `src/tools/_register-baseline.json` — `schemaVersion: 1`, **34 tools**.
- This file is the US4 parity gate (FR-009): it must pass **unregenerated** after the
  zod 4 migration. Recorded here so any post-upgrade drift is attributable.
