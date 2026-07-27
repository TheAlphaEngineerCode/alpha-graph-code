# Diagnósticos

Todo diagnóstico emitido pelo projeto tem página própria neste diretório, nomeada pelo código
(`AGX-E401.md`). Isso é critério de aceite, não convenção: **100% dos códigos emitidos têm
página** (critério 08 do [plano](../IMPLEMENTATION_PLAN.md)).

O motivo é direto — um código de erro sem explicação obriga a pessoa a ler o código-fonte do
validador para entender o que fazer. Aí o diagnóstico deixa de ser ajuda e passa a ser
obstáculo.

## Faixas de código

| Faixa      | Uso                                       |
| ---------- | ----------------------------------------- |
| `AGX-E1xx` | Sintaxe e schema                          |
| `AGX-E2xx` | Estrutura do grafo e roteamento           |
| `AGX-E3xx` | Tipos e AGX-Expr                          |
| `AGX-E4xx` | Estado, canais e reducers                 |
| `AGX-E5xx` | Segurança e permissões                    |
| `AGX-W6xx` | Avisos de compilação, incluindo lowerings |
| `AGX-Rxxx` | Runtime (limites, guardas)                |

## Formato de cada página

```markdown
# AGX-Ennn — <título curto>

**Severidade:** erro | aviso
**Emitido por:** validador | compilador | runtime | exporter:<target>
**Spec:** specs/ir-v1.md §N

## O que aconteceu

## Por que isso é um problema

## Como corrigir

<exemplo antes / depois, com YAML real>

## Quando o erro é o esperado
```

A última seção existe porque alguns diagnósticos são o comportamento correto do sistema
recusando uma construção ambígua — e a página precisa dizer isso, para ninguém tentar
"consertar" o validador.

## Códigos já previstos pela spec

Estes aparecem em `specs/` e ganham página na fase que os implementa:

| Código     | Fase | Origem                                                                        |
| ---------- | ---- | ----------------------------------------------------------------------------- |
| `AGX-E210` | 2    | Duas arestas incondicionais no mesmo nó (`ir-v1.md` §4)                       |
| `AGX-E401` | 2    | Reducer não comutativo sob concorrência (`ir-v1.md` §2.4)                     |
| `AGX-E501` | 2    | Literal com entropia alta onde se espera referência de secret (`ir-v1.md` §8) |
| `AGX-R301` | 3    | `maxNodeVisits` atingido (`ir-v1.md` §10)                                     |
| `AGX-W612` | 5    | Join rebaixado de `n_of_m` para `all` (`lowerings.md`)                        |

_Nenhuma página escrita ainda — a Fase 0 não emite diagnóstico._
