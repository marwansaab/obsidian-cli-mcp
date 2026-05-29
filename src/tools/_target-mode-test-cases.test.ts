// Original — no upstream. Tests for the shared target-mode wiring battery (BI-058
// F-D). Validates the generated cases against the REAL refinement primitive
// (applyTargetModeRefinement) so the battery's valid/invalid expectations are
// proven correct, not just asserted in shape.
import { describe, it, expect } from "vitest";
import { z } from "zod";

import { targetModeWiringCases } from "./_target-mode-test-cases.js";
import { applyTargetModeRefinement, targetModeBaseSchema } from "../target-mode/target-mode.js";

// A representative locator-XOR schema built the same way every real tool builds
// its input schema: applyTargetModeRefinement(targetModeBaseSchema.extend({...})).
const schema = applyTargetModeRefinement(targetModeBaseSchema.extend({ note_text: z.string() }));
const validSpecific = { target_mode: "specific", vault: "V", path: "a.md", note_text: "x" };
const validActive = { target_mode: "active", note_text: "x" };

describe("targetModeWiringCases", () => {
  it("generates the full nine-case battery", () => {
    const cases = targetModeWiringCases(validSpecific, validActive);
    expect(cases).toHaveLength(9);
    expect(cases.filter((c) => c.valid)).toHaveLength(2);
    expect(cases.filter((c) => !c.valid)).toHaveLength(7);
  });

  it("does not mutate the caller's payloads", () => {
    const spec = { target_mode: "specific", vault: "V", path: "a.md", note_text: "x" };
    const specCopy = { ...spec };
    targetModeWiringCases(spec, { target_mode: "active", note_text: "x" });
    expect(spec).toEqual(specCopy);
  });

  it.each(targetModeWiringCases(validSpecific, validActive))(
    "$label behaves as specified against the real refinement",
    ({ input, valid, issuePath }) => {
      const r = schema.safeParse(input);
      expect(r.success).toBe(valid);
      if (!valid && issuePath && !r.success) {
        expect(r.error.issues.some((i) => i.path.includes(issuePath))).toBe(true);
      }
    },
  );
});
