import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import unusedImports from "eslint-plugin-unused-imports";

const appCodeFiles = ["app/**/*.{ts,tsx,js,mjs,cjs}", "components/**/*.{ts,tsx,js,mjs,cjs}", "lib/**/*.{ts,tsx,js,mjs,cjs}", "config.ts"];
const noRelativeAppImportsRule = [
  "error",
  {
    patterns: [
      {
        group: ["./*", "../*"],
        message: 'Use the "@/..." alias for frontend app-code imports instead of relative paths.',
      },
    ],
  },
];

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "convex/_generated/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: {
      "unused-imports": unusedImports,
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "unused-imports/no-unused-imports": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports", fixStyle: "inline-type-imports" }],
    },
  },
  {
    files: appCodeFiles,
    ignores: ["app/layout.tsx"],
    rules: {
      "no-console": "error",
      "no-debugger": "error",
      "no-restricted-imports": noRelativeAppImportsRule,
    },
  },
  {
    files: ["app/layout.tsx"],
    rules: {
      "no-console": "error",
      "no-debugger": "error",
    },
  },
  {
    files: ["convex/**/*.ts"],
    ignores: ["convex/_generated/**", "convex/auth.ts"],
    rules: {
      "no-console": "error",
      "no-debugger": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/config",
              message: 'Import config via "@convex/appConfig" to keep Convex imports consistent.',
            },
          ],
          patterns: [
            {
              group: ["./*", "../*"],
              message: 'Use absolute aliases (@convex/* or @/*) in Convex modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ["convex/appConfig.ts"],
    rules: {
      "no-console": "error",
      "no-debugger": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./*", "../*"],
              message: 'Use absolute aliases (@convex/* or @/*) in Convex modules.',
            },
          ],
        },
      ],
    },
  },
];
