require_relative "test_helper"

# Login, sessão, painel do administrador, senhas e links de uso único.
class UsuariosTest < Minitest::Test
  include DashZonTeste

  def criar_usuario(dados)
    post_json "/api/admin/usuarios", dados
    assert_equal 201, last_response.status, last_response.body
    resposta
  end

  # --- setup e login ---------------------------------------------------------

  def test_setup_cria_admin_e_ja_entra
    configurar!
    get "/api/status"
    assert_equal "dono", resposta["usuario"]["login"]
    assert resposta["usuario"]["admin"]
    refute resposta["usuario"].key?("senha_hash")
  end

  def test_setup_recusa_senha_curta_sem_criar_banco
    post_json "/api/setup", { "usuario" => "dono", "senha" => "curta", "templates" => [] }
    assert_equal 422, last_response.status
    refute Database.configured?
  end

  def test_setup_sem_nome_de_organizacao
    configurar!
    get "/api/status"
    assert_equal "", resposta["org_name"]
  end

  def test_login_errado_e_certo
    configurar!
    assert_equal 401, entrar("dono", "errada-123").status
    assert_equal 401, entrar("ninguem", "errada-123").status
    assert_equal 200, entrar("dono", "senha-forte-1").status
    assert_equal 200, entrar("DONO", "senha-forte-1").status # login sem diferenciar maiúsculas
  end

  def test_sem_login_a_api_responde_401
    configurar!
    clear_cookies
    get "/api/modulos"
    assert_equal 401, last_response.status
  end

  def test_limite_de_tentativas
    configurar!
    TENTATIVAS_MAX.times { entrar("dono", "errada-123") }
    assert_equal 429, entrar("dono", "senha-forte-1").status
  end

  def test_nao_existe_mais_admin_admin
    configurar!
    assert_equal 401, entrar("admin", "admin").status
  end

  # --- painel do administrador -----------------------------------------------------

  def test_admin_cria_usuario_com_senha_temporaria_e_troca_obrigatoria
    configurar!
    r = criar_usuario("login" => "maria", "nome" => "Maria", "cargo" => "Líder de produção")
    temporaria = r["senha_temporaria"]
    assert_equal 12, temporaria.length

    assert_equal 200, entrar("maria", temporaria).status
    get "/api/modulos"
    assert_equal 403, last_response.status
    assert resposta["trocar_senha"]

    put_json "/api/eu/senha", { "senha_atual" => temporaria, "senha_nova" => "nova-senha-maria" }
    assert_equal 200, last_response.status, last_response.body
    get "/api/modulos"
    assert_equal 200, last_response.status
  end

  def test_usuario_comum_nao_acessa_painel_do_adm
    configurar!
    criar_usuario("login" => "joao", "nome" => "João", "senha" => "senha-do-joao", "deve_trocar_senha" => false)
    entrar("joao", "senha-do-joao")
    get "/api/admin/usuarios"
    assert_equal 403, last_response.status
    put_json "/api/admin/config", { "org_name" => "x", "moeda" => "BRL" }
    assert_equal 403, last_response.status
  end

  def test_socio_promovido_a_admin_acessa_o_painel
    configurar!
    r = criar_usuario("login" => "socio", "nome" => "Sócio", "cargo" => "Sócio", "perfil" => "admin",
                      "senha" => "senha-do-socio", "deve_trocar_senha" => false)
    assert r["usuario"]["admin"]
    entrar("socio", "senha-do-socio")
    get "/api/admin/usuarios"
    assert_equal 200, last_response.status
    assert_equal 2, resposta.size
  end

  def test_login_e_email_unicos
    configurar!
    criar_usuario("login" => "ana", "nome" => "Ana", "email" => "ana@exemplo.com")
    post_json "/api/admin/usuarios", { "login" => "ANA", "nome" => "Outra" }
    assert_equal 422, last_response.status
    post_json "/api/admin/usuarios", { "login" => "ana2", "nome" => "Outra", "email" => "ANA@exemplo.com" }
    assert_equal 422, last_response.status
  end

  def test_nao_remove_o_unico_admin
    configurar!
    get "/api/eu"
    meu_id = resposta["id"]
    delete "/api/admin/usuarios/#{meu_id}"
    assert_equal 422, last_response.status
    post_json "/api/admin/usuarios/#{meu_id}/ativo", { "ativo" => false }
    assert_equal 422, last_response.status
    put_json "/api/admin/usuarios/#{meu_id}", { "perfil" => "usuario" }
    assert_equal 422, last_response.status
  end

  def test_desativar_derruba_a_sessao
    configurar!
    r = criar_usuario("login" => "temp", "nome" => "Temp", "senha" => "senha-temp-1", "deve_trocar_senha" => false)
    id = r["usuario"]["id"]

    entrar("temp", "senha-temp-1")
    cookie_temp = rack_mock_session.cookie_jar.to_hash
    entrar("dono", "senha-forte-1")
    post_json "/api/admin/usuarios/#{id}/ativo", { "ativo" => false }
    assert_equal 200, last_response.status

    clear_cookies
    cookie_temp.each { |k, v| set_cookie("#{k}=#{v}") }
    get "/api/modulos"
    assert_equal 401, last_response.status
    assert_equal 403, entrar("temp", "senha-temp-1").status
  end

  def test_senha_temporaria_gerada_pelo_admin
    configurar!
    id = criar_usuario("login" => "bia", "nome" => "Bia", "senha" => "senha-da-bia", "deve_trocar_senha" => false)["usuario"]["id"]
    post_json "/api/admin/usuarios/#{id}/senha-temporaria"
    nova = resposta["senha_temporaria"]
    assert_equal 401, entrar("bia", "senha-da-bia").status
    assert_equal 200, entrar("bia", nova).status
    get "/api/eu"
    assert resposta["deve_trocar_senha"]
  end

  def test_link_de_redefinicao_uso_unico
    configurar!
    id = criar_usuario("login" => "caio", "nome" => "Caio")["usuario"]["id"]
    post_json "/api/admin/usuarios/#{id}/link-redefinicao"
    link = resposta["link"]
    refute resposta["enviado"] # sem SMTP no teste
    token = link.split("/redefinir/").last

    clear_cookies
    post_json "/api/senha/redefinir", { "token" => token, "senha" => "caio-senha-nova" }
    assert_equal 200, last_response.status, last_response.body
    assert_equal 200, entrar("caio", "caio-senha-nova").status

    post_json "/api/senha/redefinir", { "token" => token, "senha" => "outra-senha-9" }
    assert_equal 422, last_response.status
  end

  def test_token_fica_so_em_hash_no_banco
    configurar!
    id = criar_usuario("login" => "davi", "nome" => "Davi")["usuario"]["id"]
    post_json "/api/admin/usuarios/#{id}/link-redefinicao"
    token = resposta["link"].split("/redefinir/").last
    gravados = Database.rows("SELECT token_hash FROM tokens").map { |r| r["token_hash"] }
    refute_includes gravados, token
    assert_includes gravados, Segredo.hash_token(token)
  end

  def test_esqueci_sem_smtp_orienta_a_falar_com_admin
    configurar!
    clear_cookies
    post_json "/api/senha/esqueci", { "usuario" => "dono" }
    assert_equal 200, last_response.status
    assert_match(/administrador/, resposta["mensagem"])
  end

  # --- e-mail e documento --------------------------------------------------------------

  def test_exigir_email_verificado
    configurar!
    put_json "/api/admin/ajustes", { "exigir_documento" => "nao", "exigir_email_verificado" => true }
    assert_equal "1", resposta["exigir_email"] # verificar implica exigir
    id = criar_usuario("login" => "eva", "nome" => "Eva", "email" => "eva@exemplo.com",
                       "senha" => "senha-da-eva", "deve_trocar_senha" => false)["usuario"]["id"]
    assert_equal 403, entrar("eva", "senha-da-eva").status

    entrar("dono", "senha-forte-1")
    post_json "/api/admin/usuarios/#{id}/email-verificado", { "verificado" => true }
    assert resposta["email_verificado"]
    assert_equal 200, entrar("eva", "senha-da-eva").status
    assert_equal 200, entrar("eva@exemplo.com", "senha-da-eva").status # entra pelo e-mail também
  end

  def test_trocar_email_perde_a_verificacao
    configurar!
    id = criar_usuario("login" => "fabio", "nome" => "Fábio", "email" => "f@exemplo.com",
                       "senha" => "senha-do-fabio", "deve_trocar_senha" => false)["usuario"]["id"]
    post_json "/api/admin/usuarios/#{id}/email-verificado", { "verificado" => true }
    entrar("fabio", "senha-do-fabio")
    put_json "/api/eu", { "email" => "novo@exemplo.com" }
    assert_equal 200, last_response.status
    refute resposta["email_verificado"]
  end

  def test_documento_obrigatorio_conforme_ajuste
    configurar!
    put_json "/api/admin/ajustes", { "exigir_documento" => "cpf" }
    post_json "/api/admin/usuarios", { "login" => "gil", "nome" => "Gil" }
    assert_equal 422, last_response.status
    post_json "/api/admin/usuarios", { "login" => "gil", "nome" => "Gil", "documento" => "11.222.333/0001-81" }
    assert_equal 422, last_response.status # CNPJ quando o ajuste pede CPF
    r = criar_usuario("login" => "gil", "nome" => "Gil", "documento" => "529.982.247-25")
    assert_equal "***.982.247-**", r["usuario"]["documento"]

    post_json "/api/admin/usuarios", { "login" => "gil2", "nome" => "Gil 2", "documento" => "52998224725" }
    assert_equal 422, last_response.status # CPF duplicado
  end

  def test_documento_nao_fica_em_texto_no_banco
    configurar!
    criar_usuario("login" => "hugo", "nome" => "Hugo", "documento" => "529.982.247-25")
    linha = Database.row("SELECT * FROM usuarios WHERE login = 'hugo'")
    refute_includes linha.values.map(&:to_s).join("|"), "52998224725"
  end

  def test_usuario_comum_nao_muda_o_proprio_perfil
    configurar!
    criar_usuario("login" => "ivo", "nome" => "Ivo", "senha" => "senha-do-ivo", "deve_trocar_senha" => false)
    entrar("ivo", "senha-do-ivo")
    put_json "/api/eu", { "nome" => "Ivo Silva", "perfil" => "admin" }
    assert_equal 200, last_response.status
    refute resposta["admin"]
    assert_equal "Ivo Silva", resposta["nome"]
  end

  # --- banco antigo ---------------------------------------------------------------------

  def test_banco_antigo_sem_usuarios_pede_o_primeiro
    configurar!
    Database.execute("DELETE FROM usuarios")
    clear_cookies
    get "/api/status"
    assert resposta["sem_usuario"]
    post_json "/api/usuarios/primeiro", { "usuario" => "novo", "senha" => "senha-nova-123" }
    assert_equal 200, last_response.status, last_response.body
    assert resposta["usuario"]["admin"]
    post_json "/api/usuarios/primeiro", { "usuario" => "outro", "senha" => "senha-nova-123" }
    assert_equal 409, last_response.status
  end
end
