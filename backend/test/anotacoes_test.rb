require_relative "test_helper"

# Anotações em Markdown (visão "notas"), ligação registro -> nota, campos
# configuráveis e módulos ocultos por usuário.
class AnotacoesTest < Minitest::Test
  include DashZonTeste

  TEMPLATES = File.expand_path("../templates", __dir__)

  def motor?
    EngineClient.binary_path && File.exist?(EngineClient.binary_path)
  end

  def template(id)
    JSON.parse(File.read(File.join(TEMPLATES, "#{id}.json"), encoding: "UTF-8"))
  end

  def instalar!(id)
    post_json "/api/templates/instalar", { "template_id" => id, "com_exemplos" => true }
    assert_equal 200, last_response.status, last_response.body
    resposta
  end

  BASE = { "slug" => "n", "nome" => "N", "campos" => [
    { "id" => "titulo", "tipo" => "texto" }, { "id" => "texto", "tipo" => "markdown" },
    { "id" => "pasta", "tipo" => "texto" }, { "id" => "qtd", "tipo" => "numero" }
  ] }.freeze

  # --- tipo markdown -----------------------------------------------------------

  def test_markdown_guarda_quebras_e_recuo_e_tem_limite
    c = { "nome" => "Texto", "tipo" => "markdown" }
    assert_equal "# T\n\n  - item\n    código", ModuleSchema.coerce_valor(c, "# T\r\n\r\n  - item\r\n    código  \n\n")
    assert_equal 100_000, ModuleSchema.coerce_valor(c, "a" * 100_000).length
    assert_raises(ModuleSchema::Error) { ModuleSchema.coerce_valor(c, "a" * 100_001) }
  end

  # --- declarações do módulo ---------------------------------------------------

  def test_visao_nota_e_configuracoes_validadas
    ok = ModuleSchema.normalize_modulo!(BASE.merge(
      "visao" => { "tipo" => "notas", "titulo" => "titulo", "conteudo" => "texto", "pasta" => "pasta" },
      "nota" => { "modulo" => "outro", "titulo" => "titulo" },
      "configuracoes" => %w[qtd pasta qtd]
    ))
    assert_equal({ "tipo" => "notas", "titulo" => "titulo", "conteudo" => "texto", "pasta" => "pasta" }, ok["visao"])
    assert_equal({ "modulo" => "outro", "titulo" => "titulo" }, ok["nota"])
    assert_equal %w[qtd pasta], ok["configuracoes"]
    refute ModuleSchema.normalize_modulo!(BASE).key?("visao"), "sem declarar, nada é gravado"

    ruins = [
      { "visao" => { "tipo" => "kanban", "titulo" => "titulo", "conteudo" => "texto" } },
      { "visao" => { "tipo" => "notas", "titulo" => "qtd", "conteudo" => "texto" } },
      { "visao" => { "tipo" => "notas", "titulo" => "titulo", "conteudo" => "nao_existe" } },
      { "nota" => { "modulo" => "Outro Módulo", "titulo" => "titulo" } },
      { "nota" => { "modulo" => "outro", "titulo" => "qtd" } },
      { "configuracoes" => %w[nao_existe] },
      { "configuracoes" => "qtd" }
    ]
    ruins.each do |extra|
      assert_raises(ModuleSchema::Error, extra.inspect) { ModuleSchema.normalize_modulo!(BASE.merge(extra)) }
    end
  end

  def test_declaracoes_sobrevivem_a_edicao_da_estrutura
    configurar!
    instalar!("anotacoes")
    get "/api/modulos/anotacoes"
    m = resposta
    defn = m.slice("nome", "descricao", "icone").merge(m["schema"].except("slots"))
    put_json "/api/modulos/anotacoes", defn
    assert_equal 200, last_response.status, last_response.body
    assert_equal m["schema"]["visao"], resposta["schema"]["visao"]
  end

  # --- templates ---------------------------------------------------------------

  def test_modulo_anotacoes_igual_nos_dois_templates
    a = template("anotacoes")["modulos"].find { |m| m["slug"] == "anotacoes" }
    b = template("cronograma-estudos")["modulos"].find { |m| m["slug"] == "anotacoes" }
    assert_equal a, b, "o módulo Anotações precisa ser idêntico nos dois templates"
  end

  def test_kit_de_estudos_e_anotacoes_sem_duplicar
    configurar!
    instalar!("cronograma-estudos")
    r = instalar!("anotacoes")
    assert_equal ["Anotações"], r["reaproveitados"]
    get "/api/modulos"
    assert_equal 1, resposta.count { |m| m["nome"] == "Anotações" }
    assert_equal 6, resposta.find { |m| m["slug"] == "anotacoes" }["total"]
    assert_equal({ "modulo" => "anotacoes", "titulo" => "assunto", "pasta" => "materia" },
                 resposta.find { |m| m["slug"] == "cronograma_estudos" }["schema"]["nota"])
  end

  def test_busca_acha_texto_dentro_da_nota_e_ordena_por_pasta
    skip "motor C++ não compilado" unless motor?
    configurar!
    instalar!("anotacoes")
    get "/api/modulos/anotacoes/registros?q=discriminante"
    assert_equal ["Funções do 2º grau"], resposta["result"].map { |r| r["titulo"] }
    get "/api/modulos/anotacoes/registros"
    # Pasta e depois título; nota sem pasta (vazio) fica por último.
    assert_equal ["Present perfect", "Funções do 1º grau", "Funções do 2º grau", "Laços e condicionais",
                  "Como usar as anotações", "Plano da semana"], resposta["result"].map { |r| r["titulo"] }
  end

  def test_nota_editada_com_patch_guarda_o_markdown
    configurar!
    instalar!("anotacoes")
    id = Database.registros(Database.modulo("anotacoes")).find { |r| r["titulo"] == "Plano da semana" }["id"]
    novo = "# Plano\n\n- [x] Tudo feito\n\n```\n  recuo mantido\n```"
    patch "/api/modulos/anotacoes/registros/#{id}", JSON.generate("conteudo" => novo), "CONTENT_TYPE" => "application/json"
    assert_equal 200, last_response.status, last_response.body
    get "/api/modulos/anotacoes/registros/#{id}"
    assert_equal novo, resposta["conteudo"]
    assert_equal "Plano da semana", resposta["titulo"]
  end

  # --- módulos ocultos por usuário ------------------------------------------------

  def test_modulos_ocultos_por_usuario
    configurar!
    get "/api/eu"
    assert_equal [], resposta["preferencias"]["modulos_ocultos"]
    put_json "/api/eu/preferencias", { "modulos_ocultos" => %w[anotacoes cronograma_estudos anotacoes] }
    assert_equal 200, last_response.status, last_response.body
    assert_equal %w[anotacoes cronograma_estudos], resposta["preferencias"]["modulos_ocultos"]
    put_json "/api/eu/preferencias", { "tema" => "escuro" }
    assert_equal %w[anotacoes cronograma_estudos], resposta["preferencias"]["modulos_ocultos"], "outra preferência não apaga a lista"

    [["Anotações"], "anotacoes", [1], Array.new(101) { |i| "m#{i}" }].each do |ruim|
      put_json "/api/eu/preferencias", { "modulos_ocultos" => ruim }
      assert_equal 422, last_response.status, ruim.inspect[0, 40]
    end
  end
end
