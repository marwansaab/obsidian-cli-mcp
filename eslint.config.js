// Original — no upstream. ESLint flat-config for the obsidian-cli-mcp TypeScript sources (constitution Technical Standards).
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "*.log"],
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: "module",
        project: "./tsconfig.json",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs["recommended"].rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": "error",
    },
  },
];
