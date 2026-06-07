// content_script.js
// "Ojos y manos" de Edy: graba lo que el usuario hace en la página y
// reproduce las acciones grabadas. NO dibuja nada — controla al widget visual
// (definido en widget_ui.js, expuesto en window.EdyWidget) a través de su API
// pública, sin conocer su marcado ni su CSS internos.
//
// Importante: widget_ui.js debe cargarse ANTES que este archivo
// (ver el orden del array "js" en manifest.json) para que window.EdyWidget
// ya exista cuando este script corre.

(function () {
  if (window.__edyAgenteInyectado) return;
  window.__edyAgenteInyectado = true;

  const widget = window.EdyWidget;
  if (!widget) {
    console.error("Edy: widget_ui.js no se cargó antes que content_script.js");
    return;
  }

  // ---------- Config ----------
  const DASHBOARD_URL = "http://127.0.0.1:5500/arca-agent/dashboard/index.html";
  const PASOS_EJECUCION = [
    "Abrir SAP / módulo VA01",
    "Capturar cliente_id",
    "Capturar 6 SKUs",
    "Validar inventario...",
    "Confirmar pedido",
  ];

  // ---------- Grabación ----------
  function iniciarGrabacion() {
    // TODO: poner listeners globales en la página (click, input/change, submit).
    // Por cada evento, generar un selector único del elemento (id → name → CSS path)
    // y guardar una acción: {accion:'fill', selector, valor, label, t} o {accion:'click', selector, t}.
    // Mientras se graba, avisar al widget en vivo: widget.agregarCampoDetectado(nombre, time).
  }

  function detenerGrabacion() {
    // TODO: quitar los listeners y mandar la lista completa a background:
    // chrome.runtime.sendMessage({ tipo: 'acciones_grabadas', acciones: [...] });
  }

  // ---------- Ejecución ----------
  function iniciarEjecucion() {
    // TODO: al recibir { tipo:'ejecutar_accion', accion } de background,
    // ubicar el elemento por su selector, llenar el valor o hacer click
    // (disparando eventos input/change para que el sitio lo registre),
    // y avisar al widget: widget.marcarPasoActual(paso) / widget.marcarPasoCompletado(paso).
  }

  // ---------- Conectar la UI con la lógica ----------
  widget.onObservar(() => {
    widget.resetObservando();
    widget.mostrarEstado("observando");
    chrome.runtime.sendMessage({ tipo: "iniciar_grabacion" });
    iniciarGrabacion();
  });

  widget.onDetener(() => {
    chrome.runtime.sendMessage({ tipo: "detener_grabacion" });
    detenerGrabacion();
    widget.mostrarEstado("idle");
    widget.habilitarEjecutar(true);
  });

  widget.onEjecutar(() => {
    widget.renderPasos(PASOS_EJECUCION);
    widget.mostrarEstado("ejecutando");
    chrome.runtime.sendMessage({ tipo: "iniciar_ejecucion" });
    iniciarEjecucion();
  });

  widget.onPausar(() => {
    // TEMPORAL: muestra la pantalla de confeti para previsualizarla.
    // TODO: restaurar el flujo real (detener_ejecucion → idle).
    widget.mostrarEstado("completado");
  });

  // ---------- Mensajes entrantes del background ----------
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.tipo) return;
    switch (msg.tipo) {
      case "campo_detectado":
        widget.agregarCampoDetectado(msg.nombre, msg.time);
        break;
      case "paso_actual":
        widget.marcarPasoActual(msg.paso);
        break;
      case "paso_completado":
        widget.marcarPasoCompletado(msg.paso);
        break;
      case "flujo_completado":
        widget.mostrarEstado("completado");
        break;
    }
  });
})();
