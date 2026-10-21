require_relative "test_helper"

# Cores do card (editor > Cores): paleta, cor por categoria e cor única.
# Só aparência: o resultado do motor é o mesmo com ou sem cores.
class CoresTest < Minitest::Test
  include DashZonTeste

  def widgets_de_exemplo
    configurar!
    post_json "/api/templates/instalar", { "template_id" => "financas-pessoais", "com_exemplos" => true }
    assert_equal 200, last_response.status, last_response.body
    get "/api/dashboards/#{resposta['dashboards'].first}"
    resposta["widgets"]
  end

  def corpo(w, extra)
    { "titulo" => w["titulo"], "tipo" => w["tipo"], "modulo" => w["modulo_slug"], "config" => w["config"].merge(extra) }
  end

  def test_cores_salvas_sem_mudar_o_resultado
    w = widgets_de_exemplo.find { |x| x["tipo"] == "bar" && x["config"]["serie_por"] }
    get "/api/widgets/#{w['id']}/data"
    antes = resposta.slice("result", "series_keys", "total_count", "total_sum")

    put_json "/api/widgets/#{w['id']}", corpo(w, "paleta" => "oceano", "cores" => { "entrada" => "#00AA11" }, "cor" => "#123456")
    assert_equal 200, last_response.status, last_response.body
    assert_equal "oceano", resposta["config"]["paleta"]
    assert_equal({ "entrada" => "#00aa11" }, resposta["config"]["cores"])
    assert_equal "#123456", resposta["config"]["cor"]

    get "/api/widgets/#{w['id']}/data"
    assert_equal antes, resposta.slice("result", "series_keys", "total_count", "total_sum"), "cores não mudam os dados"
    assert_equal "oceano", resposta["config"]["paleta"]

    # "padrao" e vazio voltam às cores do tema (some do config).
    put_json "/api/widgets/#{w['id']}", corpo(w, "paleta" => "padrao", "cores" => {}, "cor" => "")
    assert_equal 200, last_response.status
    refute resposta["config"].key?("paleta")
    refute resposta["config"].key?("cores")
  end

  def test_cores_invalidas_recusadas
    w = widgets_de_exemplo.first
    [{ "cor" => "red" }, { "cor" => "#12345" }, { "paleta" => "arco-iris" }, { "cores" => { "a" => "javascript:alert(1)" } },
     { "cores" => "#ffffff" }, { "cores" => (1..61).to_h { |i| ["k#{i}", "#000000"] } }].each do |ruim|
      put_json "/api/widgets/#{w['id']}", corpo(w, ruim)
      assert_equal 422, last_response.status, ruim.inspect[0, 60]
    end
    post_json "/api/widgets/preview", corpo(w, "paleta" => "neon")
    assert_equal 200, last_response.status, last_response.body
    assert_equal "neon", resposta["config"]["paleta"]
  end
end
