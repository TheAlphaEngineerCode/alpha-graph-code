# ADR-0004 — Modelo numérico: sem `NaN`, sem `Infinity`, erro é valor

|                    |                                            |
| ------------------ | ------------------------------------------ |
| **Status**         | Aceita                                     |
| **Data**           | 2026-07-27                                 |
| **Fase**           | 1                                          |
| **Fecha a lacuna** | `specs/agx-expr.md` §6 — precisão numérica |

## Contexto

A IR tem um único tipo numérico (`number`), e a serialização canônica exige a **menor
representação decimal que faz round-trip exato** (`ir-v1.md` §9). A aritmética de AGX-Expr
precisa concordar com isso.

A pergunta em aberto era o que acontece nas bordas: `1e308 * 10`, `1 / 0`, `0 / 0`.

O IEEE-754 responde com `Infinity`, `Infinity` e `NaN`. E aí está o problema: esses valores
**se propagam em silêncio até virarem uma decisão de roteamento**.

```text
state.cost / state.calls >= 0.5      # calls == 0  →  Infinity >= 0.5  →  true
state.score > 0.8                    # score é NaN →  false, e o otherwise vence
```

O primeiro roteia para o caminho caro por causa de uma divisão por zero. O segundo cai no
`otherwise` como se a condição tivesse sido avaliada de verdade. Nos dois casos o trace
registra uma branch tomada e **nenhum sinal de que algo deu errado** — que é exatamente a
classe de bug silencioso que motivou trocar JavaScript por AGX-Expr.

## Decisão

### 1. Um tipo `number`, IEEE-754 double

Sem `int`/`float` separados. Bate com o tipo `number` dos canais e com JSON. `int(x)` trunca
em direção a zero e devolve `number`.

### 2. `NaN` e `Infinity` não existem na linguagem

Nenhuma expressão bem-sucedida pode produzi-los. Toda operação que produziria um dos dois é
**erro de avaliação** `AGX-R311`:

| Expressão                  | Resultado                     |
| -------------------------- | ----------------------------- |
| `1 / 0`, `0 / 0`, `1 % 0`  | `AGX-R311` divisão por zero   |
| `1e308 * 10`               | `AGX-R311` overflow           |
| `int("abc")`, `float("x")` | `AGX-R311` conversão inválida |

Sem saturação: transformar overflow em `1.79e308` seria devolver um número plausível para uma
conta que não fecha, e alguém confiaria nele.

### 3. Erro é valor de retorno, não exceção

`evaluate()` devolve `{ ok: true, value }` ou `{ ok: false, error }`. Não lança.

Isso mantém a promessa de que o interpretador **nunca quebra o processo do host**, e faz a
falha percorrer o mesmo caminho de todas as outras: erro estruturado, canal `errors`, trace.
Uma exceção atravessando o interpretador seria a única falha do sistema sem `kind`.

### 4. Underflow para zero é permitido

`1e-320 / 1e10 == 0` não é erro. Denormal virando zero perde precisão, não muda a ordem de
grandeza de uma decisão — diferente de `Infinity`, que inverte comparações.

### 5. Comparação é exata, sem epsilon

`0.1 + 0.2 == 0.3` é **`false`**, e assim fica.

Considerei tolerância implícita e descartei: um epsilon embutido torna `==` não transitivo
(`a == b` e `b == c` sem `a == c`), e transitividade quebrada num operador que decide
roteamento é pior que a surpresa do ponto flutuante — que ao menos é a surpresa que todo
programador já conhece.

Quem precisa de tolerância escreve a conta.

## Consequências

- O interpretador checa `Number.isFinite` no resultado de cada operação aritmética. Custo de
  uma comparação por operação; nenhum impacto mensurável.
- `AGX-R311` é erro de **runtime**, não de validação: `state.a / state.b` só é conhecido com
  os valores em mãos. O typechecker aceita; o interpretador decide.
- Divisão continua sendo o operador mais arriscado de um grafo. A saída está documentada em
  `docs/diagnostics/AGX-R311.md`: guardar com `state.calls > 0` numa branch anterior.
- Propriedade a provar por teste: nenhuma avaliação bem-sucedida devolve valor não finito —
  gerada sobre expressões aleatórias, não sobre exemplos escolhidos.
