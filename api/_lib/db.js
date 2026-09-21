/**
 * Acceso a Firestore por su API REST, sin dependencias externas.
 *
 * Si no hay credenciales de Firebase configuradas, el modulo trabaja en
 * memoria: sirve para probar la aplicacion en local sin dar de alta nada.
 * En Vercel las credenciales son obligatorias y su ausencia es un error.
 */

import crypto from "node:crypto";

const PROJECT = (process.env.FIREBASE_PROJECT_ID || "").trim();
const EMAIL = (process.env.FIREBASE_CLIENT_EMAIL || "").trim().replace(/^["']|["']$/g, "");

/**
 * La clave privada llega de formas distintas segun como se haya pegado en
 * Vercel: con comillas o sin ellas, con los \n escritos tal cual o ya
 * convertidos en saltos de linea, o incluso toda en una sola linea. Aqui se
 * normaliza cualquiera de esas formas al PEM que espera Node.
 */
function normalizarClave(bruta) {
  let k = String(bruta || "").trim();

  // Comillas envolventes: rectas, tipograficas (las que mete TextEdit) o acentos graves.
  const COMILLAS = ['"', "'", "`", "“", "”", "‘", "’"];
  while (k.length > 1 && COMILLAS.includes(k[0]) && COMILLAS.includes(k[k.length - 1])) {
    k = k.slice(1, -1).trim();
  }

  // \n escritos como dos caracteres -> saltos de linea reales.
  k = k.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\n");
  k = k.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Si se ha quedado en una sola linea, se reconstruye el PEM con lineas de 64.
  if (k.includes("-----BEGIN") && !k.includes("\n")) {
    const m = k.match(/-----BEGIN ([A-Z ]+?)-----(.*?)-----END \1-----/);
    if (m) {
      const cuerpo = (m[2] || "").replace(/\s+/g, "");
      const lineas = cuerpo.match(/.{1,64}/g) || [];
      k = `-----BEGIN ${m[1]}-----\n${lineas.join("\n")}\n-----END ${m[1]}-----`;
    }
  }

  if (k && !k.endsWith("\n")) k += "\n";
  return k;
}

/** Descripcion de lo que se ha recibido, sin revelar la clave. */
function pistaClave(bruta) {
  const k = String(bruta || "");
  if (!k) return "la variable llega vacia";
  const t = k.trim();
  return [
    `${k.length} caracteres`,
    /^["'`“‘]/.test(t) ? "empieza por comilla" : "sin comilla inicial",
    k.includes("-----BEGIN") ? "contiene BEGIN" : "NO contiene la linea BEGIN",
    k.includes("\n") ? "con saltos de linea reales" : k.includes("\\n") ? "con \\n escritos" : "sin ningun salto",
  ].join(", ");
}

const KEY_BRUTA = process.env.FIREBASE_PRIVATE_KEY || "";
const KEY = normalizarClave(KEY_BRUTA);

function errorDeClave() {
  return (
    "No se puede usar FIREBASE_PRIVATE_KEY. Copiala otra vez del archivo .json de Firebase, " +
    `entera, desde -----BEGIN hasta -----END. (Lo recibido: ${pistaClave(KEY_BRUTA)}.)`
  );
}

/**
 * Comprueba, sin salir a la red, que la clave privada sirve para firmar.
 * Devuelve { ok } o { ok:false, motivo } con una explicacion en claro.
 */
export function clavePrivadaUtilizable() {
  if (!KEY) return { ok: false, motivo: errorDeClave() };
  try {
    crypto.createSign("RSA-SHA256").update("comprobacion").sign(KEY);
    return { ok: true };
  } catch {
    return { ok: false, motivo: errorDeClave() };
  }
}

export const HAY_FIREBASE = Boolean(PROJECT && EMAIL && KEY);
const EN_PRODUCCION = Boolean(process.env.VERCEL);

if (!HAY_FIREBASE && EN_PRODUCCION) {
  console.error(
    "Faltan FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL o FIREBASE_PRIVATE_KEY. " +
      "Anadelas en Vercel (Settings -> Environment Variables) y vuelve a desplegar."
  );
}

export class ErrorDatos extends Error {
  constructor(mensaje, estado) {
    super(mensaje);
    this.estado = estado || 500;
  }
}

/* ------------------------------------------------------------------ *
 * Conversion entre objetos JavaScript y el formato de valores de
 * Firestore (stringValue, integerValue, arrayValue, mapValue...).
 * ------------------------------------------------------------------ */

function aValor(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) {
    return { arrayValue: v.length ? { values: v.map(aValor) } : {} };
  }
  if (typeof v === "object") {
    return { mapValue: { fields: aCampos(v) } };
  }
  return { stringValue: String(v) };
}

function aCampos(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    fields[k] = aValor(v);
  }
  return fields;
}

function deValor(v) {
  if (!v || typeof v !== "object") return null;
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(deValor);
  if ("mapValue" in v) return deCampos(v.mapValue.fields || {});
  return null;
}

function deCampos(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = deValor(v);
  return out;
}

function idDeNombre(name) {
  return String(name || "").split("/").pop();
}

/* ------------------------------------------------------------------ *
 * Token de acceso: JWT firmado con la clave de la cuenta de servicio,
 * canjeado por un access_token de Google. Se reutiliza hasta que caduca.
 * ------------------------------------------------------------------ */

let tokenCache = { valor: null, expira: 0 };

function base64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function accessToken() {
  const ahora = Math.floor(Date.now() / 1000);
  if (tokenCache.valor && tokenCache.expira - 60 > ahora) return tokenCache.valor;

  const cabecera = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const cuerpo = base64url(
    JSON.stringify({
      iss: EMAIL,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      iat: ahora,
      exp: ahora + 3600,
    })
  );
  let firma;
  try {
    firma = base64url(crypto.createSign("RSA-SHA256").update(`${cabecera}.${cuerpo}`).sign(KEY));
  } catch (e) {
    throw new ErrorDatos(errorDeClave(), 500);
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${cabecera}.${cuerpo}.${firma}`,
    }),
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok || !datos.access_token) {
    throw new ErrorDatos(
      "Firebase rechazo las credenciales. Comprueba las variables FIREBASE_* en Vercel.",
      500
    );
  }
  tokenCache = { valor: datos.access_token, expira: ahora + (datos.expires_in || 3600) };
  return tokenCache.valor;
}

const BASE = () => `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

async function llamar(ruta, opciones = {}) {
  const token = await accessToken();
  const res = await fetch(`${BASE()}${ruta}`, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opciones.headers || {}),
    },
  });
  if (res.status === 404) return null;
  const texto = await res.text();
  if (!res.ok) {
    let detalle = texto;
    try {
      detalle = JSON.parse(texto)?.error?.message || texto;
    } catch {}
    throw new ErrorDatos(`Firestore: ${detalle}`, 502);
  }
  return texto ? JSON.parse(texto) : {};
}

/* ------------------------------------------------------------------ *
 * Almacen en memoria para trabajar sin Firebase (solo en local).
 * ------------------------------------------------------------------ */

const memoria = globalThis.__parteSalasMemoria || (globalThis.__parteSalasMemoria = new Map());
const colMem = (col) => {
  if (!memoria.has(col)) memoria.set(col, new Map());
  return memoria.get(col);
};
const clonar = (o) => JSON.parse(JSON.stringify(o));

/* ------------------------------------------------------------------ *
 * API publica del modulo.
 * ------------------------------------------------------------------ */

/** Todos los documentos de una coleccion, como objetos con `id`. */
export async function listar(col, limite = 1000) {
  if (!HAY_FIREBASE) {
    return [...colMem(col).entries()].slice(0, limite).map(([id, d]) => ({ id, ...clonar(d) }));
  }
  const salida = [];
  let pageToken = "";
  for (let pagina = 0; pagina < 6 && salida.length < limite; pagina++) {
    const params = new URLSearchParams({ pageSize: String(Math.min(300, limite - salida.length)) });
    if (pageToken) params.set("pageToken", pageToken);
    const datos = await llamar(`/${col}?${params}`);
    if (!datos) break;
    for (const doc of datos.documents || []) {
      salida.push({ id: idDeNombre(doc.name), ...deCampos(doc.fields) });
    }
    pageToken = datos.nextPageToken || "";
    if (!pageToken) break;
  }
  return salida;
}

/**
 * Documentos de una coleccion que cumplen un filtro, sin traer el resto.
 * Cada filtro es [campo, operador, valor] con operador "==" o "en".
 * Es la via barata: Firestore cobra por documento leido, no por consulta.
 */
export async function consultar(col, filtros = [], limite = 500) {
  if (!HAY_FIREBASE) {
    const cumple = (d) =>
      filtros.every(([campo, op, valor]) =>
        op === "en" ? valor.includes(d[campo]) : d[campo] === valor
      );
    return [...colMem(col).entries()]
      .map(([id, d]) => ({ id, ...clonar(d) }))
      .filter(cumple)
      .slice(0, limite);
  }

  const comoFiltro = ([campo, op, valor]) => ({
    fieldFilter: {
      field: { fieldPath: campo },
      op: op === "en" ? "IN" : "EQUAL",
      value: op === "en" ? { arrayValue: { values: valor.map(aValor) } } : aValor(valor),
    },
  });

  const structuredQuery = { from: [{ collectionId: col }], limit: limite };
  if (filtros.length === 1) structuredQuery.where = comoFiltro(filtros[0]);
  else if (filtros.length > 1) {
    structuredQuery.where = {
      compositeFilter: { op: "AND", filters: filtros.map(comoFiltro) },
    };
  }

  const datos = await llamar(":runQuery", {
    method: "POST",
    body: JSON.stringify({ structuredQuery }),
  });
  if (!Array.isArray(datos)) return [];
  return datos
    .filter((fila) => fila && fila.document)
    .map((fila) => ({ id: idDeNombre(fila.document.name), ...deCampos(fila.document.fields) }));
}

/**
 * Colecciones pequenas que casi nunca cambian (salas, equipo). Se guardan
 * unos segundos en la memoria de la funcion para que una rafaga de
 * peticiones no se traduzca en una rafaga de lecturas facturables.
 */
const cache = new Map();
const CACHE_MS = 20000;

export async function listarConCache(col, limite = 1000) {
  const guardado = cache.get(col);
  if (guardado && Date.now() - guardado.ts < CACHE_MS) return guardado.datos;
  const datos = await listar(col, limite);
  cache.set(col, { ts: Date.now(), datos });
  return datos;
}

/** Invalida la copia en memoria tras escribir en esa coleccion. */
export function olvidarCache(col) {
  if (col) cache.delete(col);
  else cache.clear();
}

/** Un documento, o null si no existe. */
export async function obtener(col, id) {
  if (!HAY_FIREBASE) {
    const d = colMem(col).get(id);
    return d ? { id, ...clonar(d) } : null;
  }
  const doc = await llamar(`/${col}/${encodeURIComponent(id)}`);
  if (!doc) return null;
  return { id: idDeNombre(doc.name), ...deCampos(doc.fields) };
}

/** Crea o reemplaza el documento entero. */
export async function escribir(col, id, datos) {
  const cuerpo = { ...datos };
  delete cuerpo.id;
  olvidarCache(col);
  if (!HAY_FIREBASE) {
    colMem(col).set(id, clonar(cuerpo));
    return { id, ...clonar(cuerpo) };
  }
  await llamar(`/${col}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: aCampos(cuerpo) }),
  });
  return { id, ...cuerpo };
}

/** Modifica solo los campos indicados, dejando el resto intacto. */
export async function modificar(col, id, parcial) {
  const cuerpo = { ...parcial };
  delete cuerpo.id;
  olvidarCache(col);
  const claves = Object.keys(cuerpo);
  if (!claves.length) return obtener(col, id);
  if (!HAY_FIREBASE) {
    const actual = colMem(col).get(id);
    if (!actual) throw new ErrorDatos("No existe el documento.", 404);
    colMem(col).set(id, { ...actual, ...clonar(cuerpo) });
    return { id, ...clonar(colMem(col).get(id)) };
  }
  const mascara = claves.map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  await llamar(`/${col}/${encodeURIComponent(id)}?${mascara}&currentDocument.exists=true`, {
    method: "PATCH",
    body: JSON.stringify({ fields: aCampos(cuerpo) }),
  });
  return obtener(col, id);
}

/** Borra el documento. No falla si ya no estaba. */
export async function eliminar(col, id) {
  olvidarCache(col);
  if (!HAY_FIREBASE) {
    colMem(col).delete(id);
    return;
  }
  await llamar(`/${col}/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Identificador corto y unico para documentos nuevos. */
export function nuevoId(prefijo) {
  return prefijo + Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
}
