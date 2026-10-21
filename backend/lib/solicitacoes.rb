require "json"
require_relative "database"
require_relative "module_schema"
require_relative "usuarios"

# Pedidos de alteração de quem tem o perfil "visualizador" (relatório de
# testes, problema 3): criar, alterar ou excluir um registro vira um pedido
# que o dono do módulo aprova ou nega (um administrador também pode).
#  - Os dados são validados na hora do pedido (erro aparece para quem pediu)
#    e de novo na aprovação (a estrutura do módulo pode ter mudado).
#  - `antes` guarda o registro como estava, para quem aprova comparar.
module Solicitacoes
  Erro = Usuarios::Erro
  ACOES = %w[criar alterar excluir].freeze

  module_function

  def criar!(usuario, modulo, acao, registro_id: nil, dados: nil)
    raise Erro, "Ação inválida" unless ACOES.include?(acao)

    antes = registro_id && Database.registro(modulo, registro_id)
    id = Database.insert(
      "INSERT INTO solicitacoes (modulo_id, registro_id, acao, dados, antes, solicitante_id, status, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, 'pendente', ?)",
      [modulo["id"], registro_id, acao, dados && JSON.generate(dados), antes && JSON.generate(antes), usuario["id"], Database.now]
    )
    { "id" => id, "aprovador" => nome_do_aprovador(modulo) }
  end

  # O dono do módulo decide, se estiver ativo e não for visualizador; senão,
  # os administradores.
  def dono_decide?(modulo)
    dono = modulo["dono_id"] && Usuarios.por_id(modulo["dono_id"])
    dono && dono["ativo"].to_i == 1 && dono["perfil"] != "visualizador"
  end

  def nome_do_aprovador(modulo)
    return "um administrador" unless dono_decide?(modulo)

    dono = Usuarios.por_id(modulo["dono_id"])
    dono["nome"].to_s.empty? ? dono["login"] : dono["nome"]
  end

  def pode_decidir?(usuario, modulo)
    return false if usuario["perfil"] == "visualizador"

    usuario["perfil"] == "admin" || (dono_decide?(modulo) && modulo["dono_id"] == usuario["id"])
  end

  def publica(s, modulos, nomes)
    m = modulos[s["modulo_id"]]
    {
      "id" => s["id"], "acao" => s["acao"], "status" => s["status"], "motivo" => s["motivo"].to_s,
      "registro_id" => s["registro_id"],
      "dados" => s["dados"] && JSON.parse(s["dados"]), "antes" => s["antes"] && JSON.parse(s["antes"]),
      "modulo" => m && { "slug" => m["slug"], "nome" => m["nome"], "campos" => m["schema"]["campos"].map { |c| c.slice("id", "nome", "tipo") } },
      "solicitante" => nomes[s["solicitante_id"]], "revisor" => nomes[s["revisor_id"]],
      "criado_em" => s["criado_em"], "decidido_em" => s["decidido_em"]
    }
  end

  def nomes
    Database.rows("SELECT id, nome, login FROM usuarios").to_h { |u| [u["id"], u["nome"].to_s.empty? ? u["login"] : u["nome"]] }
  end

  # pendentes: os que esta pessoa pode decidir; minhas: os últimos 30 dela.
  def listar(usuario)
    Database.garantir_tabelas!
    modulos = Database.modulos.to_h { |m| [m["id"], m] }
    n = nomes
    pendentes = Database.rows("SELECT * FROM solicitacoes WHERE status = 'pendente' ORDER BY id")
                        .select { |s| modulos[s["modulo_id"]] && pode_decidir?(usuario, modulos[s["modulo_id"]]) }
    minhas = Database.rows("SELECT * FROM solicitacoes WHERE solicitante_id = ? ORDER BY id DESC LIMIT 30", [usuario["id"]])
    { "pendentes" => pendentes.map { |s| publica(s, modulos, n) }, "minhas" => minhas.map { |s| publica(s, modulos, n) } }
  end

  def contagem(usuario)
    Database.garantir_tabelas!
    modulos = Database.modulos.to_h { |m| [m["id"], m] }
    decidir = Database.rows("SELECT modulo_id FROM solicitacoes WHERE status = 'pendente'")
                      .count { |s| modulos[s["modulo_id"]] && pode_decidir?(usuario, modulos[s["modulo_id"]]) }
    minhas = Database.row("SELECT COUNT(*) AS n FROM solicitacoes WHERE solicitante_id = ? AND status = 'pendente'", [usuario["id"]])["n"]
    { "decidir" => decidir, "minhas_pendentes" => minhas }
  end

  # Aprovar aplica o pedido; negar só registra. Devolve o pedido e o módulo.
  def decidir!(usuario, id, aprovar:, motivo: nil)
    Database.garantir_tabelas!
    s = Database.row("SELECT * FROM solicitacoes WHERE id = ?", [id.to_i]) || raise(Erro.new("Pedido não encontrado", 404))
    raise Erro.new("Este pedido já foi decidido", 409) unless s["status"] == "pendente"

    m = Database.modulo_por_id(s["modulo_id"]) || raise(Erro.new("O módulo deste pedido não existe mais", 404))
    raise Erro.new("Só o dono do módulo (ou um administrador) decide este pedido", 403) unless pode_decidir?(usuario, m)

    motivo = motivo.to_s.strip[0, 300]
    Database.transaction do
      aplicar!(m, s) if aprovar
      Database.execute("UPDATE solicitacoes SET status = ?, motivo = ?, revisor_id = ?, decidido_em = ? WHERE id = ?",
                       [aprovar ? "aprovada" : "negada", motivo, usuario["id"], Database.now, s["id"]])
    end
    [s, m]
  end

  def aplicar!(m, s)
    dados = s["dados"] && JSON.parse(s["dados"])
    case s["acao"]
    when "criar"
      Database.inserir_registro(m, ModuleSchema.coerce_registro!(m["schema"], dados))
    when "alterar"
      raise Erro.new("O registro deste pedido não existe mais", 409) unless Database.registro(m, s["registro_id"])

      Database.atualizar_registro(m, s["registro_id"], ModuleSchema.coerce_registro!(m["schema"], dados))
    when "excluir"
      Database.remover_registro(m, s["registro_id"])
    end
  end
end
