require "date"

# Valida e normaliza tudo que chega como JSON "de cadastro": definição de
# módulos (campos, resumo), configuração de widgets e os dados de cada
# registro. É a única porta de entrada, então templates, o editor JSON e a
# API passam todos por aqui.
module ModuleSchema
  class Error < StandardError; end

  # `hora` (HH:MM) completa a `data` quando o horário importa (ex.: um
  # cronograma). `markdown` é texto longo (até 100 mil caracteres) mostrado
  # formatado, como as notas do Obsidian. Nenhum dos dois entra em
  # DIMENSOES/SERIES: não agrupam nem filtram cards.
  TIPOS = %w[texto texto_longo markdown numero moeda data hora selecao booleano movimento].freeze
  TEXTUAIS = %w[texto texto_longo markdown].freeze
  MARKDOWN_MAX = 100_000
  CONFIGURAVEIS_MAX = 20
  NUMERICOS = %w[numero moeda].freeze
  DIMENSOES = %w[selecao movimento booleano texto data].freeze
  SERIES = %w[selecao movimento booleano].freeze
  AGREGACOES = %w[contagem soma media saldo].freeze
  WIDGET_TIPOS = %w[kpi bar line table].freeze
  MOVIMENTO = %w[entrada saida].freeze
  RESERVADOS = %w[id _criado_em _atualizado_em].freeze
  ID_RE = /\A[a-z][a-z0-9_]{0,39}\z/
  HORA_RE = /\A(\d{1,2}):(\d{2})(?::\d{2})?\z/
  DIRECOES = %w[asc desc].freeze
  ORDENACAO_MAX = 3
  # Limites da definição de módulo (os templates padrão usam bem menos).
  NOME_MAX = 80
  DESCRICAO_MAX = 500
  ICONE_MAX = 40
  AJUDA_MAX = 500
  CAMPOS_MAX = 100
  OPCOES_MAX = 200
  OPCAO_MAX = 100
  # Número simples, já sem separador de milhar: recusa o que o Float() do Ruby
  # também aceitaria, como "0x1A" (26) ou "1_000".
  NUMERO_RE = /\A[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?\z/

  module_function

  def limite!(texto, maximo, contexto)
    raise Error, "#{contexto}: texto muito longo (máximo #{maximo} caracteres)" if texto.length > maximo
  end

  # --- definição de módulo ---------------------------------------------------

  # `anterior` é o schema já gravado do módulo (na edição). Ele só serve para
  # manter o slot de cada campo: os registros são guardados em arrays
  # posicionais (ver RecordCodec), então o slot de um campo nunca muda nem é
  # reaproveitado por outro, mesmo que o campo seja reordenado ou removido.
  def normalize_modulo!(defn, anterior = nil)
    raise Error, "A definição do módulo deve ser um objeto JSON" unless defn.is_a?(Hash)

    slug = (defn["slug"] || defn["id"]).to_s
    raise Error, "Identificador de módulo inválido: '#{slug}' (use minúsculas, números e _)" unless slug.match?(ID_RE)

    nome = defn["nome"].to_s.strip
    raise Error, "O módulo '#{slug}' precisa de um nome" if nome.empty?

    raise Error, "O módulo '#{slug}' precisa de uma lista 'campos'" unless defn["campos"].is_a?(Array) && defn["campos"].any?

    limite!(nome, NOME_MAX, "Nome do módulo '#{slug}'")
    limite!(defn["descricao"].to_s.strip, DESCRICAO_MAX, "Descrição do módulo '#{slug}'")
    limite!(defn["icone"].to_s.strip, ICONE_MAX, "Ícone do módulo '#{slug}'")
    raise Error, "O módulo '#{slug}' tem campos demais (máximo #{CAMPOS_MAX})" if defn["campos"].size > CAMPOS_MAX

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
      "resumo" => resumo,
      "ordenacao" => normalize_ordenacao!(defn["ordenacao"], slug, vistos),
      "visao" => normalize_visao!(defn["visao"], slug, campos),
      "nota" => normalize_nota!(defn["nota"], slug, campos),
      "configuracoes" => normalize_configuracoes!(defn["configuracoes"], slug, vistos),
      "slots" => atribuir_slots(campos, anterior)
    }.compact
  end

  # --- declarações opcionais do módulo ----------------------------------------
  # Tudo aqui é genérico: o código não sabe o que é "cronograma" ou "anotação",
  # só lê o que o JSON do módulo declara.

  def campo_do_tipo!(campos, id, tipos, slug, papel, obrigatorio: true)
    return nil if id.to_s.empty? && !obrigatorio

    c = campos.find { |x| x["id"] == id.to_s }
    raise Error, "Módulo '#{slug}': #{papel} precisa ser um campo existente" unless c
    raise Error, "Módulo '#{slug}': #{papel} precisa ser um campo do tipo #{tipos.join(' ou ')}" unless tipos.include?(c["tipo"])

    c["id"]
  end

  # "visao": {"tipo": "notas", "titulo": campo texto, "conteudo": campo
  # markdown/texto_longo, "pasta": campo texto (opcional)}. Em vez da tabela, a
  # tela do módulo vira um caderno de notas (lista por pasta + editor Markdown).
  def normalize_visao!(visao, slug, campos)
    return nil if visao.nil?
    raise Error, "Módulo '#{slug}': 'visao' deve ser um objeto" unless visao.is_a?(Hash)
    raise Error, "Módulo '#{slug}': visão '#{visao['tipo']}' inválida (use: notas)" unless visao["tipo"] == "notas"

    {
      "tipo" => "notas",
      "titulo" => campo_do_tipo!(campos, visao["titulo"], %w[texto], slug, "o título das notas"),
      "conteudo" => campo_do_tipo!(campos, visao["conteudo"], %w[markdown texto_longo], slug, "o conteúdo das notas"),
      "pasta" => campo_do_tipo!(campos, visao["pasta"], %w[texto selecao], slug, "a pasta das notas", obrigatorio: false)
    }.compact
  end

  # "nota": {"modulo": slug de um módulo de notas, "titulo": campo deste módulo
  # que dá o título da nota, "pasta": campo (opcional)}. Cada registro ganha um
  # botão que abre (ou cria) a nota com esse título no outro módulo. O outro
  # módulo pode nem estar instalado: aí o botão não aparece.
  def normalize_nota!(nota, slug, campos)
    return nil if nota.nil?
    raise Error, "Módulo '#{slug}': 'nota' deve ser um objeto" unless nota.is_a?(Hash)

    alvo = nota["modulo"].to_s
    raise Error, "Módulo '#{slug}': 'nota.modulo' deve ser o identificador de um módulo" unless alvo.match?(ID_RE)

    {
      "modulo" => alvo,
      "titulo" => campo_do_tipo!(campos, nota["titulo"], %w[texto selecao], slug, "o título da nota"),
      "pasta" => campo_do_tipo!(campos, nota["pasta"], %w[texto selecao], slug, "a pasta da nota", obrigatorio: false)
    }.compact
  end

  # "configuracoes": ids dos campos que aparecem em Configurações > Módulos
  # (opções de seleção e valores padrão), para ajustar o módulo sem o JSON.
  def normalize_configuracoes!(lista, slug, ids)
    return nil if lista.nil?
    raise Error, "Módulo '#{slug}': 'configuracoes' deve ser uma lista de campos" unless lista.is_a?(Array)
    raise Error, "Módulo '#{slug}': no máximo #{CONFIGURAVEIS_MAX} campos em 'configuracoes'" if lista.size > CONFIGURAVEIS_MAX

    lista.map(&:to_s).uniq.each do |id|
      raise Error, "Módulo '#{slug}': 'configuracoes' cita o campo inexistente '#{id}'" unless ids.include?(id)
    end
  end

  # Ordem da lista de registros na tela do módulo (ex.: um cronograma por data
  # e hora). Vazia = do mais novo para o mais antigo, como sempre. Só muda a
  # ordem da lista: cards e resumos não dependem dela.
  def normalize_ordenacao!(ordenacao, slug, ids)
    return [] if ordenacao.nil?
    raise Error, "Módulo '#{slug}': 'ordenacao' deve ser uma lista" unless ordenacao.is_a?(Array)
    raise Error, "Módulo '#{slug}': no máximo #{ORDENACAO_MAX} critérios de ordenação" if ordenacao.size > ORDENACAO_MAX

    ordenacao.map do |o|
      campo = (o.is_a?(Hash) ? o["campo"] : o).to_s
      direcao = (o["direcao"] if o.is_a?(Hash)).to_s
      direcao = "asc" if direcao.empty?
      raise Error, "Módulo '#{slug}': ordenação pelo campo inexistente '#{campo}'" unless ids.include?(campo)
      raise Error, "Módulo '#{slug}': direção '#{direcao}' inválida (use asc ou desc)" unless DIRECOES.include?(direcao)

      { "campo" => campo, "direcao" => direcao }
    end
  end

  # Aplica a ordenação do schema a registros já achatados. Vazios ficam por
  # último nos dois sentidos; empates mantêm a ordem recebida (mais novo antes).
  def ordenar_registros(schema, lista)
    regras = Array(schema["ordenacao"])
    return lista if regras.empty?

    lista.each_with_index.sort do |(a, i), (b, j)|
      cmp = 0
      regras.each do |r|
        va = a[r["campo"]]
        vb = b[r["campo"]]
        next if va == vb

        cmp = if va.nil? then 1
              elsif vb.nil? then -1
              else
                c = (va <=> vb) || (va.to_s <=> vb.to_s)
                r["direcao"] == "desc" ? -c : c
              end
        break
      end
      cmp.zero? ? i <=> j : cmp
    end.map(&:first)
  end

  # id do campo => posição no array do registro. Campos removidos continuam no
  # mapa: se voltarem a existir, recuperam os dados antigos em vez de ocupar
  # (ou herdar) o lugar de outro campo.
  def atribuir_slots(campos, anterior)
    slots = (anterior && anterior["slots"] || {}).dup
    campos.each { |c| slots[c["id"]] ||= slots.size }
    slots
  end

  # A parte do módulo que vai para a coluna `modulos.schema`.
  def schema_de(modulo)
    modulo.slice("campos", "rotulo", "resumo", "ordenacao", "visao", "nota", "configuracoes", "slots")
  end

  # Ids dos campos que as consultas do motor realmente leem (agrupar, série,
  # valor, sinal e filtros). Só decide QUAIS campos são enviados ao motor; a
  # consulta em si (engine_query) não muda.
  def campos_usados(queries)
    queries.flat_map do |q|
      [q["group_by"], q["series_by"], q["value_field"], q["sign_field"], *q["filters"].keys]
    end.map(&:to_s).reject(&:empty?).uniq
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
    limite!(nome, NOME_MAX, "Nome do campo '#{id}' do módulo '#{slug}'")
    limite!(c["ajuda"].to_s.strip, AJUDA_MAX, "Ajuda do campo '#{id}' do módulo '#{slug}'")
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
      raise Error, "Campo '#{id}' do módulo '#{slug}': opções demais (máximo #{OPCOES_MAX})" if opcoes.size > OPCOES_MAX
      opcoes.each { |o| limite!(o, OPCAO_MAX, "Opção do campo '#{id}' do módulo '#{slug}'") }

      out["opcoes"] = opcoes
    end
    out["opcoes"] = MOVIMENTO if tipo == "movimento"
    if c.key?("padrao")
      validar_padrao!(out, c["padrao"], slug)
      out["padrao"] = c["padrao"]
    end
    out["ajuda"] = c["ajuda"].to_s.strip if c["ajuda"]
    out
  end

  # O padrão é usado quando o registro não traz o campo. Um padrão inválido
  # (ex.: opção que não existe) faria todo cadastro sem o campo dar 422, longe
  # da causa; aqui o erro aparece ao salvar a estrutura. Fica gravado como veio
  # ("$hoje" continua relativo).
  def validar_padrao!(campo, padrao, slug)
    coerce_valor(campo, resolve_token(padrao))
  rescue Error => e
    raise Error, "Campo '#{campo['id']}' do módulo '#{slug}': padrão inválido (#{e.message})"
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
  #
  # REGRA (ver CLAUDE.md): não alterar a lógica nem o formato do `config`
  # (normalize_consulta!, normalize_widget!, engine_query) sem pedido
  # explícito. Telas novas de criação de card devem gerar este mesmo config.
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
      raise Error, "'#{c['nome']}' deve ser um número" if n.nil? || !n.finite?

      c["tipo"] == "moeda" ? n.round(2) : n
    when "data"
      s = raw.to_s[0, 10]
      raise Error, "'#{c['nome']}' deve ser uma data válida (AAAA-MM-DD)" unless data_valida?(s)

      s
    when "hora"
      m = raw.to_s.strip.match(HORA_RE)
      raise Error, "'#{c['nome']}' deve ser um horário válido (HH:MM)" unless m && m[1].to_i < 24 && m[2].to_i < 60

      format("%02d:%02d", m[1].to_i, m[2].to_i)
    when "selecao", "movimento"
      s = raw.to_s
      raise Error, "'#{c['nome']}': o valor '#{s}' não está entre as opções" unless c["opcoes"].include?(s)

      s
    when "texto" then raw.to_s.strip[0, 500]
    when "texto_longo" then raw.to_s.strip[0, 5000]
    # Markdown: quebras de linha do Windows viram \n; o espaço do começo pode ser
    # recuo de lista ou de código, então só o fim é aparado.
    when "markdown"
      s = raw.to_s.gsub("\r\n", "\n").rstrip
      raise Error, "'#{c['nome']}' passa do limite de #{MARKDOWN_MAX} caracteres" if s.length > MARKDOWN_MAX

      s
    end
  end

  # O formato compacto guarda a data como número de dias, então ela precisa
  # existir de verdade no calendário (2026-13-45 passava no regex antigo).
  def data_valida?(s)
    return false unless s.match?(/\A\d{4}-\d{2}-\d{2}\z/)

    Date.strptime(s, "%Y-%m-%d")
    true
  rescue Date::Error
    false
  end

  # Aceita "1234.56", "1234,56" e "1.234,56".
  def parse_number(s)
    s = s.strip
    s = s.delete(".").tr(",", ".") if s.include?(",")
    return nil unless s.match?(NUMERO_RE)

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
