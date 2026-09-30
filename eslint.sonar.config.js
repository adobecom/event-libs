// Standalone config for local Sonar-style code quality checks.
// Not used by `npm run lint` / CI — run manually via:
//   npx eslint --config eslint.sonar.config.js "event-libs/**/*.js"
import js from "@eslint/js";
import globals from "globals";
import sonarjs from "eslint-plugin-sonarjs";

export default [
  { ignores: ['event-libs/v1/deps/**', 'event-libs/scripts/deps/**', 'node_modules/**'] },
  js.configs.recommended,
  sonarjs.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        Intl: "readonly"
      }
    }
  }
];
