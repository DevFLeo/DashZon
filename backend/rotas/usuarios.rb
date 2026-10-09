# Rotas de conta: login, sessão, "minha conta", links de redefinição e
# verificação, e o painel do administrador (/api/admin/*). A regra de negócio
# fica em lib/usuarios.rb; aqui só entra e sai HTTP.

# --------------------------------------------------- limite de tentativas ---
# Contra tentativa e erro (o sistema pode estar na internet): depois de
# TENTATIVAS_MAX falhas de um mesmo IP em JANELA_BLOQUEIO segundos, login e
# pedidos de redefinição ficam bloqueados para esse IP até a janela passar.
# Fica em memória: reiniciar o servidor zera a contagem.
TENTATIVAS_MAX = 8
JANELA_BLOQUEIO = 15 * 60
FALHAS = Hash.new { |h, k| h[k] = [] }
FALHAS_LOCK = Mutex.new

def falhas_recentes(ip)
  FALHAS_LOCK.synchronize do
    return 0 unless FALHAS.key?(ip)

    FALHAS[ip].reject! { |t| t < Time.now - JANELA_BLOQUEIO }
    # IP sem falhas na janela sai do mapa: senão ele cresce um item por IP, para sempre.
    FALHAS.delete(ip) if FALHAS[ip].empty?
    FALHAS.fetch(ip, []).size
  end
end

def registrar_falha(ip)
  FALHAS_LOCK.synchronize { FALHAS[ip] << Time.now }
end

helpers do
  def barrar_se_muitas_tentativas!
    return if falhas_recentes(request.ip) < TENTATIVAS_MAX

    halt json({ error: "Muitas tentativas. Espere alguns minutos e tente de novo." }, 429)
  end

  def iniciar_sessao(u)
    session.clear
    session[:uid] = u["id"]
    session[:sv] = u["sessao_versao"].to_i
    Usuarios.registrar_login!(u["id"])
  end

  # Endereço usado nos links enviados. Atrás do Caddy, o Rack já considera
  # os cabeçalhos X-Forwarded-*; DASHZON_URL_PUBLICA força um endereço fixo.
  def url_publica
    (Ambiente["DASHZON_URL_PUBLICA"] || request.base_url).chomp("/")
  end

  def link_redefinicao(u)
    "#{url_publica}/#/redefinir/#{Usuarios.criar_token!(u['id'], 'redefinir_senha')}"
  end

  def link_verificacao(u)
    "#{url_publica}/#/verificar-email/#{Usuarios.criar_token!(u['id'], 'verificar_email', u['email'])}"
  end

  def enviar_verificacao(u)
    raise Usuarios::Erro, "Este usuário não tem e-mail cadastrado" if u["email"].to_s.empty?

    Correio.enviar(u["email"], "DashZon: confirme seu e-mail", <<~TXT)
      Olá, #{u['nome'].to_s.empty? ? u['login'] : u['nome']}!

      Para confirmar este e-mail no DashZon, abra o link abaixo (vale por 7 dias):
      #{link_verificacao(u)}

      Se você não pediu isso, é só ignorar esta mensagem.
    TXT
  end

  def usuario_alvo!
    Usuarios.por_id(params[:id]) || halt(json({ error: "Usuário não encontrado" }, 404))
  end

  def nao_em_si_mesmo!(u, acao)
    halt json({ error: "Você não pode #{acao} a si mesmo. Peça a outro administrador." }, 422) if u["id"] == usuario_atual["id"]
  end
end

# --------------------------------------------------------------- sessão ---
post "/api/login" do
  halt json({ error: "O sistema ainda não foi configurado" }, 409) unless Database.configured?
  barrar_se_muitas_tentativas!

  d = body_json
  u = Usuarios.autenticar(d["usuario"], d["senha"].to_s)
  unless u
    registrar_falha(request.ip)
    sleep 0.5 # deixa a tentativa e erro mais lenta
    halt json({ error: "Usuário ou senha inválidos" }, 401)
  end

  Usuarios.pode_entrar!(u)
  FALHAS_LOCK.synchronize { FALHAS.delete(request.ip) }
  iniciar_sessao(u)
  json ok: true, usuario: Usuarios.publico(u)
end

post "/api/logout" do
  session.clear
  json ok: true
end

# Banco sem nenhum usuário (criado antes do login existir): quem abrir primeiro
# cria o usuário, que já nasce administrador. Depois disso esta rota não age.
post "/api/usuarios/primeiro" do
  halt json({ error: "O sistema ainda não foi configurado" }, 409) unless Database.configured?
  halt json({ error: "Já existe um usuário. Faça login." }, 409) if Usuarios.existe_algum?

  d = body_json
  id = Usuarios.criar!({ "login" => d["usuario"], "nome" => d["nome"].to_s.strip.empty? ? d["usuario"] : d["nome"],
                         "email" => d["email"], "documento" => d["documento"], "perfil" => "admin" }, senha: d["senha"].to_s)
  u = Usuarios.por_id(id)
  iniciar_sessao(u)
  json ok: true, usuario: Usuarios.publico(u)
end

# ------------------------------------------------ esqueci / links de e-mail ---
# Resposta sempre igual (existindo ou não o usuário), para não revelar quem
# tem conta. Sem SMTP configurado, orienta a falar com o administrador.
post "/api/senha/esqueci" do
  barrar_se_muitas_tentativas!
  registrar_falha(request.ip) # conta como tentativa: evita disparar e-mails em massa

  unless Correio.configurado?
    halt json({ ok: true, mensagem: "O envio de e-mail não está configurado. Peça ao administrador um link ou uma senha temporária." })
  end

  u = Usuarios.por_login_ou_email(body_json["usuario"])
  if u && u["ativo"].to_i == 1 && !u["email"].to_s.empty?
    begin
      Correio.enviar(u["email"], "DashZon: redefinir senha", <<~TXT)
        Olá, #{u['nome'].to_s.empty? ? u['login'] : u['nome']}!

        Para criar uma senha nova no DashZon, abra o link abaixo (vale por 24 horas):
        #{link_redefinicao(u)}

        Se você não pediu isso, ignore esta mensagem: sua senha atual continua valendo.
      TXT
    rescue Correio::Falha
      nil # não revela nada a quem pediu; o administrador pode gerar o link
    end
  end
  json ok: true, mensagem: "Se existir uma conta com e-mail para esse usuário, enviamos um link de redefinição."
end

post "/api/senha/redefinir" do
  barrar_se_muitas_tentativas!
  d = body_json
  Usuarios.validar_senha!(d["senha"])
  begin
    u = Usuarios.consumir_token!("redefinir_senha", d["token"])
  rescue Usuarios::Erro
    registrar_falha(request.ip)
    raise
  end
  Usuarios.definir_senha!(u["id"], d["senha"])
  json ok: true, mensagem: "Senha redefinida. Entre com a senha nova."
end

post "/api/email/verificar" do
  barrar_se_muitas_tentativas!
  begin
    u = Usuarios.consumir_token!("verificar_email", body_json["token"])
  rescue Usuarios::Erro
    registrar_falha(request.ip)
    raise
  end
  Usuarios.marcar_email_verificado!(u["id"], true)
  json ok: true, mensagem: "E-mail confirmado."
end

# ----------------------------------------------------------- minha conta ---
get "/api/eu" do
  json Usuarios.publico(usuario_atual)
end

# Nome, e-mail e documento. Login, cargo e perfil só o administrador muda.
put "/api/eu" do
  u = Usuarios.atualizar!(usuario_atual["id"], body_json.slice("nome", "email", "documento"), por_admin: false)
  json Usuarios.publico(u)
end

put "/api/eu/senha" do
  # Mesmo limite do login: com uma sessão roubada, a senha atual não pode ser
  # descoberta por tentativa e erro.
  barrar_se_muitas_tentativas!
  d = body_json
  u = usuario_atual
  unless Usuarios.senha_confere?(u, d["senha_atual"].to_s)
    registrar_falha(request.ip)
    halt json({ error: "Senha atual incorreta" }, 422)
  end
  halt json({ error: "A senha nova precisa ser diferente da atual" }, 422) if d["senha_atual"].to_s == d["senha_nova"].to_s

  novo = Usuarios.definir_senha!(u["id"], d["senha_nova"].to_s)
  session[:sv] = novo["sessao_versao"].to_i # continua logado nesta sessão; as outras caem
  json ok: true
end

put "/api/eu/preferencias" do
  json Usuarios.publico(Usuarios.salvar_preferencias!(usuario_atual["id"], body_json))
end

# Derruba as sessões abertas em outros navegadores; esta continua.
post "/api/eu/sair-outros" do
  u = Usuarios.encerrar_outras_sessoes!(usuario_atual["id"])
  session[:sv] = u["sessao_versao"].to_i
  json ok: true, mensagem: "Pronto: os outros dispositivos foram desconectados."
end

post "/api/eu/verificar-email" do
  u = usuario_atual
  halt json({ error: "O envio de e-mail não está configurado. Peça ao administrador para confirmar seu e-mail." }, 422) unless Correio.configurado?

  enviar_verificacao(u)
  json ok: true, mensagem: "Enviamos um link para #{u['email']}."
end

# ------------------------------------------------------- painel do adm ---
# O filtro em app.rb já barra quem não é administrador em /api/admin/*.
get "/api/admin/ajustes" do
  cfg = Database.config
  json Usuarios.ajustes.merge("email_configurado" => Correio.configurado?, "org_name" => cfg["org_name"], "moeda" => cfg["moeda"],
                              "cargos_sugeridos" => Usuarios::CARGOS_SUGERIDOS)
end

put "/api/admin/ajustes" do
  json Usuarios.salvar_ajustes!(body_json)
end

# Nome da organização (opcional) e moeda.
put "/api/admin/config" do
  d = body_json
  moeda = d["moeda"].to_s
  halt json({ error: "Moeda inválida" }, 422) unless MOEDAS.include?(moeda)

  Database.atualizar_config!(org_name: d["org_name"].to_s.strip[0, 80], moeda: moeda)
  json ok: true
end

get "/api/admin/usuarios" do
  json Usuarios.todos
end

# Cria o usuário. Sem senha informada, gera uma temporária (devolvida uma única
# vez) e obriga a troca no primeiro acesso.
post "/api/admin/usuarios" do
  d = body_json
  informada = d["senha"].to_s
  senha = informada.empty? ? Usuarios.senha_temporaria : informada
  id = Usuarios.criar!(d, senha: senha, deve_trocar: informada.empty? || d["deve_trocar_senha"] != false)
  u = Usuarios.por_id(id)
  json({ usuario: Usuarios.publico(u), senha_temporaria: informada.empty? ? senha : nil }, 201)
end

put "/api/admin/usuarios/:id" do
  alvo = usuario_alvo!
  d = body_json
  rebaixando = d.key?("perfil") && d["perfil"] != "admin" && alvo["perfil"] == "admin"
  nao_em_si_mesmo!(alvo, "tirar o perfil de administrador de") if rebaixando
  json Usuarios.publico(Usuarios.atualizar!(alvo["id"], d, por_admin: true))
end

post "/api/admin/usuarios/:id/ativo" do
  alvo = usuario_alvo!
  ativo = body_json["ativo"] == true
  nao_em_si_mesmo!(alvo, "desativar") unless ativo
  json Usuarios.publico(Usuarios.definir_ativo!(alvo["id"], ativo))
end

delete "/api/admin/usuarios/:id" do
  alvo = usuario_alvo!
  nao_em_si_mesmo!(alvo, "excluir")
  Usuarios.excluir!(alvo["id"])
  json ok: true
end

# Senha temporária: mostrada uma única vez ao administrador; a pessoa troca no
# próximo acesso. Derruba as sessões abertas dela.
post "/api/admin/usuarios/:id/senha-temporaria" do
  alvo = usuario_alvo!
  senha = Usuarios.senha_temporaria
  Usuarios.definir_senha!(alvo["id"], senha, deve_trocar: true)
  json ok: true, senha_temporaria: senha
end

# Link de redefinição (24 h, uso único). Vai por e-mail se houver SMTP; de
# qualquer forma volta para o administrador copiar e mandar por outro canal.
post "/api/admin/usuarios/:id/link-redefinicao" do
  alvo = usuario_alvo!
  link = link_redefinicao(alvo)
  enviado = false
  if Correio.configurado? && !alvo["email"].to_s.empty?
    begin
      Correio.enviar(alvo["email"], "DashZon: redefinir senha", "Para criar uma senha nova no DashZon, abra (vale por 24 horas):\n#{link}\n")
      enviado = true
    rescue Correio::Falha
      enviado = false
    end
  end
  json ok: true, link: link, enviado: enviado
end

post "/api/admin/usuarios/:id/email-verificado" do
  alvo = usuario_alvo!
  json Usuarios.publico(Usuarios.marcar_email_verificado!(alvo["id"], body_json["verificado"] == true))
end

post "/api/admin/usuarios/:id/enviar-verificacao" do
  alvo = usuario_alvo!
  halt json({ error: "O envio de e-mail não está configurado (veja DASHZON_SMTP_* no README)" }, 422) unless Correio.configurado?

  enviar_verificacao(alvo)
  json ok: true, mensagem: "Link de confirmação enviado para #{alvo['email']}."
end
