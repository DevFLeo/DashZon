const Util = (() => {
  let currency = "BRL";
  const symbols = { BRL: "R$", USD: "US$", EUR: "€" };

  function setCurrency(c) { currency = c || "BRL"; }

  function fmtMoney(value) {
    const n = Number(value) || 0;
    const sym = symbols[currency] || currency;
    return `${sym} ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("pt-BR");
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
  function seriesColor(i) { return SERIES[i % SERIES.length]; }

  function closeModal(id) { document.getElementById(id).classList.remove("open"); }
  function openModal(id) { document.getElementById(id).classList.add("open"); }

  return { setCurrency, fmtMoney, fmtDate, escapeHtml, debounce, seriesColor, closeModal, openModal };
})();
