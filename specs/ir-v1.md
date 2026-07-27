# Alpha Graph IR v1 — especificação normativa

|                         |                                                          |
| ----------------------- | -------------------------------------------------------- |
| **Status**              | NORMATIVO                                                |
| **`alphaGraphVersion`** | `1.0.0`                                                  |
| **Estabilidade**        | Em desenvolvimento até a v0.1. Congelada na v1.0.        |
| **Origem**              | Master Blueprint v2.0 (`DOC-AGX-BP-002`), Parte II §4–§5 |

> **Este documento é a fonte da verdade do projeto.** Divergência entre código e spec é
> **bug do código**, nunca da spec. Alterar semântica exige, na ordem: ADR em
> `docs/decisions/`, incremento de `alphaGraphVersion`, migration executável em
> `packages/graph-core/migrations` e fixture da versão anterior no teste de migração.
> Mudança de spec sem ADR é proibida (invariante 2 do [`AGENTS.md`](../AGENTS.md)).

## Convenções de conformidade

As palavras **DEVE**, **NÃO DEVE**, **DEVERIA** e **PODE** têm o sentido usual de
especificação: **DEVE**/**NÃO DEVE** são requisitos de conformidade — uma implementação
que os viola não é conforme. **DEVERIA** admite exceção justificada e registrada.
**PODE** é opcional.

Seções marcadas `[LACUNA]` ainda não estão decididas. Nenhuma implementação PODE
supor comportamento em cima de uma lacuna: preencher exige ADR.

---

## 1. Documento de grafo

Um grafo é um documento YAML ou JSON. Os dois formatos descrevem a **mesma** IR e fazem
round-trip entre si sem perda.

```yaml
alphaGraphVersion: 1.0.0
id: research-report
label: Pesquisa e relatório
description: Pesquisa iterativa com revisão humana antes de publicar.

state:
  channels: { ... } # §2

providers: { ... } # §8
nodes: [...] # §3
edges: [...] # §4
policies: { ... } # §8
transforms: { ... } # reducers custom, §2.2

contentHash: sha256-... # §9
```

`alphaGraphVersion`, `id`, `state`, `nodes` e `edges` são obrigatórios. Um documento sem
eles é inválido e **NÃO DEVE** ser executado — nem parcialmente.

---

## 2. Estado como canais com reducer

O estado do grafo é um conjunto de **canais** nomeados. Cada canal declara tipo, valor
inicial e — o ponto central — o **reducer** que define como uma escrita se combina com o
valor existente.

O reducer é o que torna o comportamento **sob paralelismo e sob ciclo** previsível em vez
de acidental. Sem ele, "quem vence quando dois ramos escrevem a mesma chave" é respondido
pela ordem de conclusão das chamadas de rede — isto é, por acaso.

```yaml
state:
  channels:
    query: { type: string, reducer: replace, initial: null }
    documents: { type: array, reducer: append, initial: [] }
    findings: { type: array, reducer: append, initial: [] }
    confidence: { type: number, reducer: max, initial: 0 }
    scratch: { type: object, reducer: merge, initial: {} }
    decision: { type: string, reducer: replace, initial: null, sensitive: true }
    iteration: { type: number, reducer: sum, initial: 0 }
    errors: { type: array, reducer: append, initial: [] } # reservado, §6
```

### 2.1 Reducers do núcleo

| Reducer       | Semântica                                   | Comutativo           | Associativo | Uso típico              |
| ------------- | ------------------------------------------- | -------------------- | ----------- | ----------------------- |
| `replace`     | O último valor escrito substitui o anterior | Não                  | Não         | Campos de escrita única |
| `append`      | Concatena ao array existente                | Não (ordem definida) | Sim         | Acúmulo de resultados   |
| `merge`       | Merge **raso** de objeto                    | Não                  | Não         | Metadados incrementais  |
| `max` / `min` | Retém o extremo                             | Sim                  | Sim         | Confiança, score        |
| `sum`         | Soma numérica                               | Sim                  | Sim         | Contadores, custo       |
| `custom:<id>` | Função pura declarada em `transforms`       | Declarado            | Declarado   | Merge de domínio        |

O par (comutativo, associativo) de cada reducer é **normativo**: é sobre ele que a regra
`AGX-E401` decide. Um reducer `custom` DEVE declarar as duas propriedades, e o validador
as toma como declaração de intenção do autor — não as prova.

### 2.2 Canais reservados

`errors` é reservado. Tem tipo `array` e reducer `append`, e o runtime escreve nele os
erros estruturados de §6. Um grafo **PODE** ler `errors`; **NÃO DEVE** redeclará-lo com
outro tipo ou reducer.

### 2.3 `sensitive`

`sensitive: true` marca o canal para **redação automática** em trace, log e checkpoint.
A redação acontece na camada de emissão, antes de o valor sair do processo.

### 2.4 Regra AGX-E401 — concorrência exige reducer comutativo

Um canal escrito por **mais de um ramo concorrente** DEVE declarar reducer comutativo e
associativo. `replace` e `merge` sob fan-in são **erro de validação** `AGX-E401`.

`append` sob fan-in é permitido porque sua ordem é definida por construção: a
concatenação segue a **ordem de declaração dos ramos** no nó `parallel`, nunca a ordem de
conclusão. É isso que garante replay idêntico.

---

## 3. Nós, portas e binding

Todo nó declara `in` e `out` explícitos. Um nó lê **apenas** o que mapeou e escreve
**apenas** onde mapeou. Isso permite ao validador construir o grafo de dependência de
dados, detectar leitura de canal não inicializado, e gerar código legível nos exporters.

```yaml
nodes:
  - id: research
    label: Pesquisa inicial
    type: llm
    in:
      query: $.query
      context: $.documents[*].summary
    out:
      findings: $.result.items
      confidence: $.result.confidence
    config:
      provider_ref: default_llm
      prompt_ref: prompts/research.md
      output_schema: schemas/findings.json
      params: { temperature: 0.2, max_tokens: 2000 }
    policy:
      retry: { max: 2, backoff: exponential, on: [timeout, rate_limit, schema_error] }
      timeout_ms: 60000
```

`provider_ref` aponta para uma entrada de `providers`, **nunca** para uma chave literal
(invariante 4).

### 3.1 Tipos de nó da v1

| Tipo                | Determinista | Semântica normativa                                                               |
| ------------------- | ------------ | --------------------------------------------------------------------------------- |
| `start` / `end`     | Sim          | Entrada e términos explícitos; múltiplos `end` permitidos, cada um com `reason`   |
| `llm`               | Não          | Chamada de modelo; a saída é validada contra `output_schema` **antes** do binding |
| `tool`              | Não          | Execução de ferramenta; sujeita a allowlist e a confirmação se marcada sensível   |
| `router`            | Depende      | Escolhe rota por regra AGX-Expr ou por classificação LLM declarada                |
| `condition`         | Sim          | Expressão booleana pura sobre estado; sem chamada externa                         |
| `transform`         | Sim          | Mapeamento puro declarado; nunca chama modelo                                     |
| `human_approval`    | Não          | Interrupt com checkpoint e token de retomada (§7)                                 |
| `state`             | Sim          | Leitura ou escrita explícita de canal                                             |
| `retry_guard`       | Sim          | Envolve um alvo com política de repetição e fallback                              |
| `parallel` / `join` | Sim          | Fan-out declarado e junção com política (§7.2)                                    |
| `subgraph`          | Herda        | Composição com escopo `isolated` por padrão (§7.3)                                |

A coluna **determinista** alimenta o linter: uma decisão que uma expressão determinista
resolve **NÃO DEVERIA** ser delegada a um LLM, e o linter avisa quando isso acontece.

### 3.2 Data binding

Bindings usam um subconjunto **restrito** de JSONPath: raiz `$`, acesso por chave, índice,
wildcard `[*]` e slice. **Não** há filtro com expressão, **não** há recursão `..`, **não**
há funções.

A restrição é proposital: bindings precisam ser analisáveis **estaticamente**, para que o
validador saiba, sem executar nada, quais canais cada nó lê e escreve.

---

## 4. Arestas e semântica de roteamento

Arestas são agrupadas por nó de origem e **ordenadas**. A avaliação é **first-match**: a
primeira branch cuja condição for verdadeira vence; as demais são ignoradas. Ler o YAML
passa a ser equivalente a ler um `if / else if / else`, que é como um humano já interpreta
o desenho.

```yaml
edges:
  - from: research
    branches:
      - when: 'state.confidence >= 0.8' # a primeira verdadeira vence
        to: report
      - when: 'state.confidence >= 0.5'
        to: gap_search
      - otherwise: true # obrigatório
        to: human_review
    on_error:
      to: error_handler # porta de erro do nó de origem

  - from: gap_search
    branches:
      - when: 'state.iteration < 3'
        to: research # ciclo controlado por maxNodeVisits
      - otherwise: true
        to: human_review
```

Regras normativas:

1. **Fan-out nunca é implícito.** Seguir vários caminhos exige um nó `parallel`. Duas
   arestas incondicionais saindo do mesmo nó são erro `AGX-E210`.
2. **`otherwise` é obrigatório**, salvo quando o validador **provar** exaustividade sobre
   um canal de tipo enum. Sem isso, um estado não previsto trava a execução em silêncio.
3. **Ciclos são permitidos e limitados.** O guarda real não é `maxSteps` global, é
   `maxNodeVisits` por nó — é o único limite que impede um loop de dois nós consumir todo
   o orçamento (invariante 12).
4. **Toda branch registra no trace** a expressão avaliada e o resultado, para que a
   decisão seja auditável sem reexecutar.

---

## 5. AGX-Expr

A linguagem de condição tem spec própria em [`agx-expr.md`](./agx-expr.md), igualmente
normativa. O resumo relevante para a IR:

AGX-Expr é uma linguagem **total** — toda expressão válida termina. Não há loops, não há
recursão, não há atribuição, não há acesso a host, não há I/O. A avaliação usa
interpretador próprio com limite de fuel. `eval`, `new Function` e `vm` são proibidos no
código do projeto e barrados por regra de lint (invariante 3).

Expressões são **type-checked contra o schema de canais em tempo de validação**. O ganho
prático: `state.confidenc < 0.8` falha **ao salvar o grafo**, com sugestão do nome
correto. Numa linguagem dinâmica isso viraria `undefined < 0.8 === false` e um branch
errado silencioso em produção.

---

## 6. Semântica de erro

Todo nó tem uma **porta de erro implícita**. Em um grafo onde a maioria dos nós chama rede
ou modelo, falha é caminho comum, não exceção.

Falhas são classificadas em tipos fechados: `timeout`, `rate_limit`, `schema_error`,
`tool_error`, `provider_error`, `budget_exceeded`, `guard_violation`, `internal`.

### 6.1 Precedência normativa

A **primeira** que casar assume o controle:

1. `node.policy.retry` — repete o próprio nó, respeitando `on` e `backoff`
2. `edge.on_error` — roteia para o nó declarado
3. `subgraph.guard` — captura no limite do subgraph
4. `graph.policies.onError` — `fail` | `continue` | `route:<node_id>`

### 6.2 Formato no canal `errors`

```json
{
  "node": "research",
  "kind": "schema_error",
  "attempt": 2,
  "message": "campo 'confidence' ausente",
  "at": "2026-07-27T10:32:11Z"
}
```

`at` vem do **clock injetado do run**, não do relógio do host (§10).

---

## 7. Controle de fluxo

### 7.1 Interrupts e aprovação humana

Aprovação humana é um **interrupt durável**, não uma pausa em memória. Ao atingir o nó, o
runtime persiste um checkpoint — snapshot de canais, nó pendente, passo e um
`resume_token` — e **encerra** a execução. Retomar é uma operação independente: carrega o
checkpoint, aplica os canais de retomada e continua.

O processo pode ter morrido no meio; o navegador pode ter fechado. Sem checkpoint não há
aprovação real, há um `confirm()`.

```yaml
- id: approve
  type: human_approval
  in: { draft: $.report_draft, confidence: $.confidence }
  interrupt:
    resume_channels: [decision, reviewer_note]
    timeout_ms: 86400000 # 24h
    on_timeout: reject # reject | approve | route:<node_id>
    prompt: 'Aprovar publicação do relatório?'
    options: [approve, reject, revise]
```

### 7.2 Parallel e join

```yaml
- id: fan
  type: parallel
  branches: [researcher_a, researcher_b, researcher_c] # ordem = ordem de redução

- id: gather
  type: join
  join:
    policy: n_of_m # all | any | n_of_m | race
    n: 2
    on_partial: continue # continue | fail
    cancel_pending: true
    timeout_ms: 120000
```

No join, as escritas dos ramos são reduzidas na **ordem de declaração dos ramos**, jamais
na ordem de conclusão. É isso que garante que dois runs com as mesmas respostas produzam o
mesmo estado final, independentemente de latência de rede.

Sem política declarada, o default de mercado vira "esperar todos e ignorar falhas" — o
pior default possível em pipeline com custo de token. Por isso `policy` é obrigatório.

### 7.3 Subgraphs e escopo

```yaml
- id: verify
  type: subgraph
  ref: graphs/fact_check.agx.yaml
  scope: isolated # isolated (padrão) | shared
  in: { claims: $.findings }
  out: { verdicts: $.verdicts, verify_cost: $.cost }
  guard:
    on_error: route:human_review
    max_depth: 3
```

No modo `isolated` o subgraph só enxerga o que foi mapeado na fronteira. Sem isso, reuso
vira acoplamento: importar um subgraph passaria a poder sobrescrever qualquer canal do pai.

Exporters cujo target não suporta namespacing usam **lowering por prefixo**, registrado
como diagnóstico (ver [`lowerings.md`](./lowerings.md)).

---

## 8. Providers e policies

```yaml
policies:
  maxSteps: 200 # passos totais do run
  maxNodeVisits: 12 # visitas por nó — o guarda real de ciclo
  maxDepth: 5 # aninhamento de subgraphs
  timeoutMs: 900000
  budget: { tokens: 500000, usd: 5.0 }
  onBudgetExceeded: fail # fail | route:<node_id>
  onError: fail # fail | continue | route:<node_id>
  permissions:
    tools: [web_search, read_file] # allowlist; vazio = nenhuma ferramenta
    network: ['api.anthropic.com'] # egress allowlist
    sensitive_tools: [send_email] # exigem confirmação humana explícita
```

Os limites são aplicados **pelo runtime**, não por convenção.

Secrets **nunca** entram no grafo. Somente referências `${env:NOME}` e
`${vault:caminho}`. O validador rejeita literais com entropia alta (`AGX-E501`).

---

## 9. Serialização canônica, IDs e versionamento

O perfil canônico existe para que duas implementações conformes produzam **os mesmos
bytes** para o mesmo grafo — sem isso, diff de Git vira ruído e teste de round-trip é
impossível de escrever.

- **Encoding:** UTF-8 **sem BOM**, quebras **LF**, indentação de **2 espaços**, sem espaço
  em fim de linha, **newline final**.
- **Ordem de chaves:** a ordem **declarada no JSON Schema** — determinística e legível,
  diferente de alfabética, que espalha campos relacionados.
- **Arrays** preservam ordem.
- **Números:** a **menor representação decimal** que faz round-trip exato.
- **`id`:** slug **imutável** gerado na criação. Renomear altera `label`, **nunca** `id`.
  `uid` (ULID) é opcional, para referência de máquina.
- **`contentHash`:** SHA-256 dos bytes canônicos, com **o próprio campo excluído** do
  cálculo.
- **Versão:** `alphaGraphVersion` em semver.

---

## 10. Modelo de execução

O laço abaixo é normativo. Toda fonte de não-determinismo — relógio, RNG, ordem de
conclusão de I/O — é injetada por `ctx`.

```text
run(graph, inputs, ctx):
  assert validate(graph).ok                        # nunca executar grafo inválido
  state    = init_channels(graph, inputs)
  frontier = [graph.start]                         # fila determinística
  step     = 0

  while frontier and step < policies.maxSteps:
    node = frontier.pop_front()
    guard visits[node] < policies.maxNodeVisits  -> AGX-R301
    guard ctx.budget.ok                          -> onBudgetExceeded

    inp    = bind_in(node, state)                  # JSONPath restrito (§3.2)
    result = execute(node, inp, ctx)               # retry/timeout do nó

    if result.error:
      route = error_chain(node, result.error)      # precedência de §6.1
    else:
      writes = bind_out(node, result.value)
      state  = reduce(state, writes)               # reducers declarados (§2)
      route  = first_match(node.branches, state)   # first-match / otherwise (§4)

    trace.emit(step_record(node, inp, result, state_diff, route))
    frontier.extend(route.targets)                 # ordem de declaração
    step += 1

  return Run(state, trace, status)
```

### 10.1 Garantias de determinismo

- Ordem da fronteira segue **ordem de declaração**, jamais ordem de conclusão de I/O.
- RNG é semeado por `run_id`; o mesmo `run_id` reproduz as mesmas escolhas.
- O relógio é **injetado**; `now()` em AGX-Expr lê o clock do run, nunca o do host.
- Em modo replay, respostas de modelo e ferramenta vêm de cassettes indexadas por hash de
  `(nó, entrada canônica, tentativa)`.
- **Consequência prática, e é a asserção usada nos testes de integração:** mesma entrada +
  mesma cassette ⇒ **mesmo trace, byte a byte**.

---

## 11. Princípio irrevogável de segurança

**Abrir um grafo nunca executa nada. Validar nunca executa nada.** Somente `simulate` e
`run` executam, e ambos exigem que o usuário tenha declarado providers e allowlists no
ambiente dele.

O modelo de ameaça parte de uma premissa que vale dizer em voz alta: o artefato principal
deste projeto — o arquivo de grafo — **foi desenhado para circular**. Vai ser compartilhado
em pull request, colado em issue, baixado de repositório de terceiro. Portanto o grafo é
**entrada não confiável**.

Se alguma feature futura precisar quebrar isso, ela não entra.

---

## 12. Diagnósticos referenciados por esta spec

Nenhum diagnóstico é silencioso, e cada código tem página própria em `docs/diagnostics/`.

| Código     | Severidade | Origem na spec                                                     |
| ---------- | ---------- | ------------------------------------------------------------------ |
| `AGX-E210` | erro       | §4 — duas arestas incondicionais no mesmo nó                       |
| `AGX-E401` | erro       | §2.4 — reducer não comutativo sob concorrência                     |
| `AGX-E501` | erro       | §8 — literal com entropia alta onde se espera referência de secret |
| `AGX-R301` | runtime    | §10 — `maxNodeVisits` atingido                                     |

A lista completa vive em `docs/diagnostics/` e cresce com as fases. O catálogo de
lowerings de exporter está em [`lowerings.md`](./lowerings.md); o schema de trace, em
[`trace-v1.md`](./trace-v1.md).

---

## 13. Lacunas declaradas

`[LACUNA]` — itens que esta versão **deliberadamente não decide**. Estão aqui para não
serem resolvidos por acidente dentro do código.

- **`merge` profundo.** §2.1 define `merge` como raso. Merge profundo, se entrar, é um
  reducer **novo** (`deep_merge`), não uma mudança de `merge` — mudar semântica de reducer
  existente quebraria todo grafo salvo.
- **Assinatura de `custom:<id>`.** A forma exata de declarar reducers custom em
  `transforms` é decidida na Fase 2, junto do JSON Schema.
- **`router` por classificação LLM.** O formato de declaração do classificador fica para a
  Fase 3. Até lá, `router` só aceita regra AGX-Expr.
- **Prova de exaustividade sobre enum.** §4 permite dispensar `otherwise` quando o
  validador _provar_ exaustividade. O algoritmo de prova é definido na Fase 2; até então
  `otherwise` é **sempre** obrigatório.
