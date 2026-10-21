require "set"
require_relative "database"

# Estrutura da prefeitura em árvore, sobre a tabela `equipes`:
#
#   SEMEC (secretaria)
#   └─ SUPLAN (subsecretaria)
#      ├─ DGEO (departamento)
#      │  ├─ DCAD (divisão)
#      │  ├─ DTAD (divisão)
#      │  └─ DASI (divisão)
#      ├─ DIPLAD (departamento)
#      └─ DIPEI (departamento)
#
# Cascata: quem é GESTOR de uma unidade administra ela e tudo abaixo dela
# (usuários, registros, módulos e dashboards compartilhados com essas
# unidades). Quem é MEMBRO de uma unidade enxerga o que foi compartilhado com
# ela e com as unidades acima dela, e lança/edita registros da própria unidade.
#
# Funções puras sobre a lista de unidades (lida uma vez por requisição): nada
# aqui grava no banco.
module Unidades
  TIPOS = %w[secretaria subsecretaria departamento divisao equipe].freeze
  NOMES_TIPO = {
    "secretaria" => "Secretaria", "subsecretaria" => "Subsecretaria", "departamento" => "Departamento",
    "divisao" => "Divisão", "equipe" => "Equipe"
  }.freeze
  # Ordem de cima para baixo. Um filho não pode estar acima do pai (uma
  # divisão não contém um departamento); departamento dentro de departamento
  # e divisão dentro de divisão são aceitos. "equipe" é livre: pode ficar em
  # qualquer lugar (grupo de trabalho).
  NIVEL = { "secretaria" => 1, "subsecretaria" => 2, "departamento" => 3, "divisao" => 4 }.freeze
  PAPEIS = %w[membro gestor].freeze
  PROFUNDIDADE_MAX = 8

  module_function

  def todas
    Database.garantir_tabelas!
    Database.rows("SELECT id, nome, sigla, tipo, pai_id, descricao FROM equipes ORDER BY lower(COALESCE(sigla, nome))")
  end

  # Mapa pai -> filhos (ids).
  def filhos(lista)
    lista.each_with_object(Hash.new { |h, k| h[k] = [] }) { |u, h| h[u["pai_id"]] << u["id"] if u["pai_id"] }
  end

  # A unidade e todas as de baixo (ids).
  def descendentes(id, mapa_filhos)
    vistos = Set.new
    fila = [id]
    until fila.empty?
      atual = fila.shift
      next if vistos.include?(atual)

      vistos << atual
      fila.concat(mapa_filhos[atual] || [])
    end
    vistos
  end

  # As unidades acima (do pai até a raiz), sem a própria.
  def ancestrais(id, por_id)
    out = []
    atual = por_id[id]&.dig("pai_id")
    while atual && !out.include?(atual) && out.size < 50
      out << atual
      atual = por_id[atual]&.dig("pai_id")
    end
    out
  end

  # Caminho legível: "SEMEC / SUPLAN / DGEO".
  def caminho(id, por_id)
    ([id] + ancestrais(id, por_id)).reverse.filter_map { |i| rotulo(por_id[i]) }.join(" / ")
  end

  def rotulo(u)
    return nil unless u

    u["sigla"].to_s.empty? ? u["nome"] : u["sigla"]
  end

  # Texto de um campo (ex.: "DCAD - Divisão de Cadastro (Dados)") -> unidade.
  # Tenta, nesta ordem: a sigla exata; a primeira palavra antes de " - " ou de
  # um espaço; o nome exato; uma sigla entre parênteses no fim.
  def resolver(texto, lista)
    t = texto.to_s.strip
    return nil if t.empty?

    por_sigla = lista.reject { |u| u["sigla"].to_s.empty? }.to_h { |u| [u["sigla"].to_s.upcase, u] }
    candidatas = [t, t.split(/\s+[-–—:|]\s+|\s+/).first, t[/\(([^()]+)\)\s*\z/, 1]].compact.map { |s| s.strip.upcase }
    candidatas.each { |c| return por_sigla[c] if por_sigla[c] }
    lista.find { |u| u["nome"].to_s.strip.casecmp?(t) }
  end
end
