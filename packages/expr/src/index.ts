/**
 * AGX-Expr — a linguagem de condição da Alpha Graph IR.
 *
 * Total, pura, sem acesso a host e sem I/O, com limite de fuel e verificada por tipos
 * contra o schema de canais. Interpretada por código deste pacote: `eval`, `new Function`
 * e `vm` são proibidos no repositório e barrados por lint (invariante 3).
 *
 * A especificação normativa é `specs/agx-expr.md`. Se este código divergir dela, é este
 * código que está errado.
 */
import type { Result } from './diagnostics.js';
import { parse } from './parser.js';
import type { ChannelSchema } from './types.js';
import { typecheck, type TypecheckOptions, type TypedExpression } from './typecheck.js';

export { formatPath, walk } from './ast.js';
export type {
  BinaryNode,
  BinaryOperator,
  CallNode,
  ExprNode,
  GroupNode,
  LiteralNode,
  PathNode,
  PathRoot,
  PathStep,
  UnaryNode,
  UnaryOperator,
} from './ast.js';

export {
  DIAGNOSTIC_CODES,
  formatDiagnostic,
  type Diagnostic,
  type DiagnosticCode,
  type Result,
  type Span,
} from './diagnostics.js';

export {
  DEFAULT_FUEL,
  evaluate,
  type EvaluationContext,
  type EvaluationError,
  type EvalResult,
} from './interpreter.js';
export { tokenize, type Token, type TokenKind } from './lexer.js';
export { parse, parseErrors } from './parser.js';
export { print } from './printer.js';
export { compilePattern, testPattern, type CompiledPattern } from './regex.js';
export { STDLIB_NAMES } from './stdlib.js';
export { typecheck, type TypecheckOptions, type TypedExpression } from './typecheck.js';
export {
  BASE_TYPES,
  channelType,
  formatType,
  type BaseType,
  type ChannelDecl,
  type ChannelSchema,
  type ExprType,
} from './types.js';
export { kindOf, valuesEqual, type ExprValue, type ValueKind } from './value.js';

/**
 * Analisa e verifica numa passada — o que `graph-core` chama ao validar uma aresta.
 *
 * O resultado carrega os padrões de `matches` já compilados, então o interpretador nunca
 * compila regex em tempo de execução (ADR-0003).
 */
export function compile(
  source: string,
  schema: ChannelSchema,
  options: TypecheckOptions = {},
): Result<TypedExpression> {
  const ast = parse(source);
  if (!ast.ok) return ast;
  return typecheck(ast.value, schema, options);
}
