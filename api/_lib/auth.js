/**
 * Sesiones y codigos de acceso.
 *
 * El codigo de cada persona nunca se guarda tal cual: se guarda su huella
 * scrypt con sal propia, que no permite recuperar el codigo original.
 * La sesion viaja en una cookie firmada, no legible ni modificable desde
 * el navegador.
 */

import crypto from "node:crypto";
import { obtener, modificar } from "./db.js";

const SECRETO = process.env.SESSION_SECRET || "";
const EN_PRODUCCION = Boolean(process.env.VERCEL);
const COOKIE = "ps_sesion";
const DIAS = 30;

if (!SECRETO && EN_PRODUCCION) {
  console.error("Falta SESSION_SECRET. Genera una con: openssl rand -hex 32");
}
const clave = () => SECRETO || "parte-salas-clave-solo-para-pruebas-locales";

/* ------------------------- codigos de acceso ------------------------- */

export const CODIGO_VALIDO = /^[0-9]{4}$/;

export function cifrarCodigo(codigo) {
  const sal = crypto.randomBytes(16);
  const huella = crypto.scryptSync(String(codigo), sal, 32);
  return `scrypt:${sal.toString("hex")}:${huella.toString("hex")}`;
}

export function codigoCorrecto(codigo, guardado) {
  if (typeof guardado !== "string") return false;
  const [algoritmo, salHex, huellaHex] = guardado.split(":");
  if (algoritmo !== "scrypt" || !salHex || !huellaHex) return false;
  let calculada;
  try {
    calculada = crypto.scryptSync(String(codigo), Buffer.from(salHex, "hex"), 32);
  } catch {
    return false;
  }
  const esperada = Buffer.from(huellaHex, "hex");
  if (esperada.length !== calculada.length) return false;
  return crypto.timingSafeEqual(esperada, calculada);
}

/** Codigo temporal de 4 digitos para dar de alta a alguien. */
export function codigoTemporal() {
  return String(crypto.randomInt(1000, 10000));
}

/* --------------------------- bloqueo ---------------------------- */

const FALLOS_MAX = 5;
const BLOQUEO_MS = 5 * 60 * 1000;

export function estaBloqueada(persona) {
  const hasta = Number(persona?.bloqueadoHasta || 0);
  return hasta > Date.now() ? hasta : 0;
}

export async function apuntarFallo(persona) {
  const fallos = Number(persona.fallos || 0) + 1;
  const parcial = { fallos };
  if (fallos >= FALLOS_MAX) {
    parcial.bloqueadoHasta = Date.now() + BLOQUEO_MS;
    parcial.fallos = 0;
  }
  await modificar("equipo", persona.id, parcial);
  return parcial.bloqueadoHasta || 0;
}

export async function limpiarFallos(persona) {
  if (!persona.fallos && !persona.bloqueadoHasta) return;
  await modificar("equipo", persona.id, { fallos: 0, bloqueadoHasta: 0 });
}

/* ---------------------------- sesion ----------------------------- */

const b64 = (s) => Buffer.from(s).toString("base64url");
const deB64 = (s) => Buffer.from(s, "base64url").toString("utf8");

function firmar(texto) {
  return crypto.createHmac("sha256", clave()).update(texto).digest("base64url");
}

export function crearSesion(res, persona) {
  const cuerpo = b64(
    JSON.stringify({ id: persona.id, rol: persona.rol, exp: Date.now() + DIAS * 864e5 })
  );
  const valor = `${cuerpo}.${firmar(cuerpo)}`;
  const partes = [
    `${COOKIE}=${valor}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${DIAS * 86400}`,
  ];
  if (EN_PRODUCCION) partes.push("Secure");
  res.setHeader("Set-Cookie", partes.join("; "));
}

export function cerrarSesion(res) {
  const partes = [`${COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (EN_PRODUCCION) partes.push("Secure");
  res.setHeader("Set-Cookie", partes.join("; "));
}

function leerCookie(req) {
  const bruto = req.headers?.cookie || "";
  for (const trozo of bruto.split(";")) {
    const [k, ...resto] = trozo.trim().split("=");
    if (k === COOKIE) return resto.join("=");
  }
  return "";
}

/** Devuelve la persona de la sesion, ya comprobada contra la base, o null. */
export async function sesionActual(req) {
  const valor = leerCookie(req);
  if (!valor || !valor.includes(".")) return null;
  const corte = valor.lastIndexOf(".");
  const cuerpo = valor.slice(0, corte);
  const firma = valor.slice(corte + 1);

  const esperada = Buffer.from(firmar(cuerpo));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) return null;

  let datos;
  try {
    datos = JSON.parse(deB64(cuerpo));
  } catch {
    return null;
  }
  if (!datos?.id || !datos.exp || datos.exp < Date.now()) return null;

  const persona = await obtener("equipo", datos.id);
  if (!persona || persona.activo === false) return null;
  return persona;
}
