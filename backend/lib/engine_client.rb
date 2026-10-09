require "json"
require "open3"
require_relative "ambiente"

# Ponte com o binário C++ (engine-cpp): envia um payload JSON pelo stdin e
# lê o resultado JSON do stdout. Em servidor, aponte DASHZON_ENGINE para o
# binário compilado na máquina de destino.
module EngineClient
  CANDIDATES = [
    Ambiente["DASHZON_ENGINE"],
    File.expand_path("../../engine-cpp/build/Release/dashzon_engine.exe", __dir__),
    File.expand_path("../../engine-cpp/build/Debug/dashzon_engine.exe", __dir__),
    File.expand_path("../../engine-cpp/build/dashzon_engine.exe", __dir__),
    File.expand_path("../../engine-cpp/build/dashzon_engine", __dir__)
  ].compact.freeze

  class EngineError < StandardError; end

  # Segundos por chamada. Um motor travado (ou um volume absurdo de dados) não
  # pode prender a thread da requisição para sempre: o processo é encerrado.
  TEMPO_MAXIMO = Ambiente["DASHZON_ENGINE_TIMEOUT", "60"].to_f

  def self.binary_path
    @binary_path ||= CANDIDATES.find { |p| File.file?(p) }
  end

  def self.run(payload)
    path = binary_path
    raise EngineError, "Motor C++ não encontrado. Compile com: cmake --build engine-cpp/build --config Release" unless path

    out, err, status = executar(path, JSON.generate(payload))
    raise EngineError, "Motor C++ falhou: #{err}" unless status.success?

    result = JSON.parse(out.force_encoding(Encoding::UTF_8))
    raise EngineError, result["error"] if result.is_a?(Hash) && result["error"]

    result
  end

  # Como o Open3.capture3, mas com tempo máximo. Entrada, stdout e stderr ficam
  # cada um numa thread, para nenhum pipe cheio travar o outro lado (nem a
  # contagem do tempo).
  # `comando`: caminho do binário, ou [binário, argumentos...].
  def self.executar(comando, entrada, tempo_maximo: TEMPO_MAXIMO)
    Open3.popen3(*Array(comando)) do |stdin, stdout, stderr, processo|
      [stdin, stdout, stderr].each(&:binmode)
      leitor_out = Thread.new { stdout.read }
      leitor_err = Thread.new { stderr.read }
      escritor = Thread.new do
        stdin.write(entrada)
      rescue Errno::EPIPE, Errno::EINVAL, IOError
        nil # o motor saiu antes de ler tudo; o código de saída e o stderr dizem o porquê
      ensure
        stdin.close unless stdin.closed?
      end

      unless processo.join(tempo_maximo)
        begin
          Process.kill("KILL", processo.pid)
        rescue StandardError
          nil
        end
        processo.join
        escritor.join
        raise EngineError, "Motor C++ não respondeu em #{tempo_maximo.round} s"
      end
      escritor.join
      [leitor_out.value, leitor_err.value, processo.value]
    end
  end
end
