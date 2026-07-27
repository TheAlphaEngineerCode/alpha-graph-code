import { describe, expect, it } from 'vitest';
import { compile, evaluate, parse, type EvaluationContext, type ExprValue } from './index.js';
import type { ChannelSchema } from './types.js';

const SCHEMA: ChannelSchema = {
  channels: {
    query: { type: 'string', initialIsNull: true },
    documents: { type: 'array' },
    findings: { type: 'array' },
    confidence: { type: 'number' },
    scratch: { type: 'object' },
    decision: { type: 'string', initialIsNull: true },
    iteration: { type: 'number' },
    approved: { type: 'bool' },
    calls: { type: 'number' },
    cost: { type: 'number' },
  },
};

const STATE: Record<string, ExprValue> = {
  query: 'relatório trimestral',
  documents: [
    { title: 'A', score: 3 },
    { title: 'B', score: 9 },
  ],
  findings: ['x', 'y'],
  confidence: 0.82,
  scratch: { fonte: 'web', paginas: 12 },
  decision: null,
  iteration: 2,
  approved: true,
  calls: 0,
  cost: 5,
};

/** Avalia por meio do pipeline completo — é como `graph-core` vai usar. */
function run(source: string, ctx: Partial<EvaluationContext> = {}) {
  const compiled = compile(source, SCHEMA);
  if (!compiled.ok) {
    throw new Error(`${source}: ${compiled.diagnostics.map((d) => d.message).join('; ')}`);
  }
  return evaluate(compiled.value.ast, {
    state: STATE,
    patterns: compiled.value.patterns,
    ...ctx,
  });
}

function value(source: string, ctx: Partial<EvaluationContext> = {}): ExprValue {
  const result = run(source, ctx);
  if (!result.ok) throw new Error(`${source}: ${result.error.message}`);
  return result.value;
}

function failure(source: string, ctx: Partial<EvaluationContext> = {}) {
  const result = run(source, ctx);
  expect(result.ok, `esperava falhar: ${source}`).toBe(false);
  if (result.ok) throw new Error('inalcançável');
  return result.error;
}

describe('avaliação básica', () => {
  it('lê canais e compara', () => {
    expect(value('state.confidence >= 0.8')).toBe(true);
    expect(value('state.iteration < 3')).toBe(true);
    expect(value('state.approved')).toBe(true);
  });

  it('desce em array e object', () => {
    expect(value('state.documents[1].title == "B"')).toBe(true);
    expect(value('state.documents[0].score > 5')).toBe(false);
  });

  it('caminho inexistente resolve para null, e `has` é a pergunta', () => {
    // Ler `documents[99]` antes de haver documento é caso normal num grafo, não erro.
    expect(value('has(state.documents[99])')).toBe(false);
    expect(value('has(state.documents[0])')).toBe(true);
    expect(value('state.decision == null')).toBe(true);
  });

  it('`in` testa pertencimento em array e chave em object', () => {
    expect(value('"x" in state.findings')).toBe(true);
    expect(value('"z" in state.findings')).toBe(false);
    expect(value('"fonte" in state.scratch')).toBe(true);
  });
});

describe('curto-circuito é semântico, não otimização', () => {
  it('não avalia o lado direito quando o esquerdo já decide', () => {
    // Sem curto-circuito, esta expressão dividiria por zero. Com ele, o guarda funciona
    // — que é exatamente como se escreve a proteção num grafo real.
    expect(value('state.calls > 0 && state.cost / state.calls > 1')).toBe(false);
    expect(value('state.approved || state.cost / state.calls > 1')).toBe(true);
  });
});

describe('modelo numérico (ADR-0004)', () => {
  it('divisão por zero é erro, e não Infinity', () => {
    // Com `Infinity`, `state.cost / state.calls >= 0.5` seria `true` e rotearia para o
    // caminho caro sem nenhum sinal no trace.
    const error = failure('state.cost / state.calls >= 0.5');
    expect(error.code).toBe('AGX-R311');
    expect(error.message).toContain('Divisão por zero');
    expect(error.suggestion).toContain('state.calls > 0');
  });

  it('resto por zero também é erro', () => {
    expect(failure('state.cost % state.calls == 0').code).toBe('AGX-R311');
  });

  it('overflow é erro, e não Infinity nem saturação', () => {
    const error = failure('1e308 * 10 > 0');
    expect(error.code).toBe('AGX-R311');
    expect(error.message).toContain('fora da faixa');
  });

  it('underflow para zero é permitido', () => {
    // Perde precisão, mas não inverte comparação — diferente de Infinity.
    expect(value('1e-320 / 1e10 == 0')).toBe(true);
  });

  it('comparação é exata, sem epsilon', () => {
    // Um epsilon implícito tornaria `==` não transitivo, e transitividade quebrada num
    // operador que decide roteamento é pior que a surpresa do ponto flutuante.
    expect(value('0.1 + 0.2 == 0.3')).toBe(false);
  });

  it('conversão inválida é erro', () => {
    expect(failure('int("abc") > 0').code).toBe('AGX-R311');
    expect(value('int("42") == 42')).toBe(true);
    expect(value('int(3.9) == 3')).toBe(true);
    expect(value('int(-3.9) == -3')).toBe(true);
  });

  it('`bool` sobre string aceita apenas "true" e "false"', () => {
    // `bool("false") === true` seria a coerção mais traiçoeira possível num operando de
    // branch, e é o comportamento de linguagem com "string não vazia é verdadeira".
    expect(value('bool("true")')).toBe(true);
    expect(value('bool("false")')).toBe(false);
    expect(failure('bool("sim")').code).toBe('AGX-R311');
  });
});

describe('igualdade estrutural (ADR-0005)', () => {
  it('compara array e object por conteúdo, não por referência', () => {
    expect(value('state.findings == state.findings')).toBe(true);
    expect(value('state.scratch == state.scratch')).toBe(true);
  });

  it('ordem das chaves não muda o valor de um object', () => {
    const result = evaluate(unwrap(parse('state.a == state.b')), {
      state: { a: { x: 1, y: 2 }, b: { y: 2, x: 1 } },
    });
    expect(result.ok && result.value).toBe(true);
  });
});

describe('biblioteca padrão', () => {
  it('len conta code points, itens e chaves', () => {
    expect(value('len(coalesce(state.query, "")) == 20')).toBe(true);
    expect(value('len(state.findings) == 2')).toBe(true);
    expect(value('len(state.scratch) == 2')).toBe(true);
  });

  it('len conta emoji como um caractere', () => {
    const result = evaluate(unwrap(parse('len(state.s)')), { state: { s: '😀😀' } });
    expect(result.ok && result.value).toBe(2);
  });

  it('contains cobre substring e pertencimento', () => {
    expect(value('contains(coalesce(state.query, ""), "trimestral")')).toBe(true);
    expect(value('contains(state.findings, "y")')).toBe(true);
    expect(value('contains(state.findings, "z")')).toBe(false);
  });

  it('coalesce devolve o padrão quando o valor é nulo', () => {
    expect(value('coalesce(state.decision, "pendente") == "pendente"')).toBe(true);
    expect(value('coalesce(state.query, "vazio") != "vazio"')).toBe(true);
  });

  it('matches usa o padrão compilado na validação', () => {
    expect(value('matches(coalesce(state.query, ""), "^relat")')).toBe(true);
    expect(value('matches(coalesce(state.query, ""), "^xyz")')).toBe(false);
  });

  it('now lê o clock injetado, nunca o relógio do host', () => {
    // `Date.now()` aqui quebraria "mesma entrada + mesma cassette = mesmo trace".
    expect(value('now() == 1700000000000', { nowMs: 1_700_000_000_000 })).toBe(true);
    expect(value('now() == 0')).toBe(true);
  });
});

describe('limite de fuel', () => {
  it('expressão grande demais falha com AGX-R310 em vez de esperar', () => {
    const deep = `1 + ${'1 + '.repeat(200)}1`;
    const ast = unwrap(parse(deep));

    const generous = evaluate(ast, { state: {} });
    expect(generous.ok).toBe(true);

    const tight = evaluate(ast, { state: {}, fuelLimit: 20 });
    expect(tight.ok).toBe(false);
    if (!tight.ok) expect(tight.error.code).toBe('AGX-R310');
  });

  it('o fuel de `matches` cresce com a entrada, não por chamada', () => {
    // Cobrar por chamada deixaria `matches` sobre 1 MB custar o mesmo que sobre 3
    // caracteres, e o teto pararia de significar tempo.
    const ast = unwrap(parse('matches(state.s, "a")'));
    const patterns = (() => {
      const compiled = compile('matches("x", "a")', { channels: {} });
      return compiled.ok ? compiled.value.patterns : new Map();
    })();

    const short = evaluate(ast, { state: { s: 'aaa' }, patterns });
    const long = evaluate(ast, { state: { s: 'a'.repeat(500) }, patterns });

    expect(short.ok && long.ok).toBe(true);
    if (!short.ok || !long.ok) return;
    expect(long.fuelUsed).toBeGreaterThan(short.fuelUsed * 10);
  });

  it('reporta o fuel consumido em execução bem-sucedida', () => {
    const result = run('state.confidence >= 0.8');
    expect(result.ok && result.fuelUsed).toBeGreaterThan(0);
  });
});

describe('o interpretador nunca lança', () => {
  it('sobrevive a AST com tipos errados — sem passar pelo typechecker', () => {
    // O typechecker deveria ter pego tudo isto. O interpretador não confia nisso: um
    // chamador pode montar a AST à mão, e a promessa de não lançar vale sempre.
    const hostile = [
      'state.a + state.b',
      'state.a > state.b',
      '-state.a',
      '!state.a',
      'state.a in state.b',
      'len(state.a)',
      'int(state.a)',
      'contains(state.a, state.b)',
      'matches(state.a, "x")',
      'state.a[0].b.c[1]',
    ];

    const weird: Record<string, ExprValue> = {
      a: { nested: [1, 2] },
      b: null,
    };

    for (const source of hostile) {
      expect(() => evaluate(unwrap(parse(source)), { state: weird }), source).not.toThrow();
    }
  });

  it('estado ausente não quebra a avaliação', () => {
    expect(() => evaluate(unwrap(parse('state.qualquer > 1')), { state: {} })).not.toThrow();
  });

  it('o primeiro erro vence, e não é sobrescrito por um derivado', () => {
    // Sobrescrever faria a mensagem final apontar para uma falha consequente, e quem lê
    // o trace procuraria no lugar errado.
    const result = evaluate(unwrap(parse('(1 / 0) + (2 / 0)')), { state: {} });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('Divisão por zero');
  });
});

function unwrap(result: ReturnType<typeof parse>) {
  if (!result.ok) throw new Error(result.diagnostics[0]?.message ?? 'parse falhou');
  return result.value;
}
