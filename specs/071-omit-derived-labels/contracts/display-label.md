# Contract: `links` display-label rule

**Feature**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

## Published rule

- **Wiki-form links and embeds** (`[[…]]`, `![[…]]`, in the body or in frontmatter (property) links): the entry carries `displayText` only when the author wrote a non-empty alias after the `|` separator that differs from the link target, and the field then carries that alias. This holds with or without a heading, block or other fragment. An empty or blank alias counts as no alias. An editor-derived label such as `"Note > Heading"` is never reported.
- **Markdown links and images** (`[text](…)`, `![alt](…)`): the entry carries the bracketed link text or alt text as written, empty included, unless it equals the target. This is unchanged from before this feature; Markdown labels are out of scope (analysis I1, owner ruling 2026-10-31, option (b)).

Callers detect an author-written wiki alias with one presence check: `"displayText" in entry`.

## Tool description (`LINKS_DESCRIPTION`)

Replace this sentence:

> displayText is present only when the source carries an alias distinct from the link target.

with:

> displayText on a wikilink or embed is present only when the author wrote a non-empty alias after | distinct from the link target, and carries that alias, with or without a heading, block or other fragment and for frontmatter links alike; a Markdown link or image reports its bracketed link text or image alt text as written (empty included) when distinct from the target.

No other sentence in the description changes. The test `index.test.ts` asserts the new sentence is present and that the description contains no `" > "`-shape caveat.

## Help page (`docs/tools/links.md`)

`links[].displayText` row, new text:

> string OPTIONAL — **Wikilinks and embeds**: present only when the author wrote a non-empty alias after `|` distinct from `target`, carrying that alias (`[[Glossary|Terms]]` → `"Terms"`, `![[Note#Part|Intro]]` → `"Intro"`, `![[img.png|300]]` → `"300"`). Absent otherwise, including unaliased heading, block and other fragment links and embeds (`[[Target#Heading]]`, `![[Target#^block-id]]`, `![[paper.pdf#page=3]]`), frontmatter links, and empty or blank aliases (`[[Target|]]`). A single presence check identifies author-written aliases. **Markdown links and images**: the bracketed link text or image alt text as written, empty included, when distinct from `target` (`[See Other](Other-Note.md)` → `"See Other"`, `[](Other-Note.md)` → `""`).

Also on the page:

- Remove the CAVEAT text and the regex workaround (FR-006).
- Remove every statement that embeds never carry the field (FR-007).
- Add a short worked-rows table (a subset of the data-model rows: 1, 4, 6, 9, 10, 14, 16, 20, 23, 26) under the output contract.
- Check each existing example against the rule. None of them currently shows a fragment-bearing link, so no example output is expected to change.

## Registry baseline

`npm run baseline:write`. The expected diff is one line: `links.descriptionFingerprint`. Any other moved fingerprint is a defect.

## Not changed

`linkEntrySchema`, `linksOutputSchema`, `linksEvalResponseSchema`, the `kind` enum, `target`, `line`, ordering, `count`, `total: true`, every error path, Markdown-form `displayText` behaviour, `docs/tools/index.md`, the server instructions, and `backlinks`.
