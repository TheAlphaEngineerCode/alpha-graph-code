// @ts-check
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Pacotes que compõem o núcleo determinista. Neles a barra é mais alta:
 * zero `any`, zero import de React/Next/SDK de provider (invariantes 9 e 10).
 */
const CORE_PACKAGES = ['packages/expr', 'packages/graph-core', 'packages/compiler'];
const coreGlobs = CORE_PACKAGES.map((p) => `${p}/**/*.ts`);

/**
 * Invariante 3: proibido `eval`, `new Function`, `vm` ou qualquer avaliação dinâmica.
 * Condições de grafo usam AGX-Expr (packages/expr), interpretada por código nosso.
 *
 * Isto não é preferência de estilo: um arquivo `.agx.yaml` circula em pull request e
 * vem de terceiro. Avaliar sua condição com um avaliador JS completo transforma o
 * formato em vetor de execução arbitrária. Ver specs/ir-v1.md §4.5 e docs/SECURITY.
 */
const noDynamicEvaluation = {
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-restricted-imports': [
    'error',
    {
      paths: [
        {
          name: 'vm',
          message: 'Invariante 3: avaliação dinâmica é proibida. Use packages/expr (AGX-Expr).',
        },
        {
          name: 'node:vm',
          message: 'Invariante 3: avaliação dinâmica é proibida. Use packages/expr (AGX-Expr).',
        },
      ],
    },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: "NewExpression[callee.name='Function']",
      message: 'Invariante 3: `new Function` é proibido. Use packages/expr (AGX-Expr).',
    },
    {
      selector: "CallExpression[callee.name='Function']",
      message:
        'Invariante 3: `Function()` como avaliador é proibido. Use packages/expr (AGX-Expr).',
    },
    {
      selector: "MemberExpression[property.name='constructor'][object.type='Literal']",
      message: 'Invariante 3: acesso a `constructor` de literal é rota conhecida para `Function`.',
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
      '.turbo/**',
      '**/.turbo/**',
    ],
  },

  // Regras JS/TS gerais em todo o repositório, incluindo arquivos de configuração.
  tseslint.configs.recommended,
  {
    rules: {
      ...noDynamicEvaluation,
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
    },
  },

  // Núcleo: linting com informação de tipos e proibição explícita de `any`.
  {
    files: coreGlobs,
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      // Invariante 9: o núcleo não importa React, Next.js nem SDK de provider.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'next', 'next/*'],
              message:
                'Invariante 9: graph-core, expr e compiler não importam React nem Next.js. Lógica de domínio não mora em componente.',
            },
            {
              group: [
                '@anthropic-ai/*',
                'openai',
                'openai/*',
                '@google/*',
                '@aws-sdk/*',
                'cohere-ai',
                'ollama',
              ],
              message:
                'Invariante 9: o núcleo não importa SDK de provider. Chamada de modelo entra pela interface ProviderAdapter (packages/runtime).',
            },
          ],
          paths: [
            {
              name: 'vm',
              message: 'Invariante 3: avaliação dinâmica é proibida. Use packages/expr (AGX-Expr).',
            },
            {
              name: 'node:vm',
              message: 'Invariante 3: avaliação dinâmica é proibida. Use packages/expr (AGX-Expr).',
            },
          ],
        },
      ],
    },
  },

  // Testes podem ser mais soltos com tipos, mas não com avaliação dinâmica.
  {
    files: ['**/*.test.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Deve ser o último: desliga regras que colidem com o Prettier.
  prettier,
);
