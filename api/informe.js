/**
 * Informe de un periodo: las tareas que se cerraron entre dos fechas.
 *
 * Devuelve las tareas en crudo (sin el historial, que abulta y no se usa aqui)
 * y deja los totales al navegador: asi el mismo dato sirve para las cifras,
 * para los desgloses y para la descarga, sin recalcular nada tres veces.
 */

import { listarConCache, consultar } from "./_lib/db.js";
import { json, endpoint, metodoNoPermitido, exigirSesionCompleta } from "./_lib/http.js";
import { tareasVisibles, esTecnico, ESTADOS_ABIERTOS } from "./_lib/model.js";

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Campos que necesita el informe. El historial se queda en el servidor. */
function paraInforme(t) {
  return {
    id: t.id,
    titulo: t.titulo,
    sala: t.sala,
    area: t.area,
    prioridad: t.prioridad,
    estado: t.estado,
    asignadoA: t.asignadoA || null,
    creadoEn: t.creadoEn || "",
    cerradaEn: t.cerradaEn || "",
    vence: t.vence || "",
    origen: t.origen || "",
  };
}

export default endpoint(async function (req, res) {
  if (req.method !== "GET") return metodoNoPermitido(res, ["GET"]);

  const persona = await exigirSesionCompleta(req, res);
  if (!persona) return;
  if (esTecnico(persona)) {
    return json(res, 403, { error: "Los informes son para direccion y encargados." });
  }

  const url = new URL(req.url, "http://local");
  const desde = url.searchParams.get("desde") || "";
  const hasta = url.searchParams.get("hasta") || "";
  if (!ES_FECHA.test(desde) || !ES_FECHA.test(hasta)) {
    return json(res, 400, { error: "Indica el periodo con fechas completas." });
  }
  if (desde > hasta) return json(res, 400, { error: "La fecha inicial va despues de la final." });

  // cerradaEn es una marca ISO completa; el limite superior incluye todo el dia.
  const [salas, cerradas, abiertas] = await Promise.all([
    listarConCache("salas"),
    consultar("tareas", [["cerradaEn", ">=", desde], ["cerradaEn", "<=", `${hasta}T23:59:59.999Z`]], 1000),
    consultar("tareas", [["estado", "en", ESTADOS_ABIERTOS]], 800),
  ]);

  const visibles = tareasVisibles(persona, cerradas, salas).map(paraInforme);
  visibles.sort((a, b) => String(b.cerradaEn).localeCompare(String(a.cerradaEn)));

  return json(res, 200, {
    desde,
    hasta,
    tareas: visibles,
    abiertasAhora: tareasVisibles(persona, abiertas, salas).length,
    truncado: cerradas.length >= 1000,
  });
});
