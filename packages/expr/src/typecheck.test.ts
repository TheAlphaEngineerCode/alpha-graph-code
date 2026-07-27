import { describe, expect, it } from 'vitest';
import { compile } from './index.js';
import type { ChannelSchema } from './types.js';

/** Espelha o exemplo de `specs/ir-v1.md` §2, inclusive os canais com `initial: null`. */
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
    errors: { type: 'array' },
  },
};

function check(source: string) {
  return compile(source, SCHEMA);
}

function accepts(source: string): void {
  const result = check(source);
  if (!result.ok) {
    throw new Error(
      `recusou \`${source}\`: ${result.diagnostics.map((d) => d.message).join('; ')}`,
    );
  }
}

function rejects(source: string, code: string) {
  const result = check(source);
  expect(result.ok, `esperava recusar \`${source}\``).toBe(false);
  if (result.ok) throw new Error('inalcançável');
  expect(result.diagnostics[0]?.code).toBe(code);
  return result.diagnostics[0];
}

describe('o que a linguagem existe para pegar', () => {
  it('canal com erro de digitação falha ao salvar, com o nome certo na sugestão', () => {
    // É o exemplo da spec. Numa linguagem dinâmica viraria `undefined < 0.8 === false`
    // e um branch errado, silencioso, em produção.
    const d = rejects('state.confidenc < 0.8', 'AGX-E310');
    expect(d?.suggestion).toContain('state.confidence');
  });

  it('sugere mesmo com letras trocadas de lugar', () => {
    const d = rejects('state.cofnidence > 0', 'AGX-E310');
    expect(d?.suggestion).toContain('confidence');
  });

  it('não inventa sugestão quando nada é parecido', () => {
    // Sugestão errada é pior que nenhuma: manda investigar o lugar errado.
    const d = rejects('state.zzzzzzzz > 0', 'AGX-E310');
    expect(d?.suggestion).not.toContain('Você quis dizer');
  });

  it('comparar número com string é erro, não `false`', () => {
    rejects('state.iteration == "3"', 'AGX-E321');
  });

  it('função fora da lista fechada é recusada com sugestão', () => {
    const d = rejects('lenght(state.findings) > 0', 'AGX-E311');
    expect(d?.suggestion).toContain('len');
  });

  it('aridade errada é recusada', () => {
    rejects('len(state.findings, 2) > 0', 'AGX-E312');
  });
});

describe('nulidade (ADR-0005)', () => {
  it('permite perguntar se foi preenchido', () => {
    accepts('state.query == null');
    accepts('state.decision != null');
  });

  it('permite igualdade contra valor mesmo quando o canal é anulável', () => {
    accepts('state.decision == "approve"');
  });

  it('recusa ordenação sobre valor possivelmente nulo', () => {
    rejects('state.query > "a"', 'AGX-E322');
  });

  it('recusa aritmética sobre valor possivelmente nulo', () => {
    rejects('state.query + "!"', 'AGX-E322');
  });

  it('recusa argumento anulável em função que não trata nulo', () => {
    const d = rejects('len(state.query) > 0', 'AGX-E322');
    expect(d?.suggestion).toContain('coalesce');
  });

  it('`coalesce` é a saída, e destrava as três recusas acima', () => {
    accepts('coalesce(state.query, "") > "a"');
    accepts('coalesce(state.query, "") + "!"');
    accepts('len(coalesce(state.query, "")) > 0');
  });

  it('`coalesce` exige que o padrão seja do mesmo tipo do valor', () => {
    // A assinatura do ADR-0005 é `(T?, T) → T`. Sem verificar a relação entre os dois
    // argumentos, `coalesce("", 0)` era aceito, o tipo anunciado era `number` e o valor
    // devolvido era `""` — um erro de tipo que o typecheck deixava passar para o runtime.
    // Encontrado por teste de propriedade, não por exemplo.
    const d = rejects('-coalesce("", 0) > 1', 'AGX-E320');
    expect(d?.suggestion).toContain('mesmo tipo');
    accepts('coalesce(state.query, "padrão") == "x"');
  });

  it('`has` aceita caminho anulável — é a função de perguntar sobre ausência', () => {
    accepts('has(state.query)');
    accepts('has(state.documents[0])');
  });

  it('registra a lacuna: não há narrowing por fluxo', () => {
    // `state.query != null && len(state.query) > 0` é seguro para um humano e continua
    // recusado. Está declarado como lacuna em specs/agx-expr.md §8, e o teste existe
    // para que afrouxar isso na Fase 2 seja uma mudança deliberada, não acidental.
    rejects('state.query != null && len(state.query) > 0', 'AGX-E322');
  });
});

describe('ordenação e igualdade', () => {
  it('aceita ordem entre números e entre strings', () => {
    accepts('state.confidence >= 0.8');
    accepts('state.decision == "x"');
  });

  it('recusa ordem sobre bool, array e object', () => {
    rejects('state.approved > true', 'AGX-E321');
    rejects('state.findings > state.documents', 'AGX-E321');
    rejects('state.scratch < state.scratch', 'AGX-E321');
  });

  it('recusa ordem entre tipos diferentes', () => {
    rejects('state.confidence > "0.8"', 'AGX-E321');
  });
});

describe('`in` é pertencimento, nunca substring', () => {
  it('aceita sobre array e object', () => {
    accepts('"x" in state.findings');
    accepts('"chave" in state.scratch');
  });

  it('recusa sobre string e aponta `contains`', () => {
    const d = rejects('"ab" in state.decision', 'AGX-E321');
    expect(d?.suggestion).toContain('contains');
  });

  it('recusa chave não string em object', () => {
    rejects('state.iteration in state.scratch', 'AGX-E321');
  });
});

describe('aritmética e booleanos', () => {
  it('aceita número com número, e string com string em `+`', () => {
    accepts('state.iteration + 1 > 3');
    accepts('state.decision == "a" || state.approved');
    accepts('coalesce(state.query, "") + "!" == "x!"');
  });

  it('recusa `+` misturando string e número — a coerção que gera "11"', () => {
    rejects('state.iteration + "1" > 0', 'AGX-E320');
  });

  it('recusa valor não booleano em `&&`', () => {
    const d = rejects('state.iteration && state.approved', 'AGX-E320');
    expect(d?.suggestion).toContain('explicitamente');
  });

  it('recusa `!` sobre não booleano', () => {
    rejects('!state.iteration', 'AGX-E320');
  });
});

describe('matches: padrão literal, validado ao salvar (ADR-0003)', () => {
  it('aceita padrão literal válido', () => {
    accepts('matches(coalesce(state.query, ""), "^[a-z]+$")');
  });

  it('recusa padrão vindo do estado', () => {
    const d = rejects('matches(coalesce(state.query, ""), state.decision)', 'AGX-E330');
    expect(d?.suggestion).toContain('não pode vir do estado');
  });

  it('recusa regex inválida em tempo de validação, e não de execução', () => {
    rejects('matches(coalesce(state.query, ""), "[a-")', 'AGX-E330');
    rejects('matches(coalesce(state.query, ""), "(a)\\\\1")', 'AGX-E330');
  });

  it('entrega o padrão já compilado, para o interpretador não compilar nada', () => {
    const result = check('matches(coalesce(state.query, ""), "^\\\\d+$")');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.patterns.size).toBe(1);
  });
});

describe('raízes de caminho', () => {
  it('aceita campos de `run`', () => {
    accepts('run.attempt > 1');
    accepts('run.step < 100');
  });

  it('recusa campo inexistente em `run`, com sugestão', () => {
    const d = rejects('run.attemp > 1', 'AGX-E310');
    expect(d?.suggestion).toContain('run.attempt');
  });

  it('trata como desconhecido o que o schema de canais não descreve', () => {
    // `documents[0].title` pode ser qualquer coisa: o schema descreve o canal, não a
    // forma de dentro. Inventar `string` faria o typechecker aprovar o que não garante.
    accepts('state.documents[0].title == "x"');
    accepts('state.documents[0].score > 1');
  });

  it('verifica `in.*` quando as entradas do nó são declaradas', () => {
    const result = compile('in.pergunta > "a"', SCHEMA, {
      inputs: { pergunta: { base: 'string', nullable: false } },
    });
    expect(result.ok).toBe(true);

    const wrong = compile('in.perguta > "a"', SCHEMA, {
      inputs: { pergunta: { base: 'string', nullable: false } },
    });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.diagnostics[0]?.suggestion).toContain('pergunta');
  });
});

describe('o typechecker não lança', () => {
  it('aceita qualquer AST sem quebrar', () => {
    const sources = [
      'state.x',
      'state',
      'run',
      'in',
      'len()',
      'now()',
      'coalesce(state.query)',
      'matches(1, 2)',
      '((((state.confidence))))',
      'state.documents[999999]',
    ];
    for (const source of sources) {
      expect(() => compile(source, SCHEMA), source).not.toThrow();
    }
  });

  it('reporta o primeiro erro sem cascatear derivados', () => {
    // Depois de um erro, o typechecker devolve um tipo neutro. Sem isso, um canal
    // inexistente geraria também erros de tipo em todo operador acima dele, e o defeito
    // real sumiria no ruído.
    const result = check('state.inexistente > 0 && state.tambemNao < 1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.every((d) => d.code === 'AGX-E310')).toBe(true);
  });
});
