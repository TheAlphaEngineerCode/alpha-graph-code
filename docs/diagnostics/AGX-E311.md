# AGX-E311 — Função desconhecida

|                 |                                                 |
| --------------- | ----------------------------------------------- |
| **Severidade**  | erro                                            |
| **Emitido por** | validador (typechecker de AGX-Expr)             |
| **Spec**        | [specs/agx-expr.md](../../specs/agx-expr.md) §3 |

## O que aconteceu

A expressão chama uma função que não está na biblioteca padrão.

## Por que isso é um problema

A biblioteca padrão de AGX-Expr é **fechada**, e adicionar uma função exige ADR.

A lista fechada é o que permite afirmar, sem auditar grafo nenhum, que uma expressão não tem efeito colateral, não faz I/O e não chama o host. Se qualquer nome pudesse ser resolvido em runtime, essa afirmação passaria a depender de o ambiente de execução não ter registrado nada perigoso — que é uma garantia bem mais fraca.

Funções disponíveis: `len`, `has`, `matches`, `lower`, `upper`, `coalesce`, `startsWith`, `endsWith`, `contains`, `int`, `float`, `bool`, `now`.

## Como corrigir

```diff
- when: "lenght(state.findings) > 0"   # AGX-E311 → você quis dizer len?
+ when: "len(state.findings) > 0"

# não existe substring(); use as funções de teste
- when: "substring(state.q, 0, 3) == 'rel'"
+ when: "startsWith(state.q, 'rel')"
```

## Quando o erro é o esperado

Nunca. Se falta uma função de verdade, o caminho é propor a adição por ADR, não contornar na expressão.
