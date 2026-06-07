import { setCorsHeaders } from "../lib/cors.js";

export default function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Metodo no permitido" });
  }

  return res.status(200).json({
    ok: true,
    service: "arca-agent-backend",
    runtime: "vercel",
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    appsScriptConfigured: Boolean(process.env.APPS_SCRIPT_URL),
  });
}
