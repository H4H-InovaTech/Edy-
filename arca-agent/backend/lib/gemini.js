const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash-lite";

export async function aprenderMapeoConGemini(acciones) {
  if (!Array.isArray(acciones) || acciones.length === 0) {
    throw new Error("No llegaron acciones para aprender el mapeo.");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta GEMINI_API_KEY en las variables de entorno.");
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) +
    ":generateContent?key=" +
    encodeURIComponent(apiKey);

  const respuesta = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: crearPromptMapeo(acciones) }],
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
    throw new Error("Gemini respondio " + respuesta.status + ": " + textoRespuesta);
  }

  const data = JSON.parse(textoRespuesta);
  const textoGemini = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  return parseGeminiJson(textoGemini);
}

function crearPromptMapeo(acciones) {
  return [
    "Eres el cerebro de un agente RPA llamado Edy para Arca Agent.",
    "Tu trabajo es leer acciones grabadas en una pagina web e inferir un mapeo semantico.",
    "Detecta campos como cliente_id, sku, cantidad, direccion, fecha_entrega, pedido_id y cualquier otro campo relevante.",
    "Conserva selectores CSS utiles para reproducir las acciones.",
    "Si una accion tiene valor capturado, mantenlo en el paso correspondiente.",
    "Responde SOLO JSON valido, sin markdown, sin explicaciones.",
    "La estructura exacta debe ser:",
    JSON.stringify({
      campos: [
        {
          nombre_semantico: "cliente_id",
          selector: "#cliente",
          evidencia: "label, placeholder o texto usado para inferirlo",
        },
      ],
      pasos: [
        {
          nombre: "Capturar cliente_id",
          accion: "input",
          selector: "#cliente",
          valor: "12345",
        },
      ],
      datos_pedido: {
        cliente_id: "12345",
        sku: ["SKU-1"],
        cantidad: [10],
      },
    }),
    "Acciones grabadas:",
    JSON.stringify(acciones, null, 2),
  ].join("\n");
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
