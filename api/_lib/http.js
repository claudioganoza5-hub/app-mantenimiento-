/** Ayudas comunes a todos los endpoints. */

import { sesionActual } from "./auth.js";
import { ErrorDatos } from "./db.js";

export function json(res, estado, cuerpo) {
  res.statusCode = estado;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(cuerpo));
}

export async function leerCuerpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const trozos = [];
  let total = 0;
  for await (const t of req) {
    total += t.length;
    if (total > 512 * 1024) throw new ErrorDatos("El contenido enviado es demasiado grande.", 413);
    trozos.push(t);
  }
  if (!trozos.length) return {};
  try {
    return JSON.parse(Buffer.concat(trozos).toString("utf8"));
  } catch {
    throw new ErrorDatos("El contenido enviado no es JSON valido.", 400);
  }
}

/** Envuelve un handler: captura errores y los devuelve como JSON legible. */
export function endpoint(manejador) {
  return async function (req, res) {
    try {
      await manejador(req, res);
    } catch (e) {
      const estado = e instanceof ErrorDatos ? e.estado : 500;
      if (estado >= 500) console.error(e);
      json(res, estado, { error: e?.message || "Error inesperado en el servidor." });
    }
  };
}

/** Exige sesion iniciada. Devuelve la persona o corta la peticion. */
export async function exigirSesion(req, res) {
  const persona = await sesionActual(req);
  if (!persona) {
    json(res, 401, { error: "Sesion caducada. Vuelve a entrar." });
    return null;
  }
  return persona;
}

/**
 * Como exigirSesion, pero ademas corta si la persona todavia no ha
 * elegido su propio codigo: hasta entonces solo puede usar /api/pin.
 */
export async function exigirSesionCompleta(req, res) {
  const persona = await exigirSesion(req, res);
  if (!persona) return null;
  if (persona.debeElegirCodigo) {
    json(res, 403, {
      error: "Antes de continuar tienes que elegir tu propio codigo.",
      debeElegirCodigo: true,
    });
    return null;
  }
  return persona;
}

export function metodoNoPermitido(res, permitidos) {
  res.setHeader("Allow", permitidos.join(", "));
  json(res, 405, { error: "Metodo no permitido." });
}

export const texto = (v, max = 400) => String(v ?? "").trim().slice(0, max);
