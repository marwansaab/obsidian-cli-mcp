// Original — no upstream. Unit rows for the non-ASCII release checks (spec 093 contract §T).
import { describe, expect, it } from "vitest";

import {
  buildFixtures,
  DEADLINE_MS,
  EXPECTED_HEADINGS,
  exitStatus,
  fixturesVisibleIn,
  hasNonAscii,
  judge,
  LINK_TARGET,
  missingNotePath,
  outcomeFromError,
  outsideSeen,
  parseToolResult,
  PATTERN,
  renderReport,
  RETRY_INTERVAL_MS,
  retryUntilPass,
  runChecks,
  runFolderName,
  SCENARIOS,
  USAGE,
  validateArgs,
  vaultFacts,
  type CheckContext,
  type CleanupResult,
  type Outcome,
  type RetryOptions,
  type RunArgs,
  type RunInputs,
  type Scenario,
  type ToolResult,
} from "./_non-ascii-checks.js";

const RUN = "Sandbox/non-ascii-check-20261104-153000-a1b2";
const fixtures = buildFixtures(RUN);
const STAGED = "Notes/Café note.md";
const args: RunArgs = { testVault: "T", semanticVault: "V", stagedNote: STAGED };
const inputs: RunInputs = { args, fixtures, missingNote: missingNotePath("0123abcd") };
const ready: CheckContext = {
  testVaultListed: true,
  semanticVaultListed: true,
  semanticRoot: "/vaults/V",
  fixturesVisible: true,
  outsideSeenByP1: true,
  stagedNoteOnDisk: true,
  missingNoteAbsent: true,
};

const ok = (payload: Record<string, unknown>): ToolResult => ({ kind: "ok", payload });
const error = (code: string, details: Record<string, unknown>): ToolResult => ({
  kind: "error",
  payload: { code, message: `${code} message`, details },
});
const scenario = (id: string): Scenario => {
  const found = SCENARIOS.find((s) => s.id === id);
  if (found === undefined) throw new Error(`no scenario ${id}`);
  return found;
};
const status = (id: string, result: ToolResult, at: RunInputs = inputs): Outcome["status"] =>
  judge(scenario(id), at, result).status;
const precondition = (id: string, ctx: CheckContext, at: RunInputs = inputs): string | null =>
  scenario(id).precondition(ctx, at);

const outlinePayload = (headings: ReadonlyArray<readonly [number, string]>) => ({
  count: headings.length,
  headings: headings.map(([level, text], i) => ({ level, text, line: i * 4 + 1 })),
});
const match = (m: { path: string; line: number; match: string; text: string }) => ({
  ...m,
  offset: 6,
});
const searchPayload = (
  matches: Array<{ path: string; line: number; match: string; text: string }>,
) => ({
  count: matches.length,
  matches: matches.map(match),
});

const TEST_VAULT_SCENARIOS = ["H1", "L1", "F1", "F2", "P1", "P2"];

describe("T-FX1 / T-FX2: fixture set", () => {
  const strings = [
    fixtures.folder,
    fixtures.source,
    fixtures.target,
    fixtures.missingFolder,
    inputs.missingNote,
    LINK_TARGET,
    PATTERN,
    ...fixtures.files.map((f) => f.content),
    ...EXPECTED_HEADINGS.map(([, text]) => text),
  ];

  it("every fixture string is NFC", () => {
    for (const s of strings) expect(s === s.normalize("NFC"), s).toBe(true);
  });

  it("every name segment below the run folder, and the missing note's name, carries a non-ASCII character", () => {
    for (const p of [fixtures.folder, fixtures.source, fixtures.target, fixtures.missingFolder]) {
      expect(p.startsWith(`${RUN}/`)).toBe(true);
      for (const segment of p.slice(RUN.length + 1).split("/"))
        expect(hasNonAscii(segment), segment).toBe(true);
    }
    expect(hasNonAscii(inputs.missingNote.split("/").at(-1) ?? "")).toBe(true);
    expect(inputs.missingNote).toMatch(/^_non-ascii-check\/存在しない ノート café — 0123abcd\.md$/);
  });

  it("the headings include U+2014 and a character outside the BMP", () => {
    const texts = EXPECTED_HEADINGS.map(([, text]) => text).join("");
    expect(texts).toContain("—");
    expect([...texts].some((c) => (c.codePointAt(0) ?? 0) > 0xffff)).toBe(true);
  });

  it("the readiness probe's path is all-ASCII", () => {
    expect(hasNonAscii(fixtures.outside.slice(RUN.length + 1))).toBe(false);
    expect(fixturesVisibleIn(ok({ content: "Price café77 noted.\n" }), fixtures)).toBe(true);
    expect(fixturesVisibleIn(ok({ content: "Price café77 noted." }), fixtures)).toBe(false);
    expect(fixturesVisibleIn(error("CLI_REPORTED_ERROR", {}), fixtures)).toBe(false);
  });

  it("the source text puts café42 on line 3 and the link on line 7", () => {
    const source = fixtures.files.find((f) => f.path === fixtures.source);
    const lines = source?.content.split("\n") ?? [];
    expect(lines[2]).toBe("Order café42 arrived.");
    expect(lines[6]).toBe("See [[Résumé 東京]].");
    expect(source?.content.endsWith("\n")).toBe(true);
    expect(fixtures.sourceMatch).toEqual({
      path: fixtures.source,
      line: 3,
      match: "café42",
      text: "Order café42 arrived.",
    });
  });

  it("the run folder name carries the timestamp and four hex characters", () => {
    expect(runFolderName(new Date(2026, 10, 4, 15, 30, 0), "a1b2")).toBe(RUN);
  });
});

describe("T-SHAPE: parseToolResult", () => {
  const text = (value: unknown) => [{ type: "text", text: JSON.stringify(value) }];

  it("a success with structuredContent → its payload", () => {
    expect(parseToolResult({ content: text({ a: 2 }), structuredContent: { a: 1 } })).toEqual(
      ok({ a: 1 }),
    );
  });

  it("a success with only text content → the parsed text", () => {
    expect(parseToolResult({ content: text({ a: 1 }) })).toEqual(ok({ a: 1 }));
  });

  it("isError: true with a {code, message, details} text → an error payload", () => {
    const payload = { code: "CLI_REPORTED_ERROR", message: "m", details: { code: "X" } };
    expect(parseToolResult({ isError: true, content: text(payload) })).toEqual({
      kind: "error",
      payload,
    });
  });

  it.each([
    ["no content", { content: [] }],
    ["non-JSON text", { content: [{ type: "text", text: "not json" }] }],
    ["a non-object payload", { content: text([1, 2]) }],
    ["an error without details", { isError: true, content: text({ code: "X", message: "m" }) }],
    ["not an object at all", "boom"],
  ])("anything else (%s) → unexpected", (_label, raw) => {
    expect(parseToolResult(raw)).toEqual({ kind: "unexpected", raw });
  });

  it("an unexpected result is FAIL with `unexpected result shape` for every scenario", () => {
    for (const s of SCENARIOS) {
      const outcome = judge(s, inputs, { kind: "unexpected", raw: "boom" });
      expect(outcome.status).toBe("FAIL");
      expect(String(outcome.actual)).toContain("unexpected result shape");
    }
  });

  it("a success payload of the wrong shape is FAIL, never trusted", () => {
    for (const s of SCENARIOS) expect(judge(s, inputs, ok({ surprise: true })).status).toBe("FAIL");
  });
});

describe("T-R / T-EXIT: report and exit status", () => {
  const header = {
    date: "2026-11-04 15:30",
    version: "0.9.0",
    sha: "ac4c028",
    serverVersion: "0.9.0",
    args,
  };
  const pass = judge(scenario("H1"), inputs, ok(outlinePayload(EXPECTED_HEADINGS)));
  const fail = judge(scenario("P1"), inputs, ok({ count: 0, matches: [] }));
  const blocked: Outcome = {
    ...pass,
    status: "BLOCKED",
    precondition: "no staged note path given",
  };
  const removed: CleanupResult = { kind: "removed", path: RUN };

  it("renders one block per outcome in input order, with the header, cleanup and summary lines", () => {
    const report = renderReport(header, [pass, fail, blocked], removed);
    const lines = report.split("\n");
    expect(lines[0]).toBe(
      "non-ascii check — 2026-11-04 15:30 — obsidian-cli-mcp 0.9.0 (ac4c028), server 0.9.0",
    );
    expect(lines[1]).toBe(`test vault: T · semantic vault: V · staged note: ${STAGED}`);
    expect(lines[2]).toBe("");
    const statusLines = lines.filter((l) => /^(PASS|FAIL|BLOCKED) /.test(l));
    expect(statusLines).toEqual([
      "PASS    H1 headings (outline)",
      "FAIL    P1 pattern search (pattern_search)",
      "BLOCKED H1 headings (outline)",
    ]);
    expect(report).toContain(`cleanup: removed ${RUN}\n`);
    expect(report.endsWith("summary: 1 pass · 1 fail · 1 blocked\n")).toBe(true);
  });

  it("a FAIL block carries input, expected and actual; a BLOCKED block its precondition; non-ASCII unescaped", () => {
    const report = renderReport(header, [fail, blocked], removed);
    expect(report).toContain(
      '          input:    {"vault":"T","pattern":"café\\\\d+","limit":10000}',
    );
    expect(report).toContain(
      `          expected: matches include ${JSON.stringify(fixtures.sourceMatch)}`,
    );
    expect(report).toContain('          actual:   {"count":0,"matches":[]}');
    expect(report).toContain("          precondition: no staged note path given");
    expect(report).toContain("日本語フォルダ/Café 日記.md");
    expect(report).not.toMatch(/\\u[0-9a-f]{4}/i);
  });

  it("renders the residue and nothing-seeded cleanup lines, and (none) for an absent staged note", () => {
    const noStaged = { ...header, args: { testVault: "T", semanticVault: "V" } };
    expect(renderReport(noStaged, [], { kind: "residue", path: RUN })).toContain(
      `cleanup: RESIDUE ${RUN}\n`,
    );
    const empty = renderReport(noStaged, [], { kind: "none" });
    expect(empty).toContain("staged note: (none)");
    expect(empty).toContain("cleanup: nothing seeded\n");
    expect(empty).toContain("summary: 0 pass · 0 fail · 0 blocked");
  });

  it("exit status: 0 for PASS and BLOCKED with clean cleanup, 1 for any FAIL, 1 for residue", () => {
    expect(exitStatus([pass, blocked], removed)).toBe(0);
    expect(exitStatus([pass, blocked], { kind: "none" })).toBe(0);
    expect(exitStatus([pass, fail], removed)).toBe(1);
    expect(exitStatus([pass], { kind: "residue", path: RUN })).toBe(1);
  });
});

describe("T-ARGS: validateArgs", () => {
  it("a missing --test-vault or --semantic-vault is a usage error", () => {
    expect(validateArgs({ "semantic-vault": "V" })).toEqual({
      usageError: "--test-vault is required",
    });
    expect(validateArgs({ "test-vault": "T" })).toEqual({
      usageError: "--semantic-vault is required",
    });
    expect(validateArgs({ "test-vault": "", "semantic-vault": "V" })).toEqual({
      usageError: "--test-vault is required",
    });
    expect(USAGE).toContain("--test-vault <name> --semantic-vault <name> [--staged-note <path>]");
  });

  it("equal vault names are the usage error `vault names must differ`", () => {
    expect(validateArgs({ "test-vault": "A", "semantic-vault": "A" })).toEqual({
      usageError: "vault names must differ",
    });
  });

  it("an absent --staged-note is valid, with stagedNote undefined", () => {
    expect(validateArgs({ "test-vault": "T", "semantic-vault": "V" })).toEqual({
      testVault: "T",
      semanticVault: "V",
      stagedNote: undefined,
    });
    expect(
      validateArgs({ "test-vault": "T", "semantic-vault": "V", "staged-note": STAGED }),
    ).toEqual(args);
  });
});

describe("vaultFacts: the vaults result", () => {
  const vaults = ok({
    count: 2,
    vaults: [
      { name: "T", path: "/vaults/T", open: true },
      { name: "V", path: "/vaults/V", open: null },
    ],
  });

  it("lists both vaults and their folders", () => {
    expect(vaultFacts(vaults, args)).toEqual({
      testVaultListed: true,
      semanticVaultListed: true,
      testRoot: "/vaults/T",
      semanticRoot: "/vaults/V",
    });
  });

  it("an unlisted vault is not listed", () => {
    expect(vaultFacts(vaults, { testVault: "X", semanticVault: "V" })).toMatchObject({
      testVaultListed: false,
      semanticVaultListed: true,
    });
  });

  it("a failing or malformed vaults call lists neither, and keeps the message", () => {
    expect(vaultFacts(error("CLI_NON_ZERO_EXIT", {}), args)).toEqual({
      testVaultListed: false,
      semanticVaultListed: false,
      vaultsError: "CLI_NON_ZERO_EXIT message",
    });
    expect(vaultFacts(ok({ count: 0 }), args)).toMatchObject({
      testVaultListed: false,
      vaultsError: "unexpected result shape",
    });
  });
});

describe("test-vault preconditions (shared by H1, L1, F1, F2, P1, P2)", () => {
  it.each(TEST_VAULT_SCENARIOS)(
    "%s: an unlisted test vault, then invisible fixtures, are BLOCKED",
    (id) => {
      expect(precondition(id, ready)).toBeNull();
      expect(precondition(id, { ...ready, fixturesVisible: false })).toBe(
        "fixtures not visible to Obsidian",
      );
      expect(precondition(id, { ...ready, testVaultListed: false, fixturesVisible: false })).toBe(
        "test vault T not listed by vaults",
      );
      expect(precondition(id, { ...ready, testVaultListed: false, vaultsError: "boom" })).toBe(
        "vaults call failed: boom",
      );
    },
  );

  it.each(TEST_VAULT_SCENARIOS)(
    "%s: any error payload is FAIL unless it is F2's own not-found",
    (id) => {
      if (id === "F2") return;
      expect(
        status(id, error("CLI_REPORTED_ERROR", { code: "FILE_NOT_FOUND", detail: "path: x" })),
      ).toBe("FAIL");
    },
  );
});

describe("T-H: H1 headings (outline)", () => {
  it("the exact list → PASS", () => {
    expect(status("H1", ok(outlinePayload(EXPECTED_HEADINGS)))).toBe("PASS");
    expect(scenario("H1").input(inputs)).toEqual({
      target_mode: "specific",
      vault: "T",
      path: fixtures.source,
    });
  });

  it("one heading in NFD → FAIL", () => {
    const nfd = EXPECTED_HEADINGS.map(
      ([level, text], i) => [level, i === 1 ? text.normalize("NFD") : text] as const,
    );
    expect(nfd[1]?.[1]).not.toBe(EXPECTED_HEADINGS[1]?.[1]);
    expect(status("H1", ok(outlinePayload(nfd)))).toBe("FAIL");
  });

  it("an extra heading, a missing heading or a level mismatch → FAIL", () => {
    expect(status("H1", ok(outlinePayload([...EXPECTED_HEADINGS, [4, "extra"]])))).toBe("FAIL");
    expect(status("H1", ok(outlinePayload(EXPECTED_HEADINGS.slice(1))))).toBe("FAIL");
    const shifted = EXPECTED_HEADINGS.map(
      ([level, text], i) => [i === 2 ? 2 : level, text] as const,
    );
    expect(status("H1", ok(outlinePayload(shifted)))).toBe("FAIL");
  });
});

describe("T-L: L1 links", () => {
  it("an entry with the target → PASS; the target missing → FAIL", () => {
    expect(
      status("L1", ok({ count: 1, links: [{ target: LINK_TARGET, line: 7, kind: "wikilink" }] })),
    ).toBe("PASS");
    expect(
      status("L1", ok({ count: 1, links: [{ target: "Resume 東京", line: 7, kind: "wikilink" }] })),
    ).toBe("FAIL");
    expect(status("L1", ok({ count: 0, links: [] }))).toBe("FAIL");
  });
});

describe("T-F1 / T-F2: folder listing (paths)", () => {
  it("F1: exactly [source] → PASS; [] or an extra path → FAIL", () => {
    expect(status("F1", ok({ count: 1, paths: [fixtures.source] }))).toBe("PASS");
    expect(status("F1", ok({ count: 0, paths: [] }))).toBe("FAIL");
    expect(
      status("F1", ok({ count: 2, paths: [fixtures.source, `${fixtures.folder}/other.md`] })),
    ).toBe("FAIL");
    expect(scenario("F1").input(inputs)).toEqual({
      target_mode: "specific",
      vault: "T",
      folder: fixtures.folder,
    });
  });

  it("F2: the matching FOLDER_NOT_FOUND → PASS; an empty success, another form of the folder or NOT_A_FOLDER → FAIL", () => {
    const notFound = (folder: string, code = "FOLDER_NOT_FOUND") =>
      error("CLI_REPORTED_ERROR", { stage: "envelope-error", code, folder });
    expect(status("F2", notFound(fixtures.missingFolder))).toBe("PASS");
    expect(status("F2", ok({ count: 0, paths: [] }))).toBe("FAIL");
    expect(status("F2", notFound(fixtures.missingFolder.normalize("NFD")))).toBe("FAIL");
    expect(
      status("F2", notFound(Buffer.from(fixtures.missingFolder, "utf8").toString("latin1"))),
    ).toBe("FAIL");
    expect(status("F2", notFound(fixtures.missingFolder, "NOT_A_FOLDER"))).toBe("FAIL");
  });
});

describe("T-P: pattern search", () => {
  const inside = { path: `${fixtures.folder}/Other.md`, line: 1, match: "café9", text: "café9" };

  it("P1: the source match → PASS; zero matches or a text mismatch → FAIL", () => {
    expect(status("P1", ok(searchPayload([fixtures.outsideMatch, fixtures.sourceMatch])))).toBe(
      "PASS",
    );
    expect(status("P1", ok(searchPayload([])))).toBe("FAIL");
    expect(
      status("P1", ok(searchPayload([{ ...fixtures.sourceMatch, text: "Order cafe42 arrived." }]))),
    ).toBe("FAIL");
    expect(scenario("P1").input(inputs)).toEqual({ vault: "T", pattern: PATTERN, limit: 10000 });
  });

  it("P2: inside-only → PASS; the outside match, a path outside the folder or the source missing → FAIL", () => {
    expect(status("P2", ok(searchPayload([fixtures.sourceMatch, inside])))).toBe("PASS");
    expect(status("P2", ok(searchPayload([fixtures.sourceMatch, fixtures.outsideMatch])))).toBe(
      "FAIL",
    );
    expect(
      status(
        "P2",
        ok(searchPayload([fixtures.sourceMatch, { ...inside, path: `${fixtures.folder}x/a.md` }])),
      ),
    ).toBe("FAIL");
    expect(status("P2", ok(searchPayload([inside])))).toBe("FAIL");
    expect(scenario("P2").input(inputs)).toEqual({
      vault: "T",
      pattern: PATTERN,
      folder: fixtures.folder,
      limit: 10000,
    });
  });

  it("P2 is BLOCKED until P1 has seen the outside note", () => {
    expect(precondition("P2", { ...ready, outsideSeenByP1: false })).toBe(
      "outside note not seen by the vault-wide search (P1)",
    );
    expect(precondition("P1", { ...ready, outsideSeenByP1: false })).toBeNull();
  });

  it("outsideSeen is true only when the outside match is present", () => {
    expect(
      outsideSeen(ok(searchPayload([fixtures.sourceMatch, fixtures.outsideMatch])), fixtures),
    ).toBe(true);
    expect(outsideSeen(ok(searchPayload([fixtures.sourceMatch])), fixtures)).toBe(false);
    expect(outsideSeen(error("CLI_REPORTED_ERROR", {}), fixtures)).toBe(false);
  });
});

describe("T-S1: S1 similar notes (staged note)", () => {
  const scError = (code: string) =>
    error("CLI_REPORTED_ERROR", { stage: "envelope-error", code, detail: "d" });

  it("each BLOCKED precondition, in contract order", () => {
    const noStaged = { ...inputs, args: { testVault: "T", semanticVault: "V" } };
    expect(precondition("S1", { ...ready, semanticVaultListed: false }, noStaged)).toBe(
      "no staged note path given",
    );
    const ascii = { ...inputs, args: { ...args, stagedNote: "Notes/plain.md" } };
    expect(precondition("S1", { ...ready, semanticVaultListed: false }, ascii)).toBe(
      "staged note path has no non-ASCII character",
    );
    expect(
      precondition("S1", { ...ready, semanticVaultListed: false, stagedNoteOnDisk: false }),
    ).toBe("semantic vault V not listed by vaults");
    expect(precondition("S1", { ...ready, stagedNoteOnDisk: false })).toBe(
      `staged note not found on disk at /vaults/V/${STAGED}`,
    );
    expect(precondition("S1", ready)).toBeNull();
    expect(
      judge(scenario("S1"), inputs, scError("SMART_CONNECTIONS_NOT_INSTALLED")).precondition,
    ).toBe("Smart Connections not installed (SMART_CONNECTIONS_NOT_INSTALLED)");
    expect(judge(scenario("S1"), inputs, scError("SMART_CONNECTIONS_NOT_READY")).precondition).toBe(
      "Smart Connections not ready (SMART_CONNECTIONS_NOT_READY)",
    );
    expect(judge(scenario("S1"), inputs, scError("SOURCE_NOT_INDEXED")).precondition).toBe(
      "staged note not indexed by Smart Connections (SOURCE_NOT_INDEXED)",
    );
  });

  it("FILE_NOT_FOUND for a note on disk → FAIL", () => {
    expect(status("S1", scError("FILE_NOT_FOUND"))).toBe("FAIL");
  });

  it("the staged path among the matches → FAIL; count 0 → FAIL; a clean success → PASS", () => {
    const m = (path: string) => ({ path, headingPath: [], score: 0.9 });
    expect(status("S1", ok({ count: 2, matches: [m("A.md"), m(STAGED)] }))).toBe("FAIL");
    expect(status("S1", ok({ count: 0, matches: [] }))).toBe("FAIL");
    expect(status("S1", ok({ count: 1, matches: [m("A.md")] }))).toBe("PASS");
    expect(scenario("S1").input(inputs)).toEqual({
      target_mode: "specific",
      vault: "V",
      path: STAGED,
      limit: 20,
    });
  });
});

describe("T-S2: S2 similar notes (missing note)", () => {
  const notFound = (detail: string) =>
    error("CLI_REPORTED_ERROR", { stage: "envelope-error", code: "FILE_NOT_FOUND", detail });

  it("the exact `path: <sent>` → PASS; a different detail → FAIL; a success → FAIL", () => {
    expect(status("S2", notFound(`path: ${inputs.missingNote}`))).toBe("PASS");
    expect(status("S2", notFound(`path: ${inputs.missingNote.normalize("NFD")}`))).toBe("FAIL");
    expect(status("S2", ok({ count: 0, matches: [] }))).toBe("FAIL");
    expect(scenario("S2").input(inputs)).toEqual({
      target_mode: "specific",
      vault: "V",
      path: inputs.missingNote,
      limit: 1,
    });
  });

  it("a plugin that is missing or not ready → BLOCKED; so is an unlisted vault or a file at the path", () => {
    const sc = (code: string) =>
      error("CLI_REPORTED_ERROR", { stage: "envelope-error", code, detail: "d" });
    expect(status("S2", sc("SMART_CONNECTIONS_NOT_INSTALLED"))).toBe("BLOCKED");
    expect(status("S2", sc("SMART_CONNECTIONS_NOT_READY"))).toBe("BLOCKED");
    expect(status("S2", sc("SOURCE_NOT_INDEXED"))).toBe("FAIL");
    expect(precondition("S2", { ...ready, missingNoteAbsent: false })).toBe(
      `a file exists at /vaults/V/${inputs.missingNote}`,
    );
    expect(precondition("S2", { ...ready, semanticVaultListed: false })).toBe(
      "semantic vault V not listed by vaults",
    );
    expect(precondition("S2", ready)).toBeNull();
  });
});

describe("T-RETRY: retry, independent outcomes", () => {
  const clock = (): RetryOptions & { sleeps: number[] } => {
    let t = 0;
    const sleeps: number[] = [];
    return {
      intervalMs: RETRY_INTERVAL_MS,
      deadlineMs: DEADLINE_MS,
      now: () => t,
      sleep: async (ms) => {
        sleeps.push(ms);
        t += ms;
      },
      sleeps,
    };
  };
  const h1 = scenario("H1");
  const failing = judge(h1, inputs, ok({ count: 0, headings: [] }));
  const passing = judge(h1, inputs, ok(outlinePayload(EXPECTED_HEADINGS)));

  it("a check that passes on its third attempt → PASS after two sleeps", async () => {
    const opts = clock();
    let attempts = 0;
    const outcome = await retryUntilPass(async () => (++attempts === 3 ? passing : failing), opts);
    expect(outcome.status).toBe("PASS");
    expect(opts.sleeps).toEqual([RETRY_INTERVAL_MS, RETRY_INTERVAL_MS]);
  });

  it("a check that never passes → the last attempt's FAIL once the deadline has elapsed", async () => {
    const opts = clock();
    let attempts = 0;
    const outcome = await retryUntilPass(async () => ({ ...failing, actual: ++attempts }), opts);
    expect(outcome.status).toBe("FAIL");
    expect(opts.now()).toBe(DEADLINE_MS);
    expect(outcome.actual).toBe(attempts);
    expect(attempts).toBe(DEADLINE_MS / RETRY_INTERVAL_MS + 1);
  });

  it("outcomeFromError gives FAIL whose actual is the error message", () => {
    const outcome = outcomeFromError(h1, { a: 1 }, new Error("transport closed"));
    expect(outcome).toMatchObject({
      status: "FAIL",
      id: "H1",
      input: { a: 1 },
      actual: "transport closed",
    });
    expect(outcomeFromError(h1, {}, "plain").actual).toBe("plain");
  });

  it("runChecks: a throwing call fails only its own scenario; the P1 result gates P2; outcomes keep table order", async () => {
    const results: Record<string, unknown> = {
      links: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              count: 1,
              links: [{ target: LINK_TARGET, line: 7, kind: "wikilink" }],
            }),
          },
        ],
      },
      pattern_search: {
        structuredContent: searchPayload([fixtures.sourceMatch]),
        content: [{ type: "text", text: JSON.stringify(searchPayload([fixtures.sourceMatch])) }],
      },
    };
    const calls: string[] = [];
    const call = async (tool: string) => {
      calls.push(tool);
      if (tool === "outline") throw new Error("transport closed");
      if (tool in results) return results[tool];
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ code: "X", message: "m", details: {} }) }],
      };
    };
    const outcomes = await runChecks(SCENARIOS, inputs, ready, call, { ...clock(), deadlineMs: 0 });
    expect(outcomes.map((o) => `${o.id}:${o.status}`)).toEqual([
      "H1:FAIL",
      "L1:PASS",
      "F1:FAIL",
      "F2:FAIL",
      "P1:PASS",
      "P2:BLOCKED",
      "S1:FAIL",
      "S2:FAIL",
    ]);
    expect(outcomes[0]?.actual).toBe("transport closed");
    expect(outcomes[5]?.precondition).toBe("outside note not seen by the vault-wide search (P1)");
    expect(calls.filter((t) => t === "pattern_search")).toHaveLength(1);
  });

  it("runChecks: an unmet precondition makes no call", async () => {
    const calls: string[] = [];
    const blockedCtx = { ...ready, testVaultListed: false, semanticVaultListed: false };
    const outcomes = await runChecks(
      SCENARIOS,
      inputs,
      blockedCtx,
      async (tool) => calls.push(tool),
      clock(),
    );
    expect(outcomes.every((o) => o.status === "BLOCKED")).toBe(true);
    expect(calls).toEqual([]);
  });
});
