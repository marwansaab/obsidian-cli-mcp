<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
[specs/021-rename-note/plan.md](specs/021-rename-note/plan.md)

Active feature: **021-rename-note** — the **ninth** typed-tool wrap
on top of the foundation completed by features 003–020. Adds
`rename_note`, the typed in-place rename primitive for `.md` notes.
The user-facing surface: `rename_note({ target_mode, vault?, file?,
path?, name })` returns `{ renamed: true, fromPath, toPath }` —
fromPath is the source's canonical vault-relative path; toPath is the
new canonical destination path. The CLI's `rename` subcommand wraps
underneath; the wrapper appends `.md` to `name` upstream of the CLI
unless `name.endsWith(".md")` (literal, case-sensitive byte equality
— mirrors 020-fix-write-gaps R2). The vault's "Automatically update
internal links" setting governs link-rewriting; the wrapper does NOT
enforce or warn about the setting, it documents the dependency.
Predecessor narratives for 020-fix-write-gaps, 019-list-files, 018,
017, 015 retained below.

**021-rename-note touch surface** (LOCKED): NEW module
[src/tools/rename_note/](src/tools/rename_note/) with three source
files (`schema.ts`, `handler.ts`, `index.ts`) and three co-located
test files (~52 cases total). NEW non-stub doc
[docs/tools/rename_note.md](docs/tools/rename_note.md) with ≥4 worked
examples + Scope section + link-rewriting caveat per FR-014. ONE
import + one tools-array entry in [src/server.ts](src/server.ts)
(alphabetical insertion between `createReadPropertyTool` and
`createWriteNoteTool`). ONE line in
[docs/tools/index.md](docs/tools/index.md). ZERO new error codes
(FR-018 — failures flow through `VALIDATION_ERROR` + the cli-adapter's
four codes). ZERO new ADRs and ZERO ADR amendments. ZERO changes to
existing tools (SC-009 — `obsidian_exec`, `read_note`, `write_note`,
`delete_note`, `read_property`, `find_by_property`, `read_heading`,
`write_property`, `list_files` byte-stable). ZERO changes to
`src/target-mode/` (file-scoped tool reuses `applyTargetModeRefinement`
verbatim; no folder-scoped variant needed unlike 019).

**Schema** (R4 / FR-002): `applyTargetModeRefinement(targetModeBaseSchema.extend({ name: z.string().min(1).regex(/^[^/\\]+$/) }))`.
The post-010 flat-extension idiom with `.extend()` (NOT `.merge()` per
010-flatten-target-mode FR-002). `name` is required in BOTH modes,
non-empty, MUST NOT contain `/` or `\`. The folder-separator-rejection
regex implements the /speckit-clarify Q2 resolution (session
2026-05-12): inputs containing a slash fail at the zod parse boundary
as `VALIDATION_ERROR` with the `move_note` recovery hint. The
existing target-mode rules govern locator XOR + forbidden-key checks
unchanged.

**Extension-handling rule** (R6 / /speckit-clarify Q1, locked
2026-05-12): file-local helper `appendMdIfMissing(name): string` in
[handler.ts](src/tools/rename_note/handler.ts) of ~3 LOC implements
`return name.endsWith(".md") ? name : name + ".md"`. Literal byte-
equality, case-sensitive. Internal periods preserved (`Doc.v1.draft`
→ `Doc.v1.draft.md`). Mirrors 020-fix-write-gaps R2 exactly. The
allowlist is exactly `{".md"}` — non-`.md` filename targets
(renaming `.canvas`, `.pdf`, image files, cross-extension type
conversion like `.md → .canvas`) are **out of scope** and route
through `obsidian_exec rename file=… name=…` directly per the
/speckit-clarify Q1 scope narrowing.

**Per-mode call architecture** (R3): ONE `invokeCli` call per
request, regardless of `target_mode`. Specific mode argv:
`vault=<v> rename {file=<f> | path=<p>} name=<appended>` (the
`appendMdIfMissing` step happens upstream of the CLI). Active mode
argv: `rename name=<appended>` (no `vault=`, no `file=`, no `path=`).
F1 verified at plan stage via `obsidian help` — the `rename`
subcommand exists with parameters `file=<name>`, `path=<path>`,
`name=<name>` (required). The neighbouring `move` subcommand exists
analogously for the future `move_note` BI (referenced but not a
precondition).

**Response parsing** (R8, T0-deferred): `parseRenameResponse(stdout)`
regex pattern locked against T0-captured CLI wording during
/speckit-implement T0 task. Anticipated shapes (in order of
likelihood per 012-delete-note precedent): single-line `Renamed: <from>
→ <to>` or two-line per-path. Parse failure throws
`CLI_REPORTED_ERROR` with `stdout` in `details`.

**Single-spawn invariant** (R9): handler tests assert
`spawnFn.callCount === 1` per request — parity with 011/012/013/015
precedent. Composes with the shared CLI queue's serialization
guarantee per FR-008.

**Plan-stage spec amendments**: NONE. Both /speckit-clarify decisions
(Q1 extension-handling rule, Q2 folder-separator-rejection rule) were
locked at spec stage session 2026-05-12 and are already integrated.
Research phase ratifies the chosen approach without further
amendments. NINE FR-019 cases deferred to T0 of /speckit-implement —
captured into research.md's deferred-T0 case roster; bundled into a
`T0xx` task at /speckit-tasks time.

**Compatibility / release**: this BI is purely additive — no existing
tool changes, no error codes added, no ADRs amended. Public surface
gains one new typed tool. Expected version bump: patch level
(`0.4.3 → 0.4.4` per SC-016); release-task decision deferred to
/speckit-tasks.

See also:
- [spec.md](specs/021-rename-note/spec.md) — feature spec; one
  /speckit-clarify session ran 2026-05-12 (Q1 extension-handling rule
  — `.md`-only allowlist with case-sensitive byte equality, cross-
  extension renames out of scope; Q2 folder-separator-rejection rule
  — validation-layer reject with `move_note` recovery hint).
- [plan.md](specs/021-rename-note/plan.md) — implementation plan.
- [research.md](specs/021-rename-note/research.md) — Phase 0
  decisions R1–R10 + plan-stage live-CLI finding F1 (rename
  subcommand argv shape from `obsidian help`) + FR-019 deferred T0
  case roster (11 cases for /speckit-implement T0 task).
- [data-model.md](specs/021-rename-note/data-model.md) — input/output
  schema shapes, per-mode argv-mapping table, extension-handling rule
  truth table, folder-separator-rejection truth table, per-tool
  invariants ↔ FR mapping, test inventory (~52 cases).
- [contracts/rename-note-input.contract.md](specs/021-rename-note/contracts/rename-note-input.contract.md)
  — public input contract: zod schema, JSON Schema shape, field
  policy, six worked examples (specific+path, verbatim-`.md`,
  specific+file, internal-periods, active mode, cross-extension
  scope-narrowing), validation failure roster, downstream failure
  roster.
- [contracts/rename-note-handler.contract.md](specs/021-rename-note/contracts/rename-note-handler.contract.md)
  — handler invariants: deps shape, `appendMdIfMissing` helper
  contract with seven worked examples, `parseRenameResponse` helper
  contract (T0-locked), argv shape table exhaustive across all valid
  inputs, single-spawn invariant (R9), failure propagation chain,
  test-seam pattern.
- [quickstart.md](specs/021-rename-note/quickstart.md) — 33 vitest
  verification scenarios (S-1..S-33) mapped to SC-001..SC-016 + 11
  manual T0 scenarios (M-1..M-11) for live-CLI characterisation
  during /speckit-implement.

---

## Predecessor feature narrative (020-fix-write-gaps) — RETAINED FOR CONTEXT

The 020 narrative below is retained for downstream cross-references
but is NOT the active planning context. Consult
[specs/021-rename-note/plan.md](specs/021-rename-note/plan.md) for
the active feature; consult
[specs/020-fix-write-gaps/plan.md](specs/020-fix-write-gaps/plan.md)
for the 020 source. Summary: 020 closed two narrow handler-layer
contract gaps in the existing `write_note` operation against the
016-reliable-writer surface — (1) short-form-name target resolution:
when `input.file` matches the canonical short-form shape (no `/` or
`\` AND not ending in `.md`), the handler resolves the target to
`<input.file>.md` at the vault root; non-canonical `input.file`
shapes pass through verbatim; and (2) `FILE_EXISTS` additive
`details.errno: "EEXIST"` enrichment for field-name parity with
`FS_WRITE_FAILED.details.errno`. R2 locked the predicate as three
literal-character checks (`!file.includes("/") && !file.includes("\\")
&& !file.endsWith(".md")`) — case-sensitive byte equality, NOT
`path.extname`. The 021-rename-note `appendMdIfMissing` helper
inherits the same `endsWith(".md")` precedent. Zero new error codes;
zero new ADRs; zero schema edits. Module unchanged at
`src/tools/write_note/handler.ts` (~8 LOC of new helper + 1 line of
`details.errno` addition). See
[020 spec.md](specs/020-fix-write-gaps/spec.md) and [020
plan.md](specs/020-fix-write-gaps/plan.md) for the full detail.

---

## Predecessor feature narrative (019-list-files) — RETAINED FOR CONTEXT

The 019 narrative below is retained for downstream cross-references
but is NOT the active planning context. Consult
[specs/021-rename-note/plan.md](specs/021-rename-note/plan.md)
for the active feature; consult
[specs/019-list-files/plan.md](specs/019-list-files/plan.md) for the
019 source. Summary: 019 added the eighth typed-tool wrap (`list_files`),
the project's first FOLDER-scoped typed surface. Where the prior seven
typed tools (`read_note` / `write_note` / `delete_note` /
`read_property` / `find_by_property` / `read_heading` /
`write_property`) all operate on a single named file or the focused
file, `list_files` operates on a vault folder. The user-facing surface:
`list_files({ target_mode, vault?, folder?, ext?, total? })` returning
`{ count: number, paths: string[] }`. The CLI subcommand is `files`
(native, NOT eval); the most consequential architectural finding was
R6 — the CLI's `files folder=X` returns the RECURSIVE subtree, and
the wrapper enforces FR-012's non-recursive contract by filtering
post-fetch. Zero new error codes; zero new ADRs. Module at
`src/tools/list_files/{schema,handler,index}.ts`. See [019
spec.md](specs/019-list-files/spec.md) and [019
plan.md](specs/019-list-files/plan.md) for the full detail.

---

## Predecessor feature narrative (018-write-property) — RETAINED FOR CONTEXT

The 018 narrative below is retained for downstream cross-references
but is NOT the active planning context. Consult
[specs/019-list-files/plan.md](specs/019-list-files/plan.md) for the
active feature; consult
[specs/018-write-property/plan.md](specs/018-write-property/plan.md)
for the 018 source. Summary: 018 added the seventh typed-tool wrap
(`write_property`), the symmetric write companion to
[013-read-property](specs/013-read-property/spec.md). The CLI
subcommand `property:set` (native, NOT eval) drove the wrapper.
Per-mode call architecture: ONE spawn for specific+path, TWO spawns
for specific+file (`file` → `property:set`) and active (`eval` →
`property:set`). Type inference from JS value shape (FR-008). Empty
array maps to literal `value=[]` (R10 / F2). Cross-type overwrite
satisfied by native CLI behaviour (FR-033 / F3). Plan-stage spec
amendments: R8 CRLF preservation PARTIAL; R7 YAML flow→block
normalisation observable. Zero new error codes; zero new ADRs. Module
at `src/tools/write_property/{schema,handler,index}.ts`. See [018
spec.md](specs/018-write-property/spec.md) and [018 plan.md](specs/018-write-property/plan.md)
for the full detail.

---

## Predecessor feature narrative (017-cross-platform-support) — RETAINED FOR CONTEXT

The 017 narrative below is retained for downstream cross-references
but is NOT the active planning context. Consult
[specs/018-write-property/plan.md](specs/018-write-property/plan.md)
for the active feature; consult
[specs/017-cross-platform-support/plan.md](specs/017-cross-platform-support/plan.md)
for the 017 source. Summary: 017 lifted the bridge's Windows-only
restriction by extracting binary resolution into
`src/binary-resolver/`, a three-tier fall-through (OBSIDIAN_BIN →
platform-default → PATH-via-OS-spawn) verified via
`fs.access(X_OK)` predicate. The error envelope's
`CLI_BINARY_NOT_FOUND.details` gained `{platform, attempts[], PATH}`
in place of the legacy `binaryAttempted` field; zero new error codes;
the 008-refactor surface and the 011-R5 unknown-vault inspection
clause were preserved unchanged. README and `package.json` description
bumped from "Windows-host" to tri-platform framing per FR-019.
See [017 spec.md](specs/017-cross-platform-support/spec.md) and
[017 plan.md](specs/017-cross-platform-support/plan.md) for the full
detail.

---

## Predecessor feature narrative (015-read-heading) — RETAINED FOR CONTEXT

The narrative below is from the predecessor `015-read-heading`
feature; it is retained for downstream cross-references but is NOT the
active planning context. Resume reading the active 017 narrative
above.

Adds `read_heading`, the
**sixth** typed-tool wrap and the first **heading-targeted retrieval
primitive**. Where `read_note` returns whole files (5–50k tokens for
long documents) and `read_property` returns a single frontmatter
field, `read_heading` returns just the body of a single named section
(typically 100–500 tokens) — replacing the agent's "full read_note +
client-side Markdown parse" sequence with a single typed call. The
user-facing tool surface:
`read_heading({ target_mode, vault?, file?, path?, heading })`
returning `{ content: string }`. The `heading` field is a
`::`-separated path with at least two non-empty segments
(`H1::H2` or `H1::H2::H3`); single-segment H1-only reads, headings
whose text contains `::` literally, and Setext underline-style
headings are explicitly out of reach (documented fallback: full-file
`read_note` plus client-side parse). `obsidian_exec` remains as the
freeform escape hatch.

**Schema** (STANDARD target_mode discriminator idiom — NOT 014's flat
departure): reuses [`targetModeBaseSchema`](src/target-mode/target-mode.ts)
extended with `heading: z.string().min(1).refine(validateHeadingPath)`.
The validator is structural-only per FR-006 / FR-007: split on the
literal `::`, require ≥2 non-empty segments. The `applyTargetModeRefinement`
helper provides specific/active enforcement (vault required-in-specific,
file/path XOR, vault/file/path forbidden-in-active) per the post-010
flat extension idiom. Heading existence is NOT pre-validated — semantic
resolution is a runtime concern surfaced as `CLI_REPORTED_ERROR` with
`details.code = "HEADING_NOT_FOUND"`.

**Output shape**: `z.object({ content: z.string() }).strict()`. Single-
string contract — no metadata sidecar (FR-009).

**Eval-envelope wire schema**: `z.discriminatedUnion("ok", [...])`
strict union. `{ok: true, content: string}` on success;
`{ok: false, code: "FILE_NOT_FOUND" | "HEADING_NOT_FOUND" | "NO_ACTIVE_FILE", detail: string}`
on failure. Handler's two-stage parse (`JSON.parse` then envelope
safeParse) maps both wire-format failures and envelope `ok: false`
onto existing `UpstreamError` codes per FR-022 (zero new error codes).

**Live-CLI surface** (verified during plan via `obsidian help` and
probes against the focused vault on 2026-05-09; happy-path verification
against `TestVault-Obsidian-CLI-MCP` deferred to T0 because the test
vault was not focused at probe time):
- **No native heading-body subcommand exists** in the Obsidian CLI's
  80+ commands. `read` returns whole files (no `subpath` param);
  `outline` lists headings (no body content); `bookmark` accepts
  `subpath` but writes a bookmark; `read` + client-side parse defeats
  the spec's "single typed call replaces the brittle parse" promise
  (SC-015). R2 lock — `eval` is load-bearing.
- subcommand: **`eval`** (developer section) — load-bearing departure
  (parity with 014). The user input itself anticipated this with the
  "the bridge's eval primitive with the input passed as data" clause.
- **SINGLE-CALL ARCHITECTURE (R3)**: each MCP request fires ONE
  `invokeCli` invocation with subcommand `eval` and parameter
  `code=<rendered-js>`. The JS template resolves the file path
  (active mode `app.workspace.getActiveFile()`, specific+path direct,
  specific+file via `app.metadataCache.getFirstLinkpathDest`), walks
  `app.metadataCache.metadataCache[fc.hash].headings`, finds the first
  matching segment-path, slices the file content via
  `await app.vault.adapter.read(path)`, and returns one JSON envelope.
  ~200 ms per call.
- **CRITICAL R7 finding**: Obsidian's pre-parsed `headings` array
  (probed live against `000-Meta/About This Vault.md`) carries
  `{heading, level, position: {start: {offset}, end: {offset}}}` per
  ATX heading. **Obsidian has ALREADY done ATX-marker recognition AND
  fence-opacity** — heading-like text inside fenced code blocks does
  NOT appear in the headings array. Body slicing is just
  `text.slice(headings[matchIdx].position.end.offset,
  headings[matchIdx+1]?.position.start.offset ?? text.length)` with a
  leading-line-terminator strip. This collapses the spec-stage
  assumption of an in-eval line-by-line ATX scanner with explicit
  fence tracking into a metadata-cache lookup.
- **Anti-injection via base64-encoded JSON payload (R6)**: parity with
  014. Frozen JS template + base64 payload (alphabet `[A-Za-z0-9+/=]`).
  User-supplied `path` / `file` / `heading` flow through
  `JSON.stringify` → `Buffer.from(...).toString("base64")` → `atob` +
  `JSON.parse` at JS runtime. No user input ever reaches the JS source
  as text. Verifies FR-021 / SC-021 structurally.
- **Adapter `target_mode` mapping (R4)**: STANDARD — the user-facing
  schema HAS the `target_mode` field. The handler passes
  `input.target_mode` through to `invokeCli` unchanged. In specific
  mode `vault` flows through; in active mode the cli-adapter's
  `stripTargetLocators` defence-in-depth strip removes any leaked
  vault/file/path. Parity with 013-read-property.
- **Inherited vault-routing limitation**: the CLI's `vault=` parameter
  is functionally ignored by `eval` (probed live — `obsidian
  vault=TestVault... eval ...` returned The Setup's name). Multi-vault
  users open the target vault before invoking. Same limitation as
  014 / 013 / 011. Documented in `docs/tools/read_heading.md`.
- unknown-vault response (R5 inheritance): `Vault not found.` exit 0
  byte-identical across `eval` (cited from 014's verification) and
  prior typed tools' subcommands. The cli-adapter's existing 011-R5
  inspection clause re-classifies to `CLI_REPORTED_ERROR`;
  `read_heading` inherits unchanged.
- **Setext exclusion (R14 defence-in-depth)**: the JS template filters
  the headings array via `text.charAt(h.position.start.offset) === '#'`
  to enforce Q2's ATX-only rule regardless of Obsidian's metadataCache
  behaviour on the host's version. T0 verifies whether the filter is
  functional or a no-op.
- output cap (R10): the cli-adapter's existing 10 MiB cap fires for
  pathologically large body slices — produces a structured
  `CLI_NON_ZERO_EXIT` (output-cap kill), never silent truncation.
- **Structured eval-response error envelope (R13)**: handler's two-
  stage parse wraps `JSON.parse` failure as
  `CLI_REPORTED_ERROR(stage: json-parse)`, envelope-schema-parse
  failure as `CLI_REPORTED_ERROR(stage: envelope-parse)`, and envelope
  `ok: false` codes per the R13 mapping table — `NO_ACTIVE_FILE` →
  `ERR_NO_ACTIVE_FILE`; `FILE_NOT_FOUND` and `HEADING_NOT_FOUND` →
  `CLI_REPORTED_ERROR(stage: envelope-error, code: <eval-code>)`.

**Clarifications session 2026-05-09**: three Q&As resolved at spec
stage and codified in spec.md before plan. (Q1) Body terminator rule —
locked **first-subsequent-heading-marker-of-any-depth** (FR-010); the
parenthetical "sibling-or-higher" and the explicit "no child subtrees"
collapse onto this single rule. (Q2) Heading marker syntax — locked
**ATX only**; Setext underlines are content, not boundaries. Setext
added to out-of-scope; Q2 also drives R14's defence-in-depth filter.
(Q3) Heading-path segment matching — locked **minimal-normalisation,
case-sensitive byte compare** (FR-028); inline markdown and Obsidian
anchor markers survive in the comparison.

**Logger surface (R1)**: same outcome as 011 / 012 / 013 / 014. Thin
handler; no per-call `logger.callStart` / `callEndSuccess` /
`callEndFailure` events at the tool layer. The cli-adapter's
`dispatchTimeout` / `dispatchCap` / `dispatchKill` events preserve
observability for the underlying CLI invocation.

**Module layout**: `src/tools/read_heading/{schema,handler,index}.ts`
(post-011 convention — `index.ts` not `tool.ts`); factory
`createReadHeadingTool(deps)`; all three new source files carry the
`// Original — no upstream.` header per Constitution V. Tests
co-located: `src/tools/read_heading/{schema,handler,index}.test.ts`
— **55 cases total** (20 schema / 30 handler / 5 registration). Higher
than 014's 47 because the schema layer needs target_mode discriminator
coverage AND structural-heading-path validator coverage, and the
handler layer needs additional segment-matching characterisation
(closing-ATX, surrounding whitespace, inline markdown, anchor markers,
mis-cased) AND CRLF/LF round-trip locks.

**Cross-cutting**: zero new error codes (FR-022 + Constitution IV);
zero new ADRs (ADR-003 enforced via `applyTargetModeRefinement`
reuse); 008-refactor surface frozen — `dispatchCli`, `invokeCli`,
`invokeBoundedCli`, `assertToolDocsExist`, `obsidian_exec` argv
contract, AND the 011-R5 cli-adapter unknown-vault response-inspection
clause all preserved. `read_note` / `write_note` / `delete_note` /
`read_property` / `find_by_property` / `obsidian_exec` / `help`
byte-stable (SC-016); only `src/server.ts` registration list grows by
two lines: one import, one tools-array entry, alphabetical position
between `createObsidianExecTool` and `createReadNoteTool`. The
post-010 consolidated drift detector at
[src/tools/_register.test.ts](src/tools/_register.test.ts) auto-covers
`read_heading` via its `it.each` registry walk — no test-file
modifications required.

**FR-025 plan-stage characterisation**: 23 cases enumerated in spec
(post-/speckit-analyze A1 remediation: 19 → 23 — SC-020's count was
out of date with FR-025's actual enumeration; the original 18 cases
plus Setext (Q2) plus four segment-matching cases (Q3) total 23).
Of those, 20 are deferred to T0 of `/speckit-implement` (the 4 added
by /speckit-analyze A2 remediation are empty-body, duplicate-first-
match, file-not-found-path, file-not-found-wikilink); 3 are plan-
verified (2-seg happy, 3+-seg nested, unknown-vault).
Critical architecture-locking findings verified live during plan:
F1 — no native heading-body subcommand; F2 — eval argv shape;
F3 — eval `=> ` prefix on stdout; F4 — eval errors as `Error: <msg>`
caught by dispatch-layer classifier; F5 — `app.vault.adapter.read`
async + string return; F6 — `app.metadataCache.metadataCache[hash].headings`
shape (`{heading, level, position}` with byte offsets); F7 — vault-
routing limitation reproduced; F8 — sandbox empty cleanup verified.
Cases deferred to T0 (require fixtures in TestVault and the test vault
opening): segment-matching characterisation (closing-ATX, surrounding-
whitespace, inline-markdown-survives, anchor-survives, mis-cased);
Setext-as-content (verifies R14 defence-in-depth filter); fenced-
code-block-with-inside-heading; CRLF / LF round-trip; duplicate
heading path first-match; very-large-body cap-boundary; active-mode
focused-note happy path; active-mode no-focus error; file-not-found
error; specific-mode unresolved-locator.

**Compatibility / release**: this BI is additive — no existing tool
changes, no error codes added, no ADRs amended. Public surface gains
one new typed tool. Version bump `0.2.7 → 0.2.8` (patch — purely
additive surface). The new typed surface is disclosed in
`CHANGELOG.md`; the multi-vault default-ambiguity limitation
(R11), the eval-as-CLI-entry-point stability concern (R2), the
documented fallback for out-of-reach paths (single-segment H1-only,
`::`-in-text, Setext), and the practical 10 MiB body ceiling (R10) are
called out in `docs/tools/read_heading.md`.

See also:
- [spec.md](specs/015-read-heading/spec.md) — feature spec; one clarifications session ran 2026-05-09 (Q1 boundary rule, Q2 ATX-only, Q3 segment-matching minimal-normalisation); all three codified directly in the spec.
- [research.md](specs/015-read-heading/research.md) — Phase 0 decisions R1–R14 + live CLI findings F1–F8 (R1 logger surface; R2 `eval` subcommand load-bearing departure; R3 single-call architecture; R4 standard target_mode mapping; R5 unknown-vault inheritance; R6 base64 anti-injection; R7 in-eval boundary detection via Obsidian's pre-parsed headings array; R8 in-eval segment matcher with stack-by-level + first-match; R9 file path resolution three modes; R10 inherited 10 MiB cap; R11 multi-vault default ambiguity; R12 test seams — single spawn per request; R13 structured eval-response error envelope; R14 Setext exclusion defence-in-depth filter).
- [data-model.md](specs/015-read-heading/data-model.md) — schema diagrams (input + output + eval-envelope), JS template body (~50 LOC formatted), base64 payload assembly, per-tool invariants table, module LOC budget (~205 source / ~960 test), test inventory (20 / 30 / 5 = 55 cases).
- [contracts/read-heading-input.contract.md](specs/015-read-heading/contracts/read-heading-input.contract.md) — public input contract: zod schema, emitted JSON Schema shape, field policy, structural heading-path validator, six worked examples (A–F), error response roster, multi-vault notes.
- [contracts/read-heading-handler.contract.md](specs/015-read-heading/contracts/read-heading-handler.contract.md) — handler invariants: deps shape, single invokeCli call shape, JS template assembly + base64 payload renderer, two-stage eval response parse, envelope-error → UpstreamError mapping table, failure propagation chain (with diagram), test seam pattern with argv-payload decode assertion, single-spawn invariant.
- [quickstart.md](specs/015-read-heading/quickstart.md) — 22 verification scenarios mapped to SC-001..SC-022 (S-1..S-19 in CI; S-20..S-22 manual against MCP Inspector / Claude Desktop with TestVault opened).

Predecessor features:
- **014-find-by-property**: [spec.md](specs/014-find-by-property/spec.md), [plan.md](specs/014-find-by-property/plan.md) — the fifth typed tool and the first eval-composition typed tool. THIS feature mirrors the eval composition pattern (R2 / R3), the base64 anti-injection pattern (R6), the inherited vault-routing limitation (R4 / R11), the structured error envelope idiom (R13). **Departures**: STANDARD target_mode discriminator (this feature has it; 014 doesn't); structural heading-path validator (different shape vs 014's folder-traversal regex); pre-parsed Obsidian headings array reuse (R7 collapses what would otherwise be a wrapper-side Markdown parser).
- **013-read-property**: [spec.md](specs/013-read-property/spec.md), [plan.md](specs/013-read-property/plan.md) — the fourth typed tool and the first surgical-frontmatter-read primitive. THIS feature mirrors its target_mode discriminator (R4) and the post-011 module layout. Departure: single-call architecture (vs 013's two-call); subcommand is `eval` not `properties`; output is `{content: string}` (vs 013's typed value+type).
- **012-delete-note**: [spec.md](specs/012-delete-note/spec.md), [plan.md](specs/012-delete-note/plan.md) — the third typed tool. THIS feature mirrors the `RegisterDeps` shape and Original-no-upstream attribution conventions.
- **011-write-note**: [spec.md](specs/011-write-note/spec.md), [plan.md](specs/011-write-note/plan.md) — introduced the cli-adapter's R5 unknown-vault response-inspection clause. THIS feature inherits the clause unchanged for the `eval` subcommand (cited via 014's verification — `Vault not found.` byte-identical).
- **010-flatten-target-mode**: [spec.md](specs/010-flatten-target-mode/spec.md), [plan.md](specs/010-flatten-target-mode/plan.md) — flattened `targetModeSchema`. CONSUMED by `read_heading` via `applyTargetModeRefinement` + `targetModeBaseSchema` reuse.
- **006-read-note**: [spec.md](specs/006-read-note/spec.md), [plan.md](specs/006-read-note/plan.md) — first typed tool. THIS feature follows its content-string output shape pattern.
- **005-help-tool**: [spec.md](specs/005-help-tool/spec.md), [plan.md](specs/005-help-tool/plan.md) — registry-consistency test. THIS feature populates `docs/tools/read_heading.md` (new file per FR-023); the existing registry-consistency test at [src/server.test.ts](src/server.test.ts) auto-asserts the file's existence once `read_heading` is registered.
- **003-cli-adapter**: [spec.md](specs/003-cli-adapter/spec.md), [plan.md](specs/003-cli-adapter/plan.md) — `invokeCli` adapter. THIS feature routes through it once per request (R3); the 011-R5 unknown-vault response-inspection clause is inherited; the dispatch layer's four-priority error classifier (`Error: no active file` → `ERR_NO_ACTIVE_FILE`; general `Error:` → `CLI_REPORTED_ERROR`) is leveraged as a safety net for unexpected eval runtime errors.
- **004-target-mode-schema**: [spec.md](specs/004-target-mode-schema/spec.md), [plan.md](specs/004-target-mode-schema/plan.md) — defined the target_mode primitive. **CONSUMED** by this feature via `targetModeBaseSchema` extension.
- **008-refactor**, **007-fix-list-tools-schema**, **009-fix-inputschema-publication**, **002-detect-cli-errors**, **001-add-cli-bridge**: foundational; not touched.

References:
- [.specify/memory/constitution.md](.specify/memory/constitution.md) — All five principles satisfied (no Complexity Tracking entries needed). Principle I (per-surface module under `src/tools/read_heading/`); Principle II (55 co-located tests); Principle III (zod is single source of truth for input AND output AND eval envelope; types via z.infer; no hand-rolled types); Principle IV (zero new error codes; failures flow through VALIDATION_ERROR + adapter's four codes + ERR_NO_ACTIVE_FILE; 011-R5 inherited); Principle V (Original-no-upstream headers on every new source file).
- [.decisions/ADR-003 - Enforce Target Mode in Typed Tools.md](.decisions/) — **enforced** by this feature via `applyTargetModeRefinement` + `targetModeBaseSchema` reuse from `src/target-mode/target-mode.ts`. The ADR governs typed tools that operate on a single named file or active file; `read_heading` is exactly that surface. The ADR is NOT amended.
- [.decisions/ADR-005 - Token-Optimized Tool Definitions.md](.decisions/) — reaffirmed; `stripSchemaDescriptions` applied at registration via `registerTool` (auto).
- [.decisions/ADR-006 - Centralized Tool Registration.md](.decisions/) — reaffirmed; `registerTool` factory wraps schema parse + UpstreamError propagation + JSON serialisation.
- [.architecture/Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md) — the architecture this BI continues to implement.
<!-- SPECKIT END -->

## Test Execution

Before invoking any test that touches the filesystem or the `obsidian` CLI binary, read [.memory/test-execution-instructions.md](.memory/test-execution-instructions.md). It names the authorised test vault, the scratch subdirectory, the destructive-probe protocol, and the cleanup expectations. The `.memory/` folder is gitignored — those instructions are for the assistant, not the project, so do not move them into a checked-in location and do not edit them on the user's behalf without being asked.

This gate applies to every test category that produces real CLI invocations: T0 live-CLI probes during `/speckit-implement`, FR-019 characterisation cases, manual quickstart scenarios, and any ad-hoc validation of a tool call's behaviour against a real vault. It does not apply to in-process unit tests that mock `invokeCli`.

## Communication Style

**Default mode**: caveman full — implicitly active for every response in this project. The user has set this as the project-wide default; you do NOT need to invoke `/caveman full` per response, and you do NOT need to mention that caveman mode is active.

**What "full" means** (per the caveman skill at `~/.claude/skills/caveman/SKILL.md`):
- Drop articles (a/an/the), filler ("just", "really", "basically", "actually", "simply"), pleasantries ("Sure!", "Of course", "Happy to help"), and hedging.
- Fragments OK. Short synonyms (big not extensive, fix not "implement a solution for").
- Pattern: `[thing] [action] [reason]. [next step].`
- Technical terms exact. Code blocks unchanged. Errors quoted exact. Function names, API names, error strings: never abbreviate.

**Auto-clarity carve-outs** (drop the full-mode terseness when):
- Security warnings or destructive-action confirmations.
- Irreversible action confirmations.
- Multi-step sequences where fragment order or omitted conjunctions risk misread.
- Compression itself creates technical ambiguity.
- The user asks for a clarification or repeats a question.
Resume full mode after the clear part is done.

**Override**: the user can switch level mid-conversation with `/caveman lite|ultra|wenyan-lite|wenyan-full|wenyan-ultra` or revert entirely with `stop caveman` / `normal mode`. Honour the override for the rest of the session.

**Writing artifacts (CLAUDE.md, spec.md, plan.md, research.md, source files, commit messages, PR descriptions)**: write in normal prose — these are durable artifacts read out-of-conversation. Caveman full applies to chat responses only.

## Architecture & Decision References

Two reference folders document the project's design rationale. Consult them **before** proposing or making design decisions, and cite the relevant ADR/architecture section when justifying choices:

- [.architecture/](.architecture/) — high-level architecture notes describing the system's structure, module boundaries, and design principles. Start with [Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md).
- [.decisions/](.decisions/) — Architecture Decision Records (ADRs). [Decision Log.md](.decisions/Decision%20Log.md) is the index; each ADR-NNN file contains the full decision text.

When a design choice conflicts with an existing ADR, surface the conflict to the user rather than silently overriding it — superseding an ADR is a deliberate act that should produce a new ADR, not an undocumented drift.
