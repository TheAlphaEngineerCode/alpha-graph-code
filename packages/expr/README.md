# @alpha-graph/expr

AGX-Expr: lexer, parser, typechecker e interpretador com limite de fuel.

**Estado:** implementado na Fase 1. A especificação normativa é
[`specs/agx-expr.md`](../../specs/agx-expr.md) — se este código divergir dela, é o código que
está errado (invariante 2 do [`AGENTS.md`](../../AGENTS.md)).

## Por que esta linguagem existe

A spec de segurança promete que **importar um grafo nunca executa código**, e a IR usa
condições como `state.confidence < 0.8`. Avaliar essa string **é** executar código: com
`eval` ou `new Function`, um `.agx.yaml` baixado da internet vira execução arbitrária dentro
do editor de quem o abriu.

As duas promessas só coexistem com uma linguagem própria: total, pura, sem acesso a host, sem
I/O, com limite de fuel, e interpretada por código deste pacote.

## Uso

```ts
import { compile, evaluate } from '@alpha-graph/expr';

const schema = {
  channels: {
    confidence: { type: 'number' },
    query: { type: 'string', initialIsNull: true }, // ou seja: string | null
  },
};

const checked = compile('state.confidence >= 0.8', schema);
if (!checked.ok) {
  // Diagnósticos com código estável, span e sugestão. Nada é lançado.
  for (const d of checked.diagnostics) console.error(d.code, d.message, d.suggestion);
} else {
  const result = evaluate(checked.value.ast, {
    state: { confidence: 0.91, query: null },
    nowMs: 1_700_000_000_000, // clock injetado, nunca Date.now()
    patterns: checked.value.patterns, // regex já compiladas na validação
  });
  // result.ok === true, result.value === true
}
```

`compile` faz parse e type-check numa passada — é o que `graph-core` chama ao validar uma
aresta. **Nenhuma função pública lança:** erro é valor de retorno.

## Garantias

|               |                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------- |
| **Total**     | Toda expressão válida termina. Sem loop, sem recursão, sem função de usuário.                     |
| **Pura**      | Sem I/O, sem host, sem atribuição. `now()` lê o clock injetado do run.                            |
| **Limitada**  | Fuel por avaliação, cobrado proporcionalmente ao trabalho — não por chamada.                      |
| **Tipada**    | Verificada contra o schema de canais **ao salvar o grafo**, não em produção.                      |
| **Não lança** | Nem com entrada malformada, unicode fora do BMP, número extremo ou 100 mil níveis de aninhamento. |

O ganho que mais aparece no uso diário: `state.confidenc < 0.8` falha ao salvar, com o nome
correto na sugestão. Numa linguagem dinâmica isso seria `undefined < 0.8 === false` — um
branch errado, silencioso, em produção.

## Decisões que valem conhecer antes de usar

- **[ADR-0003](../../docs/decisions/ADR-0003-regex-sem-backtracking.md)** — `matches()` usa
  motor próprio por simulação de NFA, com custo linear garantido por construção, e o padrão
  **deve ser literal**. Backtracking transformaria `(a+)+$` num DoS de uma linha.
- **[ADR-0004](../../docs/decisions/ADR-0004-modelo-numerico.md)** — **não existe `NaN` nem
  `Infinity`**. Divisão por zero e overflow são erro, porque esses valores se propagam calados
  até virarem uma decisão de roteamento.
- **[ADR-0005](../../docs/decisions/ADR-0005-nulidade-igualdade-ordenacao.md)** — nulidade faz
  parte do tipo. Comparar com `null` é sempre permitido; ordenar e somar não. `coalesce` é a
  saída, e o atrito é o ponto: ele obriga a declarar o que a ausência significa.

## Estrutura

```text
codepoints.ts   iteração por code point (uma decisão, um lugar)
diagnostics.ts  códigos, spans, sugestão por distância de edição
types.ts        modelo de tipos com nulidade
value.ts        valores de runtime e igualdade estrutural
lexer.ts        tokens
ast.ts          nós e percurso iterativo
parser.ts       descida recursiva, com limite de profundidade
printer.ts      reimpressão canônica com round-trip
regex.ts        motor de NFA sem backtracking
stdlib.ts       biblioteca padrão fechada: assinatura e implementação juntas
typecheck.ts    verificação contra o schema de canais
interpreter.ts  avaliação com fuel
```

Os diagnósticos emitidos (`AGX-E301`…`AGX-E330`, `AGX-R310`, `AGX-R311`) têm página própria em
[`docs/diagnostics/`](../../docs/diagnostics/), e um teste falha se algum deixar de ter.
