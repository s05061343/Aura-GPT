import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".runtime/**",
    "backend/.pytest_cache/**",
    "backend/**/__pycache__/**",
    "desktop/web/**",
    "models/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);
