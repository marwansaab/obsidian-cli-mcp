# ADR-070 — The focused vault's name is looked up again on a miss and never falls back to its folder

- **Status:** Accepted
- **Date:** 2026-11-04
- **Source:** PR #138 (BI-0121, `.specify/bugs/bi-0121/`: assessment, fix
  and test reports, owner rulings Q1 = A, Q2, Q3 to Q5), commits `cab02fd`
  (the fix), `c3c3753` and `8ec5196` (the PR #138 code-quality review's
  fixes; `8ec5196` is the owner's option A on its naming findings)
- **Related:** ADR-015 (Sub-Discriminators via details.reason for
  Multi-State Error Codes), under which `focused-unregistered` joins
  `unknown` and `folder-missing` on `VAULT_NOT_FOUND`;
  [ADR-044](ADR-044-file-path-tools-check-the-resolved-file-and-keep-its-type.md),
  whose rejected alternative recorded this fallback as BI-0121 and named the
  fail-loud rule this record adopts;
  [ADR-068](ADR-068-a-vault-root-that-cannot-be-resolved-fails-as-the-vaults-folder.md),
  the `folder-missing` sibling and its no-disk-path rule; spec 068 FR-037
  (PR #91), the forward lookup's re-probe on a miss.

## Context

Five tools need the focused vault's display name in active mode, because the
focused-file `eval` reports only the vault's absolute folder (`basePath`):
`append_note`, `prepend`, `patch_heading` and `patch_block` return it as the
result's `vault`, `prepend` also sends it to Obsidian as `vault=`, and
`find_and_replace` with a `file` and no `vault` sends it to `obsidian file`.
The vault registry's reverse lookup, `resolveVaultDisplayName` (folder to
name), read only the in-memory cache that `obsidian vaults verbose` fills, and
nothing fills it at start-up. The shared helper in `src/tools/_active-file.ts`
then used the folder path itself as the "name".

So the first call of a process failed or misreported: `prepend` and
`find_and_replace` sent `vault=<absolute folder>` and got Obsidian's
`Vault not found.`; the other three succeeded and reported the folder path as
`vault`. Any earlier call that named a vault had warmed the cache, which is why
BI-0117's runs passed.

## Decision

1. **The reverse lookup probes once on a miss.** In `createVaultRegistry`
   (`src/vault-registry/registry.ts`), `resolveVaultDisplayName` is async: a
   cold cache or a miss runs the registry's existing single-flight `probe()`
   once and matches again, the same rule the forward `resolveVaultPath`
   follows since PR #91. A vault added in Obsidian after start-up therefore
   resolves too. A probe failure propagates, and the cache stays unset, so the
   next call probes again (Q1 = A).
2. **The helper fails loud instead of falling back.** The helper, renamed
   `requireFocusedVaultName` in review (commit `8ec5196`) because its miss
   contract is the opposite of the registry method's, never returns the
   folder path. A `null` answer after the probe, or a registry with no
   reverse lookup, throws `CLI_REPORTED_ERROR` with
   `details: { code: "VAULT_NOT_FOUND", reason: "focused-unregistered" }`.
   That is a new ADR-015 `details.reason` on an existing pair, not a new
   code (Q2).
3. **No disk path on the wire.** Neither the message nor `details` carries the
   folder, as for `folder-missing` (ADR-068). The message tells the caller to
   call again in specific mode with `vault`, or to re-open the vault in
   Obsidian.
4. **The interface stays loose; the real registry is typed exactly.**
   `VaultRegistry.resolveVaultDisplayName` stays optional, widened to
   `string | null | Promise<string | null>`, so the many test stubs keep
   working (the Declined-cleanups ruling). `createVaultRegistry` returns the
   new `ObsidianVaultRegistry`, where the method is required and always
   async (review finding F1, commit `c3c3753`). The same review replaced the
   linear scan with a `byPath` map built from `byName`, so the answers did
   not change (F2).

## Alternatives rejected

- **Prime the cache at start-up in `server.ts`.** It adds a spawn to every
  start, touches the boot spine (`createServer`, a kernel node), and still
  misses a vault added after start-up. Rejected in the assessment.
- **Fail loud without probing** (assessment option C, fix path 2 alone).
  Every first active-mode call would then fail with the new error, which
  contradicts the first-call acceptance criteria.
- **Also send no `vault=` from `prepend` and `find_and_replace`** (option B,
  BI-0060's shape, which ADR-044 chose for the four CLI pass-through tools).
  Redundant once the name is always a registered one, and out of scope by
  ruling.
- **A separate optional async refresh method** that would keep the lookup
  synchronous. Rejected by the "four more tests" ruling: it adds a second
  method to call in the right order for the same answer.

## Consequences

- The first active-mode call of a process for these five tools now runs
  `obsidian vaults verbose` once, through the injected queue; later calls hit
  the cache. A miss on a warm cache probes again.
- The comparison is still exact string equality between Obsidian's
  `basePath` and the folder `vaults verbose` lists. They agree on the test
  host; a host where they differ now fails with `focused-unregistered`
  instead of echoing the folder. Normalising the comparison was left out of
  scope (PR #138 reviewer note 4).
- The four CLI pass-through tools (`read`, `rename`, `move`, `outline`) and
  `write_note`, `set_property` are unchanged: they never needed the name.
- Not exercised live: `focused-unregistered` needs a focused vault that
  `vaults verbose` does not list. Handler tests and
  `find_and_replace/scope.test.ts` cover it; the five first-call successes
  were checked live, one fresh server process per tool (`test.md`).
