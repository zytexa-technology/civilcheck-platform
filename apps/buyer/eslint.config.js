// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // .expo/ holds generated output — notably types/router.d.ts, written by the
    // dev server for `experiments.typedRoutes`. tsc consumes it; ESLint should
    // not, since we cannot fix warnings in a file that is rewritten on start.
    ignores: ['dist/*', '.expo/*'],
  },
]);
