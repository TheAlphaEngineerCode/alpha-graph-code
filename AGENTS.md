# AGENTS.md — Alpha Graph Code

> Este arquivo é o contrato permanente do projeto. Deve permanecer em contexto em
> **toda** sessão de trabalho com agentes de código. Invariante violado = bug, sem exceção.

---

## O que este projeto é

Um **compilador de workflows de IA com IDE visual**.

O usuário descreve ou desenha um workflow, o sistema converte para a **Alpha Graph IR**,
valida, simula passo a passo e compila para artefatos executáveis em runtimes de terceiros.

**O que este projeto NÃO é:**

- Não é um runtime hospedado. Simulação existe para inspecionar, não para servir tráfego.
- Não é um marketplace de integrações. Ferramentas entram pela interface de tool calling do usuário.
- Não é uma ferramenta de automação genérica. Sem webhook, cron ou planilha no core.
- Não é uma plataforma SaaS. Contas, billing e colaboração ficam fora do caminho crítico.

---

## Invariantes

1. **A Alpha Graph IR é a fonte da verdade.** A UI lê e escreve IR; nunca mantém estado
   próprio que não exista na IR (exceto viewport e seleção).
2. **`specs/ir-v1.md` é NORMATIVO.** Se o código divergir da spec, o código está errado.
   Mudar semântica exige ADR + bump de `alphaGraphVersion` + migration + fixture.
3. **Proibido `eval`, `new Function`, `vm`** ou qualquer avaliação dinâmica. Condições usam
   AGX-Expr (`packages/expr`). Regra de lint garante isso e falha o build.
4. **Secrets nunca dentro do grafo.** Somente referências `${env:*}` e `${vault:*}`.
5. **Importar ou validar um grafo NUNCA executa nada.** Só `simulate` e `run` executam.
6. **Fan-out só por nó `parallel`.** Branches são ordenadas e first-match. Duas arestas
   incondicionais saindo do mesmo nó é erro `AGX-E210`.
7. **Canal escrito por ramos concorrentes exige reducer comutativo e associativo.**
   `replace` sob fan-in é erro `AGX-E401`.
8. **Nenhuma incompatibilidade de exporter é silenciosa:** `native`, `lowered` (com transform
   nomeada, documentada e testada) ou `unsupported` (erro duro).
9. **`graph-core`, `expr` e `compiler` não importam React, Next.js nem SDK de provider.**
10. **Zero `any`** em `graph-core`, `expr` e `compiler`. TypeScript strict.
11. **Determinismo:** fronteira em ordem de declaração, RNG semeado por `run_id`, clock
    injetado. Mesma entrada + mesma cassette = mesmo trace, byte a byte.
12. **Ciclo sem `maxNodeVisits` não existe.** O limite por nó é o guarda real, não `maxSteps`.

Os invariantes 3, 9 e 10 são barrados por regra de lint. Os invariantes 3 e 9 têm também
teste próprio em `tests/invariants.test.ts` — lint se desliga por comentário, teste não.

---

## Como trabalhar

- Uma fase vertical por vez. Ao fim de cada fase: `lint`, `typecheck`, `test`, `build`.
- Sem código placeholder no caminho crítico. Sem `TODO` fingindo implementação.
- Trade-off relevante vira ADR em `docs/decisions/` **antes** de virar código.
- Não alterar requisito silenciosamente. Se a spec estiver errada, propor mudança de spec primeiro.
- Toda feature nova nasce com teste. Core e compiler: property test onde couber.
- Diagnóstico novo nasce com página em `docs/diagnostics/<CODIGO>.md`.
- Afirmação verificável não vai para a documentação sem ter sido verificada. Se um número,
  uma versão ou um "schema válido" pode ser checado por comando, rode o comando primeiro.
- Texto que diz "ainda não existe" envelhece sozinho enquanto o projeto avança. Reler as
  afirmações sobre o futuro a cada fase faz parte do fechamento da fase.

---

## Comandos

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check          # os quatro acima, em ordem, como o CI roda

pnpm agx validate <arquivo>
pnpm agx simulate <arquivo> --cassette <nome>
pnpm agx fmt <arquivo>
pnpm agx explain <arquivo>
pnpm agx compile <arquivo> --target langgraph
```

Os comandos `agx` existem a partir da **Fase 4**. Antes disso, invocá-los é erro esperado,
não defeito.

---

## Estrutura

```
packages/expr        AGX-Expr: lexer, parser, typechecker, interpretador
packages/graph-core  IR, schema, parser, validator, normalização, migrations
packages/runtime     executor, reducers, checkpoints, cassettes, trace
packages/compiler    pipeline, capability model, diagnósticos
packages/exporters/  json | yaml | prompt | langgraph
packages/cli         agx
apps/web             Studio (a partir da v0.2)
specs/               ir-v1.md · agx-expr.md · trace-v1.md · lowerings.md  ← NORMATIVO
evals/               prompt-to-graph
cassettes/           gravações de record/replay
docs/decisions/      ADRs
```

---

## Licença e contribuição

Apache-2.0 + DCO (sign-off). Registrado em `docs/decisions/ADR-0001.md`.
