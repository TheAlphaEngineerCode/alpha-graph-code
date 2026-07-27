/**
 * Superfície pública que `graph-core` vai consumir na Fase 2.
 *
 * Estava exportada e sem teste. Exportar sem exercitar é como uma função entra na API
 * com um defeito que só aparece no primeiro consumidor — e aí o defeito chega junto com
 * a integração, que é o pior momento para descobri-lo.
 */
import { describe, expect, it } from 'vitest';
import { walk, type ExprNode } from './ast.js';
import { closestName, editDistance, formatDiagnostic, diagnostic } from './diagnostics.js';
import { parse } from './parser.js';
import { formatType, nonNull, nullable, type ExprType } from './types.js';
import { formatValue, kindOf, valuesEqual } from './value.js';

function ast(source: string): ExprNode {
  const result = parse(source);
  if (!result.ok) throw new Error(result.diagnostics[0]?.message ?? 'parse falhou');
  return result.value;
}

describe('walk — percurso da AST', () => {
  it('visita todos os nós de uma expressão composta', () => {
    const kinds: ExprNode['kind'][] = [];
    walk(ast('len(state.a) > 0 && !(state.b == "x")'), (node) => kinds.push(node.kind));

    expect(kinds).toContain('binary');
    expect(kinds).toContain('call');
    expect(kinds).toContain('path');
    expect(kinds).toContain('literal');
    expect(kinds).toContain('unary');
    expect(kinds).toContain('group');
  });

  it('visita os argumentos de chamada na ordem em que foram escritos', () => {
    // A ordem importa para quem monta o grafo de dependência de dados: o primeiro
    // argumento lido é o primeiro caminho a considerar.
    const paths: string[] = [];
    walk(ast('coalesce(state.primeiro, state.segundo)'), (node) => {
      if (node.kind === 'path')
        paths.push(node.steps[0]?.kind === 'field' ? node.steps[0].name : '');
    });
    expect(paths).toEqual(['primeiro', 'segundo']);
  });

  it('é iterativo: aninhamento no limite do parser não estoura a pilha', () => {
    // O percurso é iterativo de propósito. Recursivo, ele derrubaria o processo do host
    // com a AST mais profunda que o parser aceita — e é o processo do host que a
    // promessa de "nunca lança" protege.
    const deep = `${'('.repeat(120)}1${')'.repeat(120)}`;
    let visited = 0;
    expect(() => {
      walk(ast(deep), () => (visited += 1));
    }).not.toThrow();
    expect(visited).toBeGreaterThan(120);
  });
});

describe('limite de profundidade do parser', () => {
  const nested = (n: number): string => `${'('.repeat(n)}1${')'.repeat(n)}`;

  it('aceita aninhamento realista', () => {
    expect(parse(nested(50)).ok).toBe(true);
    expect(parse(nested(120)).ok).toBe(true);
  });

  it('recusa aninhamento absurdo com diagnóstico, e não com RangeError', () => {
    // Este teste existe por causa de um defeito real: sem o limite, a descida recursiva
    // gastava ~7 quadros de pilha por nível e 2000 parênteses derrubavam o processo com
    // `RangeError` — que escapa do `Result` e quebra a promessa de que analisar nunca
    // lança. O arquivo de grafo vem de terceiro, e `agx validate` promete não executar
    // nada; derrubar o processo de quem abriu o arquivo é falha de segurança, não de UX.
    for (const depth of [200, 5_000, 50_000]) {
      const result = parse(nested(depth));
      expect(result.ok, `profundidade ${String(depth)}`).toBe(false);
      if (result.ok) continue;
      expect(result.diagnostics[0]?.code).toBe('AGX-E302');
      expect(result.diagnostics[0]?.message).toContain('aninhada');
    }
  });

  it('o mesmo vale para unário encadeado', () => {
    expect(parse(`${'!'.repeat(50)}true`).ok).toBe(true);
    expect(parse(`${'!'.repeat(5_000)}true`).ok).toBe(false);
  });

  it('nenhuma profundidade faz o parser lançar', () => {
    for (const depth of [1, 128, 129, 1_000, 100_000]) {
      expect(() => parse(nested(depth)), `profundidade ${String(depth)}`).not.toThrow();
    }
  });
});

describe('formatDiagnostic — o que o CLI imprime', () => {
  const d = diagnostic(
    'AGX-E310',
    'Canal desconhecido: `confidenc`.',
    { start: 6, end: 16 },
    'Você quis dizer `state.confidence`?',
  );

  it('mostra o trecho da expressão quando a fonte é conhecida', () => {
    const text = formatDiagnostic(d, 'state.confidenc >= 0.8');
    expect(text).toContain('AGX-E310');
    expect(text).toContain('confidenc');
    expect(text).toContain('→ Você quis dizer');
  });

  it('cai para a posição quando não há fonte', () => {
    expect(formatDiagnostic(d)).toContain('AGX-E310 6:');
  });

  it('mostra coluna quando o span é vazio', () => {
    const vazio = diagnostic('AGX-E302', 'Falta `)`.', { start: 5, end: 5 });
    expect(formatDiagnostic(vazio, 'len(x')).toContain('coluna 6');
  });

  it('omite a seta quando não há sugestão', () => {
    const sem = diagnostic('AGX-E302', 'Sintaxe inválida.', { start: 0, end: 1 });
    expect(formatDiagnostic(sem, 'x')).not.toContain('→');
  });
});

describe('editDistance e closestName', () => {
  it('conta transposição como uma edição, não duas', () => {
    // Levenshtein pura cobra 2 por letras trocadas de lugar, e isso costuma passar do
    // limite e perder a sugestão — justamente no erro de digitação mais comum.
    expect(editDistance('cofnidence', 'confidence')).toBe(1);
    expect(editDistance('confidenc', 'confidence')).toBe(1);
    expect(editDistance('abc', 'abc')).toBe(0);
    expect(editDistance('', 'abc')).toBe(3);
  });

  it('sugere só quando há candidato próximo o bastante', () => {
    const canais = ['confidence', 'documents', 'findings'];
    expect(closestName('confidenc', canais)).toBe('confidence');
    expect(closestName('documnets', canais)).toBe('documents');
    expect(closestName('zzzzzzzzzz', canais)).toBeUndefined();
  });

  it('ignora diferença de caixa', () => {
    expect(closestName('Confidence', ['confidence'])).toBe('confidence');
  });

  it('não sugere nada quando não há candidato', () => {
    expect(closestName('qualquer', [])).toBeUndefined();
  });
});

describe('tipos', () => {
  const s: ExprType = { base: 'string', nullable: false };

  it('formata com e sem nulidade', () => {
    expect(formatType(s)).toBe('string');
    expect(formatType(nullable(s))).toBe('string | null');
    expect(formatType({ base: 'null', nullable: true })).toBe('null');
  });

  it('nullable e nonNull são idempotentes', () => {
    expect(nullable(nullable(s))).toEqual(nullable(s));
    expect(nonNull(nonNull(s))).toEqual(s);
    expect(nonNull(nullable(s))).toEqual(s);
  });
});

describe('valores', () => {
  it('kindOf distingue os seis tipos', () => {
    expect(kindOf(null)).toBe('null');
    expect(kindOf(true)).toBe('bool');
    expect(kindOf(1)).toBe('number');
    expect(kindOf('x')).toBe('string');
    expect(kindOf([])).toBe('array');
    expect(kindOf({})).toBe('object');
  });

  it('valuesEqual compara estruturas aninhadas', () => {
    expect(valuesEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(valuesEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
    expect(valuesEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(valuesEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(valuesEqual({ a: 1 }, { b: 1 })).toBe(false);
    expect(valuesEqual(1, '1')).toBe(false);
  });

  it('formatValue trunca em vez de despejar o valor inteiro', () => {
    // Mensagem de erro não é dump: um canal com mil itens tornaria o diagnóstico
    // ilegível justamente quando ele mais precisa ser lido.
    const longo = formatValue({ texto: 'x'.repeat(500) });
    expect(longo.length).toBeLessThanOrEqual(60);
    expect(longo.endsWith('…')).toBe(true);
    expect(formatValue(42)).toBe('42');
    expect(formatValue(null)).toBe('null');
  });
});
