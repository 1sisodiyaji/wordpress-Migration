import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["build/**", ".react-router/**", "node_modules/**"]),
]);
