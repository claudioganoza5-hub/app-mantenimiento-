/**
 * Todo lo que la aplicacion necesita para pintarse, filtrado por rol.
 *
 * Solo viajan las tareas abiertas: las cerradas se piden aparte y solo
 * cuando alguien quiere verlas. Firestore cobra por documento leido, y esta
 * es la llamada que mas se repite.
 */

import { listarConCache, consultar } from "./_lib/db.js";
import { sesionActual } from "./_lib/auth.js";
import { json, endpoint, metodoNoPermitido } from "./_lib/http.js";
import { generarTareasVencidas } from "./_lib/preventivo.js";
import {
  personaPublica,
  tareasVisibles,
  salasDe,
  esDirector,
  esEncargado,
  ESTADOS_ABIERTOS,
} from "./_lib/model.js";

export default endpoint(async function (req, res) {
  if (req.method !== "GET") return metodoNoPermitido(res, ["GET"]);

  const persona = await sesionActual(req);
  if (!persona) return json(res, 401, { error: "Sesion caducada. Vuelve a entrar." });

  const yo = personaPublica(persona);
  if (persona.debeElegirCodigo) {
    return json(res, 200, { yo, salas: [], equipo: [], tareas: [], preventivas: [] });
  }

  // Convierte en tareas las revisiones que hayan vencido. Se autolimita para
  // no repetir la comprobacion en cada sondeo.
  let avisoPreventivo = null;
  try {
    await generarTareasVencidas();
  } catch (e) {
    avisoPreventivo = e?.message || "No se pudieron generar las revisiones periódicas.";
  }

  const [salas, equipo, abiertas] = await Promise.all([
    listarConCache("salas"),
    listarConCache("equipo"),
    consultar("tareas", [["estado", "en", ESTADOS_ABIERTOS]], 800),
  ]);

  salas.sort((a, b) => (a.orden || 99) - (b.orden || 99) || a.nombre.localeCompare(b.nombre, "es"));

  const equipoPublico = equipo
    .filter((p) => p.activo !== false || esDirector(persona))
    .map(personaPublica);

  // Las revisiones periodicas solo las gestionan direccion y encargados.
  let preventivas = [];
  if (esDirector(persona) || esEncargado(persona)) {
    const todas = await listarConCache("preventivas", 400);
    const mias = salasDe(persona, salas);
    preventivas = esDirector(persona) ? todas : todas.filter((p) => mias.includes(p.sala));
  }

  return json(res, 200, {
    yo,
    salas,
    equipo: equipoPublico,
    tareas: tareasVisibles(persona, abiertas, salas),
    preventivas,
    avisoPreventivo,
  });
});
