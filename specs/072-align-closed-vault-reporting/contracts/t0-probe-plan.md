# T0 Probe Plan: Closed-Vault Behaviour

**Feature**: [../spec.md](../spec.md) | **Research**: [../research.md](../research.md) F2

Read `.memory/test-execution-instructions.md` before running any probe. It names the authorised test vault, the scratch folder and the cleanup rules. The probes below only read: no note is written, moved or deleted.

## G1 — The retired signal is unreachable (blocks the deletions)

**Goal**: confirm that the server's shim answers a closed registered vault with the "command not found" signature, or with a normal answer after the retry, and never with empty stdout on exit 0.

1. With Obsidian running, close the authorised test vault (keep another vault open so the app stays up).
2. Using the resolved binary the server uses (the `Obsidian.com` shim on Windows), run `obsidian vault=<test vault> eval code="1+1"` and record stdout, stderr and the exit code.
3. Close the vault again. Call each of the six tools through the built server (`npm run build`, then an MCP client or the existing harness) with `vault: <test vault>`. Record the result and whether the server log shows a `dispatch.retry` line.

**Pass**:
- step 2 shows `Error: Command "eval" not found.` (or a normal `=> 2`), not empty stdout;
- every step-3 call returns its normal result.

**Fail**: empty stdout on exit 0 in step 2. Stop. The spec's assumption is wrong: do not delete the stages, record the finding in `research.md` and escalate.

## G2 — Vault unavailable, end to end (evidence only)

**Goal**: see the real vault-unavailable failure.

**Setup**: only if the environment can turn off the CLI integration for one test vault without touching the owner's vaults. Otherwise skip G2 and record "not run live; covered by handler tests D6(b)". Skipping G2 still satisfies SC-002, because SC-002's required evidence is the automated tests.

1. Name that vault in one eval tool and in `query_base`.
2. Expect `CLI_REPORTED_ERROR` with `details.stdout` starting `Error: Command "…" not found.`, no `details.code` and no `details.reason`.
3. Restore the integration afterwards.

## Recording

Append the raw outputs (stdout, stderr, exit code, tool results) to `research.md` under "T0 evidence" with the date. Redact absolute paths to the vault-relative form.
