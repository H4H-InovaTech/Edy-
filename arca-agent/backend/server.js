import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aprenderMapeoConGemini } from "./lib/gemini.js";
import { setCorsHeaders } from "./lib/cors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 3000);

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, {
        ok: true,
        service: "arca-agent-backend",
        runtime: "local",
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/aprender-mapeo") {
      const payload = await readJsonBody(req);

      if (payload.tipo !== "aprender_mapeo") {
        sendJson(res, 400, {
          ok: false,
          error: "tipo debe ser aprender_mapeo",
        });
        return;
      }

      const mapeo = await aprenderMapeoConGemini(payload.acciones || []);
      sendJson(res, 200, { ok: true, mapeo });
      return;
    }

    sendJson(res, 404, {
      ok: false,
      error: "Ruta no encontrada",
    });
  } catch (error) {
    console.error("[arca-agent-backend]", error);
    sendJson(res, 500, {
      ok: false,
      error: error.message,
    });
  }
});

server.listen(PORT, () => {
  console.log(`Arca Agent backend escuchando en el puerto ${PORT}`);
  console.log(`Endpoint local: http://localhost:${PORT}/api/aprender-mapeo`);
});

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^["']|["']$/g, "");

    if (!process.env[key]) process.env[key] = value;
  }
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};

  return JSON.parse(raw);
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}
