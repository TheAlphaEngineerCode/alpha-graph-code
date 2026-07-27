import type {
  BinaryNode,
  BinaryOperator,
  ExprNode,
  PathRoot,
  PathStep,
  UnaryOperator,
} from './ast.js';
import { diagnostic, err, ok, type Diagnostic, type Result, type Span } from './diagnostics.js';
import { tokenize, type Token, type TokenKind } from './lexer.js';

const PATH_ROOTS: readonly string[] = ['state', 'in', 'run'];

/**
 * Profundidade máxima de aninhamento.
 *
 * A descida recursiva gasta ~7 quadros de pilha por nível de parêntese, então uma
 * entrada com milhares de `(` derruba o processo com `RangeError` — e `RangeError` não
 * é um `Result`: ele escapa da promessa de que analisar uma expressão **nunca lança**.
 *
 * Isso importa mais aqui do que num parser comum. O arquivo de grafo é entrada não
 * confiável por design, e `agx validate` promete não executar nada: derrubar o processo
 * de quem abriu um `.agx.yaml` de terceiro seria o mesmo tipo de falha que o motor de
 * regex sem backtracking existe para evitar (ADR-0003).
 *
 * 128 é folgado por três ordens de grandeza para uma condição de aresta real, e continua
 * duas ordens abaixo do limite de pilha.
 */
const MAX_DEPTH = 128;

/**
 * Descida recursiva seguindo a gramática de `specs/agx-expr.md` §2, um nível por
 * precedência.
 *
 * O detalhe que a gramática impõe e que vale dizer em voz alta: `cmp` **não** encadeia.
 * `a < b < c` é erro de sintaxe, e não `(a < b) < c` — que em linguagem com coerção
 * compara um booleano com um número e devolve algo sem sentido, calado.
 */
class Parser {
  private index = 0;
  private depth = 0;
  private readonly tokens: readonly Token[];

  constructor(tokens: readonly Token[]) {
    this.tokens = tokens;
  }

  /**
   * Entra em mais um nível de aninhamento, ou recusa.
   *
   * Guardado nos dois pontos onde a descida recursiva reentra: `parseOr` (todo grupo,
   * todo argumento de chamada) e `parseUnary` (`!!!!x`). Fora deles, a recursão é
   * limitada pela própria gramática.
   */
  private enter(span: Span): Diagnostic | undefined {
    this.depth += 1;
    if (this.depth <= MAX_DEPTH) return undefined;
    return diagnostic(
      'AGX-E302',
      `Expressão aninhada além do limite de ${String(MAX_DEPTH)} níveis.`,
      span,
      'Aninhamento assim profundo quase sempre é entrada malformada. Se for intencional, quebre a condição em nós `condition` encadeados.',
    );
  }

  private exit(): void {
    this.depth -= 1;
  }

  /**
   * Token corrente.
   *
   * É método e não getter de propósito: com getter, o TypeScript preserva o narrowing
   * de `kind` através de um `advance()`, porque não sabe que a chamada muda o estado — e
   * aí `this.token().kind !== 'rbracket'` vira comparação "impossível" logo depois de um
   * `=== 'lbracket'`. Chamada de método não é narrowed.
   */
  private token(): Token {
    // O lexer sempre emite `eof`, então esta indexação nunca fica sem token. O fallback
    // existe porque `noUncheckedIndexedAccess` não sabe disso, e inventar um `!` aqui
    // seria trocar uma garantia real por uma afirmação minha.
    return this.tokens[this.index] ?? this.eofToken();
  }

  private eofToken(): Token {
    const last = this.tokens[this.tokens.length - 1];
    return last ?? { kind: 'eof', text: '', span: { start: 0, end: 0 } };
  }

  private advance(): Token {
    const token = this.token();
    if (this.index < this.tokens.length - 1) this.index += 1;
    return token;
  }

  private peekKind(offset: number): TokenKind | undefined {
    return this.tokens[this.index + offset]?.kind;
  }

  private isOperator(...texts: readonly string[]): boolean {
    const token = this.token();
    return token.kind === 'op' && texts.includes(token.text);
  }

  parse(): Result<ExprNode> {
    const expr = this.parseOr();
    if (!expr.ok) return expr;

    if (this.token().kind !== 'eof') {
      return err(
        diagnostic(
          'AGX-E302',
          `Token inesperado após o fim da expressão: ${describeToken(this.token())}.`,
          this.token().span,
        ),
      );
    }
    return expr;
  }

  private parseOr(): Result<ExprNode> {
    const tooDeep = this.enter(this.token().span);
    if (tooDeep !== undefined) return err(tooDeep);

    const result = this.parseLeftAssociative(['||'], () => this.parseAnd());
    this.exit();
    return result;
  }

  private parseAnd(): Result<ExprNode> {
    return this.parseLeftAssociative(['&&'], () => this.parseComparison());
  }

  /** Não associativo por decisão da gramática: no máximo um comparador. */
  private parseComparison(): Result<ExprNode> {
    const left = this.parseAdditive();
    if (!left.ok) return left;

    const isComparator = this.isOperator('==', '!=', '<', '<=', '>', '>=');
    const isIn = this.token().kind === 'in';
    if (!isComparator && !isIn) return left;

    const operatorToken = this.advance();
    const right = this.parseAdditive();
    if (!right.ok) return right;

    if (this.isOperator('==', '!=', '<', '<=', '>', '>=') || this.token().kind === 'in') {
      return err(
        diagnostic(
          'AGX-E302',
          'Comparação encadeada não é permitida.',
          this.token().span,
          'Escreva as duas comparações ligadas por `&&`: `a < b && b < c`.',
        ),
      );
    }

    return ok(
      binary(operatorToken.text as BinaryOperator, left.value, right.value, operatorToken.span),
    );
  }

  private parseAdditive(): Result<ExprNode> {
    return this.parseLeftAssociative(['+', '-'], () => this.parseMultiplicative());
  }

  private parseMultiplicative(): Result<ExprNode> {
    return this.parseLeftAssociative(['*', '/', '%'], () => this.parseUnary());
  }

  private parseLeftAssociative(
    operators: readonly string[],
    operand: () => Result<ExprNode>,
  ): Result<ExprNode> {
    const first = operand();
    if (!first.ok) return first;

    // O acumulador é o nó, não o `Result`: reatribuir um `Result` dentro do laço perde o
    // narrowing de `ok` e obrigaria a checar de novo algo já garantido acima.
    let left = first.value;

    while (this.isOperator(...operators)) {
      const operatorToken = this.advance();
      const right = operand();
      if (!right.ok) return right;
      left = binary(operatorToken.text as BinaryOperator, left, right.value, operatorToken.span);
    }
    return ok(left);
  }

  private parseUnary(): Result<ExprNode> {
    if (this.isOperator('!', '-')) {
      const tooDeep = this.enter(this.token().span);
      if (tooDeep !== undefined) return err(tooDeep);

      const operatorToken = this.advance();
      const operand = this.parseUnary();
      this.exit();
      if (!operand.ok) return operand;
      return ok({
        kind: 'unary',
        operator: operatorToken.text as UnaryOperator,
        operand: operand.value,
        span: { start: operatorToken.span.start, end: operand.value.span.end },
      });
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Result<ExprNode> {
    const token = this.token();

    switch (token.kind) {
      case 'number':
      case 'string':
        this.advance();
        return ok({ kind: 'literal', value: token.value ?? '', span: token.span });

      case 'true':
      case 'false':
        this.advance();
        return ok({ kind: 'literal', value: token.kind === 'true', span: token.span });

      case 'null':
        this.advance();
        return ok({ kind: 'literal', value: null, span: token.span });

      case 'lparen': {
        this.advance();
        const inner = this.parseOr();
        if (!inner.ok) return inner;
        if (this.token().kind !== 'rparen') {
          return err(
            diagnostic('AGX-E302', 'Falta `)` para fechar o parêntese.', this.token().span),
          );
        }
        const close = this.advance();
        return ok({
          kind: 'group',
          inner: inner.value,
          span: { start: token.span.start, end: close.span.end },
        });
      }

      case 'ident':
        return this.parseIdentifier(token);

      // `in` acumula dois papéis na gramática (§2): é operador de pertencimento e é
      // raiz de caminho. A desambiguação é posicional e não precisa de mais que isso:
      // como raiz ele vem em posição de prefixo e é sempre seguido de `.`; como
      // operador ele é infixo, e este ponto do parser nunca é alcançado.
      case 'in': {
        if (this.peekKind(1) === 'dot') {
          this.advance();
          return this.parsePathSteps(token);
        }
        return err(
          diagnostic(
            'AGX-E302',
            '`in` sozinho não é um valor.',
            token.span,
            'Como raiz, `in` nomeia uma entrada do nó: `in.<nome>`. Como operador, vai entre dois valores: `x in state.lista`.',
          ),
        );
      }

      default:
        return err(
          diagnostic(
            'AGX-E302',
            `Esperava um valor, caminho ou chamada, e encontrei ${describeToken(token)}.`,
            token.span,
          ),
        );
    }
  }

  private parseIdentifier(token: Token): Result<ExprNode> {
    this.advance();

    if (this.token().kind === 'lparen') return this.parseCallArguments(token);
    if (PATH_ROOTS.includes(token.text)) return this.parsePathSteps(token);

    // Um identificador solto quase sempre é um canal escrito sem a raiz. Dizer isso
    // resolve o caso real; dizer "token inesperado" faria a pessoa procurar outra coisa.
    return err(
      diagnostic(
        'AGX-E302',
        `Nome solto: \`${token.text}\`.`,
        token.span,
        `Caminhos começam por uma raiz. Você quis dizer \`state.${token.text}\`?`,
      ),
    );
  }

  private parseCallArguments(nameToken: Token): Result<ExprNode> {
    this.advance();
    const args: ExprNode[] = [];

    if (this.token().kind !== 'rparen') {
      while (true) {
        const arg = this.parseOr();
        if (!arg.ok) return arg;
        args.push(arg.value);

        if (this.token().kind === 'comma') {
          this.advance();
          continue;
        }
        break;
      }
    }

    if (this.token().kind !== 'rparen') {
      return err(
        diagnostic(
          'AGX-E302',
          `Falta \`)\` para fechar a chamada de \`${nameToken.text}\`.`,
          this.token().span,
        ),
      );
    }
    const close = this.advance();

    return ok({
      kind: 'call',
      name: nameToken.text,
      args,
      nameSpan: nameToken.span,
      span: { start: nameToken.span.start, end: close.span.end },
    });
  }

  private parsePathSteps(rootToken: Token): Result<ExprNode> {
    const steps: PathStep[] = [];
    let end = rootToken.span.end;

    while (true) {
      if (this.token().kind === 'dot') {
        this.advance();
        const field = this.token();
        // Palavras reservadas são identificadores válidos depois do ponto: um canal
        // pode se chamar `in`. É `state.in` que não faz sentido, não `.in`.
        if (field.kind !== 'ident' && field.kind !== 'in') {
          return err(diagnostic('AGX-E302', 'Esperava um nome de campo após `.`.', field.span));
        }
        this.advance();
        steps.push({ kind: 'field', name: field.text, span: field.span });
        end = field.span.end;
        continue;
      }

      if (this.token().kind === 'lbracket') {
        this.advance();
        const indexToken = this.token();
        if (indexToken.kind !== 'number' || !Number.isInteger(indexToken.value)) {
          return err(
            diagnostic(
              'AGX-E302',
              'Índice deve ser um inteiro literal.',
              indexToken.span,
              'Índice calculado não existe em AGX-Expr: o caminho precisa ser analisável sem executar nada.',
            ),
          );
        }
        this.advance();

        if (this.token().kind !== 'rbracket') {
          return err(diagnostic('AGX-E302', 'Falta `]` para fechar o índice.', this.token().span));
        }
        const close = this.advance();
        steps.push({ kind: 'index', index: Number(indexToken.value), span: indexToken.span });
        end = close.span.end;
        continue;
      }

      break;
    }

    return ok({
      kind: 'path',
      root: rootToken.text as PathRoot,
      steps,
      span: { start: rootToken.span.start, end },
    });
  }
}

function binary(
  operator: BinaryOperator,
  left: ExprNode,
  right: ExprNode,
  operatorSpan: Span,
): BinaryNode {
  return {
    kind: 'binary',
    operator,
    left,
    right,
    operatorSpan,
    span: { start: left.span.start, end: right.span.end },
  };
}

function describeToken(token: Token): string {
  if (token.kind === 'eof') return 'o fim da expressão';
  return `\`${token.text}\``;
}

/** Analisa uma expressão. Nunca lança: erro de sintaxe é valor de retorno. */
export function parse(source: string): Result<ExprNode> {
  const tokens = tokenize(source);
  if (!tokens.ok) return tokens;
  return new Parser(tokens.value).parse();
}

/** Os diagnósticos de `parse`, ou lista vazia quando a expressão é válida. */
export function parseErrors(source: string): readonly Diagnostic[] {
  const result = parse(source);
  return result.ok ? [] : result.diagnostics;
}
