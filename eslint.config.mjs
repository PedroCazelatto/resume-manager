import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// I/O modules that only adapters may use (constitution Art. V.3).
const ioModules = [
  "fs",
  "fs/promises",
  "node:fs",
  "node:fs/promises",
  "http",
  "https",
  "node:http",
  "node:https",
  "net",
  "node:net",
  "dns",
  "node:dns",
  "child_process",
  "node:child_process",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Core is pure domain logic: no I/O, no Next.js, no adapters or UI.
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ioModules.map((name) => ({
            name,
            message: "src/core must not do I/O; put it behind an adapter (Art. V.3).",
          })),
          patterns: [
            {
              group: ["@/adapters/*", "@/app/*", "@/components/*", "**/adapters/**", "**/app/**", "**/components/**"],
              message: "src/core must not import from adapters, app, or components (Art. V.3).",
            },
            {
              group: ["next", "next/*", "react", "react-dom"],
              message: "src/core must not depend on Next.js or React (Art. V.3).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/adapters/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/*", "@/components/*", "**/app/**", "**/components/**"],
              message: "Adapters must not import from the UI layer (Art. V.3).",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Worktrees of assistants working in parallel; each is linted in its own checkout.
    ".claude/**",
  ]),
]);

export default eslintConfig;
