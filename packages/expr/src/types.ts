/**
 * Modelo de tipos de AGX-Expr.
 *
 * A nulidade faz parte do tipo, e não é detalhe: um canal declarado
 * `{ type: string, initial: null }` tem tipo `string | null`. Um typechecker que ignore
 * isso aceita `state.query + "!"` e entrega `"null!"` em produção
 * (specs/agx-expr.md §5.1, ADR-0005).
 */

export const BASE_TYPES = ['string', 'number', 'bool', 'array', 'object'] as const;
export type BaseType = (typeof BASE_TYPES)[number];

/** `null` sozinho é o tipo do literal `null`, antes de encontrar com o que se unir. */
export interface ExprType {
  readonly base: BaseType | 'null';
  readonly nullable: boolean;
}

export const NULL_TYPE: ExprType = { base: 'null', nullable: true };

export function type(base: BaseType, nullable = false): ExprType {
  return { base, nullable };
}

export const STRING = type('string');
export const NUMBER = type('number');
export const BOOL = type('bool');
export const ARRAY = type('array');
export const OBJECT = type('object');

export function nullable(t: ExprType): ExprType {
  return t.nullable ? t : { base: t.base, nullable: true };
}

/** Remove a nulidade. Usado por `coalesce`, o único caminho de `T | null` para `T`. */
export function nonNull(t: ExprType): ExprType {
  return t.nullable ? { base: t.base, nullable: false } : t;
}

export function isNullType(t: ExprType): boolean {
  return t.base === 'null';
}

export function formatType(t: ExprType): string {
  if (t.base === 'null') return 'null';
  return t.nullable ? `${t.base} | null` : t.base;
}

/** Dois tipos são compatíveis quando um valor de um pode ser comparado ao do outro. */
export function sameBase(a: ExprType, b: ExprType): boolean {
  return a.base === b.base;
}

/** Só `number` e `string` são ordenáveis (ADR-0005 §3). */
export function isOrderable(t: ExprType): boolean {
  return !t.nullable && (t.base === 'number' || t.base === 'string');
}

/**
 * Declaração de um canal, como o validador da IR a entrega ao typechecker.
 *
 * `packages/expr` não conhece a IR — recebe esta forma reduzida. É o que mantém o pacote
 * isolado e testável sem `graph-core` (invariante 9 e prompt da Fase 1).
 */
export interface ChannelDecl {
  readonly type: BaseType;
  /** `true` quando o canal declara `initial: null`, tornando o tipo `T | null`. */
  readonly initialIsNull?: boolean;
}

export interface ChannelSchema {
  readonly channels: Readonly<Record<string, ChannelDecl>>;
}

export function channelType(decl: ChannelDecl): ExprType {
  return type(decl.type, decl.initialIsNull === true);
}

/**
 * Metadados do run, visíveis pela raiz `run`. Fixos e não configuráveis: a raiz existe
 * para o grafo poder decidir por tentativa e por passo, não para virar um segundo estado.
 */
export const RUN_FIELDS: Readonly<Record<string, ExprType>> = {
  id: STRING,
  step: NUMBER,
  attempt: NUMBER,
};
