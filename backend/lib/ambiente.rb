# Leitura de variáveis de ambiente tratando "vazia" como "não definida".
# O docker compose passa as opcionais do .env como texto vazio (""), e um
# ENV.fetch comum devolveria "" em vez do valor padrão.
module Ambiente
  def self.[](nome, padrao = nil)
    valor = ENV[nome].to_s.strip
    valor.empty? ? padrao : valor
  end
end
