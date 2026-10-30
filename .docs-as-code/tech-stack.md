# Tech stack

What the server is built from, why each piece is here, and what having it
forces or rules out. `package.json` lists what is installed; this page records
what that costs. Where the [constitution](../.specify/memory/constitution.md)
(*Technical Standards & Stack Constraints*) mandates a choice, the rule is
there and only its effect is here. The stack was refreshed by BI-067
(PRs #74–#80), where the version holds below come from, and the MCP SDK moved
to v2 in PR #89 (spec 068, ADR-039).

## Language and runtime

| What | Why it is here | What it constrains |
| --- | --- | --- |
| Node.js, published floor `>= 22.11` | Runs the server; `engines.node` is what end users need. | Raising the published floor needs a constitution amendment citing the API that forces it. Newer built-ins (`fetch`, `AbortController`, `node:test`-era APIs) may be used; polyfills may not. |
| Node.js `>= 22.13` for development | ESLint 10 declares `^20.19 \|\| ^22.13 \|\| >=24`. | A dev-only floor, kept apart from the published one ([CONTRIBUTING.md](../CONTRIBUTING.md)). On an older 22.x, `npm run lint` fails while the server still runs. |
| TypeScript `~6.0.3` (tilde hold) | Strict typing; `tsc --noEmit` is the authoritative typecheck. | Held below 6.1 because typescript-eslint's peer range stops at `<6.1.0` (PR #76, PR #80). Raising it waits on typescript-eslint. |
| ES modules, `NodeNext` resolution, `ES2024` target | `"type": "module"`; imports end in `.js` even from `.ts` sources. | Lint's import resolver cannot follow the `.js`-on-`.ts` convention, so `import-x/no-unresolved` is off and the compiler does that job. `verbatimModuleSyntax` and `isolatedModules` require explicit `import type`. |
| `noUncheckedIndexedAccess`, `noUnusedLocals`/`Parameters`, `noImplicitReturns` | Stricter than `strict` alone. | Every indexed read is `T \| undefined`; code uses `!` only where a preceding check makes it safe (for example the first element of `split`). |

## MCP transport

| What | Why it is here | What it constrains |
| --- | --- | --- |
| `@modelcontextprotocol/server` `^2.4` (runtime) | The only MCP transport: `McpServer.registerTool` for every tool, and `serveStdio` serving both protocol eras on one stdio connection (PR #89, ADR-039). | Since PR #90 the tool's `title` and four behaviour-hint `annotations`, and the server `instructions`, reach clients through `registerTool` and the `McpServer` options rather than project code. `McpServer` validates input and formats errors itself, so tools reach it through the pass-through `toSdkInputSchema` adapter that keeps the project's zod parse and error envelope ([architecture](architecture.md#registration--the-one-path-from-a-schema-to-a-published-tool)). It checks `structuredContent` against `outputSchema` the same way, and reports a failure as free text, so since PR #91 typed tools hand it `toSdkOutputSchema`, whose validator also accepts everything, and `registerTool` runs the output check itself (ADR-042). Its 2025-era codec wraps an output schema without an object root, so `registerTool` refuses one at boot. The adapter tracks the SDK's Standard Schema contract, and the spike tests in `_register.test.ts` fail first if a minor release calls it differently. `serveStdio` builds a server more than once per connection, so shared state lives in `createServer`, not the factory. Unknown tool names are the SDK's JSON-RPC `-32602`. Since PR #92 the server also relies on three per-request SDK features: `ctx.mcpReq.signal` for cancellation, `ctx.mcpReq.notify` for `notifications/progress`, and the `input_required` result for confirmation, which the SDK fulfils natively on the 2026 era and through its legacy shim as `elicitation/create` on the 2025 era (ADR-043). The server still declares no Roots, Sampling or Logging capability. Needs zod ≥ 4.2 and Node ≥ 20, both already met. It replaced `@modelcontextprotocol/sdk` 1.x, whose low-level `Server` was kept behind `no-deprecated` disables until then (BI-067, PR #78); dropping v1's HTTP/Express dependencies shrank `package-lock.json` by about 2,800 lines. |
| `@modelcontextprotocol/client` `^2.4` (devDependency) | Test-side only: the in-process both-era protocol tests (`src/server.protocol.test.ts`), the fingerprint gate, `npm run probe:stdio` (PR #89), and since PR #91 the typed-result round trip, which validates `structuredContent` with the client's `AjvJsonSchemaValidator` rather than zod. | It is the only public way to read the published tool list, so the gate fingerprints what a client receives instead of reaching into private SDK fields. Being a devDependency, it is absent from an installed package, so nothing on the server's runtime path may import it: `src/tools/_mcp-client-fixtures.ts`, `src/tools/_typed-result-fixtures.ts` (PR #91) and `_register-baseline.ts` are reached only from tests and the baseline writer. |
| stdout reserved for JSON-RPC | The transport owns stdout. | All logging goes to stderr ([src/logger.ts](../src/logger.ts)); `no-console` is a lint error. |

## Validation

| What | Why it is here | What it constrains |
| --- | --- | --- |
| `zod` `^4` | The only permitted boundary validator. One schema is the published shape, the runtime parse and the TypeScript type (`z.infer`). | Published descriptors are zod's own JSON Schema emission at the target the MCP SDK asks for, draft-2020-12. Until PR #89 they were `z.toJSONSchema` (draft-7) plus `normalizeToDraft7Parity`, which reproduced the retired `zod-to-json-schema` output byte-for-byte; PR #89 deleted the normaliser (068 C3). Since PR #90 every `.describe()` on an input field is published wire text (ADR-040): a wording change moves the `schemaFingerprint` and must be regenerated on purpose, and the description has to agree with the field's `docs/tools/` page. Since PR #91 the zod output schemas are published too, as `outputSchema`, and fingerprinted (`outputSchemaFingerprint`); a typed tool's handler must return `z.input` of its output schema, so a result-shape change fails `typecheck`. zod is still the only runtime validator: the SDK is handed a validator that accepts everything, for input and output alike. A zod change that alters emitted JSON Schema fails the registry fingerprint test. Lint bans the v3-era idioms (`.strict()` with no arguments, `.passthrough()`, `.strip()`) and the `zod/v3` and `zod-to-json-schema` imports (PR #78). |

## The Obsidian side

| What | Why it is here | What it constrains |
| --- | --- | --- |
| Obsidian Integrated CLI (`obsidian` binary) | The only way the server reaches a vault through Obsidian. It is not an npm dependency: it is found at runtime through `OBSIDIAN_BIN`, then the platform default path, then `PATH` ([src/binary-resolver/](../src/binary-resolver/)). | Its behaviour is the contract, and much of it is pinned only by live probes ("T0" findings recorded in `specs/*/research.md` and `contracts/`). Examples: exit 0 with `Error:` on stdout for failures, `Vault not found.` on stdout, empty stdout for `eval` against a closed vault, the cold-start `Command "<cmd>" not found.` signature. A change upstream breaks classification, not compilation. |
| A running Obsidian application | The CLI talks to it; `eval` runs inside it. | When it is closed, dispatch launches it through the `obsidian://` URI (ADR-030), unless `OBSIDIAN_AUTO_LAUNCH` is off. Everything is single-flight through one queue, because there is one app to drive. |
| Smart Connections plugin (optional) | Embeddings behind the two `smart_connections_*` tools (ADR-014, Plugin-Backed Typed Tools Runtime-Dependency Pattern). | Not installed or not yet indexed are reported as distinct errors, never as empty results. No other tool depends on it. |

## Testing and coverage

| What | Why it is here | What it constrains |
| --- | --- | --- |
| `vitest` 4 with `@vitest/coverage-v8` | The only test framework. Tests are `*.test.ts` beside their source. | `npm test` runs `vitest run --coverage`. Adding another framework needs an amendment. |
| Coverage gate: **statements only**, in `vitest.config.ts` | The single merge floor (currently 96, raised from 91.3 in PR #63). | Branch, function, line and per-file thresholds are forbidden without an amendment. Test-support files (`_*fixtures.ts`, `_registration-stub.ts`, `_schema-test-utils.ts`, JSON) are outside the denominator. |
| Structural tests | `src/cli-adapter/architecture.test.ts` (sanctioned spawn sites), `_register-baseline.test.ts` (descriptor fingerprints, read through a v2 client since PR #89), doc-presence tests on `docs/tools/`, `src/tools/_surface.test.ts` (PR #90: title, four hints, the pinned FR-024 classification and a described parameter at every depth, for every listed tool; PR #91: identical `outputSchema` in both eras with an object root, and a `structuredContent` round trip per typed tool), and `src/server.protocol.test.ts` (PR #89), which runs the same handshake and tool-call assertions for a 2025-era client over an in-memory transport and a 2026-era client through `createMcpHandler`. | These fail the build for an architectural regression or an undocumented surface change, rather than relying on review to spot it. Real stdio is not exercised in CI; `npm run probe:stdio` checks it by hand against `dist/`. |

## Lint and format

| What | Why it is here | What it constrains |
| --- | --- | --- |
| ESLint 10, flat config, `typescript-eslint` | Zero warnings is a merge gate. | `@typescript-eslint/no-deprecated` is on and type-aware: any `@deprecated` API is an error. The low-level SDK `Server` needed explicit disables for that reason; PR #89 removed it and left no SDK `no-deprecated` disable in `src`. PR #92 brought back exactly one, in `src/tools/_confirm.ts`: on the 2025 era the only source of the client's elicitation capability is `server.server.getClientCapabilities()`, which SDK 2.4.0 deprecates in favour of a per-request envelope that 2025-era requests do not carry (research R12). It conflicts with the 068 plan's PR-3 line "no SDK `no-deprecated` disable left", and PR #92 put it to the owner (ADR-043). `import-x/order` enforces alphabetised, grouped imports. `eslint-plugin-import-x` replaced `eslint-plugin-import`, and the unused `eslint-plugin-n` went with it (PR #77). |
| `eslint-plugin-promise`, `eslint-plugin-jsonc` | Promise hygiene; JSON and JSONC linting. | `catch-or-return` and `always-return` are off, because the queue and dispatch consume promises inside `.then` by design. |
| Prettier `3.8.5` (exact hold) | Formatter of record. | Pinned exactly because of prettier/prettier#19510 (PR #75, PR #80). `format:check` is a script, **not** a CI gate, and the existing Markdown is not Prettier-clean. |

## CI

| What | Why it is here | What it constrains |
| --- | --- | --- |
| GitHub Actions, [.github/workflows/ci.yml](../.github/workflows/ci.yml) | Runs lint, typecheck, test with coverage, and build on every PR to `main` and every push to `main`. | Matrix of **Ubuntu and Windows** × Node **22 and 24**: four jobs, `fail-fast: false`, 20-minute timeout. The Node axis came in PR #79; Windows joined in PR #87 (spec 068 A4), so path separators, junctions, `EBUSY`/`EPERM` and case-insensitive roots are exercised on every change rather than only by hand. Tests that touch the real filesystem must pass on both, which is why the containment tests build a junction on Windows and a directory symlink elsewhere. Runs in progress on the same ref are cancelled. |
| `protect-main` ruleset | Changes reach `main` only through a PR. | Zero required approvals, stale reviews are not dismissed on push, and threads need not be resolved. A docs commit pushed after review therefore does not re-gate the merge, but CI re-runs. |

## Packaging and publishing

| What | Why it is here | What it constrains |
| --- | --- | --- |
| npm package `@marwansaab/obsidian-cli-mcp`, `bin: obsidian-cli-mcp` | How users install and launch the server from an MCP client config. | `files` ships `dist/`, `docs/tools/**/*.md`, `README.md` and `LICENSE`. The tool docs are runtime content: `help` reads them from the installed package, and the server will not boot without them. Since PR #94, `tsconfig.build.json` also excludes the eleven test-support modules under `src/`: the `_*fixtures.ts` files, `_schema-test-utils.ts`, `_target-mode-test-cases.ts`, `_registration-stub.ts` and `_register-baseline.ts`. Only tests and scripts import them, so `dist/` holds just the files reachable from `src/index.ts`. `_register-baseline.ts` is excluded by name because it imports `_mcp-client-fixtures.ts`, and `tsconfig` `exclude` does not drop a file that a built file imports. `npm run baseline:write` runs it from source. `npm run typecheck` still checks every excluded file through `tsconfig.json`. Before PR #94 these modules shipped in the package; PR #93's post-implement check found it. |
| Two runtime dependencies (`@modelcontextprotocol/server` and zod) | Everything else is in-tree. | A new runtime dependency must be argued in its PR against a small in-tree implementation; the bias is in-tree for anything under about 150 lines. |
| Versioning and [CHANGELOG.md](../CHANGELOG.md) | Keep a Changelog plus SemVer; the server reports `package.json` `version` in the MCP handshake. | Releases are cut by a version-bump commit (`chore(release): …`) on a feature PR, and there is no publish workflow in the repository. **Known gap:** the CHANGELOG has no entries between 0.6.5 and 0.9.0, so the releases in between are recorded only in commit bodies and PR descriptions. This page previously said the latest entry was 0.6.5; that was true when PR #92 was documented, but its follow-up commit `c6a2218` added the 0.9.0 entry before the merge. |
