require "json"
require "open3"

# Ponte com o binário C++ (engine-cpp): envia um payload JSON pelo stdin e
# lê o resultado JSON do stdout. Em servidor, aponte DASHZON_ENGINE para o
# binário compilado na máquina de destino.
module EngineClient
  CANDIDATES = [
    ENV["DASHZON_ENGINE"],
    File.expand_path("../../engine-cpp/build/Release/dashzon_engine.exe", __dir__),
    File.expand_path("../../engine-cpp/build/Debug/dashzon_engine.exe", __dir__),
    File.expand_path("../../engine-cpp/build/dashzon_engine.exe", __dir__),
    File.expand_path("../../engine-cpp/build/dashzon_engine", __dir__)
  ].compact.freeze

  class EngineError < StandardError; end

  def self.binary_path
    @binary_path ||= CANDIDATES.find { |p| File.file?(p) }
  end

  def self.run(payload)
    path = binary_path
    raise EngineError, "Motor C++ não encontrado. Compile com: cmake --build engine-cpp/build --config Release" unless path

    out, err, status = Open3.capture3(path, stdin_data: JSON.generate(payload), binmode: true)
    raise EngineError, "Motor C++ falhou: #{err}" unless status.success?

    result = JSON.parse(out.force_encoding(Encoding::UTF_8))
    raise EngineError, result["error"] if result.is_a?(Hash) && result["error"]

    result
  end
end
