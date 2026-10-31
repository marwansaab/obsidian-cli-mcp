# Quickstart: Validate Align Closed-Vault Reporting

**Feature**: [spec.md](spec.md) | **Contract**: [contracts/closed-vault-contract.md](contracts/closed-vault-contract.md)

## Automated gate (every story)

```sh
npm run typecheck
npm run lint
npm test
npm run baseline:write   # then: git diff src/tools/_register-baseline.json
```

**Expected**:

- All pass.
- The baseline diff touches only the `descriptionFingerprint` of `paths`, `tag`, `pattern_search`, `query_base`, `smart_connections_query` and `smart_connections_similar` (contract §5).

## Story 1 — closed vault recovers (P1)

- **Automated**: each tool's `handler.test.ts` case D6(a). Cold-start stdout, then a valid envelope, gives the normal result with two spawns and no `vaults` spawn.
- **Live**: T0 gate G1 step 3 ([contracts/t0-probe-plan.md](contracts/t0-probe-plan.md)). Each of the six tools, called with a closed authorised test vault, returns its normal result on the first call.

## Story 2 — vault unavailable is clearly reported (P1)

- **Automated**: D6(b) in each `handler.test.ts`. Two cold-start answers give `CLI_REPORTED_ERROR` with the `Command "…" not found.` stdout and no `details.code` or `details.reason`.
- **Automated**: the existing unknown-vault cases still pass byte-for-byte (SC-003).
- **Live (optional)**: T0 gate G2.

## Story 3 — documentation lists only reachable failures (P2)

```sh
grep -rn "not-open" docs/tools src/tools --include=*.md --include=index.ts
```

**Expected**:

- Only `views_base` hits remain (its `BASE_NOT_FOUND` / `not-open`).
- No hits in the six pages, in `find_and_replace.md` or in `patch_block.md`.
- Each of the six pages and descriptions contains the vault-unavailable row or sentence. The `index.test.ts` assertions cover the descriptions.

## Story 4 — no dead handling (P3)

```sh
grep -rn "detectIfClosed\|_eval-vault-closed-detection\|handler-stage-0" src
```

**Expected**:

- No hits.
- The folder `src/tools/_eval-vault-closed-detection/` no longer exists.
- D6(c) in each `handler.test.ts` shows that an empty answer with `vault` set gives `details.stage: "json-parse"` with a single spawn.
