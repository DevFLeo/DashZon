require_relative "test_helper"

# Cards de acompanhamento de estudos: pizza, calendário (um quadradinho por
# dia) e meta num card de número. Mesma consulta e mesmo motor dos outros.
class CardsEstudoTest < Minitest::Test
  include DashZonTeste

  def preparar!
    configurar!
    post_json "/api/templates/instalar", { "template_id" => "cronograma-estudos", "com_exemplos" => true }
    assert_equal 200, last_response.status, last_response.body
    @dash = resposta["dashboards"].first
  end

  def card(tipo, config, titulo: "Teste")
    post_json "/api/dashboards/#{@dash}/widgets", { "titulo" => titulo, "tipo" => tipo, "modulo" => "cronograma_estudos", "config" => config }
    last_response
  end

  def test_pizza_por_materia
    preparar!
    assert_equal 201, card("pie", { "agregacao" => "soma", "campo" => "duracao", "agrupar_por" => "materia" }).status, last_response.body
    get "/api/widgets/#{resposta['id']}/data"
    assert_equal 200, last_response.status
    assert resposta["result"].any? { |r| r["key"] == "Matemática" }
    assert_equal 422, card("pie", { "agregacao" => "contagem" }).status, "pizza sem 'Separar por'"
  end

  def test_calendario_agrupa_por_dia
    preparar!
    assert_equal 201, card("calendario", { "agregacao" => "soma", "campo" => "duracao", "agrupar_por" => "data", "serie_por" => "estudado" }).status, last_response.body
    assert_nil resposta["config"]["formato_grupo"], "um quadradinho por dia, não por mês"
    assert_nil resposta["config"]["serie_por"]
    get "/api/widgets/#{resposta['id']}/data"
    assert(resposta["result"].all? { |r| r["key"].match?(/\A\d{4}-\d{2}-\d{2}\z/) }, resposta["result"].map { |r| r["key"] }.inspect)
    assert_equal 422, card("calendario", { "agregacao" => "contagem", "agrupar_por" => "materia" }).status, "calendário só por data"
  end

  def test_meta_do_mes_e_validacoes
    preparar!
    assert_equal 201, card("kpi", { "agregacao" => "soma", "campo" => "duracao", "meta" => "40", "periodo" => "mes" }).status, last_response.body
    cfg = resposta["config"]
    assert_equal 40.0, cfg["meta"]
    assert_equal "mes", cfg["periodo"]
    assert_equal "data", cfg["campo_data"], "pega o primeiro campo de data"
    assert_equal "data", cfg["agrupar_por"]
    get "/api/widgets/#{resposta['id']}/data"
    assert(resposta["result"].all? { |r| r["key"].match?(/\A\d{4}-\d{2}-\d{2}\z/) })

    assert_equal 201, card("kpi", { "agregacao" => "contagem", "meta" => 10 }).status
    assert_equal "tudo", resposta["config"]["periodo"]
    assert_nil resposta["config"]["agrupar_por"]
    assert_equal 201, card("kpi", { "agregacao" => "contagem", "meta" => "" }).status
    refute resposta["config"].key?("meta"), "sem meta, card de número comum"

    [{ "meta" => "-5" }, { "meta" => "abc" }, { "meta" => 5, "periodo" => "ano" }, { "meta" => 5, "periodo" => "mes", "campo_data" => "materia" }].each do |ruim|
      assert_equal 422, card("kpi", { "agregacao" => "contagem" }.merge(ruim)).status, ruim.inspect
    end
  end
end
