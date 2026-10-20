require "open3"
require "rbconfig"
require_relative "test_helper"

# Migração automática do banco v2 (registros em objeto JSON, datas em texto)
# para o v3 (formato compacto). Dados de quem já usa o sistema não podem se
# perder nem ser arquivados por engano.
class MigracaoTest < Minitest::Test
  include DashZonTeste

  ISO = /\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\z/

  # O schema do banco v2, como o DashZon o criava antes da migração.
  V2_SQL = <<~SQL
    CREATE TABLE config (id INTEGER PRIMARY KEY CHECK (id = 1), org_name TEXT NOT NULL,
      moeda TEXT NOT NULL DEFAULT 'BRL', configured_at TEXT NOT NULL);
    CREATE TABLE modulos (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, nome TEXT NOT NULL,
      descricao TEXT, icone TEXT, schema TEXT NOT NULL, template_origem TEXT, ordem INTEGER NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL);
    CREATE TABLE registros (id INTEGER PRIMARY KEY AUTOINCREMENT,
      modulo_id INTEGER NOT NULL REFERENCES modulos(id) ON DELETE CASCADE,
      dados TEXT NOT NULL, criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL);
    CREATE INDEX idx_registros_modulo ON registros(modulo_id);
    CREATE TABLE dashboards (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL,
      criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL);
    CREATE TABLE widgets (id INTEGER PRIMARY KEY AUTOINCREMENT,
      dashboard_id INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
      titulo TEXT NOT NULL, tipo TEXT NOT NULL, modulo_slug TEXT NOT NULL, config TEXT NOT NULL DEFAULT '{}',
      x INTEGER NOT NULL DEFAULT 0, y INTEGER NOT NULL DEFAULT 0, w INTEGER NOT NULL DEFAULT 4, h INTEGER NOT NULL DEFAULT 3);
  SQL

  SCHEMA_V2 = {
    "campos" => [
      { "id" => "descricao", "nome" => "Descrição", "tipo" => "texto", "obrigatorio" => true, "lista" => true },
      { "id" => "tipo", "nome" => "Tipo", "tipo" => "movimento", "obrigatorio" => true, "lista" => true, "opcoes" => %w[entrada saida] },
      { "id" => "valor", "nome" => "Valor", "tipo" => "moeda", "obrigatorio" => true, "lista" => true },
      { "id" => "data", "nome" => "Data", "tipo" => "data", "obrigatorio" => true, "lista" => true },
      { "id" => "pago", "nome" => "Pago", "tipo" => "booleano", "obrigatorio" => false, "lista" => true },
      { "id" => "obs", "nome" => "Obs", "tipo" => "texto_longo", "obrigatorio" => false, "lista" => false }
    ],
    "rotulo" => "descricao",
    "resumo" => [{ "titulo" => "Total", "agregacao" => "soma", "campo" => "valor", "filtro" => {} }]
  }.freeze

  # [dados no formato antigo, criado_em, atualizado_em]
  REGISTROS_V2 = [
    [{ "descricao" => "Aluguel", "tipo" => "saida", "valor" => 1450.0, "data" => "2025-11-20", "pago" => true, "obs" => "x" },
     "2025-11-20T10:00:00Z", "2025-11-20T10:00:00Z"],
    [{ "descricao" => "Salário", "tipo" => "entrada", "valor" => 5200.5, "data" => "2025-11-05", "pago" => false },
     "2025-11-05T08:30:00Z", "2025-11-06T09:00:00Z"],
    # o validador antigo aceitava datas que não existem:
    [{ "descricao" => "Data ruim", "tipo" => "saida", "valor" => 10.0, "data" => "2026-13-45", "pago" => true },
     "2025-12-01T00:00:00Z", "2025-12-01T00:00:00Z"],
    # tem uma chave de um campo que já foi removido do módulo:
    [{ "descricao" => "Velho", "tipo" => "entrada", "valor" => 1.0, "data" => "2025-01-01", "pago" => false, "campo_removido" => "sobrevive" },
     "2025-01-01T00:00:00Z", "2025-01-01T00:00:00Z"],
    # lixo em campos tipados (tipo fora das opções, valor que não é número, data vazia):
    [{ "descricao" => "Lixo", "tipo" => "outro", "valor" => "abc", "data" => "", "pago" => true },
     "2025-12-02T00:00:00Z", "2025-12-02T00:00:00Z"],
    # registro de antes de existirem alguns campos:
    [{ "descricao" => "Antigo", "valor" => 3.0 }, "2024-06-01T12:00:00Z", "2024-06-01T12:00:00Z"]
  ].freeze

  # O que a API precisa devolver depois da migração (por posição em REGISTROS_V2).
  ESPERADO = [
    { "descricao" => "Aluguel", "tipo" => "saida", "valor" => 1450, "data" => "2025-11-20", "pago" => true, "obs" => "x" },
    { "descricao" => "Salário", "tipo" => "entrada", "valor" => 5200.5, "data" => "2025-11-05", "pago" => false, "obs" => nil },
    { "descricao" => "Data ruim", "tipo" => "saida", "valor" => 10, "data" => nil, "pago" => true, "obs" => nil },
    { "descricao" => "Velho", "tipo" => "entrada", "valor" => 1, "data" => "2025-01-01", "pago" => false, "obs" => nil },
    { "descricao" => "Lixo", "tipo" => nil, "valor" => nil, "data" => nil, "pago" => true, "obs" => nil },
    { "descricao" => "Antigo", "tipo" => nil, "valor" => 3, "data" => nil, "pago" => false, "obs" => nil }
  ].freeze
  VALORES_DESCARTADOS = 3 # data ruim + tipo fora das opções + valor "abc"

  CONFIG_WIDGET = { "agregacao" => "soma", "campo" => "valor", "agrupar_por" => "data", "formato_grupo" => "mes",
                    "serie_por" => "tipo", "filtro" => {} }.freeze

  def caminho
    ENV["DASHZON_DB_PATH"]
  end

  def backups
    Dir.glob("#{caminho}.v2-*.bak")
  end

  # Cria um banco da versão 2 como o de um usuário que já usava o sistema.
  def criar_banco_v2!(schema_texto: JSON.generate(SCHEMA_V2))
    db = SQLite3::Database.new(caminho)
    db.execute_batch(V2_SQL)
    db.execute("INSERT INTO config (id, org_name, moeda, configured_at) VALUES (1, 'Empresa', 'BRL', '2025-01-01T00:00:00Z')")
    db.execute("INSERT INTO modulos (slug, nome, schema, ordem, criado_em) VALUES ('lancamentos', 'Lançamentos', ?, 1, '2025-01-01T00:00:00Z')",
               [schema_texto])
    REGISTROS_V2.each do |dados, criado, editado|
      db.execute("INSERT INTO registros (modulo_id, dados, criado_em, atualizado_em) VALUES (1, ?, ?, ?)", [JSON.generate(dados), criado, editado])
    end
    db.execute("INSERT INTO dashboards (nome, criado_em, atualizado_em) VALUES ('Visão geral', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z')")
    db.execute("INSERT INTO widgets (dashboard_id, titulo, tipo, modulo_slug, config, x, y, w, h) VALUES (1, 'Total', 'kpi', 'lancamentos', ?, 1, 2, 6, 3)",
               [JSON.generate(CONFIG_WIDGET)])
    db.execute("PRAGMA user_version = 2")
    db.close
  end

  # Migra (capturando o aviso no stderr) e entra no sistema com um admin novo.
  def migrar_e_entrar!
    _, err = capture_io { assert Database.configured?, "o banco migrado deve contar como configurado" }
    Usuarios.criar!({ "login" => "dono", "nome" => "Dono", "perfil" => "admin" }, senha: "senha-forte-1")
    assert_equal 200, entrar("dono", "senha-forte-1").status
    err
  end

  def registros_pela_api
    get "/api/modulos/lancamentos/registros"
    assert_equal 200, last_response.status, last_response.body
    resposta["result"].sort_by { |r| r["id"] }
  end

  def test_migra_no_lugar_e_a_api_devolve_os_mesmos_dados
    criar_banco_v2!
    err = migrar_e_entrar!
    assert_match(/Banco migrado da versão 2 para a 3: 6 registros em 1 módulos/, err)
    assert_equal 3, Database.user_version

    lista = registros_pela_api
    assert_equal 6, lista.size
    lista.each_with_index do |r, i|
      assert_equal ESPERADO[i], r.reject { |k, _| k == "id" || k.start_with?("_") }, "registro #{i + 1}"
      assert_equal i + 1, r["id"], "os ids são preservados"
      assert_equal REGISTROS_V2[i][1], r["_criado_em"], "criado_em igual ao original (ISO)"
      assert_equal REGISTROS_V2[i][2], r["_atualizado_em"], "atualizado_em igual ao original (ISO)"
      assert_match ISO, r["_criado_em"]
    end
  end

  def test_valores_que_nao_convertem_sao_contados_e_o_original_fica_no_backup
    criar_banco_v2!
    err = migrar_e_entrar!
    assert_match(/#{VALORES_DESCARTADOS} valores inválidos viraram vazio/, err)

    assert_equal 1, backups.size
    bak = SQLite3::Database.new(backups.first)
    assert_equal 2, bak.get_first_value("PRAGMA user_version").to_i, "o backup é o banco antigo, na versão 2"
    assert_equal 6, bak.get_first_value("SELECT COUNT(*) FROM registros").to_i
    assert_equal "2026-13-45", JSON.parse(bak.get_first_value("SELECT dados FROM registros WHERE id = 3"))["data"]
    assert_equal "2025-11-06T09:00:00Z", bak.get_first_value("SELECT atualizado_em FROM registros WHERE id = 2")
    assert_equal "ok", bak.get_first_value("PRAGMA integrity_check")
    bak.close
  end

  def test_valor_de_campo_removido_sobrevive_e_volta_se_o_campo_voltar
    criar_banco_v2!
    migrar_e_entrar!
    assert_equal 6, Database.modulo("lancamentos")["schema"]["slots"]["campo_removido"], "ganhou slot, não foi jogado fora"
    refute registros_pela_api.any? { |r| r.key?("campo_removido") }

    campos = Database.modulo("lancamentos")["schema"]["campos"] + [{ "id" => "campo_removido", "nome" => "Campo", "tipo" => "texto" }]
    put_json "/api/modulos/lancamentos", { "nome" => "Lançamentos", "campos" => campos }
    assert_equal 200, last_response.status, last_response.body
    assert_equal "sobrevive", registros_pela_api[3]["campo_removido"]
  end

  def test_estrutura_do_banco_migrado
    criar_banco_v2!
    migrar_e_entrar!
    assert_equal 2, Database.row("PRAGMA auto_vacuum")["auto_vacuum"]
    assert_equal "ok", Database.row("PRAGMA integrity_check")["integrity_check"]
    assert_empty Database.rows("PRAGMA foreign_key_check")
    assert_equal "delete", Database.row("PRAGMA journal_mode")["journal_mode"], "WAL continua desligado (ver CLAUDE.md)"
    nomes = Database.rows("SELECT name FROM sqlite_master WHERE type = 'index'").map { |i| i["name"] }
    assert_includes nomes, "idx_registros_modulo"
    assert_includes nomes, "idx_widgets_dashboard"
    tipos = Database.row("SELECT typeof(criado_em) AS c, typeof(atualizado_em) AS a FROM registros WHERE id = 1")
    assert_equal({ "c" => "integer", "a" => "null" }, tipos, "nunca editado: atualizado_em vazio")
    assert_equal "integer", Database.row("SELECT typeof(atualizado_em) AS a FROM registros WHERE id = 2")["a"]
    assert_equal "[", Database.row("SELECT dados FROM registros WHERE id = 1")["dados"][0]
  end

  def test_widgets_dashboards_e_configuracao_ficam_intactos
    criar_banco_v2!
    migrar_e_entrar!
    get "/api/status"
    assert_equal "Empresa", resposta["org_name"]
    get "/api/dashboards/1"
    assert_equal ["Visão geral"], [resposta["nome"]]
    w = resposta["widgets"].first
    assert_equal ["Total", "kpi", "lancamentos", CONFIG_WIDGET, 1, 2, 6, 3], w.values_at("titulo", "tipo", "modulo_slug", "config", "x", "y", "w", "h")
    assert_equal "2025-01-01T00:00:00Z", Database.row("SELECT criado_em FROM dashboards")["criado_em"], "outras tabelas continuam com data em texto"
  end

  def test_card_calcula_a_mesma_soma_depois_da_migracao
    skip "motor C++ não compilado" unless EngineClient.binary_path && File.exist?(EngineClient.binary_path)
    criar_banco_v2!
    migrar_e_entrar!
    get "/api/widgets/1/data"
    assert_equal 200, last_response.status, last_response.body
    recebido = resposta.reject { |k, _| k == "config" }

    # O mesmo cálculo, direto no motor, com os registros que a migração deve ter produzido.
    get "/api/dashboards/1"
    schema = Database.modulo("lancamentos")["schema"]
    cfg = ModuleSchema.normalize_widget!(resposta["widgets"].first, schema)["config"]
    registros = ESPERADO.each_with_index.map { |r, i| r.merge("id" => i + 1) }
    esperado = EngineClient.run({ cmd: "aggregate", records: registros }.merge(ModuleSchema.engine_query(schema, cfg)))
    assert_equal esperado, recebido
    assert_in_delta ESPERADO.sum { |r| r["valor"].to_f }, recebido["total_sum"], 0.001
  end

  def test_novo_registro_continua_a_numeracao_e_o_cache_ve_a_mudanca
    criar_banco_v2!
    migrar_e_entrar!
    post_json "/api/modulos/lancamentos/registros", { "descricao" => "Novo", "tipo" => "entrada", "valor" => 7, "data" => "2026-01-02" }
    assert_equal 201, last_response.status, last_response.body
    assert_equal 7, resposta["id"]
    assert_equal 7, registros_pela_api.size
  end

  def test_migracao_so_acontece_uma_vez
    criar_banco_v2!
    migrar_e_entrar!
    antes = Database.rows("SELECT id, dados, criado_em, atualizado_em FROM registros ORDER BY id")
    Database.fechar!
    _, err = capture_io { assert Database.configured? }
    assert_equal "", err, "não migra nem avisa de novo"
    assert_equal 1, backups.size, "e não faz outro backup"
    assert_equal antes, Database.rows("SELECT id, dados, criado_em, atualizado_em FROM registros ORDER BY id")
  end

  def test_falha_na_migracao_nao_altera_nada_e_nao_leva_ao_setup
    criar_banco_v2!(schema_texto: "{isto nao e json")
    erro = assert_raises(Migracao::Falha) { Database.configured? }
    assert_match(/Nada foi alterado/, erro.message)
    assert_match(/\.v2-.*\.bak/, erro.message, "a mensagem diz onde está a cópia de segurança")

    assert File.exist?(caminho), "o banco do usuário continua no lugar (não foi arquivado)"
    assert_equal [], Dir.glob("#{caminho}.*.bak") - backups, "nenhum .bak de 'arquivar_versao_antiga!'"
    db = SQLite3::Database.new(caminho)
    assert_equal 2, db.get_first_value("PRAGMA user_version").to_i
    assert_equal "{", db.get_first_value("SELECT dados FROM registros WHERE id = 1")[0], "registros intactos, ainda no formato antigo"
    assert_equal 6, db.get_first_value("SELECT COUNT(*) FROM registros").to_i
    assert_nil db.get_first_value("SELECT name FROM sqlite_master WHERE name = 'registros_v3'"), "sem tabela temporária sobrando"
    db.close

    # A API responde erro (500), não "não configurado": o usuário não é levado ao setup.
    get "/api/status"
    assert_equal 500, last_response.status
    refute_includes last_response.body, '"configured":false'
    # A resposta diz a causa e onde está a cópia (não o "Erro interno" genérico).
    assert_match(/migrar o banco.*\.bak/, JSON.parse(last_response.body)["error"])
  end

  # Conta quantas vezes a migração de fato é tentada (cada tentativa grava uma
  # cópia do banco, então repetir a cada requisição encheria o disco). Contar
  # arquivos não serve: tentativas no mesmo segundo reaproveitam o nome.
  def tentativas_de_migracao
    chamadas = 0
    original = Migracao.method(:se_preciso!)
    Migracao.define_singleton_method(:se_preciso!) do |*args|
      chamadas += 1
      original.call(*args)
    end
    yield
    chamadas
  ensure
    Migracao.define_singleton_method(:se_preciso!, original)
  end

  def test_falha_nao_e_tentada_de_novo_a_cada_requisicao
    criar_banco_v2!(schema_texto: "{isto nao e json")
    tentativas = tentativas_de_migracao do
      3.times { assert_raises(Migracao::Falha) { Database.configured? } }
      get "/api/status"
      assert_equal 500, last_response.status
    end
    assert_equal 1, tentativas, "tenta uma vez e depois só repete o erro, até reiniciar"
    assert_equal 1, backups.size

    # Reiniciar o servidor (fechar a conexão) libera uma nova tentativa.
    Database.fechar!
    assert_equal 1, tentativas_de_migracao { assert_raises(Migracao::Falha) { Database.configured? } }
  end

  # Carrega o app.rb num processo novo (como na partida do servidor) e diz o que aconteceu.
  def carregar_app_em_processo_novo(consulta_versao: true)
    script = 'require "./app"'
    script += '; puts "versao=#{Database.user_version}"' if consulta_versao # (abrir a conexão cria o arquivo: só quando ele já existe)
    Open3.capture3({ "DASHZON_DB_PATH" => caminho, "APP_ENV" => "test", "DASHZON_HOSTS" => "example.org" },
                   RbConfig.ruby, "-e", script, chdir: File.expand_path("..", __dir__))
  end

  def test_migracao_comprime_exportacoes_e_templates_antigos_sem_mudar_o_conteudo
    criar_banco_v2!
    exportacao = JSON.generate("nome" => "Backup ✓", "modulos" => Array.new(1200) { |i| { "slug" => "m#{i}", "dados" => ["linha #{i}", i, "Ação"] * 6 } })
    template = JSON.generate("nome" => "Template antigo", "modulos" => [{ "slug" => "x", "nome" => "X", "campos" => [{ "id" => "a", "nome" => "A", "tipo" => "texto" }] }], "dashboards" => [])
    db = SQLite3::Database.new(caminho)
    db.execute_batch(<<~SQL)
      CREATE TABLE jsons (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL CHECK (tipo IN ('template', 'exportacao')),
        nome TEXT NOT NULL, conteudo TEXT NOT NULL, criado_em TEXT NOT NULL);
      CREATE INDEX idx_jsons_tipo ON jsons(tipo);
    SQL
    db.execute("INSERT INTO jsons (tipo, nome, conteudo, criado_em) VALUES ('exportacao', 'dashzon-antigo.json', ?, '2025-01-01T00:00:00Z')", [exportacao])
    db.execute("INSERT INTO jsons (tipo, nome, conteudo, criado_em) VALUES ('template', 'Template antigo', ?, '2025-01-02T00:00:00Z')", [template])
    db.close
    antes = File.size(caminho)

    err = migrar_e_entrar!
    assert_match(/2 JSON\(s\) guardado\(s\).*comprimido/, err)
    linhas = Database.rows("SELECT id, tipo, typeof(conteudo) AS t, conteudo FROM jsons ORDER BY id")
    assert_equal %w[blob blob], linhas.map { |l| l["t"] }
    assert_equal [exportacao, template], linhas.map { |l| JsonGuardado.texto(l["conteudo"]) }, "o texto é idêntico, byte a byte"
    assert_operator File.size(caminho), :<, antes, "a exportação comprimida e o VACUUM devolveram espaço"

    get "/api/exportacoes/1"
    assert_equal JSON.parse(exportacao), resposta
    get "/api/templates"
    assert_equal ["Template antigo"], resposta.select { |t| t["origem"] == "importado" }.map { |t| t["nome"] }
    # a cópia de segurança guarda o original em texto
    bak = SQLite3::Database.new(backups.first)
    assert_equal "text", bak.get_first_value("SELECT typeof(conteudo) FROM jsons WHERE id = 1")
    bak.close
  end

  def test_migra_ja_na_partida_do_servidor_sem_esperar_a_primeira_requisicao
    criar_banco_v2!
    out, err, status = carregar_app_em_processo_novo
    assert status.success?, err
    assert_includes out, "versao=3"
    assert_match(/Banco migrado da versão 2 para a 3/, err)
    assert_equal 1, backups.size
  end

  def test_falha_na_partida_nao_derruba_o_servidor_e_avisa_no_log
    criar_banco_v2!(schema_texto: "{isto nao e json")
    out, err, status = carregar_app_em_processo_novo
    assert status.success?, "o processo sobe mesmo assim: #{err}"
    assert_includes out, "versao=2", "nada foi alterado"
    assert_match(/Nada foi alterado/, err)
    assert_equal 1, backups.size
  end

  def test_partida_sem_banco_nao_cria_arquivo_nenhum
    _, err, status = carregar_app_em_processo_novo(consulta_versao: false)
    assert status.success?, err
    refute File.exist?(caminho), "o banco só nasce no setup"
  end

  def test_banco_v2_sem_tabela_de_registros_nao_e_migrado
    db = SQLite3::Database.new(caminho)
    db.execute("CREATE TABLE qualquer_coisa (x)")
    db.execute("PRAGMA user_version = 2")
    db.close
    refute Database.configured?
    assert_empty backups
  end

  def test_banco_de_versao_mais_antiga_continua_sendo_arquivado_no_setup
    db = SQLite3::Database.new(caminho)
    db.execute("CREATE TABLE velho (x)")
    db.execute("PRAGMA user_version = 1")
    db.close
    get "/api/status"
    assert_equal false, resposta["configured"]
    configurar!
    assert_equal 1, Dir.glob("#{caminho}.*.bak").size, "o banco antigo virou .bak"
    assert_equal 3, Database.user_version
  end
end
