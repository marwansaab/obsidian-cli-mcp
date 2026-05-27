// Original — no upstream. ESLint flat-config for obsidian-cli-mcp (constitution Technical Standards).
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import nodePlugin from "eslint-plugin-n";
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
      import: importPlugin,
      n: nodePlugin,
      promise: promisePlugin,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": "error",
      // import/order — alphabetized, with newlines between every group
      "import/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", ["parent", "sibling", "index"], "type"],
          alphabetize: { order: "asc", caseInsensitive: true },
          "newlines-between": "always",
        },
      ],
      // The TypeScript compiler validates module resolution; eslint-plugin-import's resolver
      // doesn't grok our .js-extension-on-.ts-source convention without an extra resolver dep.
      "import/no-unresolved": "off",
      // Same reason — n's missing-import check is redundant with tsc and would false-positive
      // on the .js extensions that resolve to .ts source.
      "n/no-missing-import": "off",
      // tsc handles unsupported-feature checks via its target/lib settings; n's version-aware
      // checks duplicate that and are noisy on Node 22+ APIs.
      "n/no-unsupported-features/node-builtins": "off",
      "n/no-unsupported-features/es-syntax": "off",
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
