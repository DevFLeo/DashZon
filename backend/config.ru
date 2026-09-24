# Entrada para servidores Rack (puma, passenger...) no deploy:
#   DASHZON_HOST=0.0.0.0 PORT=8080 DASHZON_DB_PATH=/var/lib/dashzon/dashzon.db bundle exec rackup
# Localmente basta `ruby app.rb`.
require_relative "app"

run Sinatra::Application
