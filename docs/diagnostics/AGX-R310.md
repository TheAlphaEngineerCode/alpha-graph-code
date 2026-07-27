# AGX-R310 — Fuel esgotado

|                 |                                                 |
| --------------- | ----------------------------------------------- |
| **Severidade**  | erro de avaliação                               |
| **Emitido por** | runtime                                         |
| **Spec**        | [specs/agx-expr.md](../../specs/agx-expr.md) §1 |

## O que aconteceu

A avaliação de uma expressão excedeu o limite de passos.

## Por que isso é um problema

AGX-Expr não tem loop nem recursão, então nenhuma expressão pode rodar para sempre. O fuel existe para o que sobra: uma expressão muito grande, ou uma função cujo custo cresce com o **dado** em vez de com o texto da expressão.

`matches`, `len`, `lower` e `contains` cobram fuel proporcional ao tamanho da entrada, e não por chamada. Cobrar por chamada faria `matches` sobre 1 MB custar o mesmo que sobre três caracteres, e o teto deixaria de significar tempo.

Ver este erro quase sempre quer dizer que um canal cresceu muito mais do que o autor do grafo imaginou — vale olhar o reducer desse canal antes de subir o limite.

## Como corrigir

```diff
# quando o canal cresce sem limite, o problema costuma estar no reducer
state:
  channels:
-   log: { type: array, reducer: append, initial: [] }   # cresce a cada passo do ciclo
+   log: { type: array, reducer: replace, initial: [] }  # se só o último importa
```

## Quando o erro é o esperado

Sim, num grafo cujo dado legitimamente cresce. Aí o limite pode ser elevado conscientemente — mas antes vale confirmar que o crescimento do canal é intencional, porque `AGX-R310` costuma ser o primeiro sintoma visível de um acúmulo que ninguém pediu.
