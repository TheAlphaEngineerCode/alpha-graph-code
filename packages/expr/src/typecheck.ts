/**
 * Type-check de AGX-Expr contra o schema de canais.
 *
 * É aqui que mora o valor prático da linguagem: `state.confidenc < 0.8` falha **ao salvar
 * o grafo**, com sugestão do nome certo. Numa linguagem dinâmica isso viraria
 * `undefined < 0.8 === false` — um branch errado, silencioso, em produção.
 *
 * O typechecker também compila os padrões de `matches`, porque o padrão é literal
 * obrigatório (ADR-0003): regex inválida é erro de validação, não surpresa de runtime.
 */
import { formatPath, type CallNode, type ExprNode, type PathNode } from './ast.js';
import {
  closestName,
  diagnostic,
  err,
  msg,
  msg0,
  ok,
  type MessageRef,
  type Diagnostic,
  type Result,
  type Span,
} from './diagnostics.js';
import { compilePattern, type CompiledPattern } from './regex.js';
import { STDLIB, STDLIB_NAMES, type ParamSpec } from './stdlib.js';
import {
  BOOL,
  NUMBER,
  NULL_TYPE,
  RUN_FIELDS,
  STRING,
  channelType,
  formatType,
  isNullType,
  isOrderable,
  nonNull,
  nullable,
  sameBase,
  type ChannelSchema,
  type ExprType,
} from './types.js';

export interface TypedExpression {
  readonly ast: ExprNode;
  readonly type: ExprType;
  /** Padrões de `matches` já compilados, indexados pelo texto do padrão. */
  readonly patterns: ReadonlyMap<string, CompiledPattern>;
}

/**
 * Tipos das entradas mapeadas do nó (`in.*`), quando conhecidos.
 *
 * Quando um caminho de `in` não está declarado, o typechecker o trata como
 * desconhecido em vez de erro: o binding de entrada é resolvido por `graph-core`, e este
 * pacote não conhece a IR. Emitir erro aqui seria opinar sobre o que não se enxerga.
 */
export interface TypecheckOptions {
  readonly inputs?: Readonly<Record<string, ExprType>>;
}

class Typechecker {
  private readonly diagnostics: Diagnostic[] = [];
  private readonly patterns = new Map<string, CompiledPattern>();
  private readonly schema: ChannelSchema;
  private readonly options: TypecheckOptions;

  constructor(schema: ChannelSchema, options: TypecheckOptions) {
    this.schema = schema;
    this.options = options;
  }

  check(node: ExprNode): Result<TypedExpression> {
    const type = this.typeOf(node);
    if (this.diagnostics.length > 0) return err(...this.diagnostics);
    return ok({ ast: node, type, patterns: this.patterns });
  }

  private report(
    code: Parameters<typeof diagnostic>[0],
    message: MessageRef,
    span: Span,
    suggestion?: MessageRef,
  ): ExprType {
    this.diagnostics.push(diagnostic(code, message, span, suggestion));
    // Depois de um erro o tipo vira `UNKNOWN`, e não `null`: `UNKNOWN` suprime as
    // checagens acima na árvore. Com `NULL_TYPE`, um canal inexistente geraria também
    // um `AGX-E322` em cada operador que o contém, e o defeito real — o nome errado —
    // sumiria no meio de erros derivados que ninguém pode corrigir diretamente.
    return UNKNOWN;
  }

  private typeOf(node: ExprNode): ExprType {
    switch (node.kind) {
      case 'literal':
        return literalType(node.value);
      case 'group':
        return this.typeOf(node.inner);
      case 'path':
        return this.typeOfPath(node);
      case 'call':
        return this.typeOfCall(node);
      case 'unary':
        return this.typeOfUnary(node);
      case 'binary':
        return this.typeOfBinary(node);
    }
  }

  // -- caminhos ------------------------------------------------------------

  private typeOfPath(node: PathNode): ExprType {
    switch (node.root) {
      case 'state':
        return this.typeOfStatePath(node);
      case 'run':
        return this.typeOfRunPath(node);
      case 'in':
        return this.typeOfInputPath(node);
    }
  }

  private typeOfStatePath(node: PathNode): ExprType {
    const first = node.steps[0];
    if (first === undefined) {
      return this.report('AGX-E310', msg0('state-alone'), node.span, msg0('state-alone-hint'));
    }
    if (first.kind !== 'field') {
      return this.report('AGX-E310', msg0('channels-are-named'), first.span);
    }

    const decl = this.schema.channels[first.name];
    if (decl === undefined) {
      const names = Object.keys(this.schema.channels);
      const closest = closestName(first.name, names);
      return this.report(
        'AGX-E310',
        msg('unknown-channel', { name: first.name }),
        first.span,
        closest === undefined
          ? names.length > 0
            ? msg('declared-channels', { names: names.join(', ') })
            : msg0('no-channels-declared')
          : msg('did-you-mean-channel', { name: closest }),
      );
    }

    const base = channelType(decl);
    // Descer em array ou object leva a valor cujo tipo o schema de canais não descreve:
    // `documents[0].title` pode ser qualquer coisa. Tratar como desconhecido é honesto;
    // inventar `string` faria o typechecker aprovar comparações que não pode garantir.
    return node.steps.length > 1 ? unknownType() : base;
  }

  private typeOfRunPath(node: PathNode): ExprType {
    const first = node.steps[0];
    if (first?.kind !== 'field') {
      return this.report(
        'AGX-E310',
        msg0('run-exposes-fields'),
        node.span,
        msg('run-fields', { names: Object.keys(RUN_FIELDS).join(', ') }),
      );
    }

    const type = RUN_FIELDS[first.name];
    if (type === undefined) {
      const closest = closestName(first.name, Object.keys(RUN_FIELDS));
      return this.report(
        'AGX-E310',
        msg('unknown-run-field', { name: first.name }),
        first.span,
        closest === undefined
          ? msg('run-fields', { names: Object.keys(RUN_FIELDS).join(', ') })
          : msg('did-you-mean-run-field', { name: closest }),
      );
    }
    return node.steps.length > 1 ? unknownType() : type;
  }

  private typeOfInputPath(node: PathNode): ExprType {
    const declared = this.options.inputs;
    if (declared === undefined) return unknownType();

    const path = formatPath(node).slice('in.'.length);
    const type = declared[path];
    if (type !== undefined) return type;

    const names = Object.keys(declared);
    const closest = closestName(path, names);
    return this.report(
      'AGX-E310',
      msg('unknown-input', { path }),
      node.span,
      closest === undefined
        ? names.length > 0
          ? msg('mapped-inputs', { names: names.join(', ') })
          : msg0('no-inputs-mapped')
        : msg('did-you-mean-input', { name: closest }),
    );
  }

  // -- chamadas ------------------------------------------------------------

  private typeOfCall(node: CallNode): ExprType {
    const spec = STDLIB[node.name];
    if (spec === undefined) {
      const closest = closestName(node.name, STDLIB_NAMES);
      return this.report(
        'AGX-E311',
        msg('unknown-function', { name: node.name }),
        node.nameSpan,
        closest === undefined
          ? msg('stdlib-is-closed', { names: STDLIB_NAMES.join(', ') })
          : msg('did-you-mean-function', { name: closest }),
      );
    }

    if (node.args.length !== spec.params.length) {
      return this.report(
        'AGX-E312',
        msg('wrong-arity', {
          name: node.name,
          expected: spec.params.length,
          received: node.args.length,
        }),
        node.span,
      );
    }

    const argTypes = node.args.map((argNode, i) => {
      const param = spec.params[i];
      const argType = this.typeOf(argNode);
      if (param !== undefined) this.checkArgument(node.name, i, param, argType, argNode);
      return argType;
    });

    // Restrição entre argumentos, que a checagem posição a posição não alcança.
    const violation = spec.relate?.(argTypes);
    if (violation !== undefined) {
      return this.report('AGX-E320', violation.message, node.span, violation.suggestion);
    }

    return typeof spec.returns === 'function' ? spec.returns(argTypes) : spec.returns;
  }

  private checkArgument(
    functionName: string,
    index: number,
    param: ParamSpec,
    argType: ExprType,
    argNode: ExprNode,
  ): void {
    const position = index + 1;

    if (param.literalOnly === true) {
      // `matches(s, state.pattern)` é recusado aqui, e não no interpretador: com padrão
      // literal a regex é compilada e validada agora, ao salvar o grafo (ADR-0003).
      if (argNode.kind !== 'literal' || typeof argNode.value !== 'string') {
        this.report(
          'AGX-E330',
          msg('arg-must-be-literal', { index: position, fn: functionName }),
          argNode.span,
          msg0('pattern-must-be-literal-hint'),
        );
        return;
      }
      const compiled = compilePattern(argNode.value, argNode.span);
      if (!compiled.ok) {
        this.diagnostics.push(...compiled.diagnostics);
        return;
      }
      this.patterns.set(argNode.value, compiled.value);
      return;
    }

    if (param.nullability === 'reject' && (argType.nullable || isNullType(argType))) {
      this.report(
        'AGX-E322',
        msg('arg-may-be-null', {
          index: position,
          fn: functionName,
          type: formatType(argType),
        }),
        argNode.span,
        msg0('use-coalesce-hint'),
      );
      return;
    }

    if (param.accepts.length === 0 || isUnknown(argType)) return;

    if (!param.accepts.includes(argType.base as never)) {
      this.report(
        'AGX-E320',
        msg('arg-type-mismatch', {
          index: position,
          fn: functionName,
          type: formatType(argType),
          accepts: param.accepts.join(' or '),
        }),
        argNode.span,
      );
    }
  }

  // -- operadores ----------------------------------------------------------

  private typeOfUnary(node: { operator: '!' | '-'; operand: ExprNode; span: Span }): ExprType {
    const operand = this.typeOf(node.operand);
    if (isUnknown(operand)) return node.operator === '!' ? BOOL : NUMBER;

    if (this.rejectNullable(operand, node.operand.span, `\`${node.operator}\``)) {
      return node.operator === '!' ? BOOL : NUMBER;
    }

    const expected = node.operator === '!' ? 'bool' : 'number';
    if (operand.base !== expected) {
      this.report(
        'AGX-E320',
        msg('unary-operand-type', {
          operator: node.operator,
          expected,
          received: formatType(operand),
        }),
        node.span,
      );
    }
    return node.operator === '!' ? BOOL : NUMBER;
  }

  private typeOfBinary(node: {
    operator: string;
    left: ExprNode;
    right: ExprNode;
    operatorSpan: Span;
    span: Span;
  }): ExprType {
    const left = this.typeOf(node.left);
    const right = this.typeOf(node.right);

    switch (node.operator) {
      case '&&':
      case '||':
        this.expectBool(left, node.left.span, node.operator);
        this.expectBool(right, node.right.span, node.operator);
        return BOOL;

      case '==':
      case '!=':
        this.checkEquality(left, right, node);
        return BOOL;

      case '<':
      case '<=':
      case '>':
      case '>=':
        this.checkOrdering(left, right, node);
        return BOOL;

      case 'in':
        this.checkMembership(left, right, node);
        return BOOL;

      default:
        return this.checkArithmetic(left, right, node);
    }
  }

  private expectBool(type: ExprType, span: Span, operator: string): void {
    if (isUnknown(type)) return;
    if (this.rejectNullable(type, span, `\`${operator}\``)) return;
    if (type.base !== 'bool') {
      this.report(
        'AGX-E320',
        msg('logical-operand-not-bool', { operator, received: formatType(type) }),
        span,
        msg0('no-boolean-coercion-hint'),
      );
    }
  }

  private checkEquality(
    left: ExprType,
    right: ExprType,
    node: { operator: string; operatorSpan: Span },
  ): void {
    if (isUnknown(left) || isUnknown(right)) return;
    // Comparar com `null` é sempre válido: é a pergunta "isto foi preenchido?", e é a
    // que mais aparece em grafo real (ADR-0005 §1).
    if (isNullType(left) || isNullType(right)) return;

    if (!sameBase(left, right)) {
      this.report(
        'AGX-E321',
        msg('equality-type-mismatch', {
          operator: node.operator,
          left: formatType(left),
          right: formatType(right),
        }),
        node.operatorSpan,
        msg0('no-type-conversion-hint'),
      );
    }
  }

  private checkOrdering(
    left: ExprType,
    right: ExprType,
    node: { operator: string; operatorSpan: Span; left: ExprNode; right: ExprNode },
  ): void {
    if (isUnknown(left) || isUnknown(right)) return;

    // Nulidade primeiro: `null < 5` não tem resposta certa, e as três possíveis levam a
    // grafos que roteiam errado sem avisar.
    if (this.rejectNullable(left, node.left.span, `\`${node.operator}\``)) return;
    if (this.rejectNullable(right, node.right.span, `\`${node.operator}\``)) return;

    for (const [type, span] of [
      [left, node.left.span],
      [right, node.right.span],
    ] as const) {
      if (!isOrderable(type)) {
        this.report(
          'AGX-E321',
          msg('not-orderable', { operator: node.operator, type: formatType(type) }),
          span,
          msg0('only-number-string-orderable-hint'),
        );
        return;
      }
    }

    if (!sameBase(left, right)) {
      this.report(
        'AGX-E321',
        msg('ordering-type-mismatch', {
          operator: node.operator,
          left: formatType(left),
          right: formatType(right),
        }),
        node.operatorSpan,
        msg0('order-same-type-hint'),
      );
    }
  }

  private checkMembership(
    left: ExprType,
    right: ExprType,
    node: { operatorSpan: Span; right: ExprNode },
  ): void {
    if (isUnknown(right)) return;

    if (right.base === 'string') {
      // `in` é pertencimento e nunca substring: um operador cujo sentido muda com o tipo
      // do operando muda de sentido quando alguém edita o tipo de um canal (ADR-0005 §4).
      //
      // Esta checagem vem **antes** da nulidade de propósito. Um `string | null` à
      // direita dispararia `AGX-E322` primeiro, mandando a pessoa embrulhar em
      // `coalesce` — e aí ela receberia este mesmo erro na volta. Duas idas para um
      // engano só, e a primeira aponta para o lugar errado.
      this.report(
        'AGX-E321',
        msg0('in-not-substring'),
        node.operatorSpan,
        msg0('use-contains-hint'),
      );
      return;
    }

    if (this.rejectNullable(right, node.right.span, '`in`')) return;

    if (right.base !== 'array' && right.base !== 'object') {
      this.report(
        'AGX-E321',
        msg('in-needs-collection', { type: formatType(right) }),
        node.operatorSpan,
      );
      return;
    }

    if (right.base === 'object' && !isUnknown(left) && left.base !== 'string') {
      this.report(
        'AGX-E321',
        msg('object-key-must-be-string', { type: formatType(left) }),
        node.operatorSpan,
      );
    }
  }

  private checkArithmetic(
    left: ExprType,
    right: ExprType,
    node: { operator: string; operatorSpan: Span; left: ExprNode; right: ExprNode },
  ): ExprType {
    if (this.rejectNullable(left, node.left.span, `\`${node.operator}\``)) return NUMBER;
    if (this.rejectNullable(right, node.right.span, `\`${node.operator}\``)) return NUMBER;

    // `+` sobre duas strings concatena. É a única sobrecarga aritmética, e existe porque
    // montar uma chave a partir do estado é caso comum. String com número é erro: essa é
    // a coerção que produz `"1" + 1 === "11"` e nunca é o que quem escreveu quis.
    const bothStrings = left.base === 'string' && right.base === 'string';
    if (node.operator === '+' && bothStrings) return STRING;

    for (const [type, span] of [
      [left, node.left.span],
      [right, node.right.span],
    ] as const) {
      if (isUnknown(type)) continue;
      if (type.base !== 'number') {
        this.report(
          'AGX-E320',
          msg('arith-operand-not-number', {
            operator: node.operator,
            received: formatType(type),
          }),
          span,
          node.operator === '+' ? msg0('concat-needs-strings-hint') : undefined,
        );
        return NUMBER;
      }
    }
    return NUMBER;
  }

  /** Reporta `AGX-E322` e devolve `true` quando o tipo pode ser nulo. */
  private rejectNullable(type: ExprType, span: Span, what: string): boolean {
    if (isUnknown(type)) return false;
    if (!type.nullable && !isNullType(type)) return false;

    this.report(
      'AGX-E322',
      msg('operand-may-be-null', { operator: what, type: formatType(type) }),
      span,
      msg0('use-coalesce-hint'),
    );
    return true;
  }
}

/**
 * Tipo desconhecido: o valor existe, mas o schema de canais não descreve sua forma.
 *
 * Acontece ao descer em array ou object (`state.documents[0].title`). Marcado por
 * `base: 'null'` com `nullable: false`, combinação que nenhum tipo real produz —
 * `NULL_TYPE` é sempre nullable.
 */
const UNKNOWN: ExprType = { base: 'null', nullable: false };

function unknownType(): ExprType {
  return UNKNOWN;
}

function isUnknown(type: ExprType): boolean {
  return type === UNKNOWN;
}

function literalType(value: string | number | boolean | null): ExprType {
  if (value === null) return NULL_TYPE;
  switch (typeof value) {
    case 'string':
      return STRING;
    case 'number':
      return NUMBER;
    default:
      return BOOL;
  }
}

/** Verifica uma AST contra o schema de canais. Nunca lança. */
export function typecheck(
  ast: ExprNode,
  schema: ChannelSchema,
  options: TypecheckOptions = {},
): Result<TypedExpression> {
  return new Typechecker(schema, options).check(ast);
}

export { nonNull, nullable };
