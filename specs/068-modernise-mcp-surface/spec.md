# Feature Specification: Modernise MCP Surface

**Feature Branch**: `068-modernise-mcp-surface`
**Created**: 2026-10-28
**Status**: Draft
**Input**: User description: "Modernise MCP surface — bring the Obsidian CLI MCP server up to date with how current MCP clients and models work: serve the current and the previous MCP protocol revision, tell clients truthfully which tools only read, give the model enough guidance to call each tool correctly first time, return results in a declared shape, let the vault owner restrict what the server can do, block arbitrary code execution by default, stop leaving Obsidian's view of a note stale after a write, and refuse writes that would escape the vault."

## Overview

MCP clients have moved two protocol revisions ahead of this server and now act on tool
information the server does not publish. Because nothing is declared, every tool looks
destructive: reads cannot run in parallel, users face extra permission prompts, and the
model starts each session with nothing but bare tool names and parameter types. At the
same time three defects put users at risk today:

- one general-purpose tool lets anything that reaches the model (including an instruction
  planted in a note) run arbitrary code inside the user's Obsidian;
- a write can silently leave Obsidian's metadata for a note out of date, so the agent's
  next search misses what it just wrote;
- a write into a not-yet-existing folder under a linked folder can land outside the vault.

This feature is the whole 0.9.0 release. It is delivered as a sequence of independently
mergeable pull requests (see Assumptions → Delivery slicing); each user story below is
independently testable and maps to exactly one of those pull requests.

## Clarifications

### Session 2026-10-28

- Q: How are parameter-combination rules made visible to clients (owner decision C1)? → A:
  State them in the descriptions of the targeting-mode, vault and two note-locator
  parameters. The published input definition stays flat in 0.9.0. A structural union keyed
  on the targeting mode is deferred (Out of Scope), and the probe-client rejection test is
  dropped from acceptance. The flat schema with call-time refinement from ADR-003 stays, so
  ADR-003 needs no amendment. Ruling recorded on the BI-0165 note.
- Q: What happens when the client cannot ask the human to confirm an irreversible action
  (owner decision B3)? → A: Refuse before anything changes or spawns, using an existing
  top-level code plus a new sub-code (for example `VALIDATION_ERROR` /
  `CONFIRMATION_UNAVAILABLE`). The message says how to proceed out of band (delete to the
  trash, or replace one note at a time). No per-call human-interaction marker is added.
  An acceptance test covers the refusal. ADR-015 and Principle IV hold, with zero new
  top-level codes. Ruling recorded on the BI-0165 note.
- Q: What happens when a multi-note find-and-replace commit is cancelled while it is
  already writing notes? → A: Stop between notes. Notes already written stay written. The
  note in flight finishes its atomic write. No further notes are touched and nothing is
  rolled back. The committed and skipped note locators are logged to the diagnostic log
  (stderr). This entry is the Principle IV authorisation for that partial outcome: a
  cancelled request has no response payload to carry it, so the diagnostic log is the only
  channel.
- Q: Does the orientation text adapt when read-only mode, the allow list or the deny list
  hides tools? → A: Yes. It is built once at boot from the registered tool set. The first
  512 characters are fixed and name no tool that can be hidden. Any routing-guide line or
  cross-cutting rule that names a hidden tool is left out. The length and 512-character
  tests are pinned against the full, unfiltered text. One added test shows that in
  read-only mode the text names no write tool.
- Q: How wide is the passthrough tool's default block? → A: The denylist exactly as
  briefed: `eval`, `dev:*`, `devtools`, plugin install/enable/disable, and `restart`. It
  matches on the passthrough tool's command-name field only, inside that tool's handler.
  Command-palette execution (`command`) and `plugin:reload` stay allowed. The indirect
  code-execution path through palette commands is recorded as an accepted residual risk.
  Owner ruling 2026-10-28, recorded on the BI-0165 note.
- Q (plan phase): What is the vault-listing tool called, given that ADR-010 rule 1 names a
  tool wrapping a single-word CLI subcommand after that subcommand? → A: `vaults`, after
  `obsidian vaults`. The brief's `list_vaults` is dropped everywhere: the stub doc is
  renamed to `docs/tools/vaults.md`, and the help index, the help example, the README and
  the orientation text all use `vaults`. Owner ruling 2026-10-28, recorded on the BI-0165
  note.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A written property is visible to the next search (Priority: P1)

As an AI agent, I want a property I just wrote to be visible to my next search, so that
follow-up steps act on current data.

**Why this priority**: This is a live correctness defect. An agent that writes metadata and
then searches for it gets stale results and silently acts on wrong data; nothing in the
current test suite catches it.

**Independent Test**: In the authorised test vault, write a new frontmatter property to a
note and, in the very next call, search the vault by that property; the note is returned.
Repeat for an append, a heading edit and a committed find-and-replace.

**Acceptance Scenarios**:

1. **Given** a note in a test vault, **When** an agent writes a new frontmatter property and
   immediately searches the vault by that property, **Then** the search returns the note.
2. **Given** several open vaults, **When** an agent writes to a vault that is not the focused
   one, **Then** that vault's metadata is refreshed, not the focused vault's.
3. **Given** an append, a heading edit, or a committed find-and-replace, **When** the agent
   searches straight afterwards, **Then** the search reflects the change.
4. **Given** a write that asks to open the note afterwards, **When** it completes, **Then**
   the correct note opens in the correct vault.
5. **Given** the metadata refresh fails, **When** the write completes, **Then** the write
   still succeeds and the failure is reported in the server's diagnostic log rather than
   silently dropped.

---

### User Story 2 - Writes cannot escape the vault (Priority: P1)

As a vault owner, I want any write that would land outside my vault through a linked
folder to be refused, so that files elsewhere on my machine stay safe.

**Why this priority**: Security defect of a known, previously exploited bug class. A single
write can create folders and files outside the vault.

**Independent Test**: Create a vault containing a linked folder that points outside the
vault; attempt writes to an existing and a not-yet-existing subfolder under it; both are
refused and nothing appears outside the vault.

**Acceptance Scenarios**:

1. **Given** a linked folder inside the vault that points outside it, **When** a write
   targets a not-yet-existing subfolder under that link, **Then** the write is refused with
   the existing "path escapes vault" error and nothing is created outside the vault.
2. **Given** the same linked folder, **When** a write targets an existing subfolder under it,
   **Then** the write is refused in the same way.
3. **Given** a Windows directory junction, a vault root written in different letter case, or
   a path containing "..", **When** a write would land outside the vault, **Then** it is
   refused.
4. **Given** a sibling folder whose name begins with the vault's name (for example "vault2"
   next to "vault"), **When** a write targets it, **Then** it is refused.
5. **Given** an ordinary write inside the vault, including into new folders, **When** it
   runs, **Then** it succeeds as today.

---

### User Story 3 - Code execution is blocked by default (Priority: P1)

As a vault owner, I want arbitrary code execution through the general-purpose passthrough
tool blocked unless I deliberately allow it, so that a malicious note cannot run code on
my machine.

**Why this priority**: Obsidian is not sandboxed; one call, or one instruction planted in a
note the model reads, can run code with the user's full rights.

**Independent Test**: With default configuration, ask the passthrough tool to run each
blocked command; each is refused with a structured error and nothing runs. Enable the
opt-in setting and repeat; each runs.

**Acceptance Scenarios**:

1. **Given** the default configuration, **When** the passthrough tool is asked to run
   arbitrary code, open developer tools, install/enable/disable plugins, or restart
   Obsidian, **Then** the request is refused with a structured error naming the blocked
   command, and nothing is run.
2. **Given** the vault owner has explicitly allowed these commands, **When** the same request
   is made, **Then** it runs as before.
3. **Given** the default configuration, **When** any dedicated (non-passthrough) tool runs,
   **Then** it works exactly as before.

---

### User Story 4 - Current-generation client connects (Priority: P1)

As a user of a current-generation MCP client, I want the server to connect and list its
tools, so that I can use it without downgrading my client.

**Why this priority**: Without this, current clients cannot use the server at all once they
drop the older handshake; it is also the foundation the later stories build on.

**Independent Test**: Connect a client that uses the current protocol revision's discovery
handshake; it lists every tool, then reads and writes a note in the test vault.

**Acceptance Scenarios**:

1. **Given** a client using the current protocol revision, **When** it discovers the server,
   **Then** it receives the full tool list and can call tools.
2. **Given** such a client, **When** it reads and writes a note in a test vault, **Then** both
   calls succeed.

---

### User Story 5 - Older client keeps working (Priority: P1)

As a user of an older MCP client, I want the server to keep working after the upgrade, so
that my existing setup does not break.

**Why this priority**: Most installed clients still use the previous revision; breaking them
would be a regression for every existing user.

**Independent Test**: Connect a client using the previous revision's start-up handshake; it
lists every tool and calls one successfully; a failing call returns the same structured
error as before the upgrade.

**Acceptance Scenarios**:

1. **Given** a client using the previous protocol revision's start-up handshake, **When** it
   connects, **Then** it receives the full tool list and can call tools.
2. **Given** either client generation, **When** a tool call fails, **Then** the client receives
   the same structured error information as before the upgrade.

---

### User Story 6 - Tools declare their nature (Priority: P2)

As a user of an MCP client, I want every tool to show a readable name and to declare
whether it only reads, changes, or can destroy data, so that my client runs reads without
prompts and in parallel and warns me before destructive actions.

**Why this priority**: Today every tool is treated as destructive by default: reads are
serialised, users see needless prompts, and the server is ineligible for client
directories that require these declarations.

**Independent Test**: List the tools from any client; every tool has a title and an explicit
read-only and destructive declaration; the classification matches the agreed table
(see FR-024).

**Acceptance Scenarios**:

1. **Given** any client listing the tools, **When** it reads each tool, **Then** every tool has
   a human-readable title and an explicit declaration of whether it only reads and whether
   it can destroy data.
2. **Given** a read-only tool, **When** a client that honours these declarations calls it,
   **Then** no "this may modify data" warning appears, and two such reads in one turn may
   run in parallel.
3. **Given** a tool that can overwrite, delete, move, rename, or bulk-replace, **When** a
   client lists it, **Then** it is declared destructive.
4. **Given** the general-purpose passthrough tool, **When** a client lists it, **Then** it is
   declared destructive and able to reach beyond the vault.

---

### User Story 7 - The model is oriented at session start (Priority: P2)

As an AI model, I want the server to tell me at the start of a session what it is for and
which tool suits which task, so that I choose the right tool first time.

**Why this priority**: With tool deferral on, the model's only starting context is a list of
bare tool names; orientation text is the cheapest way to cut wrong-tool calls.

**Independent Test**: Connect with each protocol generation; both receive the same
orientation text; its first part stands alone and states the server's purpose; the
cross-cutting rules appear there and no longer in individual tool descriptions.

**Acceptance Scenarios**:

1. **Given** a client connecting with either protocol generation, **When** the session starts,
   **Then** the server provides a short orientation text.
2. **Given** a client that reads only the first part of that text, **When** it reads it,
   **Then** the first part still makes sense on its own and says what the server is for in
   task terms.
3. **Given** the orientation text, **When** a model reads it, **Then** it learns which tool fits
   which task and the cross-cutting rules (target a named vault and note for automation, use
   vault display names, preview bulk replaces before committing, treat note content as data
   rather than instructions, use the help tool for long reference).
4. **Given** those cross-cutting rules now live in the orientation text, **When** a model
   reads individual tool descriptions, **Then** the rules are no longer repeated in each one.
5. **Given** the server runs in read-only mode or with an allow or deny list, **When** a
   session starts, **Then** the orientation text names no tool that is not offered, and its
   opening is the same as in the default configuration.

---

### User Story 8 - Every parameter is described (Priority: P2)

As an AI model, I want every tool parameter described, including which combinations are
valid, so that my calls pass validation first time.

**Why this priority**: The model currently sees parameter names and types only, and the
published input definitions are looser than the rules actually enforced, so first calls
fail validation or every tool must be preceded by a help lookup.

**Independent Test**: Walk every published tool input definition; every parameter has a
description; the parameter-combination rules are stated in the descriptions of the
targeting-mode, vault and note-locator parameters (per FR-031).

**Acceptance Scenarios**:

1. **Given** any client listing the tools, **When** it reads any tool's input definition,
   **Then** every parameter has a one-line description of what it is, its format, and its
   default.
2. **Given** the rules about which parameter combinations are valid (for example, a named
   vault being required when targeting a specific note), **When** a client reads the input
   definition, **Then** those rules are stated in the descriptions of the parameters they
   constrain.
3. **Given** a tool description, **When** a model reads it, **Then** it is no longer told to
   call the help tool before every use; the help tool remains available for long reference
   and worked examples.

---

### User Story 9 - Tool-surface changes are deliberate (Priority: P2)

As a maintainer, I want any change to the published tool definitions to fail the build
until it is reviewed, so that the tool surface only changes on purpose.

**Why this priority**: This release changes the published surface several times; each change
must be an explicit, reviewed act rather than drift. The existing mechanism that kept the
surface frozen also forced published definitions into a retired format and must be
replaced without losing the gate.

**Independent Test**: Change one tool's published definition without updating the reviewed
record; the build fails. Update the record in the same change; the build passes.

**Acceptance Scenarios**:

1. **Given** the published tool definitions, **When** anyone changes them without updating the
   reviewed record, **Then** the build fails.
2. **Given** the change is reviewed and the record updated in the same change, **When** the
   build runs, **Then** it passes.

---

### User Story 10 - Windows checked on every change (Priority: P2)

As a Windows user, I want Windows-specific behaviour checked on every change, so that
releases do not regress on my platform.

**Why this priority**: The server has Windows-only behaviour (launcher shim, auto-launch,
path case and junction handling, line endings) that today is only verified by hand; the
protocol migration needs this safety net.

**Independent Test**: Open any change; automated checks run on Windows and Linux; a
deliberately failing Windows-only check blocks the change.

**Acceptance Scenarios**:

1. **Given** any proposed change, **When** the automated checks run, **Then** they run on
   Windows as well as Linux, and a Windows failure blocks the change.

---

### User Story 11 - List vaults and pick up new ones (Priority: P3)

As an AI agent, I want to list the vaults I can use, and to use a vault opened after the
server started, so that I can target the right vault without restarting anything.

**Why this priority**: The orientation text tells the model to use vault display names; it
needs a way to learn them. Requiring a restart for a newly opened vault is a usability
cliff.

**Independent Test**: List vaults and compare against Obsidian's known vaults; open a new
vault after server start and target it by name without a restart.

**Acceptance Scenarios**:

1. **Given** vaults known to Obsidian, **When** an agent lists vaults, **Then** it receives each
   vault's display name and location, and whether it is open where that can be determined
   cheaply (otherwise reported as unknown rather than guessed).
2. **Given** a vault opened after the server started, **When** an agent targets it by name,
   **Then** the call succeeds without restarting the server.
3. **Given** a vault name that still does not exist after re-checking, **When** an agent
   targets it, **Then** the agent receives the existing "unknown vault" error.

---

### User Story 12 - Typed results (Priority: P3)

As an AI agent, I want structured results to come in a declared shape, so that I can rely
on their fields without parsing prose.

**Why this priority**: Improves reliability of downstream steps; the server already knows
each result's shape internally but does not publish it.

**Independent Test**: For every tool that declares a result shape, a sample success result
validates against it and the text copy parses to the same data; failures and plain-text
tools return text only.

**Acceptance Scenarios**:

1. **Given** a tool whose result is structured data, **When** a client lists the tools,
   **Then** the tool declares the shape of its result.
2. **Given** such a tool succeeds, **When** it returns, **Then** the result matches its declared
   shape and the same data is also present as text.
3. **Given** such a tool fails, **When** it returns, **Then** the error is delivered as text in
   the existing structured error form.
4. **Given** a tool whose result is plain note text or help text, **When** it returns, **Then**
   it returns text only, as today.

---

### User Story 13 - Read-only and restricted modes (Priority: P3)

As a vault owner, I want to run the server read-only, or limit it to the tools I name, so
that I can give an assistant only the access I am comfortable with.

**Why this priority**: Least-privilege control that peer servers ship; depends on the tool
declarations from User Story 6.

**Independent Test**: Start the server read-only, then with an allow list, then with a deny
list (alone and combined); the offered tool list matches each configuration; an unknown
configured name stops start-up with one message naming every unknown name.

**Acceptance Scenarios**:

1. **Given** the server is configured read-only, **When** a client lists tools, **Then** only
   tools that only read are offered.
2. **Given** the server is configured with a list of allowed tools, **When** a client lists
   tools, **Then** only those tools are offered.
3. **Given** the server is configured with a list of disabled tools, alone or together with
   an allow list, **When** a client lists tools, **Then** the disabled tools are not offered.
4. **Given** a configured tool name that does not exist, **When** the server starts, **Then** it
   refuses to start and names every unknown tool in one message.

---

### User Story 14 - Confirmation before irreversible actions (Priority: P3)

As a vault owner, I want to be asked to confirm before a permanent delete or a vault-wide
replace is carried out, so that irreversible changes never happen without me.

**Why this priority**: Closes the last path by which a model alone can cause unrecoverable
data loss; normal (trash) deletes are unaffected.

**Independent Test**: Request a permanent delete and a vault-wide replace commit from a
client that can ask the human; confirm, decline and cancel each; only the confirmed run
changes anything. Repeat from a client that cannot ask the human.

**Acceptance Scenarios**:

1. **Given** a permanent delete, or a find-and-replace commit not limited to a single note,
   **When** it is requested, **Then** the human is asked to confirm before anything changes.
2. **Given** the human confirms, **When** the request proceeds, **Then** the action happens as
   before.
3. **Given** the human declines or cancels, **When** the request ends, **Then** nothing changes
   and the agent receives a structured error saying confirmation was declined.
4. **Given** a client that cannot ask the human, **When** such an action is requested, **Then**
   the action is refused before anything changes, with a structured error saying
   confirmation is unavailable and how to proceed without it (delete to the trash, or
   replace one note at a time).
5. **Given** a normal delete (to the trash), **When** it is requested, **Then** it proceeds
   without confirmation, as today.

---

### User Story 15 - Cancel a slow call (Priority: P3)

As a user, I want to cancel a slow call, so that the server is free for my next request.

**Why this priority**: A cancelled call today keeps occupying the one-at-a-time queue, so
every following request waits for work nobody wants.

**Independent Test**: Queue two calls behind a slow one and cancel the first queued call; it
never starts and the next proceeds. Cancel a running call; its work stops and the next
proceeds.

**Acceptance Scenarios**:

1. **Given** a call waiting behind another call, **When** the client cancels it, **Then** it
   never starts and the next waiting call proceeds.
2. **Given** a call already running, **When** the client cancels it, **Then** its work is
   stopped, the call ends, and the next waiting call proceeds.
3. **Given** calls are processed one at a time today, **When** this feature ships, **Then** they
   are still processed one at a time.

---

### User Story 16 - Progress during long waits (Priority: P3)

As a user, I want progress updates during long waits, so that I know a slow call is still
alive.

**Why this priority**: Waiting up to 30 seconds for Obsidian to start, or for a long bulk
replace, with no signal looks like a hang.

**Independent Test**: With a client that asks for progress, trigger an auto-launch wait and a
multi-note replace commit; progress updates arrive. With a client that does not ask,
none arrive.

**Acceptance Scenarios**:

1. **Given** a client that asks for progress, **When** the server is waiting for Obsidian to
   start, **Then** the client receives progress updates until Obsidian is ready or the wait
   times out.
2. **Given** a client that asks for progress, **When** a find-and-replace commit runs across
   many notes, **Then** the client receives progress as each note is processed.
3. **Given** a client that does not ask for progress, **When** any call runs, **Then** no
   progress updates are sent.

---

### Edge Cases

- A write targets a vault whose metadata refresh cannot run (Obsidian closed, refresh times
  out): the write still succeeds; the refresh failure is logged, not returned as a tool
  error.
- A path that is inside the vault lexically but whose nearest existing ancestor resolves
  outside it: refused, even though no segment named in the request is itself a link.
- A path several levels deep in not-yet-existing folders under a link: the check walks up
  to the nearest existing ancestor, however far up that is.
- The vault root itself is reached through a link (the configured vault path is a link):
  writes inside the resolved vault are still allowed.
- A blocked passthrough command written in different letter case or with leading/trailing
  whitespace: still refused.
- A find-and-replace commit scoped to a subfolder is not limited to a single note, so it
  asks for confirmation like a vault-wide commit (FR-047).
- A passthrough command that merely contains a blocked word inside an argument value (for
  example a search for the text "eval"): not refused.
- The allow list and deny list both name the same tool: the deny list wins and the tool is
  not offered.
- Read-only mode combined with an allow list that names a write tool: the write tool is not
  offered (read-only applies on top).
- Every tool is filtered out by the configuration: the server still starts and offers no
  tools [assumption: an empty surface is a valid owner choice, not a start-up error].
- A cancellation arrives after the call has already finished: ignored, no error.
- A cancellation arrives for a running find-and-replace commit that has already written
  some notes: the note in flight finishes its atomic write, notes already written stay
  written, no further notes are touched, nothing is rolled back, and the committed and
  skipped note locators are written to the diagnostic log (see FR-052a).
- Progress is requested but the operation completes immediately: zero or one progress
  update is acceptable.
- The vault list is requested while Obsidian is not running: the server follows the same
  auto-launch behaviour as other tools; if Obsidian still cannot be reached, a structured
  error is returned rather than an empty list.
- Two vaults share the same display name: listing returns both entries with their distinct
  locations; targeting by that name behaves as it does today.
- A client that supports only the older protocol generation calls a tool that asks the
  human to confirm: the confirmation still reaches the human through that generation's
  mechanism where the client supports it.

## Requirements *(mandatory)*

### Functional Requirements

**Metadata freshness after writes (User Story 1)**

- **FR-001**: After any write to a note made directly to disk (full write, append, heading
  edit, block edit, and each note changed by a committed find-and-replace), the system
  MUST ask Obsidian to refresh the metadata for that note in
  the vault that was written, identifying the note by its vault-relative location.
- **FR-002**: The metadata refresh MUST target the vault that was written, never the focused
  vault by default.
- **FR-003**: A write that asks to open the note afterwards MUST open the note that was
  written, in the vault that was written.
- **FR-004**: A metadata-refresh failure MUST NOT fail the write; it MUST be recorded in the
  server's diagnostic log with enough detail (vault, note, reason) to diagnose it.
- **FR-005**: The defect MUST first be demonstrated by a live probe against the authorised
  test vault before the fix. That demonstration is code-level: the refresh lookup Obsidian
  runs today resolves to nothing, so the refresh does nothing. It is recorded in
  `evidence-a1.md` (owner ruling 2026-10-28). Obsidian's file watcher can hide the stale
  search, so a stale search result is not required as evidence. After the fix, the live
  probe MUST show two things for full write, append, heading edit and committed
  find-and-replace: the refresh resolves the written note, and the next search sees the
  change. Where a second vault is registered, the probe MUST also show a refresh that
  targets that vault while it is not focused.

**Vault containment (User Story 2)**

- **FR-006**: Every write path MUST be checked against the vault root by resolving its
  nearest existing ancestor to its real on-disk location, re-appending any not-yet-existing
  segments, and confirming the result lies within the real vault root.
- **FR-007**: The containment check MUST treat the vault root as a whole path component, so
  a sibling whose name begins with the vault's name is outside the vault.
- **FR-008**: The containment check MUST handle symbolic links, Windows directory junctions,
  letter-case differences in the vault root on case-insensitive file systems, and ".."
  segments.
- **FR-009**: A write that fails the check MUST be refused with the existing
  "path escapes vault" error, MUST record the existing escape-attempt diagnostic event, and
  MUST NOT create any file or folder anywhere.

**Passthrough command gate (User Story 3)**

- **FR-010**: By default, the general-purpose passthrough tool MUST refuse exactly this
  denylist before any command is executed: `eval` (arbitrary code), every `dev:*` command
  and `devtools` (developer tooling), the plugin install, enable and disable commands, and
  `restart`. The match MUST be on the tool's command-name field only, never on argument
  values, and MUST be made inside the passthrough tool's own handling. Command-palette
  execution (`command`) and `plugin:reload` are NOT blocked (see Assumptions → Accepted
  residual risk).
- **FR-011**: A refusal MUST be a structured error using an existing top-level error code,
  with a machine-readable sub-code identifying the block and the name of the blocked
  command.
- **FR-012**: The vault owner MUST be able to re-enable those commands only through an
  explicit opt-in setting; the README MUST document the setting with a plain warning about
  what it permits.
- **FR-013**: The gate MUST apply only to the passthrough tool; dedicated tools that use
  fixed internal scripts MUST keep working unchanged.

**Protocol generations (User Stories 4, 5)**

- **FR-014**: The server MUST serve clients using the current protocol revision's discovery
  handshake and clients using the previous revision's start-up handshake, over the same
  local process connection.
- **FR-015**: Both generations MUST receive the complete tool list and MUST be able to call
  every tool.
- **FR-016**: The structured error information a client receives for a failed tool call
  (code, message, details) MUST be unchanged for both generations, except that calling a
  tool that does not exist MAY be reported as a protocol-level invalid-request error.
- **FR-017**: The server MUST NOT advertise the protocol capabilities deprecated in the
  current revision (client roots, sampling, protocol-level logging); diagnostics MUST
  continue to go to the server's diagnostic log only.
- **FR-018**: The one-at-a-time processing of Obsidian calls, the Obsidian invocation layer
  and the auto-launch behaviour MUST be unchanged by the protocol migration.

**Tool declarations (User Story 6)**

- **FR-019**: Every published tool MUST carry a human-readable title.
- **FR-020**: Every published tool MUST explicitly declare all four behaviour hints: whether
  it only reads, whether it can destroy data, whether repeating it has no further effect,
  and whether it reaches beyond the vault.
- **FR-021**: Tools that can overwrite, delete, move, rename or bulk-replace MUST be declared
  destructive.
- **FR-022**: The passthrough tool MUST be declared destructive and able to reach beyond the
  vault.
- **FR-023**: An automated test MUST fail if any published tool lacks a title or any of the
  four hints, and a second test MUST pin each tool's classification.
- **FR-024**: Tool classification MUST follow this table; any deviation MUST be justified in
  the pull request that makes it:

  | Tools | Only reads | Destructive | Repeat-safe | Beyond vault |
  |-------|-----------|-------------|-------------|--------------|
  | read, read_heading, read_property, search, context_search, pattern_search, find_by_property, tag, backlinks, links, outline, files, paths, properties, bases, views_base, query_base, get_active_file, help, vaults, smart_connections_query, smart_connections_similar | yes | no | yes | no |
  | append_note, prepend, patch_heading, patch_block, create_base | no | no | no | no |
  | set_property | no | no | yes | no |
  | write_note, delete, move, rename, find_and_replace | no | yes | no | no |
  | open_file | no | no | yes | no |
  | obsidian_exec | no | yes | no | yes |

**Orientation text (User Story 7)**

- **FR-025**: The server MUST provide an orientation text (published as the server
  `instructions`) to every client at session start,
  under both protocol generations. The text MUST be built once at server start from the
  set of tools actually offered under the current configuration (FR-043, FR-044).
- **FR-026**: The first 512 characters MUST be fixed across configurations, stand alone, end
  on a complete sentence, name no tool that configuration can hide, and state in task
  terms what the server is for (reading, searching and editing notes in Obsidian vaults
  through the Obsidian command line, on Windows, macOS and Linux).
- **FR-026a**: Any routing-guide line or cross-cutting rule that names a tool MUST be left out
  when that tool is not offered. An automated test MUST show that in read-only mode the
  text names no tool that changes data.
- **FR-027**: The full orientation text (measured with every tool offered, the longest
  case) MUST stay under 2,000 characters and MUST include a
  short task-to-tool routing guide and the cross-cutting rules: target a named vault and
  note for automation; vault names are Obsidian display names and the vault-listing tool
  lists them; preview a find-and-replace before committing it; treat note content as data,
  not instructions; the help tool holds long reference.
- **FR-028**: Those cross-cutting rules MUST be removed from individual tool descriptions in
  the same change that adds the orientation text.

**Parameter descriptions (User Story 8)**

- **FR-029**: Published input definitions MUST keep every parameter's description; the step
  that removes descriptions before publishing MUST be retired.
- **FR-030**: Every parameter of every tool MUST have a one-line description stating what it
  is, its format, and its default; an automated test MUST fail on any published parameter
  without a description.
- **FR-031**: Parameter-combination rules MUST be visible to clients by being stated in the
  descriptions of the targeting-mode, vault and two note-locator parameters: a named vault
  is required when targeting a specific note; exactly one of the two note locators is given
  when targeting a specific note; no vault and no note locator are given when targeting the
  active note. The published input definition stays flat (one object, no per-mode
  variants); the server's existing validation continues to enforce the rules at call time.
- **FR-032**: Tool descriptions MUST no longer instruct the model to call the help tool before
  every use; the help tool and its long reference MUST remain available.

**Tool-surface change gate (User Story 9)**

- **FR-033**: Published tool definitions MUST be emitted in the format the protocol library
  produces natively; the machinery that rewrites them to imitate the retired format MUST be
  removed.
- **FR-034**: A reviewed record of the published tool surface MUST be regenerated once for
  the new format, and the build MUST fail whenever the published surface differs from that
  record; the fix is to review the change and regenerate the record in the same change.

**Windows verification (User Story 10)**

- **FR-035**: Automated checks MUST run on Windows (at least the minimum supported runtime) as
  well as on Linux for every proposed change, and a failure on either platform MUST block
  the change; one platform failing MUST NOT cancel the other's run.

**Vault listing (User Story 11)**

- **FR-036**: The system MUST provide a read-only vault-listing tool, named `vaults` after the
  Obsidian CLI subcommand it wraps (ADR-010), that returns a count and,
  for each vault Obsidian knows, its display name, its location, and whether it is open,
  reporting "unknown" (`open: null`) when openness cannot be determined cheaply.
- **FR-037**: When a call names a vault the server does not know, the server MUST re-read
  Obsidian's vault list once before failing; if the name is still unknown, it MUST return
  the existing "unknown vault" error, without advising a server restart.
- **FR-038**: The vault-listing tool MUST ship with a full reference document replacing the
  existing placeholder; the README statement that no vault-enumeration tool exists MUST be
  corrected.

**Typed results (User Story 12)**

- **FR-039**: Every tool whose result is a structured object MUST publish the shape of that
  result and, on success, return the result both as structured data matching the shape and
  as identical text. There are no exceptions by protocol generation. A result whose shape
  is a union of object variants (for example `search`, `find_and_replace`) MUST be
  published as an object-root shape wrapping the variants, so that the same shape is valid
  and identical in both generations. A tool that cannot carry an identical shape in both
  generations is raised to the owner, not exempted silently.
- **FR-040**: Failed calls MUST return the existing structured error as text only.
- **FR-041**: Tools whose result is plain note text or help text MUST return text only and
  publish no result shape.
- **FR-042**: An automated test MUST, for every tool with a published result shape, validate a
  sample success result against the shape and confirm the text block parses to the same
  object.

**Restricted modes (User Story 13)**

- **FR-043**: The vault owner MUST be able to start the server read-only, in which case only
  tools declared as only reading are offered. The setting MUST accept 1, true, yes or on,
  case-insensitive, mirroring `OBSIDIAN_AUTO_LAUNCH`'s off set.
- **FR-044**: The vault owner MUST be able to supply a comma-separated list of allowed tools
  and a comma-separated list of disabled tools; the disabled list is applied after the
  allowed list; read-only mode applies on top of both.
- **FR-045**: If either list names a tool that does not exist, the server MUST refuse to start
  and report every unknown name in a single message.
- **FR-046**: The README MUST document the read-only, allow-list and disable-list settings.

**Confirmation of irreversible actions (User Story 14)**

- **FR-047**: A permanent delete, and a find-and-replace commit not limited to a single note,
  MUST ask the human to confirm before any change is made, under both protocol generations
  where the client supports asking.
- **FR-048**: A declined or cancelled confirmation MUST change nothing and MUST return a
  structured error using an existing top-level code with a machine-readable sub-code
  identifying the declined confirmation.
- **FR-049**: When the client cannot ask the human, the server MUST refuse the action before
  any change is made and before any Obsidian process is started. The refusal MUST be a
  structured error using an existing top-level code with a machine-readable sub-code
  identifying that confirmation is unavailable, and its message MUST say how to achieve the
  goal without confirmation (for example, delete to the trash instead, or replace one note
  at a time). The tools MUST NOT be marked as requiring per-call human interaction for the
  client to enforce.
- **FR-049a**: An automated test MUST show that, for both irreversible actions, a client
  without the ability to ask the human receives the refusal, no file changes, and no
  Obsidian process is started.
- **FR-050**: A normal delete (to the trash) MUST proceed without confirmation, as today.

**Cancellation and progress (User Stories 15, 16)**

- **FR-051**: A cancelled call that has not started MUST be removed from the waiting queue and
  never started.
- **FR-052**: A cancelled call that is running MUST have its Obsidian process stopped (graceful
  stop first, forced stop after the existing grace period), MUST end, and MUST NOT block the
  next waiting call.
- **FR-052a**: Cancelling a running multi-note find-and-replace commit MUST stop it between
  notes: the note being written MUST complete its atomic write, notes already written MUST
  stay written, no further note MUST be touched, and nothing MUST be rolled back. The
  server MUST record the committed and the skipped note locators in its diagnostic log. An
  automated test MUST show that a cancel after the first of several note writes leaves the
  first note changed, the rest unchanged, and both lists in the log.
- **FR-053**: Calls MUST continue to be processed one at a time.
- **FR-054**: When the client asks for progress, the server MUST send progress updates during
  the wait for Obsidian to start and once per note during a find-and-replace commit; when
  the client does not ask, it MUST send none.
- **FR-055**: Timeout handling that duplicates limits already enforced at the input boundary
  MUST be removed or justified.

**Cross-cutting**

- **FR-056**: All new or changed failure paths MUST reuse existing top-level error codes and
  distinguish new cases by sub-code only; the release MUST introduce zero new top-level
  error codes.
- **FR-057**: The only addition to the tool list MUST be the vault-listing tool; no tool is
  renamed, merged or removed.
- **FR-058**: The project's living documentation, the README and the per-tool reference
  documents MUST describe the system as built at the end of each pull request, including
  every new setting and the vault-listing tool.
- **FR-059**: The decisions this release overturns MUST be recorded: a decision record
  superseding the modern-only protocol-era decision (ADR-036), a decision record superseding
  the low-level server registration decision (may be combined with the former), and a
  decision record superseding the description-stripping decision (ADR-005).

### Key Entities

- **Published tool definition**: What a client sees of one tool — name, title, description,
  behaviour hints, input definition (parameters with descriptions and combination rules)
  and, where applicable, result shape.
- **Orientation text**: Server-level guidance sent at session start — standalone opening,
  routing guide, cross-cutting rules.
- **Tool-surface record**: The reviewed snapshot of all published tool definitions that the
  build compares against.
- **Vault entry**: One vault Obsidian knows — display name, location, open state (yes / no /
  unknown).
- **Vault registry**: The server's cached name-to-location map; refreshed once on an unknown
  name.
- **Server access configuration**: Read-only flag, allowed-tools list, disabled-tools list,
  passthrough code-execution opt-in.
- **Blocked command set**: The fixed denylist of passthrough command names refused by default
  (FR-010).
- **Confirmation request**: A question put to the human before an irreversible action, with
  outcomes confirm / decline / cancel.
- **Queued call**: One pending or running Obsidian invocation, cancellable, optionally carrying
  a progress token.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Before the fix, the live probe records that the refresh lookup resolves to nothing
  (`evidence-a1.md`). After the fix, for each of the four write paths, the refresh resolves
  the written note in the written vault, and a property search issued as the very next call
  finds the change, 4 out of 4 times.
- **SC-002**: 100% of the containment test cases (link to existing folder, link to new folder,
  junction, mixed-case root, "..", prefix-named sibling) are refused, and 0 files or folders
  are created outside the vault during the test run; 100% of ordinary in-vault writes still
  succeed.
- **SC-003**: With default settings, 100% of blocked passthrough command categories are refused
  and no Obsidian process is started for any of them; 100% of dedicated tools' existing
  tests still pass.
- **SC-004**: A client of each protocol generation lists all tools (34 today plus the new
  vault-listing tool) and completes a read and a write against the test vault.
- **SC-005**: 100% of published tools carry a title and all four behaviour hints, and 100% of
  published parameters carry a description.
- **SC-006**: Every read tool (the FR-024 read-only row) publishes `readOnlyHint: true` and
  `destructiveHint: false`, pinned by the classification test (FR-023). Release evidence: a
  manual Claude Code check shows read-only tools running with no "may modify data" warning
  and two reads in one turn running in parallel.
- **SC-007**: The unfiltered orientation text is under 2,000 characters, its first 512
  characters end on a complete sentence, and in read-only mode it names 0 tools that change
  data.
- **SC-008**: An unreviewed change to any published tool definition fails the build every time.
- **SC-009**: Automated checks pass on both Windows and Linux on every supported runtime
  version listed for each platform.
- **SC-010**: With read-only mode on, 0 tools that change data are offered.
- **SC-011**: For both irreversible actions, declined and cancelled confirmations, and
  requests from clients that cannot ask the human, change 0 files and (for the latter)
  start 0 Obsidian processes.
- **SC-012**: A cancelled queued call starts 0 Obsidian processes; a cancelled running call
  releases the queue so the next call starts without waiting for the cancelled work.
- **SC-013**: A vault opened after server start is usable by name with 0 restarts.
- **SC-014**: Zero new top-level error codes are introduced across the release.

## Assumptions

- **Delivery slicing**: The release is delivered as six pull requests, each following the
  project's PR lifecycle (implement → commit → open PR → code review and fixes → docs pass →
  merge): (1) User Stories 1, 2, 10; (2) User Story 3; (3) User Stories 4, 5, 9;
  (4) User Stories 6, 7, 8; (5) User Stories 11, 12; (6) User Stories 13, 14, 15, 16. The
  protocol migration in PR 3 underpins PRs 4–6.
- **Release label**: The release is 0.9.0 (owner decision 2026-10-28). The constitution's
  v1.6.0 text refers to the same work as "0.8.20"; the two labels denote the same scope.
  The version bump to 0.9.0 is the last step of the release.
- **Governance already ratified**: The constitution amendment that permits the protocol
  library migration, the tool-surface standards and the security defaults is already in
  place (v1.6.0); this feature brings the code into line with it and does not reopen it.
- **Dual protocol era**: Serving both protocol generations is an owner decision
  (2026-10-28) that overturns ADR-036; it is not reopened here.
- **Live probes** run only against the authorised test vault and follow the project's
  test-execution instructions.
- **Opt-in setting values** for the new on/off settings follow the existing convention for the
  auto-launch setting (1 / true / yes / on, case-insensitive).
- **Error contract**: Existing top-level error codes, messages and details remain stable;
  new cases are distinguished only by sub-code.
- **Typed tools' internal scripts** that run through the dedicated tools are not affected by
  the passthrough gate because they never pass caller-supplied code.
- **Platforms**: Windows, macOS and Linux remain supported; automated checks cover Windows and
  Linux only.
- **Accepted residual risk (passthrough gate)**: With default settings the passthrough tool
  can still run any command-palette command (`command id=…`) and `plugin:reload`. A palette
  command registered by a plugin that executes user scripts (for example Templater user
  scripts) is therefore an indirect code-execution path that this release does not close.
  The owner accepted this risk on 2026-10-28 (BI-0165 C2 list stands unchanged).

## Out of Scope

- Rewriting every tool description to a strict size budget (descriptions may shrink as a
  side effect of the orientation text and parameter descriptions).
- Limiting output size or adding paging to note reads and searches.
- Changing how the remaining argument-passed write tools send their content.
- Merging, renaming, or consolidating tools; the tool list stays as it is apart from the new
  vault-listing tool.
- Release automation, package metadata, and the changelog.
- Listing the server in public registries, or packaging it as a client plugin.
- New tools for daily notes, tasks, templates, or history.
- Removing internal process identifiers from help documents, except where descriptions are
  rewritten anyway.
- Guidance on prompt injection beyond the single line in the orientation text.
- Trace propagation, result-type markers, caching hints, and server identity in per-result
  metadata (tracked separately).
- A typed code-evaluation tool (deliberately deferred because of the passthrough gate).
- Enforcing parameter-combination rules structurally in the published input definition (a
  union keyed on the targeting mode); deferred to a later release (owner decision C1,
  2026-10-28). The flat definition with rules stated in descriptions ships in 0.9.0.
- Marking irreversible tools as requiring per-call human interaction for the client to
  enforce (owner decision B3, 2026-10-28).
