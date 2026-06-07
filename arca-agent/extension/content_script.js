// content_script.js — Edy: widget controller + recorder + semantic field finder
//
// Responsibilities:
//  1. Connect the floating widget with the background (service worker).
//  2. Own the recording logic — more reliable than injecting via executeScript.
//  3. Expose window.edyEncontrarElemento for semantic fallback during execution.

(function () {
  if (window.__edyAgenteInyectado) return;
  window.__edyAgenteInyectado = true;

  const widget = window.EdyWidget;
  if (!widget) {
    console.error('[Edy] widget_ui.js must load before content_script.js');
    return;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Safe wrappers — "Extension context invalidated" is thrown when the extension
  // is reloaded while the page is still open. We catch it and bail gracefully.
  function isContextValid() {
    try { return Boolean(chrome.runtime?.id); } catch { return false; }
  }

  function sendMsg(msg) {
    if (!isContextValid()) return Promise.resolve(null);
    return chrome.runtime.sendMessage(msg).catch((err) => {
      if (!String(err).includes('context invalidated') && !String(err).includes('receiving end')) {
        console.warn('[Edy]', err);
      }
      return null;
    });
  }

  const getLocal = (keys) => new Promise((res) => {
    if (!isContextValid()) return res({});
    chrome.storage.local.get(keys, res);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // RECORDING — all event capture lives here, not in an injected script
  // ─────────────────────────────────────────────────────────────────────────────

  let isRecording    = false;
  let recordedActions = [];
  let recorderHandlers = null;

  const INTERACTIVE =
    'button, a, [role="button"], [role="link"], [role="menuitem"], ' +
    '[role="option"], [role="tab"], input[type="submit"], input[type="button"], ' +
    'input[type="checkbox"], input[type="radio"], select, [data-test], [data-testid]';

  const TEXT_INPUTS = new Set(['text','password','email','number','search','tel','url','date','time','']);

  function selectorPara(el) {
    if (!el || el === document) return '';
    if (el.id) return '#' + CSS.escape(el.id);
    const name = el.getAttribute('name');
    if (name) return el.tagName.toLowerCase() + '[name="' + CSS.escape(name) + '"]';
    const aria = el.getAttribute('aria-label');
    if (aria) return el.tagName.toLowerCase() + '[aria-label="' + CSS.escape(aria) + '"]';
    const test = el.getAttribute('data-test') || el.getAttribute('data-testid');
    if (test) return '[data-test="' + CSS.escape(test) + '"]';
    // Stable path from nearest unique ancestor
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
      let part = cur.tagName.toLowerCase();
      const parent = cur.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter(h => h.tagName === cur.tagName);
        if (sibs.length > 1) part += ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')';
      }
      parts.unshift(part);
      cur = parent;
    }
    return parts.join(' > ');
  }

  function etiquetaPara(el) {
    const id = el.id;
    const v =
      (id && document.querySelector('label[for="' + CSS.escape(id) + '"]')?.innerText) ||
      el.closest('label')?.innerText ||
      el.getAttribute('aria-label') ||
      el.getAttribute('placeholder') ||
      el.getAttribute('data-test') ||
      el.getAttribute('name') ||
      el.id ||
      (el.innerText || el.textContent || '');
    return String(v).trim().replace(/\s+/g, ' ').slice(0, 80);
  }

  // Capture the product/item name near a button for context during replay
  function contextoPara(el) {
    const card = el.closest(
      '[class*="item"], [class*="product"], [class*="card"], [class*="inventory"], ' +
      'li, article, tr, [class*="row"]'
    );
    if (!card) return '';
    const nameEl = card.querySelector(
      '[class*="name"], [class*="title"], [class*="label"], h1, h2, h3, h4, strong, b'
    );
    return nameEl ? (nameEl.innerText || nameEl.textContent || '').trim().slice(0, 100) : '';
  }

  function registrarAccion(tipo, el) {
    if (!el || el.closest?.('#edy-agent-host')) return;
    const sel = selectorPara(el);
    if (!sel) return;

    const accion = {
      id:          Date.now() + '-' + Math.random().toString(36).slice(2),
      tipo,
      selector:    sel,
      valor:       'value' in el ? el.value : '',
      texto:       (el.innerText || el.textContent || '').trim().slice(0, 100),
      tag:         el.tagName?.toLowerCase() || '',
      nombreCampo: etiquetaPara(el),
      contexto:    (tipo === 'click' || tipo === 'change') ? contextoPara(el) : '',
      timestamp:   Date.now(),
      url:         location.href,
    };

    recordedActions.push(accion);
    sendMsg({ tipo: 'accion_grabada', accion });
  }

  function iniciarRecording() {
    if (recorderHandlers) return; // already active
    isRecording = true;
    recordedActions = [];

    const onClick = (e) => {
      if (!isRecording) return;
      const tag  = (e.target.tagName || '').toLowerCase();
      const type = (e.target.type   || '').toLowerCase();
      // skip text inputs — the input event captures those more precisely
      if ((tag === 'input' && TEXT_INPUTS.has(type)) || tag === 'textarea') return;
      // bubble up to the nearest interactive ancestor so we capture the button, not a child <span>
      const el = e.target.closest(INTERACTIVE) || e.target;
      console.log('[Edy] click captured:', el.tagName, el.id || el.getAttribute('data-test') || el.textContent?.trim().slice(0, 30));
      registrarAccion('click', el);
    };

    const onInput = (e) => {
      if (!isRecording) return;
      registrarAccion('input', e.target);
    };

    const onChange = (e) => {
      if (!isRecording) return;
      const tag  = e.target.tagName?.toLowerCase();
      const type = (e.target.type || '').toLowerCase();
      if (tag === 'select' || type === 'checkbox' || type === 'radio') {
        registrarAccion('change', e.target);
      }
    };

    const onSubmit = (e) => {
      if (!isRecording) return;
      registrarAccion('submit', e.target);
    };

    recorderHandlers = { onClick, onInput, onChange, onSubmit };
    document.addEventListener('click',  onClick,  true);
    document.addEventListener('input',  onInput,  true);
    document.addEventListener('change', onChange, true);
    document.addEventListener('submit', onSubmit, true);
  }

  function detenerRecording() {
    isRecording = false;
    if (!recorderHandlers) return [];
    document.removeEventListener('click',  recorderHandlers.onClick,  true);
    document.removeEventListener('input',  recorderHandlers.onInput,  true);
    document.removeEventListener('change', recorderHandlers.onChange, true);
    document.removeEventListener('submit', recorderHandlers.onSubmit, true);
    recorderHandlers = null;
    const result = recordedActions;
    recordedActions = [];
    return result;
  }

  // Start recording immediately on page load by checking storage directly.
  // This avoids the background roundtrip race: clicks on a new page happen before
  // content_script_listo response arrives, causing early events to be missed.
  chrome.storage.local.get('estado_agente', ({ estado_agente }) => {
    if (estado_agente === 'observando') iniciarRecording();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SEMANTIC FIELD IDENTIFICATION  (used by background during execution)
  // ─────────────────────────────────────────────────────────────────────────────

  window.edyEncontrarElemento = function ({
    etiqueta      = '',
    placeholder   = '',
    ariaLabel     = '',
    tipo          = '',
    selectorAyuda = '',
    texto         = '',
    contexto      = '',
  } = {}) {
    const scores = new Map();
    const add = (el, pts) => {
      if (!el || !document.contains(el)) return;
      scores.set(el, (scores.get(el) || 0) + pts);
    };

    if (selectorAyuda) { try { add(document.querySelector(selectorAyuda), 2); } catch {} }

    if (placeholder) {
      const pl = placeholder.toLowerCase();
      document.querySelectorAll('input, textarea').forEach(el => {
        const ph = (el.placeholder || '').toLowerCase();
        if (ph === pl) add(el, 10); else if (ph.includes(pl) || pl.includes(ph)) add(el, 5);
      });
    }

    if (ariaLabel) {
      const al = ariaLabel.toLowerCase();
      document.querySelectorAll('[aria-label]').forEach(el => {
        const v = (el.getAttribute('aria-label') || '').toLowerCase();
        if (v === al) add(el, 10); else if (v.includes(al) || al.includes(v)) add(el, 5);
      });
    }

    if (etiqueta) {
      const eq = etiqueta.toLowerCase();
      document.querySelectorAll('label').forEach(lbl => {
        const clon = lbl.cloneNode(true);
        clon.querySelectorAll('input, select, textarea').forEach(i => i.remove());
        const lt = (clon.innerText || '').trim().toLowerCase();
        if (!lt) return;
        const pts = lt === eq ? 10 : lt.includes(eq) ? 6 : (eq.includes(lt) && lt.length > 3) ? 4 : 0;
        if (pts > 0) {
          const target = lbl.control || (lbl.htmlFor ? document.getElementById(lbl.htmlFor) : null) || lbl.querySelector('input, textarea, select');
          add(target, pts);
        }
      });
      document.querySelectorAll('input, textarea, select').forEach(el => {
        const ph  = (el.placeholder || '').toLowerCase();
        const al2 = (el.getAttribute('aria-label') || '').toLowerCase();
        if (ph.includes(eq))  add(el, 7);
        if (al2.includes(eq)) add(el, 8);
      });
      const esClickable = !tipo || ['button','submit','a','link','click'].includes(tipo);
      if (esClickable) {
        document.querySelectorAll('button, [type="submit"], [role="button"], a').forEach(el => {
          const t = (el.innerText || '').trim().toLowerCase();
          if (t === eq) add(el, 10); else if (t.includes(eq) || eq.includes(t)) add(el, 5);
        });
      }
    }

    // If we have the product name as context, narrow to buttons near that product
    if (contexto && (tipo === 'click' || !tipo)) {
      const ctx = contexto.toLowerCase();
      document.querySelectorAll('button, [role="button"], [data-test]').forEach(el => {
        const card = el.closest(
          '[class*="item"], [class*="product"], [class*="card"], [class*="inventory"], li, article, tr'
        );
        if (!card) return;
        const cardText = (card.innerText || '').toLowerCase();
        if (cardText.includes(ctx)) add(el, 15);
      });
    }

    // Button text matching as fallback
    if (texto) {
      const t = texto.toLowerCase();
      document.querySelectorAll('button, [role="button"], a, input[type="submit"]').forEach(el => {
        const bt = (el.innerText || el.textContent || el.value || '').trim().toLowerCase();
        if (bt === t) add(el, 8); else if (bt.includes(t)) add(el, 4);
      });
    }

    if (scores.size === 0) return null;
    return [...scores.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };

  window.edyEjecutarAccion = async function ({
    tipo        = 'click',
    selector    = '',
    valor       = '',
    nombreCampo = '',
    etiqueta    = '',
    texto       = '',
    contexto    = '',
  } = {}) {
    let el = selector ? document.querySelector(selector) : null;
    if (!el) {
      el = window.edyEncontrarElemento({ etiqueta: etiqueta || nombreCampo, tipo, selectorAyuda: selector, texto, contexto });
    }
    if (!el) return false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await sleep(120);
    if (tipo === 'input' || tipo === 'change') {
      el.focus();
      const proto  = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, valor); else el.value = valor;
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (tipo === 'submit') {
      el.closest('form')?.requestSubmit?.() ?? el.click();
    } else {
      el.click();
    }
    return true;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // WIDGET ↔ BACKGROUND
  // ─────────────────────────────────────────────────────────────────────────────

  widget.onObservar(() => {
    camposCapturados = 0;
    widget.resetObservando();
    widget.mostrarEstado('observando');
    sendMsg({ tipo: 'iniciar_grabacion' });
  });

  widget.onDetener(() => {
    chrome.runtime.sendMessage({ tipo: "detener_grabacion" });
    detenerGrabacion();
    // Pasa al estado "aprendido": Edy ya sabe el proceso.
    widget.setResumenAprendido(
      camposCapturados + " campos · " + PASOS_EJECUCION.length + " pasos"
    );
    widget.mostrarEstado("aprendido");
    widget.habilitarEjecutar(true);
  });

  widget.onEjecutar(async () => {
    const storage = await getLocal(['mapeo_aprendido']);
    const mapeo   = storage['mapeo_aprendido'];
    const pasos   = (mapeo?.pasos || []).map(p => p.nombre).filter(Boolean);
    widget.renderPasos(pasos.length ? pasos : ['Iniciando automatización…']);
    widget.mostrarEstado('ejecutando');
    sendMsg({ tipo: 'iniciar_ejecucion' });
  });

  widget.onDashboard(() => {
    if (DASHBOARD_URL) {
      chrome.runtime.sendMessage({ tipo: "abrir_dashboard", url: DASHBOARD_URL });
    }
  });

  widget.onPausar(() => {
    // Detener ejecución → vuelve al estado "aprendido" (Edy sigue sabiendo el proceso).
    chrome.runtime.sendMessage({ tipo: "detener_ejecucion" });
    widget.mostrarEstado("aprendido");
  });

  widget.onNuevo(() => {
    // Nuevo proceso → reinicia todo desde cero.
    chrome.runtime.sendMessage({ tipo: "nuevo_proceso" });
  });

  // ---------- Mensajes entrantes del background ----------
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.tipo) return;
    switch (msg.tipo) {
      case "campo_detectado":
        camposCapturados++;
        widget.agregarCampoDetectado(msg.nombre, msg.time);
        break;

      case 'paso_actual':
        widget.marcarPasoActual(msg.paso);
        break;

      case 'paso_completado':
        widget.marcarPasoCompletado(msg.paso);
        break;
      case "flujo_completado":
        widget.mostrarEstado("completado");
        break;
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // INIT — sync widget with background state on page load
  // ─────────────────────────────────────────────────────────────────────────────

  if (isContextValid()) {
    chrome.runtime.sendMessage({ tipo: 'content_script_listo' }, (resp) => {
      if (chrome.runtime.lastError || !resp) return;
      if (resp.estado === 'observando') {
        widget.mostrarEstado('observando');
        iniciarRecording();
      } else if (resp.estado === 'ejecutando') {
        widget.mostrarEstado('ejecutando');
      } else {
        widget.mostrarEstado('idle');
      }
      if ((resp.totalAcciones || 0) > 0 && resp.estado === 'idle') widget.habilitarEjecutar(true);
    });
  }
})();
