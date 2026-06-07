const globalStore = globalThis.__arcaAgentPedidos || {
  pedidos: [],
};

globalThis.__arcaAgentPedidos = globalStore;

export function guardarPedido(payload) {
  const registro = normalizarPedido(payload);
  globalStore.pedidos.push(registro);
  return registro;
}

export function listarPedidos() {
  return globalStore.pedidos;
}

function normalizarPedido(payload) {
  const datosPedido = payload?.mapeo?.datos_pedido || payload?.datos_pedido || {};
  const acciones = Array.isArray(payload?.acciones) ? payload.acciones : [];
  const primeraUrl = acciones.find((accion) => accion.url)?.url || "";

  return {
    id: payload?.id || "pedido-" + Date.now(),
    timestamp: new Date().toLocaleString("es-MX"),
    estado: payload?.estado || "Completada",
    portal: payload?.portal || hostnameDesdeUrl(primeraUrl) || "Demo",
    orden: datosPedido.pedido_id || payload?.orden || payload?.id || "",
    cliente_id: datosPedido.cliente_id || payload?.cliente_id || "",
    cliente: datosPedido.cliente || datosPedido.cliente_nombre || payload?.cliente || "",
    skus: Array.isArray(datosPedido.sku) ? datosPedido.sku.join(",") : datosPedido.sku || "",
    importe: datosPedido.importe || datosPedido.monto || payload?.importe || "",
    hora: new Date().toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    total_acciones: payload?.total_acciones || acciones.length,
    mapeo: payload?.mapeo || null,
    acciones,
  };
}

function hostnameDesdeUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
