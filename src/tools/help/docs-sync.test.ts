// Original — no upstream. Help-docs drift guard (spec 084 FR-012): the help pages and index entries in docs/tools match the offered tools exactly, the reverse of assertToolDocsExist. BI-0174: every page carries the Input, Output, Errors and Examples H2 sections (TC-00586).
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DOCS_DIR, listToolPages } from "./handler.js";
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
    // The default server: no OBSIDIAN_MCP_* access flag from the shell narrows the offered set.
    const client = await connectModernClient(quietServer({}), "docs-sync");
    let toolNames: string[];
    try {
      toolNames = (await client.listTools()).tools.map((t) => t.name);
    } finally {
      await client.close();
    }
    // The pages help lists as `availableTools`. `missingPages` cannot fire here: createServer's
    // assertToolDocsExist refuses to boot first, so only the H3 self-test exercises it.
    const pageNames = await listToolPages(DOCS_DIR);
    const indexText = await readFile(join(DOCS_DIR, "index.md"), "utf8");

    expect(helpDocsDrift(toolNames, pageNames, indexText)).toEqual(NO_DRIFT);
  });
});

/** The section words every help page carries as H2 headings (TC-00586; suffixes allowed, e.g. `## Errors — Error roster`). */
const REQUIRED_SECTIONS = ["Input", "Output", "Errors", "Examples"] as const;

/** The required words a page has no `## <word>…` heading for; headings inside fenced code blocks do not count. */
function missingSections(markdown: string): string[] {
  const prose = markdown.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "");
  const headings = [...prose.matchAll(/^## (.+)$/gm)].map((m) => m[1]!);
  return REQUIRED_SECTIONS.filter((word) => !headings.some((h) => h.startsWith(word)));
}

describe("help page sections (BI-0174, TC-00586)", () => {
  it("self-test: a heading inside a code fence does not count, and a suffixed heading does", () => {
    const page = ["## Input", "```", "## Output", "```", "## Errors — Error roster", "## Examples"].join("\n");
    expect(missingSections(page)).toEqual(["Output"]);
  });

  it("every tool page has H2 headings beginning Input, Output, Errors and Examples", async () => {
    const pageNames = await listToolPages(DOCS_DIR);
    const missing: Record<string, string[]> = {};
    for (const name of pageNames) {
      const gaps = missingSections(await readFile(join(DOCS_DIR, `${name}.md`), "utf8"));
      if (gaps.length > 0) missing[name] = gaps;
    }
    expect(pageNames.length).toBeGreaterThan(0);
    expect(missing).toEqual({});
  });
});
