<div align="center">

# Alpha Graph Code

**Um compilador de workflows de IA — não uma plataforma de execução.**

Você descreve ou desenha o workflow. O sistema converte para a Alpha Graph IR, valida,
simula passo a passo e compila para artefatos executáveis em runtimes de terceiros.
Quem executa em produção é o runtime **do usuário**.

[![CI](https://github.com/TheAlphaEngineerCode/alpha-graph-code/actions/workflows/ci.yml/badge.svg)](https://github.com/TheAlphaEngineerCode/alpha-graph-code/actions/workflows/ci.yml)
[![Licença: Apache 2.0](https://img.shields.io/badge/licen%C3%A7a-Apache%202.0-blue.svg)](./LICENSE)
[![DCO](https://img.shields.io/badge/contribui%C3%A7%C3%A3o-DCO-lightgrey.svg)](./CONTRIBUTING.md)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](./tsconfig.base.json)
[![Fase](https://img.shields.io/badge/fase-1%20%C2%B7%20AGX--Expr-orange.svg)](./docs/IMPLEMENTATION_PLAN.md)

</div>

---

## Estado atual: leia antes de clonar

**Este repositório está na Fase 1 de 9.** Existe a especificação normativa completa, o
tooling, o CI — e **um pacote implementado**: [`packages/expr`](./packages/expr), a linguagem
de condição AGX-Expr, com 244 testes.

Os outros 11 pacotes são módulos vazios. **O CLI `agx` chega na Fase 4**, e é lá que o produto
passa a ser demonstrável. Se você quer algo que rode hoje, volte nessa fase; o
[plano de implementação](./docs/IMPLEMENTATION_PLAN.md) diz o que existe em cada uma.

A ordem é deliberada: a decisão que mais importa neste projeto é a **semântica da IR**, e ela
é revisável agora, por leitura, enquanto custa nada mudar. Depois de 4 mil linhas de core,
não é.

---

## O problema

Ferramentas visuais para workflow de IA não faltam: Langflow, Flowise, Dify, n8n, Rivet,
LangGraph Studio. Todas resolvem bem "arrastar nós e executar".

Todas guardam o grafo num **formato interno cujo único consumidor é elas mesmas**. Você
desenha, roda, e o artefato que sobra só vale dentro daquela ferramenta. Trocar de framework
significa redesenhar.

Aqui a inversão é essa: **o grafo é a entrega, e a ferramenta é o compilador.**

## O que isso muda na prática

|                             | Ferramentas visuais                  | Alpha Graph Code                                       |
| --------------------------- | ------------------------------------ | ------------------------------------------------------ |
| O que é o grafo             | Configuração de um runtime próprio   | Artefato portátil e versionável                        |
| Onde roda em produção       | Na nuvem da ferramenta               | No runtime que **você** escolheu                       |
| Semântica de execução       | Mora no código do runtime            | Escrita em spec normativa, antes do código             |
| Incompatibilidade de target | Default silencioso                   | `native` / `lowered` / `unsupported`, sempre declarada |
| Condição de branch          | String estilo JS avaliada por `eval` | AGX-Expr: total, sandboxed, type-checked               |

## As quatro decisões que sustentam isso

Não são features. São as quatro coisas que, se ficarem indefinidas, fazem portabilidade virar
marketing — porque a semântica real passa a morar no código do runtime.

**1. Estado é canal com reducer declarado.** Dois nós em paralelo escrevendo a mesma chave:
quem vence? A resposta não pode ser "a ordem de conclusão das chamadas de rede", porque isso é
um bug intermitente e irreproduzível. Cada canal declara `replace`, `append`, `merge`, `max`,
`min`, `sum` ou `custom`. Canal escrito por ramos concorrentes **exige** reducer comutativo e
associativo — `replace` sob fan-in é erro de validação, não surpresa em produção.

**2. Roteamento é first-match, e fan-out é explícito.** Arestas são ordenadas; a primeira
branch verdadeira vence; `otherwise` é obrigatório. Seguir vários caminhos ao mesmo tempo exige
um nó `parallel`. Sem isso, duas arestas com condição sobreposta significam coisas diferentes
em runtimes diferentes — e o mesmo arquivo produz resultados diferentes.

**3. Condição não é JavaScript.** Um arquivo de grafo foi desenhado para circular em pull
request. Avaliar `state.confidence < 0.8` com `eval` transforma o formato num vetor de execução
arbitrária. AGX-Expr é uma linguagem própria: total, sem acesso a host, sem I/O, com limite de
fuel, interpretada por código nosso. Ganho colateral que se sente todo dia:
`state.confidenc < 0.8` **falha ao salvar**, com sugestão do nome certo — em vez de virar
`undefined < 0.8 === false` e um branch errado silencioso.

**4. Falha é caminho comum, não exceção.** Num grafo onde a maioria dos nós chama rede ou
modelo, erro acontece. Todo nó tem porta de erro implícita, arestas declaram `on_error`, e a
precedência é normativa: retry do nó → aresta `on_error` → guard do subgraph → política global.

A especificação completa está em **[`specs/ir-v1.md`](./specs/ir-v1.md)**, e ela é
**normativa**: se o código divergir da spec, o código está errado.

## O que este projeto não é

Não-objetivos são decisões, não lacunas a preencher:

- **Não é um runtime hospedado.** Simulação existe para inspecionar, não para servir tráfego.
- **Não é um marketplace de integrações.** Ferramentas entram pela interface de tool calling
  do usuário.
- **Não é automação genérica.** Sem webhook, cron, planilha ou e-mail no core.
- **Não é SaaS.** Contas, billing e colaboração ficam fora do caminho crítico. `git clone` e
  uma chave de API opcional bastam.
- **Não promete portabilidade perfeita.** Targets têm capacidades diferentes. O produto torna
  as diferenças **explícitas** em vez de esconder.

## Para quem é

O primeiro usuário não é quem quer montar um chatbot arrastando caixas — esse público já é bem
servido. É **o engenheiro que já escreve workflows agentic em código** e sofre com revisão,
versionamento e migração entre frameworks. Esse usuário aceita CLI, lê spec e contribui
exporter — e é exatamente quem valida a tese da IR.

O canvas amplia o público depois. Ele não é o que conquista o primeiro.

## Começando

```bash
git clone https://github.com/TheAlphaEngineerCode/alpha-graph-code.git
cd alpha-graph-code

npm i -g pnpm     # se necessário; requer Node >= 22.13
pnpm install
pnpm check        # lint + format + typecheck + test + build
```

`pnpm check` é exatamente o que o CI roda.

A partir da **Fase 4**:

```bash
pnpm agx validate templates/planner-executor-verifier.yaml
pnpm agx simulate templates/planner-executor-verifier.yaml --cassette happy
pnpm agx compile  templates/planner-executor-verifier.yaml --target langgraph
```

## Como o repositório é organizado

```text
packages/expr        AGX-Expr: lexer, parser, typechecker, interpretador
packages/graph-core  IR, schema, parser, validador, normalização, migrations
packages/runtime     executor, reducers, checkpoints, cassettes, trace
packages/compiler    pipeline, capability model, diagnósticos
packages/exporters/  json · yaml · prompt · langgraph
packages/cli         agx
apps/web             Studio (a partir da v0.2)

specs/               ir-v1 · agx-expr · trace-v1 · lowerings   ← NORMATIVO
docs/decisions/      ADRs
evals/               harness de prompt-to-graph
cassettes/           gravações de record/replay
```

| Documento                                                      | Para quê                                      |
| -------------------------------------------------------------- | --------------------------------------------- |
| [`specs/ir-v1.md`](./specs/ir-v1.md)                           | A IR. Fonte da verdade do projeto             |
| [`specs/agx-expr.md`](./specs/agx-expr.md)                     | A linguagem de condição                       |
| [`specs/trace-v1.md`](./specs/trace-v1.md)                     | Trace, cassettes e record/replay              |
| [`specs/lowerings.md`](./specs/lowerings.md)                   | Capability model e catálogo de transformações |
| [`AGENTS.md`](./AGENTS.md)                                     | Os 12 invariantes. Violar um é bug            |
| [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md) | Fases, critérios de saída, riscos             |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md)                         | Portão de qualidade e DCO                     |
| [`SECURITY.md`](./SECURITY.md)                                 | Modelo de ameaça e como reportar              |

## Determinismo, e por que ele é testável

> Mesma entrada + mesma cassette ⇒ **mesmo trace, byte a byte.**

Isso não é aspiração: é a asserção usada nos testes de integração. A fronteira de execução
segue ordem de declaração — jamais ordem de conclusão de I/O. O RNG é semeado por `run_id`. O
relógio é injetado, e `now()` em AGX-Expr lê o clock do run, nunca o do host.

O bug caro em workflow de IA quase nunca é "não rodou". É "rodou diferente".

## Contribuindo

Leia [`CONTRIBUTING.md`](./CONTRIBUTING.md). O resumo: commits com sign-off (`git commit -s`),
`pnpm check` verde, e mudança de semântica da IR passa por ADR **antes** do código.

## Licença

[Apache-2.0](./LICENSE), com contribuição por DCO. A decisão e as alternativas descartadas
estão em [ADR-0001](./docs/decisions/ADR-0001-licenca-apache-2.0-e-dco.md).
