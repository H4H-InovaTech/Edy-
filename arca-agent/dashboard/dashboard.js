// dashboard.js — Edy: Dashboard de pedidos automatizados
// Consume datos desde Google Apps Script (doGet) y auto-refresca cada 3s.

const WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbwZIds6wFjyqLf33nPOvS5SJ86YR0Z932lSS-iz80-ll8p3lgVydJQpjbamSfC1N1uM7w/exec";

const REFRESH_MS = 3000;

// ─── DOM refs ────────────────────────────────────────────────────────────────

const spinner      = document.getElementById("spinner");
const pageSub      = document.getElementById("page-sub");
const statTotal    = document.getElementById("stat-total");
const statTiempo   = document.getElementById("stat-tiempo");
const statExact    = document.getElementById("stat-exactitud");
const statCola     = document.getElementById("stat-cola");
const statDeltaTotal = document.getElementById("stat-delta-total");
const statDeltaCola  = document.getElementById("stat-delta-cola");
const filtroBuscar = document.getElementById("filtro-buscar");
const tabla        = document.getElementById("tabla");
const vacio        = document.getElementById("vacio");
const tbody        = document.getElementById("tbody");

// ─── State ───────────────────────────────────────────────────────────────────

let todosPedidos = [];
let prevTotal    = 0;
let prevCola     = 0;

// ─── Fetch & render ──────────────────────────────────────────────────────────

async function cargarDatos() {
  try {
    const resp = await fetch(WEB_APP_URL + "?t=" + Date.now());
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const json = await resp.json();
    if (!json.ok) throw new Error(json.error || "Error en Apps Script");
    todosPedidos = json.data || [];
  } catch (err) {
    console.warn("[Edy dashboard]", err.message);
    // Keep stale data if request fails — do not clear table
  }

  renderizar();
}

function renderizar() {
  const filtro = (filtroBuscar?.value || "").trim().toLowerCase();
  const visibles = filtro
    ? todosPedidos.filter((r) =>
        [r.orden, r.cliente, r.skus, r.portal, r.estado]
          .some((v) => String(v || "").toLowerCase().includes(filtro))
      )
    : todosPedidos;

  // Stats
  const total      = todosPedidos.length;
  const enCola     = todosPedidos.filter((r) => normalEstado(r.estado) === "cola").length;
  const completadas = todosPedidos.filter((r) => normalEstado(r.estado) === "completada").length;
  const exactitud  = total > 0 ? Math.round((completadas / total) * 100) : 100;
  const tiempoTotal = (total * 3.5).toFixed(1);

  if (statTotal)  statTotal.textContent  = total;
  if (statTiempo) statTiempo.textContent = tiempoTotal + " min";
  if (statExact)  statExact.textContent  = exactitud + "%";
  if (statCola)   statCola.textContent   = enCola;

  if (statDeltaTotal) {
    const delta = total - prevTotal;
    statDeltaTotal.textContent = delta > 0 ? "+" + delta + " hoy" : "actualizado";
  }
  if (statDeltaCola) {
    const delta = enCola - prevCola;
    statDeltaCola.textContent = delta > 0 ? "+" + delta + " nuevas" : "al día";
  }

  prevTotal = total;
  prevCola  = enCola;

  // Table
  if (!visibles.length) {
    if (tabla)  tabla.classList.add("hidden");
    if (vacio)  vacio.classList.remove("hidden");
    return;
  }

  if (tabla)  tabla.classList.remove("hidden");
  if (vacio)  vacio.classList.add("hidden");

  if (!tbody) return;
  tbody.innerHTML = visibles.map((r) => {
    const estado  = normalEstado(r.estado);
    const badgeClass = {
      cola:       "badge badge-cola",
      completada: "badge badge-completada",
      ejecutando: "badge badge-ejecutando",
      error:      "badge badge-error",
    }[estado] || "badge";

    const hora = formatearHora(r.hora || r.timestamp);

    return `<tr>
      <td>${escHtml(r.orden || "—")}</td>
      <td>${escHtml(r.cliente || r.cliente_nombre || "—")}</td>
      <td>${escHtml(r.skus || r.sku_producto || "—")}</td>
      <td>${escHtml(String(r.importe || r.monto || "—"))}</td>
      <td>${hora}</td>
      <td><span class="${badgeClass}">${escHtml(r.estado || "—")}</span></td>
    </tr>`;
  }).join("");
}

// ─── Utils ───────────────────────────────────────────────────────────────────

function normalEstado(e) {
  return String(e || "").toLowerCase()
    .replace("completada", "completada")
    .replace("en cola", "cola")
    .replace("cola",    "cola")
    .replace("ejecutando", "ejecutando")
    .replace("error",   "error");
}

function formatearHora(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts).slice(0, 19);
  return d.toLocaleString("es-MX", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Boot ────────────────────────────────────────────────────────────────────

if (spinner) spinner.classList.remove("hidden");
if (pageSub) pageSub.textContent = "Cargando pedidos…";

cargarDatos().then(() => {
  if (spinner) spinner.classList.add("hidden");
  if (pageSub) pageSub.textContent = "Pedidos automatizados por Edy";
});

if (filtroBuscar) filtroBuscar.addEventListener("input", renderizar);

setInterval(cargarDatos, REFRESH_MS);
