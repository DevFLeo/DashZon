require "sqlite3"
require "fileutils"

# Camada de acesso ao SQLite. O arquivo do banco só é criado (com o schema
# default de tabelas) quando o usuário conclui o assistente de configuração
# inicial (Database.setup!) — antes disso `configured?` responde false sem
# tocar em disco.
module Database
  DB_DIR = File.expand_path("../../data", __dir__)
  DB_PATH = File.join(DB_DIR, "dashzon.db")

  SCHEMA = <<~SQL
    CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      org_name TEXT NOT NULL,
      moeda TEXT NOT NULL DEFAULT 'BRL',
      meta_mensal REAL NOT NULL DEFAULT 0,
      configured_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS demandas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      descricao TEXT,
      status TEXT NOT NULL DEFAULT 'backlog',
      etapa_fluxo TEXT NOT NULL DEFAULT 'entrada',
      responsavel TEXT,
      prioridade TEXT NOT NULL DEFAULT 'media',
      valor REAL DEFAULT 0,
      prazo TEXT,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fluxo_caixa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL CHECK (tipo IN ('entrada','saida')),
      categoria TEXT NOT NULL DEFAULT '(sem categoria)',
      descricao TEXT,
      valor REAL NOT NULL DEFAULT 0,
      data TEXT NOT NULL,
      criado_em TEXT NOT NULL
    );

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
      tabela TEXT NOT NULL,
      campo TEXT,
      agregacao TEXT NOT NULL DEFAULT 'count',
      agrupar_por TEXT,
      x INTEGER NOT NULL DEFAULT 0,
      y INTEGER NOT NULL DEFAULT 0,
      w INTEGER NOT NULL DEFAULT 4,
      h INTEGER NOT NULL DEFAULT 3
    );
  SQL

  def self.connection
    Thread.current[:dashzon_db] ||= begin
      FileUtils.mkdir_p(DB_DIR)
      db = SQLite3::Database.new(DB_PATH)
      db.results_as_hash = true
      db.execute("PRAGMA foreign_keys = ON")
      db
    end
  end

  # Executa um SELECT e devolve só as chaves-nome (o driver sqlite3 duplica
  # cada coluna com uma chave inteira posicional; isso limpa esse ruído antes
  # de virar JSON).
  def self.rows(sql, params = [])
    connection.execute(sql, params).map { |row| row.reject { |k, _| k.is_a?(Integer) } }
  end

  def self.row(sql, params = [])
    rows(sql, params).first
  end

  def self.configured?
    return false unless File.exist?(DB_PATH)

    !row("SELECT id FROM config WHERE id = 1").nil?
  rescue SQLite3::Exception
    false
  end

  def self.config
    row("SELECT * FROM config WHERE id = 1")
  end

  def self.setup!(org_name:, moeda:, meta_mensal:)
    connection.execute_batch(SCHEMA)
    now = Time.now.utc.iso8601
    connection.execute(
      "INSERT INTO config (id, org_name, moeda, meta_mensal, configured_at) VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET org_name = excluded.org_name, moeda = excluded.moeda, meta_mensal = excluded.meta_mensal",
      [org_name, moeda, meta_mensal, now]
    )
    return unless rows("SELECT id FROM dashboards").empty?

    connection.execute("INSERT INTO dashboards (nome, criado_em, atualizado_em) VALUES (?, ?, ?)", ["Visão Geral", now, now])
  end
end
