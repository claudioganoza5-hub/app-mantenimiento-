/**
 * Alta, edicion y baja de personas. Solo direccion.
 *
 * Al dar de alta a alguien, el servidor devuelve UNA VEZ un codigo temporal
 * de 4 digitos. Esa persona entra con el y la aplicacion le obliga a elegir
 * el suyo propio; a partir de ahi nadie, tampoco direccion, puede verlo.
 */

import { listar, obtener, escribir, modificar, eliminar, nuevoId, ErrorDatos } from "./_lib/db.js";
import { cifrarCodigo, codigoTemporal } from "./_lib/auth.js";
import { json, leerCuerpo, endpoint, metodoNoPermitido, exigirSesionCompleta, texto } from "./_lib/http.js";
import { ROLES, AREAS, validarEnLista, esDirector, personaPublica } from "./_lib/model.js";

export default endpoint(async function (req, res) {
  const persona = await exigirSesionCompleta(req, res);
  if (!persona) return;
  if (!esDirector(persona)) {
    return json(res, 403, { error: "Solo direccion puede gestionar el equipo." });
  }

  const url = new URL(req.url, "http://local");
  const id = url.searchParams.get("id") || "";

  if (req.method === "POST") return crear(req, res);
  if (req.method === "PATCH") return actualizar(req, res, persona, id);
  if (req.method === "DELETE") return borrar(req, res, persona, id);
  return metodoNoPermitido(res, ["POST", "PATCH", "DELETE"]);
});

async function leerFicha(req, salasValidas) {
  const cuerpo = await leerCuerpo(req);
  const ficha = {};

  if (cuerpo.nombre !== undefined) {
    ficha.nombre = texto(cuerpo.nombre, 80);
    if (!ficha.nombre) throw new ErrorDatos("Escribe el nombre.", 400);
  }
  if (cuerpo.rol !== undefined) ficha.rol = validarEnLista(texto(cuerpo.rol, 20), ROLES, "rol");
  if (cuerpo.especialidad !== undefined) {
    const esp = texto(cuerpo.especialidad, 20);
    ficha.especialidad = esp ? validarEnLista(esp, AREAS, "especialidad") : "";
  }
  if (cuerpo.salas !== undefined) {
    const lista = Array.isArray(cuerpo.salas) ? cuerpo.salas : [];
    ficha.salas = lista.map((s) => texto(s, 100)).filter((s) => salasValidas.includes(s));
  }
  if (cuerpo.activo !== undefined) ficha.activo = Boolean(cuerpo.activo);
  ficha._reiniciarCodigo = Boolean(cuerpo.reiniciarCodigo);
  return ficha;
}

async function crear(req, res) {
  const salas = (await listar("salas")).map((s) => s.id);
  const ficha = await leerFicha(req, salas);
  delete ficha._reiniciarCodigo;

  if (!ficha.nombre) return json(res, 400, { error: "Escribe el nombre." });
  if (!ficha.rol) return json(res, 400, { error: "Elige un rol." });

  const codigo = codigoTemporal();
  const nueva = {
    nombre: ficha.nombre,
    rol: ficha.rol,
    especialidad: ficha.rol === "tecnico" ? ficha.especialidad || "" : "",
    salas: ficha.salas || [],
    activo: ficha.activo !== false,
    codigoHash: cifrarCodigo(codigo),
    debeElegirCodigo: true,
    fallos: 0,
    bloqueadoHasta: 0,
    creadoEn: new Date().toISOString(),
  };

  const guardada = await escribir("equipo", nuevoId("p_"), nueva);
  return json(res, 200, { persona: personaPublica(guardada), codigoTemporal: codigo });
}

async function actualizar(req, res, yo, id) {
  if (!id) return json(res, 400, { error: "Falta la persona." });
  const actual = await obtener("equipo", id);
  if (!actual) return json(res, 404, { error: "Esa persona ya no existe." });

  const salas = (await listar("salas")).map((s) => s.id);
  const ficha = await leerFicha(req, salas);
  const reiniciar = ficha._reiniciarCodigo;
  delete ficha._reiniciarCodigo;

  // Direccion no puede dejar la aplicacion sin nadie que la gestione.
  const quitaDireccion =
    actual.rol === "director" && ((ficha.rol && ficha.rol !== "director") || ficha.activo === false);
  if (quitaDireccion) {
    const equipo = await listar("equipo");
    const otros = equipo.filter((p) => p.rol === "director" && p.activo !== false && p.id !== id);
    if (!otros.length) {
      return json(res, 400, {
        error: "Tiene que quedar al menos una persona de direccion activa.",
      });
    }
  }

  if (ficha.rol && ficha.rol !== "tecnico") ficha.especialidad = "";

  let codigo = null;
  if (reiniciar) {
    codigo = codigoTemporal();
    ficha.codigoHash = cifrarCodigo(codigo);
    ficha.debeElegirCodigo = true;
    ficha.fallos = 0;
    ficha.bloqueadoHasta = 0;
  }

  const guardada = await modificar("equipo", id, ficha);
  return json(res, 200, { persona: personaPublica(guardada), codigoTemporal: codigo });
}

async function borrar(req, res, yo, id) {
  if (!id) return json(res, 400, { error: "Falta la persona." });
  if (id === yo.id) return json(res, 400, { error: "No puedes eliminar tu propia ficha." });

  const tareas = await listar("tareas", 1500);
  const abiertas = tareas.filter((t) => t.asignadoA === id && t.estado !== "hecha");
  if (abiertas.length) {
    return json(res, 409, {
      error: `Tiene ${abiertas.length} tarea(s) abierta(s). Reasignalas antes de eliminar la ficha.`,
    });
  }

  await eliminar("equipo", id);
  return json(res, 200, { ok: true });
}
