# AGX-E322 — Operação sobre valor possivelmente nulo

|                 |                                                   |
| --------------- | ------------------------------------------------- |
| **Severidade**  | erro                                              |
| **Emitido por** | validador (typechecker de AGX-Expr)               |
| **Spec**        | [specs/agx-expr.md](../../specs/agx-expr.md) §5.1 |

## O que aconteceu

Uma ordenação, uma operação aritmética ou um argumento de função recebeu um valor cujo tipo inclui `null`.

## Por que isso é um problema

Um canal declarado `{ type: string, initial: null }` tem tipo `string | null`, não `string`. O typechecker carrega isso — se ignorasse, aceitaria `state.query + "!"` e entregaria `"null!"` em produção.

A regra é assimétrica de propósito:

- **Igualdade com `null` é sempre permitida.** É a pergunta "isto foi preenchido?", e é a que mais aparece em grafo real.
- **Ordenação e aritmética não são.** `null < 5` não tem resposta certa, e as três candidatas (`true`, `false`, erro) produzem grafos que roteiam errado sem avisar.

`coalesce(valor, padrão)` é a saída, e o atrito é o ponto: ele obriga a **declarar o que a ausência significa** — que é a decisão de negócio que estava escondida atrás do default implícito.

**Limitação conhecida:** não há narrowing sensível a fluxo. `state.x != null && state.x > 5` é seguro para um humano e continua recusado. Está declarado em `specs/agx-expr.md` §8 e é reavaliado na Fase 2.

## Como corrigir

```diff
state:
  channels:
    query: { type: string, reducer: replace, initial: null }   # ou seja: string | null

- when: "len(state.query) > 0"                # AGX-E322
+ when: "len(coalesce(state.query, '')) > 0"

# perguntar se foi preenchido continua permitido, sem coalesce
+ when: "state.query != null"
```

## Quando o erro é o esperado

Quando a intenção era só testar presença. Nesse caso não use `coalesce`: `has(state.query)` e `state.query != null` são aceitos diretamente.
