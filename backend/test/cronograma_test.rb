require_relative "test_helper"

# Cronograma de estudos: tipo `hora`, ordenação do módulo, checklist (PATCH de
# um campo) e leitura de um registro direto do banco.
class CronogramaTest < Minitest::Test
  include DashZonTeste

  def motor?
    EngineClient.binary_path && File.exist?(EngineClient.binary_path)
  end

  def instalar!
    configurar!
    post_json "/api/templates/instalar", { "template_id" => "cronograma-estudos", "com_exemplos" => true }
    assert_equal 200, last_response.status, last_response.body
  end

  # --- tipo hora --------------------------------------------------------------

  def test_hora_valida_normaliza_e_recusa
    c = { "nome" => "Horário", "tipo" => "hora" }
    assert_equal "08:05", ModuleSchema.coerce_valor(c, "8:05")
    assert_equal "19:30", ModuleSchema.coerce_valor(c, "19:30:59")
    assert_nil ModuleSchema.coerce_valor(c, "")
    %w[24:00 12:60 8h30 abc 1230].each do |ruim|
      assert_raises(ModuleSchema::Error, ruim) { ModuleSchema.coerce_valor(c, ruim) }
    end
  end

  def test_hora_no_formato_compacto
    schema = { "campos" => [{ "id" => "h", "tipo" => "hora" }], "slots" => { "h" => 0 } }
    assert_equal "[510]", RecordCodec.pack(schema, { "h" => "08:30" })
    assert_equal({ "h" => "23:59" }, RecordCodec.unpack(RecordCodec.plano(schema), "[1439]"))
    assert_equal({ "h" => nil }, RecordCodec.unpack(RecordCodec.plano(schema), "[\"lixo\"]"), "decode nunca levanta erro")
  end

  def test_texto_vira_hora_ao_trocar_o_tipo
    configurar!
    mod = { "slug" => "aulas", "nome" => "Aulas", "campos" => [{ "id" => "nome", "tipo" => "texto" }, { "id" => "inicio", "tipo" => "texto" }] }
    post_json "/api/modulos", mod
    post_json "/api/modulos/aulas/registros", { "nome" => "A", "inicio" => "7:15" }
    id = resposta["id"]
    post_json "/api/modulos/aulas/registros", { "nome" => "B", "inicio" => "de manhã" }
    put_json "/api/modulos/aulas", mod.merge("campos" => [{ "id" => "nome", "tipo" => "texto" }, { "id" => "inicio", "tipo" => "hora" }])
    assert_equal 200, last_response.status, last_response.body
    get "/api/modulos/aulas/registros/#{id}"
    assert_equal "07:15", resposta["inicio"]
  end

  # --- ordenação --------------------------------------------------------------

  def test_ordenacao_validada
    base = { "slug" => "o", "nome" => "O", "campos" => [{ "id" => "a", "tipo" => "texto" }] }
    assert_equal [{ "campo" => "a", "direcao" => "asc" }], ModuleSchema.normalize_modulo!(base.merge("ordenacao" => [{ "campo" => "a" }]))["ordenacao"]
    assert_equal [{ "campo" => "a", "direcao" => "desc" }], ModuleSchema.normalize_modulo!(base.merge("ordenacao" => [{ "campo" => "a", "direcao" => "desc" }]))["ordenacao"]
    assert_equal [], ModuleSchema.normalize_modulo!(base)["ordenacao"]
    [[{ "campo" => "zzz" }], [{ "campo" => "a", "direcao" => "lado" }], "a", Array.new(4) { { "campo" => "a" } }].each do |ruim|
      assert_raises(ModuleSchema::Error, ruim.inspect) { ModuleSchema.normalize_modulo!(base.merge("ordenacao" => ruim)) }
    end
  end

  def test_ordenar_registros_vazios_por_ultimo_e_empate_estavel
    schema = { "ordenacao" => [{ "campo" => "d", "direcao" => "asc" }, { "campo" => "h", "direcao" => "desc" }] }
    lista = [{ "id" => 1, "d" => nil, "h" => "10:00" }, { "id" => 2, "d" => "2026-01-02", "h" => "08:00" },
             { "id" => 3, "d" => "2026-01-01", "h" => nil }, { "id" => 4, "d" => "2026-01-02", "h" => "09:00" },
             { "id" => 5, "d" => "2026-01-01", "h" => "07:00" }, { "id" => 6, "d" => "2026-01-01", "h" => "07:00" }]
    assert_equal [5, 6, 3, 4, 2, 1], ModuleSchema.ordenar_registros(schema, lista).map { |r| r["id"] }
    assert_equal [1, 2, 3], ModuleSchema.ordenar_registros({}, [{ "id" => 1 }, { "id" => 2 }, { "id" => 3 }]).map { |r| r["id"] }
  end

  # --- template --------------------------------------------------------------

  def test_template_instala_com_ordem_de_calendario
    skip "motor C++ não compilado" unless motor?
    instalar!
    get "/api/modulos/cronograma_estudos/registros"
    assert_equal 12, resposta["count"]
    chaves = resposta["result"].map { |r| [r["data"], r["hora"]] }
    assert_equal chaves.sort, chaves, "lista em ordem de data e horário"
    assert_equal Date.today.iso8601, resposta["result"].find { |r| r["assunto"] == "Funções e listas" }["data"]
  end

  def test_resumo_e_cards_do_template
    skip "motor C++ não compilado" unless motor?
    instalar!
    get "/api/modulos/cronograma_estudos/resumo"
    valores = resposta.to_h { |r| [r["titulo"], r["valor"]] }
    assert_equal({ "Sessões" => 12, "Estudadas" => 5, "Pendentes" => 7, "Horas planejadas" => 19.5, "Horas estudadas" => 8.0 }, valores)

    get "/api/dashboards"
    dash = resposta.find { |d| d["nome"] == "Estudos" }
    get "/api/dashboards/#{dash['id']}"
    assert_equal 11, resposta["widgets"].size # 8 + calendário, meta do mês e pizza de matérias
    resposta["widgets"].each do |w|
      get "/api/widgets/#{w['id']}/data"
      assert_equal 200, last_response.status, "#{w['titulo']}: #{last_response.body}"
    end
  end

  # --- checklist e leitura de um registro ------------------------------------

  def test_marcar_como_estudado_muda_so_esse_campo
    skip "motor C++ não compilado" unless motor?
    instalar!
    get "/api/modulos/cronograma_estudos/registros?f[estudado]=false&limite=1"
    alvo = resposta["result"].first
    antes = alvo.reject { |k, _| k.start_with?("_") }

    patch "/api/modulos/cronograma_estudos/registros/#{alvo['id']}", JSON.generate("estudado" => true), "CONTENT_TYPE" => "application/json"
    assert_equal 200, last_response.status, last_response.body
    depois = resposta.reject { |k, _| k.start_with?("_") }
    assert_equal antes.merge("estudado" => true), depois

    get "/api/modulos/cronograma_estudos/resumo"
    assert_equal 6, resposta.find { |r| r["titulo"] == "Estudadas" }["valor"]
  end

  def test_patch_valida_e_confere_existencia
    instalar!
    get "/api/modulos/cronograma_estudos/registros/999999"
    assert_equal 404, last_response.status
    patch "/api/modulos/cronograma_estudos/registros/999999", JSON.generate("estudado" => true), "CONTENT_TYPE" => "application/json"
    assert_equal 404, last_response.status

    id = Database.row("SELECT MIN(id) AS id FROM registros")["id"]
    patch "/api/modulos/cronograma_estudos/registros/#{id}", JSON.generate("nao_existe" => 1), "CONTENT_TYPE" => "application/json"
    assert_equal 422, last_response.status
    patch "/api/modulos/cronograma_estudos/registros/#{id}", JSON.generate("hora" => "99:99"), "CONTENT_TYPE" => "application/json"
    assert_equal 422, last_response.status
    patch "/api/modulos/cronograma_estudos/registros/#{id}", JSON.generate("materia" => "Astrologia"), "CONTENT_TYPE" => "application/json"
    assert_equal 422, last_response.status
  end

  def test_leitura_de_um_registro_vem_do_banco_com_precisao_total
    configurar!
    post_json "/api/modulos", { "slug" => "v", "nome" => "V", "campos" => [{ "id" => "valor", "tipo" => "moeda" }] }
    post_json "/api/modulos/v/registros", { "valor" => 1_234_567.89 }
    get "/api/modulos/v/registros/#{resposta['id']}"
    assert_equal 1_234_567.89, resposta["valor"]
  end

  def test_exportar_e_reimportar_mantem_a_ordenacao
    instalar!
    get "/api/export"
    exportado = resposta
    assert_equal [{ "campo" => "data", "direcao" => "asc" }, { "campo" => "hora", "direcao" => "asc" }],
                 exportado["modulos"].find { |m| m["slug"] == "cronograma_estudos" }["ordenacao"]
    post_json "/api/templates/validar", { "template" => exportado }
    assert_equal 200, last_response.status, last_response.body
  end
end
