# Minha equipe (#/equipe): o que um GESTOR faz dentro do escopo dele, em
# cascata (lib/unidades.rb). Ex.: gestora da SUPLAN e da SURÇAM põe e tira
# pessoas de qualquer unidade dessas duas subsecretarias; gestor do DGEO, só
# no DGEO, DCAD, DTAD e DASI; gerente do DTAD, só no DTAD.
#
#   - unidades do escopo: ver, criar unidades dentro delas, editar e excluir
#     as que estão abaixo da que a pessoa gere (não a própria);
#   - membros: pôr e tirar pessoas, e escolher quem é gestor;
#   - contas: criar (perfil usuário ou visualizador), desativar, gerar senha
#     temporária e excluir quem está SÓ em unidades do escopo (nunca um
#     administrador nem a si mesmo).
# Administradores também podem usar estas rotas (escopo = tudo).

helpers do
  def unidade_no_escopo!(id)
    u = Equipes.por_id!(id)
    halt json({ error: "A unidade #{Unidades.rotulo(u)} está fora do seu alcance de gestão" }, 403) unless acesso.gere?(u["id"])

    u
  end

  # Conta que o gestor pode administrar: não é admin nem ele mesmo, e todas
  # as unidades dela estão no escopo dele (alguém que também é de outra
  # secretaria não pode ser desativado por um só lado).
  def conta_no_escopo!(id)
    alvo = Usuarios.por_id(id) || halt(json({ error: "Usuário não encontrado" }, 404))
    halt json({ error: "Use o seu próprio cadastro em Configurações" }, 403) if alvo["id"] == usuario_atual["id"]
    return alvo if acesso.admin?

    halt json({ error: "Só outro administrador altera a conta de um administrador" }, 403) if alvo["perfil"] == "admin"
    unidades = Database.rows("SELECT equipe_id FROM equipe_membros WHERE usuario_id = ?", [alvo["id"]]).map { |r| r["equipe_id"] }
    if unidades.empty? || !unidades.all? { |e| acesso.gere?(e) }
      halt json({ error: "Esta pessoa também é de unidades fora do seu alcance: peça a um administrador" }, 403)
    end
    alvo
  end

  def resumo_pessoa(u, unidades)
    Usuarios.publico(u).slice("id", "login", "nome", "email", "cargo", "perfil", "ativo", "deve_trocar_senha", "ultimo_login_em")
                       .merge("unidades" => unidades)
  end
end

before "/api/gestao*" do
  halt json({ error: "Só gestores de unidade (ou administradores) usam esta tela" }, 403) unless usuario_atual && acesso.gestor?
end

get "/api/gestao" do
  escopo = acesso.escopo
  unidades = Equipes.todas.select { |e| escopo.include?(e["id"]) }
  por_usuario = Equipes.por_usuario
  pessoas = Usuarios.todos.filter_map do |u|
    dele = (por_usuario[u["id"]] || []).select { |e| escopo.include?(e["id"]) }
    next if dele.empty?

    u.slice("id", "login", "nome", "email", "cargo", "perfil", "admin", "ativo", "deve_trocar_senha", "ultimo_login_em")
     .merge("unidades" => dele, "fora_do_escopo" => (por_usuario[u["id"]] || []).size > dele.size)
  end
  # Para "pôr alguém que já tem conta": só nome e login das contas ativas.
  contas = Usuarios.todos.select { |u| u["ativo"] }.map { |u| u.slice("id", "nome", "login") }
  json escopo: escopo.to_a, editaveis: acesso.escopo_abaixo.to_a, minhas_gestoes: acesso.minhas_gestoes.to_a,
       unidades: unidades, pessoas: pessoas, contas: contas, tipos: Unidades::NOMES_TIPO
end

post "/api/gestao/unidades" do
  d = body_json
  pai = unidade_no_escopo!(d["pai_id"]) # unidade nova sempre dentro de uma que a pessoa gere
  id = Equipes.criar!(d.slice("nome", "sigla", "tipo", "descricao").merge("pai_id" => pai["id"]))
  json Equipes.todas.find { |e| e["id"] == id }, 201
end

put "/api/gestao/unidades/:id" do
  u = unidade_no_escopo!(params[:id])
  halt json({ error: "A unidade que você gere só é alterada por quem gere a de cima (ou um administrador)" }, 403) unless acesso.escopo_abaixo.include?(u["id"])

  d = body_json.slice("nome", "sigla", "tipo", "descricao", "pai_id")
  unidade_no_escopo!(d["pai_id"]) if d.key?("pai_id") && !d["pai_id"].to_s.empty?
  Equipes.atualizar!(u["id"], d)
  json Equipes.todas.find { |e| e["id"] == u["id"] }
end

delete "/api/gestao/unidades/:id" do
  u = unidade_no_escopo!(params[:id])
  halt json({ error: "A unidade que você gere só é excluída por quem gere a de cima (ou um administrador)" }, 403) unless acesso.escopo_abaixo.include?(u["id"])

  Equipes.excluir!(u["id"])
  json ok: true
end

# Põe uma pessoa (que já tem conta) na unidade, ou muda o papel: {"papel": "membro"|"gestor"}.
put "/api/gestao/unidades/:id/membros/:usuario_id" do
  u = unidade_no_escopo!(params[:id])
  alvo = Usuarios.por_id(params[:usuario_id]) || halt(json({ error: "Usuário não encontrado" }, 404))
  papel = (body_json["papel"] || "membro").to_s
  if alvo["id"] == usuario_atual["id"] && !acesso.admin? && papel != "gestor" && acesso.minhas_gestoes.include?(u["id"])
    halt json({ error: "Você não pode tirar o seu próprio papel de gestor" }, 403)
  end
  Equipes.definir_membro!(u["id"], alvo["id"], papel)
  json ok: true
end

delete "/api/gestao/unidades/:id/membros/:usuario_id" do
  u = unidade_no_escopo!(params[:id])
  halt json({ error: "Você não pode se tirar da unidade que gere" }, 403) if params[:usuario_id].to_i == usuario_atual["id"] && !acesso.admin?
  halt json({ error: "Esta pessoa não está nesta unidade" }, 404) if Equipes.remover_membro!(u["id"], params[:usuario_id]).zero?

  json ok: true
end

# Conta nova já dentro de uma unidade do escopo. Sem senha: gera uma
# temporária (mostrada uma vez), trocada no primeiro acesso.
post "/api/gestao/usuarios" do
  d = body_json
  u = unidade_no_escopo!(d["unidade_id"])
  perfil = (d["perfil"] || "usuario").to_s
  halt json({ error: "Gestores criam contas de usuário ou visualizador" }, 403) unless acesso.admin? || %w[usuario visualizador].include?(perfil)

  papel = (d["papel"] || "membro").to_s
  informada = d["senha"].to_s
  senha = informada.empty? ? Usuarios.senha_temporaria : informada
  id = nil
  Database.transaction do
    id = Usuarios.criar!(d.slice("nome", "login", "email", "cargo", "documento").merge("perfil" => perfil),
                         senha: senha, deve_trocar: informada.empty? || d["deve_trocar_senha"] != false)
    Equipes.definir_membro!(u["id"], id, papel)
  end
  json({ usuario: Usuarios.publico(Usuarios.por_id(id)), senha_temporaria: informada.empty? ? senha : nil }, 201)
end

post "/api/gestao/usuarios/:id/ativo" do
  alvo = conta_no_escopo!(params[:id])
  json Usuarios.publico(Usuarios.definir_ativo!(alvo["id"], body_json["ativo"] == true))
end

post "/api/gestao/usuarios/:id/senha-temporaria" do
  alvo = conta_no_escopo!(params[:id])
  senha = Usuarios.senha_temporaria
  Usuarios.definir_senha!(alvo["id"], senha, deve_trocar: true)
  json ok: true, senha_temporaria: senha
end

delete "/api/gestao/usuarios/:id" do
  alvo = conta_no_escopo!(params[:id])
  Usuarios.excluir!(alvo["id"], herdeiro_id: usuario_atual["id"])
  json ok: true
end
