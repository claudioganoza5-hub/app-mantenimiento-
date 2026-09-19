/** Primera configuracion: crea las salas y el usuario de direccion. */

import { listar, escribir, HAY_FIREBASE } from "./_lib/db.js";
import { cifrarCodigo, crearSesion, CODIGO_VALIDO } from "./_lib/auth.js";
import { json, leerCuerpo, endpoint, metodoNoPermitido, texto } from "./_lib/http.js";
import { SALAS_INICIALES } from "./_lib/model.js";

export default endpoint(async function (req, res) {
  const equipo = await listar("equipo", 1);
  const pendiente = equipo.length === 0;

  if (req.method === "GET") {
    return json(res, 200, { necesitaConfiguracion: pendiente, almacenEnMemoria: !HAY_FIREBASE });
  }
  if (req.method !== "POST") return metodoNoPermitido(res, ["GET", "POST"]);

  if (!pendiente) {
    return json(res, 409, { error: "La aplicacion ya esta configurada." });
  }

  const esperado = process.env.SETUP_TOKEN || "";
  const { token, nombre, codigo } = await leerCuerpo(req);

  if (!esperado) {
    return json(res, 503, {
      error: "Falta la variable SETUP_TOKEN en el servidor. Anadela en Vercel y vuelve a desplegar.",
    });
  }
  if (texto(token, 200) !== esperado) {
    return json(res, 403, { error: "El codigo de configuracion no es correcto." });
  }
  const nombreLimpio = texto(nombre, 80);
  if (!nombreLimpio) return json(res, 400, { error: "Escribe tu nombre." });
  if (!CODIGO_VALIDO.test(String(codigo || ""))) {
    return json(res, 400, { error: "El codigo debe tener 4 digitos." });
  }

  for (const sala of SALAS_INICIALES) {
    const { id, ...datos } = sala;
    await escribir("salas", id, datos);
  }

  const director = {
    nombre: nombreLimpio,
    rol: "director",
    especialidad: "",
    salas: [],
    activo: true,
    codigoHash: cifrarCodigo(String(codigo)),
    debeElegirCodigo: false,
    fallos: 0,
    bloqueadoHasta: 0,
    creadoEn: new Date().toISOString(),
  };
  await escribir("equipo", "p_direccion", director);

  crearSesion(res, { id: "p_direccion", rol: "director" });
  return json(res, 200, { ok: true });
});
