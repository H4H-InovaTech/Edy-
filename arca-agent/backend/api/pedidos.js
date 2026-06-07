import { setCorsHeaders } from "../lib/cors.js";
import { guardarPedido, listarPedidos } from "../lib/pedidos.js";

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      data: listarPedidos(),
    });
  }

  if (req.method === "POST") {
    try {
      const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const registro = guardarPedido(payload);

      return res.status(200).json({
        ok: true,
        data: registro,
      });
    } catch (error) {
      console.error("[api/pedidos]", error);
      return res.status(500).json({
        ok: false,
        error: error.message,
      });
    }
  }

  return res.status(405).json({ ok: false, error: "Metodo no permitido" });
}
