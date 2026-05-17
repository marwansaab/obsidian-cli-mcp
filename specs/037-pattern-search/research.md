# Research: Pattern Search

**Feature**: 037-pattern-search
**Date**: 2026-05-17
**Status**: Phase 0 complete

This document resolves the technical-context items the spec deferred, locks the design decisions that shape the Phase-1 contracts, and defines the T0 live-CLI probe plan.

---

## R1 — Execution path

**Decision**: `obsidian eval`-driven. Render a frozen JS template that runs inside the Obsidian Node runtime, enumerates `.md` notes via `app.vault.getMarkdownFiles()` (filtered by folder prefix when supplied), reads each note's content via `app.vault.cachedRead(file)`, runs `String.prototype.matchAll(new RegExp(pattern, flags))` per line, and emits a JSON envelope back to stdout. Wrapper-side `handler.ts` issues a single `invokeCli({ command: "eval", parameters: { code } })`, validates the envelope, post-processes (sort, truncation flag, output validation), and returns.

**Rationale**:

- Sibling parity. `paths` (BI-019), `find_by_property` (BI-014), `smart_connections_similar` (BI-026), `smart_connections_query` (BI-027), `tag` (BI-028), `move` (BI-030), `backlinks` (BI-036) are all eval-driven against the Obsidian Node runtime. The pattern is mature.
- ECMAScript regex semantics for free. Q1 (clarify session 2026-05-17) locked the pattern dialect to ECMAScript (Node `RegExp`). The eval body runs inside the Obsidian Electron Node runtime — `new RegExp(pattern)` there is exactly the Q1 contract. No translation layer is needed; the wrapper passes the pattern source string verbatim, the template instantiates the `RegExp` in-runtime, and the dialect is correct by construction.
- Single round-trip. One `invokeCli` call. No N+1 fan-out across `paths` → `read` × N.
- Folder-not-found surface is symmetric. `paths` emits `{ ok: false, code: "FOLDER_NOT_FOUND", folder }` envelopes; pattern-search reuses the same envelope shape and the same `details.code = "FOLDER_NOT_FOUND"` propagation path on the wrapper side.

**Alternatives considered**:

- **(a) Native CLI regex subcommand**. Would require `obsidian search:context --regex <pattern>` or equivalent. Probe at T0 confirms absence; the upstream CLI's `search` subcommand is keyword-only at the version we ship against (T0 probe records the exact `--help` output). If a regex flag is added upstream in the future, ADR-010 reactivates and the tool should pivot to the native subcommand in a follow-up BI.
- **(b) `obsidian search:context` + post-filter**. Search:context is literal-phrase matching; agents would have to encode `BI-\d{4}` as multiple literal queries, which doesn't generalise. Rejected.
- **(c) `obsidian paths` (list .md) + per-file `read`**. Two round-trips per file plus an enumeration round-trip. Quadratic in vault size for the read fan-out; the wrapper-side queue (`Queue`, kernel) would serialise the calls. Rejected on performance.

**T0 verification** (live-CLI probe at /speckit-implement time):

1. Confirm `obsidian eval` round-trips a payload-driven regex against the authorised test vault — render a template that runs `new RegExp("BI-\\d{4}").test("BI-0042")` and verify stdout reads `true`.
2. Confirm `app.vault.getMarkdownFiles()` returns the expected `.md` set against the test vault.
3. Confirm folder-not-found surfaces as the `paths`-style envelope `{ ok: false, code: "FOLDER_NOT_FOUND", folder }`.
4. Confirm zero-match yields a `{ ok: true, count: 0, matches: [] }` envelope, not the CLI's `"No matches found."` stdout (eval-driven tools own their stdout shape).

---

## R2 — Default match ordering

**Decision**: `(path asc UTF-16 code-unit, line asc, offset asc)`. Three-key tuple. Path comparison uses `<` / `>` string operators (UTF-16 code-unit by default in JavaScript). Line and offset compare numerically.

**Rationale**:

- Sibling parity on `(path, line)`. BI-033 FR-018 and BI-035 both order by `path` asc then `line` asc.
- Third key `(offset)` is new. The spec FR-003 emits one entry per occurrence on a line; when two matches share `(path, line)`, the natural order is left-to-right by `match.index`. Without the third key, ordering within a line is undefined and the SC-003 "complete vs truncated 100% determinism" claim weakens.
- Deterministic across calls with the same input and stable vault state — SC-003 satisfied.

**Alternatives considered**:

- `(path, line)` only — undefined within-line order. Rejected on the FR-003 multiplicity requirement.
- Sort by `(path, line, match)` (lexicographic on the matched substring) — surprising when two matches differ by case under case-insensitive matching. Rejected on principle of least surprise.

---

## R3 — Result cap defaults

**Decision**: implicit cap = 1000; `limit` parameter exposed at the zod schema, integer 1..10000. Explicit caller value takes precedence in both directions (`limit=10` returns ≤ 10; `limit=5000` returns ≤ 5000). `truncated: true` is set in the response envelope when the underlying match-set could have produced more rows than the applied cap.

**Rationale**:

- Sibling parity with BI-033 FR-010 / FR-011 and BI-035. The 1000-default-10000-max pair has been the project convention since BI-033 (search) and has held through six subsequent tools.
- The eval template owns the count, so truncation detection is a single in-template comparison (`out.length === cap`) rather than the conservative "cli-file-cap-fired OR flat-exceeds-cap" trick BI-035 uses. Simpler.
- The spec's Assumptions explicitly defers the cap value to "existing tool-surface conventions" — this decision exercises that deferral.

**Alternatives considered**:

- 500 / 5000 — tighter caps. Rejected on sibling-divergence; agents calibrate cap expectations against the existing tool set.
- Single hard cap (no `limit` exposed) — removes a useful agent knob. Rejected.

---

## R4 — Case-sensitivity default

**Decision**: **case-sensitive default**. `case_sensitive` is `z.boolean().optional()`; omitted ≡ `true` (case-sensitive). When the caller passes `case_sensitive: false`, the template instantiates `new RegExp(pattern, "i")`.

**Rationale**:

- Spec FR-007 explicitly locks the default to case-sensitive.
- Diverges from sibling `context_search` (case-insensitive default, inherited from the upstream `obsidian search` default). The divergence is intentional and traces directly to the user spec.
- The flag is a single boolean — agents who want sibling parity pass `case_sensitive: false` explicitly.

**Risk**: agents porting predicates between `context_search` and `pattern_search` may stumble on the default flip. Mitigation: the per-tool `description` field passed to `registerTool` calls this out explicitly, and the progressive-disclosure docs at `docs/tools/pattern_search.md` lead with the default in the parameter cohort.

---

## R5 — Folder normalisation

**Decision**: reuse `stripBoundarySlashes` exported from `../search/handler.ts`. Same import path BI-035 `context_search/handler.ts` already uses (verbatim: `import { stripBoundarySlashes } from "../search/handler.js"`).

**Rationale**:

- Already shared. Re-implementing the helper would duplicate code and risk drift.
- Module direction is `pattern_search → search` — no cycle (`search` does not import from `pattern_search` and never will).
- Convention is mature: `Projects`, `Projects/`, `/Projects`, `/Projects/` all collapse to `Projects` before being passed to the eval template.

---

## R6 — File-set scoping

**Decision**: `.md` only. Inside the eval template, enumerate via `app.vault.getMarkdownFiles()` (which is `.md` by definition). Wrapper-side defensive filter on the wire payload via `path.toLowerCase().endsWith(".md")` — same defence-in-depth `context_search/handler.ts` uses (`mdOnly = wire.filter((f) => f.file.toLowerCase().endsWith(".md"))`).

**Rationale**:

- Spec Assumptions lock the file set to "the same set scanned by sibling read/list tools" — that set is `.md` for every search-flavoured tool in this surface (BI-033 FR-017).
- `app.vault.getMarkdownFiles()` does the work for us; no glob to write.
- The wrapper-side filter is paranoid: if a future Obsidian release widens `getMarkdownFiles()` to include `.canvas` or `.base`, the wrapper still sees only `.md` paths.

---

## R7 — Invalid pattern surface

**Decision**: detected at the zod `superRefine` layer. The schema's `superRefine` block instantiates `new RegExp(input.pattern, input.case_sensitive === false ? "i" : "")` inside a `try { ... } catch (cause) { if (cause instanceof SyntaxError) ctx.addIssue({ ... }); }` and emits a Zod issue with `path: ["pattern"]`, `message: cause.message`, and `code: z.ZodIssueCode.custom`. The `_register.ts` factory's existing `ZodError` → `VALIDATION_ERROR` conversion path surfaces the envelope verbatim.

**Rationale**:

- Zero new top-level error codes (Principle IV streak preserved — fifteen tools as of BI-036, sixteen with this BI).
- Zero new `details.code` values under `CLI_REPORTED_ERROR` (ADR-015 stays N/A).
- Field-path envelope (`details.issues[0].path === ["pattern"]`) lets agents branch on field rather than parsing prose.
- Fails fast — no vault scan runs at all when the pattern is invalid. Spec FR-010 "MUST NOT return any partial matches alongside the error" is automatic.

**Alternatives considered**:

- New `details.code = "INVALID_PATTERN"` under `CLI_REPORTED_ERROR` — would require ADR-015 evaluation and grows the project's `details.code` cohort. Rejected on simplicity.
- New top-level `INVALID_PATTERN` code — breaks the Principle IV streak. Rejected.

---

## R8 — Zero-length match skip

**Decision**: enforced inside the eval template. For each line, iterate `pattern.exec(line)` in a loop (or `[...line.matchAll(pattern)]` then filter), and skip rows where `m.index === re.lastIndex` (i.e., the match consumed zero characters). After a zero-width hit, advance `re.lastIndex` by 1 to prevent the engine from looping on the same position.

**Rationale**:

- Q3 (clarify session 2026-05-17) locked the behaviour: zero-length matches are skipped, the pattern is not rejected, the call still terminates.
- The `lastIndex++` advance is the standard JS idiom for "make a global regex with zero-width hits terminate".
- Implementation lives in the template so the wire payload is already free of zero-width entries when it leaves the CLI process — wrapper-side handler does no further filtering for this case.

**Test cohort**:

- Pattern `a*` against `aaabbb` → matches `aaa` only (the `a+` non-empty run), one entry per line.
- Pattern `^` against a 10-line note → zero entries.
- Pattern `foo|bar*` against `foo bar baar baaar` → matches `foo`, `bar`, `baar`, `baaar` (each greedy non-empty); zero-width `bar*` at start-of-string never fires because the regex picks the non-empty alternative when both match at the same position.

---

## R9 — Truncation detection

**Decision**: in-template cap. The template tracks `out.length` and stops collecting once it reaches `cap`. The envelope flags `truncated: true` when collection stopped at the cap; absent or `false` otherwise. Wrapper-side `truncated: z.literal(true).optional()` (sibling parity with BI-033 / BI-035 — present only when truncation fired).

**Rationale**:

- The eval template owns enumeration, so it knows whether it stopped at the cap or ran out of vault to scan.
- Simpler than BI-035's conservative "cli-file-cap-fired OR flat-exceeds-cap" trick — that trick exists because BI-035 wraps the native `search:context` subcommand and infers cap-firing from the wire shape; pattern-search owns the wire shape.
- Order of returned entries is the deterministic prefix per R2's sort key — agents narrowing the predicate know exactly which matches they have already seen.

---

## R10 — `text` field cap

**Decision**: 500 UTF-16 code units + `…` (U+2026) marker. Implemented inside the eval template so the wire payload is already capped before it leaves the CLI process. Wrapper-side handler does no further capping (defence-in-depth `if (text.length > 500)` is permitted but not required — the template guarantees the bound).

**Rationale**:

- Q2 (clarify session 2026-05-17) locked the contract.
- Sibling parity with BI-033 FR-024 and BI-035 (`TEXT_CAP = 500`, `ELLIPSIS = "…"`).
- Matched substring (`match` field) is **never** capped — emitted verbatim. If the matched substring exceeds 500 code units the line cap clips the surrounding text but the match field is intact.

**Edge case — match begins after position 500**: when the match's `m.index >= 500`, the line cap clips the prefix `…` away from the actual hit. The match field still carries the matched substring intact, so agents can act on the match even though the line context is unhelpful. This is the documented Q2 contract.

---

## R11 — T0 live-CLI probe plan

Per CLAUDE.md `## Test Execution`, T0 probes against the authorised test vault are gated by [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md). The probe set for /speckit-implement is:

| Probe | Goal | Pass criterion |
|---|---|---|
| T0.1 | Confirm `obsidian eval` runs a regex test inside the Obsidian Node runtime | Template `new RegExp("BI-\\d{4}").test("BI-0042")` emits stdout `true` |
| T0.2 | Confirm `app.vault.getMarkdownFiles()` returns the expected `.md` set | Returned set equals the `.md`-only subset of `obsidian paths --recursive` against the test vault |
| T0.3 | Confirm folder-not-found envelope shape | Template with a non-existent folder emits `{ ok: false, code: "FOLDER_NOT_FOUND", folder: "<name>" }` |
| T0.4 | Confirm zero-match envelope shape | Template with `pattern: "Z{50}"` (no hits) against the test vault emits `{ ok: true, count: 0, matches: [] }` |
| T0.5 | Confirm zero-length match skip | Template with `pattern: "^"` emits zero entries against a non-empty vault (sanity check on the lastIndex-advance idiom) |
| T0.6 | Confirm 500-cap clip | Template against a note containing a synthesised 1000-char single-line region emits `text: "<500 chars>…"` for the matching entry |

If any probe diverges from its pass criterion, surface the divergence to the user before continuing to implementation — the divergence is either a vault-state issue (test vault drift) or a design assumption that the spec must accommodate.

---

## Open items deferred to /speckit-implement

- **OBC-1**: T0 probe set above runs during the first task of `/speckit-implement` (T0 task per the project's quickstart-before-source convention).
- **OBC-2**: If T0.1 fails (eval round-trip can't construct RegExp), pivot to a `paths` + `read` chained execution path — quadratic but workable for the small-vault cohort the test vault covers. Document the pivot via an in-PR ADR rather than amending the constitution.
- **OBC-3**: Non-UTF-8 content handling deferred (spec coverage summary marked Outstanding-low). T0.2 surfaces it incidentally if the test vault contains any; otherwise no action this BI.
- **OBC-4**: ECMAScript regex Unicode-mode (`u` flag) is not exposed in this BI. The template instantiates `new RegExp(pattern, flags)` with flags ∈ {`""`, `"i"`} only. The `u` flag flips `\d` to Unicode-aware semantics and changes `\b` behaviour; that's a deliberate non-feature for v1 because the spec example (`BI-\d{4}`) is ASCII. A follow-up BI can add a `unicode: boolean` knob.
