# Contract: Registry-Stability Baseline (FR-018)

**Branch**: `022-rename-typed-tools` | **Date**: 2026-05-12 | **Spec**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)

This contract documents the FR-018 durable registry-stability test: the checked-in baseline file, the canonicalisation rule, the test's pass/fail semantics, the baseline-roll-forward protocol for future BIs, and the failure-message format.

## 1. Artifact path

The baseline lives at `src/tools/_register-baseline.json`. The path is **pinned** — moving the baseline elsewhere requires a separate decision recorded in a future BI's research and a corresponding test-load-path update.

Co-location rationale: the baseline is consumed by `src/tools/_register.test.ts`, which already sits alongside `_register.ts` and `_shared.ts`. Keeping all three plus the baseline together preserves the per-surface module-locality convention.

## 2. Baseline JSON schema

```typescript
type RegisterBaseline = {
  schemaVersion: 1;                                // forward-compat hook
  generatedFromBranch: string;                      // informational only; test does NOT assert
  generatedAt: string;                              // ISO date, informational only
  tools: ReadonlyArray<{
    name: string;                                   // registered tool name
    descriptionFingerprint: string;                 // SHA-256 hex (lowercase) of canonicalised description
    schemaFingerprint: string;                      // SHA-256 hex (lowercase) of canonicalised inputSchema
  }>;
};
```

### Field rules

- **`schemaVersion`** MUST equal `1` for this BI. Future BIs MAY bump it (e.g. when adding `outputSchemaFingerprint`); the test asserts the version it expects and fails loudly if the file format diverges.
- **`generatedFromBranch`** and **`generatedAt`** are advisory metadata. The test does NOT assert them — they exist so a human reviewer reading a baseline-roll-forward commit can see at a glance which branch and date authored the new fingerprints.
- **`tools[]`** MUST be sorted alphabetically by `name` (lowercase byte-order). Out-of-order arrays fail the test with a "baseline must be sorted by name" message.
- **`tools[].name`** MUST equal the registered tool name (the value of `descriptor.name` after `registerTool`).
- **`tools[].descriptionFingerprint`** MUST be lowercase hex SHA-256 of the UTF-8-encoded description string. Total length 64 chars.
- **`tools[].schemaFingerprint`** MUST be lowercase hex SHA-256 of the canonicalised JSON encoding of `descriptor.inputSchema`. Total length 64 chars.

## 3. Canonicalisation rule (for `schemaFingerprint`)

```typescript
function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJSON).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map((k) => JSON.stringify(k) + ":" + canonicalJSON((value as Record<string, unknown>)[k]));
  return "{" + entries.join(",") + "}";
}
```

Rules:

- Object keys sorted **lexicographically by code-point** at every depth.
- No whitespace anywhere between tokens.
- Arrays preserve their input order (arrays are positional in JSON Schema — `properties` is an object, but `required` and `enum` are arrays whose order matters).
- Strings serialised via `JSON.stringify` (RFC 8259 conformant escaping).
- No trailing newline.
- No BOM.

The SHA-256 input is the canonicalised string encoded as UTF-8 bytes.

### Worked example

Input `inputSchema`:

```json
{
  "type": "object",
  "properties": {
    "tool_name": { "type": "string" }
  },
  "additionalProperties": false
}
```

`canonicalJSON(...)` output:

```
{"additionalProperties":false,"properties":{"tool_name":{"type":"string"}},"type":"object"}
```

SHA-256 hex of that UTF-8 byte sequence → that's the `schemaFingerprint`.

## 4. Test pass / fail semantics

The FR-018 test lives in `src/tools/_register.test.ts` under a new `describe("registry: stability baseline (FR-018)", ...)` block. It contains three assertions:

### Assertion 1 — baseline matches live registry (happy path)

```typescript
it("live registry fingerprints match the checked-in baseline", async () => {
  const baseline = readBaseline();  // load src/tools/_register-baseline.json
  const live = await fingerprintLiveRegistry();
  expect(live).toEqual(baseline.tools);
});
```

Where `fingerprintLiveRegistry()`:

1. Calls `listToolsViaRegistry()` (already defined in `_register.test.ts`).
2. For each tool `{name, description, inputSchema}`: computes `descriptionFingerprint = sha256(description)` and `schemaFingerprint = sha256(canonicalJSON(inputSchema))`.
3. Sorts the resulting array by `name`.
4. Returns the array.

The `expect(live).toEqual(baseline.tools)` assertion gives vitest's deep-equality diff renderer the data it needs to print a precise mismatch:

- Extra tool in live but not baseline → `+{name: "foo", ...}` in the diff.
- Extra tool in baseline but not live → `-{name: "bar", ...}` in the diff.
- Fingerprint mismatch on a known tool → object-level diff showing the byte-level fingerprint change.

### Assertion 2 — baseline structural validation

```typescript
it("baseline file conforms to the documented schema", () => {
  const baseline = readBaseline();
  expect(baseline.schemaVersion).toBe(1);
  expect(Array.isArray(baseline.tools)).toBe(true);
  for (const entry of baseline.tools) {
    expect(typeof entry.name).toBe("string");
    expect(entry.descriptionFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(entry.schemaFingerprint).toMatch(/^[0-9a-f]{64}$/);
  }
  const sorted = [...baseline.tools].sort((a, b) => a.name.localeCompare(b.name));
  expect(baseline.tools).toEqual(sorted);
});
```

### Assertion 3 — sanity: known retired names absent

```typescript
it("baseline does NOT include any retired tool name", () => {
  const baseline = readBaseline();
  const names = baseline.tools.map((t) => t.name);
  const retired = ["read_note", "delete_note", "list_files", "write_property", "rename_note"];
  const found = retired.filter((r) => names.includes(r));
  expect(found, `retired names should be absent from baseline: ${found.join(", ")}`).toEqual([]);
});
```

This assertion is **specific to the 022 rename**. Future BIs that retire additional names MAY append to the `retired` array; doing so is OPTIONAL — the assertion's purpose is to surface accidental re-introduction of a name we deliberately removed. Future BIs that do NOT touch this assertion still benefit from Assertion 1's general drift detection.

## 5. Baseline-roll-forward protocol (for future BIs)

When a future BI intentionally adds, removes, or renames a tool:

1. Make the registry change (add tool factory + import + tools-array entry; OR rename per the 022 mechanic; OR remove an entry).
2. Run the test suite. Assertion 1 fails with a precise diff.
3. **Regenerate the baseline** by running `npm run baseline:write` (mechanism locked at /speckit-analyze U6 remediation 2026-05-12 — see §7). The script invokes `scripts/write-register-baseline.ts` which reuses the shared `src/tools/_register-baseline.ts` fingerprint module so the writer's canonicalisation cannot drift from the verifier's. The regeneration overwrites `src/tools/_register-baseline.json` with the new fingerprints.
4. Commit the registry change AND the regenerated baseline in the same commit.
5. Reviewer inspects the baseline diff alongside the registry diff. Any registry change NOT reflected in the baseline change (or vice versa) means the future BI's diff is incomplete.

**The roll-forward is deliberate.** A future BI that adds `move_note` (for instance) updates the baseline in the same commit; the diff shows both the new factory + the new baseline entry. A future BI that accidentally renames a tool fails the test until the dev consciously decides "yes, this rename was intentional" and rolls the baseline forward — at which point the rename is visible in `git log -p src/tools/_register-baseline.json`.

The "in the same commit" rule is **enforced by review, not by machinery**. Splitting registry change and baseline roll across two commits is permissible but discouraged — it produces a transient commit where tests fail.

## 6. Failure-message format

When Assertion 1 fails, vitest's deep-equality differ produces output like:

```
expected [
  { name: "delete", descriptionFingerprint: "abc...", schemaFingerprint: "def..." },
  { name: "files",  descriptionFingerprint: "...",    schemaFingerprint: "..." },
  ...
] to equal [
  { name: "delete", descriptionFingerprint: "ZZZ...", schemaFingerprint: "def..." },
  { name: "files",  descriptionFingerprint: "...",    schemaFingerprint: "..." },
  ...
]

- name: "delete"
-   descriptionFingerprint: "abc..."
+   descriptionFingerprint: "ZZZ..."
```

The diff identifies which tool changed AND which fingerprint within that tool changed. A reviewer reading the failure knows immediately whether the change was to the description text (low-stakes — likely a docs polish) or the schema (high-stakes — likely a Constitution III concern).

For Assertion 3 failure, the message is the explicit `${found.join(", ")}` list of retired names that crept back in.

## 7. Implementation notes for /speckit-implement

- The fingerprint helper functions (`sha256`, `canonicalJSON`, `fingerprintLiveRegistry`) live in a SHARED module `src/tools/_register-baseline.ts` consumed by BOTH the FR-018 test in `src/tools/_register.test.ts` AND the `scripts/write-register-baseline.ts` regeneration script (locked at /speckit-analyze U6 remediation 2026-05-12 — earlier contract said the helpers should live in the test file only; that was reconsidered when the baseline-roll-forward mechanism was pinned to `npm run baseline:write`). Sharing the canonicalisation logic across the two consumers prevents drift between the writer and the verifier — if the writer's `canonicalJSON` ever diverged from the verifier's, every BI's baseline would silently mismatch. The shared module is itself a "public" surface inside `src/tools/` per Constitution Principle II and has its own co-located test file `src/tools/_register-baseline.test.ts`.
- Use `node:crypto`'s `createHash("sha256")` — already available without new deps.
- The baseline file MUST be checked in with `\n` line endings (LF) regardless of host platform; Windows hosts with `core.autocrlf=true` should not produce CRLF in the committed file.
- The baseline reader MUST tolerate trailing whitespace at EOF (a common formatter outcome) by using `JSON.parse(readFileSync(path, "utf8"))`.
- The post-rename baseline values for the 11 tools listed in [data-model.md §5](../data-model.md) are computed during /speckit-implement's T028 baseline-capture task — they are not pre-computed in this contract because the description strings may be edited in the same BI (e.g. if a renamed tool's description text gets a self-reference update per FR-012, the fingerprint changes accordingly).
- The baseline-roll-forward mechanism is `npm run baseline:write`, wiring `scripts/write-register-baseline.ts` (TypeScript) via `tsx` (devDependency) or Node 22.6+'s `--experimental-strip-types` flag (no new deps required since `engines.node >= 22.11` per Constitution). Future BIs that intentionally change the registry run this script and commit the regenerated baseline in the same commit as the registry change.

## 8. Out of scope for this contract

- **Output-schema fingerprints**: The current contract covers `name` + `description` + `inputSchema`. The tool's RESPONSE shape (output schema) is not currently published via `tools/list` and is not fingerprinted. If a future MCP SDK feature publishes output schemas, this contract bumps to `schemaVersion: 2` to add `outputSchemaFingerprint`.
- **Coverage threshold interaction**: The three new test cases (Assertions 1-3) net-add to the statements covered. The `vitest.config.ts` threshold MAY ratchet up incidentally; this is consistent with the constitution's "single source of truth" ratcheting rule and does not require a separate amendment.
- **Cross-feature drift between baseline and `invariants` map**: `_register.test.ts` already has the per-tool `invariants` map (key/properties/required/additionalProperties). The new baseline file is a DIFFERENT artifact (fingerprints of the full descriptor, not field-level invariants). Both coexist. The `invariants` map catches structural-level drift in the published JSON Schema shape; the baseline catches any byte-level mutation including description text. They are complementary.
