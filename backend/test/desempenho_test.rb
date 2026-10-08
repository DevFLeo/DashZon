require_relative "test_helper"

# O cache de resultados nunca pode mostrar número velho, e gzip/cache de
# arquivos precisam estar ligados.
class DesempenhoTest < Minitest::Test
  include DashZonTeste

  def setup
    super
    skip "motor C++ não compilado" unless EngineClient.binary_path && File.exist?(EngineClient.binary_path)
    CacheResultados.limpar
    configurar!
    post_json "/api/templates/instalar", { "template_id" => "financas-pessoais", "com_exemplos" => true }
    get "/api/dashboards/#{Database.row('SELECT id FROM dashboards ORDER BY id DESC')['id']}"
    @card = resposta["widgets"].find { |w| w["titulo"] == "Receitas" }["id"] # KPI: soma das entradas
  end

  def receitas
    get "/api/widgets/#{@card}/data"
    assert_equal 200, last_response.status, last_response.body
    resposta["total_sum"]
  end

  def lancar(valor)
    post_json "/api/modulos/lancamentos/registros",
              { "descricao" => "Teste", "tipo" => "entrada", "valor" => valor, "categoria" => "Salário", "data" => "2026-09-01" }
    assert_equal 201, last_response.status, last_response.body
    resposta["id"]
  end

  def test_segunda_leitura_vem_do_cache
    antes = receitas
    assert_operator CacheResultados.tamanho, :>=, 1
    assert_equal antes, receitas
  end

  def test_incluir_editar_e_excluir_atualizam_o_card
    base = receitas
    id = lancar(1000)
    assert_in_delta base + 1000, receitas, 0.001
    put_json "/api/modulos/lancamentos/registros/#{id}",
             { "descricao" => "Teste", "tipo" => "entrada", "valor" => 250, "categoria" => "Salário", "data" => "2026-09-01" }
    assert_in_delta base + 250, receitas, 0.001
    delete "/api/modulos/lancamentos/registros/#{id}"
    assert_in_delta base, receitas, 0.001
  end

  def test_duas_gravacoes_no_mesmo_segundo
    base = receitas
    lancar(1)
    assert_in_delta base + 1, receitas, 0.001
    lancar(2) # mesmo segundo: a versão dos dados muda do mesmo jeito
    assert_in_delta base + 3, receitas, 0.001
  end

  def test_gravacao_por_outro_processo_tambem_invalida
    base = receitas
    outro = SQLite3::Database.new(ENV["DASHZON_DB_PATH"]) # como um script ou outro servidor
    mod = Database.modulo("lancamentos")
    dados = ModuleSchema.coerce_registro!(mod["schema"], "descricao" => "Fora", "tipo" => "entrada", "valor" => 500.0, "categoria" => "Salário")
    outro.execute("INSERT INTO registros (modulo_id, dados, criado_em) VALUES (?, ?, ?)",
                  [mod["id"], RecordCodec.pack(mod["schema"], dados), Time.now.to_i])
    outro.close
    assert_in_delta base + 500, receitas, 0.001
  end

  def test_resumo_e_busca_acompanham_as_mudancas
    get "/api/modulos/lancamentos/registros?q=Unico-XYZ"
    assert_equal 0, resposta["count"]
    post_json "/api/modulos/lancamentos/registros",
              { "descricao" => "Unico-XYZ", "tipo" => "saida", "valor" => 10, "categoria" => "Outros", "data" => "2026-09-01" }
    get "/api/modulos/lancamentos/registros?q=Unico-XYZ"
    assert_equal 1, resposta["count"]
  end

  def test_gzip_e_cache_de_arquivos
    get "/vendor/chart.umd.js", {}, "HTTP_ACCEPT_ENCODING" => "gzip"
    assert_equal "gzip", last_response.headers["content-encoding"]
    assert_match(/max-age=86400/, last_response.headers["cache-control"])
    get "/js/app.js", {}, "HTTP_ACCEPT_ENCODING" => "gzip"
    assert_equal "no-cache", last_response.headers["cache-control"]
    get "/api/modulos", {}, "HTTP_ACCEPT_ENCODING" => "gzip"
    assert_equal "gzip", last_response.headers["content-encoding"]
    assert_nil last_response.headers["cache-control"]&.match(/max-age=86400/)
  end
end
