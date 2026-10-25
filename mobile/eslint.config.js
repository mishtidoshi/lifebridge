// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // React Native <Text> isn't HTML, so apostrophes don't need escaping.
    rules: { "react/no-unescaped-entities": "off" },
  },
]);
