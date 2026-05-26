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
const convexRelativeImportPattern = {
  group: ["./*", "../*"],
  message: "Use absolute aliases (@convex/* or @/*) in Convex modules.",
};
const noCloudOrHostedConvexImportsRule = [
  "error",
  {
    paths: [
      {
        name: "convex/react",
        message: "Core Convex modules must not import Convex React bindings.",
      },
      {
        name: "resend",
        message: "Hosted email belongs in cloud composition, not core Convex modules.",
      },
      {
        name: "better-auth",
        message: "Hosted auth provider composition belongs outside core Convex modules.",
      },
      {
        name: "@aws-sdk/client-s3",
        message: "Object-store implementation details belong in the R2 adapter.",
      },
    ],
    patterns: [
      convexRelativeImportPattern,
      {
        group: ["@/cloud/*", "@convex/cloud/*"],
        message: "Cloud policy must compose core Convex modules from outside the core boundary.",
      },
      {
        group: ["@convex/_generated/*"],
        message: "Core Convex modules must not depend on Convex-generated APIs.",
      },
      {
        group: ["@convex-dev/*"],
        message: "Hosted Convex components and adapters must stay outside the core boundary.",
      },
      {
        group: ["@better-auth/*"],
        message: "Hosted auth provider composition belongs outside core Convex modules.",
      },
      {
        group: ["@vercel/*"],
        message: "Vercel instrumentation belongs in cloud composition, not core Convex modules.",
      },
    ],
  },
];
const noCloudConvexImplementationImportsRule = [
  "error",
  {
    patterns: [
      convexRelativeImportPattern,
      {
        group: ["@/cloud/*", "@convex/cloud/*"],
        message: "Use an explicit cloud composition module instead of importing cloud policy here.",
      },
    ],
  },
];

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.open-next/**",
      ".source/**",
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
          patterns: [convexRelativeImportPattern],
        },
      ],
    },
  },
  {
    files: ["convex/core/**/*.ts"],
    rules: {
      "no-console": "error",
      "no-debugger": "error",
      "no-restricted-imports": noCloudOrHostedConvexImportsRule,
    },
  },
  {
    files: [
      "convex/runsLifecycle.ts",
      "convex/servesLifecycle.ts",
      "convex/runpodComputeProvider.ts",
    ],
    rules: {
      "no-console": "error",
      "no-debugger": "error",
      "no-restricted-imports": noCloudConvexImplementationImportsRule,
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
          patterns: [convexRelativeImportPattern],
        },
      ],
    },
  },
];
