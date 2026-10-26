const { defineConfig } = require("eslint/config");
const expo = require("eslint-config-expo/flat");
module.exports = defineConfig([
  expo,
  {
    ignores: [
      "dist/**",
      ".cloud-edge/**",
      "supabase/functions/**",
      "src/shared/database.types.ts",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "react/jsx-no-leaked-render": [
        "error",
        { validStrategies: ["coerce", "ternary"] },
      ],
    },
  },
]);
