# Bug Assessment: A registered vault whose folder is missing fails with a raw ENOENT string

- **Slug**: bi-0185
- **Created**: 2026-11-04
- **Source**: pasted text (BI-0185, filed 2026-11-03; evidence TC-00727)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

Condensed from the BI-0185 report:

> Every other failure from these tools is a typed `{code, message, details}` envelope that callers branch on. This one is an untyped string, so an agent cannot tell "vault folder missing" from an internal crash, has no recovery hint, and sees an absolute path from the host's file system in the message.
>
> Verified on `@marwansaab/obsidian-cli-mcp@0.9.0-local` (Obsidian 1.14.5) with TC-00727 (fail): a scratch vault `OCM-Unavailable-Probe` was registered in Obsidian, then its folder was renamed on disk. `query_base` `{vault: "OCM-Unavailable-Probe", base_path: "x.base", view_name: "All"}` returned the raw string `ENOENT: no such file or directory, realpath 'C:\Users\sirzi\AppData\Local\Temp\OCM-Unavailable-Probe'`, with no `code`, no `details`, and an absolute disk path. The tool never reached the CLI. `paths` on the same vault returned a structured `CLI_REPORTED_ERROR` (`stage: "json-parse"`), so it is not affected.

Acceptance criteria (from the report):

1. A registered vault whose folder was renamed or deleted makes a base-view call fail with the documented structured error shape and a specific code for an unavailable vault.
2. Every other tool that resolves the vault's folder before running fails with the same code.
3. An unregistered vault name still gets the existing unknown-vault failure, unchanged and distinct.
4. Calls on an available vault are unchanged.
5. The message says the vault's folder could not be found and suggests restoring the folder or re-opening the vault in Obsidian.
6. No failure caused by a missing vault folder is ever a bare system error string without a code.

Out of scope (from the report): relocating, recreating or re-registering a missing vault; behaviour when Obsidian is not running; the unknown-vault failure; tools that already return a structured failure for this case.

## Symptom

When a vault is registered in Obsidian but its folder is gone from disk, the tools that check paths against the vault folder before calling Obsidian fail with Node's raw `ENOENT … realpath '<absolute vault path>'` text instead of a `{code, message, details}` envelope. Expected: a structured failure with a stable code and sub-state, a recovery hint, and no absolute disk path.

## Reproduction

Live reproduction (TC-00727, from the report):

1. Register a scratch vault in Obsidian (`OCM-Unavailable-Probe`).
2. Rename its folder on disk while it stays registered.
3. Call `query_base` with `{vault: "OCM-Unavailable-Probe", base_path: "x.base", view_name: "All"}`.
4. Observe the raw `ENOENT: no such file or directory, realpath '…\OCM-Unavailable-Probe'` result.

In-process reproduction (no vault needed): call any affected handler with `stubVaultRegistry("V", "/vaults/V")` and an `fs.realpath` that throws `{ code: "ENOENT" }` for every path. The handler rejects with the raw errno object, and `registerTool` rethrows it because it is neither a `ZodError` nor an `UpstreamError`.

## Suspected Code Paths

- `src/path-safety/canonical.ts:52` `checkCanonicalPath()`: `realpathNearestExisting(lexicalAbs)` walks up past the missing vault folder to an existing ancestor and succeeds, then line 59 `await deps.realpath(vaultRoot)` throws ENOENT for the vault root itself. This is the exact `realpath '<vault root>'` text in the report. If the whole drive is gone, the walk reaches the filesystem root and line 45 rethrows the ENOENT first. Both are vault-root-missing ENOENTs.
- `src/tools/_active-file.ts:359` `assertCanonicalPath()`: the shared Layer-2 guard every affected tool calls. It only handles the `ok: false` escape outcome and lets every throw from `checkCanonicalPath` through unchanged.
- `src/tools/_register.ts:214-237`: the handler-execution catch turns only `ZodError` and `UpstreamError` into an `isError` envelope. Anything else is rethrown (deliberately, so `ConfirmationRequested` can escape), and the SDK reports it as free text. That is how the raw string reaches the agent.
- Affected tools: each one resolves a named vault's folder through the registry and then calls `assertCanonicalPath` before any CLI call:
  - `src/tools/query_base/handler.ts:317-322` (`resolveVaultRoot` → `assertCanonicalPath(vaultRootRaw, input.base_path)`). This is the reported case.
  - `src/tools/create_base/handler.ts:90-92` (`containNamedVaultTarget`, named-vault mode only).
  - `src/tools/find_and_replace/handler.ts:476` and `:538` (single-note and folder/vault-wide scopes, `assertCanonicalPath(rawRoot, ".")`).
  - `src/tools/write_note/handler.ts:105-122` (specific mode; with `file`, a `findFileByTsv` CLI call comes first, see Open Questions).
  - `src/tools/append_note/handler.ts:63-73`, `src/tools/prepend/handler.ts:139-147`, `src/tools/patch_block/handler.ts:64-76`, `src/tools/patch_heading/handler.ts:65-82`, all through `resolveFsTarget` (`src/tools/_file-target.ts:75`). With `path`, the guard is the first disk access. With `file`, the `resolveFileByTsv` CLI call comes first.
- Not affected by this code path:
  - `bases`, `views_base`, `open_file`, `get_active_file` call only `resolveVaultRootOrRemap` and then the CLI. They never realpath the root.
  - `read` and `move` look up the root only after the CLI action (`fileTargetVaultRoot`).
  - `paths` is structured per the report.
  - The active-mode / focused-vault branches use the folder of the vault Obsidian has open, which cannot be missing in practice.

## Root Cause Hypothesis

`checkCanonicalPath` assumes the vault root exists. When it does not, its `realpath(vaultRoot)` (or, for a missing drive, the ancestor walk) throws a Node ENOENT. Neither `assertCanonicalPath` nor any affected handler classifies that error, so it escapes `registerTool`'s typed-error catch and reaches the client as the SDK's free-text error, with the absolute path that Node puts in the errno message. The unknown-vault case is typed only because the registry throws an `UpstreamError` before any disk access. A *known* vault with a missing folder passes the registry and fails one step later, in code that was never given a failure mapping. Confidence: **high**. The reported text matches line 59 exactly, and the `registerTool` rethrow path is unambiguous.

## Proposed Remediation

**Preferred**: classify the failure once, in the shared guard. In `assertCanonicalPath` (`src/tools/_active-file.ts`), wrap the `checkCanonicalPath` call. When it throws an errno whose code is `ENOENT`, or `ENOTDIR` (a segment of the vault path is not a folder), throw the typed folder-missing `UpstreamError` below. Under `checkCanonicalPath`'s contract, an ENOENT that escapes can only mean the vault root, or its drive, does not exist: the ancestor walk swallows every ENOENT below an existing root. Every other errno that escapes the check (EPERM, EIO, UNKNOWN, …) is wrapped too, never rethrown raw (owner ruling on Q4, Principle IV). It gets an existing structured envelope that keeps the errno, with no `folder-missing` reason, no hint and no absolute path (see "Other errnos" below).

Before the code change, `/speckit-bug-fix` probes every route listed under Q3 against a registered vault whose folder is missing (live, under `.memory/test-execution-instructions.md`), and records each route's result in `fix.md`. A route that already fails with a structured `UpstreamError` (any `code`) is left as it is. A route that lets a raw system error escape is fixed in this BI with the same `VAULT_NOT_FOUND` / `folder-missing` error. CLI answers that are already structured are not reclassified.

Per ADR-015 (sub-discriminators via `details.reason`) and the cohort's existing unknown-vault shape (`remapVaultNotFound`, `_active-file.ts:306`), the new failure is a new **reason** under the existing discriminator, not a new code:

```text
UpstreamError {
  code:    "CLI_REPORTED_ERROR"
  cause:   <the ENOENT errno>            // kept server-side; registerTool never serialises cause
  details: { code: "VAULT_NOT_FOUND", reason: "folder-missing", vault: ctx.vaultLabel }
  message: Vault "<name>" is registered with Obsidian, but its folder could not be found on disk.
           Restore the folder, or re-open the vault in Obsidian, then call again.
}
```

The message and `details` carry no absolute path. `vault` is the display name the caller supplied: `ctx.vaultLabel`, already threaded through every caller. `cause` keeps the errno for debugging and never goes on the wire. ADR-015 rejected a parallel `details.code` (`VAULT_UNAVAILABLE`) because it splits the discriminator namespace for one root failure category ("the vault you asked about is not reachable"). Under this shape, agents that branch on `details.code: "VAULT_NOT_FOUND"` handle it with no change, and `reason` tells the two remediations apart (`unknown` → register or fix the name; `folder-missing` → restore the folder or re-open the vault). No top-level code is added, so the Principle IV zero-new-codes streak holds and `src/errors.ts` stays unchanged.

The fix lives in the tools-layer guard, not in `src/path-safety/canonical.ts`. That keeps the path-safety module free of error-envelope knowledge, and no new import edge is needed. All affected tools pick the fix up without per-handler edits, and every `assertCanonicalPath` call site keeps its signature. `CanonicalGuardContext` gains no field, because the message names the vault, not the tool.

**Other errnos** (Q4 ruling): any errno other than ENOENT / ENOTDIR that escapes the root check becomes:

```text
UpstreamError {
  code:    "CLI_REPORTED_ERROR"
  cause:   <the errno>
  details: { stage: "vault-root-check", errno: <e.g. "EPERM">, vault: ctx.vaultLabel }
  message: The folder of vault "<name>" could not be checked (<errno>).
}
```

It uses the cohort's existing code and its existing `details.stage` key (as in `stage: "json-parse"` or `"focused-vault-resolve"`), so there is no new code and no new `details.code` / `details.reason`. It carries no folder-missing hint and no absolute path, so a real permission or I/O fault is not misreported as a missing folder. Any such errno the live check turns up is recorded in `fix.md` / `test.md`.

Each affected tool's help page (`docs/tools/<tool>.md`) then lists the new `CLI_REPORTED_ERROR` / `VAULT_NOT_FOUND` / `folder-missing` row in its error roster, in the fix commit, as ADR-015 requires ("each pair `(code, reason)` is enumerated explicitly in the per-tool docs"). That closes the report's "`query_base`'s documented error roster does not list this case". The `index.ts` descriptions and the FR-018 baseline do not change. The rest of the description and help wording stays with BI-0174 (owner ruling on Q2).

**Alternatives**:
- Put the ENOENT check inside `checkCanonicalPath` as a third outcome (`{ ok: false, kind: "root-missing" }`) and map it in `assertCanonicalPath`. Cleaner typing, but it changes the `CanonicalCheckOutcome` union and `canonical.test.ts` for no behavioural gain. Not preferred.
- Probe the root with `realpath` in the registry (`resolveVaultPath`) right after the name resolves. That catches it before the guard, including for `bases` / `views_base`. But it adds a syscall to every lookup, puts filesystem knowledge in the registry, and changes tools that already return a structured failure (out of scope). Not preferred.
- Top-level code `VAULT_UNAVAILABLE`, or `details.code: "VAULT_UNAVAILABLE"`. The first breaks Principle IV's zero-new-codes streak. The second is option (b), which ADR-015 rejected. Not preferred.

**Files likely to change**:
- `src/tools/_active-file.ts` (`assertCanonicalPath`, plus one small private builder for the new error)
- `src/tools/_active-file.test.ts` (helper-level cases)
- Co-located handler tests of the affected tools (one case each): `src/tools/query_base/handler.test.ts`, `src/tools/create_base/handler.test.ts`, `src/tools/find_and_replace/handler.test.ts`, `src/tools/write_note/handler.test.ts`, `src/tools/append_note/handler.test.ts`, `src/tools/prepend/handler.test.ts`, `src/tools/patch_block/handler.test.ts`, `src/tools/patch_heading/handler.test.ts`
- `docs/tools/{query_base,create_base,find_and_replace,write_note,append_note,prepend,patch_block,patch_heading}.md` (error roster, in the fix commit, per Q2). The `index.ts` descriptions and `_register-baseline.json` do not change.
- Only if the Q3 probe finds a route that escapes raw: the handler or shared resolver on that route (candidates: `src/tools/_active-file.ts` `resolveFileByTsv` / `findFileByTsv`, `src/tools/bases/handler.ts`, `src/tools/views_base/handler.ts`), plus its co-located test.

**Tests to add or update**:
- `_active-file.test.ts`:
  - (a) `fs.realpath` throws ENOENT for the root → rejects with `CLI_REPORTED_ERROR` / `{code: "VAULT_NOT_FOUND", reason: "folder-missing", vault}`, and neither the message nor any `details` value contains the root path.
  - (b) the drive-missing walk (ENOENT at every ancestor) → same envelope.
  - (b2) `fs.realpath` throws ENOTDIR for the root → the same folder-missing envelope.
  - (c) another errno (e.g. `EPERM`, `EIO`) → `CLI_REPORTED_ERROR` with `details: {stage: "vault-root-check", errno, vault}`, `cause` the errno, no `reason`, and the root path in neither the message nor `details` (Q4).
  - (d) existing escape and success cases unchanged.
  - (e) `pathEscapeAttempt` is NOT logged for a missing root.
- One handler-level case per affected tool: a registry that knows the vault plus an `fs.realpath` that throws ENOENT for the root → the typed envelope, and **no spawn** (`makeQueuedSpawn([])` + `getCount() === 0`), for the `path` locator where there is one.
- A registered-tool (`registerTool` / index-level) case for `query_base`: the result is `isError: true` with the JSON `{code, message, details}` text, not a free-text error. This pins acceptance criterion 6 end to end.
- Unknown-vault regression: an unregistered name still yields `VAULT_NOT_FOUND` / `reason: "unknown"` byte-identically (the existing tests cover it; they must pass unchanged).
- For each route the Q3 probe finds escaping raw: a co-located test that reproduces it in-process and pins the folder-missing envelope.
- Live check: `/speckit-bug-fix` probes every Q3 route before the change and records each result in `fix.md`. `/speckit-bug-test` re-runs TC-00727 and the same routes after the fix, under the authorised test vault protocol (`.memory/test-execution-instructions.md`).

## CodeGraph structural check

- **Affected modules**: the shared tools-layer guard `src/tools/_active-file.ts` (`assertCanonicalPath`). The change reaches eight tools through it: `query_base`, `create_base`, `find_and_replace`, `write_note`, `append_note`, `prepend`, `patch_block`, `patch_heading`. `src/path-safety/canonical.ts` (`checkCanonicalPath`) is read, not changed. `src/tools/_register.ts` is not changed: its typed-error catch already handles an `UpstreamError`.
- **Blast radius**: `assertCanonicalPath` sits on the runtime path of every direct-filesystem tool and of the Bases tools that check a `.base` path. Its callers are those eight handlers, and their co-located handler suites are the regression net. Only errors thrown by the vault-root check change behaviour: ENOENT / ENOTDIR become the folder-missing envelope, and any other errno becomes the `vault-root-check` envelope (Q4). The success path and the `PATH_ESCAPES_VAULT` escape path (including the `pathEscapeAttempt` logger payload) are unchanged. If the Q3 probe finds another route that escapes raw, the fix for it is checked again in `fix.md`'s `## CodeGraph structural verification`.
- **Kernel nodes**: the fix touches **none** of the kernel nodes. `createLogger()`, `createQueue()` and `createServer()` are untouched. `UpstreamError` is constructed like in every other handler, with an existing code; the class and `src/errors.ts` are unchanged. No handler imports a boot-time DI factory.
- **Error spine**: no new top-level code (Principle IV). One new `details.reason` value (`folder-missing`) under the existing `VAULT_NOT_FOUND` discriminator, the additive ADR-015 pattern.
- **Module direction**: `_active-file.ts` already imports `../errors.js` and `../path-safety/canonical.js`. No new import edge.

## Risks & Considerations

- **Published surface**: the fix changes only `docs/tools/*.md`. The `index.ts` descriptions (some list "Typed errors via …") are not touched, so the FR-018 fingerprint gate must pass without `npm run baseline:write` (Q2 ruling; the remaining description and help wording stays with BI-0174).
- **ENOENT attribution**: under `checkCanonicalPath`'s contract an escaping ENOENT means the root is missing. A race where the vault folder is deleted between the guard and a later read is classified by the later stage's existing mapping (e.g. `NOTE_NOT_FOUND`). That is acceptable and unchanged.
- **Other errnos on a disconnected drive**: Windows may report a missing network or removable drive as something other than ENOENT (e.g. `EPERM`, `EIO`, `UNKNOWN`). Per Q4 these get the structured `vault-root-check` envelope, which keeps the errno and leaves out the folder-missing hint. A real drive-missing state reported that way therefore gets no restore hint. That is the deliberate trade against misreporting permission or I/O faults.
- **`file` locators and `bases` / `views_base`**: with `file` (wikilink name) instead of `path`, `write_note` and the four `resolveFsTarget` editors call `obsidian file` before the guard, and `bases` / `views_base` go straight to the CLI. What the CLI answers for a vault whose folder is missing decides whether those calls fail structured (left as is) or escape raw (fixed here, per Q3). If a route needs a fix, its error has to be recognised at that route, which may widen the diff beyond `_active-file.ts`. The probe result in `fix.md` bounds it.
- **Security**: the change removes an absolute-path leak from one failure. `cause` holds the errno server-side only (`registerTool` serialises `code`, `message`, `details`).
- **ADR alignment**: follows ADR-015 (reason sub-discriminator) and ADR-009 (direct-fs path, canonical guard). The report asks for "a specific code"; under ADR-015 that is the `(VAULT_NOT_FOUND, folder-missing)` pair, not a new code. This is the ADR-sanctioned reading, not a conflict.
- **Naming overlap**: `_shared.ts:42` already uses "(vault unavailable)" for a closed vault that cannot be brought up (`CLI_REPORTED_ERROR` with `Error: Command "…" not found.`). Calling this state `unavailable` too would merge two different remediations under one word. Hence `folder-missing`.

## Open Questions

- **Q1: reason literal.** Options were A `"folder-missing"` (recommended), B `"unavailable"` (TC-00727's title), C `"missing-folder"`. Grounding: `remapVaultNotFound` (`src/tools/_active-file.ts:306`) emits the sibling `reason: "unknown"`, and `_shared.ts:42` already uses "vault unavailable" for the closed-vault state.
  Resolved (Relay): **A**, `details.reason: "folder-missing"` under `CLI_REPORTED_ERROR` / `details.code: "VAULT_NOT_FOUND"`.
- **Q2: where the error roster is documented.** Options were A `docs/tools/*.md` only, in the fix commit (recommended), B also the `index.ts` descriptions (moves the FR-018 baseline for eight tools), C leave all docs to `/speckit-docs-as-code`.
  Resolved (Relay): **A**. Owner ruling 2026-11-04: in this fix, add the `CLI_REPORTED_ERROR` / `VAULT_NOT_FOUND` / `folder-missing` row to the `docs/tools/*.md` error roster of every affected tool, as ADR-015 requires. Do not change the `index.ts` descriptions or the baseline. The remaining description and help wording stays with BI-0174 (see the BI-0185 Out of scope section).
- **Q3: routes outside the shared guard** (`file` locators on write_note / append_note / prepend / patch_block / patch_heading; `bases` / `views_base`). Options were A probe in bug-test and make raw escapes a follow-up (recommended), B probe now and fix raw escapes in this BI, C no probe.
  Resolved (Relay): owner ruling, **probe every listed route in this BI**. A route that already fails with a structured error (any `UpstreamError` with a `code`) is left as it is. A route that lets a raw system error escape is fixed in this BI with the same `VAULT_NOT_FOUND` / `folder-missing` error. CLI answers that are already structured are not reclassified (out of scope). Each route's probe result is recorded in `fix.md`, which answers the BI's "confirm which tools are affected" point. Basis: BI-0185's "no raw system errors" story and its "same code for any other tool that resolves the vault's folder" criterion. Its Out of scope excludes only tools that already return a structured failure. Remediation, Files and Tests above are updated to match.
- **Q4: errnos other than ENOENT on the vault root.** Options were A ENOENT only, rethrow the rest unchanged (recommended), B ENOENT plus a fixed list, C any error from the root check.
  Resolved (Relay): owner ruling, **ENOENT and ENOTDIR map to `VAULT_NOT_FOUND` / `folder-missing`. Every other errno (EPERM, EIO, UNKNOWN, …) is wrapped in an existing structured `UpstreamError` envelope** that keeps the errno code in `details`, with no `folder-missing` reason or hint, no absolute path in the message, and no new code or reason. Envelope chosen to fit: `CLI_REPORTED_ERROR` with `details: {stage: "vault-root-check", errno, vault}` (see "Other errnos" under Proposed Remediation). Any errno the live check turns up is recorded in `fix.md` / `test.md`. Basis: Principle IV (errors crossing the boundary MUST be `UpstreamError`, so rethrowing unchanged would leave a raw escape in the code this fix touches) and BI-0185's no-disk-paths story. Remediation, Tests and Risks above are updated to match.
