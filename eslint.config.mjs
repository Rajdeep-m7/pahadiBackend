import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended rules
  ...tseslint.configs.recommended,

  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      // "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // Ignore (replaces .eslintignore)
  {
    ignores: ['node_modules', 'dist'],
  },
];