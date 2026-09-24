require_relative "test_helper"

# O que já existia antes das contas de usuário continua funcionando.
class ModulosTest < Minitest::Test
  include DashZonTeste

  def test_reinstalar_template_reaproveita_modulo
    configurar!
    post_json "/api/templates/instalar", { "template_id" => "gestao-demandas", "com_exemplos" => true }
    assert_equal 200, last_response.status, last_response.body
    post_json "/api/templates/instalar", { "template_id" => "gestao-demandas", "com_exemplos" => true }
    assert_equal ["Demandas"], resposta["reaproveitados"]

    get "/api/modulos"
    assert_equal 1, resposta.count { |m| m["nome"] == "Demandas" }
    get "/api/dashboards"
    assert_equal ["Demandas", "Demandas (2)"], resposta.map { |d| d["nome"] }.select { |n| n.start_with?("Demandas") }
  end

  def test_nome_de_modulo_duplicado_recusado
    configurar!
    post_json "/api/templates/instalar", { "template_id" => "gestao-demandas", "com_exemplos" => false }
    post_json "/api/modulos", { "slug" => "outro", "nome" => "DEMANDAS", "campos" => [{ "id" => "a", "nome" => "A", "tipo" => "texto" }] }
    assert_equal 422, last_response.status
  end

  def test_previa_do_card_com_dados_ficticios
    skip "motor C++ não compilado" unless EngineClient.binary_path && File.exist?(EngineClient.binary_path)
    configurar!
    post_json "/api/templates/instalar", { "template_id" => "financas-pessoais", "com_exemplos" => false }
    post_json "/api/widgets/preview", { "modulo" => "lancamentos", "tipo" => "bar",
                                        "config" => { "agregacao" => "soma", "campo" => "valor", "agrupar_por" => "categoria" } }
    assert_equal 200, last_response.status, last_response.body
    assert resposta["ficticio"]
    assert_equal 72, resposta["total_count"]
  end

  def test_galeria_exige_login_depois_do_setup
    configurar!
    clear_cookies
    get "/api/templates"
    assert_equal 401, last_response.status
  end
end
