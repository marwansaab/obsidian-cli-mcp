# ADR-069 — A disabled Obsidian command line fails in dispatch, on the exact notice, as `cli-disabled`

- **Status:** Accepted
- **Date:** 2026-11-04
- **Source:** PR #137 (BI-0132, `.specify/bugs/bi-0132/assessment.md`
  Proposed Remediation and Open Questions "Match rule", "Discriminator
  shape" and "Live confirmation"; `fix.md`; `test.md`), commit `84f70e9`
- **Related:** ADR-007 (Centralized CLI Bounds with Selective Override), under
  which dispatch owns classification; ADR-015 (Sub-Discriminators via
  details.reason for Multi-State Error Codes); ADR-029 (Retry Once on
  Cold-Start Vault-Launch Failure), whose predicate is unchanged;
  [ADR-061](ADR-061-obsidian-exec-fails-an-unknown-vault-only-on-the-exact-answer.md),
  the exact-answer precedent and the place this decision departs from it;
  [ADR-045](ADR-045-closed-vaults-recovered-only-by-the-dispatch-retry.md),
  whose context gave a disabled command line as an example of the wrong
  failure

## Context

With Obsidian's **Settings > General > Advanced > Command line interface**
setting off, the CLI answers every command with exit 0 and one line on
stdout: `Command line interface is not enabled. Please turn it on in Settings
> General > Advanced.` (TC-00495, one probe on 2026-05-30). The line has no
`Error:` prefix, so `dispatchOnce` resolved it as a success, and each layer
above read it as its own normal output: raw text from `obsidian_exec`, note
content from `read`, an empty list from the vault-registry probe, and an
opaque `json-parse` failure from the eval-backed tools. The closed-vault
guidance meanwhile named a disabled command line as a cause of the
`Error: Command "<cmd>" not found.` failure, which the probe contradicts.

## Decision

1. **One rule in `dispatchOnce`, not one per facade.** The rule runs right
   after priority (a), before the eval-answer check and priorities (b) and
   (c), so both facades, every typed tool, `invokeEval` and the registry
   probe inherit it. The notice is exported as `CLI_DISABLED_ANSWER` beside
   `UNKNOWN_VAULT_ANSWER` in `src/cli-adapter/_dispatch.ts`.
2. **Exact match on the whole trimmed stdout** (assessment "Match rule",
   option A). `trim()` absorbs a trailing LF or CRLF. Output that contains
   the words among other text, a line quoting the notice, or text before it
   still succeeds.
3. **A flat `details.reason: "cli-disabled"` under `CLI_REPORTED_ERROR`**
   (assessment "Discriminator shape", option A), following the dispatch-level
   `obsidian-not-running` on `CLI_NON_ZERO_EXIT`. `details` is
   `exitZeroDetails(…)` plus the reason, so Obsidian's notice stays in
   `details.stdout`; the message asks the user to turn the setting on. No new
   top-level code.
4. **Single-shot.** The notice matches neither `COLD_START_PATTERN` nor the
   app-not-running signature, so neither recovery layer fires. The server
   never changes the setting and never probes it.
5. **No cached failure.** The registry caches only a successful probe, so the
   next call after the user turns the setting back on works without a
   restart.

## Alternatives rejected

- **Facade-level rules**, as ADR-061 placed `Vault not found.`. ADR-061 kept
  that answer out of dispatch because the two facades needed different rules
  and the typed facade's bytes had to stay stable. Neither holds here: one
  rule fits every surface, and there were no existing bytes to keep. Two
  copies would also duplicate a rule the code-quality record says to share
  ("share the literal, never the rule"). ADR-061's other objection, that a
  dispatch rule would sit inside the cold-start retry and the launch
  recovery, does not apply, because this notice matches neither predicate.
- **A prefix match** on the notice's first sentence. It would survive a
  change to the second sentence, but it would fail a note that starts with
  the sentence, the BI-0173 false-positive lesson.
- **`details.code: "CLI_DISABLED"`, or a code and a reason together.** The
  state is detected in dispatch, like `obsidian-not-running`, and the BI
  required no new top-level code; a flat reason was enough.
- **A pre-flight probe of the setting.** Out of scope for BI-0132, and a
  spawn on every call.

## Consequences

- The match depends on wording observed once. If Obsidian rewords or
  localises the notice, the rule silently stops matching and the old success
  returns: no worse than before, but invisible. The fix is to correct the
  constant and its test fixture and keep the exact match. PR #137 carries a
  `partial` verification the owner accepted on 2026-11-04: the live
  OFF-state reproduction, the live capture of the notice and the OFF-to-ON
  recovery check are open, owner-run checks (`test.md`, Residual Risks).
- A note whose entire text is the notice fails as `cli-disabled`. That
  bounded false positive is accepted, as `COLD_START_PATTERN`'s is.
- `obsidian_exec` now fails on one unprefixed CLI message besides
  `Vault not found.`; ADR-061's consequence that other unprefixed messages
  are returned as raw successes otherwise still holds.
- Every surface reports the condition the same way, so README's Errors
  section carries it once, with rows in `docs/tools/obsidian_exec.md` and
  `docs/tools/vaults.md`, the two tools whose symptom was a success or an
  empty list.
- `closedVaultNote` lost its disabled-command-line example, which moved nine
  tools' description fingerprints in `_register-baseline.json` on purpose.
