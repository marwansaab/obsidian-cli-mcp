# Research: Prepend Note (Phase 0)

**Branch**: `045-prepend-note` | **Date**: 2026-05-26
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This document resolves the Technical Context unknowns flagged in plan.md and pins the design decisions that the wrapper's structure depends on. Each finding records the **Decision** taken, the **Rationale**, and the **Alternatives Considered**.

## R1 — Pipeline choice: CLI-wrap of `obsidian prepend`; tool name `prepend` (ADR-010 applies)

**Decision**: Implement `prepend` as a CLI-wrap of the native upstream `obsidian prepend` subcommand. The wrapper does NOT re-implement frontmatter detection, separator-decide-and-concatenate, or any byte-level write logic in TS. The upstream subcommand owns the entire write operation (frontmatter detection, insertion-point placement, separator semantics, line-ending preservation, atomic write); the wrapper publishes a typed, validated, structured-error surface over the existing upstream contract. Tool name `prepend` mirrors the upstream subcommand name per ADR-010.

**Rationale**: This is the load-bearing pipeline decision and a deliberate cohort divergence from BI-044's fs-direct pipeline pick. Five factors drive the CLI-wrap choice for BI-045 specifically:

1. **FR-005b is a hard MUST NOT on a wrapper-side frontmatter parser**: The spec's FR-005b reads: "System MUST defer the detection of YAML frontmatter to the underlying execution layer and MUST NOT introduce a wrapper-side frontmatter parser. When the frontmatter is malformed (missing closing `---`, leading `---` used as a horizontal rule rather than a frontmatter delimiter, or any other detection edge case), the wrapper inherits whatever placement the underlying layer produces; no wrapper-side malformed-frontmatter typed error is published." Going fs-direct would require either (a) re-implementing the YAML frontmatter detector in TS — a literal violation — or (b) running a pre-flight `obsidian eval` to compute the insertion-point offset from Obsidian's own state, then doing the write fs-direct (a hybrid that costs an extra spawn round-trip per call and depends on Obsidian's metadataCache being warm — both are operational fragility the cohort actively avoids). CLI-wrap honours FR-005b literally and trivially: detection happens inside the upstream subcommand's address space, governed by the upstream's well-tested YAML parser.

2. **Frontmatter-aware operations are the property-cohort pattern, not the content-write-cohort pattern**: BI-044's fs-direct discipline was driven by content-payload-on-argv concerns (BI-0038 Windows argv defect). For frontmatter-aware operations, the cohort precedent is uniformly CLI-wrap: `set_property` (wraps `property:set`), `read_property` (wraps `property:read`), `properties` (wraps `properties`), `find_by_property` (wraps `properties` + filtering). All four tools delegate YAML frontmatter parsing to upstream and surface only the typed schema/result envelope. BI-045's defining contract (FR-005a frontmatter-aware insertion + FR-011 byte-for-byte frontmatter preservation) places it structurally in the property-write cohort, not the content-write cohort. Cohort-discipline-aligned pipeline = CLI-wrap.

3. **The upstream parameter shape matches the spec contract byte-for-byte**: The local `obsidian --help` output reports `prepend file=<name> path=<path> content=<text> inline` — exactly the shape FR-001 / FR-005 / FR-006 / FR-007 publish. No translation layer is needed; the wrapper's `invokeCli` call passes the validated input straight through. The upstream subcommand is also symmetric to `obsidian append` (the BI-044 sibling), which means the upstream-side maintenance burden is materially smaller — fixes that ship upstream benefit both append-direction and prepend-direction operations.

4. **The argv-pipe constraint is acceptably mitigated by FR-018's documented cap**: The argv-pipe Windows-defect (BI-0038) that drove BI-044 to fs-direct surfaces as a hard ceiling on argv element size — Windows' CreateProcess command-line maximum is ~32 767 chars. BI-044 chose to escape that ceiling entirely by going fs-direct ("user content NEVER crosses argv at any size"). BI-045 chooses instead to publish the ceiling as a documented contract surface: FR-018 activates with a concrete 24 576 UTF-16 code-unit cap (24 KiB), which holds the total argv envelope below the platform ceiling with ~8 KB of headroom (see R3 for the budget breakdown). The cap is published in `inputSchema.maxLength`, surfaces as a typed `CONTENT_TOO_LARGE` validation error before any spawn, and is documented in the tool's help text. Callers needing larger payloads use the full-replace `write_note` surface (which is fs-direct and content-cap-free for exactly this reason). The cap is a documented contract, not a workaround.

5. **The wrapper is materially smaller and easier to audit**: A CLI-wrap implementation is ~30 LOC of handler logic + ~25 LOC of schema. An fs-direct implementation would add (a) a wrapper-side frontmatter detector (~30 LOC including malformed-frontmatter inheritance logic), (b) a prepend-edit pure helper for the separator-decide-and-concatenate logic (~25 LOC mirroring BI-044's `appendEdit`), (c) atomic write-temp-then-rename logic (~30 LOC mirroring BI-044's handler tail), and (d) EXTERNAL_EDITOR_CONFLICT errno classification (~15 LOC mirroring BI-044). Total fs-direct path = ~125 LOC of new in-tree logic plus the FR-005b literal violation. CLI-wrap path = ~55 LOC of new in-tree logic with no FR violation. The Dependencies rule's in-tree-bias clause (~150 LOC threshold) authorises either path; the smaller path is the cohort-discipline default when both honour the contract.

**ADR-010 analysis**: ADR-010 mandates that typed tools WRAPPING upstream subcommands MUST mirror the subcommand name. BI-045 is a wrapper. ADR-010 applies. Tool name `prepend` mirrors the upstream `obsidian prepend` subcommand. Cohort precedent: `read`, `delete`, `rename`, `files`, `set_property`, `read_property`, `properties`, `find_by_property`, `outline`, `links`, `backlinks`, `read_heading` — every CLI-wrap typed tool in the cohort mirrors its upstream subcommand. The naming asymmetry with BI-044's `append_note` is deliberate and cohort-discipline-consistent — fs-direct re-implementations use the descriptive-name convention (`*_note` suffix); CLI-wrap wrappers use the mirror-name convention. Both conventions are unambiguous from a discoverability standpoint when published in the help-text inventory.

**Spec FR-005b satisfaction**: The literal MUST and MUST NOT clauses of FR-005b are honoured by the CLI-wrap pipeline. Detection is deferred to the upstream's YAML frontmatter parser; no wrapper-side parser is introduced. Malformed-frontmatter behaviour is inherited verbatim from upstream — the wrapper publishes no separate typed error for malformed-frontmatter, and no novel placement behaviour is invented at the wrapper boundary.

**Spec FR-027 satisfaction**: The spec's pipeline-agnostic clause ("the contract is observable behaviour and a documented size ceiling, not the choice of pipeline") authorises any pipeline pick that delivers the observable contract. CLI-wrap delivers the contract via FR-001 through FR-023 (the upstream's behaviour matches the spec's stated FRs, verified at T0 — see R5) plus FR-017/FR-018's documented size ceiling (24 KiB UTF-16 code units, per R3).

**Cohort-divergence acknowledgement**: BI-044 went fs-direct (cohort precedent within the content-write family). BI-045 goes CLI-wrap (cohort precedent within the frontmatter-aware family). The divergence is across cohort BOUNDARIES, not within the same cohort; it is materially justified above and is not a constitutional violation. ADR-009 (Direct Filesystem Write Path Alongside CLI Bridge) codifies the existence of the fs-direct path — it does not mandate that every new write tool USE that path. BI-045's pick respects ADR-009's normative scope by not extending the fs-direct substrate to a new operation while still delivering the spec's contract through the equally-supported CLI-wrap substrate.

**Alternatives Considered**:

- **fs-direct via the ADR-009 substrate (cohort parity with BI-044)**: rejected for the five reasons above — chiefly FR-005b's literal MUST NOT on a wrapper-side frontmatter parser. Also rejected as more code (~125 LOC of new in-tree logic vs ~55 LOC for CLI-wrap), more failure surface (atomic-write classification, frontmatter detector edge cases, line-ending preservation logic to mirror byte-for-byte against upstream — verifiable only via repeated T0 probes), and a maintenance burden divergent from upstream (upstream-side fixes to the frontmatter detector would not propagate to the wrapper).

- **fs-direct with a pre-flight `obsidian eval` for the insertion-point offset (hybrid)**: rejected — adds the extra spawn round-trip per call (cost-equivalent to the wikilink-form-resolver round-trip but for every call regardless of locator shape), depends on Obsidian's metadataCache being warm for accurate frontmatter detection (race against in-progress edits in other tools), and surfaces a novel failure mode (eval-returns-stale-offset → wrapper writes at the wrong byte position) that the cohort has no precedent for handling. The hybrid satisfies FR-005b's literal text (detection IS deferred to Obsidian's parser via eval) but at materially higher operational cost than full CLI-wrap.

- **CLI-wrap with no content-cap (FR-017 substrate-bounded, cohort parity with BI-044's no-cap discipline)**: rejected — the cohort discipline of "user content NEVER crosses argv" is the disciplined response to BI-0038. Under CLI-wrap, content DOES cross argv; the disciplined response is then to publish the constraint as a documented cap (FR-018 active) rather than to leave callers exposed to platform-specific crashes. The cap is FR-017's "documented size ceiling" requirement made concrete; leaving it unsatisfied would itself be the SC-007/SC-008 contract-and-implementation mismatch the spec warns against.

- **Tool name `prepend_note` (descriptive-name convention, cohort parity with `append_note`)**: rejected — ADR-010 applies because the BI is a wrapper. Cohort precedent (`read`, `delete`, `rename`, etc.) is unambiguous: wrappers mirror upstream names. The `append_note` asymmetry is intentional within the cohort's two-convention system (`*_note` for fs-direct re-implementations, mirror-name for CLI-wrappers) and is not a cohort-uniformity argument that overrides ADR-010.

- **Wrap `obsidian prepend` but rename the tool to `prepend_note` anyway for paired discoverability with `append_note`**: rejected — discoverability is delivered through the help-text inventory and the index.ts description string (which cross-links the BI-044 sibling and explains the convention asymmetry), not through forced name-symmetry that would force ADR-010 into N/A status under false pretences.

## R2 — Frontmatter-aware insertion semantics: inherited verbatim from upstream

**Decision**: The wrapper does NOT implement frontmatter detection, insertion-point selection, or separator decision logic. All byte-level placement is owned by the upstream `obsidian prepend` subcommand. The wrapper's contract is to pass validated `file`/`path`/`content`/`inline` to upstream and translate upstream's response into the typed output envelope (success) or typed `UpstreamError` (failure).

**Rationale**: This is the direct consequence of R1's pipeline pick. FR-005a's frontmatter-aware insertion-point rule, FR-006's default-separator rule, FR-006a's "content's trailing newline IS the separator" symmetric, FR-007's inline opt-in, FR-008's line-ending preservation, FR-009's 0-byte-file rule, FR-010's prior-content preservation, FR-010a's verbatim content handling, and FR-011's frontmatter byte-for-byte preservation are ALL inherited from upstream's implementation. The wrapper's job is to validate inputs, classify upstream's errors, and surface the response in the cohort envelope.

**T0 verification protocol (deferred to /speckit-implement)**: Before implementation lands, run the T0 probe protocol against the authorised test vault per `.memory/test-execution-instructions.md`. For each of the following input/file shape combinations, capture upstream's stdout/stderr and the resulting on-disk bytes (`Format-Hex` per the test-execution protocol), confirm the behaviour matches the spec's stated FR, and record the byte-level outcome in `tasks.md`'s T0 cell:

| Probe ID | File shape | Locator shape | Inline? | Content shape | Expected outcome (per spec) | Notes |
|----------|-----------|---------------|---------|---------------|----------------------------|-------|
| T0-P01 | FM + non-empty body | `path` | default | `Lead` | FR-005a: lands after closing `---`; FR-006 separator inserted before existing body | Primary happy path |
| T0-P02 | No FM + non-empty body | `path` | default | `Lead` | FR-005a: lands at byte zero; FR-006 separator inserted before existing body | |
| T0-P03 | FM + empty body | `path` | default | `Lead` | FR-005a + FR-009 symmetric: lands after closing `---`, no separator | |
| T0-P04 | 0-byte file | `path` | default | `Lead` | FR-009: lands at byte zero, no separator | |
| T0-P05 | FM + non-empty body | `path` | default | `Lead\n` | FR-006a: content's trailing `\n` IS the separator (no additional one inserted) | Prepend-direction symmetric of BI-044 FR-006a |
| T0-P06 | FM + non-empty body | `path` | inline | `Lead` | FR-007: fuses onto existing leading body line (`LeadExisting`); FM preserved | Inline opt-in × FM |
| T0-P07 | No FM + non-empty body | `path` | inline | `Lead` | FR-007: fuses onto existing leading body line | Inline opt-in × no-FM |
| T0-P08 | FM + non-empty body | `file` (wikilink-form name) | default | `Lead` | FR-002: name resolves; locator works | Locator-shape coverage |
| T0-P09 | FM + non-empty body | (active mode) | default | `Lead` | FR-001: active locator works after focused-file eval | Locator-shape coverage |
| T0-P10 | Missing file | `path` | default | `Lead` | FR-016: NOTE_NOT_FOUND error; no file created | Failure mode |
| T0-P11 | FM with CRLF line endings + non-empty body | `path` | default | `Lead` | FR-008: CRLF convention preserved in inserted separator | Line-ending preservation |
| T0-P12 | Malformed FM (no closing `---`) | `path` | default | `Lead` | FR-005b: wrapper inherits upstream's placement; no wrapper-side malformed-FM error | Edge case — record upstream's actual behaviour |

The probes' actual outcomes are recorded inline in tasks.md at T0; if any probe outcome diverges from the spec's stated FR, surface the divergence in the task and either (a) patch the wrapper to translate upstream's behaviour into the spec's contract (e.g. if upstream's CRLF preservation is buggy, the wrapper inserts a translation step) or (b) update the spec via an amended clarification (e.g. if upstream's malformed-FM behaviour is observably different from "inherit whatever it does", document the actual observed behaviour). The protocol mirrors BI-044's R2 + T0 verification approach.

**Alternatives Considered**:

- **Verify upstream's behaviour at plan phase via T0 probes**: rejected — the auto-mode test-vault-write classifier currently denies the probe attempt without an explicit per-path permission. Deferring to /speckit-implement's T0 phase is the cohort-default approach (BI-044's research.md noted some details would be confirmed at implement time) and avoids permission-prompt churn during the plan phase.

- **Implement the byte-level rules in TS as the source of truth, treating upstream's behaviour as a verification check**: rejected — that's the fs-direct path, already rejected in R1. The point of CLI-wrap is to delegate the byte-level rules to upstream, not to mirror them in-tree.

## R3 — Content size cap: 24 576 UTF-16 code units (24 KiB), FR-018 active

**Decision**: The wrapper publishes a maximum supported content payload size of **24 576 UTF-16 code units (24 KiB)**. The cap is implemented as `z.string().max(24576)` in the schema layer, surfaces as a typed `(VALIDATION_ERROR, CONTENT_TOO_LARGE)` typed error per ADR-015 (single-state sub-discriminator — no `details.reason` enumeration), and is documented in the tool's help-text description string. Content payloads at or below the cap are accepted (subject to the other failure modes); payloads above the cap are rejected before any spawn occurs (FR-018 + FR-023).

**Rationale**: This is a load-bearing decision driven by R1's CLI-wrap pipeline pick — once content crosses argv, the platform argv ceiling becomes a contract concern, and the cohort's "document the ceiling" discipline (FR-017 + FR-018) requires picking a concrete number that's safe across every supported platform.

**Argv budget breakdown** (Windows is the bottleneck — ~32 767 char CreateProcess command-line maximum per Microsoft documentation):

| Element | Worst-case size (chars) | Note |
|---------|-------------------------|------|
| Binary path | ~50 | `C:\Program Files\Obsidian\obsidian.exe` |
| `vault=<name>` | ~1 010 | 1000-char vault-name cap + `vault=` prefix + safety |
| Subcommand keyword (`prepend`) | ~10 | |
| `file=<name>` OR `path=<path>` | ~1 010 | 1000-char locator cap + `file=` / `path=` prefix + safety |
| `content=<text>` prefix | ~10 | `content=` |
| `inline` flag (optional) | ~10 | |
| Argv separator characters + escape quoting overhead | ~150 | Quoting newlines and special chars in `content` can add ~10-25% overhead in pathological cases |
| Subtotal (everything except content) | ~2 250 | |
| **Available for `content=<text>` payload** | **~30 517** | (32 767 − 2 250) |

**Cap selection**: 24 576 chars (24 KiB) leaves ~5 940 chars of headroom (~24%). The headroom absorbs (a) escape-sequence inflation when content contains many newlines/quotes/backslashes that the cohort's `invokeCli` argv-builder escapes (cohort-empirical inflation can spike up to ~25% in worst-case content patterns), (b) UTF-8 expansion when content contains multibyte chars on platforms that count argv in bytes rather than code units (most cohort platforms count code units, but Windows' Unicode argv handling has historically had per-byte expansion bugs the cohort has run into), and (c) future argv-element growth if the locator cap is raised in a future cohort BI without a synchronised content-cap revisit. The number is a clean power-of-2-ish value (24 KiB = 24 * 1024) that's easy to remember and easy to communicate in the help text.

**Cohort precedent for "content cap on CLI-wrap content-carrying tools"**:

| Tool | Content cap | Rationale |
|------|-------------|-----------|
| `set_property` (CLI-wrap, `value=` param) | None published | `value=` is structurally small (property values, not free-form content) — argv ceiling never realistically approached |
| `find_and_replace` (fs-direct, `find` / `replace` params) | None published | fs-direct; content never crosses argv |
| `write_note` (fs-direct, `content=` param) | None published | fs-direct; content never crosses argv |
| `append_note` (fs-direct, `content=` param) | None published | fs-direct; content never crosses argv |
| `patch_heading` (fs-direct, `content=` param) | None published | fs-direct; content never crosses argv |
| `patch_block` (fs-direct, `content=` param) | None published | fs-direct; content never crosses argv |
| **`prepend` (CLI-wrap, `content=` param)** | **24 576 chars (24 KiB)** | **CLI-wrap; content crosses argv → cap required** |

`prepend` is the first cohort tool that exposes the argv-ceiling constraint as a typed user-facing error. Future cohort CLI-wrap tools that carry user-controlled content payloads inherit the precedent.

**Alternatives Considered**:

- **8 KiB cap (8 192 chars)**: rejected — too conservative; would block legitimate medium-size prepends (multi-paragraph TL;DRs, embedded JSON snippets) that fit comfortably within the platform ceiling. The TL;DR-above-body use case the spec's user-story narrative anchors on can spike to ~5-10 KiB in practice (e.g. AI-generated summaries with structure preserved).

- **30 KiB cap (30 720 chars)**: rejected — too aggressive; leaves only ~2 KB of headroom, which is below the cohort's empirical escape-inflation maximum (~25% on pathological content). Real-world callers would hit unpredictable failures when content contains many escape-required chars.

- **No published cap (substrate-bound, cohort parity with BI-044)**: rejected — see R1 #4. Under CLI-wrap, callers face the platform ceiling whether the wrapper publishes it or not; publishing the cap turns an undefined failure mode into a typed, validated, predictable error.

- **Platform-conditional cap (24 KiB on Windows, 96 KiB on Linux/macOS)**: rejected — adds a leaky abstraction ("the cap depends on the platform you happen to be running on"); cross-platform agents can't reason about the cap without a runtime probe; the cohort's portable-cap discipline (cohort parity with the cohort's 1000-UTF-16-code-unit locator cap, which is also portable rather than platform-conditional) wins.

- **Express the cap in bytes rather than UTF-16 code units**: rejected — zod's `z.string().max(N)` measures in UTF-16 code units (JavaScript's native string length unit); switching to a byte-count cap would require a custom refinement and would surface inconsistently to callers (BMP chars count as 1 code unit but 1-3 bytes UTF-8). Code-unit cap is the cohort default (cohort parity with the 1000-UTF-16-code-unit locator cap).

## R4 — Active-mode opt-in posture: inherited verbatim from BI-044 FR-004a

**Decision**: Active-mode prepend requests require ONLY `target_mode: "active"` plus a non-empty, non-oversized `content` payload (subject to the locator-mutual-exclusivity rule of FR-014). No active-mode opt-in flag is added (e.g. no `confirmActive: true`). This is a deliberate cohort exception to `write_note`'s mandatory `overwrite: true` in active mode, inherited from BI-044's FR-004a unchanged.

**Rationale**: Prepend is additive (wrong-target = recoverable additive noise at the TOP of an unintended note, removable by deleting the prepended bytes) rather than destructive (wrong-target = total prior-content destruction). The asymmetric safety profile justifies the asymmetric opt-in posture. The same argument BI-044 made for append-direction additive noise at the bottom of an unintended note applies symmetrically to prepend-direction additive noise at the top — the recovery effort is equivalent in either direction (read the bytes back, remove the prepend, write the original content back through `write_note`). Cohort discipline holds across the additive-write family.

**Implementation**: The `target_mode` discriminator (`applyTargetModeRefinement(targetModeBaseSchema.extend(...))`) accepts `target_mode: "active"` without requiring `confirmActive`. The handler routes active-mode calls through the existing focused-file eval (cohort parity with `set_property`, `append_note`'s handler) to resolve the focused-file's vault-relative path before passing it to `obsidian prepend` as `file=<resolved-path>` — same shape as BI-044's `executeAppendNote` resolver.

**Alternatives Considered**:

- **Require `confirmActive: true` (cohort parity with `write_note`)**: rejected — `write_note`'s opt-in posture is calibrated to destructive operations; prepend is additive. Imposing the opt-in on prepend would add ergonomic friction to the dominant interactive-authoring case (rapid in-editor TL;DR prepending, status-block additions, header insertions against the focused note) without a matching safety benefit. Settled in spec by BI-044's Clarifications Session 2026-05-25 Q3 inheritance.

- **Require `confirmActive: true` only when the `inline` opt-in is also enabled**: rejected — inline opt-in already requires explicit caller action; layering a second opt-in on top would be redundant ceremony. Settled at BI-044 Q3.

## R5 — Wikilink-form locator resolution: pre-flight `obsidian file file=<name>` TSV resolver (cohort parity with BI-044, `set_property`)

**Decision**: When the caller supplies a wikilink-form `file=<name>` locator, the handler runs a pre-flight `invokeCli({ command: "file", parameters: { file: input.file }, target_mode: "specific" })` call to resolve the name to its canonical vault-relative path. The resolved path is then passed to `obsidian prepend` as `path=<resolved-path>` (NOT as `file=`). Specific+`path` mode skips the resolver and passes the input verbatim to upstream. Active mode runs the focused-file eval (R7) to resolve the path before calling `obsidian prepend`.

**Rationale**: FR-003 requires the response payload to identify the file by its resolved vault-relative path regardless of which locator shape the caller supplied. Calling `obsidian prepend file=<name>` directly would (a) leave the wrapper unable to canonicalise the response (the wrapper doesn't see the resolved path) and (b) couple the wrapper's caller-attribution / rollback contract to whatever upstream chooses to report on success — fragile. Pre-flight resolving the name to a canonical path gives the wrapper full control over the FR-003 canonicalisation and makes the subsequent `prepend` call use the unambiguous `path=` shape.

**Cohort precedent**: `set_property` and `append_note` both use this exact pattern. The TSV resolver's response shape (`path\t<vault-relative-path>` line in stdout) is parsed by a small helper (cohort-shared pattern in BI-044's `parseFileTSV` and `set_property`'s equivalent).

**Spawn cost**:

| Locator shape | Number of upstream spawns | Cohort parity |
|---------------|---------------------------|---------------|
| `target_mode: "specific"` + `path` | 1 (just `obsidian prepend`) | `set_property` specific+path |
| `target_mode: "specific"` + `file` | 2 (`obsidian file` TSV → `obsidian prepend`) | `set_property` specific+file, `append_note` specific+file |
| `target_mode: "active"` | 2 (`obsidian eval` focused-file → `obsidian prepend`) | `set_property` active, `append_note` active |

Empirical per-spawn cost in the cohort: ~50-150 ms (Electron startup is the dominant factor); two-spawn modes therefore total ~100-300 ms p95.

**Alternatives Considered**:

- **Pass `file=<name>` to upstream directly without pre-flight resolution**: rejected — see Rationale; would force the wrapper to either (a) echo the unresolved name back to the caller (FR-003 violation — the response would not canonicalise to vault-relative path) or (b) post-flight resolve via a follow-up eval (cost-equivalent to pre-flight but reverse-ordered, with no benefit and a worse failure semantics if the post-flight resolve fails after the write succeeded).

- **Skip canonicalisation entirely; echo whatever the caller supplied**: rejected — FR-003 mandates canonicalisation. The response payload's caller-attribution / rollback affordance depends on the response naming the actual file written, not the caller's input shape.

## R6 — Error classification: stdout/stderr mapping table

**Decision**: The wrapper inspects upstream's stdout/stderr and process exit code to classify failures into the cohort's typed-error vocabulary. The classification table:

| Upstream signal | Wrapper response | Notes |
|-----------------|------------------|-------|
| Exit code 0 + non-error stdout | Success → return typed output envelope | Happy path |
| Exit code != 0 + stderr containing "not found" / "does not exist" / "no such file" (cohort-known patterns) | `UpstreamError({ code: "CLI_REPORTED_ERROR", details: { code: "NOTE_NOT_FOUND", path, vault } })` | FR-016. T0 confirms exact pattern. |
| Exit code != 0 + stderr containing external-editor / locked-file pattern (cohort-known from BI-040 / BI-044) | `UpstreamError({ code: "CLI_REPORTED_ERROR", details: { code: "EXTERNAL_EDITOR_CONFLICT", reason: "file-locked" \| "unsaved-changes", path } })` | FR-022. Detection-capability-bound per FR-022 caveat. T0 confirms upstream's exact signal. |
| Exit code != 0 + active-mode + no focused file (upstream reports "no active file" or similar) | `UpstreamError({ code: "ERR_NO_ACTIVE_FILE", details: { ... } })` | FR-004. Active-mode-only path. |
| Pre-flight resolver fails (specific+file → no such name) | `UpstreamError({ code: "CLI_REPORTED_ERROR", details: { code: "NOTE_NOT_FOUND", path, vault } })` | FR-016. Pre-flight resolver's failure surfaces as the same FR-016 error as the prepend-direction not-found case — cohort parity with BI-044. |
| Path-safety check fails (Layer 1 schema or Layer 2 canonical) | `UpstreamError({ code: "PATH_ESCAPES_VAULT", details: { vault, attemptedPath, resolvedPath? } })` | Cohort parity. Layer 1 is schema-layer (FR-001a + structural-path-safety); Layer 2 is canonical-path check (cohort parity with BI-044). |
| Unrecognised upstream failure (exit code != 0, no known pattern) | `UpstreamError({ code: "CLI_REPORTED_ERROR", details: { stage: "prepend-cli", stdout, stderr } })` | Fallback. Cohort parity with `set_property`'s unrecognised-error path. |

**Rationale**: The classification table is the wrapper's primary value-add over the universal `obsidian_exec` escape-hatch (typed, programmatically distinguishable errors per US2). The table draws on cohort-known patterns from BI-040 (`patch_heading` external-editor signal), BI-043 (`patch_block` not-found signal), BI-044 (`append_note` same), and the property cohort. Exact upstream signal patterns are confirmed at T0 (R2 protocol).

**T0 confirmation deferred**: Until T0 runs against the authorised test vault, the exact byte strings of upstream's NOTE_NOT_FOUND / EXTERNAL_EDITOR_CONFLICT signals are not known with byte-level certainty for the `prepend` subcommand specifically. The cohort-known patterns from `set_property` / `append_note` provide strong priors. T0 fills the gap.

**Alternatives Considered**:

- **Classify only by exit code; surface stdout/stderr verbatim**: rejected — exit code alone doesn't distinguish NOTE_NOT_FOUND from EXTERNAL_EDITOR_CONFLICT from generic CLI failures. The classification value-add requires stdout/stderr inspection.

- **Trust upstream's structured output (if any)**: probed — `obsidian --help` doesn't advertise structured error output for `prepend`. The cohort pattern is plain-text stderr inspection; BI-045 inherits.

## R7 — Active-mode focused-file resolution: byte-stable with cohort

**Decision**: For `target_mode: "active"`, the handler runs the cohort-standard focused-file eval template before calling `obsidian prepend`:

```javascript
(async()=>{const f=app.workspace.getActiveFile();return JSON.stringify({path:f?.path??null,base:app.vault.adapter.basePath});})()
```

This is byte-stable with BI-044's `FOCUSED_FILE_TEMPLATE` in `src/tools/append_note/handler.ts`. The eval returns `{ path: <relative-path>|null, base: <vault-absolute-base-path> }`. If `path === null`, the wrapper raises `ERR_NO_ACTIVE_FILE` per FR-004; otherwise, it resolves the vault display name via the registry's reverse-lookup (cohort parity) and passes `vault=<display-name>` + `path=<resolved-path>` to `obsidian prepend`.

**Rationale**: Cohort parity is the dominant constraint here — diverging from BI-044's focused-file resolution template would introduce a second eval template (twice the upstream-side maintenance burden) without an obvious benefit. Reuse byte-stably.

**Alternatives Considered**:

- **Pass `target_mode: "active"` to `obsidian prepend` directly (let upstream resolve the focused file)**: rejected — the wrapper's FR-003 canonicalisation depends on the wrapper knowing the resolved path. Cohort parity with BI-044's two-spawn active-mode pattern.

- **Lift the cohort-shared `FOCUSED_FILE_TEMPLATE` to a shared module**: deferred — the template is duplicated across `set_property` and `append_note` today; a second `prepend` duplication brings the count to three. Three is the cohort's "lift when a third consumer appears" threshold (cohort parity with how other small string constants have been lifted). The lift is a small refactor outside this BI's contract surface and can land in a follow-up cohort-cleanup BI without blocking BI-045.

## R8 — Tests against mocked `invokeCli` (no fs mocking)

**Decision**: The handler's tests inject mocked `invokeCli` responses (stdout/stderr/exit-code) and assert against the typed output envelope or typed `UpstreamError` the wrapper produces. No `fs.readFile` / `fs.writeFile` / `fs.rename` mocking is needed because the wrapper does not touch the filesystem directly (the upstream does).

**Rationale**: Cohort parity with `set_property`'s test approach. The wrapper's behaviour is fully observable from its inputs (the validated schema input) and the mocked upstream output (the canned `invokeCli` response). No filesystem state machine is needed in the test surface.

The mocked-stdout fixtures are inlined in `handler.test.ts` as named string constants per cohort parity with BI-044's mocked-stderr fixtures. The T0 phase (R2) confirms the byte-level shape of upstream's actual stdout/stderr for each fixture before the implementation lands.

**Alternatives Considered**:

- **Live-CLI integration tests against the authorised test vault**: rejected as the default test surface — the cohort's discipline (per `.memory/test-execution-instructions.md`) is that live-CLI probes happen at T0 phase for behaviour confirmation, not as the dominant test surface. Live tests are platform-dependent (require Obsidian installed) and slow (Electron startup per probe); unit-test parity for the typed surface is the cohort default.

- **Spin up a fake-CLI subprocess that emits canned responses**: rejected — `invokeCli` injection (cohort parity) is strictly simpler than process-faking. The test surface is at the `invokeCli` boundary, not the spawn boundary.

## R9 — Index/help-text disclosure: progressive disclosure with BI-044 cross-link

**Decision**: The tool's published `inputSchema` JSON Schema carries `maxLength: 24576` on the `content` field plus a brief `description` noting the cap. The tool's MCP description string (visible to LLM clients via `list_tools`) names the cap explicitly and cross-links the BI-044 sibling. The progressive-disclosure `help_tool({ tool_name: "prepend" })` response carries the full FR-by-FR contract surface including the cap rationale, the worked examples per acceptance scenario, and the error-code roster.

**Rationale**: SC-008 requires the documented ceiling to match the enforced ceiling. The schema-published `maxLength` is the wrapper-enforced value; the description-string-published 24 KiB number must match. Single source of truth = the `MAX_CONTENT_LENGTH` constant in `schema.ts`; both the schema's `.max(N)` and the description string's interpolated value pull from the same constant.

**Cohort precedent**: BI-044's index.ts description string is the cohort's most thorough progressive-disclosure description (see `src/tools/append_note/index.ts`). BI-045's description mirrors the shape with cross-linking to `append_note` for the additive-write sibling relationship and to `write_note` / `patch_heading` for the alternative-surface fallbacks (prepend before frontmatter; sub-section writes).

## R10 — No new top-level error codes; Principle IV streak count

**Decision**: BI-045 introduces zero new top-level error codes. The Constitution Principle IV "zero-new-top-level-codes streak" extends to twenty tools (19 prior + `prepend`).

**New `details.code` value introduced**:

| `(top-level code, details.code)` pair | New? | State count | `details.reason` enum? | ADR-015 conformance |
|----------------------------------------|------|-------------|------------------------|---------------------|
| `(VALIDATION_ERROR, CONTENT_TOO_LARGE)` | **NEW** | 1 (single-state) | None | Single-state sub-discriminator; no `reason` enum required per ADR-015 |

**`details.code` values reused unchanged**:

| `(top-level code, details.code)` pair | Reused from | Notes |
|----------------------------------------|-------------|-------|
| `(VALIDATION_ERROR, CONTENT_EMPTY)` | BI-044 | Single-state; no change |
| `(CLI_REPORTED_ERROR, NOTE_NOT_FOUND)` | Read-side cohort + BI-044 | Single-state; no change |
| `(CLI_REPORTED_ERROR, EXTERNAL_EDITOR_CONFLICT)` | BI-040 + BI-043 + BI-044 | Two-state (`unsaved-changes`, `file-locked`); no change to the existing `details.reason` enum |
| `ERR_NO_ACTIVE_FILE` (top-level) | `write_note` + cohort | No change |
| `PATH_ESCAPES_VAULT` (top-level) | Cohort | No change |

**Rationale**: Cohort discipline. New top-level codes raise the auditing surface (Principle IV's grep-for-`UpstreamError` discipline); sub-discriminators via `details.code` per ADR-015 preserve the streak. `CONTENT_TOO_LARGE` is a natural sibling of `CONTENT_EMPTY` (both under `VALIDATION_ERROR`); the pair-level discoverability for cohort consumers (find_and_replace, write_note, append_note callers, future content-carrying tools) is improved by the shared parent code.

## R11 — Cohort divergence acknowledgement and audit trail

**Decision**: BI-045 is the first BI in the project's history to choose CLI-wrap for a content-carrying write tool. The divergence is materially justified above (R1) and is recorded explicitly here for the audit trail.

**Cohort precedent BEFORE BI-045**:
- Content-carrying writes go fs-direct: `write_note` (ADR-009), `append_note` (BI-044), `patch_heading` (BI-040), `patch_block` (BI-043), `find_and_replace` (BI-038, fs-direct).
- Property/frontmatter writes go CLI-wrap: `set_property`, `read_property`, `properties`, `find_by_property`, plus the read-side cohort.

**BI-045's positioning**: `prepend` carries user-controlled content (cohort-precedent → fs-direct) BUT is frontmatter-aware (cohort-precedent → CLI-wrap). The dominant signal in this BI is FR-005b's hard MUST NOT on a wrapper-side frontmatter parser. CLI-wrap wins.

**Future BIs in the same shape**: A future cohort tool that's both content-carrying AND frontmatter-aware inherits this BI's precedent (CLI-wrap with FR-018 active content cap) unless its spec explicitly opens the wrapper-side-frontmatter-parser path.

**Audit-trail surface**: The Constitution Compliance row on the BI-045 PR description and this research.md R1 / R11 together form the audit trail. /speckit-analyze on BI-045 verifies the cohort-divergence is properly justified and that no new top-level error codes were introduced; the post-BI graph re-build (`graphify update .`) confirms `prepend` lands in the property/frontmatter community rather than the content-write community, which is the structural truth-check that intent matches reality (per CLAUDE.md's "Validated architectural facts the graph encodes" — the graph distinguishes the two communities by import-graph topology).
