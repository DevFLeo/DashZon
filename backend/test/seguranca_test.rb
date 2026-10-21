require_relative "test_helper"

# Módulo de segurança (lib/seguranca.rb) e as proteções contra SQL injection,
# força bruta, outro site escrevendo aqui, excesso de requisições, sessão
# esquecida e senhas fracas.
class SegurancaTest < Minitest::Test
  include DashZonTeste

  BACKEND = File.expand_path("..", __dir__)

  def login_de(ip, usuario, senha)
    clear_cookies
    post "/api/login", JSON.generate("usuario" => usuario, "senha" => senha), "CONTENT_TYPE" => "application/json", "REMOTE_ADDR" => ip
    last_response
  end

  def criar_usuario!(login, perfil: "usuario", senha: "outra-senha-boa-1")
    post_json "/api/admin/usuarios", { "login" => login, "nome" => login, "perfil" => perfil, "senha" => senha, "deve_trocar_senha" => false }
    assert_equal 201, last_response.status, last_response.body
  end

  # --- SQL injection -------------------------------------------------------------

  # Todo SQL usa parâmetros (?). Esta varredura falha se alguém montar SQL com
  # texto interpolado (#{...}) fora da lista abaixo, em que só entram constantes
  # do próprio código ou marcadores "?".
  PERMITIDOS = [
    "ALTER TABLE usuarios ADD COLUMN \#{col} \#{tipo}",               # COLUNAS_USUARIO (constante)
    "ALTER TABLE dashboards ADD COLUMN \#{col} \#{tipo}",             # COLUNAS_DASHBOARD (constante)
    "PRAGMA user_version = \#{SCHEMA_VERSION}",                         # constante
    "PRAGMA user_version = \#{VERSAO_NOVA}",                            # constante
    "VACUUM INTO '\#{destino.gsub(\"'\", \"''\")}'",                    # caminho do backup, aspas escapadas
    "PRAGMA data_version",                                              # versao_dados (texto, não SQL montado)
    "WHERE \#{coluna} = ? AND quando > ? AND tipo IN (\#{marcas})",   # coluna de Seguranca::COLUNAS; marcas = "?, ?"
    "WHERE \#{coluna} = ? AND tipo IN (\#{marcas})"                   # idem
  ].freeze

  def test_nenhum_sql_monta_texto_com_dado
    arquivos = Dir[File.join(BACKEND, "{app.rb,rotas/*.rb,lib/*.rb}")]
    chamada = /\b(execute|execute_batch|get_first_value|prepare|rows?|insert|alterar)\s*\(\s*"/
    sql_solto = /^\s*"(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|PRAGMA|VACUUM)\b/i
    suspeitos = arquivos.flat_map do |f|
      File.readlines(f, encoding: "UTF-8").each_with_index.filter_map do |linha, i|
        next unless linha.include?('#{') && (linha.match?(chamada) || linha.match?(sql_solto))
        next if PERMITIDOS.any? { |p| linha.include?(p) }

        "#{File.basename(f)}:#{i + 1}: #{linha.strip}"
      end
    end
    assert_empty suspeitos, "SQL montado com texto interpolado (use ? e parâmetros):\n#{suspeitos.join("\n")}"
  end

  def test_ataques_de_sql_pela_api_nao_funcionam
    configurar!
    ["' OR '1'='1' --", "dono'--", "\" OR \"\"=\"", "dono' /*"].each do |ataque|
      assert_equal 401, login_de("203.0.113.1", ataque, "qualquer").status, ataque
    end

    entrar("dono", "senha-forte-1")
    post_json "/api/modulos", { "slug" => "itens", "nome" => "Itens", "campos" => [{ "id" => "nome", "tipo" => "texto" }] }
    texto = "Robert'); DROP TABLE registros;--"
    post_json "/api/modulos/itens/registros", { "nome" => texto }
    id = resposta["id"]
    get "/api/modulos/itens/registros/#{id}"
    assert_equal texto, resposta["nome"], "o texto é guardado como texto"

    get "/api/modulos/x'%20OR%20'1'='1"
    assert_equal 404, last_response.status
    if EngineClient.binary_path && File.exist?(EngineClient.binary_path)
      get "/api/modulos/itens/registros?q=#{CGI.escape("' OR 1=1 --")}"
      assert_equal [0, 200], [resposta["count"], last_response.status]
      get "/api/modulos/itens/registros?#{CGI.escape("f[nome' OR '1'='1]")}=x"
      assert_equal 0, resposta["count"]
    end
    post_json "/api/modulos", { "slug" => "a; DROP TABLE modulos", "nome" => "X", "campos" => [{ "id" => "a", "tipo" => "texto" }] }
    assert_equal 422, last_response.status

    assert_equal 1, Database.row("SELECT COUNT(*) AS n FROM registros")["n"], "a tabela continua lá, com o registro"
    assert Database.modulo("itens")
  end

  # --- força bruta -----------------------------------------------------------------

  def test_conta_atacada_de_muitos_ips_fica_bloqueada_e_o_adm_desbloqueia
    configurar!
    criar_usuario!("chefe", perfil: "admin", senha: "chefe-senha-boa-1")
    criar_usuario!("outra")

    Seguranca::MAX_POR_CONTA.times { |i| assert_equal 401, login_de("198.51.100.#{i + 1}", "dono", "errada-#{i}").status }
    r = login_de("198.51.100.200", "dono", "senha-forte-1")
    assert_equal 429, r.status, "a senha certa não passa enquanto a conta está bloqueada"
    assert_equal 200, login_de("198.51.100.201", "outra", "outra-senha-boa-1").status, "outra conta não é afetada"

    assert_equal 200, login_de("198.51.100.202", "chefe", "chefe-senha-boa-1").status
    get "/api/admin/seguranca"
    bloqueio = resposta["bloqueios"].find { |b| b["tipo"] == "conta" }
    assert_equal "dono", bloqueio["login"]
    assert resposta["eventos"].any? { |e| e["tipo"] == "bloqueio" && e["login"] == "dono" }
    post_json "/api/admin/seguranca/desbloquear", { "conta" => bloqueio["conta"] }
    assert_equal 200, last_response.status, last_response.body
    assert_equal 200, login_de("198.51.100.203", "dono", "senha-forte-1").status
  end

  def test_login_inexistente_e_bloqueado_igual_sem_revelar_nada
    configurar!
    Seguranca::MAX_POR_CONTA.times { |i| login_de("192.0.2.#{i + 1}", "fantasma", "x#{i}-qualquer") }
    r = login_de("192.0.2.100", "fantasma", "y-qualquer")
    assert_equal 429, r.status
    assert_equal "Muitas tentativas. Espere alguns minutos e tente de novo.", JSON.parse(r.body)["error"]
  end

  def test_bloqueio_por_ip_sobrevive_a_um_reinicio
    configurar!
    Seguranca::MAX_POR_IP.times { |i| login_de("203.0.113.9", "dono", "errada-#{i}") }
    Database.fechar! # como um reinício do servidor (a contagem antiga ficava em memória)
    assert_equal 429, login_de("203.0.113.9", "dono", "senha-forte-1").status
    assert_equal 200, login_de("203.0.113.10", "dono", "senha-forte-1").status, "outro IP entra"
  end

  def test_login_certo_zera_as_falhas_do_ip
    configurar!
    (Seguranca::MAX_POR_IP - 1).times { |i| login_de("203.0.113.20", "dono", "errada-#{i}") }
    assert_equal 200, login_de("203.0.113.20", "dono", "senha-forte-1").status
    (Seguranca::MAX_POR_IP - 1).times { |i| login_de("203.0.113.20", "dono", "errada-#{i}") }
    assert_equal 200, login_de("203.0.113.20", "dono", "senha-forte-1").status
  end

  def test_diario_nao_guarda_o_login_digitado_como_texto
    configurar!
    login_de("203.0.113.30", "minha-senha-no-campo-errado", "x-qualquer")
    linhas = Database.rows("SELECT * FROM eventos_seguranca").map(&:values).flatten.map(&:to_s)
    refute linhas.any? { |v| v.include?("minha-senha-no-campo-errado") }
    assert_equal 1, Seguranca.falhas_conta("Minha-Senha-No-Campo-Errado"), "conta pelo HMAC, sem diferenciar maiúsculas"
  end

  # O hexdigest do OpenSSL é texto "binário"; gravado assim, vira BLOB, que no
  # SQLite nunca é igual ao TEXT do desbloqueio (bug achado por este teste).
  def test_ip_e_conta_gravados_como_texto
    configurar!
    ip_binario = "203.0.113.77".b
    Seguranca.falhou!("login_falhou", ip: ip_binario, login: "dono")
    Seguranca.desbloquear!(ip: "203.0.113.77", conta_hash: Seguranca.conta("dono"), por: "teste")
    tipos = Database.rows("SELECT typeof(ip) AS ip, typeof(conta) AS conta FROM eventos_seguranca").flat_map(&:values).uniq
    assert_equal ["text"], tipos
    assert_equal 0, Seguranca.falhas_ip(ip_binario)
    assert_equal 0, Seguranca.falhas_conta("dono")
  end

  # --- outro site, excesso, cabeçalhos ------------------------------------------------

  def test_escrita_vinda_de_outro_site_e_recusada
    configurar!
    post "/api/dashboards", JSON.generate("nome" => "X"), "CONTENT_TYPE" => "application/json", "HTTP_ORIGIN" => "https://site-malicioso.example"
    assert_equal 403, last_response.status
    post "/api/dashboards", JSON.generate("nome" => "X"), "CONTENT_TYPE" => "application/json", "HTTP_ORIGIN" => "null"
    assert_equal 403, last_response.status
    # Origem é esquema + host + porta: outra porta ou http/https trocado é outro site.
    ["http://example.org:8080", "https://example.org", "http://example.org.malicioso.example"].each do |origem|
      post "/api/dashboards", JSON.generate("nome" => "X"), "CONTENT_TYPE" => "application/json", "HTTP_ORIGIN" => origem
      assert_equal 403, last_response.status, origem
    end
    # Um Referer de outro site com o Origin certo não é barrado nem derruba nada.
    post "/api/dashboards", JSON.generate("nome" => "R"), "CONTENT_TYPE" => "application/json",
         "HTTP_ORIGIN" => "http://example.org", "HTTP_REFERER" => "https://site-malicioso.example/pagina"
    assert_equal 201, last_response.status
    assert_empty Database.rows("SELECT id FROM dashboards WHERE nome = ?", ["X"]), "nada foi gravado pelas recusadas"
    # Atrás do Caddy o app recebe HTTP, mas o navegador está em https://dominio:
    # o X-Forwarded-Proto entra na comparação (senão ninguém gravaria nada).
    post "/api/dashboards", JSON.generate("nome" => "Caddy"), "CONTENT_TYPE" => "application/json",
         "HTTP_ORIGIN" => "https://example.org", "HTTP_X_FORWARDED_PROTO" => "https"
    assert_equal 201, last_response.status, "pelo Caddy, com HTTPS"
    # A recusa não derruba a sessão de quem foi alvo (antes o Rack::Protection a
    # descartava e a pessoa era deslogada).
    get "/api/eu"
    assert_equal 200, last_response.status, "a sessão continua depois da recusa"
    post "/api/dashboards", JSON.generate("nome" => "X"), "CONTENT_TYPE" => "application/json", "HTTP_ORIGIN" => "http://example.org"
    assert_equal 201, last_response.status, "o próprio endereço passa"
    post_json "/api/dashboards", { "nome" => "Y" }
    assert_equal 201, last_response.status, "sem Origin (curl, importador) passa: a sessão continua exigida"
    get "/api/modulos", {}, "HTTP_ORIGIN" => "https://site-malicioso.example"
    assert_equal 200, last_response.status, "leitura não é barrada (o navegador não entrega a resposta a outro site)"
  end

  def test_excesso_de_requisicoes_por_ip
    Seguranca::Protecao.limite = 5
    5.times { get "/api/status", {}, "REMOTE_ADDR" => "203.0.113.50" }
    get "/api/status", {}, "REMOTE_ADDR" => "203.0.113.50"
    assert_equal 429, last_response.status
    assert_equal "60", last_response.headers["retry-after"]
    get "/api/status", {}, "REMOTE_ADDR" => "203.0.113.51"
    assert_equal 200, last_response.status, "outro IP segue"
    get "/", {}, "REMOTE_ADDR" => "203.0.113.50"
    assert_equal 200, last_response.status, "a página (fora da API) não entra na conta"
  ensure
    Seguranca::Protecao.limite = 1_000_000
  end

  def test_cabecalhos_de_seguranca
    ["/", "/api/status", "/js/app.js", "/nao-existe"].each do |caminho|
      get caminho
      h = last_response.headers
      assert_includes h["content-security-policy"].to_s, "script-src 'self'", caminho
      assert_includes h["content-security-policy"].to_s, "frame-ancestors 'none'", caminho
      assert_equal "nosniff", h["x-content-type-options"], caminho
      assert_equal "DENY", h["x-frame-options"], caminho
      assert_equal "same-origin", h["referrer-policy"], caminho
      assert_equal "DashZon", h["server"], "#{caminho}: sem versão do servidor"
      assert_nil h["strict-transport-security"], "HSTS só por HTTPS"
    end
    get "/api/status", {}, "HTTPS" => "on"
    assert_match(/max-age=/, last_response.headers["strict-transport-security"])
  end

  # Sem o charset, clientes como o PowerShell 5.1 leem o JSON como Latin-1.
  def test_json_declara_utf8
    configurar!
    get "/api/eu"
    assert_equal "application/json;charset=utf-8", last_response.content_type
    post "/api/dashboards", "{}", "CONTENT_TYPE" => "application/json", "HTTP_ORIGIN" => "https://site-malicioso.example"
    assert_equal "application/json;charset=utf-8", last_response.content_type, "erro do middleware de segurança"
    post "/api/dashboards", "", "CONTENT_TYPE" => "application/json", "CONTENT_LENGTH" => (65 * 1024 * 1024).to_s
    assert_equal 413, last_response.status
    assert_equal "application/json;charset=utf-8", last_response.content_type, "corpo grande demais"
  end

  def test_pagina_sem_script_inline
    html = File.read(File.expand_path("../../frontend/index.html", __dir__), encoding: "UTF-8")
    refute_match(/<script(?![^>]*\bsrc=)[^>]*>/i, html, "a CSP só aceita scripts em arquivo")
    refute_match(/\son[a-z]+\s*=\s*"/i, html, "nada de onclick= e afins no HTML")
  end

  # --- sessão, senhas, painel ------------------------------------------------------------

  def test_sessao_parada_demais_cai
    configurar!
    get "/api/modulos"
    assert_equal 200, last_response.status
    antiga = SESSAO_OCIOSA
    Object.send(:remove_const, :SESSAO_OCIOSA)
    Object.const_set(:SESSAO_OCIOSA, -1)
    get "/api/modulos"
    assert_equal 401, last_response.status
  ensure
    Object.send(:remove_const, :SESSAO_OCIOSA)
    Object.const_set(:SESSAO_OCIOSA, antiga)
  end

  def test_senhas_fracas_recusadas
    { "12345678" => /comum/, "Senha123" => /comum/, "aaaaaaaa" => /repetido/, "abcdefghij" => /sequência/,
      "87654321" => /comum/, "dono-dono" => nil }.each do |senha, motivo|
      erro = Seguranca.motivo_senha_fraca(senha, "dono")
      motivo ? assert_match(motivo, erro.to_s, senha) : assert_nil(erro, senha)
    end
    assert_match(/igual ao login/, Seguranca.motivo_senha_fraca("Maria.Silva", "maria.silva"))

    # Senha forte é opção do administrador (desligada por padrão).
    configurar!
    put_json "/api/admin/ajustes", { "senha_forte" => true }
    assert_equal 200, last_response.status, last_response.body
    put_json "/api/eu/senha", { "senha_atual" => "senha-forte-1", "senha_nova" => "dono" * 2 }
    assert_equal 200, last_response.status, "'donodono' não é igual ao login"
    put_json "/api/eu/senha", { "senha_atual" => "donodono", "senha_nova" => "password123" }
    assert_equal 422, last_response.status
  end

  # Só o tamanho mínimo é regra fixa; o resto o administrador liga se quiser.
  def test_regras_de_senha_sao_opcoes_do_admin
    post_json "/api/setup", { "usuario" => "dono", "senha" => "1234567", "templates" => [] }
    assert_equal 422, last_response.status
    refute Database.configured?, "senha curta recusada antes de criar o banco"
    post_json "/api/setup", { "usuario" => "dono", "senha" => "12345678", "templates" => [] }
    assert_equal 200, last_response.status, "sem 'senha forte', senha fácil é aceita"

    get "/api/status"
    assert_equal({ "minima" => 8, "forte" => false, "maiuscula" => false, "numero" => false, "simbolo" => false }, resposta["regras_senha"])

    novo = ->(login, senha) { post_json "/api/admin/usuarios", { "login" => login, "nome" => login, "senha" => senha, "deve_trocar_senha" => false } }
    novo.("facil", "123ZX456")
    assert_equal 201, last_response.status, last_response.body

    put_json "/api/admin/ajustes", { "senha_minima" => 10, "senha_maiuscula" => true, "senha_numero" => true, "senha_simbolo" => true }
    assert_equal 200, last_response.status, last_response.body
    assert_equal "1", resposta["senha_maiuscula"]
    assert_equal "nao", resposta["exigir_documento"], "o que não veio continua igual"
    { "Abc12345!" => /ao menos 10/, "abcdefgh12!" => /maiúsculas/, "Abcdefghij!" => /números/, "Abcdefgh123" => /símbolo/ }.each do |senha, erro|
      novo.("x#{senha.length}#{rand(1000)}", senha)
      assert_equal 422, last_response.status, senha
      assert_match erro, resposta["error"], senha
    end
    novo.("forte", "Abcdefgh12!")
    assert_equal 201, last_response.status, last_response.body

    # Sem senha informada, a temporária gerada cumpre as regras em vigor.
    post_json "/api/admin/usuarios", { "login" => "temp", "nome" => "Temp" }
    assert_equal 201, last_response.status, last_response.body
    assert_operator resposta["senha_temporaria"].length, :>=, 12
    assert_match(/[^A-Za-z0-9]/, resposta["senha_temporaria"])

    [5, 65, "abc"].each do |ruim|
      put_json "/api/admin/ajustes", { "senha_minima" => ruim }
      assert_equal 422, last_response.status, ruim.inspect
    end
  end

  def test_painel_de_seguranca_so_para_admin
    configurar!
    criar_usuario!("comum")
    get "/api/admin/seguranca"
    ids = resposta["checagens"].map { |c| c["id"] }
    assert_equal %w[https cookie admins temporarias falhas sessao], ids
    assert resposta["eventos"].any? { |e| e["tipo"] == "login_ok" || e["tipo"] == "logout" } || resposta["eventos"].is_a?(Array)

    entrar("comum", "outra-senha-boa-1")
    get "/api/admin/seguranca"
    assert_equal 403, last_response.status
    post_json "/api/admin/seguranca/desbloquear", { "ip" => "1.2.3.4" }
    assert_equal 403, last_response.status
  end
end
