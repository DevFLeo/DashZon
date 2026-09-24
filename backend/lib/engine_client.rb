require "json"
require "open3"

# Ponte com o binário C++ (engine-cpp): envia um payload JSON pelo stdin e
# lê o resultado JSON do stdout. É a única forma de o Ruby delegar busca e
# agregação para o módulo compilado.
module EngineClient
  CANDIDATES = [
    File.expand_path("../../engine-cpp/build/Release/dashzon_engine.exe", __dir__),
    File.expand_path("../../engine-cpp/build/Debug/dashzon_engine.exe", __dir__),
    File.expand_path("../../engine-cpp/build/dashzon_engine.exe", __dir__),
    File.expand_path("../../engine-cpp/build/dashzon_engine", __dir__)
  ].freeze

  class EngineError < StandardError; end

  def self.binary_path
    @binary_path ||= CANDIDATES.find { |p| File.exist?(p) }
  end

  def self.run(payload)
    path = binary_path
    raise EngineError, "Motor C++ não encontrado. Rode: cmake --build engine-cpp/build --config Release" unless path

    out, err, status = Open3.capture3(path, stdin_data: JSON.generate(payload))
    raise EngineError, "Motor C++ falhou: #{err}" unless status.success?

    JSON.parse(out)
  end
end
