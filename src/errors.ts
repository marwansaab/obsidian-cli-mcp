// Original — no upstream. Project-wide structured boundary error class (FR-018, Principle IV foundation).

export interface UpstreamErrorArgs {
  code: string;
  cause: unknown;
  details: Record<string, unknown>;
  message?: string;
}

export class UpstreamError extends Error {
  readonly code: string;
  readonly cause: unknown;
  readonly details: Record<string, unknown>;

  constructor(args: UpstreamErrorArgs) {
    const message = args.message ?? `CLI bridge upstream error: ${args.code}`;
    super(message);
    this.name = "UpstreamError";
    this.code = args.code;
    this.cause = args.cause;
    this.details = args.details;
  }
}

/**
 * Read a string-valued field from an {@link UpstreamError}'s `details` bag, defaulting to `""`
 * when the key is absent or non-string. Handlers use it to pull `stdout` / `stderr` off a
 * `CLI_REPORTED_ERROR` for upstream-marker classification without re-inlining the
 * `typeof … === "string"` guard at every site.
 */
export function stringDetail(details: Record<string, unknown>, key: string): string {
  return typeof details[key] === "string" ? (details[key] as string) : "";
}
