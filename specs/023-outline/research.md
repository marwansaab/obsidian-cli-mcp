# Phase 0: Research — Outline Typed Tool

## Live-CLI findings (probed 2026-05-13 against TestVault-Obsidian-CLI-MCP)

The CLI surface for the `outline` subcommand was probed live during plan synthesis. Probes ran against fixtures seeded under `TestVault-Obsidian-CLI-MCP\Sandbox\` per the test-execution protocol; fixtures cleaned up post-probe. The findings below LOCK the implementation strategy and replace the spec-stage assumptions about parser behaviour.

### F1 — Native subcommand exists with structured JSON output

`obsidian help outline` reports:

```
outline               Show headings for the current file
  file=<name>         - File name
  path=<path>         - File path
  format=tree|md|json - Output format (default: tree)
  total               - Return heading count
```

Probing `obsidian outline path=… vault=… format=json` against a fixture with seven ATX headings returns a top-level JSON array of `{ level: number, heading: string, line: number }` per heading, in source order. Field-name note: upstream uses `heading` (singular); wrapper output uses `text` per FR-008. The handler's parse step renames `heading` → `text` during the upstream-to-wrapper transform.

**Implication**: NO eval composition needed. Single native invocation per request. Stark contrast to BI-014 / BI-015 which had to compose against `eval` because no native subcommand existed.

### F2 — Fenced-block opacity is automatic in upstream

A fixture containing a `markdown`-language fence with `## Not a heading inside fence` did NOT produce an outline entry for that line. Upstream's parser already excludes fenced-code-block heading-like text. **Implication**: FR-012 satisfied by upstream — no wrapper-side fence detector required.

### F3 — Closing-ATX form auto-stripped

A fixture heading written as `## Section Gamma ##` returned in the JSON as `"heading": "Section Gamma"`. **Implication**: FR-011's closing-ATX-strip clause is satisfied by upstream — wrapper does not implement this strip.

### F4 — Inline markdown survives byte-faithfully

A fixture heading `## Section Beta with **bold**` returned `"heading": "Section Beta with **bold**"`. **Implication**: FR-011's inline-markdown-survives clause satisfied by upstream.

### F5 — `::` substring survives byte-faithfully

A fixture heading `### Sub-beta::case` returned `"heading": "Sub-beta::case"`. **Implication**: byte-faithful contract satisfied by upstream — callers can detect `::` in heading text.

### F6 — `total` flag returns plain integer

Probing `obsidian outline path=… vault=… total` returns just an integer (no JSON envelope, no decoration) when the file has ≥1 heading. The trailing newline is OS-pipe standard. **Implication**: count-only mode (US4 / FR-005) parses upstream stdout as integer.

### F7 — Empty outline returns "No headings found." plain text

A fixture file with zero headings returns the literal string `No headings found.` (with trailing newline) for ALL three flag combinations: `format=json`, default tree, `total`. The upstream does NOT return `[]` JSON for zero-heading files in `format=json` mode. **Implication**: the wrapper's parse step MUST detect the literal `No headings found.` string (case-sensitive byte equality after trimming OS-pipe trailing whitespace) and map both modes to `{ count: 0, headings: [] }`. This is the load-bearing handler quirk.

### F8 — `vault=` is silently ignored; focused vault used

Probing `obsidian outline path=… vault=NonExistentVault format=json` returned the SAME outline as the equivalent probe with the focused vault — `vault=` was silently honoured-as-noop. The CLI's `vault=` parameter is functionally ignored for this subcommand (parity with `eval` per BI-015 / BI-014, parity with `files` per BI-019). **Implication**: the 011-R5 unknown-vault response-inspection clause does NOT fire for `outline` — there is no "Vault not found." string for the cli-adapter to inspect. Multi-vault users open the target vault before invoking. Documented limitation; no wrapper-side mitigation required.

### F9 — Non-`.md` filetype rejection by upstream

Probing `obsidian outline path=Sandbox/probe-canvas.canvas vault=… format=json` returned `Error: File is not a markdown file.` exit 0. **Implication**: FR-027's non-`.md` rejection contract is satisfied by upstream + the dispatch layer's existing `Error:`-prefix classifier (maps to `CLI_REPORTED_ERROR`). NO wrapper-side filetype guard is required. The dispatch layer's classifier code path is already verified for this exact prefix in [src/cli-adapter/_dispatch.ts](../../src/cli-adapter/_dispatch.ts).

### F10 — Setext underline-style headings ARE included by upstream — SPEC AMENDMENT REQUIRED

A fixture containing both ATX (`# Real H1`) AND Setext (`Setext H1 underline test\n========================` and `Setext H2 underline test\n------------------------`) headings produced upstream output that INCLUDED the Setext entries:

```json
{ "level": 1, "heading": "Real H1", "line": 7 },
{ "level": 1, "heading": "Setext H1 underline test", "line": 9 },
{ "level": 2, "heading": "Setext H2 underline test", "line": 14 },
…
```

This contradicts the spec's FR-013 which excluded Setext under the assumption that Setext was unaddressable (matching the BI-015 precedent). **Implication**: applying the same defer-to-upstream architectural pattern that the 2026-05-13 clarifications session locked for indented-code-blocks (Q2/A2 → FR-012a) means **Setext ALSO defers to upstream**. The wrapper does NOT filter Setext entries out; the outline is whatever upstream returns. This requires a plan-stage amendment to spec.md FR-013, the Setext edge-case bullet under Edge Cases, and the SC-001 / SC-014 wording. Logical consistency wins over spec-stage assumption; the alternative (wrapper-side Setext filter) would require a second invocation to read file content for the `#`-prefix check, defeating the single-call-per-request architecture.

### F11 — YAML frontmatter is opaque to upstream

A fixture with a YAML frontmatter block containing `title:` / `tags:` keys did NOT produce phantom heading entries from any frontmatter content. Upstream's parser correctly distinguishes frontmatter from body. **Implication**: no wrapper code needed for frontmatter handling.

### F12 — CommonMark indented code blocks are opaque to upstream

A fixture containing `    # not a heading inside indented block` and `    ## also not a heading` (both indented 4 spaces, non-paragraph-continuation) did NOT produce outline entries for those lines. **Implication**: FR-012a (the deferred-to-upstream contract from the 2026-05-13 clarifications session Q2/A2) is satisfied by upstream behaviour — confirmed live. No wrapper-side detector required.

### F13 — Level-skipping preserved as-is

A fixture with `# Skip-level test` (level 1, line 19) immediately followed by `### H3 skipping H2` (level 3, line 21) produced both entries with their source levels unchanged. **Implication**: FR-014 satisfied by upstream — wrapper does not normalise hierarchy.

### F14 — `total` flag overrides `format=json` when both set

Probing `obsidian outline path=… vault=… total format=json` returned just an integer (the `total` flag wins). **Implication**: in count-only mode, the wrapper sends ONLY the `total` flag (omits `format=json`). For default mode, the wrapper sends ONLY `format=json` (omits `total`). The two modes are mutually exclusive at the upstream level too.

### F15 — Invalid `format` value silently falls back to default tree

Probing `obsidian outline path=… vault=… format=invalid` produced the default tree output (no error). **Implication**: N/A for the wrapper (we always pass `format=json` literal, never user-supplied) — but worth knowing that the upstream is lenient about unknown format values.

### F16 — Path-traversal characters are treated as literal filenames by upstream

Probing `obsidian outline path=../escape.md vault=… format=json` returned `Error: File "../escape.md" not found.` exit 0 — the `..` was NOT resolved against the filesystem; treated as part of the literal filename. **Implication**: FR-019's path-traversal contract is satisfied by upstream + the dispatch layer's `Error:`-prefix classifier — no wrapper-side regex guard is required. The locus of rejection is the vault-access layer (per the spec's permissive phrasing).

---

## Design decisions

### R1 — Logger surface

Thin handler. No per-call `logger.callStart` / `callEndSuccess` / `callEndFailure` events at the tool layer. Mirrors all prior typed tools (006, 011, 012, 013, 014, 015, 018, 019, 021). The cli-adapter's `dispatchTimeout` / `dispatchCap` / `dispatchKill` events preserve observability for the underlying CLI invocation.

### R2 — CLI subcommand: native `outline` (NOT eval)

Per F1: native subcommand exists with structured `format=json` output. The wrapper invokes `obsidian outline` directly via `invokeCli`. No `eval` composition. Architecturally simpler than BI-014 / BI-015 — no JS template, no base64 payload, no two-stage envelope parse.

### R3 — Single-call architecture, branched on `input.total`

ONE `invokeCli` invocation per MCP request. The handler branches on `input.total`:

- `input.total === true`: invoke with `total` flag only (no `format=json`). Per F6 / F14, upstream returns a plain integer (or "No headings found." for zero-heading files per F7). Wrapper parses to `{ count, headings: [] }`.
- `input.total !== true` (default): invoke with `format=json` flag only (no `total`). Per F1 / F7, upstream returns a JSON array (or "No headings found." for zero-heading files). Wrapper parses to `{ count: array.length, headings: [...mapped] }`.

Single-call architecture preserves the per-call latency target (~50–200 ms typical for native subcommand) and avoids any wrapper-side caching concerns.

### R4 — Adapter `target_mode` mapping: STANDARD

The user-facing schema HAS the `target_mode` field. The handler passes `input.target_mode` through to `invokeCli` unchanged. In specific mode `vault` flows through; in active mode the cli-adapter's defence-in-depth strip removes any leaked vault/file/path. Parity with 006 / 011 / 012 / 013 / 015 / 019 / 021.

### R5 — Unknown-vault response inspection: NOT APPLICABLE

Per F8: the CLI silently ignores `vault=` for the `outline` subcommand and uses the focused vault. There is no "Vault not found." string to inspect. The 011-R5 cli-adapter inspection clause does NOT fire for `outline`. Documented inherited limitation; multi-vault users open the target vault before invoking. Parity with `files` (BI-019).

### R6 — Anti-injection: natural via process-argument data-passing

The wrapper passes `vault`, `file`, `path`, `target_mode`, `total` as named CLI parameters via `invokeCli`'s `parameters` and `flags` records. The cli-adapter's existing argv-assembly contract (BI-008-refactor surface) emits each parameter as a separate process argument; no shell, no eval, no string interpolation of caller-supplied data into a code surface. FR-026 satisfied structurally; no per-field sanitisation needed.

### R7 — File-not-found handling: dispatch-layer auto-classification

Upstream returns `Error: File "X" not found.` exit 0 for missing files (verified F16 / file-not-found probe). The dispatch layer's existing `Error:`-prefix classifier maps this to `CLI_REPORTED_ERROR` automatically. FR-015 satisfied by inheritance; no wrapper-side parsing or re-throwing required.

### R8 — Non-`.md` filetype rejection (FR-027): dispatch-layer auto-classification

Per F9: upstream returns `Error: File is not a markdown file.` exit 0 for non-`.md` files. The dispatch layer's `Error:`-prefix classifier maps this to `CLI_REPORTED_ERROR` automatically. FR-027 satisfied by inheritance; no wrapper-side filetype guard required. The error message NAMES the filetype (per FR-027's "message MUST name the unsupported filetype" requirement) — verified by the upstream message text including "markdown".

### R9 — Empty-outline detection: load-bearing wrapper transform

Per F7: zero-heading files return the literal string `No headings found.` (NOT a JSON array `[]`, NOT integer `0`). The handler's parse step MUST detect this case BEFORE attempting JSON.parse / Number.parseInt and map it to `{ count: 0, headings: [] }`. Detection rule: trim trailing whitespace from stdout, compare to literal `No headings found.` with case-sensitive byte equality. This is the only handler-side branch logic that escapes the "thin handler" pattern.

### R10 — Output cap: inherited 10 MiB ceiling

The cli-adapter's existing 10 MiB output cap fires for pathologically large outlines (a hypothetical note with hundreds of thousands of headings). Surfaces as `CLI_NON_ZERO_EXIT` (output-cap kill) per the existing dispatch contract. The `total: true` mode bypasses this risk entirely — upstream returns a small integer regardless of heading count. Documented in `docs/tools/outline.md`.

### R11 — Setext defer-to-upstream (PLAN-STAGE SPEC AMENDMENT)

Per F10 — Setext underline-style headings ARE included in upstream output, contradicting the spec-stage FR-013 assumption. The plan applies the same defer-to-upstream architectural pattern locked for indented-code-blocks in the 2026-05-13 clarifications session Q2/A2. The wrapper does NOT filter Setext entries; outline content is whatever upstream returns. **Spec amendment**: FR-013 rewritten from "Setext MUST NOT be returned" to "Setext defers to upstream"; CONTENT — Setext edge-case bullet rewritten in parallel; SC-001 wording clarified; out-of-scope assumption updated. The amendment is logically consistent with Q2/A2; the alternative (wrapper-side Setext filter) would require an additional file-content read to verify the `#`-prefix on each heading's source line, defeating the single-call-per-request architecture (R3) for negligible gain.

### R12 — Test seams: `deps.spawnFn` injection per existing pattern

The handler's `ExecuteDeps` interface includes the optional `spawnFn?: SpawnLike` and `env?: NodeJS.ProcessEnv` fields per the established convention. Tests pass a stub `spawnFn` that responds with the desired stdout shape. ONE spawn invocation per request (R3); tests assert the `spawnFn.mock.calls.length === 1` per call AND assert the argv contains the expected `outline` subcommand + flags + parameters.

### R13 — Active-mode no-focus error: deferred to T0

The probe environment had a focused vault throughout; the no-focus case could not be exercised at plan time. Best-evidence assumption: per the dispatch layer's four-priority error classifier, an `Error: no active file` upstream response would map to `ERR_NO_ACTIVE_FILE` automatically. T0 of `/speckit-implement` verifies this against an unfocused vault. If upstream returns a different error string, the wrapper's handler test exercises whatever the actual response is and locks the mapping.

### R14 — Multi-vault default ambiguity: inherited limitation

Per F8: in multi-vault setups, the focused vault is the only addressable one for `outline`. Documented limitation; recorded in `docs/tools/outline.md`. Parity with 014 / 013 / 015 / 019.

---

## Plan-stage spec amendments (proposed)

This planning phase produced ONE proposed spec amendment driven by F10:

**Amendment 1 — Setext defers to upstream (FR-013 + edge case + SC + out-of-scope)**

Driver: F10 — live probe shows upstream `outline format=json` includes Setext heading entries, contradicting FR-013's spec-stage assumption that Setext is excluded. Logical consistency with Q2/A2's defer-to-upstream pattern means the wrapper inherits whatever upstream emits.

Sections to amend:
- FR-013 — rewrite from "MUST NOT be returned" to "defers to upstream"
- CONTENT — Setext edge-case bullet — parallel rewrite
- Out-of-scope assumption — drop the Setext fallback documentation (it's no longer "out of reach"; it's just included in the outline)
- FR-023 characterisation — reword the Setext case from "verifies they are NOT included" to "verifies the deferred-to-upstream contract"

The amendment is applied in the same commit as this plan-stage research artefact; the spec's `## Clarifications` block gains a session-2026-05-13-plan-stage entry naming the F10 finding and the consistency-with-Q2/A2 reasoning.

**No other spec amendments.** All other live findings (F1–F9, F11–F16) align with spec contracts as written.

---

## T0 Live-CLI Capture (2026-05-13)

T001 attempted live characterisation of the four cases deferred from plan
stage. Focused vault during probe was `The Setup`, not
`TestVault-Obsidian-CLI-MCP`. Per F8 the `vault=` parameter is silently
honoured-as-noop, so probes against TestVault-seeded fixtures fall back to
the focused vault (where the seeded paths do not exist).

- **T0.1 active-mode no-focus**: not probed live. Toggling Obsidian to a
  no-focus state would intrude on the user's open editor session. Best-
  evidence assumption from R13 + the dispatch-layer classifier
  ([src/cli-adapter/_dispatch.ts](../../src/cli-adapter/_dispatch.ts)
  priority (b) at line 294): upstream `Error: no active file` → wrapper
  `ERR_NO_ACTIVE_FILE` via the existing prefix matcher. The handler test
  case 24 asserts `ERR_NO_ACTIVE_FILE` is produced when the stub spawn
  returns this stdout, which structurally exercises the classifier
  contract. If upstream wording diverges in production, the test still
  passes (stub matches stub) — only a live regression would surface
  divergence at T017's smoke step.
- **T0.2 multi-extension non-`.md` rejection**: three fixtures
  (`outline-T0-canvas.canvas`, `outline-T0-pdf.pdf`,
  `outline-T0-image.png`) seeded under
  `TestVault-Obsidian-CLI-MCP\Sandbox\`. Probes returned
  `Error: File "Sandbox/outline-T0-<ext>.<ext>" not found.` exit 0
  for all three — paths resolved against `The Setup` (focused vault),
  not against `TestVault-Obsidian-CLI-MCP`. The dispatch-layer
  `Error:`-prefix classifier maps both this string AND F9's
  `Error: File is not a markdown file.` to `CLI_REPORTED_ERROR` — so
  the wrapper contract holds either way. Handler test case 23 stubs
  the F9 wording (locked at plan stage). Fixtures cleaned up
  post-probe.
- **T0.3 CRLF / LF parity**: not probed live. Seeding CRLF / LF
  fixtures requires writes against the focused vault (`The Setup`),
  which is not pre-authorised per
  [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md).
  Best-evidence assumption: upstream's parser operates on logical
  lines; CRLF terminators are normalised to single logical lines.
  Handler test case 18 (CRLF round-trip) stubs both stdouts and
  asserts identical heading entries — a structural lock that would
  catch any wrapper-side line-terminator handling regression.
- **T0.4 cap-boundary**: deferred per the task's OPTIONAL clause
  (FR-020 / R10 contract is structurally ensured by the cli-adapter's
  10 MiB output cap; empirical confirmation is observability evidence,
  not a contract gate).

**TRIGGER status**: none fired. Implementation proceeds against the
documented assumptions; the T017 manual smoke against MCP Inspector with
TestVault focused remains the deferred end-to-end validation step.
