require "sinatra"
require "json"
require_relative "lib/database"
require_relative "lib/engine_client"

set :public_folder, File.expand_path("../frontend", __dir__)
set :port, 4567
set :bind, "127.0.0.1"
set :server, :webrick

helpers do
  def json(obj)
    content_type :json
    JSON.generate(obj)
  end

  def body_json
    JSON.parse(request.body.read)
  rescue JSON::ParserError
    halt 400, json(error: "JSON inválido")
  end
end

get "/" do
  send_file File.join(settings.public_folder, "index.html")
end

# ---------------------------------------------------------------- setup ----
get "/api/status" do
  if Database.configured?
    cfg = Database.config
    json configured: true, org_name: cfg["org_name"], moeda: cfg["moeda"], meta_mensal: cfg["meta_mensal"]
  else
    json configured: false
  end
end

post "/api/setup" do
  d = body_json
  halt 400, json(error: "org_name é obrigatório") if d["org_name"].to_s.strip.empty?

  Database.setup!(org_name: d["org_name"], moeda: d["moeda"] || "BRL", meta_mensal: (d["meta_mensal"] || 0).to_f)
  json ok: true
end

# ------------------------------------------------------------- demandas ----
get "/api/demandas" do
  json Database.rows("SELECT * FROM demandas ORDER BY criado_em DESC")
end

get "/api/demandas/search" do
  result = EngineClient.run(
    cmd: "search",
    records: Database.rows("SELECT * FROM demandas"),
    q: params[:q].to_s,
    status: params[:status].to_s,
    etapa_fluxo: params[:etapa_fluxo].to_s
  )
  json result
end

post "/api/demandas" do
  d = body_json
  now = Time.now.utc.iso8601
  Database.connection.execute(
    "INSERT INTO demandas (titulo, descricao, status, etapa_fluxo, responsavel, prioridade, valor, prazo, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [d["titulo"], d["descricao"], d["status"] || "backlog", d["etapa_fluxo"] || "entrada",
     d["responsavel"], d["prioridade"] || "media", (d["valor"] || 0).to_f, d["prazo"], now, now]
  )
  json id: Database.connection.last_insert_row_id
end

put "/api/demandas/:id" do
  d = body_json
  Database.connection.execute(
    "UPDATE demandas SET titulo=?, descricao=?, status=?, etapa_fluxo=?, responsavel=?, prioridade=?, valor=?, prazo=?, atualizado_em=?
     WHERE id=?",
    [d["titulo"], d["descricao"], d["status"], d["etapa_fluxo"], d["responsavel"], d["prioridade"],
     (d["valor"] || 0).to_f, d["prazo"], Time.now.utc.iso8601, params[:id].to_i]
  )
  json ok: true
end

delete "/api/demandas/:id" do
  Database.connection.execute("DELETE FROM demandas WHERE id=?", [params[:id].to_i])
  json ok: true
end

# ---------------------------------------------------------- fluxo caixa ----
get "/api/fluxo" do
  json Database.rows("SELECT * FROM fluxo_caixa ORDER BY data DESC")
end

get "/api/fluxo/summary" do
  json EngineClient.run(cmd: "fluxo_summary", records: Database.rows("SELECT * FROM fluxo_caixa"))
end

post "/api/fluxo" do
  d = body_json
  Database.connection.execute(
    "INSERT INTO fluxo_caixa (tipo, categoria, descricao, valor, data, criado_em) VALUES (?, ?, ?, ?, ?, ?)",
    [d["tipo"], d["categoria"].to_s.empty? ? "(sem categoria)" : d["categoria"], d["descricao"],
     (d["valor"] || 0).to_f, d["data"], Time.now.utc.iso8601]
  )
  json id: Database.connection.last_insert_row_id
end

put "/api/fluxo/:id" do
  d = body_json
  Database.connection.execute(
    "UPDATE fluxo_caixa SET tipo=?, categoria=?, descricao=?, valor=?, data=? WHERE id=?",
    [d["tipo"], d["categoria"], d["descricao"], (d["valor"] || 0).to_f, d["data"], params[:id].to_i]
  )
  json ok: true
end

delete "/api/fluxo/:id" do
  Database.connection.execute("DELETE FROM fluxo_caixa WHERE id=?", [params[:id].to_i])
  json ok: true
end

# ---------------------------------------------------------- dashboards -----
get "/api/dashboards" do
  json Database.rows("SELECT * FROM dashboards ORDER BY criado_em")
end

post "/api/dashboards" do
  d = body_json
  halt 400, json(error: "nome é obrigatório") if d["nome"].to_s.strip.empty?

  now = Time.now.utc.iso8601
  Database.connection.execute("INSERT INTO dashboards (nome, criado_em, atualizado_em) VALUES (?, ?, ?)", [d["nome"], now, now])
  json id: Database.connection.last_insert_row_id
end

get "/api/dashboards/:id" do
  dash = Database.row("SELECT * FROM dashboards WHERE id=?", [params[:id].to_i])
  halt 404, json(error: "dashboard não encontrado") unless dash

  dash["widgets"] = Database.rows("SELECT * FROM widgets WHERE dashboard_id=?", [params[:id].to_i])
  json dash
end

put "/api/dashboards/:id" do
  d = body_json
  Database.connection.execute(
    "UPDATE dashboards SET nome=?, atualizado_em=? WHERE id=?",
    [d["nome"], Time.now.utc.iso8601, params[:id].to_i]
  )
  json ok: true
end

delete "/api/dashboards/:id" do
  Database.connection.execute("DELETE FROM widgets WHERE dashboard_id=?", [params[:id].to_i])
  Database.connection.execute("DELETE FROM dashboards WHERE id=?", [params[:id].to_i])
  json ok: true
end

# -------------------------------------------------------------- widgets ----
post "/api/dashboards/:id/widgets" do
  d = body_json
  Database.connection.execute(
    "INSERT INTO widgets (dashboard_id, titulo, tipo, tabela, campo, agregacao, agrupar_por, x, y, w, h)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [params[:id].to_i, d["titulo"], d["tipo"], d["tabela"], d["campo"], d["agregacao"] || "count",
     d["agrupar_por"], (d["x"] || 0).to_i, (d["y"] || 0).to_i, (d["w"] || 4).to_i, (d["h"] || 3).to_i]
  )
  json id: Database.connection.last_insert_row_id
end

put "/api/widgets/:id" do
  d = body_json
  Database.connection.execute(
    "UPDATE widgets SET titulo=?, tabela=?, campo=?, agregacao=?, agrupar_por=?, x=?, y=?, w=?, h=? WHERE id=?",
    [d["titulo"], d["tabela"], d["campo"], d["agregacao"], d["agrupar_por"],
     (d["x"] || 0).to_i, (d["y"] || 0).to_i, (d["w"] || 4).to_i, (d["h"] || 3).to_i, params[:id].to_i]
  )
  json ok: true
end

delete "/api/widgets/:id" do
  Database.connection.execute("DELETE FROM widgets WHERE id=?", [params[:id].to_i])
  json ok: true
end

TABLE_WHITELIST = %w[demandas fluxo_caixa].freeze

get "/api/widgets/:id/data" do
  w = Database.row("SELECT * FROM widgets WHERE id=?", [params[:id].to_i])
  halt 404, json(error: "widget não encontrado") unless w
  halt 400, json(error: "tabela inválida") unless TABLE_WHITELIST.include?(w["tabela"])

  result = EngineClient.run(
    cmd: "aggregate",
    records: Database.rows("SELECT * FROM #{w['tabela']}"),
    group_by: w["agrupar_por"].to_s,
    value_field: w["campo"].to_s
  )
  json result
end

# Registro "default" das tabelas/chaves disponíveis no banco, usado pelo
# construtor de dashboards para o usuário escolher tabela + campo do widget.
get "/api/meta/fields" do
  json(
    demandas: {
      label: "Demandas",
      dimensoes: { status: "Status", etapa_fluxo: "Etapa do fluxo", prioridade: "Prioridade", responsavel: "Responsável" },
      medidas: { valor: "Valor (R$)" }
    },
    fluxo_caixa: {
      label: "Fluxo de Caixa",
      dimensoes: { tipo: "Tipo (entrada/saída)", categoria: "Categoria" },
      medidas: { valor: "Valor (R$)" }
    }
  )
end
