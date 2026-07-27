/**
 * Valores de runtime de AGX-Expr.
 *
 * O conjunto é o de JSON — é o que a IR serializa e o que um canal pode conter. Não há
 * função, símbolo, data nem referência: um valor que não sobrevive à serialização
 * canônica não pode circular numa linguagem cujo replay precisa ser byte a byte.
 */

export type ExprValue =
  null | boolean | number | string | readonly ExprValue[] | { readonly [key: string]: ExprValue };

export type ValueKind = 'null' | 'bool' | 'number' | 'string' | 'array' | 'object';

export function kindOf(value: ExprValue): ValueKind {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'boolean':
      return 'bool';
    case 'number':
      return 'number';
    case 'string':
      return 'string';
    default:
      return 'object';
  }
}

export function isObject(value: ExprValue): value is Readonly<Record<string, ExprValue>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isArray(value: ExprValue): value is readonly ExprValue[] {
  return Array.isArray(value);
}

/**
 * Igualdade **estrutural**, nunca por referência (ADR-0005 §2).
 *
 * Referência não significa nada num valor que veio de JSON: dois objetos idênticos
 * carregados de dois canais seriam "diferentes" só por terem sido desserializados
 * separadamente, e a branch erraria por um motivo que ninguém consegue ver no grafo.
 */
export function valuesEqual(a: ExprValue, b: ExprValue): boolean {
  if (a === b) return true;

  const kind = kindOf(a);
  if (kind !== kindOf(b)) return false;

  if (kind === 'array') {
    const left = a as readonly ExprValue[];
    const right = b as readonly ExprValue[];
    if (left.length !== right.length) return false;
    return left.every((item, i) => valuesEqual(item, right[i] ?? null));
  }

  if (kind === 'object') {
    const left = a as Record<string, ExprValue>;
    const right = b as Record<string, ExprValue>;
    const leftKeys = Object.keys(left);
    if (leftKeys.length !== Object.keys(right).length) return false;
    // A ordem das chaves não participa: dois objetos com as mesmas chaves em ordem
    // diferente representam o mesmo valor, e a serialização canônica os igualaria.
    return leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        valuesEqual(left[key] ?? null, right[key] ?? null),
    );
  }

  return false;
}

/** Texto curto de um valor, para mensagem de erro. Trunca — erro não é dump. */
export function formatValue(value: ExprValue, maxLength = 60): string {
  const text = JSON.stringify(value);
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}
