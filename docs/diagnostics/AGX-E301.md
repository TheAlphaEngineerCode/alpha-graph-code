# AGX-E301 — Caractere inválido

|                 |                                                 |
| --------------- | ----------------------------------------------- |
| **Severidade**  | erro                                            |
| **Emitido por** | validador (léxico de AGX-Expr)                  |
| **Spec**        | [specs/agx-expr.md](../../specs/agx-expr.md) §2 |

## O que aconteceu

A expressão contém um caractere que AGX-Expr não reconhece, uma string sem aspas de fechamento, um escape desconhecido, ou um literal numérico grande demais para um double.

## Por que isso é um problema

AGX-Expr tem uma gramática fechada. Ela não é um subconjunto de JavaScript com pedaços faltando — é uma linguagem própria, e o que não está na gramática não existe.

O caso mais comum é `=` no lugar de `==`, trazido de linguagem com atribuição. AGX-Expr **não tem atribuição**: uma expressão de condição não pode mudar o estado, e é essa restrição que permite afirmar que avaliar uma aresta não tem efeito colateral.

Literal numérico fora da faixa é recusado pelo mesmo motivo que overflow aritmético (ADR-0004): `Infinity` não circula nesta linguagem, e aceitá-lo por um literal o traria de volta pela porta dos fundos.

## Como corrigir

```diff
# atribuição no lugar de comparação
- when: "state.decision = 'approve'"     # AGX-E301
+ when: "state.decision == 'approve'"

# string sem fechar
- when: "startsWith(state.query, 'rel)"  # AGX-E301
+ when: "startsWith(state.query, 'rel')"

# literal que estoura o double
- when: "state.cost < 1e400"             # AGX-E301
+ when: "state.cost < 1e308"
```

## Quando o erro é o esperado

Nunca. Este código sempre indica um engano de escrita — não há construção válida que o produza.
