// Original — no upstream. Help-docs drift guard (spec 084 FR-012): the help pages and index entries in docs/tools match the offered tools exactly, the reverse of assertToolDocsExist.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { connectModernClient, quietServer } from "../_mcp-client-fixtures.js";

interface HelpDocsDrift {
  orphanPages: string[];
  missingPages: string[];
  extraIndexEntries: string[];
  missingIndexEntries: string[];
}

/** Compare the offered tool names with the help page names and the `- **<name>** —` index entries. */
function helpDocsDrift(toolNames: readonly string[], pageNames: readonly string[], indexText: string): HelpDocsDrift {
  const tools = new Set(toolNames);
  const pages = new Set(pageNames);
  const entries = [...indexText.matchAll(/^- \*\*([^*]+)\*\* —/gm)].map((m) => m[1]!);
  const seen = new Set<string>();
  const extraIndexEntries: string[] = [];
  for (const entry of entries) {
    // An entry for a tool not offered, or a repeat of an entry already seen, is extra.
    if (!tools.has(entry) || seen.has(entry)) extraIndexEntries.push(entry);
    seen.add(entry);
  }
  return {
    orphanPages: pageNames.filter((p) => !tools.has(p)).sort(),
    missingPages: toolNames.filter((t) => !pages.has(t)).sort(),
    extraIndexEntries: extraIndexEntries.sort(),
    missingIndexEntries: toolNames.filter((t) => !seen.has(t)).sort(),
  };
}

const index = (...names: string[]): string =>
  ["# Available Tools", "", ...names.map((n) => `- **${n}** — does ${n}.`)].join("\n");

const NO_DRIFT: HelpDocsDrift = { orphanPages: [], missingPages: [], extraIndexEntries: [], missingIndexEntries: [] };

describe("helpDocsDrift (self-tests)", () => {
  it("H5: matching tools, pages and index give no drift", () => {
    expect(helpDocsDrift(["read", "help"], ["help", "read"], index("help", "read"))).toEqual(NO_DRIFT);
  });

  it("H3: a page for a tool not offered is an orphan, and an offered tool without a page is missing", () => {
    expect(helpDocsDrift(["read", "help"], ["help", "phantom"], index("help", "read"))).toEqual({
      ...NO_DRIFT,
      orphanPages: ["phantom"],
      missingPages: ["read"],
    });
  });

  it("H4: a phantom index entry is extra, an offered tool absent from the index is missing, and a repeat counts once", () => {
    expect(helpDocsDrift(["read", "help"], ["help", "read"], index("help", "phantom", "help"))).toEqual({
      ...NO_DRIFT,
      extraIndexEntries: ["help", "phantom"],
      missingIndexEntries: ["read"],
    });
  });
});

describe("help docs match the offered tools (spec 084 H1, H2)", () => {
  it("docs/tools pages and index.md entries name exactly the tools in tools/list", async () => {
    const client = await connectModernClient(quietServer(), "docs-sync");
    let toolNames: string[];
    try {
      toolNames = (await client.listTools()).tools.map((t) => t.name);
    } finally {
      await client.close();
    }
    const docsDir = join(process.cwd(), "docs", "tools");
    const pageNames = readdirSync(docsDir)
      .filter((f) => f.endsWith(".md") && f !== "index.md")
      .map((f) => f.slice(0, -".md".length));
    const indexText = readFileSync(join(docsDir, "index.md"), "utf8");

    expect(helpDocsDrift(toolNames, pageNames, indexText)).toEqual(NO_DRIFT);
  });
});
