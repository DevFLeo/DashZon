require "date"

# Registros FICTÍCIOS gerados a partir do schema de um módulo, usados só na
# pré-visualização do criador de card. Nada aqui é gravado no banco.
#
# O resultado passa pelo mesmo motor C++ e pela mesma consulta de um widget
# de verdade (REGRA em CLAUDE.md): a prévia mostra exatamente como o card vai
# se organizar, só que com dados inventados.
module DadosFicticios
  QUANTIDADE = 72

  module_function

  # Semente fixa por módulo: a prévia não "pula" a cada ajuste do formulário.
  def registros(schema, quantidade: QUANTIDADE)
    rng = Random.new(schema["campos"].map { |c| c["id"] }.join("|").sum)
    hoje = Date.today

    Array.new(quantidade) do |i|
      schema["campos"].each_with_object({ "id" => i + 1 }) do |c, r|
        r[c["id"]] = valor(c, i, rng, hoje)
      end
    end
  end

  def valor(c, i, rng, hoje)
    case c["tipo"]
    when "moeda" then (rng.rand(40.0..2400.0)).round(2)
    when "numero" then rng.rand(1..100)
    # Espalha os registros pelos últimos 6 meses, para os gráficos por mês.
    when "data" then (hoje - rng.rand(0..180)).iso8601
    when "hora" then format("%02d:%02d", rng.rand(6..22), [0, 15, 30, 45].sample(random: rng))
    when "booleano" then rng.rand < 0.65
    # Mais saídas que entradas, como num caixa comum.
    when "movimento" then rng.rand < 0.35 ? "entrada" : "saida"
    when "selecao"
      # Peso decrescente: as primeiras opções aparecem mais (barras variadas).
      opcoes = c["opcoes"]
      pesos = opcoes.each_index.map { |k| opcoes.size - k }
      sorteio = rng.rand(pesos.sum)
      opcoes.each_with_index { |o, k| return o if (sorteio -= pesos[k]).negative? }
      opcoes.last
    else "#{c['nome']} #{i + 1}"
    end
  end
end
