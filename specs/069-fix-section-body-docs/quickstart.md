# Quickstart: Validate the Section-Body Documentation Fix

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

How to check that the corrected `read_heading` help is true, end to end. Wording targets are in [contracts/doc-correction-contract.md](contracts/doc-correction-contract.md); probe details are in [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md).

## Prerequisites

- Obsidian running with `TestVault-Obsidian-CLI-MCP` open; bare `obsidian` resolves to `Obsidian.com` (`obsidian --version` prints `Obsidian CLI`).
- Read `.memory/test-execution-instructions.md` first (assistant-only, gitignored).
- `npm ci` done; `npm run build` passes on this branch.
- A way to call the built server's `read_heading`: the `obsidian-cli-mcp-local` MCP server registered for this repo (runs `dist/index.js`), or any MCP client over stdio against `node dist/index.js`. This branch changes no `src/**`, so a server started from a build of `main` at the branch point serves the same runtime; record the commit either way.

## 1. Live probe (before the doc edit)

1. List `Sandbox/` in the vault and keep the listing.
2. Create `Sandbox/069-probe-<timestamp>/` and write fixtures F1–F6 with exact bytes (F2 with CRLF, F6 with no trailing line ending), as in the probe plan.
3. Wait until `outline` on each fixture lists its headings.
4. Run reads P1–P8 with `target_mode: "specific"`, `vault: "TestVault-Obsidian-CLI-MCP"`, `path: "Sandbox/069-probe-<timestamp>/<fixture>.md"`.
5. Record each observed `content`, JSON-escaped, in `contracts/t0-probe-findings.md`.
6. Delete the probe folder and confirm `Sandbox/` matches the saved listing.

**Expected**: all eleven reads (P5, P6 and P8 are two reads each) return the expected body; verdict `match` throughout (SC-005: 6 of 6 FR-010 layouts). Any mismatch on P1–P7 stops the work and is reported. A P8 mismatch does not stop the work; it rewords E4's last-line clause to match the observed bodies (P8 rule in the probe plan).

## 2. Doc edit

Apply E1–E7 from the doc-correction contract to `docs/tools/read_heading.md`.

## 3. Page checks

```powershell
# No false caveat or trimming advice remains (expect no output)
Select-String -Path docs/tools/read_heading.md -Pattern 'always begins','Leading-newline','leading `\\n` byte','rim client-side'

# Only the allowed paths changed
git diff --stat main...HEAD
git status --short
```

**Expected**: the search prints nothing (SC-001). The diff and status list only `docs/tools/read_heading.md`, files under `specs/069-fix-section-body-docs/`, `CLAUDE.md` (active-plan pointer) and `.specify/feature.json`, with nothing under `src/**` and no `*.test.ts` (FR-011).

Then read the page end to end and compare each shown body (Output block, empty-body paragraph, Start of body table, Examples 1–3) with the observed bodies in `t0-probe-findings.md` (SC-002).

## 4. Served help

Call the `help` tool for `read_heading` on a server built from this branch and confirm the returned text contains the new "Where the body starts" paragraph. `help` reads `docs/tools/` at runtime, so no rebuild is needed for this check beyond the server picking up the edited file.

## 5. Gates

`npm run lint`, `npm run typecheck`, `npm run build`, `npm test` pass unchanged; this change adds no code or tests.
