// apps_script.gs — Edy: Google Apps Script backend
// Deploy as Web App (Execute as: Me, Access: Anyone) and paste the URL into the extension.

var HOJA_NOMBRE = "Pedidos";
var COLUMNAS_BASE = ["timestamp", "portal", "ejecutado_por", "orden", "cliente", "skus", "importe_total", "estado", "tiempo_ahorrado"];

// ─── POST: recibe un pedido de la extensión y lo guarda en Sheets ─────────────

function doPost(e) {
  try {
    var raw = e.postData && e.postData.contents ? e.postData.contents : "{}";
    var datos = JSON.parse(raw);
    var hoja = obtenerHoja();
    var columnas = asegurarColumnas(hoja, datos);

    var fila = columnas.map(function(col) {
      var val = datos[col];
      if (val === undefined || val === null) return "";
      if (typeof val === "object") return JSON.stringify(val);
      return String(val);
    });

    hoja.appendRow(fila);
    SpreadsheetApp.flush();

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, mensaje: "Pedido guardado" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── GET: devuelve todos los pedidos en formato JSON para el dashboard ────────

function doGet(e) {
  try {
    var hoja = obtenerHoja();
    var filas = hoja.getDataRange().getValues();

    if (filas.length <= 1) {
      return jsonResponse({ ok: true, data: [] });
    }

    var encabezados = filas[0].map(function(h) { return String(h).toLowerCase(); });
    var pedidos = [];

    for (var i = 1; i < filas.length; i++) {
      var fila = filas[i];
      var obj = {};
      encabezados.forEach(function(col, idx) {
        obj[col] = fila[idx];
      });

      // Normalizar para dashboard.js sin perder columnas dinamicas.
      var normalizado = {
        orden:     obj.orden     || obj.cliente_id || ("EDY-" + i),
        cliente:   obj.cliente   || obj.cliente_nombre || obj.portal || "—",
        skus:      obj.skus      || obj.sku_producto  || "—",
        importe_total: obj.importe_total || obj.importe || obj.monto || "—",
        hora:      obj.timestamp || obj.hora          || "",
        estado:    obj.estado    || "Completada",
        portal:    obj.portal    || "—",
        ejecutado_por: obj.ejecutado_por || "Edy",
        tiempo_ahorrado: obj.tiempo_ahorrado || "3.5",
      };

      pedidos.push(Object.assign({}, obj, normalizado));
    }

    return jsonResponse({ ok: true, data: pedidos });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message, data: [] });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function obtenerHoja() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJA_NOMBRE);

  if (!hoja) {
    hoja = ss.insertSheet(HOJA_NOMBRE);
    hoja.appendRow(COLUMNAS_BASE);
    hoja.getRange(1, 1, 1, COLUMNAS_BASE.length).setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#ffffff");
    hoja.setFrozenRows(1);
  } else if (hoja.getLastRow() === 0) {
    hoja.appendRow(COLUMNAS_BASE);
    hoja.getRange(1, 1, 1, COLUMNAS_BASE.length).setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#ffffff");
    hoja.setFrozenRows(1);
  }

  return hoja;
}

function asegurarColumnas(hoja, datos) {
  var columnas = obtenerEncabezados(hoja);
  var existentes = {};

  columnas.forEach(function(col) {
    existentes[col] = true;
  });

  COLUMNAS_BASE.forEach(function(col) {
    if (!existentes[col]) {
      columnas.push(col);
      existentes[col] = true;
    }
  });

  Object.keys(datos).forEach(function(col) {
    if (!existentes[col]) {
      columnas.push(col);
      existentes[col] = true;
    }
  });

  hoja.getRange(1, 1, 1, columnas.length).setValues([columnas]);
  hoja.getRange(1, 1, 1, columnas.length).setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#ffffff");

  return columnas;
}

function obtenerEncabezados(hoja) {
  var ultimaColumna = hoja.getLastColumn();
  if (!ultimaColumna) return COLUMNAS_BASE.slice();

  return hoja.getRange(1, 1, 1, ultimaColumna)
    .getValues()[0]
    .map(function(h) { return String(h || "").trim(); })
    .filter(Boolean);
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
