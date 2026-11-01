// Original — no upstream. Shared Bases-family recognition of a malformed .base file (spec 081 FR-011): the invalid-yaml pattern query_base and views_base both classify as BASE_MALFORMED / invalid-yaml, and the upstream report both build from a failure's stderr and stdout.

/**
 * A YAML parser complaint about a `.base` file. The js-yaml structural phrases (sufficiently
 * indented / flow|block collection / bad indentation / duplicated mapping key / …) were added from
 * a live T0 probe (2026-05-29, BI-057): a broken `.base` surfaced as "Flow sequence in block
 * collection must be sufficiently indented and end with a ]", which carries no literal "yaml"
 * token and previously fell through to the verbatim-message `unknown` path. No `g` flag: the
 * constant is shared, so `.test` must stay stateless.
 */
export const INVALID_YAML_PATTERN =
  /\b(yaml(?:exception)?|yaml\s+parse|invalid\s+yaml|unexpected\s+token\s+at\s+line|sufficiently\s+indented|flow\s+(?:sequence|mapping)|block\s+(?:mapping|collection|sequence)|(?:bad|deficient)\s+indentation|duplicated\s+mapping\s+key|could\s+not\s+find\s+expected|mapping\s+values\s+are\s+not\s+allowed|tab\s+characters\s+must\s+not\s+be\s+used)\b/i;

/**
 * The upstream report a Bases failure carries: trimmed stderr and trimmed stdout, joined by a
 * newline when both are non-empty, else whichever is non-empty, else "".
 */
export function upstreamReport(stderr: string, stdout: string): string {
  return [stderr.trim(), stdout.trim()].filter((part) => part.length > 0).join("\n");
}
