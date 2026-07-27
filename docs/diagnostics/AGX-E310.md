# AGX-E310 — Caminho desconhecido

|                 |                                                 |
| --------------- | ----------------------------------------------- |
| **Severidade**  | erro                                            |
| **Emitido por** | validador (typechecker de AGX-Expr)             |
| **Spec**        | [specs/agx-expr.md](../../specs/agx-expr.md) §4 |

## O que aconteceu

A expressão lê um canal, um campo de `run` ou uma entrada de nó que não está declarado.

## Por que isso é um problema

Este é o diagnóstico que sozinho justifica AGX-Expr não ser JavaScript.

`state.confidenc < 0.8` — uma letra a menos — falha **ao salvar o grafo**, com o nome correto na sugestão. Numa linguagem dinâmica a mesma expressão viraria `undefined < 0.8`, que é `false`, e o grafo rotearia pelo `otherwise` para sempre. Sem erro, sem aviso, e com um trace que mostra uma branch legitimamente tomada.

A sugestão usa distância de edição com transposição, porque trocar duas letras de lugar é tão comum quanto omitir uma. E ela só aparece quando há um candidato realmente próximo: sugestão errada manda a pessoa investigar o lugar errado, e isso é pior que não sugerir nada.

## Como corrigir

```diff
state:
  channels:
    confidence: { type: number, reducer: max, initial: 0 }

- when: "state.confidenc >= 0.8"    # AGX-E310 → você quis dizer state.confidence?
+ when: "state.confidence >= 0.8"
```

## Quando o erro é o esperado

Quando o canal existe mas foi declarado em outro grafo. Um `subgraph` com `scope: isolated` só enxerga o que foi mapeado na fronteira — o canal do pai não está visível de dentro, e isso é o isolamento funcionando, não um defeito.
