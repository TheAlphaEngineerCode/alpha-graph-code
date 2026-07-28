/**
 * Biblioteca padrão de AGX-Expr — **lista fechada** (specs/agx-expr.md §3).
 *
 * Todas as funções são puras e totais. Adicionar uma exige ADR: a lista fechada é o que
 * permite afirmar que uma expressão não tem efeito colateral sem auditar o grafo inteiro.
 *
 * Cada entrada declara a assinatura para o typechecker e a implementação para o
 * interpretador, juntas. Separá-las em dois arquivos é como as duas saem de sincronia.
 */
import { codePointLength as codePointLengthOf } from './codepoints.js';
import { ARRAY, BOOL, NUMBER, OBJECT, STRING, type BaseType, type ExprType } from './types.js';
import type { MessageRef } from './diagnostics.js';
import { msg, msg0 } from './diagnostics.js';
import { isArray, kindOf, valuesEqual, type ExprValue } from './value.js';

/** Erro de avaliação. Valor de retorno — a stdlib nunca lança (ADR-0004 §3). */
export interface EvalFailure {
  readonly message: MessageRef;
  readonly suggestion?: MessageRef;
}

export type CallResult =
  | { readonly ok: true; readonly value: ExprValue }
  | { readonly ok: false; readonly failure: EvalFailure };

const good = (value: ExprValue): CallResult => ({ ok: true, value });
const bad = (message: MessageRef, suggestion?: MessageRef): CallResult => ({
  ok: false,
  failure: suggestion === undefined ? { message } : { message, suggestion },
});

/**
 * Como cada parâmetro aceita nulidade.
 *
 * `reject` é o padrão: um argumento `T | null` é `AGX-E322`, e a saída é `coalesce`.
 * `accept` existe só para `has` e `coalesce`, que são as funções de *perguntar sobre* a
 * ausência — proibir nulo nelas tornaria impossível tratar nulo.
 */
type Nullability = 'reject' | 'accept';

export interface ParamSpec {
  /** Tipos-base aceitos. Lista vazia significa qualquer tipo. */
  readonly accepts: readonly BaseType[];
  readonly nullability: Nullability;
  /** O argumento DEVE ser literal de string (só `matches`, ADR-0003). */
  readonly literalOnly?: boolean;
}

export interface FunctionSpec {
  readonly name: string;
  readonly params: readonly ParamSpec[];
  /**
   * Tipo de retorno. Função quando depende dos argumentos — `coalesce` devolve o tipo
   * não nulo do primeiro, e `contains` aceita duas formas.
   */
  readonly returns: ExprType | ((args: readonly ExprType[]) => ExprType);
  /**
   * Restrição **entre** argumentos, que `params` sozinho não expressa.
   *
   * Existe porque `params` valida cada posição isoladamente, e assinaturas como
   * `coalesce(T?, T) → T` exigem que as duas posições concordem. Sem isto,
   * `coalesce("", 0)` é aceito, o tipo de retorno anunciado é `number`, e o valor
   * devolvido em runtime é `""`.
   */
  readonly relate?: (
    args: readonly ExprType[],
  ) => { message: MessageRef; suggestion?: MessageRef } | undefined;
  /** Custo em fuel, além do custo por nó. Proporcional ao trabalho real. */
  readonly fuelCost: (args: readonly ExprValue[]) => number;
  readonly call: (args: readonly ExprValue[], ctx: CallContext) => CallResult;
}

/** O que o interpretador entrega à stdlib. Nada além disto: sem I/O, sem host. */
export interface CallContext {
  /** Clock injetado do run. Nunca `Date.now()` — replay não reproduziria o trace. */
  readonly nowMs: number;
  /** Testa um padrão já compilado em tempo de validação. */
  readonly testPattern: (pattern: string, input: string) => boolean;
}

const anyType = (accepts: readonly BaseType[], nullability: Nullability = 'reject'): ParamSpec => ({
  accepts,
  nullability,
});

const arg = (args: readonly ExprValue[], i: number): ExprValue => args[i] ?? null;

const asString = (v: ExprValue): string => (typeof v === 'string' ? v : '');

/** Comprimento em **code points**, não em unidades UTF-16 (specs/agx-expr.md §8). */
const codePointLength = codePointLengthOf;

function finiteOrFail(value: number, what: string): CallResult {
  if (!Number.isFinite(value)) {
    return bad(msg('fn-non-finite-result', { fn: what }), msg0('no-nan-no-infinity'));
  }
  return good(value);
}

export const STDLIB: Readonly<Record<string, FunctionSpec>> = {
  len: {
    name: 'len',
    params: [anyType(['string', 'array', 'object'])],
    returns: NUMBER,
    fuelCost: (args) => (kindOf(arg(args, 0)) === 'object' ? 2 : 1),
    call: (args) => {
      const value = arg(args, 0);
      if (typeof value === 'string') return good(codePointLength(value));
      if (isArray(value)) return good(value.length);
      if (value !== null && typeof value === 'object') return good(Object.keys(value).length);
      return bad(msg('len-not-applicable', { kind: kindOf(value) }));
    },
  },

  has: {
    name: 'has',
    // Única função que aceita caminho ausente ou nulo: é a que existe para perguntar
    // isso. O interpretador entrega `null` quando o caminho não resolve.
    params: [anyType([], 'accept')],
    returns: BOOL,
    fuelCost: () => 1,
    call: (args) => good(arg(args, 0) !== null),
  },

  matches: {
    name: 'matches',
    params: [
      anyType(['string']),
      { accepts: ['string'], nullability: 'reject', literalOnly: true },
    ],
    returns: BOOL,
    // Proporcional ao tamanho da entrada: é o custo real da simulação do NFA, e é o que
    // faz o fuel cobrar por trabalho e não por chamada.
    fuelCost: (args) => 1 + codePointLength(asString(arg(args, 0))),
    call: (args, ctx) => good(ctx.testPattern(asString(arg(args, 1)), asString(arg(args, 0)))),
  },

  lower: {
    name: 'lower',
    params: [anyType(['string'])],
    returns: STRING,
    fuelCost: (args) => 1 + codePointLength(asString(arg(args, 0))),
    call: (args) => good(asString(arg(args, 0)).toLowerCase()),
  },

  upper: {
    name: 'upper',
    params: [anyType(['string'])],
    returns: STRING,
    fuelCost: (args) => 1 + codePointLength(asString(arg(args, 0))),
    call: (args) => good(asString(arg(args, 0)).toUpperCase()),
  },

  coalesce: {
    name: 'coalesce',
    // O único caminho de `T | null` para `T`. O segundo argumento é o default, e por
    // isso não pode ser nulo — senão `coalesce` devolveria `T | null` e não resolveria
    // nada.
    params: [anyType([], 'accept'), anyType([], 'reject')],
    // A assinatura é `(T?, T) → T`: as duas posições precisam concordar, e é `relate`
    // que verifica isso. O retorno vem do padrão, que é sempre não nulo.
    relate: (args) => {
      const [value, fallback] = args;
      if (value === undefined || fallback === undefined) return undefined;
      // `base: 'null'` cobre tanto o literal `null` quanto o tipo desconhecido: nos dois
      // casos não há o que confrontar, e inventar uma exigência daria erro falso.
      if (value.base === 'null' || fallback.base === 'null') return undefined;
      if (value.base === fallback.base) return undefined;

      return {
        message: msg('coalesce-type-mismatch', { value: value.base, fallback: fallback.base }),
        suggestion: msg0('coalesce-type-mismatch-hint'),
      };
    },
    returns: (args) => args[1] ?? STRING,
    fuelCost: () => 1,
    call: (args) => {
      return good(arg(args, 0) ?? arg(args, 1));
    },
  },

  startsWith: {
    name: 'startsWith',
    params: [anyType(['string']), anyType(['string'])],
    returns: BOOL,
    fuelCost: (args) => 1 + codePointLength(asString(arg(args, 1))),
    call: (args) => good(asString(arg(args, 0)).startsWith(asString(arg(args, 1)))),
  },

  endsWith: {
    name: 'endsWith',
    params: [anyType(['string']), anyType(['string'])],
    returns: BOOL,
    fuelCost: (args) => 1 + codePointLength(asString(arg(args, 1))),
    call: (args) => good(asString(arg(args, 0)).endsWith(asString(arg(args, 1)))),
  },

  contains: {
    name: 'contains',
    // Duas formas: substring em string, pertencimento em array. Diferente de `in`, aqui
    // a ambiguidade é aceitável porque o nome descreve as duas leituras igualmente bem.
    params: [anyType(['string', 'array']), anyType([])],
    returns: BOOL,
    fuelCost: (args) => {
      const haystack = arg(args, 0);
      if (typeof haystack === 'string') return 1 + codePointLength(haystack);
      return isArray(haystack) ? 1 + haystack.length : 1;
    },
    call: (args) => {
      const haystack = arg(args, 0);
      const needle = arg(args, 1);

      if (typeof haystack === 'string') {
        if (typeof needle !== 'string') {
          return bad(msg('contains-needs-string', { kind: kindOf(needle) }));
        }
        return good(haystack.includes(needle));
      }
      if (isArray(haystack)) {
        return good(haystack.some((item) => valuesEqual(item, needle)));
      }
      return bad(msg('contains-not-applicable', { kind: kindOf(haystack) }));
    },
  },

  int: {
    name: 'int',
    params: [anyType(['number', 'string', 'bool'])],
    returns: NUMBER,
    fuelCost: () => 1,
    call: (args) => {
      const converted = toNumber(arg(args, 0));
      if (converted === undefined)
        return bad(msg('int-cannot-convert', { value: formatForError(arg(args, 0)) }));
      return finiteOrFail(Math.trunc(converted), 'int()');
    },
  },

  float: {
    name: 'float',
    params: [anyType(['number', 'string', 'bool'])],
    returns: NUMBER,
    fuelCost: () => 1,
    call: (args) => {
      const converted = toNumber(arg(args, 0));
      if (converted === undefined) {
        return bad(msg('float-cannot-convert', { value: formatForError(arg(args, 0)) }));
      }
      return finiteOrFail(converted, 'float()');
    },
  },

  bool: {
    name: 'bool',
    params: [anyType(['bool', 'number', 'string'])],
    returns: BOOL,
    fuelCost: () => 1,
    call: (args) => {
      const value = arg(args, 0);
      if (typeof value === 'boolean') return good(value);
      if (typeof value === 'number') return good(value !== 0);
      if (typeof value === 'string') {
        if (value === 'true') return good(true);
        if (value === 'false') return good(false);
        // Sem conversão por "string não vazia": `bool("false")` valendo `true` seria a
        // coerção mais traiçoeira possível num operando de branch.
        return bad(
          msg('bool-string-domain', { value: JSON.stringify(value) }),
          msg0('bool-string-domain-hint'),
        );
      }
      return bad(msg('bool-not-applicable', { kind: kindOf(value) }));
    },
  },

  now: {
    name: 'now',
    params: [],
    returns: NUMBER,
    fuelCost: () => 1,
    // Determinístico por construção: lê o clock injetado do run. `Date.now()` aqui
    // quebraria "mesma entrada + mesma cassette = mesmo trace".
    call: (_args, ctx) => good(ctx.nowMs),
  },
};

export const STDLIB_NAMES: readonly string[] = Object.keys(STDLIB);

function toNumber(value: ExprValue): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function formatForError(value: ExprValue): string {
  return typeof value === 'string' ? JSON.stringify(value) : kindOf(value);
}

export { ARRAY, BOOL, NUMBER, OBJECT, STRING };
