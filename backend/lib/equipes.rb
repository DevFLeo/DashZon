require "json"
require_relative "database"
require_relative "segredo"
require_relative "documento"
require_relative "usuarios"

# Equipes: grupos de usuários criados no Painel do adm.
#  - Uma equipe pode ser uma EMPRESA: aí ganha CNPJ, que pode ser obrigatório
#    ou não (`exigir_cnpj`). O CNPJ fica só em HMAC (para achar duplicados) +
#    máscara para exibir, como o CPF/CNPJ das contas.
#  - "Empresa de teste": uma empresa marcada como `teste`, com CNPJ fictício
#    (válido nos dígitos, mas inventado), para experimentar sem misturar com
#    as reais.
#  - Membros: um usuário pode estar em nenhuma, uma ou várias equipes.
module Equipes
  Erro = Usuarios::Erro

  NOME_MAX = 80
  DESCRICAO_MAX = 300

  module_function

  def tabelas!
    Database.garantir_tabelas!
  end

  def por_id(id)
    tabelas!
    Database.row("SELECT * FROM equipes WHERE id = ?", [id.to_i])
  end

  def por_id!(id)
    por_id(id) || raise(Erro.new("Equipe não encontrada", 404))
  end

  # Todas, com os membros (id, nome, login). Ordem: reais primeiro, por nome.
  def todas
    tabelas!
    membros = Database.rows(
      "SELECT m.equipe_id, u.id, u.nome, u.login FROM equipe_membros m JOIN usuarios u ON u.id = m.usuario_id
       ORDER BY lower(COALESCE(NULLIF(u.nome, ''), u.login))"
    ).group_by { |r| r["equipe_id"] }
    Database.rows("SELECT * FROM equipes ORDER BY teste, lower(nome)").map do |e|
      publica(e, (membros[e["id"]] || []).map { |m| { "id" => m["id"], "nome" => m["nome"].to_s.empty? ? m["login"] : m["nome"], "login" => m["login"] } })
    end
  end

  def publica(e, membros = nil)
    {
      "id" => e["id"],
      "nome" => e["nome"],
      "descricao" => e["descricao"].to_s,
      "empresa" => e["empresa"].to_i == 1,
      "exigir_cnpj" => e["exigir_cnpj"].to_i == 1,
      "cnpj" => e["cnpj_mascara"],
      "teste" => e["teste"].to_i == 1,
      "membros" => membros,
      "total" => membros&.size,
      "criado_em" => e["criado_em"]
    }.compact
  end

  # Equipes de cada usuário: { usuario_id => [{id, nome, empresa, teste}] }.
  def por_usuario
    tabelas!
    Database.rows(
      "SELECT m.usuario_id, e.id, e.nome, e.empresa, e.teste FROM equipe_membros m JOIN equipes e ON e.id = m.equipe_id
       ORDER BY lower(e.nome)"
    ).group_by { |r| r["usuario_id"] }
     .transform_values { |l| l.map { |r| { "id" => r["id"], "nome" => r["nome"], "empresa" => r["empresa"].to_i == 1, "teste" => r["teste"].to_i == 1 } } }
  end

  # Equipes de uma pessoa, para ela mesma (Configurações > Conta): nome, se é
  # empresa e o CNPJ mascarado (o mesmo que o admin vê).
  def do_usuario(usuario_id)
    tabelas!
    Database.rows(
      "SELECT e.* FROM equipe_membros m JOIN equipes e ON e.id = m.equipe_id WHERE m.usuario_id = ? ORDER BY lower(e.nome)",
      [usuario_id.to_i]
    ).map { |e| publica(e).slice("id", "nome", "descricao", "empresa", "cnpj", "teste") }
  end

  # --- validação ------------------------------------------------------------------

  # Campos ausentes mantêm o valor atual (`atual`, ao editar).
  def validar!(d, atual: nil)
    out = {}
    nome = (d.key?("nome") ? d["nome"] : atual&.dig("nome")).to_s.strip
    raise Erro, "Informe o nome da equipe" if nome.empty?
    raise Erro, "Nome da equipe muito longo (máximo #{NOME_MAX})" if nome.length > NOME_MAX

    outra = Database.rows("SELECT id, nome FROM equipes").find do |e|
      e["nome"].to_s.strip.downcase == nome.downcase && e["id"] != atual&.dig("id")
    end
    raise Erro, "Já existe uma equipe chamada '#{outra['nome']}'" if outra
    out["nome"] = nome

    descricao = (d.key?("descricao") ? d["descricao"] : atual&.dig("descricao")).to_s.strip
    raise Erro, "Descrição muito longa (máximo #{DESCRICAO_MAX})" if descricao.length > DESCRICAO_MAX
    out["descricao"] = descricao

    empresa = d.key?("empresa") ? d["empresa"] == true : atual&.dig("empresa").to_i == 1
    exigir = empresa && (d.key?("exigir_cnpj") ? d["exigir_cnpj"] == true : atual&.dig("exigir_cnpj").to_i == 1)
    out["empresa"] = empresa ? 1 : 0
    out["exigir_cnpj"] = exigir ? 1 : 0
    out.merge!(validar_cnpj!(d, atual, empresa, exigir))
    out
  end

  def validar_cnpj!(d, atual, empresa, exigir)
    vazio = { "cnpj_hash" => nil, "cnpj_mascara" => nil }
    return vazio unless empresa # equipe que não é empresa não guarda CNPJ

    texto = d["cnpj"].to_s.strip
    if texto.empty?
      # Editando sem mandar o CNPJ: mantém o que já estava.
      return atual.slice("cnpj_hash", "cnpj_mascara") if atual && atual["cnpj_hash"] && !d.key?("cnpj")
      raise Erro, "Informe o CNPJ (esta empresa exige CNPJ)" if exigir

      return vazio
    end

    begin
      _tipo, digitos = Documento.validar!(texto, aceitos: %w[cnpj])
    rescue Documento::Invalido => e
      raise Erro, e.message
    end
    hash = Segredo.hmac("equipe-cnpj:#{digitos}")
    if (dona = Database.row("SELECT id, nome FROM equipes WHERE cnpj_hash = ?", [hash])) && dona["id"] != atual&.dig("id")
      raise Erro, "Este CNPJ já está cadastrado na equipe '#{dona['nome']}'"
    end

    { "cnpj_hash" => hash, "cnpj_mascara" => Documento.mascarar("cnpj", digitos) }
  end

  # --- escrita -------------------------------------------------------------------------

  def criar!(d, teste: false)
    tabelas!
    v = validar!(d)
    now = Database.now
    Database.insert(
      "INSERT INTO equipes (nome, descricao, empresa, exigir_cnpj, cnpj_hash, cnpj_mascara, teste, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [v["nome"], v["descricao"], v["empresa"], v["exigir_cnpj"], v["cnpj_hash"], v["cnpj_mascara"], teste ? 1 : 0, now, now]
    )
  end

  # Empresa de teste: nome livre ("Empresa Teste", "Empresa Teste (2)"...) e
  # CNPJ fictício válido. Fica marcada como teste para não se misturar.
  def criar_empresa_teste!
    tabelas!
    nomes = Database.rows("SELECT nome FROM equipes").map { |r| r["nome"].to_s.strip.downcase }
    nome = "Empresa Teste"
    n = 2
    while nomes.include?(nome.downcase)
      nome = "Empresa Teste (#{n})"
      n += 1
    end
    criar!({ "nome" => nome, "descricao" => "Empresa fictícia para testes (CNPJ inventado). Pode excluir quando quiser.",
             "empresa" => true, "exigir_cnpj" => true, "cnpj" => Documento.gerar_cnpj_ficticio }, teste: true)
  end

  def atualizar!(id, d)
    atual = por_id!(id)
    v = validar!(d, atual: atual)
    Database.execute(
      "UPDATE equipes SET nome = ?, descricao = ?, empresa = ?, exigir_cnpj = ?, cnpj_hash = ?, cnpj_mascara = ?, atualizado_em = ?
       WHERE id = ?",
      [v["nome"], v["descricao"], v["empresa"], v["exigir_cnpj"], v["cnpj_hash"], v["cnpj_mascara"], Database.now, atual["id"]]
    )
    por_id(atual["id"])
  end

  def excluir!(id)
    e = por_id!(id)
    Database.execute("DELETE FROM equipes WHERE id = ?", [e["id"]]) # membros saem em cascata
  end

  # Define exatamente quem está na equipe.
  def definir_membros!(id, usuario_ids)
    e = por_id!(id)
    ids = ids_validos!(usuario_ids)
    Database.transaction do
      Database.execute("DELETE FROM equipe_membros WHERE equipe_id = ?", [e["id"]])
      ids.each { |uid| Database.execute("INSERT INTO equipe_membros (equipe_id, usuario_id, criado_em) VALUES (?, ?, ?)", [e["id"], uid, Database.now]) }
    end
  end

  # Define exatamente em quais equipes o usuário está.
  def definir_equipes_do_usuario!(usuario_id, equipe_ids)
    ids = ids_de_equipes!(equipe_ids)
    Database.transaction do
      Database.execute("DELETE FROM equipe_membros WHERE usuario_id = ?", [usuario_id.to_i])
      ids.each { |eid| Database.execute("INSERT INTO equipe_membros (equipe_id, usuario_id, criado_em) VALUES (?, ?, ?)", [eid, usuario_id.to_i, Database.now]) }
    end
  end

  # Confere a lista de equipes ANTES de gravar qualquer coisa (criar um
  # usuário com uma equipe inválida não pode deixar o usuário pela metade).
  def ids_de_equipes!(equipe_ids)
    tabelas!
    raise Erro, "'equipes' deve ser uma lista" unless equipe_ids.is_a?(Array)

    ids = equipe_ids.map(&:to_i).uniq
    existentes = ids.empty? ? [] : Database.rows("SELECT id FROM equipes").map { |r| r["id"] } & ids
    raise Erro, "Equipe inexistente na lista" if existentes.size != ids.size

    ids
  end

  def ids_validos!(usuario_ids)
    raise Erro, "'usuario_ids' deve ser uma lista" unless usuario_ids.is_a?(Array)

    ids = usuario_ids.map(&:to_i).uniq
    existentes = ids.empty? ? [] : Database.rows("SELECT id FROM usuarios").map { |r| r["id"] } & ids
    raise Erro, "Usuário inexistente na lista" if existentes.size != ids.size

    ids
  end
end
