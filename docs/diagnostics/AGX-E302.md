# AGX-E302 — Sintaxe inválida

|                 |                                                 |
| --------------- | ----------------------------------------------- |
| **Severidade**  | erro                                            |
| **Emitido por** | validador (parser de AGX-Expr)                  |
| **Spec**        | [specs/agx-expr.md](../../specs/agx-expr.md) §2 |

## O que aconteceu

A expressão é lexicamente válida, mas a sequência de tokens não forma uma expressão: parêntese sem fechar, operador sem operando, comparação encadeada, ou índice calculado.

## Por que isso é um problema

Três recusas merecem explicação, porque cada uma existe por uma razão específica e não por limitação do parser.

**Comparação encadeada.** `a < b < c` é erro, e não `(a < b) < c`. Numa linguagem com coerção, a segunda leitura compara um booleano com um número e devolve um resultado sem sentido, calado. Escrever `a < b && b < c` custa cinco caracteres e diz o que se quis dizer.

**Índice calculado.** `state.items[state.i]` é recusado porque o caminho precisa ser analisável **sem executar nada**. É isso que permite ao validador saber, antes de qualquer run, quais canais cada nó lê e escreve — e é dessa análise que saem os diagnósticos de canal lido antes de escrito.

**Nome solto.** `confidence > 0.5` sem raiz é recusado porque não existe escopo global em AGX-Expr. Todo valor vem de `state`, `in` ou `run`, e essa é a fronteira que impede um caminho até `globalThis`.

## Como corrigir

```diff
# comparação encadeada
- when: "0.5 < state.confidence < 0.9"   # AGX-E302
+ when: "0.5 < state.confidence && state.confidence < 0.9"

# nome sem raiz
- when: "confidence > 0.5"               # AGX-E302
+ when: "state.confidence > 0.5"

# índice calculado
- when: "state.items[state.i] == 'x'"    # AGX-E302
+ when: "state.items[0] == 'x'"
```

## Quando o erro é o esperado

Nunca. Toda ocorrência é engano de escrita, e a sugestão do diagnóstico aponta a forma equivalente.
