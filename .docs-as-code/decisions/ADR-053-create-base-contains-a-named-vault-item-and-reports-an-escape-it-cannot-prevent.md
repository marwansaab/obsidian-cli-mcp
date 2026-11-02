# ADR-053 — `create_base` checks containment before creating in a named vault, and reports an escape it finds afterwards without deleting

- **Status:** Accepted
- **Date:** 2026-11-02
- **Source:** PR #114 (BI-0139, `specs/083-enable-cross-vault-bases/`,
  Clarifications Q1 and Q4, research P1 to P9, D5 and the F7 correction,
  contract `contracts/bases-cross-vault-contract.md` §3 and §4, T040 live
  validation), commits `4252884`, `dc827e2` and `7e338fb`
- **Related:** ADR-009 (Direct Filesystem Write Path Alongside CLI Bridge),
  whose §2 realpath containment check this record reuses, unchanged.
  ADR-015 (Sub-Discriminators via details.reason for Multi-State Error
  Codes): no `details.reason` is added; `createdPath` is an attribution key.
  ADR-052 (Typed evals go through `invokeEval` and carry a per-call answer
  tag), the route the item-folder eval takes.

## Context

Until PR #114 `create_base` accepted `vault` and ran `base:create` with no
`vault=`, so the item was written to the vault in front, whatever the caller
named. The plan-time probes showed `base:create` honours `vault=` (research
P4), so routing could be fixed by passing the name through. That raised the
question the other named-vault writers had already answered: is the write
inside the vault the caller named? `query_base` and `prepend` resolve the
vault root from the registry and run the ADR-009 §2 realpath check before
they touch anything.

`create_base` cannot do that check directly, because it does not choose where
the item lands. Obsidian does, and reports the result only afterwards, on the
CLI's `Created:` line (research P5, P6). The folder follows the Base's
filters when they pin one folder, and Obsidian's new-note folder otherwise.

## Decision

1. **Only when a vault is named** (Clarifications Q1). With `vault`, the
   handler resolves the root through the registry (`VAULT_NOT_FOUND` /
   `unknown` before any spawn) and runs the checks below. With no `vault`,
   argv, result, `details` and messages are byte-identical to before
   (FR-011). The same gap on the default path is a recorded follow-up.
2. **Two checks before creation** (Clarifications Q4). `assertCanonicalPath`
   runs on `base_path`, then on the folder the item will land in: the Base's
   single top-level `file.inFolder("<f>")` folder if there is one, otherwise
   `app.fileManager.getNewFileParent`, joined with any folder part of `name`.
   The folder is learned through a frozen eval, `ITEM_FOLDER_TEMPLATE` in
   `src/tools/create_base/_template.ts`, decoded by `decodeEvalEnvelope`
   against `itemFolderEvalResponseSchema` (`{ok:true, folder}` or
   `{ok:false, code:"BASE_NOT_FOUND"}`). Either escape fails with the existing
   `PATH_ESCAPES_VAULT` and nothing is written.
3. **One check after creation, which reports and never deletes.** The
   `Created:` path is checked again. An escape there re-throws
   `PATH_ESCAPES_VAULT` with `details.createdPath` and a message saying the
   item was created and not deleted. `containNamedVaultTarget` returns this
   backstop as a closure, so the vault is held once (review of PR #114,
   commit `dc827e2`).
4. **The template scans block YAML; it does not parse it.** Research F7
   assumed the eval context had Obsidian's `parseYaml`. The T040 live run
   refuted it: `parseYaml` is a `ReferenceError` there and
   `require('obsidian')` is `Cannot find module 'obsidian'`. With the planned
   template every filtered Base fell to the new-note branch, so the
   pre-creation check only ever checked the vault root. The template now
   reads the block-style YAML Obsidian itself writes: a top-level `filters:`
   scalar, or a block `and:` list of string entries in single, double or no
   quotes. Flow style (`filters: {and: [...]}`) and `or` / `not` groups take
   the new-note branch, and decision 3 covers what that misses.

## Alternatives rejected

- **Delete the item when the backstop finds an escape.** A delete is an
  irreversible second write on a path the server has just learned is outside
  the vault it was asked to work in. Reporting the written path keeps
  Principle IV (the failure names what happened) without the server acting
  outside the vault a second time (Clarifications Q4).
- **Check only after creation.** The common case, a filtered Base or the
  new-note folder, can be checked before anything is written; a
  post-creation-only check would turn every escape into a written item.
- **Containment on the default path too.** Q1 kept FR-011's byte-identical
  default path; that gap predates the PR and is a follow-up.
- **A `details.reason` for the backstop.** The code and its recovery are the
  same either way; `createdPath` is what a caller needs, and ADR-015 reserves
  `reason` for distinct states.
- **Move the `filters:` scan out of the eval into a TypeScript function.**
  Raised in review of PR #114: the eval would return the `.base` text and the
  new-note folder, and a pure function would pick the folder. The owner kept
  the template as it is (option A, commit `7e338fb`). The change is invisible
  to callers, but it alters the internal envelope that data-model E2 and
  contract §3 and §4 define, and it would need T1 to T5 re-run live. The
  scanner is covered in-process instead (below). It stays a possible
  follow-up in `post-implement.md`.

## Consequences

- A named-vault `create_base` makes two CLI calls on success, the
  item-folder eval and `base:create` with `vault=`, where it used to make
  one (handler case C9 pins two). The registry's `vaults verbose` probe is
  cached after first use, and the backstop only reads the disk. An
  unregistered vault costs no `base:create` or eval spawn.
- The pre-creation folder is a mirror of Obsidian's choice, not Obsidian's
  answer. Where the mirror is wrong (flow style, grouped filters), the
  backstop is the only check, and an escape there leaves the item written.
  `docs/tools/create_base.md` states that limit.
- `src/tools/create_base/_template.test.ts` runs the template in `node:vm`
  against a stub `app`, one case per contract §4 row plus CRLF, comments,
  nested groups and flow style. It is the second tool template, after
  `links`, whose JavaScript is executed in-process.
- A future eval template cannot use `parseYaml` or `require('obsidian')`; it
  has the `app` global and plain JavaScript only.
- The response `path`, still built as `<baseDir>/<baseName>/<created>`, does
  not match where Obsidian put the item (research P6, visible in the L4
  results). The backstop checks the `Created:` value, not that path. Fixing
  the response is a follow-up outside this record.
