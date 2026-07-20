// ESLint config for the monorepo root — covers apps/api TypeScript files
// ESLint 8.x legacy format (eslintrc)

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    // No project reference — avoids needing tsconfig resolution in CI
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    // ── TypeScript ───────────────────────────────────────────────────────────
    // NestJS controllers use `any` for req.user, generic payloads — turn off
    '@typescript-eslint/no-explicit-any': 'off',
    // Unused vars: turn off base rule, use TS-aware version set to warn only
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
      ignoreRestSiblings: true,
    }],
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-empty-function': 'off',   // decorators produce empty functions
    '@typescript-eslint/ban-ts-comment': 'warn',
    '@typescript-eslint/no-empty-interface': 'off',  // NestJS DTOs

    // ── General ──────────────────────────────────────────────────────────────
    'no-console': 'off',       // NestJS uses console-like logging
    'no-debugger': 'error',
    'no-duplicate-imports': 'error',
    'prefer-const': 'warn',
    'no-var': 'error',
    'no-extra-semi': 'error',  // fixable auto-fix; decorators sometimes add these
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '.next/',
    'build/',
    'coverage/',
    '*.js',       // ignore JS config files at root
    '*.mjs',
    '*.cjs',
    'apps/web/**', // web is linted via next lint separately
  ],
};
