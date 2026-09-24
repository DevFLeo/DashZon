# syntax=docker/dockerfile:1
# DashZon em container: motor C++ compilado no Linux + backend Ruby com Puma.
#
#   docker compose up -d --build        (veja servidor.md)
#
# Etapas:
#   build  -> compila o motor C++ e instala as gems (sem as de teste)
#   teste  -> roda a suíte de testes (docker build --target teste .)
#   final  -> imagem enxuta, só com o necessário para rodar

# ---------------------------------------------------------------- build ---
FROM ruby:3.4-slim AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential cmake \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY engine-cpp/CMakeLists.txt engine-cpp/
COPY engine-cpp/src engine-cpp/src
RUN cmake -S engine-cpp -B engine-cpp/build -DCMAKE_BUILD_TYPE=Release \
 && cmake --build engine-cpp/build -j"$(nproc)"

# Gems primeiro (camada em cache: só reinstala se o Gemfile mudar).
# Vão para /usr/local/bundle, o lugar padrão da imagem oficial do Ruby.
ENV BUNDLE_WITHOUT=test \
    BUNDLE_FROZEN=true
COPY backend/Gemfile backend/Gemfile.lock backend/
RUN cd backend && bundle install --jobs "$(nproc)" --retry 3

# ---------------------------------------------------------------- teste ---
FROM build AS teste
ENV BUNDLE_WITHOUT=""
RUN cd backend && bundle install --jobs "$(nproc)"
COPY backend backend
COPY frontend frontend
ENV DASHZON_ENGINE=/app/engine-cpp/build/dashzon_engine
RUN cd backend && bundle exec rake test

# ---------------------------------------------------------------- final ---
FROM ruby:3.4-slim AS final
WORKDIR /app
ENV APP_ENV=production \
    DASHZON_HOST=0.0.0.0 \
    PORT=4567 \
    DASHZON_DB_PATH=/dados/dashzon.db \
    DASHZON_ENGINE=/app/engine-cpp/build/dashzon_engine \
    BUNDLE_WITHOUT=test \
    BUNDLE_FROZEN=true

COPY --from=build /app/engine-cpp/build/dashzon_engine engine-cpp/build/dashzon_engine
COPY --from=build /usr/local/bundle /usr/local/bundle
COPY backend backend
COPY frontend frontend

# Roda sem root. /dados guarda o banco e a chave do servidor (segredo.key).
RUN useradd --create-home --uid 1000 dashzon \
 && mkdir -p /dados && chown dashzon:dashzon /dados
USER dashzon
VOLUME /dados
EXPOSE 4567

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ruby -rnet/http -e 'exit(Net::HTTP.get_response(URI("http://127.0.0.1:4567/api/status")).is_a?(Net::HTTPSuccess) ? 0 : 1)'

WORKDIR /app/backend
CMD ["bundle", "exec", "ruby", "app.rb"]
