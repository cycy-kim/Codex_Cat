import typescriptEslint from 'typescript-eslint';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: typescriptEslint.parser,
      ecmaVersion: 2022,
      sourceType: 'module'
    },
    plugins: {
      '@typescript-eslint': typescriptEslint.plugin
    },
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'import',
          format: ['camelCase', 'PascalCase']
        }
      ],
      curly: 'error',
      eqeqeq: 'error',
      'no-throw-literal': 'error',
      semi: 'error'
    }
  }
];
