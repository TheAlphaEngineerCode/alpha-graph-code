/**
 * Motor de expressão regular sem backtracking (ADR-0003).
 *
 * A construção é de Thompson: o padrão vira um NFA, e a busca simula **todos os estados
 * ativos em paralelo**, avançando um code point por vez. O custo é O(n × m) — n = entrada,
 * m = padrão — por construção, e não por ausência de casos ruins conhecidos.
 *
 * A diferença importa: um motor com backtracking gasta ~2³⁰ passos em `(a+)+$` contra 30
 * caracteres. Como o arquivo de grafo é entrada não confiável por design, isso seria um
 * DoS de uma linha disparado por `agx validate` — o comando que a spec promete que não
 * executa nada.
 *
 * Não há captura: `matches` devolve `bool`, e grupo serve só para agrupar.
 */
import { toCodePoints } from './codepoints.js';
import { diagnostic, err, ok, type Result, type Span } from './diagnostics.js';

/** Teto de repetição em `{n,m}`. Sem ele, o ataque migra da busca para a compilação. */
const MAX_REPEAT = 1000;

type CharMatcher =
  | { readonly kind: 'literal'; readonly char: string }
  | { readonly kind: 'any' }
  | { readonly kind: 'class'; readonly negated: boolean; readonly items: readonly ClassItem[] };

type ClassItem =
  | { readonly kind: 'char'; readonly char: string }
  | { readonly kind: 'range'; readonly from: string; readonly to: string }
  | { readonly kind: 'shorthand'; readonly of: 'd' | 'w' | 's'; readonly negated: boolean };

/**
 * Instrução do NFA.
 *
 * `split` é o único ponto de ramificação, e é o que a simulação percorre em largura em
 * vez de em profundidade — a diferença entre linear e exponencial.
 */
type Instruction =
  | { readonly op: 'char'; readonly matcher: CharMatcher; readonly next: number }
  | { readonly op: 'split'; readonly a: number; readonly b: number }
  | { readonly op: 'jump'; readonly to: number }
  | { readonly op: 'assertStart'; readonly next: number }
  | { readonly op: 'assertEnd'; readonly next: number }
  | { readonly op: 'match' };

export interface CompiledPattern {
  readonly source: string;
  readonly program: readonly Instruction[];
  /** Passos que uma busca sobre `n` code points custa, no pior caso. */
  cost(inputLength: number): number;
}

// ---------------------------------------------------------------------------
// Parser do padrão → AST
// ---------------------------------------------------------------------------

type RegexNode =
  | { readonly kind: 'empty' }
  | { readonly kind: 'char'; readonly matcher: CharMatcher }
  | { readonly kind: 'start' }
  | { readonly kind: 'end' }
  | { readonly kind: 'concat'; readonly parts: readonly RegexNode[] }
  | { readonly kind: 'alt'; readonly options: readonly RegexNode[] }
  | {
      readonly kind: 'repeat';
      readonly node: RegexNode;
      readonly min: number;
      readonly max: number;
    };

/** `max: Infinity` significa ilimitado — é a única exceção à regra de valores finitos. */
const UNBOUNDED = Number.POSITIVE_INFINITY;

class PatternParser {
  private index = 0;
  private readonly chars: readonly string[];
  private readonly span: Span;

  constructor(pattern: string, span: Span) {
    this.chars = toCodePoints(pattern);
    this.span = span;
  }

  private peek(offset = 0): string | undefined {
    return this.chars[this.index + offset];
  }

  private next(): string | undefined {
    const c = this.chars[this.index];
    this.index += 1;
    return c;
  }

  private fail<T>(message: string, suggestion?: string): Result<T> {
    return err(diagnostic('AGX-E330', message, this.span, suggestion));
  }

  parse(): Result<RegexNode> {
    const node = this.parseAlternation();
    if (!node.ok) return node;
    if (this.index < this.chars.length) {
      return this.fail(`Caractere inesperado no padrão: ${JSON.stringify(this.peek())}.`);
    }
    return node;
  }

  private parseAlternation(): Result<RegexNode> {
    const options: RegexNode[] = [];
    while (true) {
      const branch = this.parseConcat();
      if (!branch.ok) return branch;
      options.push(branch.value);

      if (this.peek() === '|') {
        this.next();
        continue;
      }
      break;
    }
    return ok(options.length === 1 ? (options[0] ?? { kind: 'empty' }) : { kind: 'alt', options });
  }

  private parseConcat(): Result<RegexNode> {
    const parts: RegexNode[] = [];
    while (true) {
      const c = this.peek();
      if (c === undefined || c === '|' || c === ')') break;

      const atom = this.parseAtom();
      if (!atom.ok) return atom;

      const repeated = this.parseQuantifier(atom.value);
      if (!repeated.ok) return repeated;
      parts.push(repeated.value);
    }

    if (parts.length === 0) return ok({ kind: 'empty' });
    return ok(parts.length === 1 ? (parts[0] ?? { kind: 'empty' }) : { kind: 'concat', parts });
  }

  private parseQuantifier(node: RegexNode): Result<RegexNode> {
    const c = this.peek();
    let min: number;
    let max: number;

    if (c === '*') {
      this.next();
      min = 0;
      max = UNBOUNDED;
    } else if (c === '+') {
      this.next();
      min = 1;
      max = UNBOUNDED;
    } else if (c === '?') {
      this.next();
      min = 0;
      max = 1;
    } else if (c === '{') {
      const bounded = this.parseBoundedQuantifier();
      if (!bounded.ok) return bounded;
      if (bounded.value === undefined) return ok(node);
      ({ min, max } = bounded.value);
    } else {
      return ok(node);
    }

    // Um quantificador preguiçoso muda qual casamento vence, e sem captura não há
    // "qual casamento" observável — aceitá-lo seria fingir uma semântica inexistente.
    if (this.peek() === '?') {
      return this.fail(
        'Quantificador preguiçoso (`*?`, `+?`, `??`) não existe neste dialeto.',
        'Sem captura, o casamento preguiçoso não muda o resultado de `matches`. Remova o `?`.',
      );
    }
    // `a**` é ambíguo e, num motor com backtracking, é fonte clássica de explosão.
    if (this.peek() === '*' || this.peek() === '+') {
      return this.fail(
        'Quantificador aplicado a quantificador.',
        'Agrupe explicitamente: `(a+)+`.',
      );
    }

    return ok({ kind: 'repeat', node, min, max });
  }

  /** Devolve `undefined` quando `{` não abre um quantificador e é literal. */
  private parseBoundedQuantifier(): Result<{ min: number; max: number } | undefined> {
    const save = this.index;
    this.next();

    const minDigits = this.readDigits();
    if (minDigits === '') {
      this.index = save;
      return ok(undefined);
    }

    let maxDigits = minDigits;
    if (this.peek() === ',') {
      this.next();
      maxDigits = this.readDigits();
    }

    if (this.peek() !== '}') {
      this.index = save;
      return ok(undefined);
    }
    this.next();

    const min = Number(minDigits);
    const max = maxDigits === '' ? UNBOUNDED : Number(maxDigits);

    if (max !== UNBOUNDED && max < min) {
      return this.fail(
        `Repetição inválida: {${minDigits},${maxDigits}} tem máximo menor que o mínimo.`,
      );
    }
    if (min > MAX_REPEAT || (max !== UNBOUNDED && max > MAX_REPEAT)) {
      return this.fail(
        `Repetição acima do teto de ${String(MAX_REPEAT)}.`,
        'Sem teto, o padrão gera um autômato gigante e o custo migra da busca para a compilação.',
      );
    }
    return ok({ min, max });
  }

  private readDigits(): string {
    let out = '';
    while (true) {
      const c = this.peek();
      if (c === undefined || c < '0' || c > '9') break;
      out += c;
      this.next();
    }
    return out;
  }

  private parseAtom(): Result<RegexNode> {
    const c = this.next();
    if (c === undefined) return ok({ kind: 'empty' });

    switch (c) {
      case '^':
        return ok({ kind: 'start' });
      case '$':
        return ok({ kind: 'end' });
      case '.':
        return ok({ kind: 'char', matcher: { kind: 'any' } });
      case '(':
        return this.parseGroup();
      case '[':
        return this.parseCharClass();
      case '\\':
        return this.parseEscape();
      case ')':
        return this.fail('`)` sem `(` correspondente.');
      case ']':
        return this.fail('`]` sem `[` correspondente.');
      case '*':
      case '+':
      case '?':
        return this.fail(`Quantificador \`${c}\` sem nada para repetir.`);
      default:
        return ok({ kind: 'char', matcher: { kind: 'literal', char: c } });
    }
  }

  private parseGroup(): Result<RegexNode> {
    if (this.peek() === '?') {
      const marker = this.peek(1);
      if (marker === '=' || marker === '!') {
        return this.fail(
          'Lookahead não existe neste dialeto.',
          'Reescreva sem lookahead, ou faça a checagem numa branch `condition` separada.',
        );
      }
      if (marker === '<') {
        return this.fail('Lookbehind e grupo nomeado não existem neste dialeto.');
      }
      if (marker === ':') {
        // Todo grupo já é sem captura; aceitar a forma explícita evita recusar um
        // padrão correto só porque quem escreveu veio de outro dialeto.
        this.next();
        this.next();
      } else {
        return this.fail(`Construção \`(?${marker ?? ''}\` não suportada.`);
      }
    }

    const inner = this.parseAlternation();
    if (!inner.ok) return inner;

    if (this.peek() !== ')') return this.fail('Falta `)` para fechar o grupo.');
    this.next();
    return inner;
  }

  private parseEscape(): Result<RegexNode> {
    const c = this.next();
    if (c === undefined) return this.fail('Escape incompleto no fim do padrão.');

    if (c >= '1' && c <= '9') {
      return this.fail(
        'Backreference não existe neste dialeto.',
        'Backreference é o que torna o casamento exponencial. `matches` não tem captura.',
      );
    }

    const shorthand = shorthandOf(c);
    if (shorthand !== undefined) {
      return ok({
        kind: 'char',
        matcher: { kind: 'class', negated: false, items: [shorthand] },
      });
    }

    const control = controlEscape(c);
    return ok({ kind: 'char', matcher: { kind: 'literal', char: control ?? c } });
  }

  private parseCharClass(): Result<RegexNode> {
    const negated = this.peek() === '^';
    if (negated) this.next();

    const items: ClassItem[] = [];
    let closed = false;

    while (true) {
      const c = this.next();
      if (c === undefined) break;
      if (c === ']') {
        closed = true;
        break;
      }

      let low: string;
      if (c === '\\') {
        const escaped = this.next();
        if (escaped === undefined) return this.fail('Escape incompleto dentro da classe.');
        const shorthand = shorthandOf(escaped);
        if (shorthand !== undefined) {
          items.push(shorthand);
          continue;
        }
        low = controlEscape(escaped) ?? escaped;
      } else {
        low = c;
      }

      // Um `-` antes de `]` é literal, não abertura de faixa: `[a-]` é válido.
      if (this.peek() === '-' && this.peek(1) !== undefined && this.peek(1) !== ']') {
        this.next();
        const highRaw = this.next();
        if (highRaw === undefined) return this.fail('Faixa incompleta na classe.');

        let high = highRaw;
        if (highRaw === '\\') {
          const escaped = this.next();
          if (escaped === undefined) return this.fail('Escape incompleto na faixa.');
          // Escape que não é de controle vale como literal — `[a-\]]` é faixa válida.
          // Antes isto virava string vazia e caía em "faixa invertida", que aponta para
          // o problema errado.
          high = controlEscape(escaped) ?? escaped;
        }

        if (high < low) {
          return this.fail(`Faixa invertida na classe: \`${low}-${high}\`.`);
        }
        items.push({ kind: 'range', from: low, to: high });
        continue;
      }

      items.push({ kind: 'char', char: low });
    }

    if (!closed) return this.fail('Falta `]` para fechar a classe de caracteres.');
    if (items.length === 0) return this.fail('Classe de caracteres vazia.');

    return ok({ kind: 'char', matcher: { kind: 'class', negated, items } });
  }
}

function shorthandOf(c: string): ClassItem | undefined {
  switch (c) {
    case 'd':
      return { kind: 'shorthand', of: 'd', negated: false };
    case 'D':
      return { kind: 'shorthand', of: 'd', negated: true };
    case 'w':
      return { kind: 'shorthand', of: 'w', negated: false };
    case 'W':
      return { kind: 'shorthand', of: 'w', negated: true };
    case 's':
      return { kind: 'shorthand', of: 's', negated: false };
    case 'S':
      return { kind: 'shorthand', of: 's', negated: true };
    default:
      return undefined;
  }
}

function controlEscape(c: string): string | undefined {
  switch (c) {
    case 'n':
      return '\n';
    case 'r':
      return '\r';
    case 't':
      return '\t';
    case 'f':
      return '\f';
    case 'v':
      return '\v';
    case '0':
      return '\0';
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// AST → programa NFA
// ---------------------------------------------------------------------------

class Compiler {
  private readonly program: Instruction[] = [];

  compile(node: RegexNode): readonly Instruction[] {
    this.emit(node);
    this.program.push({ op: 'match' });
    return this.program;
  }

  private placeholder(): number {
    this.program.push({ op: 'jump', to: 0 });
    return this.program.length - 1;
  }

  private patch(at: number, instruction: Instruction): void {
    this.program[at] = instruction;
  }

  private get here(): number {
    return this.program.length;
  }

  private emit(node: RegexNode): void {
    switch (node.kind) {
      case 'empty':
        break;

      case 'char': {
        const slot = this.placeholder();
        this.patch(slot, { op: 'char', matcher: node.matcher, next: this.here });
        break;
      }

      case 'start': {
        const slot = this.placeholder();
        this.patch(slot, { op: 'assertStart', next: this.here });
        break;
      }

      case 'end': {
        const slot = this.placeholder();
        this.patch(slot, { op: 'assertEnd', next: this.here });
        break;
      }

      case 'concat':
        for (const part of node.parts) this.emit(part);
        break;

      case 'alt':
        this.emitAlternation(node.options);
        break;

      case 'repeat':
        this.emitRepeat(node);
        break;
    }
  }

  private emitAlternation(options: readonly RegexNode[]): void {
    const first = options[0];
    if (first === undefined) return;
    if (options.length === 1) {
      this.emit(first);
      return;
    }

    const splitSlot = this.placeholder();
    const branchStart = this.here;
    this.emit(first);
    const jumpSlot = this.placeholder();

    const restStart = this.here;
    this.emitAlternation(options.slice(1));

    this.patch(splitSlot, { op: 'split', a: branchStart, b: restStart });
    this.patch(jumpSlot, { op: 'jump', to: this.here });
  }

  private emitRepeat(node: { node: RegexNode; min: number; max: number }): void {
    // Repetição obrigatória vira cópias literais. É por isso que `{n,m}` tem teto:
    // sem ele, `a{1,1000000}` geraria um milhão de instruções.
    for (let i = 0; i < node.min; i++) this.emit(node.node);

    if (node.max === UNBOUNDED) {
      const splitSlot = this.placeholder();
      const bodyStart = this.here;
      this.emit(node.node);
      const jumpSlot = this.placeholder();
      this.patch(jumpSlot, { op: 'jump', to: splitSlot });
      this.patch(splitSlot, { op: 'split', a: bodyStart, b: this.here });
      return;
    }

    const optional = node.max - node.min;
    const splitSlots: number[] = [];
    for (let i = 0; i < optional; i++) {
      splitSlots.push(this.placeholder());
      this.emit(node.node);
    }
    // Todo `split` opcional salta para o fim do bloco: uma vez que a repetição para,
    // ela não recomeça — é o que mantém a simulação sem estados redundantes.
    for (const slot of splitSlots) {
      this.patch(slot, { op: 'split', a: slot + 1, b: this.here });
    }
  }
}

// ---------------------------------------------------------------------------
// Simulação
// ---------------------------------------------------------------------------

function matchesChar(matcher: CharMatcher, c: string): boolean {
  switch (matcher.kind) {
    case 'literal':
      return matcher.char === c;
    case 'any':
      return c !== '\n';
    case 'class': {
      const inside = matcher.items.some((item) => matchesClassItem(item, c));
      return matcher.negated ? !inside : inside;
    }
  }
}

function matchesClassItem(item: ClassItem, c: string): boolean {
  switch (item.kind) {
    case 'char':
      return item.char === c;
    case 'range':
      return c >= item.from && c <= item.to;
    case 'shorthand': {
      const positive = matchesShorthand(item.of, c);
      return item.negated ? !positive : positive;
    }
  }
}

function matchesShorthand(of: 'd' | 'w' | 's', c: string): boolean {
  switch (of) {
    case 'd':
      return c >= '0' && c <= '9';
    case 'w':
      return (
        (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_'
      );
    case 's':
      return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';
  }
}

/**
 * Adiciona um estado ao conjunto ativo, resolvendo `split`/`jump`/âncoras na hora.
 *
 * `seen` é o que garante o custo linear: cada instrução entra no conjunto **no máximo uma
 * vez por posição da entrada**. Sem esse corte, `(a+)+` reexploraria os mesmos estados e
 * a simulação viraria backtracking com outro nome.
 */
function addState(
  program: readonly Instruction[],
  pc: number,
  position: number,
  inputLength: number,
  set: number[],
  seen: Uint8Array,
): void {
  const stack = [pc];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) continue;
    if (seen[current] === 1) continue;
    seen[current] = 1;

    const instruction = program[current];
    if (instruction === undefined) continue;

    switch (instruction.op) {
      case 'jump':
        stack.push(instruction.to);
        break;
      case 'split':
        stack.push(instruction.b, instruction.a);
        break;
      case 'assertStart':
        if (position === 0) stack.push(instruction.next);
        break;
      case 'assertEnd':
        if (position === inputLength) stack.push(instruction.next);
        break;
      case 'char':
      case 'match':
        set.push(current);
        break;
    }
  }
}

function run(program: readonly Instruction[], input: readonly string[]): boolean {
  let current: number[] = [];
  addState(program, 0, 0, input.length, current, new Uint8Array(program.length));

  for (let i = 0; i < input.length; i++) {
    if (current.length === 0) return false;

    const nextStates: number[] = [];
    const nextSeen = new Uint8Array(program.length);
    const c = input[i];

    for (const pc of current) {
      const instruction = program[pc];
      if (instruction?.op !== 'char') continue;
      if (c !== undefined && matchesChar(instruction.matcher, c)) {
        addState(program, instruction.next, i + 1, input.length, nextStates, nextSeen);
      }
    }

    current = nextStates;
  }

  return current.some((pc) => program[pc]?.op === 'match');
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Compila um padrão. Roda em tempo de **validação do grafo**, nunca de avaliação — é o que
 * o padrão literal obrigatório (ADR-0003) torna possível.
 */
export function compilePattern(pattern: string, span: Span): Result<CompiledPattern> {
  const parsed = new PatternParser(pattern, span).parse();
  if (!parsed.ok) return parsed;

  const program = new Compiler().compile(parsed.value);
  return ok({
    source: pattern,
    program,
    cost: (inputLength: number): number => (inputLength + 1) * program.length,
  });
}

/**
 * Casamento **não ancorado**: procura o padrão em qualquer posição, como `RegExp.test`.
 * Âncoras explícitas (`^`, `$`) continuam valendo.
 *
 * O prefixo `.*` é adicionado ao conjunto inicial de estados a cada passo, em vez de
 * reiniciar a busca em cada posição — reiniciar seria O(n²).
 */
export function testPattern(compiled: CompiledPattern, input: string): boolean {
  const chars = toCodePoints(input);
  const { program } = compiled;

  let current: number[] = [];
  addState(program, 0, 0, chars.length, current, new Uint8Array(program.length));

  for (let i = 0; i < chars.length; i++) {
    const nextStates: number[] = [];
    const nextSeen = new Uint8Array(program.length);
    const c = chars[i];

    for (const pc of current) {
      const instruction = program[pc];
      if (instruction?.op === 'match') return true;
      if (instruction?.op !== 'char') continue;
      if (c !== undefined && matchesChar(instruction.matcher, c)) {
        addState(program, instruction.next, i + 1, chars.length, nextStates, nextSeen);
      }
    }

    // Recomeço em toda posição: é o `.*` implícito do casamento não ancorado.
    addState(program, 0, i + 1, chars.length, nextStates, nextSeen);

    current = nextStates;
  }

  return current.some((pc) => program[pc]?.op === 'match');
}

/** Casamento ancorado no início e no fim. Exposto para teste do motor. */
export function testPatternAnchored(compiled: CompiledPattern, input: string): boolean {
  return run(compiled.program, toCodePoints(input));
}
