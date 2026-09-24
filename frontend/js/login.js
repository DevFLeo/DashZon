// Tela de login (simulado): usuário e senha locais, sessão por cookie no
// backend. Aparece quando o sistema já foi configurado mas ninguém entrou.
const Login = (() => {
  const $ = (id) => document.getElementById(id);

  function erro(msg) {
    $("login-erro").textContent = msg;
    $("login-erro").hidden = !msg;
  }

  async function entrar(ev, onConcluido) {
    ev.preventDefault();
    erro("");
    const botao = $("login-entrar");
    botao.disabled = true;
    try {
      await Api.post("/api/login", { usuario: $("login-usuario").value.trim(), senha: $("login-senha").value });
      $("login").classList.remove("open");
      $("login-senha").value = "";
      await onConcluido();
    } catch (e) {
      erro(e.message);
      $("login-senha").select();
    } finally {
      botao.disabled = false;
    }
  }

  function iniciar(status, onConcluido) {
    $("login-org").textContent = `Entre para acessar ${status.org_name}.`;
    $("login-demo").hidden = !status.demo;
    $("login-form").addEventListener("submit", (ev) => entrar(ev, onConcluido));
    $("login").classList.add("open");
    $("login-usuario").focus();
  }

  // Encerra a sessão e recarrega a página, que volta para a tela de login.
  async function sair() {
    // Corpo vazio explícito: o WEBrick recusa POST sem Content-Length.
    try { await Api.post("/api/logout", {}); } finally { location.replace("/"); }
  }

  return { iniciar, sair };
})();
