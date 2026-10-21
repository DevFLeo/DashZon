require "json"
require_relative "database"
require_relative "module_schema"

# Templates são arquivos JSON (backend/templates/*.json) que descrevem um
# pacote de módulos + dados de exemplo + dashboards prontos. O mesmo formato
# serve para importar um template do usuário e para exportar a configuração
# atual (backup / levar para outro servidor).
module TemplateRegistry
  DIR = File.expand_path("../templates", __dir__)
  FORMATO = "dashzon-template".freeze

  module_function

  PREFIXO_SALVO = "salvo-".freeze

  # Galeria = templates padrão (arquivos, versionados no git) + templates que o
  # usuário importou (tabela `jsons` do banco, fora do git). Antes do setup o
  # banco não existe, então só os arquivos aparecem.
  def all
    padrao = Dir[File.join(DIR, "*.json")].map { |f| JSON.parse(File.read(f, encoding: "UTF-8")).merge("origem" => "padrao") }
                                          .sort_by { |t| [t["ordem"] || 99, t["nome"].to_s] }
    padrao + salvos
  end

  def salvos
    return [] unless Database.configured?

    Database.jsons("template").map do |r|
      Database.json_salvo(r["id"])["conteudo"].merge("id" => "#{PREFIXO_SALVO}#{r['id']}", "origem" => "importado")
    end
  end

  # Guarda no banco um template importado pelo usuário (sem duplicar).
  def salvar_importado!(bruto)
    Database.salvar_json!("template", bruto["nome"].to_s.strip.empty? ? "Template importado" : bruto["nome"], bruto)
  end

  def find(id)
    all.find { |t| t["id"] == id }
  end

  def summary(t)
    {
      "id" => t["id"],
      "nome" => t["nome"],
      "descricao" => t["descricao"],
      "icone" => t["icone"],
      "origem" => t["origem"],
      "modulos" => Array(t["modulos"]).map do |m|
        { "nome" => m["nome"], "descricao" => m["descricao"], "campos" => Array(m["campos"]).map { |c| c["nome"] } }
      end,
      "dashboards" => Array(t["dashboards"]).map { |d| d["nome"] }
    }
  end

  # Valida o template inteiro (módulos, dados de exemplo, widgets) sem gravar.
  def normalize!(t)
    raise ModuleSchema::Error, "O template deve ser um objeto JSON" unless t.is_a?(Hash)

    modulos = Array(t["modulos"]).map do |defn|
      m = ModuleSchema.normalize_modulo!(defn)
      seed = Array(defn["seed"]).map { |dados| ModuleSchema.coerce_registro!(m, dados) }
      m.merge("seed" => seed)
    end
    raise ModuleSchema::Error, "O template não tem nenhum módulo" if modulos.empty?

    slugs = modulos.map { |m| m["slug"] }
    raise ModuleSchema::Error, "O template repete identificadores de módulo" if slugs.uniq.size != slugs.size

    nomes = modulos.map { |m| m["nome"].strip.downcase }
    raise ModuleSchema::Error, "O template tem dois módulos com o mesmo nome" if nomes.uniq.size != nomes.size

    por_slug = modulos.to_h { |m| [m["slug"], m] }
    dashboards = Array(t["dashboards"]).map do |d|
      nome = d["nome"].to_s.strip
      raise ModuleSchema::Error, "Todo dashboard do template precisa de um nome" if nome.empty?

      widgets = Array(d["widgets"]).map do |w|
        m = por_slug[w["modulo"]]
        raise ModuleSchema::Error, "O widget '#{w['titulo']}' usa o módulo inexistente '#{w['modulo']}'" unless m

        ModuleSchema.normalize_widget!(w, m).merge("modulo" => m["slug"])
      end
      { "nome" => nome, "widgets" => widgets }
    end

    {
      "id" => t["id"].to_s,
      "nome" => t["nome"].to_s,
      "modulos" => modulos,
      "dashboards" => dashboards
    }
  end

  # Recebe um template já passado por normalize!. Grava os módulos, os dados de
  # exemplo e os dashboards, tudo numa transação: ou instala inteiro ou nada.
  #
  # Nomes de módulo são únicos: se já existe um módulo com o mesmo nome (sem
  # diferenciar maiúsculas), ele é REAPROVEITADO. Não se cria outro, não se
  # repetem os dados de exemplo, e os widgets do template passam a apontar
  # para ele. Se só o identificador colidir (nome diferente), o módulo novo
  # ganha `slug_2`, `slug_3`...
  #
  # Devolve os slugs dos módulos, os ids dos dashboards criados, os nomes dos
  # módulos reaproveitados e quantos widgets foram pulados por não caberem no
  # módulo reaproveitado (ex.: o usuário removeu um campo que o widget usa).
  #
  # Os dashboards do template nascem de `dono_id` com a `visibilidade` pedida
  # (no setup: "equipe"; quando alguém instala depois: "privado").
  def install!(tpl, com_exemplos: true, dono_id: nil, visibilidade: "privado")
    now = Database.now

    Database.transaction do
      mapa = {}
      reaproveitados = {}
      ordem = Database.row("SELECT COALESCE(MAX(ordem), 0) AS m FROM modulos")["m"].to_i

      tpl["modulos"].each do |m|
        existente = Database.modulo_por_nome(m["nome"])
        if existente
          mapa[m["slug"]] = existente["slug"]
          reaproveitados[m["slug"]] = existente
          next
        end

        slug = slug_livre(m["slug"])
        mapa[m["slug"]] = slug
        ordem += 1
        schema = ModuleSchema.schema_de(m)
        modulo_id = Database.insert(
          "INSERT INTO modulos (slug, nome, descricao, icone, schema, template_origem, ordem, criado_em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [slug, m["nome"], m["descricao"], m["icone"], JSON.generate(schema), tpl["id"], ordem, now]
        )
        next unless com_exemplos

        modulo = { "id" => modulo_id, "schema" => schema }
        agora = Database.agora_i
        m["seed"].each { |dados| Database.marcar_exemplo!(modulo_id, Database.inserir_registro(modulo, dados, agora)) }
      end

      pulados = 0
      dash_ids = tpl["dashboards"].map do |d|
        dash_id = Database.insert(
          "INSERT INTO dashboards (nome, criado_em, atualizado_em, dono_id, visibilidade) VALUES (?, ?, ?, ?, ?)",
          [nome_dashboard_livre(d["nome"], dono_id), now, now, dono_id, visibilidade]
        )
        d["widgets"].each do |w|
          alvo = reaproveitados[w["modulo"]]
          # Widget apontando para módulo reaproveitado: revalida contra o schema
          # atual dele; se não servir mais, pula em vez de criar um card quebrado.
          if alvo
            begin
              ModuleSchema.normalize_widget!(w, alvo["schema"])
            rescue ModuleSchema::Error
              pulados += 1
              next
            end
          end
          insert_widget(dash_id, w.merge("modulo" => mapa[w["modulo"]]))
        end
        dash_id
      end

      {
        modulos: mapa.values,
        dashboards: dash_ids,
        reaproveitados: reaproveitados.values.map { |m| m["nome"] },
        widgets_pulados: pulados
      }
    end
  end

  # "Demandas" já existe -> "Demandas (2)", "Demandas (3)"... Só conta os
  # dashboards que a pessoa vê (os privados dos outros não interessam a ela).
  def nome_dashboard_livre(base, dono_id = nil)
    nomes = Database.dashboards_visiveis(dono_id).map { |r| r["nome"].to_s.strip.downcase }
    return base unless nomes.include?(base.strip.downcase)

    n = 2
    n += 1 while nomes.include?("#{base} (#{n})".downcase)
    "#{base} (#{n})"
  end

  def insert_widget(dashboard_id, w)
    Database.insert(
      "INSERT INTO widgets (dashboard_id, titulo, tipo, modulo_slug, config, x, y, w, h) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [dashboard_id, w["titulo"], w["tipo"], w["modulo"], JSON.generate(w["config"]), w["x"], w["y"], w["w"], w["h"]]
    )
  end

  def slug_livre(base)
    return base unless Database.slug_taken?(base)

    n = 2
    n += 1 while Database.slug_taken?("#{base}_#{n}")
    "#{base}_#{n}"
  end

  # Configuração atual no mesmo formato de template (reimportável).
  # `usuario_id`: leva só os dashboards que essa pessoa vê (os dela e os da
  # equipe); os privados dos outros não saem na exportação.
  def export(com_dados: false, usuario_id: nil)
    cfg = Database.config
    modulos = Database.modulos.map do |m|
      # Os slots são detalhe de armazenamento: na exportação o módulo sai só com o que o template define.
      h = m.slice("slug", "nome", "descricao", "icone").merge(m["schema"].except("slots"))
      if com_dados
        h["seed"] = Database.registros(m).map { |r| r.reject { |k, _| k == "id" || k.start_with?("_") } }
      end
      h
    end

    dashboards = Database.dashboards_visiveis(usuario_id).map do |d|
      widgets = Database.rows("SELECT * FROM widgets WHERE dashboard_id = ? ORDER BY y, x", [d["id"]]).map do |w|
        w.slice("titulo", "tipo", "x", "y", "w", "h").merge("modulo" => w["modulo_slug"], "config" => JSON.parse(w["config"]))
      end
      { "nome" => d["nome"], "widgets" => widgets }
    end

    {
      "formato" => FORMATO,
      "versao" => 1,
      "id" => "export",
      "nome" => "Configuração de #{cfg['org_name']}",
      "descricao" => "Exportado do DashZon em #{Time.now.strftime('%d/%m/%Y %H:%M')}",
      "modulos" => modulos,
      "dashboards" => dashboards
    }
  end
end
