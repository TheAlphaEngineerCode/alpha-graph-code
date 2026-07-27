# AGX-R311 — Erro aritmético ou de tipo em avaliação

|                 |                                                              |
| --------------- | ------------------------------------------------------------ |
| **Severidade**  | erro de avaliação                                            |
| **Emitido por** | runtime                                                      |
| **Spec**        | [specs/agx-expr.md](../../specs/agx-expr.md) §5.4 · ADR-0004 |

## O que aconteceu

Divisão por zero, overflow, conversão inválida, ou operação sobre um valor cujo tipo o schema não descrevia.

## Por que isso é um problema

**`NaN` e `Infinity` não existem em AGX-Expr.** Toda operação que os produziria é erro.

O motivo é que esses valores se propagam calados até virarem uma decisão de roteamento:

```text
state.cost / state.calls >= 0.5    # calls == 0  →  Infinity >= 0.5  →  true
```

Isso rotearia para o caminho caro por causa de uma divisão por zero, e o trace registraria uma branch legitimamente tomada — sem nenhum sinal de que a conta não fecha. Saturar em vez de falhar seria pior ainda: devolveria um número plausível para uma conta que não fechou, e alguém confiaria nele.

O erro de **tipo** em runtime tem uma causa só: caminhos que descem em array ou object. O schema declara o canal, não a forma de dentro dele, então `state.documents[0]` pode ser qualquer coisa e o typechecker para de opinar ali. É a fronteira declarada em `specs/agx-expr.md` §5.5.

E nessa fronteira o interpretador **também não coage**: `!valor`, `valor && x` e `valor || x` sobre não booleano são erro, e não `false`. Tratar como falso traria de volta a coerção silenciosa exatamente onde o typechecker não pode ajudar — a branch erraria e o trace mostraria uma decisão legítima.

## Como corrigir

```diff
# proteja o divisor numa branch anterior — o curto-circuito garante a ordem
- when: "state.cost / state.calls >= 0.5"       # AGX-R311 quando calls == 0
+ when: "state.calls > 0 && state.cost / state.calls >= 0.5"

# conversão que pode falhar
- when: "int(state.entrada) > 10"               # AGX-R311 se não for numérico
+ when: "matches(state.entrada, '^[0-9]+$') && int(state.entrada) > 10"
```

## Quando o erro é o esperado

Sim, e com frequência: é o comportamento correto recusando uma conta que não fecha. Ver este erro é o sistema avisando cedo, em vez de deixar `Infinity` escolher a rota. A correção normal é um guarda na expressão, não subir o limite nem ignorar o erro.
