require_relative "test_helper"

# Formato compacto dos registros em disco (lib/record_codec.rb).
class RegistroCodecTest < Minitest::Test
  SCHEMA = {
    "campos" => [
      { "id" => "descricao", "tipo" => "texto" },
      { "id" => "tipo", "tipo" => "movimento" },
      { "id" => "valor", "tipo" => "moeda" },
      { "id" => "categoria", "tipo" => "selecao" },
      { "id" => "data", "tipo" => "data" },
      { "id" => "pago", "tipo" => "booleano" },
      { "id" => "qtd", "tipo" => "numero" }
    ],
    "slots" => { "descricao" => 0, "tipo" => 1, "valor" => 2, "categoria" => 3, "data" => 4, "pago" => 5, "qtd" => 6 }
  }.freeze

  REGISTRO = {
    "descricao" => "Aluguel", "tipo" => "saida", "valor" => 1450.0, "categoria" => "Moradia",
    "data" => "2025-11-20", "pago" => true, "qtd" => 2.5
  }.freeze

  def ida_e_volta(dados, schema = SCHEMA)
    RecordCodec.unpack(RecordCodec.plano(schema), RecordCodec.pack(schema, dados))
  end

  def test_ida_e_volta_devolve_os_valores_originais
    volta = ida_e_volta(REGISTRO)
    assert_equal "Aluguel", volta["descricao"]
    assert_equal "saida", volta["tipo"]
    assert_equal 1450, volta["valor"]
    assert_equal "Moradia", volta["categoria"]
    assert_equal "2025-11-20", volta["data"]
    assert_equal true, volta["pago"]
    assert_equal 2.5, volta["qtd"]
  end

  def test_formato_em_disco_e_um_array_curto
    assert_equal '["Aluguel",1,1450,"Moradia",20412,1,2.5]', RecordCodec.pack(SCHEMA, REGISTRO)
    assert_operator RecordCodec.pack(SCHEMA, REGISTRO).bytesize, :<, JSON.generate(REGISTRO).bytesize / 2
  end

  def test_vazios_a_direita_sao_omitidos_e_no_meio_viram_null
    json = RecordCodec.pack(SCHEMA, { "descricao" => "x", "data" => "2026-01-01" })
    assert_equal '["x",null,null,null,20454]', json
    volta = RecordCodec.unpack(RecordCodec.plano(SCHEMA), json)
    assert_nil volta["tipo"]
    assert_nil volta["valor"]
    assert_equal false, volta["pago"]
    assert_nil volta["qtd"]
  end

  def test_booleano_falso_volta_falso_e_movimento_entrada_volta_entrada
    volta = ida_e_volta(REGISTRO.merge("pago" => false, "tipo" => "entrada"))
    assert_equal false, volta["pago"]
    assert_equal "entrada", volta["tipo"]
  end

  def test_numero_sem_casas_vira_inteiro_e_decimal_continua_decimal
    assert_equal "[null,null,3]", RecordCodec.pack(SCHEMA, { "valor" => 3.0 })
    assert_equal "[null,null,3.25]", RecordCodec.pack(SCHEMA, { "valor" => 3.25 })
    grande = RecordCodec.pack(SCHEMA, { "valor" => 1.0e20 })
    assert_equal 1.0e20, JSON.parse(grande)[2]
  end

  def test_datas_extremas
    %w[0001-01-01 1969-12-31 1970-01-01 2024-02-29 2099-12-31 9999-12-31].each do |d|
      assert_equal d, ida_e_volta({ "data" => d })["data"], d
    end
  end

  def test_slots_fora_de_ordem_e_com_buracos
    schema = {
      "campos" => [{ "id" => "b", "tipo" => "texto" }, { "id" => "a", "tipo" => "texto" }],
      "slots" => { "a" => 0, "removido" => 1, "b" => 2 } # "b" vem antes de "a" na lista, mas ocupa o slot 2
    }
    json = RecordCodec.pack(schema, { "a" => "A", "b" => "B" })
    assert_equal '["A",null,"B"]', json
    assert_equal({ "b" => "B", "a" => "A" }, RecordCodec.unpack(RecordCodec.plano(schema), json))
  end

  def test_leitura_so_de_alguns_campos
    plano = RecordCodec.plano(SCHEMA, %w[valor data])
    volta = RecordCodec.unpack(plano, RecordCodec.pack(SCHEMA, REGISTRO))
    assert_equal({ "valor" => 1450, "data" => "2025-11-20" }, volta)
    assert_equal({}, RecordCodec.unpack(RecordCodec.plano(SCHEMA, []), RecordCodec.pack(SCHEMA, REGISTRO)))
  end

  def test_decode_nunca_levanta_erro_com_valor_de_outro_tipo
    assert_nil RecordCodec.decode("data", "abc")
    assert_nil RecordCodec.decode("data", 1.5)
    assert_nil RecordCodec.decode("movimento", "entrada")
    assert_nil RecordCodec.decode("movimento", 9)
    assert_equal false, RecordCodec.decode("booleano", "sim")
    assert_equal "texto", RecordCodec.decode("texto", "texto")
  end

  def test_converter_tipos_mexe_so_nos_slots_indicados
    json = RecordCodec.pack(SCHEMA, REGISTRO)
    mudanca = [[4, "data", "texto", ->(v) { v }]] # data -> texto
    novo = JSON.parse(RecordCodec.converter_tipos(json, mudanca))
    assert_equal "2025-11-20", novo[4]
    assert_equal JSON.parse(json).values_at(0, 1, 2, 3, 5, 6), novo.values_at(0, 1, 2, 3, 5, 6)
  end
end
