// content_script.js
// Inyecta a Edy como widget flotante (círculo abajo-derecha que se expande)
// en cualquier página. Usa Shadow DOM para aislar estilos de la página anfitriona.
// Reutiliza el diseño del popup con sus 3 estados: IDLE, OBSERVANDO, EJECUTANDO.

(function () {
  // Evita doble inyección si el script corre más de una vez.
  if (window.__edyInyectado) return;
  window.__edyInyectado = true;

  // ---------- Config ----------
  const DASHBOARD_URL = ""; // rellenar cuando el dashboard esté desplegado.
  const PASOS_EJECUCION = [
    "Abrir SAP / módulo VA01",
    "Capturar cliente_id",
    "Capturar 6 SKUs",
    "Validar inventario...",
    "Confirmar pedido",
  ];

  // Helper para resolver rutas de iconos dentro de la extensión.
  const icono = (nombre) => chrome.runtime.getURL("icons/" + nombre);

  // ---------- Contenedor + Shadow DOM ----------
  const host = document.createElement("div");
  host.id = "edy-agent-host";
  host.style.cssText =
    "position:fixed;bottom:20px;right:20px;z-index:2147483647;";
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  // ---------- Estilos (aislados en el shadow root) ----------
  const style = document.createElement("style");
  style.textContent = `
    :host, * { box-sizing: border-box; }
    .wrap {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --rojo:#CC0000; --negro:#1A1A1A; --gris-fondo:#F5F5F5;
      --gris-texto:#888; --blanco:#FFF; --gris-borde:#E5E5E5;
    }

    /* ---------- Botón flotante (colapsado) ---------- */
    .fab {
      width: 58px; height: 58px;
      border-radius: 50%;
      border: 3px solid var(--rojo);
      background: var(--blanco);
      cursor: pointer;
      overflow: hidden;
      display: flex; align-items: flex-start; justify-content: center;
      box-shadow: 0 6px 20px rgba(0,0,0,0.25);
      transition: transform 0.15s ease;
    }
    .fab:hover { transform: scale(1.06); }
    .fab img { width: 165%; height: auto; transform: translateY(-6%); }

    /* ---------- Panel (expandido) ---------- */
    .panel {
      width: 280px;
      background: var(--blanco);
      border-radius: 14px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.28);
      overflow: hidden;
      animation: subir 0.18s ease;
    }
    @keyframes subir { from { opacity:0; transform: translateY(10px);} to {opacity:1; transform:translateY(0);} }
    .card { padding: 14px; }

    .hidden { display: none !important; }

    /* ---------- Header ---------- */
    .header { display:flex; align-items:center; font-size:12px; margin-bottom:14px; color:var(--negro); }
    .header .dot { width:8px; height:8px; border-radius:50%; background:var(--rojo); margin-right:6px; }
    .header .brand { font-weight:700; }
    .header .org { color:var(--gris-texto); margin-left:5px; }
    .header .tag { margin-left:auto; color:var(--gris-texto); font-size:11px; font-variant-numeric:tabular-nums; }
    .header .rec { display:inline-flex; align-items:center; gap:4px; color:var(--negro); font-weight:600; }
    .header .rec .blink { width:7px; height:7px; border-radius:50%; background:var(--rojo); animation:blink 1s steps(2,start) infinite; }
    .header .cerrar { margin-left:8px; cursor:pointer; color:var(--gris-texto); font-size:14px; line-height:1; }
    @keyframes blink { 50% { opacity:0; } }

    /* ---------- Mascota ---------- */
    .mascota-wrap { display:flex; justify-content:center; align-items:center; position:relative; height:140px; margin:6px 0 10px; }
    .mascota-disco {
      width:104px; height:104px; border-radius:50%; overflow:hidden; position:relative; z-index:2;
      border:3px solid var(--rojo); background:var(--blanco);
      display:flex; justify-content:center; align-items:flex-start;
    }
    .mascota-disco img { width:165%; height:auto; transform:translateY(-6%); object-fit:cover; }
    .pulse { position:absolute; border:2px solid var(--rojo); border-radius:50%; opacity:0; z-index:1; }
    .animating .pulse { animation:pulse 2s ease-out infinite; }
    .animating .pulse:nth-child(2){ animation-delay:.6s; }
    .animating .pulse:nth-child(3){ animation-delay:1.2s; }
    @keyframes pulse { 0%{width:104px;height:104px;opacity:.7;} 100%{width:165px;height:165px;opacity:0;} }

    /* ---------- Textos ---------- */
    .titulo { text-align:center; font-size:16px; font-weight:700; color:var(--negro); }
    .subtitulo { text-align:center; font-size:12px; color:var(--gris-texto); margin-top:4px; }

    /* ---------- Botones ---------- */
    .botones { display:flex; gap:8px; margin-top:16px; }
    button { flex:1; border:none; border-radius:9px; padding:10px 0; font-size:13px; font-weight:600; cursor:pointer; font-family:inherit; }
    .btn-rojo { background:var(--rojo); color:var(--blanco); }
    .btn-rojo:hover { background:#b00000; }
    .btn-disabled { background:var(--gris-fondo); color:#BBB; cursor:not-allowed; }
    .btn-negro { background:var(--negro); color:var(--blanco); width:100%; }
    .btn-outline { background:var(--blanco); color:var(--negro); border:1px solid var(--gris-borde); width:100%; }
    .btn-outline:hover { background:var(--gris-fondo); }

    /* ---------- Progreso ---------- */
    .progreso { height:5px; background:var(--gris-borde); border-radius:3px; overflow:hidden; margin:14px 0; }
    .progreso .barra { height:100%; width:0%; background:var(--rojo); border-radius:3px; transition:width .4s ease; }

    /* ---------- Lista campos ---------- */
    .lista-label { font-size:10px; letter-spacing:1px; color:var(--gris-texto); text-transform:uppercase; margin-bottom:8px; }
    .campo { display:flex; align-items:center; font-size:12px; font-family:ui-monospace,Menlo,Consolas,monospace; padding:4px 0; animation:aparecer .35s ease; }
    .campo .punto { width:6px; height:6px; border-radius:50%; background:var(--rojo); margin-right:8px; }
    .campo .nombre { color:var(--negro); }
    .campo .time { margin-left:auto; color:var(--gris-texto); font-variant-numeric:tabular-nums; }
    @keyframes aparecer { from{opacity:0; transform:translateY(-4px);} to{opacity:1; transform:translateY(0);} }

    /* ---------- Lista pasos ---------- */
    .paso { display:flex; align-items:center; font-size:12.5px; padding:5px 0; gap:8px; }
    .paso .icono { width:16px; text-align:center; flex-shrink:0; }
    .paso.done .texto { color:var(--negro); } .paso.done .icono { color:#1aa251; }
    .paso.actual .texto { color:var(--rojo); font-weight:600; } .paso.actual .icono { color:var(--rojo); }
    .paso.pendiente .texto { color:#BBB; } .paso.pendiente .icono { color:#DDD; }
  `;
  shadow.appendChild(style);

  // ---------- Markup ----------
  const wrap = document.createElement("div");
  wrap.className = "wrap";
  wrap.innerHTML = `
    <!-- Botón flotante colapsado -->
    <div class="fab" id="edy-fab">
      <img src="${icono("EdyNeutro.png")}" alt="Edy">
    </div>

    <!-- Panel expandido -->
    <div class="panel hidden" id="edy-panel">
      <div class="card">

        <!-- IDLE -->
        <section id="estado-idle">
          <div class="header">
            <span class="dot"></span><span class="brand">Edy</span>
            <span class="org">· Arca Continental</span>
            <span class="tag">v0.4</span>
            <span class="cerrar" data-cerrar>✕</span>
          </div>
          <div class="mascota-wrap">
            <div class="mascota-disco"><img src="${icono("EdyNeutro.png")}" alt="Edy"></div>
          </div>
          <div class="titulo">Listo para observar</div>
          <div class="subtitulo">Aprenderé viendo lo que haces.</div>
          <div class="botones">
            <button id="btn-observar" class="btn-rojo">● Observar</button>
            <button id="btn-ejecutar" class="btn-disabled" disabled>▶ Ejecutar</button>
          </div>
        </section>

        <!-- OBSERVANDO -->
        <section id="estado-observando" class="hidden">
          <div class="header">
            <span class="dot"></span><span class="brand">Edy</span>
            <span class="org">· Arca Continental</span>
            <span class="tag rec">REC <span class="blink"></span></span>
            <span class="cerrar" data-cerrar>✕</span>
          </div>
          <div class="mascota-wrap animating">
            <span class="pulse"></span><span class="pulse"></span><span class="pulse"></span>
            <div class="mascota-disco"><img src="${icono("EdyPensando.png")}" alt="Edy observando"></div>
          </div>
          <div class="titulo">Observando tu proceso...</div>
          <div class="progreso"><div class="barra" id="barra-obs"></div></div>
          <div class="lista-label">Campos detectados · <span id="contador-campos">0</span></div>
          <div id="lista-campos"></div>
          <div class="botones"><button id="btn-detener" class="btn-negro">■ Detener</button></div>
        </section>

        <!-- EJECUTANDO -->
        <section id="estado-ejecutando" class="hidden">
          <div class="header">
            <span class="dot"></span><span class="brand">Edy</span>
            <span class="org">· Arca Continental</span>
            <span class="tag">RUN</span>
            <span class="cerrar" data-cerrar>✕</span>
          </div>
          <div class="mascota-wrap animating">
            <span class="pulse"></span><span class="pulse"></span><span class="pulse"></span>
            <div class="mascota-disco"><img src="${icono("EdySonriente.png")}" alt="Edy ejecutando"></div>
          </div>
          <div class="titulo">Ejecutando solo...</div>
          <div class="subtitulo" id="orden-info">Orden #C-4821 · OXXO La Pastora</div>
          <div class="progreso"><div class="barra" id="barra-eje"></div></div>
          <div id="lista-pasos"></div>
          <div class="botones"><button id="btn-dashboard" class="btn-outline">Ver en dashboard →</button></div>
        </section>

      </div>
    </div>
  `;
  shadow.appendChild(wrap);

  // ---------- Referencias ----------
  const $ = (sel) => shadow.querySelector(sel);
  const fab = $("#edy-fab");
  const panel = $("#edy-panel");
  const secIdle = $("#estado-idle");
  const secObservando = $("#estado-observando");
  const secEjecutando = $("#estado-ejecutando");
  const btnObservar = $("#btn-observar");
  const btnEjecutar = $("#btn-ejecutar");
  const btnDetener = $("#btn-detener");
  const btnDashboard = $("#btn-dashboard");
  const listaCampos = $("#lista-campos");
  const contadorCampos = $("#contador-campos");
  const barraObs = $("#barra-obs");
  const listaPasos = $("#lista-pasos");
  const barraEje = $("#barra-eje");

  let campos = [];

  // ---------- Expandir / colapsar ----------
  function abrir() { panel.classList.remove("hidden"); fab.classList.add("hidden"); }
  function cerrar() { panel.classList.add("hidden"); fab.classList.remove("hidden"); }
  fab.addEventListener("click", abrir);
  shadow.querySelectorAll("[data-cerrar]").forEach((el) => el.addEventListener("click", cerrar));

  // ---------- Cambio de estado ----------
  function mostrarEstado(estado) {
    secIdle.classList.toggle("hidden", estado !== "idle");
    secObservando.classList.toggle("hidden", estado !== "observando");
    secEjecutando.classList.toggle("hidden", estado !== "ejecutando");
  }

  // ---------- Observando: campos ----------
  function agregarCampo(nombre, time) {
    campos.push({ nombre, time });
    contadorCampos.textContent = campos.length;
    const div = document.createElement("div");
    div.className = "campo";
    div.innerHTML =
      '<span class="punto"></span><span class="nombre">' + nombre +
      '</span><span class="time">' + (time || "") + "</span>";
    listaCampos.appendChild(div);
    barraObs.style.width = Math.min(100, (campos.length / 4) * 100) + "%";
  }
  function resetObservando() {
    campos = [];
    listaCampos.innerHTML = "";
    contadorCampos.textContent = "0";
    barraObs.style.width = "0%";
  }

  // ---------- Ejecutando: pasos ----------
  function renderPasos() {
    listaPasos.innerHTML = "";
    PASOS_EJECUCION.forEach((texto) => {
      const div = document.createElement("div");
      div.className = "paso pendiente";
      div.dataset.texto = texto;
      div.innerHTML = '<span class="icono">○</span><span class="texto">' + texto + "</span>";
      listaPasos.appendChild(div);
    });
    barraEje.style.width = "0%";
  }
  const buscarPaso = (texto) => listaPasos.querySelector('.paso[data-texto="' + texto + '"]');
  function marcarPasoCompletado(texto) {
    const p = buscarPaso(texto); if (!p) return;
    p.className = "paso done"; p.querySelector(".icono").textContent = "✔";
    actualizarBarraEjecucion();
  }
  function marcarPasoActual(texto) {
    const p = buscarPaso(texto); if (!p) return;
    p.className = "paso actual"; p.querySelector(".icono").textContent = "◉";
  }
  function actualizarBarraEjecucion() {
    const hechos = listaPasos.querySelectorAll(".paso.done").length;
    barraEje.style.width = Math.round((hechos / PASOS_EJECUCION.length) * 100) + "%";
  }

  // ---------- Botones ----------
  btnObservar.addEventListener("click", () => {
    resetObservando();
    mostrarEstado("observando");
    chrome.runtime.sendMessage({ tipo: "iniciar_grabacion" });
  });
  btnDetener.addEventListener("click", () => {
    chrome.runtime.sendMessage({ tipo: "detener_grabacion" });
    mostrarEstado("idle");
    btnEjecutar.disabled = false;
    btnEjecutar.classList.remove("btn-disabled");
    btnEjecutar.classList.add("btn-rojo");
  });
  btnEjecutar.addEventListener("click", () => {
    if (btnEjecutar.disabled) return;
    renderPasos();
    mostrarEstado("ejecutando");
    chrome.runtime.sendMessage({ tipo: "iniciar_ejecucion" });
  });
  btnDashboard.addEventListener("click", () => {
    if (DASHBOARD_URL) chrome.runtime.sendMessage({ tipo: "abrir_dashboard", url: DASHBOARD_URL });
  });

  // ---------- Mensajes entrantes del background ----------
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.tipo) return;
    switch (msg.tipo) {
      case "campo_detectado": agregarCampo(msg.nombre, msg.time); break;
      case "paso_actual": marcarPasoActual(msg.paso); break;
      case "paso_completado": marcarPasoCompletado(msg.paso); break;
    }
  });

  // Arranque: colapsado mostrando el FAB.
  mostrarEstado("idle");
})();
