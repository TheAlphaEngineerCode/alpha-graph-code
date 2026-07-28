/**
 * Contrato de mensagens de AGX-Expr (ADR-0006).
 *
 * Cada diagnóstico carrega um **identificador** e parâmetros tipados, nunca prosa. O texto
 * é projeção disso, produzida por `render` no momento de exibir.
 *
 * O motivo principal não é tradução: é determinismo. O trace precisa ser idêntico byte a
 * byte entre execuções (specs/trace-v1.md), e erro estruturado entra no canal `errors`.
 * Texto localizado dentro de artefato comparável byte a byte é contradição — duas máquinas
 * com locales diferentes produziriam traces diferentes para o mesmo grafo.
 *
 * `MessageParams` é a fonte da verdade: adicionar uma chave aqui quebra a compilação dos
 * três catálogos até que todos a implementem. É garantia mais forte que teste, porque não
 * dá para esquecer nem pular.
 */

/**
 * Mensagem sem parâmetro.
 *
 * É `Record<never, never>` e **não** `Record<string, never>`, que foi a primeira versão e
 * estava errada de um jeito que só aparece no tipo derivado: `Record<string, never>` tem
 * index signature, então `keyof` dele é `string` e ele é atribuível a `{ name: string }`
 * (o `never` da index satisfaz qualquer propriedade). Isso fazia `NoParamMessageId` aceitar
 * IDs **com** parâmetro, e `msg0('unknown-channel')` compilava — renderizando
 * "Unknown channel: `undefined`."
 */
export type NoParams = Record<never, never>;

export interface MessageParams {
  // -- render ---------------------------------------------------------------
  'position-column': { column: number };

  // -- léxico (AGX-E301) ----------------------------------------------------
  'no-assignment': NoParams;
  'use-equality-operator': NoParams;
  'unexpected-character': { char: string };
  'numeric-literal-out-of-range': { literal: string };
  'no-infinity-use-finite': NoParams;
  'unterminated-string': NoParams;
  'incomplete-escape-in-string': NoParams;
  'unknown-escape': { escape: string };
  'valid-escapes': NoParams;

  // -- sintaxe (AGX-E302) ---------------------------------------------------
  'unexpected-token-after-end': { token: string };
  'unexpected-eof-after-end': NoParams;
  'chained-comparison': NoParams;
  'use-and-for-chained-comparison': NoParams;
  'nesting-too-deep': { limit: number };
  'nesting-too-deep-hint': NoParams;
  'missing-close-paren': NoParams;
  'in-alone': NoParams;
  'in-usage-hint': NoParams;
  'expected-value-found-token': { token: string };
  'expected-value-found-eof': NoParams;
  'bare-name': { name: string };
  'bare-name-hint': { name: string };
  'missing-close-paren-call': { name: string };
  'expected-field-name': NoParams;
  'index-must-be-literal': NoParams;
  'index-must-be-literal-hint': NoParams;
  'missing-close-bracket-index': NoParams;

  // -- caminhos e nomes (AGX-E310 / E311 / E312) ----------------------------
  'state-alone': NoParams;
  'state-alone-hint': NoParams;
  'channels-are-named': NoParams;
  'unknown-channel': { name: string };
  'declared-channels': { names: string };
  'no-channels-declared': NoParams;
  'did-you-mean-channel': { name: string };
  'run-exposes-fields': NoParams;
  'run-fields': { names: string };
  'unknown-run-field': { name: string };
  'did-you-mean-run-field': { name: string };
  'unknown-input': { path: string };
  'mapped-inputs': { names: string };
  'no-inputs-mapped': NoParams;
  'did-you-mean-input': { name: string };
  'unknown-function': { name: string };
  'stdlib-is-closed': { names: string };
  'did-you-mean-function': { name: string };
  'wrong-arity': { name: string; expected: number; received: number };

  // -- tipos (AGX-E320 / E321 / E322) ---------------------------------------
  'arg-must-be-literal': { index: number; fn: string };
  'pattern-must-be-literal-hint': NoParams;
  'arg-may-be-null': { index: number; fn: string; type: string };
  'use-coalesce-hint': NoParams;
  'arg-type-mismatch': { index: number; fn: string; type: string; accepts: string };
  'unary-operand-type': { operator: string; expected: string; received: string };
  'logical-operand-not-bool': { operator: string; received: string };
  'no-boolean-coercion-hint': NoParams;
  'equality-type-mismatch': { operator: string; left: string; right: string };
  'no-type-conversion-hint': NoParams;
  'not-orderable': { operator: string; type: string };
  'only-number-string-orderable-hint': NoParams;
  'ordering-type-mismatch': { operator: string; left: string; right: string };
  'order-same-type-hint': NoParams;
  'in-not-substring': NoParams;
  'use-contains-hint': NoParams;
  'in-needs-collection': { type: string };
  'object-key-must-be-string': { type: string };
  'arith-operand-not-number': { operator: string; received: string };
  'concat-needs-strings-hint': NoParams;
  'operand-may-be-null': { operator: string; type: string };
  'coalesce-type-mismatch': { value: string; fallback: string };
  'coalesce-type-mismatch-hint': NoParams;

  // -- regex (AGX-E330) -----------------------------------------------------
  'regex-unexpected-character': { char: string };
  'regex-no-lazy-quantifier': NoParams;
  'regex-no-lazy-quantifier-hint': NoParams;
  'regex-nested-quantifier': NoParams;
  'regex-nested-quantifier-hint': NoParams;
  'regex-inverted-repetition': { min: string; max: string };
  'regex-repetition-above-cap': { cap: number };
  'regex-repetition-cap-hint': NoParams;
  'regex-unmatched-close-paren': NoParams;
  'regex-unmatched-close-bracket': NoParams;
  'regex-quantifier-nothing-to-repeat': { quantifier: string };
  'regex-no-lookahead': NoParams;
  'regex-no-lookahead-hint': NoParams;
  'regex-no-lookbehind': NoParams;
  'regex-unsupported-group': { marker: string };
  'regex-missing-close-paren': NoParams;
  'regex-incomplete-escape': NoParams;
  'regex-no-backreference': NoParams;
  'regex-no-backreference-hint': NoParams;
  'regex-incomplete-escape-in-class': NoParams;
  'regex-incomplete-escape-in-range': NoParams;
  'regex-incomplete-range': NoParams;
  'regex-inverted-range': { low: string; high: string };
  'regex-missing-close-bracket': NoParams;
  'regex-empty-class': NoParams;

  // -- avaliação (AGX-R310 / R311) ------------------------------------------
  'fuel-exhausted': { limit: number };
  'fuel-exhausted-hint': NoParams;
  'unknown-function-runtime': { name: string };
  'runtime-comparison-mismatch': { operator: string; left: string; right: string };
  'division-by-zero': NoParams;
  'remainder-by-zero': NoParams;
  'guard-divisor-hint': NoParams;
  'runtime-arith-operands': { operator: string; left: string; right: string };
  'arith-out-of-range': { operator: string };
  'no-infinity-finite-hint': NoParams;
  'fn-non-finite-result': { fn: string };
  'no-nan-no-infinity': NoParams;
  'len-not-applicable': { kind: string };
  'contains-needs-string': { kind: string };
  'contains-not-applicable': { kind: string };
  'int-cannot-convert': { value: string };
  'float-cannot-convert': { value: string };
  'bool-string-domain': { value: string };
  'bool-string-domain-hint': NoParams;
  'bool-not-applicable': { kind: string };
}

export type MessageId = keyof MessageParams;

/**
 * Um catálogo completo.
 *
 * O mapeamento sobre `MessageId` é o que faz chave faltando virar erro de compilação: um
 * locale não pode ser publicado metade traduzido.
 */
export type Catalog = {
  readonly [K in MessageId]: (params: MessageParams[K]) => string;
};

// A lista em runtime sai do catálogo `en` (ver ./index.ts), e não de um cast de
// `MessageParams`: tipo não existe em runtime, então `Object.keys({} as MessageParams)`
// devolveria array vazio — e todo teste de paridade passaria sobre lista nenhuma.
