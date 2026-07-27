# Cassettes

Gravações de record/replay. Um run real grava as respostas de modelo e ferramenta aqui; runs
seguintes reproduzem a partir do arquivo, sem custo e sem rede.

```text
cassettes/<grafo>/<cenario>.agxc
```

A chave de cada entrada é `sha256(node_id + canonical(input) + attempt)` — ver
[`specs/trace-v1.md`](../specs/trace-v1.md) §1.

## Por que estes arquivos não são formatados

`.prettierignore` e `.gitattributes` excluem este diretório de qualquer normalização. A
propriedade que as cassettes existem para provar é **mesma entrada + mesma cassette = mesmo
trace, byte a byte**. Um formatter passando por cima mudaria os bytes e derrubaria a asserção —
não por defeito no runtime, mas por ferramenta de estilo.

## Regra de conteúdo

Cassette é dado gravado de uma execução real, e pode carregar o que veio na resposta do
provider. Antes de commitar uma cassette, confirme que ela não contém segredo, PII nem
conteúdo de cliente. Canais marcados `sensitive` são redigidos pelo runtime, mas a redação
cobre canal declarado — não cobre um valor que vazou dentro do texto de uma resposta.

_Vazio: o runtime chega na Fase 3._
