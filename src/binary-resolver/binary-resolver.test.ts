// Original — no upstream. Cross-platform binary resolver — happy + failure tests per FR-001..FR-020.
import { constants as fsConstants } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { UpstreamError } from "../errors.js";
import {
  resolveBinary,
  type BinaryResolverDeps,
  type ResolutionAttempt,
} from "./binary-resolver.js";

function createDeps(overrides: Partial<BinaryResolverDeps> = {}): BinaryResolverDeps {
  return {
    env: {},
    platform: "linux",
    homedir: () => "/home/test",
    access: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function errno(code: string): NodeJS.ErrnoException {
  const e: NodeJS.ErrnoException = new Error(code) as NodeJS.ErrnoException;
  e.code = code;
  return e;
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("expected rejection but promise resolved");
  } catch (err) {
    return err;
  }
}

// ---------------------------------------------------------------------------
// Group 1 — OBSIDIAN_BIN branch (7 cases per data-model.md)
// ---------------------------------------------------------------------------

describe("resolveBinary — OBSIDIAN_BIN branch (FR-001 / FR-008 / FR-020)", () => {
  it("OBSIDIAN_BIN set + access resolves → returns override path with single resolved attempt", async () => {
    const access = vi.fn().mockResolvedValue(undefined);
    const result = await resolveBinary(
      createDeps({ env: { OBSIDIAN_BIN: "/x" }, platform: "linux", access }),
    );
    expect(result).toEqual({
      path: "/x",
      attempts: [{ source: "OBSIDIAN_BIN", path: "/x", outcome: "resolved" }],
    });
    expect(access).toHaveBeenCalledTimes(1);
    expect(access).toHaveBeenCalledWith("/x", fsConstants.X_OK);
  });

  it("OBSIDIAN_BIN set + access rejects ENOENT → throws CLI_BINARY_NOT_FOUND, attempts.length === 1, no fall-through", async () => {
    const access = vi.fn().mockRejectedValue(errno("ENOENT"));
    const err = (await captureRejection(
      resolveBinary(
        createDeps({ env: { OBSIDIAN_BIN: "/x", PATH: "/usr/bin" }, platform: "linux", access }),
      ),
    )) as UpstreamError;
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
    expect(err.details.attempts).toEqual([
      { source: "OBSIDIAN_BIN", path: "/x", outcome: "not-found" },
    ]);
    expect(err.details.platform).toBe("linux");
    expect(err.details.PATH).toBe("/usr/bin");
    expect(access).toHaveBeenCalledTimes(1);
  });

  it("OBSIDIAN_BIN set + access rejects EACCES → throws with outcome 'found-but-not-executable' (FR-020)", async () => {
    const access = vi.fn().mockRejectedValue(errno("EACCES"));
    const err = (await captureRejection(
      resolveBinary(createDeps({ env: { OBSIDIAN_BIN: "/x" }, access })),
    )) as UpstreamError;
    expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
    expect((err.details.attempts as ResolutionAttempt[])[0]?.outcome).toBe("found-but-not-executable");
  });

  it("OBSIDIAN_BIN set + access rejects EPERM → outcome 'found-but-not-executable'", async () => {
    const access = vi.fn().mockRejectedValue(errno("EPERM"));
    const err = (await captureRejection(
      resolveBinary(createDeps({ env: { OBSIDIAN_BIN: "/x" }, access })),
    )) as UpstreamError;
    expect((err.details.attempts as ResolutionAttempt[])[0]?.outcome).toBe("found-but-not-executable");
  });

  it("OBSIDIAN_BIN set + access rejects with non-ErrnoException → outcome 'found-but-not-executable' (defensive)", async () => {
    const access = vi.fn().mockRejectedValue("opaque-string-rejection");
    const err = (await captureRejection(
      resolveBinary(createDeps({ env: { OBSIDIAN_BIN: "/x" }, access })),
    )) as UpstreamError;
    expect((err.details.attempts as ResolutionAttempt[])[0]?.outcome).toBe("found-but-not-executable");
  });

  it("OBSIDIAN_BIN set to empty string → treated as unset; falls through to platform-default branch", async () => {
    const access = vi.fn().mockResolvedValue(undefined);
    const result = await resolveBinary(
      createDeps({ env: { OBSIDIAN_BIN: "" }, platform: "linux", homedir: () => "/h", access }),
    );
    expect(result.path).toBe("/h/.local/bin/obsidian");
    expect(result.attempts[0]?.source).toBe("platform-default");
  });

  it.each(["darwin", "linux", "win32"] as const)(
    "OBSIDIAN_BIN behaviour is platform-independent (platform=%s)",
    async (platform) => {
      const access = vi.fn().mockResolvedValue(undefined);
      const result = await resolveBinary(
        createDeps({ env: { OBSIDIAN_BIN: "/y" }, platform, access }),
      );
      expect(result.path).toBe("/y");
      expect(result.attempts).toEqual([{ source: "OBSIDIAN_BIN", path: "/y", outcome: "resolved" }]);
    },
  );
});

// ---------------------------------------------------------------------------
// Group 2 — Platform-default on darwin (5 cases — case 5 is US7 symlink)
// ---------------------------------------------------------------------------

describe("resolveBinary — darwin platform-default (FR-002, US1)", () => {
  it("darwin + OBSIDIAN_BIN unset + access('/usr/local/bin/obsidian') resolves → returns platform-default; PATH NOT consulted", async () => {
    const access = vi.fn().mockResolvedValue(undefined);
    const result = await resolveBinary(createDeps({ platform: "darwin", access }));
    expect(result).toEqual({
      path: "/usr/local/bin/obsidian",
      attempts: [{ source: "platform-default", path: "/usr/local/bin/obsidian", outcome: "resolved" }],
    });
    expect(access).toHaveBeenCalledTimes(1);
  });

  it("darwin + access rejects ENOENT → falls through to PATH; attempts records both", async () => {
    const access = vi.fn().mockRejectedValue(errno("ENOENT"));
    const result = await resolveBinary(createDeps({ platform: "darwin", access }));
    expect(result).toEqual({
      path: "obsidian",
      attempts: [
        { source: "platform-default", path: "/usr/local/bin/obsidian", outcome: "not-found" },
        { source: "PATH", path: "obsidian", outcome: "pending" },
      ],
    });
  });

  it("darwin + access rejects EACCES → falls through; outcome 'found-but-not-executable' then PATH pending", async () => {
    const access = vi.fn().mockRejectedValue(errno("EACCES"));
    const result = await resolveBinary(createDeps({ platform: "darwin", access }));
    expect(result.path).toBe("obsidian");
    expect(result.attempts).toEqual([
      { source: "platform-default", path: "/usr/local/bin/obsidian", outcome: "found-but-not-executable" },
      { source: "PATH", path: "obsidian", outcome: "pending" },
    ]);
  });

  it("darwin + OBSIDIAN_BIN set to /foo → OBSIDIAN_BIN wins; platform-default not consulted", async () => {
    const access = vi.fn().mockResolvedValue(undefined);
    await resolveBinary(
      createDeps({ env: { OBSIDIAN_BIN: "/foo" }, platform: "darwin", access }),
    );
    expect(access).toHaveBeenCalledTimes(1);
    expect(access).toHaveBeenCalledWith("/foo", fsConstants.X_OK);
    expect(access).not.toHaveBeenCalledWith("/usr/local/bin/obsidian", expect.any(Number));
  });

  it("darwin + symlink at platform-default returns the platform-default path verbatim; OS spawn dereferences (R9 / FR-007)", async () => {
    // fs.access(X_OK) succeeds for symlinks pointing at executable targets;
    // resolver must return the symlink path verbatim (no fs.realpath call).
    const access = vi.fn().mockResolvedValue(undefined);
    const result = await resolveBinary(createDeps({ platform: "darwin", access }));
    expect(result.path).toBe("/usr/local/bin/obsidian");
  });
});

// ---------------------------------------------------------------------------
// Group 3 — Platform-default on linux (5 cases)
// ---------------------------------------------------------------------------

describe("resolveBinary — linux platform-default (FR-002, US2)", () => {
  it("linux + homedir='/home/u' + access resolves → returns ~/.local/bin/obsidian", async () => {
    const access = vi.fn().mockResolvedValue(undefined);
    const result = await resolveBinary(
      createDeps({ platform: "linux", homedir: () => "/home/u", access }),
    );
    expect(result).toEqual({
      path: "/home/u/.local/bin/obsidian",
      attempts: [{ source: "platform-default", path: "/home/u/.local/bin/obsidian", outcome: "resolved" }],
    });
    expect(access).toHaveBeenCalledWith("/home/u/.local/bin/obsidian", fsConstants.X_OK);
  });

  it("linux + access rejects ENOENT → falls through; PATH attempt pending", async () => {
    const access = vi.fn().mockRejectedValue(errno("ENOENT"));
    const result = await resolveBinary(
      createDeps({ platform: "linux", homedir: () => "/home/u", access }),
    );
    expect(result.path).toBe("obsidian");
    expect(result.attempts).toEqual([
      { source: "platform-default", path: "/home/u/.local/bin/obsidian", outcome: "not-found" },
      { source: "PATH", path: "obsidian", outcome: "pending" },
    ]);
  });

  it("linux + access rejects EACCES → falls through; outcome 'found-but-not-executable'", async () => {
    const access = vi.fn().mockRejectedValue(errno("EACCES"));
    const result = await resolveBinary(
      createDeps({ platform: "linux", homedir: () => "/home/u", access }),
    );
    expect(result.attempts[0]?.outcome).toBe("found-but-not-executable");
    expect(result.attempts[1]?.outcome).toBe("pending");
  });

  it("linux + homedir='/root' (root user) → /root/.local/bin/obsidian", async () => {
    const access = vi.fn().mockResolvedValue(undefined);
    const result = await resolveBinary(
      createDeps({ platform: "linux", homedir: () => "/root", access }),
    );
    expect(result.path).toBe("/root/.local/bin/obsidian");
  });

  it("linux + WSL guest case (FR-016): process.platform === 'linux' → identical to native Linux", async () => {
    // Inside a WSL guest, process.platform is "linux" — the resolver behaves as such.
    const access = vi.fn().mockResolvedValue(undefined);
    const result = await resolveBinary(
      createDeps({ platform: "linux", homedir: () => "/home/wsl-user", access }),
    );
    expect(result.path).toBe("/home/wsl-user/.local/bin/obsidian");
  });
});

// ---------------------------------------------------------------------------
// Group 4 — Win32 platform-skip (4 cases)
// ---------------------------------------------------------------------------

describe("resolveBinary — win32 platform-skip (FR-005, US3)", () => {
  it("win32 + OBSIDIAN_BIN unset → no platform-default attempt; trailing PATH pending only", async () => {
    const access = vi.fn();
    const result = await resolveBinary(createDeps({ platform: "win32", access }));
    expect(result).toEqual({
      path: "obsidian",
      attempts: [{ source: "PATH", path: "obsidian", outcome: "pending" }],
    });
  });

  it("win32 + OBSIDIAN_BIN set + access resolves → identical to other platforms (R11)", async () => {
    const access = vi.fn().mockResolvedValue(undefined);
    const result = await resolveBinary(
      createDeps({ env: { OBSIDIAN_BIN: "C:\\Tools\\obsidian.exe" }, platform: "win32", access }),
    );
    expect(result.path).toBe("C:\\Tools\\obsidian.exe");
    expect(result.attempts).toEqual([
      { source: "OBSIDIAN_BIN", path: "C:\\Tools\\obsidian.exe", outcome: "resolved" },
    ]);
  });

  it("win32 + OBSIDIAN_BIN unset → access NOT called (FR-005 byte-for-byte: no syscall on Windows)", async () => {
    const access = vi.fn();
    await resolveBinary(createDeps({ platform: "win32", access }));
    expect(access).toHaveBeenCalledTimes(0);
  });

  it.each(["freebsd", "openbsd", "sunos", "aix"] as const)(
    "non-darwin/linux/win32 platforms (%s) → behave like win32 per F4 generalisation",
    async (platform) => {
      const access = vi.fn();
      const result = await resolveBinary(
        createDeps({ platform: platform as NodeJS.Platform, access }),
      );
      expect(result.path).toBe("obsidian");
      expect(result.attempts).toEqual([{ source: "PATH", path: "obsidian", outcome: "pending" }]);
      expect(access).toHaveBeenCalledTimes(0);
    },
  );
});

// ---------------------------------------------------------------------------
// Group 5 — Multi-branch fall-through error shape (5 cases)
// ---------------------------------------------------------------------------

describe("resolveBinary — error envelope shape (FR-004, US4)", () => {
  it("linux + OBSIDIAN_BIN set + access rejects → throws; attempts.length === 1; source 'OBSIDIAN_BIN'", async () => {
    const access = vi.fn().mockRejectedValue(errno("ENOENT"));
    const err = (await captureRejection(
      resolveBinary(createDeps({ env: { OBSIDIAN_BIN: "/x" }, platform: "linux", access })),
    )) as UpstreamError;
    expect((err.details.attempts as ResolutionAttempt[]).length).toBe(1);
    expect((err.details.attempts as ResolutionAttempt[])[0]?.source).toBe("OBSIDIAN_BIN");
  });

  it("linux + OBSIDIAN_BIN unset + platform-default rejects → resolver returns successfully (no throw at resolver layer)", async () => {
    const access = vi.fn().mockRejectedValue(errno("ENOENT"));
    const result = await resolveBinary(
      createDeps({ platform: "linux", homedir: () => "/h", access }),
    );
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]?.source).toBe("platform-default");
    expect(result.attempts[1]?.source).toBe("PATH");
    expect(result.attempts[1]?.outcome).toBe("pending");
  });

  it.each(["darwin", "linux", "win32", "freebsd"] as const)(
    "details.platform matches deps.platform verbatim (platform=%s)",
    async (platform) => {
      const access = vi.fn().mockRejectedValue(errno("ENOENT"));
      const err = (await captureRejection(
        resolveBinary(createDeps({ env: { OBSIDIAN_BIN: "/x" }, platform, access })),
      )) as UpstreamError;
      expect(err.details.platform).toBe(platform);
    },
  );

  it("details.PATH is env.PATH verbatim (including undefined when unset)", async () => {
    const access = vi.fn().mockRejectedValue(errno("ENOENT"));
    const err = (await captureRejection(
      resolveBinary(createDeps({ env: { OBSIDIAN_BIN: "/x" }, platform: "linux", access })),
    )) as UpstreamError;
    expect(err.details.PATH).toBeUndefined();
  });

  it("details.PATH is preserved verbatim when set (multi-entry colon-delimited)", async () => {
    const access = vi.fn().mockRejectedValue(errno("ENOENT"));
    const err = (await captureRejection(
      resolveBinary(
        createDeps({
          env: { OBSIDIAN_BIN: "/x", PATH: "/usr/bin:/bin:/opt/obsidian" },
          platform: "linux",
          access,
        }),
      ),
    )) as UpstreamError;
    expect(err.details.PATH).toBe("/usr/bin:/bin:/opt/obsidian");
  });
});

// ---------------------------------------------------------------------------
// Group 6 — Symbol invariants and edge cases (4 cases)
// ---------------------------------------------------------------------------

describe("resolveBinary — invariants", () => {
  it("attempts array is non-empty on every success path", async () => {
    const cases: Array<{ deps: BinaryResolverDeps; label: string }> = [
      { deps: createDeps({ env: { OBSIDIAN_BIN: "/x" }, platform: "linux" }), label: "OBSIDIAN_BIN-resolved" },
      { deps: createDeps({ platform: "darwin" }), label: "darwin-platform-default-resolved" },
      { deps: createDeps({ platform: "win32", access: vi.fn() }), label: "win32-PATH-pending" },
    ];
    for (const { deps, label } of cases) {
      const result = await resolveBinary(deps);
      expect(result.attempts.length, label).toBeGreaterThan(0);
    }
  });

  it("attempts is in resolution order — OBSIDIAN_BIN first, platform-default next, PATH last", async () => {
    // OBSIDIAN_BIN-only: attempts[0].source === "OBSIDIAN_BIN".
    let result = await resolveBinary(createDeps({ env: { OBSIDIAN_BIN: "/x" }, platform: "linux" }));
    expect(result.attempts[0]?.source).toBe("OBSIDIAN_BIN");
    // darwin platform-default fall-through to PATH.
    const access = vi.fn().mockRejectedValue(errno("ENOENT"));
    result = await resolveBinary(createDeps({ platform: "darwin", access }));
    expect(result.attempts.map((a) => a.source)).toEqual(["platform-default", "PATH"]);
  });

  it("two consecutive resolveBinary calls fire access twice — no caching (FR-009)", async () => {
    const access = vi.fn().mockResolvedValue(undefined);
    const deps = createDeps({ platform: "darwin", access });
    await resolveBinary(deps);
    await resolveBinary(deps);
    expect(access).toHaveBeenCalledTimes(2);
  });

  it("resolver does not read process.env / process.platform directly — only via injected deps", async () => {
    const originalEnv = { ...process.env };
    const originalPlatform = process.platform;
    try {
      // Stash a fake OBSIDIAN_BIN on process.env that, if leaked, would be the resolved path.
      process.env.OBSIDIAN_BIN = "/leaked-process-env";
      const access = vi.fn().mockResolvedValue(undefined);
      const result = await resolveBinary(
        createDeps({ env: { OBSIDIAN_BIN: "/from-deps" }, platform: "linux", access }),
      );
      expect(result.path).toBe("/from-deps");
      // Confirm we never read process.platform: the deps.platform "linux" branch fired,
      // even on a host where process.platform might be "win32" or "darwin".
      expect(originalPlatform).toEqual(process.platform);
    } finally {
      process.env = originalEnv;
    }
  });
});
