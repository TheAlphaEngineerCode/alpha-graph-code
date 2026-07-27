## O que muda

<!-- Uma frase. Se precisar de um parágrafo, considere dois PRs. -->

## Fase

<!-- Fase do docs/IMPLEMENTATION_PLAN.md a que este PR pertence. -->

## Checklist

- [ ] `pnpm check` verde local (lint + format + typecheck + test + build)
- [ ] Todos os commits com `Signed-off-by` (`git commit -s`)
- [ ] Feature nova tem teste com asserção significativa
- [ ] Nenhum `TODO` fingindo implementação no caminho crítico
- [ ] Zero `any` em `expr`, `graph-core` e `compiler`
- [ ] Diagnóstico `AGX-*` novo tem página em `docs/diagnostics/`
- [ ] Lowering novo tem entrada em `specs/lowerings.md` com fixture e golden test
- [ ] Mudança de semântica da IR tem ADR, bump de `alphaGraphVersion` e migration

## Invariantes

<!-- Se este PR toca algum invariante do AGENTS.md, diga qual e por quê.
     Se não toca nenhum, escreva "nenhum". -->

## O que não foi verificado

<!-- Escrever a limitação vale mais que dizer "testado". Se algo ficou sem cobertura,
     diga aqui em vez de deixar a revisão descobrir. -->
