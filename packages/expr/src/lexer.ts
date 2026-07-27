import { sliceCodePoints, toCodePoints } from './codepoints.js';
import { diagnostic, err, ok, type Result, type Span } from './diagnostics.js';

export type TokenKind =
  | 'number'
  | 'string'
  | 'ident'
  | 'true'
  | 'false'
  | 'null'
  | 'in'
  | 'op'
  | 'lparen'
  | 'rparen'
  | 'lbracket'
  | 'rbracket'
  | 'comma'
  | 'dot'
  | 'eof';

export interface Token {
  readonly kind: TokenKind;
  /** Texto do operador, nome do identificador, ou o lexema cru para números. */
  readonly text: string;
  readonly span: Span;
  /** Presente em `number` e `string`: o valor já decodificado. */
  readonly value?: number | string;
}

const KEYWORDS: Readonly<Record<string, TokenKind>> = {
  true: 'true',
  false: 'false',
  null: 'null',
  in: 'in',
};

/** Operadores de dois caracteres vêm primeiro: `<=` não pode ser lido como `<` e `=`. */
const TWO_CHAR_OPS = ['==', '!=', '<=', '>=', '&&', '||'] as const;
const ONE_CHAR_OPS = ['<', '>', '+', '-', '*', '/', '%', '!'] as const;

/**
 * Percorre a entrada por **code point**, não por unidade UTF-16.
 *
 * A diferença aparece com qualquer caractere fora do BMP: iterar por `charCodeAt` parte
 * um emoji em dois meios-caracteres e os spans de diagnóstico apontam para o lugar
 * errado. Os offsets desta classe são de code point, e o resto do pacote assume isso.
 */
class Cursor {
  private readonly chars: readonly string[];
  private index = 0;

  constructor(source: string) {
    this.chars = toCodePoints(source);
  }

  get position(): number {
    return this.index;
  }

  get done(): boolean {
    return this.index >= this.chars.length;
  }

  peek(offset = 0): string | undefined {
    return this.chars[this.index + offset];
  }

  next(): string | undefined {
    const c = this.chars[this.index];
    // Não avança além do fim. Avançar incondicionalmente fazia `position` passar do
    // tamanho da entrada quando um literal terminava sem fechar (`"`), e o span do
    // diagnóstico apontava para um caractere que não existe — o CLI destacaria vazio.
    if (c !== undefined) this.index += 1;
    return c;
  }

  advance(count: number): void {
    this.index = Math.min(this.index + count, this.chars.length);
  }
}

const isDigit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9';

const isIdentStart = (c: string | undefined): boolean =>
  c !== undefined && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_');

const isIdentPart = (c: string | undefined): boolean => isIdentStart(c) || isDigit(c);

const isSpace = (c: string | undefined): boolean =>
  c === ' ' || c === '\t' || c === '\n' || c === '\r';

export function tokenize(source: string): Result<readonly Token[]> {
  const cursor = new Cursor(source);
  const tokens: Token[] = [];

  while (!cursor.done) {
    if (isSpace(cursor.peek())) {
      cursor.advance(1);
      continue;
    }

    const start = cursor.position;
    const c = cursor.peek();
    if (c === undefined) break;

    if (isDigit(c)) {
      const token = readNumber(cursor, start);
      if (!token.ok) return token;
      tokens.push(token.value);
      continue;
    }

    if (c === '"' || c === "'") {
      const token = readString(cursor, start);
      if (!token.ok) return token;
      tokens.push(token.value);
      continue;
    }

    if (isIdentStart(c)) {
      while (isIdentPart(cursor.peek())) cursor.advance(1);
      const text = sliceOf(source, start, cursor.position);
      const kind = KEYWORDS[text] ?? 'ident';
      tokens.push({ kind, text, span: { start, end: cursor.position } });
      continue;
    }

    const two = `${c}${cursor.peek(1) ?? ''}`;
    if ((TWO_CHAR_OPS as readonly string[]).includes(two)) {
      cursor.advance(2);
      tokens.push({ kind: 'op', text: two, span: { start, end: cursor.position } });
      continue;
    }

    if ((ONE_CHAR_OPS as readonly string[]).includes(c)) {
      cursor.advance(1);
      tokens.push({ kind: 'op', text: c, span: { start, end: cursor.position } });
      continue;
    }

    const punctuation = punctuationKind(c);
    if (punctuation !== undefined) {
      cursor.advance(1);
      tokens.push({ kind: punctuation, text: c, span: { start, end: cursor.position } });
      continue;
    }

    // `=` sozinho merece mensagem própria: quem escreve `state.x = 1` está trazendo
    // hábito de linguagem com atribuição, e AGX-Expr não tem atribuição nenhuma.
    if (c === '=') {
      cursor.advance(1);
      return err(
        diagnostic(
          'AGX-E301',
          'AGX-Expr não tem atribuição.',
          { start, end: cursor.position },
          'Para comparar, use `==`.',
        ),
      );
    }

    cursor.advance(1);
    return err(
      diagnostic('AGX-E301', `Caractere inesperado: ${JSON.stringify(c)}.`, {
        start,
        end: cursor.position,
      }),
    );
  }

  tokens.push({ kind: 'eof', text: '', span: { start: cursor.position, end: cursor.position } });
  return ok(tokens);
}

function punctuationKind(c: string): TokenKind | undefined {
  switch (c) {
    case '(':
      return 'lparen';
    case ')':
      return 'rparen';
    case '[':
      return 'lbracket';
    case ']':
      return 'rbracket';
    case ',':
      return 'comma';
    case '.':
      return 'dot';
    default:
      return undefined;
  }
}

function sliceOf(source: string, start: number, end: number): string {
  return sliceCodePoints(source, start, end);
}

function readNumber(cursor: Cursor, start: number): Result<Token> {
  let text = '';
  while (isDigit(cursor.peek())) text += cursor.next() ?? '';

  if (cursor.peek() === '.' && isDigit(cursor.peek(1))) {
    text += cursor.next() ?? '';
    while (isDigit(cursor.peek())) text += cursor.next() ?? '';
  }

  const exponent = cursor.peek();
  if (exponent === 'e' || exponent === 'E') {
    const sign = cursor.peek(1);
    const digitOffset = sign === '+' || sign === '-' ? 2 : 1;
    if (isDigit(cursor.peek(digitOffset))) {
      text += cursor.next() ?? '';
      if (sign === '+' || sign === '-') text += cursor.next() ?? '';
      while (isDigit(cursor.peek())) text += cursor.next() ?? '';
    }
  }

  const value = Number(text);
  // Um literal grande demais para um double vira `Infinity`. Recusar aqui é o que
  // sustenta a promessa de que nenhum valor não finito circula na linguagem (ADR-0004):
  // deixar passar traria de volta `Infinity` pela porta do literal.
  if (!Number.isFinite(value)) {
    return err(
      diagnostic(
        'AGX-E301',
        `Literal numérico fora da faixa representável: ${text}.`,
        { start, end: cursor.position },
        'AGX-Expr não tem Infinity. Use um valor finito.',
      ),
    );
  }

  return ok({ kind: 'number', text, value, span: { start, end: cursor.position } });
}

function readString(cursor: Cursor, start: number): Result<Token> {
  const quote = cursor.next();
  let value = '';

  while (true) {
    const c = cursor.next();
    if (c === undefined) {
      return err(
        diagnostic('AGX-E301', 'String sem aspas de fechamento.', {
          start,
          end: cursor.position,
        }),
      );
    }
    if (c === quote) break;

    if (c !== '\\') {
      value += c;
      continue;
    }

    const escaped = cursor.next();
    if (escaped === undefined) {
      return err(
        diagnostic('AGX-E301', 'Escape incompleto no fim da string.', {
          start,
          end: cursor.position,
        }),
      );
    }

    const decoded = decodeEscape(escaped);
    if (decoded === undefined) {
      return err(
        diagnostic(
          'AGX-E301',
          `Escape desconhecido: \\${escaped}.`,
          { start, end: cursor.position },
          'Escapes válidos: \\\\ \\" \\\' \\n \\r \\t.',
        ),
      );
    }
    value += decoded;
  }

  const text = `${quote}${value}${quote}`;
  return ok({ kind: 'string', text, value, span: { start, end: cursor.position } });
}

function decodeEscape(c: string): string | undefined {
  switch (c) {
    case 'n':
      return '\n';
    case 'r':
      return '\r';
    case 't':
      return '\t';
    case '\\':
      return '\\';
    case '"':
      return '"';
    case "'":
      return "'";
    default:
      return undefined;
  }
}
