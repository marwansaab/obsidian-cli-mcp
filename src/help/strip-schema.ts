// Original — no upstream. Pure function: deep-copy a JSON Schema and remove every `description` field below the root (FR-001..FR-005, ADR-005 / BI-030).

/**
 * A JSON Schema object as produced by `zod-to-json-schema`. Recursive — children
 * may appear under `properties`, `items`, `anyOf`, `oneOf`, or `additionalProperties`.
 *
 * The unknown-indexed signature admits the long tail of JSON Schema keys
 * (`type`, `required`, `enum`, `default`, `pattern`, etc.) that this utility
 * preserves verbatim per FR-004.
 */
export interface JsonSchemaObject {
  description?: unknown;
  properties?: Record<string, JsonSchemaObject>;
  items?: JsonSchemaObject | JsonSchemaObject[];
  anyOf?: JsonSchemaObject[];
  oneOf?: JsonSchemaObject[];
  additionalProperties?: JsonSchemaObject | boolean;
  [key: string]: unknown;
}

/**
 * Return a deep copy of `schema` with every `description` field removed at every
 * nesting level below the root (per FR-002 + FR-003). The root's own `description`
 * is preserved. All other keys (`type`, `required`, `enum`, `anyOf`, `oneOf`,
 * `items`, `additionalProperties`, etc.) are preserved verbatim at every depth
 * per FR-004. Pure function — no I/O, no logging, no input mutation per FR-005.
 */
export function stripSchemaDescriptions(schema: JsonSchemaObject): JsonSchemaObject {
  const clone = structuredClone(schema) as JsonSchemaObject;
  // Root-level `description` is deliberately preserved per FR-003. The walker
  // below visits children only.
  walkChildren(clone);
  return clone;
}

function walkChildren(node: JsonSchemaObject): void {
  if (node.properties && typeof node.properties === "object") {
    for (const child of Object.values(node.properties)) {
      stripDescription(child);
      walkChildren(child);
    }
  }
  if (node.items) {
    if (Array.isArray(node.items)) {
      for (const child of node.items) {
        stripDescription(child);
        walkChildren(child);
      }
    } else if (typeof node.items === "object") {
      stripDescription(node.items);
      walkChildren(node.items);
    }
  }
  for (const key of ["anyOf", "oneOf"] as const) {
    const branches = node[key];
    if (Array.isArray(branches)) {
      for (const child of branches) {
        stripDescription(child);
        walkChildren(child);
      }
    }
  }
  if (node.additionalProperties && typeof node.additionalProperties === "object") {
    stripDescription(node.additionalProperties);
    walkChildren(node.additionalProperties);
  }
}

function stripDescription(node: JsonSchemaObject): void {
  if ("description" in node) {
    delete node.description;
  }
}
