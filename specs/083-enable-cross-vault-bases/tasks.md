---
description: "Task list for 083-enable-cross-vault-bases"
---

# Tasks: Enable cross-vault Bases

**Input**: Design documents from `specs/083-enable-cross-vault-bases/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/bases-cross-vault-contract.md](contracts/bases-cross-vault-contract.md), [quickstart.md](quickstart.md)

**Tests**: required. Constitution Principle II makes co-located happy-path and failure/boundary tests mandatory in the same change that modifies a tool, and plan D9 maps every contract row to one. Write each story's tests first and confirm the new behaviour assertions fail before the implementation task. The default-path pins (US4) must pass both before and after.

**Organization**: tasks are grouped by user story, so each story can be implemented and tested on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task).
- **[Story]**: the spec user story the task belongs to: US1 `bases`, US2 `create_base`, US3 open-mode `views_base`, US4 default path, US5 unregistered vault, US6 documentation.
- Paths are repository-relative. This is a single project (`src/`, co-located `*.test.ts`).

**Before any code task**:
- Load the `karpathy-guidelines` skill and read `.memory/refactor-decisions.md`. Its standing rules apply:
  - check 2: byte-exact behaviour on the default path;
  - check 5: the test edits are scoped in plan.md;
  - item 14: `appendBasePathIssues` stays the only `.base` path validator;
  - item 15: use `stringDetail`;
  - item 16: `makeQueuedSpawn`, and provision exactly as many `StubResponse`s as the handler spawns;
  - the "Locator resolution is centralized in `_active-file.ts`" invariant.
- Never add a per-tool closed-vault stage (check 1).
- Run vitest through PowerShell, not the Bash tool.
- Before any live CLI call (T002, T040), read `.memory/test-execution-instructions.md`.

---

## Phase 1: Setup

**Purpose**: establish the green baseline and settle the one plan-time open item (D7).

- [X] T001 Run `npx vitest run src/tools/bases src/tools/views_base src/tools/create_base src/tools/_surface.test.ts src/tools/_plugin-noise.test.ts` (PowerShell) and confirm it is green at HEAD. The last two are the suites that import `_typed-result-fixtures.ts`. Confirm `git diff --stat src/tools/_register-baseline.json` is clean.
- [X] T002 Re-run the D7 focus probe live, following `.memory/test-execution-instructions.md`:
  - have `TestVault-Obsidian-CLI-MCP` open but not in front;
  - seed `Sandbox/P083-T002-<timestamp>/Filtered.base` with `filters: {and: ['file.inFolder("Sandbox/P083-T002-<timestamp>/Items")']}` plus the `Items` folder, through the filesystem;
  - run `Obsidian.com vault=TestVault-Obsidian-CLI-MCP base:create path=<that base> name=F<n>` three times, checking `Obsidian.com eval "code=app.vault.getName()"` before and after each call.

  Record the verbatim outcomes in `specs/083-enable-cross-vault-bases/research.md` under a new "T002 re-probe" heading.
  - If any call moves focus, set **D7 = side effect documented**: T037 then adds the side-effect sentence and the `get_active_file` pointer to `create_base`'s description and help reference.
  - Otherwise D7 = focus-free.

  Clean up the run folder and confirm `Welcome.md` is intact.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: wire `vaultRegistry` (and `create_base`'s `fs` seam) through the deps, and retire the last bespoke spawn stub. None of this changes behaviour. Every story phase depends on it.

- [X] T003 Migrate `src/tools/create_base/handler.test.ts` from its bespoke `makeSpawn` / local `StubResponse` / magic `7777` pid to the shared `makeQueuedSpawn` / `StubResponse` / `SpawnRecording` from `../_handler-test-fixtures.js`, exactly as `bases/handler.test.ts` did (memory item 16). `makeDeps` destructures `{ spawnFn, recorded }`. Remove the now-unused `node:child_process` / `node:events` / `node:stream` imports. No assertion changes. Confirm the file is green.
- [X] T004 [P] In `src/tools/bases/handler.ts`, add `vaultRegistry: VaultRegistry` (required; `import type { VaultRegistry } from "../../vault-registry/registry.js"`) to `ExecuteDeps`, with a JSDoc line like `views_base`'s ("Injected at the composition root … never constructed here"). No logic change yet.
- [X] T005 [P] In `src/tools/create_base/handler.ts`, add to `ExecuteDeps`:
  - a required `vaultRegistry: VaultRegistry`;
  - `fs?: ExecuteFs`, with `export interface ExecuteFs { realpath: (p: string) => Promise<string> }` and a module-private `DEFAULT_FS: ExecuteFs = { realpath: (p) => nodeFs.realpath(p) }` (`import { promises as nodeFs } from "node:fs"`, as `query_base` does).

  No logic change yet.
- [X] T006 In `src/server.ts`, change only `createBasesTool({ logger, queue })` → `createBasesTool({ logger, queue, vaultRegistry })` and `createCreateBaseTool({ logger, queue })` → `createCreateBaseTool({ logger, queue, vaultRegistry })`. No other line may move: this is a kernel-node touch (`createServer`), so the reviewer checks the diff is exactly these two lines. Depends on T004 and T005.
- [X] T007 In `src/tools/_typed-result-fixtures.ts`, add `vaultRegistry: registryAt("/vaults/Work")` to the `bases` builder and to both `create_base` builders (spread `cli(...)` as the other builders do). Depends on T004 and T005.
- [X] T008 Update the test deps so `tsc` passes:
  - `src/tools/bases/handler.test.ts` and `src/tools/create_base/handler.test.ts` `makeDeps`: add an optional `vaultRegistry` parameter, defaulting to a local `makeVaultRegistry({ Work: <root> })` stub, copied from `views_base/handler.test.ts:20-35`. It throws the registry's `VALIDATION_ERROR` for unknown names. Keep it local: memory "Declined" says do not move it to the shared fixture.
  - `src/tools/create_base/handler.test.ts`: `<root>` = `resolve("/vaults/Work")`.
  - `src/tools/bases/index.test.ts` and `src/tools/create_base/index.test.ts`: every factory call gains a `vaultRegistry` stub.

  Depends on T003–T005. Then run `npm run typecheck` and `npx vitest run src/tools/bases src/tools/create_base src/tools/views_base src/tools/_surface.test.ts src/tools/_plugin-noise.test.ts` and confirm both are green, with no assertion changed.

**Checkpoint**: deps wired, every suite green, behaviour unchanged.

---

## Phase 3: User Story 4 - Default path unchanged (Priority: P1)

**Goal**: pin today's no-`vault` behaviour on all three tools before routing changes land (FR-011, SC-002).

**Independent Test**: contract rows B1, V1, V7, V8 and C1 pass before and after every later phase.

- [X] T009 [P] [US4] In `src/tools/bases/handler.test.ts`, add **B1**: `executeBases({}, deps)` spawns once; `recorded[0].argv` contains no element starting with `vault=`; the command is `bases`. Also assert that a registry whose `resolveVaultPath` records calls is never consulted. Must pass now.
- [X] T010 [P] [US4] In `src/tools/views_base/handler.test.ts`, add:
  - **V1**: `{}` spawns a single `base:views` with no `vault=` arg, and the registry is not consulted;
  - **V7**: `{base_path:"Tasks.base"}`, where neither spawn's argv has `vault=`;
  - **V8**: `{}` with stdout `Error: Active file is not a base file: Notes/a.md` rejects with `details` deep-equal to exactly `{code:"BASE_NOT_FOUND", reason:"not-open"}` (no `vault` key) and message `views_base: active file is not a base file`.

  Must pass now.
- [X] T011 [P] [US4] In `src/tools/create_base/handler.test.ts`, add **C1**:
  - no `vault`: exactly 1 spawn (`base:create`), no `eval`, no `vault=` in its argv;
  - a `fs.realpath` stub that throws if called (proving no containment check runs);
  - the result equals today's `{path, name}`;
  - the not-found path's `details` deep-equal exactly `{code:"BASE_NOT_FOUND", path: base_path}`, with message `create_base: base file not found: <base_path>`.

  Must pass now.

**Checkpoint**: default path pinned.

---

## Phase 4: User Story 1 - Enumerate the Bases of a named vault (Priority: P1) 🎯 MVP

**Goal**: `bases {vault}` lists the named vault's Bases (FR-001).

**Independent Test**: contract rows B2 and B4 pass. B1 stays green.

### Tests for User Story 1

- [X] T012 [US1] In `src/tools/bases/handler.test.ts`, add:
  - **B2**: `executeBases({vault:"Work"}, deps)` with stdout `b.base\na.base\n` spawns exactly once; `recorded[0].argv` includes `vault=Work` and the command is `bases`; the result is `{bases:["a.base","b.base"], count:2}`;
  - **B4**: `{vault:"Work"}` with stdout `No base files found in vault\n` gives `{bases:[], count:0}`, from that one spawn.

  Confirm B2 fails (no `vault=` today).

### Implementation for User Story 1

- [X] T013 [US1] In `src/tools/bases/handler.ts`, `executeBases(input, deps)`: rename `_input` to `input`. Call `invokeCli({ command:"bases", vault: input.vault, parameters:{}, flags:[], target_mode: input.vault === undefined ? "active" : "specific" }, deps)` (research D1). Keep filtering and sorting unchanged. Update the header comment to say a named vault routes through `vault=` (research P1). Confirm T009 and T012 pass.

**Checkpoint**: US1 is independently demonstrable.

---

## Phase 5: User Story 2 - Create an item in a named vault's Base (Priority: P1)

**Goal**: `create_base {vault}` creates only in the named vault, with containment before creation and a backstop after (FR-003, FR-005, FR-007a, FR-007c, FR-010; Clarifications Q1 and Q4; research D5).

**Independent Test**: contract rows C2–C12 and the §4 template-byte pins pass. C1 stays green.

### Tests for User Story 2

- [X] T014 [P] [US2] Create `src/tools/create_base/_template.test.ts`, with the header `// Original — no upstream.` and an intent line, modelled on `views_base/_template.test.ts`. Assert that `ITEM_FOLDER_TEMPLATE`:
  - starts with `(async()=>{` and ends with `})()`;
  - contains `__PAYLOAD_B64__`, `atob(` and `JSON.parse(`;
  - contains `app.vault.getAbstractFileByPath(a.path)`, `code:'BASE_NOT_FOUND'`, `parseYaml(`, `app.vault.cachedRead(f)`, `file\\.inFolder` and `app.fileManager.getNewFileParent(f.path)`;
  - contains `ok:true` and `folder`.

  Add a `composeEvalCode(ITEM_FOLDER_TEMPLATE, {path:"A/B.base"})` round-trip asserting the path appears only base64-encoded, never raw. Confirm it fails (no module yet).
- [X] T015 [P] [US2] In `src/tools/create_base/handler.test.ts`, add the named-vault rows. Registry: `Work → resolve("/vaults/Work")`. Use `linkRealpath` from `../../path-safety/_realpath-fixtures.js` for escapes; otherwise identity realpath. Evals are stubbed as `{ stdout: "=> " + JSON.stringify(envelope) }`.
  - **C2**: envelope `{ok:true, folder:"Tasks"}`, then `Created: Tasks/New.md`. Exactly 2 spawns, `["eval","base:create"]`, both argv include `vault=Work`. The result `{path, name}` is built exactly as today (the response-path bug is untouched).
  - **C4**: `base_path` `out/T.base`, with `linkRealpath({[resolve("/vaults/Work/out")]: resolve("/elsewhere")})`. Rejects `PATH_ESCAPES_VAULT`, details `{vault:"Work", attemptedPath:"out/T.base", resolvedPath}`, 0 spawns, and the logger's `pathEscapeAttempt` called once (capture it with a logger stub).
  - **C5**: envelope `{ok:false, code:"BASE_NOT_FOUND"}`. Rejects `CLI_REPORTED_ERROR`, details deep-equal `{code:"BASE_NOT_FOUND", path:<base_path>, vault:"Work"}`, message containing `vault "Work"`; exactly 1 spawn (`eval`).
  - **C6**: envelope folder `Items`, with `Items` linked outside. Rejects `PATH_ESCAPES_VAULT` with `attemptedPath:"Items"`; exactly 1 spawn.
  - **C7**: folder `""`, name `sub/Item`. The realpath stub records the paths it sees, and the folder check covers `resolve("/vaults/Work/sub")`; 2 spawns; success.
  - **C8**: envelope ok, then stdout `Error: Base file not found: T.base`. Rejects `BASE_NOT_FOUND`, details `{code, path, vault:"Work"}`.
  - **C9**: envelope folder `Tasks` (contained), then `Created: Esc/New.md`, with `Esc` linked outside. Rejects `PATH_ESCAPES_VAULT`, details including `createdPath:"Esc/New.md"`, `attemptedPath:"Esc/New.md"`, `vault:"Work"`. The message mentions the item was created and not deleted. Exactly 2 spawns: no third spawn and no unlink.
  - **C10**: eval stdout `=> not-json`, giving `stage:"json-parse"`; `=> {"ok":true}`, giving `stage:"envelope-parse"`. Both `CLI_REPORTED_ERROR`, 1 spawn each.
  - **C12**: `base_path` `New/Deep/T.base` whose folders do not exist. The realpath stub throws `{code:"ENOENT"}` for every path under `resolve("/vaults/Work/New")` and is the identity elsewhere. The containment check passes through the nearest existing ancestor and does not fall back to plain-text checking, so the call proceeds to the eval (spec Edge Cases, "folders do not all exist yet").
  - **C3** (unregistered `vault:"Nope"`): `VAULT_NOT_FOUND` / `unknown` / `vault:"Nope"`, 0 spawns.

  Confirm the new rows fail.
- [X] T015a [P] [US2] In `src/tools/create_base/index.test.ts`, add **C11**: deprecated `path` / `view` with `vault:"Work"`, called through `createCreateBaseTool({ ..., vaultRegistry: <Work stub> }).handler`, with spawn responses for the eval and `base:create`. Success, with `deprecated_parameters` reported. Confirm it fails before T018.

### Implementation for User Story 2

- [X] T016 [US2] Create `src/tools/create_base/_template.ts` with the header `// Original — no upstream.` and an intent comment. The comment states:
  - it is frozen and base64-wrapped through `composeEvalCode`;
  - it runs in the named vault;
  - the derivation rule (research D5): a single top-level `file.inFolder` folder, else the new-note parent, with `/` → `""`, and YAML failure → new-note branch;
  - it must not import any sibling tool.

  Export:
  ```ts
  export const ITEM_FOLDER_TEMPLATE = `(async()=>{
  const a=JSON.parse(${B64_PAYLOAD_DECODE_EXPR});
  const f=app.vault.getAbstractFileByPath(a.path);
  if(!f||f.extension===undefined)return JSON.stringify({ok:false,code:'BASE_NOT_FOUND'});
  let folder=null;
  try{const y=parseYaml(await app.vault.cachedRead(f));const fl=y&&y.filters;const list=typeof fl==='string'?[fl]:(fl&&Array.isArray(fl.and)?fl.and:[]);const m=list.filter(e=>typeof e==='string').map(e=>/^\\s*file\\.inFolder\\(\\s*(["'])(.*)\\1\\s*\\)\\s*$/.exec(e)).filter(Boolean);if(m.length===1)folder=m[0][2];}catch(e){}
  if(folder===null){const p=app.fileManager.getNewFileParent(f.path).path;folder=p==='/'?'':p;}
  return JSON.stringify({ok:true,folder});
  })()`;
  ```
  Import `B64_PAYLOAD_DECODE_EXPR` from `../_shared.js`. Confirm T014 passes.
- [X] T017 [US2] In `src/tools/create_base/schema.ts`, add the internal envelope schema with a comment that it is the internal eval hand-off, not the published surface, and does not affect the fingerprint (as `views_base/schema.ts:39-45` says):
  ```ts
  export const itemFolderEvalResponseSchema = z.discriminatedUnion("ok", [
    z.strictObject({ ok: z.literal(true), folder: z.string() }),
    z.strictObject({ ok: z.literal(false), code: z.literal("BASE_NOT_FOUND") }),
  ]);
  ```
  It is data-model E2: `{ ok: true, folder: string }` with `""` = vault root, or `{ ok: false, code: "BASE_NOT_FOUND" }`.
- [X] T018 [US2] In `src/tools/create_base/handler.ts`, implement the named-vault pipeline (research D5 stages 1–6). With `input.vault === undefined`, the code path must be byte-identical to today (T011).
  1. `const root = await resolveVaultRootOrRemap(deps.vaultRegistry, input.vault, "create_base")`.
  2. `const guard = { realpath: (deps.fs ?? DEFAULT_FS).realpath, logger: deps.logger, vaultLabel: input.vault }`, then `await assertCanonicalPath(root, input.base_path, guard)`.
  3. `invokeEval({ code: composeEvalCode(ITEM_FOLDER_TEMPLATE, { path: input.base_path }), vault: input.vault }, deps)`, then `decodeEvalEnvelope(result, itemFolderEvalResponseSchema, { toolName: "create_base", malformedCode: "CLI_REPORTED_ERROR" })`. On `ok:false`, throw `baseNotFound(input, null)` (see the helper below).
  4. `const itemFolder = posix.join(decoded.folder, posix.dirname(input.name.replace(/\\/g, "/")))`, then `await assertCanonicalPath(root, itemFolder, { ...guard, attemptedPathLabel: itemFolder })`.
  5. The existing `invokeCli` call gains `vault: input.vault`. Both existing not-found throws route through the helper `baseNotFound(input, cause)`, which keeps today's `details:{code:"BASE_NOT_FOUND", path}` and message when `input.vault` is undefined. When a vault is named, it adds `vault: input.vault` to details and uses the message `create_base: base file not found in vault "<vault>": <base_path>`.
  6. Backstop, after `CREATED_PATTERN` matches: `const created = match[1]!.trim()`, then `try { await assertCanonicalPath(root, created, guard) } catch (err) { if (err instanceof UpstreamError && err.code === "PATH_ESCAPES_VAULT") throw new UpstreamError({ code: "PATH_ESCAPES_VAULT", cause: err, details: { ...err.details, createdPath: created }, message: \`create_base: the item was created at "${created}", which resolves outside vault "${input.vault}"; it was not deleted\` }); throw err; }`. Never call delete or unlink.

  Then build the response unchanged (lines 91–97 untouched: the follow-up). Imports: `invokeEval` from `cli-adapter.js`; `assertCanonicalPath`, `decodeEvalEnvelope` and `resolveVaultRootOrRemap` from `../_active-file.js`; `composeEvalCode` from `../_shared.js`. Update the header comment to name the named-vault pipeline and cite Clarifications Q1 and Q4. Confirm T011, T014 and T015 pass.

**Checkpoint**: US2 is independently demonstrable, and the default path is still pinned.

---

## Phase 6: User Story 3 - List the views of the Base open in a named vault (Priority: P2)

**Goal**: open-mode `views_base {vault}` reads the named vault's open Base, and the not-open error names it (FR-002, FR-006, FR-007; research D3, D4).

**Independent Test**: contract rows V2, V3, V4, V6 and V9 pass. V1, V7 and V8 stay green.

### Tests for User Story 3

- [X] T019 [US3] In `src/tools/views_base/handler.test.ts`, replace the test `US2: vault without base_path is an inherited no-op (open mode), registry not consulted`: that behaviour is intentionally reversed by FR-002. Add:
  - **V2**: `{vault:"Work"}` with stdout `All\ttable\n` gives `{views:["All"], count:1}`; one spawn, `base:views`, argv including `vault=Work`.
  - **V3**: `{vault:"Work"}` with stdout `Error: Active file is not a base file: Notes/a.md`. Rejects `CLI_REPORTED_ERROR`, details deep-equal `{code:"BASE_NOT_FOUND", reason:"not-open", vault:"Work"}`, message `views_base: active file in vault "Work" is not a base file`.
  - **V4**: `{vault:"Work"}` with a YAML-parser complaint (reuse the stdout fixture of the existing open-mode invalid-yaml test). `BASE_MALFORMED` / `invalid-yaml`, details shape as open mode today.
  - **V6**: extend the existing `US2 named + vault` test to assert `recorded[1]!.argv` also includes `vault=Other` (FR-013 permits this).
  - **V9**: `{vault:"Work"}` with stdout `Error: No active file.` rejects with `CLI_REPORTED_ERROR`, and its `details.stdout` starts with `Error: No active file.`. The rejection is not `BASE_NOT_FOUND`, and it is the same code and the same `details.stdout` that `{}` gets for that stdout today (FR-006 second sentence, FR-011 parity). Add the matching no-vault assertion alongside it, if no existing test pins it.

  Confirm V2, V3 and V6's new assertion fail. V9 should pass once routing lands; nothing maps this state.

### Implementation for User Story 3

- [X] T020 [US3] In `src/tools/views_base/handler.ts`:
  - change `listFocusedViews(deps, basePath)` to `listFocusedViews(deps, basePath, vault: string | undefined)`. Its `invokeCli` becomes `{ command:"base:views", vault, parameters:{}, flags:[], target_mode: vault === undefined ? "active" : "specific" }`.
  - `focusedBaseError(basePath, failure, cause, report, vault)`: in the open-mode not-open branch only, when `vault !== undefined`, use details `{code:"BASE_NOT_FOUND", reason:"not-open", vault}` and the message `views_base: active file in vault "${vault}" is not a base file`. With no vault, keep today's bytes (V8). The `BASE_MALFORMED` branches are unchanged.
  - `executeViewsBase` passes `input.vault` in both modes (research D3).
  - Update the file header: replace the obsolete "T0 P2: `base:views` ignores path=/vault= (active-only)" sentence with the 083 finding that `base:views` honours `vault=` (research P3) and that open mode routes by `vault=`.

  Confirm T010 and T019 pass.

**Checkpoint**: US3 is independently demonstrable.

---

## Phase 7: User Story 5 - An unregistered vault name fails distinctly (Priority: P1)

**Goal**: every operation answers an unregistered `vault` with the same typed `VAULT_NOT_FOUND` / `unknown` that `query_base` returns, before any spawn (FR-008–FR-010, SC-003; research D2). This phase follows US1–US3 because it adds the pre-check to the code they route; `create_base`'s pre-check already landed in T018 (C3).

**Independent Test**: contract rows B3, V5 and C3 pass, each asserting the identical triple.

### Tests for User Story 5

- [X] T021 [P] [US5] In `src/tools/bases/handler.test.ts`, add **B3**: `{vault:"Nope"}` with an empty response queue rejects with `CLI_REPORTED_ERROR`, details deep-equal `{code:"VAULT_NOT_FOUND", reason:"unknown", vault:"Nope"}`, message `bases: vault "Nope" is not registered`; `recorded.length === 0`. Confirm it fails.
- [X] T022 [P] [US5] In `src/tools/views_base/handler.test.ts`, add **V5**: `{vault:"Nope"}` (no `base_path`) rejects with details deep-equal `{code:"VAULT_NOT_FOUND", reason:"unknown", vault:"Nope"}`, not `BASE_NOT_FOUND`; 0 spawns. Confirm it fails.
- [X] T023 [P] [US5] In `src/tools/create_base/handler.test.ts`, confirm C3 (from T015) asserts the same deep-equal triple and `recorded.length === 0` with a `base_path` that would exist. Tighten it if needed. It should already pass.

### Implementation for User Story 5

- [X] T024 [US5] In `src/tools/bases/handler.ts`, before the `invokeCli` call, add `if (input.vault !== undefined) await resolveVaultRootOrRemap(deps.vaultRegistry, input.vault, "bases");` (import from `../_active-file.js`). Confirm T021 passes and T009/T012 stay green.
- [X] T025 [US5] In `src/tools/views_base/handler.ts` `executeViewsBase`, move the existing `if (input.vault !== undefined) await resolveVaultRootOrRemap(...)` out of the named-mode branch to the top of the function, so it runs in both modes with the same call (Principle IV cohort parity). Named mode keeps its ordering (pre-check before the focus eval). Confirm T022 passes and every other `views_base` test stays green.

**Checkpoint**: no unregistered name ever reaches the front vault.

---

## Phase 8: User Story 6 - Documentation states that the vault name is honoured (Priority: P2)

**Goal**: the descriptions, `vault` parameter descriptions and help references state the routed behaviour; no "ignored / no-op / parity / inherited" claim remains (FR-014–FR-017, FR-014a, SC-005; research D8).

**Independent Test**: the contract §5 table passes as index and schema tests; `docs/tools/*.md` contain no stale claim.

### Tests for User Story 6

- [X] T026 [P] [US6] In `src/tools/bases/index.test.ts`, add the following, using literal expected strings:
  - `BASES_DESCRIPTION` contains `closedVaultNote("bases")` (import from `../_shared.js`), `VAULT_NOT_FOUND`, and a sentence that `vault` lists that vault's Bases and the front vault is used when omitted;
  - the description does not match `/ignored|no-op|parity|inherited|forward compatibility/i`;
  - `docs/tools/bases.md`, read with `node:fs` as `append_note/index.test.ts` and `files/index.test.ts` read theirs, has no line containing `vault` that matches the same regex. Apply the same line-wise rule in T027 and T028.

  In `src/tools/bases/schema.test.ts`, assert the `vault` property description does not match `/ignored/i` and mentions the front vault. Confirm they fail.
- [X] T027 [P] [US6] In `src/tools/views_base/index.test.ts`, add the same assertions for `VIEWS_BASE_DESCRIPTION` (`closedVaultNote("base:views")`; the `vault` paragraph covers both modes) and `docs/tools/views_base.md`. In `src/tools/views_base/schema.test.ts` (create it if absent, with an `Original — no upstream.` header), make the same `vault` description assertion. Confirm they fail.
- [X] T028 [P] [US6] In `src/tools/create_base/index.test.ts`, add:
  - `CREATE_BASE_DESCRIPTION` contains `closedVaultNote("base:create")`, `VAULT_NOT_FOUND` and `PATH_ESCAPES_VAULT` (stated as applying when a vault is named), and no stale-claim match;
  - the same for `docs/tools/create_base.md`. Keep the existing phrase pins (`index.test.ts:175-180`), which must still pass.

  In `src/tools/create_base/schema.test.ts`, assert the published `vault` description no longer says "ignored". Confirm they fail.

### Implementation for User Story 6

- [X] T029 [P] [US6] `src/tools/bases/schema.ts`: `vault` `.describe("Obsidian vault display name. Lists that vault's Bases, whether it is in front, open behind it, or closed. Omit to list the vault in front.")`.

  `src/tools/bases/index.ts`:
  - replace the "Optional `vault` … forward compatibility." paragraph with "Optional `vault` (string): Obsidian vault display name; lists that vault's Bases. Omit to list the vault in front.";
  - add `\`CLI_REPORTED_ERROR\` with \`details.code: "VAULT_NOT_FOUND"\` (\`details.reason: "unknown"\`) for an unregistered \`vault\`` to the typed-errors line;
  - append `\n\n${closedVaultNote("bases")}` (import from `../_shared.js`).
- [X] T030 [P] [US6] `src/tools/views_base/schema.ts`: `vault` `.describe("Obsidian vault display name. Routes to that vault in both modes: with base_path, the named Base in that vault; without it, the Base open in that vault. Omit for the vault in front.")`.

  `src/tools/views_base/index.ts`:
  - rewrite the `vault` paragraph: with `base_path`, the named Base in that vault (cross-vault, as before); without `base_path`, the views of the Base open in that vault (`BASE_NOT_FOUND`/`not-open` carries `details.vault`); omitted, the vault in front;
  - append `closedVaultNote("base:views")`.

  Leave the existing error roster sentence intact except for adding `details.vault` on `not-open` when a vault is named.
- [X] T031 [P] [US6] `src/tools/create_base/schema.ts`: `vault` `.describe("Obsidian vault display name. Creates the item in that vault's Base. Omit for the vault in front.")`.

  `src/tools/create_base/index.ts`:
  - replace "Optional `vault` (string): accepted for cohort parity but silently ignored by the CLI." with "Optional `vault` (string): creates the item in that vault's Base; omit for the vault in front. With `vault`, `base_path` and the folder the item will land in are checked to stay inside that vault before anything is created, and the created path is checked again after.";
  - add `VAULT_NOT_FOUND`, `PATH_ESCAPES_VAULT` (named vault only; when the post-creation check catches an escape, `details.createdPath` names the item that was written and kept) and `details.vault` on `BASE_NOT_FOUND` to the typed-errors text;
  - append `closedVaultNote("base:create")`.

  If T002 set D7 = side effect, also add: "Creating an item may bring the named vault to the front; check `get_active_file` afterwards."
- [X] T032 [P] [US6] `docs/tools/bases.md`:
  - rewrite the `vault` input row;
  - delete the "Vault routing limitation" section and replace it with a "Vault routing" section (named vault targeted; front vault when omitted; closed vault opened automatically per the closed-vault note);
  - add a `VAULT_NOT_FOUND` / `unknown` row to the error roster;
  - replace "Example 3 — With vault parameter (ignored)" with "Example 3 — A named vault", showing that vault's Bases.
- [X] T033 [P] [US6] `docs/tools/views_base.md`:
  - in the modes table, the `absent | any` row becomes `absent | absent` ("the Base focused in the vault in front") plus a new `absent | present` row ("the Base open in the named vault");
  - rewrite the `vault` input row;
  - note `details.vault` on the `not-open` roster row;
  - add a worked example of open mode with `vault`.
- [X] T034 [P] [US6] `docs/tools/create_base.md`:
  - rewrite the `vault` input row;
  - replace "Vault routing limitation" with a "Vault routing and containment" section covering: the named vault targeted; the pre-creation containment of `base_path` and the derived item folder (the Base's single top-level `file.inFolder` folder, else the vault's new-note folder, plus any folder part of `name`); the post-creation check, and that a caught escape leaves the item in place and reports `details.createdPath`; the closed vault opened automatically;
  - add `VAULT_NOT_FOUND`, `PATH_ESCAPES_VAULT` and `BASE_NOT_FOUND` + `details.vault` roster rows;
  - add a named-vault worked example.

  If D7 = side effect, add the focus note and the `get_active_file` pointer.
- [X] T035 [US6] Run `npm run baseline:write`. Confirm with `git diff src/tools/_register-baseline.json` that exactly the `bases`, `views_base` and `create_base` entries moved (description and input-schema fingerprints) and no other tool's entry did. Depends on T029–T031.
- [X] T036 [US6] Confirm T026–T028 pass, and that the `create_base/index.test.ts:175-180` phrase pins still pass.
- [X] T037 [US6] D7 follow-through. If T002 recorded a focus switch, confirm T031 and T034 carry the side-effect sentence and that T028 asserts it. Otherwise confirm no side-effect sentence was added. Record which outcome applied in `research.md` → D7.

**Checkpoint**: published surface matches behaviour.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T038 `CHANGELOG.md` `[Unreleased]`:
  - add the line `Spec 083-enable-cross-vault-bases (BI-0139).` after the spec 082 line;
  - add a **Fixed** entry: `bases`, open-mode `views_base` and `create_base` now act on the named `vault` instead of the vault in front, and an unregistered name fails with `VAULT_NOT_FOUND`;
  - add a **Changed** entry: with `vault`, `create_base` checks write containment before creating and after, reporting `PATH_ESCAPES_VAULT`.
- [X] T039 Full gate (PowerShell): `npm run lint; if ($?) { npm run typecheck }; if ($?) { npm run build }; if ($?) { npm test }`. All green; the statements coverage floor holds. Check that every edited file stays under the 1000-line gate, measured with `[System.IO.File]::ReadAllLines(p).Length` (memory gotcha).
- [X] T040 Live T0 per quickstart §3, rows L1–L8, following `.memory/test-execution-instructions.md`:
  - drive the built server (`dist/index.js`) or each tool's `handler` with real deps;
  - verify the `ITEM_FOLDER_TEMPLATE` rows T1–T5 by running the composed eval with `vault=TestVault-Obsidian-CLI-MCP`;
  - check the front vault before and after L1, L2 and L4 (FR-004a);
  - use only Sandbox fixtures with folder filters for `create_base` (never the root-writing plain Base), clean up, and confirm `Welcome.md`;
  - L8 (FR-004b, SC-006): close the test vault's window while another vault stays open and in front, then call `bases {vault:"TestVault-Obsidian-CLI-MCP"}`. Expect the test vault's Bases with no error, and record the front vault afterwards. A cold-open may raise the vault (research P2), and that is not a subcommand side effect. If the window cannot be closed from a script (for example with `Obsidian.com vault=TestVault-Obsidian-CLI-MCP eval "code=window.close()"`), ask the owner to close it by hand, or record that L8 relies on research P2 and the shared closed-vault recovery tests.

  Record the verbatim results in `specs/083-enable-cross-vault-bases/research.md` under "T040 live validation".
- [X] T041 Post-implement structural verification (CLAUDE.md). Run `codegraph sync`, then `codegraph_explore "executeBases executeViewsBase listFocusedViews executeCreateBase ITEM_FOLDER_TEMPLATE itemFolderEvalResponseSchema createServer"`. Write `specs/083-enable-cross-vault-bases/post-implement.md` confirming plan checks 1–4:
  1. there is no new error code or class, and `src/errors.ts` is unchanged;
  2. no handler imports `createLogger` / `createQueue` / `createVaultRegistry`;
  3. `ITEM_FOLDER_TEMPLATE` is imported only by `create_base/handler.ts` and its test, with no tool → tool edge;
  4. each new symbol is reachable from `executeCreateBase`.

  Also confirm the `src/server.ts` diff is exactly the two lines from T006.

---

## Dependencies & Execution Order

- **Setup (T001–T002)** first. T002 (live) can run while Phase 2 proceeds, but must finish before T031, T034 and T037.
- **Foundational (T003–T008)** blocks every story.
  - T003 precedes T008 (same file).
  - T004 and T005 are [P]; T006 and T007 depend on both.
  - T008 depends on T003–T005.
- **US4 (T009–T011)**: after Phase 2. These pins must stay green through every later phase.
- **US1 (T012–T013)**: after US4.
- **US2 (T014–T018)**: after US4; independent of US1.
  - T016 depends on T014, and T018 depends on T016 and T017. T015a runs alongside T014 and T015 (it is the only `index.test.ts` edit in US2). T028 edits the same file later, in US6.
  - Structural note (`codegraph_explore "createServer createCreateBaseTool executeCreateBase"`): `executeCreateBase` is reached from `createServer` only through `createCreateBaseTool`. T006 must therefore land before any end-to-end run of US2 (T040), though the handler-level tests do not need it.
- **US3 (T019–T020)**: after US4; independent of US1 and US2.
- **US5 (T021–T025)**: after US1 (T024 edits the same `bases/handler.ts`) and US3 (T025 edits the same `views_base/handler.ts`). T023 needs T015.
- **US6 (T026–T037)**: after US1, US2, US3 and US5, because the descriptions describe the final behaviour. T035 needs T029–T031; T037 needs T002.
- **Polish (T038–T041)**: after all stories. T040 needs T039's build.

Story order follows spec priority (US1, US2, US4 and US5 are P1; US3 and US6 are P2), except that US4 runs first as the regression net and US5 runs after US3 because it extends code US1 and US3 touch.

## Parallel Opportunities

- Phase 2: T004 ∥ T005.
- US4: T009 ∥ T010 ∥ T011 (three different test files).
- US1, US2 and US3 can proceed in parallel after US4: they touch disjoint tool directories. T014 ∥ T015 ∥ T015a within US2.
- US5: T021 ∥ T022 ∥ T023.
- US6: the tests T026 ∥ T027 ∥ T028, then T029 ∥ T030 ∥ T031 ∥ T032 ∥ T033 ∥ T034.

```text
# After Phase 2 + US4:
Task: "T012 [US1] bases routing tests"        Task: "T014 [US2] _template.test.ts"        Task: "T019 [US3] views_base open-mode tests"
Task: "T013 [US1] bases routing impl"         Task: "T015 [US2] create_base pipeline tests"  Task: "T020 [US3] listFocusedViews(vault)"
```

## Implementation Strategy

- **MVP**: Phase 1 + Phase 2 + US4 + US1. `bases {vault}` lists the named vault's Bases, and the default path is provably unchanged.
- **Increment 2**: US2, the only write and the largest piece of work, with both containment checks.
- **Increment 3**: US3, then US5 (the typed unknown-vault pre-check on the two remaining tools).
- **Increment 4**: US6, the documentation and the deliberate baseline move. Then polish (changelog, full gate, live T0, structural verification).

## Notes

- **CodeGraph task-pair check (CLAUDE.md `/speckit-tasks` rule)**: the task list crosses `server.ts`, three tool modules and the shared `_active-file.ts`.
  - `codegraph_explore "createServer createBasesTool createCreateBaseTool executeCreateBase assertCanonicalPath resolveVaultRootOrRemap listFocusedViews"` returned the path `createServer → createCreateBaseTool → executeCreateBase`. That path is reflected in the US2 dependency note above.
- **Analysis remediation (2026-11-02)**: the `/speckit-analyze` findings were resolved in the artifacts.
  - G1: T040's L8 step covers a closed vault.
  - I1: FR-013 permits V6.
  - A1: FR-006 is split, and V9 covers the no-file state.
  - U1: C11 moved into its own task, T015a.
  - U2: C12 added to T015.
  - I2, I3, I4, D1 and C1 were edits to spec.md and plan.md.
  - The shared helpers (`assertCanonicalPath`, `resolveVaultRootOrRemap`, `decodeEvalEnvelope`) are consumed, not edited, so no task pair edits both ends of an edge.
  - `listFocusedViews` has a single caller (`executeViewsBase`), so T020's signature change is contained.
- **Out of scope, not to be "fixed" in passing**: the `create_base` response-path construction (`handler.ts:91-95`), default-path containment, the raw `ENOENT`, and `name` folder-segment validation (plan Follow-ups).
- After review, the code-quality pass should update `.memory/refactor-decisions.md` item 16 to record that `create_base/handler.test.ts` no longer uses a bespoke `makeSpawn`, so the bespoke stub is retired across the tree.
