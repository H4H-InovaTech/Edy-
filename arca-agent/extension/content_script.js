// content_script.js — Edy: Ojos y Manos
// Grabación semántica de interacciones + ejecución autónoma del flujo aprendido.
// NUNCA usa selectores CSS/XPath como identificador principal — toda la inteligencia está en el backend (Claude).

(function () {
  if (window.__edyAgenteInyectado) return;
  window.__edyAgenteInyectado = true;

  const BACKEND = 'http://localhost:8000';
  const widget = window.EdyWidget;

  if (!widget) {
    console.error('[Edy] widget_ui.js debe cargarse antes que content_script.js');
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────────
  let sesionId = null;
  let grabando = false;
  let ejecutando = false;
  let pasoDescs = [];       // Step descriptions mirrored in widget
  let debounceTimer = null;
  const _listeners = {};    // Removable DOM event listeners

  // ─────────────────────────────────────────────────────────────────────────────
  // UTILS
  // ─────────────────────────────────────────────────────────────────────────────
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const getStorage = (keys) => new Promise((res) => chrome.storage.local.get(keys, res));
  const setStorage = (data) => new Promise((res) => chrome.storage.local.set(data, res));

  function hhMM() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function toast(msg, color = '#16a34a') {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;bottom:110px;right:24px;z-index:2147483647;
      background:${color};color:#fff;padding:10px 16px;border-radius:10px;
      font-family:-apple-system,sans-serif;font-size:12px;font-weight:600;
      box-shadow:0 4px 16px rgba(0,0,0,.35);max-width:320px;line-height:1.4;
      transition:opacity .3s;`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 4500);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BACKEND HELPERS
  // ─────────────────────────────────────────────────────────────────────────────
  async function apiPost(path, body) {
    const resp = await fetch(`${BACKEND}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return resp.json();
  }

  // sendBeacon survives page navigation; used for click events that may navigate away
  function beaconPaso(paso) {
    navigator.sendBeacon(
      `${BACKEND}/paso`,
      new Blob([JSON.stringify({ sesionId, paso })], { type: 'application/json' })
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // INIT — resume state after cross-page navigation
  // ─────────────────────────────────────────────────────────────────────────────
  (async function init() {
    const data = await getStorage(['sesionId', 'grabando', 'ejecutando', 'pasoEjecucion', 'workflow']);
    sesionId = data.sesionId || null;

    if (data.grabando) {
      // Resume recording on new page
      grabando = true;
      _activarListeners();
      widget.mostrarEstado('observando');
      beaconPaso({
        tipo: 'page_load',
        url: location.href,
        tituloPagina: document.title,
        htmlResumen: (document.body?.innerText || '').substring(0, 1000),
      });

    } else if (data.ejecutando) {
      // Resume execution on new page after navigation
      ejecutando = true;
      widget.mostrarEstado('ejecutando');
      pasoDescs = data.workflow?.pasos_automatizacion?.map((p) => p.descripcion) || [];
      if (pasoDescs.length) widget.renderPasos(pasoDescs);
      await sleep(800); // Let page fully settle before acting
      await _ejecutarLoop(data.pasoEjecucion || 0);

    } else if (data.sesionId && data.workflow) {
      // Workflow learned — enable Execute button
      widget.habilitarEjecutar(true);
    }
  })();

  // ─────────────────────────────────────────────────────────────────────────────
  // RECORDING — semantic capture of user interactions (zero hardcoded selectors)
  // ─────────────────────────────────────────────────────────────────────────────
  async function iniciarGrabacion() {
    try {
      const data = await apiPost('/iniciar-sesion', {});
      sesionId = data.sesionId;
    } catch {
      sesionId = 'local-' + Date.now().toString(36);
    }

    grabando = true;
    await setStorage({ sesionId, grabando: true, ejecutando: false, pasoEjecucion: 0, workflow: null, orden: null });

    _activarListeners();

    // Register initial page context
    beaconPaso({
      tipo: 'page_load',
      url: location.href,
      tituloPagina: document.title,
      htmlResumen: (document.body?.innerText || '').substring(0, 1000),
    });
  }

  function _activarListeners() {
    _listeners.click  = (e) => _onClic(e);
    _listeners.input  = (e) => _onInput(e);
    _listeners.change = (e) => _onChange(e);
    document.addEventListener('click',  _listeners.click,  true);
    document.addEventListener('input',  _listeners.input,  true);
    document.addEventListener('change', _listeners.change, true);
  }

  async function detenerGrabacion() {
    grabando = false;
    document.removeEventListener('click',  _listeners.click,  true);
    document.removeEventListener('input',  _listeners.input,  true);
    document.removeEventListener('change', _listeners.change, true);
    await setStorage({ grabando: false });

    if (!sesionId) return;
    toast('Edy: Aprendiendo el flujo con IA…', '#0284c7');

    try {
      const data = await apiPost('/aprender', { sesionId });
      await setStorage({ workflow: data });
      widget.habilitarEjecutar(true);
      toast(`Edy: ¡Flujo aprendido! ${data.resumen || ''}`, '#16a34a');
    } catch {
      toast('Edy: Error al aprender. ¿Está el backend activo en :8000?', '#dc2626');
    }
  }

  // ─── DOM event handlers ───────────────────────────────────────────────────

  function _onClic(e) {
    if (!grabando) return;
    const el = e.target;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) return;

    const nombre = _extraerNombreCampo(el) || (el.innerText || '').trim().substring(0, 50) || el.tagName;
    beaconPaso({
      tipo: 'click',
      contextoElemento: _extraerContextoSemantico(el),
      textoVisible: (el.innerText || el.value || '').trim().substring(0, 200),
    });
    widget.agregarCampoDetectado(nombre, hhMM());
  }

  function _onInput(e) {
    if (!grabando) return;
    const el = e.target;
    if (!['INPUT', 'TEXTAREA'].includes(el.tagName) || el.type === 'password') return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const nombre = _extraerNombreCampo(el) || el.placeholder || 'campo';
      beaconPaso({ tipo: 'input', contextoElemento: _extraerContextoSemantico(el) });
      widget.agregarCampoDetectado(nombre, hhMM());
    }, 650);
  }

  function _onChange(e) {
    if (!grabando) return;
    const el = e.target;
    if (el.tagName !== 'SELECT') return;

    beaconPaso({
      tipo: 'select',
      contextoElemento: _extraerContextoSemantico(el),
      opcionSeleccionada: el.options[el.selectedIndex]?.text || el.value,
    });
    widget.agregarCampoDetectado(_extraerNombreCampo(el) || 'select', hhMM());
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SEMANTIC CONTEXT EXTRACTION
  // ─────────────────────────────────────────────────────────────────────────────
  function _extraerContextoSemantico(el) {
    return {
      etiqueta:     _extraerNombreCampo(el),
      placeholder:  el.placeholder || '',
      ariaLabel:    el.getAttribute('aria-label') || '',
      title:        el.title || '',
      tipoInput:    el.type || el.tagName.toLowerCase(),
      valor:        el.type === 'password'
                      ? '[OMITIDO]'
                      : (el.value || el.innerText || el.textContent || '').trim().substring(0, 500),
      textoCercano: _extraerTextoCercano(el),
      htmlFragmento: _extraerFragmentoContenedor(el),
      url:          location.href,
      tituloPagina: document.title,
    };
  }

  function _extraerNombreCampo(el) {
    // 1. <label for="id">
    if (el.id) {
      try {
        const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lbl) return lbl.innerText.trim();
      } catch {}
    }
    // 2. Wrapped in <label>
    const lblPadre = el.closest('label');
    if (lblPadre) {
      const c = lblPadre.cloneNode(true);
      c.querySelectorAll('input, select, textarea').forEach((i) => i.remove());
      const t = c.innerText.trim();
      if (t) return t;
    }
    // 3. aria-labelledby
    const lby = el.getAttribute('aria-labelledby');
    if (lby) {
      const lbl = document.getElementById(lby);
      if (lbl) return lbl.innerText.trim();
    }
    // 4. Previous sibling with text
    let prev = el.previousElementSibling;
    while (prev) {
      const t = prev.innerText?.trim();
      if (t && t.length > 0 && t.length < 120) return t;
      prev = prev.previousElementSibling;
    }
    // 5. Parent text (minus form controls)
    const padre = el.parentElement;
    if (padre) {
      const c = padre.cloneNode(true);
      c.querySelectorAll('input, select, textarea, button').forEach((i) => i.remove());
      const t = c.innerText.trim();
      if (t && t.length < 120) return t;
    }
    return el.placeholder || el.name || '';
  }

  function _extraerTextoCercano(el) {
    let n = el.parentElement;
    for (let i = 0; i < 3 && n; i++) {
      const t = n.innerText?.trim();
      if (t && t.length > 5 && t.length < 400) return t.substring(0, 400);
      n = n.parentElement;
    }
    return '';
  }

  function _extraerFragmentoContenedor(el) {
    const c = el.closest('form') || el.closest('section') || el.closest('article') || el.parentElement?.parentElement;
    return (c || el).outerHTML.substring(0, 2500);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EXECUTION — autonomous replay of learned workflow
  // ─────────────────────────────────────────────────────────────────────────────
  async function iniciarEjecucion() {
    ejecutando = true;

    // Step 1: Capture current page as the order source
    toast('Edy: Leyendo la orden de compra…', '#0284c7');
    try {
      const ordenData = await apiPost('/capturar-orden', {
        sesionId,
        url:        location.href,
        titulo:     document.title,
        html:       document.documentElement.outerHTML.substring(0, 80000),
        textoPlano: (document.body?.innerText || '').substring(0, 5000),
      });
      await setStorage({ orden: ordenData, ejecutando: true, pasoEjecucion: 0 });

      if (ordenData.orden_detectada) {
        toast(`Edy: Orden capturada ✓ — ${ordenData.resumen}`, '#16a34a');
      } else {
        toast('Edy: Sin datos de orden en esta página — continuando…', '#d97706');
      }
    } catch {
      await setStorage({ ejecutando: true, pasoEjecucion: 0 });
      toast('Edy: No se pudo contactar al backend en :8000', '#dc2626');
      return;
    }

    // Step 2: Prepare widget steps from learned workflow
    const { workflow } = await getStorage(['workflow']);
    pasoDescs = workflow?.pasos_automatizacion?.map((p) => p.descripcion) || ['Procesando…'];
    widget.renderPasos(pasoDescs);

    // Step 3: Start execution loop
    await _ejecutarLoop(0);
  }

  async function _ejecutarLoop(pasoActual) {
    if (!ejecutando) return;
    await setStorage({ pasoEjecucion: pasoActual });

    if (pasoDescs[pasoActual]) widget.marcarPasoActual(pasoDescs[pasoActual]);

    let accion;
    try {
      accion = await apiPost('/siguiente-accion', {
        sesionId,
        url:        location.href,
        html:       document.documentElement.outerHTML.substring(0, 60000),
        textoPlano: (document.body?.innerText || '').substring(0, 4000),
        pasoActual,
      });
    } catch {
      toast('Edy: Error de conexión con el backend.', '#dc2626');
      return;
    }

    if (accion.accion === 'completado') {
      ejecutando = false;
      await setStorage({ ejecutando: false });
      pasoDescs.forEach((d) => widget.marcarPasoCompletado(d));
      toast('¡Edy completó la automatización exitosamente! ✓', '#16a34a');
      chrome.runtime.sendMessage({ tipo: 'ejecucion_completada' });
      return;
    }

    if (accion.accion === 'error') {
      toast(`Edy: ${accion.descripcion || 'Error desconocido'}`, '#dc2626');
      return;
    }

    const ok = await _ejecutarAccionEnPagina(accion);

    // Navigation reloads the page; the loop resumes automatically via init()
    if (accion.accion === 'navegar') return;

    if (ok && pasoDescs[pasoActual]) widget.marcarPasoCompletado(pasoDescs[pasoActual]);

    await sleep(accion.esperarMs ?? 800);
    await _ejecutarLoop(pasoActual + 1);
  }

  async function _ejecutarAccionEnPagina(accion) {
    if (accion.accion === 'navegar') {
      await sleep(300);
      window.location.href = accion.url;
      return true;
    }
    if (accion.accion === 'esperar') {
      await sleep(accion.esperarMs ?? 1000);
      return true;
    }

    const el = encontrarElemento(accion.elemento || {});
    if (!el) {
      console.warn('[Edy] Elemento no encontrado:', accion.elemento);
      return false;
    }

    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await sleep(200);

    switch (accion.accion) {
      case 'click':
        el.click();
        break;

      case 'escribir':
      case 'fill': {
        el.focus();
        // Support React/Vue controlled inputs by using the native setter
        const proto  = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, accion.valor ?? '');
        else el.value = accion.valor ?? '';
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }

      case 'seleccionar':
        el.value = accion.valor ?? '';
        el.dispatchEvent(new Event('change', { bubbles: true }));
        break;
    }

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SEMANTIC ELEMENT FINDER — zero hardcoded selectors
  // Every match is scored by semantic proximity; the highest score wins.
  // ─────────────────────────────────────────────────────────────────────────────
  function encontrarElemento({
    etiqueta      = '',
    placeholder   = '',
    ariaLabel     = '',
    tipo          = '',
    selectorAyuda = '',
  } = {}) {
    const scores = new Map();

    const add = (el, pts) => {
      if (!el || !document.contains(el)) return;
      scores.set(el, (scores.get(el) || 0) + pts);
    };

    // Advisory hint from Claude (not authoritative)
    if (selectorAyuda) {
      try { add(document.querySelector(selectorAyuda), 2); } catch {}
    }

    // Placeholder
    if (placeholder) {
      const pl = placeholder.toLowerCase();
      document.querySelectorAll('input, textarea').forEach((el) => {
        const ph = (el.placeholder || '').toLowerCase();
        if (ph === pl)                              add(el, 10);
        else if (ph.includes(pl) || pl.includes(ph)) add(el, 5);
      });
    }

    // aria-label
    if (ariaLabel) {
      const al = ariaLabel.toLowerCase();
      document.querySelectorAll('[aria-label]').forEach((el) => {
        const v = (el.getAttribute('aria-label') || '').toLowerCase();
        if (v === al)                              add(el, 10);
        else if (v.includes(al) || al.includes(v)) add(el, 5);
      });
    }

    // Label text → its associated control
    if (etiqueta) {
      const eq = etiqueta.toLowerCase();

      document.querySelectorAll('label').forEach((lbl) => {
        const c = lbl.cloneNode(true);
        c.querySelectorAll('input, select, textarea').forEach((i) => i.remove());
        const lt = (c.innerText || '').trim().toLowerCase();
        if (!lt) return;
        const pts = lt === eq ? 10 : lt.includes(eq) ? 6 : (eq.includes(lt) && lt.length > 3) ? 4 : 0;
        if (pts > 0) {
          const target =
            lbl.control ||
            (lbl.htmlFor ? document.getElementById(lbl.htmlFor) : null) ||
            lbl.querySelector('input, textarea, select');
          add(target, pts);
        }
      });

      // Inputs/textareas/selects with matching placeholder or aria-label or nearby text
      document.querySelectorAll('input, textarea, select').forEach((el) => {
        const ph  = (el.placeholder || '').toLowerCase();
        const al2 = (el.getAttribute('aria-label') || '').toLowerCase();
        const ctx = _extraerTextoCercano(el).toLowerCase();
        if (ph.includes(eq))  add(el, 7);
        if (al2.includes(eq)) add(el, 8);
        if (ctx.includes(eq)) add(el, 3);
      });

      // Buttons and links by visible text
      const isClickable = !tipo || ['button', 'submit', 'a', 'link'].includes(tipo);
      if (isClickable) {
        document.querySelectorAll('button, [type="submit"], [role="button"], a').forEach((el) => {
          const t = (el.innerText || '').trim().toLowerCase();
          if (t === eq)                               add(el, 10);
          else if (t.includes(eq) || eq.includes(t)) add(el, 5);
        });
      }
    }

    if (scores.size === 0) return null;
    return [...scores.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // WIDGET CALLBACKS — user interacts via floating panel
  // ─────────────────────────────────────────────────────────────────────────────
  widget.onObservar(() => {
    widget.resetObservando();
    widget.mostrarEstado('observando');
    chrome.runtime.sendMessage({ tipo: 'iniciar_grabacion' });
    iniciarGrabacion();
  });

  widget.onDetener(() => {
    chrome.runtime.sendMessage({ tipo: 'detener_grabacion' });
    detenerGrabacion();
    widget.mostrarEstado('idle');
  });

  widget.onEjecutar(() => {
    widget.mostrarEstado('ejecutando');
    chrome.runtime.sendMessage({ tipo: 'iniciar_ejecucion' });
    iniciarEjecucion();
  });

  widget.onDashboard(() => {
    chrome.runtime.sendMessage({ tipo: 'abrir_dashboard', url: `${BACKEND}/dashboard` });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // MESSAGES from popup / background
  // ─────────────────────────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg?.tipo) return;
    switch (msg.tipo) {
      case 'iniciar_grabacion':
        if (!grabando) {
          widget.resetObservando();
          widget.mostrarEstado('observando');
          iniciarGrabacion();
        }
        break;
      case 'detener_grabacion':
        if (grabando) { detenerGrabacion(); widget.mostrarEstado('idle'); }
        break;
      case 'iniciar_ejecucion':
        if (!ejecutando) { widget.mostrarEstado('ejecutando'); iniciarEjecucion(); }
        break;
      case 'campo_detectado':
        widget.agregarCampoDetectado(msg.nombre, msg.time);
        break;
      case 'paso_actual':
        widget.marcarPasoActual(msg.paso);
        break;
      case 'paso_completado':
        widget.marcarPasoCompletado(msg.paso);
        break;
    }
  });
})();
