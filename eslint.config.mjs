import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["node_modules/**", "output/**", "tmp/**", "Admin/dist/**"]),
]);
