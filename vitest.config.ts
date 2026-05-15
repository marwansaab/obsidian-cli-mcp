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
      exclude: ["src/**/*.test.ts", "src/**/graphify-out/**"],
      reporter: ["text", "lcov", "json-summary"],
      reportsDirectory: "coverage",
      // SINGLE SOURCE OF TRUTH for the merge floor. Ratchet up (or down, intentionally)
      // via a one-line visible edit to this number. No env vars, no CI flags. Branch /
      // function / per-file thresholds are forbidden without a constitution amendment
      // (gate #5 — reviewers MUST flag any PR that adds those keys).
      thresholds: {
        statements: 91.3,
      },
    },
  },
});
