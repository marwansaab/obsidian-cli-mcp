# T0 Probe Plan: Fix Empty Bases

**Feature**: 065-fix-empty-bases | **Date**: 2026-06-30 | **Phase**: implement-time (T0, before finalising the handler change)

A small, focused live-CLI probe that **confirms** the empty-vault emission channel the defect already implies. It is a verification gate, not a design fork — the positive-`.base`-filter mechanism is chosen regardless of casing/whitespace details; the probe only validates the one assumption the fix rests on (empty = clean-exit stdout line).

## Protocol (per `.memory/test-execution-instructions.md`)

Read `.memory/test-execution-instructions.md` **before** running any probe. It names the authorised TestVault, the scratch subdirectory, the destructive-probe protocol, and cleanup expectations.

- **CLI binary**: drive `Obsidian.com` (the production-resolved console shim), **never** the GUI `Obsidian.exe` (detached stdio → false-clean empty-exit-0). Per the recorded memory on CLI probes.
- **Vault**: the authorised TestVault; do all work inside the sanctioned scratch subdirectory.
- **Capture for every probe**: exit code, full stdout, full stderr (kept separate).
- **Cleanup**: remove any scratch `.base` files / scratch subfolders created, per the cleanup expectations. Creating Smart Connections index is exempt (baseline) — irrelevant here anyway.

## P1 — Empty-vault emission channel (the forcing gate)

**Setup**: a vault (or sanctioned scratch subfolder treated as the active context) containing **zero** `.base` files.

**Action**: invoke the native `bases` subcommand in active mode (the same invocation `executeBases` issues: `command: "bases"`, no parameters/flags, `target_mode: "active"`).

**Capture**: exit code, stdout, stderr.

**Expected (the defect-implied outcome)**:
- exit code `0`;
- stdout contains the informational line (current wording "No base files found in vault"), terminated by a newline;
- stdout contains **no** line ending in `.base`;
- stderr empty (or non-fatal).

**Pass criterion**: the positive `.base` filter applied to this stdout yields `[]` → `{ bases: [], count: 0 }`. Record the exact informational wording in the probe evidence (for documentation only — the filter does not depend on it).

**Decision tree**:
- **Confirmed (expected)** → ship the plan of record (filter clean-exit stdout positively).
- **Surprise: message on stderr and/or non-zero exit** → this contradicts the bug report (the current handler could not produce count=1 on a thrown call). STOP and re-verify the reproduction with the user before coding — do not silently adapt. (Not expected; defined so the response is deliberate.)

## P2 — Populated-vault baseline + extension casing (regression anchor)

**Setup**: a vault/scratch context containing a known set of `.base` files, including at least one name with internal spaces/punctuation (e.g. `Backlog (Base).base`) to confirm the path is emitted verbatim.

**Action**: same `bases` invocation as P1.

**Capture**: exit code, stdout, stderr.

**Expected**:
- exit code `0`;
- one `.base` path per stdout line, no informational text intermixed;
- on-disk extension casing recorded (expected lowercase `.base`).

**Use**: confirms G3 (populated path) and D5 (the case-insensitive predicate is correct against the real-world casing). The captured multi-base stdout becomes the fixture for the populated regression unit test.

## Out of scope for this probe

- `vault=` routing behaviour (inherited limitation; FR-007 keeps it untouched).
- Recovery / cold-start paths (inherited via `dispatchCli`; unchanged).
- Any `.base` content parsing — the probe reads only the path strings the CLI emits.

## Evidence

Record P1/P2 captures (exit/stdout/stderr, the empty-message exact wording, the on-disk casing) in the implement-phase notes for this BI. The unit suite mocks `invokeCli` with the P1/P2-confirmed stdout shapes; no live CLI runs in the merge-gating `vitest run`.
