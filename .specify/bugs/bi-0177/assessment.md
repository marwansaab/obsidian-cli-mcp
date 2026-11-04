# Bug Assessment: move reports a file blocking the destination folder as FOLDER_NOT_FOUND

- **Slug**: bi-0177
- **Created**: 2026-11-04
- **Source**: pasted text (backlog item BI-0177, test case TC-00701; no URL supplied, so the URL Trust Policy did not apply)
- **Verdict**: valid
- **Severity**: low

## Report (verbatim or summarized)

> **Impact.** Spec 090's edge case "Destination folder name exists as a file" says a destination whose folder segment names an existing file is not a missing folder and must not carry the destination-folder-not-found signal. The tool classifies it as `FOLDER_NOT_FOUND` anyway, and the recovery hint (create the folder, then retry) cannot be followed, because a file already holds that name. An agent acting on the hint will either fail to create the folder or loop. Low frequency — it needs a destination path that runs through a file name — but it is a plain contract violation of the spec BI-0172 just shipped, and the misleading recovery advice is the harm the classification was meant to remove.
>
> **Status and evidence.** *Planned.* Filed 2026-11-02 from the 0.9.0-local test run of the 24 in-review BIs. Follow-up to BI-0172 - Classify Move Missing Destination Folder Error (spec `090-classify-missing-destination`), which stays in review. Evidence: TC-00701 - Move Destination Folder Segment Naming A File Is Not FOLDER_NOT_FOUND (fail on `@marwansaab/obsidian-cli-mcp@0.9.0-local`). In `TestVault-Obsidian-CLI-MCP`, `move` with `path: "Fixtures/BI-0172/c07/MoveMe.md"` and `to: "Fixtures/BI-0172/c07/Blocker.md/"`, where `Blocker.md` is an existing note, returned `CLI_REPORTED_ERROR` with `details.code: "FOLDER_NOT_FOUND"`, `details.folder: "Fixtures/BI-0172/c07/Blocker.md"` and a message saying that folder "does not exist in the vault" and advising the caller to create it and retry. No absolute path leaked and nothing changed on disk, so the other BI-0172 rules held.

Expected behaviour, condensed from the report's "Distinguish blocked destination" feature text:

- **File in the way.** Given a note `Blocker.md` exists, moving another note to `Blocker.md/` in the same folder fails. The error does not say the destination folder is missing, and it states that an existing file has that name. Its recovery advice does not tell the agent to create the folder. It contains no absolute disk path, and neither file changes.
- **Missing folder unchanged.** When the destination folder does not exist and no file has its name, the error still reports a missing destination folder, as it does today.
- **Out of scope.** Creating destination folders automatically; renaming or removing the blocking file; other move failures, such as an existing destination file.

## Symptom

A `move` whose destination runs through an existing file (for example `to: "Inbox/Note.md/"` where `Inbox/Note.md` is a note) fails with `details.code: "FOLDER_NOT_FOUND"` and advice to create the folder. Spec 090's edge case "Destination folder name exists as a file" (`specs/090-classify-missing-destination/spec.md:87`) requires that this case not carry that signal. The report further asks that the error say a file is in the way.

## Reproduction

1. In a vault, create `Fixtures/BI-0172/c07/MoveMe.md` and `Fixtures/BI-0172/c07/Blocker.md`.
2. Call `move` with `target_mode: "specific"`, the vault's name, `path: "Fixtures/BI-0172/c07/MoveMe.md"` and `to: "Fixtures/BI-0172/c07/Blocker.md/"`.
3. Observe `CLI_REPORTED_ERROR` with `details: { code: "FOLDER_NOT_FOUND", folder: "Fixtures/BI-0172/c07/Blocker.md" }` and the "Create the folder … then retry" message. Both files are unchanged.

This is TC-00701's run on Windows, against `@marwansaab/obsidian-cli-mcp@0.9.0-local`. The assessment did not re-run it live. The CLI line behind the failure is inferred below and is not yet captured verbatim. The open item was the exact stdout of `obsidian move path=… to=…/Blocker.md/MoveMe.md` on Windows, and the equivalent on macOS/Linux.

Resolved (Relay): `/speckit-bug-fix` runs a T0 live probe on Windows in the authorised test vault, under `.memory/test-execution-instructions.md`. The probe goes through the production `Obsidian.com` shim, the binary the wrapper resolves, and never `Obsidian.exe`: the project's Best Practices (Tooling and Environment) record that `.exe` probes gave false-clean output and corrupted CLI state. It sends exactly what `executeMove` forwards for a `path` locator (`path=…/MoveMe.md to=…/Blocker.md/MoveMe.md`) and records the verbatim stdout line in `fix.md`. TC-00701 shows the Windows line matches the ENOENT regex but did not record the line itself, so this capture closes that gap. The POSIX `ENOTDIR` row stays inferred from libuv's error format (spec 090 F5); its unit row is marked inferred and it is listed in `fix.md` as a residual.

## Suspected Code Paths

- `src/tools/move/handler.ts:123` (`executeMove`): for a `path` locator, the folder form `Blocker.md/` is expanded by `resolveTo` (line 34) to `Blocker.md/MoveMe.md` and forwarded in full. The CLI then attempts an fs rename into `…\Blocker.md\MoveMe.md`.
- `src/tools/move/handler.ts:64` (`ENOENT_RENAME_RE`) and `:73` (`isMissingDestinationFolder`): these match any `Error: ENOENT: …, rename '` line. On Windows, renaming into a path whose parent segment is a file fails with ENOENT (`ERROR_PATH_NOT_FOUND` maps to ENOENT in libuv), which looks the same as a missing folder.
- `src/tools/move/handler.ts:100-104` (`moveFailure`): classifies every non-root ENOENT rename as `folderNotFound(folder)` with no lookup (spec 090 research F7, D2), so nothing can tell "missing" apart from "a file is in the way".
- `src/tools/move/handler.ts:78-85` (`folderNotFound`): the message and advice the report calls misleading.
- `specs/090-classify-missing-destination/research.md:16` (probe P5) and `:28` (F4): the spec 090 probe for this edge case sent the folder form straight to the CLI (`to=Sandbox/090-probe/Other.md/`). The CLI expanded it itself and answered `Error: Destination file already exists!`. The handler, however, expands the folder form *before* the CLI for a `path` locator, so the tool never reaches that branch, and P5 never exercised what the tool actually sends.
- `src/tools/move/handler.missing-destination.test.ts:392` (M15, "an existing destination file (also what a file used as a folder gives) keeps today's error"): it encodes P5's assumption and stubs the `Destination file already exists!` line. No row feeds an ENOENT rename whose folder is a file.

## Root Cause Hypothesis

Spec 090 recognises a missing destination folder only by the CLI's ENOENT rename line (research D2), and it marked the file-as-folder edge case as handled because probe P5 returned a different line (`Destination file already exists!`). P5 sent the raw folder form, but `executeMove` expands the folder form for a `path` locator, so the CLI gets a full destination path through the file. Node's rename then fails, and on Windows that failure is ENOENT, the same line a missing folder produces. `moveFailure` therefore reports `FOLDER_NOT_FOUND` with folder `…/Blocker.md`. The same misclassification follows for any locator whenever `to` is a full path through a file (for example `to: "Inbox/Note.md/Renamed.md"`), because that form is always forwarded as given. On macOS and Linux the same rename should fail with ENOTDIR, not ENOENT (inferred from libuv, not probed). That would not match the regex, so the failure would pass through as a generic, root-rewritten `CLI_REPORTED_ERROR`: it would not wrongly say "missing", but it would not say a file is in the way either. Confidence: **medium-high**. The classification path is certain from the code and TC-00701. The exact CLI line on Windows and the ENOTDIR form on POSIX are inferred, not captured.

## Proposed Remediation

**Preferred**: confirm with a lookup before reporting a missing folder, and only on the failure path. When `moveFailure` sees a rename failure into a non-root folder (the existing ENOENT match, widened to `ENOENT|ENOTDIR` so the POSIX form is covered), it runs one `invokeEval` in the move's vault: `target.vault` in specific mode, `undefined` (the focused vault) in active mode, the same vault the move used. The eval walks the folder's ancestor prefixes from the shortest (`Fixtures`, `Fixtures/BI-0172`, …, `Fixtures/BI-0172/c07/Blocker.md`) and returns the first one that `app.vault.getAbstractFileByPath` resolves to a file, or `null`. It follows the `paths` tool's frozen-template pattern: a `_template.ts` with a base64 JSON payload through `composeEvalCode` (anti-injection), an envelope decoded by `decodeEvalEnvelope` against a Zod schema in `schema.ts`.

- If a file is found, the move fails as `CLI_REPORTED_ERROR` with `details: { code: "NOT_A_FOLDER", folder: <the blocking file's vault-relative path, forward slashes> }` and no other keys, mirroring the `FOLDER_NOT_FOUND` shape. There is no `details.reason`, because the condition has only one sub-state. The message says that an existing file has that name where the destination folder should be, and that nothing was moved. Its recovery advice is to rename or remove that file, or to pick another destination; it never tells the agent to create the folder. It carries no `cause`, like `folderNotFound`. `NOT_A_FOLDER` is an existing `details.code` sub-discriminator already published by `paths` (`src/tools/paths/schema.ts:50`, `_template.ts:15`) for exactly "this folder path is a file". Reusing it adds no new top-level code (Principle IV) and keeps one name for one meaning across tools, as ADR-015's rationale asks.
- `move` documents `NOT_A_FOLDER` itself, next to `FOLDER_NOT_FOUND`, in its tool description (`MOVE_DESCRIPTION`, `src/tools/move/index.ts:10`) and in its help page (`docs/tools/move.md`, which the `help` tool serves). The vault records `paths`' `NOT_A_FOLDER` as undocumented (Fix-It discrepancies report), so `move` cannot lean on `paths`' documentation.
- If no file is found, the failure is today's `FOLDER_NOT_FOUND`, unchanged (story "missing folder unchanged"). On ENOTDIR with no file found, which should not happen, the failure falls through to the existing root-rewrite path instead, so it is never misreported as missing.
- If the lookup itself fails (the eval times out, Obsidian stops answering, or the answer cannot be parsed), the result follows the rule BI-0172's 2026-11-02 `/speckit-analyze` follow-up set for a failed lookup (spec 090 data-model E4c, `withheldFailure`, `handler.ts:89-97`). The move's code (`CLI_REPORTED_ERROR`) is kept and the raw CLI text is withheld. The message names the vault-relative source and destination and says the destination folder could not be checked, `details` is `{ source, destination }` with no `details.code`, and the lookup failure is the `cause`. It is never reported as `FOLDER_NOT_FOUND`, because that would be the silent fallback Principle IV forbids. Cancellation (a non-`UpstreamError` abort reason) is rethrown untouched, as `moveFailure` already does.

The success path and every non-rename failure are unchanged: still one spawn, no extra lookup.

**Alternatives**:
- *Stat the folder prefixes on disk through the vault root* (`fileTargetVaultRoot` plus an injected `fs.stat`). This works without Obsidian's index, but it adds an fs dependency and a registry lookup to `move`, which today is a pure CLI pass-through. It also needs `realpath` containment for a caller-supplied path (Security Defaults), and it duplicates what the vault index already knows. Rejected for added surface.
- *Pre-check the destination before calling the CLI.* This adds a CLI round-trip to every successful move and races with the CLI anyway. Rejected: the cost lands on the common path for a rare failure.
- *Stop expanding the folder form for `path` locators* (forward `Blocker.md/` raw, so the CLI answers P5's `Destination file already exists!`). This changes the argv contract spec 070 fixed (contracts/tool-support.md invariant 4). It fixes only the trailing-`/` form, not `to: "Blocker.md/Renamed.md"`. And it trades one misleading message for another ("destination file exists"). Rejected.

**Files likely to change**:
- `src/tools/move/handler.ts`: widen the rename match, add the blocked-folder lookup and the `NOT_A_FOLDER` failure in `moveFailure`, and update the attribution header's summary.
- `src/tools/move/_template.ts` (new): the frozen eval template for the ancestor-prefix walk, with an `Original — no upstream` header.
- `src/tools/move/schema.ts`: the Zod envelope schema for the lookup's answer (`{ ok: true, blocker: string | null }`); input and output schemas unchanged.
- `src/tools/move/handler.missing-destination.test.ts`: new rows (below); the M1–M7 rows gain the lookup's eval response in their spawn queue.
- `src/tools/move/index.ts`: `MOVE_DESCRIPTION` names the `NOT_A_FOLDER` failure and its recovery next to `FOLDER_NOT_FOUND`, and the header's summary says so.
- `src/tools/move/index.test.ts`: only if an assertion pins the description's wording.
- `src/tools/_register-baseline.json`: the `move` entry's `descriptionFingerprint` is regenerated. This is a deliberate description change, so it passes the MCP Tool Surface Standards fingerprint gate; the schema, title, annotations and output-schema fingerprints stay as they are.
- `docs/tools/move.md`: an Errors row for `NOT_A_FOLDER` next to the `FOLDER_NOT_FOUND` row, with the rename-or-remove recovery, in the fix itself, because the answer to Q1 makes it part of the fix. `/speckit-docs-as-code` still handles `.docs-as-code/` afterwards.

**Tests to add or update** (all in-process, with `invokeCli`/`invokeEval` stubbed through `makeQueuedSpawn`):
- An ENOENT rename into `Fixtures/c07/Blocker.md/MoveMe.md`, with a lookup answering `Fixtures/c07/Blocker.md` → `NOT_A_FOLDER`. `details` equals exactly `{ code: "NOT_A_FOLDER", folder: "Fixtures/c07/Blocker.md" }`, with no `reason` key. The message says an existing file has that name and advises renaming or removing it or picking another destination; it does not contain "does not exist" or "Create the folder". There is no absolute path in the message or details, in Windows and POSIX root forms. Two spawns. The stubbed ENOENT line is the one the T0 probe captures.
- A blocker that is an ancestor, not the last segment (`to: "Inbox/Note.md/Sub/"`) → `NOT_A_FOLDER` naming `Inbox/Note.md`.
- The ENOTDIR rename form (POSIX) with a blocker → `NOT_A_FOLDER`. The row's title marks the line as inferred, not probed.
- An ENOENT rename where the lookup answers `null` → today's `FOLDER_NOT_FOUND`, byte-identical to M1.
- A lookup that fails (non-zero exit or timeout) → not `FOLDER_NOT_FOUND`. The move's code `CLI_REPORTED_ERROR` is kept, `details` is `{ source, destination }`, the raw CLI text is absent, the lookup failure is the `cause`, and there is no absolute path (as M18 for the withheld failure).
- `MOVE_DESCRIPTION` names `NOT_A_FOLDER` and its recovery, and the registry baseline test passes against the regenerated `move` description fingerprint.
- The `help` docs-sync test (`src/tools/help/docs-sync.test.ts`) still passes with the new `docs/tools/move.md` row.
- Active mode → the lookup eval carries no `vault=`, and no registry lookup is made.
- M15 stays: the raw `Destination file already exists!` line is still passed through unchanged. Its title drops the "also what a file used as a folder gives" claim, which this bug disproves.
- M17 (success) and M10 (EPERM) stay as they are: still one spawn, no lookup eval.

## Risks & Considerations

- **Behaviour change on the missing-folder path.** A genuine missing folder now costs a second CLI call (the eval), so `FOLDER_NOT_FOUND` becomes subject to eval failures it was immune to. The lookup-failure rule above keeps those failures loud, not misclassified. Spec 090's F7 statement ("needs no vault lookup") no longer holds for this branch, and the docs and `.docs-as-code/` pages should drop it.
- **Index staleness.** `getAbstractFileByPath` reads Obsidian's in-memory index, which can briefly lag a file created outside Obsidian. The worst case is today's behaviour (`FOLDER_NOT_FOUND`), never a new wrong answer.
- **Case-insensitive file systems.** On Windows/macOS, `blocker.md` on disk versus `Blocker.md` in `to` may miss in the index lookup (case-sensitive keys), which again falls back to today's behaviour. Acceptable residual; record it as a known limit.
- **Eval injection.** The folder string is caller-supplied, so it must travel only through the base64 JSON payload of `composeEvalCode`, never interpolated into the template (as in `paths`).
- **Absolute paths.** The new failure is built only from vault-relative strings and carries no CLI text, so FR-005 holds with no root rewrite.
- **POSIX form unprobed.** The ENOTDIR branch rests on libuv's error format (spec 090 F5), not a live probe. Its unit row is marked inferred, and `fix.md` lists it as a residual (Resolved (Relay), Q3).
- **Published description changes.** `MOVE_DESCRIPTION` is part of the published tool surface, so the `move` description fingerprint in `src/tools/_register-baseline.json` changes deliberately in this fix.
- **Spec 090 traceability.** The fix completes spec 090's edge case; BI-0172 stays in review. The TC-00701 run on the next `-local` build is the acceptance evidence.

## CodeGraph structural check

- **Affected modules**: `src/tools/move/` (`handler.ts`, `schema.ts`, a new `_template.ts`, `index.ts` for `MOVE_DESCRIPTION`, and the co-located tests), plus the `move` entry of the data file `src/tools/_register-baseline.json`. `MOVE_DESCRIPTION` is consumed only by `createMoveTool` and its test. It composes existing helpers: `invokeEval` (`src/cli-adapter/cli-adapter.ts:115`), `composeEvalCode` (`src/tools/_shared.ts`) and `decodeEvalEnvelope` (`src/tools/_active-file.ts`). Imports run one way, from the tool module down to shared helpers and the CLI adapter.
- **Blast radius**: `moveFailure`, `isMissingDestinationFolder`, `destinationFolder` and `folderNotFound` each have one caller, all inside `move/handler.ts`. `executeMove` is called only from `src/tools/move/index.ts`. Tests touched: `move/handler.missing-destination.test.ts` (and `move/handler.test.ts` only if a stub queue needs the extra response). `invokeEval` and `decodeEvalEnvelope` are consumed, not changed, so their many other callers are unaffected. `resolveFileTarget` and `fileTargetVaultRoot` are not changed.
- **Kernel nodes**: the fix touches **none** of the kernel nodes. `createLogger()` and `createQueue()` are not constructed or imported (the handler keeps receiving `logger`/`queue` through `ExecuteDeps`). `createServer()` is not touched. `UpstreamError` is only instantiated, as every handler does, and its definition and code set in `src/errors.ts` are unchanged. No new top-level error code: `NOT_A_FOLDER` is an existing `details.code` sub-discriminator.

## Open Questions

All three items were put to the owner through Relay on 2026-11-04 and answered.

- **Q1 — the `details.code` for a file in the way.** Resolved (Relay): reuse `NOT_A_FOLDER` under `CLI_REPORTED_ERROR`, with `details.folder` set to the blocking file's vault-relative path, mirroring the `FOLDER_NOT_FOUND` shape. Add no `details.reason`, because there is only one sub-state. The message says an existing file has that name, and the recovery advice is to rename or remove that file or pick another destination, never to create the folder. `move` documents `NOT_A_FOLDER` in its description and help, next to `FOLDER_NOT_FOUND`. Why: the BI's acceptance criteria ask that the error state an existing file has that name and give no create-folder advice. ADR-015's rationale rejects fragmenting the discriminator namespace with a second name for one condition, and Principle IV forbids new top-level codes. The vault records `paths`' `NOT_A_FOLDER` as undocumented (Fix-It discrepancies report), so `move` documents the value itself. (Reflected in Proposed Remediation, Files likely to change and Tests.)
- **Q2 — a failed blocker lookup.** Resolved (Relay): option A. Keep the move's code, withhold the raw CLI text, name the vault-relative source and destination, and attach the lookup failure as the cause. Why: BI-0172's 2026-11-02 `/speckit-analyze` follow-up already set this rule for a failed lookup (spec 090 data-model E4c), and falling back to `FOLDER_NOT_FOUND` is the silent fallback Principle IV forbids. (Reflected in Proposed Remediation and Tests.)
- **Q3 — the verbatim CLI line for a rename through a file.** Resolved (Relay): option A, with one addition. `/speckit-bug-fix` runs a T0 live probe on Windows through the production `Obsidian.com` shim, never `Obsidian.exe`, sending exactly what `executeMove` forwards for a `path` locator, and records the verbatim line in `fix.md`. The POSIX `ENOTDIR` row is marked inferred and listed as a residual. Why: Best Practices (Tooling and Environment) record that `.exe` probes gave false-clean output and corrupted CLI state, and TC-00701 shows the Windows line matches the ENOENT regex without recording the line, so a fix-time capture closes the gap. (Reflected in Reproduction, Tests and Risks.)
