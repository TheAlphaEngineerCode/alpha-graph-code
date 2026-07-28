/**
 * Paridade e sanidade dos catálogos (ADR-0006 §2).
 *
 * A completude já é garantida pelo tipo `Catalog`: chave faltando não compila. Estes
 * testes cobrem o que o tipo não vê — entrada que lança, entrada vazia, e catálogo que
 * satisfaz o tipo por ser cópia do `en`, que é o que um copy-paste produziria.
 */
import { describe, expect, it } from 'vitest';
import {
  catalogFor,
  DEFAULT_LOCALE,
  LOCALES,
  MESSAGE_IDS,
  message,
  resolveLocale,
} from './index.js';
import type { MessageId } from './ids.js';

/**
 * Parâmetros de amostra por ID.
 *
 * Um objeto genérico serve porque toda entrada só interpola o que declarou: passar chaves
 * a mais é inofensivo, e passar a menos apareceria como `undefined` no texto — que é
 * justamente o que a asserção de "nenhum undefined" pega.
 */
const SAMPLE = {
  column: 7,
  char: '"x"',
  literal: '1e400',
  escape: 'q',
  token: '&&',
  limit: 128,
  name: 'confidence',
  path: 'query',
  names: 'a, b',
  expected: 2,
  received: 3,
  index: 1,
  fn: 'coalesce',
  type: 'string',
  accepts: 'number',
  operator: '<',
  left: 'number',
  right: 'string',
  value: 'string',
  fallback: 'number',
  min: '1',
  max: '9',
  cap: 1000,
  quantifier: '*',
  marker: '=',
  low: 'a',
  high: 'z',
  kind: 'object',
};

const render = (id: MessageId, locale: (typeof LOCALES)[number]): string =>
  // O cast existe porque o teste percorre os IDs em runtime, e nesse ponto o tipo do
  // parâmetro é a união de todos — não há como o compilador casar ID e forma aqui.
  message(id as never, SAMPLE as never, locale);

describe('cobertura dos catálogos', () => {
  it('encontra IDs para verificar', () => {
    // Sem isto, um `MESSAGE_IDS` vazio faria todos os testes abaixo passar sobre nada —
    // que foi exatamente o bug da primeira versão, quando a lista saía de um cast de tipo.
    expect(MESSAGE_IDS.length).toBeGreaterThan(50);
  });

  it('os três locales estão registrados', () => {
    expect([...LOCALES]).toEqual(['en', 'pt-BR', 'es']);
    expect(DEFAULT_LOCALE).toBe('en');
  });

  for (const locale of LOCALES) {
    it(`${locale} implementa todos os IDs`, () => {
      const catalog = catalogFor(locale) as Record<string, unknown>;
      const missing = MESSAGE_IDS.filter((id) => typeof catalog[id] !== 'function');
      expect(missing).toEqual([]);
    });

    it(`${locale} não lança e não devolve texto vazio`, () => {
      for (const id of MESSAGE_IDS) {
        let text = '';
        expect(() => {
          text = render(id, locale);
        }, `${locale}/${id}`).not.toThrow();
        expect(text.length, `${locale}/${id}`).toBeGreaterThan(0);
      }
    });

    it(`${locale} não deixa parâmetro sem interpolar`, () => {
      // `undefined` no texto significa que a entrada leu uma chave que o ID não declara —
      // erro que o tipo não pega, porque o objeto de amostra é largo.
      for (const id of MESSAGE_IDS) {
        expect(render(id, locale), `${locale}/${id}`).not.toContain('undefined');
        expect(render(id, locale), `${locale}/${id}`).not.toContain('[object Object]');
      }
    });
  }
});

describe('os catálogos são traduções, não cópias', () => {
  // Um catálogo que satisfaz o tipo copiando o `en` inteiro é indistinguível de um
  // traduzido para o compilador. Isto é o que sobra para pegar esse caso.
  for (const locale of ['pt-BR', 'es'] as const) {
    it(`${locale} difere de en na maioria das mensagens`, () => {
      const identical = MESSAGE_IDS.filter((id) => render(id, locale) === render(id, 'en'));
      expect(identical.length / MESSAGE_IDS.length).toBeLessThan(0.1);
    });
  }

  it('pt-BR e es diferem entre si', () => {
    const identical = MESSAGE_IDS.filter((id) => render(id, 'pt-BR') === render(id, 'es'));
    expect(identical.length / MESSAGE_IDS.length).toBeLessThan(0.15);
  });

  it('identificadores do grafo não são traduzidos', () => {
    // `state`, `number`, `bool` e os nomes de função são o que a pessoa digita no YAML.
    // Traduzir faria a mensagem descrever algo que não existe no arquivo.
    for (const locale of LOCALES) {
      expect(render('logical-operand-not-bool', locale)).toContain('bool');
      expect(render('state-alone', locale)).toContain('state');
      expect(render('use-contains-hint', locale)).toContain('contains(');
    }
  });
});

describe('resolveLocale', () => {
  it('aceita as tags exatas', () => {
    expect(resolveLocale('en')).toBe('en');
    expect(resolveLocale('pt-BR')).toBe('pt-BR');
    expect(resolveLocale('es')).toBe('es');
  });

  it('resolve variantes pelo idioma primário', () => {
    expect(resolveLocale('pt')).toBe('pt-BR');
    expect(resolveLocale('pt-br')).toBe('pt-BR');
    expect(resolveLocale('pt_PT')).toBe('pt-BR');
    expect(resolveLocale('es-419')).toBe('es');
    expect(resolveLocale('es-MX')).toBe('es');
    expect(resolveLocale('en-GB')).toBe('en');
  });

  it('cai para en em vez de falhar', () => {
    // Recusar-se a imprimir um diagnóstico porque a tag estava errada esconderia o erro
    // que a pessoa estava tentando ler (ADR-0006 §3).
    expect(resolveLocale('klingon')).toBe('en');
    expect(resolveLocale('')).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
  });
});

describe('message()', () => {
  it('usa en quando o locale é omitido', () => {
    expect(message('division-by-zero', {})).toBe('Division by zero.');
  });

  it('devolve o próprio ID em vez de lançar quando o ID não existe', () => {
    // Inalcançável com os tipos em ordem. Exibir um diagnóstico não pode ser a causa de
    // uma falha nova — quem está lendo já está tratando de um erro.
    expect(message('nao-existe' as never, {} as never)).toBe('nao-existe');
  });
});
