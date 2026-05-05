<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
[specs/003-cli-adapter/plan.md](specs/003-cli-adapter/plan.md)

Active feature: **003-cli-adapter** (introduce a centralised internal
CLI adapter at `src/cli-adapter/cli-adapter.ts` that all future typed
MCP tool handlers route through — one place to encode the documented
argv conventions, the active-mode target-locator strip, and the
four-priority error classification machine. Adds the new stable code
`ERR_NO_ACTIVE_FILE` for the focused-note-missing failure mode. The
adapter is internal: not registered as an MCP tool. ADR-004 commits the
project to this primitive). See also:
- [spec.md](specs/003-cli-adapter/spec.md) — feature spec + 3 clarifications in 1 session
- [research.md](specs/003-cli-adapter/research.md) — Phase 0 decisions, plan-stage resolutions, ADR conflict notes
- [data-model.md](specs/003-cli-adapter/data-model.md) — `ERR_NO_ACTIVE_FILE` shape, adapter input/deps/success types, surface enumeration (eight codes total)
- [contracts/cli-adapter.contract.md](specs/003-cli-adapter/contracts/cli-adapter.contract.md) — adapter's interface contract (signature, behavioural rules, ten test cases)
- [contracts/errors.contract-patch.md](specs/003-cli-adapter/contracts/errors.contract-patch.md) — diff to apply against specs/001's canonical errors contract (adds ERR_NO_ACTIVE_FILE row)
- [quickstart.md](specs/003-cli-adapter/quickstart.md) — six unit-test verification scenarios + deferred consumer-side smoke

Predecessor features:
- **002-detect-cli-errors**: [spec.md](specs/002-detect-cli-errors/spec.md), [plan.md](specs/002-detect-cli-errors/plan.md) — added `CLI_REPORTED_ERROR` (the in-band `Error:` stdout-prefix detection that 003's adapter reuses for its priority (c) branch).
- **001-add-cli-bridge**: [spec.md](specs/001-add-cli-bridge/spec.md), [plan.md](specs/001-add-cli-bridge/plan.md), [contracts/](specs/001-add-cli-bridge/contracts/) — the original `obsidian_exec` bridge tool. Its `errors.contract.md` is the canonical errors contract (002 and 003 both edit in place per the 002 Q5 precedent).

References:
- [.specify/memory/constitution.md](.specify/memory/constitution.md) — Principles I–V (modular layout, co-located tests, zod validation, structured errors, attribution headers) bind every implementation decision.
- [.decisions/ADR-004 - Centralized Obsidian CLI Adapter.md](.decisions/ADR-004%20-%20Centralized%20Obsidian%20CLI%20Adapter.md) — the design decision this feature implements. Names the code `ERR_NO_ACTIVE_FILE` (the `ERR_*` prefix is deliberate — recoverable user-action signal, distinct from the `CLI_*` failure family).
- [.architecture/Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md) — same naming.
<!-- SPECKIT END -->

## Architecture & Decision References

Two reference folders document the project's design rationale. Consult them **before** proposing or making design decisions, and cite the relevant ADR/architecture section when justifying choices:

- [.architecture/](.architecture/) — high-level architecture notes describing the system's structure, module boundaries, and design principles. Start with [Obsidian CLI MCP - Architecture.md](.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md).
- [.decisions/](.decisions/) — Architecture Decision Records (ADRs). [Decision Log.md](.decisions/Decision%20Log.md) is the index; each ADR-NNN file contains the full decision text.

When a design choice conflicts with an existing ADR, surface the conflict to the user rather than silently overriding it — superseding an ADR is a deliberate act that should produce a new ADR, not an undocumented drift.
