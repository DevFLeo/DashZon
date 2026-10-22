require_relative "test_helper"

# Prefeitura DashZ: estrutura em árvore (secretaria > subsecretaria >
# departamento > divisão), permissões em cascata e o painel de produtividade.
#
# Cenário do pedido:
#   gestora.suplan: gestora da SUPLAN e da SURÇAM (põe e tira gente das duas);
#   gestor.dgeo:    gestor do DGEO (DCAD, DTAD e DASI ficam abaixo dele);
#   gerente.dtad:   gerente (gestor) do DTAD, só o DTAD;
#   membro.dcad:    membro do DCAD.
class PrefeituraTest < Minitest::Test
  include DashZonTeste

  SENHA = "senha-forte-1".freeze

  def motor? = EngineClient.binary_path && File.exist?(EngineClient.binary_path)

  def patch_json(path, dados = {})
    patch path, JSON.generate(dados), "CONTENT_TYPE" => "application/json"
  end

  def como(login)
    entrar(login, SENHA)
    yield
  ensure
    entrar("dono", SENHA)
  end

  def unidade!(sigla, tipo, pai = nil, nome: nil)
    post_json "/api/admin/equipes", { "sigla" => sigla, "nome" => nome || "Unidade #{sigla}", "tipo" => tipo, "pai_id" => pai }
    assert_equal 201, last_response.status, last_response.body
    resposta["id"]
  end

  def usuario!(login, unidades: [], gestor_de: [])
    post_json "/api/admin/usuarios", { "login" => login, "nome" => login.capitalize, "senha" => SENHA, "deve_trocar_senha" => false,
                                       "equipes" => unidades, "gestor_de" => gestor_de }
    assert_equal 201, last_response.status, last_response.body
    resposta["usuario"]["id"]
  end

  # SEMEC / {SUPLAN / {DGEO / {DCAD, DTAD, DASI}, DIPLAD}, SURÇAM}
  def montar!
    configurar!
    @semec = unidade!("SEMEC", "secretaria")
    @suplan = unidade!("SUPLAN", "subsecretaria", @semec)
    @surcam = unidade!("SURÇAM", "subsecretaria", @semec)
    @dgeo = unidade!("DGEO", "departamento", @suplan)
    @diplad = unidade!("DIPLAD", "departamento", @suplan)
    @dcad = unidade!("DCAD", "divisao", @dgeo)
    @dtad = unidade!("DTAD", "divisao", @dgeo)
    @dasi = unidade!("DASI", "divisao", @dgeo)
    @gestora_suplan = usuario!("gestora.suplan", gestor_de: [@suplan, @surcam])
    @gestor_dgeo = usuario!("gestor.dgeo", gestor_de: [@dgeo])
    @gerente_dtad = usuario!("gerente.dtad", gestor_de: [@dtad])
    @membro_dcad = usuario!("membro.dcad", unidades: [@dcad])
    @fora = usuario!("fora", unidades: [@diplad])
  end

  def instalar_demandas!
    post_json "/api/templates/instalar", { "template_id" => "gestao-demandas", "com_exemplos" => false, "visibilidade" => "equipe" }
    assert_equal 200, last_response.status, last_response.body
  end

  DCAD = "DCAD - Divisão de Cadastro (Dados)".freeze
  DTAD = "DTAD - Divisão de Tecnologia e Dados".freeze
  DASI = "DASI - Divisão de Articulação com Secretarias".freeze
  GAB = "DGEO - Gabinete do Diretor".freeze

  def demanda(divisao, status: "Em Análise", prioridade: "Média", prazo: nil, titulo: "Demanda")
    { "titulo_processo" => titulo, "status_tramitacao" => status, "prioridade" => prioridade, "divisao_responsavel" => divisao,
      "data_limite" => prazo, "descricao_demanda" => "Teste" }
  end

  def criar_demanda!(dados)
    post_json "/api/modulos/demandas/registros", dados
    assert_equal 201, last_response.status, last_response.body
    resposta["id"]
  end

  # --- estrutura -----------------------------------------------------------------

  def test_arvore_valida_tipo_sigla_ciclo_e_exclusao
    montar!
    get "/api/admin/equipes"
    dgeo = resposta.find { |e| e["sigla"] == "DGEO" }
    assert_equal "SEMEC / SUPLAN / DGEO", dgeo["caminho"]
    assert_equal 2, dgeo["nivel"]
    assert_equal %w[SEMEC SUPLAN DGEO DASI DCAD DTAD DIPLAD SURÇAM], resposta.map { |e| e["sigla"] }, "ordem de árvore"

    post_json "/api/admin/equipes", { "sigla" => "X1", "nome" => "Dep", "tipo" => "departamento", "pai_id" => @dcad }
    assert_equal 422, last_response.status, "departamento dentro de divisão"
    post_json "/api/admin/equipes", { "sigla" => "dgeo", "nome" => "Outro", "tipo" => "departamento", "pai_id" => @suplan }
    assert_match(/já é de/, resposta["error"])
    post_json "/api/admin/equipes", { "nome" => "Sem sigla", "tipo" => "departamento" }
    assert_match(/sigla/, resposta["error"])
    put_json "/api/admin/equipes/#{@suplan}", { "pai_id" => @dtad }
    assert_equal 422, last_response.status, "ciclo"
    delete "/api/admin/equipes/#{@dgeo}"
    assert_equal 422, last_response.status, "unidade com unidades dentro"
    post_json "/api/admin/equipes", { "sigla" => "DCAD2", "nome" => "Divisão interna", "tipo" => "divisao", "pai_id" => @dcad }
    assert_equal 201, last_response.status, "divisão dentro de divisão é aceita"
  end

  def test_estrutura_modelo_nao_duplica
    configurar!
    post_json "/api/admin/equipes/modelo", {}
    assert_equal 9, resposta["criadas"]
    post_json "/api/admin/equipes/modelo", {}
    assert_equal 0, resposta["criadas"]
    assert_equal "SEMEC / SUPLAN / DGEO / DTAD", resposta["equipes"].find { |e| e["sigla"] == "DTAD" }["caminho"]
  end

  # --- árvore em texto (nova estrutura de uma vez) ----------------------------------

  SEMAGRIC = <<~TXT.freeze
    # comentário e linha vazia são ignorados

    SEMAGRIC - Secretaria Municipal de Agricultura
      SUPROD - Subsecretaria de Produção
        - DAGRO - Departamento de Agronegócio
        \tDIVAP – Divisão de Apoio ao Produtor
      SUFIS - Subsecretaria de Fiscalização
        NUCLEO - Núcleo de campo | equipe
  TXT

  def test_arvore_em_texto_cria_com_tipos_pelo_nivel
    configurar!
    post_json "/api/admin/equipes/arvore", { "texto" => SEMAGRIC }
    assert_equal 201, last_response.status, last_response.body
    assert_equal 6, resposta["criadas"]
    t = resposta["equipes"].to_h { |e| [e["sigla"], e] }
    assert_equal %w[secretaria subsecretaria departamento divisao subsecretaria equipe], %w[SEMAGRIC SUPROD DAGRO DIVAP SUFIS NUCLEO].map { |s| t[s]["tipo"] }
    assert_equal "SEMAGRIC / SUPROD / DAGRO / DIVAP", t["DIVAP"]["caminho"]
    assert_equal "Divisão de Apoio ao Produtor", t["DIVAP"]["nome"]

    # Acrescentar dentro de uma que já existe: a sigla é reaproveitada.
    post_json "/api/admin/equipes/arvore", { "texto" => "SUPROD - Outro nome\n  DIVHORT - Divisão de Hortaliças" }
    assert_equal 201, last_response.status, last_response.body
    assert_equal [1, ["SUPROD"]], resposta.values_at("criadas", "reaproveitadas")
    t = resposta["equipes"].to_h { |e| [e["sigla"], e] }
    assert_equal "Subsecretaria de Produção", t["SUPROD"]["nome"], "reaproveitar não renomeia"
    assert_equal "departamento", t["DIVHORT"]["tipo"], "o tipo segue o nível de quem está acima"

    get "/api/admin/equipes/texto?raiz=#{t['SEMAGRIC']['id']}"
    assert_match(/\ASEMAGRIC - Secretaria Municipal de Agricultura \| secretaria\n  SUFIS/, resposta["texto"])
    get "/api/admin/equipes/texto"
    assert_match(/\ASEMEC - Secretaria Municipal de Educação \| secretaria/, resposta["texto"], "sem raiz: o modelo SEMEC")
    # O texto do modelo, criado como está, dá a mesma árvore da estrutura modelo.
    post_json "/api/admin/equipes/arvore", { "texto" => resposta["texto"] }
    assert_equal 201, last_response.status, last_response.body
    t = resposta["equipes"].to_h { |e| [e["sigla"], e] }
    assert_equal "SEMEC / SUPLAN / DGEO / DCAD", t["DCAD"]["caminho"]
    assert_equal "SEMEC / SURÇAM", t["SURÇAM"]["caminho"]
    assert_equal "SEMEC / SUPLAN / DIPEI", t["DIPEI"]["caminho"]
  end

  def test_arvore_em_texto_erros_nao_criam_nada
    configurar!
    [["SEMAGRIC - A\n  X - B\n  X - C", /Linha 3.*já apareceu na linha 2/],
     ["SEMAGRIC - A\n  DEP - B | divisão\n    SUB - C | subsecretaria", /Linha 3 \(SUB\).*não pode ficar dentro/],
     ["SEMAGRIC - A | prefeitura", /Linha 1: tipo 'prefeitura' inválido/],
     ["Secretaria sem sigla", /Linha 1: escreva 'SIGLA - Nome'/],
     ["   \n# só comentário", /Escreva a estrutura/]].each do |texto, erro|
      post_json "/api/admin/equipes/arvore", { "texto" => texto }
      assert_equal 422, last_response.status, texto
      assert_match erro, resposta["error"]
    end
    get "/api/admin/equipes"
    assert_empty resposta, "um erro em qualquer linha não cria nada"
  end

  def test_excluir_arvore_inteira_so_com_cascata
    configurar!
    post_json "/api/admin/equipes/arvore", { "texto" => SEMAGRIC }
    raiz = resposta["equipes"].find { |e| e["sigla"] == "SEMAGRIC" }["id"]
    delete "/api/admin/equipes/#{raiz}"
    assert_equal 422, last_response.status
    delete "/api/admin/equipes/#{raiz}?cascata=1"
    assert_equal 200, last_response.status
    assert_equal 6, resposta["excluidas"]
    get "/api/admin/equipes"
    assert_empty resposta
  end

  def test_gestor_cria_varias_unidades_so_dentro_do_escopo
    montar!
    como("gestor.dgeo") do
      post_json "/api/gestao/arvore", { "pai_id" => @dtad, "texto" => "NUGEO - Núcleo de Geodados\n  EQCAMPO - Equipe de campo | equipe" }
      assert_equal 201, last_response.status, last_response.body
      assert_equal 2, resposta["criadas"]
      post_json "/api/gestao/arvore", { "pai_id" => @diplad, "texto" => "X1 - Fora" }
      assert_equal 403, last_response.status, "DIPLAD está fora do DGEO"
      post_json "/api/gestao/arvore", { "pai_id" => @dtad, "texto" => "SUPLAN - Reaproveitar a de cima\n  X2 - Nada" }
      assert_equal 422, last_response.status, "não reaproveita sigla fora do escopo"
    end
  end

  def test_unidades_do_campo_vem_da_estrutura_escolhida
    configurar!
    post_json "/api/templates/instalar", { "template_id" => "gestao-demandas", "com_exemplos" => true, "visibilidade" => "equipe" }
    post_json "/api/admin/equipes/arvore", { "texto" => SEMAGRIC }
    raiz = resposta["equipes"].find { |e| e["sigla"] == "SEMAGRIC" }["id"]
    put_json "/api/modulos/demandas/unidades", { "raiz_id" => raiz, "nome" => "Demandas da SEMAGRIC" }
    assert_equal 200, last_response.status, last_response.body
    campo = resposta["schema"]["campos"].find { |c| c["id"] == "divisao_responsavel" }
    assert_equal "Demandas da SEMAGRIC", resposta["nome"]
    assert_equal "SEMAGRIC - Secretaria Municipal de Agricultura", campo["opcoes"].first
    assert_includes campo["opcoes"], "DIVAP - Divisão de Apoio ao Produtor"
    assert_includes campo["opcoes"], "DCAD - Divisão de Cadastro (Dados)", "opção usada pelos exemplos fica"
    assert_includes resposta["opcoes_mantidas"], "DCAD - Divisão de Cadastro (Dados)"
    refute_includes campo["opcoes"], "DGEO - Gabinete do Diretor", "opção sem uso sai" if resposta["opcoes_mantidas"].none? { |o| o.start_with?("DGEO") }
    put_json "/api/modulos/anotacoes/unidades", { "raiz_id" => raiz }
    assert_equal 404, last_response.status
  end

  # --- gestão em cascata ----------------------------------------------------------

  def test_gestora_da_suplan_gere_suplan_e_surcam_inteiras
    montar!
    como("gestora.suplan") do
      get "/api/gestao"
      assert_equal 200, last_response.status
      assert_equal %w[DASI DCAD DGEO DIPLAD DTAD SUPLAN SURÇAM], resposta["unidades"].map { |e| e["sigla"] }.sort
      %w[gestora.suplan gestor.dgeo gerente.dtad membro.dcad fora].each { |l| assert(resposta["pessoas"].any? { |p| p["login"] == l }, l) }

      post_json "/api/gestao/usuarios", { "login" => "novo.dtad", "nome" => "Novo", "unidade_id" => @dtad }
      assert_equal 201, last_response.status, last_response.body
      assert resposta["senha_temporaria"]
      novo = resposta["usuario"]["id"]
      post_json "/api/gestao/usuarios", { "login" => "novo.surcam", "nome" => "Novo 2", "unidade_id" => @surcam }
      assert_equal 201, last_response.status
      post_json "/api/gestao/usuarios", { "login" => "adm2", "nome" => "X", "unidade_id" => @surcam, "perfil" => "admin" }
      assert_equal 403, last_response.status, "gestor não cria administrador"
      post_json "/api/gestao/usuarios", { "login" => "x.semec", "nome" => "X", "unidade_id" => @semec }
      assert_equal 403, last_response.status, "SEMEC está acima dela"

      delete "/api/gestao/unidades/#{@dtad}/membros/#{novo}"
      assert_equal 200, last_response.status
      put_json "/api/gestao/unidades/#{@dcad}/membros/#{novo}", { "papel" => "gestor" }
      assert_equal 200, last_response.status
      post_json "/api/gestao/usuarios/#{novo}/ativo", { "ativo" => false }
      assert_equal 200, last_response.status
      delete "/api/gestao/usuarios/#{novo}"
      assert_equal 200, last_response.status
      delete "/api/gestao/unidades/#{@suplan}"
      assert_equal 403, last_response.status, "não exclui a unidade que ela gere"
      post_json "/api/gestao/unidades", { "sigla" => "DNOVO", "nome" => "Departamento novo", "tipo" => "departamento", "pai_id" => @suplan }
      assert_equal 201, last_response.status, last_response.body
    end
  end

  def test_gestor_do_dgeo_e_gerente_do_dtad_so_no_proprio_escopo
    montar!
    como("gestor.dgeo") do
      get "/api/gestao"
      assert_equal %w[DASI DCAD DGEO DTAD], resposta["unidades"].map { |e| e["sigla"] }.sort
      put_json "/api/gestao/unidades/#{@dcad}/membros/#{@fora}", { "papel" => "membro" }
      assert_equal 200, last_response.status
      post_json "/api/gestao/usuarios", { "login" => "x.surcam", "nome" => "X", "unidade_id" => @surcam }
      assert_equal 403, last_response.status
      post_json "/api/gestao/usuarios/#{@fora}/ativo", { "ativo" => false }
      assert_equal 403, last_response.status, "'fora' também está no DIPLAD, fora do alcance do gestor do DGEO"
      post_json "/api/gestao/usuarios/#{@gestora_suplan}/senha-temporaria", {}
      assert_equal 403, last_response.status
    end
    como("gerente.dtad") do
      get "/api/gestao"
      assert_equal %w[DTAD], resposta["unidades"].map { |e| e["sigla"] }
      put_json "/api/gestao/unidades/#{@dtad}/membros/#{@membro_dcad}", { "papel" => "membro" }
      assert_equal 200, last_response.status
      put_json "/api/gestao/unidades/#{@dcad}/membros/#{@gerente_dtad}", { "papel" => "gestor" }
      assert_equal 403, last_response.status, "não se promove fora do DTAD"
      delete "/api/gestao/unidades/#{@dtad}/membros/#{@gerente_dtad}"
      assert_equal 403, last_response.status, "não se tira da unidade que gere"
    end
    como("membro.dcad") do
      get "/api/gestao"
      assert_equal 403, last_response.status, "membro comum não usa a gestão"
      get "/api/status"
      refute resposta["usuario"]["gestor"]
    end
  end

  # --- registros por unidade --------------------------------------------------------

  def test_registros_seguem_a_unidade_em_cascata
    skip "motor C++ não compilado" unless motor?
    montar!
    instalar_demandas!
    dcad = criar_demanda!(demanda(DCAD, titulo: "Do DCAD"))

    get "/api/modulos/demandas"
    assert_nil resposta["opcoes_unidade"], "admin lança em qualquer divisão"
    como("gerente.dtad") do
      get "/api/modulos/demandas"
      assert_equal [DTAD], resposta["opcoes_unidade"]
      post_json "/api/modulos/demandas/registros", demanda(DTAD)
      assert_equal 201, last_response.status
      dtad = resposta["id"]
      post_json "/api/modulos/demandas/registros", demanda(DCAD)
      assert_equal 403, last_response.status, "o gerente do DTAD não lança no DCAD"
      put_json "/api/modulos/demandas/registros/#{dcad}", demanda(DCAD, titulo: "Mudado")
      assert_equal 403, last_response.status, "nem edita o DCAD"
      delete "/api/modulos/demandas/registros/#{dcad}"
      assert_equal 403, last_response.status
      patch_json "/api/modulos/demandas/registros/#{dtad}", { "divisao_responsavel" => DCAD }
      assert_equal 403, last_response.status, "não passa a demanda para o DCAD"
      patch_json "/api/modulos/demandas/registros/#{dtad}", { "status_tramitacao" => "Deferido / Concluído" }
      assert_equal 200, last_response.status
    end
    como("membro.dcad") do
      patch_json "/api/modulos/demandas/registros/#{dcad}", { "prioridade" => "Alta" }
      assert_equal 200, last_response.status, "membro edita a da própria divisão"
      delete "/api/modulos/demandas/registros/#{dcad}"
      assert_equal 403, last_response.status, "excluir é do gestor"
      propria = criar_demanda!(demanda(DCAD, titulo: "Do membro da DCAD"))
      delete "/api/modulos/demandas/registros/#{propria}"
      assert_equal 200, last_response.status, "quem lançou pode excluir"
    end
    como("fora") do
      patch_json "/api/modulos/demandas/registros/#{dcad}", { "prioridade" => "Baixa" }
      assert_equal 403, last_response.status, "DIPLAD não mexe no DGEO"
    end
    como("gestora.suplan") do
      patch_json "/api/modulos/demandas/registros/#{dcad}", { "prioridade" => "Baixa" }
      assert_equal 200, last_response.status, "gestora da SUPLAN edita o que está abaixo"
    end
    como("gestor.dgeo") do
      delete "/api/modulos/demandas/registros/#{dcad}"
      assert_equal 200, last_response.status, "gestor do DGEO exclui da divisão"
    end
  end

  # Anotações (item 2): o caderno criado por alguém e compartilhado com a
  # unidade pode ser excluído por quem gere essa unidade, em cascata.
  def test_caderno_de_anotacoes_excluido_em_cascata
    montar!
    como("gerente.dtad") do
      post_json "/api/templates/instalar", { "template_id" => "anotacoes", "com_exemplos" => true }
      assert_equal 200, last_response.status, last_response.body
      put_json "/api/modulos/anotacoes/compartilhar", { "visibilidade" => "equipes", "equipes" => [@dtad] }
      assert_equal 200, last_response.status, last_response.body
    end
    como("membro.dcad") do
      get "/api/modulos/anotacoes"
      assert_equal 404, last_response.status, "DCAD não vê o caderno do DTAD"
    end
    como("fora") do
      delete "/api/modulos/anotacoes"
      assert_equal 404, last_response.status
    end
    como("gestor.dgeo") do
      get "/api/modulos/anotacoes"
      assert resposta["editavel"], "gestor do DGEO altera o que é do DTAD"
      delete "/api/modulos/anotacoes"
      assert_equal 200, last_response.status
    end
  end

  # --- produtividade (função mestre) ----------------------------------------------

  def test_produtividade_soma_de_baixo_para_cima
    skip "motor C++ não compilado" unless motor?
    montar!
    instalar_demandas!
    hoje = Date.today
    criar_demanda!(demanda(DCAD, prazo: (hoje - 2).iso8601))                       # atrasada
    criar_demanda!(demanda(DCAD, status: "Deferido / Concluído", prazo: (hoje - 2).iso8601))
    criar_demanda!(demanda(DTAD, prazo: (hoje + 3).iso8601))                       # vence em 7 dias
    criar_demanda!(demanda(DTAD, status: "Indeferido / Arquivado"))
    criar_demanda!(demanda(DASI))                                                  # sem prazo
    criar_demanda!(demanda(GAB, prazo: (hoje + 30).iso8601))                       # do próprio DGEO

    get "/api/produtividade?modulo=demandas"
    assert_equal 200, last_response.status, last_response.body
    u = resposta["unidades"].to_h { |x| [x["sigla"], x] }
    assert_equal 2, u["DCAD"]["total"]["total"]
    assert_equal 1, u["DCAD"]["total"]["atrasados"]
    assert_equal 1, u["DTAD"]["total"]["vencem_7"]
    assert_equal 1, u["DTAD"]["total"]["encerrados"]
    assert_equal 1, u["DGEO"]["direto"]["total"], "Gabinete do Diretor conta no próprio DGEO"
    assert_equal 6, u["DGEO"]["total"]["total"], "DGEO = DCAD + DTAD + DASI + o dele"
    assert_equal 6, u["SUPLAN"]["total"]["total"], "SUPLAN recebe o DGEO"
    assert_equal 6, u["SEMEC"]["total"]["total"], "SEMEC recebe a SUPLAN"
    assert_equal 0, u["SURÇAM"]["total"]["total"]
    dgeo = u["DGEO"]["total"]
    assert_equal [1, 1, 4, 1, 1, 1], dgeo.values_at("concluidos", "encerrados", "andamento", "atrasados", "vencem_7", "sem_prazo")
    assert_in_delta 33.3, dgeo["taxa"], 0.1

    get "/api/produtividade"
    assert_equal 6, resposta["unidades"].find { |x| x["sigla"] == "SEMEC" }["total"]["total"], "sem módulo: soma os dois (SEI vazio)"

    como("gerente.dtad") do
      get "/api/produtividade"
      assert_equal %w[DTAD], resposta["unidades"].map { |x| x["sigla"] }, "gestor vê só o escopo"
      assert_nil resposta["sem_unidade"]
    end
    como("membro.dcad") do
      get "/api/produtividade"
      assert_equal 403, last_response.status
    end
  end

  # --- classificar por ------------------------------------------------------------

  def test_classificar_por
    skip "motor C++ não compilado" unless motor?
    configurar!
    instalar_demandas!
    hoje = Date.today
    criar_demanda!(demanda(DCAD, prioridade: "Baixa", prazo: (hoje + 9).iso8601, titulo: "beta"))
    criar_demanda!(demanda(DCAD, prioridade: "Urgente (Prazo Legal / Judicial)", titulo: "Álvaro"))
    criar_demanda!(demanda(DCAD, prioridade: "Alta", prazo: (hoje + 1).iso8601, titulo: "carta"))
    lista = ->(ordem) { get "/api/modulos/demandas/registros?ordem=#{ordem}"; resposta["result"].map { |r| r["titulo_processo"] } }
    assert_equal %w[Álvaro beta carta], lista.("titulo_processo:asc"), "A-Z sem diferenciar acento"
    assert_equal %w[carta beta Álvaro], lista.("data_limite:asc"), "prazo mais próximo primeiro; sem prazo no fim"
    assert_equal %w[Álvaro carta beta], lista.("prioridade:desc"), "seleção na ordem das opções"
    assert_equal %w[beta Álvaro carta], lista.("_criado_em:asc")
    assert_equal %w[carta Álvaro beta], lista.("nao_existe:asc"), "inválido: ordem padrão (mais novo antes)"
  end

  # Achado no teste de ponta a ponta: uma requisição ainda em voo regravava o
  # cookie da sessão depois do "Sair". O id da sessão encerrada não vale mais.
  def test_cookie_de_sessao_encerrada_nao_volta
    configurar!(usuario: "dono", senha: SENHA)
    entrar("dono", SENHA)
    antigo = rack_mock_session.cookie_jar["rack.session"]
    refute_nil antigo
    post_json "/api/logout", {}
    set_cookie "rack.session=#{antigo}"
    get "/api/eu"
    assert_equal 401, last_response.status, "o cookie de antes do Sair não pode reabrir a sessão"
    assert_equal 200, entrar("dono", SENHA).status
    get "/api/eu"
    assert_equal 200, last_response.status, "um login novo funciona"
  end

  def test_tema_floresta
    configurar!
    %w[floresta_dia floresta_tarde floresta_noite].each do |t|
      put_json "/api/eu/preferencias", { "tema" => t }
      assert_equal t, resposta["preferencias"]["tema"]
    end
  end

  # Duas de cada (pedido 8): secretariasteste1/2 > subsecretariasteste > departamentoteste > divisaoteste,
  # com usuariodepartamentoteste1/2. Um não enxerga nem altera o que é do outro.
  def test_duas_de_cada_nao_se_misturam
    skip "motor C++ não compilado" unless motor?
    configurar!
    ids = {}
    [1, 2].each do |n|
      ids["sec#{n}"] = unidade!("SECTESTE#{n}", "secretaria", nome: "secretariasteste#{n}")
      ids["sub#{n}"] = unidade!("SUBTESTE#{n}", "subsecretaria", ids["sec#{n}"], nome: "subsecretariateste#{n}")
      ids["dep#{n}"] = unidade!("DEPTESTE#{n}", "departamento", ids["sub#{n}"], nome: "departamentoteste#{n}")
      ids["div#{n}"] = unidade!("DIVTESTE#{n}", "divisao", ids["dep#{n}"], nome: "divisaoteste#{n}")
      usuario!("usuariosecretariateste#{n}", gestor_de: [ids["sec#{n}"]])
      usuario!("usuariodepartamentoteste#{n}", gestor_de: [ids["dep#{n}"]])
      usuario!("usuariodivisaoteste#{n}", unidades: [ids["div#{n}"]])
    end
    post_json "/api/modulos", { "slug" => "teste_mod", "nome" => "Teste", "unidade" => "unidade",
                                "produtividade" => { "status" => "status", "concluido" => ["Feito"] },
                                "campos" => [{ "id" => "t", "nome" => "T", "tipo" => "texto" },
                                             { "id" => "unidade", "nome" => "Unidade", "tipo" => "selecao", "opcoes" => %w[DIVTESTE1 DIVTESTE2 DEPTESTE1] },
                                             { "id" => "status", "nome" => "Status", "tipo" => "selecao", "opcoes" => %w[Aberto Feito] }] }
    assert_equal 201, last_response.status, last_response.body
    put_json "/api/modulos/teste_mod/compartilhar", { "visibilidade" => "todos" }

    como("usuariodivisaoteste1") do
      post_json "/api/modulos/teste_mod/registros", { "t" => "a", "unidade" => "DIVTESTE1", "status" => "Aberto" }
      assert_equal 201, last_response.status
      post_json "/api/modulos/teste_mod/registros", { "t" => "b", "unidade" => "DIVTESTE2", "status" => "Aberto" }
      assert_equal 403, last_response.status
    end
    como("usuariodepartamentoteste2") do
      post_json "/api/modulos/teste_mod/registros", { "t" => "c", "unidade" => "DIVTESTE2", "status" => "Feito" }
      assert_equal 201, last_response.status, "gestor do departamento 2 lança na divisão 2"
      post_json "/api/modulos/teste_mod/registros", { "t" => "d", "unidade" => "DEPTESTE1", "status" => "Aberto" }
      assert_equal 403, last_response.status
      get "/api/produtividade"
      assert_equal %w[DEPTESTE2 DIVTESTE2], resposta["unidades"].map { |x| x["sigla"] }
      assert_equal 1, resposta["unidades"].first["total"]["concluidos"]
    end
    como("usuariosecretariateste1") do
      get "/api/produtividade"
      sec = resposta["unidades"].find { |x| x["sigla"] == "SECTESTE1" }
      assert_equal 1, sec["total"]["total"], "secretaria 1 só soma a sua árvore"
      refute(resposta["unidades"].any? { |x| x["sigla"].end_with?("2") })
    end
  end
end
