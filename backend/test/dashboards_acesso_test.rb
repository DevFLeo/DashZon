require_relative "test_helper"

# Dashboards com dono: cada pessoa vê os seus e os da equipe; só o dono (ou um
# admin, nos da equipe) altera; layout fixado não se move.
class DashboardsAcessoTest < Minitest::Test
  include DashZonTeste

  def setup
    super
    post_json "/api/setup", { "usuario" => "dono", "senha" => "senha-forte-1", "templates" => ["gestao-demandas"], "com_exemplos" => true }
    assert_equal 200, last_response.status, last_response.body
    @admin_id = Database.row("SELECT id FROM usuarios WHERE login = 'dono'")["id"]
    @bia = criar("bia")
    @caio = criar("caio")
  end

  def criar(login)
    post_json "/api/admin/usuarios", { "login" => login, "nome" => login.capitalize, "senha" => "senha-de-#{login}", "deve_trocar_senha" => false }
    assert_equal 201, last_response.status, last_response.body
    resposta["usuario"]["id"]
  end

  def como(login)
    assert_equal 200, entrar(login, login == "dono" ? "senha-forte-1" : "senha-de-#{login}").status
  end

  def lista
    get "/api/dashboards"
    assert_equal 200, last_response.status, last_response.body
    resposta
  end

  def novo_dashboard(nome, extra = {})
    post_json "/api/dashboards", { "nome" => nome }.merge(extra)
    assert_equal 201, last_response.status, last_response.body
    resposta["id"]
  end

  def novo_card(dash_id)
    post_json "/api/dashboards/#{dash_id}/widgets",
              { "titulo" => "Total", "tipo" => "kpi", "modulo" => "demandas", "config" => { "agregacao" => "contagem" } }
    assert_equal 201, last_response.status, last_response.body
    resposta["id"]
  end

  # --- o problema relatado ----------------------------------------------------

  def test_dashboard_novo_e_privado_de_quem_criou
    como("bia")
    id = novo_dashboard("Meu painel")
    d = lista.find { |x| x["id"] == id }
    assert_equal "privado", d["visibilidade"]
    assert d["editavel"]
    assert_equal @bia, d["dono_id"]

    como("caio")
    refute(lista.any? { |x| x["id"] == id }, "outro usuário não pode ver o dashboard privado")
    get "/api/dashboards/#{id}"
    assert_equal 404, last_response.status

    como("dono") # nem o administrador vê o privado de outra pessoa
    refute(lista.any? { |x| x["id"] == id })
    get "/api/dashboards/#{id}"
    assert_equal 404, last_response.status
  end

  def test_cards_de_dashboard_privado_ficam_protegidos
    como("bia")
    id = novo_dashboard("Meu painel")
    card = novo_card(id)
    como("caio")
    get "/api/widgets/#{card}/data"
    assert_equal 404, last_response.status
    put_json "/api/widgets/#{card}/layout", { "x" => 0, "y" => 0, "w" => 3, "h" => 2 }
    assert_equal 404, last_response.status
    delete "/api/widgets/#{card}"
    assert_equal 404, last_response.status
    post_json "/api/dashboards/#{id}/widgets", { "titulo" => "X", "tipo" => "kpi", "modulo" => "demandas", "config" => { "agregacao" => "contagem" } }
    assert_equal 404, last_response.status
  end

  # --- compartilhar com a equipe -------------------------------------------------

  def test_compartilhado_todos_veem_so_o_dono_ou_admin_altera
    como("bia")
    id = novo_dashboard("Painel da produção")
    card = novo_card(id)
    put_json "/api/dashboards/#{id}", { "visibilidade" => "equipe" }
    assert_equal 200, last_response.status

    como("caio")
    d = lista.find { |x| x["id"] == id }
    refute_nil d, "compartilhado aparece para a equipe"
    refute d["editavel"]
    assert_equal "Bia", d["dono_nome"]
    get "/api/widgets/#{card}/data"
    assert_equal 200, last_response.status
    put_json "/api/dashboards/#{id}", { "nome" => "Tomado" }
    assert_equal 403, last_response.status
    delete "/api/dashboards/#{id}"
    assert_equal 403, last_response.status
    put_json "/api/widgets/#{card}/layout", { "x" => 1, "y" => 0, "w" => 3, "h" => 2 }
    assert_equal 403, last_response.status

    como("dono")
    assert(lista.find { |x| x["id"] == id }["editavel"], "admin altera dashboards da equipe")
    put_json "/api/dashboards/#{id}", { "nome" => "Produção (revisado)" }
    assert_equal 200, last_response.status
  end

  def test_compartilhar_ao_criar
    como("bia")
    id = novo_dashboard("Já nasce da equipe", "visibilidade" => "equipe")
    como("caio")
    assert(lista.any? { |x| x["id"] == id })
  end

  def test_visibilidade_invalida
    como("bia")
    id = novo_dashboard("X")
    put_json "/api/dashboards/#{id}", { "visibilidade" => "publico" }
    assert_equal 422, last_response.status
  end

  # --- fixar o layout ----------------------------------------------------------------

  def test_layout_fixado_nao_se_move
    como("bia")
    id = novo_dashboard("Painel")
    card = novo_card(id)
    put_json "/api/dashboards/#{id}", { "fixo" => true }
    assert lista.find { |x| x["id"] == id }["fixo"]
    put_json "/api/widgets/#{card}/layout", { "x" => 4, "y" => 0, "w" => 3, "h" => 2 }
    assert_equal 409, last_response.status
    assert_equal 0, Database.row("SELECT x FROM widgets WHERE id = ?", [card])["x"]

    put_json "/api/dashboards/#{id}", { "fixo" => false }
    put_json "/api/widgets/#{card}/layout", { "x" => 4, "y" => 0, "w" => 3, "h" => 2 }
    assert_equal 200, last_response.status
    assert_equal 4, Database.row("SELECT x FROM widgets WHERE id = ?", [card])["x"]
  end

  def test_fixar_nao_muda_o_nome
    como("bia")
    id = novo_dashboard("Nome certo")
    put_json "/api/dashboards/#{id}", { "fixo" => true }
    assert_equal "Nome certo", lista.find { |x| x["id"] == id }["nome"]
  end

  # --- transferir, exportar, dashboards antigos, exclusão ------------------------------

  def test_so_admin_transfere
    como("bia")
    id = novo_dashboard("Painel", "visibilidade" => "equipe")
    put_json "/api/dashboards/#{id}", { "dono_id" => @caio }
    assert_equal 403, last_response.status

    como("dono")
    put_json "/api/dashboards/#{id}", { "dono_id" => @caio, "visibilidade" => "privado" }
    assert_equal 200, last_response.status
    como("caio")
    d = lista.find { |x| x["id"] == id }
    assert_equal @caio, d["dono_id"]
    assert d["editavel"]
    como("bia")
    refute(lista.any? { |x| x["id"] == id })
  end

  def test_template_instalado_por_usuario_e_privado_dele
    como("bia")
    post_json "/api/templates/instalar", { "template_id" => "financas-pessoais", "com_exemplos" => false }
    assert_equal 200, last_response.status, last_response.body
    novos = resposta["dashboards"]
    assert_equal ["privado"], lista.select { |x| novos.include?(x["id"]) }.map { |x| x["visibilidade"] }.uniq
    como("caio")
    assert_empty(lista.select { |x| novos.include?(x["id"]) })
  end

  def test_exportacao_nao_leva_privado_dos_outros
    como("bia")
    novo_dashboard("Segredo da Bia")
    como("caio")
    get "/api/export"
    nomes = JSON.parse(last_response.body)["dashboards"].map { |d| d["nome"] }
    refute_includes nomes, "Segredo da Bia"
    assert_includes nomes, "Demandas" # o da equipe (setup) continua
  end

  def test_dashboards_do_setup_sao_da_equipe
    como("caio")
    d = lista.find { |x| x["nome"] == "Demandas" }
    assert_equal "equipe", d["visibilidade"]
    assert_equal @admin_id, d["dono_id"]
  end

  def test_dashboards_antigos_viram_da_equipe_do_admin
    # Como num banco de antes desta versão: sem dono.
    Database.execute("INSERT INTO dashboards (nome, criado_em, atualizado_em) VALUES ('Antigo', ?, ?)", [Database.now, Database.now])
    Database.execute("UPDATE dashboards SET dono_id = NULL WHERE nome = 'Antigo'")
    Database.fechar! # próxima conexão roda a migração de novo
    como("caio")
    d = lista.find { |x| x["nome"] == "Antigo" }
    refute_nil d, "ninguém perde o acesso que tinha"
    assert_equal "equipe", d["visibilidade"]
    assert_equal @admin_id, d["dono_id"]
  end

  def test_excluir_conta_passa_os_dashboards_para_o_admin
    como("bia")
    id = novo_dashboard("Painel da Bia")
    como("dono")
    delete "/api/admin/usuarios/#{@bia}"
    assert_equal 200, last_response.status
    d = lista.find { |x| x["id"] == id }
    refute_nil d, "o privado da Bia passa para quem excluiu"
    assert_equal @admin_id, d["dono_id"]
  end
end
