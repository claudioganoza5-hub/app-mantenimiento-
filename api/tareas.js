/** Crear, actualizar y eliminar tareas. Los permisos se comprueban aqui. */

import { listar, listarConCache, consultar, obtener, escribir, modificar, eliminar, nuevoId } from "./_lib/db.js";
import { json, leerCuerpo, endpoint, metodoNoPermitido, exigirSesionCompleta, texto } from "./_lib/http.js";
import {
  AREAS,
  ESTADOS,
  PRIORIDADES,
  validarEnLista,
  validarFecha,
  puedeCrearEn,
  permisoSobreTarea,
  lineaHistorial,
  historialConLimite,
  tareasVisibles,
  esTecnico,
  esDirector,
} from "./_lib/model.js";

const ETIQUETA_ESTADO = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  bloqueada: "Bloqueada",
  hecha: "Hecha",
};

export default endpoint(async function (req, res) {
  const persona = await exigirSesionCompleta(req, res);
  if (!persona) return;

  const url = new URL(req.url, "http://local");
  const id = url.searchParams.get("id") || "";

  if (req.method === "GET") return cerradas(res, persona);
  if (req.method === "POST") return crear(req, res, persona);
  if (req.method === "PATCH") return actualizar(req, res, persona, id);
  if (req.method === "DELETE") return borrar(req, res, persona, id);
  return metodoNoPermitido(res, ["GET", "POST", "PATCH", "DELETE"]);
});

/** Las tareas ya cerradas, solo cuando alguien pide verlas. */
async function cerradas(res, persona) {
  const salas = await listarConCache("salas");
  const hechas = await consultar("tareas", [["estado", "==", "hecha"]], 400);
  hechas.sort((a, b) => String(b.cerradaEn || b.actualizadoEn || "").localeCompare(String(a.cerradaEn || a.actualizadoEn || "")));
  return json(res, 200, { tareas: tareasVisibles(persona, hechas, salas).slice(0, 150) });
}

async function crear(req, res, persona) {
  const cuerpo = await leerCuerpo(req);
  const salas = await listar("salas");

  const sala = texto(cuerpo.sala, 100);
  if (!salas.some((s) => s.id === sala)) return json(res, 400, { error: "Elige una sala." });
  if (!puedeCrearEn(persona, sala, salas)) {
    return json(res, 403, { error: "No puedes crear tareas en esa sala." });
  }

  const titulo = texto(cuerpo.titulo, 160);
  if (!titulo) return json(res, 400, { error: "Escribe un titulo para la tarea." });

  const equipo = await listar("equipo");
  let asignadoA = texto(cuerpo.asignadoA, 100) || null;
  if (esTecnico(persona)) {
    // Un tecnico reporta averias; asignarlas es cosa de direccion o del encargado.
    asignadoA = null;
  } else if (asignadoA && !equipo.some((p) => p.id === asignadoA && p.activo !== false)) {
    return json(res, 400, { error: "Esa persona ya no esta en el equipo." });
  }

  const ahora = new Date().toISOString();
  const tarea = {
    titulo,
    sala,
    area: validarEnLista(texto(cuerpo.area, 20), AREAS, "area"),
    detalle: texto(cuerpo.detalle, 2000),
    prioridad: validarEnLista(texto(cuerpo.prioridad, 20) || "media", PRIORIDADES, "prioridad"),
    estado: "pendiente",
    vence: validarFecha(cuerpo.vence),
    asignadoA,
    creadoPor: persona.id,
    creadoEn: ahora,
    actualizadoEn: ahora,
    historial: [lineaHistorial(persona, esTecnico(persona) ? "Reportó la avería" : "Creó la tarea")],
  };

  const nueva = await escribir("tareas", nuevoId("t_"), tarea);
  return json(res, 200, { tarea: nueva });
}

async function actualizar(req, res, persona, id) {
  if (!id) return json(res, 400, { error: "Falta la tarea." });
  const tarea = await obtener("tareas", id);
  if (!tarea) return json(res, 404, { error: "Esa tarea ya no existe." });

  const salas = await listar("salas");
  const permiso = permisoSobreTarea(persona, tarea, salas);
  if (!permiso.gestionar && !permiso.avanzar) {
    return json(res, 403, { error: "Esta tarea no es tuya." });
  }

  const cuerpo = await leerCuerpo(req);
  const parcial = {};
  const historial = historialConLimite(tarea.historial);
  let huboCambios = false;

  // Cambio de estado y notas: al alcance del tecnico asignado.
  if (cuerpo.estado !== undefined) {
    const estado = validarEnLista(texto(cuerpo.estado, 20), ESTADOS, "estado");
    if (estado !== tarea.estado) {
      parcial.estado = estado;
      parcial.cerradaEn = estado === "hecha" ? new Date().toISOString() : "";
      historial.push(lineaHistorial(persona, `Cambió el estado a ${ETIQUETA_ESTADO[estado]}`));
      huboCambios = true;
      if (!tarea.asignadoA && esTecnico(persona) && estado === "en_curso") {
        parcial.asignadoA = persona.id;
        historial.push(lineaHistorial(persona, "Tomó la tarea"));
      }
    }
  }

  const nota = texto(cuerpo.nota, 1000);
  if (nota) {
    historial.push(lineaHistorial(persona, nota));
    huboCambios = true;
  }

  // El resto solo lo toca quien gestiona la sala.
  if (permiso.gestionar) {
    if (cuerpo.titulo !== undefined) {
      const titulo = texto(cuerpo.titulo, 160);
      if (!titulo) return json(res, 400, { error: "El titulo no puede quedar vacio." });
      if (titulo !== tarea.titulo) parcial.titulo = titulo;
    }
    if (cuerpo.detalle !== undefined) parcial.detalle = texto(cuerpo.detalle, 2000);
    if (cuerpo.area !== undefined) parcial.area = validarEnLista(texto(cuerpo.area, 20), AREAS, "area");
    if (cuerpo.prioridad !== undefined) {
      parcial.prioridad = validarEnLista(texto(cuerpo.prioridad, 20), PRIORIDADES, "prioridad");
    }
    if (cuerpo.vence !== undefined) {
      const vence = validarFecha(cuerpo.vence);
      if (vence !== (tarea.vence || "")) {
        parcial.vence = vence;
        historial.push(lineaHistorial(persona, vence ? `Fecha límite: ${vence}` : "Quitó la fecha límite"));
      }
    }
    if (cuerpo.sala !== undefined) {
      const sala = texto(cuerpo.sala, 100);
      if (!salas.some((s) => s.id === sala)) return json(res, 400, { error: "Esa sala no existe." });
      if (!puedeCrearEn(persona, sala, salas)) {
        return json(res, 403, { error: "No puedes mover la tarea a esa sala." });
      }
      parcial.sala = sala;
    }
    if (cuerpo.asignadoA !== undefined) {
      const destino = texto(cuerpo.asignadoA, 100) || null;
      if (destino) {
        const equipo = await listar("equipo");
        if (!equipo.some((p) => p.id === destino && p.activo !== false)) {
          return json(res, 400, { error: "Esa persona ya no esta en el equipo." });
        }
      }
      if (destino !== (tarea.asignadoA || null)) {
        parcial.asignadoA = destino;
        const equipo = await listar("equipo");
        const nombre = equipo.find((p) => p.id === destino)?.nombre;
        historial.push(
          lineaHistorial(persona, destino ? `Asignó la tarea a ${nombre || "—"}` : "Dejó la tarea sin asignar")
        );
      }
    }
  }

  if (!huboCambios && !Object.keys(parcial).length) {
    return json(res, 200, { tarea });
  }

  parcial.historial = historialConLimite(historial);
  parcial.actualizadoEn = new Date().toISOString();

  const actualizada = await modificar("tareas", id, parcial);
  return json(res, 200, { tarea: actualizada });
}

async function borrar(req, res, persona, id) {
  if (!id) return json(res, 400, { error: "Falta la tarea." });
  const tarea = await obtener("tareas", id);
  if (!tarea) return json(res, 200, { ok: true });

  const salas = await listar("salas");
  const permiso = permisoSobreTarea(persona, tarea, salas);
  if (!esDirector(persona) && !permiso.gestionar) {
    return json(res, 403, { error: "No puedes eliminar esta tarea." });
  }

  await eliminar("tareas", id);
  return json(res, 200, { ok: true });
}
