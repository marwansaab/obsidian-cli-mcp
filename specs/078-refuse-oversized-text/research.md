# Research: Refuse Oversized Text on Add-to-Top

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Findings (F) record what the code and the evidence say today. Decisions (D) record what this BI does and why.

## Findings

### F1. The character limit and its error today

- `MAX_CONTENT_LENGTH = 3072` (`src/tools/prepend/schema.ts:35`) is enforced as `z.string().min(1).max(MAX_CONTENT_LENGTH)` on `content` in `prependInputSchema`. Zod's `.max()` counts UTF-16 code units (`String.length`).
- `registerTool` (`src/tools/_register.ts:179`) runs `spec.schema.parse(args)` before the handler. On a `ZodError` it calls the tool's `mapValidationError` hook and returns `isError: true`. The handler, the filesystem and Obsidian are never reached.
- prepend's hook, `mapZodIssuesToToolError` (`src/tools/prepend/index.ts:30`), returns the first `too_big` issue on `content` as `VALIDATION_ERROR` with message `content exceeds maximum length of 3072 UTF-16 code units (got N)` and `details: { code: "CONTENT_TOO_LARGE", contentLength, maxLength }`. Every other issue falls through to the generic `details.issues[]` envelope.
- The published `inputSchema.properties.content` carries `maxLength: 3072` and the description `Text to add at the top of the note (after any frontmatter), written byte-for-byte; 1 to 3072 characters.` `PREPEND_DESCRIPTION` states the cap twice: the `write_note` hint and the Content paragraph.

### F2. Why the character count is the wrong unit

- The fault is in Obsidian's command-line channel (`Obsidian.com` → `Obsidian.exe` IPC on Windows). It breaks at about 4 KB of argv content. **Evidence for the character limit**: spec 047 FR-008a (10/10 trials passed at 3,584, 0/10 at 4,096, then Obsidian's CLI-receiving state degraded until restart) and the owner's bisect in BI-0120 (4,062 passed, 4,125 failed). The 3,072 limit was chosen to leave about 1 KB for `path=` / `vault=` overhead and for failures that depend on Obsidian's state. Both bisects used plain Latin text, where characters and UTF-8 bytes coincide, so on their own they cannot tell which unit the fault counts.
- **Direct multi-byte evidence**: BI-0123 History records 1,500 × `中` (1,500 characters, under the character limit; 4,500 UTF-8 bytes) crashing Obsidian on release 0.7.8. That is the observation that the fault follows the UTF-8 size, not the character count, and it is the case this BI refuses (contract B1).
- How the text travels: on Windows, libuv hands argv to `CreateProcessW` as UTF-16, and `Obsidian.com` passes it on to the running Obsidian, where the size that matters is the UTF-8 one (BI-0123). UTF-8 sizes are 1 byte for ASCII, 2 for Latin-extended, Greek, Cyrillic, Arabic and Hebrew, 3 for the rest of the Basic Multilingual Plane (CJK, most symbols), and 4 for characters outside it (emoji). A lone surrogate becomes U+FFFD, which is 3 bytes.
- Spec 047 R3 rejected a byte cap at the time only because FR-008 then forbade lowering the cap. FR-008a has since lowered it, so that reason no longer applies.

### F3. Zod 4 behaviour (probed at plan time, zod 4.4.3)

A `.refine()` chained after `.min(1).max(3072)` on the same string:

- runs even when `.max()` has already failed, because `too_big` is a continuable issue. Text of 3,073 ASCII characters yields **two** issues: `too_big`, then `custom`;
- yields only the `custom` issue for text within the character limit but over the byte limit (1,500 × `中`; 769 × `😀`; a lone surrogate plus 3,070 × `a`, which is 3,073 bytes);
- carries a `params` object through to the issue (`{ code: "custom", path: ["content"], params: { … } }`);
- adds nothing to the emitted JSON Schema (`z.toJSONSchema` output is unchanged apart from the description).

1,024 × `中` (3,072 bytes) and 3,072 × `a` both pass.

*Amended at PR #106 review (probed, zod 4):* `.max(3072, { abort: true })` stops the chained check when the length check fails, so text over both limits yields **only** `too_big`. Within the character limit the size check still runs, and `abort` adds nothing to the emitted JSON Schema.

### F4. Tests that encode the old behaviour

- `src/tools/prepend/schema.test.ts:134` "multi-byte content exactly at cap (MAX_CONTENT_LENGTH UTF-16 code units of emojis) → ACCEPTED" sends 1,536 × `🚀` (3,072 code units, 6,144 bytes). That is exactly the case this BI refuses, so the test must be rewritten to expect the size-limit refusal. It is the only existing test whose expectation changes.
- `schema.test.ts:145` (1,537 × `🚀`) still fails, now with both issues. Its assertion (`success === false`) still holds.
- `handler.test.ts:469`, `:488` and `:507` and `handler.bi047.test.ts` use ASCII `x` content (bytes equal characters), so they are unaffected. The character-limit error they assert must stay identical (spec FR-005).
- `index.test.ts:45` checks that the description contains `MAX_CONTENT_LENGTH`, and `:81` checks `maxLength`. Both stay true.

### F5. Published surface and baseline

- The `content` description and `PREPEND_DESCRIPTION` change, so prepend's `descriptionFingerprint` and `schemaFingerprint` in `src/tools/_register-baseline.json` move. Its title, annotations and output schema do not change. No other tool's entry moves.
- `docs/tools/prepend.md` states the cap in five places: the "Prepend more than 3072 characters" row, the `content` field row, the `CONTENT_TOO_LARGE` error row, the *Size ceiling* section and Out of scope. `docs/tools/index.md:26` states it in the prepend summary line. The `help` tool serves `docs/tools/*.md`, so the doc change reaches agents with no code change.

### F6. ADR-015 and the error shape

ADR-015 says: when one error code has several sub-states, add `details.reason` (a kebab-case literal from a closed set listed in `docs/tools/<tool>.md`), and the origin sub-state MAY leave `reason` absent. It rejects a parallel `details.code`. The owner chose this shape at plan time (spec Clarifications, Option A). BI-0123's Related section names ADR-015 as the pattern for this discriminator.

## Decisions

### D1. A second limit in the schema: `MAX_CONTENT_BYTES = 3072`

`schema.ts` exports `MAX_CONTENT_BYTES = 3072`, next to `MAX_CONTENT_LENGTH` and with its own comment citing this spec. `content` gains `.refine((v) => Buffer.byteLength(v, "utf8") <= MAX_CONTENT_BYTES, { message, params: { subReason: "bytes" } })` after `.max()`.

*Amended at PR #106 review:* the check is a `.superRefine` that measures once and adds the `custom` issue with the final message (`… (got N)`) and `params: { subReason: "bytes", contentBytes: N }`, and `.max()` carries `{ abort: true }` (F3 amendment), so the size check runs only on text within the character limit.

- **Rationale**: the check runs where the character limit already runs, before any business logic (Principle III; spec FR-002). Obsidian, the filesystem and target resolution are never reached, in every target mode and with or without `inline`. `Buffer.byteLength(…, "utf8")` measures the UTF-8 size the fault depends on, lone surrogates included (F2, F3), and `sizeChange` in `_note-io.ts` already uses it.
- **Alternatives rejected**: a check in `executePrepend`, which runs after target resolution, so an oversized call on a missing note would report `NOTE_NOT_FOUND` (spec Edge Cases), and which breaks Principle III's "validate at the boundary"; making `.max()` count bytes, which would change the character-limit error (FR-005, FR-007); deriving `MAX_CONTENT_BYTES` from `MAX_CONTENT_LENGTH`, which couples two limits that measure different things and may move apart later.

### D2. The error shape: `CONTENT_TOO_LARGE` with `reason: "bytes"` (ADR-015)

`mapZodIssuesToToolError` returns, in this order:

1. any `too_big` issue on `content` → the existing character-limit error, byte-identical (FR-005);
2. otherwise, a `custom` issue on `content` whose `params.subReason === "bytes"` (the `params.subReason` convention of `find_and_replace`'s mapper) → `VALIDATION_ERROR`, message `content exceeds maximum size of 3072 UTF-8 bytes (got N)`, `details: { code: "CONTENT_TOO_LARGE", reason: "bytes", contentBytes: N, maxBytes: 3072 }`;
3. otherwise, the generic envelope, unchanged.

`contentBytes` is computed from `rawArgs.content` with the same `Buffer.byteLength` call. Step 1 checks all issues for `too_big` before step 2 looks at any `custom` issue, so the precedence rule (spec FR-005, Edge Cases) does not depend on the order Zod reports issues in (F3).

*Amended at PR #106 review:* the precedence now lives in the schema (`abort` on `.max()`, D1 amendment), so `content` never carries both issues and the mapper checks both in one pass. The message and `contentBytes` come from the schema's issue instead of a second `Buffer.byteLength` over `rawArgs`. The returned errors are unchanged.

- **Rationale**: ADR-015 (F6). Agents that already map `CONTENT_TOO_LARGE` to `write_note` keep working. Field names follow the existing `contentLength` / `maxLength` pair, with the unit named.
- **Alternatives rejected**: a new `details.code` (ADR-015 option b, declined by the owner); adding `reason: "characters"` to the existing error, which would change its `details` (FR-005).

### D3. The published descriptions state both limits (FR-009)

- `content` description: `Text to add at the top of the note (after any frontmatter), written byte-for-byte; 1 to ${MAX_CONTENT_LENGTH} characters and at most ${MAX_CONTENT_BYTES} bytes as UTF-8 (most non-Latin characters take 2 to 4 bytes).`
- `PREPEND_DESCRIPTION`: the `write_note` hint says "content over ${MAX_CONTENT_LENGTH} characters or ${MAX_CONTENT_BYTES} UTF-8 bytes". The Content paragraph states both limits, gives its CJK example as `${MAX_CONTENT_BYTES / 3}` characters (derived, never a hard-coded count), says over-limit text fails fast with `VALIDATION_ERROR` / `CONTENT_TOO_LARGE` (with `details.reason: "bytes"` for the size limit), and keeps the existing defect sentence.

Both strings interpolate the constants, so the published values cannot drift from the enforced ones (FR-008). The baseline is regenerated in the same change (F5; MCP Tool Surface Standards, schema dialect).

### D4. Tests

- A new `src/tools/prepend/index.byte-cap.test.ts` drives `createPrependTool(...).handler` (the registered path that runs the schema and the mapper) through contract §3 examples B1–B16. Refused calls use a registry stub and a spawn spy that fail the test if reached.
- `schema.test.ts`: rewrite the emoji-at-cap test (F4), and add byte-boundary cases (3,072 bytes accepted for ASCII, 2-byte, 3-byte and 4-byte scripts and for text ending in a CRLF; one byte over refused with only the `custom` issue; both limits broken gives both issues). *Amended at PR #106 review:* both limits broken now gives only the `too_big` issue. The registered-path character-limit tests that were in `handler.test.ts` (cap + 1, cap × 10, exactly at cap) moved into `index.byte-cap.test.ts`. The first and last were already covered by B5 and B7, so only cap × 10 was added there.
- `index.test.ts`: the description and the `content` description contain `MAX_CONTENT_BYTES` and "bytes".

### D5. Documentation

`docs/tools/prepend.md`: the field row, the routing row, the error table (a new row for `reason: "bytes"`, and the `CONTENT_TOO_LARGE` closed `reason` set: absent = character limit, `"bytes"` = size limit), the *Size ceiling* section (bytes, the per-script sizes, examples such as 1,024 CJK characters, why the limit is 3,072 bytes) and Out of scope. Also `docs/tools/index.md` (prepend line) and `CHANGELOG.md` (`[Unreleased]`, Changed). Header intent lines of `schema.ts` and `index.ts` are updated (Principle V). `.docs-as-code/` is left to `/speckit-docs-as-code` after review.

### D6. Live verification

Under `.memory/test-execution-instructions.md`, after the build: 1,500 × `中` is refused with the size-limit error, Obsidian shows no dialog and keeps answering, and the note is unchanged. 1,024 × `中` (3,072 bytes) lands with no dialog (spec FR-013). Because the refusal never reaches Obsidian, no probe deliberately sends an oversized payload to Obsidian.
