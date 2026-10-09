require "net/smtp"
require_relative "ambiente"
require "time"
require "securerandom"

# Envio de e-mail (verificação de e-mail e redefinição de senha). Só funciona
# se houver um servidor SMTP configurado por variáveis de ambiente:
#
#   DASHZON_SMTP_HOST      ex.: smtp.gmail.com
#   DASHZON_SMTP_PORTA     padrão 587 (STARTTLS)
#   DASHZON_SMTP_USUARIO   login no servidor
#   DASHZON_SMTP_SENHA     senha (no Gmail, uma "senha de app")
#   DASHZON_SMTP_REMETENTE padrão = DASHZON_SMTP_USUARIO
#
# Sem isso, `configurado?` é false e o sistema segue sem e-mail: o
# administrador copia o link de redefinição e manda por outro canal, e marca
# os e-mails como verificados manualmente.
module Correio
  class Falha < StandardError; end

  module_function

  # Ambiente[...]: um valor só com espaços (ou vazio, como o Docker Compose
  # passa as opcionais) conta como não definido.
  def configurado?
    !Ambiente["DASHZON_SMTP_HOST"].nil?
  end

  def enviar(para, assunto, texto)
    raise Falha, "Envio de e-mail não configurado" unless configurado?

    remetente = Ambiente["DASHZON_SMTP_REMETENTE"] || Ambiente["DASHZON_SMTP_USUARIO", ""]
    msg = <<~MSG
      From: DashZon <#{remetente}>
      To: #{para}
      Subject: =?UTF-8?B?#{[assunto].pack('m0')}?=
      Date: #{Time.now.rfc2822}
      Message-ID: <#{SecureRandom.uuid}@dashzon>
      MIME-Version: 1.0
      Content-Type: text/plain; charset=UTF-8
      Content-Transfer-Encoding: 8bit

      #{texto}
    MSG

    smtp = Net::SMTP.new(Ambiente["DASHZON_SMTP_HOST"], Ambiente["DASHZON_SMTP_PORTA", "587"].to_i)
    smtp.enable_starttls_auto
    smtp.open_timeout = 10
    smtp.read_timeout = 15
    smtp.start("dashzon", Ambiente["DASHZON_SMTP_USUARIO"], Ambiente["DASHZON_SMTP_SENHA"], :login) do |s|
      s.send_message(msg, remetente, para)
    end
    true
  rescue Falha
    raise
  rescue StandardError => e
    raise Falha, "Não foi possível enviar o e-mail (#{e.class})"
  end
end
