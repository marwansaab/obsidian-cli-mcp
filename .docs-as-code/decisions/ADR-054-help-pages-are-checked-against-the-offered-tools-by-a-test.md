# ADR-054 — Help pages are checked against the offered tools by a test, not at boot

- **Status:** Accepted
- **Date:** 2026-11-02
- **Source:** PR #115 (`specs/084-reconcile-help-docs/`, FR-002, FR-003 and
  FR-012, Clarifications Q3 = A, research D1 and D2, contract rows H1 to H6),
  commits `409b582` and `92b09fc`
- **Related:** ADR-040 (Published Parameter Descriptions and Server
  Instructions), under which `help` and `docs/tools/` stay as the long
  reference. ADR-006 (Centralized Tool Registration), whose registry the
  check reads through `tools/list` rather than importing.

## Context

`docs/tools/` is runtime content: `help` serves it, and boot's
`assertToolDocsExist` refuses to start when a built tool has no page. Nothing
checked the other direction. Two placeholder pages, `list_notes` and
`search_vault`, outlived the plans that named them; `index.md` listed them,
and `help` served them and named them in `HELP_TOOL_NOT_FOUND`'s
`availableTools`, which is the directory listing. An agent reading the help
index was told about tools it could not call (spec 084 research F1).

Deleting the two pages fixes the instance (D1). The question was what stops
the next one.

## Decision

1. **Withdraw the pages; leave `help` as it is.** The two files and their
   index lines are deleted. `executeHelp` keeps reading the directory, so the
   two names now answer `HELP_TOOL_NOT_FOUND` and `availableTools` lists only
   offered tools.
2. **Guard with a test.** `src/tools/help/docs-sync.test.ts` lists the
   tools of a default server (`quietServer({})`) over an in-memory client
   and fails unless the help page names and the `- **<name>** —` entries of
   `docs/tools/index.md` match that set exactly — no orphan page, no extra or
   repeated index entry, no offered tool missing from the index.
3. **Read the pages the way `help` does.** The test takes page names from
   `listToolPages`, extracted from `help`'s not-found path in the PR #115
   review, so the list it checks is the list `help` reports.
4. **Keep the comparison in the test file**, with its own passing and
   failing self-tests (H3 to H5), so no production symbol exists only for a
   test and nothing new ships in `dist/`.

## Alternatives rejected

- **Extend `assertToolDocsExist` to refuse boot on an orphan page or an
  index mismatch.** A stray page is a packaging defect for CI to catch, not a
  reason to refuse to start a user's server. It would also change boot
  behaviour, which spec 084 ruled out (FR-013), and every `createServer` test
  that points `docsDir` at a partial fixture directory would need an
  `index.md`.
- **Filter `help`'s answers by the registered tools.** It would hide a stray
  page instead of removing it, change `help`'s behaviour, and make the help
  handler import the tool registry, an upward dependency (constitution
  Principle I).
- **Take the tool names from `_register-baseline.json`.** That file is the
  fingerprint of the published surface; the live `tools/list` is the
  authority.

## Consequences

- A page or index entry for a tool the server does not offer fails CI, on
  Linux and Windows, without touching boot. Adding or removing a tool means
  adding or removing its page and its index line in the same change.
- The check uses the default server. A tool the owner switches off keeps its
  page, which `help` still serves.
- It checks names, not content. Whether an example is a valid call or a
  quoted error matches the server is not guarded; spec 084 checked that once
  with a probe kept outside the repository.
- `missingPages` cannot fire in the real check, because boot refuses a
  missing page first; only its self-test exercises it.
