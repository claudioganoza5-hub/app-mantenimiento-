/**
 * Motor del mantenimiento preventivo.
 *
 * Cada revision periodica guarda la fecha en que toca la siguiente. Cuando
 * esa fecha llega, se crea la tarea sola y la revision avanza a la fecha
 * siguiente. No hace falta ningun proceso programado: la comprobacion se
 * hace al cargar los datos, que es cuando alguien esta mirando.
 *
 * Dos decisiones que evitan sorpresas:
 *
 * - El identificador de la tarea generada se deduce de la revision y de la
 *   fecha, asi que si dos personas abren la aplicacion a la vez se escribe
 *   el mismo documento dos veces en lugar de crearse dos tareas iguales.
 *
 * - Si la tarea anterior de esa revision sigue abierta, no se crea otra: la
 *   que ya hay sirve de aviso. Asi un local que lleva meses sin repasarse no
 *   aparece con doce tareas identicas acumuladas.
 */

import { listarConCache, consultar, escribir, modificar } from "./db.js";
import {
  hoyISO,
  siguienteFecha,
  ESTADOS_ABIERTOS,
  PERIODICIDADES,
} from "./model.js";

// La comprobacion no necesita hacerse en cada peticion: las revisiones son
// semanales o mensuales. Basta con mirarlo cada pocos minutos.
let ultimaComprobacion = 0;
const CADA_MS = 5 * 60 * 1000;

export async function generarTareasVencidas({ forzar = false } = {}) {
  if (!forzar && Date.now() - ultimaComprobacion < CADA_MS) return { creadas: 0, omitida: true };
  ultimaComprobacion = Date.now();

  const hoy = hoyISO();

  const revisiones = await listarConCache("preventivas", 400);
  const vencidas = revisiones.filter(
    (p) => p.activa !== false && p.proxima && p.proxima <= hoy && PERIODICIDADES[p.periodicidad]
  );
  if (!vencidas.length) return { creadas: 0 };

  const abiertas = await consultar("tareas", [["estado", "en", ESTADOS_ABIERTOS]], 800);
  const yaAbierta = new Set(abiertas.filter((t) => t.preventivaId).map((t) => t.preventivaId));

  let creadas = 0;
  for (const revision of vencidas) {
    if (!yaAbierta.has(revision.id)) {
      const id = `t_pv_${revision.id}_${revision.proxima}`.replace(/[^A-Za-z0-9_\-.~:@+]/g, "");
      const ahora = new Date().toISOString();
      await escribir("tareas", id, {
        titulo: revision.titulo,
        sala: revision.sala,
        area: revision.area,
        detalle: revision.detalle || "",
        prioridad: revision.prioridad || "media",
        estado: "pendiente",
        vence: revision.proxima,
        asignadoA: revision.asignadoA || null,
        creadoPor: revision.creadoPor || null,
        creadoEn: ahora,
        actualizadoEn: ahora,
        origen: "preventivo",
        preventivaId: revision.id,
        historial: [
          {
            ts: ahora,
            quien: "Revisión periódica",
            texto: `Generada automáticamente (${PERIODICIDADES[revision.periodicidad].etiqueta.toLowerCase()})`,
          },
        ],
      });
      creadas++;
    }

    // Avanzar hasta la primera fecha que aun no haya llegado.
    let proxima = siguienteFecha(revision.proxima, revision.periodicidad);
    for (let vueltas = 0; proxima <= hoy && vueltas < 120; vueltas++) {
      proxima = siguienteFecha(proxima, revision.periodicidad);
    }
    await modificar("preventivas", revision.id, { proxima, ultimaGenerada: revision.proxima });
  }

  return { creadas };
}
