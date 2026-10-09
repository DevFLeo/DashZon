require "securerandom"
require "openssl"
require "fileutils"

# Chave secreta do servidor. Serve para:
#  - assinar o cookie de sessão (sem ela fixa, todo mundo cai a cada reinício);
#  - o HMAC do CPF/CNPJ (hash com segredo: sem a chave, o hash não é
#    reversível por força bruta, mesmo sendo só 11 ou 14 dígitos).
#
# Ordem: DASHZON_SESSION_SECRET (se definida) ou o arquivo `segredo.key` ao lado
# do banco, criado na primeira vez. Esse arquivo fica em data/ (fora do git) e
# NÃO deve ser apagado: sem ele, os CPF/CNPJ já gravados não batem mais
# (a busca por duplicados deixa de funcionar) e todas as sessões caem.
module Segredo
  module_function

  def arquivo
    File.join(File.dirname(Database::DB_PATH), "segredo.key")
  end

  # O valor da variável é usado exatamente como veio (sem strip): mudar a chave
  # de quem já usa derrubaria as sessões e os HMAC de CPF/CNPJ gravados.
  def chave
    @chave ||= ENV["DASHZON_SESSION_SECRET"].to_s.then do |env|
      next env if env.length >= 64

      unless env.strip.empty?
        warn "[DashZon] DASHZON_SESSION_SECRET tem #{env.length} caracteres (mínimo 64) e foi ignorada; " \
             "usando #{arquivo}."
      end
      ler_ou_criar
    end
  end

  def ler_ou_criar
    return File.read(arquivo).strip if File.exist?(arquivo) && File.size(arquivo) >= 64

    FileUtils.mkdir_p(File.dirname(arquivo))
    nova = SecureRandom.hex(64)
    File.write(arquivo, nova)
    File.chmod(0o600, arquivo) rescue nil # no Windows o chmod é limitado
    nova
  end

  def hmac(texto)
    OpenSSL::HMAC.hexdigest("SHA256", chave, texto.to_s)
  end

  # Tokens de link (redefinir senha, verificar e-mail) são aleatórios e longos,
  # então um SHA-256 simples basta: o banco guarda só o hash.
  def novo_token
    SecureRandom.urlsafe_base64(32)
  end

  def hash_token(token)
    OpenSSL::Digest::SHA256.hexdigest(token.to_s)
  end
end
