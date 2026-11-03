# Bug Assessment: renamed parameters still surface under their old names on error paths

- **Slug**: bi-0182
- **Created**: 2026-11-03
- **Source**: pasted text (backlog item BI-0182, filed 2026-11-02 from the 0.9.0-local test run; follow-up to BI-0109 / spec 073, convention ADR-046)
- **Verdict**: valid in part. Sub-item 1 is a defect against spec 073 research D6 and ADR-046 Decision 5. Sub-item 2 is the behaviour ADR-046 deliberately chose. Sub-item 3 is a documentation gap: spec 073 FR-011 makes the notice success-only, but the published descriptions do not say so.
- **Severity**: low

## Report (verbatim or summarized)

Condensed from the pasted BI-0182 text:

> BI-0109 renamed parameters so that a tool family shares one vocabulary, and ADR-046 requires the new name everywhere a caller sees it. On error paths the rename is only half done. The same mistake is reported under the old name on one tool and under the new name on another, and the `find_and_replace` error's code and detail key disagree with its own message. Impact is low: only error paths are affected and no data is at risk. Observed on `@marwansaab/obsidian-cli-mcp@0.9.0-local`. There is no dedicated TC yet; the BI-0109 TCs check success paths and pass. Three sub-items:
>
> 1. `find_by_property` with `property: ""` (the deprecated name) reports the validation issue on path `["property"]`. ADR-046 says error details use the resolved new name (`name`), and `create_base` already does so for its renamed parameter.
> 2. `find_and_replace` errors for the renamed folder parameter still carry `details.code: "INVALID_SUBFOLDER"` and a `details.subfolder` key, while the messages say `folder`.
> 3. Error responses to calls that use an old parameter name carry no `deprecated_parameters` entry, although the description says calls using old names receive one. It may be success-only by design; if so, the description must say so.

Acceptance criteria (summarised):

- **Errors use current names.** An empty value sent under the retired name fails with an error that names the current input, identical to the error for the same mistake made under the current name.
- **Consistent error vocabulary.** For a `find_and_replace` folder that does not exist, the error code, the detail field and the message all name the folder input by its current name.
- **Deprecation notice on failure.** A failing call that used a retired name says the name is retired and gives the current one. Or, if notices are deliberately limited to successful calls, the documentation says so and no tool claims otherwise.

Out of scope (per the report): removing support for the retired names; renaming any further inputs; changing successful responses.

## Symptom

1. A value check that the published schema runs on the old key itself (`property: z.string().min(1)` on `find_by_property`, `view: z.string().min(1)` on `create_base`) fails before the old key is folded onto the new name. The issue therefore carries the old name. Expected (spec 073 D6): "Every validation issue for a renamed concept uses the new name in its issue `path`, its message and, where present, `params.field`, whichever key the caller used."
2. `find_and_replace`'s missing-folder error says `folder "<x>" does not exist in vault` but returns `details: { code: "INVALID_SUBFOLDER", reason: "not-found", subfolder: <x>, vault }`. The path-traversal error has the same `INVALID_SUBFOLDER` code. This is the documented, deliberate state (see Root Cause).
3. No error response carries `deprecated_parameters`. The three tool descriptions say "a call that uses one gets `deprecated_parameters` in its result" and do not limit that to successful calls.

## Reproduction

Probe run during this assessment: `tsx` against the current schemas, in-process, with no vault or CLI involved.

| Input | Issue path | Issue code / message |
|---|---|---|
| `find_by_property` `{ property: "", value: "x" }` | `["property"]` | `too_small` / `Too small: expected string to have >=1 characters` |
| `find_by_property` `{ name: "", value: "x" }` | `["name"]` | `too_small` / same message |
| `create_base` `{ path: "", name: "n" }` | `["base_path"]` | `custom` / `INVALID_BASE_PATH/empty: base_path is empty` (correct, the precedent) |
| `create_base` `{ base_path: "a.base", name: "n", view: "" }` | `["view"]` | `too_small` (**same defect, not in the report**) |
| `create_base` `{ base_path: "a.base", name: "n", view_name: "" }` | `["view_name"]` | `too_small` |
| `find_and_replace` `{ …, subfolder: "../x" }` | `["folder"]` | path-safety custom issue (correct) |
| `find_by_property` `{ name: "a", value: "x", arrayMatch: "x" }` | `["arrayMatch"]` | `invalid_type` (wrong type on an old key; see Q3) |
| `create_base` `{ path: 5, name: "n" }` | `["path"]` | `invalid_type` / `base_path must be a string` (path and message disagree; see Q3) |

`find_by_property` has no `mapValidationError` hook, so the generic envelope from `registerTool` (`details.issues[].path`) shows the old name to the caller. `create_base`'s hook passes non-sub-coded issues through to the same generic envelope.

Sub-item 2: `handler.test.ts:603-628` and `index.test.ts:148-163` in `src/tools/find_and_replace/` pin the current details. Sub-item 3 can be seen by reading `registerTool` (`src/tools/_register.ts:194-201`), which returns the validation envelope before any handler runs, and the three `index.ts` wrappers, which call `withDeprecatedParameters` only on a resolved handler result.

## Suspected Code Paths

- `src/tools/find_by_property/schema.ts:32`: `property: deprecatedAlias(z.string().min(1), PROPERTY_RENAME)`. The `.min(1)` runs on the outer (published) object, before `foldDeprecatedAliases`, so an empty value is reported at `["property"]`. The folded schema already re-checks the resolved value with `requiredString("name").min(1)` (`:63`), so this check is redundant as well as misreported.
- `src/tools/create_base/schema.ts:36`: `view: deprecatedAlias(z.string().min(1), VIEW_RENAME)`. Same defect for `view` → `view_name`. The folded schema keeps `view_name: z.string().min(1).optional()` from the published shape, so the check would still run on the resolved name. By contrast `create_base`'s `path` alias (`:21`, `requiredString("base_path")` with no `min`) is why `path: ""` already reports `base_path`.
- `src/tools/_deprecated-params.ts:30-35` (`deprecatedAlias`) and `:54-78` (`foldDeprecatedAliases`): the fold runs only when the outer object parses. Any value or type issue on an old key stops the pipe first and keeps the old path. The design is correct; the defect is the redundant value checks placed on the alias fields.
- `src/tools/find_and_replace/handler.ts:547-562` (`resolveScope`, the `realpathOrThrow` `onMissing` builder): `details.code: "INVALID_SUBFOLDER"` and `details.subfolder`. The same code is lifted for path traversal in `src/tools/find_and_replace/index.ts:135-147`. This is deliberate (see Root Cause).
- `src/tools/find_by_property/index.ts:25`, `src/tools/find_and_replace/index.ts:46`, `src/tools/create_base/index.ts:30`: "a call that uses one gets `deprecated_parameters` in its result", which does not say "successful".
- `docs/tools/find_by_property.md:57`, `docs/tools/find_and_replace.md:48`, `docs/tools/create_base.md:35`: "A call that uses an old name gets the same result as the new name, plus a `deprecated_parameters` field". This is true only of successful calls and does not say so.

## Root Cause Hypothesis

**Sub-item 1 (confidence high, proven by the probe).** Spec 073's fold design (`.transform(foldDeprecatedAliases(...)).pipe(<new-name schema>)`, refactor-decisions item 34) validates resolved values on the new-name side. Two alias fields, however, still carry a value check of their own (`min(1)`), copied from the new field's type when the aliases were declared. zod runs the outer object's field checks before the transform, so those two checks fire under the old name. That breaks D6 ("whichever key the caller used") and ADR-046 Decision 5 ("validation of the resolved value reports the new name"). `create_base`'s `path` alias has no such check, which is why it behaves correctly. Wrong-type values on an old key (`arrayMatch: "x"`, `path: 5`) fail the same way, but there the type is the published contract of the alias key, not a redundant copy (see Q3).

**Sub-item 2 (confidence high: a decided design, not a defect).** ADR-046 Decision 5 says "machine-readable error codes and `details` keys do not change", and its Consequences say "`find_and_replace`'s INVALID_SUBFOLDER details keep their `subfolder` key". Spec 073 FR-009 ("error codes … stay as they are"), research D6 ("The `details` keep `code: "INVALID_SUBFOLDER"`, `reason: "not-found"` and the `subfolder` key, so the machine-readable shape is byte-stable") and `contracts/parameter-names-contract.md` §4 all pin the same choice. The tool description already documents `folder` → `INVALID_SUBFOLDER` (`index.ts:25`). The report's acceptance criterion conflicts with a Decided ADR. Under CLAUDE.md that conflict goes to the owner (Q1) and must not be silently overridden.

**Sub-item 3 (confidence high: design success-only, wording ambiguous).** Spec 073 clarify Q2 ("Where does the deprecation notice go in a successful response?") and FR-011 ("A successful call that used an old name MUST carry a deprecation notice in its result object") limit the notice to successes. FR-009 forbids other result or error changes. The three descriptions and three help pages say "a call that uses one", and ADR-046 Decision 5 says "the call's result carries", without the word "successful". The code matches the spec; the published wording overstates it.

## Proposed Remediation

**Preferred** (confirmed by the owner's rulings on Q1–Q3, all option A; see Open Questions):

1. **Sub-item 1.** Drop the redundant value checks from the two alias fields, so that the value is checked once, on the resolved new name:
   - `find_by_property/schema.ts:32` → `property: deprecatedAlias(z.string(), PROPERTY_RENAME)`;
   - `create_base/schema.ts:36` → `view: deprecatedAlias(z.string(), VIEW_RENAME)`.

   The folded schemas already enforce `min(1)` on `name` and `view_name`. The probe confirms that the inner `requiredString("name").min(1)` gives the same `code` (`too_small`) and `message` as the published `name` check, so `property: ""` and `name: ""` produce identical envelopes (`path: ["name"]`), which meets the "identical" criterion. This is a published-surface change: the `property` and `view` keys lose `minLength: 1` in `tools/list`. It is therefore a deliberate FR-018 fingerprint move (`npm run baseline:write`), with `create_base`'s `path` alias as precedent. Wrong-type issues on old keys are left as they are unless the owner rules otherwise in Q3.
2. **Sub-item 2.** Per Q1's recommended option: no code change. `INVALID_SUBFOLDER` and `details.subfolder` stay (ADR-046 Decision 5 and Consequences). The help page `docs/tools/find_and_replace.md` gains one sentence stating that the folder errors keep the stable code `INVALID_SUBFOLDER` and the `subfolder` detail key until the next major release, so a reader sees that the mismatch is deliberate.
3. **Sub-item 3.** Per Q2's recommended option, documentation only. The three descriptions change "a call that uses one gets `deprecated_parameters` in its result" to say a *successful* call gets it, and that error responses do not carry it. The three help pages get the same wording. This changes description bytes, so it is a deliberate fingerprint move again, in the same `baseline:write`. The ADR-046 text ("the call's result carries") is left to the owner and the docs-as-code pass; this fix does not edit `.decisions/`.

**Alternatives**:

- *Sub-item 1, remap instead of loosen.* Give `find_by_property` a `mapValidationError` hook, extend `create_base`'s hook, and add a shared `renameIssuePaths(issues, renames)` helper in `_deprecated-params.ts`. The helper would rewrite every old-key issue path, except the old+new conflict issue, to the replacement name. This keeps the published bytes for `property` and `view`, and also covers the wrong-type cases (Q3, option B). It costs more code: `find_by_property` needs a new hook, and `find_and_replace`'s hook would also need the remap for `case_insensitive`/`subfolder` type errors.
- *Sub-item 2, rename or add.* Rename the code and key (`INVALID_FOLDER`, `details.folder`). This is a breaking error-contract change and needs a new ADR superseding part of ADR-046. Alternatively, add `details.folder` next to `details.subfolder` and keep the code. That is additive, but it still changes a `details` shape ADR-046 froze, and the code stays old-named. See Q1.
- *Sub-item 3, notice on failure.* Attach `details.deprecated_parameters` to error envelopes. On handler failures the `index.ts` wrappers would catch `UpstreamError`. On validation failures each tool's `mapValidationError` would derive the notices from `rawArgs`, which `find_by_property` would first need a hook for. This adds a `details` key on every error code of three tools, against FR-009 and ADR-046 Decision 5. See Q2.

**Files likely to change** (preferred path):

- `src/tools/find_by_property/schema.ts`
- `src/tools/create_base/schema.ts`
- `src/tools/find_by_property/index.ts`, `src/tools/find_and_replace/index.ts`, `src/tools/create_base/index.ts` (description wording, sub-item 3)
- `src/tools/_register-baseline.json` (regenerated through `npm run baseline:write`; deliberate change)
- `docs/tools/find_by_property.md`, `docs/tools/find_and_replace.md`, `docs/tools/create_base.md`
- Tests: `src/tools/find_by_property/schema.test.ts`, `src/tools/create_base/schema.test.ts`, and `index.test.ts` for both tools

**Tests to add or update**:

- `find_by_property` schema: `{ property: "", value }` and `{ name: "", value }` produce the same single issue (path `["name"]`, code `too_small`, same message). An index-level case pins the identical `VALIDATION_ERROR` envelope through the registered tool.
- `create_base` schema: `{ …, view: "" }` and `{ …, view_name: "" }` produce the same single issue at `["view_name"]`.
- The existing O2 equivalence and O4 conflict batteries (`deprecatedAliasCases`) must still pass unchanged. The conflict issue for `property` + `name` stays at `["property"]`, because it is about the old key itself.
- Sub-item 3: each tool's description test asserts the success-only wording. The `_surface.test.ts` family checks must still pass.
- Sub-item 2 (preferred path): the existing `INVALID_SUBFOLDER` assertions stay unchanged and keep pinning the frozen contract.

## Risks & Considerations

- **Published-surface change.** Dropping `minLength` on two deprecated keys and rewording three descriptions moves the FR-018 fingerprint. That is a deliberate gate, recorded in the fix and the PR. A client that validated `property`/`view` locally will now send `""` to the server and get the server-side error at the new name, which is the intended behaviour.
- **No existing test edit is expected for sub-item 1.** No test sends `property: ""` or `view: ""` today (grep). If an existing assertion fails, stop and raise it (refactor-decisions item 5).
- **ADR conflict.** Any option for sub-item 2 other than "keep" contradicts the Decided ADR-046 and spec 073 FR-009 and D6, and needs a new ADR. Renaming the code is breaking for callers that branch on `INVALID_SUBFOLDER`.
- **Error-path `details` growth (sub-item 3, option B).** Adding a key to every error of three tools widens the error contract; ADR-015 and ADR-046 treat `details` as stable.
- **Principle IV.** No new top-level error code under any option. The preferred path touches no `UpstreamError` construction.

## CodeGraph structural check

- **Affected modules.** `src/tools/find_by_property/` (schema, index), `src/tools/create_base/` (schema, index), `src/tools/find_and_replace/` (index description; `handler.ts` only under Q1 options B/C), and `src/tools/_deprecated-params.ts` (only under the remap alternative or Q3 B).
- **Blast radius.** `deprecatedAlias` / `foldDeprecatedAliases` / `withDeprecatedParameters` are used only by the three renamed tools' schema and index modules (`withDeprecatedParameters`: callers in the three `index.ts` files; tested in `_deprecated-params.test.ts`). `requiredString` is shared with `query_base`, but the fix does not change it. `registerTool` sits among the most-depended-on symbols in the boot spine; the preferred fix does not change it, and the error envelope it builds (`_register.ts:187-201`) is consumed as is. `realpathOrThrow` / `resolveScope` (`find_and_replace/handler.ts:410`, `:524`) are reached only from `executeFindAndReplace`, and they change only under Q1 B/C.
- **Kernel nodes.** The preferred fix touches none of them: no change to `createLogger()`, `createQueue()`, `createServer()`, or the `UpstreamError` class (no new construction site, no code added to `src/errors.ts`). Q1 option B or C would change the `details` of one existing `UpstreamError` construction in `find_and_replace/handler.ts`, not the class. Post-fix verification checks against this no-touch claim.

## Open Questions

- **Q1 — `find_and_replace`'s folder error vocabulary (sub-item 2) conflicts with ADR-046.**

  Context: the missing-folder error is built in `resolveScope` (`src/tools/find_and_replace/handler.ts:551-561`), reached only from `executeFindAndReplace`, with `details: { code: "INVALID_SUBFOLDER", reason: "not-found", subfolder, vault }`. The path-traversal case is lifted to `INVALID_SUBFOLDER` by the tool's `mapValidationError` (`index.ts:135-147`). ADR-046 (Decided) Decision 5 says "machine-readable error codes and `details` keys do not change", and its Consequences name this exact key: "`find_and_replace`'s INVALID_SUBFOLDER details keep their `subfolder` key". Spec 073 FR-009, research D6 and the parameter-names contract §4 say the same. The BI's acceptance criterion asks for code, detail key and message to all name `folder`.

  | Option | Description |
  |--------|-------------|
  | A (recommended) | Keep `INVALID_SUBFOLDER` and `details.subfolder` as ADR-046 decided, and close sub-item 2 as by design. Add one sentence to `docs/tools/find_and_replace.md` saying the folder errors keep the stable code and key until the next major release. The code rename joins the removal follow-up at the next major release. |
  | B | Rename to a `folder`-named code and key now (for example `INVALID_FOLDER`, `details.folder`). Breaking for callers that branch on `INVALID_SUBFOLDER`; needs a new ADR superseding ADR-046 Decision 5 and Consequences for this case, and updates to existing tests (`handler.test.ts:603-675`, `index.test.ts:148-163`, `schema.test.ts:397-402`). |
  | C | Additive: keep the code and `details.subfolder`, and add `details.folder` with the same value. Non-breaking, but it still changes a `details` shape ADR-046 froze (new ADR or amendment needed), and the code stays old-named, so the criterion is only partly met. |

  Recommended: **A**. ADR-046 deliberately keeps machine-readable codes stable during the transition, so that no caller's error handling breaks before the next major release. Renaming the code is exactly the kind of breaking change that ADR reserves for the removal follow-up. The message already names `folder`, and the description already maps `folder` → `INVALID_SUBFOLDER`.

  Resolved (Relay): **A** (owner ruling 2026-11-03, recorded on BI-0182, sub-item 2). `INVALID_SUBFOLDER` and `details.subfolder` stay unchanged, and sub-item 2 is closed as by design, per ADR-046 Decision 5 and its Consequences. `docs/tools/find_and_replace.md` gains one sentence saying that the folder errors keep the stable code and key until the next major release. The code and key are renamed only in the removal follow-up at the next major release. No test changes for sub-item 2. The "consistent error vocabulary" criterion counts as met by the existing `folder` message plus that sentence.

- **Q2 — Deprecation notice on failed calls (sub-item 3).**

  Context: `registerTool` (`src/tools/_register.ts:194-201`) returns the validation envelope before any handler runs. The three `index.ts` wrappers call `withDeprecatedParameters` only on a resolved handler result. Spec 073 clarify Q2 and FR-011 define the notice for "a successful call", and FR-009 forbids other error changes. The three descriptions (`find_by_property/index.ts:25`, `find_and_replace/index.ts:46`, `create_base/index.ts:30`) and the three help pages say "a call that uses one gets `deprecated_parameters` in its result", without the word "successful".

  | Option | Description |
  |--------|-------------|
  | A (recommended) | Documentation only. The three descriptions and the three help pages say that a *successful* call using an old name gets `deprecated_parameters` and that error responses do not carry it. Description bytes move (deliberate fingerprint change). |
  | B | Notice on failure too. Every error response to a call that used an old name gains `details.deprecated_parameters`: handler failures through a catch in each `index.ts` wrapper, validation failures through each tool's `mapValidationError` from `rawArgs` (`find_by_property` gains a hook). Widens every error's `details` on three tools, against FR-009 and ADR-046 Decision 5, so it needs an ADR amendment. |

  Recommended: **A**. It is the report's own fallback ("if notices are deliberately limited to successful calls, the documentation says so"). It matches the decided design (FR-011 success-only, FR-009 errors unchanged), and it changes no machine-readable surface.

  Resolved (Relay): **A** (owner ruling 2026-11-03). Documentation only. The three descriptions and the three help pages say that a successful call using an old name gets `deprecated_parameters`, and that error responses do not carry it. The BI's own criterion allows this ("if notices are deliberately limited to successful calls, the documentation says so and no tool claims otherwise"). ADR-046 Decision 5 puts the notice on the call's result and keeps error `details` keys unchanged. Option B would have widened error `details` against that decision.

- **Q3 — Scope of sub-item 1: empty values only, or wrong-type values on old keys too?**

  Context: the probe shows two classes of old-key issue. Redundant value checks on alias fields (`find_by_property/schema.ts:32` `property` `.min(1)`, `create_base/schema.ts:36` `view` `.min(1)`) report `""` under the old name. Dropping them moves the check to the new-name side and fixes the report's case. Type checks on alias fields (`arrayMatch: "x"` → `["arrayMatch"]`; `create_base` `path: 5` → `["path"]` with message `base_path must be a string`) are the published type of the alias key, which ADR-046 requires to stay published. Only a path remap in the error mapping can move them to the new name.

  | Option | Description |
  |--------|-------------|
  | A (recommended) | Fix the empty-value class only: drop `min(1)` from the `property` and `view` aliases. This covers the report's acceptance criterion and the matching `create_base` `view` case. Wrong-type issues on old keys keep the old path, since the caller's own key is wrong-typed. |
  | B | Also remap: add a shared `renameIssuePaths` helper in `_deprecated-params.ts` and apply it in all three tools' `mapValidationError` (`find_by_property` gains a hook), so every per-value issue on an old key reports the replacement name. More code across three tools. |

  Recommended: **A**. It meets every acceptance criterion the report states with a two-line schema change and follows `create_base`'s `path` precedent. A wrong-type value is an error in the key the caller actually sent, and the conflict issue already reports at the old key for the same reason.

  Resolved (Relay): **A** (owner ruling 2026-11-03). Only the empty-value class is fixed: `min(1)` is dropped from the `property` (`find_by_property`) and `view` (`create_base`) aliases, so `""` under an old name gives the same error as under the new name. ADR-046 Decision 5 says "validation of the resolved value reports the new name". A wrong-typed old-key value never resolves to the new name, so it keeps reporting the old key. No remap helper is added.

The three rulings confirm the Preferred remediation, files, tests and CodeGraph claim above as written. Nothing in those sections changes.
