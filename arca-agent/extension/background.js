// background.js
// Service worker de la extensión.
// Recibe mensajes del content script y los reenvía al dashboard o a la API.

// Estados del ícono de la barra (referencia):
//   observando / ejecutando -> icons/EdyPensando.png
//   completado              -> icons/EdySonriente.png
//   idle                    -> icons/EdyNeutro.png

// Recibe mensajes del content_script (widget flotante de Edy) y reacciona.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || !msg.tipo) return;

  switch (msg.tipo) {
    case "iniciar_grabacion":
    case "iniciar_ejecucion":
      chrome.action.setIcon({ path: "icons/EdyPensando.png" });
      // TODO: aquí va la lógica real de grabación/ejecución.
      break;

    case "detener_grabacion":
      chrome.action.setIcon({ path: "icons/EdyNeutro.png" });
      break;

    case "abrir_dashboard":
      if (msg.url) chrome.tabs.create({ url: msg.url });
      break;
  }
});
