// Original — no upstream. ESLint flat-config for obsidian-cli-mcp (constitution Technical Standards).
import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";
import promisePlugin from "eslint-plugin-promise";
import jsoncPlugin from "eslint-plugin-jsonc";
import * as jsoncParser from "jsonc-eslint-parser";
import prettierConfig from "eslint-config-prettier";

export default [
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "**/.scratch/**",
      "eslint.config.js",
      "vitest.config.ts",
      "tsup.config.ts",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "import-x": importX,
      promise: promisePlugin,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      // BI-067 SC-009 permanent deprecation gate, layer 1: every @deprecated-tagged API
      // (zod or otherwise) is an error. First type-aware rule in this config — lint cost
      // grows by ~one type-check; loud-fails (exit 2) if type info is missing. NOT in the
      // recommended preset, so the explicit enable here is load-bearing.
      "@typescript-eslint/no-deprecated": "error",
      // BI-067 SC-009 layer 2: ban reintroduction of v3-era idioms the migration removed.
      // These carry no @deprecated tag (or lose it through zod's mapped types), so the
      // syntax selectors are what keep the gate version-drift-proof. No selector for
      // .superRefine() — it is the v4-canonical refinement API and stays.
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='strict'][arguments.length=0]",
          message: "Use z.strictObject({...}) (BI-067 modernization posture)",
        },
        {
          selector: "CallExpression[callee.property.name='passthrough']",
          message: "Use .loose() (zod 4)",
        },
        {
          selector: "CallExpression[callee.property.name='strip']",
          message: "Drop the call — strip is v3-era (zod 4)",
        },
      ],
      // BI-067 SC-009 layer 3: the retired converter package and the compat subpath
      // must never come back.
      "no-restricted-imports": [
        "error",
        { paths: ["zod-to-json-schema", "zod/v3"] },
      ],
      "no-console": "error",
      // import-x/order — alphabetized, with newlines between every group
      "import-x/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", ["parent", "sibling", "index"], "type"],
          alphabetize: { order: "asc", caseInsensitive: true },
          "newlines-between": "always",
        },
      ],
      // The TypeScript compiler validates module resolution; eslint-plugin-import-x's resolver
      // doesn't grok our .js-extension-on-.ts-source convention without an extra resolver dep.
      "import-x/no-unresolved": "off",
      ...promisePlugin.configs["flat/recommended"].rules,
      // Queue/scheduler primitives intentionally consume promises inside .then handlers
      // (they ARE the consumer); the rule below is for application code that forwards
      // promises and false-fires on this pattern.
      "promise/catch-or-return": "off",
      "promise/always-return": "off",
      // Stylistic — rejecting short `r`/`reject` names in tests has no correctness payoff.
      "promise/param-names": "off",
    },
  },
  // JSON / JSONC files
  {
    files: ["**/*.json", "**/*.jsonc"],
    languageOptions: { parser: jsoncParser },
    plugins: { jsonc: jsoncPlugin },
    rules: {
      ...jsoncPlugin.configs["recommended-with-jsonc"].rules,
    },
  },
  // Prettier last — disables stylistic rules that would conflict with the formatter.
  prettierConfig,
];
