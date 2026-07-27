# Plano de implementação

|                |                                                 |
| -------------- | ----------------------------------------------- |
| **Fase atual** | **1 — AGX-Expr** ✅ concluída em 2026-07-27     |
| **Próxima**    | 2 — Graph Core                                  |
| **Estratégia** | Headless-first. O canvas **não** entra na v0.1. |

## Por que headless-first

O diferencial deste projeto é a IR e o compilador. O canvas é a parte mais cara de construir,
a menos diferenciada frente a Langflow/Flowise/Rivet, e a que mais sofre quando a IR muda.
Construir canvas contra uma IR não provada é garantir retrabalho.

O modo de falha que este recorte evita é conhecido: o repositório morre com um bootstrap
impecável, um canvas meio pronto e nenhum grafo que rode.

E o ganho concreto: descobrir um defeito estrutural na semântica de estado com 4 mil linhas de
core é barato. Descobrir com 4 mil de core mais 12 mil de canvas, não.

---

## Regra de avanço

Ao fim de cada fase: **`pnpm check`** — lint, formato, typecheck, testes com cobertura e
build, na mesma ordem em que o CI roda. **Critério de saída não atendido = não se avança.**
Débito não passa de fase.

Entre fases, rodar a auditoria: invariantes violados, placeholder no caminho crítico,
diagnóstico sem página de documentação, `any` no núcleo, e teste que passa sem asserção
significativa.

---

## Fases

### Fase 0 — Fundação ✅

Bootstrap do monorepo, tooling, CI, `AGENTS.md`, specs normativas, ADR-0001 e ADR-0002.
Nenhuma feature.

**Entregue:**

- pnpm workspace + Turborepo, 12 pacotes com `package.json`, dois `tsconfig` cada
  (typecheck / build), grafo de dependência declarado
- TypeScript 5.9.3 strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
- ESLint 10 com typescript-eslint tipado no núcleo; barreiras de lint para os invariantes
  3 (avaliação dinâmica), 9 (isolamento do núcleo) e 10 (zero `any`)
- Prettier, Vitest 4, `tests/invariants.test.ts` guardando os invariantes 3, 9 e 10 por teste
  além do lint
- CI GitHub Actions com matriz de Node (22, 24) + verificação de DCO em PR
- `specs/ir-v1.md`, `agx-expr.md`, `trace-v1.md`, `lowerings.md`
- Apache-2.0 + `NOTICE`, `CONTRIBUTING.md` com DCO, `SECURITY.md`

**Critério de saída:** `pnpm check` verde nas versões de Node do CI. ✅

**O que a Fase 0 deliberadamente não tem:** nenhuma linha de implementação. Os
`src/index.ts` dos 12 pacotes são módulos vazios — não placeholders de implementação.

---

### Fase 1 — AGX-Expr ✅

`packages/expr`, isolado, **sem dependência de `graph-core`**.

**Entregue:** lexer por code point, parser de descida recursiva com limite de
profundidade, printer com round-trip, motor de regex próprio por simulação de NFA,
typechecker com nulidade no tipo e sugestão de nome, interpretador com fuel, biblioteca
padrão fechada de 13 funções. 244 testes, branch coverage 88%.

**As quatro lacunas fecharam por ADR** antes do código: ADR-0003 (regex sem backtracking,
padrão literal obrigatório), ADR-0004 (sem `NaN`, sem `Infinity`, erro é valor) e
ADR-0005 (nulidade, igualdade, ordenação e `in`).

**Critério de saída — atendido:**

- ✅ Toda expressão que faz parse termina dentro do fuel (property test)
- ✅ Expressão mal tipada é rejeitada em tempo de checagem
- ✅ `print(parse(s))` reparseia para a mesma AST, e é idempotente
- ✅ Nenhuma entrada faz o parser lançar — inclusive malformada, unicode fora do BMP,
  numericamente extrema e com 100 mil níveis de aninhamento
- ✅ Os 11 diagnósticos emitidos têm página em `docs/diagnostics/`, verificado por teste

**Três defeitos foram encontrados por teste de propriedade, e nenhum por exemplo:**

1. `coalesce("", 0)` passava no typecheck anunciando `number` e devolvia `""` — a
   assinatura `(T?, T) → T` do ADR-0005 não estava sendo verificada **entre** os dois
   argumentos.
2. Span de diagnóstico apontava além do fim da entrada quando uma string não fechava.
3. Descer em array/object deixa erro de tipo chegar ao runtime. Não era corrigível — o
   schema descreve o canal, não a forma de dentro — então virou limitação declarada em
   `specs/agx-expr.md` §5.5, com teste que a documenta.

E um quarto, achado ao cobrir a API pública: a descida recursiva estourava a pilha com
~2000 níveis de parêntese, e `RangeError` **escapa do `Result`** — quebrando a promessa
de que analisar nunca lança, num caminho que recebe arquivo de terceiro.

---

### Fase 2 — Graph Core

`packages/graph-core`. Tipos da IR, JSON Schema, parser YAML/JSON, normalização, serialização
canônica, IDs imutáveis, migrations, validador estrutural e semântico.

**Diagnósticos mínimos:** `AGX-E210` (fan-out implícito), `AGX-E401` (reducer não comutativo
sob concorrência), branches não exaustivas, canal lido antes de escrito, referência a nó
inexistente, ciclo sem limite de visitas. Fixture válido **e** inválido para cada código.

**Critério de saída:**

- `parse(serialize(g)) === g` byte a byte em todos os templates
- Fuzzing de YAML/JSON malformado: **zero exceção não tratada**
- `normalize(normalize(g)) === normalize(g)`
- Cada diagnóstico emitido tem página em `docs/diagnostics/`
- Lacunas de `ir-v1.md` §13 resolvidas ou reafirmadas com prazo

---

### Fase 3 — Runtime

`packages/runtime`. Executor conforme o laço normativo de [`ir-v1.md`](../specs/ir-v1.md) §10,
reducers, roteamento first-match, cadeia de erro com a precedência de §6.1, checkpoints com
`resume_token`, limites de steps/visitas/profundidade/tempo/orçamento, cassettes de
record/replay, RNG semeado, clock injetado. Trace v1 completo.

**Critério de saída — testes explícitos:**

- Ciclo atingindo `maxNodeVisits` (`AGX-R301`)
- Join `n_of_m` com ramo que falha
- Interrupt e retomada, com o processo morto no meio
- **Replay produzindo trace idêntico byte a byte**

---

### Fase 4 — CLI e primeiro marco

`packages/cli` com `validate`, `simulate`, `fmt`, `explain`. Três templates:
planner/executor/verifier com ciclo, research/synthesize/review/report com aprovação humana,
e RAG com query rewrite. Saída de terminal legível, com cores e códigos de diagnóstico.

**> Este é o marco de demonstração. Parar aqui, rodar tudo e reportar antes de avançar.**

**Critério de saída:**

```bash
agx simulate templates/planner-executor-verifier.yaml --cassette happy
```

executa o ciclo, respeita `maxNodeVisits` e produz **trace reproduzível byte a byte em duas
execuções consecutivas**. E `agx validate` rejeita, com diagnóstico útil, um grafo que use
reducer `replace` em canal escrito por ramos concorrentes.

---

### Fase 5 — Compiler e exporters base

`packages/compiler` com o pipeline
`parse → validate → typecheck → normalize → analyze → lower → generate → format → verify`,
capability model em três estados, e exporters `json`, `yaml`, `prompt`.

**Critério de saída:** todo lowering aplicado emite diagnóstico informativo e tem entrada em
[`specs/lowerings.md`](../specs/lowerings.md) com transform nomeada, fixture, golden test e
página de documentação. Golden tests para todos os templates, diff = 0.

---

### Fase 6 — Studio

`apps/web`. O canvas lê e escreve **exclusivamente** a IR — nenhum estado de editor que não
exista na IR, exceto viewport e seleção. Node palette, edges com labels legíveis, inspector,
seleção múltipla, duplicar, copiar/colar, undo/redo, minimap, validação inline, persistência
local.

**Critério de saída:** round-trip `ui → ir → ui` provado por property test em **1000 grafos
gerados**, 1000/1000. Pan/zoom com 200 nós a ≥ 50 fps.

---

### Fase 7 — LangGraph

Exporter LangGraph isolado. Projeto Python legível e idiomático a partir da IR, mapping
document, capability matrix preenchida, fixtures, golden tests.

**Critério de saída:** o código gerado roda **sem edição manual** em 8 de 8 templates.

---

### Fase 8 — Generate

`ProviderAdapter`, formato AGX-Sketch, expansão determinística `sketch → IR`, repair loop
limitado a **duas** tentativas, preview/diff antes de aplicar. O LLM **nunca** escreve a IR
diretamente — produz o Sketch, e um compilador determinístico faz o trabalho estrutural.

`evals/prompt-to-graph/` com no mínimo 20 casos. Chaves somente por variável de ambiente.

**Critério de saída:** `valid_rate >= 0,90` e `assertion_pass_rate >= 0,75` no eval set.

---

### Fase 9 — Release quality

E2E do caminho feliz, acessibilidade por teclado e contraste (WCAG AA no core), performance de
canvas, error boundaries, empty states educativos, onboarding, README com GIF,
`ARCHITECTURE.md`, checklist de release.

**Critério de saída:** usuário novo vai de clone a artefato exportado em **≤ 10 min e ≤ 5
comandos**.

---

## Critérios de aceite globais

Todos automatizáveis; nenhum depende de julgamento subjetivo.

| #   | Critério                     | Medição                                     | Alvo                         | Fase |
| --- | ---------------------------- | ------------------------------------------- | ---------------------------- | ---- |
| 01  | Round-trip canônico          | `parse(serialize(g))` em todos os templates | Idêntico byte a byte         | 2    |
| 02  | Round-trip de UI             | Property test sobre grafos gerados          | 1000/1000                    | 6    |
| 03  | Robustez do validador        | Fuzzing de YAML/JSON malformado             | Zero exceção não tratada     | 2    |
| 04  | Golden tests de exporter     | Diff contra arquivos golden                 | Diff = 0                     | 5    |
| 05  | Determinismo de replay       | Mesma cassette, dois runs                   | Trace idêntico               | 3    |
| 06  | Cobertura de core e compiler | Branch coverage                             | ≥ 85%                        | 5    |
| 07  | Tipagem                      | `any` explícito em core, expr e compiler    | Zero                         | 1    |
| 08  | Diagnósticos documentados    | Todo código emitido tem página              | 100%                         | 2    |
| 09  | Prompt to Graph              | Eval set versionado                         | valid ≥ 0,90 / assert ≥ 0,75 | 8    |
| 10  | Cold start                   | Clone até primeiro artefato exportado       | ≤ 10 min, ≤ 5 comandos       | 9    |
| 11  | Performance do canvas        | Pan/zoom com 200 nós                        | ≥ 50 fps                     | 6    |
| 12  | Acessibilidade               | Fluxo por teclado + contraste               | WCAG AA no core              | 9    |
| 13  | Migrations                   | Carregar fixture de cada versão anterior    | 100% sem perda               | 2    |

O limite de cobertura (06) foi ligado na **Fase 1**, quando passou a existir código: 85% em
`vitest.config.ts`, e o `check` roda `coverage` em vez de `test` para que o CI de fato o
execute. Está em 88% hoje. O limite é o do critério, não o número atual — fixá-lo no valor
de hoje faria toda queda quebrar o build, e o efeito prático seria alguém baixar o número.

---

## O que não fazer

- **Não começar pelo canvas.** É a decisão que mais atrasa o projeto e a mais tentadora.
- Não implementar integrações antes de a IR estar congelada.
- Não colocar lógica de domínio dentro de componente React.
- Não usar LLM para decisão que uma expressão determinista resolve — o linter deve avisar.
- Não permitir ciclo sem `maxNodeVisits`.
- Não esconder incompatibilidade de exporter atrás de default silencioso.
- Não colocar autenticação, billing ou infraestrutura SaaS no caminho crítico.
- Não prometer portabilidade perfeita. Prometer **diferenças explícitas**.

## Riscos

| Risco                                                  | Prob. | Impacto | Mitigação                                                                     |
| ------------------------------------------------------ | ----- | ------- | ----------------------------------------------------------------------------- |
| Escopo infla e o repositório morre na fase do canvas   | Alta  | Alto    | Recorte headless-first; marco demonstrável na Fase 4                          |
| A IR precisa quebrar compatibilidade depois da v1.0    | Média | Alto    | Spec normativa antes do código, migrations testadas, fixture por versão       |
| LangGraph muda a API e o exporter quebra               | Alta  | Médio   | Versão pinada, mapping document, golden tests, CI nightly                     |
| Prompt-to-Graph frustra e vira demo morta              | Média | Médio   | Sketch DSL, expansão determinística, eval set com alvo numérico               |
| Manutenção solo não acompanha exporters de terceiro    | Alta  | Médio   | Exporters como plugins; conjunto oficial pequeno e fechado                    |
| Confusão com Langflow/Flowise e o projeto ser ignorado | Média | Alto    | Posicionamento "compilador, não runtime" no README e não-objetivos explícitos |
| Vulnerabilidade via grafo compartilhado                | Baixa | Crítico | AGX-Expr sem host, import sem execução, exporter como fronteira de confiança  |
| Performance do canvas cai com grafos grandes           | Média | Médio   | 200 nós a 50 fps como critério de aceite desde a v0.2                         |
