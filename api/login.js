/** Entrada con codigo de 4 digitos. */

import { obtener } from "./_lib/db.js";
import {
  codigoCorrecto,
  crearSesion,
  estaBloqueada,
  apuntarFallo,
  limpiarFallos,
  CODIGO_VALIDO,
} from "./_lib/auth.js";
import { json, leerCuerpo, endpoint, metodoNoPermitido, texto } from "./_lib/http.js";
import { personaPublica } from "./_lib/model.js";

const minutos = (ms) => Math.max(1, Math.ceil(ms / 60000));

export default endpoint(async function (req, res) {
  if (req.method !== "POST") return metodoNoPermitido(res, ["POST"]);

  const cuerpo = await leerCuerpo(req);
  const personaId = texto(cuerpo.personaId, 100);
  const codigo = String(cuerpo.codigo || "");

  if (!personaId || !CODIGO_VALIDO.test(codigo)) {
    return json(res, 400, { error: "El codigo debe tener 4 digitos." });
  }

  const persona = await obtener("equipo", personaId);
  if (!persona || persona.activo === false) {
    return json(res, 401, { error: "Codigo incorrecto." });
  }

  const bloqueoHasta = estaBloqueada(persona);
  if (bloqueoHasta) {
    return json(res, 429, {
      error: `Demasiados intentos. Prueba de nuevo en ${minutos(bloqueoHasta - Date.now())} min.`,
    });
  }

  if (!codigoCorrecto(codigo, persona.codigoHash)) {
    const nuevoBloqueo = await apuntarFallo(persona);
    if (nuevoBloqueo) {
      return json(res, 429, {
        error: `Demasiados intentos. Prueba de nuevo en ${minutos(nuevoBloqueo - Date.now())} min.`,
      });
    }
    return json(res, 401, { error: "Codigo incorrecto." });
  }

  await limpiarFallos(persona);
  crearSesion(res, persona);
  return json(res, 200, { yo: personaPublica(persona) });
});
