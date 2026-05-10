# Phase 0: Outline & Research — Reliable Writer

**Feature**: `016-reliable-writer`
**Created**: 2026-05-10
**Plan reference**: [plan.md](plan.md)

This document captures the research decisions taken before implementation and the live-CLI findings verified during plan stage. The decisions enumerated here are downstream of (and consistent with) [ADR-009](../../.decisions/ADR-009%20-%20Direct%20Filesystem%20Write%20Path%20Alongside%20CLI%20Bridge.md), the spec's Clarifications session (2026-05-10), and the prior design grilling. Where a decision was settled by a specific spec FR, ADR section, or grilling/clarify Q, the source is cited.

## Research decisions

### R1 — Architecture: direct fs write, not eval composition

**Decision**: Replace `write_note` wholesale with a direct-filesystem-write implementation. User content goes via Node `fs.writeFile` (with `wx` flag for non-overwrite, then `fs.rename` for atomicity); user content does NOT cross the CLI argv pipe at any size. Small bug-safe `eval` calls handle control-plane operations only (vault registry probe, focused-file resolution, `metadataCache` invalidation, optional editor-open) — all argv crossings stay under 250 bytes.

**Rationale**: empirical bisect on 2026-05-10 (recorded in BI-038 PART 2 amendment + bug-report-draft.md) proved that the upstream argv→IPC chunk-boundary defect at ~4 KB hits both `obsidian create` and `obsidian eval` equally. Eval is in fact slightly worse because the JS template + base64 expansion of user content inflates the `code=` argv element by ~1.4× (eval crashed at 3 KB source content where create still passed). The defect is in the receiver-side IPC `Socket` handler, not on the wire — no client-side workaround that reshapes argv can dodge it. Bypassing the CLI for content delivery eliminates the defect's blast radius for writes.

**Alternatives considered**: see ADR-009's *Alternatives Considered* table — eval-composition (refuted), chunked-append-via-CLI (loses on latency / atomicity / chunk-boundary edge cases), park-and-wait (no upstream timeline), soft-disable + size guard (doesn't restore writes above ~4 KB).

**Source**: ADR-009 *Decision*; bug-report-draft.md *Threshold pattern*; BI-038 PART 2 amendment.

### R2 — Vault filesystem-path resolution: cached registry, lazy on first call

**Decision**: A new `src/vault-registry/` module owns the vault-name → absolute-path map. The registry is populated **lazily on the first `write_note` invocation** by a single bug-safe `obsidian vaults verbose` call (~25-byte argv) and cached for the MCP-server-process lifetime once successful. On probe failure (typically `CLI_BINARY_NOT_FOUND` if the binary is missing, or `CLI_REPORTED_ERROR` if Obsidian isn't running), the calling write surfaces the underlying error and the next call retries the probe.

**Rationale**: in deployments where the AI client auto-launches the MCP server before the user opens Obsidian (the common Claude-Desktop / Cursor shape), an eager startup probe would fail every boot — the CLI's vault-list query requires a running Obsidian app. Lazy probe defers the call until Obsidian is presumably available; retry-on-failure means the agent doesn't need to restart the MCP server to recover. Cached for the session lifetime once successful — vault add/remove during a session is rare; restart cost is negligible compared to paying ~150 ms per write for re-query. **Resolves the inherited multi-vault routing limitation** (R11 in BI-038 / 014 / 015 history): since the bridge now owns path resolution end-to-end, `vault=Foo` means `Foo`, full stop.

**Alternatives considered**:
- **Eager probe at MCP boot, hard-fail on failure**: rejected — couples MCP lifetime to Obsidian lifetime, breaks the auto-launched-MCP deployment shape.
- **Eager probe at MCP boot, degraded mode on failure**: rejected — surfaces issues earlier but couples cache freshness to operator-restart; lazy retry is better UX.
- **Eager probe at MCP boot, retry-lazily-per-call on failure**: rejected — same observable behaviour as lazy-with-retry but more code paths.
- **No cache; per-call probe**: rejected — pays ~150 ms per write for a registry that changes rarely.

**Source**: spec FR-012 (post-clarify); ADR-009 *Decision* §1; spec Clarifications Q2 (2026-05-10).

### R3 — Path safety: schema layer + runtime canonical check via fs.realpath

**Decision**: Two-layer vault-root sandboxing in `src/path-safety/`. (a) Schema-layer `superRefine` rejection of path-traversal-shaped inputs (`../` or `..\` segments, leading `/` or `\`, drive-letter prefix `[A-Za-z]:`, control characters `[\x00-\x1f]`) → `VALIDATION_ERROR`. (b) Runtime check via `fs.realpath` on the target's parent directory followed by `startsWith(realVaultRoot + sep)` on the canonical result → `PATH_ESCAPES_VAULT`. The runtime check runs **before** the parent-dir creation in FR-010 — any pre-existing in-vault symlink lives in an existing path component, so `fs.realpath` succeeds on the deepest existing parent and the `startsWith` check catches escapes through that symlink. ENOENT fallback (every component up to the new file is being created by our own mkdir, no adversary symlinks possible) reverts to lexical `path.resolve` — safe because the schema layer has already rejected the dangerous lexical shapes.

**Rationale**: defense-in-depth matches the project's existing posture (the cli-adapter's `stripTargetLocators` is defense-in-depth even though the schema enforces target-mode). The schema layer gives agents a fast structured `VALIDATION_ERROR` on the obvious cases; the runtime layer catches symlink-escape attacks the schema can't see. Pure lexical `path.resolve` cannot catch symlinks (a symlink inside the vault pointing outside resolves lexically inside the vault but actually escapes via the symlink); `fs.realpath` resolves to canonical paths, so the `startsWith` check sees the real escape target.

**Alternatives considered**:
- **Trust the input, no checks**: rejected — silent vault escape on writes is a critical security defect.
- **Runtime-only check (skip schema layer)**: rejected — slower feedback, loses JSON-Schema documentation benefit.
- **Schema + lexical-only runtime check (`path.resolve`)**: rejected — User Story 4 AC#3 promises catching symlink-escape; lexical check cannot.
- **Strict whitelist (`[A-Za-z0-9_./-]` chars only)**: rejected — too strict; breaks legitimate vault paths with spaces, brackets, Unicode.
- **Reject any path component that is itself a symlink (`fs.lstat` per component)**: rejected — refuses legitimate vault layouts that use symlinks for organisational reasons.

**Source**: spec FR-013 + FR-014 (post-clarify, post-review); ADR-009 *Decision* §2; spec Clarifications Q1 (2026-05-10); spec User Story 4 AC#3.

### R4 — Atomic write via temp + rename

**Decision**: For `overwrite: true`, write content to `<target>.tmp` first via `fs.writeFile`, then `fs.rename(<target>.tmp, <target>)`. Same-volume rename is atomic on POSIX (`renameat`) and on Windows (`MoveFileEx`). Mid-process-crash leaves the on-disk file as either entirely the previous version or entirely the new version — never a torn write. For `overwrite: false`, write directly to `<target>` with `fs.writeFile` flag `"wx"` — atomically fails with `EEXIST` (→ `FILE_EXISTS`) if the target exists, with no race window between exists-check and write. Auto-create parent directories via `fs.mkdir({recursive: true})` before either write path.

**Rationale**: durability bar matches the user's primary knowledge store (the vault). Same-volume rename atomicity is well-understood and standard. The `wx` flag for non-overwrite eliminates the time-of-check / time-of-use race window that a naive `fs.access` + `fs.writeFile` would have. Temp-file uniqueness via `crypto.randomUUID()` (e.g. `<target>.<uuid>.tmp`) prevents concurrent-write collision on the temp file itself.

**Alternatives considered**:
- **Direct `fs.writeFile` without temp**: rejected — torn writes possible on mid-write crash.
- **Temp + fsync + rename**: rejected as overkill — protects against OS crash, not just process crash; SSD overhead negligible but desktop-tool spec doesn't need OS-crash safety.
- **Filesystem-level locking**: rejected — adds dependency complexity; vault is single-user single-machine; concurrent writes within the same MCP session are queue-serialised.

**Source**: spec FR-008 + FR-009; ADR-009 *Decision* §3 + §4.

### R5 — Cache invalidation: always invalidate, best-effort failure handling

**Decision**: After every successful write, fire a small bug-safe `eval` call to invalidate `metadataCache` for the written path:

```js
(async () => {
  const f = app.vault.getFileByPath("<path>");
  if (f) await app.metadataCache.computeMetadataAsync(f);
})()
```

The argv element carries the JS template + path only (~120 bytes total) — no user content; bug-safe by construction. **If the invalidation eval fails** (timeout, IPC hang, Obsidian crashed mid-call), the `write_note` call MUST still return success — the write is the contract; the invalidation is best-effort. Obsidian's own file watcher catches the disk change within ~200-500 ms regardless, providing eventual consistency.

**Rationale**: preserves the freshness guarantee today's `write_note` provides synchronously through the CLI's in-process API call. Without explicit invalidation, an agent that issues `write_note → read_property/read_heading` back-to-back could see stale cache (Obsidian's file watcher debounces). The +150 ms eval cost per write is acceptable; the staleness it prevents is a class of subtle race-bugs that would only manifest in specific timing patterns. The best-effort failure path is the deliberate Constitution-IV carve-out (the spec authorizes the exception via FR-011 + Edge Cases bullet) — the write succeeded; the response correctly reports it; only the cache freshness is briefly best-effort.

**Alternatives considered**:
- **Trust the file watcher (no eval)**: rejected — race-window risk for `write_note → read_property/read_heading` sequences.
- **Always invalidate, hard-fail on eval failure**: rejected — violates the "atomic write" promise; file is on disk but response says failed.
- **Active-mode-only invalidation**: rejected — asymmetry between modes is a UX surprise.
- **Optional via parameter (`refresh_cache: boolean`)**: rejected — pushes complexity onto callers; defaults surprise agents that don't read help.

**Source**: spec FR-011 (post-clarify, post-review); ADR-009 *Decision* §5; spec Concern 4 resolution.

### R6 — Logger surface: precedent + one security event

**Decision**: Match prior typed-tool precedent (011 / 012 / 013 / 014 / 015) — no per-call `writeStart` / `writeSuccess` / `writeFailure` events at the tool layer. UpstreamError naturally propagates through `registerTool`'s existing logger plumbing. The cli-adapter's existing `dispatchTimeout` / `dispatchCap` / `dispatchKill` events continue to fire for the new tool's small `eval` calls. **Add ONE security event** for `PATH_ESCAPES_VAULT`: `logger.warn({event: "pathEscapeAttempt", vault, attemptedPath})` whenever the runtime check rejects an input. Provides an operator-side audit trail for attempted bridge attacks without polluting normal-operation logs.

**Rationale**: consistency with prior typed tools' observability discipline; avoids log volume blowup for normal writes. Security event is justified by the unique nature of `PATH_ESCAPES_VAULT` as an attack signal — it's evidence of an attempted bridge attack, not a routine failure mode.

**Alternatives considered**: pure parity (no security event), full per-call logging, dedicated security audit log file — all weighed during clarify Q3.

**Source**: spec FR-029 (new "Observability" subsection); spec Clarifications Q3 (2026-05-10).

### R7 — No artificial bound on write latency or content size

**Decision**: The new `write_note` schema has **no max-content-size cap**. The handler has **no `Promise.race` latency timeout**. Pathological cases (very large content on slow storage) surface as `FS_WRITE_FAILED` from the OS (ENOSPC / EACCES / EROFS / EIO) or as agent-side MCP timeout. The bridge does not pre-empt either failure mode.

**Rationale**: the whole BI premise is "no artificial size ceiling on writes" — adding any ceiling, even a generous one, undermines the messaging. ADR-007's 10 s typed-tool bound applies to CLI child-process spawns, which doesn't naturally apply to `fs.writeFile` (a Node syscall promise). Trust the OS + the agent's natural timeout. ADR-007's 2026-05-10 amendment block formalises the carve-out.

**Alternatives considered**: 10 MiB content cap, per-call `Promise.race` latency timeout, both cap + timeout — all weighed during clarify Q4.

**Source**: spec Assumptions (post-clarify); ADR-009 *Consequences*; ADR-007 amendment 2026-05-10; spec Clarifications Q4.

### R8 — Tool name + legacy disposition: in-place replacement

**Decision**: The new tool keeps the same tool name (`write_note`) — same as the predecessor. The legacy `src/tools/write_note/` source is **deleted wholesale** per FR-028. Git history is the canonical archaeology. No "disable + structured rejection" plumbing; no legacy-tool-source-preserved-for-retest pattern.

**Rationale**: the original 016 spec proposed a separate `write_note_w_eval` tool with the legacy `write_note` disabled-but-preserved. That plan was load-bearing only for the "re-enable for retest after upstream fix" scenario, which is moot under the new design — direct-fs-write doesn't depend on an upstream fix. Migration is invisible to callers; the tool name is unchanged; existing MCP-client configs work without modification. Eliminates the UX surprise of having two write tools.

**Alternatives considered**: coexist + disable original, coexist + soft-disable with size guard — both weighed during grilling Q7.

**Source**: spec FR-001 + FR-028; ADR-009 *Decision* §0 (replacement scope); design grilling Q7.

### R9 — Parameter changes: drop `template`, keep `open`

**Decision**: The new `write_note` schema **rejects `template`** at the schema layer with `VALIDATION_ERROR` whose message names `template` as no-longer-accepted and points the caller at `obsidian_exec` as the migration path. The new schema **preserves `open`** with predecessor semantics; implementation is via a small post-write `eval` call to `app.workspace.openLinkText(path, "")` (~80-byte argv, bug-safe) rather than the CLI's `--open` flag.

**Rationale**: `template` requires either replicating Obsidian's template variable expansion engine (drift risk forever) or calling Obsidian internals (no clean public API; version-fragile). Either path is more complex than the rest of this BI combined. Migration path for callers needing template: `obsidian_exec { argv: ["create", "template=Daily", ...] }` — the template-name argv stays small enough to dodge the upstream defect. `open` is one-liner support via the existing eval pattern; trivial to support, painful to remove.

**Alternatives considered**: drop both, keep both via eval (template-engine replication via Obsidian internals) — weighed during grilling Q7b.

**Source**: spec FR-016 + FR-017; ADR-009 *Consequences* — Negative; design grilling Q7b.

### R10 — Output shape: pure parity

**Decision**: `writeNoteOutputSchema = z.object({ created: z.boolean(), path: z.string() }).strict()`. Byte-stable with the predecessor's success envelope.

**Rationale**: avoids expanding the public surface in a redesign. Callers don't need bytes / vault / absolute_path for the primary user value; anyone needing them later can request via separate spec.

**Alternatives considered**: parity + bytes, parity + bytes + vault, expand more — weighed during grilling Q9.

**Source**: spec FR-003; design grilling Q9.

### R11 — Error roster: three new codes

**Decision**: Add three new stable error codes to the project's roster: `PATH_ESCAPES_VAULT` (FR-014), `FILE_EXISTS` (FR-009), `FS_WRITE_FAILED` (FR-020 — generic fs failures with `details.errno`). Vault-not-found surfaces as `VALIDATION_ERROR` (the vault name is invalid input given the registry, not a CLI failure). Each new code documented in `docs/tools/write_note.md` per FR-022.

**Rationale**: truth in naming — nothing CLI-related happens for these failure modes. Calling them `CLI_REPORTED_ERROR` is misleading and breaks log/metric grouping. Clean caller branching — agents can retry on `FILE_EXISTS` (with `overwrite: true`), alert on `PATH_ESCAPES_VAULT` (security signal), retry on `FS_WRITE_FAILED` (transient-ish). Distinct codes enable branching on intent, not on string-pattern-matching `details`.

**Alternatives considered**: zero new codes (overload `CLI_REPORTED_ERROR`), one generic new code (`FS_OPERATION_FAILED` with `details.kind`) — weighed during grilling Q10.

**Source**: spec FR-020 + FR-021; ADR-009 *Consequences* — Negative; design grilling Q10.

### R12 — ADR scope: one new ADR (ADR-009)

**Decision**: One new ADR — `ADR-009 - Direct Filesystem Write Path Alongside CLI Bridge`. Documents the architectural decision (second IO path), the Context (BI-038 + bug-report-draft.md), the Decision detail, the Consequences (positive + negative), the Alternatives Considered, and the explicit non-impact on ADR-003 / ADR-004 / ADR-005 / ADR-006 / ADR-007 / ADR-008. ADR-007 separately gains an in-place amendment (2026-05-10) clarifying that its bounds discipline applies to CLI dispatch and that ADR-009's fs writes are unbounded by ADR-007 (the small `eval` calls remain bound).

**Rationale**: the architectural decision is exactly one decision — "we now have a second IO path". Vault-registry and path-safety are implementation mechanisms that flow from that decision; they belong in this spec/research, not separate ADRs. ADR-007's amendment is a scope clarification, not a deepening or supersession — same pattern as ADR-008's 2026-05-09 amendment.

**Alternatives considered**: multiple ADRs (separate ADRs for vault-registry caching policy and path-safety policy), no ADR (drift) — weighed during grilling Q11.

**Source**: ADR-009 (Status: Decided); ADR-007 amendment 2026-05-10; design grilling Q11.

### R13 — Test scope: vitest unit-only in this repo

**Decision**: This repo's test surface is vitest unit tests only, co-located with source per Principle II. Manual / integration / TC-numbered cases live in the user's broader vault tracker, not in `specs/<feature>/test-cases/`. The new tool's test inventory is enumerated in `data-model.md`'s test inventory section.

**Rationale**: project scope separation — implementation surface lives here; higher-level test cases and BI / ADR cross-links live in the user's broader system.

**Source**: feedback memory `feedback_test_scope.md`; design grilling Q12.

### R14 — Active mode: small bug-safe pre-write eval for focused-file resolution

**Decision**: In active mode, the handler issues a small pre-write `eval` to resolve the focused note's path:

```js
(async () => {
  const f = app.workspace.getActiveFile();
  return JSON.stringify({path: f?.path ?? null, base: app.vault.adapter.basePath});
})()
```

Argv ~120 bytes, bug-safe. On null-path response → `ERR_NO_ACTIVE_FILE` (per FR-019, reusing the existing project-wide code). On non-null response → resolve to absolute path via `<base>/<path>` and proceed through the same fs path used in specific mode (path safety → mkdir → write → rename → invalidate cache). The `open` parameter is forbidden in active mode per the existing target-mode contract (the file is already focused; opening again is a no-op).

**Rationale**: every other file-targeted typed tool supports active mode; parity matters. The eval is bug-safe by construction (argv carries no user content). Active-mode is the dominant flow for interactive-context writes (agent acts on the user's currently-focused note).

**Alternatives considered**: drop active mode (breaks parity), defer to follow-up (spec inconsistency) — weighed during grilling Q3.

**Source**: spec FR-018 + FR-019 + Acceptance Scenarios for User Story 3; ADR-009 *Decision* §6; design grilling Q3.

## Live CLI findings

Verified against the live `obsidian` binary on Windows 11 during the 2026-05-10 design grilling + the BI-038 bisect run. Each finding locks an assumption the implementation rests on; future CLI version drift surfaces as a vault-registry test failure or argv-length test failure rather than a silent behavioural regression.

### F1 — argv-IPC chunk-boundary defect threshold (~4 KB on Windows)

**Verified**: bisect run on 2026-05-10 against TestVault-Obsidian-CLI-MCP. Both `obsidian create` and `obsidian eval` succeed for argv elements ≤ ~4 KB and crash Obsidian's main process for argv elements ≥ ~4.4 KB. Threshold consistent with Windows named-pipe default chunk size; macOS forum thread (forum.obsidian.md/.../113867) reports ~8 KB on its platform with the same root-cause family (silent UTF-8 corruption rather than fatal JSON.parse failure).

**Captured**: bug-report-draft.md *Threshold pattern (size of the largest single argv element)* table; BI-038 PART 2 amendment.

**Implication**: every argv element the new tool emits MUST stay well under ~4 KB. The eval templates the new tool emits are constant ~120-200 bytes (template + path only); the user content never crosses argv. SC-007 locks this as a measurable contract.

### F2 — `obsidian vaults verbose` returns tab-separated `<name>\t<path>` per registered vault

**Verified**: probe on 2026-05-10:
```
> obsidian vaults verbose
TestVault-Obsidian-CLI-MCP	C:\Marwan-Saab-ADO\Marwan at Metcash\Obsidian\TestVault-Obsidian-CLI-MCP
The Setup	C:\Marwan-Saab-ADO\Marwan at Metcash\Obsidian\The Setup
```

**Implication**: `src/vault-registry/registry.ts` parses the output by `\t` per row. The format is the input contract for the cached registry. Future Obsidian CLI changes here surface as a vault-registry test failure.

**Argv length**: `obsidian vaults verbose` totals ~25 bytes — comfortably bug-safe.

### F3 — `obsidian eval code=<javascript>` shape; small payloads bug-safe

**Verified**: baseline probe on 2026-05-10 with 42-byte content via eval succeeded:
```
> obsidian eval code=<small JS>
=> {"ok":true,"bytes":42}
```

The `eval` subcommand returns the JS result prefixed with `=> `, which the cli-adapter strips during response parsing.

**Implication**: the new tool's small eval calls (~120-200 bytes argv) are bug-safe and predictable. The handler's eval-response parser strips the `=> ` prefix and `JSON.parse`s the rest.

### F4 — `vault=` parameter functionally ignored by both `create` and `eval` against the IPC pipe

**Verified**: probe on 2026-05-10 — `obsidian create vault=TestVault-Obsidian-CLI-MCP path=Sandbox/probe-vault-routing.md content=probe overwrite` returned "Created: Sandbox/probe-vault-routing.md" but the file landed in "The Setup" (the focused vault), not in TestVault. Same behaviour for `obsidian eval vault=...` — eval composition hits the focused vault. The CLI's IPC channel addresses the focused Obsidian app, not the named vault.

**Implication**: this is the inherited R11 limitation (documented in 014 / 015 research). The new tool **resolves it** by owning path resolution end-to-end via the cached vault registry — `vault=Foo` resolves to Foo's absolute path via the registry, then `fs.writeFile` writes there directly without IPC. The control-plane eval calls (focused-file resolution, cache invalidation, editor-open) are inherently focused-vault-scoped, but they only need to address the file that was just written (the cache invalidate's path is the absolute path; if the focused vault doesn't contain that path, the `getFileByPath` lookup returns null and the invalidation is a no-op — best-effort per R5).

### F5 — Currently-focused vault is the de-facto target for any IPC-mediated call

**Verified**: see F4. Probed via `obsidian eval code='JSON.stringify({vault: app.vault.getName(), base: app.vault.adapter.basePath})'` — returns the focused vault's name + base path regardless of the `vault=` parameter.

**Implication**: in the new tool's active mode, the focused-file resolution eval inherently runs in the focused vault's context. The handler reads `path` (vault-relative) + `base` (absolute) from the eval response, joins them to an absolute path, then proceeds through path-safety (verifying the absolute path is under the focused vault's root, NOT under the `vault=` parameter's root). Specific mode is unaffected — the bridge resolves `vault=Foo` against the registry without depending on the focused vault.

## Phase-stage gates

- **Constitution Check**: PASS (all five principles satisfied; see plan.md *Constitution Check* table).
- **Spec quality checklist**: PASS (see [checklists/requirements.md](checklists/requirements.md)).
- **No `[NEEDS CLARIFICATION]` markers in spec**: PASS (cleared via `/speckit-clarify` session 2026-05-10).
- **All decisions sourced**: PASS (each R-decision above cites its source in spec / ADR / grilling / clarify).
- **All live findings verified**: PASS (each F-finding has a captured probe transcript or BI-038 cross-reference).

## What this research does NOT cover

The following are explicitly out of Phase 0 scope and deferred to Phase 1 (data-model.md, contracts/, quickstart.md) or Phase 2 (`/speckit-tasks`):

- Concrete TypeScript types and schemas (Phase 1 → data-model.md).
- Per-FR test case enumeration (Phase 1 → data-model.md test inventory).
- Verification scenario step-by-step (Phase 1 → quickstart.md).
- Task ordering / dependencies (Phase 2 → tasks.md).
- Path-safety extended-character coverage (DEL `\x7f`, Unicode RTL/zero-width chars) — flagged in spec Q5 deferral; plan-stage characterisation defers to T0 of `/speckit-implement` once the schema validator regex is in hand.
- Orphan `.tmp` cleanup on rare rename failure — flagged in spec Q5 deferral; plan-stage characterisation defers to T0 (best-effort `unlink` after rename failure vs leave-orphan).
