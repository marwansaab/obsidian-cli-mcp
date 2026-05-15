// Original — no upstream. Co-located tests for the FR-018 fingerprint helper module (BI-022).
import { describe, expect, it } from "vitest";

import { canonicalJSON, fingerprintLiveRegistry, sha256 } from "./_register-baseline.js";

describe("canonicalJSON", () => {
  it("produces deterministic output for an object with shuffled keys (happy)", () => {
    const a = { b: 1, a: 2, c: 3 };
    const b = { c: 3, a: 2, b: 1 };
    expect(canonicalJSON(a)).toBe(canonicalJSON(b));
    expect(canonicalJSON(a)).toBe('{"a":2,"b":1,"c":3}');
  });

  it("preserves array order (boundary — arrays positional in JSON Schema)", () => {
    const arr = [3, 1, 2];
    expect(canonicalJSON(arr)).toBe("[3,1,2]");
  });

  it("recurses into nested objects sorting keys at every depth", () => {
    const nested = { outer: { z: 1, a: 2 }, beta: { y: 3, b: 4 } };
    expect(canonicalJSON(nested)).toBe('{"beta":{"b":4,"y":3},"outer":{"a":2,"z":1}}');
  });

  it("emits primitives via JSON.stringify (null / number / string / boolean)", () => {
    expect(canonicalJSON(null)).toBe("null");
    expect(canonicalJSON(42)).toBe("42");
    expect(canonicalJSON("text")).toBe('"text"');
    expect(canonicalJSON(true)).toBe("true");
  });
});

describe("sha256", () => {
  it("returns a 64-char lowercase hex string (happy)", () => {
    const out = sha256("hello");
    expect(out).toMatch(/^[0-9a-f]{64}$/);
    expect(out).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("differs by one bit when input differs by one character (boundary)", () => {
    const a = sha256("a");
    const b = sha256("b");
    expect(a).not.toBe(b);
  });
});

describe("fingerprintLiveRegistry", () => {
  it("returns one entry per registered tool, sorted by name", async () => {
    const entries = await fingerprintLiveRegistry();
    expect(entries.length).toBe(17);
    const names = entries.map((e) => e.name);
    expect(names).toEqual([...names].sort());
    for (const entry of entries) {
      expect(entry.descriptionFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.schemaFingerprint).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
