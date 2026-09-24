require "sinatra"
require "json"
require_relative "lib/database"
require_relative "lib/module_schema"
require_relative "lib/template_registry"
require_relative "lib/engine_client"

set :public_folder, File.expand_path("../frontend", __dir__)
set :bind, ENV.fetch("DASHZON_HOST", "127.0.0.1")
set :port, ENV.fetch("PORT", "4567").to_i
set :server, %w[puma webrick]
set :show_exceptions, false
set :raise_errors, false

helpers do
  def json(obj, status_code = nil)
    status status_code if status_code
    content_type :json
    JSON.generate(obj)
  end

  def body_json
    raw = request.body.read
    raw.empty? ? {} : JSON.parse(raw)
  rescue JSON::ParserError
    halt json({ error: "JSON inválido" }, 400)
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

error do
  json({ error: "Erro interno: #{env['sinatra.error'].message}" }, 500)
end

# Rotas que funcionam antes do setup (nenhuma delas toca o banco).
def rota_livre?(req)
  path = req.path_info
  return true if %w[/api/status /api/setup /api/templates/validar].include?(path)

  req.get? && path.start_with?("/api/templates")
end

before "/api/*" do
  next if rota_livre?(request)

  halt json({ error: "O sistema ainda não foi configurado" }, 409) unless Database.configured?
end

get "/" do
  send_file File.join(settings.public_folder, "index.html")
end

# ----------------------------------------------------------------- setup ---
get "/api/status" do
  if Database.configured?
    cfg = Database.config
    json configured: true, org_name: cfg["org_name"], moeda: cfg["moeda"]
  else
    json configured: false
  end
end

# Cria o banco a partir dos parâmetros do usuário + templates escolhidos
# (da galeria e/ou importados em JSON).
post "/api/setup" do
  halt json({ error: "O sistema já está configurado" }, 409) if Database.configured?

  d = body_json
  org = d["org_name"].to_s.strip
  halt json({ error: "Informe o nome da empresa/área" }, 422) if org.empty?

  escolhidos = Array(d["templates"]).map do |id|
    TemplateRegistry.find(id) || halt(json({ error: "Template '#{id}' não existe" }, 422))
  end
  pacotes = (escolhidos + Array(d["importados"])).map { |t| TemplateRegistry.normalize!(t) }

  Database.arquivar_versao_antiga!
  Database.create_schema!(org_name: org, moeda: (d["moeda"] || "BRL").to_s)
  pacotes.each { |t| TemplateRegistry.install!(t, com_exemplos: d["com_exemplos"] != false) }

  if Database.rows("SELECT id FROM dashboards").empty?
    Database.execute("INSERT INTO dashboards (nome, criado_em, atualizado_em) VALUES (?, ?, ?)",
                     ["Visão geral", Database.now, Database.now])
  end
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
  d = body_json
  bruto = d["template_id"] ? TemplateRegistry.find(d["template_id"]) : d["template"]
  halt json({ error: "Template não encontrado" }, 404) unless bruto

  mapa = TemplateRegistry.install!(TemplateRegistry.normalize!(bruto), com_exemplos: d["com_exemplos"] != false)
  json ok: true, modulos: mapa.values
end

get "/api/export" do
  dados = TemplateRegistry.export(com_dados: params[:dados] == "1")
  attachment "dashzon-#{Time.now.strftime('%Y%m%d-%H%M')}.json"
  json dados
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

  TemplateRegistry.install!({ "id" => "personalizado", "modulos" => [m.merge("seed" => [])], "dashboards" => [] })
  json Database.modulo(m["slug"]), 201
end

put "/api/modulos/:slug" do
  atual = modulo!(params[:slug])
  m = ModuleSchema.normalize_modulo!(body_json.merge("slug" => atual["slug"]))
  Database.execute(
    "UPDATE modulos SET nome = ?, descricao = ?, icone = ?, schema = ? WHERE id = ?",
    [m["nome"], m["descricao"], m["icone"], JSON.generate(m.slice("campos", "rotulo", "resumo")), atual["id"]]
  )
  json Database.modulo(atual["slug"])
end

delete "/api/modulos/:slug" do
  m = modulo!(params[:slug])
  Database.transaction do
    Database.execute("DELETE FROM widgets WHERE modulo_slug = ?", [m["slug"]])
    Database.execute("DELETE FROM registros WHERE modulo_id = ?", [m["id"]])
    Database.execute("DELETE FROM modulos WHERE id = ?", [m["id"]])
  end
  json ok: true
end

get "/api/modulos/:slug/resumo" do
  m = modulo!(params[:slug])
  schema = m["schema"]
  itens = schema["resumo"]
  halt json([]) if itens.empty?

  out = EngineClient.run(
    cmd: "multi",
    records: Database.registros(m["id"]),
    queries: itens.map { |r| ModuleSchema.engine_query(schema, r) }
  )
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
  res = EngineClient.run(
    cmd: "search",
    records: Database.registros(m["id"]),
    q: params[:q].to_s,
    text_fields: texto_campos(m["schema"]),
    filters: filtros
  )
  json res
end

post "/api/modulos/:slug/registros" do
  m = modulo!(params[:slug])
  dados = ModuleSchema.coerce_registro!(m["schema"], body_json)
  now = Database.now
  id = Database.insert("INSERT INTO registros (modulo_id, dados, criado_em, atualizado_em) VALUES (?, ?, ?, ?)",
                       [m["id"], JSON.generate(dados), now, now])
  json Database.registro(m["id"], id), 201
end

put "/api/modulos/:slug/registros/:id" do
  m = modulo!(params[:slug])
  halt json({ error: "Registro não encontrado" }, 404) unless Database.registro(m["id"], params[:id].to_i)

  dados = ModuleSchema.coerce_registro!(m["schema"], body_json)
  Database.execute("UPDATE registros SET dados = ?, atualizado_em = ? WHERE id = ? AND modulo_id = ?",
                   [JSON.generate(dados), Database.now, params[:id].to_i, m["id"]])
  json Database.registro(m["id"], params[:id].to_i)
end

delete "/api/modulos/:slug/registros/:id" do
  m = modulo!(params[:slug])
  Database.execute("DELETE FROM registros WHERE id = ? AND modulo_id = ?", [params[:id].to_i, m["id"]])
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
  nome = body_json["nome"].to_s.strip
  halt json({ error: "Informe o nome do dashboard" }, 422) if nome.empty?

  id = Database.insert("INSERT INTO dashboards (nome, criado_em, atualizado_em) VALUES (?, ?, ?)", [nome, Database.now, Database.now])
  json({ id: id }, 201)
end

get "/api/dashboards/:id" do
  dash = Database.row("SELECT * FROM dashboards WHERE id = ?", [params[:id].to_i])
  halt json({ error: "Dashboard não encontrado" }, 404) unless dash

  dash["widgets"] = Database.rows("SELECT * FROM widgets WHERE dashboard_id = ?", [dash["id"]]).map { |w| widget_json(w) }
  json dash
end

put "/api/dashboards/:id" do
  nome = body_json["nome"].to_s.strip
  halt json({ error: "Informe o nome do dashboard" }, 422) if nome.empty?

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
  m = modulo!(d["modulo"].to_s)
  w = ModuleSchema.normalize_widget!(d, m["schema"]).merge("modulo" => m["slug"])
  id = TemplateRegistry.insert_widget(params[:id].to_i, w)
  json widget_json(Database.row("SELECT * FROM widgets WHERE id = ?", [id])), 201
end

put "/api/widgets/:id" do
  d = body_json
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
  res = EngineClient.run({ cmd: "aggregate", records: Database.registros(m["id"]) }.merge(ModuleSchema.engine_query(m["schema"], cfg)))
  json res.merge("config" => cfg)
end
