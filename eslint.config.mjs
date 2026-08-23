import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // TypeScript test compilation deliberately emits CommonJS here. It is
    // executable verification output, not source code to lint.
    "test-output/**",
    "outputs/**",
    "qa-evidence/**",
    // This independently maintained local companion has its own release path.
    "tools/codex-workflow-console/**",
  ]),
]);

export default eslintConfig;
