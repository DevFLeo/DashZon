require "set"
require_relative "database"

# Quem vê e quem altera dashboards e módulos (relatório de testes, 21/10/2026:
# problemas 1, 2 e 3). Um objeto por requisição: as consultas de apoio
# (equipes da pessoa, compartilhamentos) são lidas uma vez e guardadas.
#
# Dashboard (`visibilidade`):
#   privado  só o dono (nem os administradores);
#   equipe   todos (nome antigo mantido: "a equipe toda");
#   equipes  membros das equipes escolhidas (dashboard_equipes), o dono e os
#            administradores.
# Módulo (`visibilidade`):
#   todos    todos (os que já existiam ficaram assim);
#   privado  só o dono;
#   equipes  membros das equipes escolhidas (modulo_equipes), o dono e os
#            administradores.
#   Além disso, quem vê um dashboard vê os módulos que os cards dele usam
#   (o card já mostra esses dados; lançar por ele precisa do módulo).
# Alterar (nome, cards, estrutura, compartilhamento, excluir): o dono, ou um
# administrador quando não é privado.
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

  def minhas_equipes
    @minhas_equipes ||= Database.rows("SELECT equipe_id FROM equipe_membros WHERE usuario_id = ?", [id]).map { |r| r["equipe_id"] }.to_set
  end

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
    Array(equipes).any? { |e| minhas_equipes.include?(e) }
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
    d["dono_id"] == id || (admin? && d["visibilidade"] != "privado")
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
    m["dono_id"] == id || (admin? && m["visibilidade"] != "privado")
  end

  def modulos_visiveis
    @modulos_visiveis ||= Database.modulos.select { |m| modulo_visivel?(m) }
  end

  # Equipes que a pessoa pode escolher ao compartilhar: o admin, qualquer uma;
  # os demais, só as equipes de que fazem parte.
  def pode_compartilhar_com?(equipe_id)
    admin? || minhas_equipes.include?(equipe_id)
  end
end
