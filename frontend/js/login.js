// Tela de login: usuário e senha locais, sessão por cookie no backend.
// Aparece quando o sistema já foi configurado mas ninguém entrou. Num banco
// sem nenhum usuário (criado antes do login existir) vira "crie seu usuário".
const Login = (() => {
  const $ = (id) => document.getElementById(id);
  const SENHA_MINIMA = 8;
  let criando = false;

  function erro(msg) {
    $("login-erro").textContent = msg;
    $("login-erro").hidden = !msg;
  }

  async function entrar(ev, onConcluido) {
    ev.preventDefault();
    erro("");
    const usuario = $("login-usuario").value.trim();
    const senha = $("login-senha").value;
    if (criando) {
      if (senha.length < SENHA_MINIMA) { erro(`A senha precisa ter ao menos ${SENHA_MINIMA} caracteres.`); return; }
      if (senha !== $("login-confirmar").value) { erro("As senhas não conferem."); return; }
    }

    const botao = $("login-entrar");
    botao.disabled = true;
    try {
      await Api.post(criando ? "/api/usuarios/primeiro" : "/api/login", { usuario, senha });
      $("login").classList.remove("open");
      $("login-senha").value = "";
      $("login-confirmar").value = "";
      await onConcluido();
    } catch (e) {
      erro(e.message);
      $("login-senha").select();
    } finally {
      botao.disabled = false;
    }
  }

  // "Esqueci minha senha": com e-mail configurado, manda um link; sem ele, o
  // backend orienta a pedir ao administrador. A resposta é sempre genérica.
  function abrirEsqueci() {
    $("form-esqueci").reset();
    $("esqueci-usuario").value = $("login-usuario").value.trim();
    $("esqueci-msg").textContent = "";
    $("esqueci-erro").hidden = true;
    Util.abrirModal("modal-esqueci");
    $("esqueci-usuario").focus();
  }

  async function pedirLink(ev) {
    ev.preventDefault();
    $("esqueci-erro").hidden = true;
    try {
      const r = await Api.post("/api/senha/esqueci", { usuario: $("esqueci-usuario").value.trim() });
      $("esqueci-msg").textContent = r.mensagem;
    } catch (e) {
      $("esqueci-erro").textContent = e.message;
      $("esqueci-erro").hidden = false;
    }
  }

  function iniciar(status, onConcluido) {
    $("login-esqueci").hidden = Boolean(status.sem_usuario);
    $("login-esqueci").addEventListener("click", abrirEsqueci);
    $("form-esqueci").addEventListener("submit", pedirLink);
    criando = Boolean(status.sem_usuario);
    const onde = status.org_name ? ` (${status.org_name})` : "";
    $("login-org").textContent = criando
      ? `Este painel${onde} ainda não tem usuário. Crie o seu para continuar.`
      : `Entre para acessar o painel${onde}.`;
    $("login-confirmar-wrap").hidden = !criando;
    $("login-confirmar").required = criando;
    $("login-senha").autocomplete = criando ? "new-password" : "current-password";
    $("login-entrar").textContent = criando ? "Criar usuário e entrar" : "Entrar";
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
