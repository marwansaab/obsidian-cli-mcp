# Data Model: Align Closed-Vault Reporting

**Feature**: [spec.md](spec.md) | **Contract**: [contracts/closed-vault-contract.md](contracts/closed-vault-contract.md)

No stored data and no schema change. The "model" here is the set of vault states a call can meet and the failure each one maps to, which are the spec's Key Entities expressed as states and outcomes.

## Vault states (per call that names `vault`)

| State | How the server tells | Outcome |
|---|---|---|
| **Open** | First attempt answers normally | Normal result |
| **Closed, recoverable** | First attempt's stdout matches `COLD_START_PATTERN`; second attempt answers normally | Normal result (ADR-029 retry, unchanged) |
| **Unavailable** | Both attempts' stdout match `COLD_START_PATTERN` | `CLI_REPORTED_ERROR`, `details.stdout` = the second attempt's stdout (vault-unavailable failure) |
| **Unknown** | Five eval tools: stdout begins `Vault not found.` (facade re-classification). `query_base`: the registry lookup misses before any spawn. | Existing unknown-vault failure (unchanged) |
| **Application not running** | Non-zero exit with the app-down reason | BI-060 auto-launch path and its failures (unchanged) |

## Transitions

```text
call(vault) ─► attempt 1
   ├─ normal ───────────────────────────────► result
   ├─ "Vault not found." ───────────────────► unknown-vault failure
   ├─ Command "…" not found. ─► attempt 2
   │      ├─ normal ─────────────────────────► result
   │      └─ Command "…" not found. ─────────► vault-unavailable failure
   └─ app down ─► auto-launch path (unchanged)

Removed: handler stage "empty stdout + vault listed ─► VAULT_NOT_FOUND/not-open"
(unreachable; an empty answer now goes to the existing json-parse failure)
```

## Failure shapes (unchanged code, documented names)

| Documented name | `code` | Distinguishing details |
|---|---|---|
| Vault unavailable | `CLI_REPORTED_ERROR` | `details.stdout` begins `Error: Command "<cmd>" not found.`; no `details.code` / `details.reason` |
| Unknown vault (eval tools) | `CLI_REPORTED_ERROR` | `details.message: "Vault not found."` |
| Unknown vault (`query_base`) | `CLI_REPORTED_ERROR` | `details.code: "VAULT_NOT_FOUND"`, `details.reason: "unknown"` (registry miss), or `details.message: "Vault not found."` (CLI-reported, facade form) |

Unknown-vault rows record today's behaviour for reference only. This feature leaves them and their published wording unchanged (spec Out of Scope).
| Empty answer (anomaly) | `CLI_REPORTED_ERROR` | `details.stage: "json-parse"` |
| Empty result | — (success) | `count: 0` |

**Retired** (never emitted): `details.code: "VAULT_NOT_FOUND"`, `details.reason: "not-open"`, `details.stage: "handler-stage-0"` on these six tools.
