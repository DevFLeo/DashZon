require "sqlite3"
require "fileutils"
require "json"
require "monitor"
require "openssl"
require "securerandom"

# Camada de acesso ao SQLite. O arquivo do banco só é criado (com o schema
# genérico de módulos/registros) quando o usuário conclui o assistente de
# configuração inicial — antes disso `configured?` responde false sem tocar
# em disco.
#
# Modelo: cada módulo (vindo de um template JSON ou criado pelo usuário)
# guarda sua própria definição de campos em `modulos.schema`; os registros
# de todos os módulos ficam em `registros.dados` como JSON. Isso permite
# adicionar/alterar módulos sem migração de banco.
module Database
  SCHEMA_VERSION = 2

  DB_PATH = ENV.fetch("DASHZON_DB_PATH", File.expand_path("../../data/dashzon.db", __dir__))

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

    CREATE TABLE IF NOT EXISTS registros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      modulo_id INTEGER NOT NULL REFERENCES modulos(id) ON DELETE CASCADE,
      dados TEXT NOT NULL,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
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
        db
      end
    end
  end

  def self.fechar!
    LOCK.synchronize do
      @db&.close
      @db = nil
      @extras_ok = false
    end
  end

  def self.garantir_tabelas!
    LOCK.synchronize do
      next if @extras_ok

      connection.execute_batch(EXTRAS_SQL)
      migrar_usuarios!
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
    "atualizado_em" => "TEXT"
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

  def self.transaction(&block)
    LOCK.synchronize { connection.transaction(&block) }
  end

  def self.now
    Time.now.utc.iso8601
  end

  def self.user_version
    LOCK.synchronize { connection.get_first_value("PRAGMA user_version").to_i }
  end

  def self.configured?
    return false unless File.exist?(DB_PATH)
    return false if user_version < SCHEMA_VERSION

    !row("SELECT id FROM config WHERE id = 1").nil?
  rescue SQLite3::Exception
    false
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
      connection.execute_batch(SCHEMA)
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

  # Grava um JSON (template importado ou exportação). Um template idêntico a um
  # já salvo não é duplicado: devolve o id existente.
  def self.salvar_json!(tipo, nome, obj)
    garantir_tabelas!
    conteudo = JSON.generate(obj)
    if tipo == "template"
      existente = row("SELECT id FROM jsons WHERE tipo = ? AND conteudo = ?", [tipo, conteudo])
      return existente["id"] if existente
    end
    insert("INSERT INTO jsons (tipo, nome, conteudo, criado_em) VALUES (?, ?, ?, ?)", [tipo, nome.to_s, conteudo, now])
  end

  # Lista sem o conteúdo (que pode ser grande); use json_salvo para lê-lo.
  def self.jsons(tipo)
    garantir_tabelas!
    rows("SELECT id, tipo, nome, criado_em, LENGTH(conteudo) AS bytes FROM jsons WHERE tipo = ? ORDER BY id DESC", [tipo])
  end

  def self.json_salvo(id, tipo = nil)
    garantir_tabelas!
    r = row("SELECT * FROM jsons WHERE id = ?", [id.to_i])
    return nil unless r && (tipo.nil? || r["tipo"] == tipo)

    r.merge("conteudo" => JSON.parse(r["conteudo"]))
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

  # --- registros -------------------------------------------------------------

  # Registro "achatado" (id + metadados + campos de `dados` no mesmo nível),
  # formato usado tanto pela API quanto pelo motor C++.
  def self.registros(modulo_id)
    rows("SELECT * FROM registros WHERE modulo_id = ? ORDER BY criado_em DESC, id DESC", [modulo_id]).map do |r|
      flatten_registro(r)
    end
  end

  def self.registro(modulo_id, id)
    r = row("SELECT * FROM registros WHERE modulo_id = ? AND id = ?", [modulo_id, id])
    r && flatten_registro(r)
  end

  def self.flatten_registro(r)
    JSON.parse(r["dados"]).merge("id" => r["id"], "_criado_em" => r["criado_em"], "_atualizado_em" => r["atualizado_em"])
  end
end
