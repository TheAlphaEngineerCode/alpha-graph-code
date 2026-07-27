# Trace v1 — especificação normativa

|                   |                                    |
| ----------------- | ---------------------------------- |
| **Status**        | NORMATIVO                          |
| **Implementação** | `packages/runtime` (Fase 3)        |
| **Origem**        | Master Blueprint v2.0, Parte II §7 |

O schema de trace é definido **já na v0.1**, e não depois, por um motivo prático: retrofit
de schema de trace significa reescrever inspector, exportadores de trace e **todos** os
testes que assertam sobre execução.

Os nomes de campo seguem as convenções semânticas **GenAI do OpenTelemetry**, o que permite
plugar OTLP depois sem reescrever nada.

## 1. Por que record/replay e não mock

Mock mode resolve custo, mas não resolve reprodutibilidade — e o bug caro em workflow de IA
quase nunca é _"não rodou"_, é _"rodou diferente"_.

Um run real grava respostas em uma **cassette**; runs seguintes reproduzem a partir dela.

```text
cassettes/research-report/happy-path.agxc

key = sha256(node_id + canonical(input) + attempt)

entries:
  - key: 9f2a…  kind: llm   latency_ms: 1840  tokens: { in: 812, out: 344 }
    value: { items: [...], confidence: 0.91 }
  - key: c31b…  kind: tool  latency_ms: 210
    value: { results: [...] }
```

A chave inclui `attempt`, então a segunda tentativa de um nó que falhou na primeira tem
entrada própria — retry é reproduzível, não colapsado.

## 2. Campos do step record

| Campo                                     | Descrição                                      |
| ----------------------------------------- | ---------------------------------------------- |
| `run_id` / `step_id`                      | Identidade do run e do passo (ULID, ordenável) |
| `node_id` / `node_type` / `attempt`       | Origem do passo e número da tentativa          |
| `started_at` / `duration_ms`              | Janela temporal do passo                       |
| `state_before_hash` / `state_diff`        | Hash canônico antes e diff estruturado depois  |
| `branch_taken` / `rule_matched`           | Rota escolhida e a expressão que a justificou  |
| `gen_ai.request.model` / `gen_ai.usage.*` | Modelo e tokens, quando o provider expuser     |
| `cost_usd`                                | Custo estimado do passo                        |
| `error`                                   | Objeto estruturado conforme `ir-v1.md` §6.2    |
| `checkpoint_ref`                          | Referência ao checkpoint, em nós de interrupt  |

Canais marcados `sensitive` (ir-v1 §2.3) são **redigidos antes da emissão** — não na
renderização. Redação que acontece na UI não é redação; é o segredo já fora do processo.

`state_diff` registra **qual reducer foi aplicado** por canal, não só o valor final. Sem
isso, um `append` e um `replace` que chegam ao mesmo valor ficam indistinguíveis no trace, e
é exatamente essa diferença que se está depurando.

## 3. Inspector — o que o trace precisa sustentar

O schema existe para permitir estas leituras sem reexecutar nada:

- Timeline por passo com nó atual, duração, tentativa e custo acumulado.
- Diff de estado antes/depois, por canal, mostrando o reducer aplicado.
- Branch escolhido com a expressão AGX-Expr avaliada **e o valor de cada termo**.
- Breakpoints por nó e por condição (`state.confidence < 0.5`), usando AGX-Expr.
- Watch expressions e exportação do trace em JSON.
- Comparação de dois runs lado a lado — o caso de uso real de quem está ajustando prompt.

## 4. Asserção de conformidade

> Mesma entrada + mesma cassette ⇒ **mesmo trace, byte a byte.**

É esta a asserção usada nos testes de integração da Fase 3, e é o critério de aceite 05 do
blueprint. Um campo cujo valor varia entre dois replays idênticos (timestamp de host, id
aleatório não semeado, ordem de iteração de hash map) é **defeito**, não ruído aceitável.

## 5. Lacunas declaradas

- **Formato de arquivo do trace.** JSONL é o candidato natural (append-only, streamável,
  diffável), mas a decisão fica para a Fase 3 com ADR.
- **`state_diff` de canal grande.** Um canal `array` com milhares de itens não deve ser
  copiado inteiro por passo. A estratégia (diff estrutural, hash + amostra, truncamento
  declarado) é decidida na Fase 3 — e o que ela **não** pode fazer é truncar em silêncio.
- **Custo quando o provider não expõe uso.** `cost_usd` estimado precisa dizer que é
  estimativa. Número sem procedência num painel de custo é número em que alguém confia.
