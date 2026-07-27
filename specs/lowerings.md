# Catálogo de lowerings — especificação normativa

|                   |                                                            |
| ----------------- | ---------------------------------------------------------- |
| **Status**        | NORMATIVO                                                  |
| **Implementação** | `packages/compiler` + `packages/exporters/*` (Fases 5 e 7) |
| **Origem**        | Master Blueprint v2.0, Parte II §6                         |

## 1. Capability model em três estados

Capabilities binárias — "o target suporta ou não suporta" — não descrevem a realidade. Na
prática a maioria dos casos é intermediária: o target não suporta **nativamente**, mas
suporta **com transformação**.

Sem o estado intermediário, só há dois caminhos, e os dois são ruins: ou o compilador
rejeita grafos perfeitamente exportáveis, ou alguém enfia a transformação dentro do código
do exporter sem registrar — que é exatamente a **perda silenciosa de semântica** que este
projeto existe para evitar.

| Estado        | Significado                                                      | Consequência                                                                             |
| ------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `native`      | O target expressa a construção diretamente                       | Nenhum diagnóstico                                                                       |
| `lowered`     | Existe transformação nomeada que preserva a semântica observável | Diagnóstico **informativo** obrigatório + entrada neste catálogo + fixture + golden test |
| `unsupported` | Não há transformação que preserve a semântica                    | **Erro duro**. O compilador recusa e explica                                             |

**Invariante 8:** nenhuma incompatibilidade de exporter é silenciosa. Um `lowered` sem
entrada neste arquivo é bug, não atalho.

## 2. Capability matrix inicial

| Capacidade                | Alpha JSON/YAML | Structured prompt                  | LangGraph                |
| ------------------------- | --------------- | ---------------------------------- | ------------------------ |
| Ciclos                    | `native`        | `lowered` (unroll + cap explícito) | `native`                 |
| Paralelismo               | `native`        | `lowered` (sequencial + nota)      | `native`                 |
| Join `n_of_m`             | `native`        | `unsupported`                      | `lowered` (all + filtro) |
| Human approval            | `native`        | `lowered` (instrução de pausa)     | `native` (interrupt)     |
| Tool calling              | `native`        | `lowered` (descrição)              | `native`                 |
| Structured output         | `native`        | `lowered` (instrução de formato)   | `native`                 |
| Subgraph isolado          | `native`        | `lowered` (prefixo)                | `lowered` (prefixo)      |
| Persistência / checkpoint | `native`        | `unsupported`                      | `native`                 |
| Budget enforcement        | `native`        | `unsupported`                      | `lowered` (callback)     |

Esta matriz é a **intenção de projeto**, preenchida a partir do blueprint. Cada célula
`lowered` só vale como conformidade quando tiver entrada em §3 com transform nomeada,
fixture e golden test — ou seja, hoje **nenhuma** vale: os exporters entram na Fase 5.

## 3. Registro de lowerings

Cada lowering recebe um id estável `L-NN` e uma entrada com este formato:

```text
## L-NN — <nome da transform>

Target:            <exporter>
Capacidade:        <construção da IR>
Diagnóstico:       AGX-Wnnn
Transformação:     o que muda no artefato gerado
Semântica preservada: o que continua verdadeiro
Semântica perdida:    o que deixa de ser verdadeiro — dito, nunca escondido
Custo:             tokens, latência ou passos adicionais
Fixture:           caminho do grafo de entrada
Golden:            caminho do artefato esperado
```

O campo **Semântica perdida** é obrigatório e não aceita "nenhuma" sem justificativa: se
uma transformação não perdesse nada, a capacidade seria `native`.

### Entradas

_Nenhuma ainda._ A Fase 5 abre este registro junto do primeiro exporter. Um exemplo do
formato esperado, retirado do blueprint (§6, Fig. 12), para orientar a primeira entrada:

```text
AGX-W612  aviso  export:prompt   join 'gather' rebaixado de n_of_m para all
                                 -> semântica preservada, custo maior
                                 (specs/lowerings.md#L-07)
```

## 4. Formato de diagnóstico

Todo diagnóstico tem código estável, nó de origem, caminho no documento, severidade e
sugestão de correção — e cada código tem página própria em `docs/diagnostics/<CODIGO>.md`.

```text
AGX-E401  erro   research/out    canal 'findings' escrito por 3 ramos concorrentes
                                 com reducer 'replace'
                                 -> use 'append' ou 'merge'
                                 (docs/diagnostics/AGX-E401)

AGX-E210  erro   fan/edges       duas arestas incondicionais no mesmo nó
                                 -> use um nó 'parallel' para fan-out explícito
```

Faixas de código reservadas:

| Faixa      | Uso                                       |
| ---------- | ----------------------------------------- |
| `AGX-E1xx` | Sintaxe e schema                          |
| `AGX-E2xx` | Estrutura do grafo e roteamento           |
| `AGX-E3xx` | Tipos e AGX-Expr                          |
| `AGX-E4xx` | Estado, canais e reducers                 |
| `AGX-E5xx` | Segurança e permissões                    |
| `AGX-W6xx` | Avisos de compilação, incluindo lowerings |
| `AGX-Rxxx` | Runtime (limites, guardas)                |

## 5. Exporter como fronteira de confiança

Um exporter de terceiro é código que roda na máquina do usuário. O contrato é puro
entrada/saída: **sem acesso a rede** e **sem acesso a arquivo fora do diretório de saída**.

Exporters fora do conjunto oficial vivem como plugins com selo de comunidade — o conjunto
oficial é pequeno e fechado de propósito, porque manutenção solo não acompanha exporter de
terceiro (ver `docs/decisions/ADR-0001.md`).
