require "json"
require "set"
require "uri"
require_relative "ambiente"
require_relative "database"
require_relative "segredo"

# Segurança do DashZon, em camadas (ver Sistema.md, seção 8):
#
#  1. Tentativa e erro (força bruta): falhas de login, de senha atual e de links
#     ficam na tabela `eventos_seguranca` (sobrevivem a um reinício). Bloqueia
#     por IP (vários logins a partir de um lugar) e por CONTA (um login atacado
#     a partir de muitos IPs). Login inexistente conta igual, para não revelar
#     quem tem conta.
#  2. Diário de segurança: logins, bloqueios, trocas de senha, origem recusada
#     e excesso de requisições, para o administrador ver no painel.
#  3. Protecao (middleware Rack): cabeçalhos de segurança (CSP, nosniff,
#     frame-ancestors, referrer, HSTS em HTTPS), recusa de escrita vinda de
#     outro site (Origin) e limite de requisições por IP.
#  4. Senhas fracas recusadas (lista das mais comuns, sequências e igual ao login).
#
# SQL injection: todo SQL é parametrizado (`?`); o teste
# test_nenhum_sql_monta_texto_com_dado garante que continue assim.
module Seguranca
  JANELA = 15 * 60          # segundos considerados na contagem de falhas
  MAX_POR_IP = 8            # falhas de um IP na janela
  MAX_POR_CONTA = 10        # falhas contra um mesmo login na janela (de qualquer IP)
  RETENCAO_DIAS = 180       # diário guardado por ~6 meses

  # Tipos de evento que contam como "falha" (tentativa e erro).
  FALHAS_IP = %w[login_falhou senha_atual_errada link_invalido pedido_link].freeze
  FALHAS_CONTA = %w[login_falhou senha_atual_errada].freeze
  # Depois destes, a contagem recomeça (login certo ou desbloqueio pelo adm).
  ZERAM = %w[login_ok desbloqueio].freeze

  # A tabela `eventos_seguranca` é criada em Database::EXTRAS_SQL.

  module_function

  # O login digitado não é gravado como texto: alguém pode digitar a senha no
  # campo errado. Grava-se o HMAC (dá para contar sem saber o que é); o painel
  # mostra o login só quando ele é de um usuário que existe.
  def conta(login)
    t = login.to_s.strip.downcase
    t.empty? ? nil : texto(Segredo.hmac("login:#{t}")[0, 32])
  end

  # Texto sempre em UTF-8 antes de ir ao SQLite: o driver grava texto "binário"
  # (o hexdigest do OpenSSL, às vezes o IP vindo do servidor) como BLOB, e no
  # SQLite um BLOB nunca é igual a um TEXT. Sem isto, o desbloqueio (que chega
  # como texto) não casava com as falhas gravadas.
  def texto(s)
    s.nil? ? nil : s.to_s.dup.force_encoding(Encoding::UTF_8)
  end

  def ativo?
    Database.configured?
  rescue StandardError
    false
  end

  def agora = Time.now.to_i

  # --- diário ------------------------------------------------------------------

  def registrar!(tipo, ip: nil, login: nil, usuario_id: nil, detalhe: nil)
    return unless ativo?

    Database.garantir_tabelas!
    Database.insert("INSERT INTO eventos_seguranca (quando, tipo, ip, conta, usuario_id, detalhe) VALUES (?, ?, ?, ?, ?, ?)",
                    [agora, tipo, texto(ip), conta(login), usuario_id, texto(detalhe&.to_s&.[](0, 300))])
    podar! if rand < 0.01
  end

  def podar!
    Database.execute("DELETE FROM eventos_seguranca WHERE quando < ?", [agora - RETENCAO_DIAS * 86_400])
  end

  # --- contagem e bloqueio -------------------------------------------------------

  # Falhas desde o início da janela ou do último evento que zera (o que for mais recente).
  def falhas(coluna, valor, tipos)
    return 0 if valor.nil? || !ativo?

    valor = texto(valor)
    Database.garantir_tabelas!
    inicio = [agora - JANELA, ultimo_zerar(coluna, valor)].max
    marcas = (["?"] * tipos.size).join(", ")
    Database.row("SELECT COUNT(*) AS n FROM eventos_seguranca WHERE #{coluna} = ? AND quando > ? AND tipo IN (#{marcas})",
                 [valor, inicio, *tipos])["n"].to_i
  end

  def ultimo_zerar(coluna, valor)
    marcas = (["?"] * ZERAM.size).join(", ")
    Database.row("SELECT MAX(quando) AS q FROM eventos_seguranca WHERE #{coluna} = ? AND tipo IN (#{marcas})",
                 [valor, *ZERAM])["q"].to_i
  end
  private_class_method :ultimo_zerar

  COLUNAS = { ip: "ip", conta: "conta" }.freeze

  def falhas_ip(ip) = falhas(COLUNAS[:ip], ip, FALHAS_IP)
  def falhas_conta(login) = falhas(COLUNAS[:conta], conta(login), FALHAS_CONTA)

  # :ip, :conta ou nil.
  def bloqueio(ip:, login: nil)
    return :ip if falhas_ip(ip) >= MAX_POR_IP
    return :conta if login && falhas_conta(login) >= MAX_POR_CONTA

    nil
  end

  # Registra a falha e, se ela fechou um bloqueio, deixa isso no diário.
  def falhou!(tipo, ip:, login: nil, usuario_id: nil)
    registrar!(tipo, ip: ip, login: login, usuario_id: usuario_id)
    if falhas_ip(ip) == MAX_POR_IP
      registrar!("bloqueio", ip: ip, detalhe: "#{MAX_POR_IP} falhas do IP em #{JANELA / 60} min")
    end
    return unless login && FALHAS_CONTA.include?(tipo) && falhas_conta(login) == MAX_POR_CONTA

    registrar!("bloqueio", ip: ip, login: login, usuario_id: usuario_id, detalhe: "#{MAX_POR_CONTA} falhas contra a conta em #{JANELA / 60} min")
  end

  # Desbloqueio pelo administrador (a contagem recomeça do zero).
  def desbloquear!(ip: nil, conta_hash: nil, por:)
    return unless ativo?

    Database.garantir_tabelas!
    Database.insert("INSERT INTO eventos_seguranca (quando, tipo, ip, conta, usuario_id, detalhe) VALUES (?, 'desbloqueio', ?, ?, ?, ?)",
                    [agora, texto(ip), texto(conta_hash), nil, texto("por #{por}")])
  end

  # Bloqueios em vigor agora (para o painel do adm).
  def bloqueios_ativos
    return [] unless ativo?

    Database.garantir_tabelas!
    desde = agora - JANELA
    ips = Database.rows("SELECT DISTINCT ip FROM eventos_seguranca WHERE quando > ? AND ip IS NOT NULL", [desde]).map { |r| r["ip"] }
    contas = Database.rows("SELECT DISTINCT conta, usuario_id FROM eventos_seguranca WHERE quando > ? AND conta IS NOT NULL", [desde])
    lista = ips.select { |ip| falhas(COLUNAS[:ip], ip, FALHAS_IP) >= MAX_POR_IP }.map { |ip| { "tipo" => "ip", "ip" => ip } }
    contas.uniq { |r| r["conta"] }.each do |r|
      next unless falhas(COLUNAS[:conta], r["conta"], FALHAS_CONTA) >= MAX_POR_CONTA

      u = r["usuario_id"] && Usuarios.por_id(r["usuario_id"])
      lista << { "tipo" => "conta", "conta" => r["conta"], "login" => u ? u["login"] : nil }
    end
    lista
  end

  def eventos(limite = 100)
    return [] unless ativo?

    Database.garantir_tabelas!
    logins = Database.rows("SELECT id, login FROM usuarios").to_h { |u| [u["id"], u["login"]] }
    Database.rows("SELECT * FROM eventos_seguranca ORDER BY id DESC LIMIT ?", [limite.to_i.clamp(1, 1000)]).map do |e|
      { "quando" => Time.at(e["quando"]).utc.iso8601, "tipo" => e["tipo"], "ip" => e["ip"],
        "login" => logins[e["usuario_id"]], "detalhe" => e["detalhe"] }
    end
  end

  # --- senhas fracas ------------------------------------------------------------

  COMUNS = %w[
    12345678 123456789 1234567890 87654321 11111111 00000000 12341234 11223344 123123123 147258369
    password password1 password123 passw0rd qwerty123 qwertyuiop iloveyou sunshine princess football
    welcome1 abc12345 abcd1234 letmein1 trustno1 baseball superman starwars dragon12 monkey12
    senha123 senha1234 senha12345 minhasenha mudar123 mudar1234 trocar123 admin123 admin1234 administrador
    brasil123 flamengo corinthians palmeiras saopaulo vasco123 gremio12 cruzeiro internacional botafogo
    amor1234 teamo123 deusefiel jesus123 familia1 dashzon dashzon1 dashzon123
  ].to_set.freeze

  # nil se a senha serve; senão, o motivo.
  def motivo_senha_fraca(senha, login = nil)
    s = senha.to_s
    base = s.downcase
    return "A senha não pode ser igual ao login" if login && !login.to_s.empty? && base == login.to_s.downcase
    return "Essa senha é muito comum. Escolha outra (uma frase curta é ótima)" if COMUNS.include?(base)
    return "A senha não pode ser um caractere repetido" if s.chars.uniq.size == 1

    seq = "0123456789abcdefghijklmnopqrstuvwxyz"
    return "A senha não pode ser uma sequência (como 12345678 ou abcdefgh)" if seq.include?(base) || seq.reverse.include?(base)

    nil
  end

  # --- middleware -----------------------------------------------------------------

  # Cabeçalhos, origem e limite de requisições. Não conhece rotas nem usuários.
  class Protecao
    # Política de conteúdo: só scripts do próprio DashZon (sem inline, sem
    # eval); estilos inline são aceitos (GridStack e a prévia usam);
    # imagens de https: aparecem nas notas em Markdown.
    CSP = [
      "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:", "font-src 'self'", "connect-src 'self'",
      "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'"
    ].join("; ").freeze

    ESCRITA = %w[POST PUT PATCH DELETE].freeze

    # Requisições à API por IP por minuto (o importador de planilha manda uma
    # por linha; 1200 dá folga). Lido a cada requisição: o teste pode baixar.
    class << self
      attr_accessor :limite
    end
    self.limite = Ambiente["DASHZON_LIMITE_POR_MINUTO", "1200"].to_i

    def initialize(app)
      @app = app
      @contagem = {}   # ip => [minuto, n]
      @avisado = {}    # ip => minuto do último registro no diário (1 por minuto)
      @lock = Mutex.new
    end

    def call(env)
      req = Rack::Request.new(env)
      api = req.path_info.start_with?("/api/")
      if api && excesso?(req.ip)
        diario_uma_vez(req.ip, "excesso_requisicoes", "mais de #{Protecao.limite} requisições por minuto")
        return cabecalhos(resposta(429, "Muitas requisições. Espere um minuto.", "retry-after" => "60"), req)
      end
      if api && ESCRITA.include?(req.request_method) && !origem_ok?(req)
        diario_uma_vez(req.ip, "origem_recusada", "Origin #{env['HTTP_ORIGIN'].to_s[0, 100]}")
        return cabecalhos(resposta(403, "Origem não permitida"), req)
      end
      cabecalhos(@app.call(env), req)
    end

    private

    def resposta(status, msg, extra = {})
      [status, { "content-type" => "application/json" }.merge(extra), [JSON.generate(error: msg)]]
    end

    # O navegador manda Origin em toda escrita. Se veio, tem de ser este mesmo
    # endereço (outro site não escreve aqui, mesmo que o cookie fosse junto).
    # Sem Origin (curl, o importador em Python) segue: a sessão continua exigida.
    def origem_ok?(req)
      origem = req.get_header("HTTP_ORIGIN")
      return true if origem.nil? || origem.empty?
      return false if origem == "null"

      URI(origem).host.to_s.casecmp?(req.host.to_s)
    rescue URI::InvalidURIError
      false
    end

    def excesso?(ip)
      minuto = Time.now.to_i / 60
      @lock.synchronize do
        @contagem.delete_if { |_, (m, _)| m < minuto } if @contagem.size > 10_000
        m, n = @contagem[ip]
        n = m == minuto ? n + 1 : 1
        @contagem[ip] = [minuto, n]
        n > Protecao.limite
      end
    end

    def diario_uma_vez(ip, tipo, detalhe)
      minuto = Time.now.to_i / 60
      novo = @lock.synchronize { (@avisado[ip] != minuto).tap { @avisado[ip] = minuto } }
      Seguranca.registrar!(tipo, ip: ip, detalhe: detalhe) if novo
    rescue StandardError
      nil
    end

    def cabecalhos((status, headers, corpo), req)
      h = headers
      h["content-security-policy"] = CSP
      h["x-content-type-options"] = "nosniff"
      h["x-frame-options"] = "DENY"
      h["referrer-policy"] = "same-origin"
      h["permissions-policy"] = "camera=(), microphone=(), geolocation=(), payment=()"
      h["cross-origin-opener-policy"] = "same-origin"
      h["server"] = "DashZon" # sem anunciar versão de Ruby/servidor
      h.delete("x-xss-protection") # obsoleto; a CSP faz o papel
      h["strict-transport-security"] = "max-age=31536000" if req.ssl?
      [status, h, corpo]
    end
  end
end
