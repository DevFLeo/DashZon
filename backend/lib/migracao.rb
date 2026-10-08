require "sqlite3"
require "json"
require "date"
require "time"
require "fileutils"
require_relative "record_codec"

# Migração do banco da versão 2 para a 3, feita NO LUGAR (sem arquivar o banco
# nem perder dados).
#
#   v2: registros.dados = objeto JSON {"descricao":"Aluguel","data":"2025-11-20",...}
#       registros.criado_em / atualizado_em = texto ISO
#   v3: registros.dados = array posicional compacto (ver RecordCodec), com os
#       slots guardados em modulos.schema; criado_em / atualizado_em inteiros
#       (atualizado_em vazio enquanto nunca foi editado); índice nos widgets;
#       auto_vacuum incremental.
#
# Segurança dos dados do usuário:
#   1. Antes de mexer em qualquer coisa, grava uma cópia consistente do banco
#      (`dashzon.db.v2-AAAAMMDDHHMMSS.bak`, via VACUUM INTO). Se a cópia falhar,
#      nada é migrado.
#   2. A conversão inteira roda numa transação: ou migra tudo ou não muda nada.
#   3. Qualquer erro vira Migracao::Falha, que NÃO é tratado como "sistema não
#      configurado" (isso levaria ao setup, que arquivaria o banco do usuário).
#   4. É idempotente: banco que já está na v3 não é tocado.
#
# O que não converte (uma data inexistente como "2026-13-45", que o validador
# antigo aceitava; ou texto num campo numérico) vira vazio e é contado no
# resumo; o valor original continua na cópia de segurança.
module Migracao
  class Falha < StandardError; end

  VERSAO_ANTIGA = 2
  VERSAO_NOVA = 3

  module_function

  # `db` é a conexão SQLite aberta (com results_as_hash) e `caminho` o arquivo.
  # Devolve nil quando não havia o que migrar, ou um Hash com o resumo.
  def se_preciso!(db, caminho)
    return nil unless db.get_first_value("PRAGMA user_version").to_i == VERSAO_ANTIGA
    return nil unless tabela?(db, "registros")

    tamanho_antes = File.size(caminho)
    backup = copia_de_seguranca!(db, caminho)
    resumo = nil
    begin
      db.transaction(:immediate) do
        # Outro processo pode ter migrado enquanto esperávamos a trava.
        next unless db.get_first_value("PRAGMA user_version").to_i == VERSAO_ANTIGA

        resumo = converter!(db)
      end
    rescue StandardError => e
      raise Falha, "Não foi possível migrar o banco para a versão #{VERSAO_NOVA} (#{e.class}: #{e.message}). " \
                   "Nada foi alterado; a cópia de segurança está em #{backup}."
    end
    return nil unless resumo

    # Fora da transação: liga o auto_vacuum incremental e reescreve o arquivo
    # já enxuto. Se falhar, o banco já está migrado e funcionando.
    begin
      db.execute("PRAGMA auto_vacuum = INCREMENTAL")
      db.execute("VACUUM")
    rescue SQLite3::Exception
      resumo[:vacuum] = false
    end
    resumo.merge(backup: backup, bytes_antes: tamanho_antes, bytes_depois: File.size(caminho))
  end

  def tabela?(db, nome)
    !db.get_first_value("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [nome]).nil?
  end

  def copia_de_seguranca!(db, caminho)
    destino = "#{caminho}.v2-#{Time.now.strftime('%Y%m%d%H%M%S')}.bak"
    begin
      db.execute("VACUUM INTO '#{destino.gsub("'", "''")}'")
    rescue SQLite3::Exception
      # SQLite antigo (sem VACUUM INTO): cópia do arquivo, com o processo único
      # que usa o banco parado dentro desta chamada.
      FileUtils.rm_f(destino)
      FileUtils.cp(caminho, destino)
    end
    raise Falha, "A cópia de segurança ficou vazia (#{destino})." unless File.size?(destino)

    destino
  rescue SystemCallError, IOError => e
    raise Falha, "Não foi possível gravar a cópia de segurança antes de migrar (#{e.message}). Nada foi alterado."
  end

  def converter!(db)
    resumo = { registros: 0, modulos: 0, valores_descartados: 0, sem_modulo: 0 }
    infos = preparar_modulos!(db, resumo)

    db.execute_batch(<<~SQL)
      CREATE TABLE registros_v3 (
        id INTEGER PRIMARY KEY,
        modulo_id INTEGER NOT NULL REFERENCES modulos(id) ON DELETE CASCADE,
        dados TEXT NOT NULL,
        criado_em INTEGER NOT NULL,
        atualizado_em INTEGER
      );
    SQL
    inserir = db.prepare("INSERT INTO registros_v3 (id, modulo_id, dados, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?)")
    begin
      db.execute("SELECT id, modulo_id, dados, criado_em, atualizado_em FROM registros ORDER BY id") do |r|
        info = infos[r["modulo_id"]]
        if info.nil?
          resumo[:sem_modulo] += 1 # registro de módulo que não existe mais: não há onde colocá-lo
          next
        end
        criado = epoch(r["criado_em"])
        editado = r["atualizado_em"].nil? ? criado : epoch(r["atualizado_em"])
        inserir.execute(r["id"], r["modulo_id"], registro_v3(JSON.parse(r["dados"]), info, resumo), criado,
                        editado == criado ? nil : editado)
        resumo[:registros] += 1
      end
    ensure
      inserir.close
    end

    db.execute_batch(<<~SQL)
      DROP TABLE registros;
      ALTER TABLE registros_v3 RENAME TO registros;
      CREATE INDEX idx_registros_modulo ON registros(modulo_id);
      CREATE INDEX IF NOT EXISTS idx_widgets_dashboard ON widgets(dashboard_id);
    SQL
    db.execute("PRAGMA user_version = #{VERSAO_NOVA}")
    resumo
  end

  # Define os slots de cada módulo (campos atuais, na ordem em que estão) e
  # grava no schema. Chaves de campos que já foram removidos mas ainda têm
  # valores nos registros também ganham slot, para que esses valores não se
  # percam (o formato antigo os mantinha no JSON).
  def preparar_modulos!(db, resumo)
    db.execute("SELECT id, schema FROM modulos").to_h do |m|
      schema = JSON.parse(m["schema"])
      campos = schema.fetch("campos")
      slots = {}
      campos.each_with_index { |c, i| slots[c["id"]] = i }
      db.execute("SELECT dados FROM registros WHERE modulo_id = ?", [m["id"]]) do |r|
        JSON.parse(r["dados"]).each_key { |chave| slots[chave] ||= slots.size }
      end
      schema["slots"] = slots
      db.execute("UPDATE modulos SET schema = ? WHERE id = ?", [JSON.generate(schema), m["id"]])
      resumo[:modulos] += 1
      [m["id"], { slots: slots, tipos: campos.to_h { |c| [c["id"], c["tipo"]] } }]
    end
  end

  def registro_v3(obj, info, resumo)
    raise "registro que não é um objeto JSON" unless obj.is_a?(Hash)

    arr = []
    obj.each do |chave, valor|
      tipo = info[:tipos][chave]
      arr[info[:slots].fetch(chave)] = tipo ? valor_v3(tipo, valor, resumo) : valor
    end
    arr.pop while !arr.empty? && arr.last.nil?
    JSON.generate(arr)
  end

  # Valor como o formato antigo guardava -> valor como o compacto guarda.
  def valor_v3(tipo, v, resumo)
    return nil if v.nil? || (v.is_a?(String) && v.strip.empty?)

    convertido =
      case tipo
      when "booleano" then [true, "true", 1, "1"].include?(v) ? 1 : 0
      when "movimento" then RecordCodec::MOVIMENTO.index(v.to_s)
      when "data" then dias(v)
      when "numero", "moeda" then numero(v)
      else v
      end
    resumo[:valores_descartados] += 1 if convertido.nil?
    convertido
  end

  def dias(v)
    Date.strptime(v.to_s[0, 10], "%Y-%m-%d").jd - RecordCodec::EPOCH_JD
  rescue Date::Error
    nil
  end

  def numero(v)
    n = v.is_a?(Numeric) ? v.to_f : Float(v.to_s.strip)
    return nil unless n.finite?

    n.abs < RecordCodec::INTEIRO_MAX && n == n.to_i ? n.to_i : n
  rescue ArgumentError
    nil
  end

  def epoch(texto)
    Time.iso8601(texto.to_s).to_i
  rescue ArgumentError
    begin
      Time.parse(texto.to_s).to_i
    rescue ArgumentError
      0
    end
  end
end
