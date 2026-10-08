require "json"
require "zlib"

# Como o JSON do usuário (templates importados e exportações/backups, tabela
# `jsons`) é gravado: comprimido com zlib, num BLOB na coluna `conteudo`.
#
# Uma exportação com dados guarda todos os registros em JSON verboso e é
# guardada a cada "Backup com dados"; sem compressão, cada uma ocupava no banco
# tanto quanto todos os dados juntos. JSON comprime cerca de 10 vezes.
#
# Linhas antigas, em texto puro, continuam legíveis (`decodificar` aceita os
# dois formatos) e são comprimidas pela migração do banco v2 para o v3. Um JSON
# em texto sempre começa por `{` ou `[`; um fluxo zlib sempre começa por 0x78,
# então os dois nunca se confundem.
module JsonGuardado
  MAGICO_ZLIB = 0x78

  module_function

  # Objeto Ruby -> BLOB comprimido.
  def codificar(obj)
    comprimir_texto(JSON.generate(obj))
  end

  # Texto JSON já pronto -> BLOB comprimido (a migração usa isto, sem reler o JSON).
  def comprimir_texto(texto)
    Zlib::Deflate.deflate(texto.to_s.b, Zlib::BEST_COMPRESSION)
  end

  def comprimido?(valor)
    valor.is_a?(String) && valor.getbyte(0) == MAGICO_ZLIB
  end

  # Valor da coluna (BLOB comprimido ou texto antigo) -> texto JSON.
  def texto(valor)
    return valor unless comprimido?(valor)

    Zlib::Inflate.inflate(valor).force_encoding(Encoding::UTF_8)
  end

  # Valor da coluna -> objeto Ruby.
  def decodificar(valor)
    JSON.parse(texto(valor))
  end
end
