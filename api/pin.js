/** Cada persona elige o cambia su propio codigo. Nadie mas lo ve. */

import { modificar } from "./_lib/db.js";
import { cifrarCodigo, codigoCorrecto, CODIGO_VALIDO } from "./_lib/auth.js";
import { json, leerCuerpo, endpoint, metodoNoPermitido, exigirSesion } from "./_lib/http.js";
import { personaPublica } from "./_lib/model.js";

export default endpoint(async function (req, res) {
  if (req.method !== "POST") return metodoNoPermitido(res, ["POST"]);

  const persona = await exigirSesion(req, res);
  if (!persona) return;

  const { codigoActual, codigoNuevo } = await leerCuerpo(req);

  if (!CODIGO_VALIDO.test(String(codigoNuevo || ""))) {
    return json(res, 400, { error: "El codigo nuevo debe tener 4 digitos." });
  }
  if (!codigoCorrecto(String(codigoActual || ""), persona.codigoHash)) {
    return json(res, 403, { error: "El codigo actual no es correcto." });
  }
  if (String(codigoActual) === String(codigoNuevo)) {
    return json(res, 400, { error: "El codigo nuevo tiene que ser distinto del actual." });
  }

  const actualizada = await modificar("equipo", persona.id, {
    codigoHash: cifrarCodigo(String(codigoNuevo)),
    debeElegirCodigo: false,
    fallos: 0,
    bloqueadoHasta: 0,
  });

  return json(res, 200, { yo: personaPublica(actualizada) });
});
