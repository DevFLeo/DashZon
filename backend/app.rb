require "sinatra"
require "json"
require "securerandom"
require "ipaddr"
require_relative "lib/database"
require_relative "lib/module_schema"
require_relative "lib/template_registry"
require_relative "lib/engine_client"
require_relative "lib/dados_ficticios"
require_relative "lib/segredo"
require_relative "lib/correio"
require_relative "lib/usuarios"
require_relative "lib/equipes"
require_relative "lib/acesso"
require_relative "lib/solicitacoes"
require_relative "lib/desempenho"
require_relative "lib/seguranca"

# Um banco de versão anterior é migrado já na partida (lib/migracao.rb), antes de
# o servidor aceitar requisições: o primeiro acesso não paga a espera e um banco
# grande não estoura o healthcheck. Não cria nada: sem arquivo, isto só responde
# false. Se a migração falhar, o servidor sobe mesmo assim (nada foi alterado) e
# toda requisição responde o erro, em vez de derrubar o processo (e entrar em
# loop de reinício); o log diz onde está a cópia de segurança.
begin
  Database.configured?
rescue Migracao::Falha => e
  warn "[DashZon] #{e.message}"
end

set :public_folder, File.expand_path("../frontend", __dir__)
set :bind, Ambiente["DASHZON_HOST", "127.0.0.1"]
set :port, Ambiente["PORT", "4567"].to_i
set :server, %w[puma webrick]
set :show_exceptions, false
set :raise_errors, false

# Velocidade (lib/desempenho.rb): gzip nas respostas (os ~375 KB de JS/CSS/JSON
# caem para ~1/4, o que pesa muito pela internet) e cache de arquivos estáticos.
# Segurança (lib/seguranca.rb): cabeçalhos (CSP, nosniff, frame-ancestors...),
# escrita só do próprio site (Origin) e limite de requisições por IP. Fica por
# fora de tudo, para valer também nas respostas de erro e nos arquivos.
use Seguranca::Protecao
use Rack::Deflater
use CacheEstaticos

# Teto para o corpo das requisições: sem ele, um JSON gigante (template
# importado, que também fica guardado em `jsons`) ocuparia memória e banco.
# 64 MB cobrem com folga um backup com dados (50 mil registros ~ 10 MB).
class LimiteCorpo
  MAXIMO = 64 * 1024 * 1024

  def initialize(app)
    @app = app
  end

  def call(env)
    tamanho = env["CONTENT_LENGTH"].to_i
    if tamanho > MAXIMO
      corpo = JSON.generate(error: "Envio grande demais (máximo #{MAXIMO / 1024 / 1024} MB)")
      return [413, { "content-type" => "application/json;charset=utf-8" }, [corpo]]
    end
    @app.call(env)
  end
end
use LimiteCorpo

# Sessão por cookie assinado. A chave vem de DASHZON_SESSION_SECRET ou do
# arquivo segredo.key ao lado do banco (ver lib/segredo.rb), então reiniciar o
# servidor não derruba ninguém.
set :session_secret, Segredo.chave
set :sessions, same_site: :strict, httponly: true

# A checagem de origem das escritas é do Seguranca::Protecao (403 em JSON e
# registro no diário). As duas do Rack::Protection que fazem o mesmo papel
# reagem derrubando a sessão (o padrão do Sinatra) e rodam antes dela: uma
# tentativa de outro site deslogava a vítima. As demais proteções seguem ligadas.
set :protection, except: %i[http_origin remote_token]

# JSON com charset explícito: o navegador já lê como UTF-8, mas clientes como o
# Invoke-WebRequest do PowerShell 5.1 caem em Latin-1 sem ele e estragam os acentos.
set :add_charset, settings.add_charset + %w[application/json]

# DASHZON_COOKIE_SEGURO=1 (uso público, atrás do Caddy): o cookie de sessão sai
# marcado como Secure em toda requisição que chega por HTTPS, então pela
# internet ele só trafega criptografado. Não dá para ligar Secure em tudo: o
# Rack não grava cookie Secure numa requisição HTTP simples, e o acesso local
# (http://127.0.0.1:4567, que não sai da máquina) pararia de funcionar.
# O DashZon escuta só em 127.0.0.1, então quem chega por HTTP é a própria máquina.
COOKIE_SEGURO = Ambiente["DASHZON_COOKIE_SEGURO"] == "1"

before do
  request.session_options[:secure] = request.ssl? if COOKIE_SEGURO
end

# O Sinatra, em modo desenvolvimento, só aceita o Host localhost ou um IP. Para
# acessar por um domínio (ex.: meupainel.duckdns.org via Caddy), liste-o em
# DASHZON_HOSTS, separado por vírgula.
set :host_authorization, {
  permitted_hosts: ["localhost", ".localhost", IPAddr.new("0.0.0.0/0"), IPAddr.new("::/0")] +
                   Ambiente["DASHZON_HOSTS", ""].split(",").map(&:strip).reject(&:empty?)
}

helpers do
  def json(obj, status_code = nil)
    status status_code if status_code
    content_type :json
    JSON.generate(obj)
  end

  # Toda rota espera um objeto: um array ou valor solto viraria TypeError (500)
  # no primeiro body_json["campo"].
  def body_json
    raw = request.body.read
    d = raw.empty? ? {} : JSON.parse(raw)
    halt json({ error: "O corpo deve ser um objeto JSON" }, 400) unless d.is_a?(Hash)

    @corpo_auditoria = d # o diário de alterações descreve o que foi pedido (ver AUDITORIA)
    d
  rescue JSON::ParserError
    halt json({ error: "JSON inválido" }, 400)
  end

  # Nome de dashboard: obrigatório e com limite (entrada do usuário).
  def nome_dashboard!(d)
    nome = d["nome"].to_s.strip
    halt json({ error: "Informe o nome do dashboard" }, 422) if nome.empty?
    halt json({ error: "Nome do dashboard muito longo (máximo #{NOME_DASHBOARD_MAX})" }, 422) if nome.length > NOME_DASHBOARD_MAX

    nome
  end

  # Dashboard que a pessoa logada pode VER (o dela ou um da equipe). Os
  # privados dos outros respondem 404, como se não existissem.
  def dashboard!(id)
    d = Database.row("SELECT * FROM dashboards WHERE id = ?", [id.to_i])
    halt json({ error: "Dashboard não encontrado" }, 404) unless d && dashboard_visivel?(d)

    d
  end

  # Dashboard que a pessoa pode MUDAR (nome, cards, layout, compartilhamento):
  # o dono, ou um administrador quando o dashboard é da equipe.
  def dashboard_editavel!(id)
    d = dashboard!(id)
    halt json({ error: "Só quem criou este dashboard (ou um administrador) pode alterá-lo" }, 403) unless dashboard_editavel?(d)

    d
  end

  # Regras de quem vê e quem altera: lib/acesso.rb (uma instância por requisição).
  def acesso
    @acesso ||= Acesso.new(usuario_atual)
  end

  def dashboard_visivel?(d) = acesso.dashboard_visivel?(d)
  def dashboard_editavel?(d) = acesso.dashboard_editavel?(d)

  # Perfil "visualizador": só vê (não cria dashboards, módulos nem instala templates).
  def nao_visualizador!
    halt json({ error: "Seu perfil é de visualização: você vê os dashboards, mas não cria nem altera" }, 403) if acesso.visualizador?
  end

  # Visualizador: criar, alterar ou excluir registro vira um pedido para o dono
  # do módulo aprovar (lib/solicitacoes.rb). Responde 202 e não grava nada.
  def pedir_aprovacao!(m, acao, registro_id: nil, dados: nil)
    return unless acesso.visualizador?

    s = Solicitacoes.criar!(usuario_atual, m, acao, registro_id: registro_id, dados: dados)
    halt json({ pendente: true, solicitacao: s["id"], mensagem: "Enviado para aprovação de #{s['aprovador']}" }, 202)
  end

  # Compartilhar com equipes escolhidas: lista válida, não vazia, e só equipes
  # que a pessoa pode usar (o admin, qualquer uma; os demais, as suas).
  def equipes_para_compartilhar!(lista)
    halt json({ error: "Escolha ao menos uma equipe" }, 422) unless lista.is_a?(Array) && !lista.empty?

    ids = lista.map(&:to_i).uniq
    existentes = Database.rows("SELECT id FROM equipes").map { |r| r["id"] }
    halt json({ error: "Equipe inexistente na lista" }, 422) unless (ids - existentes).empty?
    halt json({ error: "Você só pode compartilhar com equipes de que faz parte" }, 403) unless ids.all? { |e| acesso.pode_compartilhar_com?(e) }

    ids
  end

  def gravar_equipes_do_dashboard!(dashboard_id, ids)
    Database.execute("DELETE FROM dashboard_equipes WHERE dashboard_id = ?", [dashboard_id])
    ids.each { |e| Database.execute("INSERT INTO dashboard_equipes (dashboard_id, equipe_id) VALUES (?, ?)", [dashboard_id, e]) }
  end

  def gravar_equipes_do_modulo!(modulo_id, ids)
    Database.execute("DELETE FROM modulo_equipes WHERE modulo_id = ?", [modulo_id])
    ids.each { |e| Database.execute("INSERT INTO modulo_equipes (modulo_id, equipe_id) VALUES (?, ?)", [modulo_id, e]) }
  end

  def nomes_das_equipes(ids)
    return [] if ids.nil? || ids.empty?

    todas = Database.rows("SELECT id, nome FROM equipes").to_h { |e| [e["id"], e["nome"]] }
    ids.filter_map { |i| todas[i] && { "id" => i, "nome" => todas[i] } }
  end

  # Widget + dashboard dele, conferindo o acesso pelo dashboard.
  def widget!(id, editar: false)
    w = Database.row("SELECT * FROM widgets WHERE id = ?", [id.to_i])
    halt json({ error: "Widget não encontrado" }, 404) unless w
    d = Database.row("SELECT * FROM dashboards WHERE id = ?", [w["dashboard_id"]])
    halt json({ error: "Widget não encontrado" }, 404) unless d && dashboard_visivel?(d)
    if editar && !dashboard_editavel?(d)
      halt json({ error: "Só quem criou este dashboard (ou um administrador) pode alterá-lo" }, 403)
    end
    [w, d]
  end

  def visibilidade_pedida(d)
    d["visibilidade"] == "equipe" || d["compartilhar"] == true ? "equipe" : "privado"
  end

  # Módulo que a pessoa pode VER (os de outros, sem acesso, respondem 404).
  def modulo!(slug)
    m = Database.modulo(slug)
    halt json({ error: "Módulo '#{slug}' não encontrado" }, 404) unless m && acesso.modulo_visivel?(m)

    m
  end

  # Módulo que a pessoa pode MUDAR (estrutura, compartilhamento, excluir).
  def modulo_editavel!(slug)
    m = modulo!(slug)
    halt json({ error: "Só quem criou este módulo (ou um administrador) pode alterá-lo" }, 403) unless acesso.modulo_editavel?(m)

    m
  end

  def modulo_json(m, totais = nil, exemplos = nil)
    dono = m["dono_id"] && Usuarios.por_id(m["dono_id"])
    m.merge(
      "visibilidade" => m["visibilidade"] || "todos",
      "equipes" => nomes_das_equipes(acesso.equipes_dos_modulos[m["id"]]),
      "dono_nome" => dono && (dono["nome"].to_s.empty? ? dono["login"] : dono["nome"]),
      "editavel" => acesso.modulo_editavel?(m)
    ).merge(totais ? { "total" => totais[m["id"]] || 0 } : {}).merge(exemplos ? { "exemplos" => exemplos[m["id"]] || 0 } : {})
  end

  def texto_campos(schema)
    schema["campos"].select { |c| ModuleSchema::TEXTUAIS.include?(c["tipo"]) }.map { |c| c["id"] }
  end
end

error ModuleSchema::Error do
  json({ error: env["sinatra.error"].message }, 422)
end

error EngineClient::EngineError do
  json({ error: env["sinatra.error"].message }, 500)
end

error Usuarios::Erro do
  json({ error: env["sinatra.error"].message }, env["sinatra.error"].status)
end

error Correio::Falha do
  json({ error: env["sinatra.error"].message }, 502)
end

# Migração que falhou: a mensagem é para o usuário (causa e caminho da cópia de
# segurança; ver lib/migracao.rb), então vai inteira na resposta.
error Migracao::Falha do
  json({ error: env["sinatra.error"].message }, 500)
end

# Erro inesperado: o detalhe vai para o log, nunca para o navegador (pode
# conter SQL, caminhos ou mensagens do SQLite).
error do
  e = env["sinatra.error"]
  warn "[DashZon] #{request.request_method} #{request.path_info}: #{e.class}: #{e.message}\n  #{Array(e.backtrace).first(5).join("\n  ")}"
  json({ error: "Erro interno. Veja o log do servidor." }, 500)
end

# Rotas abertas (sem login): status, login/logout e os links de e-mail. Setup e
# galeria só ficam abertos antes do setup. /api/usuarios/primeiro só age
# quando o banco não tem nenhum usuário.
ROTAS_ABERTAS = %w[/api/status /api/login /api/logout /api/usuarios/primeiro
                   /api/senha/esqueci /api/senha/redefinir /api/email/verificar].freeze

# Quem está com senha temporária só pode trocar a senha (e sair).
ROTAS_COM_SENHA_TEMPORARIA = %w[/api/status /api/logout /api/eu /api/eu/senha].freeze

# Validade da sessão (ver usuario_atual): parada (horas) e total (dias).
SESSAO_OCIOSA = Ambiente["DASHZON_SESSAO_HORAS", "12"].to_f * 3600
SESSAO_MAXIMA = Ambiente["DASHZON_SESSAO_DIAS", "30"].to_f * 86_400

# Moedas aceitas no setup e no painel do adm (o frontend tem o símbolo de cada uma).
MOEDAS = %w[BRL USD EUR].freeze
NOME_DASHBOARD_MAX = 80

helpers do
  # Usuário da sessão, conferido a cada requisição: se foi desativado, excluído
  # ou teve a senha redefinida (sessao_versao mudou), a sessão cai na hora.
  def usuario_atual
    return @usuario_atual if defined?(@usuario_atual)

    u = session[:uid] && Usuarios.por_id(session[:uid])
    valido = u && u["ativo"].to_i == 1 && u["sessao_versao"].to_i == session[:sv].to_i && !sessao_vencida?
    session.clear if session[:uid] && !valido
    marcar_atividade if valido
    @usuario_atual = valido ? u : nil
  end

  # Sessão parada há mais de SESSAO_OCIOSA (padrão 12 h) ou aberta há mais de
  # SESSAO_MAXIMA (padrão 30 dias) cai: num computador esquecido aberto, a
  # conta não fica acessível para sempre. Sessões antigas (sem as marcas)
  # ganham as marcas agora, em vez de cair.
  def sessao_vencida?
    agora = Time.now.to_i
    (session[:visto] && agora - session[:visto].to_i > SESSAO_OCIOSA) ||
      (session[:inicio] && agora - session[:inicio].to_i > SESSAO_MAXIMA)
  end

  # Regrava a marca no máximo uma vez por minuto (cada mudança reenvia o cookie).
  def marcar_atividade
    agora = Time.now.to_i
    session[:inicio] ||= agora
    session[:visto] = agora if agora - session[:visto].to_i > 60
  end
end

def rota_do_setup?(req)
  path = req.path_info
  return true if %w[/api/setup /api/templates/validar].include?(path)

  req.get? && path.start_with?("/api/templates")
end

before "/api/*" do
  next if ROTAS_ABERTAS.include?(request.path_info)

  unless Database.configured?
    halt json({ error: "O sistema ainda não foi configurado" }, 409) unless rota_do_setup?(request)
    next
  end

  u = usuario_atual
  halt json({ error: "Faça login para continuar" }, 401) unless u
  if u["deve_trocar_senha"].to_i == 1 && !ROTAS_COM_SENHA_TEMPORARIA.include?(request.path_info)
    halt json({ error: "Defina uma senha nova para continuar", trocar_senha: true }, 403)
  end
  if request.path_info.start_with?("/api/admin/") && u["perfil"] != "admin"
    halt json({ error: "Só administradores podem fazer isso" }, 403)
  end
end

get "/" do
  send_file File.join(settings.public_folder, "index.html")
end

# ----------------------------------------------------------------- setup ---
get "/api/status" do
  halt json(configured: false) unless Database.configured?

  cfg = Database.config
  u = usuario_atual
  # regras_senha: as telas mostram o mínimo e o que é exigido (nada secreto).
  base = { configured: true, org_name: cfg["org_name"], email_configurado: Correio.configurado?, regras_senha: Usuarios.regras_senha }
  if u
    json base.merge(usuario: Usuarios.publico(u), moeda: cfg["moeda"])
  else
    # Antes do login: só o necessário para a tela de entrada.
    json base.merge(usuario: nil, sem_usuario: !Usuarios.existe_algum?)
  end
end

# Cria o banco a partir dos parâmetros do usuário + templates escolhidos
# (da galeria e/ou importados em JSON).
post "/api/setup" do
  halt json({ error: "O sistema já está configurado" }, 409) if Database.configured?

  d = body_json
  # O nome da organização é opcional (sem ele, a tela mostra só "DashZon").
  org = d["org_name"].to_s.strip[0, 80]

  # Confere login e senha ANTES de criar o banco: um erro aqui não pode deixar
  # um banco pela metade. (O resto do cadastro é validado por Usuarios.criar!.)
  login = Usuarios.normalizar_login(d["usuario"])
  senha = d["senha"].to_s
  halt json({ error: Usuarios::LOGIN_ERRO }, 422) unless login.match?(Usuarios::LOGIN_RE)
  Usuarios.validar_senha!(senha, login: login)
  moeda = (d["moeda"] || "BRL").to_s
  halt json({ error: "Moeda inválida" }, 422) unless MOEDAS.include?(moeda)

  escolhidos = Array(d["templates"]).map do |id|
    TemplateRegistry.find(id) || halt(json({ error: "Template '#{id}' não existe" }, 422))
  end
  pacotes = (escolhidos + Array(d["importados"])).map { |t| TemplateRegistry.normalize!(t) }

  Database.arquivar_versao_antiga!
  Database.create_schema!(org_name: org, moeda: moeda)
  # Quem faz o setup é o primeiro administrador.
  uid = Usuarios.criar!({ "login" => login, "nome" => d["nome"].to_s.strip.empty? ? login : d["nome"], "perfil" => "admin" },
                        senha: senha)
  # Os dashboards do setup são da organização: visíveis para a equipe toda.
  pacotes.each { |t| TemplateRegistry.install!(t, com_exemplos: d["com_exemplos"] != false, dono_id: uid, visibilidade: "equipe") }
  Array(d["importados"]).each { |t| TemplateRegistry.salvar_importado!(t) }

  if Database.rows("SELECT id FROM dashboards").empty?
    Database.execute("INSERT INTO dashboards (nome, criado_em, atualizado_em, dono_id, visibilidade) VALUES (?, ?, ?, ?, 'equipe')",
                     ["Visão geral", Database.now, Database.now, uid])
  end
  u = Usuarios.por_id(uid)
  session.clear
  session[:uid] = u["id"]
  session[:sv] = u["sessao_versao"].to_i
  json ok: true
end

# ------------------------------------------------- diário de alterações ---
# Relatório de testes, problema 6: o diário do Painel do adm só tinha acessos.
# Toda escrita que deu certo em usuários, equipes, dashboards, módulos,
# templates, regras e pedidos de aprovação fica registrada com quem fez, o
# alvo e um resumo do pedido (nunca senha, documento ou dados de registros).
# O `before` guarda o nome do alvo enquanto ele existe (para exclusões).
AUDITORIA = [
  ["POST", %r{\A/api/admin/usuarios\z}, "usuario_criado", nil],
  ["PUT", %r{\A/api/admin/usuarios/(\d+)\z}, "usuario_alterado", :usuario],
  ["DELETE", %r{\A/api/admin/usuarios/(\d+)\z}, "usuario_excluido", :usuario],
  ["POST", %r{\A/api/admin/usuarios/(\d+)/ativo\z}, "usuario_ativo", :usuario],
  ["POST", %r{\A/api/admin/usuarios/(\d+)/senha-temporaria\z}, "senha_temporaria", :usuario],
  ["POST", %r{\A/api/admin/usuarios/(\d+)/link-redefinicao\z}, "link_redefinicao", :usuario],
  ["POST", %r{\A/api/admin/usuarios/(\d+)/email-verificado\z}, "email_confirmado", :usuario],
  ["POST", %r{\A/api/admin/equipes\z}, "equipe_criada", nil],
  ["POST", %r{\A/api/admin/equipes/teste\z}, "empresa_teste_criada", nil],
  ["PUT", %r{\A/api/admin/equipes/(\d+)\z}, "equipe_alterada", :equipe],
  ["DELETE", %r{\A/api/admin/equipes/(\d+)\z}, "equipe_excluida", :equipe],
  ["PUT", %r{\A/api/admin/equipes/(\d+)/membros\z}, "equipe_membros", :equipe],
  ["PUT", %r{\A/api/admin/ajustes\z}, "regras_alteradas", nil],
  ["PUT", %r{\A/api/admin/config\z}, "organizacao_alterada", nil],
  ["POST", %r{\A/api/dashboards\z}, "dashboard_criado", nil],
  ["PUT", %r{\A/api/dashboards/(\d+)\z}, "dashboard_alterado", :dashboard],
  ["DELETE", %r{\A/api/dashboards/(\d+)\z}, "dashboard_excluido", :dashboard],
  ["POST", %r{\A/api/modulos\z}, "modulo_criado", nil],
  ["PUT", %r{\A/api/modulos/([^/]+)\z}, "modulo_alterado", :modulo],
  ["PUT", %r{\A/api/modulos/([^/]+)/compartilhar\z}, "modulo_compartilhado", :modulo],
  ["DELETE", %r{\A/api/modulos/([^/]+)\z}, "modulo_excluido", :modulo],
  ["DELETE", %r{\A/api/modulos/([^/]+)/exemplos\z}, "exemplos_apagados", :modulo],
  ["POST", %r{\A/api/templates/instalar\z}, "template_instalado", nil],
  ["POST", %r{\A/api/solicitacoes/(\d+)/aprovar\z}, "pedido_aprovado", :pedido],
  ["POST", %r{\A/api/solicitacoes/(\d+)/negar\z}, "pedido_negado", :pedido],
  # Visualizador: o registro não muda; vira pedido (resposta 202).
  [%w[POST PUT PATCH DELETE], %r{\A/api/modulos/([^/]+)/registros(?:/\d+)?\z}, "pedido_criado", :modulo]
].freeze

helpers do
  def regra_de_auditoria
    AUDITORIA.each do |metodo, caminho, tipo, alvo|
      next unless Array(metodo).include?(request.request_method)

      m = caminho.match(request.path_info)
      return [tipo, alvo, m[1]] if m
    end
    nil
  end

  def nome_do_alvo(alvo, chave)
    case alvo
    when :usuario then (u = Usuarios.por_id(chave)) && "usuário #{u['login']}"
    when :equipe
      e = Database.row("SELECT nome FROM equipes WHERE id = ?", [chave.to_i])
      e && "equipe #{e['nome']}"
    when :dashboard
      d = Database.row("SELECT nome FROM dashboards WHERE id = ?", [chave.to_i])
      d && "dashboard #{d['nome']}"
    when :modulo then (m = Database.modulo(chave)) && "módulo #{m['nome']}"
    when :pedido
      s = Database.row("SELECT s.acao, m.nome FROM solicitacoes s LEFT JOIN modulos m ON m.id = s.modulo_id WHERE s.id = ?", [chave.to_i])
      s && "pedido ##{chave} (#{s['acao']} em #{s['nome']})"
    end
  end

  # Resumo do pedido: nomes e escolhas; senha e documento nunca entram.
  def resumo_da_auditoria(d)
    return "" unless d.is_a?(Hash)

    partes = %w[nome login perfil visibilidade template_id].filter_map { |k| "#{k}: #{d[k]}" unless d[k].to_s.empty? }
    partes << "ativo: #{d['ativo']}" if d.key?("ativo")
    if d["equipes"].is_a?(Array)
      nomes = Database.rows("SELECT id, nome FROM equipes").to_h { |e| [e["id"], e["nome"]] }
      partes << "equipes: #{d['equipes'].map { |i| nomes[i.to_i] || i }.join(', ').then { |s| s.empty? ? 'nenhuma' : s }}"
    end
    partes << "membros: #{d['usuario_ids'].size}" if d["usuario_ids"].is_a?(Array)
    partes << "dono: #{Usuarios.por_id(d['dono_id'])&.dig('login')}" if d["dono_id"]
    partes << "fixo: #{d['fixo']}" if d.key?("fixo")
    outros = d.keys - %w[nome login perfil visibilidade template_id ativo equipes usuario_ids dono_id fixo senha documento motivo]
    partes << "campos: #{outros.first(8).join(', ')}" unless outros.empty?
    partes << "motivo: #{d['motivo']}" unless d["motivo"].to_s.strip.empty?
    partes.join(" · ")
  end
end

before "/api/*" do
  @auditoria = regra_de_auditoria
  @auditoria_alvo = @auditoria && @auditoria[1] ? nome_do_alvo(@auditoria[1], @auditoria[2]) : nil
end

after "/api/*" do
  tipo, = @auditoria
  next unless tipo && usuario_atual
  next if tipo == "pedido_criado" && response.status != 202
  next unless response.status.between?(200, 299)

  detalhe = [@auditoria_alvo, resumo_da_auditoria(@corpo_auditoria)].reject { |s| s.to_s.empty? }.join(" · ")
  Seguranca.registrar!(tipo, ip: request.ip, usuario_id: usuario_atual["id"], detalhe: detalhe)
rescue StandardError => e
  warn "[DashZon] diário de alterações: #{e.class}: #{e.message}" # o diário nunca derruba a resposta
end

# Login, minha conta e painel do administrador.
require_relative "rotas/usuarios"
require_relative "rotas/equipes"

# Equipes que a pessoa pode escolher ao compartilhar (o admin vê todas).
get "/api/equipes" do
  todas = Database.rows("SELECT id, nome, empresa FROM equipes ORDER BY lower(nome)")
  json(todas.select { |e| acesso.pode_compartilhar_com?(e["id"]) }.map { |e| e.merge("empresa" => e["empresa"].to_i == 1) })
end

# Pedidos do perfil visualizador (lib/solicitacoes.rb): os que a pessoa
# decide e os que ela fez.
get "/api/solicitacoes" do
  json Solicitacoes.listar(usuario_atual)
end

get "/api/solicitacoes/contagem" do
  json Solicitacoes.contagem(usuario_atual)
end

post "/api/solicitacoes/:id/:decisao" do
  halt 404 unless %w[aprovar negar].include?(params[:decisao])
  Solicitacoes.decidir!(usuario_atual, params[:id], aprovar: params[:decisao] == "aprovar", motivo: body_json["motivo"])
  json ok: true
end



# ------------------------------------------------------------- templates ---
get "/api/templates" do
  json TemplateRegistry.all.map { |t| TemplateRegistry.summary(t) }
end

get "/api/templates/:id" do
  t = TemplateRegistry.find(params[:id]) || halt(json({ error: "Template não encontrado" }, 404))
  json t
end

# Valida um template JSON (galeria ou importado) e devolve um resumo dele,
# sem gravar nada — usado na pré-visualização da importação.
post "/api/templates/validar" do
  t = TemplateRegistry.normalize!(body_json["template"])
  json ok: true, nome: t["nome"], modulos: t["modulos"].map { |m| m["nome"] }, dashboards: t["dashboards"].map { |x| x["nome"] }
end

post "/api/templates/instalar" do
  nao_visualizador!
  d = body_json
  bruto = d["template_id"] ? TemplateRegistry.find(d["template_id"]) : d["template"]
  halt json({ error: "Template não encontrado" }, 404) unless bruto

  # Os dashboards que o template criar são de quem instalou: privados, a não
  # ser que a pessoa peça para compartilhar com a equipe.
  # Um módulo de mesmo nome só é reaproveitado se a pessoa o vê E se ele tem o
  # mesmo alcance do dashboard; senão nasce outro ("Nome (2)"), com os dados de
  # exemplo (relatório, problema 2):
  # - privado (um teste, por exemplo): só um módulo privado da própria pessoa,
  #   para não gravar nos dados de todos nem misturar o teste com eles;
  # - para todos: só um módulo de todos, para não expor o privado de ninguém.
  vis = visibilidade_pedida(d)
  uid = usuario_atual["id"]
  mesmo_alcance = lambda do |m|
    vis == "privado" ? m["visibilidade"] == "privado" && m["dono_id"] == uid : ["", "todos"].include?(m["visibilidade"].to_s)
  end
  res = TemplateRegistry.install!(TemplateRegistry.normalize!(bruto), com_exemplos: d["com_exemplos"] != false,
                                  dono_id: uid, visibilidade: vis,
                                  pode_usar: ->(m) { acesso.modulo_visivel?(m) && mesmo_alcance.call(m) })
  # Um JSON colado/importado fica guardado no banco e volta na galeria.
  TemplateRegistry.salvar_importado!(bruto) unless d["template_id"]
  json res.merge(ok: true)
end

# Só templates importados (salvos no banco) podem ser removidos da galeria.
delete "/api/templates/:id" do
  id = params[:id].to_s
  halt json({ error: "Templates padrão não podem ser removidos" }, 422) unless id.start_with?(TemplateRegistry::PREFIXO_SALVO)

  # Confere o tipo: o id é da tabela `jsons`, que também guarda as exportações.
  num = id.delete_prefix(TemplateRegistry::PREFIXO_SALVO)
  halt json({ error: "Template não encontrado" }, 404) unless Database.json_salvo(num, "template")

  Database.excluir_json!(num)
  json ok: true
end

# Cada exportação também fica guardada no banco (histórico de backups).
get "/api/export" do
  com_dados = params[:dados] == "1"
  dados = TemplateRegistry.export(com_dados: com_dados, acesso: acesso)
  nome = "dashzon-#{Time.now.strftime('%Y%m%d-%H%M')}#{com_dados ? '-dados' : ''}.json"
  Database.salvar_json!("exportacao", nome, dados)
  attachment nome
  json dados
end

get "/api/exportacoes" do
  json Database.jsons("exportacao")
end

get "/api/exportacoes/:id" do
  r = Database.json_salvo(params[:id], "exportacao") || halt(json({ error: "Exportação não encontrada" }, 404))
  attachment r["nome"]
  json r["conteudo"]
end

delete "/api/exportacoes/:id" do
  halt json({ error: "Exportação não encontrada" }, 404) unless Database.json_salvo(params[:id], "exportacao")

  Database.excluir_json!(params[:id])
  json ok: true
end

# --------------------------------------------------------------- módulos ---
get "/api/modulos" do
  totais = Database.rows("SELECT modulo_id, COUNT(*) AS n FROM registros GROUP BY modulo_id").to_h { |r| [r["modulo_id"], r["n"]] }
  exemplos = Database.exemplos_por_modulo
  json(acesso.modulos_visiveis.map { |m| modulo_json(m, totais, exemplos) })
end

get "/api/modulos/:slug" do
  m = modulo!(params[:slug])
  json modulo_json(m, nil, Database.exemplos_por_modulo)
end

# Quem vê o módulo: todos, só o dono ou equipes escolhidas; dono_id (só admin)
# transfere. Quem vê um dashboard que usa o módulo continua vendo os dados dele.
put "/api/modulos/:slug/compartilhar" do
  m = modulo_editavel!(params[:slug])
  d = body_json
  vis = d["visibilidade"].to_s
  halt json({ error: "Visibilidade inválida (use todos, privado ou equipes)" }, 422) unless Acesso::VIS_MODULO.include?(vis)

  ids = vis == "equipes" ? equipes_para_compartilhar!(d["equipes"]) : []
  dono = m["dono_id"]
  if d.key?("dono_id") && d["dono_id"].to_i != m["dono_id"]
    halt json({ error: "Só um administrador transfere módulos" }, 403) unless acesso.admin?
    alvo = Usuarios.por_id(d["dono_id"])
    halt json({ error: "Escolha uma conta ativa para ser o novo dono" }, 422) unless alvo && alvo["ativo"].to_i == 1
    dono = alvo["id"]
  end
  Database.transaction do
    Database.execute("UPDATE modulos SET visibilidade = ?, dono_id = ? WHERE id = ?", [vis, dono, m["id"]])
    gravar_equipes_do_modulo!(m["id"], ids)
  end
  json ok: true
end

# Apaga só os registros de exemplo do módulo (os que vieram com o template).
delete "/api/modulos/:slug/exemplos" do
  nao_visualizador!
  m = modulo!(params[:slug])
  json ok: true, apagados: Database.apagar_exemplos!(m["id"])
end

post "/api/modulos" do
  nao_visualizador!
  m = ModuleSchema.normalize_modulo!(body_json)
  halt json({ error: "Já existe um módulo com o identificador '#{m['slug']}'" }, 422) if Database.slug_taken?(m["slug"])
  halt json({ error: "Já existe um módulo chamado '#{m['nome']}'" }, 422) if Database.modulo_por_nome(m["nome"])

  # Módulo novo é de quem criou e nasce privado (relatório, problema 2).
  TemplateRegistry.install!({ "id" => "personalizado", "modulos" => [m.merge("seed" => [])], "dashboards" => [] },
                            dono_id: usuario_atual["id"], visibilidade: "privado")
  json modulo_json(Database.modulo(m["slug"])), 201
end

put "/api/modulos/:slug" do
  atual = modulo_editavel!(params[:slug])
  m = ModuleSchema.normalize_modulo!(body_json.merge("slug" => atual["slug"]), atual["schema"])
  if Database.modulo_por_nome(m["nome"], exceto_id: atual["id"])
    halt json({ error: "Já existe outro módulo chamado '#{m['nome']}'" }, 422)
  end
  # Se algum campo mudou de tipo, os registros já gravados são convertidos na
  # mesma transação (o formato em disco depende do tipo).
  Database.transaction do
    Database.reconverter_registros!(atual["id"], atual["schema"], ModuleSchema.schema_de(m))
    Database.execute(
      "UPDATE modulos SET nome = ?, descricao = ?, icone = ?, schema = ? WHERE id = ?",
      [m["nome"], m["descricao"], m["icone"], JSON.generate(ModuleSchema.schema_de(m)), atual["id"]]
    )
  end
  json Database.modulo(atual["slug"])
end

delete "/api/modulos/:slug" do
  m = modulo_editavel!(params[:slug])
  Database.transaction do
    Database.execute("DELETE FROM widgets WHERE modulo_slug = ?", [m["slug"]])
    Database.execute("DELETE FROM registros WHERE modulo_id = ?", [m["id"]])
    Database.execute("DELETE FROM modulos WHERE id = ?", [m["id"]])
  end
  Database.compactar! # devolve ao disco o espaço dos registros apagados
  json ok: true
end

get "/api/modulos/:slug/resumo" do
  m = modulo!(params[:slug])
  schema = m["schema"]
  itens = schema["resumo"]
  halt json([]) if itens.empty?

  queries = itens.map { |r| ModuleSchema.engine_query(schema, r) }
  out = CacheResultados.buscar("resumo", m["id"], schema) do
    # Só os campos que as consultas leem vão para o motor (mesmo resultado, menos dados).
    EngineClient.run(
      cmd: "multi",
      records: Database.registros(m, campos: ModuleSchema.campos_usados(queries), meta: false),
      queries: queries
    )
  end
  json(itens.zip(out["results"]).map do |r, res|
    valor = { "contagem" => res["total_count"], "media" => res["total_avg"] }.fetch(r["agregacao"], res["total_sum"])
    formato = schema["campos"].find { |c| c["id"] == r["campo"] }&.dig("tipo") || "numero"
    r.merge("valor" => valor, "formato" => formato)
  end)
end

# ------------------------------------------------------------- registros ---
# Paginado: `inicio` (padrão 0) e `limite` (padrão 200, máximo 1000). `count`
# continua sendo o total encontrado. O cache guarda só a página pedida: guardar
# a lista inteira de um módulo grande a cada busca digitada enchia a memória.
REGISTROS_POR_PAGINA = 200
REGISTROS_MAX_PAGINA = 1000

get "/api/modulos/:slug/registros" do
  m = modulo!(params[:slug])
  filtros = params["f"].is_a?(Hash) ? params["f"].reject { |_, v| v.to_s.empty? } : {}
  inicio = [params[:inicio].to_i, 0].max
  limite = (params[:limite] || REGISTROS_POR_PAGINA).to_i.clamp(1, REGISTROS_MAX_PAGINA)
  res = CacheResultados.buscar("busca", m["id"], m["schema"], params[:q].to_s, filtros, inicio, limite) do
    tudo = EngineClient.run(
      cmd: "search",
      records: Database.registros(m),
      q: params[:q].to_s,
      text_fields: texto_campos(m["schema"]),
      filters: filtros
    )
    # A busca do motor devolve do mais novo para o mais antigo; a ordenação do
    # módulo (ex.: cronograma por data e hora) vale antes de cortar a página.
    lista = ModuleSchema.ordenar_registros(m["schema"], tudo["result"])
    { "result" => lista[inicio, limite] || [], "count" => tudo["count"], "inicio" => inicio, "limite" => limite }
  end
  json res
end

# Um registro, lido direto do banco. O formulário de edição usa esta rota:
# a lista vem do motor e não deve servir de base para regravar valores.
get "/api/modulos/:slug/registros/:id" do
  m = modulo!(params[:slug])
  json(Database.registro(m, params[:id].to_i) || halt(json({ error: "Registro não encontrado" }, 404)))
end

# Alteração parcial: só os campos enviados mudam; o resto vem do banco. É o que
# o checklist usa para marcar um campo sim/não sem reenviar o registro inteiro.
patch "/api/modulos/:slug/registros/:id" do
  m = modulo!(params[:slug])
  id = params[:id].to_i
  atual = Database.registro(m, id) || halt(json({ error: "Registro não encontrado" }, 404))
  ids = m["schema"]["campos"].map { |c| c["id"] }
  mudancas = body_json.slice(*ids)
  halt json({ error: "Nenhum campo do módulo foi enviado" }, 422) if mudancas.empty?

  dados = ModuleSchema.coerce_registro!(m["schema"], atual.slice(*ids).merge(mudancas))
  pedir_aprovacao!(m, "alterar", registro_id: id, dados: dados)
  Database.atualizar_registro(m, id, dados)
  json Database.registro(m, id)
end

post "/api/modulos/:slug/registros" do
  m = modulo!(params[:slug])
  dados = ModuleSchema.coerce_registro!(m["schema"], body_json)
  pedir_aprovacao!(m, "criar", dados: dados)
  id = Database.inserir_registro(m, dados)
  json Database.registro(m, id), 201
end

put "/api/modulos/:slug/registros/:id" do
  m = modulo!(params[:slug])
  id = params[:id].to_i
  halt json({ error: "Registro não encontrado" }, 404) unless Database.registro(m, id)

  dados = ModuleSchema.coerce_registro!(m["schema"], body_json)
  pedir_aprovacao!(m, "alterar", registro_id: id, dados: dados)
  Database.atualizar_registro(m, id, dados)
  json Database.registro(m, id)
end

delete "/api/modulos/:slug/registros/:id" do
  m = modulo!(params[:slug])
  halt json({ error: "Registro não encontrado" }, 404) unless Database.registro(m, params[:id].to_i)
  pedir_aprovacao!(m, "excluir", registro_id: params[:id].to_i)
  Database.remover_registro(m, params[:id].to_i)
  json ok: true
end

# ------------------------------------------------------------ dashboards ---
def widget_json(w)
  w.merge("config" => JSON.parse(w["config"]))
end

# Cada dashboard tem dono (quem criou) e visibilidade: "privado" (só o dono
# vê) ou "equipe" (todos veem; só o dono ou um admin alteram). "fixo" trava o
# layout. Ver Database.migrar_dashboards! e os helpers dashboard!/editavel!.
def dashboard_json(d, editavel)
  d.slice("id", "nome", "criado_em", "atualizado_em", "dono_id", "visibilidade")
   .merge("dono_nome" => d["dono_nome"].to_s.empty? ? d["dono_login"] : d["dono_nome"],
          "fixo" => d["fixo"].to_i == 1, "editavel" => editavel)
end

# `modulos`: slugs que os cards de cada dashboard usam (o menu Criar > Lote
# abre o dashboard que já usa o módulo, em vez de criar outro).
get "/api/dashboards" do
  usados = Database.rows("SELECT DISTINCT dashboard_id, modulo_slug FROM widgets").group_by { |r| r["dashboard_id"] }
  json(acesso.dashboards_visiveis.map do |d|
    dashboard_json(d, dashboard_editavel?(d)).merge("modulos" => (usados[d["id"]] || []).map { |r| r["modulo_slug"] })
  end)
end

post "/api/dashboards" do
  nao_visualizador!
  d = body_json
  nome = nome_dashboard!(d)
  vis = d["visibilidade"] == "equipes" ? "equipes" : visibilidade_pedida(d)
  ids = vis == "equipes" ? equipes_para_compartilhar!(d["equipes"]) : []
  id = nil
  Database.transaction do
    id = Database.insert("INSERT INTO dashboards (nome, criado_em, atualizado_em, dono_id, visibilidade) VALUES (?, ?, ?, ?, ?)",
                         [nome, Database.now, Database.now, usuario_atual["id"], vis])
    gravar_equipes_do_dashboard!(id, ids)
  end
  json({ id: id }, 201)
end

get "/api/dashboards/:id" do
  dash = dashboard!(params[:id])
  dono = Usuarios.por_id(dash["dono_id"])
  out = dashboard_json(dash.merge("dono_nome" => dono&.dig("nome"), "dono_login" => dono&.dig("login")), dashboard_editavel?(dash))
  out["equipes"] = nomes_das_equipes(acesso.equipes_dos_dashboards[dash["id"]])
  out["widgets"] = Database.rows("SELECT * FROM widgets WHERE dashboard_id = ?", [dash["id"]]).map { |w| widget_json(w) }
  json out
end

# Alteração parcial: só o que vier no corpo muda (nome, fixo, visibilidade e,
# para administrador, dono_id: transferir o dashboard para outra pessoa).
put "/api/dashboards/:id" do
  dash = dashboard_editavel!(params[:id])
  d = body_json
  novo = {}
  novo["nome"] = nome_dashboard!(d) if d.key?("nome")
  novo["fixo"] = d["fixo"] == true ? 1 : 0 if d.key?("fixo")
  equipes = nil
  if d.key?("visibilidade")
    unless Acesso::VIS_DASHBOARD.include?(d["visibilidade"])
      halt json({ error: "Visibilidade inválida (use privado, equipe ou equipes)" }, 422)
    end
    novo["visibilidade"] = d["visibilidade"]
    equipes = d["visibilidade"] == "equipes" ? equipes_para_compartilhar!(d["equipes"]) : []
  end
  if d.key?("dono_id") && d["dono_id"].to_i != dash["dono_id"]
    halt json({ error: "Só um administrador transfere dashboards" }, 403) unless usuario_atual["perfil"] == "admin"
    alvo = Usuarios.por_id(d["dono_id"])
    halt json({ error: "Escolha uma conta ativa para ser o novo dono" }, 422) unless alvo && alvo["ativo"].to_i == 1
    novo["dono_id"] = alvo["id"]
  end
  # Um UPDATE fixo por campo (sem montar SQL com texto): ver seguranca_test.
  sql = {
    "nome" => "UPDATE dashboards SET nome = ? WHERE id = ?",
    "fixo" => "UPDATE dashboards SET fixo = ? WHERE id = ?",
    "visibilidade" => "UPDATE dashboards SET visibilidade = ? WHERE id = ?",
    "dono_id" => "UPDATE dashboards SET dono_id = ? WHERE id = ?"
  }
  unless novo.empty?
    Database.transaction do
      novo.each { |campo, valor| Database.execute(sql.fetch(campo), [valor, dash["id"]]) }
      gravar_equipes_do_dashboard!(dash["id"], equipes) if equipes
      Database.execute("UPDATE dashboards SET atualizado_em = ? WHERE id = ?", [Database.now, dash["id"]])
    end
  end
  json ok: true
end

# Módulos que os cards do dashboard usam e quantos registros de exemplo cada
# um ainda tem (para oferecer apagar junto com o dashboard).
def exemplos_do_dashboard(dash)
  slugs = Database.rows("SELECT DISTINCT modulo_slug FROM widgets WHERE dashboard_id = ?", [dash["id"]]).map { |r| r["modulo_slug"] }
  exemplos = Database.exemplos_por_modulo
  slugs.filter_map do |s|
    m = Database.modulo(s)
    n = m && exemplos[m["id"]].to_i
    next unless n&.positive?

    # Outros dashboards com cards neste módulo também perdem os exemplos
    # (relatório, problema 8): só os nomes que a pessoa vê; o resto é contado.
    outros = Database.rows("SELECT DISTINCT d.* FROM dashboards d JOIN widgets w ON w.dashboard_id = d.id
                            WHERE w.modulo_slug = ? AND d.id <> ?", [m["slug"], dash["id"]])
    visiveis = outros.select { |o| dashboard_visivel?(o) }.map { |o| o["nome"] }
    { "id" => m["id"], "slug" => m["slug"], "nome" => m["nome"], "exemplos" => n,
      "outros_dashboards" => visiveis, "outros_ocultos" => outros.size - visiveis.size }
  end
end

get "/api/dashboards/:id/exemplos" do
  dash = dashboard_editavel!(params[:id])
  mods = exemplos_do_dashboard(dash)
  json total: mods.sum { |m| m["exemplos"] }, modulos: mods.map { |m| m.except("id") }
end

# ?exemplos=1: apaga também os registros de exemplo dos módulos que o
# dashboard usa (os dados de verdade e os módulos ficam).
delete "/api/dashboards/:id" do
  dash = dashboard_editavel!(params[:id])
  apagados = 0
  Database.transaction do
    exemplos_do_dashboard(dash).each { |m| apagados += Database.apagar_exemplos!(m["id"]) } if params[:exemplos] == "1"
    Database.execute("DELETE FROM dashboards WHERE id = ?", [dash["id"]])
  end
  json ok: true, exemplos_apagados: apagados
end

# --------------------------------------------------------------- widgets ---
post "/api/dashboards/:id/widgets" do
  d = body_json
  dash = dashboard_editavel!(params[:id])
  m = modulo!(d["modulo"].to_s)
  w = ModuleSchema.normalize_widget!(d, m["schema"]).merge("modulo" => m["slug"])
  id = TemplateRegistry.insert_widget(dash["id"], w)
  json widget_json(Database.row("SELECT * FROM widgets WHERE id = ?", [id])), 201
end

put "/api/widgets/:id" do
  d = body_json
  widget!(params[:id], editar: true)
  m = modulo!(d["modulo"].to_s)
  w = ModuleSchema.normalize_widget!(d, m["schema"])
  Database.execute(
    "UPDATE widgets SET titulo = ?, tipo = ?, modulo_slug = ?, config = ? WHERE id = ?",
    [w["titulo"], w["tipo"], m["slug"], JSON.generate(w["config"]), params[:id].to_i]
  )
  json widget_json(Database.row("SELECT * FROM widgets WHERE id = ?", [params[:id].to_i]))
end

# Atualização leve de posição/tamanho (a cada drag/resize no canvas),
# separada do PUT completo para nunca sobrescrever a configuração.
put "/api/widgets/:id/layout" do
  _w, dash = widget!(params[:id], editar: true)
  halt json({ error: "O layout deste dashboard está fixado. Libere a movimentação para mudar." }, 409) if dash["fixo"].to_i == 1
  d = body_json
  Database.execute("UPDATE widgets SET x = ?, y = ?, w = ?, h = ? WHERE id = ?",
                   [d["x"].to_i, d["y"].to_i, [d["w"].to_i, 1].max, [d["h"].to_i, 1].max, params[:id].to_i])
  json ok: true
end

delete "/api/widgets/:id" do
  widget!(params[:id], editar: true)
  Database.execute("DELETE FROM widgets WHERE id = ?", [params[:id].to_i])
  json ok: true
end

get "/api/widgets/:id/data" do
  w, _dash = widget!(params[:id])

  m = modulo!(w["modulo_slug"])
  # Revalida contra o schema atual: o módulo pode ter sido editado depois.
  cfg = ModuleSchema.normalize_widget!(widget_json(w), m["schema"])["config"]
  consulta = ModuleSchema.engine_query(m["schema"], cfg)
  res = CacheResultados.buscar("card", m["id"], m["schema"], cfg) do
    # Só os campos que a consulta lê vão para o motor (mesmo resultado, menos dados).
    registros = Database.registros(m, campos: ModuleSchema.campos_usados([consulta]), meta: false)
    EngineClient.run({ cmd: "aggregate", records: registros }.merge(consulta))
  end
  json res.merge("config" => cfg)
end

# Pré-visualização do criador de card: mesma validação e mesma consulta de
# GET /api/widgets/:id/data, mas sobre registros fictícios (nada é gravado).
post "/api/widgets/preview" do
  d = body_json
  m = modulo!(d["modulo"].to_s)
  cfg = ModuleSchema.normalize_widget!(d.merge("titulo" => d["titulo"].to_s.strip.empty? ? "Prévia" : d["titulo"]), m["schema"])["config"]
  res = CacheResultados.buscar("previa", m["schema"], cfg) do
    EngineClient.run({ cmd: "aggregate", records: DadosFicticios.registros(m["schema"]) }.merge(ModuleSchema.engine_query(m["schema"], cfg)))
  end
  json res.merge("config" => cfg, "ficticio" => true)
end
