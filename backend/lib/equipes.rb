require "json"
require_relative "database"
require_relative "segredo"
require_relative "documento"
require_relative "usuarios"
require_relative "unidades"

# Equipes e unidades da prefeitura: grupos de usuários criados no Painel do adm
# (ou por um gestor, dentro do alcance dele: rotas/gestao.rb).
#  - `tipo`: secretaria, subsecretaria, departamento, divisão ou equipe (grupo
#    livre). Com `pai_id`, as unidades formam a árvore da prefeitura
#    (SEMEC / SUPLAN / DGEO / DCAD). Regras da árvore: lib/unidades.rb.
#  - `sigla`: única (sem diferenciar maiúsculas). É por ela que um campo de
#    seleção como "DCAD - Divisão de Cadastro" é ligado à unidade.
#  - Membros: um usuário pode estar em nenhuma, uma ou várias unidades, como
#    "membro" ou "gestor" (administra a unidade e tudo abaixo dela).
#  - Uma equipe pode ser uma EMPRESA (CNPJ em HMAC + máscara). "Empresa de
#    teste": CNPJ fictício. Mantidas da versão anterior.
module Equipes
  Erro = Usuarios::Erro

  NOME_MAX = 80
  DESCRICAO_MAX = 300
  SIGLA_RE = /\A[\p{Lu}0-9][\p{Lu}0-9_.\-]{0,19}\z/

  module_function

  def tabelas!
    Database.garantir_tabelas!
  end

  def por_id(id)
    tabelas!
    Database.row("SELECT * FROM equipes WHERE id = ?", [id.to_i])
  end

  def por_id!(id)
    por_id(id) || raise(Erro.new("Unidade não encontrada", 404))
  end

  # Todas, com os membros (id, nome, login, papel) e o caminho na árvore.
  # Ordem: de cima para baixo (pai antes dos filhos), irmãs por sigla/nome.
  def todas
    tabelas!
    membros = Database.rows(
      "SELECT m.equipe_id, m.papel, u.id, u.nome, u.login, u.ativo FROM equipe_membros m JOIN usuarios u ON u.id = m.usuario_id
       ORDER BY m.papel DESC, lower(COALESCE(NULLIF(u.nome, ''), u.login))"
    ).group_by { |r| r["equipe_id"] }
    linhas = Database.rows("SELECT * FROM equipes ORDER BY teste, lower(COALESCE(sigla, nome))")
    por_id = linhas.to_h { |e| [e["id"], e] }
    em_arvore(linhas).map do |e, nivel|
      lista = (membros[e["id"]] || []).map do |m|
        { "id" => m["id"], "nome" => m["nome"].to_s.empty? ? m["login"] : m["nome"], "login" => m["login"],
          "papel" => m["papel"] || "membro", "ativo" => m["ativo"].to_i == 1 }
      end
      publica(e, lista).merge("nivel" => nivel, "caminho" => Unidades.caminho(e["id"], por_id))
    end
  end

  # Percorre a árvore em profundidade: [[unidade, nível], ...]. Unidades com
  # pai inexistente (ou num ciclo) aparecem como raiz, para não sumirem.
  def em_arvore(linhas)
    ids = linhas.to_set { |e| e["id"] }
    filhos = linhas.group_by { |e| ids.include?(e["pai_id"]) ? e["pai_id"] : nil }
    out = []
    vistos = Set.new
    visitar = lambda do |e, nivel|
      next if vistos.include?(e["id"])

      vistos << e["id"]
      out << [e, nivel]
      (filhos[e["id"]] || []).each { |f| visitar.call(f, nivel + 1) }
    end
    (filhos[nil] || []).each { |e| visitar.call(e, 0) }
    linhas.each { |e| visitar.call(e, 0) } # sobras de um ciclo
    out
  end

  def publica(e, membros = nil)
    {
      "id" => e["id"],
      "nome" => e["nome"],
      "sigla" => e["sigla"],
      "tipo" => e["tipo"] || "equipe",
      "pai_id" => e["pai_id"],
      "descricao" => e["descricao"].to_s,
      "empresa" => e["empresa"].to_i == 1,
      "exigir_cnpj" => e["exigir_cnpj"].to_i == 1,
      "cnpj" => e["cnpj_mascara"],
      "teste" => e["teste"].to_i == 1,
      "membros" => membros,
      "gestores" => membros&.select { |m| m["papel"] == "gestor" }&.map { |m| m["id"] },
      "total" => membros&.size,
      "criado_em" => e["criado_em"]
    }.compact.merge("pai_id" => e["pai_id"], "sigla" => e["sigla"])
  end

  # Unidades de cada usuário: { usuario_id => [{id, nome, sigla, tipo, papel, ...}] }.
  def por_usuario
    tabelas!
    Database.rows(
      "SELECT m.usuario_id, m.papel, e.id, e.nome, e.sigla, e.tipo, e.empresa, e.teste FROM equipe_membros m
       JOIN equipes e ON e.id = m.equipe_id ORDER BY lower(COALESCE(e.sigla, e.nome))"
    ).group_by { |r| r["usuario_id"] }
     .transform_values do |l|
       l.map do |r|
         { "id" => r["id"], "nome" => r["nome"], "sigla" => r["sigla"], "tipo" => r["tipo"] || "equipe",
           "papel" => r["papel"] || "membro", "empresa" => r["empresa"].to_i == 1, "teste" => r["teste"].to_i == 1 }
       end
     end
  end

  # Unidades de uma pessoa, para ela mesma (Configurações > Conta).
  def do_usuario(usuario_id)
    tabelas!
    Database.rows(
      "SELECT e.*, m.papel FROM equipe_membros m JOIN equipes e ON e.id = m.equipe_id WHERE m.usuario_id = ?
       ORDER BY lower(COALESCE(e.sigla, e.nome))",
      [usuario_id.to_i]
    ).map { |e| publica(e).slice("id", "nome", "sigla", "tipo", "descricao", "empresa", "cnpj", "teste").merge("papel" => e["papel"] || "membro") }
  end

  # --- validação ------------------------------------------------------------------

  # Campos ausentes mantêm o valor atual (`atual`, ao editar).
  def validar!(d, atual: nil)
    out = {}
    valor = ->(k) { d.key?(k) ? d[k] : atual&.dig(k) }

    tipo = (valor.("tipo") || "equipe").to_s
    raise Erro, "Tipo de unidade inválido (use: #{Unidades::TIPOS.join(', ')})" unless Unidades::TIPOS.include?(tipo)
    out["tipo"] = tipo

    pai_id = valor.("pai_id")
    pai_id = nil if pai_id.to_s.strip.empty?
    out["pai_id"] = validar_pai!(pai_id&.to_i, tipo, atual)

    nome = valor.("nome").to_s.strip
    raise Erro, "Informe o nome da unidade" if nome.empty?
    raise Erro, "Nome muito longo (máximo #{NOME_MAX})" if nome.length > NOME_MAX

    # Nome único entre as irmãs (dois departamentos podem ter um "Gabinete").
    outra = Database.rows("SELECT id, nome, pai_id FROM equipes").find do |e|
      e["pai_id"] == out["pai_id"] && e["nome"].to_s.strip.downcase == nome.downcase && e["id"] != atual&.dig("id")
    end
    raise Erro, "Já existe uma unidade chamada '#{outra['nome']}' neste nível" if outra
    out["nome"] = nome

    sigla = valor.("sigla").to_s.strip.upcase
    if sigla.empty?
      raise Erro, "Informe a sigla (ex.: SEMEC, DGEO)" unless tipo == "equipe"

      out["sigla"] = nil
    else
      raise Erro, "Sigla inválida: use letras maiúsculas, números, '.', '-' ou '_' (até 20)" unless sigla.match?(SIGLA_RE)

      dona = Database.rows("SELECT id, nome, sigla FROM equipes WHERE sigla IS NOT NULL").find do |e|
        e["sigla"].to_s.upcase == sigla && e["id"] != atual&.dig("id")
      end
      raise Erro, "A sigla #{sigla} já é de '#{dona['nome']}'" if dona

      out["sigla"] = sigla
    end

    descricao = valor.("descricao").to_s.strip
    raise Erro, "Descrição muito longa (máximo #{DESCRICAO_MAX})" if descricao.length > DESCRICAO_MAX
    out["descricao"] = descricao

    empresa = d.key?("empresa") ? d["empresa"] == true : atual&.dig("empresa").to_i == 1
    exigir = empresa && (d.key?("exigir_cnpj") ? d["exigir_cnpj"] == true : atual&.dig("exigir_cnpj").to_i == 1)
    out["empresa"] = empresa ? 1 : 0
    out["exigir_cnpj"] = exigir ? 1 : 0
    out.merge!(validar_cnpj!(d, atual, empresa, exigir))
    out
  end

  # O pai existe, não é a própria unidade nem uma de baixo dela (ciclo), não
  # está abaixo na hierarquia (divisão não contém departamento) e a árvore
  # não passa da profundidade máxima.
  def validar_pai!(pai_id, tipo, atual)
    return nil unless pai_id

    lista = Unidades.todas
    por_id = lista.to_h { |u| [u["id"], u] }
    pai = por_id[pai_id] || raise(Erro, "Unidade superior não encontrada")
    if atual
      raise Erro, "Uma unidade não pode ficar dentro dela mesma" if pai_id == atual["id"]
      if Unidades.descendentes(atual["id"], Unidades.filhos(lista)).include?(pai_id)
        raise Erro, "A unidade superior escolhida está dentro desta unidade"
      end
    end
    nivel_pai = Unidades::NIVEL[pai["tipo"]]
    nivel = Unidades::NIVEL[tipo]
    if nivel && nivel_pai && nivel < nivel_pai
      raise Erro, "#{Unidades::NOMES_TIPO[tipo]} não pode ficar dentro de #{Unidades::NOMES_TIPO[pai['tipo']].downcase} (#{Unidades.rotulo(pai)})"
    end
    if Unidades.ancestrais(pai_id, por_id).size + 2 > Unidades::PROFUNDIDADE_MAX
      raise Erro, "Estrutura muito profunda (máximo #{Unidades::PROFUNDIDADE_MAX} níveis)"
    end

    pai_id
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
      "INSERT INTO equipes (nome, descricao, empresa, exigir_cnpj, cnpj_hash, cnpj_mascara, teste, criado_em, atualizado_em, tipo, sigla, pai_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [v["nome"], v["descricao"], v["empresa"], v["exigir_cnpj"], v["cnpj_hash"], v["cnpj_mascara"], teste ? 1 : 0, now, now,
       v["tipo"], v["sigla"], v["pai_id"]]
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

  # Estrutura modelo da SEMEC (exemplo da prefeitura), sem usuários. Unidades
  # cuja sigla já existe são reaproveitadas, então rodar duas vezes não duplica.
  MODELO = [
    ["SEMEC", "Secretaria Municipal de Educação", "secretaria", nil],
    ["SUPLAN", "Subsecretaria de Planejamento", "subsecretaria", "SEMEC"],
    ["SURÇAM", "Subsecretaria SURÇAM", "subsecretaria", "SEMEC"],
    ["DGEO", "Departamento de Geoprocessamento", "departamento", "SUPLAN"],
    ["DIPLAD", "Departamento DIPLAD", "departamento", "SUPLAN"],
    ["DIPEI", "Departamento DIPEI", "departamento", "SUPLAN"],
    ["DCAD", "Divisão de Cadastro (Dados)", "divisao", "DGEO"],
    ["DTAD", "Divisão de Tecnologia e Dados", "divisao", "DGEO"],
    ["DASI", "Divisão de Articulação com Secretarias", "divisao", "DGEO"]
  ].freeze

  def criar_modelo!
    tabelas!
    criadas = 0
    Database.transaction do
      MODELO.each do |sigla, nome, tipo, pai|
        next if Database.rows("SELECT sigla FROM equipes WHERE sigla IS NOT NULL").any? { |e| e["sigla"].upcase == sigla }

        pai_id = pai && Database.rows("SELECT id, sigla FROM equipes WHERE sigla IS NOT NULL").find { |e| e["sigla"].upcase == pai }&.dig("id")
        criar!({ "sigla" => sigla, "nome" => nome, "tipo" => tipo, "pai_id" => pai_id })
        criadas += 1
      end
    end
    criadas
  end

  # --- árvore em texto ----------------------------------------------------------
  #
  # Uma estrutura inteira de uma vez (Painel do adm > Criar > Nova estrutura, ou
  # o gestor em Minha equipe), escrita como texto: uma unidade por linha, o
  # recuo diz quem fica dentro de quem.
  #
  #   SEMAGRIC - Secretaria Municipal de Agricultura
  #     SUPROD - Subsecretaria de Produção
  #       DAGRO - Departamento de Agronegócio | departamento
  #         DIVAP - Divisão de Apoio ao Produtor
  #
  # - "SIGLA - Nome" (também aceita "–" ou "—"); uma palavra só vale como sigla e nome.
  # - Tipo opcional depois de "|". Sem ele: a de cima vira secretaria e cada
  #   nível desce um (subsecretaria, departamento, divisão; divisão dentro de divisão).
  # - Recuo com espaços ou tab; "-", "*" ou "•" no começo são ignorados.
  # - Linhas vazias e começadas por "#" são ignoradas.
  # - Sigla que já existe é REAPROVEITADA (não muda de nome nem de lugar): dá
  #   para acrescentar unidades dentro de uma estrutura que já existe.
  # Tudo numa transação: um erro em qualquer linha não cria nada.
  ARVORE_MAX_LINHAS = 300
  ARVORE_MAX_TEXTO = 50_000
  TIPOS_POR_NOME = { "secretaria" => "secretaria", "subsecretaria" => "subsecretaria", "departamento" => "departamento",
                     "divisao" => "divisao", "equipe" => "equipe" }.freeze

  def sem_acento(texto)
    texto.to_s.unicode_normalize(:nfd).gsub(/\p{Mn}/, "").downcase.strip
  end

  # Texto -> [{linha, sigla, nome, tipo (ou nil), pai (índice na lista ou nil)}].
  def ler_arvore(texto)
    texto = texto.to_s
    raise Erro, "Escreva a estrutura (uma unidade por linha)" if texto.strip.empty?
    raise Erro, "Texto grande demais (máximo #{ARVORE_MAX_TEXTO} caracteres)" if texto.length > ARVORE_MAX_TEXTO

    nos = []
    pilha = [] # [[recuo, índice]]
    texto.gsub("\r\n", "\n").split("\n").each_with_index do |bruta, i|
      linha = i + 1
      next if bruta.strip.empty? || bruta.strip.start_with?("#")

      recuo = bruta[/\A[ \t]*/].gsub("\t", "    ").length
      conteudo = bruta.strip.sub(/\A[-*•]\s+/, "")
      conteudo, tipo_txt = conteudo.split("|", 2).map(&:strip)
      tipo = nil
      if tipo_txt && !tipo_txt.empty?
        tipo = TIPOS_POR_NOME[sem_acento(tipo_txt)] ||
               raise(Erro, "Linha #{linha}: tipo '#{tipo_txt}' inválido (use secretaria, subsecretaria, departamento, divisão ou equipe)")
      end
      sigla, nome = conteudo.split(/\s+[-–—]\s+/, 2).map(&:strip)
      if nome.nil? || nome.empty?
        raise Erro, "Linha #{linha}: escreva 'SIGLA - Nome' (ex.: SEMAGRIC - Secretaria de Agricultura)" if sigla.to_s.include?(" ")

        nome = sigla
      end
      raise Erro, "Linha #{linha}: falta a sigla" if sigla.to_s.empty?

      pilha.pop while pilha.any? && pilha.last[0] >= recuo
      nos << { "linha" => linha, "sigla" => sigla.upcase, "nome" => nome, "tipo" => tipo, "pai" => pilha.last&.dig(1) }
      pilha << [recuo, nos.size - 1]
      raise Erro, "No máximo #{ARVORE_MAX_LINHAS} unidades de uma vez" if nos.size > ARVORE_MAX_LINHAS
    end
    raise Erro, "Escreva a estrutura (uma unidade por linha)" if nos.empty?

    vistas = {}
    nos.each do |n|
      if (antes = vistas[n["sigla"]])
        raise Erro, "Linha #{n['linha']}: a sigla #{n['sigla']} já apareceu na linha #{antes}"
      end

      vistas[n["sigla"]] = n["linha"]
    end
    nos
  end

  # `dentro_de`: unidade onde ficam as linhas sem recuo (gestor criando dentro
  # da sua). `pode_reusar`: lambda(unidade) que diz se uma sigla existente pode
  # ser usada (o gestor só reaproveita unidades do seu escopo).
  def criar_arvore!(texto, dentro_de: nil, pode_reusar: nil)
    tabelas!
    nos = ler_arvore(texto)
    base = dentro_de && por_id!(dentro_de)
    ids = []
    criadas = 0
    reaproveitadas = []
    Database.transaction do
      existentes = Database.rows("SELECT id, sigla, tipo, pai_id FROM equipes WHERE sigla IS NOT NULL").to_h { |e| [e["sigla"].upcase, e] }
      tipos = []
      nos.each_with_index do |n, i|
        pai_id = n["pai"] ? ids[n["pai"]] : base&.dig("id")
        tipo_pai = n["pai"] ? tipos[n["pai"]] : base&.dig("tipo")
        if (ja = existentes[n["sigla"]])
          if pode_reusar && !pode_reusar.call(ja)
            raise Erro, "Linha #{n['linha']}: a sigla #{n['sigla']} já existe fora do seu alcance de gestão"
          end

          ids[i] = ja["id"]
          tipos[i] = ja["tipo"]
          reaproveitadas << n["sigla"]
          next
        end

        tipo = n["tipo"] || (tipo_pai ? Unidades::ABAIXO[tipo_pai] : "secretaria")
        begin
          ids[i] = criar!({ "sigla" => n["sigla"], "nome" => n["nome"], "tipo" => tipo, "pai_id" => pai_id })
        rescue Erro => e
          raise Erro, "Linha #{n['linha']} (#{n['sigla']}): #{e.message}"
        end
        tipos[i] = tipo
        existentes[n["sigla"]] = { "id" => ids[i], "sigla" => n["sigla"], "tipo" => tipo }
        criadas += 1
      end
    end
    { "criadas" => criadas, "reaproveitadas" => reaproveitadas, "raizes" => nos.each_index.select { |i| nos[i]["pai"].nil? }.map { |i| ids[i] }.uniq }
  end

  # A estrutura (ou uma parte dela) no mesmo formato de texto, para copiar e
  # usar de base numa nova (ex.: copiar a SEMEC e trocar as siglas).
  def texto_da_arvore(raiz_id = nil)
    tabelas!
    linhas = em_arvore(Database.rows("SELECT * FROM equipes ORDER BY lower(COALESCE(sigla, nome))"))
    if raiz_id
      lista = Unidades.todas
      dentro = Unidades.descendentes(raiz_id.to_i, Unidades.filhos(lista))
      linhas = linhas.select { |e, _| dentro.include?(e["id"]) }
    end
    base = linhas.map { |_, n| n }.min || 0
    linhas.map { |e, n| "#{'  ' * (n - base)}#{e['sigla'] || e['nome']} - #{e['nome']} | #{Unidades::NOMES_TIPO[e['tipo'] || 'equipe'].downcase}" }.join("\n")
  end

  # Em ordem de árvore (cada unidade logo depois da de cima): o recuo só
  # funciona assim. A lista MODELO está por nível, não por árvore.
  def modelo_texto
    filhos = MODELO.group_by { |_, _, _, pai| pai }
    linhas = []
    visitar = lambda do |pai, nivel|
      (filhos[pai] || []).each do |sigla, nome, tipo, _|
        linhas << "#{'  ' * nivel}#{sigla} - #{nome} | #{Unidades::NOMES_TIPO[tipo].downcase}"
        visitar.call(sigla, nivel + 1)
      end
    end
    visitar.call(nil, 0)
    linhas.join("\n")
  end

  def atualizar!(id, d)
    atual = por_id!(id)
    v = validar!(d, atual: atual)
    Database.execute(
      "UPDATE equipes SET nome = ?, descricao = ?, empresa = ?, exigir_cnpj = ?, cnpj_hash = ?, cnpj_mascara = ?, atualizado_em = ?,
       tipo = ?, sigla = ?, pai_id = ? WHERE id = ?",
      [v["nome"], v["descricao"], v["empresa"], v["exigir_cnpj"], v["cnpj_hash"], v["cnpj_mascara"], Database.now,
       v["tipo"], v["sigla"], v["pai_id"], atual["id"]]
    )
    por_id(atual["id"])
  end

  # Unidade com unidades dentro só é excluída com `cascata` (a árvore inteira
  # de uma vez, pedido explícito): sem isso o que está abaixo ficaria solto e as
  # permissões em cascata mudariam sem ninguém perceber. Devolve quantas saíram.
  def excluir!(id, cascata: false)
    e = por_id!(id)
    filhas = Database.rows("SELECT nome FROM equipes WHERE pai_id = ?", [e["id"]])
    if !filhas.empty? && !cascata
      raise Erro, "Antes, exclua ou mova as unidades de dentro de '#{e['nome']}': #{filhas.map { |f| f['nome'] }.first(5).join(', ')}"
    end

    lista = Unidades.todas
    todas = cascata ? Unidades.descendentes(e["id"], Unidades.filhos(lista)).to_a : [e["id"]]
    # As de baixo primeiro (mais longe da raiz), para nunca sobrar filha sem pai.
    por_id = lista.to_h { |u| [u["id"], u] }
    todas.sort_by! { |u| -Unidades.ancestrais(u, por_id).size }
    Database.transaction do
      todas.each { |u| Database.execute("DELETE FROM equipes WHERE id = ?", [u]) } # membros e compartilhamentos saem em cascata
    end
    todas.size
  end

  # Define exatamente quem está na unidade. `gestores`: ids (entre os membros,
  # ou acrescentados) que ficam com o papel de gestor.
  def definir_membros!(id, usuario_ids, gestores = nil)
    e = por_id!(id)
    ids = ids_validos!(usuario_ids)
    chefes = gestores.nil? ? papeis_atuais(e["id"]).select { |_, p| p == "gestor" }.keys : ids_validos!(gestores)
    ids |= chefes
    Database.transaction do
      Database.execute("DELETE FROM equipe_membros WHERE equipe_id = ?", [e["id"]])
      ids.each do |uid|
        Database.execute("INSERT INTO equipe_membros (equipe_id, usuario_id, criado_em, papel) VALUES (?, ?, ?, ?)",
                         [e["id"], uid, Database.now, chefes.include?(uid) ? "gestor" : "membro"])
      end
    end
  end

  def papeis_atuais(equipe_id)
    Database.rows("SELECT usuario_id, papel FROM equipe_membros WHERE equipe_id = ?", [equipe_id]).to_h { |r| [r["usuario_id"], r["papel"]] }
  end

  # Põe (ou muda o papel de) uma pessoa numa unidade.
  def definir_membro!(equipe_id, usuario_id, papel)
    raise Erro, "Papel inválido (use membro ou gestor)" unless Unidades::PAPEIS.include?(papel)

    e = por_id!(equipe_id)
    ids_validos!([usuario_id])
    Database.execute(
      "INSERT INTO equipe_membros (equipe_id, usuario_id, criado_em, papel) VALUES (?, ?, ?, ?)
       ON CONFLICT(equipe_id, usuario_id) DO UPDATE SET papel = excluded.papel",
      [e["id"], usuario_id.to_i, Database.now, papel]
    )
  end

  def remover_membro!(equipe_id, usuario_id)
    Database.alterar("DELETE FROM equipe_membros WHERE equipe_id = ? AND usuario_id = ?", [equipe_id.to_i, usuario_id.to_i])
  end

  # Define exatamente em quais unidades o usuário está. `gestor_de`: as que
  # ele gere (nil = mantém os papéis que já tinha nas que continuam).
  def definir_equipes_do_usuario!(usuario_id, equipe_ids, gestor_de = nil)
    ids = ids_de_equipes!(equipe_ids)
    chefe = gestor_de.nil? ? nil : ids_de_equipes!(gestor_de)
    ids |= chefe if chefe
    antes = Database.rows("SELECT equipe_id, papel FROM equipe_membros WHERE usuario_id = ?", [usuario_id.to_i])
                    .to_h { |r| [r["equipe_id"], r["papel"]] }
    Database.transaction do
      Database.execute("DELETE FROM equipe_membros WHERE usuario_id = ?", [usuario_id.to_i])
      ids.each do |eid|
        papel = chefe ? (chefe.include?(eid) ? "gestor" : "membro") : (antes[eid] || "membro")
        Database.execute("INSERT INTO equipe_membros (equipe_id, usuario_id, criado_em, papel) VALUES (?, ?, ?, ?)",
                         [eid, usuario_id.to_i, Database.now, papel])
      end
    end
  end

  # Confere a lista de unidades ANTES de gravar qualquer coisa (criar um
  # usuário com uma unidade inválida não pode deixar o usuário pela metade).
  def ids_de_equipes!(equipe_ids)
    tabelas!
    raise Erro, "'equipes' deve ser uma lista" unless equipe_ids.is_a?(Array)

    ids = equipe_ids.map(&:to_i).uniq
    existentes = ids.empty? ? [] : Database.rows("SELECT id FROM equipes").map { |r| r["id"] } & ids
    raise Erro, "Unidade inexistente na lista" if existentes.size != ids.size

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
