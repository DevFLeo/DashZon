require "set"
require_relative "database"
require_relative "unidades"

# Quem vê e quem altera dashboards, módulos e registros. Um objeto por
# requisição: as consultas de apoio (unidades, compartilhamentos) são lidas
# uma vez e guardadas.
#
# Unidades em cascata (lib/unidades.rb), ex.: SEMEC / SUPLAN / DGEO / DTAD:
#   escopo      as unidades onde a pessoa é GESTORA e todas abaixo delas
#               (gestora da SUPLAN -> SUPLAN, DGEO, DTAD...). Administrador:
#               todas.
#   alcance     o que a pessoa enxerga: as unidades de que é membro, as acima
#               delas (o que a SUPLAN compartilha chega ao DTAD) e o escopo.
#
# Dashboard (`visibilidade`):
#   privado  só o dono (nem os administradores);
#   equipe   todos (nome antigo mantido: "a equipe toda");
#   equipes  quem tem alguma das unidades escolhidas no alcance, o dono e os
#            administradores.
# Módulo (`visibilidade`): todos, privado ou equipes (mesma regra). Além
#   disso, quem vê um dashboard vê os módulos que os cards dele usam.
# Alterar módulo/dashboard (nome, cards, estrutura, compartilhar, excluir): o
#   dono; um administrador quando não é privado; ou quem é gestor (em
#   cascata) de uma das unidades com que ele foi compartilhado.
# Registros (criar, editar, excluir): ver `registro_editavel?`.
# Perfil "visualizador": só vê. Criar, alterar ou excluir registros vira um
# pedido para aprovação (lib/solicitacoes.rb); não cria dashboards nem módulos.
class Acesso
  VIS_DASHBOARD = %w[privado equipe equipes].freeze
  VIS_MODULO = %w[todos privado equipes].freeze

  attr_reader :usuario

  def initialize(usuario)
    @usuario = usuario
  end

  def id = usuario["id"]
  def admin? = usuario["perfil"] == "admin"
  def visualizador? = usuario["perfil"] == "visualizador"

  # --- unidades ---------------------------------------------------------------

  def unidades
    @unidades ||= Unidades.todas
  end

  def unidades_por_id
    @unidades_por_id ||= unidades.to_h { |u| [u["id"], u] }
  end

  def filhos
    @filhos ||= Unidades.filhos(unidades)
  end

  def papeis
    @papeis ||= Database.rows("SELECT equipe_id, papel FROM equipe_membros WHERE usuario_id = ?", [id]).to_h { |r| [r["equipe_id"], r["papel"]] }
  end

  # Unidades de que a pessoa é membro (direto, qualquer papel).
  def minhas_equipes
    @minhas_equipes ||= papeis.keys.to_set
  end

  def minhas_gestoes
    @minhas_gestoes ||= papeis.select { |_, p| p == "gestor" }.keys.to_set
  end

  def gestor? = admin? || minhas_gestoes.any?

  # Onde a pessoa manda: o que ela gere e tudo abaixo. Admin: tudo.
  def escopo
    @escopo ||= if admin?
                  unidades.to_set { |u| u["id"] }
                else
                  minhas_gestoes.each_with_object(Set.new) { |g, s| s.merge(Unidades.descendentes(g, filhos)) }
                end
  end

  # Escopo sem as próprias unidades de topo: o que está estritamente abaixo
  # (um gestor edita e exclui as unidades de dentro, não a que ele gere).
  def escopo_abaixo
    @escopo_abaixo ||= if admin?
                         escopo
                       else
                         minhas_gestoes.each_with_object(Set.new) { |g, s| s.merge(Unidades.descendentes(g, filhos) - [g]) }
                       end
  end

  def alcance
    @alcance ||= minhas_equipes.each_with_object(escopo.dup) do |e, s|
      s << e
      s.merge(Unidades.ancestrais(e, unidades_por_id))
    end
  end

  def gere?(unidade_id) = escopo.include?(unidade_id)

  # --- compartilhamentos --------------------------------------------------------

  def self.equipes_por(tabela_sql)
    Database.rows(tabela_sql).group_by { |r| r["alvo"] }.transform_values { |l| l.map { |r| r["equipe_id"] } }
  end

  def equipes_dos_dashboards
    @equipes_dos_dashboards ||= Acesso.equipes_por("SELECT dashboard_id AS alvo, equipe_id FROM dashboard_equipes")
  end

  def equipes_dos_modulos
    @equipes_dos_modulos ||= Acesso.equipes_por("SELECT modulo_id AS alvo, equipe_id FROM modulo_equipes")
  end

  def membro_de_alguma?(equipes)
    Array(equipes).any? { |e| alcance.include?(e) }
  end

  def gestor_de_alguma?(equipes)
    Array(equipes).any? { |e| escopo.include?(e) }
  end

  # --- dashboards -------------------------------------------------------------

  def dashboard_visivel?(d)
    return true if d["dono_id"] == id

    case d["visibilidade"]
    when "equipe" then true
    when "equipes" then admin? || membro_de_alguma?(equipes_dos_dashboards[d["id"]])
    else false
    end
  end

  def dashboard_editavel?(d)
    return true if d["dono_id"] == id
    return false if d["visibilidade"] == "privado"

    admin? || (d["visibilidade"] == "equipes" && gestor_de_alguma?(equipes_dos_dashboards[d["id"]]))
  end

  def dashboards_visiveis
    @dashboards_visiveis ||= Database.dashboards_visiveis(nil).select { |d| dashboard_visivel?(d) }
  end

  # --- módulos ----------------------------------------------------------------

  def modulos_dos_meus_dashboards
    @modulos_dos_meus_dashboards ||= begin
      ids = dashboards_visiveis.map { |d| d["id"] }.to_set
      Database.rows("SELECT DISTINCT dashboard_id, modulo_slug FROM widgets").select { |r| ids.include?(r["dashboard_id"]) }
              .map { |r| r["modulo_slug"] }.to_set
    end
  end

  def modulo_visivel?(m)
    return true if m["dono_id"] == id

    case m["visibilidade"].to_s
    when "", "todos" then return true
    when "equipes" then return true if admin? || membro_de_alguma?(equipes_dos_modulos[m["id"]])
    end
    modulos_dos_meus_dashboards.include?(m["slug"])
  end

  def modulo_editavel?(m)
    return true if m["dono_id"] == id
    return false if m["visibilidade"] == "privado"

    admin? || (m["visibilidade"] == "equipes" && gestor_de_alguma?(equipes_dos_modulos[m["id"]]))
  end

  def modulos_visiveis
    @modulos_visiveis ||= Database.modulos.select { |m| modulo_visivel?(m) }
  end

  # Unidades que a pessoa pode escolher ao compartilhar: o admin, qualquer
  # uma; os demais, as do alcance (as suas, as de cima e as que gere).
  def pode_compartilhar_com?(equipe_id)
    admin? || alcance.include?(equipe_id)
  end

  # --- registros --------------------------------------------------------------
  #
  # A unidade de um registro vem do campo declarado em `unidade` no módulo (ex.:
  # "Divisão Responsável" = "DTAD - Divisão de Tecnologia e Dados" -> DTAD). Sem
  # esse campo (ou com valor que não é de nenhuma unidade), vale a unidade de
  # quem lançou (registro_autores). Regras:
  #   - administrador, quem altera o módulo e quem lançou: tudo;
  #   - gestor da unidade do registro (ou de uma acima): editar e excluir;
  #   - membro da unidade do registro: editar (excluir, só o gestor);
  #   - registro sem unidade e sem autor (antigo ou de exemplo): como antes,
  #     qualquer um que vê o módulo.
  # Criar: com unidade no campo, só quem é membro dela ou a gere.

  def unidade_do_valor(m, dados)
    campo = m["schema"]["unidade"]
    return nil unless campo && dados

    Unidades.resolver(dados[campo], unidades)&.dig("id")
  end

  def unidades_do_registro(m, dados, autor_id)
    u = unidade_do_valor(m, dados)
    return [u] if u
    return [] unless autor_id

    (@unidades_de_autor ||= {})[autor_id] ||= Database.rows("SELECT equipe_id FROM equipe_membros WHERE usuario_id = ?", [autor_id]).map { |r| r["equipe_id"] }
  end

  # acao: :editar ou :excluir.
  def registro_editavel?(m, dados, autor_id, acao = :editar)
    return true if admin? || modulo_editavel?(m) || (autor_id && autor_id == id)

    us = unidades_do_registro(m, dados, autor_id)
    return autor_id.nil? if us.empty?
    return true if us.any? { |u| escopo.include?(u) }

    acao == :editar && us.any? { |u| minhas_equipes.include?(u) }
  end

  def pode_criar_registro?(m, dados)
    return true if admin? || modulo_editavel?(m)

    u = unidade_do_valor(m, dados)
    u.nil? || escopo.include?(u) || minhas_equipes.include?(u)
  end

  # Para o navegador: em quais opções do campo de unidade a pessoa pode lançar
  # (nil = em todas). Só para módulos com `unidade` em campo de seleção.
  def opcoes_permitidas(m)
    campo = m["schema"]["campos"].find { |c| c["id"] == m["schema"]["unidade"] }
    return nil unless campo && campo["opcoes"]
    return nil if admin? || modulo_editavel?(m)

    campo["opcoes"].select do |o|
      u = Unidades.resolver(o, unidades)&.dig("id")
      u.nil? || escopo.include?(u) || minhas_equipes.include?(u)
    end
  end
end
