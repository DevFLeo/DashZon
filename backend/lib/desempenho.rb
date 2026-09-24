require "json"
require_relative "database"

# Velocidade sem mudar resultado nenhum.
#
# 1) CacheResultados: guarda a resposta do motor C++ (cards, resumos, buscas).
#    Abrir o processo do motor custa ~10 ms no Windows por chamada; um
#    dashboard com 8 cards abre 8 processos. Com o cache, uma resposta igual
#    volta direto da memória.
#
#    Nunca fica velho: a chave inclui a "versão dos dados" do SQLite
#    (Database.versao_dados), que muda a cada gravação feita por este processo
#    (total_changes) ou por qualquer outro (PRAGMA data_version). Mudou alguma
#    coisa no banco, o cache inteiro é descartado. O cálculo continua sendo o
#    do motor (REGRA em CLAUDE.md): aqui só se evita repetir a mesma conta.
module CacheResultados
  LIMITE = 300 # respostas guardadas (as mais antigas saem primeiro)

  @lock = Mutex.new
  @versao = nil
  @itens = {}

  class << self
    def buscar(*partes)
      chave = JSON.generate(partes)
      versao = Database.versao_dados
      @lock.synchronize do
        if @versao != versao
          @itens.clear
          @versao = versao
        end
        return @itens[chave] if @itens.key?(chave)
      end

      valor = yield
      @lock.synchronize do
        # Só guarda se os dados não mudaram enquanto calculava.
        if @versao == versao
          @itens.shift if @itens.size >= LIMITE
          @itens[chave] = valor
        end
      end
      valor
    end

    def limpar
      @lock.synchronize { @itens.clear; @versao = nil }
    end

    def tamanho
      @lock.synchronize { @itens.size }
    end
  end
end

# 2) CacheEstaticos: cabeçalhos de cache para os arquivos do frontend.
#    - vendor/ (Chart.js, GridStack) e preview/ (prints): o navegador guarda
#      por 1 dia, sem nem perguntar ao servidor.
#    - o resto (index.html, css, js do app): "no-cache" = o navegador guarda,
#      mas confere a cada visita (responde 304 se não mudou). Assim uma
#      atualização do DashZon aparece na hora.
class CacheEstaticos
  LONGO = %r{\A/(vendor|preview)/}

  def initialize(app)
    @app = app
  end

  def call(env)
    status, headers, body = @app.call(env)
    caminho = env["PATH_INFO"].to_s
    if %w[GET HEAD].include?(env["REQUEST_METHOD"]) && !caminho.start_with?("/api/") && status.to_i < 400
      headers["cache-control"] = caminho.match?(LONGO) ? "public, max-age=86400" : "no-cache"
    end
    [status, headers, body]
  end
end
