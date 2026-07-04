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
