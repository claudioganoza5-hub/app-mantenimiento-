/** Todo lo que la aplicacion necesita para pintarse, filtrado por rol. */

import { listar } from "./_lib/db.js";
import { sesionActual } from "./_lib/auth.js";
import { json, endpoint, metodoNoPermitido } from "./_lib/http.js";
import { personaPublica, tareasVisibles, esDirector } from "./_lib/model.js";

export default endpoint(async function (req, res) {
  if (req.method !== "GET") return metodoNoPermitido(res, ["GET"]);

  const persona = await sesionActual(req);
  if (!persona) return json(res, 401, { error: "Sesion caducada. Vuelve a entrar." });

  const yo = personaPublica(persona);
  if (persona.debeElegirCodigo) {
    return json(res, 200, { yo, salas: [], equipo: [], tareas: [] });
  }

  const [salas, equipo, tareas] = await Promise.all([
    listar("salas"),
    listar("equipo"),
    listar("tareas", 1500),
  ]);

  salas.sort((a, b) => (a.orden || 99) - (b.orden || 99) || a.nombre.localeCompare(b.nombre, "es"));

  // Los tecnicos solo necesitan saber quien es quien para leer los nombres;
  // la ficha completa del equipo es cosa de direccion y encargados.
  const equipoPublico = equipo.filter((p) => p.activo !== false || esDirector(persona)).map(personaPublica);

  return json(res, 200, {
    yo,
    salas,
    equipo: equipoPublico,
    tareas: tareasVisibles(persona, tareas, salas),
  });
});
