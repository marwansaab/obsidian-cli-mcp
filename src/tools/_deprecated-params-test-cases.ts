// Original — no upstream. Shared deprecated-alias battery for the spec 073 renamed tools: from a tool's rename table, a valid new-name payload and one value per renamed key, it builds the old-name equivalence cases (O2) and the old-plus-new conflict cases (O4) each tool's schema test runs. Pure and vitest-free; the expected notice and conflict message are spelled out here, not taken from `_deprecated-params.ts`, so the battery pins the contract rather than echoing the helper.
import type { ParameterRename } from "./_deprecated-params.js";

export interface AliasEquivalenceCase {
  old: string;
  /** The payload with the old key in place of its replacement. */
  viaOld: Record<string, unknown>;
  /** The same call under the new name. */
  viaNew: Record<string, unknown>;
  /** The `deprecated_parameters` entry the old-name call must add. */
  notice: { parameter: string; replacement: string; note?: string };
}

export interface AliasConflictCase {
  old: string;
  /** The payload carrying both the old key and its replacement, with agreeing values. */
  input: Record<string, unknown>;
  /** The one issue the schema must raise. */
  issue: { path: string[]; message: string };
}

/**
 * `base` is a valid payload under the new names; `values` gives, per renamed key, the new-name
 * value to send. The old key gets the same value, negated for an inverted rename.
 */
export function deprecatedAliasCases(
  renames: readonly ParameterRename[],
  base: Record<string, unknown>,
  values: Record<string, unknown>,
): { equivalence: AliasEquivalenceCase[]; conflict: AliasConflictCase[] } {
  const equivalence: AliasEquivalenceCase[] = [];
  const conflict: AliasConflictCase[] = [];
  for (const { old, replacement, inverted } of renames) {
    const { [replacement]: _replaced, ...rest } = base;
    const newValue = values[replacement];
    const oldValue = inverted === true ? !newValue : newValue;
    equivalence.push({
      old,
      viaOld: { ...rest, [old]: oldValue },
      viaNew: { ...rest, [replacement]: newValue },
      notice:
        inverted === true
          ? { parameter: old, replacement, note: `${old}: true equals ${replacement}: false (opposite polarity).` }
          : { parameter: old, replacement },
    });
    conflict.push({
      old,
      input: { ...rest, [old]: oldValue, [replacement]: newValue },
      issue: { path: [old], message: `\`${old}\` is deprecated and replaced by \`${replacement}\`; supply only \`${replacement}\`` },
    });
  }
  return { equivalence, conflict };
}
