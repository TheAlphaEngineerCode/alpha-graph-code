# ADR-0001 — Licença Apache-2.0 e contribuição por DCO

|                         |                                               |
| ----------------------- | --------------------------------------------- |
| **Status**              | Aceita                                        |
| **Data**                | 2026-07-27                                    |
| **Fase**                | 0                                             |
| **Achado do blueprint** | F-17 (MÉDIO) — licença e governança em aberto |

## Contexto

O blueprint v1.0 dizia que a licença seria "escolhida conscientemente". Isso não é uma
decisão — é a ausência de uma. E é uma ausência com consequência assimétrica: **publicar
sob uma licença é irrevogável na prática**, porque quem já copiou continua com os direitos
que a licença concedeu. Trocar depois só afeta cópias futuras.

Três problemas concretos vinham dessa lacuna:

1. Contribuições chegando sem clareza de propriedade intelectual.
2. Adotantes corporativos travando na revisão jurídica, especialmente por cláusula de
   patente.
3. Exporters de terceiro virando dívida do mantenedor, sem modelo de manutenção declarado.

O artefato central deste projeto é feito para circular — grafo colado em issue, exporter
contribuído por terceiro. Isso torna a clareza de licença mais importante aqui do que num
projeto cujo código só o autor toca.

## Decisão

**Licença: Apache-2.0.**

Sobre MIT, ganha em duas coisas que importam para este projeto: **concessão explícita de
patente** (§3) e **aceitação corporativa** já estabelecida em revisão jurídica. Um workflow
de IA compilado para produção passa por time de plataforma; licença que não dá trabalho na
revisão é licença que não bloqueia adoção.

Sobre copyleft (GPL/AGPL), ganha porque o objetivo aqui é o **formato ser adotado**. A IR só
vale se muita ferramenta a ler e escrever, e copyleft desestimula justamente o integrador
comercial que ajudaria a provar a tese de portabilidade.

**Contribuição: DCO (Developer Certificate of Origin) por sign-off.**

Sobre CLA, ganha em atrito: `git commit -s` contra assinar um documento e esperar
processamento. Para um projeto com manutenção pequena, atrito de contribuição é o custo que
mais importa — CLA compensa quando existe uma entidade que precisa relicenciar, e não é o
caso.

**Exporters:** o conjunto oficial é **pequeno e fechado** (`json`, `yaml`, `prompt`,
`langgraph`). Exporters fora dele vivem como plugins com selo de comunidade.

## Consequências

- `LICENSE` na raiz com o texto Apache-2.0 completo, sem modificação.
- `CONTRIBUTING.md` explica `git commit -s` e o texto do DCO.
- **O CI verifica sign-off** em todo commit de pull request. Política que não é verificada
  não é política — é recomendação (mesmo raciocínio do invariante 3 ser barrado por lint, e
  não confiado à disciplina).
- Cabeçalho de licença **não** vai em cada arquivo. `LICENSE` na raiz + `license` no
  `package.json` bastam para Apache-2.0, e cabeçalho por arquivo é ruído em diff.
- Exporter de terceiro é **fronteira de confiança**: contrato puro entrada/saída, sem rede,
  sem acesso a arquivo fora do diretório de saída (`specs/lowerings.md` §5).

## Alternativas descartadas

| Alternativa            | Por que não                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| MIT                    | Sem concessão explícita de patente. Mais curta, mas a brevidade não é o problema a resolver aqui.                           |
| AGPL-3.0               | Desestimula o integrador comercial, que é exatamente quem prova a tese de portabilidade da IR.                              |
| BSL / fonte disponível | Incompatível com o não-objetivo "não é uma plataforma SaaS". Sem produto hospedado a proteger, a restrição só custa adoção. |
| CLA                    | Atrito alto para o ganho. Faz sentido com entidade que precisa relicenciar; não é o caso.                                   |
