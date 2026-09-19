/** Alta, edicion y baja de salas. Solo direccion. */

import { listar, obtener, escribir, modificar, eliminar, nuevoId } from "./_lib/db.js";
import { json, leerCuerpo, endpoint, metodoNoPermitido, exigirSesionCompleta, texto } from "./_lib/http.js";
import { esDirector } from "./_lib/model.js";

export default endpoint(async function (req, res) {
  const persona = await exigirSesionCompleta(req, res);
  if (!persona) return;
  if (!esDirector(persona)) {
    return json(res, 403, { error: "Solo direccion puede gestionar las salas." });
  }

  const url = new URL(req.url, "http://local");
  const id = url.searchParams.get("id") || "";
  const cuerpo = req.method === "DELETE" ? {} : await leerCuerpo(req);

  if (req.method === "POST") {
    const nombre = texto(cuerpo.nombre, 80);
    if (!nombre) return json(res, 400, { error: "Escribe el nombre de la sala." });
    const salas = await listar("salas");
    const sala = await escribir("salas", nuevoId("s_"), {
      nombre,
      tipo: texto(cuerpo.tipo, 60),
      orden: salas.length + 1,
    });
    return json(res, 200, { sala });
  }

  if (req.method === "PATCH") {
    if (!id) return json(res, 400, { error: "Falta la sala." });
    if (!(await obtener("salas", id))) return json(res, 404, { error: "Esa sala ya no existe." });
    const parcial = {};
    if (cuerpo.nombre !== undefined) {
      const nombre = texto(cuerpo.nombre, 80);
      if (!nombre) return json(res, 400, { error: "El nombre no puede quedar vacio." });
      parcial.nombre = nombre;
    }
    if (cuerpo.tipo !== undefined) parcial.tipo = texto(cuerpo.tipo, 60);
    const sala = await modificar("salas", id, parcial);
    return json(res, 200, { sala });
  }

  if (req.method === "DELETE") {
    if (!id) return json(res, 400, { error: "Falta la sala." });
    const tareas = await listar("tareas", 1500);
    const dentro = tareas.filter((t) => t.sala === id);
    if (dentro.length) {
      return json(res, 409, {
        error: `La sala tiene ${dentro.length} tarea(s). Muevelas o eliminalas antes.`,
      });
    }
    await eliminar("salas", id);
    return json(res, 200, { ok: true });
  }

  return metodoNoPermitido(res, ["POST", "PATCH", "DELETE"]);
});
