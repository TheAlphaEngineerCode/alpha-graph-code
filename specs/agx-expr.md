# AGX-Expr — especificação normativa

|                   |                                      |
| ----------------- | ------------------------------------ |
| **Status**        | NORMATIVO                            |
| **Implementação** | `packages/expr` (Fase 1)             |
| **Origem**        | Master Blueprint v2.0, Parte II §4.5 |

AGX-Expr é a **única** linguagem de condição da Alpha Graph IR. Existe por um motivo de
segurança, não de gosto: a seção de segurança promete que **importar um grafo nunca executa
código**, e a IR usa condições como `state.confidence < 0.8`. Avaliar essa string **é**
executar código. Com `eval`, `new Function` ou qualquer avaliador JS completo, um
`.agx.yaml` baixado da internet vira vetor de execução arbitrária dentro do editor.

As duas promessas só coexistem com uma linguagem própria, total, sem efeitos colaterais e
verificada por tipos.

## 1. Propriedades exigidas

1. **Total.** Toda expressão válida termina. Não há loops, não há recursão.
2. **Pura.** Não há atribuição, não há I/O, não há acesso a host, não há chamada de função
   definida pelo usuário.
3. **Limitada.** A avaliação tem **limite de fuel**; exceder o limite é erro de runtime, não
   travamento.
4. **Tipada.** Toda expressão é checada contra o schema de canais **em tempo de validação**,
   antes de qualquer execução.
5. **Interpretada por código nosso.** `eval`, `new Function` e `vm` são proibidos e barrados
   por regra de lint que falha o build (invariante 3).

## 2. Gramática

```text
expr    := or
or      := and ( "||" and )*
and     := cmp ( "&&" cmp )*
cmp     := add ( ( "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" ) add )?
add     := mul ( ( "+" | "-" ) mul )*
mul     := unary ( ( "*" | "/" | "%" ) unary )*
unary   := ( "!" | "-" )? primary
primary := literal | path | call | "(" expr ")"
path    := ( "state" | "in" | "run" ) ( "." IDENT | "[" INT "]" )*
call    := FUNC "(" ( expr ( "," expr )* )? ")"
```

Note que `cmp` **não** encadeia: `a < b < c` é erro de sintaxe, não uma comparação
encadeada silenciosamente errada.

### 2.1 Raízes de caminho

| Raiz    | Conteúdo                                                |
| ------- | ------------------------------------------------------- |
| `state` | Canais do grafo, conforme declarado em `state.channels` |
| `in`    | Entrada mapeada do nó corrente                          |
| `run`   | Metadados do run (`run.id`, `run.step`, `run.attempt`)  |

Não há outra raiz. Não há acesso a `globalThis`, `process`, `require` ou equivalente.

## 3. Biblioteca padrão — lista fechada

Todas as funções são puras. A lista é **fechada**: adicionar função exige ADR.

```text
len(x)             has(path)          matches(s, re)
lower(s)           upper(s)           coalesce(a, b)
startsWith(s, p)   endsWith(s, p)     contains(a, b)
int(x)             float(x)           bool(x)
now()
```

`now()` é **determinístico**: retorna o clock injetado do run, nunca o relógio real. Sem
isso, replay não reproduziria o mesmo trace.

`matches(s, re)` recebe uma expressão regular. **`[LACUNA]`** — o dialeto e a defesa contra
catastrophic backtracking são decididos na Fase 1, com ADR. Um regex engine com
backtracking exponencial derrotaria a propriedade de totalidade pela porta de trás, então
esta função não entra antes dessa decisão.

## 4. Type-check contra o schema de canais

O ganho colateral é o que mais aparece no uso diário: como AGX-Expr é checada contra os
canais declarados, `state.confidenc < 0.8` **falha ao salvar o grafo**, com sugestão do nome
correto.

Numa linguagem dinâmica, a mesma expressão viraria `undefined < 0.8 === false` — um branch
errado, silencioso, em produção. Isto sozinho é argumento suficiente para não usar
JavaScript como linguagem de condição.

## 5. Propriedades a provar por teste (Fase 1)

- Toda expressão que faz parse **termina** dentro do limite de fuel.
- Expressão mal tipada é rejeitada **em tempo de checagem**, nunca em tempo de execução.
- `parse` e reimpressão fazem round-trip: `print(parse(s))` reparseia para a mesma AST.
- Nenhuma entrada — inclusive malformada, unicode ou numericamente extrema — faz o parser
  lançar exceção não tratada. Erro é valor de retorno, não crash.

## 6. Lacunas declaradas

- **Precisão numérica.** Se `1e308 * 10` é erro, `Infinity` ou saturação, decide-se na Fase
  1 com ADR. Números da IR usam a menor representação que faz round-trip (ir-v1 §9), e a
  aritmética precisa concordar com isso.
- **Semântica de `in`.** Vale para array e para chave de objeto; o comportamento sobre
  string (substring ou erro) fica para a Fase 1.
- **Comparação entre tipos diferentes.** A intenção é **erro de type-check**, não coerção.
  Confirmar na Fase 1 junto do typechecker.
