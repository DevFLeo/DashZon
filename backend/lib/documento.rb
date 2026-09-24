# CPF e CNPJ: normalização, validação pelos dígitos verificadores e máscara
# para exibição. O número completo nunca é gravado: o banco guarda o HMAC
# (Segredo.hmac) para detectar duplicados e uma versão mascarada para mostrar.
module Documento
  class Invalido < StandardError; end

  module_function

  def digitos(texto)
    texto.to_s.gsub(/\D/, "")
  end

  # Devolve [tipo, digitos]. `aceitos` limita os tipos ("cpf", "cnpj").
  def validar!(texto, aceitos: %w[cpf cnpj])
    d = digitos(texto)
    tipo = { 11 => "cpf", 14 => "cnpj" }[d.length]
    raise Invalido, "Documento deve ter 11 dígitos (CPF) ou 14 (CNPJ)" unless tipo
    raise Invalido, "Informe um #{aceitos.map(&:upcase).join(' ou ')}" unless aceitos.include?(tipo)
    raise Invalido, "#{tipo.upcase} inválido" unless tipo == "cpf" ? cpf_valido?(d) : cnpj_valido?(d)

    [tipo, d]
  end

  def cpf_valido?(d)
    return false unless d.match?(/\A\d{11}\z/) && d.chars.uniq.size > 1

    n = d.chars.map(&:to_i)
    dv = lambda do |qtd|
      soma = (0...qtd).sum { |i| n[i] * (qtd + 1 - i) }
      r = (soma * 10) % 11
      r == 10 ? 0 : r
    end
    dv.call(9) == n[9] && dv.call(10) == n[10]
  end

  def cnpj_valido?(d)
    return false unless d.match?(/\A\d{14}\z/) && d.chars.uniq.size > 1

    n = d.chars.map(&:to_i)
    dv = lambda do |pesos|
      r = pesos.each_with_index.sum { |p, i| n[i] * p } % 11
      r < 2 ? 0 : 11 - r
    end
    dv.call([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) == n[12] &&
      dv.call([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) == n[13]
  end

  # CPF: ***.456.789-** · CNPJ: **.***.678/0001-**
  def mascarar(tipo, d)
    if tipo == "cpf"
      "***.#{d[3, 3]}.#{d[6, 3]}-**"
    else
      "**.***.#{d[5, 3]}/#{d[8, 4]}-**"
    end
  end
end
