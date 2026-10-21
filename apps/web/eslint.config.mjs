import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

import { baseConfig } from '../../eslint.base.mjs';

export default defineConfig(
  baseConfig,
  { ignores: ['src/lib/api/schema.d.ts'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['**/*.stories.tsx', '**/*.test.tsx', '**/test/**/*.ts'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  prettier,
);
