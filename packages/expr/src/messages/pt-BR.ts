/**
 * Catálogo `pt-BR`.
 *
 * Termos que aparecem no grafo (`state`, `in`, `run`, `bool`, `number`, `string`, `array`,
 * `object`, nomes de função) **não** são traduzidos: são identificadores que a pessoa
 * digita no arquivo. Traduzir `number` para "número" faria a mensagem descrever algo que
 * não existe no YAML.
 */
import type { Catalog } from './ids.js';

export const ptBR: Catalog = {
  'position-column': ({ column }) => `coluna ${String(column)}`,

  // -- léxico ---------------------------------------------------------------
  'no-assignment': () => 'AGX-Expr não tem atribuição.',
  'use-equality-operator': () => 'Para comparar, use `==`.',
  'unexpected-character': ({ char }) => `Caractere inesperado: ${char}.`,
  'numeric-literal-out-of-range': ({ literal }) =>
    `Literal numérico fora da faixa representável: ${literal}.`,
  'no-infinity-use-finite': () => 'AGX-Expr não tem Infinity. Use um valor finito.',
  'unterminated-string': () => 'String sem aspas de fechamento.',
  'incomplete-escape-in-string': () => 'Escape incompleto no fim da string.',
  'unknown-escape': ({ escape }) => `Escape desconhecido: \\${escape}.`,
  'valid-escapes': () => 'Escapes válidos: \\\\ \\" \\\' \\n \\r \\t.',

  // -- sintaxe --------------------------------------------------------------
  'unexpected-token-after-end': ({ token }) =>
    `Token inesperado após o fim da expressão: \`${token}\`.`,
  'unexpected-eof-after-end': () => 'Fim inesperado da expressão.',
  'chained-comparison': () => 'Comparação encadeada não é permitida.',
  'use-and-for-chained-comparison': () =>
    'Escreva as duas comparações ligadas por `&&`: `a < b && b < c`.',
  'nesting-too-deep': ({ limit }) =>
    `Expressão aninhada além do limite de ${String(limit)} níveis.`,
  'nesting-too-deep-hint': () =>
    'Aninhamento assim profundo quase sempre é entrada malformada. Se for intencional, quebre a condição em nós `condition` encadeados.',
  'missing-close-paren': () => 'Falta `)` para fechar o parêntese.',
  'in-alone': () => '`in` sozinho não é um valor.',
  'in-usage-hint': () =>
    'Como raiz, `in` nomeia uma entrada do nó: `in.<nome>`. Como operador, vai entre dois valores: `x in state.lista`.',
  'expected-value-found-token': ({ token }) =>
    `Esperava um valor, caminho ou chamada, e encontrei \`${token}\`.`,
  'expected-value-found-eof': () =>
    'Esperava um valor, caminho ou chamada, e encontrei o fim da expressão.',
  'bare-name': ({ name }) => `Nome solto: \`${name}\`.`,
  'bare-name-hint': ({ name }) =>
    `Caminhos começam por uma raiz. Você quis dizer \`state.${name}\`?`,
  'missing-close-paren-call': ({ name }) => `Falta \`)\` para fechar a chamada de \`${name}\`.`,
  'expected-field-name': () => 'Esperava um nome de campo após `.`.',
  'index-must-be-literal': () => 'Índice deve ser um inteiro literal.',
  'index-must-be-literal-hint': () =>
    'Índice calculado não existe em AGX-Expr: o caminho precisa ser analisável sem executar nada.',
  'missing-close-bracket-index': () => 'Falta `]` para fechar o índice.',

  // -- caminhos e nomes -----------------------------------------------------
  'state-alone': () => '`state` sozinho não é um valor.',
  'state-alone-hint': () => 'Nomeie um canal: `state.<canal>`.',
  'channels-are-named': () => 'Canais são nomeados, não indexados.',
  'unknown-channel': ({ name }) => `Canal desconhecido: \`${name}\`.`,
  'declared-channels': ({ names }) => `Canais declarados: ${names}.`,
  'no-channels-declared': () => 'Este grafo não declara nenhum canal.',
  'did-you-mean-channel': ({ name }) => `Você quis dizer \`state.${name}\`?`,
  'run-exposes-fields': () => '`run` expõe campos nomeados.',
  'run-fields': ({ names }) => `Campos: ${names}.`,
  'unknown-run-field': ({ name }) => `\`run\` não tem o campo \`${name}\`.`,
  'did-you-mean-run-field': ({ name }) => `Você quis dizer \`run.${name}\`?`,
  'unknown-input': ({ path }) => `Entrada desconhecida: \`in.${path}\`.`,
  'mapped-inputs': ({ names }) => `Entradas mapeadas: ${names}.`,
  'no-inputs-mapped': () => 'Este nó não mapeia nenhuma entrada.',
  'did-you-mean-input': ({ name }) => `Você quis dizer \`in.${name}\`?`,
  'unknown-function': ({ name }) => `Função desconhecida: \`${name}\`.`,
  'stdlib-is-closed': ({ names }) => `A biblioteca padrão é fechada: ${names}.`,
  'did-you-mean-function': ({ name }) => `Você quis dizer \`${name}\`?`,
  'wrong-arity': ({ name, expected, received }) =>
    `\`${name}\` espera ${String(expected)} argumento(s) e recebeu ${String(received)}.`,

  // -- tipos ----------------------------------------------------------------
  'arg-must-be-literal': ({ index, fn }) =>
    `O argumento ${String(index)} de \`${fn}\` deve ser um literal de string.`,
  'pattern-must-be-literal-hint': () =>
    'O padrão é compilado e validado ao salvar o grafo, então não pode vir do estado.',
  'arg-may-be-null': ({ index, fn, type }) =>
    `O argumento ${String(index)} de \`${fn}\` pode ser nulo (${type}).`,
  'use-coalesce-hint': () =>
    'Use `coalesce(valor, padrão)` para declarar o que o ausente significa.',
  'arg-type-mismatch': ({ index, fn, type, accepts }) =>
    `O argumento ${String(index)} de \`${fn}\` é ${type}, e a função aceita ${accepts}.`,
  'unary-operand-type': ({ operator, expected, received }) =>
    `\`${operator}\` espera ${expected} e recebeu ${received}.`,
  'logical-operand-not-bool': ({ operator, received }) =>
    `\`${operator}\` espera bool e recebeu ${received}.`,
  'no-boolean-coercion-hint': () =>
    'AGX-Expr não converte valor em booleano. Compare explicitamente.',
  'equality-type-mismatch': ({ operator, left, right }) =>
    `\`${operator}\` entre ${left} e ${right} nunca pode ser verdadeiro.`,
  'no-type-conversion-hint': () =>
    'AGX-Expr não converte tipos. Converta explicitamente com `int()`, `float()` ou `bool()`.',
  'not-orderable': ({ operator, type }) => `\`${operator}\` não se aplica a ${type}.`,
  'only-number-string-orderable-hint': () => 'Só number e string são ordenáveis.',
  'ordering-type-mismatch': ({ operator, left, right }) =>
    `\`${operator}\` entre ${left} e ${right}.`,
  'order-same-type-hint': () => 'Ordene valores do mesmo tipo.',
  'in-not-substring': () => '`in` não faz busca de substring.',
  'use-contains-hint': () => 'Use `contains(texto, trecho)`.',
  'in-needs-collection': ({ type }) =>
    `\`in\` espera array ou object à direita, e recebeu ${type}.`,
  'object-key-must-be-string': ({ type }) =>
    `Chave de object é string, e a comparação recebeu ${type}.`,
  'arith-operand-not-number': ({ operator, received }) =>
    `\`${operator}\` espera number e recebeu ${received}.`,
  'concat-needs-strings-hint': () =>
    'Para concatenar, os dois lados devem ser string. Converta com `int()` ou `float()`.',
  'operand-may-be-null': ({ operator, type }) =>
    `\`${operator}\` recebeu um valor que pode ser nulo (${type}).`,
  'coalesce-type-mismatch': ({ value, fallback }) =>
    `coalesce() recebeu ${value} e um padrão ${fallback}.`,
  'coalesce-type-mismatch-hint': () =>
    'O padrão precisa ser do mesmo tipo do valor — é ele que o substitui quando o valor é nulo.',

  // -- regex ----------------------------------------------------------------
  'regex-unexpected-character': ({ char }) => `Caractere inesperado no padrão: ${char}.`,
  'regex-no-lazy-quantifier': () =>
    'Quantificador preguiçoso (`*?`, `+?`, `??`) não existe neste dialeto.',
  'regex-no-lazy-quantifier-hint': () =>
    'Sem captura, o casamento preguiçoso não muda o resultado de `matches`. Remova o `?`.',
  'regex-nested-quantifier': () => 'Quantificador aplicado a quantificador.',
  'regex-nested-quantifier-hint': () => 'Agrupe explicitamente: `(a+)+`.',
  'regex-inverted-repetition': ({ min, max }) =>
    `Repetição inválida: {${min},${max}} tem máximo menor que o mínimo.`,
  'regex-repetition-above-cap': ({ cap }) => `Repetição acima do teto de ${String(cap)}.`,
  'regex-repetition-cap-hint': () =>
    'Sem teto, o padrão gera um autômato gigante e o custo apenas migra da busca para a compilação.',
  'regex-unmatched-close-paren': () => '`)` sem `(` correspondente.',
  'regex-unmatched-close-bracket': () => '`]` sem `[` correspondente.',
  'regex-quantifier-nothing-to-repeat': ({ quantifier }) =>
    `Quantificador \`${quantifier}\` sem nada para repetir.`,
  'regex-no-lookahead': () => 'Lookahead não existe neste dialeto.',
  'regex-no-lookahead-hint': () =>
    'Reescreva sem lookahead, ou mova a checagem para uma branch `condition` separada.',
  'regex-no-lookbehind': () => 'Lookbehind e grupo nomeado não existem neste dialeto.',
  'regex-unsupported-group': ({ marker }) => `Construção \`(?${marker}\` não é suportada.`,
  'regex-missing-close-paren': () => 'Falta `)` para fechar o grupo.',
  'regex-incomplete-escape': () => 'Escape incompleto no fim do padrão.',
  'regex-no-backreference': () => 'Backreference não existe neste dialeto.',
  'regex-no-backreference-hint': () =>
    'Backreference é o que torna o casamento exponencial. `matches` não tem captura.',
  'regex-incomplete-escape-in-class': () => 'Escape incompleto dentro da classe de caracteres.',
  'regex-incomplete-escape-in-range': () => 'Escape incompleto na faixa.',
  'regex-incomplete-range': () => 'Faixa incompleta na classe de caracteres.',
  'regex-inverted-range': ({ low, high }) =>
    `Faixa invertida na classe de caracteres: \`${low}-${high}\`.`,
  'regex-missing-close-bracket': () => 'Falta `]` para fechar a classe de caracteres.',
  'regex-empty-class': () => 'Classe de caracteres vazia.',

  // -- avaliação ------------------------------------------------------------
  'fuel-exhausted': ({ limit }) => `Limite de ${String(limit)} passos de avaliação excedido.`,
  'fuel-exhausted-hint': () =>
    'A expressão é grande demais, ou o dado de entrada é maior que o previsto.',
  'unknown-function-runtime': ({ name }) => `Função desconhecida em runtime: \`${name}\`.`,
  'runtime-comparison-mismatch': ({ operator, left, right }) =>
    `Comparação \`${operator}\` entre ${left} e ${right}.`,
  'division-by-zero': () => 'Divisão por zero.',
  'remainder-by-zero': () => 'Resto de divisão por zero.',
  'guard-divisor-hint': () => 'Garanta o divisor numa branch anterior: `state.calls > 0`.',
  'runtime-arith-operands': ({ operator, left, right }) =>
    `\`${operator}\` espera number e recebeu ${left} e ${right}.`,
  'arith-out-of-range': ({ operator }) =>
    `\`${operator}\` produziu um valor fora da faixa representável.`,
  'no-infinity-finite-hint': () =>
    'AGX-Expr não tem Infinity: o resultado precisa ser um número finito.',
  'fn-non-finite-result': ({ fn }) => `${fn} produziu um valor não finito.`,
  'no-nan-no-infinity': () => 'AGX-Expr não tem NaN nem Infinity (ADR-0004).',
  'len-not-applicable': ({ kind }) => `len() não se aplica a ${kind}.`,
  'contains-needs-string': ({ kind }) =>
    `contains() sobre string espera string, e recebeu ${kind}.`,
  'contains-not-applicable': ({ kind }) => `contains() não se aplica a ${kind}.`,
  'int-cannot-convert': ({ value }) => `int() não converte ${value}.`,
  'float-cannot-convert': ({ value }) => `float() não converte ${value}.`,
  'bool-string-domain': ({ value }) =>
    `bool() sobre string aceita apenas "true" ou "false", e recebeu ${value}.`,
  'bool-string-domain-hint': () => 'Compare explicitamente: `state.x == "sim"`.',
  'bool-not-applicable': ({ kind }) => `bool() não se aplica a ${kind}.`,
};
