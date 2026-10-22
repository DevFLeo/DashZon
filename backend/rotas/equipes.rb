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

# Nova estrutura em texto (uma unidade por linha, recuo = dentro). Ver
# Equipes.criar_arvore! para o formato. Tudo ou nada.
post "/api/admin/equipes/arvore" do
  r = Equipes.criar_arvore!(body_json["texto"])
  json r.merge("equipes" => Equipes.todas), 201
end

# Texto de partida: o modelo SEMEC ou uma estrutura existente (?raiz=id).
get "/api/admin/equipes/texto" do
  json texto: params[:raiz].to_s.empty? ? Equipes.modelo_texto : Equipes.texto_da_arvore(Equipes.por_id!(params[:raiz])["id"])
end

put "/api/admin/equipes/:id" do
  Equipes.atualizar!(params[:id], body_json)
  json Equipes.todas.find { |e| e["id"] == params[:id].to_i }
end

# ?cascata=1: exclui também tudo o que está dentro (a árvore inteira).
delete "/api/admin/equipes/:id" do
  n = Equipes.excluir!(params[:id], cascata: params[:cascata] == "1")
  json ok: true, excluidas: n
end

# Define exatamente quem está na unidade: { "usuario_ids": [1, 2, 3],
# "gestores": [1] } (sem "gestores", os papéis atuais ficam).
put "/api/admin/equipes/:id/membros" do
  d = body_json
  Equipes.definir_membros!(params[:id], d["usuario_ids"], d["gestores"])
  json Equipes.todas.find { |e| e["id"] == params[:id].to_i }
end
