/**
 * Testes de propriedade de AGX-Expr — as quatro asserções de `specs/agx-expr.md` §6.
 *
 * Testes por exemplo não encontram os bugs que importam num compilador: entrada
 * malformada, unicode, número extremo, aninhamento patológico. Estes geram as entradas
 * em vez de escolhê-las.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parse } from './parser.js';
import { print } from './printer.js';
import { evaluate } from './interpreter.js';
import { compile } from './index.js';
import type { ExprNode } from './ast.js';
import { codePointLength } from './codepoints.js';
import type { ChannelSchema } from './types.js';
import { isArray, type ExprValue } from './value.js';

const RUNS = 500;

// --- geradores --------------------------------------------------------------

const literal: fc.Arbitrary<string> = fc.oneof(
  fc.integer({ min: -1000, max: 1000 }).map(String),
  fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }).map(String),
  fc.constantFrom('true', 'false', 'null'),
  fc.string({ maxLength: 12 }).map((s) => JSON.stringify(s)),
);

/** Caminhos cujo tipo o schema de canais descreve por inteiro. */
const typedPath: fc.Arbitrary<string> = fc.constantFrom(
  'state.confidence',
  'state.iteration',
  'state.findings',
  'state.approved',
  'state.scratch',
  'run.attempt',
  'run.step',
);

/**
 * Caminhos que descem em array ou object.
 *
 * O schema declara o canal, não a forma de dentro dele, então o typechecker marca o
 * resultado como desconhecido e para de checar acima. É a escotilha declarada em
 * `specs/agx-expr.md` §5.6 — e o que a torna visível é justamente separar os dois
 * geradores em vez de misturá-los e obter uma propriedade que não vale.
 */
const untypedPath: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom('state.documents'), fc.nat({ max: 5 }))
  .map(([p, i]) => `${p}[${String(i)}]`);

const path: fc.Arbitrary<string> = fc.oneof(typedPath, untypedPath);

/** Expressões sintaticamente válidas, com profundidade controlada. */
function expressionOver(leaf: fc.Arbitrary<string>): fc.Arbitrary<string> {
  return fc.letrec<{ expr: string }>((tie) => ({
    expr: fc.oneof(
      { depthSize: 'small', withCrossShrink: true },
      literal,
      leaf,
      fc
        .tuple(
          tie('expr'),
          fc.constantFrom('+', '-', '*', '/', '%', '&&', '||', '==', '!=', '<', '<=', '>', '>='),
          tie('expr'),
        )
        .map(([l, op, r]) => `${l} ${op} ${r}`),
      fc.tuple(fc.constantFrom('!', '-'), tie('expr')).map(([op, e]) => `${op}${e}`),
      tie('expr').map((e) => `(${e})`),
      tie('expr').map((e) => `len(${e})`),
      fc.tuple(tie('expr'), tie('expr')).map(([a, b]) => `coalesce(${a}, ${b})`),
    ),
  })).expr;
}

/** Qualquer expressão, incluindo as que descem em array/object. */
const expression = expressionOver(path);

/** Só expressões cujo tipo o schema descreve inteiramente. */
const fullyTypedExpression = expressionOver(typedPath);

/** Texto arbitrário, incluindo o que nunca deveria parsear. */
const anyText: fc.Arbitrary<string> = fc.oneof(
  fc.string({ maxLength: 40 }),
  // `unit: 'binary'` gera code points fora do BMP — é o que expõe iteração por unidade
  // UTF-16, que partiria um emoji em dois meios-caracteres e desalinharia os spans.
  fc.string({ unit: 'binary', maxLength: 40 }),
  fc.stringMatching(/^[()[\]{}.,!<>=+\-*/%&|'"\\ ]{0,30}$/),
  // Aninhamento fundo o bastante para derrubar uma descida recursiva sem guarda. A
  // versão anterior deste gerador parava em 500 e por isso não pegou o `RangeError`
  // que 2000 níveis produziam — o teto do gerador virara o teto do que era testado.
  fc.nat({ max: 4000 }).map((n) => '('.repeat(n) + '1' + ')'.repeat(n)),
  fc.nat({ max: 4000 }).map((n) => '!'.repeat(n) + 'true'),
  expression,
);

const SCHEMA: ChannelSchema = {
  channels: {
    confidence: { type: 'number' },
    iteration: { type: 'number' },
    findings: { type: 'array' },
    documents: { type: 'array' },
    approved: { type: 'bool' },
    scratch: { type: 'object' },
    query: { type: 'string', initialIsNull: true },
  },
};

const STATE: Record<string, ExprValue> = {
  confidence: 0.5,
  iteration: 3,
  findings: ['a', 'b'],
  documents: [{ title: 'x' }],
  approved: true,
  scratch: { k: 1 },
  query: null,
};

// --- propriedades -----------------------------------------------------------

describe('propriedade: o parser nunca lança', () => {
  it('para qualquer texto, incluindo unicode e pontuação solta', () => {
    fc.assert(
      fc.property(anyText, (source) => {
        expect(() => parse(source)).not.toThrow();
      }),
      { numRuns: RUNS * 2 },
    );
  });

  it('toda recusa traz código e span dentro da entrada', () => {
    fc.assert(
      fc.property(anyText, (source) => {
        const result = parse(source);
        if (result.ok) return;

        const length = codePointLength(source);
        for (const d of result.diagnostics) {
          expect(d.code).toMatch(/^AGX-E3\d\d$/);
          expect(d.span.start).toBeGreaterThanOrEqual(0);
          // O span pode chegar ao fim da entrada (erro de "faltou fechar"), mas nunca
          // além: span fora da entrada faria o CLI destacar texto que não existe.
          expect(d.span.start).toBeLessThanOrEqual(length);
          expect(d.span.end).toBeLessThanOrEqual(length);
        }
      }),
      { numRuns: RUNS * 2 },
    );
  });
});

describe('propriedade: round-trip parse → print → parse', () => {
  it('reimprimir e reparsear devolve a mesma árvore', () => {
    fc.assert(
      fc.property(expression, (source) => {
        const first = parse(source);
        if (!first.ok) return;

        const printed = print(first.value);
        const second = parse(printed);

        expect(second.ok, `reimpressão não reparseia: ${printed}`).toBe(true);
        if (!second.ok) return;

        // Comparar o `print` das duas árvores é o teste real de igualdade estrutural:
        // duas ASTs diferentes não podem imprimir igual, porque os parênteses do autor
        // estão guardados na árvore.
        expect(print(second.value)).toBe(printed);
      }),
      { numRuns: RUNS },
    );
  });

  it('é idempotente', () => {
    fc.assert(
      fc.property(expression, (source) => {
        const first = parse(source);
        if (!first.ok) return;
        const once = print(first.value);
        const again = parse(once);
        if (!again.ok) return;
        expect(print(again.value)).toBe(once);
      }),
      { numRuns: RUNS },
    );
  });
});

describe('propriedade: toda expressão termina dentro do fuel', () => {
  it('avaliação sempre para, e nunca lança', () => {
    fc.assert(
      fc.property(expression, (source) => {
        const ast = parse(source);
        if (!ast.ok) return;

        let result: ReturnType<typeof evaluate> | undefined;
        expect(() => {
          result = evaluate(ast.value, { state: STATE, fuelLimit: 5000 });
        }).not.toThrow();

        expect(result).toBeDefined();
        if (result?.ok === true) expect(result.fuelUsed).toBeLessThanOrEqual(5000);
      }),
      { numRuns: RUNS },
    );
  });

  it('fuel apertado corta a avaliação com AGX-R310 em vez de deixar rodar', () => {
    fc.assert(
      fc.property(expression, (source) => {
        const ast = parse(source);
        if (!ast.ok) return;

        const result = evaluate(ast.value, { state: STATE, fuelLimit: 1 });
        // Uma expressão de um nó só cabe em 1 de fuel; qualquer coisa maior estoura.
        if (!result.ok) expect(result.error.code).toMatch(/^AGX-R31[01]$/);
      }),
      { numRuns: RUNS },
    );
  });
});

describe('propriedade: nenhum valor não finito escapa (ADR-0004)', () => {
  it('avaliação bem-sucedida nunca devolve NaN nem Infinity', () => {
    fc.assert(
      fc.property(expression, (source) => {
        const ast = parse(source);
        if (!ast.ok) return;

        const result = evaluate(ast.value, { state: STATE });
        if (!result.ok) return;

        assertFinite(result.value);
      }),
      { numRuns: RUNS * 2 },
    );
  });

  it('nem com números extremos no estado', () => {
    fc.assert(
      fc.property(
        expression,
        fc.constantFrom(1e308, -1e308, 5e-324, Number.MAX_SAFE_INTEGER, 0),
        (source, extreme) => {
          const ast = parse(source);
          if (!ast.ok) return;

          const result = evaluate(ast.value, {
            state: { ...STATE, confidence: extreme, iteration: extreme },
          });
          if (result.ok) assertFinite(result.value);
        },
      ),
      { numRuns: RUNS },
    );
  });
});

describe('propriedade: o typechecker nunca lança e é determinista', () => {
  it('aceita qualquer AST sem quebrar', () => {
    fc.assert(
      fc.property(expression, (source) => {
        expect(() => compile(source, SCHEMA)).not.toThrow();
      }),
      { numRuns: RUNS },
    );
  });

  it('duas verificações da mesma fonte dão o mesmo resultado', () => {
    // Determinismo aqui não é detalhe: o validador roda no CI, no editor e no CLI, e
    // um diagnóstico que aparece só às vezes é pior que nenhum.
    fc.assert(
      fc.property(expression, (source) => {
        const a = compile(source, SCHEMA);
        const b = compile(source, SCHEMA);
        expect(a.ok).toBe(b.ok);
        if (!a.ok && !b.ok) {
          expect(a.diagnostics.map((d) => d.code)).toEqual(b.diagnostics.map((d) => d.code));
        }
      }),
      { numRuns: RUNS },
    );
  });
});

describe('propriedade: onde o schema enxerga, o typecheck é suficiente', () => {
  it('expressão totalmente tipada só falha por aritmética, nunca por tipo', () => {
    // É a divisão de responsabilidade que a spec promete: `E3xx` acontece ao salvar,
    // `R311` só com valores em mãos. Um erro de *tipo* escapando para o runtime, numa
    // expressão que o schema descreve por inteiro, significaria buraco no typechecker.
    fc.assert(
      fc.property(fullyTypedExpression, (source) => {
        const checked = compile(source, SCHEMA);
        if (!checked.ok) return;

        const result = evaluate(checked.value.ast, {
          state: STATE,
          patterns: checked.value.patterns,
        });
        if (result.ok) return;

        expect(result.error.code).toMatch(/^AGX-R31[01]$/);
        // Erro **aritmético** é esperado aqui; erro de **tipo** significaria buraco no
        // typechecker, e é o que estas duas IDs representam.
        expect(result.error.message.id, source).not.toBe('runtime-arith-operands');
        expect(result.error.message.id, source).not.toBe('runtime-comparison-mismatch');
      }),
      { numRuns: RUNS * 2 },
    );
  });

  it('descer em array/object é a escotilha, e ela deixa erro de tipo chegar ao runtime', () => {
    // Escrito como teste, e não como omissão, porque é uma limitação real do desenho: o
    // schema declara o **canal**, não a forma de dentro dele. `state.documents[0]` pode
    // ser qualquer coisa, e o typechecker que fingisse saber aprovaria comparações que
    // não pode garantir.
    //
    // Foi um teste de propriedade que encontrou isto — `coalesce(true, -state.documents[0])`
    // passa na verificação e falha ao avaliar. Nenhum dos testes por exemplo pegou.
    const checked = compile('-state.documents[0] > 0', SCHEMA);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;

    const result = evaluate(checked.value.ast, { state: STATE });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('AGX-R311');
  });
});

function assertFinite(value: ExprValue): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `valor não finito: ${String(value)}`).toBe(true);
    return;
  }
  if (isArray(value)) {
    for (const item of value) assertFinite(item);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) assertFinite(item);
  }
}

/** Guarda contra gerador que degenerou e passou a produzir só uma forma de nó. */
describe('sanidade do gerador', () => {
  it('produz expressões de formas variadas', () => {
    const kinds = new Set<ExprNode['kind']>();
    fc.assert(
      fc.property(expression, (source) => {
        const ast = parse(source);
        if (ast.ok) kinds.add(ast.value.kind);
      }),
      { numRuns: 300 },
    );
    // Sem esta checagem, um gerador quebrado que só emitisse literais faria todas as
    // propriedades acima passarem sem terem exercitado nada.
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });
});
