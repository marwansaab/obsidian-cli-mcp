// Original — no upstream. withVaultRelativePaths tests (spec 090 data-model E5, rules R-b to R-e): the vault's absolute folder is rewritten out of an UpstreamError's message and details.
import { describe, expect, test } from "vitest";

import { withVaultRelativePaths } from "./_vault-relative-error.js";
import { UpstreamError } from "../errors.js";

const ROOT = "C:\\Vaults\\Work";

function failure(message: string, details: Record<string, unknown> = {}, cause: unknown = null): UpstreamError {
  return new UpstreamError({ code: "CLI_REPORTED_ERROR", cause, details, message });
}

describe("withVaultRelativePaths", () => {
  test("R-e: a failure naming no root comes back as the same object", () => {
    const e = failure("Error: Destination file already exists!", { argv: ["move", "to=Archive/a.md"], exitCode: 0 });
    expect(withVaultRelativePaths(e, ROOT)).toBe(e);
  });

  test("R-b: an empty root, or one of separators only, rewrites nothing", () => {
    const e = failure(`rename '${ROOT}\\a.md'`);
    expect(withVaultRelativePaths(e, "")).toBe(e);
    expect(withVaultRelativePaths(e, "\\/")).toBe(e);
  });

  test("R-b: trailing separators on the root are trimmed before matching", () => {
    const out = withVaultRelativePaths(failure(`rename '${ROOT}\\a.md'`), `${ROOT}\\\\`);
    expect(out.message).toBe("rename 'a.md'");
  });

  test("R-b/R-c: either separator and any case; `<root><sep>` → \"\", a bare root → \".\", a sibling sharing the prefix is left alone", () => {
    const out = withVaultRelativePaths(
      failure("'c:/vaults/WORK/Inbox/a.md' -> 'C:\\VAULTS\\Work\\b.md' (vault C:\\Vaults\\Work, sibling C:\\Vaults\\Workshop\\x.md)"),
      ROOT,
    );
    expect(out.message).toBe("'Inbox/a.md' -> 'b.md' (vault ., sibling C:\\Vaults\\Workshop\\x.md)");
  });

  test("R-c: a POSIX root is matched the same way", () => {
    const out = withVaultRelativePaths(failure("rename '/home/u/Vault/a.md' in /home/u/Vault"), "/home/u/Vault/");
    expect(out.message).toBe("rename 'a.md' in .");
  });

  test("R-c: regex metacharacters in the root match literally", () => {
    const root = "C:\\V (1)+\\W.k";
    const e = failure(`'${root}\\a.md' and 'C:\\V (1)+\\WXk\\b.md'`);
    expect(withVaultRelativePaths(e, root).message).toBe("'a.md' and 'C:\\V (1)+\\WXk\\b.md'");
  });

  test("R-d: every string in details is rewritten, inside arrays and nested plain records; other values are untouched", () => {
    const e = failure("CLI bridge upstream error: CLI_NON_ZERO_EXIT", {
      stderr: `EBUSY: '${ROOT}\\a.md'\n`,
      argv: ["obsidian", `path=${ROOT}\\a.md`],
      nested: { inner: [{ path: `${ROOT}/b.md` }], flag: true, none: null },
      exitCode: 1,
    });
    const out = withVaultRelativePaths(e, ROOT);
    expect(out.details).toEqual({
      stderr: "EBUSY: 'a.md'\n",
      argv: ["obsidian", "path=a.md"],
      nested: { inner: [{ path: "b.md" }], flag: true, none: null },
      exitCode: 1,
    });
    expect(e.details.stderr).toBe(`EBUSY: '${ROOT}\\a.md'\n`);
  });

  test("R-e: a rewritten failure is a new error with the same code and cause", () => {
    const cause = new Error("spawn");
    const e = new UpstreamError({ code: "CLI_NON_ZERO_EXIT", cause, details: {}, message: `failed in ${ROOT}\\a.md` });
    const out = withVaultRelativePaths(e, ROOT);
    expect(out).not.toBe(e);
    expect(out).toBeInstanceOf(UpstreamError);
    expect(out.code).toBe("CLI_NON_ZERO_EXIT");
    expect(out.cause).toBe(cause);
    expect(out.message).toBe("failed in a.md");
  });
});
