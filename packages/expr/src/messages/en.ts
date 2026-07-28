/** Catálogo `en` — locale padrão e fallback (ADR-0006 §3). */
import type { Catalog } from './ids.js';

export const en: Catalog = {
  'position-column': ({ column }) => `column ${String(column)}`,

  // -- léxico ---------------------------------------------------------------
  'no-assignment': () => 'AGX-Expr has no assignment.',
  'use-equality-operator': () => 'To compare, use `==`.',
  'unexpected-character': ({ char }) => `Unexpected character: ${char}.`,
  'numeric-literal-out-of-range': ({ literal }) =>
    `Numeric literal outside the representable range: ${literal}.`,
  'no-infinity-use-finite': () => 'AGX-Expr has no Infinity. Use a finite value.',
  'unterminated-string': () => 'Unterminated string literal.',
  'incomplete-escape-in-string': () => 'Incomplete escape at end of string.',
  'unknown-escape': ({ escape }) => `Unknown escape: \\${escape}.`,
  'valid-escapes': () => 'Valid escapes: \\\\ \\" \\\' \\n \\r \\t.',

  // -- sintaxe --------------------------------------------------------------
  'unexpected-token-after-end': ({ token }) =>
    `Unexpected token after the end of the expression: \`${token}\`.`,
  'unexpected-eof-after-end': () => 'Unexpected end of expression.',
  'chained-comparison': () => 'Chained comparison is not allowed.',
  'use-and-for-chained-comparison': () =>
    'Write both comparisons joined by `&&`: `a < b && b < c`.',
  'nesting-too-deep': ({ limit }) =>
    `Expression nested beyond the limit of ${String(limit)} levels.`,
  'nesting-too-deep-hint': () =>
    'Nesting this deep is almost always malformed input. If it is intentional, split the condition across chained `condition` nodes.',
  'missing-close-paren': () => 'Missing `)` to close the parenthesis.',
  'in-alone': () => '`in` alone is not a value.',
  'in-usage-hint': () =>
    'As a root, `in` names a node input: `in.<name>`. As an operator, it goes between two values: `x in state.list`.',
  'expected-value-found-token': ({ token }) =>
    `Expected a value, path or call, and found \`${token}\`.`,
  'expected-value-found-eof': () =>
    'Expected a value, path or call, and found the end of the expression.',
  'bare-name': ({ name }) => `Bare name: \`${name}\`.`,
  'bare-name-hint': ({ name }) => `Paths start with a root. Did you mean \`state.${name}\`?`,
  'missing-close-paren-call': ({ name }) => `Missing \`)\` to close the call to \`${name}\`.`,
  'expected-field-name': () => 'Expected a field name after `.`.',
  'index-must-be-literal': () => 'Index must be an integer literal.',
  'index-must-be-literal-hint': () =>
    'Computed indexes do not exist in AGX-Expr: the path must be analysable without executing anything.',
  'missing-close-bracket-index': () => 'Missing `]` to close the index.',

  // -- caminhos e nomes -----------------------------------------------------
  'state-alone': () => '`state` alone is not a value.',
  'state-alone-hint': () => 'Name a channel: `state.<channel>`.',
  'channels-are-named': () => 'Channels are named, not indexed.',
  'unknown-channel': ({ name }) => `Unknown channel: \`${name}\`.`,
  'declared-channels': ({ names }) => `Declared channels: ${names}.`,
  'no-channels-declared': () => 'No channels are declared in this graph.',
  'did-you-mean-channel': ({ name }) => `Did you mean \`state.${name}\`?`,
  'run-exposes-fields': () => '`run` exposes named fields.',
  'run-fields': ({ names }) => `Fields: ${names}.`,
  'unknown-run-field': ({ name }) => `\`run\` has no field \`${name}\`.`,
  'did-you-mean-run-field': ({ name }) => `Did you mean \`run.${name}\`?`,
  'unknown-input': ({ path }) => `Unknown input: \`in.${path}\`.`,
  'mapped-inputs': ({ names }) => `Mapped inputs: ${names}.`,
  'no-inputs-mapped': () => 'This node maps no inputs.',
  'did-you-mean-input': ({ name }) => `Did you mean \`in.${name}\`?`,
  'unknown-function': ({ name }) => `Unknown function: \`${name}\`.`,
  'stdlib-is-closed': ({ names }) => `The standard library is closed: ${names}.`,
  'did-you-mean-function': ({ name }) => `Did you mean \`${name}\`?`,
  'wrong-arity': ({ name, expected, received }) =>
    `\`${name}\` expects ${String(expected)} argument(s) and received ${String(received)}.`,

  // -- tipos ----------------------------------------------------------------
  'arg-must-be-literal': ({ index, fn }) =>
    `Argument ${String(index)} of \`${fn}\` must be a string literal.`,
  'pattern-must-be-literal-hint': () =>
    'The pattern is compiled and validated when the graph is saved, so it cannot come from state.',
  'arg-may-be-null': ({ index, fn, type }) =>
    `Argument ${String(index)} of \`${fn}\` may be null (${type}).`,
  'use-coalesce-hint': () => 'Use `coalesce(value, default)` to declare what absence means.',
  'arg-type-mismatch': ({ index, fn, type, accepts }) =>
    `Argument ${String(index)} of \`${fn}\` is ${type}, and the function accepts ${accepts}.`,
  'unary-operand-type': ({ operator, expected, received }) =>
    `\`${operator}\` expects ${expected} and received ${received}.`,
  'logical-operand-not-bool': ({ operator, received }) =>
    `\`${operator}\` expects bool and received ${received}.`,
  'no-boolean-coercion-hint': () =>
    'AGX-Expr does not coerce values to boolean. Compare explicitly.',
  'equality-type-mismatch': ({ operator, left, right }) =>
    `\`${operator}\` between ${left} and ${right} can never be true.`,
  'no-type-conversion-hint': () =>
    'AGX-Expr does not convert types. Convert explicitly with `int()`, `float()` or `bool()`.',
  'not-orderable': ({ operator, type }) => `\`${operator}\` does not apply to ${type}.`,
  'only-number-string-orderable-hint': () => 'Only number and string are orderable.',
  'ordering-type-mismatch': ({ operator, left, right }) =>
    `\`${operator}\` between ${left} and ${right}.`,
  'order-same-type-hint': () => 'Order values of the same type.',
  'in-not-substring': () => '`in` does not perform substring search.',
  'use-contains-hint': () => 'Use `contains(text, part)`.',
  'in-needs-collection': ({ type }) =>
    `\`in\` expects an array or object on the right, and received ${type}.`,
  'object-key-must-be-string': ({ type }) =>
    `Object keys are strings, and the comparison received ${type}.`,
  'arith-operand-not-number': ({ operator, received }) =>
    `\`${operator}\` expects number and received ${received}.`,
  'concat-needs-strings-hint': () =>
    'To concatenate, both sides must be strings. Convert with `int()` or `float()`.',
  'operand-may-be-null': ({ operator, type }) =>
    `\`${operator}\` received a value that may be null (${type}).`,
  'coalesce-type-mismatch': ({ value, fallback }) =>
    `coalesce() received ${value} and a ${fallback} default.`,
  'coalesce-type-mismatch-hint': () =>
    'The default must be the same type as the value — it is what replaces the value when the value is null.',

  // -- regex ----------------------------------------------------------------
  'regex-unexpected-character': ({ char }) => `Unexpected character in pattern: ${char}.`,
  'regex-no-lazy-quantifier': () =>
    'Lazy quantifiers (`*?`, `+?`, `??`) do not exist in this dialect.',
  'regex-no-lazy-quantifier-hint': () =>
    'Without capture, lazy matching cannot change the result of `matches`. Remove the `?`.',
  'regex-nested-quantifier': () => 'Quantifier applied to a quantifier.',
  'regex-nested-quantifier-hint': () => 'Group explicitly: `(a+)+`.',
  'regex-inverted-repetition': ({ min, max }) =>
    `Invalid repetition: {${min},${max}} has a maximum below the minimum.`,
  'regex-repetition-above-cap': ({ cap }) => `Repetition above the cap of ${String(cap)}.`,
  'regex-repetition-cap-hint': () =>
    'Without a cap the pattern builds a huge automaton, and the cost simply moves from matching to compilation.',
  'regex-unmatched-close-paren': () => '`)` without a matching `(`.',
  'regex-unmatched-close-bracket': () => '`]` without a matching `[`.',
  'regex-quantifier-nothing-to-repeat': ({ quantifier }) =>
    `Quantifier \`${quantifier}\` with nothing to repeat.`,
  'regex-no-lookahead': () => 'Lookahead does not exist in this dialect.',
  'regex-no-lookahead-hint': () =>
    'Rewrite without lookahead, or move the check into a separate `condition` branch.',
  'regex-no-lookbehind': () => 'Lookbehind and named groups do not exist in this dialect.',
  'regex-unsupported-group': ({ marker }) => `Construct \`(?${marker}\` is not supported.`,
  'regex-missing-close-paren': () => 'Missing `)` to close the group.',
  'regex-incomplete-escape': () => 'Incomplete escape at end of pattern.',
  'regex-no-backreference': () => 'Backreferences do not exist in this dialect.',
  'regex-no-backreference-hint': () =>
    'Backreferences are what make matching exponential. `matches` has no capture.',
  'regex-incomplete-escape-in-class': () => 'Incomplete escape inside the character class.',
  'regex-incomplete-escape-in-range': () => 'Incomplete escape in the range.',
  'regex-incomplete-range': () => 'Incomplete range in the character class.',
  'regex-inverted-range': ({ low, high }) =>
    `Inverted range in the character class: \`${low}-${high}\`.`,
  'regex-missing-close-bracket': () => 'Missing `]` to close the character class.',
  'regex-empty-class': () => 'Empty character class.',

  // -- avaliação ------------------------------------------------------------
  'fuel-exhausted': ({ limit }) => `Evaluation step limit of ${String(limit)} exceeded.`,
  'fuel-exhausted-hint': () =>
    'The expression is too large, or the input data is bigger than expected.',
  'unknown-function-runtime': ({ name }) => `Unknown function at runtime: \`${name}\`.`,
  'runtime-comparison-mismatch': ({ operator, left, right }) =>
    `Comparison \`${operator}\` between ${left} and ${right}.`,
  'division-by-zero': () => 'Division by zero.',
  'remainder-by-zero': () => 'Remainder by zero.',
  'guard-divisor-hint': () => 'Guard the divisor in an earlier branch: `state.calls > 0`.',
  'runtime-arith-operands': ({ operator, left, right }) =>
    `\`${operator}\` expects number and received ${left} and ${right}.`,
  'arith-out-of-range': ({ operator }) =>
    `\`${operator}\` produced a value outside the representable range.`,
  'no-infinity-finite-hint': () => 'AGX-Expr has no Infinity: the result must be a finite number.',
  'fn-non-finite-result': ({ fn }) => `${fn} produced a non-finite value.`,
  'no-nan-no-infinity': () => 'AGX-Expr has neither NaN nor Infinity (ADR-0004).',
  'len-not-applicable': ({ kind }) => `len() does not apply to ${kind}.`,
  'contains-needs-string': ({ kind }) =>
    `contains() over a string expects a string, and received ${kind}.`,
  'contains-not-applicable': ({ kind }) => `contains() does not apply to ${kind}.`,
  'int-cannot-convert': ({ value }) => `int() does not convert ${value}.`,
  'float-cannot-convert': ({ value }) => `float() does not convert ${value}.`,
  'bool-string-domain': ({ value }) =>
    `bool() over a string accepts only "true" or "false", and received ${value}.`,
  'bool-string-domain-hint': () => 'Compare explicitly: `state.x == "yes"`.',
  'bool-not-applicable': ({ kind }) => `bool() does not apply to ${kind}.`,
};
