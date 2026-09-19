/**
 * Servidor local para probar la aplicacion sin desplegar.
 *
 *   npm run dev      ->  http://localhost:3000
 *
 * Sin variables de Firebase los datos viven en memoria y se pierden al
 * parar el proceso: perfecto para probar. Con un archivo .env.local que
 * tenga las variables FIREBASE_*, escribe en Firestore de verdad.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUERTO = Number(process.env.PORT || 3000);

// --- .env.local, si existe ---
const envLocal = path.join(raiz, ".env.local");
if (fs.existsSync(envLocal)) {
  for (const linea of fs.readFileSync(envLocal, "utf8").split("\n")) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const i = limpia.indexOf("=");
    if (i < 0) continue;
    const clave = limpia.slice(0, i).trim();
    let valor = limpia.slice(i + 1).trim();
    if (valor.startsWith('"') && valor.endsWith('"')) valor = valor.slice(1, -1);
    if (!process.env[clave]) process.env[clave] = valor;
  }
}
if (!process.env.SETUP_TOKEN) process.env.SETUP_TOKEN = "local";

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname.startsWith("/api/")) {
    const nombre = url.pathname.slice(5).replace(/[^a-z0-9_-]/gi, "");
    const archivo = path.join(raiz, "api", `${nombre}.js`);
    if (!fs.existsSync(archivo)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Endpoint no encontrado." }));
    }
    try {
      const mod = await import(pathToFileURL(archivo).href);
      return await mod.default(req, res);
    } catch (e) {
      console.error(e);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: String(e?.message || e) }));
    }
  }

  const rel = url.pathname === "/" ? "/index.html" : url.pathname;
  const archivo = path.join(raiz, "public", path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  if (!archivo.startsWith(path.join(raiz, "public")) || !fs.existsSync(archivo)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("No encontrado");
  }
  res.writeHead(200, { "Content-Type": TIPOS[path.extname(archivo)] || "application/octet-stream" });
  fs.createReadStream(archivo).pipe(res);
});

servidor.listen(PUERTO, () => {
  const conFirebase = Boolean(process.env.FIREBASE_PROJECT_ID);
  console.log(`\n  Parte de Salas  ->  http://localhost:${PUERTO}`);
  console.log(`  Datos: ${conFirebase ? "Firestore" : "en memoria (se pierden al parar)"}`);
  console.log(`  Codigo de configuracion: ${process.env.SETUP_TOKEN}\n`);
});
