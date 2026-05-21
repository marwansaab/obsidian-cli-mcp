// Original — no upstream. patch_heading heading-walk pure-function tests per BI-040 / Principle II — parseHeadingPath, ATX-scan with fenced-code opacity (R3 / FR-013), parent-chain bookkeeping with first-match-wins (FR-006), right-text-wrong-parent failure, race-identity 3-tuple (R4 / FR-019), reach + direct-body boundary math.
import { describe, expect, it } from "vitest";

import {
  parseHeadingPath,
  REACH_END_EOF,
  resolveHeadingIdentity,
  walkHeadings,
} from "./heading-walk.js";

describe("parseHeadingPath", () => {
  it("splits 'Top#Sub' into ['Top', 'Sub']", () => {
    expect(parseHeadingPath("Top#Sub")).toEqual(["Top", "Sub"]);
  });

  it("splits 3-segment path into 3 elements", () => {
    expect(parseHeadingPath("Top#Sub#Leaf")).toEqual(["Top", "Sub", "Leaf"]);
  });

  it("preserves a trailing empty segment from trailing '#'", () => {
    expect(parseHeadingPath("Top#Sub#")).toEqual(["Top", "Sub", ""]);
  });

  it("returns a single-element array for an input without '#'", () => {
    expect(parseHeadingPath("Top")).toEqual(["Top"]);
  });
});

describe("walkHeadings — happy paths", () => {
  it("resolves 'Top#Sub' against '# Top / ## Sub'", () => {
    const content = "# Top\n## Sub\nbody\n";
    const r = walkHeadings(content, ["Top", "Sub"]);
    expect(r).not.toBeNull();
    expect(r!.markerLineIndex).toBe(1);
    expect(r!.markerLineText).toBe("## Sub");
    expect(r!.rank).toBe(2);
    expect(r!.parentChainText).toBe("Top");
  });

  it("resolves 'Top#A#X' against '# Top / ## A / ### X / ### Y / ## B'", () => {
    const content =
      "# Top\n" +
      "## A\n" +
      "### X\n" +
      "x-body\n" +
      "### Y\n" +
      "y-body\n" +
      "## B\n" +
      "b-body\n";
    const r = walkHeadings(content, ["Top", "A", "X"]);
    expect(r).not.toBeNull();
    expect(r!.markerLineText).toBe("### X");
    expect(r!.rank).toBe(3);
    expect(r!.parentChainText).toBe("Top#A");
    // Reach ends at the next equal-or-higher-rank heading (### Y at line 4).
    expect(r!.reachEndLineIndex).toBe(4);
  });

  it("resolves headings at ATX ranks 1, 2, and 6", () => {
    const rank2 = "# A\n## B\n";
    expect(walkHeadings(rank2, ["A", "B"])!.rank).toBe(2);
    const rank6 =
      "# A\n## B\n### C\n#### D\n##### E\n###### F\n";
    const r = walkHeadings(rank6, ["A", "B", "C", "D", "E", "F"]);
    expect(r).not.toBeNull();
    expect(r!.rank).toBe(6);
  });

  it("resolves headings with special characters in the text", () => {
    const content = "# Top\n## Sub & Co.\n## 2026/05/21\n## Tasks (P1)\n";
    expect(walkHeadings(content, ["Top", "Sub & Co."])!.markerLineText).toBe("## Sub & Co.");
    expect(walkHeadings(content, ["Top", "2026/05/21"])!.markerLineText).toBe("## 2026/05/21");
    expect(walkHeadings(content, ["Top", "Tasks (P1)"])!.markerLineText).toBe("## Tasks (P1)");
  });
});

describe("walkHeadings — failure paths", () => {
  it("returns null when the leaf is not present", () => {
    const content = "# Top\n## Sub\n";
    expect(walkHeadings(content, ["Top", "Other"])).toBeNull();
  });

  it("returns null when the ancestor is not present", () => {
    const content = "# Other\n## Sub\n";
    expect(walkHeadings(content, ["Top", "Sub"])).toBeNull();
  });

  it("returns null on right-text-wrong-parent ('Top#Sub' against '# Other / ## Sub')", () => {
    const content = "# Other\n## Sub\n";
    expect(walkHeadings(content, ["Top", "Sub"])).toBeNull();
  });

  it("returns null when the leaf exists at a different ancestor", () => {
    const content = "# Top\n# Other\n## Sub\n";
    expect(walkHeadings(content, ["Top", "Sub"])).toBeNull();
  });
});

describe("walkHeadings — first-match-wins (FR-006)", () => {
  it("returns the first '## Sub' when two appear under '# Top'", () => {
    const content =
      "# Top\n" +
      "## Sub\n" +
      "body A\n" +
      "## Sub\n" +
      "body B\n";
    const r = walkHeadings(content, ["Top", "Sub"]);
    expect(r).not.toBeNull();
    // Marker of the FIRST ## Sub is line index 1.
    expect(r!.markerLineIndex).toBe(1);
    // Reach ends at the SECOND ## Sub (line 3) — that's the next equal-rank heading.
    expect(r!.reachEndLineIndex).toBe(3);
  });
});

describe("walkHeadings — fenced-code opacity (FR-013)", () => {
  it("does not treat '#'-prefixed lines inside ``` fences as headings", () => {
    const content =
      "# Top\n" +
      "## Real\n" +
      "```\n" +
      "# pseudo-heading inside fence\n" +
      "```\n" +
      "## After\n";
    // 'Top#pseudo-heading inside fence' must NOT resolve.
    expect(walkHeadings(content, ["Top", "pseudo-heading inside fence"])).toBeNull();
    // 'Top#Real' and 'Top#After' both resolve through the fence.
    expect(walkHeadings(content, ["Top", "Real"])!.markerLineText).toBe("## Real");
    expect(walkHeadings(content, ["Top", "After"])!.markerLineText).toBe("## After");
  });

  it("does not treat '#'-prefixed lines inside ~~~ fences as headings", () => {
    const content =
      "# Top\n" +
      "~~~\n" +
      "## should not match\n" +
      "~~~\n" +
      "## After\n";
    expect(walkHeadings(content, ["Top", "should not match"])).toBeNull();
    expect(walkHeadings(content, ["Top", "After"])!.markerLineText).toBe("## After");
  });
});

describe("walkHeadings — ATX-only (R2)", () => {
  it("does not recognise setext headings", () => {
    // 'Top' as setext rank-1 followed by an `===` underline; 'Sub' as setext rank-2 with '---'.
    const content =
      "Top\n" +
      "===\n" +
      "Sub\n" +
      "---\n" +
      "body\n";
    expect(walkHeadings(content, ["Top", "Sub"])).toBeNull();
  });
});

describe("resolveHeadingIdentity", () => {
  it("extracts the (markerLineText, rank, parentChainText) tuple", () => {
    const content = "# Top\n## Sub\nbody\n";
    const r = walkHeadings(content, ["Top", "Sub"])!;
    const identity = resolveHeadingIdentity(r);
    expect(identity).toEqual({
      markerLineText: "## Sub",
      rank: 2,
      parentChainText: "Top",
    });
  });

  it("compares byte-identically when all three fields match", () => {
    const r1 = walkHeadings("# Top\n## Sub\n", ["Top", "Sub"])!;
    const r2 = walkHeadings("# Top\n## Sub\n", ["Top", "Sub"])!;
    expect(resolveHeadingIdentity(r1)).toEqual(resolveHeadingIdentity(r2));
  });

  it("differs when any single field differs (renamed leaf)", () => {
    const r1 = walkHeadings("# Top\n## Sub\n", ["Top", "Sub"])!;
    const r2 = walkHeadings("# Top\n## Renamed\n", ["Top", "Renamed"])!;
    expect(resolveHeadingIdentity(r1)).not.toEqual(resolveHeadingIdentity(r2));
  });
});

describe("walkHeadings — reach + direct-body boundaries", () => {
  it("reachEndLineIndex points to the next equal-or-higher-rank heading's marker line", () => {
    const content =
      "# Top\n" +     // 0
      "## A\n" +      // 1
      "a-body\n" +    // 2
      "## B\n" +      // 3
      "b-body\n";     // 4
    const r = walkHeadings(content, ["Top", "A"])!;
    expect(r.reachEndLineIndex).toBe(3); // ## B
  });

  it("reachEndLineIndex is EOF sentinel when no equal-or-higher-rank heading follows", () => {
    const content =
      "# Top\n" +
      "## A\n" +
      "a-body\n";
    const r = walkHeadings(content, ["Top", "A"])!;
    expect(r.reachEndLineIndex).toBe(REACH_END_EOF);
  });

  it("directBodyEndLineIndex points to the first child heading inside the reach", () => {
    const content =
      "# Top\n" +
      "## A\n" +
      "a-body-direct\n" +
      "### Child\n" +
      "child-body\n" +
      "## B\n";
    const r = walkHeadings(content, ["Top", "A"])!;
    expect(r.directBodyEndLineIndex).toBe(3); // ### Child
    expect(r.reachEndLineIndex).toBe(5);       // ## B
  });

  it("directBodyEndLineIndex equals reachEndLineIndex when no child exists", () => {
    const content = "# Top\n## A\na-body\n## B\n";
    const r = walkHeadings(content, ["Top", "A"])!;
    expect(r.directBodyEndLineIndex).toBe(r.reachEndLineIndex);
  });
});
