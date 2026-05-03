// Original — no upstream. Vitest configuration. Coverage gate per constitution v1.1.0 gate #5:
// statements is the single source of truth for the merge floor — ratchet via a one-line visible edit.
// Branch / function / per-file thresholds are forbidden without a constitution amendment.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/**/*.test.ts"],
      reporter: ["text", "lcov", "json-summary"],
      reportsDirectory: "coverage",
      // thresholds: {} — INTENTIONALLY OMITTED in the wire-up commit so intermediate
      // commits don't fail before the floor is measured. Armed in the next commit.
    },
  },
});
