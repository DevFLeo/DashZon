require_relative "test_helper"

# Configurações pessoais de "Minha conta".
class PreferenciasTest < Minitest::Test
  include DashZonTeste

  def test_padrao
    configurar!
    get "/api/eu"
    assert_equal({ "tema" => "sistema", "fonte" => "inter", "pagina_inicial" => "", "privacidade" => false, "modulos_ocultos" => [] },
                 resposta["preferencias"])
  end

  def test_fonte_salva_na_conta
    configurar!
    put_json "/api/eu/preferencias", { "fonte" => "atkinson" }
    assert_equal 200, last_response.status, last_response.body
    put_json "/api/eu/preferencias", { "tema" => "escuro" } # mudar outra coisa não troca a fonte
    assert_equal "atkinson", resposta["preferencias"]["fonte"]
    get "/api/eu"
    assert_equal "atkinson", resposta["preferencias"]["fonte"]

    put_json "/api/eu/preferencias", { "fonte" => "comic-sans" }
    assert_equal 422, last_response.status
    assert_match(/Fonte inválida/, resposta["error"])
  end

  def test_cada_fonte_tem_arquivo_e_regra_no_css
    css = File.read(File.expand_path("../../frontend/css/style.css", __dir__), encoding: "UTF-8")
    js = File.read(File.expand_path("../../frontend/js/fonte.js", __dir__), encoding: "UTF-8")
    Usuarios::FONTES.each { |f| assert_includes js, "#{f}:", "fonte.js não oferece '#{f}'" }
    (Usuarios::FONTES - %w[inter]).each { |f| assert_includes css, %(:root[data-fonte="#{f}"]), "CSS sem a regra de '#{f}'" }
    css.scan(%r{url\("/vendor/fonts/([^"]+)"\)}).flatten.uniq.each do |arquivo|
      assert File.exist?(File.expand_path("../../frontend/vendor/fonts/#{arquivo}", __dir__)), "falta vendor/fonts/#{arquivo}"
    end
  end

  def test_salvar_e_manter
    configurar!
    put_json "/api/eu/preferencias", { "tema" => "escuro", "pagina_inicial" => "#/m/lancamentos", "privacidade" => true }
    assert_equal 200, last_response.status, last_response.body
    put_json "/api/eu/preferencias", { "tema" => "suave" }
    assert_equal "suave", resposta["preferencias"]["tema"]
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
