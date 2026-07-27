# AGX-E330 — Padrão de regex inválido, não suportado ou não literal

|                 |                                                              |
| --------------- | ------------------------------------------------------------ |
| **Severidade**  | erro                                                         |
| **Emitido por** | validador (typechecker de AGX-Expr)                          |
| **Spec**        | [specs/agx-expr.md](../../specs/agx-expr.md) §3.2 · ADR-0003 |

## O que aconteceu

O segundo argumento de `matches()` não é um literal de string, ou é um padrão que o dialeto não aceita.

## Por que isso é um problema

AGX-Expr promete ser **total**: toda expressão válida termina. `matches()` é a única função capaz de quebrar essa promessa — não por não terminar, mas por terminar tarde demais para importar.

Com backtracking, o padrão `(a+)+$` contra 30 caracteres explora ~2³⁰ caminhos. Como o arquivo de grafo circula em pull request e vem de terceiro, isso seria um DoS de uma linha disparado por `agx validate` — o comando que a spec promete que não executa nada. Por isso o motor é de simulação de NFA, com custo linear garantido por construção.

**O padrão precisa ser literal** por três motivos que se somam: a regex é compilada e validada ao salvar o grafo (padrão inválido não chega a produção), não existe caminho de dado do estado até autômato novo, e a compilação acontece uma vez em vez de a cada passo do run.

Recusados explicitamente, com o motivo na mensagem: backreference, lookahead, lookbehind, quantificador preguiçoso, grupo nomeado, flags. Repetição `{n,m}` tem teto de 1000 — sem ele, o ataque migra do tempo de busca para o de compilação.

## Como corrigir

```diff
# padrão vindo do estado
- when: "matches(state.texto, state.padrao)"       # AGX-E330
+ when: "matches(state.texto, '^[A-Z]{2}-[0-9]+$')"

# backreference não existe neste dialeto
- when: "matches(state.s, '(ab)\\1')"              # AGX-E330
+ when: "matches(state.s, 'abab')"

# lookahead não existe
- when: "matches(state.s, '^(?=.*x).+$')"          # AGX-E330
+ when: "contains(state.s, 'x')"
```

## Quando o erro é o esperado

Quando o padrão realmente precisa variar em runtime. Isso é sinal de que a decisão não pertence a uma condição de aresta: use um nó `tool` ou um `router`, onde a lógica é explícita e auditável.
