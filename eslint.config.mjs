import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      'tests/architecture/fixtures/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node
      },
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ]
    }
  },
  {
    files: ['modules/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Default exports are not allowed in modules; use named exports.'
        }
      ]
    }
  },
  {
    files: ['modules/**/domain/**/*.ts', 'modules/**/application/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Default exports are not allowed in modules; use named exports.'
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.name='Date'][callee.property.name='now']",
          message: 'Use the Clock port instead of Date.now() in domain/application code.'
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Use the Clock port instead of new Date() in domain/application code.'
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.name='Math'][callee.property.name='random']",
          message: 'Use the IdGenerator port instead of Math.random() in domain/application code.'
        },
        {
          selector: "CallExpression[callee.type='Identifier'][callee.name='parseFloat']",
          message: 'Use Decimal/DecimalValue instead of parseFloat() in domain/application code.'
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.name='Number'][callee.property.name='parseFloat']",
          message:
            'Use Decimal/DecimalValue instead of Number.parseFloat() in domain/application code.'
        }
      ]
    }
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node
      },
      sourceType: 'module'
    }
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      globals: {
        ...globals.node
      },
      sourceType: 'commonjs'
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  }
);
