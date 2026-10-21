require "json"
require "openssl"
require "securerandom"
require "time"
require_relative "database"
require_relative "segredo"
require_relative "documento"
require_relative "github"
require_relative "seguranca"

# Contas de acesso: cadastro, perfis, senhas, links de uso único e os ajustes
# do painel do administrador. Toda regra de usuário mora aqui; as rotas em
# rotas/usuarios.rb só chamam estas funções.
#
# Hash:
#  - senha: PBKDF2-HMAC-SHA256 com sal por usuário (100 mil iterações);
#  - CPF/CNPJ: HMAC-SHA256 com a chave do servidor (Segredo), mais uma versão
#    mascarada para exibir; o número completo não é gravado;
#  - tokens de link: SHA-256 (o token em si só existe no link enviado).
module Usuarios
  class Erro < StandardError
    attr_reader :status

    def initialize(msg, status = 422)
      super(msg)
      @status = status
    end
  end

  SENHA_MINIMA = 8
  SENHA_MAXIMA = 200
  ITERACOES = 100_000 # não mudar: as senhas já gravadas usam este valor
  LOGIN_RE = /\A[a-zA-Z0-9._-]{3,40}\z/
  EMAIL_RE = /\A[^@\s]+@[^@\s]+\.[^@\s]{2,}\z/
  PERFIS = %w[admin usuario].freeze
  CARGOS_SUGERIDOS = ["Sócio", "Líder de produção", "Funcionário"].freeze
  EXIGIR_DOCUMENTO = %w[nao cpf cnpj qualquer].freeze
  TEMAS = %w[sistema claro suave escuro].freeze
  # Fontes da interface (arquivos em frontend/vendor/fonts; ver js/fonte.js).
  FONTES = %w[inter sistema nunito atkinson].freeze
  # Tamanho do texto da interface (escala --fs no CSS; ver js/fonte.js).
  TAMANHOS_FONTE = %w[pequena normal grande muito_grande].freeze
  # "" (padrão), "#/d/<id>" (dashboard), "#/m/<slug>" (módulo) ou "#/admin".
  PAGINA_INICIAL_RE = %r{\A(|#/d/\d{1,9}|#/m/[a-z][a-z0-9_]{0,39}|#/admin)\z}
  # modulos_ocultos: módulos que a pessoa desligou em Configurações > Módulos
  # (somem do menu dela; os dados e os cards continuam, e os outros usuários
  # não são afetados).
  PREFERENCIAS_PADRAO = { "tema" => "sistema", "fonte" => "inter", "tamanho_fonte" => "normal", "github_usuario" => "", "pagina_inicial" => "", "privacidade" => false,
                          "modulos_ocultos" => [].freeze, "ordem_menu" => { "dashboards" => [].freeze, "modulos" => [].freeze }.freeze }.freeze
  OCULTOS_MAX = 100
  # ordem_menu: a ordem que a pessoa arrastou na barra lateral (só dela).
  # Itens fora da lista vão para o fim, na ordem normal; ids que não existem
  # mais são ignorados no navegador.
  ORDEM_MAX = 500
  AJUSTES_PADRAO = {
    "exigir_documento" => "nao",      # nao | cpf | cnpj | qualquer
    "exigir_email" => "0",            # e-mail obrigatório no cadastro
    "exigir_email_verificado" => "0", # só entra quem verificou o e-mail (admin sempre entra)
    # Regras de senha (Painel do adm > Regras de senha). Só o tamanho mínimo
    # vale sempre; o resto é opção do administrador, desligada por padrão.
    "senha_minima" => SENHA_MINIMA.to_s,
    "senha_forte" => "0",     # recusa as mais comuns, sequências, um caractere repetido e igual ao login
    "senha_maiuscula" => "0", # letras maiúsculas e minúsculas
    "senha_numero" => "0",    # letras e números
    "senha_simbolo" => "0"    # ao menos um símbolo (! @ # $ ...)
  }.freeze
  SENHA_MINIMA_FAIXA = (6..64).freeze
  OPCOES_SENHA = %w[senha_forte senha_maiuscula senha_numero senha_simbolo].freeze
  VALIDADE = { "redefinir_senha" => 24 * 3600, "verificar_email" => 7 * 24 * 3600 }.freeze
  # Hash de uma senha qualquer, usado quando o login não existe: a resposta
  # leva o mesmo tempo, então não dá para descobrir logins pelo relógio.
  SAL_FALSO = SecureRandom.hex(16)

  module_function

  # --- consultas -------------------------------------------------------------

  def tabelas!
    Database.garantir_tabelas!
  end

  def existe_algum?
    tabelas!
    !Database.row("SELECT id FROM usuarios LIMIT 1").nil?
  end

  def por_id(id)
    tabelas!
    Database.row("SELECT * FROM usuarios WHERE id = ?", [id.to_i])
  end

  def por_login_ou_email(texto)
    tabelas!
    t = texto.to_s.strip
    return nil if t.empty?

    Database.row("SELECT * FROM usuarios WHERE login = ? COLLATE NOCASE OR (email IS NOT NULL AND email = ? COLLATE NOCASE)
                  ORDER BY id LIMIT 1", [t, t])
  end

  def todos
    tabelas!
    Database.rows("SELECT * FROM usuarios ORDER BY perfil, lower(COALESCE(nome, login))").map { |u| publico(u) }
  end

  # O que pode sair na API: nunca hash de senha, sal ou hash de documento.
  def publico(u)
    {
      "id" => u["id"],
      "login" => u["login"],
      "nome" => u["nome"].to_s,
      "email" => u["email"],
      "email_verificado" => !u["email_verificado_em"].nil?,
      "documento_tipo" => u["documento_tipo"],
      "documento" => u["documento_mascara"],
      "cargo" => u["cargo"].to_s,
      "perfil" => u["perfil"],
      "admin" => u["perfil"] == "admin",
      "ativo" => u["ativo"].to_i == 1,
      "deve_trocar_senha" => u["deve_trocar_senha"].to_i == 1,
      "ultimo_login_em" => u["ultimo_login_em"],
      "criado_em" => u["criado_em"],
      "preferencias" => preferencias(u)
    }
  end

  # --- preferências pessoais (Minha conta) ------------------------------------------

  def preferencias(u)
    salvas = JSON.parse(u["preferencias"].to_s)
    PREFERENCIAS_PADRAO.merge(salvas.is_a?(Hash) ? salvas.slice(*PREFERENCIAS_PADRAO.keys) : {})
  rescue JSON::ParserError
    PREFERENCIAS_PADRAO.dup
  end

  # Só valida formato; a página inicial é conferida no navegador (se o
  # dashboard ou módulo não existir mais, cai na página padrão).
  def salvar_preferencias!(id, d)
    u = por_id(id) || raise(Erro.new("Usuário não encontrado", 404))
    prefs = preferencias(u)
    if d.key?("tema")
      raise Erro, "Tema inválido" unless TEMAS.include?(d["tema"])

      prefs["tema"] = d["tema"]
    end
    if d.key?("fonte")
      raise Erro, "Fonte inválida" unless FONTES.include?(d["fonte"])

      prefs["fonte"] = d["fonte"]
    end
    if d.key?("tamanho_fonte")
      raise Erro, "Tamanho de fonte inválido" unless TAMANHOS_FONTE.include?(d["tamanho_fonte"])

      prefs["tamanho_fonte"] = d["tamanho_fonte"]
    end
    # Usuário do GitHub do painel de contribuições ("" = nenhum).
    if d.key?("github_usuario")
      gh = d["github_usuario"].to_s.strip.delete_prefix("@")
      raise Erro, "Usuário do GitHub inválido (letras, números e hífen, até 39)" unless gh.empty? || Github.usuario_valido?(gh)

      prefs["github_usuario"] = gh
    end
    if d.key?("pagina_inicial")
      pagina = d["pagina_inicial"].to_s
      raise Erro, "Página inicial inválida" unless pagina.match?(PAGINA_INICIAL_RE)

      prefs["pagina_inicial"] = pagina
    end
    prefs["privacidade"] = d["privacidade"] == true if d.key?("privacidade")
    if d.key?("modulos_ocultos")
      lista = d["modulos_ocultos"]
      valida = lista.is_a?(Array) && lista.size <= OCULTOS_MAX && lista.all? { |s| s.is_a?(String) && s.match?(/\A[a-z][a-z0-9_]{0,39}\z/) }
      raise Erro, "Lista de módulos ocultos inválida" unless valida

      prefs["modulos_ocultos"] = lista.uniq
    end
    prefs["ordem_menu"] = validar_ordem_menu!(d["ordem_menu"]) if d.key?("ordem_menu")
    Database.execute("UPDATE usuarios SET preferencias = ?, atualizado_em = ? WHERE id = ?", [JSON.generate(prefs), Database.now, u["id"]])
    por_id(u["id"])
  end

  def validar_ordem_menu!(o)
    valida = o.is_a?(Hash) && (o.keys - %w[dashboards modulos]).empty? &&
             o.fetch("dashboards", []).then { |l| l.is_a?(Array) && l.size <= ORDEM_MAX && l.all? { |i| i.is_a?(Integer) && i.positive? } } &&
             o.fetch("modulos", []).then { |l| l.is_a?(Array) && l.size <= ORDEM_MAX && l.all? { |s| s.is_a?(String) && s.match?(/\A[a-z][a-z0-9_]{0,39}\z/) } }
    raise Erro, "Ordem do menu inválida" unless valida

    { "dashboards" => o.fetch("dashboards", []).uniq, "modulos" => o.fetch("modulos", []).uniq }
  end

  # "Sair dos outros dispositivos": sobe a versão da sessão. Quem chamou
  # recebe a versão nova para continuar conectado.
  def encerrar_outras_sessoes!(id)
    Database.execute("UPDATE usuarios SET sessao_versao = sessao_versao + 1 WHERE id = ?", [id.to_i])
    por_id(id)
  end

  def admins_ativos
    Database.row("SELECT COUNT(*) AS n FROM usuarios WHERE perfil = 'admin' AND ativo = 1")["n"].to_i
  end

  # --- ajustes do painel -------------------------------------------------------

  def ajustes
    tabelas!
    salvos = Database.rows("SELECT chave, valor FROM ajustes").to_h { |r| [r["chave"], r["valor"]] }
    AJUSTES_PADRAO.merge(salvos.slice(*AJUSTES_PADRAO.keys))
  end

  # Campos ausentes mantêm o valor atual (o formulário de cadastro e o de
  # senha salvam separados).
  def salvar_ajustes!(d)
    atual = ajustes
    novos = {
      "exigir_documento" => (d.key?("exigir_documento") ? d["exigir_documento"] : atual["exigir_documento"]).to_s,
      "exigir_email" => d.key?("exigir_email") ? (d["exigir_email"] ? "1" : "0") : atual["exigir_email"],
      "exigir_email_verificado" => d.key?("exigir_email_verificado") ? (d["exigir_email_verificado"] ? "1" : "0") : atual["exigir_email_verificado"]
    }
    raise Erro, "Opção de documento inválida" unless EXIGIR_DOCUMENTO.include?(novos["exigir_documento"])
    if d.key?("senha_minima")
      minima = Integer(d["senha_minima"].to_s, exception: false)
      unless minima && SENHA_MINIMA_FAIXA.cover?(minima)
        raise Erro, "Tamanho mínimo da senha: de #{SENHA_MINIMA_FAIXA.min} a #{SENHA_MINIMA_FAIXA.max} caracteres"
      end

      novos["senha_minima"] = minima.to_s
    end
    OPCOES_SENHA.each { |k| novos[k] = d[k] ? "1" : "0" if d.key?(k) }
    # Verificar e-mail sem exigir e-mail deixaria quem não tem e-mail trancado.
    novos["exigir_email"] = "1" if novos["exigir_email_verificado"] == "1"

    Database.transaction do
      novos.each { |k, v| Database.execute("INSERT INTO ajustes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", [k, v]) }
    end
    ajustes
  end

  # --- validação de cadastro -----------------------------------------------------

  # Regras de senha em vigor. Antes do setup não há banco (e ele não pode ser
  # criado só para ler isto): valem os padrões.
  def regras_senha
    a = Database.configured? ? ajustes : AJUSTES_PADRAO
    minima = a["senha_minima"].to_i
    {
      "minima" => SENHA_MINIMA_FAIXA.cover?(minima) ? minima : SENHA_MINIMA,
      "forte" => a["senha_forte"] == "1",
      "maiuscula" => a["senha_maiuscula"] == "1",
      "numero" => a["senha_numero"] == "1",
      "simbolo" => a["senha_simbolo"] == "1"
    }
  end

  # Só o tamanho é regra fixa. Senha forte (`login`: recusa a igual ao próprio
  # login, as mais comuns e sequências; Seguranca.motivo_senha_fraca),
  # maiúsculas, números e símbolos valem quando o administrador liga.
  def validar_senha!(senha, login: nil)
    s = senha.to_s
    r = regras_senha
    raise Erro, "A senha precisa ter ao menos #{r['minima']} caracteres" if s.length < r["minima"]
    raise Erro, "A senha pode ter no máximo #{SENHA_MAXIMA} caracteres" if s.length > SENHA_MAXIMA
    raise Erro, "A senha não pode ser só espaços" if s.strip.empty?

    if r["forte"]
      motivo = Seguranca.motivo_senha_fraca(s, login)
      raise Erro, motivo if motivo
    end
    raise Erro, "A senha precisa ter letras maiúsculas e minúsculas" if r["maiuscula"] && !(s.match?(/\p{Lu}/) && s.match?(/\p{Ll}/))
    raise Erro, "A senha precisa ter letras e números" if r["numero"] && !(s.match?(/\p{L}/) && s.match?(/\d/))
    raise Erro, "A senha precisa ter ao menos um símbolo (como ! @ # $ %)" if r["simbolo"] && !s.match?(/[^\p{L}\d\s]/)

    s
  end

  # Normaliza e valida os dados de cadastro. `atual` é o usuário sendo editado
  # (nil ao criar). Campos ausentes em `d` mantêm o valor atual.
  def validar_dados!(d, atual: nil)
    aj = ajustes
    out = {}

    login = d.key?("login") ? d["login"].to_s.strip : atual&.dig("login").to_s
    raise Erro, "Login deve ter de 3 a 40 caracteres: letras, números, ponto, hífen ou _" unless login.match?(LOGIN_RE)
    if (dono = Database.row("SELECT id FROM usuarios WHERE login = ? COLLATE NOCASE", [login])) && dono["id"] != atual&.dig("id")
      raise Erro, "Já existe um usuário com o login '#{login}'"
    end
    out["login"] = login

    nome = d.key?("nome") ? d["nome"].to_s.strip : atual&.dig("nome").to_s
    raise Erro, "Informe o nome" if nome.empty?
    raise Erro, "Nome muito longo (máximo 80)" if nome.length > 80
    out["nome"] = nome

    email = d.key?("email") ? d["email"].to_s.strip.downcase : atual&.dig("email").to_s
    if email.empty?
      raise Erro, "Informe o e-mail" if aj["exigir_email"] == "1"

      out["email"] = nil
    else
      raise Erro, "E-mail inválido" unless email.match?(EMAIL_RE) && email.length <= 120
      if (dono = Database.row("SELECT id FROM usuarios WHERE email = ? COLLATE NOCASE", [email])) && dono["id"] != atual&.dig("id")
        raise Erro, "Este e-mail já está em uso por outro usuário"
      end
      out["email"] = email
    end

    out.merge!(validar_documento!(d, atual, aj["exigir_documento"]))

    out["cargo"] = (d.key?("cargo") ? d["cargo"] : atual&.dig("cargo")).to_s.strip[0, 40]

    perfil = (d.key?("perfil") ? d["perfil"] : atual&.dig("perfil") || "usuario").to_s
    raise Erro, "Perfil inválido" unless PERFIS.include?(perfil)
    out["perfil"] = perfil
    out
  end

  def validar_documento!(d, atual, exigir)
    aceitos = { "cpf" => %w[cpf], "cnpj" => %w[cnpj] }.fetch(exigir, %w[cpf cnpj])
    texto = d["documento"].to_s.strip

    if texto.empty?
      tem = atual && atual["documento_hash"]
      # Editando sem mandar o documento: mantém o que já estava.
      return atual.slice("documento_tipo", "documento_hash", "documento_mascara") if tem && !d.key?("documento")
      raise Erro, "Informe o #{aceitos.map(&:upcase).join(' ou ')}" if exigir != "nao"

      return { "documento_tipo" => nil, "documento_hash" => nil, "documento_mascara" => nil }
    end

    begin
      tipo, digitos = Documento.validar!(texto, aceitos: aceitos)
    rescue Documento::Invalido => e
      raise Erro, e.message
    end
    hash = Segredo.hmac("#{tipo}:#{digitos}")
    if (dono = Database.row("SELECT id FROM usuarios WHERE documento_hash = ?", [hash])) && dono["id"] != atual&.dig("id")
      raise Erro, "Este #{tipo.upcase} já está cadastrado para outro usuário"
    end

    { "documento_tipo" => tipo, "documento_hash" => hash, "documento_mascara" => Documento.mascarar(tipo, digitos) }
  end

  # --- escrita ---------------------------------------------------------------------

  def hash_senha(senha, sal)
    OpenSSL::KDF.pbkdf2_hmac(senha.to_s, salt: sal, iterations: ITERACOES, length: 32, hash: "SHA256").unpack1("H*")
  end

  def criar!(d, senha:, deve_trocar: false)
    tabelas!
    dados = validar_dados!(d)
    validar_senha!(senha, login: dados["login"])
    sal = SecureRandom.hex(16)
    now = Database.now
    Database.insert(
      "INSERT INTO usuarios (login, senha_hash, sal, criado_em, atualizado_em, nome, email, documento_tipo, documento_hash,
                             documento_mascara, cargo, perfil, ativo, deve_trocar_senha, sessao_versao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1)",
      [dados["login"], hash_senha(senha, sal), sal, now, now, dados["nome"], dados["email"], dados["documento_tipo"],
       dados["documento_hash"], dados["documento_mascara"], dados["cargo"], dados["perfil"], deve_trocar ? 1 : 0]
    )
  end

  # `por_admin`: só o administrador muda perfil e cargo de alguém.
  def atualizar!(id, d, por_admin:)
    atual = por_id(id) || raise(Erro.new("Usuário não encontrado", 404))
    d = d.reject { |k, _| %w[perfil cargo login].include?(k) } unless por_admin
    dados = validar_dados!(d, atual: atual)

    if atual["perfil"] == "admin" && dados["perfil"] != "admin"
      garantir_outro_admin!(atual, "tirar o perfil de administrador de")
    end

    # E-mail trocado precisa ser verificado de novo.
    verificado = dados["email"] == atual["email"] ? atual["email_verificado_em"] : nil
    Database.execute(
      "UPDATE usuarios SET login = ?, nome = ?, email = ?, email_verificado_em = ?, documento_tipo = ?, documento_hash = ?,
       documento_mascara = ?, cargo = ?, perfil = ?, atualizado_em = ? WHERE id = ?",
      [dados["login"], dados["nome"], dados["email"], verificado, dados["documento_tipo"], dados["documento_hash"],
       dados["documento_mascara"], dados["cargo"], dados["perfil"], Database.now, atual["id"]]
    )
    por_id(atual["id"])
  end

  # Troca a senha e derruba as outras sessões desse usuário (sessao_versao+1).
  def definir_senha!(id, nova, deve_trocar: false)
    validar_senha!(nova, login: por_id(id)&.dig("login"))
    sal = SecureRandom.hex(16)
    Database.execute(
      "UPDATE usuarios SET senha_hash = ?, sal = ?, deve_trocar_senha = ?, sessao_versao = sessao_versao + 1, atualizado_em = ?
       WHERE id = ?", [hash_senha(nova, sal), sal, deve_trocar ? 1 : 0, Database.now, id.to_i]
    )
    # Links de redefinição pendentes deixam de valer.
    Database.execute("UPDATE tokens SET usado_em = ? WHERE usuario_id = ? AND tipo = 'redefinir_senha' AND usado_em IS NULL",
                     [Database.now, id.to_i])
    por_id(id)
  end

  def definir_ativo!(id, ativo)
    u = por_id(id) || raise(Erro.new("Usuário não encontrado", 404))
    garantir_outro_admin!(u, "desativar") if !ativo && u["perfil"] == "admin"
    Database.execute("UPDATE usuarios SET ativo = ?, sessao_versao = sessao_versao + 1, atualizado_em = ? WHERE id = ?",
                     [ativo ? 1 : 0, Database.now, u["id"]])
    por_id(u["id"])
  end

  def marcar_email_verificado!(id, verificado)
    u = por_id(id) || raise(Erro.new("Usuário não encontrado", 404))
    raise Erro, "Este usuário não tem e-mail cadastrado" if verificado && u["email"].to_s.empty?

    Database.execute("UPDATE usuarios SET email_verificado_em = ? WHERE id = ?", [verificado ? Database.now : nil, u["id"]])
    por_id(u["id"])
  end

  # Os dashboards de quem é excluído passam para `herdeiro_id` (o administrador
  # que excluiu), mantendo a visibilidade: nada some junto com a conta.
  def excluir!(id, herdeiro_id: nil)
    u = por_id(id) || raise(Erro.new("Usuário não encontrado", 404))
    garantir_outro_admin!(u, "excluir") if u["perfil"] == "admin"
    Database.transaction do
      if herdeiro_id
        Database.execute("UPDATE dashboards SET dono_id = ?, atualizado_em = ? WHERE dono_id = ?", [herdeiro_id, Database.now, u["id"]])
      end
      Database.execute("DELETE FROM usuarios WHERE id = ?", [u["id"]])
    end
  end

  def garantir_outro_admin!(u, acao)
    return unless u["perfil"] == "admin" && u["ativo"].to_i == 1
    return if admins_ativos > 1

    raise Erro, "Não é possível #{acao} o único administrador ativo. Promova outra pessoa antes."
  end

  def registrar_login!(id)
    Database.execute("UPDATE usuarios SET ultimo_login_em = ? WHERE id = ?", [Database.now, id])
  end

  # --- autenticação ---------------------------------------------------------------

  def senha_confere?(u, senha)
    OpenSSL.fixed_length_secure_compare(hash_senha(senha, u["sal"]), u["senha_hash"])
  end

  # Devolve o usuário ou nil. Mesmo custo quando o login não existe.
  def autenticar(login_ou_email, senha)
    u = por_login_ou_email(login_ou_email)
    unless u
      hash_senha(senha, SAL_FALSO)
      return nil
    end
    senha_confere?(u, senha) ? u : nil
  end

  # Regras que impedem a entrada mesmo com a senha certa.
  def pode_entrar!(u)
    raise Erro.new("Este usuário está desativado. Fale com o administrador.", 403) unless u["ativo"].to_i == 1
    return if u["perfil"] == "admin"

    if ajustes["exigir_email_verificado"] == "1" && u["email_verificado_em"].nil?
      raise Erro.new("Seu e-mail ainda não foi verificado. Abra o link enviado por e-mail ou fale com o administrador.", 403)
    end
  end

  # 12 caracteres sem os que se confundem (0/O, 1/l/I).
  # Cumpre as regras de senha em vigor: maiúscula, minúscula e número sempre,
  # símbolo se exigido, e o tamanho mínimo (pelo menos 12).
  def senha_temporaria
    r = regras_senha
    sorteia = ->(l) { l[SecureRandom.random_number(l.size)] }
    maiusc = "ABCDEFGHJKLMNPQRSTUVWXYZ".chars
    minusc = "abcdefghijkmnpqrstuvwxyz".chars
    numeros = "23456789".chars
    simbolos = "!@#$%&*?".chars
    alfabeto = maiusc + minusc + numeros
    base = [sorteia.(maiusc), sorteia.(minusc), sorteia.(numeros)]
    base << sorteia.(simbolos) if r["simbolo"]
    base += Array.new([12, r["minima"]].max - base.size) { sorteia.(alfabeto) }
    base.shuffle(random: SecureRandom).join
  end

  # --- links de uso único ------------------------------------------------------------

  def criar_token!(usuario_id, tipo, dado = nil)
    tabelas!
    token = Segredo.novo_token
    now = Time.now.utc
    Database.execute(
      "INSERT INTO tokens (usuario_id, tipo, token_hash, dado, expira_em, criado_em) VALUES (?, ?, ?, ?, ?, ?)",
      [usuario_id, tipo, Segredo.hash_token(token), dado, (now + VALIDADE.fetch(tipo)).iso8601, now.iso8601]
    )
    token
  end

  # Valida e marca o token como usado. Devolve o usuário dono dele.
  def consumir_token!(tipo, token)
    tabelas!
    t = Database.row("SELECT * FROM tokens WHERE token_hash = ? AND tipo = ?", [Segredo.hash_token(token), tipo])
    invalido = "Link inválido ou expirado. Peça um novo."
    raise Erro, invalido unless t && t["usado_em"].nil? && Time.iso8601(t["expira_em"]) > Time.now.utc

    u = por_id(t["usuario_id"]) || raise(Erro, invalido)
    # Link de verificação vale só para o e-mail para o qual foi gerado.
    raise Erro, invalido if tipo == "verificar_email" && t["dado"] != u["email"]

    # Marca como usado só se ainda não estava: de duas requisições simultâneas
    # com o mesmo link, só uma passa.
    usado = Database.alterar("UPDATE tokens SET usado_em = ? WHERE id = ? AND usado_em IS NULL", [Database.now, t["id"]])
    raise Erro, invalido unless usado.positive?

    u
  end
end
