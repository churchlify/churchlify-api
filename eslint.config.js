import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'commonjs',
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly'
      }
    },
    ignores: ['dist/', 'node_modules/'],
    rules: {
      curly: 'error',
      'no-undef': 'error',
      'no-unused-vars': ['error', { vars: 'all', args: 'after-used' }],
      quotes: ['error', 'single', { avoidEscape: true }],
      'no-trailing-spaces': 'error',
      'no-use-before-define': 'error'
    }
  }
];
