# AGX-Expr — especificação normativa

|                   |                                      |
| ----------------- | ------------------------------------ |
| **Status**        | NORMATIVO                            |
| **Implementação** | `packages/expr` (Fase 1)             |
| **Origem**        | Master Blueprint v2.0, Parte II §4.5 |

AGX-Expr é a **única** linguagem de condição da Alpha Graph IR. Existe por um motivo de
segurança, não de gosto: a seção de segurança promete que **importar um grafo nunca executa
código**, e a IR usa condições como `state.confidence < 0.8`. Avaliar essa string **é**
executar código. Com `eval`, `new Function` ou qualquer avaliador JS completo, um
`.agx.yaml` baixado da internet vira vetor de execução arbitrária dentro do editor.

As duas promessas só coexistem com uma linguagem própria, total, sem efeitos colaterais e
verificada por tipos.

## 1. Propriedades exigidas

1. **Total.** Toda expressão válida termina. Não há loops, não há recursão.
2. **Pura.** Não há atribuição, não há I/O, não há acesso a host, não há chamada de função
   definida pelo usuário.
3. **Limitada.** A avaliação tem **limite de fuel**; exceder o limite é erro de runtime, não
   travamento.
4. **Tipada.** Toda expressão é checada contra o schema de canais **em tempo de validação**,
   antes de qualquer execução.
5. **Interpretada por código nosso.** `eval`, `new Function` e `vm` são proibidos e barrados
   por regra de lint que falha o build (invariante 3).

## 2. Gramática

```text
expr    := or
or      := and ( "||" and )*
and     := cmp ( "&&" cmp )*
cmp     := add ( ( "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" ) add )?
add     := mul ( ( "+" | "-" ) mul )*
mul     := unary ( ( "*" | "/" | "%" ) unary )*
unary   := ( "!" | "-" )? primary
primary := literal | path | call | "(" expr ")"
path    := ( "state" | "in" | "run" ) ( "." IDENT | "[" INT "]" )*
call    := FUNC "(" ( expr ( "," expr )* )? ")"
```

Note que `cmp` **não** encadeia: `a < b < c` é erro de sintaxe, não uma comparação
encadeada silenciosamente errada.

### 2.1 Raízes de caminho

| Raiz    | Conteúdo                                                |
| ------- | ------------------------------------------------------- |
| `state` | Canais do grafo, conforme declarado em `state.channels` |
| `in`    | Entrada mapeada do nó corrente                          |
| `run`   | Metadados do run (`run.id`, `run.step`, `run.attempt`)  |

Não há outra raiz. Não há acesso a `globalThis`, `process`, `require` ou equivalente.

## 3. Biblioteca padrão — lista fechada

Todas as funções são puras. A lista é **fechada**: adicionar função exige ADR.

```text
len(x)             has(path)          matches(s, re)
lower(s)           upper(s)           coalesce(a, b)
startsWith(s, p)   endsWith(s, p)     contains(a, b)
int(x)             float(x)           bool(x)
now()
```

`now()` é **determinístico**: retorna o clock injetado do run, nunca o relógio real. Sem
isso, replay não reproduziria o mesmo trace.

### 3.1 Assinaturas

`T` é qualquer tipo; `T?` é `T | null` (§5). Onde o parâmetro é `T` e o argumento é `T?`, o
type-check falha com `AGX-E322` — a saída é `coalesce`.

| Função                                | Assinatura                                       | Nota                                            |
| ------------------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| `len(x)`                              | `(string \| array \| object) → number`           | caracteres, itens ou chaves                     |
| `has(p)`                              | `(path) → bool`                                  | única função que aceita caminho ausente ou nulo |
| `matches(s, re)`                      | `(string, string literal) → bool`                | `re` **DEVE** ser literal (§3.2)                |
| `lower(s)` / `upper(s)`               | `(string) → string`                              |                                                 |
| `coalesce(a, b)`                      | `(T?, T) → T`                                    | único caminho de `T?` para `T`                  |
| `startsWith(s, p)` / `endsWith(s, p)` | `(string, string) → bool`                        |                                                 |
| `contains(a, b)`                      | `(string, string) → bool` ou `(array, T) → bool` | substring ou pertencimento                      |
| `int(x)`                              | `(number \| string \| bool) → number`            | trunca em direção a zero                        |
| `float(x)`                            | `(number \| string \| bool) → number`            |                                                 |
| `bool(x)`                             | `(bool \| number \| string) → bool`              |                                                 |
| `now()`                               | `() → number`                                    | ms desde a época, do clock injetado             |

### 3.2 `matches(s, re)`

Decidido em [ADR-0003](../docs/decisions/ADR-0003-regex-sem-backtracking.md).

O motor é **próprio, por simulação de NFA**, com custo **O(n × m)** garantido por construção —
sem backtracking, e portanto sem entrada patológica. Um motor com backtracking derrotaria a
totalidade pela porta de trás: `(a+)+$` contra 30 caracteres já explora ~2³⁰ caminhos, e o
arquivo de grafo é entrada não confiável por design.

O padrão **DEVE ser um literal de string**. `matches(s, state.pattern)` é `AGX-E330`. Com
isso, a regex é compilada e validada **em tempo de validação do grafo** — padrão inválido
falha ao salvar, não em produção — e não existe caminho de dado do estado até autômato novo.

Suportado: literais e escapes, `.`, classes (`[a-z]`, `[^0-9]`, `\d \w \s` e negados), âncoras
`^` `$`, `*` `+` `?` `{n,m}`, alternação e agrupamento. Não há captura — `matches` devolve
`bool`.

Recusado com `AGX-E330`, explicitamente e não como literal: backreference, lookahead,
lookbehind, quantificador preguiçoso, grupo nomeado e flags. `{n,m}` tem teto de **1000** em
`m`, senão o ataque só migra do tempo de busca para o de compilação.

`.` casa **um code point**, não um grafema: emoji composto conta como mais de um.

## 4. Type-check contra o schema de canais

O ganho colateral é o que mais aparece no uso diário: como AGX-Expr é checada contra os
canais declarados, `state.confidenc < 0.8` **falha ao salvar o grafo**, com sugestão do nome
correto.

Numa linguagem dinâmica, a mesma expressão viraria `undefined < 0.8 === false` — um branch
errado, silencioso, em produção. Isto sozinho é argumento suficiente para não usar
JavaScript como linguagem de condição.

## 5. Tipos, nulidade e operadores

Decidido em [ADR-0004](../docs/decisions/ADR-0004-modelo-numerico.md) e
[ADR-0005](../docs/decisions/ADR-0005-nulidade-igualdade-ordenacao.md).

### 5.1 Nulidade faz parte do tipo

Um canal declarado `{ type: string, initial: null }` tem tipo **`string | null`**, não
`string`. O typechecker carrega isso, senão aceitaria `state.query + "!"` e entregaria
`"null!"` em produção.

| Operação sobre `T \| null`                         |                   |
| -------------------------------------------------- | ----------------- |
| `==` / `!=` contra `null` ou contra valor de `T`   | ✅ devolve `bool` |
| `<` `<=` `>` `>=`, aritmética, argumento de função | ❌ `AGX-E322`     |

A assimetria é deliberada: _"isto foi preenchido?"_ é pergunta bem definida; `null < 5` não é,
e as três respostas possíveis produzem grafos que roteiam errado sem avisar. A saída é
`coalesce(state.x, 0)`, que obriga a **declarar o que o ausente significa**.

`[LACUNA]` — não há narrowing sensível a fluxo: `state.x != null && state.x > 5` é erro, mesmo
sendo seguro. Fica para a Fase 2, quando der para medir o atrito sobre grafos reais. É o lado
que se afrouxa depois sem quebrar grafo salvo.

### 5.2 Igualdade e ordenação

- **Igualdade exige tipos compatíveis.** `state.count == "3"` é `AGX-E321`, não `false`.
- Igualdade de `array` e `object` é **estrutural**, nunca por referência.
- **Ordenação só para `number` e `string`.** `string` compara por **code point**, não por
  localidade — ordem dependente de locale quebraria o replay byte a byte.
- `bool`, `array`, `object` e `null` não são ordenáveis: `AGX-E321`.

### 5.3 `in` é pertencimento, e nunca substring

`x in array` (por igualdade estrutural) e `"k" in object` (chave existe). `"ab" in "abc"` é
`AGX-E321`, com a sugestão de usar `contains`. Um operador cujo sentido muda conforme o tipo
do operando muda de sentido quando alguém edita o tipo de um canal — e o typechecker aprovaria
as duas leituras.

### 5.4 Números: sem `NaN`, sem `Infinity`

Um só tipo `number` (IEEE-754 double). **Nenhuma expressão bem-sucedida pode produzir `NaN` ou
`Infinity`**: divisão por zero, overflow e conversão inválida são erro de avaliação
`AGX-R311`.

O motivo é que esses valores se propagam calados até virarem rota:
`state.cost / state.calls >= 0.5` com `calls == 0` daria `Infinity >= 0.5` → `true`, e o trace
registraria uma branch tomada sem sinal nenhum de que a conta não fecha.

Comparação é exata, **sem epsilon**: `0.1 + 0.2 == 0.3` é `false`. Tolerância implícita
tornaria `==` não transitivo, e transitividade quebrada num operador que decide roteamento é
pior que a surpresa do ponto flutuante.

Underflow para zero é permitido — perde precisão, não inverte comparação.

### 5.5 O que o typechecker não alcança

O schema descreve **canais**, não a forma de dentro deles. Ao descer em array ou object —
`state.documents[0].title` — o tipo do resultado passa a ser **desconhecido**, e a
verificação para de opinar dali para cima.

A consequência precisa ser dita: **nesses caminhos, um erro de tipo chega ao runtime** como
`AGX-R311`. `-state.documents[0]` é aceito na validação e falha ao avaliar, se o item for um
objeto.

A alternativa seria o typechecker fingir que sabe — assumir `string`, por exemplo — e aí ele
aprovaria comparações que não pode garantir, o que é pior: erro que vira `false` silencioso
em vez de erro que aparece. Enquanto a IR não permitir declarar a forma de dentro de um
canal, esta é a fronteira honesta.

Onde o schema enxerga por inteiro, vale a garantia forte: expressão verificada só falha por
aritmética (`AGX-R311`), nunca por tipo. É uma propriedade testada, não uma intenção.

### 5.6 Erro é valor, não exceção

`evaluate()` devolve `{ ok: true, value }` ou `{ ok: false, error }`. **O interpretador nunca
lança.** Uma exceção atravessando o interpretador seria a única falha do sistema sem `kind`, e
escaparia do canal `errors` e do trace.

## 6. Propriedades a provar por teste (Fase 1)

- Toda expressão que faz parse **termina** dentro do limite de fuel.
- Expressão mal tipada é rejeitada **em tempo de checagem**, nunca em tempo de execução.
- `parse` e reimpressão fazem round-trip: `print(parse(s))` reparseia para a mesma AST.
- Nenhuma entrada — inclusive malformada, unicode ou numericamente extrema — faz o parser
  lançar exceção não tratada. Erro é valor de retorno, não crash.

## 7. Diagnósticos

| Código     | Quando                                                                    |
| ---------- | ------------------------------------------------------------------------- |
| `AGX-E301` | Caractere inválido na entrada                                             |
| `AGX-E302` | Sintaxe inválida                                                          |
| `AGX-E310` | Caminho desconhecido — com sugestão do nome mais próximo                  |
| `AGX-E311` | Função fora da lista fechada                                              |
| `AGX-E312` | Número de argumentos incorreto                                            |
| `AGX-E320` | Tipo incompatível em operação                                             |
| `AGX-E321` | Comparação inválida entre tipos, ou `in` sobre string                     |
| `AGX-E322` | Operação sobre valor possivelmente nulo                                   |
| `AGX-E330` | Padrão de regex inválido, não suportado, ou não literal                   |
| `AGX-R310` | Fuel esgotado (runtime)                                                   |
| `AGX-R311` | Erro aritmético: divisão por zero, overflow, conversão inválida (runtime) |

`E3xx` são de **validação** — acontecem ao salvar o grafo. `R31x` são de **avaliação** e só
aparecem com valores em mãos.

## 8. Lacunas declaradas

As quatro lacunas da versão anterior foram fechadas por ADR-0003, ADR-0004 e ADR-0005. As que
restam:

- **Narrowing sensível a fluxo.** `state.x != null && state.x > 5` é `AGX-E322` hoje, mesmo
  sendo seguro. Fase 2, com o atrito já medido sobre grafos reais.
- **Unicode por grafema.** `len()` e `.` contam **code points**. Emoji composto conta como
  mais de um. Mudar isso depois é mudança de semântica observável e exigiria bump de versão.
- **Normalização de string.** `"é"` pré-composto e decomposto são strings diferentes para
  `==`. Se a IR passar a normalizar em NFC na serialização canônica, esta seção acompanha.
