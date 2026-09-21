/** Reglas del negocio: roles, permisos y valores admitidos. */

import { ErrorDatos } from "./db.js";

export const AREAS = ["luces", "sonido", "general"];
export const ESTADOS = ["pendiente", "en_curso", "bloqueada", "hecha"];
export const ESTADOS_ABIERTOS = ["pendiente", "en_curso", "bloqueada"];
export const PRIORIDADES = ["baja", "media", "alta", "urgente"];
export const ROLES = ["director", "encargado", "tecnico"];

/* ------------------------- mantenimiento preventivo ------------------------ */

export const PERIODICIDADES = {
  semanal: { etiqueta: "Semanal", dias: 7 },
  quincenal: { etiqueta: "Cada 15 días", dias: 15 },
  mensual: { etiqueta: "Mensual", meses: 1 },
  bimestral: { etiqueta: "Cada 2 meses", meses: 2 },
  trimestral: { etiqueta: "Trimestral", meses: 3 },
  semestral: { etiqueta: "Semestral", meses: 6 },
  anual: { etiqueta: "Anual", meses: 12 },
};

/** La fecha de hoy en Barcelona, no en la del servidor. */
export function hoyISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * La fecha siguiente segun la periodicidad. Respeta los finales de mes:
 * una revision del 31 de enero pasa al 28 (o 29) de febrero, no al 3 de marzo.
 */
export function siguienteFecha(desde, periodicidad) {
  const p = PERIODICIDADES[periodicidad];
  if (!p) throw new ErrorDatos("Periodicidad no admitida.", 400);
  const [a, m, d] = String(desde).split("-").map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  if (p.dias) {
    fecha.setUTCDate(fecha.getUTCDate() + p.dias);
  } else {
    const dia = fecha.getUTCDate();
    fecha.setUTCDate(1);
    fecha.setUTCMonth(fecha.getUTCMonth() + p.meses);
    const ultimo = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 0)).getUTCDate();
    fecha.setUTCDate(Math.min(dia, ultimo));
  }
  return fecha.toISOString().slice(0, 10);
}

/**
 * Revisiones habituales en una sala de espectaculos, como punto de partida.
 * Son una propuesta razonable, no una lista legal: las de proteccion contra
 * incendios tienen periodicidades marcadas por normativa y por el contrato
 * con la empresa mantenedora, asi que conviene confirmarlas con ellos.
 */
export const REVISIONES_RECOMENDADAS = [
  { titulo: "Repaso de focos y lámparas fundidas", area: "luces", periodicidad: "mensual", prioridad: "media",
    detalle: "Recorrido por toda la sala encendiendo cada circuito. Anotar lo fundido y reponer." },
  { titulo: "Limpieza de ópticas y filtros de color", area: "luces", periodicidad: "trimestral", prioridad: "baja",
    detalle: "El humo y la condensación bajan mucho el rendimiento de las ópticas." },
  { titulo: "Revisión de anclajes y cables de seguridad de la iluminación", area: "luces", periodicidad: "semestral", prioridad: "alta",
    detalle: "Comprobar cada anclaje de barra y que todo aparato colgado lleva su cable de seguridad." },
  { titulo: "Revisión de conexiones y cableado del escenario", area: "sonido", periodicidad: "mensual", prioridad: "media",
    detalle: "Latiguillos, cajetines de escenario y conectores sueltos o con falso contacto." },
  { titulo: "Limpieza de filtros y ventiladores del rack de amplificación", area: "sonido", periodicidad: "trimestral", prioridad: "alta",
    detalle: "El polvo en el rack es la causa habitual de que una etapa entre en protección." },
  { titulo: "Comprobación del limitador y de los niveles sonoros", area: "sonido", periodicidad: "semestral", prioridad: "alta",
    detalle: "Verificar que el limitador actúa y que los niveles se ajustan a lo autorizado en la licencia." },
  { titulo: "Limpieza de filtros de la máquina de humo", area: "general", periodicidad: "mensual", prioridad: "media",
    detalle: "Limpieza de filtros y comprobación del nivel de líquido. Dejar repuesto en almacén." },
  { titulo: "Comprobación de salidas de emergencia y barras antipánico", area: "general", periodicidad: "mensual", prioridad: "urgente",
    detalle: "Que todas abren al primer empujón y que ninguna está bloqueada por material." },
  { titulo: "Revisión de luces de emergencia y señalización de salidas", area: "general", periodicidad: "trimestral", prioridad: "alta",
    detalle: "Probar la autonomía de cada equipo y que la señalización se ve desde cualquier punto." },
  { titulo: "Limpieza de filtros del climatizador y revisión de la extracción", area: "general", periodicidad: "trimestral", prioridad: "media",
    detalle: "Filtros del climatizador y caudal de extracción, sobre todo en la zona de barra." },
  { titulo: "Comprobación visual de extintores y BIE", area: "general", periodicidad: "trimestral", prioridad: "alta",
    detalle: "Accesibilidad, precinto, presión y señalización. Confirma la periodicidad con tu empresa mantenedora." },
  { titulo: "Revisión anual de protección contra incendios por empresa autorizada", area: "general", periodicidad: "anual", prioridad: "urgente",
    detalle: "Avisar con antelación a la mantenedora y guardar el certificado. Confirma la periodicidad con ellos." },
];

/** Salas con las que arranca la aplicacion en la primera configuracion. */
export const SALAS_INICIALES = [
  { id: "s_ny", nombre: "Sala New York", tipo: "Discoteca", orden: 1 },
  { id: "s_chbcn", nombre: "La Chismosa Barcelona", tipo: "Discoteca", orden: 2 },
  { id: "s_chcer", nombre: "La Chismosa Cerdañola", tipo: "Discoteca", orden: 3 },
  { id: "s_ofi", nombre: "La Oficina Lounge", tipo: "Bar musical", orden: 4 },
  { id: "s_chula", nombre: "La Chula", tipo: "Local de espectáculos", orden: 5 },
];

export const esDirector = (p) => p?.rol === "director";
export const esEncargado = (p) => p?.rol === "encargado";
export const esTecnico = (p) => p?.rol === "tecnico";

/** Identificadores de las salas que esta persona tiene a su cargo. */
export function salasDe(persona, todasLasSalas) {
  if (esDirector(persona)) return todasLasSalas.map((s) => s.id);
  const suyas = Array.isArray(persona?.salas) ? persona.salas : [];
  return suyas.length ? suyas : todasLasSalas.map((s) => s.id);
}

/** Tareas que esta persona puede ver. */
export function tareasVisibles(persona, tareas, salas) {
  if (esDirector(persona)) return tareas;
  const mias = salasDe(persona, salas);
  if (esEncargado(persona)) return tareas.filter((t) => mias.includes(t.sala));
  return tareas.filter((t) => t.asignadoA === persona.id || (mias.includes(t.sala) && !t.asignadoA));
}

/** Puede crear tareas en esa sala. */
export function puedeCrearEn(persona, salaId, salas) {
  if (esDirector(persona)) return true;
  return salasDe(persona, salas).includes(salaId);
}

/**
 * Que campos puede tocar cada rol en una tarea.
 * Direccion y encargados gestionan la tarea entera dentro de su ambito;
 * el tecnico asignado solo mueve el estado y anade notas.
 */
export function permisoSobreTarea(persona, tarea, salas) {
  if (esDirector(persona)) return { gestionar: true, avanzar: true };
  const mias = salasDe(persona, salas);
  if (esEncargado(persona) && mias.includes(tarea.sala)) return { gestionar: true, avanzar: true };
  if (esTecnico(persona)) {
    const suya = tarea.asignadoA === persona.id;
    const libreEnSuSala = !tarea.asignadoA && mias.includes(tarea.sala);
    return { gestionar: false, avanzar: suya || libreEnSuSala };
  }
  return { gestionar: false, avanzar: false };
}

export function validarEnLista(valor, lista, campo) {
  if (!lista.includes(valor)) {
    throw new ErrorDatos(`Valor no admitido en "${campo}".`, 400);
  }
  return valor;
}

/** Quien puede crear y editar revisiones periodicas de una sala. */
export function gestionaPreventivo(persona, salaId, salas) {
  if (esDirector(persona)) return true;
  return esEncargado(persona) && salasDe(persona, salas).includes(salaId);
}

/** Fecha "AAAA-MM-DD" o cadena vacia. */
export function validarFecha(valor) {
  const v = String(valor || "").trim();
  if (!v) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ErrorDatos("La fecha limite no es valida.", 400);
  return v;
}

export function lineaHistorial(persona, textoLinea) {
  return { ts: new Date().toISOString(), quien: persona.nombre, texto: textoLinea };
}

/** Recorta el historial para que un documento no crezca sin limite. */
export function historialConLimite(historial, maximo = 60) {
  const h = Array.isArray(historial) ? historial : [];
  return h.length > maximo ? h.slice(h.length - maximo) : h;
}

/** Version de una persona apta para enviar al navegador: sin la huella del codigo. */
export function personaPublica(p) {
  return {
    id: p.id,
    nombre: p.nombre,
    rol: p.rol,
    especialidad: p.especialidad || "",
    salas: Array.isArray(p.salas) ? p.salas : [],
    activo: p.activo !== false,
    debeElegirCodigo: Boolean(p.debeElegirCodigo),
  };
}
