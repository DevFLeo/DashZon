require_relative "test_helper"

# Correções da revisão de 2026-10-09 (desenvolvimento.md, itens 16 a 25).
class RevisaoTest < Minitest::Test
  include DashZonTeste

  MODULO = { "slug" => "itens", "nome" => "Itens",
             "campos" => [{ "id" => "nome", "nome" => "Nome", "tipo" => "texto" },
                          { "id" => "cat", "nome" => "Categoria", "tipo" => "selecao", "opcoes" => %w[A B] },
                          { "id" => "valor", "nome" => "Valor", "tipo" => "numero" }] }.freeze

  def test_corpo_que_nao_e_objeto_da_400
    configurar!
    post "/api/dashboards", "[]", "CONTENT_TYPE" => "application/json"
    assert_equal 400, last_response.status
    assert_match(/objeto JSON/, resposta["error"])
  end

  def test_dashboard_e_widget_inexistentes_dao_404
    configurar!
    post_json "/api/modulos", MODULO
    assert_equal 201, last_response.status, last_response.body

    put_json "/api/dashboards/999", { "nome" => "X" }
    assert_equal 404, last_response.status
    widget = { "titulo" => "Contagem", "tipo" => "kpi", "modulo" => "itens", "config" => { "agregacao" => "contagem" } }
    post_json "/api/dashboards/999/widgets", widget
    assert_equal 404, last_response.status
    put_json "/api/widgets/999", widget
    assert_equal 404, last_response.status
  end

  def test_nome_de_dashboard_tem_limite
    configurar!
    post_json "/api/dashboards", { "nome" => "x" * 81 }
    assert_equal 422, last_response.status
    post_json "/api/dashboards", { "nome" => "x" * 80 }
    assert_equal 201, last_response.status
  end

  def test_remover_template_nao_apaga_exportacao
    configurar!
    get "/api/export"
    get "/api/exportacoes"
    id = resposta.first["id"]

    delete "/api/templates/salvo-#{id}"
    assert_equal 404, last_response.status
    get "/api/exportacoes/#{id}"
    assert_equal 200, last_response.status
  end

  def test_setup_recusa_moeda_invalida
    post_json "/api/setup", { "usuario" => "dono", "senha" => "senha-forte-1", "moeda" => "XYZ", "templates" => [] }
    assert_equal 422, last_response.status
    refute Database.configured?, "um erro de validação não pode criar o banco"
  end

  def test_padrao_invalido_e_recusado_ao_salvar_a_estrutura
    configurar!
    campos = MODULO["campos"].map { |c| c["id"] == "cat" ? c.merge("padrao" => "Z") : c }
    post_json "/api/modulos", MODULO.merge("campos" => campos)
    assert_equal 422, last_response.status
    assert_match(/padrão inválido/, resposta["error"])

    # Padrões válidos (inclusive datas relativas) continuam aceitos.
    post_json "/api/modulos", MODULO.merge("campos" => MODULO["campos"].map { |c| c["id"] == "cat" ? c.merge("padrao" => "B") : c } +
                                                      [{ "id" => "quando", "tipo" => "data", "padrao" => "$hoje-7" }])
    assert_equal 201, last_response.status, last_response.body
  end

  def test_numero_recusa_hexadecimal_e_sublinhado
    c = { "nome" => "Valor", "tipo" => "numero" }
    %w[0x1A 1_000 1e 1. abc].each do |s|
      assert_raises(ModuleSchema::Error, s) { ModuleSchema.coerce_valor(c, s) }
    end
    assert_equal 1234.56, ModuleSchema.coerce_valor(c, "1.234,56")
    assert_equal 1234.56, ModuleSchema.coerce_valor(c, "1234.56")
    assert_equal(-5.0, ModuleSchema.coerce_valor(c, "-5"))
    assert_equal 0.5, ModuleSchema.coerce_valor(c, ".5")
    assert_equal 1500.0, ModuleSchema.coerce_valor(c, "1.5e3")
  end

  def test_limites_da_definicao_de_modulo
    configurar!
    post_json "/api/modulos", MODULO.merge("nome" => "n" * 81)
    assert_equal 422, last_response.status
    muitas = MODULO["campos"].map { |c| c["id"] == "cat" ? c.merge("opcoes" => (1..201).map(&:to_s)) : c }
    post_json "/api/modulos", MODULO.merge("campos" => muitas)
    assert_equal 422, last_response.status
  end

  def test_link_de_uso_unico_nao_passa_duas_vezes
    configurar!
    uid = Usuarios.por_login_ou_email("dono")["id"]
    token = Usuarios.criar_token!(uid, "redefinir_senha")
    assert_equal uid, Usuarios.consumir_token!("redefinir_senha", token)["id"]
    assert_raises(Usuarios::Erro) { Usuarios.consumir_token!("redefinir_senha", token) }
  end

  def test_ip_sem_falhas_recentes_sai_do_mapa
    registrar_falha("10.0.0.9")
    FALHAS_LOCK.synchronize { FALHAS["10.0.0.9"] = [Time.now - JANELA_BLOQUEIO - 1] }
    assert_equal 0, falhas_recentes("10.0.0.9")
    refute FALHAS.key?("10.0.0.9")
    assert_equal 0, falhas_recentes("10.0.0.10")
    refute FALHAS.key?("10.0.0.10"), "consultar não pode criar entrada"
  end
end
