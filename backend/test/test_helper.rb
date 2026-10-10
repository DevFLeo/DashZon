# Ambiente de teste: banco e chave num diretório temporário. NUNCA usa o
# data/dashzon.db de verdade (a variável é definida antes de carregar o app).
require "tmpdir"
require "fileutils"

TMP_TESTE = Dir.mktmpdir("dashzon-teste")
ENV["DASHZON_DB_PATH"] = File.join(TMP_TESTE, "teste.db")
ENV["APP_ENV"] = "test"
ENV["DASHZON_HOSTS"] = "example.org" # host padrão do Rack::Test
ENV.delete("DASHZON_SESSION_SECRET")
%w[HOST PORTA USUARIO SENHA REMETENTE].each { |k| ENV.delete("DASHZON_SMTP_#{k}") }

require "minitest/autorun"
require "rack/test"
require "json"
require_relative "../app"

Minitest.after_run { FileUtils.rm_rf(TMP_TESTE) }

module DashZonTeste
  include Rack::Test::Methods

  def app
    Sinatra::Application
  end

  # Banco zerado a cada teste.
  def setup
    Database.fechar!
    Dir.glob("#{ENV['DASHZON_DB_PATH']}*").each { |f| File.delete(f) }
    # As falhas de login ficam no banco (zerado acima). O limite de requisições
    # por minuto é alto aqui: a suíte inteira faz milhares de chamadas do mesmo IP.
    Seguranca::Protecao.limite = 1_000_000
    clear_cookies
  end

  def post_json(path, dados = {})
    post path, JSON.generate(dados), "CONTENT_TYPE" => "application/json"
  end

  def put_json(path, dados = {})
    put path, JSON.generate(dados), "CONTENT_TYPE" => "application/json"
  end

  def resposta
    JSON.parse(last_response.body)
  end

  def configurar!(usuario: "dono", senha: "senha-forte-1")
    post_json "/api/setup", { "org_name" => "", "usuario" => usuario, "senha" => senha, "templates" => [], "com_exemplos" => false }
    assert_equal 200, last_response.status, last_response.body
  end

  def entrar(usuario, senha)
    clear_cookies
    post_json "/api/login", { "usuario" => usuario, "senha" => senha }
    last_response
  end
end
