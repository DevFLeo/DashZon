# frozen_string_literal: true

require "json"

# Os temas do DashZon vêm de um lugar só: temas/temas.json, na raiz do
# projeto. Daqui saem a validação da preferência (Usuarios::TEMAS) e, para o
# frontend oficial (que não tem build), o /temas.css (tokens de cor de cada
# tema) e o /temas.js (a lista, para o seletor e o botão do topo). Os
# protótipos web e o app de celular leem o mesmo arquivo pelo @dashzon/core.
module Temas
  ARQUIVO = File.expand_path("../../temas/temas.json", __dir__)

  module_function

  def dados
    @dados ||= JSON.parse(File.read(ARQUIVO, encoding: "utf-8"))
  end

  def temas = dados["temas"]
  def automaticos = dados["automaticos"] || []

  # Valores aceitos em preferencias.tema: os automáticos ("sistema"...) e os temas.
  def ids = (automaticos.map { |t| t["id"] } + temas.map { |t| t["id"] }).freeze

  def por_id(id) = temas.find { |t| t["id"] == id }

  # CSS com os tokens de cada tema (data-theme = "atributo"). Sem tema
  # escolhido vale o do "sistema": claro, ou escuro se o aparelho estiver no
  # modo escuro. Gerado uma vez e guardado.
  def css
    @css ||= begin
      sistema = automaticos.find { |a| a["id"] == "sistema" } || { "claro" => "claro", "escuro" => "escuro" }
      claro = por_id(sistema["claro"])
      escuro = por_id(sistema["escuro"])
      blocos = ["/* Gerado de temas/temas.json pelo backend (lib/temas.rb). Não edite: mude o JSON. */"]
      blocos << bloco(":root", claro)
      blocos << "@media (prefers-color-scheme: dark) {\n#{bloco(':root:not([data-theme])', escuro)}\n}"
      temas.each { |t| blocos << bloco(%(:root[data-theme="#{t['atributo']}"]), t) }
      blocos.join("\n\n") + "\n"
    end
  end

  # A lista para o navegador: tudo menos os tokens (o CSS já tem as cores),
  # mais as cores da prévia (fundo, cartão, destaque, três séries).
  def js
    @js ||= begin
      lista = temas.map do |t|
        k = t["tokens"]
        t.except("tokens").merge("previa" => [k["page-plane"], k["surface-1"], k["text-primary"], k["accent"], k["series-1"], k["series-2"], k["series-3"]])
      end
      "/* Gerado de temas/temas.json pelo backend (lib/temas.rb). */\nwindow.DASHZON_TEMAS = #{JSON.generate({ 'automaticos' => automaticos, 'temas' => lista })};\n"
    end
  end

  def bloco(seletor, tema)
    linhas = ["  color-scheme: #{tema['escuro'] ? 'dark' : 'light'};"] + tema["tokens"].map { |k, v| "  --#{k}: #{v};" }
    "#{seletor} {\n#{linhas.join("\n")}\n}"
  end
end
