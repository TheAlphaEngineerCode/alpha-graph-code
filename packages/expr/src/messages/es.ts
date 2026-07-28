/**
 * Catálogo `es`.
 *
 * Como no `pt-BR`: identificadores que aparecem no grafo (`state`, `in`, `run`, `bool`,
 * `number`, `string`, `array`, `object`, nomes de função) ficam como estão — são o que a
 * pessoa digita no YAML.
 */
import type { Catalog } from './ids.js';

export const es: Catalog = {
  'position-column': ({ column }) => `columna ${String(column)}`,

  // -- léxico ---------------------------------------------------------------
  'no-assignment': () => 'AGX-Expr no tiene asignación.',
  'use-equality-operator': () => 'Para comparar, use `==`.',
  'unexpected-character': ({ char }) => `Carácter inesperado: ${char}.`,
  'numeric-literal-out-of-range': ({ literal }) =>
    `Literal numérico fuera del rango representable: ${literal}.`,
  'no-infinity-use-finite': () => 'AGX-Expr no tiene Infinity. Use un valor finito.',
  'unterminated-string': () => 'Cadena sin comillas de cierre.',
  'incomplete-escape-in-string': () => 'Escape incompleto al final de la cadena.',
  'unknown-escape': ({ escape }) => `Escape desconocido: \\${escape}.`,
  'valid-escapes': () => 'Escapes válidos: \\\\ \\" \\\' \\n \\r \\t.',

  // -- sintaxe --------------------------------------------------------------
  'unexpected-token-after-end': ({ token }) =>
    `Token inesperado después del final de la expresión: \`${token}\`.`,
  'unexpected-eof-after-end': () => 'Final inesperado de la expresión.',
  'chained-comparison': () => 'No se permite la comparación encadenada.',
  'use-and-for-chained-comparison': () =>
    'Escriba ambas comparaciones unidas por `&&`: `a < b && b < c`.',
  'nesting-too-deep': ({ limit }) =>
    `Expresión anidada más allá del límite de ${String(limit)} niveles.`,
  'nesting-too-deep-hint': () =>
    'Un anidamiento así de profundo casi siempre es entrada malformada. Si es intencional, divida la condición en nodos `condition` encadenados.',
  'missing-close-paren': () => 'Falta `)` para cerrar el paréntesis.',
  'in-alone': () => '`in` por sí solo no es un valor.',
  'in-usage-hint': () =>
    'Como raíz, `in` nombra una entrada del nodo: `in.<nombre>`. Como operador, va entre dos valores: `x in state.lista`.',
  'expected-value-found-token': ({ token }) =>
    `Se esperaba un valor, ruta o llamada, y se encontró \`${token}\`.`,
  'expected-value-found-eof': () =>
    'Se esperaba un valor, ruta o llamada, y se encontró el final de la expresión.',
  'bare-name': ({ name }) => `Nombre suelto: \`${name}\`.`,
  'bare-name-hint': ({ name }) =>
    `Las rutas empiezan por una raíz. ¿Quiso decir \`state.${name}\`?`,
  'missing-close-paren-call': ({ name }) => `Falta \`)\` para cerrar la llamada a \`${name}\`.`,
  'expected-field-name': () => 'Se esperaba un nombre de campo después de `.`.',
  'index-must-be-literal': () => 'El índice debe ser un entero literal.',
  'index-must-be-literal-hint': () =>
    'Los índices calculados no existen en AGX-Expr: la ruta debe ser analizable sin ejecutar nada.',
  'missing-close-bracket-index': () => 'Falta `]` para cerrar el índice.',

  // -- caminhos e nomes -----------------------------------------------------
  'state-alone': () => '`state` por sí solo no es un valor.',
  'state-alone-hint': () => 'Nombre un canal: `state.<canal>`.',
  'channels-are-named': () => 'Los canales se nombran, no se indexan.',
  'unknown-channel': ({ name }) => `Canal desconocido: \`${name}\`.`,
  'declared-channels': ({ names }) => `Canales declarados: ${names}.`,
  'no-channels-declared': () => 'Este grafo no declara ningún canal.',
  'did-you-mean-channel': ({ name }) => `¿Quiso decir \`state.${name}\`?`,
  'run-exposes-fields': () => '`run` expone campos con nombre.',
  'run-fields': ({ names }) => `Campos: ${names}.`,
  'unknown-run-field': ({ name }) => `\`run\` no tiene el campo \`${name}\`.`,
  'did-you-mean-run-field': ({ name }) => `¿Quiso decir \`run.${name}\`?`,
  'unknown-input': ({ path }) => `Entrada desconocida: \`in.${path}\`.`,
  'mapped-inputs': ({ names }) => `Entradas mapeadas: ${names}.`,
  'no-inputs-mapped': () => 'Este nodo no mapea ninguna entrada.',
  'did-you-mean-input': ({ name }) => `¿Quiso decir \`in.${name}\`?`,
  'unknown-function': ({ name }) => `Función desconocida: \`${name}\`.`,
  'stdlib-is-closed': ({ names }) => `La biblioteca estándar es cerrada: ${names}.`,
  'did-you-mean-function': ({ name }) => `¿Quiso decir \`${name}\`?`,
  'wrong-arity': ({ name, expected, received }) =>
    `\`${name}\` espera ${String(expected)} argumento(s) y recibió ${String(received)}.`,

  // -- tipos ----------------------------------------------------------------
  'arg-must-be-literal': ({ index, fn }) =>
    `El argumento ${String(index)} de \`${fn}\` debe ser un literal de cadena.`,
  'pattern-must-be-literal-hint': () =>
    'El patrón se compila y valida al guardar el grafo, por lo que no puede venir del estado.',
  'arg-may-be-null': ({ index, fn, type }) =>
    `El argumento ${String(index)} de \`${fn}\` puede ser nulo (${type}).`,
  'use-coalesce-hint': () =>
    'Use `coalesce(valor, predeterminado)` para declarar qué significa la ausencia.',
  'arg-type-mismatch': ({ index, fn, type, accepts }) =>
    `El argumento ${String(index)} de \`${fn}\` es ${type}, y la función acepta ${accepts}.`,
  'unary-operand-type': ({ operator, expected, received }) =>
    `\`${operator}\` espera ${expected} y recibió ${received}.`,
  'logical-operand-not-bool': ({ operator, received }) =>
    `\`${operator}\` espera bool y recibió ${received}.`,
  'no-boolean-coercion-hint': () =>
    'AGX-Expr no convierte valores a booleano. Compare explícitamente.',
  'equality-type-mismatch': ({ operator, left, right }) =>
    `\`${operator}\` entre ${left} y ${right} nunca puede ser verdadero.`,
  'no-type-conversion-hint': () =>
    'AGX-Expr no convierte tipos. Convierta explícitamente con `int()`, `float()` o `bool()`.',
  'not-orderable': ({ operator, type }) => `\`${operator}\` no se aplica a ${type}.`,
  'only-number-string-orderable-hint': () => 'Solo number y string son ordenables.',
  'ordering-type-mismatch': ({ operator, left, right }) =>
    `\`${operator}\` entre ${left} y ${right}.`,
  'order-same-type-hint': () => 'Ordene valores del mismo tipo.',
  'in-not-substring': () => '`in` no busca subcadenas.',
  'use-contains-hint': () => 'Use `contains(texto, parte)`.',
  'in-needs-collection': ({ type }) =>
    `\`in\` espera un array u object a la derecha, y recibió ${type}.`,
  'object-key-must-be-string': ({ type }) =>
    `Las claves de object son string, y la comparación recibió ${type}.`,
  'arith-operand-not-number': ({ operator, received }) =>
    `\`${operator}\` espera number y recibió ${received}.`,
  'concat-needs-strings-hint': () =>
    'Para concatenar, ambos lados deben ser string. Convierta con `int()` o `float()`.',
  'operand-may-be-null': ({ operator, type }) =>
    `\`${operator}\` recibió un valor que puede ser nulo (${type}).`,
  'coalesce-type-mismatch': ({ value, fallback }) =>
    `coalesce() recibió ${value} y un predeterminado ${fallback}.`,
  'coalesce-type-mismatch-hint': () =>
    'El predeterminado debe ser del mismo tipo que el valor — es lo que lo sustituye cuando el valor es nulo.',

  // -- regex ----------------------------------------------------------------
  'regex-unexpected-character': ({ char }) => `Carácter inesperado en el patrón: ${char}.`,
  'regex-no-lazy-quantifier': () =>
    'Los cuantificadores perezosos (`*?`, `+?`, `??`) no existen en este dialecto.',
  'regex-no-lazy-quantifier-hint': () =>
    'Sin captura, el emparejamiento perezoso no cambia el resultado de `matches`. Quite el `?`.',
  'regex-nested-quantifier': () => 'Cuantificador aplicado a un cuantificador.',
  'regex-nested-quantifier-hint': () => 'Agrupe explícitamente: `(a+)+`.',
  'regex-inverted-repetition': ({ min, max }) =>
    `Repetición inválida: {${min},${max}} tiene un máximo menor que el mínimo.`,
  'regex-repetition-above-cap': ({ cap }) => `Repetición por encima del tope de ${String(cap)}.`,
  'regex-repetition-cap-hint': () =>
    'Sin tope, el patrón genera un autómata enorme y el coste solo se traslada de la búsqueda a la compilación.',
  'regex-unmatched-close-paren': () => '`)` sin `(` correspondiente.',
  'regex-unmatched-close-bracket': () => '`]` sin `[` correspondiente.',
  'regex-quantifier-nothing-to-repeat': ({ quantifier }) =>
    `Cuantificador \`${quantifier}\` sin nada que repetir.`,
  'regex-no-lookahead': () => 'Lookahead no existe en este dialecto.',
  'regex-no-lookahead-hint': () =>
    'Reescriba sin lookahead, o mueva la comprobación a una rama `condition` aparte.',
  'regex-no-lookbehind': () => 'Lookbehind y los grupos con nombre no existen en este dialecto.',
  'regex-unsupported-group': ({ marker }) => `La construcción \`(?${marker}\` no es compatible.`,
  'regex-missing-close-paren': () => 'Falta `)` para cerrar el grupo.',
  'regex-incomplete-escape': () => 'Escape incompleto al final del patrón.',
  'regex-no-backreference': () => 'Las referencias inversas no existen en este dialecto.',
  'regex-no-backreference-hint': () =>
    'Las referencias inversas son lo que vuelve exponencial el emparejamiento. `matches` no tiene captura.',
  'regex-incomplete-escape-in-class': () => 'Escape incompleto dentro de la clase de caracteres.',
  'regex-incomplete-escape-in-range': () => 'Escape incompleto en el rango.',
  'regex-incomplete-range': () => 'Rango incompleto en la clase de caracteres.',
  'regex-inverted-range': ({ low, high }) =>
    `Rango invertido en la clase de caracteres: \`${low}-${high}\`.`,
  'regex-missing-close-bracket': () => 'Falta `]` para cerrar la clase de caracteres.',
  'regex-empty-class': () => 'Clase de caracteres vacía.',

  // -- avaliação ------------------------------------------------------------
  'fuel-exhausted': ({ limit }) => `Se excedió el límite de ${String(limit)} pasos de evaluación.`,
  'fuel-exhausted-hint': () =>
    'La expresión es demasiado grande, o los datos de entrada son mayores de lo previsto.',
  'unknown-function-runtime': ({ name }) =>
    `Función desconocida en tiempo de ejecución: \`${name}\`.`,
  'runtime-comparison-mismatch': ({ operator, left, right }) =>
    `Comparación \`${operator}\` entre ${left} y ${right}.`,
  'division-by-zero': () => 'División por cero.',
  'remainder-by-zero': () => 'Resto de división por cero.',
  'guard-divisor-hint': () => 'Proteja el divisor en una rama anterior: `state.calls > 0`.',
  'runtime-arith-operands': ({ operator, left, right }) =>
    `\`${operator}\` espera number y recibió ${left} y ${right}.`,
  'arith-out-of-range': ({ operator }) =>
    `\`${operator}\` produjo un valor fuera del rango representable.`,
  'no-infinity-finite-hint': () =>
    'AGX-Expr no tiene Infinity: el resultado debe ser un número finito.',
  'fn-non-finite-result': ({ fn }) => `${fn} produjo un valor no finito.`,
  'no-nan-no-infinity': () => 'AGX-Expr no tiene NaN ni Infinity (ADR-0004).',
  'len-not-applicable': ({ kind }) => `len() no se aplica a ${kind}.`,
  'contains-needs-string': ({ kind }) =>
    `contains() sobre una string espera una string, y recibió ${kind}.`,
  'contains-not-applicable': ({ kind }) => `contains() no se aplica a ${kind}.`,
  'int-cannot-convert': ({ value }) => `int() no convierte ${value}.`,
  'float-cannot-convert': ({ value }) => `float() no convierte ${value}.`,
  'bool-string-domain': ({ value }) =>
    `bool() sobre una string acepta solo "true" o "false", y recibió ${value}.`,
  'bool-string-domain-hint': () => 'Compare explícitamente: `state.x == "sí"`.',
  'bool-not-applicable': ({ kind }) => `bool() no se aplica a ${kind}.`,
};
