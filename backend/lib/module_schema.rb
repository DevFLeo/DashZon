require "date"

# Valida e normaliza tudo que chega como JSON "de cadastro": definição de
# módulos (campos, resumo), configuração de widgets e os dados de cada
# registro. É a única porta de entrada, então templates, o editor JSON e a
# API passam todos por aqui.
module ModuleSchema
  class Error < StandardError; end

  TIPOS = %w[texto texto_longo numero moeda data selecao booleano movimento].freeze
  NUMERICOS = %w[numero moeda].freeze
  DIMENSOES = %w[selecao movimento booleano texto data].freeze
  SERIES = %w[selecao movimento booleano].freeze
  AGREGACOES = %w[contagem soma media saldo].freeze
  WIDGET_TIPOS = %w[kpi bar line table].freeze
  MOVIMENTO = %w[entrada saida].freeze
  RESERVADOS = %w[id _criado_em _atualizado_em].freeze
  ID_RE = /\A[a-z][a-z0-9_]{0,39}\z/

  module_function

  # --- definição de módulo ---------------------------------------------------

  def normalize_modulo!(defn)
    raise Error, "A definição do módulo deve ser um objeto JSON" unless defn.is_a?(Hash)

    slug = (defn["slug"] || defn["id"]).to_s
    raise Error, "Identificador de módulo inválido: '#{slug}' (use minúsculas, números e _)" unless slug.match?(ID_RE)

    nome = defn["nome"].to_s.strip
    raise Error, "O módulo '#{slug}' precisa de um nome" if nome.empty?

    raise Error, "O módulo '#{slug}' precisa de uma lista 'campos'" unless defn["campos"].is_a?(Array) && defn["campos"].any?

    vistos = []
    campos = defn["campos"].map { |c| normalize_campo!(c, slug, vistos) }

    rotulo = defn["rotulo"].to_s
    unless vistos.include?(rotulo)
      rotulo = (campos.find { |c| c["tipo"] == "texto" } || campos.first)["id"]
    end

    resumo = Array(defn["resumo"]).map { |r| normalize_resumo!(r, slug, campos) }

    {
      "slug" => slug,
      "nome" => nome,
      "descricao" => defn["descricao"].to_s.strip,
      "icone" => defn["icone"].to_s.strip,
      "campos" => campos,
      "rotulo" => rotulo,
      "resumo" => resumo
    }
  end

  def normalize_campo!(c, slug, vistos)
    raise Error, "Campo inválido no módulo '#{slug}'" unless c.is_a?(Hash)

    id = c["id"].to_s
    unless id.match?(ID_RE) && !RESERVADOS.include?(id)
      raise Error, "Campo '#{id}' do módulo '#{slug}': identificador inválido"
    end
    raise Error, "Campo '#{id}' duplicado no módulo '#{slug}'" if vistos.include?(id)

    vistos << id

    tipo = c["tipo"].to_s
    unless TIPOS.include?(tipo)
      raise Error, "Campo '#{id}' do módulo '#{slug}': tipo '#{tipo}' inválido (use: #{TIPOS.join(', ')})"
    end

    nome = c["nome"].to_s.strip
    out = {
      "id" => id,
      "nome" => nome.empty? ? id : nome,
      "tipo" => tipo,
      "obrigatorio" => c["obrigatorio"] == true,
      "lista" => c["lista"] != false
    }

    if tipo == "selecao"
      opcoes = Array(c["opcoes"]).map { |o| o.to_s.strip }.reject(&:empty?).uniq
      raise Error, "Campo '#{id}' do módulo '#{slug}': seleção precisa de 'opcoes'" if opcoes.empty?

      out["opcoes"] = opcoes
    end
    out["opcoes"] = MOVIMENTO if tipo == "movimento"
    out["padrao"] = c["padrao"] if c.key?("padrao")
    out["ajuda"] = c["ajuda"].to_s.strip if c["ajuda"]
    out
  end

  def normalize_resumo!(r, slug, campos)
    raise Error, "Item de resumo inválido no módulo '#{slug}'" unless r.is_a?(Hash)

    titulo = r["titulo"].to_s.strip
    cfg = normalize_consulta!(r, campos, "Resumo '#{titulo}' do módulo '#{slug}'")
    { "titulo" => titulo.empty? ? "Resumo" : titulo }.merge(cfg.slice("agregacao", "campo", "filtro"))
  end

  # --- widgets ---------------------------------------------------------------

  def normalize_widget!(w, schema)
    raise Error, "Widget inválido" unless w.is_a?(Hash)

    titulo = w["titulo"].to_s.strip
    raise Error, "O widget precisa de um nome" if titulo.empty?

    tipo = w["tipo"].to_s
    raise Error, "Tipo de widget '#{tipo}' inválido (use: #{WIDGET_TIPOS.join(', ')})" unless WIDGET_TIPOS.include?(tipo)

    cfg = normalize_consulta!(w["config"].is_a?(Hash) ? w["config"] : w, schema["campos"], "Widget '#{titulo}'")
    cfg.delete("serie_por") if %w[kpi table].include?(tipo)

    {
      "titulo" => titulo,
      "tipo" => tipo,
      "config" => cfg,
      "x" => w["x"].to_i,
      "y" => w["y"].to_i,
      "w" => [(w["w"] || 4).to_i, 1].max,
      "h" => [(w["h"] || 3).to_i, 1].max
    }
  end

  # Configuração comum a widgets e itens de resumo: o que medir, como agrupar,
  # como quebrar em séries e o que filtrar.
  def normalize_consulta!(cfg, campos, contexto)
    campo_por_id = campos.to_h { |c| [c["id"], c] }

    agregacao = (cfg["agregacao"] || "contagem").to_s
    raise Error, "#{contexto}: agregação '#{agregacao}' inválida" unless AGREGACOES.include?(agregacao)

    campo = cfg["campo"].to_s
    if agregacao == "contagem"
      campo = nil
    elsif !NUMERICOS.include?(campo_por_id.dig(campo, "tipo"))
      raise Error, "#{contexto}: '#{agregacao}' precisa de um campo numérico ou moeda"
    end

    if agregacao == "saldo" && campos.none? { |c| c["tipo"] == "movimento" }
      raise Error, "#{contexto}: 'saldo' exige um campo do tipo movimento (entrada/saída)"
    end

    agrupar = cfg["agrupar_por"].to_s
    agrupar = nil if agrupar.empty?
    if agrupar && !DIMENSOES.include?(campo_por_id.dig(agrupar, "tipo"))
      raise Error, "#{contexto}: não é possível agrupar por '#{agrupar}'"
    end

    formato = agrupar && campo_por_id.dig(agrupar, "tipo") == "data" ? "mes" : nil

    serie = cfg["serie_por"].to_s
    serie = nil if serie.empty? || serie == agrupar
    if serie && !SERIES.include?(campo_por_id.dig(serie, "tipo"))
      raise Error, "#{contexto}: não é possível separar séries por '#{serie}'"
    end

    filtro = {}
    if cfg["filtro"].is_a?(Hash)
      cfg["filtro"].each do |k, v|
        next if v.to_s.empty?
        raise Error, "#{contexto}: filtro por campo inexistente '#{k}'" unless campo_por_id.key?(k)

        filtro[k] = v.to_s
      end
    end

    {
      "agregacao" => agregacao,
      "campo" => campo,
      "agrupar_por" => agrupar,
      "formato_grupo" => formato,
      "serie_por" => serie,
      "filtro" => filtro
    }
  end

  # Traduz uma consulta normalizada para as opções do motor C++.
  def engine_query(schema, cfg)
    q = {
      "group_by" => cfg["agrupar_por"].to_s,
      "group_format" => cfg["formato_grupo"].to_s,
      "series_by" => cfg["serie_por"].to_s,
      "value_field" => cfg["campo"].to_s,
      "filters" => cfg["filtro"] || {}
    }
    if cfg["agregacao"] == "saldo"
      mov = schema["campos"].find { |c| c["tipo"] == "movimento" }
      q["sign_field"] = mov["id"]
      q["negative_values"] = ["saida"]
    end
    q
  end

  # --- registros -------------------------------------------------------------

  def coerce_registro!(schema, dados)
    raise Error, "O registro deve ser um objeto JSON" unless dados.is_a?(Hash)

    schema["campos"].each_with_object({}) do |c, out|
      raw = dados.key?(c["id"]) ? dados[c["id"]] : c["padrao"]
      value = coerce_valor(c, resolve_token(raw))
      raise Error, "O campo '#{c['nome']}' é obrigatório" if c["obrigatorio"] && blank?(value)

      out[c["id"]] = value
    end
  end

  def coerce_valor(c, raw)
    return [true, "true", "1", 1, "sim", "on"].include?(raw) if c["tipo"] == "booleano"
    return nil if blank?(raw)

    case c["tipo"]
    when "numero", "moeda"
      n = raw.is_a?(Numeric) ? raw.to_f : parse_number(raw.to_s)
      raise Error, "'#{c['nome']}' deve ser um número" if n.nil?

      c["tipo"] == "moeda" ? n.round(2) : n
    when "data"
      s = raw.to_s[0, 10]
      raise Error, "'#{c['nome']}' deve ser uma data (AAAA-MM-DD)" unless s.match?(/\A\d{4}-\d{2}-\d{2}\z/)

      s
    when "selecao", "movimento"
      s = raw.to_s
      raise Error, "'#{c['nome']}': o valor '#{s}' não está entre as opções" unless c["opcoes"].include?(s)

      s
    when "texto" then raw.to_s.strip[0, 500]
    when "texto_longo" then raw.to_s.strip[0, 5000]
    end
  end

  # Aceita "1234.56", "1234,56" e "1.234,56".
  def parse_number(s)
    s = s.strip
    s = s.delete(".").tr(",", ".") if s.include?(",")
    Float(s)
  rescue ArgumentError
    nil
  end

  # Datas relativas em templates/padrões: "$hoje", "$hoje-30", "$hoje+7".
  def resolve_token(raw)
    return raw unless raw.is_a?(String)

    m = raw.match(/\A\$hoje([+-]\d+)?\z/)
    m ? (Date.today + m[1].to_i).iso8601 : raw
  end

  def blank?(v)
    v.nil? || (v.is_a?(String) && v.strip.empty?)
  end
end
