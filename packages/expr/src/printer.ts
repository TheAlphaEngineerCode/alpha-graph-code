import { formatPath, type ExprNode } from './ast.js';

/**
 * Reimprime uma AST em forma canônica.
 *
 * A propriedade que importa é `parse(print(ast))` devolver a **mesma** AST — critério de
 * aceite da Fase 1. Por isso os parênteses do autor viram nós `group` na AST e são
 * reimpressos: reconstruí-los por precedência produziria uma árvore equivalente, mas não
 * idêntica, e o round-trip deixaria de ser verificável por igualdade estrutural.
 */
export function print(node: ExprNode): string {
  switch (node.kind) {
    case 'literal':
      return printLiteral(node.value);

    case 'path':
      return formatPath(node);

    case 'call':
      return `${node.name}(${node.args.map(print).join(', ')})`;

    case 'unary':
      return `${node.operator}${print(node.operand)}`;

    case 'binary':
      return `${print(node.left)} ${node.operator} ${print(node.right)}`;

    case 'group':
      return `(${print(node.inner)})`;
  }
}

function printLiteral(value: string | number | boolean | null): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return printNumber(value);
  return printString(value);
}

/**
 * Menor representação decimal que faz round-trip exato, alinhada à serialização canônica
 * da IR (`specs/ir-v1.md` §9). `String(n)` em JavaScript já dá essa garantia.
 */
function printNumber(value: number): string {
  return String(value);
}

/** Aspas duplas sempre, com escape mínimo — a mesma string reparseia no mesmo valor. */
function printString(value: string): string {
  let out = '"';
  for (const c of value) {
    switch (c) {
      case '"':
        out += '\\"';
        break;
      case '\\':
        out += '\\\\';
        break;
      case '\n':
        out += '\\n';
        break;
      case '\r':
        out += '\\r';
        break;
      case '\t':
        out += '\\t';
        break;
      default:
        out += c;
    }
  }
  return `${out}"`;
}
