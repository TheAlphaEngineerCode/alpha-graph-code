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
      // Critério de aceite 06 do blueprint: branch coverage >= 85% em core e compiler.
      // O limite passa a ser exigido quando os pacotes tiverem código (Fase 1).
      thresholds: {
        branches: 0,
        functions: 0,
        lines: 0,
        statements: 0,
      },
    },
  },
});
