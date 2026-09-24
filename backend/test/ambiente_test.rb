require_relative "test_helper"

# O docker compose passa variáveis opcionais vazias (""). Vazia = não definida.
class AmbienteTest < Minitest::Test
  include DashZonTeste

  def com_env(nome, valor)
    anterior = ENV[nome]
    ENV[nome] = valor
    yield
  ensure
    anterior.nil? ? ENV.delete(nome) : ENV[nome] = anterior
  end

  def test_vazia_vale_o_padrao
    com_env("DASHZON_TESTE_X", "") { assert_equal "padrao", Ambiente["DASHZON_TESTE_X", "padrao"] }
    com_env("DASHZON_TESTE_X", "  ") { assert_nil Ambiente["DASHZON_TESTE_X"] }
    com_env("DASHZON_TESTE_X", "valor") { assert_equal "valor", Ambiente["DASHZON_TESTE_X", "padrao"] }
  end

  def test_link_de_redefinicao_com_url_publica_vazia
    configurar!
    post_json "/api/admin/usuarios", { "login" => "ana", "nome" => "Ana" }
    id = resposta["usuario"]["id"]
    com_env("DASHZON_URL_PUBLICA", "") do
      post_json "/api/admin/usuarios/#{id}/link-redefinicao"
      assert_match %r{\Ahttp://example\.org/#/redefinir/}, resposta["link"]
    end
    com_env("DASHZON_URL_PUBLICA", "https://painel.exemplo.com/") do
      post_json "/api/admin/usuarios/#{id}/link-redefinicao"
      assert_match %r{\Ahttps://painel\.exemplo\.com/#/redefinir/}, resposta["link"]
    end
  end
end
