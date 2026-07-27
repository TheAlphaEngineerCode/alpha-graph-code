# AGX-E320 — Tipo incompatível em operação

|                 |                                                 |
| --------------- | ----------------------------------------------- |
| **Severidade**  | erro                                            |
| **Emitido por** | validador (typechecker de AGX-Expr)             |
| **Spec**        | [specs/agx-expr.md](../../specs/agx-expr.md) §5 |

## O que aconteceu

Um operador ou uma função recebeu um tipo que não aceita — inclusive quando dois argumentos de uma mesma chamada precisam concordar entre si.

## Por que isso é um problema

AGX-Expr **não converte tipos implicitamente**. É a decisão que elimina de uma vez a família de bugs de coerção.

O exemplo mais caro é `+`: em JavaScript, `1 + "1"` é `"11"`. Aqui `+` soma dois números ou concatena duas strings, e misturar é erro. Da mesma forma, `&&` exige booleano dos dois lados — não existe "valor verdadeiro", então `len(state.items) && ...` é recusado em vez de silenciosamente tratar `0` como falso.

Este código também cobre restrições **entre** argumentos. `coalesce` tem assinatura `(T?, T) → T`: o padrão precisa ser do mesmo tipo do valor, porque é ele que substitui o valor quando este é nulo. `coalesce("", 0)` anunciaria `number` e devolveria `""`.

## Como corrigir

```diff
# concatenação misturando tipos
- when: "state.iteration + '1' != ''"      # AGX-E320
+ when: "int(state.iteration) > 1"

# valor não booleano em operador lógico
- when: "len(state.findings) && state.approved"     # AGX-E320
+ when: "len(state.findings) > 0 && state.approved"

# padrão de tipo diferente do valor
- when: "coalesce(state.query, 0) == 0"    # AGX-E320
+ when: "coalesce(state.query, '') == ''"
```

## Quando o erro é o esperado

Nunca.
