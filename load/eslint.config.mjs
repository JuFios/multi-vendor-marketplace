import { defineConfig } from 'eslint/config';

import { baseConfig } from '../eslint.base.mjs';

export default defineConfig(baseConfig, {
  // The k6 scripts run in k6's runtime, which provides these globals.
  files: ['**/*.js'],
  languageOptions: {
    globals: { __ENV: 'readonly', __VU: 'readonly', __ITER: 'readonly', open: 'readonly' },
  },
});
