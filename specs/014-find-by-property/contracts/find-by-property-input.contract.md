# Contract — `find_by_property` Public Input

**Feature**: [014-find-by-property](../spec.md)
**Phase**: 1 (Design & Contracts)
**Layer**: public — observable from any MCP client via `tools/list` / `tools/call`

This document is the locked public input contract for `find_by_property`. Any change to the fields, types, defaults, or validation rules here is a contract change and requires a feature increment + ADR. Internal changes (handler logic, JS template body, base64 encoding) are NOT contract changes and may evolve freely.

---

## 1. Zod schema (single source of truth)

```ts
const FOLDER_TRAVERSAL_REGEX = /(?:^[/\\])|(?:^|[/\\])\.\.(?:[/\\]|$)/;

export const findByPropertyInputSchema = z
  .object({
    vault: z.string().min(1).optional(),
    property: z.string().min(1),
    value: z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
    ]),
    folder: z.string()
      .refine(
        (v) => !FOLDER_TRAVERSAL_REGEX.test(v),
        "folder must not contain '..' segments or start with '/' or '\\\\' (path-traversal escape)",
      )
      .optional(),
    arrayMatch: z.boolean().optional().default(true),
    caseSensitive: z.boolean().optional().default(true),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (Array.isArray(input.value) && input.arrayMatch === true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message:
          "value cannot be an array when arrayMatch is true (default); pass a scalar for contains semantics, or set arrayMatch: false for exact-equality.",
      });
    }
  });
```

The schema is `.strict()` — unknown top-level keys are rejected (FR-009).

---

## 2. Emitted JSON Schema shape (after `zod-to-json-schema` + `stripSchemaDescriptions`)

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["property", "value"],
  "properties": {
    "vault": { "type": "string", "minLength": 1 },
    "property": { "type": "string", "minLength": 1 },
    "value": {
      "anyOf": [
        { "type": "string" },
        { "type": "number" },
        { "type": "boolean" },
        { "type": "null" },
        {
          "type": "array",
          "items": {
            "anyOf": [
              { "type": "string" },
              { "type": "number" },
              { "type": "boolean" },
              { "type": "null" }
            ]
          }
        }
      ]
    },
    "folder": { "type": "string" },
    "arrayMatch": { "type": "boolean", "default": true },
    "caseSensitive": { "type": "boolean", "default": true }
  }
}
```

Notes:

- `default: true` is published in the JSON Schema so MCP clients can render the defaults visibly.
- The `folder` regex constraint is ENFORCED at the server-side zod parse step but is NOT mirrored in the published JSON Schema as a `pattern`. Reason: the constraint is a security control whose purpose is to short-circuit at the validation boundary regardless of whether the client also enforces it. Clients that mirror the JSON Schema's `pattern` get earlier feedback; clients that don't are still safe because the server enforces.
- The cross-field `superRefine` (array `value` rejected when `arrayMatch: true`) is NOT representable in JSON Schema directly; it surfaces as a `VALIDATION_ERROR` at server-side parse.

---

## 3. Field policy

| Field | Type | Default | Required | Notes |
|---|---|---|---|---|
| `vault` | string | (focused vault) | No | Vault display name. When omitted, the underlying CLI's focused-vault default is used. Multi-vault setups: see [Multi-vault default ambiguity](#multi-vault-default-ambiguity) below. |
| `property` | string (non-empty) | n/a | YES | Frontmatter property name. Passed through verbatim — no sanitisation, escaping, or rewriting at the wrapper layer. |
| `value` | string ∣ number ∣ boolean ∣ null ∣ array | n/a | YES | Type-faithful. Type is preserved through to the comparison; numeric `7` matches the number `7`, NOT the string `"7"`. Array form admitted only when `arrayMatch: false`. |
| `folder` | string | (whole vault) | No | Vault-relative folder prefix. Empty string OR omission searches the whole vault. Validated against path-traversal escapes (rejects `..` segments + leading `/` `\`). |
| `arrayMatch` | boolean | `true` | No | When `true`, list-valued properties match if `value` appears anywhere in the list (contains). When `false`, list-valued properties match only on positional equality (order-sensitive — see [Element order](#element-order-sensitivity)). |
| `caseSensitive` | boolean | `true` | No | Applies to string comparisons only. Numeric / boolean / null comparisons are always exact. |

---

## 4. Examples

### Example A — scalar identifier lookup

```json
{
  "vault": "Demo",
  "property": "id",
  "value": "BI-030"
}
```

Returns the path of the (typically unique) note carrying that id.

### Example B — folder-scoped multi-match

```json
{
  "vault": "Demo",
  "property": "status",
  "value": "queued",
  "folder": "backlog"
}
```

Returns every note under `backlog/` (any depth) whose `status` frontmatter equals `"queued"`.

### Example C — array-contains (default `arrayMatch: true`)

```json
{
  "vault": "Demo",
  "property": "tags",
  "value": "alpha"
}
```

Returns every note whose `tags` list contains the string `"alpha"`.

### Example D — array-exact-equality (order-sensitive)

```json
{
  "vault": "Demo",
  "property": "tags",
  "value": ["alpha", "beta"],
  "arrayMatch": false
}
```

Returns every note whose `tags` list is **positionally equal** to `["alpha", "beta"]`. A note with `tags: [beta, alpha]` does NOT match (order-sensitive per the [Q1 clarification](../spec.md#clarifications)).

### Example E — case-insensitive lookup

```json
{
  "vault": "Demo",
  "property": "tag",
  "value": "alpha",
  "caseSensitive": false
}
```

Returns every note whose `tag` frontmatter is any case-variant of `"alpha"` (`Alpha`, `ALPHA`, `aLpHa`, etc.).

### Example F — type-faithful numeric

```json
{
  "vault": "Demo",
  "property": "count",
  "value": 7
}
```

Returns every note whose `count` is the number `7`. A note with `count: "7"` (YAML quoted string) does NOT match.

### Example G — explicit-null

```json
{
  "vault": "Demo",
  "property": "explicit_null",
  "value": null
}
```

Returns every note whose `explicit_null` property is present with a YAML-null value (`explicit_null:` with no value). Notes where the property is absent entirely do NOT match.

---

## 5. Element order sensitivity

When `arrayMatch: false` and `value` is an array, equality is positional: the property's list must have the same length as `value` AND the same element at every index. `[alpha, beta]` does NOT equal `[beta, alpha]`.

Set-membership / multiset matching ("the same elements regardless of order") is **NOT supported** by `arrayMatch: false`. Callers needing it compose two `arrayMatch: true` calls (one per element) and intersect client-side.

This is a contract committed in the [Q1 clarification](../spec.md#clarifications) and codified by FR-016.

---

## 6. Multi-vault default ambiguity

When `vault` is omitted AND multiple Obsidian vaults are registered, the underlying CLI's "focused vault" default may resolve ambiguously: no Obsidian instance running, no vault foregrounded, or two vaults equally foregrounded. The wrapper surfaces whatever the underlying CLI returns; it does NOT detect or surface a structured error for the ambiguous case.

Multi-vault users requiring vault-scoped certainty MUST supply `vault` explicitly.

This is a documented limitation per the [Q3 clarification](../spec.md#clarifications) and FR-003.

---

## 7. Error responses

All validation failures return `VALIDATION_ERROR` with a `details.issues` array reporting the offending field paths. CLI failures return `UpstreamError` codes (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`).

| Trigger | Code | `details` payload (illustrative) |
|---|---|---|
| `property: ""` | `VALIDATION_ERROR` | `issues: [{ path: ["property"], message: "String must contain at least 1 character(s)" }]` |
| `property` omitted | `VALIDATION_ERROR` | `issues: [{ path: ["property"], message: "Required" }]` |
| `value` omitted | `VALIDATION_ERROR` | `issues: [{ path: ["value"], message: "Required" }]` |
| `value: { foo: 1 }` | `VALIDATION_ERROR` | `issues: [{ path: ["value"], message: "Invalid input" }]` |
| `value: ["x"]` with `arrayMatch: true` | `VALIDATION_ERROR` | `issues: [{ path: ["value"], message: "value cannot be an array when arrayMatch is true ..." }]` |
| `folder: "../escape"` | `VALIDATION_ERROR` | `issues: [{ path: ["folder"], message: "folder must not contain '..' segments ..." }]` |
| Unknown vault | `CLI_REPORTED_ERROR` | `details.message: "Vault not found."` (R5 inherited) |
| Obsidian not running | `CLI_NON_ZERO_EXIT` or `CLI_REPORTED_ERROR` | depends on dispatch-layer classification |
| Output exceeds 10 MiB cap | `CLI_NON_ZERO_EXIT` | output-cap kill |
| Spawn fails (binary missing) | `CLI_BINARY_NOT_FOUND` | spawn ENOENT |

---

## 8. Stability guarantee

Within a major project version, this contract is byte-stable. Adding optional fields with safe defaults is a minor version increment; removing fields, tightening required-fields, or changing accepted types is a major version increment.

The `find_by_property` tool is introduced at v0.2.7 (target patch bump from v0.2.6 — purely additive surface).
