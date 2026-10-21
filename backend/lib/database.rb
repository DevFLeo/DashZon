require "sqlite3"
require "fileutils"
require "json"
require "monitor"
require "time"
require_relative "ambiente"
require_relative "record_codec"
require_relative "json_guardado"
require_relative "module_schema"
require_relative "migracao"
require "openssl"
require "securerandom"

# Camada de acesso ao SQLite. O arquivo do banco só é criado (com o schema
# genérico de módulos/registros) quando o usuário conclui o assistente de
# configuração inicial — antes disso `configured?` responde false sem tocar
# em disco.
#
# Modelo: cada módulo (vindo de um template JSON ou criado pelo usuário)
# guarda sua própria definição de campos em `modulos.schema`; os registros
# de todos os módulos ficam em `registros.dados`, num array JSON compacto
# (ver RecordCodec). Isso permite adicionar/alterar módulos sem migração de
# banco e ocupa bem menos espaço que um objeto JSON por registro.
#
# Versões do schema: 2 = registros em objeto JSON com datas em texto; 3 = formato
# compacto (lib/migracao.rb converte um banco v2 no lugar, com backup antes).
module Database
  SCHEMA_VERSION = 3

  DB_PATH = Ambiente["DASHZON_DB_PATH", File.expand_path("../../data/dashzon.db", __dir__)]

  SCHEMA = <<~SQL
    CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      org_name TEXT NOT NULL,
      moeda TEXT NOT NULL DEFAULT 'BRL',
      configured_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS modulos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL,
      descricao TEXT,
      icone TEXT,
      schema TEXT NOT NULL,
      template_origem TEXT,
      ordem INTEGER NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL
    );

    -- criado_em/atualizado_em são inteiros (epoch, segundos UTC); atualizado_em
    -- fica NULL enquanto o registro nunca foi editado. A API devolve os dois
    -- como texto ISO (_criado_em/_atualizado_em), como sempre.
    CREATE TABLE IF NOT EXISTS registros (
      id INTEGER PRIMARY KEY,
      modulo_id INTEGER NOT NULL REFERENCES modulos(id) ON DELETE CASCADE,
      dados TEXT NOT NULL,
      criado_em INTEGER NOT NULL,
      atualizado_em INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_registros_modulo ON registros(modulo_id);

    CREATE TABLE IF NOT EXISTS dashboards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS widgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dashboard_id INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
      titulo TEXT NOT NULL,
      tipo TEXT NOT NULL,
      modulo_slug TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      x INTEGER NOT NULL DEFAULT 0,
      y INTEGER NOT NULL DEFAULT 0,
      w INTEGER NOT NULL DEFAULT 4,
      h INTEGER NOT NULL DEFAULT 3
    );
    CREATE INDEX IF NOT EXISTS idx_widgets_dashboard ON widgets(dashboard_id);
  SQL

  # Tabelas fora do SCHEMA principal: são criadas sob demanda, então bancos
  # já existentes as ganham sem precisar de migração/versão nova.
  #  - usuarios: login simulado.
  #  - jsons: JSON do usuário (templates importados e exportações/backups).
  #    Os templates padrão continuam em backend/templates/*.json, no git.
  #  - tokens: links de uso único (redefinir senha, verificar e-mail); só o
  #    hash do token é gravado.
  #  - ajustes: preferências do painel do administrador (chave/valor).
  EXTRAS_SQL = <<~SQL
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      sal TEXT NOT NULL,
      criado_em TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL CHECK (tipo IN ('redefinir_senha', 'verificar_email')),
      token_hash TEXT NOT NULL UNIQUE,
      dado TEXT,
      expira_em TEXT NOT NULL,
      usado_em TEXT,
      criado_em TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ajustes (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jsons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL CHECK (tipo IN ('template', 'exportacao')),
      nome TEXT NOT NULL,
      conteudo TEXT NOT NULL,
      criado_em TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jsons_tipo ON jsons(tipo);

    -- Diário de segurança (lib/seguranca.rb): logins, falhas, bloqueios.
    -- `conta` é o HMAC do login digitado, nunca o texto.
    CREATE TABLE IF NOT EXISTS eventos_seguranca (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quando INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      ip TEXT,
      conta TEXT,
      usuario_id INTEGER,
      detalhe TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_eventos_ip ON eventos_seguranca(ip, quando);
    CREATE INDEX IF NOT EXISTS idx_eventos_conta ON eventos_seguranca(conta, quando);
    CREATE INDEX IF NOT EXISTS idx_eventos_quando ON eventos_seguranca(quando);

    -- Equipes (grupos de usuários; podem ser uma empresa, com CNPJ). Um usuário
    -- pode estar em nenhuma, uma ou várias (equipe_membros). CNPJ só em hash +
    -- máscara, como o CPF/CNPJ das contas. Ver lib/equipes.rb.
    CREATE TABLE IF NOT EXISTS equipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      descricao TEXT,
      empresa INTEGER NOT NULL DEFAULT 0,
      exigir_cnpj INTEGER NOT NULL DEFAULT 0,
      cnpj_hash TEXT,
      cnpj_mascara TEXT,
      teste INTEGER NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS equipe_membros (
      equipe_id INTEGER NOT NULL REFERENCES equipes(id) ON DELETE CASCADE,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      criado_em TEXT NOT NULL,
      PRIMARY KEY (equipe_id, usuario_id)
    );
    CREATE INDEX IF NOT EXISTS idx_equipe_membros_usuario ON equipe_membros(usuario_id);

    -- Registros de exemplo que vieram com um template ("com dados de exemplo").
    -- Apagar um dashboard pode levar junto os exemplos dos módulos dele; editar
    -- um exemplo tira a marca (passa a ser um dado de verdade).
    CREATE TABLE IF NOT EXISTS registros_exemplo (
      registro_id INTEGER PRIMARY KEY REFERENCES registros(id) ON DELETE CASCADE,
      modulo_id INTEGER NOT NULL REFERENCES modulos(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_registros_exemplo_modulo ON registros_exemplo(modulo_id);

    -- Compartilhar com equipes escolhidas (visibilidade "equipes"): o
    -- dashboard ou módulo aparece para os membros delas. Ver lib/acesso.rb.
    CREATE TABLE IF NOT EXISTS dashboard_equipes (
      dashboard_id INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
      equipe_id INTEGER NOT NULL REFERENCES equipes(id) ON DELETE CASCADE,
      PRIMARY KEY (dashboard_id, equipe_id)
    );
    CREATE TABLE IF NOT EXISTS modulo_equipes (
      modulo_id INTEGER NOT NULL REFERENCES modulos(id) ON DELETE CASCADE,
      equipe_id INTEGER NOT NULL REFERENCES equipes(id) ON DELETE CASCADE,
      PRIMARY KEY (modulo_id, equipe_id)
    );

    -- Pedidos de quem tem o perfil "visualizador": criar, alterar ou excluir
    -- um registro só vale depois que o dono do módulo (ou um admin) aprova.
    -- `dados` e `antes` em JSON (formato da API). Ver lib/solicitacoes.rb.
    CREATE TABLE IF NOT EXISTS solicitacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      modulo_id INTEGER NOT NULL REFERENCES modulos(id) ON DELETE CASCADE,
      registro_id INTEGER,
      acao TEXT NOT NULL,
      dados TEXT,
      antes TEXT,
      solicitante_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pendente',
      motivo TEXT,
      revisor_id INTEGER,
      criado_em TEXT NOT NULL,
      decidido_em TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_solicitacoes_status ON solicitacoes(status, modulo_id);
  SQL

  # Uma única conexão para o processo, serializada por um Monitor (reentrante,
  # para que execute/insert funcionem dentro de transaction). O WEBrick atende
  # cada requisição numa thread nova; conexões por thread ficariam abertas e
  # travariam o arquivo no Windows.
  LOCK = Monitor.new

  def self.connection
    LOCK.synchronize do
      @db ||= begin
        FileUtils.mkdir_p(File.dirname(DB_PATH))
        db = SQLite3::Database.new(DB_PATH)
        db.results_as_hash = true
        db.busy_timeout = 3000
        db.execute("PRAGMA foreign_keys = ON")
        # Só ajustes de velocidade. O modo WAL fica DESLIGADO de propósito: o
        # backup copia apenas o dashzon.db (ver CLAUDE.md).
        db.execute("PRAGMA temp_store = MEMORY")
        db.execute("PRAGMA cache_size = -16384")    # 16 MB de cache de páginas
        db.execute("PRAGMA mmap_size = 134217728")  # leitura mapeada em memória (até 128 MB)
        db
      end
    end
  end

  def self.fechar!
    LOCK.synchronize do
      @db&.close
      @db = nil
      @extras_ok = false
      @migrado = false
      @falha_migracao = nil
      @transacao_aberta = false
      @geracao = (@geracao || 0) + 1
    end
  end

  # Muda sempre que o banco muda: gravações desta conexão (total_changes),
  # de qualquer outra conexão/processo (PRAGMA data_version) ou troca da
  # própria conexão (geração). Usada pelo CacheResultados (lib/desempenho.rb).
  def self.versao_dados
    LOCK.synchronize do
      "#{@geracao || 0}:#{connection.get_first_value('PRAGMA data_version')}:#{connection.total_changes}"
    end
  end

  def self.garantir_tabelas!
    LOCK.synchronize do
      next if @extras_ok

      sem_exemplos = connection.get_first_value("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'registros_exemplo'").to_i.zero?
      connection.execute_batch(EXTRAS_SQL)
      migrar_usuarios!
      migrar_dashboards!
      migrar_modulos!
      marcar_exemplos_antigos! if sem_exemplos
      @extras_ok = true
    end
  end

  # Colunas acrescentadas depois que a tabela `usuarios` já existia. SQLite não
  # tem "ADD COLUMN IF NOT EXISTS", então compara com o PRAGMA table_info.
  COLUNAS_USUARIO = {
    "nome" => "TEXT",
    "email" => "TEXT",
    "email_verificado_em" => "TEXT",
    "documento_tipo" => "TEXT",
    "documento_hash" => "TEXT",
    "documento_mascara" => "TEXT",
    "cargo" => "TEXT",
    "perfil" => "TEXT NOT NULL DEFAULT 'usuario'",
    "ativo" => "INTEGER NOT NULL DEFAULT 1",
    "deve_trocar_senha" => "INTEGER NOT NULL DEFAULT 0",
    "sessao_versao" => "INTEGER NOT NULL DEFAULT 1",
    "ultimo_login_em" => "TEXT",
    "atualizado_em" => "TEXT",
    "preferencias" => "TEXT" # JSON: tema, página inicial, privacidade (ver Usuarios::PREFERENCIAS_PADRAO)
  }.freeze

  def self.migrar_usuarios!
    existentes = connection.execute("PRAGMA table_info(usuarios)").map { |c| c["name"] || c[1] }
    COLUNAS_USUARIO.each do |col, tipo|
      connection.execute("ALTER TABLE usuarios ADD COLUMN #{col} #{tipo}") unless existentes.include?(col)
    end
    # Banco com usuários mas sem nenhum administrador (criado antes dos perfis):
    # o primeiro usuário vira administrador, para ninguém ficar trancado fora.
    sem_admin = connection.get_first_value("SELECT COUNT(*) FROM usuarios WHERE perfil = 'admin'").to_i.zero?
    if sem_admin
      connection.execute("UPDATE usuarios SET perfil = 'admin' WHERE id = (SELECT MIN(id) FROM usuarios)")
    end
  end

  # Dashboards com dono (antes eram todos de todo mundo):
  #  - dono_id: quem criou; só o dono (ou um admin, se for da equipe) edita;
  #  - visibilidade: "privado" (só o dono vê) ou "equipe" (todos veem);
  #  - fixo: 1 = layout travado (os cards não se movem nem mudam de tamanho).
  # Dashboards que já existiam não têm dono conhecido: viram "equipe" (ninguém
  # perde o acesso que tinha) e passam a ser do primeiro administrador, que
  # pode transferi-los para quem os criou ou torná-los privados.
  COLUNAS_DASHBOARD = {
    "dono_id" => "INTEGER",
    "visibilidade" => "TEXT NOT NULL DEFAULT 'equipe'",
    "fixo" => "INTEGER NOT NULL DEFAULT 0"
  }.freeze

  def self.migrar_dashboards!
    existentes = connection.execute("PRAGMA table_info(dashboards)").map { |c| c["name"] || c[1] }
    return if existentes.empty? # tabela ainda não criada (antes do setup)

    COLUNAS_DASHBOARD.each do |col, tipo|
      connection.execute("ALTER TABLE dashboards ADD COLUMN #{col} #{tipo}") unless existentes.include?(col)
    end
    connection.execute(<<~SQL)
      UPDATE dashboards SET dono_id = (SELECT MIN(id) FROM usuarios WHERE perfil = 'admin' AND ativo = 1)
      WHERE dono_id IS NULL OR dono_id NOT IN (SELECT id FROM usuarios)
    SQL
  end

  # Módulos ganharam dono e visibilidade (todos, privado, equipes). Os que já
  # existiam ficam "todos", do primeiro administrador: ninguém perde acesso.
  COLUNAS_MODULO = {
    "dono_id" => "INTEGER",
    "visibilidade" => "TEXT NOT NULL DEFAULT 'todos'"
  }.freeze

  def self.migrar_modulos!
    existentes = connection.execute("PRAGMA table_info(modulos)").map { |c| c["name"] || c[1] }
    return if existentes.empty? # antes do setup

    COLUNAS_MODULO.each do |col, tipo|
      connection.execute("ALTER TABLE modulos ADD COLUMN #{col} #{tipo}") unless existentes.include?(col)
    end
    connection.execute(<<~SQL)
      UPDATE modulos SET dono_id = (SELECT MIN(id) FROM usuarios WHERE perfil = 'admin' AND ativo = 1)
      WHERE dono_id IS NULL OR dono_id NOT IN (SELECT id FROM usuarios)
    SQL
  end

  def self.modulo_por_id(id)
    m = row("SELECT * FROM modulos WHERE id = ?", [id.to_i])
    m && decode_modulo(m)
  end

  # Dashboards que `usuario_id` vê: os dele e os da equipe, com o nome do dono.
  # nil = todos (uso interno, ex.: setup).
  def self.dashboards_visiveis(usuario_id)
    garantir_tabelas!
    if usuario_id.nil?
      return rows("SELECT d.*, u.nome AS dono_nome, u.login AS dono_login FROM dashboards d
                   LEFT JOIN usuarios u ON u.id = d.dono_id ORDER BY d.id")
    end

    rows("SELECT d.*, u.nome AS dono_nome, u.login AS dono_login FROM dashboards d
          LEFT JOIN usuarios u ON u.id = d.dono_id
          WHERE d.visibilidade = 'equipe' OR d.dono_id = ? ORDER BY d.id", [usuario_id.to_i])
  end

  # O driver sqlite3 duplica cada coluna com uma chave inteira posicional;
  # isso limpa esse ruído antes de virar JSON.
  def self.rows(sql, params = [])
    LOCK.synchronize do
      connection.execute(sql, params).map { |row| row.reject { |k, _| k.is_a?(Integer) } }
    end
  end

  def self.row(sql, params = [])
    rows(sql, params).first
  end

  def self.execute(sql, params = [])
    LOCK.synchronize { connection.execute(sql, params) }
  end

  def self.insert(sql, params = [])
    LOCK.synchronize do
      connection.execute(sql, params)
      connection.last_insert_row_id
    end
  end

  # Escrita que devolve quantas linhas foram afetadas (0 = não achou).
  def self.alterar(sql, params = [])
    LOCK.synchronize do
      connection.execute(sql, params)
      connection.changes
    end
  end

  # Reentrante: chamar `transaction` dentro de outra reaproveita a de fora (o
  # SQLite não aceita BEGIN dentro de uma transação).
  def self.transaction(&block)
    LOCK.synchronize do
      next block.call if @transacao_aberta

      @transacao_aberta = true
      begin
        connection.transaction(&block)
      ensure
        @transacao_aberta = false
      end
    end
  end

  def self.now
    Time.now.utc.iso8601
  end

  # Hora como inteiro (epoch, segundos): é assim que `registros` guarda as datas.
  def self.agora_i
    Time.now.to_i
  end

  def self.user_version
    LOCK.synchronize { connection.get_first_value("PRAGMA user_version").to_i }
  end

  def self.configured?
    return false unless File.exist?(DB_PATH)

    migrar_se_preciso!
    return false if user_version < SCHEMA_VERSION

    !row("SELECT id FROM config WHERE id = 1").nil?
  rescue SQLite3::Exception
    false
  end

  # Banco da versão 2 é convertido no lugar (lib/migracao.rb), ANTES de qualquer
  # outra coisa: assim ele nunca é confundido com "banco antigo" e arquivado
  # pelo setup. Se a migração falhar, Migracao::Falha sobe até o usuário em vez
  # de o sistema se declarar "não configurado".
  def self.migrar_se_preciso!
    return if @migrado

    LOCK.synchronize do
      next if @migrado

      # Falhou antes? Não tenta de novo a cada requisição (cada tentativa grava
      # outra cópia do banco): o erro volta até o servidor ser reiniciado.
      raise @falha_migracao if @falha_migracao

      begin
        resumo = Migracao.se_preciso!(connection, DB_PATH)
      rescue Migracao::Falha => e
        @falha_migracao = e
        raise
      end
      @migrado = true
      next unless resumo

      warn "[DashZon] Banco migrado da versão 2 para a 3: #{resumo[:registros]} registros em #{resumo[:modulos]} módulos, " \
           "#{resumo[:bytes_antes] / 1024} KB -> #{resumo[:bytes_depois] / 1024} KB. " \
           "Cópia de segurança do banco antigo: #{resumo[:backup]}" \
           "#{resumo[:valores_descartados].positive? ? " (#{resumo[:valores_descartados]} valores inválidos viraram vazio)" : ''}" \
           "#{resumo[:jsons_comprimidos].positive? ? " #{resumo[:jsons_comprimidos]} JSON(s) guardado(s) (exportações/templates) comprimido(s)." : ''}"
    end
  end

  def self.config
    row("SELECT * FROM config WHERE id = 1")
  end

  # Um banco de uma versão anterior do schema não é migrado: é renomeado para
  # um .bak ao lado (nada é apagado) e o setup cria um banco novo.
  def self.arquivar_versao_antiga!
    LOCK.synchronize do
      return unless File.exist?(DB_PATH)
      return if user_version >= SCHEMA_VERSION

      fechar!
      File.rename(DB_PATH, "#{DB_PATH}.#{Time.now.strftime('%Y%m%d%H%M%S')}.bak")
    end
  end

  def self.create_schema!(org_name:, moeda:)
    LOCK.synchronize do
      # Num banco novo, o auto_vacuum incremental precisa ser definido antes da
      # primeira tabela: depois, o espaço de dados apagados pode ser devolvido
      # ao disco (compactar!) sem reescrever o arquivo inteiro.
      if connection.get_first_value("SELECT COUNT(*) FROM sqlite_master").to_i.zero?
        connection.execute("PRAGMA auto_vacuum = INCREMENTAL")
      end
      connection.execute_batch(SCHEMA)
      @migrado = true
      @extras_ok = false # colunas/tabelas extras sobre o schema recém-criado
      connection.execute("PRAGMA user_version = #{SCHEMA_VERSION}")
      execute(
        "INSERT INTO config (id, org_name, moeda, configured_at) VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET org_name = excluded.org_name, moeda = excluded.moeda",
        [org_name, moeda, now]
      )
    end
  end

  # Usuários, senhas e tokens ficam em lib/usuarios.rb (módulo Usuarios).

  def self.atualizar_config!(org_name:, moeda:)
    execute("UPDATE config SET org_name = ?, moeda = ? WHERE id = 1", [org_name, moeda])
  end

  # --- JSON do usuário ----------------------------------------------------------

  # Grava um JSON (template importado ou exportação), comprimido (ver
  # JsonGuardado). Um template idêntico a um já salvo não é duplicado: devolve o
  # id existente. A comparação é feita sobre o texto descomprimido, então vale
  # tanto para linhas novas quanto para as antigas em texto puro.
  def self.salvar_json!(tipo, nome, obj)
    garantir_tabelas!
    texto = JSON.generate(obj)
    if tipo == "template"
      existente = rows("SELECT id, conteudo FROM jsons WHERE tipo = 'template'").find { |r| JsonGuardado.texto(r["conteudo"]) == texto }
      return existente["id"] if existente
    end
    insert("INSERT INTO jsons (tipo, nome, conteudo, criado_em) VALUES (?, ?, ?, ?)",
           [tipo, nome.to_s, JsonGuardado.comprimir_texto(texto), now])
  end

  # Lista sem o conteúdo (que pode ser grande); use json_salvo para lê-lo.
  # `bytes` é o tamanho ocupado no banco (comprimido).
  def self.jsons(tipo)
    garantir_tabelas!
    rows("SELECT id, tipo, nome, criado_em, LENGTH(CAST(conteudo AS BLOB)) AS bytes FROM jsons WHERE tipo = ? ORDER BY id DESC", [tipo])
  end

  def self.json_salvo(id, tipo = nil)
    garantir_tabelas!
    r = row("SELECT * FROM jsons WHERE id = ?", [id.to_i])
    return nil unless r && (tipo.nil? || r["tipo"] == tipo)

    r.merge("conteudo" => JsonGuardado.decodificar(r["conteudo"]))
  end

  def self.excluir_json!(id)
    garantir_tabelas!
    execute("DELETE FROM jsons WHERE id = ?", [id.to_i])
  end

  # --- módulos ---------------------------------------------------------------

  def self.modulos
    rows("SELECT * FROM modulos ORDER BY ordem, id").map { |m| decode_modulo(m) }
  end

  def self.modulo(slug)
    m = row("SELECT * FROM modulos WHERE slug = ?", [slug])
    m && decode_modulo(m)
  end

  def self.decode_modulo(m)
    m.merge("schema" => JSON.parse(m["schema"]))
  end

  # Nomes de módulo são únicos sem diferenciar maiúsculas/espaços. A comparação
  # é feita em Ruby porque o lower() do SQLite não trata acentos (Ç, Ã...).
  def self.modulo_por_nome(nome, exceto_id: nil)
    alvo = nome.to_s.strip.downcase
    modulos.find { |m| m["nome"].to_s.strip.downcase == alvo && m["id"] != exceto_id }
  end

  def self.slug_taken?(slug)
    !row("SELECT id FROM modulos WHERE slug = ?", [slug]).nil?
  end

  # Devolve ao sistema operacional o espaço livre deixado por dados apagados
  # (por exemplo, depois de excluir um módulo grande). Sem WAL, o arquivo
  # encolhe na hora.
  def self.compactar!
    LOCK.synchronize { connection.execute("PRAGMA incremental_vacuum") }
  end

  # --- registros -------------------------------------------------------------
  # `modulo` é o hash devolvido por `modulo(slug)` (precisa do id e do schema,
  # que diz em que posição do array cada campo está).

  # Registros "achatados" (id + metadados + campos no mesmo nível), formato
  # usado tanto pela API quanto pelo motor C++, do mais novo para o mais
  # antigo (ordenar pelo id usa o índice, sem passo de ordenação).
  #
  # `campos` (lista de ids) limita o que é lido de cada registro, e `meta: false`
  # tira os carimbos de data: para somar ou agrupar basta mandar ao motor os
  # campos da consulta, não a linha toda. Os valores são os mesmos.
  def self.registros(modulo, campos: nil, meta: true)
    plano = RecordCodec.plano(modulo["schema"], campos)
    linhas = LOCK.synchronize do
      connection.execute(
        "SELECT id, dados, criado_em, atualizado_em FROM registros WHERE modulo_id = ? ORDER BY id DESC", [modulo["id"]]
      )
    end
    linhas.map { |r| achatar(plano, r, meta) }
  end

  def self.registro(modulo, id)
    r = row("SELECT id, dados, criado_em, atualizado_em FROM registros WHERE modulo_id = ? AND id = ?", [modulo["id"], id])
    r && achatar(RecordCodec.plano(modulo["schema"]), r, true)
  end

  # Bancos de antes da marcação: os exemplos instalados com um template são
  # os registros nunca editados criados no mesmo instante que o módulo
  # (TemplateRegistry.install! grava tudo com o mesmo relógio). Roda uma vez,
  # quando a tabela registros_exemplo nasce.
  def self.marcar_exemplos_antigos!
    return if connection.get_first_value("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'registros'").to_i.zero?

    rows("SELECT id, criado_em FROM modulos WHERE COALESCE(template_origem, '') <> ''").each do |m|
      criado = Time.iso8601(m["criado_em"].to_s).to_i rescue next
      rows("SELECT id FROM registros WHERE modulo_id = ? AND atualizado_em IS NULL AND criado_em BETWEEN ? AND ?",
           [m["id"], criado - 5, criado + 5]).each do |r|
        execute("INSERT OR IGNORE INTO registros_exemplo (registro_id, modulo_id) VALUES (?, ?)", [r["id"], m["id"]])
      end
    end
  end

  def self.marcar_exemplo!(modulo_id, registro_id)
    garantir_tabelas!
    execute("INSERT OR IGNORE INTO registros_exemplo (registro_id, modulo_id) VALUES (?, ?)", [registro_id, modulo_id])
  end

  # { modulo_id => quantos exemplos ainda existem }
  def self.exemplos_por_modulo
    garantir_tabelas!
    rows("SELECT modulo_id, COUNT(*) AS n FROM registros_exemplo GROUP BY modulo_id").to_h { |r| [r["modulo_id"], r["n"]] }
  end

  # Apaga os registros de exemplo de um módulo; devolve quantos.
  def self.apagar_exemplos!(modulo_id)
    garantir_tabelas!
    transaction do
      n = alterar("DELETE FROM registros WHERE modulo_id = ? AND id IN (SELECT registro_id FROM registros_exemplo WHERE modulo_id = ?)",
                  [modulo_id, modulo_id])
      execute("DELETE FROM registros_exemplo WHERE modulo_id = ?", [modulo_id])
      n
    end
  end

  def self.inserir_registro(modulo, dados, agora = agora_i)
    insert("INSERT INTO registros (modulo_id, dados, criado_em) VALUES (?, ?, ?)",
           [modulo["id"], RecordCodec.pack(modulo["schema"], dados), agora])
  end

  # Devolve false se o registro não existe.
  def self.atualizar_registro(modulo, id, dados)
    garantir_tabelas!
    execute("DELETE FROM registros_exemplo WHERE registro_id = ?", [id]) # editado: deixa de ser exemplo
    alterar("UPDATE registros SET dados = ?, atualizado_em = ? WHERE id = ? AND modulo_id = ?",
            [RecordCodec.pack(modulo["schema"], dados), agora_i, id, modulo["id"]]).positive?
  end

  def self.remover_registro(modulo, id)
    alterar("DELETE FROM registros WHERE id = ? AND modulo_id = ?", [id, modulo["id"]]).positive?
  end

  # Quando a edição de um módulo troca o TIPO de um campo que já existia, os
  # valores gravados (codificados para o tipo antigo) são convertidos para o
  # novo, no que for possível: o que não converte vira vazio. Sem mudança de
  # tipo, não toca em nenhum registro. Rode dentro da mesma transação que
  # grava o schema novo.
  def self.reconverter_registros!(modulo_id, antigo, novo)
    tipos_antigos = antigo["campos"].to_h { |c| [c["id"], c["tipo"]] }
    mudancas = novo["campos"].filter_map do |c|
      antes = tipos_antigos[c["id"]]
      next if antes.nil? || antes == c["tipo"]

      converter = lambda do |valor|
        ModuleSchema.coerce_valor(c, valor)
      rescue ModuleSchema::Error
        nil
      end
      [novo["slots"].fetch(c["id"]), antes, c["tipo"], converter]
    end
    return if mudancas.empty?

    transaction do
      rows("SELECT id, dados FROM registros WHERE modulo_id = ?", [modulo_id]).each do |r|
        execute("UPDATE registros SET dados = ? WHERE id = ?", [RecordCodec.converter_tipos(r["dados"], mudancas), r["id"]])
      end
    end
  end

  def self.achatar(plano, r, meta)
    h = RecordCodec.unpack(plano, r["dados"])
    h["id"] = r["id"]
    if meta
      h["_criado_em"] = iso(r["criado_em"])
      h["_atualizado_em"] = iso(r["atualizado_em"] || r["criado_em"])
    end
    h
  end

  # Epoch -> texto ISO 8601 (o formato que a API sempre devolveu). Muitos
  # registros compartilham o mesmo segundo, então o texto é calculado uma vez.
  def self.iso(epoch)
    @isos ||= {}
    @isos.clear if @isos.size > 50_000
    @isos[epoch] ||= Time.at(epoch).utc.iso8601
  end
end
