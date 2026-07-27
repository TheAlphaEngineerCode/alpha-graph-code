# Contribuindo com o Alpha Graph Code

Obrigado pelo interesse. Este documento diz o que é preciso para uma contribuição entrar, e
o que o projeto **não** aceita — as duas coisas economizam tempo.

## Antes de escrever código

Leia, nesta ordem:

1. [`AGENTS.md`](./AGENTS.md) — os invariantes. Violar um é bug, sem exceção.
2. [`specs/ir-v1.md`](./specs/ir-v1.md) — **normativo**. Se o código divergir da spec, é o
   código que está errado.
3. [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md) — em que fase o projeto
   está e o que já é esperado existir.

Se a sua ideia muda a semântica da IR, o caminho é **propor mudança de spec primeiro**, por
issue ou ADR. Um PR que muda semântica sem ADR será recusado mesmo que o código esteja bom —
a spec vem antes do código por decisão de projeto, não por burocracia.

## Ambiente

```bash
corepack --version    # opcional
npm i -g pnpm         # se pnpm não estiver instalado
pnpm install
pnpm check            # lint + format + typecheck + test + build
```

Requer Node `>=20.19.0`. A versão do pnpm está fixada em `packageManager`.

## Portão de qualidade

`pnpm check` é o que o CI roda. Se passa local, passa no CI — e se falhar, corrija antes de
abrir o PR, não depois.

| Comando             | O que verifica                                           |
| ------------------- | -------------------------------------------------------- |
| `pnpm lint`         | ESLint, incluindo as barreiras dos invariantes 3, 9 e 10 |
| `pnpm format:check` | Prettier                                                 |
| `pnpm typecheck`    | `tsc` em todos os pacotes, strict                        |
| `pnpm test`         | Vitest                                                   |
| `pnpm build`        | `tsc` emitindo `dist` em ordem topológica                |

## Sign-off obrigatório (DCO)

Todo commit precisa de `Signed-off-by`. Use `-s`:

```bash
git commit -s -m "feat(expr): adiciona typechecker de comparação"
```

Isso adiciona uma linha ao commit:

```text
Signed-off-by: Seu Nome <seu@email>
```

Com ela você declara o [Developer Certificate of Origin 1.1](https://developercertificate.org/):
que tem o direito de submeter aquele código sob a licença do projeto. **O CI verifica.** Não
há CLA para assinar — a decisão está em
[ADR-0001](./docs/decisions/ADR-0001-licenca-apache-2.0-e-dco.md).

Esqueceu no último commit: `git commit --amend -s --no-edit`.

## O que todo PR precisa ter

- **Teste.** Feature nova nasce com teste; no núcleo e no compiler, property test onde couber.
  Um teste sem asserção significativa conta como ausência de teste.
- **Diagnóstico documentado.** Emitiu um código `AGX-*` novo? Ele nasce com página em
  `docs/diagnostics/<CODIGO>.md`.
- **Nada de placeholder no caminho crítico.** Sem `TODO` fingindo implementação.
- **Zero `any`** em `packages/expr`, `packages/graph-core` e `packages/compiler`.
- **ADR** se a mudança afeta portabilidade, segurança, semântica da IR ou compatibilidade.

## O que não entra

Os não-objetivos são decisões, não lacunas a preencher:

- Runtime hospedado ou execução gerenciada em produção.
- Conectores para SaaS de terceiro. Ferramentas entram pela interface de tool calling do usuário.
- Gatilhos de webhook, cron, planilha ou e-mail no core.
- Contas, billing ou colaboração no caminho crítico.
- Qualquer avaliação dinâmica (`eval`, `new Function`, `vm`). Condições usam AGX-Expr.
- Qualquer caminho em que **importar ou validar** um grafo execute algo.

## Exporters

O conjunto oficial é pequeno e fechado de propósito: `json`, `yaml`, `prompt`, `langgraph`.
Exporter novo é bem-vindo como **plugin**, e é tratado como fronteira de confiança — contrato
puro entrada/saída, sem rede, sem acesso a arquivo fora do diretório de saída
([`specs/lowerings.md`](./specs/lowerings.md) §5).

Toda incompatibilidade de target é declarada: `native`, `lowered` (com transform nomeada,
entrada no catálogo, fixture e golden test) ou `unsupported`. **Default silencioso é o único
resultado inaceitável.**

## Segurança

Vulnerabilidade não vai em issue pública. Ver [`SECURITY.md`](./SECURITY.md).
