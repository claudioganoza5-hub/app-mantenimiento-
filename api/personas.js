/** Lista de personas para la pantalla de acceso. Nunca expone codigos. */

import { listar } from "./_lib/db.js";
import { json, endpoint, metodoNoPermitido } from "./_lib/http.js";

const ORDEN = { director: 0, encargado: 1, tecnico: 2 };

export default endpoint(async function (req, res) {
  if (req.method !== "GET") return metodoNoPermitido(res, ["GET"]);

  const equipo = await listar("equipo");
  const personas = equipo
    .filter((p) => p.activo !== false)
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      rol: p.rol,
      especialidad: p.especialidad || "",
      estrena: Boolean(p.debeElegirCodigo),
    }))
    .sort(
      (a, b) => (ORDEN[a.rol] ?? 9) - (ORDEN[b.rol] ?? 9) || a.nombre.localeCompare(b.nombre, "es")
    );

  return json(res, 200, { personas });
});
