import { aprenderMapeoConGemini } from "../lib/gemini.js";
import { setCorsHeaders } from "../lib/cors.js";

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Metodo no permitido" });
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

    if (payload.tipo !== "aprender_mapeo") {
      return res.status(400).json({
        ok: false,
        error: "tipo debe ser aprender_mapeo",
      });
    }

    const mapeo = await aprenderMapeoConGemini(payload.acciones || []);
    return res.status(200).json({ ok: true, mapeo });
  } catch (error) {
    console.error("[api/aprender-mapeo]", error);
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
}
