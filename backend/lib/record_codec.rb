require "json"
require "date"

# Formato em disco dos registros (coluna `registros.dados`).
#
# Em vez de um objeto JSON por registro (que repete o nome de todos os campos
# em todas as linhas), o registro é um array JSON posicional: cada campo ocupa
# a posição ("slot") que o schema do módulo lhe reservou. Além disso, alguns
# tipos são guardados de forma mais curta:
#
#   data       -> dias desde 1970-01-01 (20412 em vez de "2025-11-20")
#   hora       -> minutos desde 00:00 (510 em vez de "08:30")
#   booleano   -> 1 / 0
#   movimento  -> 0 = entrada, 1 = saida
#   numero     -> inteiro quando não tem casas decimais (1450 em vez de 1450.0)
#
#   {"descricao":"Aluguel","tipo":"saida","valor":1450.0,"data":"2025-11-20","pago":true}
#   ["Aluguel",1,1450,20412,1]
#
# Quem lê (API, motor C++) continua vendo o registro "achatado" de sempre:
# `unpack` devolve exatamente os valores originais. Zeros à direita (campos
# vazios no fim) são omitidos.
module RecordCodec
  EPOCH_JD = Date.new(1970, 1, 1).jd
  MOVIMENTO = %w[entrada saida].freeze
  INTEIRO_MAX = 2**53

  @datas = {}

  module_function

  # [[id, slot, tipo], ...] — calculado uma vez por módulo e reaproveitado
  # para todas as linhas de uma leitura. Com `somente`, só esses campos são
  # lidos (consultas de agregação não precisam dos demais).
  def plano(schema, somente = nil)
    slots = schema["slots"]
    campos = somente ? schema["campos"].select { |c| somente.include?(c["id"]) } : schema["campos"]
    campos.map { |c| [c["id"], slots.fetch(c["id"]), c["tipo"]] }
  end

  def pack(schema, dados)
    arr = []
    plano(schema).each { |id, slot, tipo| arr[slot] = encode(tipo, dados[id]) }
    arr.pop while !arr.empty? && arr.last.nil?
    JSON.generate(arr)
  end

  def unpack(plano, json)
    return {} if plano.empty?

    arr = JSON.parse(json)
    plano.each_with_object({}) { |(id, slot, tipo), out| out[id] = decode(tipo, arr[slot]) }
  end

  def encode(tipo, v)
    return nil if v.nil?

    case tipo
    when "booleano" then v ? 1 : 0
    when "movimento" then MOVIMENTO.index(v)
    when "data" then Date.iso8601(v).jd - EPOCH_JD
    when "hora" then v.split(":").then { |h, m| h.to_i * 60 + m.to_i }
    when "numero", "moeda" then v.abs < INTEIRO_MAX && v == v.to_i ? v.to_i : v
    else v
    end
  end

  # Nunca levanta erro: um valor que não combina com o tipo (não deveria
  # acontecer, pois o PUT do módulo reconverte os registros) vira nil em vez
  # de derrubar a leitura do módulo inteiro.
  def decode(tipo, v)
    case tipo
    when "booleano" then v == 1
    when "movimento" then v.is_a?(Integer) ? MOVIMENTO[v] : nil
    when "data" then v.is_a?(Integer) ? dia_para_iso(v) : nil
    when "hora" then v.is_a?(Integer) && v.between?(0, 1439) ? format("%02d:%02d", v / 60, v % 60) : nil
    else v
    end
  end

  # Os dias se repetem muito (vários registros na mesma data), então o texto
  # de cada dia é calculado uma única vez.
  def dia_para_iso(dias)
    @datas.clear if @datas.size > 50_000
    @datas[dias] ||= Date.jd(dias + EPOCH_JD).iso8601
  end

  # Reescreve o JSON de um registro quando o tipo de campos mudou. `mudancas`
  # é uma lista de [slot, tipo_antigo, tipo_novo, converter], em que `converter`
  # recebe o valor já decodificado e devolve o valor válido para o tipo novo
  # (ou nil). Só os slots indicados são tocados: os demais, inclusive os de
  # campos removidos, ficam como estão.
  def converter_tipos(json, mudancas)
    arr = JSON.parse(json)
    mudancas.each do |slot, tipo_antigo, tipo_novo, converter|
      arr[slot] = encode(tipo_novo, converter.call(decode(tipo_antigo, arr[slot])))
    end
    arr.pop while !arr.empty? && arr.last.nil?
    JSON.generate(arr)
  end
end
