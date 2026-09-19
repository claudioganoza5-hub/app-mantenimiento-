import { cerrarSesion } from "./_lib/auth.js";
import { json, endpoint, metodoNoPermitido } from "./_lib/http.js";

export default endpoint(async function (req, res) {
  if (req.method !== "POST") return metodoNoPermitido(res, ["POST"]);
  cerrarSesion(res);
  return json(res, 200, { ok: true });
});
