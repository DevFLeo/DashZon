require_relative "test_helper"

# Relatório de testes (21/10/2026), problemas 1, 2 e 3: visibilidade por
# equipe, módulos com dono e o perfil visualizador com aprovação.
class AcessoTest < Minitest::Test
  include DashZonTeste

  SENHA = "123ZX456"

  def usuario!(login, perfil: "usuario", equipes: [])
    post_json "/api/admin/usuarios", { "login" => login, "nome" => login, "senha" => SENHA, "perfil" => perfil,
                                       "deve_trocar_senha" => false, "equipes" => equipes }
    assert_equal 201, last_response.status, last_response.body
    resposta["usuario"]["id"]
  end

  def equipe!(nome)
    post_json "/api/admin/equipes", { "nome" => nome }
    assert_equal 201, last_response.status, last_response.body
    resposta["id"]
  end

  def como(login)
    entrar(login, login == "dono" ? "senha-forte-1" : SENHA)
    yield
  ensure
    entrar("dono", "senha-forte-1")
  end

  def dashboards_de(login)
    como(login) { get "/api/dashboards"; return resposta.map { |d| d["nome"] }.sort }
  end

  def modulos_de(login)
    como(login) { get "/api/modulos"; return resposta.map { |m| m["nome"] }.sort }
  end

  def test_dashboard_por_equipe
    configurar!
    verm = equipe!("Vermelha")
    azul = equipe!("Azul")
    usuario!("teste 1", equipes: [verm])
    usuario!("teste 2", equipes: [verm, azul])
    usuario!("teste 3", equipes: [azul])
    usuario!("leonardo")
    post_json "/api/dashboards", { "nome" => "Painel Vermelho", "visibilidade" => "equipes", "equipes" => [verm] }
    assert_equal 201, last_response.status, last_response.body
    post_json "/api/dashboards", { "nome" => "Painel Azul", "visibilidade" => "equipes", "equipes" => [azul] }
    post_json "/api/dashboards", { "nome" => "Privado do admin" }

    assert_equal ["Painel Vermelho"], dashboards_de("teste 1") - ["Visão geral"]
    assert_equal ["Painel Azul", "Painel Vermelho"], dashboards_de("teste 2") - ["Visão geral"]
    assert_equal ["Painel Azul"], dashboards_de("teste 3") - ["Visão geral"]
    assert_equal [], dashboards_de("leonardo") - ["Visão geral"]
    assert_includes dashboards_de("dono"), "Painel Azul", "o administrador vê os das equipes"

    get "/api/dashboards"
    azul_id = resposta.find { |d| d["nome"] == "Painel Azul" }["id"]
    como("teste 1") do
      get "/api/dashboards/#{azul_id}"
      assert_equal 404, last_response.status
    end
    get "/api/dashboards/#{azul_id}"
    assert_equal [{ "id" => azul, "nome" => "Azul" }], resposta["equipes"]

    # Quem não é admin só compartilha com as próprias equipes.
    como("teste 1") do
      post_json "/api/dashboards", { "nome" => "Meu", "visibilidade" => "equipes", "equipes" => [azul] }
      assert_equal 403, last_response.status
      post_json "/api/dashboards", { "nome" => "Meu", "visibilidade" => "equipes", "equipes" => [verm] }
      assert_equal 201, last_response.status
      get "/api/equipes"
      assert_equal ["Vermelha"], resposta.map { |e| e["nome"] }
    end
    post_json "/api/dashboards", { "nome" => "Sem equipe", "visibilidade" => "equipes", "equipes" => [] }
    assert_equal 422, last_response.status
  end

  def test_modulo_do_admin_nao_aparece_para_os_outros
    configurar!
    verm = equipe!("Vermelha")
    usuario!("teste 1", equipes: [verm])
    usuario!("leonardo")
    post_json "/api/templates/instalar", { "template_id" => "lote-producao", "com_exemplos" => true }
    assert_equal 200, last_response.status, last_response.body
    dash = resposta["dashboards"].first

    assert_equal [], modulos_de("teste 1"), "módulo novo nasce privado"
    como("teste 1") do
      get "/api/modulos/lotes_producao/registros"
      assert_equal 404, last_response.status
    end

    # Compartilhar o dashboard com a equipe libera os módulos dos cards dele.
    put_json "/api/dashboards/#{dash}", { "visibilidade" => "equipes", "equipes" => [verm] }
    assert_equal 200, last_response.status, last_response.body
    assert_equal ["Lotes de produção"], modulos_de("teste 1")
    assert_equal [], modulos_de("leonardo")
    como("teste 1") do
      get "/api/modulos/lotes_producao/registros"
      assert_equal 8, resposta["count"]
      put_json "/api/modulos/lotes_producao", { "nome" => "Mudado" }
      assert_equal 403, last_response.status, "estrutura: só o dono ou um admin"
      delete "/api/modulos/lotes_producao"
      assert_equal 403, last_response.status
    end

    # Compartilhar o módulo com todos.
    put_json "/api/modulos/lotes_producao/compartilhar", { "visibilidade" => "todos" }
    assert_equal 200, last_response.status, last_response.body
    assert_equal ["Lotes de produção"], modulos_de("leonardo")
  end

  def test_template_nao_reaproveita_modulo_de_outra_pessoa
    configurar!
    usuario!("leonardo")
    post_json "/api/templates/instalar", { "template_id" => "lote-producao", "com_exemplos" => false }
    como("leonardo") do
      post_json "/api/templates/instalar", { "template_id" => "lote-producao", "com_exemplos" => false }
      assert_equal 200, last_response.status, last_response.body
      assert_empty resposta["reaproveitados"]
      get "/api/modulos"
      assert_equal ["Lotes de produção (2)"], resposta.map { |m| m["nome"] }
      get "/api/export"
      assert_equal ["Lotes de produção (2)"], resposta["modulos"].map { |m| m["nome"] }, "a exportação leva só o que a pessoa vê"
    end
  end

  # Dashboard de teste (privado) não grava nos módulos de todos: ganha os
  # dele, com os dados de exemplo, e reaproveita essa cópia nas próximas vezes.
  def test_template_privado_nao_reaproveita_modulo_de_todos
    configurar!
    post_json "/api/templates/instalar", { "template_id" => "gestao-demandas", "com_exemplos" => false, "visibilidade" => "equipe" }
    assert_equal 200, last_response.status, last_response.body

    post_json "/api/templates/instalar", { "template_id" => "gestao-demandas", "com_exemplos" => true, "visibilidade" => "privado" }
    assert_equal 200, last_response.status, last_response.body
    assert_empty resposta["reaproveitados"]
    get "/api/modulos"
    copia = resposta.find { |m| m["nome"] == "Demandas (2)" }
    assert_equal "privado", copia["visibilidade"]
    assert_operator copia["total"], :>, 0, "o teste recebe os dados de exemplo"
    assert_equal 0, resposta.find { |m| m["nome"] == "Demandas" }["total"], "o módulo de todos não recebe nada"

    post_json "/api/templates/instalar", { "template_id" => "gestao-demandas", "com_exemplos" => true, "visibilidade" => "privado" }
    assert_equal ["Demandas (2)"], resposta["reaproveitados"]
    get "/api/modulos"
    assert_equal ["Demandas", "Demandas (2)"], resposta.map { |m| m["nome"] }.select { |n| n.start_with?("Demandas") }
  end

  # Dashboard para todos não expõe o módulo privado de quem instalou.
  def test_template_para_todos_nao_reaproveita_modulo_privado
    configurar!
    usuario!("leonardo")
    post_json "/api/templates/instalar", { "template_id" => "gestao-demandas", "com_exemplos" => true, "visibilidade" => "privado" }
    assert_equal 200, last_response.status, last_response.body

    post_json "/api/templates/instalar", { "template_id" => "gestao-demandas", "com_exemplos" => false, "visibilidade" => "equipe" }
    assert_equal 200, last_response.status, last_response.body
    assert_empty resposta["reaproveitados"]
    assert_equal ["Demandas (2)"], modulos_de("leonardo")
  end

  def test_modulos_que_ja_existiam_continuam_de_todos
    configurar!
    post_json "/api/templates/instalar", { "template_id" => "lote-producao", "com_exemplos" => false }
    Database.execute("UPDATE modulos SET visibilidade = 'todos'") # como num banco de antes
    usuario!("leonardo")
    assert_equal ["Lotes de produção"], modulos_de("leonardo")
  end

  def test_visualizador_pede_e_o_dono_do_modulo_aprova
    configurar!
    lote = equipe!("Jhorjé Maüro")
    t4 = usuario!("teste 4", equipes: [lote])
    usuario!("teste 5", perfil: "visualizador", equipes: [lote])
    post_json "/api/templates/instalar", { "template_id" => "lote-producao", "com_exemplos" => true }
    dash = resposta["dashboards"].first
    put_json "/api/dashboards/#{dash}", { "visibilidade" => "equipes", "equipes" => [lote], "dono_id" => t4 }
    put_json "/api/modulos/lotes_producao/compartilhar", { "visibilidade" => "equipes", "equipes" => [lote], "dono_id" => t4 }
    assert_equal 200, last_response.status, last_response.body

    id_existente = nil
    como("teste 5") do
      post_json "/api/dashboards", { "nome" => "Meu" }
      assert_equal 403, last_response.status, "visualizador não cria dashboard"
      post_json "/api/templates/instalar", { "template_id" => "anotacoes" }
      assert_equal 403, last_response.status

      post_json "/api/modulos/lotes_producao/registros", { "codigo" => "L-T5", "produto" => "Jhorjé Maüro", "quantidade" => 10, "status" => "Planejado" }
      assert_equal 202, last_response.status, last_response.body
      assert_match(/aprovação de teste 4/, resposta["mensagem"])
      post_json "/api/modulos/lotes_producao/registros", { "codigo" => "", "quantidade" => "abc" }
      assert_equal 422, last_response.status, "dado inválido é recusado já no pedido"

      get "/api/modulos/lotes_producao/registros?limite=1"
      id_existente = resposta["result"].first["id"]
      delete "/api/modulos/lotes_producao/registros/#{id_existente}"
      assert_equal 202, last_response.status
      get "/api/modulos/lotes_producao/registros"
      assert_equal 8, resposta["count"], "nada foi gravado ainda"
      get "/api/solicitacoes/contagem"
      assert_equal 2, resposta["minhas_pendentes"]
      post_json "/api/solicitacoes/1/aprovar", {}
      assert_equal 403, last_response.status, "visualizador não aprova"
    end

    como("teste 4") do
      get "/api/solicitacoes"
      pendentes = resposta["pendentes"]
      assert_equal %w[criar excluir], pendentes.map { |s| s["acao"] }
      assert_equal "teste 5", pendentes.first["solicitante"]
      assert_equal "Jhorjé Maüro", pendentes.first["dados"]["produto"]
      assert_equal id_existente, pendentes.last["antes"]["id"]
      post_json "/api/solicitacoes/#{pendentes.first['id']}/aprovar", {}
      assert_equal 200, last_response.status, last_response.body
      post_json "/api/solicitacoes/#{pendentes.last['id']}/negar", { "motivo" => "Lote em uso" }
      assert_equal 200, last_response.status
      post_json "/api/solicitacoes/#{pendentes.last['id']}/aprovar", {}
      assert_equal 409, last_response.status, "já decidido"
      get "/api/modulos/lotes_producao/registros"
      assert_equal 9, resposta["count"], "o aprovado entrou; o negado não apagou"
    end

    como("teste 5") do
      get "/api/solicitacoes"
      assert_equal({ "criar" => "aprovada", "excluir" => "negada" }, resposta["minhas"].to_h { |s| [s["acao"], s["status"]] })
      assert_equal "Lote em uso", resposta["minhas"].find { |s| s["acao"] == "excluir" }["motivo"]
    end
  end

  # Problema 6: o diário registra as alterações (quem, o quê, alvo), sem senha.
  def test_diario_registra_alteracoes
    configurar!
    verm = equipe!("Vermelha")
    usuario!("teste 1", equipes: [verm])
    usuario!("teste 5", perfil: "visualizador")
    post_json "/api/dashboards", { "nome" => "Painel Vermelho", "visibilidade" => "equipes", "equipes" => [verm] }
    dash = resposta["id"]
    put_json "/api/dashboards/#{dash}", { "nome" => "Painel V" }
    post_json "/api/templates/instalar", { "template_id" => "lote-producao", "com_exemplos" => true }
    put_json "/api/modulos/lotes_producao/compartilhar", { "visibilidade" => "todos" }
    delete "/api/dashboards/#{dash}"
    como("teste 5") { post_json "/api/modulos/lotes_producao/registros", { "codigo" => "X", "produto" => "Y", "quantidade" => 1, "status" => "Planejado" } }
    post_json "/api/admin/usuarios", { "login" => "ruim", "nome" => "x", "senha" => "1" } # falha: não registra

    get "/api/admin/seguranca"
    ev = resposta["eventos"].reject { |e| %w[login_ok logout].include?(e["tipo"]) }.reverse
    tipos = ev.map { |e| e["tipo"] }
    %w[equipe_criada usuario_criado dashboard_criado dashboard_alterado template_instalado modulo_compartilhado dashboard_excluido pedido_criado].each do |t|
      assert_includes tipos, t
    end
    assert_equal 2, tipos.count("usuario_criado"), "a criação que falhou não entra"
    criado = ev.find { |e| e["tipo"] == "dashboard_criado" }
    assert_equal "dono", criado["login"], "quem fez"
    assert_match(/equipes: Vermelha/, criado["detalhe"])
    assert_match(/dashboard Painel V/, ev.find { |e| e["tipo"] == "dashboard_excluido" }["detalhe"], "o nome é lido antes de excluir")
    assert_equal "teste 5", ev.find { |e| e["tipo"] == "pedido_criado" }["login"]
    refute(resposta["eventos"].any? { |e| e["detalhe"].to_s.include?(SENHA) }, "senha nunca vai para o diário")
  end
end
