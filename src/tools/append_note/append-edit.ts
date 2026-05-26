// Original — no upstream. append_note pure helper per BI-044 / R2 / data-model.md — separator-decide-and-concatenate. Returns post-edit content for the four file-tail shapes × two inline states. No fs access; no UpstreamError; deterministic.

export function detectLineEnding(existing: string): "\n" | "\r\n" {
  for (let i = 0; i < existing.length; i++) {
    if (existing.charCodeAt(i) === 10 /* \n */) {
      if (i > 0 && existing.charCodeAt(i - 1) === 13 /* \r */) return "\r\n";
      return "\n";
    }
  }
  return "\n";
}

export function appendEdit(existing: string, content: string, inline: boolean): string {
  // FR-007 — inline opt-in overrides everything else; content lands directly
  // after the file's existing trailing byte with NO wrapper-inserted separator.
  if (inline) return existing + content;
  // FR-009 — 0-byte file → no leading separator.
  if (existing.length === 0) return content;
  // FR-006a — existing trailing line break IS the separator.
  if (existing.endsWith("\r\n") || existing.endsWith("\n")) return existing + content;
  // FR-006 / FR-008 — non-newline-trailing → insert separator matching
  // the file's existing line-ending convention.
  return existing + detectLineEnding(existing) + content;
}
