/**
 * Iteração de string por **code point**.
 *
 * Todo o pacote mede e percorre string por code point, nunca por unidade UTF-16. A
 * diferença aparece em qualquer caractere fora do BMP: `"😀".length` é 2, e um lexer que
 * acredite nisso parte o emoji em dois meios-caracteres — os spans de diagnóstico
 * passam a apontar para posições que não existem, e `.` num padrão casa metade de um
 * caractere.
 *
 * O `@typescript-eslint/no-misused-spread` avisa que espalhar string pode "maltratar
 * caracteres especiais", e ele está certo sobre **grafemas**: `[...'é']` decomposto dá
 * dois elementos. Isso é conhecido e declarado em `specs/agx-expr.md` §8 — AGX-Expr conta
 * code points, não grafemas, e mudar isso depois é mudança de semântica observável.
 *
 * A supressão vive aqui, num lugar só, para que a decisão apareça uma vez com o motivo
 * em vez de virar ruído espalhado por seis arquivos.
 */

/** Divide em code points. */
export function toCodePoints(text: string): readonly string[] {
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- code point é a unidade da linguagem (ver cabeçalho)
  return [...text];
}

/** Comprimento em code points. */
export function codePointLength(text: string): number {
  return toCodePoints(text).length;
}

/** Recorta por índice de code point. `end` é exclusivo. */
export function sliceCodePoints(text: string, start: number, end?: number): string {
  return toCodePoints(text).slice(start, end).join('');
}
