// Original — no upstream. Eval output reading (spec 080, research D1/D2): the per-call answer tag, the wrapper that prefixes a typed eval's printed value with it, the locator that finds the tagged `=> ` answer line among plugin output (raw or JSON-quoted form; look-alike and foreign-tag lines ignored; conflicting tagged lines yield null), and the line scans dispatch uses to recognise Obsidian's own `Error:` lines in eval output.

/** The per-call answer tag: `obsidian-cli-mcp:<nonce>:`. */
export function evalAnswerTag(nonce: string): string {
  return `obsidian-cli-mcp:${nonce}:`;
}

/**
 * Wrap `code` so the value Obsidian prints starts with `tag`. `code` is embedded verbatim and
 * awaited, so templates that return a string or a promise of one both print `tag + value`.
 */
export function wrapEvalCode(code: string, tag: string): string {
  return `(async()=>{return ${JSON.stringify(tag)}+(await (${code}))})()`;
}

/** The body after `=> ` for each answer-marker line, CRLF-tolerant. */
function answerLineBodies(stdout: string): string[] {
  const bodies: string[] = [];
  for (const raw of stdout.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const head = line.trimStart();
    if (head.startsWith("=> ")) bodies.push(head.slice(3));
  }
  return bodies;
}

/**
 * Locate this call's answer: the text after `tag` on a `=> ` line, in raw form (`=> <tag>value`)
 * or JSON-quoted form (`=> "<tag>value"`). Every other line is ignored wherever it sits. Returns
 * null when no line carries the tag, or when tagged lines disagree.
 */
export function findTaggedEvalAnswer(stdout: string, tag: string): string | null {
  let answer: string | null = null;
  for (const body of answerLineBodies(stdout)) {
    let candidate: string | null = null;
    if (body.startsWith(tag)) {
      candidate = body.slice(tag.length);
    } else if (body.startsWith(`"${tag}`)) {
      try {
        const decoded: unknown = JSON.parse(body);
        if (typeof decoded === "string" && decoded.startsWith(tag)) candidate = decoded.slice(tag.length);
      } catch {
        // Not a JSON string after all: not an answer line.
      }
    }
    if (candidate === null) continue;
    if (answer !== null && answer !== candidate) return null;
    answer = candidate;
  }
  return answer;
}

/** True when any line starts (after leading whitespace) with the `=> ` answer marker. */
export function hasEvalAnswerLine(stdout: string): boolean {
  return answerLineBodies(stdout).length > 0;
}

/** The trimmed last line that starts (after leading whitespace) with `Error:`, or null. */
export function findReportedErrorLine(stdout: string): string | null {
  let found: string | null = null;
  for (const line of stdout.split("\n")) {
    if (line.trimStart().startsWith("Error:")) found = line.trim();
  }
  return found;
}
