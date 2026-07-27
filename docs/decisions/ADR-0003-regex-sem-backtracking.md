# ADR-0003 — `matches()`: motor sem backtracking e padrão literal obrigatório

|                    |                                           |
| ------------------ | ----------------------------------------- |
| **Status**         | Aceita                                    |
| **Data**           | 2026-07-27                                |
| **Fase**           | 1                                         |
| **Fecha a lacuna** | `specs/agx-expr.md` §6 — dialeto de regex |

## Contexto

AGX-Expr promete ser **total**: toda expressão válida termina. `matches(s, re)` está na
biblioteca padrão e é a única função que pode quebrar essa promessa — não por não terminar,
mas por terminar tarde demais para importar.

O caso clássico: o padrão `(a+)+$` contra uma entrada de 30 caracteres `a` faz um motor com
backtracking explorar ~2³⁰ caminhos. A expressão "termina", e o processo fica preso por horas.
**Uma linguagem total com um regex exponencial dentro é uma linguagem total no papel.**

Isso importa mais aqui do que num projeto comum, porque o arquivo de grafo é entrada não
confiável por design (`specs/ir-v1.md` §11). Um `.agx.yaml` baixado de terceiro com um padrão
patológico seria um DoS de uma linha, disparado por `agx validate` — o comando que a spec
promete que **não executa nada**.

Considerei três caminhos.

**`RegExp` nativo do JavaScript.** Zero código, e traz backtracking, backreference e lookaround
— exatamente o motor que torna o ataque acima trivial. Descartado.

**`RegExp` nativo com restrição sintática.** Proibir backreference e lookaround por validação
do padrão reduz muito a superfície, mas não elimina: aninhamento de quantificadores
(`(a|aa)*`) ainda explode em V8. O controle ficaria dependendo de eu enumerar corretamente
toda construção perigosa de um motor cujo comportamento não controlo.

**Motor próprio, simulação de NFA.** Custa ~250 linhas e dá a garantia por construção, não por
enumeração de casos ruins.

## Decisão

### 1. Motor próprio, com simulação de NFA em tempo linear

Construção de Thompson, simulando o conjunto de estados ativos em paralelo. O custo é
**O(n × m)** — n = tamanho da entrada, m = tamanho do padrão — **sem exceção e sem entrada
patológica**, porque o algoritmo nunca refaz um caminho: ele avança por todos ao mesmo tempo.

A garantia vem da forma do algoritmo, não de uma lista de padrões proibidos. É a diferença
entre "não conheço entrada que quebre" e "não existe entrada que quebre".

### 2. Subconjunto suportado

| Suportado                                       | Recusado, com diagnóstico `AGX-E330`          |
| ----------------------------------------------- | --------------------------------------------- |
| Literais e escapes (`\.`, `\\`, `\n`, `\t`)     | Backreference (`\1`)                          |
| `.` (qualquer caractere exceto `\n`)            | Lookahead / lookbehind (`(?=`, `(?!`, `(?<=`) |
| Classes `[a-z]`, `[^0-9]`, `\d \w \s` e negados | Quantificador preguiçoso (`*?`)               |
| Âncoras `^` e `$`                               | Grupo com captura nomeada                     |
| `*`, `+`, `?`, `{n}`, `{n,}`, `{n,m}`           | Flags (`/i`, `/g`, …)                         |
| Alternação `\|` e agrupamento `(...)`           |                                               |

Não há captura: `matches` devolve `bool`. Grupo serve só para agrupar.

O quantificador limitado `{n,m}` é expandido na compilação, e **`m` tem teto de 1000**. Sem
teto, `a{1,1000000}` produziria um autômato de um milhão de estados — o mesmo ataque, movido
do tempo de busca para o de compilação.

Recusar é explícito: `\1` devolve `AGX-E330` dizendo que backreference não existe neste
dialeto e por quê, em vez de tratar como literal `1` — que é o que um motor permissivo faria,
e o padrão passaria a casar coisa diferente do que o autor escreveu.

### 3. O padrão DEVE ser um literal de string

`matches(state.text, state.pattern)` é **erro de type-check** (`AGX-E330`).

Esta é a metade da decisão que mais importa e a menos óbvia. Com padrão literal:

- a regex é **compilada e validada em tempo de validação do grafo**, não de execução — um
  padrão inválido falha ao salvar, junto com `state.confidenc`, e não em produção;
- não existe construção dinâmica de regex, então nenhum caminho leva de dado do estado a
  autômato novo;
- a compilação acontece **uma vez**, e o autômato pode ser reusado em todo passo do run.

O custo é real: não dá para escolher o padrão em runtime. Aceito — um workflow que precisa
disso quer `router` ou uma `tool`, não uma condição de aresta.

## Consequências

- `packages/expr` ganha `src/regex/`, sem dependência externa. É código a manter, e é o preço
  de a totalidade ser verdadeira.
- A compilação do padrão roda no typechecker. Erro de regex é diagnóstico de validação.
- O interpretador **não** compila regex: recebe o autômato pronto. Isso mantém `matches` com
  custo previsível por chamada e cobrado do fuel proporcionalmente ao tamanho da entrada.
- Propriedade a provar por teste: para todo padrão aceito e toda entrada, a execução consome
  fuel proporcional a `n × m` — inclusive para `(a+)+$`, o caso que motivou a decisão.
- Unicode fica por code point, não por grafema. Uma lacuna registrada em `agx-expr.md`: `.`
  casa um code point, então emoji composto conta como mais de um. Dito, não escondido.
