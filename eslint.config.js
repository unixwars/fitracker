import js from '@eslint/js'
import svelte from 'eslint-plugin-svelte'
import ts from 'typescript-eslint'
import globals from 'globals'

export default ts.config(
  { ignores: ['dist', 'node_modules', 'e2e/.cache', 'public'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  { files: ['**/*.svelte'], languageOptions: { parserOptions: { parser: ts.parser } } },
  { files: ['**/*.svelte.ts'], languageOptions: { parser: ts.parser } },
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
)
