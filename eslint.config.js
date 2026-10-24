const { defineConfig } = require("eslint/config");
const expo = require("eslint-config-expo/flat");
module.exports = defineConfig([
  expo,
  {
    ignores: [
      "dist/**",
      "supabase/functions/**",
      "src/shared/database.types.ts",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
]);
