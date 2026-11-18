import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import storybook from 'eslint-plugin-storybook';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'storybook-static', 'playwright-report']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strict,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // new Date("2026-11-17") is UTC midnight: the previous day west of UTC.
          selector:
            "NewExpression[callee.name='Date'][arguments.length=1][arguments.0.type='Literal'][arguments.0.value=/^\\d{4}-\\d{2}-\\d{2}$/]",
          message:
            'Date-only strings parse as UTC midnight (wrong day west of UTC). Use parseDateOnly() from @/lib/dates.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              // The barrel costs ~5 s per cold test file in Vitest (no tree-shaking).
              name: 'date-fns',
              message:
                "Import each function from its subpath: import { format } from 'date-fns/format'.",
            },
          ],
        },
      ],
    },
  },
  // Story-file rules (CSF conventions, no stray imports from renderer packages).
  storybook.configs['flat/recommended'],
  // Must come last: turns off stylistic rules that would fight Prettier.
  prettier,
]);
