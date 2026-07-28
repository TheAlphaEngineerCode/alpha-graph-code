/**
 * Diagnósticos de AGX-Expr.
 *
 * Códigos `E3xx` são de validação: acontecem ao salvar o grafo, com valores ainda
 * desconhecidos. Códigos `R31x` são de avaliação e só aparecem com os valores em mãos.
 * Cada código tem página em `docs/diagnostics/`.
 *
 * Um diagnóstico **não carrega texto** — carrega `messageId` e parâmetros tipados, e o
 * texto sai de `render` no momento de exibir (ADR-0006). Isso mantém o trace independente
 * de locale, que é requisito de `specs/trace-v1.md`, e permite a um consumidor de máquina
 * casar o identificador em vez de uma frase que pode ser reescrita.
 */
import { sliceCodePoints } from './codepoints.js';
import {
  DEFAULT_LOCALE,
  message,
  type Locale,
  type MessageId,
  type MessageParams,
} from './messages/index.js';

export const DIAGNOSTIC_CODES = [
  'AGX-E301',
  'AGX-E302',
  'AGX-E310',
  'AGX-E311',
  'AGX-E312',
  'AGX-E320',
  'AGX-E321',
  'AGX-E322',
  'AGX-E330',
  'AGX-R310',
  'AGX-R311',
] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

/** Trecho da entrada, em offsets de code point. `end` é exclusivo. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/**
 * Uma mensagem por resolver: identificador + parâmetros.
 *
 * O par vem junto de propósito. Separá-los em dois campos soltos permitiria um ID com os
 * parâmetros de outro, e o erro só apareceria na renderização — em produção, no texto.
 */
export type MessageRef = {
  [K in MessageId]: { readonly id: K; readonly params: MessageParams[K] };
}[MessageId];

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly message: MessageRef;
  readonly span: Span;
  /**
   * Correção proposta. Presente sempre que dá para apontar uma: nome de canal mais
   * próximo, função equivalente, ou a forma que o autor provavelmente quis escrever.
   */
  readonly suggestion?: MessageRef;
}

export function diagnostic(
  code: DiagnosticCode,
  message: MessageRef,
  span: Span,
  suggestion?: MessageRef,
): Diagnostic {
  return suggestion === undefined ? { code, message, span } : { code, message, span, suggestion };
}

/**
 * Atalho para montar um `MessageRef` com os parâmetros checados contra o ID.
 *
 * `msg('unknown-channel', { name })` não compila se `unknown-channel` não declarar `name`.
 */
export function msg<K extends MessageId>(id: K, params: MessageParams[K]): MessageRef {
  return { id, params } as MessageRef;
}

/** Sem parâmetros — a maioria das mensagens de sugestão. */
export function msg0(id: NoParamMessageId): MessageRef {
  return { id, params: {} } as MessageRef;
}

/**
 * IDs cujo catálogo não recebe parâmetro algum.
 *
 * O teste é sobre as **chaves** do tipo de parâmetros. A primeira versão perguntava
 * `Record<string, never> extends MessageParams[K]`, e isso é verdadeiro para
 * `{ name: string }` — a index signature satisfaz qualquer propriedade, porque `never` é
 * atribuível a tudo. Resultado: `msg0` aceitava ID com parâmetro e a mensagem saía com
 * `undefined` no meio.
 */
export type NoParamMessageId = {
  [K in MessageId]: keyof MessageParams[K] extends never ? K : never;
}[MessageId];

/** Texto de um `MessageRef` no locale pedido. */
export function renderMessage(ref: MessageRef, locale: Locale = DEFAULT_LOCALE): string {
  return message(ref.id, ref.params, locale);
}

/**
 * Resultado de qualquer etapa do pipeline.
 *
 * Nenhuma função pública deste pacote lança: erro é valor de retorno. Um throw
 * atravessando o interpretador seria a única falha do sistema sem `kind`, e escaparia
 * do canal `errors` e do trace (specs/agx-expr.md §5.5).
 */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T>(...diagnostics: readonly Diagnostic[]): Result<T> {
  return { ok: false, diagnostics };
}

export interface FormatOptions {
  /** Trecho original, para o diagnóstico citar o texto em vez da posição. */
  readonly source?: string;
  readonly locale?: Locale;
}

/** Renderiza um diagnóstico no formato usado pelo CLI. */
export function formatDiagnostic(d: Diagnostic, options: FormatOptions = {}): string {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const where =
    options.source === undefined
      ? String(d.span.start)
      : describePosition(options.source, d.span, locale);

  const base = `${d.code} ${where}: ${renderMessage(d.message, locale)}`;
  if (d.suggestion === undefined) return base;
  return `${base}\n  → ${renderMessage(d.suggestion, locale)}`;
}

function describePosition(source: string, span: Span, locale: Locale): string {
  const excerpt = sliceCodePoints(source, span.start, span.end);
  if (excerpt.length > 0) return `'${excerpt}'`;
  return message('position-column', { column: span.start + 1 }, locale);
}

/**
 * Distância de edição de Damerau-Levenshtein, limitada.
 *
 * Serve à sugestão de `AGX-E310` — `state.confidenc` precisa apontar `confidence`. A
 * transposição entra porque digitar `cofnidence` é tão comum quanto omitir uma letra, e
 * a Levenshtein pura cobra 2 por isso, o que costuma passar do limite e perder a sugestão.
 */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[] = new Array<number>(rows * cols).fill(0);
  const at = (i: number, j: number): number => d[i * cols + j] ?? 0;
  const set = (i: number, j: number, v: number): void => {
    d[i * cols + j] = v;
  };

  for (let i = 0; i < rows; i++) set(i, 0, i);
  for (let j = 0; j < cols; j++) set(0, j, j);

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, at(i - 2, j - 2) + 1);
      }
      set(i, j, best);
    }
  }
  return at(rows - 1, cols - 1);
}

/**
 * O candidato mais próximo de `name`, ou `undefined` se nenhum for próximo o bastante.
 *
 * O limite cresce com o tamanho da palavra: sugerir `end` para quem escreveu `and` seria
 * ruído, mas sugerir `confidence` para `confidenc` é exatamente o ponto. Uma sugestão
 * errada é pior que nenhuma — manda a pessoa investigar o lugar errado.
 */
export function closestName(name: string, candidates: readonly string[]): string | undefined {
  const limit = Math.max(1, Math.floor(name.length / 3));
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = editDistance(name.toLowerCase(), candidate.toLowerCase());
    if (distance <= limit && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
