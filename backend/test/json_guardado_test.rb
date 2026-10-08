require_relative "test_helper"

# JSON do usuário (exportações e templates importados) é gravado comprimido,
# mas continua saindo igual, e linhas antigas em texto puro continuam legíveis.
class JsonGuardadoTest < Minitest::Test
  include DashZonTeste

  TEMPLATE = {
    "formato" => "dashzon-template", "versao" => 1, "id" => "meu-teste", "nome" => "Meu teste — ação ✓",
    "modulos" => [{ "slug" => "coisas", "nome" => "Coisas de teste", "campos" => [{ "id" => "nome", "nome" => "Nome", "tipo" => "texto", "obrigatorio" => true }] }],
    "dashboards" => []
  }.freeze

  def setup
    super
    configurar!
  end

  def linha(tipo)
    Database.row("SELECT id, typeof(conteudo) AS t, LENGTH(CAST(conteudo AS BLOB)) AS n FROM jsons WHERE tipo = ? ORDER BY id DESC", [tipo])
  end

  def test_ida_e_volta_com_acentos_emoji_e_vazios
    [{}, [], { "a" => "Ação ✓ 😀", "n" => [1, 2.5, nil, true], "x" => { "y" => "z" } }].each do |obj|
      assert_equal obj, JsonGuardado.decodificar(JsonGuardado.codificar(obj))
    end
    texto = JSON.generate("a" => "Ação ✓ 😀")
    assert_equal texto, JsonGuardado.texto(JsonGuardado.comprimir_texto(texto))
    assert_equal Encoding::UTF_8, JsonGuardado.texto(JsonGuardado.comprimir_texto(texto)).encoding
  end

  def test_distingue_texto_antigo_de_comprimido
    assert JsonGuardado.comprimido?(JsonGuardado.codificar("a" => 1))
    refute JsonGuardado.comprimido?('{"a":1}')
    refute JsonGuardado.comprimido?("[1,2]")
    refute JsonGuardado.comprimido?(nil)
    assert_equal '{"a":1}', JsonGuardado.texto('{"a":1}'), "texto antigo passa como está"
  end

  def test_exportacao_com_dados_fica_comprimida_e_baixa_igual
    post_json "/api/templates/instalar", { "template_id" => "financas-pessoais", "com_exemplos" => true }
    modulo = Database.modulo("lancamentos")
    Database.transaction do
      300.times do |i|
        Database.inserir_registro(modulo, ModuleSchema.coerce_registro!(modulo["schema"],
                                  "descricao" => "Lançamento #{i}", "tipo" => "saida", "valor" => i * 1.5, "categoria" => "Outros", "data" => "2026-09-01"))
      end
    end

    get "/api/export?dados=1"
    assert_equal 200, last_response.status
    texto = last_response.body
    exportado = resposta

    l = linha("exportacao")
    assert_equal "blob", l["t"], "gravado como BLOB comprimido, não como texto"
    assert_operator l["n"], :<, texto.bytesize * 0.25, "comprimido: #{texto.bytesize} -> #{l['n']} bytes"

    get "/api/exportacoes/#{l['id']}"
    assert_equal 200, last_response.status
    assert_equal exportado, resposta, "o download devolve exatamente o que foi exportado"
    get "/api/exportacoes"
    item = resposta.first
    assert_equal l["id"], item["id"]
    assert_equal l["n"], item["bytes"], "bytes = tamanho realmente ocupado no banco"
    assert_match(/\Adashzon-.*-dados\.json\z/, item["nome"])
  end

  def test_template_importado_vai_para_a_galeria_sem_duplicar
    2.times do
      post_json "/api/templates/instalar", { "template" => TEMPLATE, "com_exemplos" => false }
      assert_equal 200, last_response.status, last_response.body
    end
    assert_equal 1, Database.row("SELECT COUNT(*) AS n FROM jsons WHERE tipo = 'template'")["n"], "o mesmo template não é guardado duas vezes"
    assert_equal "blob", linha("template")["t"]

    get "/api/templates"
    salvo = resposta.find { |t| t["origem"] == "importado" }
    assert salvo, "o template importado aparece na galeria"
    assert salvo["id"].start_with?("salvo-")
    assert_equal TEMPLATE["nome"], salvo["nome"]

    get "/api/templates/#{salvo['id']}"
    assert_equal 200, last_response.status
    assert_equal TEMPLATE["modulos"], resposta["modulos"]

    delete "/api/templates/#{salvo['id']}"
    assert_equal 200, last_response.status
    get "/api/templates"
    assert_empty(resposta.select { |t| t["origem"] == "importado" })
  end

  def test_linhas_antigas_em_texto_continuam_legiveis_e_deduplicam
    Database.garantir_tabelas!
    antigo = { "nome" => "Exportação antiga ✓", "modulos" => [], "dashboards" => [] }
    Database.execute("INSERT INTO jsons (tipo, nome, conteudo, criado_em) VALUES ('exportacao', 'velha.json', ?, ?)", [JSON.generate(antigo), Database.now])
    id = Database.row("SELECT id FROM jsons")["id"]
    assert_equal "text", Database.row("SELECT typeof(conteudo) AS t FROM jsons")["t"]

    get "/api/exportacoes/#{id}"
    assert_equal 200, last_response.status
    assert_equal antigo, resposta
    get "/api/exportacoes"
    assert_equal id, resposta.first["id"]

    # um template antigo em texto puro: salvar o mesmo template de novo reconhece e não duplica
    Database.execute("INSERT INTO jsons (tipo, nome, conteudo, criado_em) VALUES ('template', 'Meu teste', ?, ?)", [JSON.generate(TEMPLATE), Database.now])
    id_tpl = Database.row("SELECT id FROM jsons WHERE tipo = 'template'")["id"]
    assert_equal id_tpl, Database.salvar_json!("template", "Meu teste", TEMPLATE)
    assert_equal 1, Database.row("SELECT COUNT(*) AS n FROM jsons WHERE tipo = 'template'")["n"]
  end

  def test_excluir_exportacao
    get "/api/export"
    id = linha("exportacao")["id"]
    delete "/api/exportacoes/#{id}"
    assert_equal 200, last_response.status
    assert_nil linha("exportacao")
    get "/api/exportacoes/#{id}"
    assert_equal 404, last_response.status
  end
end
