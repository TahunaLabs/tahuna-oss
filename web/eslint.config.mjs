import tsParser from "@typescript-eslint/parser";

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
  },
  {
    files: ["convex/**/*.ts"],
    ignores: ["convex/_generated/**", "convex/auth.ts"],
    rules: {
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
