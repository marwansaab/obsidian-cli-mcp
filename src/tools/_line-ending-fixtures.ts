// Original — no upstream. Vitest-free line-ending fixtures for the patch_heading / patch_block mixed-line-ending tests (spec 086): LF templates plus converters, so a mixed note and its uniform twin share their text by construction.

/** Every `"\n"` becomes `"\r\n"`. Assumes the input is pure LF. */
export function toCrlf(s: string): string {
  return s.replaceAll("\n", "\r\n");
}

/** Every `"\r\n"` becomes `"\n"`. */
export function toLf(s: string): string {
  return s.replaceAll("\r\n", "\n");
}

/** Splits a pure-LF note into its frontmatter (opening `---` through closing `---`, inclusive, with its line break) and the rest. */
function splitFrontmatter(s: string): [string, string] {
  const m = /^---\n[\s\S]*?\n---\n/.exec(s);
  const fm = m === null ? "" : m[0];
  return [fm, s.slice(fm.length)];
}

/** Frontmatter lines keep LF; every later line break becomes CRLF (the shape a property edit leaves on a CRLF note). */
export function mixFmLfBodyCrlf(s: string): string {
  const [fm, body] = splitFrontmatter(s);
  return fm + toCrlf(body);
}

/** Frontmatter lines become CRLF; every later line break keeps LF. */
export function mixFmCrlfBodyLf(s: string): string {
  const [fm, body] = splitFrontmatter(s);
  return toCrlf(fm) + body;
}

/** Contract `HT`: frontmatter, `# Top`, `## First` (two-line body), `## Middle` (one-line body + `### Child`), `## Last` (two-line body), final line break. */
export const HEADING_TEMPLATE =
  "---\n" +
  "status: draft\n" +
  "---\n" +
  "# Top\n" +
  "## First\n" +
  "first-1\n" +
  "first-2\n" +
  "## Middle\n" +
  "middle-1\n" +
  "### Child\n" +
  "child-1\n" +
  "## Last\n" +
  "last-1\n" +
  "last-2\n";

/** Contract `BT`: frontmatter, a paragraph `^para`, a list item `^li`, a two-row table followed by a marker-only `^tbl` line, final line break. */
export const BLOCK_TEMPLATE =
  "---\n" +
  "status: draft\n" +
  "---\n" +
  "Para text ^para\n" +
  "\n" +
  "- item ^li\n" +
  "\n" +
  "| a | b |\n" +
  "| - | - |\n" +
  "^tbl\n";
