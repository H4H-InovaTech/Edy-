export function tieneAppsScriptUrl() {
  return Boolean(process.env.APPS_SCRIPT_URL);
}

export async function listarPedidosDesdeAppsScript() {
  const respuesta = await fetch(obtenerAppsScriptUrl(), {
    method: "GET",
  });

  return parseAppsScriptResponse(respuesta);
}

export async function guardarPedidoEnAppsScript(payload) {
  const respuesta = await fetch(obtenerAppsScriptUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseAppsScriptResponse(respuesta);
}

function obtenerAppsScriptUrl() {
  const url = process.env.APPS_SCRIPT_URL;
  if (!url) {
    throw new Error("Falta APPS_SCRIPT_URL en las variables de entorno.");
  }
  return url;
}

async function parseAppsScriptResponse(respuesta) {
  const texto = await respuesta.text();

  if (!respuesta.ok) {
    throw new Error("Apps Script respondio " + respuesta.status + ": " + texto);
  }

  const json = JSON.parse(texto);
  if (!json.ok) {
    throw new Error(json.error || "Apps Script respondio ok=false.");
  }

  return json;
}
