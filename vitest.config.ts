import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'packages/**/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    // Um teste que não asserta nada passa por acidente. Sem arquivo de teste,
    // a suíte deve falhar, não passar em silêncio.
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts', 'packages/exporters/*/src/**/*.ts'],
      // Só o próprio teste sai da conta. `index.ts` fica: hoje é reexportação,
      // mas nada impede lógica de entrar lá depois — e aí ela sairia do relatório
      // sem ninguém decidir isso.
      exclude: ['**/*.test.ts'],
      // Critério de aceite 06: branch coverage >= 85% em core e compiler. Ligado na
      // Fase 1, quando passou a existir código para cobrir.
      //
      // O limite é o do critério, não o número atual (88%). Fixá-lo no valor de hoje
      // transformaria toda queda em falha de build, e o efeito prático seria alguém
      // baixar o número para destravar — que é como um limite de cobertura apodrece.
      thresholds: {
        branches: 85,
        functions: 85,
        lines: 85,
        statements: 85,
      },
    },
  },
});
