import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 3000);
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

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
        model: GEMINI_MODEL,
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/aprender-mapeo") {
      const payload = await readJsonBody(req);

      if (payload.tipo !== "aprender_mapeo") {
        sendJson(res, 400, { ok: false, error: "tipo debe ser aprender_mapeo" });
        return;
      }

      const mapeo = await aprenderMapeoConGemini(payload);
      sendJson(res, 200, { ok: true, mapeo });
      return;
    }

    sendJson(res, 404, { ok: false, error: "Ruta no encontrada" });
  } catch (error) {
    console.error("[arca-agent-backend]", error);
    sendJson(res, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Arca Agent backend escuchando en el puerto ${PORT}`);
  console.log(`Modelo: ${GEMINI_MODEL}`);
  console.log(`Endpoint: http://localhost:${PORT}/api/aprender-mapeo`);
});

// ─── Gemini ───────────────────────────────────────────────────────────────────

async function aprenderMapeoConGemini(payload) {
  const {
    acciones = [],
    acciones_origen = [],
    acciones_destino = [],
  } = payload;

  const tieneAcciones =
    acciones.length > 0 || acciones_origen.length > 0 || acciones_destino.length > 0;

  if (!tieneAcciones) {
    throw new Error("No llegaron acciones para aprender el mapeo.");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta GEMINI_API_KEY en arca-agent/backend/.env");
  }

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(GEMINI_MODEL) +
    ":generateContent?key=" +
    encodeURIComponent(apiKey);

  const respuesta = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: crearPromptMapeo(payload) }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    }),
  });

  const textoRespuesta = await respuesta.text();

  if (!respuesta.ok) {
    throw new Error("Gemini respondió " + respuesta.status + ": " + textoRespuesta);
  }

  const data = JSON.parse(textoRespuesta);
  const textoGemini = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  return parseGeminiJson(textoGemini);
}

function crearPromptMapeo(payload) {
  const {
    acciones = [],
    snapshot_origen = [],
    url_origen = "",
  } = payload;

  const formatoEsperado = {
    portal_url: url_origen || "https://proveedor.com",
    tipo_flujo: "orden_proveedor",
    pasos: [
      {
        nombre: "Iniciar sesión",
        acciones: [
          { tipo: "input",  selector: "#user-name", valor: "standard_user", campo: "usuario" },
          { tipo: "input",  selector: "#password",  valor: "secret_sauce",  campo: "contraseña" },
          { tipo: "click",  selector: "#login-button",                      campo: "boton_login" },
        ],
      },
      {
        nombre: "Agregar productos al carrito",
        acciones: [
          { tipo: "click", selector: ".btn_inventory",    campo: "agregar_producto" },
          { tipo: "click", selector: ".shopping_cart_link", campo: "ir_al_carrito" },
        ],
      },
      {
        nombre: "Confirmar pedido",
        acciones: [
          { tipo: "click", selector: "#checkout",  campo: "checkout" },
          { tipo: "input", selector: "#first-name", valor: "Edy",    campo: "nombre" },
          { tipo: "input", selector: "#last-name",  valor: "Bot",    campo: "apellido" },
          { tipo: "input", selector: "#postal-code", valor: "12345", campo: "codigo_postal" },
          { tipo: "click", selector: "#continue",  campo: "continuar" },
          { tipo: "click", selector: "#finish",    campo: "finalizar" },
        ],
      },
    ],
    campos_confirmacion: [
      { nombre: "productos_ordenados", selector: ".inventory_item_name", multiple: true },
      { nombre: "total",               selector: ".summary_total_label",  multiple: false },
      { nombre: "orden_id",            selector: ".complete-header",      multiple: false },
    ],
  };

  return [
    "Eres el cerebro de Edy, un agente RPA inteligente para Arca Continental.",
    "Analiza las acciones grabadas de un usuario colocando un pedido en un portal proveedor.",
    "Tu tarea: generar un PLAYBOOK de navegación que Edy pueda repetir autónomamente.",
    "",
    "PORTAL BASE: " + (url_origen || "(desconocido)"),
    "",
    "REGLAS IMPORTANTES:",
    "  1. Agrupa las acciones en PASOS LÓGICOS (ej: 'Iniciar sesión', 'Seleccionar productos', 'Confirmar pedido').",
    "  2. Cada paso tiene un array 'acciones' con los clicks e inputs en orden exacto.",
    "  3. Para 'tipo': usa 'input' para campos de texto, 'click' para botones/links, 'select' para dropdowns.",
    "  4. Para 'valor': usa el valor literal que ingresó el usuario (passwords, usernames, cantidades).",
    "  5. Para 'selector': usa el más estable: #id > [name=x] > [aria-label=x] > .clase-semantica.",
    "  6. En 'campos_confirmacion': identifica selectores de elementos en la página de confirmación",
    "     que muestren: productos ordenados, total, número de orden. Marca multiple:true para listas.",
    "  7. NO inventes selectores. Si no puedes inferir un selector confiable, omite esa acción.",
    "  8. El 'campo' de cada acción es un nombre descriptivo corto en snake_case.",
    "",
    "Responde SOLO JSON válido, sin markdown, sin texto extra.",
    "Estructura exacta requerida:",
    JSON.stringify(formatoEsperado, null, 2),
    "",
    "=== SNAPSHOT DOM (elementos visibles en la primera página) ===",
    JSON.stringify(snapshot_origen, null, 2),
    "",
    "=== ACCIONES GRABADAS DEL USUARIO (en orden cronológico) ===",
    JSON.stringify(acciones, null, 2),
  ].join("\n");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function parseGeminiJson(texto) {
  const limpio = String(texto || "{}")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(limpio);
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}
