# AGX-E321 — Comparação inválida

|                 |                                                          |
| --------------- | -------------------------------------------------------- |
| **Severidade**  | erro                                                     |
| **Emitido por** | validador (typechecker de AGX-Expr)                      |
| **Spec**        | [specs/agx-expr.md](../../specs/agx-expr.md) §5.2 e §5.3 |

## O que aconteceu

Igualdade entre tipos incompatíveis, ordenação sobre tipo não ordenável, ou `in` sobre string.

## Por que isso é um problema

**Igualdade entre tipos diferentes é erro, e não `false`.** `state.count == "3"` sendo `false` em silêncio é exatamente o branch errado que esta linguagem existe para impedir. Se a intenção era comparar o número com o texto, a conversão precisa ser escrita.

**Ordenação só vale para `number` e `string`.** Não há ordem natural entre dois arrays, dois objetos ou dois booleanos, e qualquer uma que se inventasse seria uma convenção que ninguém consegue adivinhar lendo o grafo. Strings comparam por code point, e não por regra de localidade — ordem dependente de locale faria dois runs com a mesma cassette produzirem traces diferentes conforme a máquina.

**`in` é pertencimento, e nunca substring.** `contains(s, sub)` já cobre substring. Se `in` significasse as duas coisas conforme o tipo, a mesma expressão mudaria de sentido no dia em que alguém trocasse o tipo de um canal — e o typechecker aprovaria as duas leituras.

## Como corrigir

```diff
# igualdade entre tipos diferentes
- when: "state.iteration == '3'"        # AGX-E321
+ when: "state.iteration == 3"

# ordenação sobre array
- when: "state.findings > state.documents"   # AGX-E321
+ when: "len(state.findings) > len(state.documents)"

# in sobre string
- when: "'urgente' in state.assunto"    # AGX-E321
+ when: "contains(state.assunto, 'urgente')"
```

## Quando o erro é o esperado

Nunca.
