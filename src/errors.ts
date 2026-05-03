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
