# ADR-0005 — Nulidade, igualdade, ordenação e `in`

|                      |                                                                     |
| -------------------- | ------------------------------------------------------------------- |
| **Status**           | Aceita                                                              |
| **Data**             | 2026-07-27                                                          |
| **Fase**             | 1                                                                   |
| **Fecha as lacunas** | `specs/agx-expr.md` §6 — semântica de `in` e comparação entre tipos |

## Contexto

Duas lacunas que parecem separadas são a mesma pergunta: **quais tipos podem se encontrar num
operador, e o que acontece quando não podem.**

E há um terceiro fato que a spec da IR já impõe e ninguém tinha ligado ao typechecker: canais
declaram `initial`, e vários declaram `initial: null` com tipo `string`
(`ir-v1.md` §2). Ou seja, **`state.query` não é `string` — é `string | null`**. Um typechecker
que ignore isso aceita `state.query + "!"` e entrega `"null!"` em produção.

## Decisão

### 1. Nulidade faz parte do tipo

O tipo de um canal é `T` quando `initial` é um valor de `T`, e `T | null` quando `initial` é
`null`. O typechecker carrega isso.

| Operação sobre `T \| null`      | Resultado                                             |
| ------------------------------- | ----------------------------------------------------- |
| `==` / `!=` contra `null`       | ✅ sempre permitido, devolve `bool`                   |
| `==` / `!=` contra valor de `T` | ✅ permitido — `null` nunca é igual a um valor de `T` |
| `<`, `<=`, `>`, `>=`            | ❌ `AGX-E322`                                         |
| `+`, `-`, `*`, `/`, `%`         | ❌ `AGX-E322`                                         |
| argumento de função da stdlib   | ❌ `AGX-E322`, salvo `has()` e `coalesce()`           |

A assimetria é deliberada. **Igualdade com `null` é uma pergunta bem definida** — "isto foi
preenchido?" — e é a pergunta que quem escreve o grafo mais faz. **Ordem contra `null` não é**:
não existe resposta certa para `null < 5`, e as três opções (`true`, `false`, erro) levam a
grafos que roteiam errado sem avisar.

A saída é `coalesce(state.confidence, 0)`, que obriga quem escreve a **declarar o que o
ausente significa** — que é a decisão de negócio que estava escondida.

**`[LACUNA]`** — não há narrowing sensível a fluxo. `state.x != null && state.x > 5` é erro,
mesmo sendo obviamente seguro. Fica para a Fase 2, quando o typechecker já tiver rodado sobre
grafos reais e der para medir se o atrito justifica a complexidade. Recusar por enquanto é
recusar demais, e é o lado errado que se conserta sem quebrar grafo salvo.

### 2. Igualdade exige tipos compatíveis

`state.count == "3"` é **erro de type-check** (`AGX-E321`), não `false`.

Em JavaScript isso seria `false` em silêncio, e a branch erraria. É o mesmo argumento do
`state.confidenc` da spec: o valor da linguagem está em transformar erro de digitação e de
tipo em falha **ao salvar o grafo**.

Igualdade sobre `array` e `object` é **estrutural** (mesma ordem, mesmas chaves, mesmos
valores), não por referência. Referência não significa nada num valor que veio de JSON.

### 3. Ordenação só para `number` e `string`

`string` compara por **code point** (o `<` de JavaScript), não por regra de localidade. Ordem
por localidade dependeria de locale do host e quebraria o determinismo do replay — dois runs
com a mesma cassette dando traces diferentes por causa da configuração da máquina.

`bool`, `array`, `object` e `null` não são ordenáveis: `AGX-E321`.

### 4. `in` é pertencimento, e nunca substring

| Expressão       | Significado                                |
| --------------- | ------------------------------------------ |
| `x in array`    | pertence, por igualdade estrutural         |
| `"k" in object` | a chave existe                             |
| `"ab" in "abc"` | ❌ `AGX-E321` — _"use `contains(s, sub)`"_ |

`contains(a, b)` já cobre substring. Deixar `in` significar pertencimento **ou** substring
conforme o tipo faria a mesma expressão mudar de sentido quando alguém trocasse o tipo de um
canal — e o typechecker aprovaria as duas leituras.

Um operador, um significado. O diagnóstico aponta a função certa.

## Consequências

- O typechecker precisa de um modelo de tipos com nulidade, não de um enum simples de tipos.
- `coalesce(a, b)` ganha papel central: é o único caminho de `T | null` para `T`. Sua
  assinatura é `(T | null, T) → T`.
- `has(path)` devolve `bool` e aceita caminho possivelmente nulo ou inexistente — é a função
  de pergunta, e por isso não segue a regra da tabela.
- Grafos vão precisar de mais `coalesce` do que quem vem de JavaScript espera. É atrito
  intencional, e cada um marca um lugar onde alguém teria assumido um default sem dizer qual.
