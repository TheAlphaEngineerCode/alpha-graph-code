/**
 * Seleção de locale e renderização de mensagens (ADR-0006).
 *
 * O locale vem **por argumento**, nunca do ambiente: `process.env.LANG` aqui faria a mesma
 * expressão renderizar diferente conforme a máquina, que é a classe de comportamento que
 * este projeto gasta seu orçamento de determinismo evitando. Quem lê o ambiente é o CLI.
 */
import { en } from './en.js';
import { es } from './es.js';
import type { Catalog, MessageId, MessageParams } from './ids.js';
import { ptBR } from './pt-BR.js';

export const LOCALES = ['en', 'pt-BR', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

const CATALOGS: Readonly<Record<Locale, Catalog>> = {
  en,
  'pt-BR': ptBR,
  es,
};

/** Os IDs existentes em runtime, derivados do catálogo padrão. */
export const MESSAGE_IDS = Object.keys(en) as readonly MessageId[];

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Resolve um locale, caindo para `en` quando não reconhece.
 *
 * Recusar-se a imprimir um diagnóstico porque a tag de locale estava errada esconderia o
 * erro que a pessoa estava tentando ler — o fallback é a escolha menos ruim (ADR-0006 §3).
 * `pt` e `pt-br` resolvem para `pt-BR`; `es-419` e `es-MX`, para `es`.
 */
export function resolveLocale(value: string | undefined): Locale {
  if (value === undefined) return DEFAULT_LOCALE;
  if (isLocale(value)) return value;

  const primary = value.toLowerCase().split(/[-_]/u)[0] ?? '';
  switch (primary) {
    case 'pt':
      return 'pt-BR';
    case 'es':
      return 'es';
    case 'en':
      return 'en';
    default:
      return DEFAULT_LOCALE;
  }
}

export function catalogFor(locale: Locale): Catalog {
  return CATALOGS[locale];
}

/** Renderiza uma mensagem. Nunca lança: ID desconhecido devolve o próprio ID. */
export function message<K extends MessageId>(
  id: K,
  params: MessageParams[K],
  locale: Locale = DEFAULT_LOCALE,
): string {
  const catalog = CATALOGS[locale] as Record<string, (p: unknown) => string>;
  const render = catalog[id];
  // Inalcançável com os tipos em ordem. Devolver o ID em vez de lançar mantém a promessa
  // de que exibir um diagnóstico não pode ser a causa de uma falha nova.
  return render === undefined ? id : render(params);
}

export type { Catalog, MessageId, MessageParams, NoParams } from './ids.js';
export { en, es, ptBR };
