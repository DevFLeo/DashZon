# Estrutura da prefeitura (Painel do adm > Criar): secretarias,
# subsecretarias, departamentos, divisões e equipes, em árvore, com membros e
# gestores. Só administradores: o filtro do app.rb barra /api/admin/* para os
# demais (gestores usam rotas/gestao.rb, limitadas ao escopo deles).
# Regras em lib/equipes.rb e lib/unidades.rb.

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

# Estrutura modelo da SEMEC (SEMEC / SUPLAN / DGEO / DCAD...), sem usuários.
post "/api/admin/equipes/modelo" do
  criadas = Equipes.criar_modelo!
  json ok: true, criadas: criadas, equipes: Equipes.todas
end

put "/api/admin/equipes/:id" do
  Equipes.atualizar!(params[:id], body_json)
  json Equipes.todas.find { |e| e["id"] == params[:id].to_i }
end

delete "/api/admin/equipes/:id" do
  Equipes.excluir!(params[:id])
  json ok: true
end

# Define exatamente quem está na unidade: { "usuario_ids": [1, 2, 3],
# "gestores": [1] } (sem "gestores", os papéis atuais ficam).
put "/api/admin/equipes/:id/membros" do
  d = body_json
  Equipes.definir_membros!(params[:id], d["usuario_ids"], d["gestores"])
  json Equipes.todas.find { |e| e["id"] == params[:id].to_i }
end
