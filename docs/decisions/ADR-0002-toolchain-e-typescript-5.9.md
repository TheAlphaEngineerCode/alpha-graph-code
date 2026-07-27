# ADR-0002 — Toolchain do monorepo e TypeScript 5.9 em vez de 7.0

|            |            |
| ---------- | ---------- |
| **Status** | Aceita     |
| **Data**   | 2026-07-27 |
| **Fase**   | 0          |

## Contexto

O blueprint fixa TypeScript strict, pnpm workspace + Turborepo e Vitest, e manda verificar
compatibilidade antes de adicionar dependência relevante. Ao verificar, uma incompatibilidade
apareceu — e ela decide a versão da linguagem em que o projeto inteiro vai ser escrito.

Versões consultadas no npm em **2026-07-27**, não presumidas:

| Pacote              | `latest`  | Adotado   |
| ------------------- | --------- | --------- |
| `typescript`        | **7.0.2** | **5.9.3** |
| `typescript-eslint` | 8.65.0    | 8.65.0    |
| `eslint`            | 10.8.0    | 10.8.0    |
| `vitest`            | 4.1.10    | 4.1.10    |
| `turbo`             | 2.10.7    | 2.10.7    |
| `prettier`          | 3.9.6     | 3.9.6     |
| `pnpm`              | 11.17.0   | 11.17.0   |

## Decisão

### TypeScript 5.9.3, não 7.0.2

`typescript-eslint@8.65.0` declara `peerDependencies.typescript: ">=4.8.4 <6.1.0"`. **TS 7
está fora da faixa suportada.** Não há release de `typescript-eslint` que o declare —
`dist-tags` mostra `latest: 8.65.0` e nenhuma linha 9.x.

Adotar TS 7 significaria abrir mão do **linting com informação de tipos**, e é justamente ele
que sustenta dois invariantes deste projeto: zero `any` no núcleo (invariante 10) e
`no-unsafe-*` impedindo que `unknown` vire `any` por acidente. Num compilador, onde a maior
parte do trabalho é manipular AST tipada, essa camada não é conveniência — é a rede que pega
o erro que o `tsc` sozinho não pega.

Preferi a versão anterior da linguagem à perda do linter tipado.

**Gatilho de migração, para isto não virar dívida esquecida:** quando `typescript-eslint`
publicar release estável cujo peer aceite `typescript@>=7`, migrar para TS 7 em um PR
próprio, com `lint` e `typecheck` verdes antes do merge. Registrar o resultado como ADR-000N.

### pnpm em vez de npm

O vault desta máquina registrava pnpm como inviável aqui, porque `corepack enable` falha com
`EPERM` ao escrever em `C:\Program Files\nodejs`. **Testei o caminho alternativo antes de
aceitar a conclusão:** `npm i -g pnpm` instala no prefixo de usuário
(`AppData\Local\npm-global`) e funciona sem terminal elevado. `pnpm 11.17.0` confirmado.

A conclusão anterior era verdadeira sobre `corepack`, e falsa sobre pnpm.

### Um `tsconfig` de build e um de typecheck por pacote

`tsconfig.json` faz typecheck de tudo, incluindo testes colocados em `src`, com `noEmit`.
`tsconfig.build.json` emite e **exclui** `*.test.ts`, para que teste não vá para `dist`.

A alternativa — um único config — obriga a escolher entre não checar os testes ou publicar
os testes. As duas são erradas.

### Sem project references / `composite`

A resolução entre pacotes passa pelos `.d.ts` de `dist`, e a ordem topológica de build é do
Turborepo (`dependsOn: ["^build"]`). Isso mantém um único mecanismo de ordenação em vez de
dois que precisam concordar.

### Strictness acima do `strict`

Habilitados também: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`,
`noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`, `erasableSyntaxOnly`.

`noUncheckedIndexedAccess` merece nota: um parser indexa arrays de token o tempo todo, e o
default do TS mente sobre `tokens[i]` sempre existir. Ligar isso depois, com o parser
escrito, custa uma refatoração; ligar antes custa nada.

## Consequências

- Quem clonar o repositório precisa de pnpm. `packageManager` no `package.json` fixa a
  versão; `engines.node` exige `>=20.19.0`.
- `fetchTimeout` e `fetchRetries` elevados em `pnpm-workspace.yaml`: o install da Fase 0
  falhou por timeout de rede a ~30 KiB/s, e um install que quebra por rede lenta é atrito
  desnecessário para contribuidor e para CI.
- O gatilho de TS 7 precisa ser reavaliado a cada fase, não uma vez.
