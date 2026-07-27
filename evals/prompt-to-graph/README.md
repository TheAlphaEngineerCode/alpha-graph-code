# Harness de avaliação — prompt to graph

Sem medição, qualquer ajuste de prompt ou troca de modelo é aposta, e regressão passa
despercebida até um usuário reclamar.

Cada caso é versionado, com descrição de entrada e **asserções estruturais** sobre o grafo
resultante — não comparação de texto.

```yaml
- id: eval-007
  input: 'Leia documentos, extraia requisitos, pesquise lacunas, peça aprovação
    humana se a confiança for baixa e gere um relatório final'
  assert:
    - valid: true
    - has_node_type: [llm, human_approval]
    - has_cycle: false
    - all_branches_exhaustive: true
    - reads_before_write: []
  metrics: [valid_rate, assertion_pass_rate, tokens, usd]
```

## Métricas e alvo

| Métrica               | Alvo (Fase 8) |
| --------------------- | ------------- |
| `valid_rate`          | ≥ 0,90        |
| `assertion_pass_rate` | ≥ 0,75        |

Roda em CI sobre cassettes. Sem cassette, roda nightly contra provider real — CI que bate em
API paga a cada push é CI que alguém desliga.

## Por que o LLM não escreve a IR

Pedir a IR completa a um modelo é a abordagem óbvia e a que falha mais: a IR tem IDs, canais,
reducers, schemas, políticas e invariantes cruzados — superfície grande demais para geração
confiável, e cada erro custa uma rodada de correção caber.

O desenho inverte isso: o modelo produz um **AGX-Sketch** (~10 campos, sem IDs, sem schemas) e
um compilador determinístico expande para IR, gerando ids, canais, reducers, `otherwise`,
rotas de erro e policies padrão. Convenções mecânicas passam a ser garantidas **por
construção**, não por sorte do prompt.

O repair loop devolve **somente os diagnósticos**, nunca a IR inteira — contexto pequeno, custo
baixo, no máximo duas tentativas.

_Vazio: chega na Fase 8._
