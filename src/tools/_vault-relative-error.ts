// Original — no upstream. Rewrites a vault's absolute folder out of an UpstreamError, so a failure names vault-relative paths only (spec 090 data-model E5, rules R-b to R-e). Tool-agnostic: the caller supplies the vault root and decides which failures to pass through.
import { UpstreamError } from "../errors.js";

const SEPARATOR = String.raw`[\\/]`;
// What may follow a bare root in CLI text: the end, or a character that cannot continue a folder
// name there. Anything else (`<root>shop\x.md`) is a sibling folder and is left alone.
const AFTER_BARE_ROOT = String.raw`(?=$|[\s'"\x60,;:)\]>])`;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * `<root><separator>` becomes "" and a bare `<root>` becomes ".", in the message and in every
 * string inside `details` (recursing into arrays and plain records), with either separator and in
 * any case. The same object comes back when nothing was rewritten, so a failure naming no path is
 * unchanged; otherwise a new error keeps the `code` and `cause`.
 */
export function withVaultRelativePaths(e: UpstreamError, root: string): UpstreamError {
  const trimmed = root.replace(/[\\/]+$/, "");
  if (trimmed === "") return e;
  const pattern = trimmed
    .split(/[\\/]/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(SEPARATOR);
  const re = new RegExp(`${pattern}(?:${SEPARATOR}|${AFTER_BARE_ROOT})`, "gi");
  let changed = false;
  const rewriteString = (value: string): string =>
    value.replace(re, (match) => {
      changed = true;
      return /[\\/]$/.test(match) ? "" : ".";
    });
  const rewriteRecord = (record: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(Object.entries(record).map(([k, v]) => [k, rewriteValue(v)]));
  const rewriteValue = (value: unknown): unknown => {
    if (typeof value === "string") return rewriteString(value);
    if (Array.isArray(value)) return value.map(rewriteValue);
    if (isPlainRecord(value)) return rewriteRecord(value);
    return value;
  };
  const message = rewriteString(e.message);
  const details = isPlainRecord(e.details) ? rewriteRecord(e.details) : e.details;
  if (!changed) return e;
  return new UpstreamError({ code: e.code, cause: e.cause, details, message });
}
