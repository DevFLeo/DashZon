require "date"
require_relative "database"
require_relative "engine_client"
require_relative "desempenho"
require_relative "unidades"

# Função mestre do painel do gestor (Relatório 1 PDZ): conta os processos de
# cada unidade e soma de baixo para cima na árvore da prefeitura:
#
#   DCAD + DTAD + DASI + (o que é do próprio DGEO)  = total do DGEO
#   DGEO + DIPLAD + DIPEI + (o da própria SUPLAN)   = total da SUPLAN
#   SUPLAN + SURÇAM + (o da própria SEMEC)          = total da SEMEC
#
# Entram os módulos que declaram `unidade` (campo que diz de qual unidade é o
# registro) e `produtividade` (status, o que é concluído/encerrado e o prazo).
# A contagem é do motor C++ (consulta `multi`, com cache); aqui só se somam os
# resultados já agregados por opção do campo de unidade. O motor não muda.
#
# Indicadores de cada unidade (direto = só dela; total = ela + as de baixo):
#   total        registros
#   concluidos   status em `concluido`
#   encerrados   status em `encerrado` (ex.: indeferido/arquivado)
#   andamento    total - concluidos - encerrados
#   atrasados    em andamento com prazo antes de hoje
#   vencem_7     em andamento com prazo de hoje até hoje + 7 dias
#   sem_prazo    em andamento sem prazo
#   taxa         (concluidos + encerrados) / total, em %
module Produtividade
  INDICADORES = %w[total concluidos encerrados andamento atrasados vencem_7 sem_prazo].freeze
  JANELA_VENCIMENTO = 7

  module_function

  def zerado = INDICADORES.to_h { |k| [k, 0] }

  def somar!(alvo, outro)
    INDICADORES.each { |k| alvo[k] += outro[k] }
    alvo
  end

  def com_taxa(ind)
    fechados = ind["concluidos"] + ind["encerrados"]
    ind.merge("taxa" => ind["total"].zero? ? nil : (fechados * 100.0 / ind["total"]).round(1))
  end

  def modulos_com_painel(acesso)
    acesso.modulos_visiveis.select { |m| m["schema"]["unidade"] && m["schema"]["produtividade"] }
  end

  # Contagem por valor do campo de unidade: { "DCAD - ..." => indicadores }.
  # Registros sem valor no campo voltam na chave "" (somados em "sem unidade").
  def por_opcao(m, hoje = Date.today)
    sch = m["schema"]
    uf = sch["unidade"]
    p = sch["produtividade"]
    base = { "group_format" => "", "value_field" => "", "series_by" => p["status"] }
    prazo = p["prazo"]

    # 1ª consulta: total por valor da unidade e status; com prazo, também a
    # contagem geral por prazo (para achar o que ficou sem unidade).
    q0 = base.merge("group_by" => uf, "filters" => {})
    geral = base.merge("group_by" => prazo || uf, "filters" => {})
    r0, rgeral = consultar(m, [q0, geral])
    chaves = r0["result"].map { |x| x["key"] }.reject { |k| k == "(vazio)" }

    unless prazo
      out = r0["result"].to_h { |linha| [linha["key"] == "(vazio)" ? "" : linha["key"], contar([linha], p, nil, hoje)] }
      return out
    end

    # 2ª consulta: uma por valor, agrupando pelo prazo (dia) e separando por status.
    resultados = chaves.empty? ? [] : consultar(m, chaves.map { |k| base.merge("group_by" => prazo, "filters" => { uf => k }) })
    out = chaves.zip(resultados).to_h { |k, res| [k, contar(res["result"], p, prazo, hoje)] }
    resto = contar(rgeral["result"], p, prazo, hoje)
    out.each_value { |ind| INDICADORES.each { |k| resto[k] -= ind[k] } }
    out[""] = resto if resto["total"].positive?
    out
  end

  # Indicadores a partir das linhas do motor (cada linha com `series` por status).
  def contar(linhas, p, prazo, hoje)
    limite = hoje + JANELA_VENCIMENTO
    ind = zerado
    linhas.each do |linha|
      data = prazo ? data_ou_nil(linha["key"]) : nil
      (linha["series"] || {}).each do |status, cel|
        n = cel["count"].to_i
        next if n.zero?

        ind["total"] += n
        if p["concluido"].include?(status) then ind["concluidos"] += n
        elsif p["encerrado"].to_a.include?(status) then ind["encerrados"] += n
        else
          ind["andamento"] += n
          if data.nil? then ind["sem_prazo"] += n
          elsif data < hoje then ind["atrasados"] += n
          elsif data <= limite then ind["vencem_7"] += n
          end
        end
      end
    end
    ind
  end

  def data_ou_nil(texto)
    Date.iso8601(texto.to_s)
  rescue Date::Error
    nil
  end

  # Toda chamada ao motor passa pelo cache (validade = versão dos dados).
  def consultar(m, consultas)
    campos = consultas.flat_map { |q| [q["group_by"], q["series_by"], *q["filters"].keys] }.reject(&:empty?).uniq
    CacheResultados.buscar("produtividade", m["id"], m["schema"], consultas) do
      EngineClient.run(cmd: "multi", records: Database.registros(m, campos: campos, meta: false), queries: consultas)
    end["results"]
  end

  # O painel inteiro, já recortado para quem pede: o administrador vê todas as
  # unidades (e o que não é de nenhuma); o gestor, só as do escopo dele.
  # `slug`: um módulo só (nil = todos os módulos com painel, somados).
  def painel(acesso, slug: nil, hoje: Date.today)
    mods = modulos_com_painel(acesso)
    mods = mods.select { |m| m["slug"] == slug } if slug
    lista = acesso.unidades
    por_id = lista.to_h { |u| [u["id"], u] }
    direto = Hash.new { |h, k| h[k] = zerado }
    sem_unidade = zerado
    nao_reconhecidos = Hash.new(0)

    mods.each do |m|
      por_opcao(m, hoje).each do |valor, ind|
        u = Unidades.resolver(valor, lista)
        if u
          somar!(direto[u["id"]], ind)
        else
          somar!(sem_unidade, ind)
          nao_reconhecidos[valor] += ind["total"] if ind["total"].positive?
        end
      end
    end

    filhos = Unidades.filhos(lista)
    total = {}
    calcular = lambda do |id, pilha = Set.new|
      return total[id] if total[id]
      return zerado if pilha.include?(id)

      pilha << id
      soma = somar!(zerado, direto[id])
      (filhos[id] || []).each { |f| somar!(soma, calcular.call(f, pilha)) }
      total[id] = soma
    end
    lista.each { |u| calcular.call(u["id"]) }

    visiveis = Equipes.em_arvore(lista.map { |u| u.merge("teste" => 0) }).select { |u, _| acesso.escopo.include?(u["id"]) }
    {
      "gerado_em" => Time.now.utc.iso8601,
      "hoje" => hoje.iso8601,
      "janela_vencimento" => JANELA_VENCIMENTO,
      "modulos" => mods.map { |m| { "slug" => m["slug"], "nome" => m["nome"], "regras" => m["schema"]["produtividade"], "unidade" => m["schema"]["unidade"] } },
      "unidades" => visiveis.map do |u, nivel|
        u.slice("id", "nome", "sigla", "tipo", "pai_id").merge(
          "nivel" => nivel, "caminho" => Unidades.caminho(u["id"], por_id),
          "direto" => com_taxa(direto[u["id"]]), "total" => com_taxa(total[u["id"]])
        )
      end,
      "sem_unidade" => acesso.admin? ? com_taxa(sem_unidade).merge("valores" => nao_reconhecidos.sort_by { |_, n| -n }.first(20).to_h) : nil
    }
  end
end
