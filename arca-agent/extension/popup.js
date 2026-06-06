// popup.js
// Lógica del popup de la extensión Arca Agent (Edy).
// Maneja 3 estados: IDLE, OBSERVANDO, EJECUTANDO.

// URL del dashboard (rellenar cuando esté desplegado en Apps Script).
const DASHBOARD_URL = "";

// Pasos predefinidos del flujo de ejecución.
// El orden importa: se renderizan en este orden y se actualizan por su texto.
const PASOS_EJECUCION = [
  "Abrir SAP / módulo VA01",
  "Capturar cliente_id",
  "Capturar 6 SKUs",
  "Validar inventario...",
  "Confirmar pedido",
];

// ---------- Referencias a secciones ----------
const secIdle = document.getElementById("estado-idle");
const secObservando = document.getElementById("estado-observando");
const secEjecutando = document.getElementById("estado-ejecutando");

// ---------- Referencias a controles ----------
const btnObservar = document.getElementById("btn-observar");
const btnEjecutar = document.getElementById("btn-ejecutar");
const btnDetener = document.getElementById("btn-detener");
const btnDashboard = document.getElementById("btn-dashboard");

const listaCampos = document.getElementById("lista-campos");
const contadorCampos = document.getElementById("contador-campos");
const barraObs = document.getElementById("barra-obs");

const listaPasos = document.getElementById("lista-pasos");
const barraEje = document.getElementById("barra-eje");

// ---------- Estado interno ----------
let campos = []; // { nombre, time }

// ============================================================
//  CAMBIO DE ESTADO
// ============================================================
function mostrarEstado(estado) {
  secIdle.classList.toggle("hidden", estado !== "idle");
  secObservando.classList.toggle("hidden", estado !== "observando");
  secEjecutando.classList.toggle("hidden", estado !== "ejecutando");
}

// ============================================================
//  HELPERS DE MENSAJERÍA
// ============================================================
// Envía un mensaje al content_script de la pestaña activa.
function enviarAContentScript(mensaje) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, mensaje);
    }
  });
}

// Envía un mensaje al background (service worker).
function enviarABackground(mensaje) {
  chrome.runtime.sendMessage(mensaje);
}

// ============================================================
//  ESTADO OBSERVANDO — campos detectados
// ============================================================
function agregarCampo(nombre, time) {
  campos.push({ nombre, time });
  contadorCampos.textContent = campos.length;

  const div = document.createElement("div");
  div.className = "campo";
  div.innerHTML =
    '<span class="punto"></span>' +
    '<span class="nombre">' + nombre + "</span>" +
    '<span class="time">' + (time || "") + "</span>";
  listaCampos.appendChild(div);

  // Avanza la barra de progreso (tope visual a ~4 campos esperados).
  const pct = Math.min(100, (campos.length / 4) * 100);
  barraObs.style.width = pct + "%";
}

function resetObservando() {
  campos = [];
  listaCampos.innerHTML = "";
  contadorCampos.textContent = "0";
  barraObs.style.width = "0%";
}

// ============================================================
//  ESTADO EJECUTANDO — pasos
// ============================================================
function renderPasos() {
  listaPasos.innerHTML = "";
  PASOS_EJECUCION.forEach((texto) => {
    const div = document.createElement("div");
    div.className = "paso pendiente";
    div.dataset.texto = texto;
    div.innerHTML =
      '<span class="icono">○</span>' +
      '<span class="texto">' + texto + "</span>";
    listaPasos.appendChild(div);
  });
  barraEje.style.width = "0%";
}

function buscarPaso(texto) {
  return listaPasos.querySelector('.paso[data-texto="' + texto + '"]');
}

function marcarPasoCompletado(texto) {
  const paso = buscarPaso(texto);
  if (!paso) return;
  paso.className = "paso done";
  paso.querySelector(".icono").textContent = "✔";
  actualizarBarraEjecucion();
}

function marcarPasoActual(texto) {
  const paso = buscarPaso(texto);
  if (!paso) return;
  paso.className = "paso actual";
  paso.querySelector(".icono").textContent = "◉";
}

function actualizarBarraEjecucion() {
  const total = PASOS_EJECUCION.length;
  const hechos = listaPasos.querySelectorAll(".paso.done").length;
  barraEje.style.width = Math.round((hechos / total) * 100) + "%";
}

// ============================================================
//  EVENTOS DE BOTONES
// ============================================================
btnObservar.addEventListener("click", () => {
  resetObservando();
  mostrarEstado("observando");
  enviarAContentScript({ tipo: "iniciar_grabacion" });
});

btnDetener.addEventListener("click", () => {
  enviarAContentScript({ tipo: "detener_grabacion" });
  mostrarEstado("idle");
  // Habilita Ejecutar tras una grabación.
  btnEjecutar.disabled = false;
  btnEjecutar.classList.remove("btn-disabled");
  btnEjecutar.classList.add("btn-rojo");
});

btnEjecutar.addEventListener("click", () => {
  if (btnEjecutar.disabled) return;
  renderPasos();
  mostrarEstado("ejecutando");
  enviarABackground({ tipo: "iniciar_ejecucion" });
});

btnDashboard.addEventListener("click", () => {
  if (DASHBOARD_URL) {
    chrome.tabs.create({ url: DASHBOARD_URL });
  }
});

// ============================================================
//  MENSAJES ENTRANTES DEL BACKGROUND
// ============================================================
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.tipo) return;

  switch (msg.tipo) {
    case "campo_detectado":
      agregarCampo(msg.nombre, msg.time);
      break;
    case "paso_actual":
      marcarPasoActual(msg.paso);
      break;
    case "paso_completado":
      marcarPasoCompletado(msg.paso);
      break;
  }
});

// ============================================================
//  ARRANQUE
// ============================================================
mostrarEstado("idle");
