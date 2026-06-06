// background.js — Edy service worker
// Manages extension icon state and routes popup commands to the active tab's content script.

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg?.tipo) return;

  switch (msg.tipo) {
    case 'iniciar_grabacion':
      chrome.action.setIcon({ path: 'icons/EdyPensando.png' });
      break;

    case 'detener_grabacion':
      chrome.action.setIcon({ path: 'icons/EdyNeutro.png' });
      break;

    case 'iniciar_ejecucion':
      chrome.action.setIcon({ path: 'icons/EdyPensando.png' });
      // Forward to the active tab so content_script.js handles the actual work
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { tipo: 'iniciar_ejecucion' });
        }
      });
      break;

    case 'ejecucion_completada':
      chrome.action.setIcon({ path: 'icons/EdySonriente.png' });
      break;

    case 'abrir_dashboard':
      if (msg.url) chrome.tabs.create({ url: msg.url });
      break;
  }
});
