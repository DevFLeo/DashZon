require_relative "test_helper"

# Equipes (grupos de usuários, que podem ser empresa) e a empresa de teste.
class EquipesTest < Minitest::Test
  include DashZonTeste

  CNPJ = "11.222.333/0001-81" # válido

  def setup
    super
    configurar!
  end

  def criar_equipe(dados)
    post_json "/api/admin/equipes", dados
    assert_equal 201, last_response.status, last_response.body
    resposta
  end

  def criar_usuario(login, extra = {})
    post_json "/api/admin/usuarios", { "login" => login, "nome" => login.capitalize, "senha" => "senha-de-#{login}-1", "deve_trocar_senha" => false }.merge(extra)
    assert_equal 201, last_response.status, last_response.body
    resposta["usuario"]["id"]
  end

  def equipes_de(login)
    get "/api/admin/usuarios"
    resposta.find { |u| u["login"] == login }["equipes"].map { |e| e["nome"] }
  end

  # --- criar ---------------------------------------------------------------------

  def test_equipe_simples
    e = criar_equipe("nome" => "Produção", "descricao" => "Chão de fábrica")
    refute e["empresa"]
    assert_nil e["cnpj"]
    assert_equal 0, e["total"]
  end

  def test_empresa_com_cnpj_obrigatorio
    post_json "/api/admin/equipes", { "nome" => "Zon Ltda", "empresa" => true, "exigir_cnpj" => true }
    assert_equal 422, last_response.status
    assert_match(/CNPJ/, resposta["error"])
    post_json "/api/admin/equipes", { "nome" => "Zon Ltda", "empresa" => true, "exigir_cnpj" => true, "cnpj" => "11.222.333/0001-80" }
    assert_equal 422, last_response.status # dígito errado
    e = criar_equipe("nome" => "Zon Ltda", "empresa" => true, "exigir_cnpj" => true, "cnpj" => CNPJ)
    assert e["empresa"]
    assert_equal "**.***.333/0001-**", e["cnpj"]
  end

  def test_empresa_com_cnpj_opcional
    e = criar_equipe("nome" => "Parceiro", "empresa" => true, "exigir_cnpj" => false)
    assert e["empresa"]
    assert_nil e["cnpj"]
  end

  def test_cpf_nao_serve_como_cnpj
    post_json "/api/admin/equipes", { "nome" => "X", "empresa" => true, "cnpj" => "529.982.247-25" }
    assert_equal 422, last_response.status
  end

  def test_nome_e_cnpj_unicos
    criar_equipe("nome" => "Vendas", "empresa" => true, "cnpj" => CNPJ)
    post_json "/api/admin/equipes", { "nome" => "VENDAS" }
    assert_equal 422, last_response.status
    post_json "/api/admin/equipes", { "nome" => "Outra", "empresa" => true, "cnpj" => "11222333000181" }
    assert_equal 422, last_response.status
  end

  def test_cnpj_nao_fica_em_texto_no_banco
    criar_equipe("nome" => "Zon", "empresa" => true, "cnpj" => CNPJ)
    linha = Database.row("SELECT * FROM equipes WHERE nome = 'Zon'")
    refute_includes linha.values.map(&:to_s).join("|"), "11222333000181"
  end

  def test_equipe_que_deixa_de_ser_empresa_perde_o_cnpj
    e = criar_equipe("nome" => "Zon", "empresa" => true, "cnpj" => CNPJ)
    put_json "/api/admin/equipes/#{e['id']}", { "empresa" => false }
    assert_equal 200, last_response.status
    assert_nil resposta["cnpj"]
    assert_nil Database.row("SELECT cnpj_hash FROM equipes WHERE id = ?", [e["id"]])["cnpj_hash"]
  end

  def test_editar_sem_mandar_cnpj_mantem
    e = criar_equipe("nome" => "Zon", "empresa" => true, "exigir_cnpj" => true, "cnpj" => CNPJ)
    put_json "/api/admin/equipes/#{e['id']}", { "nome" => "Zon Indústria" }
    assert_equal 200, last_response.status, last_response.body
    assert_equal "**.***.333/0001-**", resposta["cnpj"]
  end

  # --- empresa de teste --------------------------------------------------------------

  def test_empresa_de_teste
    post_json "/api/admin/equipes/teste"
    assert_equal 201, last_response.status, last_response.body
    t1 = resposta
    assert t1["teste"] && t1["empresa"] && t1["exigir_cnpj"]
    assert_equal "Empresa Teste", t1["nome"]
    assert_match(/\A\*\*\.\*\*\*\.\d{3}\/0001-\*\*\z/, t1["cnpj"])
    post_json "/api/admin/equipes/teste"
    assert_equal "Empresa Teste (2)", resposta["nome"]
  end

  def test_cnpj_ficticio_sempre_valido
    50.times { assert Documento.cnpj_valido?(Documento.gerar_cnpj_ficticio) }
  end

  # --- membros: nenhuma, uma ou várias -------------------------------------------------

  def test_usuario_em_nenhuma_uma_ou_varias
    a = criar_equipe("nome" => "Produção")["id"]
    b = criar_equipe("nome" => "Qualidade")["id"]
    criar_usuario("ana")
    criar_usuario("bia", "equipes" => [a])
    criar_usuario("caio", "equipes" => [a, b])
    assert_equal [], equipes_de("ana")
    assert_equal ["Produção"], equipes_de("bia")
    assert_equal ["Produção", "Qualidade"], equipes_de("caio")
  end

  def test_trocar_equipes_do_usuario
    a = criar_equipe("nome" => "Produção")["id"]
    b = criar_equipe("nome" => "Qualidade")["id"]
    id = criar_usuario("bia", "equipes" => [a])
    put_json "/api/admin/usuarios/#{id}", { "equipes" => [b] }
    assert_equal 200, last_response.status, last_response.body
    assert_equal ["Qualidade"], equipes_de("bia")
    put_json "/api/admin/usuarios/#{id}", { "nome" => "Bia S." } # sem "equipes": mantém
    assert_equal ["Qualidade"], equipes_de("bia")
    put_json "/api/admin/usuarios/#{id}", { "equipes" => [] }
    assert_equal [], equipes_de("bia")
  end

  def test_membros_pela_equipe
    a = criar_equipe("nome" => "Produção")["id"]
    u1 = criar_usuario("ana")
    u2 = criar_usuario("bia")
    put_json "/api/admin/equipes/#{a}/membros", { "usuario_ids" => [u1, u2] }
    assert_equal 200, last_response.status
    assert_equal 2, resposta["total"]
    assert_equal ["Produção"], equipes_de("ana")
  end

  def test_equipe_invalida_nao_cria_usuario_pela_metade
    post_json "/api/admin/usuarios", { "login" => "ze", "nome" => "Zé", "senha" => "senha-do-ze-1", "equipes" => [9999] }
    assert_equal 422, last_response.status
    assert_nil Database.row("SELECT id FROM usuarios WHERE login = 'ze'")
  end

  def test_excluir_equipe_e_usuario_limpam_os_vinculos
    a = criar_equipe("nome" => "Produção")["id"]
    id = criar_usuario("bia", "equipes" => [a])
    delete "/api/admin/equipes/#{a}"
    assert_equal 200, last_response.status
    assert_equal [], equipes_de("bia")
    b = criar_equipe("nome" => "Qualidade")["id"]
    put_json "/api/admin/usuarios/#{id}", { "equipes" => [b] }
    delete "/api/admin/usuarios/#{id}"
    get "/api/admin/equipes"
    assert_equal 0, resposta.find { |e| e["id"] == b }["total"]
  end

  def test_usuario_comum_nao_mexe_em_equipes
    criar_usuario("joao")
    entrar("joao", "senha-de-joao-1")
    get "/api/admin/equipes"
    assert_equal 403, last_response.status
    post_json "/api/admin/equipes", { "nome" => "Hack" }
    assert_equal 403, last_response.status
  end
end
