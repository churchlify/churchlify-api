import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
         __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-case-declarations': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  {
    files: ['**/*.mjs', 'eslint.config.js', 'common/turn.js', 'mediasoup/*.js'], 
    languageOptions: {
      sourceType: 'module'
    }
  },
  // 3. Specific override for CommonJS (files using require)
  {
    files: ['**/*.cjs', 'routes/*.js'], // Add folders that use require here
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        __dirname: 'readonly',
        __filename: 'readonly'
      }
    }
  }
];