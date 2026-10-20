require_relative "test_helper"

# Painel de contribuições do GitHub. Sem internet: a busca da página é
# trocada por um HTML de exemplo no mesmo formato do github.com.
class GithubTest < Minitest::Test
  include DashZonTeste

  # 7 dias: 2025-01-01 .. 2025-01-07 com 0, 2, 1, 0, 3, 4, 1 contribuições.
  TOTAIS = [0, 2, 1, 0, 3, 4, 1].freeze

  def self.html
    tds = TOTAIS.each_with_index.map do |t, i|
      data = (Date.new(2025, 1, 1) + i).iso8601
      id = "contribution-day-component-#{i}-0"
      texto = t.zero? ? "No contributions on January #{i + 1}th." : "#{t} contribution#{t == 1 ? '' : 's'} on January #{i + 1}th."
      %(<td tabindex="0" data-ix="#{i}" data-date="#{data}" id="#{id}" data-level="#{[t, 4].min}" class="ContributionCalendar-day"></td>
        <tool-tip id="tooltip-#{i}" for="#{id}" popover="manual" class="sr-only">#{texto}</tool-tip>)
    end
    "<table><tbody><tr>#{tds.join}</tr></tbody></table>"
  end

  def setup
    super
    Github.limpar_cache!
    @chamadas = 0
    teste = self
    Github.singleton_class.alias_method(:buscar_html_original, :buscar_html)
    Github.define_singleton_method(:buscar_html) { |_u| teste.instance_variable_set(:@chamadas, teste.instance_variable_get(:@chamadas) + 1); GithubTest.html }
  end

  def teardown
    Github.singleton_class.alias_method(:buscar_html, :buscar_html_original)
    Github.limpar_cache!
  end

  def test_le_dias_e_totais
    dias = Github.ler_dias(GithubTest.html)
    assert_equal TOTAIS, dias.map { |d| d["total"] }
    assert_equal "2025-01-01", dias.first["data"]
  end

  def test_resumo_e_sequencias
    r = Github.resumir("fulano", Github.ler_dias(GithubTest.html), hoje: Date.new(2025, 1, 7))
    assert_equal 11, r["total"]
    assert_equal 5, r["dias_ativos"]
    assert_equal 3, r["sequencia_atual"] # dias 5, 6 e 7
    assert_equal 3, r["maior_sequencia"]
  end

  def test_hoje_zerado_conta_ate_ontem
    r = Github.resumir("fulano", Github.ler_dias(GithubTest.html), hoje: Date.new(2025, 1, 8))
    assert_equal 3, r["sequencia_atual"]
  end

  def test_usuario_valido
    assert Github.usuario_valido?("DevFLeo")
    assert Github.usuario_valido?("a-b")
    refute Github.usuario_valido?("../etc")
    refute Github.usuario_valido?("evil.com/x")
    refute Github.usuario_valido?("-comeca")
    refute Github.usuario_valido?("a" * 40)
  end

  def test_rota_com_preferencia_e_cache
    configurar!
    get "/api/github/contribuicoes"
    assert_equal 422, last_response.status
    assert resposta["sem_usuario"]

    put_json "/api/eu/preferencias", { "github_usuario" => "@DevFLeo" }
    assert_equal 200, last_response.status
    assert_equal "DevFLeo", resposta["preferencias"]["github_usuario"] # sem o @

    get "/api/github/contribuicoes"
    assert_equal 200, last_response.status, last_response.body
    assert_equal 11, resposta["total"]
    get "/api/github/contribuicoes"
    assert_equal 1, @chamadas, "a segunda vez vem do cache"
  end

  def test_rota_recusa_usuario_invalido
    configurar!
    get "/api/github/contribuicoes", { "usuario" => "evil.com/x" }
    assert_equal 422, last_response.status
    put_json "/api/eu/preferencias", { "github_usuario" => "nao vale" }
    assert_equal 422, last_response.status
    assert_equal 0, @chamadas
  end

  def test_exige_login
    configurar!
    clear_cookies
    get "/api/github/contribuicoes", { "usuario" => "DevFLeo" }
    assert_equal 401, last_response.status
  end
end
