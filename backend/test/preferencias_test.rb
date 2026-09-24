require_relative "test_helper"

# Configurações pessoais de "Minha conta".
class PreferenciasTest < Minitest::Test
  include DashZonTeste

  def test_padrao
    configurar!
    get "/api/eu"
    assert_equal({ "tema" => "sistema", "pagina_inicial" => "", "privacidade" => false }, resposta["preferencias"])
  end

  def test_salvar_e_manter
    configurar!
    put_json "/api/eu/preferencias", { "tema" => "escuro", "pagina_inicial" => "#/m/lancamentos", "privacidade" => true }
    assert_equal 200, last_response.status, last_response.body
    put_json "/api/eu/preferencias", { "tema" => "claro" } # só o tema; o resto fica
    prefs = resposta["preferencias"]
    assert_equal "claro", prefs["tema"]
    assert_equal "#/m/lancamentos", prefs["pagina_inicial"]
    assert prefs["privacidade"]
  end

  def test_valores_invalidos
    configurar!
    put_json "/api/eu/preferencias", { "tema" => "roxo" }
    assert_equal 422, last_response.status
    put_json "/api/eu/preferencias", { "pagina_inicial" => "javascript:alert(1)" }
    assert_equal 422, last_response.status
    put_json "/api/eu/preferencias", { "pagina_inicial" => "https://outro.site" }
    assert_equal 422, last_response.status
  end

  def test_sair_dos_outros_dispositivos
    configurar!
    outro = rack_mock_session.cookie_jar.to_hash # "outro navegador" com a mesma sessão
    post_json "/api/eu/sair-outros"
    assert_equal 200, last_response.status
    get "/api/modulos"
    assert_equal 200, last_response.status # este continua

    clear_cookies
    outro.each { |k, v| set_cookie("#{k}=#{v}") }
    get "/api/modulos"
    assert_equal 401, last_response.status # o outro caiu
  end
end
