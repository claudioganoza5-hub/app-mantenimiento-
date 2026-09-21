/** Revisiones periodicas: alta, edicion, baja y catalogo recomendado. */

import { listar, listarConCache, obtener, escribir, modificar, eliminar, nuevoId } from "./_lib/db.js";
import { json, leerCuerpo, endpoint, metodoNoPermitido, exigirSesionCompleta, texto } from "./_lib/http.js";
import { generarTareasVencidas } from "./_lib/preventivo.js";
import {
  AREAS,
  PRIORIDADES,
  PERIODICIDADES,
  REVISIONES_RECOMENDADAS,
  validarEnLista,
  validarFecha,
  gestionaPreventivo,
  hoyISO,
  esDirector,
} from "./_lib/model.js";

export default endpoint(async function (req, res) {
  const persona = await exigirSesionCompleta(req, res);
  if (!persona) return;

  const url = new URL(req.url, "http://local");
  const id = url.searchParams.get("id") || "";
  const salas = await listarConCache("salas");

  if (req.method === "POST") {
    const cuerpo = await leerCuerpo(req);
    if (cuerpo.recomendadas) return cargarRecomendadas(res, persona, salas, cuerpo);
    return crear(res, persona, salas, cuerpo);
  }
  if (req.method === "PATCH") return actualizar(req, res, persona, salas, id);
  if (req.method === "DELETE") return borrar(res, persona, salas, id);
  return metodoNoPermitido(res, ["POST", "PATCH", "DELETE"]);
});

function leerCampos(cuerpo) {
  const campos = {};
  if (cuerpo.titulo !== undefined) campos.titulo = texto(cuerpo.titulo, 160);
  if (cuerpo.detalle !== undefined) campos.detalle = texto(cuerpo.detalle, 2000);
  if (cuerpo.area !== undefined) campos.area = validarEnLista(texto(cuerpo.area, 20), AREAS, "area");
  if (cuerpo.prioridad !== undefined) {
    campos.prioridad = validarEnLista(texto(cuerpo.prioridad, 20), PRIORIDADES, "prioridad");
  }
  if (cuerpo.periodicidad !== undefined) {
    campos.periodicidad = validarEnLista(
      texto(cuerpo.periodicidad, 20),
      Object.keys(PERIODICIDADES),
      "periodicidad"
    );
  }
  if (cuerpo.proxima !== undefined) campos.proxima = validarFecha(cuerpo.proxima);
  if (cuerpo.activa !== undefined) campos.activa = Boolean(cuerpo.activa);
  if (cuerpo.asignadoA !== undefined) campos.asignadoA = texto(cuerpo.asignadoA, 100) || null;
  return campos;
}

async function crear(res, persona, salas, cuerpo) {
  const sala = texto(cuerpo.sala, 100);
  if (!salas.some((s) => s.id === sala)) return json(res, 400, { error: "Elige una sala." });
  if (!gestionaPreventivo(persona, sala, salas)) {
    return json(res, 403, { error: "No puedes crear revisiones en esa sala." });
  }

  const campos = leerCampos(cuerpo);
  if (!campos.titulo) return json(res, 400, { error: "Escribe un titulo para la revision." });
  if (!campos.periodicidad) return json(res, 400, { error: "Elige cada cuanto toca." });

  if (campos.asignadoA) {
    const equipo = await listarConCache("equipo");
    if (!equipo.some((p) => p.id === campos.asignadoA && p.activo !== false)) {
      return json(res, 400, { error: "Esa persona ya no esta en el equipo." });
    }
  }

  const revision = await escribir("preventivas", nuevoId("pv_"), {
    sala,
    titulo: campos.titulo,
    detalle: campos.detalle || "",
    area: campos.area || "general",
    prioridad: campos.prioridad || "media",
    periodicidad: campos.periodicidad,
    proxima: campos.proxima || hoyISO(),
    asignadoA: campos.asignadoA || null,
    activa: campos.activa !== false,
    creadoPor: persona.id,
    creadoEn: new Date().toISOString(),
    ultimaGenerada: "",
  });
  // Si la primera vez ya ha llegado, que la tarea aparezca ahora y no dentro
  // de un rato: quien la acaba de crear espera verla.
  await generarTareasVencidas({ forzar: true });
  return json(res, 200, { revision });
}

async function actualizar(req, res, persona, salas, id) {
  if (!id) return json(res, 400, { error: "Falta la revision." });
  const actual = await obtener("preventivas", id);
  if (!actual) return json(res, 404, { error: "Esa revision ya no existe." });
  if (!gestionaPreventivo(persona, actual.sala, salas)) {
    return json(res, 403, { error: "Esa revision no es de tu sala." });
  }

  const cuerpo = await leerCuerpo(req);
  const campos = leerCampos(cuerpo);

  if (cuerpo.sala !== undefined) {
    const sala = texto(cuerpo.sala, 100);
    if (!salas.some((s) => s.id === sala)) return json(res, 400, { error: "Esa sala no existe." });
    if (!gestionaPreventivo(persona, sala, salas)) {
      return json(res, 403, { error: "No puedes mover la revision a esa sala." });
    }
    campos.sala = sala;
  }
  if (campos.titulo === "") return json(res, 400, { error: "El titulo no puede quedar vacio." });

  const revision = await modificar("preventivas", id, campos);
  await generarTareasVencidas({ forzar: true });
  return json(res, 200, { revision });
}

async function borrar(res, persona, salas, id) {
  if (!id) return json(res, 400, { error: "Falta la revision." });
  const actual = await obtener("preventivas", id);
  if (!actual) return json(res, 200, { ok: true });
  if (!gestionaPreventivo(persona, actual.sala, salas)) {
    return json(res, 403, { error: "Esa revision no es de tu sala." });
  }
  // Las tareas ya generadas se quedan: son historial de trabajo hecho.
  await eliminar("preventivas", id);
  return json(res, 200, { ok: true });
}

/** Crea de golpe el cuadro de revisiones habituales para una sala. */
async function cargarRecomendadas(res, persona, salas, cuerpo) {
  if (!esDirector(persona)) {
    return json(res, 403, { error: "Solo direccion puede cargar el cuadro completo." });
  }
  const sala = texto(cuerpo.sala, 100);
  if (!salas.some((s) => s.id === sala)) return json(res, 400, { error: "Elige una sala." });

  const existentes = await listar("preventivas", 400);
  const yaEstan = new Set(
    existentes.filter((p) => p.sala === sala).map((p) => p.titulo.toLowerCase())
  );

  const hoy = hoyISO();
  let creadas = 0;
  for (const plantilla of REVISIONES_RECOMENDADAS) {
    if (yaEstan.has(plantilla.titulo.toLowerCase())) continue;
    await escribir("preventivas", nuevoId("pv_"), {
      sala,
      titulo: plantilla.titulo,
      detalle: plantilla.detalle,
      area: plantilla.area,
      prioridad: plantilla.prioridad,
      periodicidad: plantilla.periodicidad,
      proxima: hoy,
      asignadoA: null,
      activa: true,
      creadoPor: persona.id,
      creadoEn: new Date().toISOString(),
      ultimaGenerada: "",
    });
    creadas++;
  }

  if (creadas) await generarTareasVencidas({ forzar: true });
  return json(res, 200, { creadas, omitidas: REVISIONES_RECOMENDADAS.length - creadas });
}
