# Política de segurança

## Modelo de ameaça

Vale dizer em voz alta, porque muda toda decisão de design: **o artefato principal deste
projeto foi desenhado para circular.** Um arquivo de grafo vai ser compartilhado em pull
request, colado em issue, baixado de repositório de terceiro.

Portanto o grafo é tratado como **entrada não confiável**, sempre.

| Vetor                                         | Controle                                                                                                                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Expressão maliciosa em `when`                 | AGX-Expr sem acesso a host, sem `eval`, com limite de fuel. Lint proíbe `eval`/`new Function`/`vm` no repositório e falha o build |
| Secret vazado no arquivo                      | Somente referências `${env:NOME}` e `${vault:caminho}`. O validador rejeita literal com entropia alta (`AGX-E501`)                |
| Ferramenta perigosa acionada por saída de LLM | Allowlist por grafo e por run. `sensitive_tools` exigem confirmação humana explícita, **não configurável para "sempre permitir"** |
| Exfiltração por egress                        | Allowlist de domínios em `policies.permissions.network`                                                                           |
| Loop de custo                                 | `maxSteps`, `maxNodeVisits`, `maxDepth`, `timeoutMs` e `budget` aplicados pelo runtime, com corte duro                            |
| Credencial em log                             | Redação por canal marcado `sensitive`, na camada de emissão do trace — antes de o valor sair do processo                          |
| Importação executando código                  | Import faz parse e validação, e nada mais. Nenhum caminho de importação invoca o runtime                                          |
| Exporter de terceiro hostil                   | Exporters são fronteira de confiança: contrato puro entrada/saída, sem rede, sem acesso a arquivo fora do diretório de saída      |
| Prompt injection via documento                | Saída de LLM nunca escolhe ferramenta fora da allowlist. Roteamento crítico deve usar `condition`, não classificação de modelo    |
| Cadeia de suprimentos                         | Lockfile commitado, publicação com 2FA, esta política com janela de resposta declarada                                            |

## Princípio irrevogável

**Abrir um grafo nunca executa nada. Validar nunca executa nada.** Somente `simulate` e `run`
executam, e ambos exigem que o usuário tenha declarado providers e allowlists no ambiente
dele.

Se alguma feature futura precisar quebrar isso, ela não entra.

## Reportar uma vulnerabilidade

**Não abra issue pública.** Use
[Security Advisories](https://github.com/TheAlphaEngineerCode/alpha-graph-code/security/advisories/new)
no GitHub.

| Etapa                            | Janela                    |
| -------------------------------- | ------------------------- |
| Confirmação de recebimento       | 72 horas                  |
| Avaliação inicial com severidade | 7 dias                    |
| Correção ou plano de mitigação   | 30 dias para alto/crítico |

O projeto é mantido por uma pessoa. Estas janelas são compromissos realistas, não SLA
corporativo — e é por isso que estão escritas com esse número e não com um menor.

## Versões suportadas

O projeto está em **v0.1 (pré-release)**. Não há versão publicada, portanto não há versão
antiga a suportar. Esta tabela passa a valer no primeiro release.

## Lacunas conhecidas (Fase 0)

Escritas porque omiti-las seria pior do que não tê-las resolvido:

- **Nenhum controle da tabela acima está implementado.** A Fase 0 entrega tooling, specs e
  CI. Os controles chegam com os pacotes: `AGX-E501` na Fase 2, allowlists e budget na Fase 3.
- A proibição de avaliação dinâmica **já é verificada** — por regra de lint e por
  `tests/invariants.test.ts`. É o único item da tabela com barreira ativa hoje.
- Não há auditoria de dependência automatizada (Dependabot / `pnpm audit` no CI) ainda.
