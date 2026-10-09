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
require_relative "lib/desempenho"

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
      return [413, { "content-type" => "application/json" }, [corpo]]
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

  def dashboard!(id)
    Database.row("SELECT * FROM dashboards WHERE id = ?", [id.to_i]) || halt(json({ error: "Dashboard não encontrado" }, 404))
  end

  def modulo!(slug)
    Database.modulo(slug) || halt(json({ error: "Módulo '#{slug}' não encontrado" }, 404))
  end

  def texto_campos(schema)
    schema["campos"].select { |c| %w[texto texto_longo].include?(c["tipo"]) }.map { |c| c["id"] }
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

# Moedas aceitas no setup e no painel do adm (o frontend tem o símbolo de cada uma).
MOEDAS = %w[BRL USD EUR].freeze
NOME_DASHBOARD_MAX = 80

helpers do
  # Usuário da sessão, conferido a cada requisição: se foi desativado, excluído
  # ou teve a senha redefinida (sessao_versao mudou), a sessão cai na hora.
  def usuario_atual
    return @usuario_atual if defined?(@usuario_atual)

    u = session[:uid] && Usuarios.por_id(session[:uid])
    valido = u && u["ativo"].to_i == 1 && u["sessao_versao"].to_i == session[:sv].to_i
    session.clear if session[:uid] && !valido
    @usuario_atual = valido ? u : nil
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
  base = { configured: true, org_name: cfg["org_name"], email_configurado: Correio.configurado? }
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
  login = d["usuario"].to_s.strip
  senha = d["senha"].to_s
  halt json({ error: "Login deve ter de 3 a 40 caracteres: letras, números, ponto, hífen ou _" }, 422) unless login.match?(Usuarios::LOGIN_RE)
  Usuarios.validar_senha!(senha)
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
  pacotes.each { |t| TemplateRegistry.install!(t, com_exemplos: d["com_exemplos"] != false) }
  Array(d["importados"]).each { |t| TemplateRegistry.salvar_importado!(t) }

  if Database.rows("SELECT id FROM dashboards").empty?
    Database.execute("INSERT INTO dashboards (nome, criado_em, atualizado_em) VALUES (?, ?, ?)",
                     ["Visão geral", Database.now, Database.now])
  end
  u = Usuarios.por_id(uid)
  session.clear
  session[:uid] = u["id"]
  session[:sv] = u["sessao_versao"].to_i
  json ok: true
end

# Login, minha conta e painel do administrador.
require_relative "rotas/usuarios"


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
  d = body_json
  bruto = d["template_id"] ? TemplateRegistry.find(d["template_id"]) : d["template"]
  halt json({ error: "Template não encontrado" }, 404) unless bruto

  res = TemplateRegistry.install!(TemplateRegistry.normalize!(bruto), com_exemplos: d["com_exemplos"] != false)
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
  dados = TemplateRegistry.export(com_dados: com_dados)
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
  json(Database.modulos.map { |m| m.merge("total" => totais[m["id"]] || 0) })
end

get "/api/modulos/:slug" do
  json modulo!(params[:slug])
end

post "/api/modulos" do
  m = ModuleSchema.normalize_modulo!(body_json)
  halt json({ error: "Já existe um módulo com o identificador '#{m['slug']}'" }, 422) if Database.slug_taken?(m["slug"])
  halt json({ error: "Já existe um módulo chamado '#{m['nome']}'" }, 422) if Database.modulo_por_nome(m["nome"])

  TemplateRegistry.install!({ "id" => "personalizado", "modulos" => [m.merge("seed" => [])], "dashboards" => [] })
  json Database.modulo(m["slug"]), 201
end

put "/api/modulos/:slug" do
  atual = modulo!(params[:slug])
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
  m = modulo!(params[:slug])
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
get "/api/modulos/:slug/registros" do
  m = modulo!(params[:slug])
  filtros = params["f"].is_a?(Hash) ? params["f"].reject { |_, v| v.to_s.empty? } : {}
  res = CacheResultados.buscar("busca", m["id"], m["schema"], params[:q].to_s, filtros) do
    EngineClient.run(
      cmd: "search",
      records: Database.registros(m),
      q: params[:q].to_s,
      text_fields: texto_campos(m["schema"]),
      filters: filtros
    )
  end
  json res
end

post "/api/modulos/:slug/registros" do
  m = modulo!(params[:slug])
  dados = ModuleSchema.coerce_registro!(m["schema"], body_json)
  id = Database.inserir_registro(m, dados)
  json Database.registro(m, id), 201
end

put "/api/modulos/:slug/registros/:id" do
  m = modulo!(params[:slug])
  id = params[:id].to_i
  halt json({ error: "Registro não encontrado" }, 404) unless Database.registro(m, id)

  Database.atualizar_registro(m, id, ModuleSchema.coerce_registro!(m["schema"], body_json))
  json Database.registro(m, id)
end

delete "/api/modulos/:slug/registros/:id" do
  m = modulo!(params[:slug])
  Database.remover_registro(m, params[:id].to_i)
  json ok: true
end

# ------------------------------------------------------------ dashboards ---
def widget_json(w)
  w.merge("config" => JSON.parse(w["config"]))
end

get "/api/dashboards" do
  json Database.rows("SELECT * FROM dashboards ORDER BY id")
end

post "/api/dashboards" do
  nome = nome_dashboard!(body_json)
  id = Database.insert("INSERT INTO dashboards (nome, criado_em, atualizado_em) VALUES (?, ?, ?)", [nome, Database.now, Database.now])
  json({ id: id }, 201)
end

get "/api/dashboards/:id" do
  dash = dashboard!(params[:id])
  dash["widgets"] = Database.rows("SELECT * FROM widgets WHERE dashboard_id = ?", [dash["id"]]).map { |w| widget_json(w) }
  json dash
end

put "/api/dashboards/:id" do
  nome = nome_dashboard!(body_json)
  dashboard!(params[:id])
  Database.execute("UPDATE dashboards SET nome = ?, atualizado_em = ? WHERE id = ?", [nome, Database.now, params[:id].to_i])
  json ok: true
end

delete "/api/dashboards/:id" do
  Database.execute("DELETE FROM dashboards WHERE id = ?", [params[:id].to_i])
  json ok: true
end

# --------------------------------------------------------------- widgets ---
post "/api/dashboards/:id/widgets" do
  d = body_json
  dash = dashboard!(params[:id])
  m = modulo!(d["modulo"].to_s)
  w = ModuleSchema.normalize_widget!(d, m["schema"]).merge("modulo" => m["slug"])
  id = TemplateRegistry.insert_widget(dash["id"], w)
  json widget_json(Database.row("SELECT * FROM widgets WHERE id = ?", [id])), 201
end

put "/api/widgets/:id" do
  d = body_json
  halt json({ error: "Widget não encontrado" }, 404) unless Database.row("SELECT id FROM widgets WHERE id = ?", [params[:id].to_i])
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
  d = body_json
  Database.execute("UPDATE widgets SET x = ?, y = ?, w = ?, h = ? WHERE id = ?",
                   [d["x"].to_i, d["y"].to_i, [d["w"].to_i, 1].max, [d["h"].to_i, 1].max, params[:id].to_i])
  json ok: true
end

delete "/api/widgets/:id" do
  Database.execute("DELETE FROM widgets WHERE id = ?", [params[:id].to_i])
  json ok: true
end

get "/api/widgets/:id/data" do
  w = Database.row("SELECT * FROM widgets WHERE id = ?", [params[:id].to_i])
  halt json({ error: "Widget não encontrado" }, 404) unless w

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
