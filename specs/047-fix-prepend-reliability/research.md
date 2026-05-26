# Phase 0 Research: Fix Prepend Reliability

**BI**: 047-fix-prepend-reliability
**Date**: 2026-05-27
**Status**: Phase 0 complete — hypotheses landed; empirical T0 probes that confirm or refute each hypothesis are deferred to `/speckit-implement` per the project's T0-live-CLI-probe convention.

This artifact resolves the five research items named in [plan.md](plan.md) `## Phase 0` (R1 wrapper-side failure-layer localisation, R2 BI-0017 shared-root-cause confirmation, R3 cap-unit reconciliation, R4 separator byte-length specification, R5 failure-mode discriminator code-mapping verification) before the design phase begins. Each entry follows the Decision / Rationale / Alternatives template.

---

## R1 — Wrapper-side failure-layer localisation

**Decision**: The three observable failure shapes (silent no-op, wrapper timeout, host-process crash dialog) are best modelled as three distinct proximate causes that share one underlying mechanism: **the Obsidian host process accepts the spawn but enters an inconsistent state when handed an argv element whose UTF-8-encoded byte length crosses a Windows / Electron-specific threshold, and the wrapper's stat-pair around the `invokeCli` call cannot distinguish a flushed-write success from a silently-discarded write**. The plan therefore touches two surfaces:

1. **Primary fix surface — `src/tools/prepend/handler.ts` lines 282-307** (the pre/post stat pair around the `invokeCli` call): the success-path return at lines 306-314 grows a guard that, when `bytesWritten <= 0` against a primed `preCallSize` AND the `invokeCli` call reported exit 0, raises a typed `UpstreamError` (`FS_WRITE_FAILED` with `details.reason: "post-stat-byte-delta-zero"`) instead of emitting a `bytes_written: 0` output envelope. This guard structurally enforces the broadened FR-003 prohibition; it ALSO surfaces the silent-no-op symptom as a distinct failure mode the caller can branch on. The output schema's `bytes_written: z.number().int().min(1)` invariant (`src/tools/prepend/schema.ts:63`) would catch a zero-bytes envelope at the SDK boundary regardless — but emitting it from the handler is itself a Principle-IV violation (silent partial-success behaviour), so the guard belongs at the handler's success-path return site, not at the SDK boundary.

2. **Defensive fix surface — `src/cli-adapter/cli-adapter.ts` lines 88-97** (the `invokeCli` boundary's stdout-inspector): the inspector currently re-classifies stdout-reported errors as `CLI_REPORTED_ERROR`. For host-process abnormal-exit shapes that surface as exit ≠ 0 (the `obsidian.exe` GUI variant per BI-0017 Probe 5b returning exit 4294967295), the dispatch layer already raises `CLI_NON_ZERO_EXIT` at `_dispatch.ts:283`. No code change is required at this layer for the abnormal-exit path; the existing classification covers it. The defensive amendment is bounded to: surface the wrapper's emitted argv inside `details` whenever a wrapper-detected failure originates from a CLI-adapter layer, so the caller can correlate the failure with the argv shape that triggered it.

**Rationale**:

- The silent-no-op symptom is the strongest evidence pointer. The handler's pre-call stat at line 282 reads the byte count BEFORE the `invokeCli` call; the post-call stat at line 306 reads it AFTER. If the upstream returns exit 0 but the file system has not yet observed the upstream's write (because the upstream returned before flushing, or because the upstream wrote to a different file than the wrapper believes it wrote to, or because the upstream wrote nothing at all due to an editor conflict the upstream classified as benign), the post-stat reads the pre-state byte count and `bytesWritten = 0`. The current handler returns this as a success envelope — exactly the FR-003 anti-pattern.
- The wrapper-timeout symptom is consistent with the upstream returning bytes-of-stdout slowly under back-pressure when handed an argv element near the Windows `CreateProcess` command-line limit. The `_dispatch.ts:238` timeout fires at 10 seconds; no code change there is needed because the timeout itself is the correct response to a hung upstream.
- The host-process crash dialog is consistent with the Obsidian Electron GUI receiving a malformed-from-its-perspective payload through the host-process IPC channel. The wrapper cannot directly prevent this; it can only minimise its exposure by ensuring (a) the over-cap rejection at the schema boundary fires before any spawn (FR-002, already in place via `MAX_CONTENT_LENGTH`), and (b) the wrapper does not retry a payload that triggered a prior crash within a recent-crash window (FR-009 / SC-007). Note: full prevention of the crash dialog requires upstream Obsidian to harden its argv-parsing — that is the spec's Out of Scope clause "Changes to the upstream Obsidian CLI's prepend subcommand". The wrapper's contribution is to not provoke the crash from a malformed-by-wrapper-construction argv shape (R2 cross-evidence: the wrapper's active-mode absolute-FS-path `vault=` token is one such malformed-by-wrapper shape).
- Why NOT primary-fix the `_dispatch.ts` substrate or the `invokeCli` boundary's stdout inspector? Because the symptoms localise to the file-system observation site (the stat pair), not to the spawn / IPC / output-buffer layer. The dispatch substrate's `CLI_OUTPUT_TOO_LARGE` cap (at `_dispatch.ts:264`) cannot fire for prepend's typical stdout shape (`Prepended to: <path>\n` — well under any plausible cap); the `CLI_TIMEOUT` cap is the correct response to a hung upstream and needs no amendment.

**Alternatives considered**:

1. **Move the prepend tool from CLI-wrap to filesystem-direct**. Rejected per the spec's Out of Scope clause — that is a separate architectural change tracked elsewhere, and would remove the wrapper's exposure to all three failure shapes at the cost of dropping cohort parity with BI-044's append tool (which currently shares the cli-wrap pick). Worth re-evaluating in a future BI; not this one.
2. **Add a primary fix at the `_dispatch.ts` spawn substrate**. Rejected because the substrate is shared across every cohort tool — a substrate-level guard that constrains argv-byte sizes would either (a) lower the de-facto cap below 24576 for every cohort tool (forbidden by FR-008 for prepend, and likely the wrong call for the rest of the cohort), or (b) introduce per-tool exemptions which violate Principle I's "modules don't grow second responsibilities" rule.
3. **Defensive retry inside `invokeCli` when the post-stat byte delta is zero**. Rejected because retry would mask the underlying state (silent partial success) rather than surface it; Principle IV explicitly forbids "logging an error and continuing" as a substitute for handling.
4. **Make the over-cap rejection fire at a tighter cap (e.g., 10240 chars)**. Rejected per the spec's Out of Scope clause — "Tightening the documented size cap below 24576 characters" is explicitly out of scope; the cap is empirically fine for direct-CLI invocation per the BI-0017 bisect file.

**Empirical probe protocol (deferred to `/speckit-implement` T0 phase)**: at `/speckit-implement` time, run dependency-injection probes (the pattern proven in BI-0017's Probe 6) with a spying `spawnFn` that captures the wrapper's emitted argv + child stdout/stderr/exit, paired with a primed pre-call stat and an unprimed post-call stat. The probe matrix covers (1 KB / 5 KB / 9 KB / 10 KB / 12 KB / 16 KB / 24 KB) content sizes × (active-mode / specific-mode) × (primed-registry / cold-registry). Each probe captures whether the failure surface matches the R1 hypothesis (post-stat byte delta = 0 against exit-0 upstream) or surfaces a different layer.

---

## R2 — BI-0017 active-mode shared-root-cause confirmation

**Decision**: The BI-0017 active-mode root cause (the synchronous-non-priming `resolveVaultDisplayName` falling through to `parsed.base`, smuggling an absolute filesystem path into the `vault=` argv token — per the BI-0017 bisect file at `specs/045-prepend-note/active-mode-bisect-2026-05-26.md` lines 99-114) is **distinct from** the R1 wrapper-side root cause. The two bugs reach different downstream surfaces — BI-0017 produces a deterministic `Vault not found.` envelope on `Obsidian.com` from a malformed-by-wrapper vault token, R1 produces three nondeterministic shapes from a well-formed-by-wrapper argv whose total byte size or upstream state triggers the host-process inconsistency. The active-mode fix therefore does NOT land in the same change set as the R1 fix — `src/vault-registry/registry.ts` remains untouched in this BI.

**Rationale**:

- The two failure surfaces diverge structurally. BI-0017 fires from a wrapper-constructed argv that the upstream classifies as unknown-vault before any prepend operation begins. R1 fires from a wrapper-constructed argv that the upstream classifies as well-formed and accepts, but then either (a) returns without flushing, (b) hangs the IPC channel, or (c) crashes the host process. The wrapper layer responsible is different in each case (vault-registry vs handler stat-pair), and the fix surfaces are different (registry async-priming vs handler success-path guard).
- Conflating the two fixes risks scope creep that the spec's Out of Scope clause explicitly admits is allowed-but-not-required. Keeping them separate preserves change-set scope honesty and lets each fix's regression cohort target its actual failure surface without coupling.
- The cross-reference in the spec's Out of Scope clause (R2 may share root cause "per the cross-evidence collected when this bug was originally documented") is preserved as a forward pointer for the active-mode BI's plan. If the active-mode BI's plan-time research surfaces a new shared mechanism, that BI can supersede this decision.

**Alternatives considered**:

1. **Land the active-mode fix in this change set anyway**. Rejected because the spec's user-story scope is bounded to the large-content surface; the active-mode fix is a different user surface with different acceptance criteria. The change set would grow to two BIs' worth of code and tests for no scope-honesty benefit.
2. **Defer the active-mode fix indefinitely**. Not rejected — the spec already permits this. The active-mode fix has its own BI that will follow with its own spec / plan / tasks artifacts. This decision merely says "not in this change set".

---

## R3 — Cap unit reconciliation: UTF-16 code units vs character count vs UTF-8 argv bytes

**Decision**: The spec's user-facing wording "character count" is reconciled to mean **UTF-16 code units**, matching the schema's actual unit (`MAX_CONTENT_LENGTH = 24576` is enforced against `string.length` per Zod's `.max()` on a `z.string()`, and JavaScript's `string.length` is the UTF-16 code-unit count — a non-BMP Unicode character takes 2 code units). The reconciliation lands in `contracts/prepend-input.contract.md` as the published contract surface; the spec body itself is preserved verbatim (the clarification recorded in `## Clarifications > ### Session 2026-05-27` Q4 already pins the enforcement unit to "character count, matching the published cap unit", which is now interpretively bound to UTF-16 code units in the contract artifact).

The wrapper's argv encoding path is the second concern. On both Windows and POSIX, `node:child_process.spawn` UTF-8-encodes argv elements before handing them to the host process. A 24576 UTF-16 code-unit payload of fully-BMP non-ASCII content (e.g., CJK content where each character is one UTF-16 code unit but three UTF-8 bytes) yields up to 73728 argv bytes — well above the Windows `CreateProcess` command-line maximum (~32767 UTF-16 code units, which in practice maps to ~32767 ASCII bytes after the system's UTF-8 round-trip). The wrapper has no code path that adjusts the cap based on the payload's UTF-8 byte expansion; this means the practical headroom for non-ASCII content is smaller than the schema cap suggests. **This is the documented contract — non-ASCII payloads near the cap trigger the host-process stability fix path (FR-004 + FR-009), not a tighter cap. The wrapper's host-process stability invariant (FR-004) covers this surface unconditionally.**

**Rationale**:

- The schema's enforcement is authoritative. Zod's `z.string().max(24576)` checks `string.length`, which is the UTF-16 code-unit count by JavaScript spec. Changing the enforcement unit to UTF-8 byte count or grapheme cluster count would require schema work that the spec does not authorise (FR-008 forbids lowering the cap value; changing the unit is functionally similar).
- The user-facing wording "character count" is a reasonable approximation for ASCII-dominant content (where character count, UTF-16 code-unit count, and UTF-8 byte count all coincide). The contract artifact is the right place to publish the precise unit without contradicting the spec's narrative.
- The host-process stability invariant (FR-004) is the safety net for byte-expanded non-ASCII payloads. The R1 fix (handler post-stat byte-delta guard) catches the silent-no-op shape regardless of whether the failure originated from a UTF-8-bloated argv or any other source.

**Alternatives considered**:

1. **Re-enforce the cap in UTF-8 bytes**. Rejected — would lower the de-facto cap below 24576 UTF-16 code units for non-ASCII content, contradicting FR-008's "MUST NOT be lowered" clause. The schema cap is a published contract surface; changing its enforcement unit is a contract change.
2. **Add a second cap on UTF-8 byte size as a complementary guard**. Rejected because Principle I (Modular Code Organization) prefers one source of truth per surface; a second cap doubles the contract maintenance burden for marginal practical headroom gain (the host-process stability invariant already covers the byte-expanded case).
3. **Re-enforce the cap on grapheme clusters**. Rejected — graphemes are the wrong unit for argv-byte budgeting and would invite extreme cases (emoji ZWJ sequences expand to many UTF-8 bytes per grapheme) without solving the underlying host-process invariant.

---

## R4 — Default-separator byte-length specification

**Decision**: The wrapper-inserted separator under the default-separator rule (BI-045 FR-006) is **a single `\n` byte (LF, 0x0A) on POSIX hosts and `\r\n` (2 bytes, CRLF, 0x0D 0x0A) on Windows hosts**, matching the host platform's native newline convention. The upstream Obsidian CLI's `prepend` subcommand inserts the separator between the prepended content and the pre-existing file head; the wrapper does not insert its own separator. The byte-count formula in the success envelope's post-state byte count is therefore:

```text
postCallSize = preCallSize + utf8ByteLength(content) + separatorByteLength
where separatorByteLength = 1 on POSIX, 2 on Windows (when the file is using CRLF line endings)
```

This formula lands in `contracts/prepend-output.contract.md` as the published byte-count contract. The handler's existing `bytesWritten = postCallSize - preCallSize` calculation continues to subsume the separator into the delta — callers should NOT subtract a separator length client-side; the `bytes_written` field is the full delta.

**Rationale**:

- The default-separator rule was established by BI-045's R6 — the upstream owns the byte-level write, and the wrapper merely observes the post-state via stat. The wrapper has no opportunity to insert its own separator after the upstream's write.
- The host platform's native newline convention is the right default because the upstream Obsidian CLI uses the platform's native line ending, and the wrapper's stat-based byte count observes whatever the upstream wrote.
- A non-ASCII content payload that itself ends with a newline does not change the formula — the upstream inserts its separator regardless of the content's terminal byte (BI-045 R6 confirmed this empirically). Edge cases involving content that ends with a partial multi-byte UTF-8 sequence are out of scope; Zod's schema enforces `z.string()` which already filters non-string inputs.

**Alternatives considered**:

1. **Always use LF regardless of host platform**. Rejected because the upstream Obsidian CLI honours the host's native line ending; the wrapper cannot override the upstream's behaviour without modifying the upstream subcommand (out of scope per the spec).
2. **Subtract the separator length from `bytes_written` in the output envelope**. Rejected because the `bytes_written` field represents the wrapper-observable byte-count delta; subtracting the separator would require the caller to reconstruct it for the post-state byte count check, defeating the value of the field.

---

## R5 — Failure-mode discriminator code-mapping verification

**Decision**: Every enumerated failure mode in FR-005 maps onto the existing `UpstreamError` code surface — no new top-level codes, no new sub-discriminators required at plan-time. The verified mapping (against the Grep output from `/speckit-plan` execution and the code at `src/errors.ts` + `src/cli-adapter/*` + `src/tools/prepend/handler.ts`) is:

| Failure mode (FR-005 enumeration) | Top-level code | Sub-state (details.code / details.reason) | Construction site (file:line) | ADR-015 reach |
|------------------------------------|----------------|-------------------------------------------|--------------------------------|---------------|
| Substrate timeout | `CLI_TIMEOUT` | (none — single-state code) | `src/cli-adapter/_dispatch.ts:238` | N/A |
| Vault not found (specific-mode, registry-known) | `VALIDATION_ERROR` | (registry-side rejection at boundary) | `src/vault-registry/registry.ts:70` | N/A |
| Vault not found (specific-mode, registry-unknown) | `CLI_REPORTED_ERROR` | (upstream stdout-reported, post-spawn) | `src/cli-adapter/cli-adapter.ts:92` | N/A |
| Missing target file | `CLI_REPORTED_ERROR` | `details.code: NOTE_NOT_FOUND` | `src/tools/prepend/handler.ts:129-138` | Existing sub-state |
| Path traversal | `PATH_ESCAPES_VAULT` | (single-state code) | `src/tools/prepend/handler.ts:264-273` | N/A |
| Oversized content | `VALIDATION_ERROR` | `details.code: CONTENT_TOO_LARGE` (Zod `too_big`) | `src/tools/prepend/schema.ts:52` | Existing sub-state |
| Locator validation (file/path structural safety) | `VALIDATION_ERROR` | (Zod `custom` issue with structural-path-safety message) | `src/tools/prepend/schema.ts:25-42` | N/A |
| Host-process spawn failure (binary not found) | `CLI_BINARY_NOT_FOUND` | (single-state code) | `src/cli-adapter/_dispatch.ts:119, 202` | N/A |
| Host-process abnormal exit (non-zero exit) | `CLI_NON_ZERO_EXIT` | (single-state code) | `src/cli-adapter/_dispatch.ts:283` | N/A |
| Host-process abnormal exit (zero-exit + stdout-reported error) | `CLI_REPORTED_ERROR` | (post-spawn re-classification at adapter) | `src/cli-adapter/cli-adapter.ts:92` | N/A |
| Editor conflict (file held open) | `CLI_REPORTED_ERROR` | `details.code: EXTERNAL_EDITOR_CONFLICT`, `details.reason: "file-locked"` | `src/tools/prepend/handler.ts:142-153` | Existing sub-state |
| Post-stat byte-delta zero (NEW — R1 fix surface) | `FS_WRITE_FAILED` | `details.reason: "post-stat-byte-delta-zero"` | `src/tools/prepend/handler.ts` (NEW guard site at post-stat) | NEW sub-state |

The "Post-stat byte-delta zero" row is the only new sub-state introduced by this BI. It lands under the existing top-level code `FS_WRITE_FAILED` (already in the code surface per the Grep output at `src/tools/append_note/handler.ts:99`), with a new `details.reason: "post-stat-byte-delta-zero"` sub-discriminator per ADR-015. **This flips the ADR-015 Constitution Check row from N/A (pending) to Y (compliant)** — the new sub-state is the canonical ADR-015 pattern application (a `details.reason` sub-discriminator under an existing `(top-level-code, details.code)` pair) and it preserves the constitutional zero-new-top-level-codes streak.

**Rationale**:

- Every enumerated failure mode has an existing top-level code that fits its semantic surface. The wrapper does not need to invent a new code for any of them.
- The post-stat byte-delta-zero failure mode (FR-003 enforcement) is the only mode that doesn't have an exact pre-existing fit. `FS_WRITE_FAILED` is the closest semantic match — the write did fail (no bytes landed on disk), and the underlying cause (silent no-op from the upstream) is best surfaced as a sub-discriminator under that code rather than as a new top-level code. ADR-015 is the canonical pattern for this kind of "we need finer signal but the top-level code is right" need.

**Alternatives considered**:

1. **Introduce a new top-level code `SILENT_NO_OP`**. Rejected because it would break the zero-new-top-level-codes streak (Principle IV's documented invariant per the project's commit log streak) and ADR-015 explicitly exists as the lower-cost alternative.
2. **Map the post-stat byte-delta-zero failure onto `CLI_REPORTED_ERROR` with a sub-discriminator**. Rejected because `CLI_REPORTED_ERROR` semantically belongs to "the upstream reported an error via stdout / stderr"; the silent-no-op surface is precisely the case where the upstream did NOT report an error but the write nonetheless failed. `FS_WRITE_FAILED` is the more honest fit.
3. **Drop the post-stat byte-delta-zero discriminator and rely on the output schema's `bytes_written: z.number().int().min(1)` to filter the envelope at the SDK boundary**. Rejected because the SDK boundary rejection produces a generic schema-validation error that does NOT carry the wrapper-detected failure-mode signal — the caller loses the information that this was a silent no-op, not an SDK-level schema bug. The handler's structured `UpstreamError` preserves the chain of custody per Principle IV.

---

## Constitution post-design re-check

| Gate | Plan-time | Post-design | Notes |
|------|-----------|-------------|-------|
| Principle I | Y | Y | Diff scope confirmed at plan-time + research; no module split or merge introduced. |
| Principle II | Y | Y | Test additions co-located per the existing convention. |
| Principle III | Y | Y | Schemas remain the single source of truth; the `bytes_written ≥ 1` output invariant is structurally leveraged by the R1 fix. |
| Principle IV | Y | Y | Zero new top-level codes; R5 mapping verified against the actual code surface. |
| Principle V | Y | Y | Attribution headers on touched files preserved verbatim. |
| ADR-010 | N/A | N/A | No tool name change. |
| ADR-013 | N/A | N/A | Not plugin-API-backed. |
| ADR-014 | N/A | N/A | No plugin runtime dependency. |
| ADR-015 | N/A (pending R5) | **Y** | R5 surfaces one new sub-discriminator (`FS_WRITE_FAILED.details.reason: "post-stat-byte-delta-zero"`) under an existing top-level code. ADR-015's pattern fits exactly; the gate flips to Y. |

**Verdict**: Constitution post-design re-check: **pass** (ADR-015 flipped from N/A pending to Y; all other gates unchanged from plan-time).
