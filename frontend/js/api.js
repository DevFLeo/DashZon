// Cliente HTTP fino para a API do backend Ruby (Sinatra).
const Api = (() => {
  // Rotas em que 401 é resposta normal (senha errada), não sessão expirada.
  const SEM_RECARGA = ["/api/login", "/api/usuarios/primeiro"];

  async function request(method, path, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    let data = null;
    try { data = await res.json(); } catch (_) { /* corpo vazio */ }
    // Sessão expirou (ex.: servidor reiniciado): volta para a tela de login.
    if (res.status === 401 && !SEM_RECARGA.includes(path)) location.replace("/");
    if (!res.ok) throw new Error((data && data.error) || `Erro ${res.status}`);
    return data;
  }

  return {
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body),
    put: (path, body) => request("PUT", path, body),
    patch: (path, body) => request("PATCH", path, body),
    del: (path) => request("DELETE", path)
  };
})();
