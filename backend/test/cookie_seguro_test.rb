require_relative "test_helper"

# Com DASHZON_COOKIE_SEGURO=1, o cookie sai Secure por HTTPS (via Caddy) e o
# acesso local por HTTP continua funcionando.
class CookieSeguroTest < Minitest::Test
  include DashZonTeste

  def com_cookie_seguro
    anterior = COOKIE_SEGURO
    Object.send(:remove_const, :COOKIE_SEGURO)
    Object.const_set(:COOKIE_SEGURO, true)
    yield
  ensure
    Object.send(:remove_const, :COOKIE_SEGURO)
    Object.const_set(:COOKIE_SEGURO, anterior)
  end

  def cookie_de_sessao
    Array(last_response.headers["set-cookie"]).join("\n").split("\n").find { |c| c.start_with?("rack.session=") }
  end

  def test_https_recebe_cookie_secure
    configurar!
    com_cookie_seguro do
      clear_cookies
      post "/api/login", JSON.generate("usuario" => "dono", "senha" => "senha-forte-1"),
           "CONTENT_TYPE" => "application/json", "HTTP_X_FORWARDED_PROTO" => "https"
      assert_equal 200, last_response.status
      assert_match(/;\s*secure/i, cookie_de_sessao)
      assert_match(/httponly/i, cookie_de_sessao)
    end
  end

  def test_http_local_continua_entrando
    configurar!
    com_cookie_seguro do
      assert_equal 200, entrar("dono", "senha-forte-1").status
      refute_nil cookie_de_sessao, "o cookie precisa ser gravado no acesso local"
      get "/api/modulos"
      assert_equal 200, last_response.status
    end
  end
end
