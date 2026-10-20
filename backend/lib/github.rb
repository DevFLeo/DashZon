require "net/http"
require "uri"
require "date"

# Painel "Contribuições do GitHub" (para acompanhar os estudos): lê o
# calendário público de contribuições de um usuário do GitHub — a mesma página
# que desenha os quadradinhos verdes do perfil —, sem token.
#
# - Só busca em github.com, e o usuário é validado antes (nada de URL livre).
# - Resultado guardado em memória por 30 minutos por usuário: abrir o painel
#   várias vezes não bate no GitHub toda hora.
module Github
  class Erro < StandardError
    attr_reader :status

    def initialize(msg, status = 422)
      super(msg)
      @status = status
    end
  end

  USUARIO_RE = /\A[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\z/
  VALIDADE = 30 * 60
  @cache = {}
  @lock = Mutex.new

  module_function

  def usuario_valido?(u)
    u.to_s.match?(USUARIO_RE) && !u.to_s.include?("--") && !u.to_s.end_with?("-")
  end

  # Busca (ou devolve do cache) e resume as contribuições do último ano.
  def contribuicoes(usuario, agora: Time.now)
    raise Erro, "Usuário do GitHub inválido" unless usuario_valido?(usuario)

    chave = usuario.downcase
    @lock.synchronize do
      c = @cache[chave]
      return c[:dados] if c && agora - c[:quando] < VALIDADE
    end
    dados = resumir(usuario, ler_dias(buscar_html(usuario)), hoje: agora.to_date)
    @lock.synchronize { @cache[chave] = { quando: agora, dados: dados } }
    dados
  end

  def limpar_cache!
    @lock.synchronize { @cache.clear }
  end

  def buscar_html(usuario)
    uri = URI("https://github.com/users/#{usuario}/contributions")
    resp = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 8, read_timeout: 12) do |http|
      http.get(uri.request_uri, "User-Agent" => "DashZon", "Accept" => "text/html")
    end
    raise Erro.new("Usuário '#{usuario}' não encontrado no GitHub", 404) if resp.code == "404"
    raise Erro.new("O GitHub respondeu #{resp.code}; tente de novo em instantes", 502) unless resp.code == "200"

    resp.body.force_encoding("UTF-8")
  rescue Erro
    raise
  rescue StandardError => e
    raise Erro.new("Não foi possível falar com o GitHub (#{e.class})", 502)
  end

  # [{ "data" => "AAAA-MM-DD", "nivel" => 0..4, "total" => n }] em ordem de data.
  # O total de cada dia vem do texto do <tool-tip> ("3 contributions on ...",
  # "No contributions on ...") ligado ao quadradinho pelo id.
  def ler_dias(html)
    textos = {}
    html.scan(%r{<tool-tip[^>]*\bfor="([^"]+)"[^>]*>([^<]*)</tool-tip>}) { |id, texto| textos[id] = texto }
    dias = html.scan(/<td\b[^>]*>/).filter_map do |td|
      data = td[/data-date="(\d{4}-\d{2}-\d{2})"/, 1]
      next unless data

      id = td[/\bid="([^"]+)"/, 1]
      nivel = td[/data-level="(\d)"/, 1].to_i
      total = textos[id].to_s[/\A\s*([\d,]+)\s+contribution/, 1].to_s.delete(",").to_i
      { "data" => data, "nivel" => nivel, "total" => total }
    end
    raise Erro.new("Não reconheci o calendário de contribuições do GitHub", 502) if dias.empty?

    dias.sort_by { |d| d["data"] }
  end

  def resumir(usuario, dias, hoje: Date.today)
    por_data = dias.to_h { |d| [d["data"], d["total"]] }
    ativos = dias.count { |d| d["total"].positive? }

    # Sequência atual: dias seguidos com contribuição até hoje (se hoje ainda
    # está zerado, conta até ontem: o dia não acabou).
    dia = hoje
    dia -= 1 if por_data[dia.iso8601].to_i.zero?
    atual = 0
    while por_data[dia.iso8601].to_i.positive?
      atual += 1
      dia -= 1
    end

    maior = corrente = 0
    dias.each do |d|
      corrente = d["total"].positive? ? corrente + 1 : 0
      maior = [maior, corrente].max
    end

    limite = (hoje - 29).iso8601
    {
      "usuario" => usuario,
      "dias" => dias,
      "total" => dias.sum { |d| d["total"] },
      "dias_ativos" => ativos,
      "sequencia_atual" => atual,
      "maior_sequencia" => maior,
      "ultimos_30" => dias.select { |d| d["data"] >= limite }.sum { |d| d["total"] },
      "atualizado_em" => Time.now.utc.iso8601
    }
  end
end
