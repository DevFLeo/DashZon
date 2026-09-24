require "sqlite3"
require "fileutils"
require "json"
require "monitor"

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
