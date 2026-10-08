require "cgi"
require_relative "test_helper"

# O banco guarda os registros num formato compacto (RecordCodec), mas a API, o
# motor C++ e os cards continuam vendo exatamente o que sempre viram.
class RegistrosCompactosTest < Minitest::Test
  include DashZonTeste

  ISO = /\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\z/

  def motor?
    EngineClient.binary_path && File.exist?(EngineClient.binary_path)
  end

  def setup
    super
    configurar!
  end

  def instalar(template = "financas-pessoais")
    post_json "/api/templates/instalar", { "template_id" => template, "com_exemplos" => true }
    assert_equal 200, last_response.status, last_response.body
  end

  def lancamento(extra = {})
    { "descricao" => "Teste", "tipo" => "saida", "valor" => 10, "categoria" => "Outros", "data" => "2026-09-01" }.merge(extra)
  end

  def novo_modulo(campos, slug = "tmp")
    post_json "/api/modulos", { "slug" => slug, "nome" => "Tmp #{slug}", "campos" => campos }
    assert_equal 201, last_response.status, last_response.body
    resposta
  end

  def test_api_devolve_o_formato_de_sempre
    instalar
    get "/api/modulos/lancamentos/registros"
    r = resposta["result"].first
    assert_match ISO, r["_criado_em"]
    assert_match ISO, r["_atualizado_em"]
    assert_match(/\A\d{4}-\d{2}-\d{2}\z/, r["data"])
    assert_includes %w[entrada saida], r["tipo"]
    assert_kind_of Numeric, r["valor"]
    assert_includes [true, false], r["pago"]
    assert_kind_of Integer, r["id"]
  end

  def test_no_banco_o_registro_e_um_array_e_as_datas_sao_inteiros
    instalar
    linha = Database.row("SELECT dados, typeof(criado_em) AS c, typeof(atualizado_em) AS a FROM registros ORDER BY id LIMIT 1")
    assert linha["dados"].start_with?("["), linha["dados"]
    assert_equal "integer", linha["c"]
    assert_equal "null", linha["a"] # nunca editado
  end

  def test_editar_grava_atualizado_em_e_a_ordem_e_do_mais_novo_para_o_mais_antigo
    instalar
    post_json "/api/modulos/lancamentos/registros", lancamento("descricao" => "Primeiro")
    id1 = resposta["id"]
    post_json "/api/modulos/lancamentos/registros", lancamento("descricao" => "Segundo")
    id2 = resposta["id"]
    get "/api/modulos/lancamentos/registros?q=#{CGI.escape('Primeiro')}"
    assert_equal [id1], resposta["result"].map { |r| r["id"] }

    put_json "/api/modulos/lancamentos/registros/#{id1}", lancamento("descricao" => "Primeiro (editado)")
    assert_equal 200, last_response.status
    assert_match ISO, resposta["_atualizado_em"]
    assert_equal "integer", Database.row("SELECT typeof(atualizado_em) AS t FROM registros WHERE id = ?", [id1])["t"]

    get "/api/modulos/lancamentos/registros"
    ids = resposta["result"].map { |r| r["id"] }
    assert_operator ids.index(id2), :<, ids.index(id1), "o registro mais novo vem primeiro"
  end

  def test_data_inexistente_e_numero_infinito_sao_recusados
    instalar
    post_json "/api/modulos/lancamentos/registros", lancamento("data" => "2026-13-45")
    assert_equal 422, last_response.status
    assert_match(/data válida/, resposta["error"])
    post_json "/api/modulos/lancamentos/registros", lancamento("data" => "2026-02-30")
    assert_equal 422, last_response.status
    post_json "/api/modulos/lancamentos/registros", lancamento("valor" => "1e999")
    assert_equal 422, last_response.status
    assert_match(/número/, resposta["error"])
    post_json "/api/modulos/lancamentos/registros", lancamento("data" => "2024-02-29")
    assert_equal 201, last_response.status # ano bissexto existe
  end

  def test_slots_continuam_certos_ao_reordenar_remover_e_readicionar_campos
    novo_modulo([{ "id" => "a", "nome" => "A", "tipo" => "texto" }, { "id" => "b", "nome" => "B", "tipo" => "moeda" },
                 { "id" => "c", "nome" => "C", "tipo" => "data" }, { "id" => "d", "nome" => "D", "tipo" => "booleano" }])
    assert_equal({ "a" => 0, "b" => 1, "c" => 2, "d" => 3 }, resposta["schema"]["slots"])
    post_json "/api/modulos/tmp/registros", { "a" => "um", "b" => 10, "c" => "2026-02-28", "d" => true }
    campos = Database.modulo("tmp")["schema"]["campos"]

    # reordena, remove "b" e cria "e"
    put_json "/api/modulos/tmp", { "nome" => "Tmp tmp", "campos" => [
      campos[3], { "id" => "e", "nome" => "E", "tipo" => "texto" }, campos[2], campos[0]
    ] }
    assert_equal 200, last_response.status, last_response.body
    assert_equal({ "a" => 0, "b" => 1, "c" => 2, "d" => 3, "e" => 4 }, resposta["schema"]["slots"])
    get "/api/modulos/tmp/registros"
    r = resposta["result"].first
    assert_equal({ "a" => "um", "c" => "2026-02-28", "d" => true, "e" => nil }, r.slice("a", "c", "d", "e"))
    refute r.key?("b")

    # "b" volta com o mesmo id: recupera o valor antigo
    put_json "/api/modulos/tmp", { "nome" => "Tmp tmp", "campos" => Database.modulo("tmp")["schema"]["campos"] + [campos[1]] }
    get "/api/modulos/tmp/registros"
    assert_equal 10, resposta["result"].first["b"]
  end

  def test_trocar_o_tipo_de_um_campo_converte_os_registros
    novo_modulo([{ "id" => "a", "nome" => "A", "tipo" => "texto" }, { "id" => "d", "nome" => "D", "tipo" => "data" },
                 { "id" => "n", "nome" => "N", "tipo" => "numero" }, { "id" => "b", "nome" => "B", "tipo" => "booleano" }])
    post_json "/api/modulos/tmp/registros", { "a" => "2026-03-01", "d" => "2026-02-28", "n" => 12.5, "b" => true }
    post_json "/api/modulos/tmp/registros", { "a" => "abc", "d" => "1999-12-31", "n" => 3, "b" => false }

    put_json "/api/modulos/tmp", { "nome" => "Tmp tmp", "campos" => [
      { "id" => "a", "nome" => "A", "tipo" => "data" }, { "id" => "d", "nome" => "D", "tipo" => "texto" },
      { "id" => "n", "nome" => "N", "tipo" => "texto" }, { "id" => "b", "nome" => "B", "tipo" => "texto" }
    ] }
    assert_equal 200, last_response.status, last_response.body
    get "/api/modulos/tmp/registros"
    assert_equal 200, last_response.status, last_response.body
    r1, r2 = resposta["result"].reverse
    assert_equal({ "a" => "2026-03-01", "d" => "2026-02-28", "n" => "12.5", "b" => "true" }, r1.slice("a", "d", "n", "b"))
    assert_equal({ "a" => nil, "d" => "1999-12-31", "n" => "3", "b" => "false" }, r2.slice("a", "d", "n", "b"))
  end

  def test_cards_e_resumos_dao_o_mesmo_resultado_lendo_so_os_campos_da_consulta
    skip "motor C++ não compilado" unless motor?
    instalar
    get "/api/dashboards/#{Database.row('SELECT id FROM dashboards ORDER BY id DESC')['id']}"
    widgets = resposta["widgets"]
    refute_empty widgets
    widgets.each do |w|
      m = Database.modulo(w["modulo_slug"])
      cfg = ModuleSchema.normalize_widget!(w, m["schema"])["config"]
      esperado = EngineClient.run({ cmd: "aggregate", records: Database.registros(m) }.merge(ModuleSchema.engine_query(m["schema"], cfg)))
      get "/api/widgets/#{w['id']}/data"
      assert_equal 200, last_response.status, last_response.body
      assert_equal esperado, resposta.reject { |k, _| k == "config" }, "card #{w['titulo']}"
    end

    m = Database.modulo("lancamentos")
    queries = m["schema"]["resumo"].map { |r| ModuleSchema.engine_query(m["schema"], r) }
    esperado = EngineClient.run(cmd: "multi", records: Database.registros(m), queries: queries)
    get "/api/modulos/lancamentos/resumo"
    valores = resposta.map { |r| r["valor"] }
    atual = m["schema"]["resumo"].zip(esperado["results"]).map do |r, res|
      { "contagem" => res["total_count"], "media" => res["total_avg"] }.fetch(r["agregacao"], res["total_sum"])
    end
    assert_equal atual, valores
  end

  def test_so_os_campos_pedidos_vao_para_o_motor
    instalar
    m = Database.modulo("lancamentos")
    r = Database.registros(m, campos: %w[valor tipo], meta: false).first
    assert_equal %w[id tipo valor], r.keys.sort
    completo = Database.registros(m).first
    assert_equal completo.slice("valor", "tipo"), r.slice("valor", "tipo")
    assert completo.key?("_criado_em")
  end

  def test_banco_novo_nasce_com_auto_vacuum_incremental_e_indices
    assert_equal 2, Database.row("PRAGMA auto_vacuum")["auto_vacuum"]
    assert_equal 3, Database.user_version
    indices = Database.rows("SELECT name FROM sqlite_master WHERE type = 'index'").map { |i| i["name"] }
    assert_includes indices, "idx_registros_modulo"
    assert_includes indices, "idx_widgets_dashboard"
    assert_equal "delete", Database.row("PRAGMA journal_mode")["journal_mode"], "WAL fica desligado (ver CLAUDE.md)"
  end

  def test_excluir_modulo_grande_devolve_o_espaco_ao_disco
    novo_modulo([{ "id" => "a", "nome" => "A", "tipo" => "texto" }, { "id" => "v", "nome" => "V", "tipo" => "moeda" }], "grande")
    modulo = Database.modulo("grande")
    Database.transaction do
      8000.times { |i| Database.inserir_registro(modulo, { "a" => "linha numero #{i} com algum texto de enchimento", "v" => i * 1.5 }) }
    end
    cheio = File.size(ENV["DASHZON_DB_PATH"])
    delete "/api/modulos/grande"
    assert_equal 200, last_response.status
    vazio = File.size(ENV["DASHZON_DB_PATH"])
    assert_operator vazio, :<, cheio / 2, "o arquivo encolheu: #{cheio} -> #{vazio}"
    assert_equal 0, Database.row("SELECT COUNT(*) AS n FROM registros")["n"]
  end

  def test_exportacao_nao_vaza_slots_e_volta_igual_ao_importar
    instalar
    get "/api/export?dados=1"
    refute_includes last_response.body, '"slots"'
    exportado = resposta
    antes = Database.registros(Database.modulo("lancamentos")).map { |r| r.reject { |k, _| k == "id" || k.start_with?("_") } }

    Database.fechar!
    Dir.glob("#{ENV['DASHZON_DB_PATH']}*").each { |f| File.delete(f) }
    clear_cookies
    configurar!
    post_json "/api/templates/instalar", { "template" => exportado, "com_exemplos" => true }
    assert_equal 200, last_response.status, last_response.body
    depois = Database.registros(Database.modulo("lancamentos")).map { |r| r.reject { |k, _| k == "id" || k.start_with?("_") } }
    assert_equal antes.sort_by(&:to_s), depois.sort_by(&:to_s)
  end
end
