// Cliente HTTP fino para a API do backend Ruby (Sinatra).
const Api = (() => {
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
    if (res.status === 401 && path !== "/api/login") location.replace("/");
    if (!res.ok) throw new Error((data && data.error) || `Erro ${res.status}`);
    return data;
  }

  return {
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body),
    put: (path, body) => request("PUT", path, body),
    del: (path) => request("DELETE", path)
  };
})();
