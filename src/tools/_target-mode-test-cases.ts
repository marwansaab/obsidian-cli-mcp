// Original — no upstream. Shared target-mode wiring battery (BI-058 F-D): the
// per-tool schema tests each re-pasted ~8-10 cases asserting the target-mode
// refinement (specific-requires-vault, locator XOR, active-forbids-vault/file/path,
// strict unknown-key). The PRIMITIVE — including that it survives `.extend()` — is
// covered once in target-mode/target-mode.test.ts; the only legitimate per-tool
// concern is whether the refinement is WIRED into that tool's published schema.
//
// This pure (vitest-free) generator returns the battery as data so each tool's
// schema.test.ts iterates it via `it.each` against its OWN real schema + its own
// minimal valid payloads. The two "wiring sanity" cases (valid payloads must parse)
// fail loudly if a caller supplies a wrong payload, so a mis-built payload can't
// silently make a negative case pass for the wrong reason.

export interface TargetModeWiringCase {
  /** Human-readable label (used as the `it.each` title). */
  label: string;
  /** The input handed to `schema.safeParse`. */
  input: Record<string, unknown>;
  /** Expected `safeParse(...).success`. */
  valid: boolean;
  /** For an invalid case, an issue whose `path` includes this key must be present. */
  issuePath?: string;
}

function without(obj: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  const copy = { ...obj };
  for (const key of keys) delete copy[key];
  return copy;
}

/**
 * The standard target-mode battery for a locator-XOR tool (specific mode takes
 * exactly one of `file`/`path` plus `vault`; active mode forbids all three).
 *
 * @param validSpecific a minimal payload the tool accepts in specific mode
 *   (must include `vault`, exactly one locator, and any tool-required extras).
 * @param validActive a minimal payload the tool accepts in active mode
 *   (no `vault`/`file`/`path`; tool-required extras only).
 */
export function targetModeWiringCases(
  validSpecific: Record<string, unknown>,
  validActive: Record<string, unknown>,
): TargetModeWiringCase[] {
  return [
    { label: "valid specific payload parses (wiring sanity)", input: validSpecific, valid: true },
    { label: "valid active payload parses (wiring sanity)", input: validActive, valid: true },
    {
      label: "specific without vault is rejected at vault",
      input: without(validSpecific, "vault"),
      valid: false,
      issuePath: "vault",
    },
    {
      label: "specific with both file and path is rejected (locator XOR)",
      input: { ...validSpecific, file: "F", path: "x.md" },
      valid: false,
    },
    {
      label: "specific with no locator is rejected (locator XOR)",
      input: without(validSpecific, "file", "path"),
      valid: false,
    },
    {
      label: "active mode forbids vault",
      input: { ...validActive, vault: "V" },
      valid: false,
      issuePath: "vault",
    },
    {
      label: "active mode forbids file",
      input: { ...validActive, file: "F" },
      valid: false,
      issuePath: "file",
    },
    {
      label: "active mode forbids path",
      input: { ...validActive, path: "P.md" },
      valid: false,
      issuePath: "path",
    },
    {
      label: "unknown top-level key is rejected (strict)",
      input: { ...validSpecific, __unknown_probe: 1 },
      valid: false,
    },
  ];
}
