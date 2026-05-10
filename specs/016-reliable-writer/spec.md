# Feature Specification: Reliable Writer

**Feature Branch**: `016-reliable-writer`
**Created**: 2026-05-10
**Status**: Draft (rewritten 2026-05-10 after the original eval-bypass premise was retracted; see [bug-report-draft.md](bug-report-draft.md) and [ADR-009](../../.decisions/ADR-009%20-%20Direct%20Filesystem%20Write%20Path%20Alongside%20CLI%20Bridge.md) for the design pivot)
**Input**: Restore reliable writes through this MCP. The existing `write_note` tool deterministically crashes Obsidian's main process for any note whose content exceeds approximately 4 KB on Windows because of an upstream argv→IPC chunk-boundary defect (filed at <https://forum.obsidian.md/t/cli-windows-json-parse-failure-crashes-obsidians-main-process-when-any-single-argv-element-exceeds-4-kb/114119>). The original 016 plan to route writes through Obsidian's `eval` subcommand was empirically refuted on 2026-05-10 — eval suffers the same per-argv-element ceiling and is in fact slightly worse than `create` for writes because of base64 expansion. This rewrite ratifies the design selected after that retraction: replace `write_note` in-place with a direct-filesystem-write implementation that never sends user content across the CLI argv pipe.

## Clarifications

### Session 2026-05-10

- Q: Path-safety against symlink-escape — User Story 4 AC#3 promises catching it, but FR-014's `path.resolve + startsWith` is purely lexical and can't catch symlinks. How is symlink-escape actually caught? → A: `fs.realpath` on the resolved parent directory, then `startsWith` on the canonical result. ENOENT fallback (parent directory doesn't yet exist) reverts to `path.resolve` — safe because the schema layer has already rejected dangerous lexical shapes (`../`, leading slash, drive-letter prefix).
- Q: Vault-registry probe — when does it fire, and what happens on failure? FR-012 said "populated at MCP-server startup" but the design grilling implied lazy load. The CLI's vault-list probe requires Obsidian to be running, which may not be true at MCP boot in deployments where the AI client auto-launches MCP before the user opens Obsidian. → A: Lazy probe on the first `write_note` call, cached for the MCP-server-process lifetime (which equals the session lifetime in normal deployment) once successful. Server boots regardless of Obsidian state; first write_note attempts the probe; on success the cache populates and all subsequent writes hit the cache (0 ms); on failure the call surfaces a structured error (`CLI_BINARY_NOT_FOUND` or `CLI_REPORTED_ERROR` from the underlying probe) and the next call retries the probe — the cache is only "set" on a successful probe.
- Q: Logger surface for the new tool — every prior typed tool (011-015) settled "no per-call events at the tool layer", but the new tool's `PATH_ESCAPES_VAULT` case is uniquely security-relevant. Should it emit a logger event? → A: Match prior precedent for normal cases (UpstreamError propagates through `registerTool`'s existing logger plumbing; no `writeStart`/`writeSuccess`/`writeFailure` per-call events). Add ONE security event for `PATH_ESCAPES_VAULT`: `logger.warn({event: "pathEscapeAttempt", vault, attemptedPath})` whenever the runtime check (FR-014) rejects an input. Provides an operator-side audit trail for attempted bridge attacks without polluting normal-operation logs.
- Q: Performance bound for `write_note` — should there be an explicit content-size or latency cap? ADR-007's 10 s typed-tool bound applies to CLI child-process spawns, which doesn't naturally apply to `fs.writeFile`. → A: No explicit bound. The whole BI premise is "no artificial size ceiling on writes" — adding any ceiling, even a generous one, undermines the messaging. fs.writeFile fails naturally on ENOSPC / EACCES / EROFS (surfacing as `FS_WRITE_FAILED` per FR-020); the agent-side MCP timeout (typically 30 s+) is the natural backstop for runaway calls. Trust the OS.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Reliable specific-mode writes at any practical size (Priority: P1)

An agent calling this MCP creates or overwrites a note at a named path inside a named vault. The note contains arbitrary text — frontmatter, prose, code blocks, embedded quotes, mixed Markdown — and may range from a few bytes to many kilobytes (and beyond — there is no per-call content-size ceiling baked into the new design). The call either succeeds or fails with a structured error. In no case does the host Obsidian application present a "JavaScript error occurred in the main process" dialog, in no case is content silently truncated, in no case is the target path silently renamed, and the on-disk file is never left in a torn (half-written) state — even on mid-write process crash.

**Why this priority**: this is the entire reason the feature exists. The previous `write_note` tool deterministically crashed the host application for content beyond ~4 KB on Windows. Without a crash-free, size-unlimited specific-mode write path, this MCP has no usable write surface at all.

**Independent Test**: invoke the new tool against a real Obsidian vault with content samples spanning 60 bytes, 5 KB, 12 KB, and 100 KB. Verify (a) the file exists at the requested path with byte-for-byte matching content, (b) no Obsidian error dialog appeared during or after the call, (c) the call's content delivery did not cross the CLI argv pipe (verifiable by argv-element-length inspection on the bridge's spawn calls), and (d) on a deliberate mid-write SIGTERM the on-disk file is either entirely the old content or entirely the new content — never partial.

**Acceptance Scenarios**:

1. **Given** a fresh path inside an existing registered vault, **when** an agent calls `write_note` with approximately 60 bytes of content, **then** the note is created at the exact path with byte-for-byte matching content and no host-application error dialog appears.
2. **Given** a fresh path inside an existing registered vault, **when** an agent calls `write_note` with approximately 5 KB of content (the size at which the predecessor deterministically crashed), **then** the note is created successfully with no host crash dialog.
3. **Given** a fresh path inside an existing registered vault, **when** an agent calls `write_note` with approximately 12 KB of mixed Markdown content (the size at which the predecessor returned an empty-response error), **then** the note is created successfully, no empty-response error is returned, and no host crash dialog appears.
4. **Given** a fresh path inside an existing registered vault, **when** an agent calls `write_note` with approximately 100 KB of content, **then** the note is created successfully — confirming the new design has no practical content-size ceiling at the same scale as the predecessor's crash threshold.
5. **Given** content that contains characters previously suspected to break the predecessor's call path (double quotes, square brackets, trailing commas, embedded JSON-like fragments, multi-byte UTF-8, emoji, mixed CRLF/LF line endings), **when** an agent calls `write_note`, **then** the content is persisted byte-for-byte in the resulting note.
6. **Given** an agent passes the input parameters that the predecessor accepted for a successful create, **when** the agent calls the new `write_note`, **then** the response shape is identical to what the predecessor would have returned (`{ created: boolean, path: string }`) — subject only to the deliberately-improved collision behaviour in User Story 2 and the deliberate parameter changes in User Story 6.
7. **Given** the bridge is running and the OS forces process termination mid-write (SIGTERM, sudden power loss), **when** the agent's next call reads the same path, **then** the file's content is either entirely the previous version or entirely the new version — never a torn write with partial content.

---

### User Story 2 — Structured collision behaviour (Priority: P1)

An agent attempts to create a note at a path already occupied by another note. The tool's response distinguishes deliberately between "I refuse to overwrite" and "I have overwritten as instructed", based on an explicit caller-supplied `overwrite` flag. The tool never silently produces a renamed copy when the caller asked for a fresh create.

**Why this priority**: silent path renames cause idempotency bugs in agent workflows that retry. The predecessor's behaviour of silently renaming on collision is one of the documented motivations for this BI. Pairing the crash-free write surface with deliberate collision behaviour is what makes the tool safe to use in multi-step agent flows, not just convenient. Atomic collision detection (no race window between exists-check and write) is the load-bearing implementation contract.

**Independent Test**: write a note at path P, then issue a second call to path P with `overwrite: false` (must return a structured `FILE_EXISTS` error and leave the original content intact), then a third call with `overwrite: true` (must replace the content and return success). Verify the on-disk content after each call. Bonus: race two concurrent `overwrite: false` calls at the same fresh path; exactly one MUST succeed and the other MUST receive `FILE_EXISTS`.

**Acceptance Scenarios**:

1. **Given** an existing note at the target path, **when** an agent calls `write_note` with `overwrite: false`, **then** the call returns a structured `FILE_EXISTS` error and the existing note's content is unchanged.
2. **Given** an existing note at the target path, **when** an agent calls `write_note` with `overwrite: true`, **then** the existing note's content is replaced with the new content and the call returns `{ created: false, path: <path> }`.
3. **Given** an existing note at the target path, **when** an agent calls `write_note` with `overwrite: false`, **then** the tool does NOT silently produce a renamed copy of the note at any path.
4. **Given** two concurrent calls to the same fresh path with `overwrite: false`, **when** both race to write, **then** exactly one returns success and the other returns `FILE_EXISTS` — there is no race window in which both can succeed.

---

### User Story 3 — Active-mode writes to the focused note (Priority: P2)

An agent calling this MCP wants to update whichever note Obsidian currently has focused — without naming a specific path — for example, to act on the user's current editing context. When a note is focused, the call replaces its content and returns success. When no note is focused, the call returns a structured error explaining the situation, so the agent can prompt the user or fall back to a path-specific call.

**Why this priority**: active mode is a documented capability of every file-targeted typed tool in the project's prior shipped surface and is part of the input-contract-parity promise with the predecessor. P2 because specific mode covers the dominant agent use case (workflow-driven writes); active mode primarily supports interactive editor-context writes which are a smaller fraction of calls.

**Independent Test**: (a) open a note in Obsidian, call `write_note` in active mode with new content, verify the focused note's content is replaced and that immediately-following `read_property`/`read_heading` against the focused note return the new value (not stale cache); (b) close all notes so no file is focused, call `write_note` in active mode, verify the response is a structured `ERR_NO_ACTIVE_FILE` rather than a crash or silent fallback.

**Acceptance Scenarios**:

1. **Given** Obsidian has a focused note in its editor, **when** an agent calls `write_note` in active mode with new content, **then** the focused note's content is replaced and the call returns `{ created: false, path: <focused-file-path> }`.
2. **Given** Obsidian has no focused note, **when** an agent calls `write_note` in active mode, **then** the call returns a structured `ERR_NO_ACTIVE_FILE` error (with the existing project-wide recovery-message convention).
3. **Given** an agent calls `write_note` in active mode and the call succeeds, **when** the agent immediately calls `read_property` or `read_heading` against the same focused file, **then** the read returns the newly-written value, not stale cache from before the write.

---

### User Story 4 — Path-safety against vault-escape attempts (Priority: P1)

An agent (or an upstream client crafting requests) attempts to write to a path that escapes the vault root — for example `../../etc/passwd.md`, an absolute path like `/tmp/escape.md` or `C:\\Windows\\evil.md`, or a path that resolves outside the vault via a symlink inside the vault. The tool refuses every such attempt with a structured error before any byte is written. No file outside the vault root is ever touched.

**Why this priority**: an Obsidian vault is the user's primary knowledge store and an MCP server is a network-reachable surface. Silent vault-escape on a write operation is a critical security defect. The predecessor relied on the CLI's literal-path treatment for safety; the new design owns path interpretation end-to-end and must own the safety guarantee accordingly. P1 because it's a security gate, not a feature — shipping without it is unsafe.

**Independent Test**: attempt writes to each of `../escape.md`, `subdir/../../escape.md`, `/abs/escape.md`, `C:\\Windows\\escape.md`, and (on a vault containing a symlink `inside-link → /outside/dir`) `inside-link/escape.md`. Each MUST return either `VALIDATION_ERROR` (schema-layer rejection) or `PATH_ESCAPES_VAULT` (runtime symlink-resolution rejection). On the filesystem, no file outside the vault root must be created.

**Acceptance Scenarios**:

1. **Given** a path containing `../` segments, **when** an agent calls `write_note`, **then** the call returns `VALIDATION_ERROR` and no filesystem write occurs.
2. **Given** a path with a leading `/` (POSIX absolute) or drive-letter prefix (Windows absolute), **when** an agent calls `write_note`, **then** the call returns `VALIDATION_ERROR` and no filesystem write occurs.
3. **Given** a path that is structurally vault-relative but resolves outside the vault root via a symlink inside the vault, **when** an agent calls `write_note`, **then** the call returns `PATH_ESCAPES_VAULT` and no filesystem write occurs.
4. **Given** any rejected vault-escape attempt, **when** the bridge inspects the filesystem after the call, **then** no file outside the vault root has been created or modified.

---

### User Story 5 — Discoverable, self-describing tool (Priority: P3)

An agent calling this MCP requests progressive-disclosure help for `write_note`. The returned help is sufficient on its own — without external documentation, without reading the source — to construct a valid invocation, predict the response shape on success, predict the response shape on each documented failure, understand the migration story from the predecessor (dropped `template`, preserved `open`, new collision semantics), and understand the upstream defect that motivated the architecture pivot.

**Why this priority**: project-wide convention; every prior typed tool ships with progressive-disclosure help meeting this bar. The new tool inherits the requirement automatically. P3 because the tool is functionally usable without exhaustive help (an agent who knows the shape can invoke it), but discoverability and rationale-transparency are part of the project's quality bar.

**Independent Test**: request help for the new tool through the MCP help surface and assert the returned text covers each required dimension: purpose, when to use, full input contract (parameter meanings, types, defaults, the dropped `template` and preserved `open` callouts), full output and error contract (each stable error code), the upstream rationale with the forum URL, the design pivot rationale citing ADR-009, and at least one worked invocation example.

**Acceptance Scenarios**:

1. **Given** an MCP client requests progressive-disclosure help for `write_note`, **when** the help is returned, **then** it explains what the tool does and identifies it as a write-targeted tool that creates or overwrites a single note via direct filesystem write.
2. **Given** the same help request, **when** the help is returned, **then** it documents the full input contract — every parameter's meaning, type, requiredness, and default — including the explicit "template no longer accepted; use `obsidian_exec` for template-based creation" callout and the explicit "`open` flag honoured via post-write editor focus" callout.
3. **Given** the same help request, **when** the help is returned, **then** it documents the full output and error contract, naming each stable error code (`VALIDATION_ERROR`, `ERR_NO_ACTIVE_FILE`, `FILE_EXISTS`, `PATH_ESCAPES_VAULT`, `FS_WRITE_FAILED`) and the conditions that surface each.
4. **Given** the same help request, **when** the help is returned, **then** it explains the upstream Obsidian defect (with the forum URL) and the architecture pivot to direct-filesystem writes (citing ADR-009).
5. **Given** the same help request, **when** the help is returned, **then** it includes at least one worked invocation example for specific mode and one for active mode.

---

### User Story 6 — Migration parity from the predecessor (Priority: P2)

An agent or client whose request bodies were authored against the predecessor `write_note` continues to function with the new tool — same tool name, same target-mode discriminator, same `vault`/`file`/`path`/`content`/`overwrite` parameters, same `{ created, path }` success response shape — with two deliberate exceptions documented up front: the `template` parameter is no longer accepted (migration: use `obsidian_exec` directly with the CLI's `create template=...` syntax — argv stays small enough to dodge the upstream defect), and the `open` parameter is preserved with identical meaning but is now implemented via a small post-write editor-focus call rather than the CLI's `--open` flag.

**Why this priority**: P2 because preserving migration ergonomics is project-quality work, not feature work. Most callers will see no change at all; the small fraction using `template` get a clean migration path with one structured `VALIDATION_ERROR` and a documentation pointer.

**Independent Test**: replay every published call shape from the predecessor's `docs/tools/write_note.md` worked examples; each should either succeed (for the un-changed shapes) or return `VALIDATION_ERROR` with a message naming `template` and pointing at `obsidian_exec` (for shapes using `template`). The active-mode `overwrite: true` requirement and the active-mode forbidden-keys rules are unchanged.

**Acceptance Scenarios**:

1. **Given** a request whose only difference from the predecessor's input is that no `template` parameter is supplied, **when** the agent calls the new `write_note`, **then** the call succeeds with response shape identical to what the predecessor would have returned for the equivalent call.
2. **Given** a request that includes a `template` parameter, **when** the agent calls the new `write_note`, **then** the call returns `VALIDATION_ERROR` whose message names `template` as no-longer-accepted and points the caller at `obsidian_exec` as the migration path.
3. **Given** a request with `open: true` and a fresh target path, **when** the call succeeds, **then** the new note is opened in the Obsidian editor (same observable outcome as the predecessor's `--open` flag).
4. **Given** any call that the predecessor would have rejected via the existing target-mode rules (active mode without `overwrite: true`, active mode with `vault`/`file`/`path`, active mode with `template` or `open`, specific mode without `vault`, specific mode with neither/both `file` and `path`), **when** the agent calls the new `write_note`, **then** the call is rejected at the schema layer with the same `VALIDATION_ERROR` shape.

---

### Edge Cases

- **Vault name not in the registry** (typo, vault registered after MCP server start, vault de-registered): returns `VALIDATION_ERROR` with a message naming the offending vault. The bridge surfaces the staleness explicitly so the agent can prompt the operator to restart the MCP server if a vault was added during the session.
- **Path with directory components that don't yet exist**: parent directories are auto-created via `fs.mkdir({recursive: true})` before the write — parity with the predecessor's behaviour.
- **Empty content**: the note is created or overwritten with empty content; no special-case error.
- **Content containing the literal characters that historically broke the predecessor** (`,]`, `,"Calls.md",]`, `","",` etc.): persisted byte-for-byte. Content never crosses argv, so the upstream chunk-boundary defect is not in the picture.
- **Overwriting a note that is currently open in the Obsidian editor**: the on-disk file is replaced via temp-then-rename; Obsidian's file watcher detects the rename and refreshes the editor view per its normal external-edit handling. The post-write `metadataCache` invalidation eval ensures `read_property` / `read_heading` against the same path see the new content immediately.
- **Two concurrent calls to overwrite the same path with `overwrite: true`**: last-write-wins on rename. Atomicity guarantees one or the other complete write lands; never a torn mix of both.
- **Two concurrent calls to create the same fresh path with `overwrite: false`**: exactly one succeeds; the other receives `FILE_EXISTS`. The `wx` flag eliminates the race window.
- **Filesystem out of space** (ENOSPC): returns `FS_WRITE_FAILED` with `details.errno: "ENOSPC"`.
- **Filesystem permission denied** (EACCES, EPERM): returns `FS_WRITE_FAILED` with `details.errno: "EACCES"` (or appropriate).
- **Filesystem read-only** (EROFS): returns `FS_WRITE_FAILED` with `details.errno: "EROFS"`.
- **Vault root has been deleted between MCP startup and the call**: returns `FS_WRITE_FAILED` with `details.errno: "ENOENT"` for the vault root itself; the agent should treat as "vault registry stale, restart server".
- **Path-traversal probe (`../../etc/passwd.md`, `subdir/../../escape.md`)**: rejected at schema layer with `VALIDATION_ERROR`. No filesystem touch.
- **Symlink-escape probe** (path inside vault that's a symlink to a file outside vault): rejected at runtime with `PATH_ESCAPES_VAULT`. The runtime check uses `fs.realpath` on the target's canonical parent directory (per FR-014), so symlinks inside the vault that point outside are caught. No filesystem touch.
- **Path containing OS-reserved names on Windows** (`CON.md`, `PRN.md`, `NUL.md`, etc.): passes the bridge's schema/runtime checks; the underlying `fs.writeFile` will fail with an OS-specific error (typically EACCES or EBADF) and surface as `FS_WRITE_FAILED`. The bridge does not pre-validate these (they're vault-config-dependent — Obsidian itself permits some).
- **Path containing characters Obsidian's UI normally disallows** (`*`, `?`, `:`, `"`, `<`, `>`, `|`): passes the bridge's checks; the file is written. Obsidian's UI may struggle to display it; the file persists on disk regardless. (Out of scope for this BI to pre-validate against Obsidian UI conventions.)
- **A vault added during the MCP server session**: the new vault is invisible to `write_note` until MCP restart. Documented in `docs/tools/write_note.md`; surfaces as `VALIDATION_ERROR` if the agent tries to use the unknown vault name.
- **A vault renamed during the MCP server session**: same as above. The old name resolves to the now-stale absolute path (which may or may not still exist); the new name is invisible.
- **`metadataCache` invalidation eval fails after a successful disk write** (eval timeout, IPC hang, Obsidian crashed between the rename and the invalidation): per FR-011, the call returns success — the write is the contract, the invalidation is best-effort. Obsidian's file watcher catches the change within ~200-500 ms. An immediately-following `read_property` / `read_heading` against the same path may briefly return stale cache; the agent's retry observes the fresh value once the watcher fires.

## Requirements *(mandatory)*

### Functional Requirements

#### The new tool — public surface

- **FR-001**: The MCP server MUST advertise a typed tool named exactly `write_note` in its tool list. No other write-tool name (e.g. `write_note_w_eval`, `write_note_v2`) is added or required.
- **FR-002**: The new `write_note`'s public input contract MUST mirror the predecessor's contract — same `target_mode` discriminator, same `vault`/`file`/`path`/`content`/`overwrite` parameters, same per-mode rules (specific requires `vault` plus exactly one of `file`/`path`; active forbids all three locator keys; active requires `overwrite: true`) — except for the two deliberate parameter changes in FR-016 and FR-017.
- **FR-003**: The new `write_note`'s success response shape MUST be exactly `{ created: boolean, path: string }`, byte-stable with the predecessor's success envelope.

#### The new tool — content reliability

- **FR-004**: The new `write_note` MUST persist user-supplied `content` to the target path byte-for-byte, regardless of which characters the content contains, including characters historically suspected of breaking the predecessor's call path (double quotes, square brackets, trailing commas, embedded JSON-like fragments, multi-byte UTF-8, emoji, mixed CRLF/LF line endings).
- **FR-005**: User-supplied `content` MUST NOT cross the CLI argv pipe at any size. The implementation MUST send content via Node `fs` directly to the vault filesystem.
- **FR-006**: The new `write_note` MUST NOT cause the host Obsidian application to display a "JavaScript error occurred in the main process" dialog for any value of `content`, including content sizes far above the upstream defect's per-argv-element threshold.
- **FR-007**: The new `write_note` MUST NOT return an empty-stdout / empty-response failure for any content size that the predecessor returned empty-response failures for.

#### The new tool — reliability mechanisms

- **FR-008**: The new `write_note` MUST write content atomically — using a temp-file-then-rename pattern (`fs.writeFile` to `<target>.tmp`, then `fs.rename(<target>.tmp, <target>)`) — such that mid-write process termination leaves the on-disk file as either entirely the previous version or entirely the new version, never partial.
- **FR-009**: The new `write_note` MUST detect path collisions atomically — using `fs.writeFile` with the `wx` flag for the `overwrite: false` case — eliminating the race window between an exists-check and the write itself.
- **FR-010**: The new `write_note` MUST auto-create parent directories if the target path's directory components don't yet exist (via `fs.mkdir({recursive: true})`) — parity with the predecessor's behaviour.
- **FR-011**: After every successful write, the new `write_note` MUST invalidate `metadataCache` for the written path via a small `eval` call (template carrying only the path, ~120-byte argv) so that immediately-following `read_property` / `read_heading` calls see the new content rather than stale cache. This preserves the freshness guarantee the predecessor provided synchronously through the CLI's in-process API. **Failure of the invalidation eval (eval timeout, IPC hang, Obsidian crashed mid-call) MUST NOT cause the `write_note` call to return failure** — the file has already landed atomically on disk per FR-008/FR-009 and the call's contract was the write, not the cache update. The handler MUST return success (with the standard `{ created, path }` envelope) when the write succeeds; cache freshness is best-effort. Obsidian's own file watcher will catch the disk change within ~200-500 ms regardless, providing eventual consistency for any read that doesn't fire within that race window.

#### The new tool — vault and path safety

- **FR-012**: The new `write_note` MUST resolve `vault` names to absolute filesystem paths via a vault registry that is populated **lazily on the first `write_note` invocation** by a single bug-safe call to `obsidian vaults verbose` (~25-byte argv). Once a probe succeeds, the registry is cached for the MCP-server-process lifetime (equivalent to the session lifetime in normal deployment); subsequent writes use the cached map with no per-write CLI lookup. The MCP server boot sequence MUST NOT depend on the probe succeeding — Obsidian may not be running when the MCP server starts (common when an AI client auto-launches the MCP server before the user opens Obsidian). On probe failure, the calling `write_note` invocation surfaces the underlying CLI failure code (typically `CLI_BINARY_NOT_FOUND` if the `obsidian` binary is missing, or the CLI's own `CLI_REPORTED_ERROR` if it cannot connect to a running Obsidian app) and the registry remains uncached so the next call retries the probe.
- **FR-013**: The new `write_note` MUST reject path-traversal-shaped inputs at the schema validation boundary (`../` or `..\\` segments, leading `/` or `\\`, drive-letter prefix `[A-Za-z]:`, control characters `[\x00-\x1f]`) → `VALIDATION_ERROR`.
- **FR-014**: After resolving the absolute filesystem path for a vault-relative input, the new `write_note` MUST verify that the *canonical* resolved path lies under the vault root before writing — defense-in-depth catch for symlink-escape attacks the schema can't see → `PATH_ESCAPES_VAULT`. The mechanism is `fs.realpath` on the target's parent directory followed by a `startsWith(realVaultRoot + sep)` check on the canonical result; this catches symlinks inside the vault that point outside, which a purely-lexical `path.resolve` check would miss. The realpath check MUST run **before** the parent-dir creation in FR-010 — any pre-existing in-vault symlink that an adversary might exploit lives in an existing path component, so `fs.realpath` succeeds on the deepest existing parent and the `startsWith` check catches any escape through that symlink. If `fs.realpath` returns ENOENT (every component up to the new file is being created by our own mkdir, no adversary symlinks in play), the check falls back to lexical `path.resolve` on the input — safe because the schema layer (FR-013) has already rejected the dangerous lexical shapes (`../` segments, leading `/` or `\`, drive-letter prefix).
- **FR-015**: No file outside the resolved vault root MUST be created or modified by the tool under any input.

#### The new tool — parameter changes from the predecessor

- **FR-016**: The new `write_note` MUST NOT accept the `template` parameter. Requests including `template` MUST be rejected at the schema layer with `VALIDATION_ERROR` whose message names `template` as no-longer-accepted and points the caller at `obsidian_exec` as the migration path. (Rationale: replicating Obsidian's template variable expansion via the new path requires either calling Obsidian internals — no clean public API, version-fragile — or implementing our own engine — drift risk forever. Out of scope for V1.)
- **FR-017**: The new `write_note` MUST preserve the `open` parameter with its predecessor semantics (open the target file in the Obsidian editor after the write). Implementation MUST be via a small post-write `eval` call to `app.workspace.openLinkText(path, "")` (~80-byte argv, bug-safe) rather than the CLI's `--open` flag.

#### The new tool — active mode

- **FR-018**: In active mode, the new `write_note` MUST resolve the focused note's path via a small pre-write `eval` call to `app.workspace.getActiveFile()?.path` (~120-byte argv, bug-safe), then write to the resolved absolute path through the same fs path used in specific mode.
- **FR-019**: In active mode, when no note is focused, the new `write_note` MUST return `ERR_NO_ACTIVE_FILE` with the existing project-wide recovery-message convention.

#### Error roster additions

- **FR-020**: The new `write_note` introduces three new stable error codes to the project's error roster: `PATH_ESCAPES_VAULT` (FR-014), `FILE_EXISTS` (FR-009 collision), `FS_WRITE_FAILED` (generic fs failures with `details.errno`). Each new code MUST be documented in `docs/tools/write_note.md` per FR-022.
- **FR-021**: Vault-not-found (the registry lookup miss surfaced by FR-012) MUST surface as `VALIDATION_ERROR` (the offending vault name is invalid input given the registry), not as a new error code.

#### Documentation and discoverability

- **FR-022**: The progressive-disclosure help for the new `write_note` MUST cover, at minimum: (a) what the tool does, (b) when to use it and when not to, (c) the full input contract including each parameter's meaning, type, requiredness, and default — explicitly calling out the dropped `template` and the preserved `open`, (d) the full output and error contract including each of the five stable error codes (`VALIDATION_ERROR`, `ERR_NO_ACTIVE_FILE`, `FILE_EXISTS`, `PATH_ESCAPES_VAULT`, `FS_WRITE_FAILED`), (e) the upstream rationale citing the forum URL and ADR-009, and (f) at least one worked invocation example for specific mode and one for active mode.

#### Cross-cutting non-impact

- **FR-023**: This feature MUST NOT change the public input contract, output shape, or error roster of any other typed tool (`read_note`, `read_property`, `read_heading`, `find_by_property`, `delete_note`, `obsidian_exec`, `help`).
- **FR-024**: This feature MUST NOT change the MCP server's progressive-disclosure conventions or schema-stripping behaviour beyond what the new tool's contract requires.
- **FR-025**: The `cli-adapter` (`invokeCli`, `invokeBoundedCli`, `dispatchCli`) MUST remain unchanged. The new tool's small `eval` calls (vault registry probe, focused-file probe, `metadataCache` invalidation, optional editor-open) route through `invokeCli` per ADR-004 / ADR-007 — the asymmetry is content-only.

#### Architectural alignment

- **FR-026**: The implementation introduces two new internal modules: `src/vault-registry/` (cached `vaultName → absolutePath` map; one public function `resolveVaultPath`) and `src/path-safety/` (schema-layer validators + runtime `pathStaysUnderRoot` checker). Both modules co-locate their vitest cases per project convention.
- **FR-027**: The architectural decision to add a second IO path (direct fs alongside CLI bridge) MUST be ratified by a new ADR — `ADR-009 - Direct Filesystem Write Path Alongside CLI Bridge`. The new `write_note` source files (and any new modules introduced for it: `src/vault-registry/`, `src/path-safety/`) MUST carry the standard `// Original — no upstream.` attribution header per Constitution Principle V, plus a citation pointing at ADR-009 in their header comments.
- **FR-028**: The legacy `src/tools/write_note/` source files MUST be deleted. Git history is the canonical archaeology for the predecessor implementation.

#### Observability

- **FR-029**: Whenever the runtime path-safety check (FR-014) rejects an input as `PATH_ESCAPES_VAULT`, the handler MUST emit `logger.warn({event: "pathEscapeAttempt", vault, attemptedPath})` to the project's existing logger surface — providing an operator-side audit trail for attempted bridge attacks. Other failure modes (`FILE_EXISTS`, `FS_WRITE_FAILED`, `VALIDATION_ERROR` for path shape) MUST NOT emit per-call logger events at the tool layer; they propagate through `registerTool`'s existing UpstreamError → tool-error envelope plumbing per the prior typed-tool precedent (011 / 012 / 013 / 014 / 015 — "thin handler; no per-call events"). The cli-adapter's existing `dispatchTimeout` / `dispatchCap` / `dispatchKill` events continue to fire for the new tool's small `eval` calls (vault-registry probe, focused-file probe, `metadataCache` invalidation, optional editor-open) per ADR-007.

### Key Entities *(include if feature involves data)*

- **Vault registry**: an in-memory `Map<vaultName, absolutePath>` populated lazily on the first `write_note` invocation from `obsidian vaults verbose` output and held for the MCP-server-process lifetime once successful. Owned by `src/vault-registry/`.
- **Note**: a file at a given vault-relative path inside a given registered vault, holding caller-supplied textual content. The unit of work the new tool reads, creates, or replaces.
- **Vault root**: the absolute filesystem path under which all of a vault's notes live. Resolved per call from the vault registry. Defines the sandbox boundary that path-safety enforces.
- **Progressive-disclosure help entry**: per-tool documentation reachable via `help({ tool_name: "write_note" })`. Replaces the predecessor's entry; same path on disk (`docs/tools/write_note.md`); fully rewritten content reflecting the new mechanism, the dropped `template`, and the preserved `open`.
- **Upstream defect record**: the BI-038 record in the project's investigation log, plus the upstream forum thread at <https://forum.obsidian.md/t/cli-windows-json-parse-failure-crashes-obsidians-main-process-when-any-single-argv-element-exceeds-4-kb/114119>. Cited from ADR-009 and from the new tool's help.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of `write_note` invocations carrying content of approximately 60 bytes, 5 KB, 12 KB, and 100 KB succeed without producing an Obsidian "A JavaScript error occurred in the main process" dialog. Measured against the predecessor's reliability of 0% above ~95 bytes on Windows.
- **SC-002**: 100% of `write_note` invocations that complete successfully persist the caller-supplied content byte-for-byte, including across edge-character cases (double quotes, square brackets, trailing commas, embedded JSON-like fragments, multi-byte UTF-8, emoji, mixed CRLF/LF).
- **SC-003**: 0% of `write_note` create-without-overwrite invocations against an already-occupied path produce a silent renamed-copy outcome; 100% return a structured `FILE_EXISTS` error and leave the existing note unchanged.
- **SC-004**: 0% of `write_note` invocations return an empty-response failure for any content size up to and including the largest tested size (100 KB).
- **SC-005**: 100% of vault-escape probes (path-traversal `../`, absolute `/abs`, drive-letter `C:`, symlink-to-outside) are rejected with a structured error before any byte is written. Verified via filesystem inspection: no file outside the resolved vault root has been touched in the test run.
- **SC-006**: 100% of `write_note → read_property` and `write_note → read_heading` sequences executed back-to-back against the same path return the post-write content from the read tool, not stale cache. Measured by SC-006-instrumented integration testing during the implementation phase.
- **SC-007**: 100% of `write_note` invocations send zero bytes of user-supplied `content` across the CLI argv pipe. Measurable by argv-length inspection on every CLI spawn the bridge emits during a test run; the only argv crossings are the vault-registry probe, the focused-file probe (active mode only), the post-write `metadataCache` invalidation (template ~120 B), and the optional post-write editor-open (template ~80 B). All measured argv element lengths on the bridge's spawn calls during writes MUST be under 250 bytes.
- **SC-008**: 100% of mid-write-SIGTERM events leave the on-disk file as either entirely the previous version or entirely the new version. Measured by deliberate-SIGTERM during a write, followed by filesystem hash comparison. (Atomicity SC.)
- **SC-009**: The other typed tools' input contracts, output shapes, and error rosters are unchanged by this feature (zero observable changes against the prior shipped surface for `read_note`, `read_property`, `read_heading`, `find_by_property`, `delete_note`, `obsidian_exec`, `help`).
- **SC-010**: The progressive-disclosure help for `write_note` covers all six required dimensions enumerated in FR-022 (verifiable by inspection against a checklist).
- **SC-011**: The new `src/vault-registry/` and `src/path-safety/` modules each ship co-located vitest cases covering their public surface (per project convention); the new `write_note` ships co-located vitest cases at `src/tools/write_note/{schema,handler,index}.test.ts` covering every FR.
- **SC-012**: ADR-009 is created and referenced from the new tool's source-file headers, the new tool's help doc, and the architecture page. The Decision Log index includes the ADR-009 row.

## Assumptions

- **The Obsidian file watcher reliably detects external `fs.rename` events on the vault directory.** This is documented Obsidian behaviour for vaults sync'd via external editors and for the `obsidian-sync` plugin; should not require empirical re-verification.
- **Same-volume `fs.rename` is atomic on Windows via `MoveFileEx` and on POSIX via `renameat`.** Standard Node `fs` documentation. The temp file is created in the target file's parent directory specifically to guarantee same-volume.
- **The `obsidian vaults verbose` subcommand returns a stable tab-separated `<name>\t<path>` format.** Verified live during the design grilling on 2026-05-10. Future Obsidian CLI changes here would surface as a vault-registry test failure rather than a silent runtime regression.
- **The MCP server's lifecycle is short enough that vault-registry staleness is acceptable.** Sessions typically last minutes to hours; vault add/remove during a session is rare; restart cost is negligible. This trade-off is documented in the new tool's help and in ADR-009's Consequences section.
- **The `template` parameter's removal is a tolerable migration cost.** Most callers don't use `template`; those who do can migrate to `obsidian_exec { argv: ["create", "template=Daily", ...] }` with one source change. Documented in the new tool's help under the migration callout.
- **The 4 KB per-argv-element ceiling characterised in BI-038 holds across Obsidian versions in the near future.** If a future Obsidian release narrows the ceiling further (e.g. to 1 KB), the new design's small-argv `eval` calls (all ≤ 250 bytes) remain bug-safe with margin to spare. If a future release widens or fixes the ceiling, the new design continues to work — it doesn't depend on the bug existing.
- **No artificial bound on write latency or content size at the bridge layer.** Per Clarification Q4 — the new tool deliberately has no schema-level content cap and no Promise.race latency timeout. Pathological cases (very large content on slow storage) surface as `FS_WRITE_FAILED` from the OS or as agent-side MCP timeout. The bridge does not pre-empt either failure mode.
- **Filing the upstream Obsidian issue, patching the upstream Obsidian Integrated CLI binary, and any other work targeting the upstream defect's root cause are tracked separately** on the BI-038 investigation plan and on the upstream forum thread. They are not in scope for this BI; the new design ships independent of any upstream timeline.

## Migration Notes

The new `write_note` is a drop-in replacement for the predecessor for almost all callers. Two deliberate breaking changes:

1. **`template` parameter removed.** Callers must migrate to `obsidian_exec` for template-based creation:
   - Before: `write_note { target_mode: "specific", vault: "V", path: "Daily/2026-05-10.md", template: "Daily", content: "..." }`
   - After:  `obsidian_exec { argv: ["vault=V", "create", "path=Daily/2026-05-10.md", "template=Daily", "content=..."] }` (the `content=` argv stays under the IPC ceiling for typical template-augmented content; for purely template-based creates, omit `content=` entirely)
2. **Collision behaviour is now `FILE_EXISTS`, not silent rename.** Callers relying on the predecessor's silent-rename-on-collision behaviour must either (a) explicitly pass `overwrite: true` if they want the new content to land, or (b) handle `FILE_EXISTS` and pick a different path themselves. The silent-rename behaviour is gone — this is intentional and documented as a fix, not a regression.

The `open` parameter is preserved with identical observable semantics.

The `vault` parameter now means what it says — `vault=Foo` writes to `Foo`, regardless of which vault Obsidian currently has focused. The predecessor's R11 inherited limitation (vault parameter functionally ignored when targeting Obsidian over IPC) does not apply to the new tool.
