# Equipes (Painel do adm > Criar): grupos de usuários, que podem ser uma
# empresa (com CNPJ). Só administradores: o filtro do app.rb barra
# /api/admin/* para os demais. Regras em lib/equipes.rb.

get "/api/admin/equipes" do
  json Equipes.todas
end

post "/api/admin/equipes" do
  id = Equipes.criar!(body_json)
  json Equipes.todas.find { |e| e["id"] == id }, 201
end

# Empresa de teste: nome automático e CNPJ fictício (válido nos dígitos).
post "/api/admin/equipes/teste" do
  id = Equipes.criar_empresa_teste!
  json Equipes.todas.find { |e| e["id"] == id }, 201
end

put "/api/admin/equipes/:id" do
  Equipes.atualizar!(params[:id], body_json)
  json Equipes.todas.find { |e| e["id"] == params[:id].to_i }
end

delete "/api/admin/equipes/:id" do
  Equipes.excluir!(params[:id])
  json ok: true
end

# Define exatamente quem está na equipe: { "usuario_ids": [1, 2, 3] }.
put "/api/admin/equipes/:id/membros" do
  Equipes.definir_membros!(params[:id], body_json["usuario_ids"])
  json Equipes.todas.find { |e| e["id"] == params[:id].to_i }
end
