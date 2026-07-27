# AGX-E312 — Número de argumentos incorreto

|                 |                                                   |
| --------------- | ------------------------------------------------- |
| **Severidade**  | erro                                              |
| **Emitido por** | validador (typechecker de AGX-Expr)               |
| **Spec**        | [specs/agx-expr.md](../../specs/agx-expr.md) §3.1 |

## O que aconteceu

A chamada tem mais ou menos argumentos do que a assinatura declara.

## Por que isso é um problema

Não há argumento opcional nem parâmetro variádico na biblioteca padrão. Cada função tem uma aridade só.

A uniformidade é deliberada: com aridade fixa, o validador sabe exatamente o que cada chamada custa em fuel e quais caminhos ela toca, sem precisar considerar formas alternativas da mesma chamada.

O caso mais frequente é `coalesce` com um argumento — mas `coalesce` sem padrão não resolveria nada, porque o resultado continuaria podendo ser nulo.

## Como corrigir

```diff
- when: "coalesce(state.query) != ''"       # AGX-E312
+ when: "coalesce(state.query, '') != ''"
```

## Quando o erro é o esperado

Nunca.
