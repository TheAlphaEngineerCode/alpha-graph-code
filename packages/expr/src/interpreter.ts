/**
 * Interpretador de AGX-Expr.
 *
 * Nunca lança e nunca produz valor não finito. Toda falha vira `EvaluationError`, com
 * `code` — uma exceção atravessando daqui seria a única falha do sistema sem `kind`, e
 * escaparia do canal `errors` e do trace (specs/agx-expr.md §5.5).
 *
 * O limite de fuel é o que torna a totalidade verificável em vez de argumentada: mesmo
 * que a linguagem não tenha loop, uma expressão enorme ainda consome tempo, e o teto é
 * o que transforma isso em erro em vez de espera.
 */
import { formatPath, type CallNode, type ExprNode, type PathNode } from './ast.js';
import type { DiagnosticCode, Span } from './diagnostics.js';
import { testPattern, type CompiledPattern } from './regex.js';
import { STDLIB, type CallContext } from './stdlib.js';
import { isArray, isObject, kindOf, valuesEqual, type ExprValue } from './value.js';

export interface EvaluationError {
  readonly code: Extract<DiagnosticCode, 'AGX-R310' | 'AGX-R311'>;
  readonly message: string;
  readonly span: Span;
  readonly suggestion?: string;
}

export type EvalResult =
  | { readonly ok: true; readonly value: ExprValue; readonly fuelUsed: number }
  | { readonly ok: false; readonly error: EvaluationError };

export interface EvaluationContext {
  /** Canais do grafo. Caminho ausente resolve para `null`, e `has()` pergunta isso. */
  readonly state: Readonly<Record<string, ExprValue>>;
  /** Entradas mapeadas do nó corrente. */
  readonly inputs?: Readonly<Record<string, ExprValue>>;
  readonly run?: { readonly id?: string; readonly step?: number; readonly attempt?: number };
  /** Clock injetado. Nunca `Date.now()`: replay não reproduziria o mesmo trace. */
  readonly nowMs?: number;
  /** Padrões compilados pelo typechecker, indexados pelo texto do padrão. */
  readonly patterns?: ReadonlyMap<string, CompiledPattern>;
  /** Teto de fuel. O default cobre folgado qualquer condição de aresta realista. */
  readonly fuelLimit?: number;
}

const DEFAULT_FUEL = 10_000;

/** Sinaliza esgotamento de fuel por dentro da recursão, sem lançar para fora. */
class Interpreter {
  private fuel: number;
  private failure: EvaluationError | undefined;
  private readonly ctx: EvaluationContext;
  private readonly limit: number;

  constructor(ctx: EvaluationContext, limit: number) {
    this.ctx = ctx;
    this.limit = limit;
    this.fuel = limit;
  }

  get used(): number {
    return this.limit - this.fuel;
  }

  get error(): EvaluationError | undefined {
    return this.failure;
  }

  /**
   * Se já houve falha.
   *
   * É método, e não leitura direta do campo, porque `this.failure` é mutado dentro de
   * `evaluate()` e o TypeScript não modela isso: depois de um `if (this.hasFailed())`
   * ele estreita o campo para `undefined` e passa a considerar **morta** toda checagem
   * seguinte no mesmo escopo — mesmo com uma chamada recursiva no meio, que é justamente
   * onde a falha aparece. O risco não é o aviso: é alguém apagar a checagem confiando
   * nele e a propagação de erro parar de funcionar em silêncio.
   */
  private hasFailed(): boolean {
    return this.failure !== undefined;
  }

  private fail(
    code: EvaluationError['code'],
    message: string,
    span: Span,
    suggestion?: string,
  ): ExprValue {
    // O primeiro erro vence. Sobrescrever faria a mensagem final apontar para uma falha
    // derivada, e quem lê o trace procuraria no lugar errado.
    this.failure ??=
      suggestion === undefined ? { code, message, span } : { code, message, span, suggestion };
    return null;
  }

  private burn(amount: number, span: Span): boolean {
    this.fuel -= amount;
    if (this.fuel < 0) {
      this.fail(
        'AGX-R310',
        `Limite de ${String(this.limit)} passos de avaliação excedido.`,
        span,
        'A expressão é grande demais, ou o dado de entrada é maior que o previsto.',
      );
      return false;
    }
    return true;
  }

  evaluate(node: ExprNode): ExprValue {
    if (this.hasFailed()) return null;
    if (!this.burn(1, node.span)) return null;

    switch (node.kind) {
      case 'literal':
        return node.value;
      case 'group':
        return this.evaluate(node.inner);
      case 'path':
        return this.evaluatePath(node);
      case 'call':
        return this.evaluateCall(node);
      case 'unary':
        return this.evaluateUnary(node);
      case 'binary':
        return this.evaluateBinary(node);
    }
  }

  // -- caminhos ------------------------------------------------------------

  private evaluatePath(node: PathNode): ExprValue {
    let current: ExprValue = this.rootValue(node);

    for (const step of node.steps.slice(node.root === 'state' || node.root === 'run' ? 1 : 0)) {
      if (current === null) return null;

      if (step.kind === 'field') {
        current = isObject(current) ? (current[step.name] ?? null) : null;
        continue;
      }
      // Índice fora da faixa resolve para `null`, e não para erro: um grafo que lê
      // `documents[0]` antes de ter documento é caso normal, e `has()` é a pergunta.
      current = isArray(current) ? (current[step.index] ?? null) : null;
    }
    return current;
  }

  private rootValue(node: PathNode): ExprValue {
    const first = node.steps[0];

    switch (node.root) {
      case 'state':
        if (first?.kind !== 'field') return null;
        return this.ctx.state[first.name] ?? null;

      case 'run': {
        if (first?.kind !== 'field') return null;
        const run = this.ctx.run ?? {};
        switch (first.name) {
          case 'id':
            return run.id ?? '';
          case 'step':
            return run.step ?? 0;
          case 'attempt':
            return run.attempt ?? 0;
          default:
            return null;
        }
      }

      case 'in': {
        const inputs = this.ctx.inputs ?? {};
        const path = formatPath(node).slice('in.'.length);
        // A entrada pode vir achatada por caminho completo ou aninhada. Tentar a chave
        // completa primeiro faz o caso comum custar uma consulta.
        const direct = inputs[path];
        return direct ?? inputs[first?.kind === 'field' ? first.name : ''] ?? null;
      }
    }
  }

  // -- chamadas ------------------------------------------------------------

  private evaluateCall(node: CallNode): ExprValue {
    const spec = STDLIB[node.name];
    if (spec === undefined) {
      // Inalcançável depois do typecheck. Devolver erro em vez de lançar mantém a
      // promessa de que este módulo não tem caminho de exceção.
      return this.fail('AGX-R311', `Função desconhecida em runtime: \`${node.name}\`.`, node.span);
    }

    const args = node.args.map((argNode) => this.evaluate(argNode));
    if (this.hasFailed()) return null;

    if (!this.burn(spec.fuelCost(args), node.span)) return null;

    const result = spec.call(args, this.callContext());
    if (result.ok) return result.value;
    return this.fail('AGX-R311', result.failure.message, node.span, result.failure.suggestion);
  }

  private callContext(): CallContext {
    return {
      nowMs: this.ctx.nowMs ?? 0,
      testPattern: (pattern, input) => {
        const compiled = this.ctx.patterns?.get(pattern);
        // Sem o padrão compilado, `matches` devolve `false` em vez de compilar na hora.
        // Compilar aqui reabriria o caminho de dado até autômato que ADR-0003 fechou.
        return compiled === undefined ? false : testPattern(compiled, input);
      },
    };
  }

  // -- operadores ----------------------------------------------------------

  private evaluateUnary(node: { operator: '!' | '-'; operand: ExprNode; span: Span }): ExprValue {
    const value = this.evaluate(node.operand);
    if (this.hasFailed()) return null;

    if (node.operator === '!') return typeof value === 'boolean' ? !value : false;

    if (typeof value !== 'number') {
      return this.fail('AGX-R311', `\`-\` espera number e recebeu ${kindOf(value)}.`, node.span);
    }
    return -value;
  }

  private evaluateBinary(node: {
    operator: string;
    left: ExprNode;
    right: ExprNode;
    operatorSpan: Span;
    span: Span;
  }): ExprValue {
    // Curto-circuito é semântico, não otimização: `has(state.x) && state.x > 5` depende
    // de o lado direito não ser avaliado quando o esquerdo é falso.
    if (node.operator === '&&' || node.operator === '||') {
      const left = this.evaluate(node.left);
      if (this.hasFailed()) return null;

      const leftBool = left === true;
      if (node.operator === '&&' && !leftBool) return false;
      if (node.operator === '||' && leftBool) return true;

      const right = this.evaluate(node.right);
      return this.hasFailed() ? null : right === true;
    }

    const left = this.evaluate(node.left);
    const right = this.evaluate(node.right);
    if (this.hasFailed()) return null;

    switch (node.operator) {
      case '==':
        return valuesEqual(left, right);
      case '!=':
        return !valuesEqual(left, right);
      case '<':
      case '<=':
      case '>':
      case '>=':
        return this.compare(node.operator, left, right, node.operatorSpan);
      case 'in':
        return this.member(left, right);
      default:
        return this.arithmetic(node.operator, left, right, node.operatorSpan);
    }
  }

  private compare(operator: string, left: ExprValue, right: ExprValue, span: Span): ExprValue {
    const comparable =
      (typeof left === 'number' && typeof right === 'number') ||
      (typeof left === 'string' && typeof right === 'string');

    if (!comparable) {
      return this.fail(
        'AGX-R311',
        `Comparação \`${operator}\` entre ${kindOf(left)} e ${kindOf(right)}.`,
        span,
      );
    }

    switch (operator) {
      case '<':
        return left < right;
      case '<=':
        return left <= right;
      case '>':
        return left > right;
      default:
        return left >= right;
    }
  }

  private member(left: ExprValue, right: ExprValue): ExprValue {
    if (isArray(right)) return right.some((item) => valuesEqual(item, left));
    if (isObject(right) && typeof left === 'string') {
      return Object.prototype.hasOwnProperty.call(right, left);
    }
    return false;
  }

  private arithmetic(operator: string, left: ExprValue, right: ExprValue, span: Span): ExprValue {
    if (operator === '+' && typeof left === 'string' && typeof right === 'string') {
      return left + right;
    }

    if (typeof left !== 'number' || typeof right !== 'number') {
      return this.fail(
        'AGX-R311',
        `\`${operator}\` espera number e recebeu ${kindOf(left)} e ${kindOf(right)}.`,
        span,
      );
    }

    if ((operator === '/' || operator === '%') && right === 0) {
      return this.fail(
        'AGX-R311',
        operator === '/' ? 'Divisão por zero.' : 'Resto de divisão por zero.',
        span,
        'Garanta o divisor numa branch anterior: `state.calls > 0`.',
      );
    }

    const result = applyArithmetic(operator, left, right);
    // Overflow vira erro, e não `Infinity`. `Infinity` se propagaria calado até virar
    // rota: `state.cost / state.calls >= 0.5` daria `true` sem ninguém ver (ADR-0004).
    if (!Number.isFinite(result)) {
      return this.fail(
        'AGX-R311',
        `\`${operator}\` produziu um valor fora da faixa representável.`,
        span,
        'AGX-Expr não tem Infinity: o resultado precisa ser um número finito.',
      );
    }
    return result;
  }
}

function applyArithmetic(operator: string, left: number, right: number): number {
  switch (operator) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      return left / right;
    default:
      return left % right;
  }
}

/**
 * Avalia uma expressão já verificada. **Nunca lança.**
 *
 * `typecheck` deveria ter eliminado os erros de tipo, mas o interpretador não confia
 * nisso: um chamador pode montar a AST à mão, e a promessa de não lançar vale para
 * qualquer entrada.
 */
export function evaluate(ast: ExprNode, ctx: EvaluationContext): EvalResult {
  const interpreter = new Interpreter(ctx, ctx.fuelLimit ?? DEFAULT_FUEL);
  const value = interpreter.evaluate(ast);

  const error = interpreter.error;
  if (error !== undefined) return { ok: false, error };
  return { ok: true, value, fuelUsed: interpreter.used };
}

export { DEFAULT_FUEL };
