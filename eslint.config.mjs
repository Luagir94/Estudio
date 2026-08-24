// Flat ESLint config. Fast, non-type-checked linting only: type-aware rules
// would need the classic TS program API on every lint run, and typechecking
// already runs separately via `npm run typecheck` (native TS 7). The lint
// toolchain itself parses through a nested classic TypeScript 6 — see the
// `overrides` block in package.json.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import prettier from 'eslint-config-prettier/flat'

export default tseslint.config(
  {
    // Generated or third-party output — mirrors .gitignore / .prettierignore.
    ignores: [
      'node_modules/',
      'out/',
      'dist/',
      'dist-electron/',
      'release/',
      'coverage/',
      'test-results/',
      'playwright-report/',
      '.atl/',
      'design/',
      'drizzle/migrations/',
      '**/*.pen'
    ]
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error'
    }
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The codebase deliberately marks unused-by-design bindings with a `_`
      // prefix (`_programId`) and omits fields via rest destructuring.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true
        }
      ]
    }
  },
  {
    // React hooks correctness for renderer + preload code.
    ...reactHooks.configs.flat.recommended,
    files: ['src/renderer/**/*.{ts,tsx}', 'src/preload/**/*.{ts,tsx}'],
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      // Warn, not error: the `const today = now ?? new Date()` container
      // pattern trips it, and "fixing" that by memoizing would freeze `today`
      // across re-renders — a runtime behavior change, not a cleanup.
      'react-hooks/exhaustive-deps': 'warn'
    }
  },
  {
    // Accessibility rules for anything that renders JSX.
    ...jsxA11y.flatConfigs.recommended,
    files: ['**/*.tsx']
  },
  {
    // Test fixtures embed single-backslash Windows paths ('C:\tools\claude.exe')
    // whose literal values the assertions depend on; escaping them would change
    // what the tests test.
    files: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-useless-escape': 'off'
    }
  },
  // Last: silence stylistic rules that would fight Prettier.
  prettier
)
