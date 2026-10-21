require_relative "test_helper"

# Dados de exemplo dos templates: marcados na instalação, apagados junto com
# o dashboard (se pedido) ou pelo botão do módulo. Editar um exemplo tira a
# marca. Bancos antigos são marcados uma vez pelo instante da instalação.
class ExemplosTest < Minitest::Test
  include DashZonTeste

  def instalar!
    configurar!
    post_json "/api/templates/instalar", { "template_id" => "cronograma-estudos", "com_exemplos" => true }
    assert_equal 200, last_response.status, last_response.body
    @dash = resposta["dashboards"].first
  end

  def patch_json(path, dados)
    patch path, JSON.generate(dados), "CONTENT_TYPE" => "application/json"
  end

  def exemplos(slug)
    get "/api/modulos"
    resposta.find { |m| m["slug"] == slug }["exemplos"]
  end

  def test_apagar_dashboard_leva_os_exemplos_e_deixa_os_dados_de_verdade
    instalar!
    assert_equal 12, exemplos("cronograma_estudos")
    get "/api/dashboards/#{@dash}/exemplos"
    assert_equal 12, resposta["total"]
    assert_equal ["cronograma_estudos"], resposta["modulos"].map { |m| m["slug"] }

    get "/api/modulos/cronograma_estudos/registros"
    editado = resposta["result"].first
    patch_json "/api/modulos/cronograma_estudos/registros/#{editado['id']}", { "assunto" => "Meu assunto" }
    assert_equal 200, last_response.status, last_response.body
    assert_equal 11, exemplos("cronograma_estudos"), "editado deixa de ser exemplo"
    post_json "/api/modulos/cronograma_estudos/registros", { "data" => "2026-01-10", "materia" => "Física", "assunto" => "Óptica", "duracao" => 2 }
    assert_equal 201, last_response.status, last_response.body
    meu = resposta["id"]

    delete "/api/dashboards/#{@dash}?exemplos=1"
    assert_equal 200, last_response.status, last_response.body
    assert_equal 11, resposta["exemplos_apagados"]
    get "/api/modulos/cronograma_estudos/registros"
    assert_equal [editado["id"], meu].sort, resposta["result"].map { |r| r["id"] }.sort
    get "/api/dashboards/#{@dash}"
    assert_equal 404, last_response.status
    get "/api/modulos/anotacoes/registros"
    assert_equal 6, resposta["count"], "módulo que o dashboard não usa fica como estava"
  end

  # Relatório, problemas 7 e 8.
  def test_lista_traz_os_modulos_e_exclusao_avisa_de_outro_dashboard
    instalar!
    get "/api/dashboards"
    assert_equal ["cronograma_estudos"], resposta.find { |d| d["id"] == @dash }["modulos"]
    post_json "/api/dashboards", { "nome" => "Outro", "visibilidade" => "equipe" }
    outro = resposta["id"]
    post_json "/api/dashboards/#{outro}/widgets", { "titulo" => "Sessões", "tipo" => "kpi", "modulo" => "cronograma_estudos", "config" => { "agregacao" => "contagem" } }
    assert_equal 201, last_response.status, last_response.body
    get "/api/dashboards/#{@dash}/exemplos"
    m = resposta["modulos"].first
    assert_equal ["Outro"], m["outros_dashboards"]
    assert_equal 0, m["outros_ocultos"]
  end

  def test_apagar_dashboard_sem_pedir_mantem_os_exemplos
    instalar!
    delete "/api/dashboards/#{@dash}"
    assert_equal 0, resposta["exemplos_apagados"]
    assert_equal 12, exemplos("cronograma_estudos")
  end

  def test_botao_do_modulo_apaga_so_os_exemplos
    instalar!
    delete "/api/modulos/anotacoes/exemplos"
    assert_equal 6, resposta["apagados"]
    get "/api/modulos/anotacoes"
    assert_equal 0, resposta["exemplos"]
  end

  def test_banco_antigo_marca_os_exemplos_pelo_instante_da_instalacao
    instalar!
    post_json "/api/modulos/cronograma_estudos/registros", { "data" => "2026-01-10", "materia" => "Física", "assunto" => "Óptica" }
    meu = resposta["id"]
    Database.execute("UPDATE registros SET criado_em = criado_em + 3600 WHERE id = ?", [meu]) # criado bem depois
    Database.execute("DROP TABLE registros_exemplo") # como num banco de antes da marcação
    Database.instance_variable_set(:@extras_ok, false)
    Database.garantir_tabelas!
    assert_equal 12, exemplos("cronograma_estudos")
    refute Database.row("SELECT 1 AS x FROM registros_exemplo WHERE registro_id = ?", [meu]), "registro do usuário não vira exemplo"
  end

  def test_so_quem_pode_alterar_ve_e_apaga
    instalar!
    post_json "/api/admin/usuarios", { "login" => "outro", "nome" => "Outro", "senha" => "outra-senha-boa-1", "deve_trocar_senha" => false }
    entrar("outro", "outra-senha-boa-1")
    get "/api/dashboards/#{@dash}/exemplos"
    assert_includes [403, 404], last_response.status
  end
end
