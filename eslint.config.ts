import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "eslint.config.ts",
    ],
  },
  eslint.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      globals: {
				AbortController: "readonly",
				CustomEvent: "readonly",
				crypto: "readonly",
				document: "readonly",
				fetch: "readonly",
				localStorage: "readonly",
				requestAnimationFrame: "readonly",
				setTimeout: "readonly",
				window: "readonly",
        console: "readonly",
        process: "readonly",
      },
    },
    rules: {
      indent: ["error", "tab"],
      "no-tabs": "off",
      quotes: ["error", "single"],
      semi: ["error", "always"],
			'linebreak-style': ['error', 'unix'],
      "spaced-comment": ["error", "always"],
      "no-eval": "error",
      "no-trailing-spaces": "error",
      "no-var": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "id-denylist": [
        "error",
        "any",
        "number",
        "string",
        "boolean",
        "undefined",
        "null",
        "object",
      ],
      "keyword-spacing": ["error", { before: true, after: true }],
      "space-before-blocks": "error",
      "space-infix-ops": "error",
      "comma-spacing": ["error", { before: false, after: true }],
      "key-spacing": ["error", { beforeColon: false, afterColon: true }],
      "brace-style": ["error", "1tbs", { allowSingleLine: false }],
    },
  },
]);
